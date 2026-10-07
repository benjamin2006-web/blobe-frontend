import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../utils/apiUrl';
import { useAuth } from './AuthContext';
import { UnreadCountsContext } from './UnreadCountsContext';
import { useSocket } from './SocketContext';
import { playMessageTone, unlockMessageAudio } from '../hooks/useNotifications';
import { cache } from '../utils/offlineCache';

const UnreadCountsProvider = ({ children }) => {
  const { user, token } = useAuth();
  const { socket, socketConnected } = useSocket();
  const [cachedUnreadCounts] = useState(() => cache.get('unread_counts'));
  const [unreadCounts, setUnreadCounts] = useState(
    cachedUnreadCounts?.conversations || {},
  );
  const [groupUnreadCounts, setGroupUnreadCounts] = useState(
    cachedUnreadCounts?.groups || {},
  );
  const unreadRequestId = useRef(0);
  const unreadEventVersion = useRef(0);
  const alertedMessageIds = useRef(new Set());

  const refreshUnreadCounts = useCallback(async () => {
    if (!user || !token) return;

    const requestId = ++unreadRequestId.current;
    const eventVersion = unreadEventVersion.current;
    try {
      const response = await axios.get(`${API_URL}/messages/unread/count`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (
        requestId !== unreadRequestId.current ||
        eventVersion !== unreadEventVersion.current
      ) {
        return;
      }
      const conversations = response.data.conversations || {};
      const groups = response.data.groups || {};
      setUnreadCounts(conversations);
      setGroupUnreadCounts(groups);
      cache.set('unread_counts', { conversations, groups });
    } catch (error) {
      console.error('Failed to fetch unread message counts:', error);
    }
  }, [token, user]);

  useEffect(() => {
    if (!user || !token) return undefined;

    let refreshTimer;
    const scheduleRefresh = () => {
      unreadEventVersion.current += 1;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshUnreadCounts, 300);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    const alertForIncomingMessage = (message, isGroupMessage) => {
      const senderId =
        typeof message?.sender === 'object'
          ? message.sender?._id
          : message?.sender;
      if (
        !message?._id ||
        !senderId ||
        String(senderId) === String(user._id) ||
        message.messageType === 'meeting'
      ) {
        return;
      }

      const messageId = String(message._id);
      if (alertedMessageIds.current.has(messageId)) return;
      alertedMessageIds.current.add(messageId);
      if (alertedMessageIds.current.size > 5000) {
        const oldestId = alertedMessageIds.current.values().next().value;
        alertedMessageIds.current.delete(oldestId);
      }

      try {
        const preferences = JSON.parse(
          localStorage.getItem('chatAppSettings') || '{}',
        );
        const category = isGroupMessage ? 'groups' : 'messages';
        if (preferences?.notifications?.[category] === false) return;
      } catch {
        // Use the default enabled notification preferences if local settings are malformed.
      }

      playMessageTone('receive');
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(90);
      }
    };
    const onDirectMessage = (message) => {
      scheduleRefresh();
      alertForIncomingMessage(message, false);
    };
    const onGroupMessage = (message) => {
      scheduleRefresh();
      alertForIncomingMessage(message, true);
    };
    const onAudioUnlock = () => unlockMessageAudio();

    scheduleRefresh();
    socket?.on('connect', scheduleRefresh);
    socket?.on('receive_message', onDirectMessage);
    socket?.on('receive_group_message', onGroupMessage);
    socket?.on('messages_read', scheduleRefresh);
    socket?.on('unread_counts_changed', scheduleRefresh);
    window.addEventListener('unread-counts-changed', scheduleRefresh);
    window.addEventListener('pointerdown', onAudioUnlock, { once: true });
    window.addEventListener('keydown', onAudioUnlock, { once: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimeout(refreshTimer);
      socket?.off('connect', scheduleRefresh);
      socket?.off('receive_message', onDirectMessage);
      socket?.off('receive_group_message', onGroupMessage);
      socket?.off('messages_read', scheduleRefresh);
      socket?.off('unread_counts_changed', scheduleRefresh);
      window.removeEventListener('unread-counts-changed', scheduleRefresh);
      window.removeEventListener('pointerdown', onAudioUnlock);
      window.removeEventListener('keydown', onAudioUnlock);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshUnreadCounts, socket, socketConnected, token, user]);

  const activeUnreadCounts = useMemo(
    () => (user && token ? unreadCounts : {}),
    [token, unreadCounts, user],
  );
  const activeGroupUnreadCounts = useMemo(
    () => (user && token ? groupUnreadCounts : {}),
    [groupUnreadCounts, token, user],
  );
  const totalUnread = useMemo(
    () =>
      Object.values(activeUnreadCounts).reduce((sum, count) => sum + count, 0) +
      Object.values(activeGroupUnreadCounts).reduce((sum, count) => sum + count, 0),
    [activeGroupUnreadCounts, activeUnreadCounts],
  );

  return (
    <UnreadCountsContext.Provider
      value={{
        unreadCounts: activeUnreadCounts,
        groupUnreadCounts: activeGroupUnreadCounts,
        setUnreadCounts,
        setGroupUnreadCounts,
        refreshUnreadCounts,
        totalUnread,
      }}
    >
      {children}
    </UnreadCountsContext.Provider>
  );
};

export default UnreadCountsProvider;
