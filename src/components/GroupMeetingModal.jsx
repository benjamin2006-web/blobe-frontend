import { Mic, MicOff, PhoneOff, Radio, Users, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import UserAvatar from './UserAvatar';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN relay — the same servers CallModal uses. STUN alone only works for
    // benign NATs, so without a relay, members on different networks (or behind
    // symmetric NAT / mobile carriers) could never hear each other, which is
    // exactly the "everyone joined but nobody hears anything" symptom.
    {
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 4,
};

const AudioWaveRing = ({ level, active }) => (
  <div
    className={`pointer-events-none absolute -inset-2 flex items-center justify-center rounded-full transition-all duration-150 ${active ? 'opacity-100' : 'opacity-0'}`}
    style={{
      transform: `scale(${1 + level * 0.18})`,
      boxShadow: `0 0 ${8 + level * 20}px rgba(52, 211, 153, ${0.25 + level * 0.5})`,
    }}
  >
    <div className='flex h-full w-full items-center justify-between rounded-full border border-emerald-300/80 px-0.5'>
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          className='w-0.5 rounded-full bg-emerald-300'
          style={{
            height: `${25 + Math.min(75, level * 100 * (0.55 + ((index * 17) % 40) / 100))}%`,
          }}
        />
      ))}
    </div>
  </div>
);

