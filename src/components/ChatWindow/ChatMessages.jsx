import axios from 'axios';
import { format } from 'date-fns';
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  Edit2,
  ExternalLink,
  EyeOff,
  Eye,
  FileText,
  Forward,
  ImageOff,
  MessageCircle,
  Mic,
  MoreVertical,
  Phone,
  Reply,
  RotateCcw,
  Trash2,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import BoardTextFit from '../BoardTextFit';
import {
  getBoardStyle,
  getBoardTextElements,
  getBoardTextPositionStyle,
} from '../BoardPostStyles';
import { useSocket } from '../../contexts/SocketContext';
import { API_URL } from '../../utils/apiUrl';
import ForwardModal from '../ForwardModal';
import OptimizedImage from '../OptimizedImage';
import UserAvatar from '../UserAvatar';
import ThreeDots from '../ThreeDots';
import VoiceWaveform from './VoiceWaveform';

const LocationMap = React.lazy(() => import('./LocationMap'));

const MESSAGE_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🤔'];
const canReactToMessage = (message) =>
  ['text', 'image', 'voice', 'file', 'location'].includes(message?.messageType);

const summarizeReactions = (reactions, currentUserId) => {
  const summary = new Map();
  for (const reaction of reactions || []) {
    const existing = summary.get(reaction.emoji) || { count: 0, reactedByMe: false };
    existing.count += 1;
    existing.reactedByMe ||= String(reaction.userId?._id || reaction.userId) === currentUserId;
    summary.set(reaction.emoji, existing);
  }
  return [...summary.entries()].map(([emoji, details]) => ({ emoji, ...details }));
};

const ReactionPicker = ({ onReact }) => (
  <div className='flex items-center justify-around gap-1.5 border-b border-white/10 bg-white/[0.02] px-3 py-2.5' aria-label='Add a reaction'>
    {MESSAGE_REACTION_EMOJIS.map((emoji) => (
      <button
        key={emoji}
        type='button'
        aria-label={`React with ${emoji}`}
        title={`React with ${emoji}`}
        onClick={() => onReact(emoji)}
        className='group relative flex h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-transparent text-2xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-110 hover:border-white/10 hover:bg-white/8 active:scale-95'
      >
        <span className='inline-block origin-center transition-transform duration-200 group-hover:scale-125 group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]'>
          {emoji}
        </span>
      </button>
    ))}
  </div>
);

const parseSharedLocation = (content) => {
  try {
    const location = JSON.parse(content);
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }
    return { latitude, longitude };
  } catch {
    return null;
  }
};

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const FileAttachment = ({ message, isOwnMessage }) => {
  return (
      <a
        href={message.content}
        target='_blank'
        rel='noopener noreferrer'
        aria-label={`Open ${message.fileName || 'attachment'}`}
        className={`flex min-w-[210px] max-w-[300px] items-center gap-3 rounded-2xl px-3.5 py-3 text-left shadow-sm ${
          isOwnMessage
            ? 'rounded-br-md bg-[#005c4b] text-white'
            : 'rounded-bl-md bg-[#202c33] text-gray-100'
        }`}
      >
        <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10'>
          <FileText size={21} />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-semibold'>
            {message.fileName || 'Attachment'}
          </span>
          <span className='mt-0.5 block text-xs text-white/60'>
            {formatFileSize(message.fileSize) ||
              message.fileMimeType ||
              'Open file'}
          </span>
        </span>
        <ExternalLink size={17} className='shrink-0 text-white/70' />
      </a>
  );
};

/**
 * Failure strip shown inside an optimistic voice bubble. Rendered for own
 * messages only; active uploads use the message's standard sending status.
 */
const UploadStatusStrip = ({
  state,
  error,
  isOwnMessage,
  onRetry,
  onDiscard,
}) => {
  if (!state || state === 'sent') return null;

  if (state === 'failed') {
    return (
      <div
        className={`mt-1.5 flex items-center gap-2 border-t pt-1.5 ${
          isOwnMessage ? 'border-white/20' : 'border-white/10'
        }`}
      >
        <CircleAlert size={13} className='flex-shrink-0 text-red-300' />
        <span
          className='min-w-0 flex-1 truncate text-[11px] text-red-200'
          title={error || 'Upload failed'}
        >
          {error || 'Upload failed'}
        </span>
        <button
          type='button'
          onClick={onRetry}
          className='inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-white/20'
        >
          <RotateCcw size={11} /> Retry
        </button>
        <button
          type='button'
          onClick={onDiscard}
          className='flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
        >
          Discard
        </button>
      </div>
    );
  }

  return null;
};

