import { useEffect, useRef, useState } from 'react';

const OfflineBanner = ({ isOnline }) => {
  const previousOnline = useRef(isOnline);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      previousOnline.current = false;
      return;
    }

    if (isOnline && !previousOnline.current) {
      setShowRestored(true);
      const timer = window.setTimeout(() => setShowRestored(false), 3000);
      previousOnline.current = isOnline;
      return () => window.clearTimeout(timer);
    }

    previousOnline.current = isOnline;
  }, [isOnline]);

  if (isOnline && !showRestored) return null;

  const restored = isOnline && showRestored;

  return (
    <div
      role='status'
      aria-live='polite'
      key={restored ? 'restored' : 'offline'}
      className={`offline-banner relative z-[100] flex w-full flex-shrink-0 select-none items-center justify-center gap-1.5 px-3 pb-1 pt-[calc(0.15rem+env(safe-area-inset-top,0px))] text-[11px] font-semibold leading-tight shadow-lg ${
        restored
          ? 'offline-banner-restored bg-emerald-500 text-white'
          : 'offline-banner-offline bg-red-500 text-white'
      }`}
    >
      <span
        className={`h-1 w-1 rounded-full ${restored ? 'bg-white' : 'bg-red-200 animate-pulse'}`}
      />
      <span className={restored ? '' : 'offline-banner-copy'}>
        {restored
          ? 'Back online'
          : 'Offline. Messages will send when reconnected.'}
      </span>
    </div>
  );
};

export default OfflineBanner;
