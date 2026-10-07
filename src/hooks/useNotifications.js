import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiUrl';

let soundContext;

const getSoundContext = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!soundContext || soundContext.state === 'closed') {
    soundContext = new AudioContext();
  }
  return soundContext;
};

const soundEnabled = () => {
  try {
    const prefs = JSON.parse(localStorage.getItem('chatAppSettings') || '{}');
    return prefs?.notifications?.sound !== false;
  } catch {
    return true;
  }
};

export const playMessageTone = (kind) => {
  if (!soundEnabled()) return;
  try {
    const context = getSoundContext();
    if (!context) return;
    if (context.state === 'suspended') context.resume().catch(() => {});

    const now = context.currentTime;
    const tones =
      kind === 'receive'
        ? [
            { frequency: 880, start: 0, duration: 0.16, volume: 0.11 },
            { frequency: 1174.66, start: 0.105, duration: 0.23, volume: 0.09 },
          ]
        : [
            {
              frequency: 740,
              endFrequency: 988,
              start: 0,
              duration: 0.11,
              volume: 0.07,
            },
          ];

    tones.forEach(({ frequency, endFrequency, start, duration, volume }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const beginsAt = now + start;
      const endsAt = beginsAt + duration;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, beginsAt);
      if (endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, endsAt);
      }
      gain.gain.setValueAtTime(0.0001, beginsAt);
      gain.gain.exponentialRampToValueAtTime(volume, beginsAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(beginsAt);
      oscillator.stop(endsAt + 0.01);
    });
  } catch {
    // Audio may be unavailable until the browser receives a user gesture.
  }
};

export const unlockMessageAudio = () => {
  try {
    const context = getSoundContext();
    if (context?.state === 'suspended') context.resume().catch(() => {});
  } catch {
    // Audio may be unavailable in this browser.
  }
};

const decodeBase64 = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
};

const useNotifications = (token) => {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    const unlockAudio = unlockMessageAudio;
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => setPermission(p));
    }
  }, []);

  const syncPushSubscription = useCallback(async () => {
    if (
      !token ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      Notification.permission !== 'granted'
    ) {
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const { data } = await axios.get(`${API_URL}/push/public-key`);
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64(data.publicKey),
        });
      }
      await axios.post(API_URL + '/push/subscription', subscription.toJSON(), {
        headers: { Authorization: 'Bearer ' + token },
      });
      return true;
    } catch (error) {
      console.error('Push subscription setup failed:', error);
      return false;
    }
  }, [token]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === 'granted') await syncPushSubscription();
    return p;
  }, [syncPushSubscription]);

  useEffect(() => {
    if (permission === 'granted') syncPushSubscription();
  }, [permission, syncPushSubscription]);

  /** Soft two-note arrival chime synthesized locally. */
  const playReceiveSound = useCallback(() => {
    playMessageTone('receive');
  }, []);

  /** Short, quieter confirmation tone when the current user's message is sent. */
  const playSendSound = useCallback(() => {
    playMessageTone('send');
  }, []);

  const playSound = playReceiveSound;

  /**
   * Show an OS-level browser notification.
   * Only fires when the tab is not focused (so the user isn't spammed while using the app).
   */
  const notify = useCallback((title, body, icon) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    // Only show OS notification when the user is away from the tab
    if (document.hasFocus()) return;

    const n = new Notification(title, {
      body,
      icon: icon || '/icons/background-removed%20icon%20svg.svg',
      badge: '/icons/icon-192.png',
      tag: `chat-${title}`,
      renotify: true,
      silent: true,
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };

    setTimeout(() => n.close(), 8000);
  }, []);

  return {
    notify,
    playSound,
    playSendSound,
    playReceiveSound,
    permission,
    requestPermission,
    syncPushSubscription,
  };
};

export default useNotifications;
