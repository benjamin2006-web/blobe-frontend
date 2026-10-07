import { useEffect, useMemo, useState } from 'react';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [updateRegistration, setUpdateRegistration] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(true);
  const [isStandalone, setIsStandalone] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
  const { pendingCount, syncStatus } = useOfflineQueue();

  const isIos = useMemo(
    () => /iphone|ipad|ipod/i.test(window.navigator.userAgent),
    [],
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        setUpdateRegistration(registration);
        setUpdateAvailable(Boolean(registration.waiting));
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      }).catch((error) => {
        console.error('Service worker registration failed:', error);
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      setShowInstallDialog(false);
    } catch (error) {
      console.error('Could not show the app install prompt:', error);
    }
  };

  const refresh = () => {
    const waitingWorker = updateRegistration?.waiting;
    if (!waitingWorker) {
      window.location.reload();
      return;
    }
    let reloaded = false;
    let fallbackTimer;
    const reloadAfterActivation = () => {
      if (reloaded) return;
      reloaded = true;
      window.clearTimeout(fallbackTimer);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reloadAfterActivation, { once: true });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    fallbackTimer = window.setTimeout(reloadAfterActivation, 3000);
  };

  let statusMessage = '';
  if (isOnline) {
    if (syncStatus === 'error') {
      statusMessage = `${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting to sync.`;
    } else if (syncStatus === 'syncing') {
      statusMessage = 'Syncing pending actions…';
    } else if (pendingCount > 0) {
      statusMessage = `${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting to sync.`;
    }
  }

  return (
    <>
      {statusMessage && (
        <div className={`datasave-status ${!isOnline ? 'datasave-status-offline' : ''}`} role="status" aria-live="polite">
          <span aria-hidden="true">{!isOnline ? '🔴' : syncStatus === 'syncing' ? '🔄' : pendingCount ? '⏳' : '✓'}</span>
          <span>{statusMessage}</span>
        </div>
      )}
      {!isStandalone && showInstallDialog && (
        <div
          className="pwa-install-gate"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowInstallDialog(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowInstallDialog(false);
          }}
        >
          <section
            className="pwa-install-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            aria-describedby="pwa-install-description"
          >
            <img
              className="pwa-install-icon"
              src="/icons/background-removed%20icon%20svg.svg"
              alt=""
              width="88"
              height="88"
            />
            <p className="pwa-install-eyebrow">Blobe for your device</p>
            <h1 id="pwa-install-title">Install Blobe</h1>
            <p className="pwa-install-copy" id="pwa-install-description">
              Add Blobe to your home screen for a faster, app-like experience.
            </p>
            <div className="pwa-install-actions">
              <button
                className="pwa-install-primary"
                type="button"
                onClick={install}
              >
                Install
              </button>
              <button
                className="pwa-install-secondary"
                type="button"
                onClick={() => setShowInstallDialog(false)}
              >
                Cancel
              </button>
            </div>
            {showInstallHelp && (
              <p className="pwa-install-help" role="status">
                {!window.isSecureContext
                  ? 'Installation requires HTTPS. On this device, use localhost for local testing or serve the app over HTTPS.'
                  : isIos
                    ? <>In Safari, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.</>
                    : <>Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>}
              </p>
            )}
          </section>
        </div>
      )}
      {updateAvailable && (
        <div className="pwa-update" role="status">
          <span>New version available</span>
          <button type="button" onClick={refresh}>Refresh</button>
        </div>
      )}
    </>
  );
}

export default PWAInstallPrompt;
