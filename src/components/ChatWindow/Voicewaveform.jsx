import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const BAR_COUNT = 32;

const fmt = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Stable "fake" waveform, used while the real one is loading or if decoding fails
const seededBars = (seed, count) => {
  let h = 2166136261;
  for (const c of String(seed ?? 'voice')) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h = h || 1;
  const bars = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = (Math.abs(h) % 1000) / 1000;
    // gentle envelope so it looks like speech
    const env = 0.55 + 0.45 * Math.sin((i / count) * Math.PI);
    bars.push(Math.max(0.18, Math.min(1, (0.25 + r * 0.75) * env)));
  }
  return bars;
};

const TONES = {
  own: {
    played: 'bg-white',
    idle: 'bg-white/35',
    thumb: 'bg-emerald-300',
    text: 'text-white/70',
  },
  other: {
    played: 'bg-emerald-400',
    idle: 'bg-gray-500/70',
    thumb: 'bg-emerald-400',
    text: 'text-gray-400',
  },
};

/**
 * WhatsApp-style voice player: play/pause button, waveform, elapsed / total time.
 * tone: 'own' (green bubble) | 'other' (dark bubble / composer preview)
 */
const VoiceWaveform = ({
  src,
  duration = 0,
  seed,
  tone = 'other',
  compact = false,
  className = '',
  onPlay,
  onEnded,
  playOnce = false,
}) => {
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration || 0);
  const [bars, setBars] = useState(() => seededBars(seed ?? src, BAR_COUNT));
  const [completed, setCompleted] = useState(false);
  const c = TONES[tone] || TONES.other;

  useEffect(() => {
    if (duration) setTotal(duration);
  }, [duration]);

  const totalTime = () => {
    const a = audioRef.current;
    return a && Number.isFinite(a.duration) && a.duration > 0
      ? a.duration
      : total;
  };

  const handleLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    // Recorded WebM often reports Infinity — force the browser to compute it
    if (a.duration === Infinity) {
      a.currentTime = 1e101;
      a.ontimeupdate = () => {
        a.ontimeupdate = null;
        a.currentTime = 0;
      };
    } else if (Number.isFinite(a.duration) && a.duration > 0) {
      setTotal(a.duration);
    }
  };

  const handleDurationChange = () => {
    const a = audioRef.current;
    if (a && Number.isFinite(a.duration) && a.duration > 0)
      setTotal(a.duration);
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (a) setCurrent(a.currentTime);
  };

  const handlePlay = () => {
    const a = audioRef.current;
    if (playOnce && completed) {
      a?.pause();
      return;
    }
    if (playOnce) setStarted(true);
    // Only one voice message plays at a time
    document.querySelectorAll('audio[data-voice]').forEach((el) => {
      if (el !== a) el.pause();
    });
    setPlaying(true);
    onPlay?.();
  };

  const handleEnded = () => {
    const a = audioRef.current;
    if (a) a.currentTime = 0;
    setPlaying(false);
    setCurrent(0);
    if (playOnce) setCompleted(true);
    onEnded?.();
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a || (playOnce && completed)) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seek = (e) => {
    const a = audioRef.current;
    const track = trackRef.current;
    if (!a || !track || (playOnce && started)) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width),
    );
    const t = totalTime();
    if (t > 0) {
      a.currentTime = ratio * t;
      setCurrent(a.currentTime);
    }
  };

  const t = totalTime();
  const progress = t > 0 ? Math.min(1, current / t) : 0;
  const shown = playing || current > 0 ? current : t;

  return (
    <div
      className={`flex w-full select-none items-center ${compact ? 'h-full gap-1.5' : 'min-w-[210px] gap-2.5 sm:min-w-[240px]'} ${className}`}
    >
      <audio
        ref={audioRef}
        src={src}
        preload='metadata'
        data-voice=''
        className='hidden'
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
      />

      <button
        type='button'
        onClick={toggle}
        disabled={playOnce && completed}
        aria-label={
          completed ? 'View-once voice message already played' : playing ? 'Pause voice message' : 'Play voice message'
        }
        className={`flex flex-shrink-0 items-center justify-center rounded-full text-white/95 transition-all hover:bg-white/10 active:scale-90 ${
          compact ? 'h-9 w-9' : 'h-10 w-10'
        }`}
      >
        {completed ? (
          <Pause size={compact ? 20 : 23} />
        ) : playing ? (
          <Pause size={compact ? 20 : 23} fill='currentColor' />
        ) : (
          <Play
            size={compact ? 20 : 23}
            fill='currentColor'
            className='ml-0.5'
          />
        )}
      </button>

      <div className='min-w-0 flex-1'>
        <div
          ref={trackRef}
          onClick={seek}
          className={`relative flex cursor-pointer items-center justify-between ${compact ? 'h-12' : 'h-8'}`}
        >
          {bars.map((b, i) => (
            <span
              key={i}
              className={`w-[3px] flex-shrink-0 rounded-full transition-colors duration-150 ${
                (i + 0.5) / bars.length <= progress ? c.played : c.idle
              }`}
              style={{ height: `${Math.round(b * 100)}%` }}
            />
          ))}
          <span
            className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full shadow ${c.thumb} ${
              progress > 0 || playing ? 'opacity-100' : 'opacity-0'
            } transition-opacity`}
            style={{ left: `calc(${progress * 100}% - 6px)` }}
          />
        </div>
        <div
          className={`mt-0.5 text-[11px] tabular-nums leading-none ${c.text}`}
        >
          {fmt(shown)}
        </div>
      </div>
    </div>
  );
};

export default VoiceWaveform;