const GroupMeetingModal = ({
  socket,
  group,
  currentUser,
  meetingId,
  isHost,
  onClose,
}) => {
  const members = useMemo(
    () => (group?.members || []).map((member) => member.user).filter(Boolean),
    [group],
  );
  const currentId = String(currentUser?._id || currentUser?.id);
  const peers = useRef(new Map());
  // Tracks which peer connections *we* created the offer for — needed to break
  // the tie when two members join simultaneously (see the glare guard in onOffer).
  const initiators = useRef(new Set());
  const remoteAudio = useRef(new Map());
  const analysers = useRef(new Map());
  const analyserContexts = useRef(new Map());
  const streamRef = useRef(null);
  const mediaRequestRef = useRef(null);
  const meetingEndSent = useRef(false);
  // Who the local client believes is currently muted — updated from
  // `group_meeting_peer_muted` broadcasts so every member's tile shows the
  // mic-off badge on the speaker whose mic they toggled.
  const peerMuted = useRef(new Map());
  // `group_meeting_start` must be emitted exactly once per meeting. The
  // signaling effect used to re-emit it on every re-run, and every
  // re-registration re-broadcast `group_meeting_started`, which re-opened the
  // popup — the open/close/reopen flicker. A ref (not state) deliberately
  // survives React StrictMode's dev double-mount.
  const startEmittedRef = useRef(false);
  // Latest `onClose`, kept in a ref so the signaling effect below doesn't depend
  // on it. Chat.jsx passes a fresh arrow function every render, and depending on
  // it tore down + re-registered every socket listener (re-joining the meeting)
  // on each parent re-render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(new Set());
  const [error, setError] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioLevels, setAudioLevels] = useState({});

  const enableMeetingAudio = useCallback(async () => {
    const results = await Promise.allSettled(
      [...remoteAudio.current.values()].map((audio) => audio.play()),
    );
    setAudioBlocked(results.some((result) => result.status === 'rejected'));
  }, []);

  const attachAnalyser = useCallback((id, stream) => {
    if (analysers.current.has(String(id)) || !stream) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      analysers.current.set(String(id), analyser);
      analyserContexts.current.set(String(id), context);
      context.resume?.();
    } catch {}
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = {};
      analysers.current.forEach((analyser, id) => {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        data.forEach((value) => {
          const sample = (value - 128) / 128;
          sum += sample * sample;
        });
        next[id] = Math.min(1, Math.sqrt(sum / data.length) * 5);
      });
      setAudioLevels(next);
    }, 90);
    return () => window.clearInterval(timer);
  }, []);

  const updateConnected = useCallback((id, active) => {
    setConnected((previous) => {
      const next = new Set(previous);
      if (active) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  }, []);

  const getMedia = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    if (mediaRequestRef.current) return mediaRequestRef.current;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Microphone is not supported');
    const request = navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      })
      .then((stream) => {
        streamRef.current = stream;
        attachAnalyser(currentId, stream);
        return stream;
      })
      .finally(() => {
        mediaRequestRef.current = null;
      });
    mediaRequestRef.current = request;
    return request;
  }, [attachAnalyser, currentId]);

  const createPeer = useCallback(
    async (peerId, initiator) => {
      const id = String(peerId);
      if (id === currentId || peers.current.has(id)) return;
      const stream = await getMedia();
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peers.current.set(id, pc);
      if (initiator) initiators.current.add(id);
      else initiators.current.delete(id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit('group_meeting_ice', {
            groupId: group._id,
            meetingId,
            targetId: id,
            candidate,
          });
        }
      };
      pc.ontrack = ({ streams }) => {
        const audio = remoteAudio.current.get(id);
        if (audio && streams[0]) {
          audio.srcObject = streams[0];
          attachAnalyser(id, streams[0]);
          audio.play().then(
            () => setAudioBlocked(false),
            () => setAudioBlocked(true),
          );
        }
      };
      pc.onconnectionstatechange = () => {
        updateConnected(id, pc.connectionState === 'connected');
        if (['failed', 'closed'].includes(pc.connectionState)) {
          peers.current.delete(id);
          initiators.current.delete(id);
        }
      };
      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('group_meeting_offer', {
          groupId: group._id,
          meetingId,
          targetId: id,
          offer,
        });
      }
    },
    [
      attachAnalyser,
      currentId,
      getMedia,
      group?._id,
      meetingId,
      socket,
      updateConnected,
    ],
  );

  useEffect(() => {
    if (!socket || !group?._id || !meetingId) return undefined;
    const onPeerJoined = ({ peerId }) => {
      createPeer(peerId, true).catch(() =>
        setError('Could not connect to a member'),
      );
    };
    const onOffer = async ({ senderId, offer }) => {
      const id = String(senderId);
      const existing = peers.current.get(id);

      if (existing && initiators.current.has(id)) {
        // Glare — both sides offered at the same moment (two members joined in
        // the same instant, so each received the other's `peer_joined`). Break
        // the tie deterministically: the side with the HIGHER id yields and
        // answers the incoming offer; the lower id ignores it and waits for
        // that answer. Without this, one side called setRemoteDescription(offer)
        // on a connection already in have-local-offer state and the meeting
        // failed with "Could not join the meeting".
        if (currentId > id) {
          existing.close();
          peers.current.delete(id);
          initiators.current.delete(id);
          updateConnected(id, false);
        } else {
          return;
        }
      } else if (existing) {
        // Already answering this peer — a duplicate offer is a no-op.
        return;
      }

      try {
        await createPeer(id, false);
        const pc = peers.current.get(id);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('group_meeting_answer', {
          groupId: group._id,
          meetingId,
          targetId: id,
          answer,
        });
      } catch {
        setError('Could not join the meeting');
      }
    };
    const onAnswer = async ({ senderId, answer }) => {
      await peers.current
        .get(String(senderId))
        ?.setRemoteDescription(new RTCSessionDescription(answer));
    };
    const onIce = async ({ senderId, candidate }) => {
      try {
        await peers.current
          .get(String(senderId))
          ?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    };
    const onEnded = ({ meetingId: endedMeetingId }) => {
      if (endedMeetingId === meetingId) onCloseRef.current();
    };
    const onMeetingError = ({ message }) => {
      setError(message || 'The group meeting could not connect');
    };
    // A member leaving must tear down their connection here. Previously this
    // event was never handled, so departed members stayed marked as "connected"
    // with dead audio on everyone else's grid.
    const onPeerLeft = ({ peerId }) => {
      const id = String(peerId);
      peers.current.get(id)?.close();
      peers.current.delete(id);
      initiators.current.delete(id);
      analyserContexts.current.get(id)?.close?.();
      analyserContexts.current.delete(id);
      analysers.current.delete(id);
      const audio = remoteAudio.current.get(id);
      if (audio) audio.srcObject = null;
      setAudioLevels(({ [id]: _level, ...rest }) => rest);
      updateConnected(id, false);
    };

    // A peer toggling their mic must show the mute badge on their tile for
    // everyone else. The badge reflects the *remote* peer's mute state, not our
    // own — our own mute state comes from `muted` state + toggling via the
    // toggleMute button.
    const onPeerMuted = ({ peerId, muted: isMuted }) => {
      peerMuted.current.set(String(peerId), isMuted);
    };

    socket.on('group_meeting_peer_joined', onPeerJoined);
    socket.on('group_meeting_offer', onOffer);
    socket.on('group_meeting_answer', onAnswer);
    socket.on('group_meeting_ice', onIce);
    socket.on('group_meeting_ended', onEnded);
    socket.on('group_meeting_error', onMeetingError);
    socket.on('group_meeting_peer_left', onPeerLeft);
    socket.on('group_meeting_peer_muted', onPeerMuted);
    getMedia()
      .then(() => {
        if (isHost && !startEmittedRef.current) {
          startEmittedRef.current = true;
          socket.emit('group_meeting_start', {
            groupId: group._id,
            meetingId,
          });
        }
        // Create host meeting state before joining: joining first makes the
        // server report a not-yet-created meeting as already ended.
        socket.emit('group_meeting_join', { groupId: group._id, meetingId });
      })
      .catch(() =>
        setError('Allow microphone access to join the voice meeting'),
      );

    return () => {
      socket.off('group_meeting_peer_joined', onPeerJoined);
      socket.off('group_meeting_offer', onOffer);
      socket.off('group_meeting_answer', onAnswer);
      socket.off('group_meeting_ice', onIce);
      socket.off('group_meeting_ended', onEnded);
      socket.off('group_meeting_error', onMeetingError);
      socket.off('group_meeting_peer_left', onPeerLeft);
      socket.off('group_meeting_peer_muted', onPeerMuted);
    };
  }, [createPeer, getMedia, group?._id, isHost, meetingId, socket]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peers.current.forEach((pc) => pc.close());
      analyserContexts.current.forEach((context) => context.close?.());
      analysers.current.clear();
      analyserContexts.current.clear();
      // NOTE: no `group_meeting_end` here. Ending the meeting is an explicit
      // host action (Leave button → `leaveMeeting`) or happens server-side when
      // the host's socket fully disconnects. Emitting it from this unmount
      // cleanup made React StrictMode's dev double-mount kill the meeting
      // immediately after starting it — the open/close/reopen flicker.
      socket?.emit('group_meeting_leave', { groupId: group?._id, meetingId });
    },
    [group?._id, meetingId, socket],
  );

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = muted;
    });
    setMuted((value) => {
      const next = !value;
      // Broadcast the new mute state so every other member sees the mute badge
      // on this user's tile. The payload uses the *new* muted value.
      if (socket && group?._id) {
        socket.emit('group_meeting_mute_toggle', {
          groupId: group._id,
          meetingId,
          muted: next,
        });
      }
      return next;
    });
  };

  const leaveMeeting = () => {
    if (isHost) {
      meetingEndSent.current = true;
      socket.emit('group_meeting_end', { groupId: group._id, meetingId });
    }
    socket.emit('group_meeting_leave', { groupId: group._id, meetingId });
    onClose();
  };

  const activeSpeakerId = Object.entries(audioLevels).reduce(
    (loudest, [id, level]) =>
      level > (audioLevels[loudest] || 0) ? id : loudest,
    null,
  );

  return ReactDOM.createPortal(
    <div className='fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm'>
      <div className='w-full max-w-sm rounded-3xl border border-white/10 bg-gray-950/95 p-4 text-white shadow-2xl shadow-black/60'>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <p className='flex items-center gap-2 text-base font-bold'>
              <Radio size={16} className='text-emerald-400' /> {group.name}
            </p>
            <p className='mt-1 text-xs text-gray-400'>Live voice meeting</p>
          </div>
          <Users size={18} className='text-emerald-400' />
        </div>
        {error && (
          <p className='mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300'>
            {error}
          </p>
        )}
        {audioBlocked && (
          <button
            type='button'
            onClick={enableMeetingAudio}
            className='mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500/20 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/30'
          >
            <Volume2 size={14} />
            Tap to enable meeting audio
          </button>
        )}
        <div className='grid grid-cols-3 gap-3'>
          {members.map((member) => {
            const id = String(member._id);
            const isMe = id === currentId;
            const isConnected = isMe || connected.has(id);
            const level = audioLevels[id] || 0;
            const speaking = activeSpeakerId === id && level > 0.08;
            return (
              <div
                key={id}
                className='flex min-w-0 flex-col items-center gap-1.5'
              >
                <div
                  className={`relative rounded-full p-0.5 ${isConnected ? 'bg-emerald-400' : 'bg-white/10'}`}
                >
                  {/* Mute badge — shown for remote peers who have toggled their mic off.
                      We never show it for "You" because your own mute state is shown by
                      the centre toggle button. */}
                  {!isMe && peerMuted.current.get(id) && (
                    <div className='absolute -top-1 -right-1 rounded-full bg-gray-950/80 p-0.5'>
                      <MicOff size={10} className='text-red-400' />
                    </div>
                  )}
                  <AudioWaveRing level={level} active={speaking} />
                  <UserAvatar
                    user={member}
                    alt={member.username}
                    className='h-14 w-14 rounded-full object-cover'
                  />
                  <span
                    className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-gray-950 ${isConnected ? 'bg-emerald-400' : 'bg-gray-600'}`}
                  />
                </div>
                <span className='w-full truncate text-center text-[11px] text-gray-300'>
                  {isMe ? 'You' : member.username}
                </span>
                <audio
                  ref={(node) => {
                    if (node && !isMe) {
                      node.playsInline = true;
                      remoteAudio.current.set(id, node);
                    }
                  }}
                  autoPlay
                  playsInline
                />
              </div>
            );
          })}
        </div>
        <div className='mt-5 flex items-center justify-center gap-3'>
          <button
            type='button'
            onClick={toggleMute}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            className='flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20'
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            type='button'
            onClick={leaveMeeting}
            aria-label='Leave meeting'
            className='flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-400'
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default GroupMeetingModal;
