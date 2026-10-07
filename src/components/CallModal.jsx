import {
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { getAvatarUrl } from '../utils/avatar';
import UserAvatar from './UserAvatar';

/* ── ICE servers: STUN + free TURN relays ──────────────────────────────────
   TURN servers relay traffic when strict NAT / firewalls block P2P.       */
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

/* ── Bandwidth tiers (kbps) ─────────────────────────────────────────────── */
const BW = {
  high: { audio: 50, video: 500 }, // good connection
  medium: { audio: 40, video: 250 }, // fair
  low: { audio: 32, video: 120 }, // poor / 3G
  veryLow: { audio: 24, video: 80 }, // very poor / 2G
};

/* ── Detect slow network upfront via Connection API ─────────────────────── */
const detectSlowNetwork = () => {
  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  if (!conn) return false;
  if (['slow-2g', '2g'].includes(conn.effectiveType)) return 'veryLow';
  if (conn.effectiveType === '3g' || (conn.downlink && conn.downlink < 1.5))
    return 'low';
  return false;
};

/* ── Media constraints per quality tier ─────────────────────────────────── */
const getMediaConstraints = (isVideo, tier = 'high') => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: tier === 'veryLow' || tier === 'low' ? 16000 : 48000,
  },
  video: isVideo
    ? {
        width: {
          ideal:
            tier === 'veryLow'
              ? 176
              : tier === 'low'
                ? 320
                : tier === 'medium'
                  ? 640
                  : 1280,
        },
        height: {
          ideal:
            tier === 'veryLow'
              ? 144
              : tier === 'low'
                ? 240
                : tier === 'medium'
                  ? 480
                  : 720,
        },
        frameRate: {
          max:
            tier === 'veryLow'
              ? 10
              : tier === 'low'
                ? 15
                : tier === 'medium'
                  ? 24
                  : 30,
        },
      }
    : false,
});

/* ── Inject SDP bandwidth annotation ───────────────────────────────────── */
const capSdpBandwidth = (sdp, audioBw, videoBw) =>
  sdp
    .replace(/a=mid:audio\r\n/g, `a=mid:audio\r\nb=AS:${audioBw}\r\n`)
    .replace(/a=mid:video\r\n/g, `a=mid:video\r\nb=AS:${videoBw}\r\n`);

/* ── Dynamically adjust encoder bitrate without renegotiation ───────────── */
const applyEncoderBitrate = async (pc, maxBps) => {
  if (!pc) return;
  const senders = pc.getSenders();
  await Promise.all(
    senders.map(async (sender) => {
      if (!sender.track) return;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings.forEach((enc) => {
          enc.maxBitrate = maxBps;
        });
        await sender.setParameters(params);
      } catch {}
    }),
  );
};

/* ── UI helpers ─────────────────────────────────────────────────────────── */
const Ring = () => (
  <div className='absolute inset-0 rounded-full pointer-events-none'>
    <div className='absolute inset-0 rounded-full bg-white/20 animate-ping' />
    <div
      className='absolute inset-[-8px] rounded-full bg-white/10 animate-ping'
      style={{ animationDelay: '0.5s' }}
    />
  </div>
);

const Timer = ({ start }) => {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setSecs(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [start]);
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return (
    <span className='font-mono text-white/70 text-sm'>
      {m}:{s}
    </span>
  );
};

