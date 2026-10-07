import { Mic, Send, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const formatDuration = (seconds) => (
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
);
const LIVE_BAR_COUNT = 32;

const CommentVoiceRecorder = ({ onSend, onModeChange, disabled = false }) => {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [levels, setLevels] = useState(() => Array(LIVE_BAR_COUNT).fill(0.12));
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const levelTimerRef = useRef(null);

  useEffect(() => () => {
    window.clearInterval(timerRef.current);
    window.clearInterval(levelTimerRef.current);
    audioContextRef.current?.close?.();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const stopLevelMeter = () => {
    window.clearInterval(levelTimerRef.current);
    levelTimerRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const startLevelMeter = (stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      const samples = new Uint8Array(analyser.fftSize);
      setLevels(Array(LIVE_BAR_COUNT).fill(0.12));
      levelTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const sample = (samples[index] - 128) / 128;
          sum += sample * sample;
        }
        const level = Math.max(0.12, Math.min(1, Math.sqrt(sum / samples.length) * 5));
        setLevels((current) => [...current.slice(1), level]);
      }, 80);
      void audioContext.resume().catch((audioError) => {
        console.warn('Comment recording waveform could not start:', audioError);
      });
    } catch (audioError) {
      console.warn('Comment recording waveform is unavailable:', audioError);
    }
  };

  const discardRecording = () => {
    onModeChange?.(false);
    setAudioBlob(null);
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setDuration(0);
    setError('');
  };

  const startRecording = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported by this browser.');
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setError('Microphone access requires HTTPS or localhost.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startLevelMeter(stream);
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        stopLevelMeter();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setError('This browser cannot record WebM or Ogg voice comments.');
        return;
      }
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stopLevelMeter();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (blob.size > 0) {
          const recordedDuration = Math.max(
            1,
            Math.round((Date.now() - startedAtRef.current) / 1000),
          );
          setAudioBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
          setDuration(recordedDuration);
          setSending(true);
          setError('');
          try {
            await onSend(blob, recordedDuration);
            discardRecording();
          } catch (sendError) {
            onModeChange?.(false);
            setError(sendError.message || 'Could not send voice comment.');
          } finally {
            setSending(false);
          }
        }
      };
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      onModeChange?.(true);
      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch (recordingError) {
      stopLevelMeter();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(recordingError.name === 'NotAllowedError'
        ? 'Allow microphone access to record a voice comment.'
        : 'Could not start voice recording.');
    }
  };

  const stopRecording = () => {
    if (!recording) return;
    window.clearInterval(timerRef.current);
    stopLevelMeter();
    setRecording(false);
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    if (recording && recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    window.clearInterval(timerRef.current);
    stopLevelMeter();
    setRecording(false);
    onModeChange?.(false);
    discardRecording();
  };

  const sendRecording = async () => {
    if (!audioBlob || sending) return;
    setSending(true);
    setError('');
    try {
      await onSend(audioBlob, duration);
      discardRecording();
    } catch (sendError) {
      setError(sendError.message || 'Could not send voice comment.');
    } finally {
      setSending(false);
    }
  };

  if (recording) {
    return (
      <div className='flex h-20 min-w-0 flex-1 items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3'>
        <span className='h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-400' />
        <span className='min-w-[2.5rem] shrink-0 text-[12px] tabular-nums text-gray-200' aria-live='polite'>
          {formatDuration(duration)}
        </span>
        <div
          className='flex h-12 min-w-0 flex-1 items-center justify-between gap-0.5 overflow-hidden'
          role='img'
          aria-label='Live voice recording waveform'
        >
          {levels.map((level, index) => (
            <span
              key={index}
              className='w-[3px] min-w-[2px] shrink-0 rounded-full bg-emerald-400 transition-[height] duration-75'
              style={{
                height: `${Math.round(level * 100)}%`,
                opacity: 0.35 + (index / levels.length) * 0.65,
              }}
            />
          ))}
        </div>
        <button
          type='button'
          onClick={cancelRecording}
          aria-label='Cancel voice recording'
          className='rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white'
        >
          <X size={17} />
        </button>
        <button
          type='button'
          onClick={stopRecording}
          aria-label='Stop voice recording'
          className='shrink-0 rounded-full bg-rose-500 p-2 text-white hover:bg-rose-400'
        >
          <Square size={15} fill='currentColor' />
        </button>
      </div>
    );
  }

  if (sending) {
    return (
      <div className='flex h-20 min-w-0 flex-1 items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3'>
        <span className='h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400' />
        <span className='text-xs text-gray-300'>Sending voice comment…</span>
        <span className='ml-auto h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-500 border-t-emerald-400' />
      </div>
    );
  }

  if (audioBlob) {
    return (
      <div className='relative flex min-w-0 shrink-0 items-center gap-1'>
        <audio src={audioUrl} controls preload='metadata' className='h-9 w-28' aria-label='Voice comment preview' />
        <button
          type='button'
          onClick={cancelRecording}
          disabled={sending}
          aria-label='Discard voice comment'
          className='rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50'
        >
          <X size={17} />
        </button>
        <button
          type='button'
          onClick={() => void sendRecording()}
          disabled={sending || disabled}
          aria-label='Send voice comment'
          className='rounded-full bg-white p-2 text-gray-900 hover:bg-gray-200 disabled:opacity-50'
        >
          {sending ? <span className='block h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent' /> : <Send size={15} />}
        </button>
        {error && (
          <span role='alert' className='absolute bottom-full right-0 mb-2 w-56 rounded-lg bg-rose-950 px-3 py-2 text-left text-xs text-rose-100 shadow-xl'>
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className='relative shrink-0'>
      <button
        type='button'
        onClick={() => void startRecording()}
        disabled={disabled}
        aria-label='Record voice comment'
        className='rounded-full p-2 text-gray-400 transition hover:bg-white/10 hover:text-emerald-400 disabled:opacity-40'
      >
        <Mic size={19} />
      </button>
      {error && (
        <span
          role='alert'
          className='absolute bottom-full right-0 mb-2 w-56 rounded-lg bg-rose-950 px-3 py-2 text-left text-xs text-rose-100 shadow-xl'
        >
          {error}
        </span>
      )}
    </div>
  );
};

export default CommentVoiceRecorder;
