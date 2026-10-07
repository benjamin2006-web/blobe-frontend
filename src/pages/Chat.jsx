import axios from 'axios';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import CallModal from '../components/CallModal.jsx';
import ChatSidebar from '../components/ChatSidebar/Main/index.jsx';
import ChatWindow from '../components/ChatWindow/index.jsx';
import GroupMeetingModal from '../components/GroupMeetingModal.jsx';
import MeetingInviteBanner from '../components/MeetingInviteBanner.jsx';
import GenderPrompt from '../components/GenderPrompt.jsx';
import OfflineBanner from '../components/OfflineBanner.jsx';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import useNotifications from '../hooks/useNotifications';
import usePersistentNotifications from '../hooks/usePersistentNotifications';
import { useObjectUrls } from '../hooks/useObjectUrls';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { useUnreadCounts } from '../contexts/useUnreadCounts';
import { API_URL } from '../utils/apiUrl';
import {
  getConversationPartnerId,
  toConversationPreview,
} from '../utils/conversationPreview';
import {
  buildClientId,
  collectLocalPreviewUrls,
  createOptimisticMediaMessage,
  describeUploadError,
  isLocalPreviewUrl,
  patchOptimisticMessage,
  reconcileServerMessage,
  removeOptimisticMessage,
  uploadMessageFile,
  uploadMessageImage,
  uploadVoiceMessage,
} from '../utils/messageMedia';
import { cache } from '../utils/offlineCache';

const DELIVERY_STATUS_RANK = { sent: 1, delivered: 2, read: 3 };

const getChatUserPageSize = () => {
  const availableHeight = Math.max(0, window.innerHeight - 220);
  return Math.max(6, Math.min(24, Math.ceil(availableHeight / 72) + 2));
};

const applyPresenceToUser = (user, presence) => {
  if (!user || !presence) return user;
  const currentVersion = Number(user.presenceVersion) || 0;
  const nextVersion = Number(presence.presenceVersion) || 0;
  if (currentVersion > nextVersion) return user;
  return {
    ...user,
    isOnline: presence.isOnline,
    presenceVersion: nextVersion || user.presenceVersion,
    ...(presence.lastSeen ? { lastSeen: presence.lastSeen } : {}),
  };
};