const QualityDot = ({ quality }) => {
  const cfg = {
    checking: { color: 'bg-yellow-400', label: 'Connecting…' },
    good: { color: 'bg-green-400', label: 'Good connection' },
    fair: { color: 'bg-yellow-400', label: 'Fair connection' },
    poor: { color: 'bg-orange-400', label: 'Weak connection' },
    'very-poor': { color: 'bg-red-400', label: 'Very weak — low quality' },
    disconnected: { color: 'bg-red-500', label: 'Reconnecting…' },
    failed: { color: 'bg-red-600', label: 'Connection failed' },
  }[quality] ?? { color: 'bg-gray-400', label: '' };

  return (
    <div className='flex items-center gap-1.5 text-xs text-white/60'>
      <span
        className={`w-2 h-2 rounded-full ${cfg.color} ${quality === 'checking' ? 'animate-pulse' : ''}`}
      />
      {cfg.label}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   CallModal
═══════════════════════════════════════════════════════════════════════════ */
const CallModal = ({
  socket,
  currentUser,
  callee,
  callType,
  incomingCall,
  onClose,
}) => {
  const initialTier = detectSlowNetwork() || 'high';

  const [status, setStatus] = useState(callee ? 'calling' : 'incoming');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [quality, setQuality] = useState('checking');
  const [tier, setTier] = useState(initialTier); // bandwidth tier
  const [callStart, setCallStart] = useState(null);
  const [error, setError] = useState('');
  const [audioOnly, setAudioOnly] = useState(false); // downgraded mid-call

  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const remoteStreamRef = useRef(new MediaStream());
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const iceBuf = useRef([]);
  const remoteSet = useRef(false);
  const ringTimer = useRef(null);
  const connectionTimer = useRef(null);
  const statsTimer = useRef(null);
  const callIdRef = useRef(incomingCall?.callId || crypto.randomUUID());
  const tierRef = useRef(tier);
  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);

  const isVideo = (callType || incomingCall?.callType) === 'video';
  const remoteId = callee ? String(callee._id) : incomingCall?.callerId;
  const remoteName = callee ? callee.username : incomingCall?.callerName;
  const remoteAvatarSrc = callee ? getAvatarUrl(callee) : null;
  const remoteAvatarUser = callee || { _id: remoteId, username: remoteName };

  /* ── Hang up ──────────────────────────────────────────────────────────── */
  const hangUp = useCallback(
    (notify = true) => {
      clearTimeout(ringTimer.current);
      clearTimeout(connectionTimer.current);
      clearInterval(statsTimer.current);
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (notify) {
        socket.emit('call_end', {
          receiverId: remoteId,
          callId: callIdRef.current,
          callType: isVideo ? 'video' : 'audio',
          duration: callStart ? (Date.now() - callStart) / 1000 : 0,
        });
      }
      setStatus('ended');
      setTimeout(onClose, 1200);
    },
    [socket, remoteId, onClose, isVideo, callStart],
  );

  /* ── Create RTCPeerConnection ─────────────────────────────────────────── */
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        socket.emit('call_ice_candidate', { receiverId: remoteId, candidate });
    };

    pc.ontrack = ({ streams, track }) => {
      if (!remoteRef.current) return;
      const remoteStream = streams[0] || remoteStreamRef.current;
      if (!streams[0] && track && !remoteStream.getTracks().includes(track)) {
        remoteStream.addTrack(track);
      }
      remoteStreamRef.current = remoteStream;
      remoteRef.current.srcObject = remoteStream;
      remoteRef.current.volume = 1;
      const playRemoteAudio = () =>
        remoteRef.current?.play().catch(() => {
          setError('Tap the call window to enable speaker audio');
        });
      if (remoteRef.current.readyState >= 1) playRemoteAudio();
      else remoteRef.current.onloadedmetadata = playRemoteAudio;
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        clearTimeout(connectionTimer.current);
        setQuality('good');
        setStatus('active');
        setCallStart(Date.now());
        startStats(pc);
      } else if (st === 'disconnected') {
        setQuality('disconnected');
        // Attempt ICE restart quickly on slow networks
        setTimeout(() => {
          if (pcRef.current?.connectionState === 'disconnected')
            pcRef.current.restartIce();
        }, 1500);
      } else if (st === 'failed') {
        setQuality('failed');
        clearTimeout(connectionTimer.current);
        setError('Could not connect the call. Check your network and try again.');
        setTimeout(() => hangUp(false), 1500);
      } else if (st === 'closed') {
        hangUp(false);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'checking') setQuality('checking');
      if (s === 'connected' || s === 'completed') setQuality('good');
      if (s === 'failed') {
        clearTimeout(connectionTimer.current);
        setQuality('failed');
        setError('Connection failed. Please try again.');
        setTimeout(() => hangUp(false), 1500);
      }
    };

    return pc;
  }, [socket, remoteId, hangUp]);

  /* ── Stats: adaptive quality + dynamic bitrate ───────────────────────── */
  const startStats = useCallback(
    (pc) => {
      statsTimer.current = setInterval(async () => {
        if (!pc || pc.connectionState !== 'connected') return;
        try {
          const stats = await pc.getStats();
          let rtt = null;
          let lossRatio = 0;

          stats.forEach((r) => {
            if (
              r.type === 'candidate-pair' &&
              r.state === 'succeeded' &&
              r.currentRoundTripTime != null
            ) {
              rtt = r.currentRoundTripTime;
            }
            if (r.type === 'inbound-rtp') {
              const total = (r.packetsReceived || 0) + (r.packetsLost || 0);
              if (total > 0)
                lossRatio = Math.max(lossRatio, (r.packetsLost || 0) / total);
            }
          });

          if (rtt == null) return;

          let newTier, newQuality;
          if (rtt > 0.8 || lossRatio > 0.15) {
            newTier = 'veryLow';
            newQuality = 'very-poor';
          } else if (rtt > 0.4 || lossRatio > 0.08) {
            newTier = 'low';
            newQuality = 'poor';
          } else if (rtt > 0.2 || lossRatio > 0.03) {
            newTier = 'medium';
            newQuality = 'fair';
          } else {
            newTier = 'high';
            newQuality = 'good';
          }

          setQuality(newQuality);

          // Only downgrade, never upgrade mid-call (avoid resolution thrashing)
          const tierOrder = ['high', 'medium', 'low', 'veryLow'];
          if (tierOrder.indexOf(newTier) > tierOrder.indexOf(tierRef.current)) {
            setTier(newTier);
            const bw = BW[newTier];
            // Apply via SDP is too late; use setParameters for live adjustment
            await applyEncoderBitrate(pc, bw.video * 1000);
          }

          // On very poor, auto-disable video to keep audio alive
          if (newTier === 'veryLow' && isVideo && !audioOnly) {
            streamRef.current?.getVideoTracks().forEach((t) => {
              t.enabled = false;
            });
            setAudioOnly(true);
            setCamOff(true);
          }
        } catch {}
      }, 2000); // poll every 2 seconds for faster adaptation
    },
    [isVideo, audioOnly],
  );

  /* ── Get media stream for a given tier ───────────────────────────────── */
  const getMedia = useCallback(
    async (t = 'high') => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        const error = new Error(
          'Secure connection required for microphone and camera access',
        );
        error.name = 'SecureContextError';
        throw error;
      }
      const constraints = getMediaConstraints(isVideo, t);
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
        return stream;
      } catch (err) {
        // Video permission failed → fall back to audio-only
        if (isVideo && err.name !== 'NotAllowedError') {
          const stream = await navigator.mediaDevices.getUserMedia(
            getMediaConstraints(false, t),
          );
          streamRef.current = stream;
          return stream;
        }
        throw err;
      }
    },
    [isVideo],
  );

  /* ── Flush buffered ICE candidates ───────────────────────────────────── */
  const flushIceBuf = useCallback(async () => {
    for (const c of iceBuf.current) {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(c));
      } catch {}
    }
    iceBuf.current = [];
  }, []);

  /* ── Outgoing call ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (status !== 'calling') return;
    let alive = true;

    (async () => {
      try {
        const stream = await getMedia(initialTier);
        if (!alive) return;
        const pc = createPC();
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        const bw = BW[initialTier];
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: isVideo,
        });
        const capped = {
          ...offer,
          sdp: capSdpBandwidth(offer.sdp, bw.audio, bw.video),
        };
        await pc.setLocalDescription(capped);

        socket.emit('call_offer', {
          receiverId: remoteId,
          offer: capped,
          callType: isVideo ? 'video' : 'audio',
          callId: callIdRef.current,
        });

        // Ring timeout — 30 s while waiting for the other user to answer.
        ringTimer.current = setTimeout(() => {
          if (alive) {
            setError('No answer');
            hangUp();
          }
        }, 30_000);
      } catch (err) {
        if (!alive) return;
        setError(
          err.name === 'SecureContextError'
            ? 'Open the app over HTTPS on this device'
            : err.name === 'NotAllowedError'
              ? 'Microphone / camera permission denied'
              : 'Failed to start call',
        );
        setTimeout(onClose, 2500);
      }
    })();

    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line

  /* ── Socket listeners ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!socket) return;

    const onAnswered = async ({ answer }) => {
      clearTimeout(ringTimer.current);
      clearTimeout(connectionTimer.current);
      connectionTimer.current = setTimeout(() => {
        if (pcRef.current?.connectionState !== 'connected') {
          setError('The call took too long to connect. Please try again.');
          hangUp(false);
        }
      }, 12_000);
      try {
        const bw = BW[tierRef.current];
        const capped = {
          ...answer,
          sdp: capSdpBandwidth(answer.sdp, bw.audio, bw.video),
        };
        await pcRef.current?.setRemoteDescription(
          new RTCSessionDescription(capped),
        );
        remoteSet.current = true;
        await flushIceBuf();
      } catch {}
    };

    const onRejected = () => {
      setError('Call declined');
      hangUp(false);
    };

    const onCallError = ({ message }) => {
      setError(message || 'Call could not be started');
      hangUp(false);
    };

    const onCandidate = async ({ candidate }) => {
      if (!candidate) return;
      if (remoteSet.current && pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      } else {
        iceBuf.current.push(candidate);
      }
    };

    const onEnded = () => hangUp(false);

    socket.on('call_answered', onAnswered);
    socket.on('call_rejected', onRejected);
    socket.on('call_error', onCallError);
    socket.on('call_ice_candidate', onCandidate);
    socket.on('call_ended', onEnded);

    return () => {
      socket.off('call_answered', onAnswered);
      socket.off('call_rejected', onRejected);
      socket.off('call_error', onCallError);
      socket.off('call_ice_candidate', onCandidate);
      socket.off('call_ended', onEnded);
    };
  }, [socket, hangUp, flushIceBuf]);

  /* ── Accept incoming call ─────────────────────────────────────────────── */
  const acceptCall = useCallback(async () => {
    setStatus('connecting');
    setQuality('checking');
    try {
      const stream = await getMedia(initialTier);
      const pc = createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const bw = BW[initialTier];
      const capped = {
        ...incomingCall.offer,
        sdp: capSdpBandwidth(incomingCall.offer.sdp, bw.audio, bw.video),
      };
      await pc.setRemoteDescription(new RTCSessionDescription(capped));
      remoteSet.current = true;
      await flushIceBuf();

      const answer = await pc.createAnswer();
      const cappedAns = {
        ...answer,
        sdp: capSdpBandwidth(answer.sdp, bw.audio, bw.video),
      };
      await pc.setLocalDescription(cappedAns);

      socket.emit('call_answer', { callerId: remoteId, answer: cappedAns });
      clearTimeout(connectionTimer.current);
      connectionTimer.current = setTimeout(() => {
        if (pcRef.current?.connectionState !== 'connected') {
          setError('The call took too long to connect. Please try again.');
          hangUp(false);
        }
      }, 12_000);
    } catch (err) {
      setError(
        err.name === 'SecureContextError'
          ? 'Open the app over HTTPS on this device'
          : err.name === 'NotAllowedError'
            ? 'Permission denied'
            : 'Could not start call',
      );
      setTimeout(onClose, 2000);
    }
  }, [
    getMedia,
    createPC,
    incomingCall,
    socket,
    remoteId,
    flushIceBuf,
    onClose,
    initialTier,
  ]);

  const rejectCall = useCallback(() => {
    socket.emit('call_reject', { callerId: remoteId });
    hangUp(false);
  }, [socket, remoteId, hangUp]);

  /* ── Toggle mic / cam ─────────────────────────────────────────────────── */
  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = muted;
    });
    setMuted((v) => !v);
  };

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = camOff;
    });
    setCamOff((v) => !v);
  };

  /* ── Manual switch to audio-only ──────────────────────────────────────── */
  const switchToAudioOnly = () => {
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.stop();
      t.enabled = false;
    });
    setAudioOnly(true);
    setCamOff(true);
  };

  /* ── Retry after failure ──────────────────────────────────────────────── */
  const retry = () => {
    pcRef.current?.close();
    pcRef.current = null;
    remoteSet.current = false;
    iceBuf.current = [];
    setQuality('checking');
    setError('');
    setAudioOnly(false);
    setCamOff(false);
    if (callee) setStatus('calling');
    else setStatus('incoming');
  };

  /* ── Cleanup ──────────────────────────────────────────────────────────── */
  useEffect(
    () => () => {
      clearTimeout(ringTimer.current);
      clearTimeout(connectionTimer.current);
      clearInterval(statsTimer.current);
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const showVideo =
    isVideo && !audioOnly && (status === 'active' || status === 'connecting');
  const isLowQuality = ['poor', 'very-poor'].includes(quality);

  /* ══════════════════════════════════════════════════════════════════════════
     Render
  ══════════════════════════════════════════════════════════════════════════ */
  return ReactDOM.createPortal(
    <div className='fixed inset-0 z-[500]'>
      {/* Dark backdrop */}
      <div className='absolute inset-0 bg-gray-950/90 backdrop-blur-lg' />

      {/* Remote media: audio calls still need a media element to play sound. */}
      {isVideo ? (
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className={
            showVideo
              ? 'absolute inset-0 w-full h-full object-cover opacity-80'
              : 'hidden'
          }
        />
      ) : (
        <audio
          ref={remoteRef}
          autoPlay
          playsInline
          className='absolute h-px w-px opacity-0'
          aria-label='Remote call audio'
        />
      )}

      {/* Main panel */}
      <div className='relative z-10 h-full flex flex-col items-center justify-center p-6'>
        <div className='w-full max-w-sm flex flex-col items-center gap-5 py-10 px-6 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 shadow-2xl'>
          {/* Network quality indicator */}
          {(status === 'active' || status === 'connecting') && (
            <QualityDot quality={quality} />
          )}

          {/* Status text */}
          <p className='text-xs font-semibold tracking-widest uppercase text-white/40'>
            {status === 'calling' && `${isVideo ? 'Video' : 'Voice'} calling…`}
            {status === 'incoming' &&
              `Incoming ${isVideo ? 'video' : 'voice'} call`}
            {status === 'connecting' && 'Connecting…'}
            {status === 'active' && <Timer start={callStart} />}
            {status === 'ended' && 'Call ended'}
          </p>

          {/* Avatar with ring animation */}
          <div className='relative my-2'>
            {(status === 'calling' || status === 'incoming') && <Ring />}
            <UserAvatar
              user={remoteAvatarUser}
              src={remoteAvatarSrc || getAvatarUrl(remoteAvatarUser)}
              alt={remoteName}
              className='relative z-10 w-28 h-28 rounded-full object-cover ring-4 ring-white/20 shadow-2xl'
            />
          </div>

          {/* Name + status */}
          <div className='text-center -mt-1'>
            <h2 className='text-2xl font-bold text-white'>{remoteName}</h2>
            <p className='text-white/40 text-sm mt-1 flex items-center justify-center gap-1.5'>
              {status === 'calling' && (
                <>
                  <PhoneCall size={12} /> Ringing…
                </>
              )}
              {status === 'incoming' && (
                <>
                  <PhoneIncoming size={12} /> Tap to answer
                </>
              )}
              {status === 'connecting' && (
                <>
                  <Wifi size={12} className='animate-pulse' /> Establishing
                  connection…
                </>
              )}
              {status === 'active' && (
                <>
                  <Volume2 size={12} /> Connected
                </>
              )}
              {status === 'ended' && 'Disconnected'}
            </p>
            {audioOnly && status === 'active' && (
              <p className='text-yellow-400 text-xs mt-0.5 flex items-center justify-center gap-1'>
                <WifiOff size={10} /> Switched to audio-only (slow connection)
              </p>
            )}
            {!audioOnly && isLowQuality && isVideo && status === 'active' && (
              <p className='text-orange-400 text-xs mt-0.5 flex items-center justify-center gap-1'>
                <WifiOff size={10} /> Reduced quality — slow connection detected
              </p>
            )}
            {error && <p className='text-red-400 text-xs mt-1'>{error}</p>}
          </div>

          {/* Local video (picture-in-picture) */}
          {showVideo && (
            <video
              ref={localRef}
              autoPlay
              muted
              playsInline
              className='absolute bottom-28 right-4 w-24 h-32 rounded-2xl object-cover border-2 border-white/20 shadow-xl'
            />
          )}

          {/* ── Action buttons ── */}
          <div className='flex flex-col items-center gap-3 mt-3 w-full'>
            <div className='flex items-center justify-center gap-4 flex-wrap'>
              {/* INCOMING */}
              {status === 'incoming' && (
                <>
                  <button
                    onClick={rejectCall}
                    className='w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl active:scale-90 transition-all'
                  >
                    <PhoneOff size={24} className='text-white' />
                  </button>
                  <button
                    onClick={acceptCall}
                    className='w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-xl active:scale-90 transition-all'
                  >
                    <Phone size={24} className='text-white' />
                  </button>
                </>
              )}

              {/* CALLING / CONNECTING */}
              {(status === 'calling' || status === 'connecting') && (
                <button
                  onClick={() => hangUp()}
                  className='w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl active:scale-90 transition-all'
                >
                  <PhoneOff size={24} className='text-white' />
                </button>
              )}

              {/* ACTIVE */}
              {status === 'active' && (
                <>
                  <button
                    onClick={toggleMic}
                    className={`w-12 h-12 rounded-full flex items-center justify-center shadow transition-all active:scale-90 ${muted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'}`}
                  >
                    {muted ? (
                      <MicOff size={20} className='text-white' />
                    ) : (
                      <Mic size={20} className='text-white' />
                    )}
                  </button>
                  {isVideo && !audioOnly && (
                    <button
                      onClick={toggleCam}
                      className={`w-12 h-12 rounded-full flex items-center justify-center shadow transition-all active:scale-90 ${camOff ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'}`}
                    >
                      {camOff ? (
                        <VideoOff size={20} className='text-white' />
                      ) : (
                        <Video size={20} className='text-white' />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => hangUp()}
                    className='w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl active:scale-90 transition-all'
                  >
                    <PhoneOff size={24} className='text-white' />
                  </button>
                </>
              )}

              {/* FAILED — offer retry */}
              {quality === 'failed' && status === 'active' && (
                <button
                  onClick={retry}
                  className='flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-white text-sm font-medium transition-colors'
                >
                  <RefreshCw size={15} /> Retry
                </button>
              )}
            </div>

            {/* Switch to audio-only button for weak video connections */}
            {isVideo && !audioOnly && isLowQuality && status === 'active' && (
              <button
                onClick={switchToAudioOnly}
                className='flex items-center gap-1.5 text-xs text-yellow-300 hover:text-yellow-200 underline underline-offset-2 transition-colors'
              >
                <VideoOff size={12} /> Switch to audio-only to improve call
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CallModal;