const VoiceMessage = ({
  messageId,
  duration,
  isOwnMessage,
  src,
  uploadState,
  uploadError,
  onRetry,
  onDiscard,
  viewOnce = false,
  viewedAt,
  onViewOnceOpen,
  onViewOnceComplete,
}) => {
  const recipientViewOnce = viewOnce && !isOwnMessage;
  const [revealed, setRevealed] = useState(!recipientViewOnce);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openingViewOnce, setOpeningViewOnce] = useState(false);
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const localAudioUrlRef = useRef(null);

  useEffect(
    () => () => {
      if (localAudioUrlRef.current) URL.revokeObjectURL(localAudioUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (recipientViewOnce) return undefined;
    // New voice notes are stored in B2 and carry their URL on the
    // message, so playback needs no round-trip through the API at all — and the
    // response is cacheable. Only legacy notes (whose bytes still live in
    // MongoDB) fall back to the authenticated streaming endpoint.
    if (!revealed) return undefined;
    if (src) {
      setAudioUrl(src);
      setError(false);
      setLoading(false);
      return undefined;
    }

    let url;
    const load = async () => {
      try {
        const apiUrl = API_URL;
        const token = localStorage.getItem('token');
        const res = await axios.get(`${apiUrl}/messages/voice/${messageId}`, {
          responseType: 'blob',
          headers: { Authorization: `Bearer ${token}` },
        });
        url = URL.createObjectURL(res.data);
        setAudioUrl(url);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      // Only ever revoke the locally created blob URL — never the remote one.
      if (url) URL.revokeObjectURL(url);
    };
  }, [messageId, src, revealed, recipientViewOnce]);

  const openViewOnceAudio = async () => {
    if (openingViewOnce || revealed) return;
    setOpeningViewOnce(true);
    setError(false);
    try {
      const url = await onViewOnceOpen();
      localAudioUrlRef.current = url;
      setAudioUrl(url);
      setRevealed(true);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    } finally {
      setOpeningViewOnce(false);
    }
  };

  const base = isOwnMessage
    ? 'bg-[#005c4b] rounded-br-md'
    : 'bg-[#202c33] rounded-bl-md';

  if (viewOnce && viewedAt && !isOwnMessage) {
    return (
      <div className={`flex h-14 min-w-[190px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white/70 shadow-sm ${base}`}>
        <Eye size={24} strokeWidth={1.8} />
        <span>Viewed once</span>
      </div>
    );
  }

  if (viewOnce && isOwnMessage) {
    return (
      <div className={`flex h-14 min-w-[190px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm ${base}`}>
        <Eye size={24} strokeWidth={1.8} />
        <span>View once</span>
      </div>
    );
  }

  if (!revealed) {
    return (
      <button
        type='button'
        onClick={openViewOnceAudio}
        disabled={openingViewOnce}
        className={`flex h-14 min-w-[190px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-wait ${base}`}
      >
        <Eye size={24} strokeWidth={1.8} />
        {openingViewOnce ? 'Opening…' : 'View once'}
      </button>
    );
  }

  if (loading)
    return (
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-2 ${base}`}>
        <Mic size={16} className='text-white/70 flex-shrink-0' />
        <ThreeDots size='sm' className='text-white/70' />
      </div>
    );

  if (error)
    return (
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-2 ${base}`}>
        <Mic size={16} className='text-white/70 flex-shrink-0' />
        <span className='text-xs text-white/60'>
          {recipientViewOnce ? 'One-time audio unavailable' : 'Audio unavailable'}
        </span>
      </div>
    );

  if (playbackCompleted) {
    return (
      <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white/75 ${base}`}>
        <Eye size={16} />
        Viewed once
      </div>
    );
  }

  return (
    <div className={`rounded-2xl px-3 py-2 ${base} shadow-sm`}>
      <VoiceWaveform
        src={audioUrl}
        duration={duration}
        seed={messageId}
        tone={isOwnMessage ? 'own' : 'other'}
        playOnce={recipientViewOnce}
        onEnded={() => {
          if (recipientViewOnce) {
            setPlaybackCompleted(true);
            onViewOnceComplete?.();
          }
        }}
      />
      <UploadStatusStrip
        state={uploadState}
        error={uploadError}
        isOwnMessage={isOwnMessage}
        onRetry={onRetry}
        onDiscard={onDiscard}
      />
    </div>
  );
};

const SENDER_TEXT = [
  'text-purple-400',
  'text-sky-400',
  'text-green-400',
  'text-yellow-400',
  'text-red-400',
  'text-pink-400',
  'text-indigo-300',
  'text-teal-300',
];
const senderText = (id) =>
  SENDER_TEXT[(id?.charCodeAt(0) ?? 0) % SENDER_TEXT.length];

const ChatMessages = ({
  messages,
  setMessages,
  currentUser,
  selectedUser,
  selectedGroup,
  isGroupChat,
  isConversationVisible,
  isUserTyping,
  isUserRecording,
  groupTypingUsers,
  groupRecordingUsers,
  onMessageUpdate,
  onMessageDelete,
  onMessageHide,
  onReplyMessage,
  editingMessage,
  onStartEditMessage,
  // Forwarding
  users = [],
  groups = [],
  lastMessages = {},
  groupLastMessages = {},
  onForwardMessage,
  // Pagination
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loadingMessages = false,
  // Optimistic media (photos & voice notes)
  onRetryUpload,
  onDiscardUpload,
  targetMessageId,
}) => {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const savedScrollHeight = useRef(null);
  const previousMessagesRef = useRef(null);
  const [actionMenuData, setActionMenuData] = useState(null); // { message, isOwn, top, right?, left?, openUpward }
  const [forwardMessage, setForwardMessage] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [viewOnceImage, setViewOnceImage] = useState(null);
  const [viewOnceImageError, setViewOnceImageError] = useState('');
  const [lightboxOffset, setLightboxOffset] = useState({ x: 0, y: 0 });
  const [lightboxClosing, setLightboxClosing] = useState(false);
  const viewOnceCompletionRef = useRef(new Set());
  const viewOnceImageOpeningRef = useRef(new Set());
  const lightboxGestureRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    pointerId: null,
  });
  const lightboxCloseTimerRef = useRef(null);
  const [failedImageIds, setFailedImageIds] = useState({});
  const { socket, socketConnected } = useSocket();
  const navigate = useNavigate();

  // Clear failed image cache on mount — stale blob URLs are no longer valid
  // and images should be retried from the server.
  useEffect(() => {
    setFailedImageIds({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(
    () => () => {
      if (lightboxCloseTimerRef.current) {
        clearTimeout(lightboxCloseTimerRef.current);
      }
    },
    [],
  );
  const [dragState, setDragState] = useState({ id: null, dx: 0 }); // live swipe offset of one message
  const dragRef = useRef({
    id: null,
    startX: 0,
    startY: 0,
    active: false,
    moved: false,
  });
  // Computer (mouse/trackpad) → three-dots button. Phone/tablet (touch) → swipe the message.
  const DESKTOP_QUERY = '(hover: hover) and (pointer: fine)';
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const onChange = (e) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!targetMessageId) return;
    const target = Array.from(
      document.querySelectorAll('[data-message-id]'),
    ).find(
      (element) =>
        element.getAttribute('data-message-id') === String(targetMessageId),
    );
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('ring-2', 'ring-indigo-400');
    const timer = window.setTimeout(
      () => target.classList.remove('ring-2', 'ring-indigo-400'),
      2400,
    );
    return () => window.clearTimeout(timer);
  }, [targetMessageId, messages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !socket || !isConversationVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !isConversationVisible ||
          document.visibilityState !== 'visible' ||
          !container.isConnected ||
          container.getClientRects().length === 0
        ) {
          return;
        }
        const visibleIds = new Set();
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const messageId = entry.target.getAttribute('data-message-id');
          const message = messages.find(
            (candidate) => String(candidate._id) === messageId,
          );
          const senderId =
            typeof message?.sender === 'object'
              ? message.sender?._id
              : message?.sender;
          const currentId = currentUser?._id || currentUser?.id;
          if (
            messageId &&
            message &&
            message.status !== 'read' &&
            String(senderId) !== String(currentId)
          ) {
            visibleIds.add(messageId);
            if (isGroupChat || socket.connected) observer.unobserve(entry.target);
          }
        }
        if (visibleIds.size === 0) return;
        const messageIds = [...visibleIds];
        if (isGroupChat && selectedGroup?._id) {
          const token = localStorage.getItem('token');
          axios.post(
            `${API_URL}/groups/${selectedGroup._id}/read`,
            { messageIds },
            { headers: { Authorization: 'Bearer ' + token } },
          ).catch((error) => {
            console.error('Failed to mark visible group messages as read:', error);
          });
        } else if (socket.connected) {
          socket.emit('mark_messages_read', {
            messageIds,
            conversationType: 'direct',
            conversationId: String(selectedUser?._id || ''),
          });
        }
      },
      { root: container, threshold: 0.3 },
    );

    container.querySelectorAll('[data-message-id]').forEach((element) => {
      observer.observe(element);
    });
    const resumeObserver = () => {
      if (
        isConversationVisible &&
        document.visibilityState === 'visible' &&
        container.isConnected &&
        container.getClientRects().length > 0
      ) {
        container.querySelectorAll('[data-message-id]').forEach((element) => {
          observer.observe(element);
        });
      }
    };
    document.addEventListener('visibilitychange', resumeObserver);

    return () => {
      document.removeEventListener('visibilitychange', resumeObserver);
      observer.disconnect();
    };
  }, [
    currentUser,
    isConversationVisible,
    isGroupChat,
    messages,
    selectedGroup,
    socket,
    socketConnected,
  ]);

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (!socket || !setMessages) return;

    const handleMessageEdited = (updatedMessage) => {
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg._id) === String(updatedMessage._id)
            ? { ...msg, ...updatedMessage }
            : msg,
        ),
      );
      if (onMessageUpdate) onMessageUpdate(updatedMessage);
    };

    const handleMessageDeleted = ({ messageId, permanent = false }) => {
      setMessages((prev) =>
        permanent
          ? prev.filter((msg) => String(msg._id) !== String(messageId))
          : prev.map((msg) =>
              String(msg._id) === String(messageId)
                ? {
                    ...msg,
                    isDeleted: true,
                    content: 'This message was deleted',
                    status: 'deleted',
                  }
                : msg,
            ),
      );
      if (onMessageDelete) onMessageDelete(messageId);
    };

    const handleMessageHidden = ({ messageId }) => {
      setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
      if (onMessageHide) onMessageHide(messageId);
    };

    const handleMessageReactionUpdated = (updatedMessage) => {
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg._id) === String(updatedMessage._id)
            ? { ...msg, reactions: updatedMessage.reactions || [] }
            : msg,
        ),
      );
    };

    socket.on('message_edited', handleMessageEdited);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_hidden', handleMessageHidden);
    socket.on('message_reaction_updated', handleMessageReactionUpdated);

    return () => {
      socket.off('message_edited', handleMessageEdited);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_hidden', handleMessageHidden);
      socket.off('message_reaction_updated', handleMessageReactionUpdated);
    };
  }, [socket, setMessages, onMessageUpdate, onMessageDelete, onMessageHide]);

  const getMessageStatusIcon = (message) => {
    const currentId = currentUser?._id || currentUser?.id;
    if (String(message.sender._id) !== String(currentId)) return null;

    if (message.status === 'deleted') return null;

    if (message._uploadState === 'failed') {
      return <CircleAlert size={14} className='text-red-400' />;
    }
    if (
      message._uploadState === 'pending' ||
      message._uploadState === 'uploading' ||
      message._uploadState === 'sending'
    ) {
      return <Clock size={14} className='text-gray-400' />;
    }
    if (message._uploadState && message._uploadState !== 'sent') {
      return <ThreeDots size='xs' className='text-gray-400' />;
    }

    switch (message.status) {
      case 'sent':
        return <Check size={14} className='text-gray-400' />;
      case 'delivered':
        return <CheckCheck size={14} className='text-gray-400' />;
      case 'read':
        return <CheckCheck size={14} className='text-sky-400' />;
      case 'edited':
        return <CheckCheck size={14} className='text-gray-400' />;
      default:
        return <Clock size={14} className='text-gray-400' />;
    }
  };

  const getStatusText = (message) => {
    // Optimistic media reports its upload lifecycle instead of a delivery state.
    if (message._uploadState === 'failed') return 'Upload failed';
    if (
      message._uploadState === 'pending' ||
      message._uploadState === 'uploading' ||
      message._uploadState === 'sending'
    ) {
      return 'Sending…';
    }

    switch (message.status) {
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'read':
        return 'Seen';
      case 'edited':
        return 'Edited';
      case 'deleted':
        return 'Deleted';
      default:
        return 'Sending...';
    }
  };

  const formatMessageTime = (date) => {
    const now = new Date();
    const msgDate = new Date(date);
    const diffDays = Math.floor((now - msgDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return format(msgDate, 'HH:mm');
    } else if (diffDays === 1) {
      return `Yesterday ${format(msgDate, 'HH:mm')}`;
    } else if (diffDays < 7) {
      return format(msgDate, 'EEE HH:mm');
    } else {
      return format(msgDate, 'MMM d, HH:mm');
    }
  };

  // Check if message contains ONLY emojis (no text)
  const isOnlyEmojis = (text) => {
    if (!text) return false;
    const emojiRegex =
      /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic}|\s)+$/gu;
    return emojiRegex.test(text.trim());
  };

  // Split message text into links, phone-like numbers, and ordinary text.
  const parseTextWithLinks = (text) => {
    const safeText = typeof text === 'string' ? text : '';
    const urlRegex =
      /(?:https?:\/\/|www\.)[^\s<>"']+|(?<![\w@])(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/gi;
    const numberRegex =
      /(?<![\p{L}\p{N}])\+?\d(?:[\d(). -]*\d)?(?![\p{L}\p{N}])/gu;
    const parts = [];
    let lastIndex = 0;
    let match;

    const appendTextAndNumbers = (content) => {
      let textIndex = 0;
      let numberMatch;
      numberRegex.lastIndex = 0;

      while ((numberMatch = numberRegex.exec(content)) !== null) {
        if (numberMatch.index > textIndex) {
          parts.push({
            type: 'text',
            content: content.substring(textIndex, numberMatch.index),
          });
        }
        parts.push({ type: 'number', content: numberMatch[0] });
        textIndex = numberRegex.lastIndex;
      }

      if (textIndex < content.length) {
        parts.push({ type: 'text', content: content.substring(textIndex) });
      }
    };

    while ((match = urlRegex.exec(safeText)) !== null) {
      let displayUrl = match[0];
      while (/[.,!;:]$/.test(displayUrl)) {
        displayUrl = displayUrl.slice(0, -1);
      }
      while (
        displayUrl.endsWith(')') &&
        (displayUrl.match(/\)/g) || []).length >
          (displayUrl.match(/\(/g) || []).length
      ) {
        displayUrl = displayUrl.slice(0, -1);
      }
      if (!displayUrl) continue;

      const urlEnd = match.index + displayUrl.length;
      appendTextAndNumbers(safeText.substring(lastIndex, match.index));

      let url = displayUrl;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      parts.push({
        type: 'link',
        content: displayUrl,
        href: url,
      });

      lastIndex = urlEnd;
      urlRegex.lastIndex = urlEnd;
    }

    if (lastIndex < safeText.length) {
      appendTextAndNumbers(safeText.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: safeText }];
  };

  // Render message content with emojis and links
  const renderMessageContent = (text, isDeleted = false) => {
    if (isDeleted) {
      return (
        <span className='italic text-gray-400'>This message was deleted</span>
      );
    }

    if (isOnlyEmojis(text)) {
      const emojiRegex =
        /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})/gu;
      const emojis = [...text.matchAll(emojiRegex)].map((m) => m[0]);

      let emojiSize = 'text-4xl';
      let animationClass = '';

      if (emojis.length === 1) {
        emojiSize = 'text-8xl';
        animationClass = 'animate-emoji-float';
      } else if (emojis.length <= 2) {
        emojiSize = 'text-7xl';
        animationClass = 'animate-emoji-bounce';
      } else if (emojis.length <= 4) {
        emojiSize = 'text-6xl';
        animationClass = 'animate-emoji-pop';
      } else {
        emojiSize = 'text-4xl';
        animationClass = 'animate-emoji-wave';
      }

      return (
        <div
          className={`${emojiSize} inline-flex flex-wrap gap-2 ${animationClass}`}
          style={{ lineHeight: 1 }}
        >
          {emojis.map((emoji, idx) => (
            <span
              key={idx}
              role='img'
              aria-label='emoji'
              className='emoji-sticker'
            >
              {emoji}
            </span>
          ))}
        </div>
      );
    }

    const parts = parseTextWithLinks(text);
    return (
      <span className='whitespace-pre-wrap break-words'>
        {parts.map((part, idx) =>
          part.type === 'link' ? (
            <a
              key={idx}
              href={part.href}
              target='_blank'
              rel='noopener noreferrer'
              className='text-sky-300 underline underline-offset-2 hover:text-sky-200 transition-colors cursor-pointer break-all'
              onClick={(e) => {
                window.open(part.href, '_blank', 'noopener,noreferrer');
                e.preventDefault();
              }}
            >
              {part.content}
            </a>
          ) : part.type === 'number' ? (
            <button
              key={idx}
              type='button'
              onClick={() => void handleCopyMessage(part.content, false)}
              aria-label={`Copy number ${part.content}`}
              title='Copy number'
              className='cursor-pointer text-sky-300 underline underline-offset-2 transition-colors hover:text-sky-200'
            >
              {part.content}
            </button>
          ) : (
            <span key={idx}>{part.content}</span>
          ),
        )}
      </span>
    );
  };

  const handleDeleteMessage = (message) => {
    if (socket) {
      socket.emit('delete_message', { messageId: message._id });
    }
    closeActionMenu();
  };

  const handleReactToMessage = (message, emoji) => {
    if (!socket || !message?._id || message.isDeleted) return;
    socket.emit('react_message', { messageId: message._id, emoji });
    closeActionMenu();
  };

  const handleHideMessage = (message) => {
    if (socket) {
      socket.emit('hide_message', { messageId: message._id });
    }
    closeActionMenu();
  };

  const handleCopyMessage = async (content, closeMenu = true) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const temporaryInput = document.createElement('textarea');
        temporaryInput.value = content;
        temporaryInput.setAttribute('readonly', '');
        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        const copied = document.execCommand('copy');
        temporaryInput.remove();
        if (!copied) throw new Error('Clipboard copy was rejected');
      }

      const tempDiv = document.createElement('div');
      tempDiv.className =
        'fixed bottom-4 right-4 bg-gray-800 border border-white/10 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm animate-fade-in';
      tempDiv.innerText = 'Copied!';
      document.body.appendChild(tempDiv);
      setTimeout(() => tempDiv.remove(), 1500);
      if (closeMenu) closeActionMenu();
    } catch (error) {
      console.error('Could not copy message text to clipboard:', error);
      const tempDiv = document.createElement('div');
      tempDiv.className =
        'fixed bottom-4 right-4 bg-gray-800 border border-red-400/30 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm animate-fade-in';
      tempDiv.innerText = 'Could not copy';
      document.body.appendChild(tempDiv);
      setTimeout(() => tempDiv.remove(), 2000);
    }
  };

  const handleReplyClick = (message) => {
    if (onReplyMessage) {
      onReplyMessage(message);
    }
    closeActionMenu();
  };

  const startEditing = (message) => {
    onStartEditMessage?.(message);
    setActionMenuData(null);
  };

  const openActionMenu = (e, message, isOwn) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const winH = window.innerHeight;
    const winW = window.innerWidth;
    const menuW = 320; // Fits the seven reaction buttons without clipping.
    const openUpward = winH - rect.bottom < 300;

    // Horizontal: keep menu within viewport
    let right, left;
    if (isOwn) {
      right = Math.max(8, winW - rect.right);
      if (winW - right - menuW < 8) right = winW - menuW - 8;
    } else {
      left = Math.max(8, rect.left);
      if (left + menuW > winW - 8) left = winW - menuW - 8;
    }

    setActionMenuData({
      message,
      isOwn,
      top: openUpward ? rect.top : rect.bottom + 4,
      openUpward,
      ...(isOwn ? { right } : { left }),
    });
  };

  const closeActionMenu = () => setActionMenuData(null);

  // ── Swipe to reveal options ──────────────────────────────────────────────
  // Own messages (right side): drag LEFT. Received messages (left side): drag RIGHT.
  const DRAG_MAX = 88; // max visual travel in px
  const DRAG_TRIGGER = 44; // travel needed to open the options

  const onDragStart = (e, message) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragRef.current = {
      id: message._id,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      moved: false,
    };
  };

  const onDragMove = (e, message, isOwn) => {
    const d = dragRef.current;
    if (d.id !== message._id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if ((isOwn && dx > 0) || (!isOwn && dx < 0)) {
        dragRef.current = {
          id: null,
          startX: 0,
          startY: 0,
          active: false,
          moved: false,
        };
        return;
      }
      d.active = true;
      d.moved = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const dir = isOwn ? -1 : 1;
    const eased = Math.min(DRAG_MAX, Math.max(0, dx * dir) * 0.7);
    setDragState({ id: message._id, dx: eased * dir });
  };

  const onDragEnd = (e, message, isOwn) => {
    const d = dragRef.current;
    if (d.id !== message._id) return;
    const wasActive = d.active;
    const dx = dragState.dx;
    dragRef.current = {
      id: null,
      startX: 0,
      startY: 0,
      active: false,
      moved: wasActive,
    };
    setDragState({ id: null, dx: 0 });
    if (wasActive && Math.abs(dx) >= DRAG_TRIGGER) {
      const rect = e.currentTarget.getBoundingClientRect();
      // Use the un-shifted position so the menu lines up with the bubble
      openActionMenu(
        {
          currentTarget: {
            getBoundingClientRect: () => ({
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left - dx,
              right: rect.right - dx,
            }),
          },
        },
        message,
        isOwn,
      );
    }
  };

  const onDragCancel = () => {
    dragRef.current = {
      id: null,
      startX: 0,
      startY: 0,
      active: false,
      moved: false,
    };
    setDragState({ id: null, dx: 0 });
  };

  const isDeleted = (message) =>
    message.isDeleted || message.status === 'deleted';
  const isHidden = (message) => message.isHidden;
  const consumeViewOnceMedia = async (message) => {
    const currentId = currentUser?._id || currentUser?.id;
    if (
      !message.viewOnce ||
      String(message.sender?._id) === String(currentId)
    ) {
      throw new Error('One-time media is not available to this account.');
    }
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/messages/${message._id}/view-once`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Could not open one-time media (${response.status}).`);
    }
    return URL.createObjectURL(await response.blob());
  };
  const completeViewOnceMedia = async (message) => {
    if (viewOnceCompletionRef.current.has(String(message._id))) return;
    viewOnceCompletionRef.current.add(String(message._id));
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/messages/${message._id}/view-once/complete`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        throw new Error(`Could not delete viewed media (${response.status}).`);
      }
      if (setMessages) {
        setMessages((prev) =>
          prev.filter((item) => String(item._id) !== String(message._id)),
        );
      }
    } catch (error) {
      viewOnceCompletionRef.current.delete(String(message._id));
      console.error('Failed to delete viewed one-time media:', error);
    }
  };
  const openViewOnceImage = async (message) => {
    const messageId = String(message._id);
    if (viewOnceImageOpeningRef.current.has(messageId)) return;
    viewOnceImageOpeningRef.current.add(messageId);
    setViewOnceImageError('');
    try {
      const url = await consumeViewOnceMedia(message);
      setViewOnceImage({ message, url });
    } catch (error) {
      setViewOnceImageError(messageId);
      console.error('Failed to open one-time photo:', error);
    } finally {
      viewOnceImageOpeningRef.current.delete(messageId);
    }
  };
  const closeViewOnceImage = () => {
    if (!viewOnceImage) return;
    const openedImage = viewOnceImage;
    setViewOnceImage(null);
    URL.revokeObjectURL(openedImage.url);
    void completeViewOnceMedia(openedImage.message);
  };
  const openImageLightbox = (url) => {
    if (lightboxCloseTimerRef.current) {
      clearTimeout(lightboxCloseTimerRef.current);
      lightboxCloseTimerRef.current = null;
    }
    setLightboxOffset({ x: 0, y: 0 });
    setLightboxClosing(false);
    setLightboxUrl(url);
  };

  const finishLightboxClose = () => {
    setLightboxUrl(null);
    setLightboxOffset({ x: 0, y: 0 });
    setLightboxClosing(false);
  };

  const closeLightbox = (dismissOffset = { x: 0, y: 0 }) => {
    if (!lightboxUrl || lightboxClosing) return;
    setLightboxClosing(true);
    setLightboxOffset(dismissOffset);
    lightboxCloseTimerRef.current = setTimeout(() => {
      lightboxCloseTimerRef.current = null;
      finishLightboxClose();
    }, 180);
  };

  const onLightboxPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lightboxGestureRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onLightboxPointerMove = (e) => {
    const gesture = lightboxGestureRef.current;
    if (!gesture.active || lightboxClosing) return;
    setLightboxOffset({
      x: e.clientX - gesture.startX,
      y: e.clientY - gesture.startY,
    });
  };

  const onLightboxPointerEnd = (e) => {
    const gesture = lightboxGestureRef.current;
    if (!gesture.active) return;
    const offset = {
      x: e.clientX - gesture.startX,
      y: e.clientY - gesture.startY,
    };
    lightboxGestureRef.current = {
      active: false,
      startX: 0,
      startY: 0,
      pointerId: null,
    };
    const distance = Math.max(Math.abs(offset.x), Math.abs(offset.y));
    if (distance >= 120) {
      const direction = {
        x: Math.abs(offset.x) >= Math.abs(offset.y)
          ? Math.sign(offset.x) * window.innerWidth
          : offset.x,
        y: Math.abs(offset.y) > Math.abs(offset.x)
          ? Math.sign(offset.y) * window.innerHeight
          : offset.y,
      };
      closeLightbox(direction);
    } else {
      setLightboxOffset({ x: 0, y: 0 });
    }
  };

  const onLightboxWheel = (e) => {
    if (Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY)) < 45) return;
    closeLightbox({
      x: Math.abs(e.deltaX) >= Math.abs(e.deltaY)
        ? Math.sign(e.deltaX) * window.innerWidth
        : 0,
      y: Math.abs(e.deltaY) > Math.abs(e.deltaX)
        ? Math.sign(e.deltaY) * window.innerHeight
        : 0,
    });
  };

  // ── Hooks that must run unconditionally (before any early return) ──────────

  // Keep the current position when prepending; only follow messages appended at the end.
  useLayoutEffect(() => {
    const previousMessages = previousMessagesRef.current;
    previousMessagesRef.current = messages;

    const container = containerRef.current;
    if (savedScrollHeight.current !== null && container) {
      container.scrollTop = container.scrollHeight - savedScrollHeight.current;
      savedScrollHeight.current = null;
      return;
    }

    if (previousMessages === null) {
      if (messages.length > 0) scrollToBottom('auto');
      return;
    }

    if (messages.length <= previousMessages.length) return;
    const previousMessagesAreUnchangedPrefix = previousMessages.every(
      (message, index) =>
        String(message._id) === String(messages[index]?._id),
    );
    if (previousMessagesAreUnchangedPrefix) scrollToBottom();
  }, [messages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollTop < 80) {
      savedScrollHeight.current = el.scrollHeight;
      onLoadMore?.();
    }
  };

  const otherUserTyping =
    !isGroupChat && selectedUser && isUserTyping?.(selectedUser._id);
  const otherUserRecording =
    !isGroupChat && selectedUser && isUserRecording?.(selectedUser._id);
  const groupTyping =
    isGroupChat && selectedGroup && groupTypingUsers?.[selectedGroup._id];
  const groupTypingText =
    groupTyping?.size > 0
      ? [...groupTyping].slice(0, 2).join(', ') + ' typing...'
      : null;
  const groupRecording =
    isGroupChat && selectedGroup && groupRecordingUsers?.[selectedGroup._id];
  const groupRecordingText =
    groupRecording?.size > 0
      ? [...groupRecording].slice(0, 2).join(', ') + ' recording...'
      : null;

  // Shared style tokens (WhatsApp-like dark)
  const scrollbarStyle =
    '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 hover:[&::-webkit-scrollbar-thumb]:bg-white/25';
  const indicatorBubble =
    'bg-[#202c33] text-gray-200 text-[13px] px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm flex items-center gap-2';

  // ── Early returns (after all hooks) ───────────────────────────────────────

  if (!selectedUser && !selectedGroup) {
    return (
      <div className='flex-1 min-h-0 flex items-center justify-center overflow-hidden bg-gray-900 px-6'>
        <div className='text-center max-w-xs'>
          <div className='w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-4'>
            <MessageCircle size={38} className='text-gray-500' />
          </div>
          <h3 className='text-xl font-semibold text-gray-100 mb-2'>
            No chat selected
          </h3>
          <p className='text-sm text-gray-400 leading-relaxed'>
            Select a conversation from the sidebar to start chatting
          </p>
        </div>
      </div>
    );
  }

  // Skeleton loading — shown while fetching a conversation for the first time
  if (loadingMessages) {
    return (
      <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
        <div className='flex items-center gap-2 rounded-full border border-white/10 bg-gray-900/75 px-4 py-2 text-sm text-gray-300 shadow-lg backdrop-blur'>
          <ThreeDots size='sm' className='text-emerald-300' />
          Loading messages
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className='relative min-h-0 flex-1 overflow-hidden bg-transparent' />
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-transparent px-3 py-3 md:px-10 md:py-5 space-y-1.5 md:space-y-2 ${scrollbarStyle}`}
    >
      {/* Load more indicator */}
      {loadingMore && (
        <div className='flex justify-center py-2'>
          <div className='flex items-center gap-2 text-xs text-gray-300 bg-gray-800/90 border border-white/10 shadow-sm px-3.5 py-1.5 rounded-full'>
            <ThreeDots size='xs' className='text-gray-300' /> Loading older
            messages…
          </div>
        </div>
      )}
      {!loadingMore && !hasMore && messages.length > 0 && (
        <div className='flex justify-center py-2'>
          <span className='text-xs text-gray-400 bg-gray-800/80 border border-white/10 px-3.5 py-1 rounded-full'>
            Beginning of conversation
          </span>
        </div>
      )}
      {/* DM Typing indicator */}
      {otherUserTyping && !otherUserRecording && (
        <div className='flex justify-start animate-fade-in'>
          <div className={indicatorBubble}>
            <span>{selectedUser.username} is typing</span>
            <span className='typing-dots flex items-center gap-0.5'>
              <span
                className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.15s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.3s' }}
              ></span>
            </span>
          </div>
        </div>
      )}
      {/* DM Voice recording indicator */}
      {otherUserRecording && (
        <div className='flex justify-start animate-fade-in'>
          <div className={indicatorBubble}>
            <Mic size={13} className='text-red-400 flex-shrink-0' />
            <span>{selectedUser.username} is recording</span>
            <span className='flex items-center gap-0.5'>
              <span
                className='w-1.5 h-1.5 bg-red-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-red-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.15s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-red-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.3s' }}
              ></span>
            </span>
          </div>
        </div>
      )}
      {/* Group Typing indicator */}
      {groupTypingText && !groupRecordingText && (
        <div className='flex justify-start animate-fade-in'>
          <div className={indicatorBubble}>
            <span>{groupTypingText}</span>
            <span className='typing-dots flex items-center gap-0.5'>
              <span
                className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.15s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-gray-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.3s' }}
              ></span>
            </span>
          </div>
        </div>
      )}
      {/* Group Voice recording indicator */}
      {groupRecordingText && (
        <div className='flex justify-start animate-fade-in'>
          <div className={indicatorBubble}>
            <Mic size={13} className='text-red-400 flex-shrink-0' />
            <span>{groupRecordingText}</span>
            <span className='flex items-center gap-0.5'>
              <span
                className='w-1.5 h-1.5 bg-red-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-red-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.15s' }}
              ></span>
              <span
                className='w-1.5 h-1.5 bg-red-400 rounded-full animate-typingBounce'
                style={{ animationDelay: '0.3s' }}
              ></span>
            </span>
          </div>
        </div>
      )}

      {messages.map((message, index) => {
        const currentId = currentUser?._id || currentUser?.id;
        const isOwnMessage = String(message.sender._id) === String(currentId);
        const showDateSeparator =
          index === 0 ||
          format(new Date(messages[index - 1].createdAt), 'yyyy-MM-dd') !==
            format(new Date(message.createdAt), 'yyyy-MM-dd');

        const isEmojiOnly = isOnlyEmojis(message.content);
        const deleted = isDeleted(message);
        const hidden = isHidden(message);
        // Own media shows its upload lifecycle (pending / uploading / failed)
        // right on the bubble until the persisted message replaces it.
        const uploadState = isOwnMessage ? message._uploadState : null;
        const isUploadingMedia =
          uploadState === 'pending' ||
          uploadState === 'uploading' ||
          uploadState === 'sending';
        const isSendingImage =
          isOwnMessage &&
          message.messageType === 'image' &&
          isUploadingMedia;

        if (hidden && !isOwnMessage) return null;

        return (
          <React.Fragment key={message._id || index}>
            {showDateSeparator && (
              <div className='flex justify-center my-3 md:my-4'>
                <div className='bg-gray-800/90 border border-white/10 text-gray-300 text-xs font-medium px-3.5 py-1 rounded-full shadow-sm backdrop-blur'>
                  {format(new Date(message.createdAt), 'MMMM d, yyyy')}
                </div>
              </div>
            )}

            <div
              data-message-id={message._id}
              className={`group relative flex w-full min-w-0 animate-fade-in ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
            >
              {/* Swipe hint — shows behind the bubble while dragging */}
              {dragState.id === message._id && (
                <div
                  className={`pointer-events-none absolute top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    Math.abs(dragState.dx) >= DRAG_TRIGGER
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/10 text-gray-300'
                  } ${isOwnMessage ? 'right-1' : ''}`}
                  style={{
                    opacity: Math.min(1, Math.abs(dragState.dx) / DRAG_TRIGGER),
                    transform: `translateY(-50%) scale(${0.6 + Math.min(1, Math.abs(dragState.dx) / DRAG_TRIGGER) * 0.4})`,
                    ...(!isOwnMessage ? { left: isGroupChat ? 44 : 4 } : {}),
                  }}
                >
                  {isOwnMessage ? (
                    <ChevronLeft size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </div>
              )}

              {/* Group sender avatar (left side) */}
              {isGroupChat && !isOwnMessage && (
                <UserAvatar
                  user={message.sender}
                  alt={message.sender.username}
                  className='w-8 h-8 rounded-full object-cover flex-shrink-0 self-end mr-2 ring-1 ring-white/10'
                />
              )}

              <div
                className={`min-w-0 max-w-[82%] sm:max-w-[75%] md:max-w-md ${isOwnMessage ? 'order-2' : 'order-1'}`}
                style={{
                  touchAction: 'pan-y',
                  transform:
                    dragState.id === message._id
                      ? `translateX(${dragState.dx}px)`
                      : undefined,
                  transition:
                    dragState.id === message._id
                      ? 'none'
                      : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  userSelect: dragState.id === message._id ? 'none' : undefined,
                }}
                {...(!isDesktop &&
                  !deleted &&
                  !editingMessage &&
                  // An in-flight upload has no server id yet, so replying to it
                  // would reference a message the server never stored.
                  !message._isOptimistic &&
                  message.messageType !== 'meeting'
                  ? {
                      onPointerDown: (e) => onDragStart(e, message),
                      onPointerMove: (e) =>
                        onDragMove(e, message, isOwnMessage),
                      onPointerUp: (e) => onDragEnd(e, message, isOwnMessage),
                      onPointerCancel: onDragCancel,
                      onClickCapture: (e) => {
                        if (dragRef.current.moved) {
                          e.stopPropagation();
                          e.preventDefault();
                          dragRef.current.moved = false;
                        }
                      },
                    }
                  : {})}
              >
                {/* Sender name in group chat for received messages */}
                {isGroupChat && !isOwnMessage && !deleted && (
                  <div
                    className={`text-xs font-semibold mb-0.5 ml-2 ${senderText(message.sender._id)}`}
                  >
                    {message.sender.username}
                  </div>
                )}

                {/* Reply preview — WhatsApp/Telegram style quote inside the bubble */}
                {message.replyTo &&
                  !deleted &&
                  (message.replyTo.content ||
                    message.replyTo.messageType === 'voice') && (
                    <div
                      className={`mb-1 w-full min-w-0 max-w-full rounded-xl overflow-hidden text-xs cursor-pointer ${
                        isOwnMessage ? 'bg-[#025144]' : 'bg-[#1a252b]'
                      }`}
                    >
                      <div
                        className={`border-l-[4px] pl-2.5 pr-3 py-1.5 ${
                          isOwnMessage
                            ? 'border-emerald-300'
                            : 'border-green-400'
                        }`}
                      >
                        <p
                          className={`font-bold truncate mb-0.5 ${
                            isOwnMessage ? 'text-emerald-200' : 'text-green-300'
                          }`}
                        >
                          {message.replyTo.sender?.username || 'Unknown'}
                        </p>
                        <p className='text-gray-300/80 truncate leading-snug'>
                          {message.replyTo.messageType === 'voice'
                            ? '🎤 Voice message'
                            : message.replyTo.content?.substring(0, 80)}
                        </p>
                      </div>
                    </div>
                  )}

                {/* Message bubble */}
                {deleted ? (
                  <div className='rounded-2xl px-3.5 py-2 bg-[#202c33]/70 border border-white/5 text-gray-400 italic text-sm'>
                    {renderMessageContent(message.content, true)}
                  </div>
                ) : message.messageType === 'meeting' ? (
                  <div
                    className={`flex min-w-[220px] items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-sm ${
                      isOwnMessage
                        ? 'rounded-br-md border-emerald-400/20 bg-[#075e54] text-white'
                        : 'rounded-bl-md border-white/10 bg-[#202c33] text-gray-100'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        isOwnMessage ? 'bg-white/15' : 'bg-white/10'
                      }`}
                    >
                      <Phone size={20} />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-semibold'>Group voice meeting</p>
                      <p className='mt-0.5 text-xs text-white/65'>
                        {message.meetingDuration > 0
                          ? `${isOwnMessage ? 'Hosted' : 'Joined'} · ${Math.floor(message.meetingDuration / 60)}:${String(message.meetingDuration % 60).padStart(2, '0')}`
                          : `${isOwnMessage ? 'Hosted' : 'Joined'} · Ended`}
                      </p>
                    </div>
                  </div>
                ) : message.messageType === 'call' ? (
                  <div
                    className={`flex min-w-[210px] items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-sm ${
                      isOwnMessage
                        ? 'rounded-br-md border-emerald-400/20 bg-[#075e54] text-white'
                        : 'rounded-bl-md border-white/10 bg-[#202c33] text-gray-100'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        isOwnMessage ? 'bg-white/15' : 'bg-white/10'
                      }`}
                    >
                      {message.callType === 'video' ? (
                        <Video size={21} />
                      ) : (
                        <Phone size={21} />
                      )}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-semibold'>
                        {message.callType === 'video' ? 'Video call' : 'Voice call'}
                      </p>
                      <p className='mt-0.5 text-xs text-white/65'>
                        {message.audioDuration
                          ? `${isOwnMessage ? 'Outgoing' : 'Incoming'} · ${Math.floor(message.audioDuration / 60)}:${String(message.audioDuration % 60).padStart(2, '0')}`
                          : `${isOwnMessage ? 'Outgoing' : 'Incoming'} · No answer`}
                      </p>
                    </div>
                  </div>
                ) : message.messageType === 'voice' ? (
                  /* ── Voice bubble ── */
                  <VoiceMessage
                    messageId={message._id}
                    duration={message.audioDuration}
                    isOwnMessage={isOwnMessage}
                    src={message.audioUrl}
                    uploadState={isOwnMessage ? message._uploadState : null}
                    uploadError={message._uploadError}
                    onRetry={() => onRetryUpload?.(message)}
                    onDiscard={() => onDiscardUpload?.(message)}
                    viewOnce={message.viewOnce}
                    viewedAt={message.viewedAt}
                    onViewOnceOpen={() => consumeViewOnceMedia(message)}
                    onViewOnceComplete={() => completeViewOnceMedia(message)}
                  />
                ) : message.messageType === 'file' ? (
                  <FileAttachment
                    message={message}
                    isOwnMessage={isOwnMessage}
                  />
                ) : message.messageType === 'location' ? (
                  (() => {
                    const location = parseSharedLocation(message.content || '');
                    if (!location) {
                      return (
                        <div className='rounded-2xl bg-[#202c33] px-3.5 py-3 text-sm text-gray-300'>
                          Location unavailable
                        </div>
                      );
                    }
                    return (
                      <React.Suspense
                        fallback={
                          <div className='flex h-64 w-[min(75vw,320px)] items-center justify-center rounded-2xl bg-[#202c33] text-sm text-gray-300'>
                            Loading map…
                          </div>
                        }
                      >
                        <LocationMap
                          latitude={location.latitude}
                          longitude={location.longitude}
                          isOwnMessage={isOwnMessage}
                        />
                      </React.Suspense>
                    );
                  })()
                ) : message.messageType === 'image' ? (
                  /* ── Image bubble ── */
                  message.viewOnce &&
                  !isUploadingMedia &&
                  uploadState !== 'failed' ? (
                    <button
                      type='button'
                      disabled={isOwnMessage || Boolean(message.viewedAt)}
                      onClick={() => void openViewOnceImage(message)}
                      className={`flex h-16 min-w-[190px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold shadow-sm ${
                        isOwnMessage
                          ? 'bg-[#005c4b] text-white'
                          : 'bg-[#202c33] text-white'
                      } disabled:cursor-default`}
                    >
                      <Eye size={22} strokeWidth={1.8} />
                      <span>
                        {viewOnceImageError === String(message._id)
                          ? 'Photo unavailable'
                          : isOwnMessage
                            ? 'Photo · View once'
                            : message.viewedAt
                              ? 'Viewed once'
                              : 'Open photo'}
                      </span>
                    </button>
                  ) : (
                    <div
                    className={`rounded-2xl overflow-hidden cursor-pointer relative group/img shadow-sm p-[3px] ${
                      isOwnMessage
                        ? 'bg-[#005c4b] rounded-br-md'
                        : 'bg-[#202c33] rounded-bl-md'
                    }`}
                    onClick={() => {
                      if (!failedImageIds[message._id] && !isUploadingMedia) {
                        openImageLightbox(message.content);
                      }
                    }}
                  >
                    {message.replyTo && !deleted && message.replyTo.content && (
                      <div
                        className={`mb-1 rounded-xl overflow-hidden text-xs ${isOwnMessage ? 'bg-[#025144]' : 'bg-[#1a252b]'}`}
                      >
                        <div
                          className={`border-l-[4px] pl-2.5 pr-3 py-1.5 ${isOwnMessage ? 'border-emerald-300' : 'border-green-400'}`}
                        >
                          <p
                            className={`font-bold truncate mb-0.5 ${isOwnMessage ? 'text-emerald-200' : 'text-green-300'}`}
                          >
                            {message.replyTo.sender?.username || 'Unknown'}
                          </p>
                          <p className='text-gray-300/80 truncate'>
                            {message.replyTo.messageType === 'voice'
                              ? '🎤 Voice message'
                              : message.replyTo.content?.substring(0, 60)}
                          </p>
                        </div>
                      </div>
                    )}
                    {failedImageIds[message._id] ? (
                      <div className='flex h-[180px] w-full max-w-[260px] md:max-w-[320px] items-center justify-center rounded-[14px] border border-dashed border-white/15 bg-[#111b22] text-center text-gray-300'>
                        <div className='flex flex-col items-center gap-2 px-4'>
                          <ImageOff size={28} className='text-gray-400' />
                          <p className='text-sm font-medium'>
                            Image unavailable
                          </p>
                        </div>
                      </div>
                    ) : (
                      <OptimizedImage
                        src={message.content}
                        thumbnailSrc={message.thumbnailUrl}
                        sizes='(min-width: 768px) 320px, 260px'
                        alt='Photo'
                        width='320'
                        height='320'
                        className='max-w-[260px] md:max-w-[320px] max-h-[320px] w-full aspect-square object-cover rounded-[14px]'
                        loading='lazy'
                        onError={() => {
                          setFailedImageIds((prev) => ({
                            ...prev,
                            [message._id]: true,
                          }));
                        }}
                        onClick={() => openImageLightbox(message.content)}
                      />
                    )}
                    {message.isForwarded && (
                      <p className='absolute top-2 left-2 text-xs text-white/90 bg-black/40 backdrop-blur px-2 py-0.5 rounded-full flex items-center gap-1'>
                        <Forward size={10} /> Forwarded
                      </p>
                    )}

                    {/* Upload lifecycle overlay — the photo is already visible
                        underneath (rendered from the local preview URL). */}
                    {uploadState === 'failed' && (
                      <div
                        className='absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[14px] bg-black/60 px-3 text-center'
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CircleAlert size={22} className='text-red-300' />
                        <p
                          className='max-w-full truncate text-[11px] text-white/85'
                          title={message._uploadError || 'Upload failed'}
                        >
                          {message._uploadError || 'Upload failed'}
                        </p>
                        <div className='flex items-center gap-2'>
                          <button
                            type='button'
                            onClick={() => onRetryUpload?.(message)}
                            className='inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-white/25'
                          >
                            <RotateCcw size={11} /> Retry
                          </button>
                          <button
                            type='button'
                            onClick={() => onDiscardUpload?.(message)}
                            className='rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}

                    {!failedImageIds[message._id] && !isUploadingMedia && (
                      <div className='absolute inset-0 bg-black/0 group-hover/img:bg-black/25 transition-colors flex items-center justify-center'>
                        <ZoomIn
                          size={28}
                          className='text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-lg'
                        />
                      </div>
                    )}
                    </div>
                  )
                ) : isEmojiOnly && !message.storyReply ? (
                  <div className='py-1'>
                    {renderMessageContent(message.content)}
                  </div>
                ) : (
                  <div
                    className={message.storyReply || message.sharedPost
                      ? 'p-0'
                      : `rounded-2xl px-3.5 py-2 break-words text-[14.5px] leading-snug ${
                        isOwnMessage
                          ? 'bg-[#005c4b] text-gray-50 rounded-br-md'
                          : 'bg-[#202c33] text-gray-100 rounded-bl-md'
                      } shadow-sm`}
                  >
                    {message.storyReply && (
                      <button
                        type='button'
                        aria-label='View replied-to story'
                        onClick={() => {
                          const authorId = selectedUser?._id || selectedUser?.id;
                          if (!authorId || !message.storyReply.postId) return;
                          const params = new URLSearchParams({
                            storyUser: String(authorId),
                            storyPost: String(message.storyReply.postId),
                            storySlide: String(message.storyReply.slideIndex || 0),
                          });
                          navigate(`/home?${params.toString()}`, {
                            state: { storyAuthor: selectedUser },
                          });
                        }}
                        className='mb-2 block overflow-hidden rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                      >
                        {message.storyReply.mediaType === 'image' && message.storyReply.mediaUrl ? (
                          <OptimizedImage
                            src={message.storyReply.mediaUrl}
                            thumbnailSrc={message.storyReply.mediaThumbnailUrl}
                            alt='Story image'
                            className='block h-40 w-28 max-w-full object-cover'
                            loading='lazy'
                          />
                        ) : message.storyReply.mediaType === 'board' && message.storyReply.board ? (
                          <div
                            className='relative h-40 w-28 max-w-full overflow-hidden'
                            style={getBoardStyle(message.storyReply.board)}
                          >
                            {getBoardTextElements(message.storyReply.board).map((text, textIndex) => (
                              <div
                                key={`${textIndex}-${text.text}`}
                                className='absolute'
                                style={getBoardTextPositionStyle(text)}
                              >
                                <BoardTextFit board={text} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className='block px-2 py-3 text-xs text-white/70'>Story unavailable</span>
                        )}
                      </button>
                    )}
                    {message.sharedPost && (
                      <button
                        type='button'
                        aria-label='View shared post'
                        onClick={() => {
                          const postId = message.sharedPost?.postId || message.sharedPost?._id;
                          if (!postId) return;
                          navigate(`/home?postId=${encodeURIComponent(postId)}`);
                        }}
                        className='mb-2 block w-[220px] max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#111b21] text-left shadow-sm outline-none transition hover:border-emerald-400/40 focus-visible:ring-2 focus-visible:ring-emerald-400/60'
                      >
                        {message.sharedPost.mediaType === 'image' && (message.sharedPost.mediaThumbnailUrl || message.sharedPost.mediaUrl) ? (
                          <OptimizedImage
                            src={message.sharedPost.mediaUrl || message.sharedPost.mediaThumbnailUrl}
                            thumbnailSrc={message.sharedPost.mediaThumbnailUrl || message.sharedPost.mediaUrl}
                            alt='Shared post media'
                            className='block h-24 w-full object-cover'
                            loading='lazy'
                          />
                        ) : message.sharedPost.mediaType === 'board' && message.sharedPost.board ? (
                          <div
                            className='relative h-24 w-full overflow-hidden'
                            style={getBoardStyle(message.sharedPost.board)}
                          >
                            {getBoardTextElements(message.sharedPost.board).map((text, textIndex) => (
                              <div
                                key={`${textIndex}-${text.text}`}
                                className='absolute'
                                style={getBoardTextPositionStyle(text)}
                              >
                                <BoardTextFit board={text} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className='flex h-24 items-center justify-center bg-gradient-to-br from-emerald-500/15 to-sky-500/10 px-3'>
                            <span className='text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-200'>Shared post</span>
                          </div>
                        )}
                        <div className='flex items-center gap-2 border-t border-white/10 bg-white/[0.02] px-2.5 py-2'>
                          <UserAvatar
                            user={message.sharedPost.author || {}}
                            alt={message.sharedPost.author?.username || 'User'}
                            className='h-6 w-6 rounded-full object-cover'
                          />
                          <span className='truncate text-[11px] font-semibold text-gray-100'>
                            {message.sharedPost.author?.username || 'User'}
                          </span>
                        </div>
                        {message.sharedPost.caption && (
                          <p className='line-clamp-2 px-2.5 pb-2.5 pt-1 text-[11px] leading-snug text-gray-200'>
                            {message.sharedPost.caption}
                          </p>
                        )}
                      </button>
                    )}
                    <div className={message.storyReply && isEmojiOnly
                      ? 'py-1'
                      : message.storyReply || message.sharedPost
                        ? `w-fit max-w-full rounded-2xl px-3.5 py-2 break-words text-[14.5px] leading-snug ${
                        isOwnMessage
                          ? 'bg-[#005c4b] text-gray-50 rounded-br-md'
                          : 'bg-[#202c33] text-gray-100 rounded-bl-md'
                      } shadow-sm`
                        : 'contents'}
                    >
                      {message.isForwarded && (
                        <p className='text-xs italic text-gray-300/70 mb-1 flex items-center gap-1'>
                          <Forward size={11} /> Forwarded
                        </p>
                      )}
                      {message.editedAt && !deleted && (
                        <span className='text-[11px] italic text-gray-300/60 mr-1'>
                          (edited)
                        </span>
                      )}
                      <div className='whitespace-pre-wrap break-words'>
                        {renderMessageContent(message.content)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamp and status */}
                {!editingMessage && (
                  <div
                    className={`text-[11px] mt-0.5 px-1 flex items-center gap-1 flex-wrap ${
                      isOwnMessage ? 'justify-end' : 'justify-start'
                    } ${isEmojiOnly ? 'opacity-70' : ''}`}
                  >
                    <span className='text-gray-400'>
                      {formatMessageTime(message.createdAt)}
                    </span>
                    {isOwnMessage &&
                      !isSendingImage &&
                      !deleted &&
                      message.messageType !== 'meeting' && (
                      <div className='flex items-center gap-1'>
                        {getMessageStatusIcon(message)}
                        <span className='text-gray-400 text-[11px]'>
                          {getStatusText(message)}
                        </span>
                      </div>
                    )}
                    {!isOwnMessage &&
                      message.status === 'read' &&
                      !deleted &&
                      message.messageType !== 'meeting' && (
                      <span className='text-sky-400 text-[11px]'>Seen</span>
                    )}
                  </div>
                )}
                {!deleted && canReactToMessage(message) && message.reactions?.length > 0 && (
                  <div
                    className={`mt-1 flex w-full min-w-0 flex-wrap gap-1.5 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {summarizeReactions(
                      message.reactions,
                      String(currentUser?._id || currentUser?.id || ''),
                    ).map(({ emoji, count, reactedByMe }) => (
                      <button
                        key={emoji}
                        type='button'
                        aria-label={`${emoji}, ${count} reaction${count === 1 ? '' : 's'}${reactedByMe ? ', yours' : ''}`}
                        aria-pressed={reactedByMe}
                        onClick={() => handleReactToMessage(message, emoji)}
                        className={`group inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 ${
                          reactedByMe
                            ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-50 shadow-emerald-500/10'
                            : 'border-white/10 bg-[#111b22]/90 text-gray-50 hover:border-white/15 hover:bg-[#1a252d]'
                        }`}
                      >
                        <span className='text-2xl leading-none transition-transform duration-200 group-hover:scale-125 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.34)]'>
                          {emoji}
                        </span>
                        <span className='min-w-[0.8rem] text-center'>{count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Computer only: three-dots options button (appears on hover) */}
              {isDesktop &&
                !deleted &&
                !editingMessage &&
                !message._isOptimistic &&
                message.messageType !== 'meeting' &&
                (!hidden || isOwnMessage) && (
                  <div
                    className={`shrink-0 self-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${isOwnMessage ? 'order-1 mr-1' : 'order-2 ml-1'}`}
                  >
                    <button
                      onClick={(e) => openActionMenu(e, message, isOwnMessage)}
                      title='Message options'
                      className='p-1.5 rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors'
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                )}
            </div>
          </React.Fragment>
        );
      })}
      <div ref={messagesEndRef} />

      {/* ── Action menu — portal to body: bottom sheet on mobile, dropdown on desktop ── */}
      {actionMenuData &&
        ReactDOM.createPortal(
          <>
            {/* Shared backdrop */}
            <div
              className='fixed inset-0 z-[199] bg-black/50 md:bg-transparent'
              onClick={closeActionMenu}
            />

            {/* ── Mobile: bottom action sheet ── */}
            <div className='fixed bottom-0 left-0 right-0 z-[200] md:hidden sheet-slide-up pb-safe'>
              <div className='bg-[#1f2c34] rounded-t-3xl shadow-2xl shadow-black/60 border-t border-white/10 overflow-hidden'>
                {/* Grab handle */}
                <div className='flex justify-center pt-2.5'>
                  <span className='h-1 w-10 rounded-full bg-white/20' />
                </div>
                {/* Message preview */}
                <div className='mx-4 mt-3 mb-1 rounded-xl px-3.5 py-2.5 bg-black/20 border-l-[3px] border-emerald-400'>
                  <p className='text-xs text-emerald-300 mb-0.5 font-semibold'>
                    {actionMenuData.isOwn
                      ? 'Your message'
                      : `Message from ${actionMenuData.message.sender?.username}`}
                  </p>
                  <p className='text-sm text-gray-300 truncate'>
                    {actionMenuData.message.messageType === 'voice'
                      ? '🎤 Voice message'
                      : actionMenuData.message.messageType === 'image'
                        ? '📷 Photo'
                        : actionMenuData.message.content?.substring(0, 60)}
                  </p>
                </div>
                {canReactToMessage(actionMenuData.message) && (
                  <ReactionPicker
                    onReact={(emoji) => handleReactToMessage(actionMenuData.message, emoji)}
                  />
                )}
                {/* Actions */}
                <div className='py-1'>
                  {actionMenuData.isOwn ? (
                    <>
                      {actionMenuData.message.messageType === 'text' && (
                        <button
                          onClick={() => startEditing(actionMenuData.message)}
                          className='w-full px-5 py-3.5 text-left text-base text-gray-100 hover:bg-white/5 active:bg-white/10 flex items-center gap-4 transition-colors'
                        >
                          <Edit2 size={18} className='text-gray-400' />
                          <span>Edit</span>
                        </button>
                      )}
                      {actionMenuData.message.messageType !== 'voice' &&
                        actionMenuData.message.messageType !== 'image' &&
                        !isOnlyEmojis(actionMenuData.message.content) && (
                        <button
                          onClick={() =>
                            handleCopyMessage(actionMenuData.message.content)
                          }
                          className='w-full px-5 py-3.5 text-left text-base text-gray-100 hover:bg-white/5 active:bg-white/10 flex items-center gap-4 transition-colors'
                        >
                          <Copy size={18} className='text-gray-400' />
                          <span>Copy</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setForwardMessage(actionMenuData.message);
                          closeActionMenu();
                        }}
                        className='w-full px-5 py-3.5 text-left text-base text-gray-100 hover:bg-white/5 active:bg-white/10 flex items-center gap-4 transition-colors'
                      >
                        <Forward size={18} className='text-gray-400' />
                        <span>Forward</span>
                      </button>
                      <div className='border-t border-white/10 my-0.5' />
                      <button
                        onClick={() =>
                          handleDeleteMessage(actionMenuData.message)
                        }
                        className='w-full px-5 py-3.5 text-left text-base text-red-400 hover:bg-red-500/10 active:bg-red-500/15 flex items-center gap-4 transition-colors'
                      >
                        <Trash2 size={18} />
                        <span>Delete</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleReplyClick(actionMenuData.message)}
                        className='w-full px-5 py-3.5 text-left text-base text-gray-100 hover:bg-white/5 active:bg-white/10 flex items-center gap-4 transition-colors'
                      >
                        <Reply size={18} className='text-gray-400' />
                        <span>Reply</span>
                      </button>
                      {actionMenuData.message.messageType !== 'voice' && (
                        <button
                          onClick={() =>
                            handleCopyMessage(actionMenuData.message.content)
                          }
                          className='w-full px-5 py-3.5 text-left text-base text-gray-100 hover:bg-white/5 active:bg-white/10 flex items-center gap-4 transition-colors'
                        >
                          <Copy size={18} className='text-gray-400' />
                          <span>Copy</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setForwardMessage(actionMenuData.message);
                          closeActionMenu();
                        }}
                        className='w-full px-5 py-3.5 text-left text-base text-gray-100 hover:bg-white/5 active:bg-white/10 flex items-center gap-4 transition-colors'
                      >
                        <Forward size={18} className='text-gray-400' />
                        <span>Forward</span>
                      </button>
                      <div className='border-t border-white/10 my-0.5' />
                      <button
                        onClick={() =>
                          handleHideMessage(actionMenuData.message)
                        }
                        className='w-full px-5 py-3.5 text-left text-base text-gray-100 hover:bg-white/5 active:bg-white/10 flex items-center gap-4 transition-colors'
                      >
                        <EyeOff size={18} className='text-gray-400' />
                        <span>Hide</span>
                      </button>
                    </>
                  )}
                </div>
                {/* Cancel */}
                <div className='px-4 pb-3 pt-1'>
                  <button
                    onClick={closeActionMenu}
                    className='w-full py-3 bg-white/10 hover:bg-white/15 text-gray-100 font-semibold text-sm rounded-full transition-colors active:scale-[0.98]'
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>

            {/* ── Desktop: floating dropdown near button ── */}
            <div
              className='fixed z-[200] w-80 max-w-[calc(100vw-16px)] bg-[#233138] rounded-2xl shadow-2xl shadow-black/50 border border-white/10 overflow-hidden animate-fade-in hidden md:block'
              style={{
                ...(actionMenuData.openUpward
                  ? { bottom: `calc(100vh - ${actionMenuData.top}px)` }
                  : { top: actionMenuData.top }),
                ...(actionMenuData.right !== undefined
                  ? { right: actionMenuData.right }
                  : { left: actionMenuData.left }),
              }}
            >
              {canReactToMessage(actionMenuData.message) && (
                <ReactionPicker
                  onReact={(emoji) => handleReactToMessage(actionMenuData.message, emoji)}
                />
              )}
              <div className='py-1.5'>
                {actionMenuData.isOwn ? (
                  <>
                    {actionMenuData.message.messageType === 'text' && (
                      <button
                        onClick={() => startEditing(actionMenuData.message)}
                        className='w-full px-4 py-2.5 text-left text-sm text-gray-100 hover:bg-white/5 flex items-center gap-2.5 transition-colors'
                      >
                        <Edit2 size={14} className='text-gray-400' />
                        <span>Edit</span>
                      </button>
                    )}
                    {actionMenuData.message.messageType !== 'voice' && (
                      <button
                        onClick={() =>
                          handleCopyMessage(actionMenuData.message.content)
                        }
                        className='w-full px-4 py-2.5 text-left text-sm text-gray-100 hover:bg-white/5 flex items-center gap-2.5 transition-colors'
                      >
                        <Copy size={14} className='text-gray-400' />
                        <span>Copy</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setForwardMessage(actionMenuData.message);
                        closeActionMenu();
                      }}
                      className='w-full px-4 py-2.5 text-left text-sm text-gray-100 hover:bg-white/5 flex items-center gap-2.5 transition-colors'
                    >
                      <Forward size={14} className='text-gray-400' />
                      <span>Forward</span>
                    </button>
                    <div className='border-t border-white/10 my-0.5' />
                    <button
                      onClick={() =>
                        handleDeleteMessage(actionMenuData.message)
                      }
                      className='w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors'
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleReplyClick(actionMenuData.message)}
                      className='w-full px-4 py-2.5 text-left text-sm text-gray-100 hover:bg-white/5 flex items-center gap-2.5 transition-colors'
                    >
                      <Reply size={14} className='text-gray-400' />
                      <span>Reply</span>
                    </button>
                    {actionMenuData.message.messageType !== 'voice' && (
                      <button
                        onClick={() =>
                          handleCopyMessage(actionMenuData.message.content)
                        }
                        className='w-full px-4 py-2.5 text-left text-sm text-gray-100 hover:bg-white/5 flex items-center gap-2.5 transition-colors'
                      >
                        <Copy size={14} className='text-gray-400' />
                        <span>Copy</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setForwardMessage(actionMenuData.message);
                        closeActionMenu();
                      }}
                      className='w-full px-4 py-2.5 text-left text-sm text-gray-100 hover:bg-white/5 flex items-center gap-2.5 transition-colors'
                    >
                      <Forward size={14} className='text-gray-400' />
                      <span>Forward</span>
                    </button>
                    <div className='border-t border-white/10 my-0.5' />
                    <button
                      onClick={() => handleHideMessage(actionMenuData.message)}
                      className='w-full px-4 py-2.5 text-left text-sm text-gray-100 hover:bg-white/5 flex items-center gap-2.5 transition-colors'
                    >
                      <EyeOff size={14} className='text-gray-400' />
                      <span>Hide</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}

      {/* Image lightbox — portal so it's never clipped by any container */}
      {lightboxUrl &&
        ReactDOM.createPortal(
          <div
            className='fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center'
            onClick={closeLightbox}
            onWheel={onLightboxWheel}
          >
            <OptimizedImage
              src={lightboxUrl}
              priority
              alt='Full size'
              width='1600'
              height='1600'
              decoding='async'
              className='max-w-[92vw] max-h-[88vh] object-contain rounded-2xl shadow-2xl select-none touch-none'
              style={{
                transform: `translate3d(${lightboxOffset.x}px, ${lightboxOffset.y}px, 0) scale(${lightboxClosing ? 0.92 : 1 - Math.min(0.08, Math.max(Math.abs(lightboxOffset.x), Math.abs(lightboxOffset.y)) / 1800)})`,
                opacity: lightboxClosing
                  ? 0
                  : Math.max(
                      0.35,
                      1 -
                        Math.max(
                          Math.abs(lightboxOffset.x),
                          Math.abs(lightboxOffset.y),
                        ) /
                          500,
                    ),
                transition: lightboxGestureRef.current.active
                  ? 'none'
                  : 'transform 180ms ease, opacity 180ms ease',
                cursor: lightboxGestureRef.current.active ? 'grabbing' : 'grab',
              }}
              onPointerDown={onLightboxPointerDown}
              onPointerMove={onLightboxPointerMove}
              onPointerUp={onLightboxPointerEnd}
              onPointerCancel={onLightboxPointerEnd}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={closeLightbox}
              className='hidden md:flex absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full items-center justify-center transition-colors active:scale-90'
            >
              <X size={20} className='text-white' />
            </button>
          </div>,
          document.body,
        )}

      {viewOnceImage &&
        ReactDOM.createPortal(
          <div
            className='fixed inset-0 z-[210] flex items-center justify-center bg-black/95 p-4'
            onClick={closeViewOnceImage}
          >
            <img
              src={viewOnceImage.url}
              alt='One-time photo'
              className='max-h-[88vh] max-w-[92vw] select-none object-contain'
              onClick={(event) => event.stopPropagation()}
              draggable='false'
            />
            <button
              type='button'
              onClick={closeViewOnceImage}
              aria-label='Close one-time photo'
              className='absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20'
            >
              <X size={20} />
            </button>
          </div>,
          document.body,
        )}

      {/* Forward modal */}
      {forwardMessage && (
        <ForwardModal
          message={forwardMessage}
          users={users}
          groups={groups}
          currentUserId={currentUser?._id || currentUser?.id}
          lastMessages={lastMessages}
          groupLastMessages={groupLastMessages}
          onForward={onForwardMessage}
          onClose={() => setForwardMessage(null)}
        />
      )}
    </div>
  );
};

export default ChatMessages;
