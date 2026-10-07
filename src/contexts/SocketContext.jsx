import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';
import { SOCKET_URL } from '../utils/apiUrl';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

const TYPING_TIMEOUT_MS = 4000;
const TYPING_EMIT_INTERVAL_MS = 750;

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [presenceByUser, setPresenceByUser] = useState({});
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [recordingUsers, setRecordingUsers] = useState(new Set());
  // groupId → Set of typing usernames
  const [groupTypingUsers, setGroupTypingUsers] = useState({});
  // groupId → Set of recording usernames
  const [groupRecordingUsers, setGroupRecordingUsers] = useState({});
  const { user, token } = useAuth();

  const socketRef = useRef(null);
  const typingTimeoutsRef = useRef({});
  const groupTypingTimeoutsRef = useRef(new Map());
  const lastTypingEmitRef = useRef(new Map());
  const presenceVersionsRef = useRef(new Map());
  const latestPresenceRevisionRef = useRef(0);
  const latestPresenceSnapshotRef = useRef(0);

  const clearTypingTimeout = useCallback((userId) => {
    const id = String(userId);
    if (typingTimeoutsRef.current[id]) {
      clearTimeout(typingTimeoutsRef.current[id]);
      delete typingTimeoutsRef.current[id];
    }
  }, []);

  const setUserTyping = useCallback((userId, isTyping) => {
    const id = String(userId);
    if (isTyping) {
      setTypingUsers(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      clearTypingTimeout(id);
      typingTimeoutsRef.current[id] = setTimeout(() => {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        delete typingTimeoutsRef.current[id];
      }, TYPING_TIMEOUT_MS);
    } else {
      clearTypingTimeout(id);
      setTypingUsers(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [clearTypingTimeout]);

  useEffect(() => {
    if (!user || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setSocketConnected(false);
      setOnlineUsers(new Set());
      setPresenceByUser({});
      presenceVersionsRef.current.clear();
      latestPresenceRevisionRef.current = 0;
      latestPresenceSnapshotRef.current = 0;
      setTypingUsers(new Set());
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
      groupTypingTimeoutsRef.current.forEach(clearTimeout);
      groupTypingTimeoutsRef.current.clear();
      lastTypingEmitRef.current.clear();
      return;
    }

    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,  // keep trying until server comes back
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,     // cap backoff at 30 s
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setSocketConnected(true);
    });

    const applyPresenceEvent = (data, isOnline) => {
      const id = String(data?.userId || '');
      if (!id) return;
      const version = Number(data.presenceVersion);
      const knownVersion = presenceVersionsRef.current.get(id) || 0;
      if (
        Number.isFinite(version) &&
        version > 0 &&
        version <= latestPresenceSnapshotRef.current
      ) {
        return;
      }
      if (
        Number.isFinite(version) &&
        version > 0 &&
        version <= knownVersion
      ) {
        return;
      }
      if (Number.isFinite(version) && version > 0) {
        presenceVersionsRef.current.set(id, version);
        latestPresenceRevisionRef.current = Math.max(
          latestPresenceRevisionRef.current,
          version,
        );
      }
      setOnlineUsers((previous) => {
        const next = new Set(previous);
        if (isOnline) next.add(id);
        else next.delete(id);
        return next;
      });
      setPresenceByUser((previous) => ({
        ...previous,
        [id]: {
          ...previous[id],
          isOnline,
          ...(Number.isFinite(version) && version > 0
            ? { presenceVersion: version }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(data, 'lastSeen')
            ? { lastSeen: data.lastSeen }
            : {}),
        },
      }));
      if (!isOnline) setUserTyping(id, false);
    };

    newSocket.on('online_users', ({ userIds, revision }) => {
      const snapshotRevision = Number(revision);
      if (
        Number.isFinite(snapshotRevision) &&
        snapshotRevision <
          Math.max(
            latestPresenceRevisionRef.current,
            latestPresenceSnapshotRef.current,
          )
      ) {
        return;
      }
      const ids = new Set((userIds || []).map(String));
      if (Number.isFinite(snapshotRevision) && snapshotRevision > 0) {
        latestPresenceRevisionRef.current = snapshotRevision;
        latestPresenceSnapshotRef.current = snapshotRevision;
        presenceVersionsRef.current.forEach((version, id) => {
          if (version <= snapshotRevision) {
            presenceVersionsRef.current.set(id, snapshotRevision);
          }
        });
        ids.forEach((id) => presenceVersionsRef.current.set(id, snapshotRevision));
      }
      setOnlineUsers(ids);
      setPresenceByUser((previous) => {
        const next = { ...previous };
        Object.keys(next).forEach((id) => {
          if (!ids.has(id)) {
            next[id] = {
              ...next[id],
              isOnline: false,
              ...(Number.isFinite(snapshotRevision) && snapshotRevision > 0
                ? { presenceVersion: snapshotRevision }
                : {}),
            };
          }
        });
        ids.forEach((id) => {
          next[id] = {
            ...next[id],
            isOnline: true,
            ...(Number.isFinite(snapshotRevision) && snapshotRevision > 0
              ? { presenceVersion: snapshotRevision }
              : {}),
          };
        });
        return next;
      });
    });

    newSocket.on('user_online', (data) => applyPresenceEvent(data, true));
    newSocket.on('user_offline', (data) => applyPresenceEvent(data, false));

    newSocket.on('user_typing', (data) => {
      // Only mark as typing if they're typing to the current user
      if (String(data.receiverId) === String(user._id)) {
        setUserTyping(data.userId, data.isTyping);
      }
    });

    newSocket.on('group_user_typing', ({ groupId, userId, username, isTyping }) => {
      const key = `${groupId}:${userId}`;
      const previousTimeout = groupTypingTimeoutsRef.current.get(key);
      if (previousTimeout) clearTimeout(previousTimeout);
      if (isTyping) {
        groupTypingTimeoutsRef.current.set(
          key,
          setTimeout(() => {
            groupTypingTimeoutsRef.current.delete(key);
            setGroupTypingUsers((prev) => {
              const next = { ...prev };
              const current = new Set(next[groupId] || []);
              current.delete(username);
              next[groupId] = current;
              return next;
            });
          }, TYPING_TIMEOUT_MS),
        );
      } else {
        groupTypingTimeoutsRef.current.delete(key);
      }
      setGroupTypingUsers(prev => {
        const next = { ...prev };
        const current = new Set(next[groupId] || []);
        if (isTyping) current.add(username); else current.delete(username);
        next[groupId] = current;
        return next;
      });
    });

    newSocket.on('user_voice_recording', (data) => {
      if (String(data.receiverId) === String(user._id)) {
        setRecordingUsers(prev => {
          const next = new Set(prev);
          if (data.isRecording) next.add(String(data.userId));
          else next.delete(String(data.userId));
          return next;
        });
      }
    });

    newSocket.on('group_user_voice_recording', ({ groupId, username, isRecording }) => {
      setGroupRecordingUsers(prev => {
        const next = { ...prev };
        const current = new Set(next[groupId] || []);
        if (isRecording) current.add(username); else current.delete(username);
        next[groupId] = current;
        return next;
      });
    });

    newSocket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Suppress noisy transport errors (server down / offline) — shown in OfflineBanner instead
    newSocket.on('connect_error', () => {});
    newSocket.on('error', () => {});

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
      groupTypingTimeoutsRef.current.forEach(clearTimeout);
      groupTypingTimeoutsRef.current.clear();
      lastTypingEmitRef.current.clear();
      setGroupTypingUsers({});
    };
  }, [user, token, setUserTyping]);

  const emitTyping = useCallback((receiverId, isTyping) => {
    const s = socketRef.current;
    if (!s || !receiverId) return;

    const id = String(receiverId);

    if (isTyping) {
      const now = Date.now();
      const lastEmittedAt = lastTypingEmitRef.current.get(`dm:${id}`) || 0;
      if (now - lastEmittedAt < TYPING_EMIT_INTERVAL_MS) return;
      lastTypingEmitRef.current.set(`dm:${id}`, now);
      s.emit('typing_start', { receiverId: id });
    } else {
      lastTypingEmitRef.current.delete(`dm:${id}`);
      s.emit('typing_stop', { receiverId: id });
    }
  }, []);

  const emitGroupTyping = useCallback((groupId, isTyping) => {
    const s = socketRef.current;
    if (!s || !groupId) return;
    const id = `group:${groupId}`;
    if (isTyping) {
      const now = Date.now();
      const lastEmittedAt = lastTypingEmitRef.current.get(id) || 0;
      if (now - lastEmittedAt < TYPING_EMIT_INTERVAL_MS) return;
      lastTypingEmitRef.current.set(id, now);
    } else {
      lastTypingEmitRef.current.delete(id);
    }
    s.emit(isTyping ? 'group_typing_start' : 'group_typing_stop', { groupId });
  }, []);

  const emitVoiceRecording = useCallback((receiverId, isRecording) => {
    const s = socketRef.current;
    if (!s || !receiverId) return;
    s.emit(isRecording ? 'voice_recording_start' : 'voice_recording_stop', { receiverId: String(receiverId) });
  }, []);

  const emitGroupVoiceRecording = useCallback((groupId, isRecording) => {
    const s = socketRef.current;
    if (!s || !groupId) return;
    s.emit(isRecording ? 'group_voice_recording_start' : 'group_voice_recording_stop', { groupId: String(groupId) });
  }, []);

  const value = {
    socket,
    socketConnected,
    onlineUsers,
    presenceByUser,
    typingUsers,
    recordingUsers,
    groupTypingUsers,
    groupRecordingUsers,
    isUserOnline: (userId) => onlineUsers.has(String(userId)),
    isUserTyping: (userId) => typingUsers.has(String(userId)),
    isUserRecording: (userId) => recordingUsers.has(String(userId)),
    emitTyping,
    emitGroupTyping,
    emitVoiceRecording,
    emitGroupVoiceRecording
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};