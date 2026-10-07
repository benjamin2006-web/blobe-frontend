import { useState, useEffect } from 'react';

const KEY = 'chatWallpaper';
const EVENT = 'wallpaperChange';

export const DEFAULT_WALLPAPER_DESKTOP =
  '/chatwindow%20wallpaper/chatting%20window%20wallpaper%20default%20on%20pc.png';
export const DEFAULT_WALLPAPER_MOBILE =
  '/chatwindow%20wallpaper/mobile%20chating%20widow%20default.png';

export const WALLPAPER_OPTIONS = [
  {
    id: 'desktop-default',
    label: 'Desktop default',
    url: DEFAULT_WALLPAPER_DESKTOP,
  },
  {
    id: 'mobile-default',
    label: 'Mobile default',
    url: DEFAULT_WALLPAPER_MOBILE,
  },
  {
    id: 'chat-image',
    label: 'Chat image',
    url: '/chatwindow%20wallpaper/chatting%20window%20image.png',
  },
  {
    id: 'chat-wallpaper',
    label: 'Chat wallpaper',
    url: '/chatwindow%20wallpaper/chatting%20window%20%20wallpaper.png',
  },
];

const validWallpapers = new Set(WALLPAPER_OPTIONS.map(({ url }) => url));

const readWallpaper = () => {
  const saved = localStorage.getItem(KEY);
  return validWallpapers.has(saved) ? saved : null;
};

export const useWallpaper = () => {
  const [wallpaper, setWallpaperState] = useState(readWallpaper);

  // Keep the chat view and settings preview synchronized across tabs.
  useEffect(() => {
    const sync = () => setWallpaperState(readWallpaper());
    const syncStorage = (event) => {
      if (event.key === KEY) sync();
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  const setWallpaper = (url) => {
    if (url && validWallpapers.has(url)) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
    setWallpaperState(url && validWallpapers.has(url) ? url : null);
    // Notify mounted wallpaper consumers immediately.
    window.dispatchEvent(new Event(EVENT));
  };

  return { wallpaper, setWallpaper };
};
