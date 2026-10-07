import { useCallback, useEffect, useState } from 'react';

const storageKey = (userId) => `chatAppNotifications:${userId}`;

const readNotifications = (userId) => {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(storageKey(userId));
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not load saved notifications:', error);
    return [];
  }
};

const usePersistentNotifications = (userId) => {
  const activeUserId = String(userId || '');
  const [state, setState] = useState(() => ({
    userId: activeUserId,
    notifications: readNotifications(activeUserId),
  }));
  const notifications = state.userId === activeUserId
    ? state.notifications
    : readNotifications(activeUserId);
  const setNotifications = useCallback((update) => {
    setState((previous) => {
      const current = previous.userId === activeUserId
        ? previous.notifications
        : readNotifications(activeUserId);
      const next = typeof update === 'function' ? update(current) : update;
      return { userId: activeUserId, notifications: next };
    });
  }, [activeUserId]);

  useEffect(() => {
    if (!activeUserId || state.userId !== activeUserId) return;
    try {
      window.localStorage.setItem(
        storageKey(activeUserId),
        JSON.stringify(notifications.slice(0, 100)),
      );
    } catch (error) {
      console.error('Could not save notifications:', error);
    }
  }, [activeUserId, notifications, state.userId]);

  useEffect(() => {
    if (!activeUserId) return undefined;
    const key = storageKey(activeUserId);
    const handleStorage = (event) => {
      if (event.key !== key) return;
      try {
        const parsed = event.newValue ? JSON.parse(event.newValue) : [];
        setState({
          userId: activeUserId,
          notifications: Array.isArray(parsed) ? parsed : [],
        });
      } catch (error) {
        console.error('Could not read updated notifications:', error);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [activeUserId]);

  return [notifications, setNotifications];
};

export default usePersistentNotifications;