const Chat = () => {
  const [initialCache] = useState(() => ({
    users: cache.get('users'),
    lastMessages: cache.get('last_messages'),
    groups: cache.get('groups'),
  }));
  const initialUsers = Array.isArray(initialCache.users)
    ? initialCache.users.slice(0, getChatUserPageSize())
    : [];

  // DM state
  const [users, setUsers] = useState(initialUsers);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [lastMessages, setLastMessages] = useState(
    initialCache.lastMessages && typeof initialCache.lastMessages === 'object'
      ? initialCache.lastMessages
      : {},
  );

  // Group state
  const [groups, setGroups] = useState(
    Array.isArray(initialCache.groups) ? initialCache.groups : [],
  );
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupLastMessages, setGroupLastMessages] = useState({});

  const [loading, setLoading] = useState(initialUsers.length === 0);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoadError, setUsersLoadError] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [meetingInvitations, setMeetingInvitations] = useState([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [messagesPage, setMessagesPage] = useState(1);
  const [mobileView, setMobileView] = useState('sidebar');
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    () => window.matchMedia('(min-width: 768px)').matches,
  );
  const [isPageVisible, setIsPageVisible] = useState(
    () => document.visibilityState === 'visible',
  );
  const [pushTarget, setPushTarget] = useState(null);
  const chatViewportRef = useRef(null);
  const location = useLocation();

  useLayoutEffect(() => {
    const chatViewport = chatViewportRef.current;
    if (!chatViewport) return undefined;

    const visualViewport = window.visualViewport;
    let animationFrame = 0;
    const syncChatViewport = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const top = Math.max(visualViewport?.offsetTop || 0, 0);
        const height = Math.max(
          visualViewport?.height || window.innerHeight,
          0,
        );
        chatViewport.style.top = `${top}px`;
        chatViewport.style.height = `${height}px`;
      });
    };

    syncChatViewport();
    visualViewport?.addEventListener('resize', syncChatViewport);
    visualViewport?.addEventListener('scroll', syncChatViewport);
    window.addEventListener('resize', syncChatViewport);
    window.addEventListener('orientationchange', syncChatViewport);
    window.addEventListener('scroll', syncChatViewport, { passive: true });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      visualViewport?.removeEventListener('resize', syncChatViewport);
      visualViewport?.removeEventListener('scroll', syncChatViewport);
      window.removeEventListener('resize', syncChatViewport);
      window.removeEventListener('orientationchange', syncChatViewport);
      window.removeEventListener('scroll', syncChatViewport);
    };
  }, []);

  const { user, token, logout } = useAuth();
  const {
    socket,
    socketConnected,
    presenceByUser,
    isUserOnline,
    isUserTyping,
    emitTyping,
    groupTypingUsers,
    emitGroupTyping,
    isUserRecording,
    groupRecordingUsers,
  } = useSocket();
  const { notify, playSendSound } = useNotifications(token);
  const {
    isOnline,
    enqueue,
    getQueue,
    acknowledge,
    markSyncing,
    markRetry,
  } = useOfflineQueue();
  const {
    unreadCounts,
    groupUnreadCounts,
    setUnreadCounts,
    setGroupUnreadCounts,
    refreshUnreadCounts,
  } = useUnreadCounts();

  const currentUserId = user?.id || user?._id;
  const [notifications, setNotifications] = usePersistentNotifications(currentUserId);
  const openCreateGroup = new URLSearchParams(location.search).get('createGroup') === '1';
  const isConversationPaneVisible =
    isDesktopViewport || mobileView === 'chat';

  useEffect(() => {
    if (!socket || !currentUserId) return undefined;
    const addActivityNotification = (type, data) => {
      const actorId = String(data?.actorId || '');
      if (!actorId || actorId === String(currentUserId)) return;
      const commentId = String(data?.commentId || '');
      const id = `${type}:${commentId}`;
      setNotifications((current) => {
        if (current.some((notification) => notification.id === id)) return current;
        return [{
          id,
          type,
          text: data?.preview || `${data?.actorName || 'Someone'} ${type === 'comment_reply' ? 'replied to your comment' : 'mentioned you in a comment'}`,
          timestamp: new Date().toISOString(),
          read: false,
          actorId,
          actorAvatar: data?.actorAvatar,
          postId: String(data?.postId || ''),
          commentId,
          ...(data?.parentCommentId ? { parentCommentId: String(data.parentCommentId) } : {}),
        }, ...current].slice(0, 100);
      });
      notify(
        type === 'comment_reply'
          ? `${data?.actorName || 'Someone'} replied`
          : `${data?.actorName || 'Someone'} mentioned you`,
        data?.preview || 'You have new comment activity.',
        data?.actorAvatar || undefined,
      );
    };
    const handleCommentReply = (data) => addActivityNotification('comment_reply', data);
    const handleCommentMention = (data) => addActivityNotification('comment_mention', data);
    socket.on('comment_reply', handleCommentReply);
    socket.on('comment_mention', handleCommentMention);
    return () => {
      socket.off('comment_reply', handleCommentReply);
      socket.off('comment_mention', handleCommentMention);
    };
  }, [currentUserId, notify, setNotifications, socket]);

  // Track whether we've already synced after the most recent reconnect
  const hasSyncedRef = useRef(false);
  const pendingSyncSocketIdRef = useRef(null);
  // After the first failed API call we know the server is down; skip retries until socket reconnects
  const serverAvailableRef = useRef(true);
  // Ref to expose selectedUser/Group inside effects without stale closures
  const selectedUserRef = useRef(selectedUser);
  const selectedGroupRef = useRef(selectedGroup);
  const presenceByUserRef = useRef(presenceByUser);
  const receivedMessageIdsRef = useRef(new Set());
  const userListRequestRef = useRef(null);
  const userListRequestIdRef = useRef(0);
  const usersCursorRef = useRef(null);
  const usersHasMoreRef = useRef(false);
  const fetchUsersRef = useRef(null);
  const usersRef = useRef(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);
  // Current device coordinates — set once after geolocation resolves
  const locationRef = useRef(null);
  // Blob-URL lifetimes for optimistic media previews (photos / voice notes)
  const {
    create: createPreviewUrl,
    release: releasePreviewUrl,
    releaseUnreferenced: releaseUnreferencedPreviews,
  } = useObjectUrls();
  // Media still waiting to be (re)uploaded, keyed by the bubble's clientId
  const pendingUploadsRef = useRef(new Map());
  const activeUploadsRef = useRef(new Set());
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);
  useEffect(() => {
    selectedGroupRef.current = selectedGroup;
  }, [selectedGroup]);
  useEffect(() => {
    presenceByUserRef.current = presenceByUser;
  }, [presenceByUser]);
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const updateViewport = (event) => setIsDesktopViewport(event.matches);
    const updatePageVisibility = () =>
      setIsPageVisible(document.visibilityState === 'visible');

    desktopQuery.addEventListener('change', updateViewport);
    document.addEventListener('visibilitychange', updatePageVisibility);

    return () => {
      desktopQuery.removeEventListener('change', updateViewport);
      document.removeEventListener('visibilitychange', updatePageVisibility);
    };
  }, []);

  // Release local previews the moment no rendered message references them: the
  // optimistic bubble was replaced by the persisted message, a failed upload was
  // discarded, or the user switched to another conversation mid-upload.
  useEffect(() => {
    const referenced = collectLocalPreviewUrls(messages);
    collectLocalPreviewUrls(groupMessages).forEach((url) => referenced.add(url));
    releaseUnreferencedPreviews(referenced);
  }, [messages, groupMessages, releaseUnreferencedPreviews]);

  // Request a fresh, high-accuracy position; never substitute an estimated location.
  useEffect(() => {
    if (!token) return;
    if (!navigator.geolocation) {
      console.warn('Location is unavailable in this browser.');
      return;
    }
    let active = true;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (
          !active ||
          !Number.isFinite(coords.latitude) ||
          !Number.isFinite(coords.longitude) ||
          coords.latitude < -90 ||
          coords.latitude > 90 ||
          coords.longitude < -180 ||
          coords.longitude > 180
        ) {
          return;
        }
        const location = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        locationRef.current = { lat: coords.latitude, lon: coords.longitude };
        try {
          await axios.put(`${API_URL}/users/location`, location, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (active) fetchUsersRef.current?.();
        } catch (error) {
          console.warn(
            'Could not save the current location. The app will retry next time.',
            error,
          );
        }
      },
      (error) => {
        if (!active) return;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            console.info('Location permission was denied.');
            break;
          case error.POSITION_UNAVAILABLE:
            console.warn('The device could not determine its location.');
            break;
          case error.TIMEOUT:
            console.warn('The high-accuracy location request timed out.');
            break;
          default:
            console.warn('Could not obtain the device location.', error);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => {
      active = false;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo(
    () =>
      axios.create({
        baseURL: API_URL,
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );

  // ─── DM helpers ───────────────────────────────────────────────────────────
  const upsertLastMessage = useCallback(
    (message) => {
      if (!currentUserId || !message) return;
      // Media messages keep their text in a dedicated field (or in the upload
      // itself), so `content` being empty must not skip the sidebar preview.
      if (
        !message.content &&
        !['voice', 'image', 'call'].includes(message.messageType)
      ) {
        return;
      }
      const partnerId = getConversationPartnerId(message, currentUserId);
      setLastMessages((prev) => {
        const previous = prev[partnerId];
        const previousTime = previous?.timestamp
          ? new Date(previous.timestamp).getTime()
          : 0;
        const messageTime = message.createdAt
          ? new Date(message.createdAt).getTime()
          : Date.now();
        if (previous && Number.isFinite(previousTime) && messageTime < previousTime) {
          return prev;
        }
        const preview = toConversationPreview(message, currentUserId);
        if (
          previous?.messageId === preview.messageId &&
          (DELIVERY_STATUS_RANK[previous.status] || 0) >
            (DELIVERY_STATUS_RANK[preview.status] || 0)
        ) {
          preview.status = previous.status;
        }
        const next = {
          ...prev,
          [partnerId]: preview,
        };
        cache.set('last_messages', next);
        return next;
      });
    },
    [currentUserId],
  );

  const fetchConversationPreviews = useCallback(async () => {
    try {
      const response = await api.get('/messages/recent-previews');
      const previews = response.data.previews || {};
      setLastMessages((previous) => {
        const next = { ...previous };
        Object.entries(previews).forEach(([partnerId, preview]) => {
          const previousTime = previous[partnerId]?.timestamp
            ? new Date(previous[partnerId].timestamp).getTime()
            : 0;
          const fetchedTime = preview.timestamp
            ? new Date(preview.timestamp).getTime()
            : 0;
          const existing = previous[partnerId];
          const sameMessage = existing?.messageId === preview.messageId;
          const fetchedStatusRank = DELIVERY_STATUS_RANK[preview.status] || 0;
          const existingStatusRank = DELIVERY_STATUS_RANK[existing?.status] || 0;
          if (
            !existing ||
            fetchedTime > previousTime ||
            (fetchedTime === previousTime &&
              (!sameMessage || fetchedStatusRank >= existingStatusRank))
          ) {
            next[partnerId] = preview;
          }
        });
        cache.set('last_messages', next);
        return next;
      });
    } catch (error) {
      console.error('Failed to fetch recent conversation previews:', error);
    }
  }, [api]);

  const fetchUsers = useCallback(async (targetCount) => {
    const pageSize = getChatUserPageSize();
    const requiredCount = targetCount ?? pageSize;
    const cachedUsers = cache.get('users');
    let hasUsersToShow = usersRef.current.length > 0;
    if (!hasUsersToShow && cachedUsers && userSearchTerm === '') {
      const cachedFirstPage = cachedUsers.slice(0, pageSize).map((entry) =>
        applyPresenceToUser(
          entry,
          presenceByUserRef.current[String(entry._id)],
        ),
      );
      usersRef.current = cachedFirstPage;
      setUsers(cachedFirstPage);
      setLoading(false);
      hasUsersToShow = cachedFirstPage.length > 0;
    }
    const cachedLastMsgs = cache.get('last_messages');
    if (cachedLastMsgs) setLastMessages(cachedLastMsgs);

    userListRequestRef.current?.controller.abort();
    const requestId = ++userListRequestIdRef.current;
    const controller = new AbortController();
    userListRequestRef.current = { id: requestId, controller };
    usersCursorRef.current = null;
    usersHasMoreRef.current = false;
    setUsersHasMore(false);
    setLoadingMoreUsers(false);
    setUsersLoadError(false);
    setLoading(!hasUsersToShow);

    if (!serverAvailableRef.current && cachedUsers) {
      userListRequestRef.current = null;
      setLoading(false);
      setUsersLoadError(true);
      return;
    }

    void fetchConversationPreviews();

    try {
      const response = await api.get('/users/recommendations', {
        params: { limit: pageSize, search: userSearchTerm },
        signal: controller.signal,
      });
      if (requestId !== userListRequestIdRef.current) return;
      serverAvailableRef.current = true;
      const userList = response.data.users.map((entry) =>
        applyPresenceToUser(
          entry,
          presenceByUserRef.current[String(entry._id)],
        ),
      );
      let nextCursor = response.data.nextCursor || null;
      let hasMore = Boolean(response.data.hasMore);
      while (userList.length < requiredCount && hasMore && nextCursor) {
        const nextResponse = await api.get('/users/recommendations', {
          params: { limit: pageSize, cursor: nextCursor, search: userSearchTerm },
          signal: controller.signal,
        });
        if (requestId !== userListRequestIdRef.current) return;
        const knownIDs = new Set(userList.map((entry) => String(entry._id)));
        nextResponse.data.users.forEach((entry) => {
          if (!knownIDs.has(String(entry._id))) {
            knownIDs.add(String(entry._id));
            userList.push(
              applyPresenceToUser(
                entry,
                presenceByUserRef.current[String(entry._id)],
              ),
            );
          }
        });
        nextCursor = nextResponse.data.nextCursor || null;
        hasMore = Boolean(nextResponse.data.hasMore);
      }
      setUsers((current) => {
        const currentById = new Map(
          current.map((entry) => [String(entry._id), entry]),
        );
        const firstPage = userList.map((entry) =>
          applyPresenceToUser(entry, currentById.get(String(entry._id))),
        );
        if (userSearchTerm === '') cache.set('users', firstPage);
        return firstPage;
      });
      usersCursorRef.current = nextCursor;
      usersHasMoreRef.current = hasMore;
      setUsersHasMore(usersHasMoreRef.current);
      setSelectedUser((current) => {
        if (!current) return current;
        const fresh = userList.find(
          (entry) => String(entry._id) === String(current._id),
        );
        return fresh ? applyPresenceToUser(fresh, current) : current;
      });
    } catch (error) {
      if (requestId !== userListRequestIdRef.current || error.code === 'ERR_CANCELED') {
        return;
      }
      setUsersLoadError(true);
      if (!error.response) serverAvailableRef.current = false;
      else console.error('Failed to fetch users:', error);
    } finally {
      if (requestId === userListRequestIdRef.current) {
        userListRequestRef.current = null;
        setLoading(false);
      }
    }
  }, [api, fetchConversationPreviews, userSearchTerm]);

  useEffect(() => {
    fetchUsersRef.current = fetchUsers;
  }, [fetchUsers]);

  const fetchMoreUsers = useCallback(async () => {
    if (
      userListRequestRef.current ||
      !usersHasMoreRef.current ||
      !usersCursorRef.current
    ) {
      return;
    }
    const requestId = userListRequestIdRef.current;
    const controller = new AbortController();
    userListRequestRef.current = { id: requestId, controller };
    setLoadingMoreUsers(true);
    setUsersLoadError(false);

    try {
      const response = await api.get('/users/recommendations', {
        params: {
          limit: getChatUserPageSize(),
          cursor: usersCursorRef.current,
          search: userSearchTerm,
        },
        signal: controller.signal,
      });
      if (requestId !== userListRequestIdRef.current) return;
      serverAvailableRef.current = true;
      const pageUsers = response.data.users.map((entry) =>
        applyPresenceToUser(
          entry,
          presenceByUserRef.current[String(entry._id)],
        ),
      );
      setUsers((current) => {
        const knownIDs = new Set(current.map((entry) => String(entry._id)));
        const appended = [...current];
        pageUsers.forEach((entry) => {
          const id = String(entry._id);
          if (!knownIDs.has(id)) {
            knownIDs.add(id);
            appended.push(entry);
          }
        });
        if (userSearchTerm === '') cache.set('users', appended);
        return appended;
      });
      usersCursorRef.current = response.data.nextCursor || null;
      usersHasMoreRef.current = Boolean(response.data.hasMore);
      setUsersHasMore(usersHasMoreRef.current);
    } catch (error) {
      if (requestId !== userListRequestIdRef.current || error.code === 'ERR_CANCELED') {
        return;
      }
      setUsersLoadError(true);
      if (!error.response) serverAvailableRef.current = false;
      else console.error('Failed to load more users:', error);
    } finally {
      if (requestId === userListRequestIdRef.current) {
        userListRequestRef.current = null;
        setLoadingMoreUsers(false);
      }
    }
  }, [api, userSearchTerm]);

  const handleUserSearchChange = useCallback((value) => {
    userListRequestRef.current?.controller.abort();
    userListRequestRef.current = null;
    userListRequestIdRef.current += 1;
    usersCursorRef.current = null;
    usersHasMoreRef.current = false;
    setUsersHasMore(false);
    setLoadingMoreUsers(false);
    setUsersLoadError(false);
    setUserSearchTerm(value);
  }, []);

  const retryUsersLoad = useCallback(() => {
    serverAvailableRef.current = true;
    void fetchUsers();
  }, [fetchUsers]);

  const refreshRecommendationOrder = useCallback(async () => {
    if (!currentUserId || !serverAvailableRef.current) return;
    await fetchUsers(Math.max(getChatUserPageSize(), users.length));
  }, [currentUserId, fetchUsers, users.length]);

  // ─── Group helpers ────────────────────────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    const cachedGroups = cache.get('groups');
    if (cachedGroups) setGroups(cachedGroups);

    if (!serverAvailableRef.current && cachedGroups) return;

    try {
      const res = await api.get('/groups');
      serverAvailableRef.current = true;
      const groupList = res.data.groups || [];
      setGroups(groupList);
      cache.set('groups', groupList);
    } catch (error) {
      if (!error.response) serverAvailableRef.current = false;
      else console.error('Failed to fetch groups:', error);
    }
  }, [api]);

  const fetchGroupMessages = useCallback(
    async (groupId) => {
      const cacheKey = `grpmsgs_${groupId}`;
      const cached = cache.get(cacheKey);
      const cachedIdsAtRequest = new Set(
        (cached || []).map((message) => String(message._id)),
      );
      if (cached) setGroupMessages(cached);

      try {
        const res = await api.get(`/groups/${groupId}/messages`);
        const messagesById = new Map(
          (res.data.messages || []).map((message) => [
            String(message._id),
            message,
          ]),
        );
        // A message may arrive over Socket.IO while this history request is in
        // flight. Preserve those newer cached messages instead of replacing
        // them with the older REST snapshot.
        (cache.get(cacheKey) || []).forEach((message) => {
          const id = String(message._id);
          if (
            message._id &&
            !cachedIdsAtRequest.has(id) &&
            !messagesById.has(id)
          ) {
            messagesById.set(id, message);
          }
        });
        const msgs = [...messagesById.values()].sort(
          (first, second) =>
            new Date(first.createdAt).getTime() -
            new Date(second.createdAt).getTime(),
        );
        cache.setMessages(cacheKey, msgs);
        if (String(selectedGroupRef.current?._id) === String(groupId)) {
          setGroupMessages(msgs);
        }
      } catch (error) {
        if (error.response)
          console.error('Failed to fetch group messages:', error);
      }
    },
    [api],
  );

  const upsertGroupLastMessage = useCallback(
    (groupId, message) => {
      if (!message) return;
      const senderId = message.sender?._id || message.sender;
      const content =
        message.messageType === 'voice'
          ? '🎤 Voice message'
          : message.messageType === 'image'
            ? '📷 Photo'
            : message.content || '';
      setGroupLastMessages((prev) => ({
        ...prev,
        [String(groupId)]: {
          content,
          timestamp: message.createdAt || new Date().toISOString(),
          isMine: String(senderId) === String(currentUserId),
          senderName: message.sender?.username || '',
        },
      }));
    },
    [currentUserId],
  );

  // ─── Initial fetch — wait until we have a user ID to avoid a wasted null-ID round-trip
  useEffect(() => {
    if (!currentUserId) return undefined;
    const timer = setTimeout(() => {
      fetchUsersRef.current?.();
    }, userSearchTerm ? 250 : 0);
    return () => clearTimeout(timer);
  }, [currentUserId, userSearchTerm]);

  useEffect(
    () => () => userListRequestRef.current?.controller.abort(),
    [],
  );
  useEffect(() => {
    if (currentUserId) fetchGroups();
  }, [fetchGroups, currentUserId]);

  // ─── Refresh data when server comes back online ───────────────────────────
  useEffect(() => {
    if (!socketConnected) return;
    serverAvailableRef.current = true;
    fetchUsers();
    fetchGroups();
    refreshUnreadCounts();
  }, [socketConnected]); // eslint-disable-line

  // ─── Fetch messages on selection ──────────────────────────────────────────
  useEffect(() => {
    if (selectedUser) fetchMessages(selectedUser._id);
  }, [selectedUser]);

  useEffect(() => {
    if (!socket || !socketConnected) return undefined;

    if (
      isConversationPaneVisible &&
      isPageVisible &&
      selectedUser
    ) {
      socket.emit('active_conversation', {
        conversationType: 'direct',
        conversationId: String(selectedUser._id),
      });
    } else if (
      isConversationPaneVisible &&
      isPageVisible &&
      selectedGroup
    ) {
      socket.emit('active_conversation', {
        conversationType: 'group',
        conversationId: String(selectedGroup._id),
      });
    } else {
      socket.emit('active_conversation', {
        conversationType: '',
        conversationId: '',
      });
    }

    return () => {
      if (socket.connected) {
        socket.emit('active_conversation', {
          conversationType: '',
          conversationId: '',
        });
      }
    };
  }, [
    isConversationPaneVisible,
    isPageVisible,
    selectedGroup,
    selectedUser,
    socket,
    socketConnected,
  ]);

  useEffect(() => {
    if (selectedGroup) fetchGroupMessages(selectedGroup._id);
  }, [selectedGroup]);

  useEffect(() => {
    if (!socket) return;
    const handleMeetingStarted = ({
      groupId,
      meetingId,
      hostId,
      hostName,
      hostAvatar,
    }) => {
      if (
        !groupId ||
        !meetingId ||
        !currentUserId ||
        String(hostId) === String(currentUserId) ||
        activeMeeting?.meetingId === meetingId
      ) {
        return;
      }
      const group = groups.find((item) => String(item._id) === String(groupId));
      setMeetingInvitations((current) => {
        if (current.some((invite) => invite.meetingId === meetingId)) {
          return current.map((invite) =>
            invite.meetingId === meetingId && !invite.group && group
              ? { ...invite, group }
              : invite,
          );
        }
        return [
          ...current,
          { group, groupId, meetingId, hostId, hostName, hostAvatar },
        ];
      });
    };
    const handleMeetingEnded = ({ meetingId }) => {
      setMeetingInvitations((current) =>
        current.filter((invite) => invite.meetingId !== meetingId),
      );
    };
    const syncActiveMeetings = () => socket.emit('group_meeting_sync');
    socket.on('group_meeting_started', handleMeetingStarted);
    socket.on('group_meeting_ended', handleMeetingEnded);
    socket.on('online_users', syncActiveMeetings);
    if (socket.connected) syncActiveMeetings();
    const handleMeetingRejected = ({ meetingId, reason }) => {
      if (activeMeeting?.meetingId === meetingId) {
        setActiveMeeting(null);
        window.alert(reason || 'A meeting is already active for this group.');
      }
    };
    socket.on('group_meeting_start_rejected', handleMeetingRejected);
    return () => {
      socket.off('group_meeting_started', handleMeetingStarted);
      socket.off('group_meeting_ended', handleMeetingEnded);
      socket.off('online_users', syncActiveMeetings);
      socket.off('group_meeting_start_rejected', handleMeetingRejected);
    };
  }, [activeMeeting?.meetingId, currentUserId, groups, socket]);

  useEffect(() => {
    if (groups.length === 0) return;
    setMeetingInvitations((current) => {
      let changed = false;
      const next = current.map((invite) => {
        if (invite.group) return invite;
        const group = groups.find(
          (item) => String(item._id) === String(invite.groupId),
        );
        if (!group) return invite;
        changed = true;
        return { ...invite, group };
      });
      return changed ? next : current;
    });
  }, [groups]);

  useEffect(() => {
    const entries = Object.entries(presenceByUser);
    if (entries.length === 0) return;
    const updates = new Map(entries);
    setUsers((current) =>
      current.map((entry) =>
        applyPresenceToUser(entry, updates.get(String(entry._id))),
      ),
    );
    setSelectedUser((current) =>
      current
        ? applyPresenceToUser(current, updates.get(String(current._id)))
        : current,
    );
    const cached = cache.get('users');
    if (cached) {
      cache.set(
        'users',
        cached.map((entry) =>
          applyPresenceToUser(entry, updates.get(String(entry._id))),
        ),
      );
    }
  }, [presenceByUser]);

  // ─── Sync queued messages when reconnecting ───────────────────────────────
  useEffect(() => {
    if (!isOnline || !socketConnected || !socket) {
      hasSyncedRef.current = false;
      return;
    }
    if (hasSyncedRef.current) return;

    let active = true;
    const retryTimers = [];
    const emitQueuedMessage = (item) => {
      if (item.type === 'dm') {
        socket.emit('send_message', {
          receiverId: item.receiverId,
          content: item.content,
          messageType: item.messageType || 'text',
          clientId: item.tempId,
        });
      } else if (item.type === 'group') {
        socket.emit('send_group_message', {
          groupId: item.groupId,
          content: item.content,
          messageType: item.messageType || 'text',
          clientId: item.tempId,
        });
      }
    };
    const scheduleRetry = (item, attempt) => {
      const delay = Math.min(60_000, 5_000 * 2 ** attempt);
      retryTimers.push(
        window.setTimeout(() => {
          void (async () => {
            if (!active || !socket.connected) return;
            try {
              const current = (await getQueue()).find(
                (queued) => queued.tempId === item.tempId,
              );
              if (!current || current.status !== 'syncing') return;
              await markRetry(
                item.tempId,
                new Error('No server acknowledgement received'),
              );
              await markSyncing(item.tempId);
              emitQueuedMessage(item);
              scheduleRetry(item, (current.attempts || 0) + 1);
            } catch (error) {
              console.error('Could not retry pending message:', error);
            }
          })();
        }, delay),
      );
    };
    hasSyncedRef.current = true;
    const syncQueuedMessages = async () => {
      try {
        const queue = await getQueue();
        if (!active) return;
        if (queue.length === 0) return;

        setMessages((prev) =>
          prev.filter((message) => !message._isOptimistic || Boolean(message._clientId)),
        );
        setGroupMessages((prev) =>
          prev.filter((message) => !message._isOptimistic || Boolean(message._clientId)),
        );

        for (const item of queue) {
          if (!active) return;
          await markSyncing(item.tempId);
          if (item.type !== 'dm' && item.type !== 'group') {
            await markRetry(item.tempId, new Error('Unsupported offline action'));
            continue;
          }
          emitQueuedMessage(item);
          scheduleRetry(item, item.attempts || 0);
        }
      } catch (error) {
        console.error('Could not synchronize pending messages:', error);
        hasSyncedRef.current = false;
      }
    };

    void syncQueuedMessages();
    return () => {
      active = false;
      retryTimers.forEach(window.clearTimeout);
    };
  }, [isOnline, socketConnected, socket, getQueue, markSyncing, markRetry]);

  useEffect(() => {
    if (!selectedUser && !selectedGroup) return undefined;
    let active = true;
    const restoreQueuedMessages = async () => {
      try {
        const queue = await getQueue();
        if (!active) return;

        if (selectedUser) {
          const pendingMessages = queue
            .filter(
              (item) =>
                item.type === 'dm' &&
                String(item.receiverId) === String(selectedUser._id),
            )
            .map((item) => ({
              _id: item.tempId,
              _clientId: item.tempId,
              sender: {
                _id: currentUserId,
                username: user?.username,
                avatar: user?.avatar,
              },
              receiver: { _id: selectedUser._id, username: selectedUser.username },
              content: item.content,
              messageType: item.messageType || 'text',
              status: 'pending',
              createdAt: new Date(item.queuedAt || Date.now()).toISOString(),
              _isOptimistic: true,
            }));
          if (pendingMessages.length) {
            setMessages((previous) => {
              const knownIds = new Set(previous.map((message) => String(message._id)));
              const next = [
                ...previous,
                ...pendingMessages.filter((message) => !knownIds.has(String(message._id))),
              ];
              cache.setMessages(`msgs_${selectedUser._id}`, next);
              return next;
            });
          }
        }

        if (selectedGroup) {
          const pendingMessages = queue
            .filter(
              (item) =>
                item.type === 'group' &&
                String(item.groupId) === String(selectedGroup._id),
            )
            .map((item) => ({
              _id: item.tempId,
              _clientId: item.tempId,
              sender: {
                _id: currentUserId,
                username: user?.username,
                avatar: user?.avatar,
              },
              group: selectedGroup._id,
              content: item.content,
              messageType: item.messageType || 'text',
              status: 'pending',
              createdAt: new Date(item.queuedAt || Date.now()).toISOString(),
              _isOptimistic: true,
            }));
          if (pendingMessages.length) {
            setGroupMessages((previous) => {
              const knownIds = new Set(previous.map((message) => String(message._id)));
              const next = [
                ...previous,
                ...pendingMessages.filter((message) => !knownIds.has(String(message._id))),
              ];
              cache.setMessages(`grpmsgs_${selectedGroup._id}`, next);
              return next;
            });
          }
        }
      } catch (error) {
        console.error('Could not restore pending messages from offline storage:', error);
      }
    };
    void restoreQueuedMessages();
    return () => {
      active = false;
    };
  }, [
    getQueue,
    selectedUser,
    selectedGroup,
    currentUserId,
    user?.username,
    user?.avatar,
  ]);

  // ─── DM socket events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const syncPendingMessages = () => {
      if (
        !socket.connected ||
        !socket.id ||
        pendingSyncSocketIdRef.current === socket.id
      ) {
        return;
      }
      pendingSyncSocketIdRef.current = socket.id;
      socket.emit('sync_pending_messages');
    };
    const handleReceiveMessage = (message) => {
      if (!message?._id || !message.sender?._id) return;
      const senderId = String(message.sender._id);
      const messageId = String(message._id);
      socket.emit('message_delivered', { messageId });
      const cachedMessages = cache.get(`msgs_${senderId}`) || [];
      const wasAlreadyReceived =
        receivedMessageIdsRef.current.has(messageId) ||
        cachedMessages.some(
          (cachedMessage) => String(cachedMessage._id) === messageId,
        );
      if (wasAlreadyReceived) return;
      receivedMessageIdsRef.current.add(messageId);
      if (receivedMessageIdsRef.current.size > 5000) {
        const oldestId = receivedMessageIdsRef.current.values().next().value;
        receivedMessageIdsRef.current.delete(oldestId);
      }
      upsertLastMessage(message);
      refreshRecommendationOrder();
      const isActiveChat =
        isConversationPaneVisible &&
        isPageVisible &&
        selectedUser &&
        String(selectedUser._id) === senderId;

      if (isActiveChat) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          const next = [...prev, message];
          cache.setMessages(`msgs_${senderId}`, next);
          return next;
        });
      }
      if (!isActiveChat) {
        setUnreadCounts((prev) => ({
          ...prev,
          [senderId]: (prev[senderId] || 0) + 1,
        }));
        const rawContent =
          message.messageType === 'voice'
            ? '🎤 Voice message'
            : message.messageType === 'call'
              ? `${message.callType === 'video' ? '📹' : '📞'} ${message.callType === 'video' ? 'Video' : 'Voice'} call`
              : message.messageType === 'image'
                ? '📷 Photo'
                : message.content || '';
        const preview =
          rawContent.length > 80 ? rawContent.slice(0, 80) + '…' : rawContent;
        // OS notification (fires only when tab is not focused — visible even on other websites)
        notify(
          `${message.sender.username}`,
          preview,
          message.sender.avatar || undefined,
        );
        // Update cache for non-active conversations too
      }
      if (!isActiveChat) {
        const cacheKey = `msgs_${senderId}`;
        const cached = cache.get(cacheKey) || [];
        if (!cached.some((m) => m._id === message._id)) {
          cache.setMessages(cacheKey, [...cached, message]);
        }
      }
    };

    const handleMessageSent = (message) => {
      if (message?.clientId) void acknowledge(String(message.clientId));
      playSendSound();
      const groupId = message.groupId || message.group?._id || message.group;
      if (groupId) {
        upsertGroupLastMessage(groupId, message);
        if (selectedGroup && String(groupId) === String(selectedGroup._id)) {
          setGroupMessages((prev) => {
            const next = reconcileServerMessage(prev, message);
            if (next === prev) return prev;
            cache.setMessages(`grpmsgs_${groupId}`, next);
            return next;
          });
        }
        return;
      }
      upsertLastMessage(message);
      refreshRecommendationOrder();
      if (selectedUser) {
        const receiverId =
          typeof message.receiver === 'object'
            ? message.receiver?._id
            : message.receiver;
        const expectedReceiverId = String(selectedUser._id);
        setMessages((prev) => {
          const hasMatchingOptimisticMessage =
            message.clientId &&
            prev.some(
              (item) => String(item._clientId || item._id) === String(message.clientId),
            );
          if (
            String(receiverId || '') !== expectedReceiverId &&
            !hasMatchingOptimisticMessage
          ) {
            return prev;
          }
          // Replaces the optimistic placeholder that shares this message's
          // clientId and swallows duplicate deliveries (see messageMedia).
          const next = reconcileServerMessage(prev, message);
          if (next === prev) return prev;
          cache.setMessages(`msgs_${selectedUser._id}`, next);
          return next;
        });
      }
    };

    const handleMessageDelivered = ({ messageId, receiverId, deliveredAt }) => {
      const partnerId = String(receiverId);
      setLastMessages((prev) => {
        const entry = prev[partnerId];
        if (!entry || entry.messageId !== String(messageId)) return prev;
        if (entry.status === 'read') return prev;
        const next = {
          ...prev,
          [partnerId]: { ...entry, status: 'delivered', deliveredAt },
        };
        cache.set('last_messages', next);
        return next;
      });
      const cached = cache.get('last_messages') || {};
      if (
        cached[partnerId]?.messageId === String(messageId) &&
        cached[partnerId]?.status !== 'read'
      ) {
        cache.set('last_messages', {
          ...cached,
          [partnerId]: { ...cached[partnerId], status: 'delivered', deliveredAt },
        });
      }
      const cachedMessages = cache.get(`msgs_${partnerId}`);
      if (cachedMessages) {
        cache.setMessages(
          `msgs_${partnerId}`,
          cachedMessages.map((message) =>
            String(message._id) === String(messageId) &&
            message.status !== 'read'
              ? { ...message, status: 'delivered', deliveredAt }
              : message,
          ),
        );
      }
      setMessages((prev) =>
        prev.map((message) =>
          String(message._id) === String(messageId) &&
          message.status !== 'read'
            ? { ...message, status: 'delivered', deliveredAt }
            : message,
        ),
      );
    };

    const handleMessagesRead = ({ messageIds, userId, readAt }) => {
      const partnerId = String(userId);
      setLastMessages((prev) => {
        const entry = prev[partnerId];
        if (!entry || !messageIds.map(String).includes(String(entry.messageId))) {
          return prev;
        }
        const next = {
          ...prev,
          [partnerId]: { ...entry, status: 'read', readAt },
        };
        cache.set('last_messages', next);
        return next;
      });
      const ids = new Set(messageIds.map(String));
      const cachedMessages = cache.get(`msgs_${partnerId}`);
      if (cachedMessages) {
        cache.setMessages(
          `msgs_${partnerId}`,
          cachedMessages.map((message) =>
            ids.has(String(message._id))
              ? { ...message, status: 'read', readAt }
              : message,
          ),
        );
      }
      setMessages((prev) =>
        prev.map((m) =>
          ids.has(String(m._id))
            ? { ...m, status: 'read', readAt }
            : m,
        ),
      );
    };

    const handleMessageEdited = (updated) => {
      setMessages((prev) => {
        const next = prev.map((m) =>
          String(m._id) === String(updated._id) ? { ...m, ...updated } : m,
        );
        if (selectedUser) cache.setMessages(`msgs_${selectedUser._id}`, next);
        return next;
      });
      upsertLastMessage(updated);
    };

    const handleMessageDeleted = ({ messageId, permanent = false }) => {
      setMessages((prev) => {
        const next = permanent
          ? prev.filter((m) => String(m._id) !== String(messageId))
          : prev.map((m) =>
              String(m._id) === String(messageId)
                ? {
                    ...m,
                    isDeleted: true,
                    content: 'This message was deleted',
                    status: 'deleted',
                  }
                : m,
            );
        if (selectedUser) cache.setMessages(`msgs_${selectedUser._id}`, next);
        return next;
      });
      if (permanent && selectedUser) {
        setLastMessages((prev) => {
          const partnerId = String(selectedUser._id);
          if (prev[partnerId]?.messageId !== String(messageId)) return prev;
          const next = { ...prev };
          delete next[partnerId];
          cache.set('last_messages', next);
          return next;
        });
      }
    };

    const handleMessageHidden = ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    };

    const handleConversationDeleted = ({ userId }) => {
      const partnerId = String(userId);
      setLastMessages((prev) => {
        const next = { ...prev };
        delete next[partnerId];
        cache.set('last_messages', next);
        return next;
      });
      setUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[partnerId];
        return next;
      });
      cache.set(`msgs_${partnerId}`, []);

      if (selectedUser && String(selectedUser._id) === partnerId) {
        setMessages([]);
      }
    };

    const handleMessageError = (error = {}) => {
      const message =
        typeof error?.message === 'string'
          ? error.message
          : 'Message could not be sent';
      void getQueue().then((queue) =>
        Promise.all(
          queue
            .filter((item) => item.status === 'syncing')
            .map((item) => markRetry(item.tempId, new Error(message))),
        ),
      ).catch((error) => {
        console.error('Could not update failed offline messages:', error);
      });
      setNotifications((prev) => [
        {
          id: Date.now(),
          type: 'message_error',
          text: message,
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('connect', syncPendingMessages);
    syncPendingMessages();
    socket.on('message_sent', handleMessageSent);
    socket.on('message_delivered', handleMessageDelivered);
    socket.on('messages_read', handleMessagesRead);
    socket.on('message_edited', handleMessageEdited);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_hidden', handleMessageHidden);
    socket.on('conversation_deleted', handleConversationDeleted);
    socket.on('message_error', handleMessageError);
    socket.on('error', handleMessageError);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('connect', syncPendingMessages);
      socket.off('message_sent', handleMessageSent);
      socket.off('message_delivered', handleMessageDelivered);
      socket.off('messages_read', handleMessagesRead);
      socket.off('message_edited', handleMessageEdited);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_hidden', handleMessageHidden);
      socket.off('conversation_deleted', handleConversationDeleted);
      socket.off('message_error', handleMessageError);
      socket.off('error', handleMessageError);
    };
  }, [
    socket,
    acknowledge,
    getQueue,
    markRetry,
    upsertGroupLastMessage,
    selectedUser,
    upsertLastMessage,
    refreshRecommendationOrder,
    fetchUsers,
    isConversationPaneVisible,
    isPageVisible,
  ]);

  // ─── Group socket events ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleReceiveGroupMessage = (message) => {
      const gid = message.groupId || message.group;
      const groupCacheKey = `grpmsgs_${gid}`;
      const cachedGroupMessages = cache.get(groupCacheKey) || [];
      const wasAlreadyReceived = cachedGroupMessages.some(
        (cachedMessage) => String(cachedMessage._id) === String(message._id),
      );
      upsertGroupLastMessage(gid, message);
      const senderId =
        typeof message.sender === 'object'
          ? message.sender?._id
          : message.sender;
      const isOwnMessage = String(senderId) === String(currentUserId);
      if (message.messageType !== 'meeting') {
        if (isOwnMessage) playSendSound();
      }
      const isActiveGroup =
        isConversationPaneVisible &&
        isPageVisible &&
        selectedGroup &&
        String(selectedGroup._id) === String(gid);

      if (isActiveGroup) {
        setGroupMessages((prev) => {
          // Same reconciliation as DMs: the sender's own media bubble (matched by
          // clientId) is replaced in place instead of being duplicated.
          const next = reconcileServerMessage(prev, message);
          if (next === prev) return prev;
          cache.setMessages(`grpmsgs_${gid}`, next);
          return next;
        });
      } else if (!isOwnMessage) {
        if (!wasAlreadyReceived) {
          setGroupUnreadCounts((prev) => ({
            ...prev,
            [String(gid)]: (prev[String(gid)] || 0) + 1,
          }));
          const group = groups.find((g) => String(g._id) === String(gid));
          const rawContent =
            message.messageType === 'meeting'
              ? 'Group voice meeting ended'
              : message.messageType === 'voice'
                ? '🎤 Voice message'
                : message.messageType === 'image'
                  ? '📷 Photo'
                  : message.content || '';
          const preview =
            rawContent.length > 60 ? rawContent.slice(0, 60) + '…' : rawContent;
          notify(
            `${message.sender.username} in ${group?.name || 'Group'}`,
            preview,
            message.sender.avatar || undefined,
          );
        }
        if (!wasAlreadyReceived) {
          cache.setMessages(groupCacheKey, [...cachedGroupMessages, message]);
        }
      } else {
        if (!wasAlreadyReceived) {
          cache.setMessages(groupCacheKey, [...cachedGroupMessages, message]);
        }
      }

      setGroups((prev) =>
        prev.map((g) =>
          String(g._id) === String(gid)
            ? { ...g, lastMessageAt: message.createdAt }
            : g,
        ),
      );
    };

    const handleGroupCreated = (group) => {
      setGroups((prev) => {
        if (prev.some((g) => g._id === group._id)) return prev;
        return [group, ...prev];
      });
      socket.emit('join_group', { groupId: group._id });
    };

    const handleGroupUpdated = (group) => {
      setGroups((prev) => prev.map((g) => (g._id === group._id ? group : g)));
      if (selectedGroup?._id === group._id) setSelectedGroup(group);
    };

    const handleGroupRemoved = ({ groupId }) => {
      setGroups((prev) =>
        prev.filter((g) => String(g._id) !== String(groupId)),
      );
      if (selectedGroup && String(selectedGroup._id) === String(groupId)) {
        setSelectedGroup(null);
        setGroupMessages([]);
      }
    };

    const handleGroupDeleted = ({ groupId }) => handleGroupRemoved({ groupId });

    const handleAddedToGroup = ({ group, addedBy }) => {
      setNotifications((prev) => [
        {
          id: Date.now(),
          type: 'added_to_group',
          text: `You were added to "${group.name}" by ${addedBy.username}`,
          groupId: group._id,
          groupName: group.name,
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
      fetchGroups();
    };

    const handleGroupRemovedNotif = ({ groupId }) => {
      const group = groups.find((g) => String(g._id) === String(groupId));
      setNotifications((prev) => [
        {
          id: Date.now(),
          type: 'removed_from_group',
          text: `You were removed from "${group?.name || 'a group'}"`,
          groupId,
          groupName: group?.name || '',
          timestamp: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    };

    socket.on('receive_group_message', handleReceiveGroupMessage);
    socket.on('group_created', handleGroupCreated);
    socket.on('group_updated', handleGroupUpdated);
    socket.on('group_removed', (data) => {
      handleGroupRemoved(data);
      handleGroupRemovedNotif(data);
    });
    socket.on('group_deleted', handleGroupDeleted);
    socket.on('user_added_to_group', handleAddedToGroup);

    return () => {
      socket.off('receive_group_message', handleReceiveGroupMessage);
      socket.off('group_created', handleGroupCreated);
      socket.off('group_updated', handleGroupUpdated);
      socket.off('group_removed', handleGroupRemoved);
      socket.off('group_deleted', handleGroupDeleted);
      socket.off('user_added_to_group', handleAddedToGroup);
    };
  }, [
    socket,
    selectedGroup,
    upsertGroupLastMessage,
    groups,
    currentUserId,
    playSendSound,
    isConversationPaneVisible,
    isPageVisible,
  ]);

  // ─── Incoming call listener ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handleIncoming = (data) => setIncomingCall(data);
    socket.on('incoming_call', handleIncoming);
    return () => socket.off('incoming_call', handleIncoming);
  }, [socket]);

  // ─── DM actions ───────────────────────────────────────────────────────────
  const fetchMessages = async (userId, page = 1) => {
    const cacheKey = `msgs_${userId}`;
    const cachedIdsAtRequest = new Set(
      (cache.get(cacheKey) || []).map((message) => String(message._id)),
    );
    if (page === 1) {
      const cached = cache.get(cacheKey);
      if (cached) {
        setMessages(cached);
        setLoadingMessages(false);
      } else {
        setLoadingMessages(true);
      }
    }

    try {
      const response = await api.get(
        `/messages/${userId}?page=${page}&limit=50`,
      );
      const messageList = response.data.messages || [];

      if (page === 1) {
        const messagesById = new Map(
          messageList.map((message) => [String(message._id), message]),
        );
        (cache.get(cacheKey) || []).forEach((cachedMessage) => {
          const id = String(cachedMessage._id);
          const fetchedMessage = messagesById.get(id);
          if (!fetchedMessage) {
            if (!cachedIdsAtRequest.has(id)) {
              messagesById.set(id, cachedMessage);
            }
            return;
          }
          if (
            (DELIVERY_STATUS_RANK[cachedMessage.status] || 0) >
            (DELIVERY_STATUS_RANK[fetchedMessage.status] || 0)
          ) {
            messagesById.set(id, {
              ...fetchedMessage,
              status: cachedMessage.status,
              deliveredAt: cachedMessage.deliveredAt,
              readAt: cachedMessage.readAt,
            });
          }
        });
        const mergedMessages = [...messagesById.values()].sort(
          (first, second) =>
            new Date(first.createdAt).getTime() -
            new Date(second.createdAt).getTime(),
        );
        setMessages(mergedMessages);
        cache.setMessages(cacheKey, mergedMessages);
        setMessagesPage(1);
        if (mergedMessages.length > 0) {
          upsertLastMessage(mergedMessages[mergedMessages.length - 1]);
        }
      } else {
        setMessages((prev) => [...messageList, ...prev]);
        setMessagesPage(page);
      }
      setHasMoreMessages(response.data.hasMore ?? false);
    } catch (error) {
      // Network error expected when offline — cached messages already loaded above
      if (error.response) console.error('Failed to fetch messages:', error);
    } finally {
      if (page === 1) setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!socket || !selectedUser) return undefined;
    const refreshMessagesAfterReconnect = () => {
      void fetchMessages(selectedUser._id, 1);
    };
    socket.on('connect', refreshMessagesAfterReconnect);
    return () => socket.off('connect', refreshMessagesAfterReconnect);
  }, [socket, selectedUser?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlderMessages = useCallback(async () => {
    if (!selectedUser || !hasMoreMessages || loadingMoreMessages) return;
    setLoadingMoreMessages(true);
    try {
      await fetchMessages(selectedUser._id, messagesPage + 1);
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [selectedUser, hasMoreMessages, loadingMoreMessages, messagesPage]);

  const sendMessage = (content, messageType = 'text') => {
    if (!selectedUser) return;

    // Queue if device is offline OR server/socket is not connected
    if (!socket?.connected) {
      // Optimistic placeholder shown immediately; queued for later sync.
      // Photos and voice notes never take this path — see sendMediaMessage.
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const tempMsg = {
        _id: tempId,
        _clientId: tempId,
        sender: {
          _id: currentUserId,
          username: user?.username,
          avatar: user?.avatar,
        },
        receiver: { _id: selectedUser._id, username: selectedUser.username },
        content,
        messageType,
        status: 'pending',
        createdAt: new Date().toISOString(),
        _isOptimistic: true,
      };
      setMessages((prev) => [...prev, tempMsg]);
      upsertLastMessage(tempMsg);
      void enqueue({
        type: 'dm',
        receiverId: selectedUser._id,
        content,
        messageType,
        tempId,
      }).catch((error) => {
        console.error('Could not save the message for offline delivery:', error);
        setMessages((prev) => prev.filter((message) => message._id !== tempId));
        const cacheKey = `msgs_${selectedUser._id}`;
        cache.setMessages(
          cacheKey,
          (cache.get(cacheKey) || []).filter((message) => message._id !== tempId),
        );
      });
      cache.setMessages(
        `msgs_${selectedUser._id}`,
        [...(cache.get(`msgs_${selectedUser._id}`) || []), tempMsg],
      );
      return;
    }

    const clientId = buildClientId('text');
    const optimisticMessage = {
      _id: clientId,
      _clientId: clientId,
      _isOptimistic: true,
      _uploadState: 'sending',
      sender: {
        _id: currentUserId,
        username: user?.username,
        avatar: user?.avatar,
      },
      receiver: { _id: selectedUser._id, username: selectedUser.username },
      content,
      messageType,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => {
      const next = [...prev, optimisticMessage];
      cache.setMessages(`msgs_${selectedUser._id}`, next);
      return next;
    });
    upsertLastMessage(optimisticMessage);

    socket.emit('send_message', {
      receiverId: selectedUser._id,
      content,
      messageType,
      clientId,
    });
  };

  const sendGroupMessage = (content, messageType = 'text') => {
    if (!selectedGroup) return;

    if (!socket?.connected) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const tempMsg = {
        _id: tempId,
        _clientId: tempId,
        sender: {
          _id: currentUserId,
          username: user?.username,
          avatar: user?.avatar,
        },
        group: selectedGroup._id,
        content,
        messageType,
        status: 'pending',
        createdAt: new Date().toISOString(),
        _isOptimistic: true,
      };
      setGroupMessages((prev) => [...prev, tempMsg]);
      upsertGroupLastMessage(selectedGroup._id, tempMsg);
      void enqueue({
        type: 'group',
        groupId: selectedGroup._id,
        content,
        messageType,
        tempId,
      }).catch((error) => {
        console.error('Could not save the group message for offline delivery:', error);
        setGroupMessages((prev) => prev.filter((message) => message._id !== tempId));
        const cacheKey = `grpmsgs_${selectedGroup._id}`;
        cache.setMessages(
          cacheKey,
          (cache.get(cacheKey) || []).filter((message) => message._id !== tempId),
        );
      });
      cache.setMessages(
        `grpmsgs_${selectedGroup._id}`,
        [...(cache.get(`grpmsgs_${selectedGroup._id}`) || []), tempMsg],
      );
      return;
    }

    const clientId = buildClientId('text');
    const optimisticMessage = {
      _id: clientId,
      _clientId: clientId,
      _isOptimistic: true,
      _uploadState: 'sending',
      sender: {
        _id: currentUserId,
        username: user?.username,
        avatar: user?.avatar,
      },
      group: selectedGroup._id,
      content,
      messageType,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    setGroupMessages((prev) => {
      const next = [...prev, optimisticMessage];
      cache.setMessages(`grpmsgs_${selectedGroup._id}`, next);
      return next;
    });
    upsertGroupLastMessage(selectedGroup._id, optimisticMessage);

    socket.emit('send_group_message', {
      groupId: selectedGroup._id,
      content,
      messageType,
      clientId,
    });
  };

  // ─── Optimistic media sends (photos & voice notes) ────────────────────────
  //
  // A media message is rendered the instant the user hits send, from a local
  // blob: URL, while the upload runs in the background. The bubble shows pending
  // / progress / failed states, and once the server confirms the message —
  // echoing back the same clientId — the local copy is replaced in place by
  // `reconcileServerMessage`, so the media never renders twice. Previews live
  // only in memory and their blob URLs are revoked as soon as no message
  // references them.

  /** True when the conversation an upload belongs to is the one on screen. */
  const isActiveConversation = useCallback((isGroup, targetId) => {
    const active = isGroup ? selectedGroupRef.current : selectedUserRef.current;
    return String(active?._id) === String(targetId);
  }, []);

  /** Applies a state updater to the DM or the group message list. */
  const applyToConversation = useCallback((isGroup, updater) => {
    if (isGroup) setGroupMessages(updater);
    else setMessages(updater);
  }, []);

  /** Uploads the media behind an optimistic bubble and reconciles the result. */
  const runMediaUpload = useCallback(
    async (clientId) => {
      const pending = pendingUploadsRef.current.get(clientId);
      if (!pending || activeUploadsRef.current.has(clientId)) return;
      const { kind, blob, duration, isGroup, targetId, viewOnce } = pending;
      const canSend = navigator.onLine && (kind !== 'image' || socket?.connected);
      if (!canSend) {
        applyToConversation(isGroup, (prev) =>
          patchOptimisticMessage(prev, clientId, {
            _uploadState: 'pending',
            _uploadError: 'Waiting for connection…',
          }),
        );
        return;
      }
      activeUploadsRef.current.add(clientId);

      const patch = (data) =>
        applyToConversation(isGroup, (prev) =>
          patchOptimisticMessage(prev, clientId, data),
        );

      patch({ _uploadState: 'uploading', _uploadProgress: 0, _uploadError: '' });

      try {
        if (kind === 'image') {
          if (!socket?.connected) {
            throw new Error('You are offline. Reconnect to send this photo.');
          }

          // Photos go straight to B2; the server first learns about the
          // message once the real URL exists, then replies with the persisted
          // message carrying this clientId.
          const serverUrl = await uploadMessageImage(blob, token, (percent) =>
            patch({ _uploadProgress: percent }),
          );

          if (isGroup) {
            socket.emit('send_group_message', {
              groupId: targetId,
              content: serverUrl,
              messageType: 'image',
              clientId,
            });
          } else {
            socket.emit('send_message', {
              receiverId: targetId,
              content: serverUrl,
              messageType: 'image',
              clientId,
              viewOnce: viewOnce === true,
            });
          }

          // Keep the local image marked as sending until the server echoes the
          // persisted message back with this clientId.
          patch({ _uploadState: 'sending' });
        } else {
          if (kind === 'file') {
            const message = await uploadMessageFile({
              file: blob,
              receiverId: isGroup ? undefined : targetId,
              groupId: isGroup ? targetId : undefined,
              clientId,
              token,
              onUploadProgress: (percent) => patch({ _uploadProgress: percent }),
            });
            if (isActiveConversation(isGroup, targetId)) {
              applyToConversation(isGroup, (prev) =>
                reconcileServerMessage(prev, message),
              );
            }
            pendingUploadsRef.current.delete(clientId);
            activeUploadsRef.current.delete(clientId);
            return;
          }
          const message = await uploadVoiceMessage({
            blob,
            duration,
            receiverId: isGroup ? undefined : targetId,
            groupId: isGroup ? targetId : undefined,
            clientId,
            token,
            viewOnce: !isGroup && viewOnce === true,
            onUploadProgress: (percent) => patch({ _uploadProgress: percent }),
          });

          // The POST response is authoritative — merge it even if the socket
          // event is missed. The socket copy is then dropped as a duplicate.
          if (isActiveConversation(isGroup, targetId)) {
            applyToConversation(isGroup, (prev) =>
              reconcileServerMessage(prev, message),
            );
          }
        }

        pendingUploadsRef.current.delete(clientId);
        activeUploadsRef.current.delete(clientId);
      } catch (error) {
        activeUploadsRef.current.delete(clientId);
        if (
          !navigator.onLine ||
          (kind === 'image' && !socket?.connected)
        ) {
          patch({
            _uploadState: 'pending',
            _uploadError: 'Waiting for connection…',
          });
          return;
        }
        patch({
          _uploadState: 'failed',
          _uploadError: describeUploadError(
            error,
            kind === 'image'
              ? 'Photo upload failed.'
              : 'Voice message upload failed.',
          ),
        });
      }
    },
    [applyToConversation, isActiveConversation, socket, token],
  );

  useEffect(() => {
    if (!isOnline) return;
    pendingUploadsRef.current.forEach((_, clientId) => {
      runMediaUpload(clientId);
    });
  }, [isOnline, socketConnected, runMediaUpload]);

  /**
   * Renders a media message immediately and starts uploading in the background.
   * Media is never written to the offline queue — binary payloads cannot be
   * persisted there — so a failed send stays on screen with its local preview
   * and can be retried once the connection is back.
   */
  const sendMediaMessage = useCallback(
    ({ kind, blob, duration = 0, viewOnce = false }) => {
      const isGroup = !selectedUser && !!selectedGroup;
      const target = isGroup ? selectedGroup : selectedUser;
      if (!blob || !target) return null;

      const targetId = target._id;
      const clientId = buildClientId(kind);
      const messageType =
        kind === 'image' ? 'image' : kind === 'file' ? 'file' : 'voice';
      const localUrl = createPreviewUrl(blob);

      pendingUploadsRef.current.set(clientId, {
        kind,
        blob,
        duration,
        fileName: blob.name || '',
        fileSize: blob.size || 0,
        isGroup,
        targetId,
        viewOnce: !isGroup && viewOnce === true,
      });

      const optimistic = createOptimisticMediaMessage({
        clientId,
        messageType,
        localUrl,
        duration,
        fileName: blob.name || '',
        fileSize: blob.size || 0,
        viewOnce: !isGroup && viewOnce === true,
        sender: user,
        receiver: isGroup ? null : selectedUser,
        group: isGroup ? targetId : null,
      });

      if (isGroup) {
        setGroupMessages((prev) => [...prev, optimistic]);
        upsertGroupLastMessage(targetId, optimistic);
      } else {
        setMessages((prev) => [...prev, optimistic]);
        upsertLastMessage(optimistic);
      }

      if (isOnline && (messageType === 'voice' || socket?.connected)) {
        runMediaUpload(clientId);
      }
      return clientId;
    },
    [
      createPreviewUrl,
      runMediaUpload,
      selectedGroup,
      selectedUser,
      isOnline,
      socket,
      upsertGroupLastMessage,
      upsertLastMessage,
      user,
    ],
  );

  /** Retries a failed upload from the bubble, reusing its local preview. */
  const retryMediaUpload = useCallback(
    (message) => {
      const clientId = message?._clientId;
      if (!clientId || !pendingUploadsRef.current.has(clientId)) return;
      runMediaUpload(clientId);
    },
    [runMediaUpload],
  );

  /** Drops a failed upload together with its local preview. */
  const discardMediaUpload = useCallback(
    (message) => {
      const clientId = message?._clientId;
      if (!clientId) return;

      pendingUploadsRef.current.delete(clientId);
      [message._localUrl, message.content, message.audioUrl]
        .filter(isLocalPreviewUrl)
        .forEach((url) => releasePreviewUrl(url));

      applyToConversation(!!message.group, (prev) =>
        removeOptimisticMessage(prev, clientId),
      );
    },
    [applyToConversation, releasePreviewUrl],
  );

  const handleMessageUpdate = useCallback(
    (updated) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === updated._id ? updated : m)),
      );
      upsertLastMessage(updated);
      fetchUsers();
    },
    [upsertLastMessage, fetchUsers],
  );

  const handleMessageDelete = useCallback(
    (messageId) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? {
                ...m,
                isDeleted: true,
                content: 'This message was deleted',
                status: 'deleted',
              }
            : m,
        ),
      );
      fetchUsers();
    },
    [fetchUsers],
  );

  const handleMessageHide = useCallback((messageId) => {
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  }, []);

  const handleUserBlocked = useCallback(
    (blockedUserId) => {
      setUsers((prev) => prev.filter((u) => u._id !== blockedUserId));
      if (selectedUser?._id === blockedUserId) {
        setSelectedUser(null);
        setMessages([]);
      }
      fetchUsers();
    },
    [selectedUser, fetchUsers],
  );

  const handleListUserAction = useCallback(
    async (user, action) => {
      if (!user?._id) return;
      const labels = {
        delete: 'remove this person from your chat list',
        lock: 'lock this chat',
        block: 'block this user',
        mute: 'mute this user',
      };
      if (!window.confirm(`Are you sure you want to ${labels[action]}?`)) return;

      try {
        if (action === 'delete') {
          await api.delete(`/users/${user._id}/chats`);
        } else if (action === 'mute') {
          await api.post(`/users/${user._id}/mute`);
        } else {
          await api.post(`/users/${user._id}/block`);
        }
        setUsers((prev) => prev.filter((entry) => entry._id !== user._id));
        setLastMessages((prev) => {
          const next = { ...prev };
          delete next[String(user._id)];
          cache.set('last_messages', next);
          return next;
        });
        if (selectedUser?._id === user._id) {
          setSelectedUser(null);
          setMessages([]);
        }
      } catch (error) {
        window.alert(
          error.response?.data?.message || `Failed to ${action} user`,
        );
      }
    },
    [api, selectedUser],
  );

  const handleTyping = (userId, isTyping) => emitTyping(userId, isTyping);
  const handleGroupTyping = (groupId, isTyping) =>
    emitGroupTyping(groupId, isTyping);

  const handleForwardMessage = useCallback(
    async (message, recipients) => {
      if (!socket) return;
      if (message.messageType === 'voice') {
        const token = localStorage.getItem('token');
        await axios
          .post(
            `${API_URL}/messages/voice/${message._id}/forward`,
            { recipients },
            { headers: { Authorization: `Bearer ${token}` } },
          )
          .catch((err) => console.error('Voice forward error:', err));
        return;
      }
      recipients.forEach(({ type, id }) => {
        if (type === 'u') {
          socket.emit('send_message', {
            receiverId: id,
            content: message.content,
            isForwarded: true,
          });
        } else {
          socket.emit('send_group_message', {
            groupId: id,
            content: message.content,
            isForwarded: true,
          });
        }
      });
    },
    [socket],
  );

  // ─── Group actions ────────────────────────────────────────────────────────
  const handleGroupCreated = useCallback(
    (group) => {
      setGroups((prev) => {
        if (prev.some((g) => g._id === group._id)) return prev;
        return [group, ...prev];
      });
      if (socket) socket.emit('join_group', { groupId: group._id });
      setSelectedGroup(group);
      setSelectedUser(null);
      setGroupMessages([]);
    },
    [socket],
  );

  const handleGroupUpdated = useCallback(
    (group) => {
      setGroups((prev) => prev.map((g) => (g._id === group._id ? group : g)));
      if (selectedGroup?._id === group._id) setSelectedGroup(group);
    },
    [selectedGroup],
  );

  const handleGroupLeft = useCallback(
    (groupId) => {
      setGroups((prev) =>
        prev.filter((g) => String(g._id) !== String(groupId)),
      );
      if (selectedGroup && String(selectedGroup._id) === String(groupId)) {
        setSelectedGroup(null);
        setGroupMessages([]);
      }
    },
    [selectedGroup],
  );

  const handleLeaveGroupFromList = useCallback(
    async (group) => {
      try {
        const creatorId =
          typeof group.createdBy === 'object'
            ? group.createdBy?._id
            : group.createdBy;
        const isCreator = String(creatorId) === String(currentUserId);
        if (isCreator) {
          await api.delete(`/groups/${group._id}`);
        } else {
          await api.post(`/groups/${group._id}/leave`);
        }
        handleGroupLeft(group._id);
        setGroups((prev) => {
          const next = prev.filter(
            (entry) => String(entry._id) !== String(group._id),
          );
          cache.set('groups', next);
          return next;
        });
      } catch (error) {
        window.alert(error.response?.data?.message || 'Failed to leave group');
      }
    },
    [api, currentUserId, handleGroupLeft],
  );

  const handleGroupDeleted = handleGroupLeft;

  const handleSelectGroup = (group) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSelectedGroup(group);
    setSelectedUser(null);
    setMessages([]);
    if (group) {
      setMobileView('chat');
    }
  };

  const handleSelectUser = (u) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSelectedUser(u);
    setSelectedGroup(null);
    setGroupMessages([]);
    setHasMoreMessages(false);
    setMessagesPage(1);
    if (u) {
      setMobileView('chat');
    }
  };

  useEffect(() => {
    const handlePushClick = (event) => {
      if (event.data?.type === 'push-notification-click') {
        setPushTarget(event.data.payload);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handlePushClick);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('conversationId')) {
      setPushTarget({
        conversationId: params.get('conversationId'),
        conversationType: params.get('conversationType'),
        messageId: params.get('messageId'),
        meetingId: params.get('meetingId'),
      });
    }
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handlePushClick);
    };
  }, []);

  useEffect(() => {
    if (!pushTarget?.conversationId || pushTarget.ready) return;
    const conversationId = String(pushTarget.conversationId);
    if (pushTarget.conversationType === 'group') {
      const group = groups.find((item) => String(item._id) === conversationId);
      if (group) {
        handleSelectGroup(group);
        if (pushTarget.meetingId) {
          socket?.emit('group_meeting_sync');
        }
        setPushTarget((current) => ({ ...current, ready: true }));
      }
      return;
    }
    const userTarget = users.find((item) => String(item._id) === conversationId);
    if (userTarget) {
      handleSelectUser(userTarget);
      setPushTarget((current) => ({ ...current, ready: true }));
    }
  }, [pushTarget, users, groups, socket]);

  useEffect(() => {
    if (!selectedUser && !selectedGroup) setMobileView('sidebar');
  }, [selectedUser, selectedGroup]);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div
      ref={chatViewportRef}
      className='fixed inset-x-0 top-0 flex h-screen flex-col overflow-hidden bg-white'
    >
      <OfflineBanner isOnline={isOnline} />

      <div className='flex flex-1 min-h-0 overflow-hidden'>
        {/* ── Sidebar ── */}
        <div
          className={`h-full min-h-0 flex-shrink-0 ${mobileView === 'chat' ? 'hidden md:block' : 'block w-full md:w-auto'}`}
        >
          <ChatSidebar
            users={users}
            groups={groups}
            currentUser={user}
            selectedUser={selectedUser}
            selectedGroup={selectedGroup}
            onSelectUser={handleSelectUser}
            onSelectGroup={handleSelectGroup}
            onGroupCreated={handleGroupCreated}
            onLogout={handleLogout}
            onDeleteUser={(user) => handleListUserAction(user, 'delete')}
            onMuteUser={(user) => handleListUserAction(user, 'mute')}
            onBlockUser={(user) => handleListUserAction(user, 'block')}
            onExitGroup={handleLeaveGroupFromList}
            onMuteGroup={handleLeaveGroupFromList}
            isUserOnline={isUserOnline}
            isUserTyping={isUserTyping}
            loading={loading}
            lastMessages={lastMessages}
            groupLastMessages={groupLastMessages}
            groupTypingUsers={groupTypingUsers}
            unreadCounts={unreadCounts}
            groupUnreadCounts={groupUnreadCounts}
            onUserSearchChange={handleUserSearchChange}
            onLoadMoreUsers={fetchMoreUsers}
            usersHasMore={usersHasMore}
            loadingMoreUsers={loadingMoreUsers}
            usersLoadError={usersLoadError}
            onRetryLoadMoreUsers={retryUsersLoad}
            notifications={notifications}
            onMarkAllNotificationsRead={() =>
              setNotifications((prev) =>
                prev.map((n) => ({ ...n, read: true })),
              )
            }
            onClearAllNotifications={() => setNotifications([])}
            onNotificationRead={(notificationId) =>
              setNotifications((prev) =>
                prev.map((notification) => (
                  notification.id === notificationId
                    ? { ...notification, read: true }
                    : notification
                )),
              )
            }
            openCreateGroup={openCreateGroup}
          />
        </div>

        {/* ── Chat Window ── */}
        <div
          className={`flex-1 min-w-0 min-h-0 flex-col overflow-hidden ${mobileView === 'sidebar' ? 'hidden md:flex' : 'flex'}`}
        >
          <ChatWindow
            key={
              selectedGroup
                ? `group:${selectedGroup._id}`
                : selectedUser
                  ? `user:${selectedUser._id}`
                  : 'empty'
            }
            onBack={() => setMobileView('sidebar')}
            // DM
            selectedUser={selectedUser}
            isConversationVisible={
              isConversationPaneVisible &&
              isPageVisible &&
              Boolean(selectedUser || selectedGroup)
            }
            messages={messages}
            setMessages={setMessages}
            currentUser={user}
            onSendMessage={sendMessage}
            isUserOnline={isUserOnline}
            isUserTyping={isUserTyping}
            isUserRecording={isUserRecording}
            groupRecordingUsers={groupRecordingUsers}
            onTyping={handleTyping}
            onMessageUpdate={handleMessageUpdate}
            onMessageDelete={handleMessageDelete}
            onMessageHide={handleMessageHide}
            onUserBlocked={handleUserBlocked}
            onUserMuted={() => {}}
            onChatDeleted={(userId) => {
              if (selectedUser?._id === userId) setMessages([]);
              fetchUsers();
            }}
            onDeleteUser={(user) => handleListUserAction(user, 'delete')}
            onLockUser={(user) => handleListUserAction(user, 'lock')}
            onMuteUser={(user) => handleListUserAction(user, 'mute')}
            onBlockUser={(user) => handleListUserAction(user, 'block')}
            onRefreshUsers={fetchUsers}
            // Optimistic media (photos & voice notes)
            onSendMediaMessage={sendMediaMessage}
            onRetryUpload={retryMediaUpload}
            onDiscardUpload={discardMediaUpload}
            targetMessageId={pushTarget?.ready ? pushTarget.messageId : null}
            // Group
            selectedGroup={selectedGroup}
            groupMessages={groupMessages}
            setGroupMessages={setGroupMessages}
            onSendGroupMessage={sendGroupMessage}
            groupTypingUsers={groupTypingUsers}
            onGroupTyping={handleGroupTyping}
            onGroupUpdated={handleGroupUpdated}
            onGroupLeft={handleGroupLeft}
            onGroupDeleted={handleGroupDeleted}
            users={users}
            groups={groups}
            lastMessages={lastMessages}
            groupLastMessages={groupLastMessages}
            onForwardMessage={handleForwardMessage}
            loadingMessages={loadingMessages}
            hasMoreMessages={hasMoreMessages}
            loadingMoreMessages={loadingMoreMessages}
            onLoadMoreMessages={loadOlderMessages}
            socket={socket}
            onStartCall={(callType) =>
              setIncomingCall({
                _startCall: true,
                callee: selectedUser,
                callType,
              })
            }
            onStartMeet={(group) => {
              if (activeMeeting) return;
              setActiveMeeting({
                group,
                meetingId: `meeting_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                hostId: currentUserId,
              });
            }}
          />
        </div>
      </div>

      {/* ── Outgoing call ── */}
      {incomingCall?._startCall && (
        <CallModal
          socket={socket}
          currentUser={user}
          callee={incomingCall.callee}
          callType={incomingCall.callType}
          onClose={() => setIncomingCall(null)}
        />
      )}

      {/* ── Incoming call ── */}
      {incomingCall && !incomingCall._startCall && (
        <CallModal
          socket={socket}
          currentUser={user}
          incomingCall={incomingCall}
          onClose={() => setIncomingCall(null)}
        />
      )}

      {activeMeeting && socket && (
        <GroupMeetingModal
          socket={socket}
          group={activeMeeting.group}
          currentUser={user}
          meetingId={activeMeeting.meetingId}
          isHost={String(activeMeeting.hostId) === String(currentUserId)}
          onClose={() => setActiveMeeting(null)}
        />
      )}
      <MeetingInviteBanner
        invitations={
          currentUserId
            ? meetingInvitations.filter(
                (invite) => String(invite.hostId) !== String(currentUserId),
              )
            : []
        }
        onJoin={(invite) => {
          if (activeMeeting) return;
          setMeetingInvitations((current) =>
            current.filter((item) => item.meetingId !== invite.meetingId),
          );
          setActiveMeeting({
            group: invite.group,
            meetingId: invite.meetingId,
            hostId: invite.hostId,
          });
        }}
        onDismiss={(meetingId) =>
          setMeetingInvitations((current) =>
            current.filter((invite) => invite.meetingId !== meetingId),
          )
        }
      />
      <GenderPrompt />
    </div>
  );
};

export default Chat;
