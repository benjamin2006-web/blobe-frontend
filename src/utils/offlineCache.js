import {
  clearOfflineUserData,
  getAppData,
  hydrateLocalCache,
  putAppData,
} from './offlineDb';

const P = 'nc_cache_';
const MAX_MESSAGES_PER_CONV = 100;

const parse = (raw) => {
  try { return JSON.parse(raw)?.data ?? null; }
  catch { return null; }
};

const evictOldMessages = () => {
  const msgKeys = Object.keys(localStorage)
    .filter(k => k.startsWith(P + 'msgs_') || k.startsWith(P + 'grpmsgs_'))
    .map(k => {
      try { return { k, ts: JSON.parse(localStorage.getItem(k))?.ts || 0 }; }
      catch { return { k, ts: 0 }; }
    })
    .sort((a, b) => a.ts - b.ts);
  msgKeys.slice(0, Math.ceil(msgKeys.length / 2)).forEach(({ k }) => localStorage.removeItem(k));
};

export const cache = {
  get: (key) => {
    const cached = parse(localStorage.getItem(P + key));
    if (cached !== null) return cached;
    void getAppData(key)
      .then((record) => {
        if (record?.value) {
          localStorage.setItem(P + key, JSON.stringify(record.value));
        }
      })
      .catch((error) => {
        console.error(`Could not restore offline cache entry "${key}":`, error);
      });
    return null;
  },

  set: (key, data) => {
    const value = { data, ts: Date.now() };
    try {
      localStorage.setItem(P + key, JSON.stringify(value));
    } catch (e) {
      if (e?.name === 'QuotaExceededError') {
        evictOldMessages();
        try {
          localStorage.setItem(P + key, JSON.stringify(value));
        } catch (storageError) {
          console.warn(`Could not write offline cache entry "${key}" to localStorage:`, storageError);
        }
      }
    }
    void putAppData(key, value).catch((error) => {
      console.error(`Could not persist offline cache entry "${key}" in IndexedDB:`, error);
    });
  },

  // Stores messages trimmed to the last MAX_MESSAGES_PER_CONV entries
  setMessages: (key, messages) => {
    const trimmed = Array.isArray(messages) ? messages.slice(-MAX_MESSAGES_PER_CONV) : [];
    cache.set(key, trimmed);
  },

  remove: (key) => { try { localStorage.removeItem(P + key); } catch {} },

  has: (key) => localStorage.getItem(P + key) !== null,

  clearAll: () => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(P))
        .forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('offline_message_queue');
      localStorage.removeItem('nc_current_user');
    } catch (error) {
      console.error('Could not clear local offline cache:', error);
    }
    void clearOfflineUserData().catch((error) => {
      console.error('Could not clear IndexedDB offline user data:', error);
    });
  },

  hydrate: hydrateLocalCache,
};
