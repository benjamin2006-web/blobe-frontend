import { Eye, Mic, Send, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import VoiceWaveform from './VoiceWaveform';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const LIVE_BARS = 32; // number of bars shown in the live recording waveform

const VoiceRecorder = ({
  selectedUser,
  onSendMediaMessage,
  onRecordingChange,
  disabled,
  viewOnce = false,
  onViewOnceChange,
}) => {
  const { emitVoiceRecording, emitGroupVoiceRecording } = useSocket();
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState('');
  const [levels, setLevels] = useState(() => Array(LIVE_BARS).fill(0.12));

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const levelTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(levelTimerRef.current);
      audioCtxRef.current?.close?.();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  // Live waveform: sample the microphone loudness while recording
  const startLevelMeter = (stream) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      ctx.resume?.();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      const buf = new Uint8Array(analyser.fftSize);
      setLevels(Array(LIVE_BARS).fill(0.12));
      levelTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const level = Math.max(0.12, Math.min(1, rms * 5));
        setLevels((prev) => [...prev.slice(1), level]);
      }, 80);
    } catch {}
  };

  const stopLevelMeter = () => {
    clearInterval(levelTimerRef.current);
    levelTimerRef.current = null;
    audioCtxRef.current?.close?.()?.catch?.(() => {});
    audioCtxRef.current = null;
  };

  const getMicrophoneError = (error) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return window.isSecureContext
        ? 'Microphone recording is not supported by this browser.'
        : 'Microphone access requires HTTPS or localhost.';
    }

    switch (error?.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone permission is blocked for this site. Check the browser site settings.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone was found on this device.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'The microphone is busy or unavailable. Close other apps using it and try again.';
      case 'OverconstrainedError':
        return 'The available microphone does not support the requested settings.';
      case 'SecurityError':
        return 'Microphone access was blocked by the browser security policy.';
      case 'AbortError':
        return 'Microphone access was interrupted. Please try again.';
      default:
        return 'Could not access the microphone. Check your browser and device settings.';
    }
  };

  const startRecording = async () => {
    setError('');
    try {
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        showError('Microphone access requires HTTPS or localhost.');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        showError('Microphone recording is not supported by this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startLevelMeter(stream);

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        stopLevelMeter();
        showError('This browser cannot record a supported Opus voice message.');
        return;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000,
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setRecorded(true);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setRecording(true);
      onRecordingChange?.(true);
      setDuration(0);
      startTimeRef.current = Date.now();

      if (selectedUser?.isGroup)
        emitGroupVoiceRecording(selectedUser._id, true);
      else emitVoiceRecording(selectedUser?._id, true);

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (error) {
      stopLevelMeter();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      showError(getMicrophoneError(error));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
      stopLevelMeter();
      if (selectedUser?.isGroup)
        emitGroupVoiceRecording(selectedUser._id, false);
      else emitVoiceRecording(selectedUser?._id, false);
    }
  };

  const cancel = () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      if (selectedUser?.isGroup)
        emitGroupVoiceRecording(selectedUser._id, false);
      else emitVoiceRecording(selectedUser?._id, false);
    }
    clearInterval(timerRef.current);
    stopLevelMeter();
    setLevels(Array(LIVE_BARS).fill(0.12));
    setRecorded(false);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDuration(0);
    onViewOnceChange?.(false);
    onRecordingChange?.(false);
  };

  const sendVoice = () => {
    if (!audioBlob) return;

    const blobToSend = audioBlob;
    const durationToSend = duration;

    // Hand the recording straight to the chat: the voice bubble is rendered from
    // a local blob URL right away while the upload runs in the background, and
    // the bubble itself reports progress / failure. The composer closes
    // immediately — nothing here waits for the network.
    onSendMediaMessage?.({
      kind: 'voice',
      blob: blobToSend,
      duration: durationToSend,
      viewOnce,
    });
    onViewOnceChange?.(false);
    cancel();

    // brief confirmation tone
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        1200,
        ctx.currentTime + 0.12,
      );
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
      setTimeout(() => ctx.close(), 300);
    } catch {
      /* best-effort feedback only */
    }
  };

  if (error)
    return (
      <div className='flex min-h-[44px] w-full items-center gap-2 rounded-2xl border border-red-500/30 bg-[#202c33] py-1.5 pl-3.5 pr-1.5 shadow-sm flex-shrink-0'>
        <span className='h-2 w-2 flex-shrink-0 rounded-full bg-red-400' />
        <span className='min-w-0 flex-1 text-xs leading-snug text-red-200'>
          {error}
        </span>
        <button
          onClick={() => setError('')}
          className='flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white'
        >
          <X size={14} />
        </button>
      </div>
    );

  if (recorded && audioUrl)
    return (
      <div className='flex h-12 w-full items-center gap-1.5 rounded-full border border-white/5 bg-[#202c33] pl-1.5 pr-1.5 shadow-sm flex-shrink-0'>
        <VoiceWaveform
          src={audioUrl}
          duration={duration}
          tone='other'
          compact
          className='min-w-0 flex-1'
        />
        {selectedUser && !selectedUser.isGroup && (
          <button
            onClick={() => onViewOnceChange?.(!viewOnce)}
            title='Send as view once'
            aria-label='Send as view once'
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-90 ${
              viewOnce
                ? 'bg-amber-400/20 text-amber-200'
                : 'text-gray-400 hover:bg-white/10 hover:text-amber-200'
            }`}
          >
            <Eye size={17} />
          </button>
        )}
        <button
          onClick={cancel}
          title='Discard'
          className='flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-500/15 hover:text-red-400 active:scale-90 flex-shrink-0'
        >
          <X size={17} />
        </button>
        <button
          onClick={sendVoice}
          title='Send voice message'
          className='flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] text-white shadow-md shadow-black/30 transition-all hover:bg-[#06cf9c] active:scale-90 flex-shrink-0'
        >
          <Send size={16} className='-ml-0.5 mt-0.5' />
        </button>
      </div>
    );

  if (recording)
    return (
      <div className='flex h-12 w-full items-center gap-3 rounded-full border border-white/5 bg-[#202c33] pl-4 pr-1.5 shadow-sm flex-shrink-0'>
        <span className='h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]' />
        <span className='min-w-[2.5rem] text-[15px] tabular-nums text-gray-100'>
          {fmt(duration)}
        </span>
        {/* Live waveform */}
        <div className='flex h-7 min-w-[6rem] flex-1 items-center justify-between overflow-hidden'>
          {levels.map((l, i) => (
            <span
              key={i}
              className='w-[3px] flex-shrink-0 rounded-full bg-emerald-400/90 transition-[height] duration-75'
              style={{
                height: `${Math.round(l * 100)}%`,
                opacity: 0.35 + (i / levels.length) * 0.65,
              }}
            />
          ))}
        </div>
        <button
          onClick={cancel}
          title='Cancel'
          className='flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white active:scale-90 flex-shrink-0'
        >
          <X size={17} />
        </button>
        <button
          onClick={stopRecording}
          title='Stop recording'
          className='flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white shadow-md shadow-red-950/50 transition-all hover:bg-red-400 active:scale-90 flex-shrink-0'
        >
          <Square size={13} fill='white' />
        </button>
      </div>
    );

  return (
    <button
      type='button'
      disabled={disabled}
      onClick={startRecording}
      title='Record voice message'
      className='flex h-11 w-11 items-center justify-center rounded-full text-gray-400 transition-all hover:bg-white/10 hover:text-emerald-400 active:scale-90 flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-40'
    >
      <Mic size={21} />
    </button>
  );
};

export default VoiceRecorder;
