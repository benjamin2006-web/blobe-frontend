import axios from 'axios';
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  Heart,
  AtSign,
  LoaderCircle,
  MessageCircle,
  MoreVertical,
  Plus,
  Smile,
  Send,
  Star,
  ThumbsDown,
  ThumbsUp,
  Reply,
  X,
} from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import MobileBottomNav from '../components/ChatSidebar/MobileBottomNav';
import SidebarTopBar from '../components/ChatSidebar/SidebarTopBar';
import CallModal from '../components/CallModal';
import CommentVoiceRecorder from '../components/CommentVoiceRecorder';
import CreatePostModal from '../components/CreatePostModal';
import SharePostModal from '../components/SharePostModal';
import { BoardEditor, BoardViewer } from '../components/BoardPost';
import BoardTextFit from '../components/BoardTextFit';
import {
  getBoardTextElements,
  getBoardTextStyle,
  getBoardStyle,
  getBoardTextPositionStyle,
} from '../components/BoardPostStyles';
import PostTypeMenu from '../components/PostTypeMenu';
import SettingsModal from '../components/SettingsModal';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useUnreadCounts } from '../contexts/useUnreadCounts';
import {
  useUserAvatarActivity,
  UserAvatarActivityContext,
} from '../contexts/UserAvatarActivityContext';
import { API_URL } from '../utils/apiUrl';
import { getResponsiveImageSources } from '../utils/imageOptimization';
import { cache } from '../utils/offlineCache';
import { createBoardPost } from '../utils/boardPosts';
import OptimizedImage from '../components/OptimizedImage';
import VoiceWaveform from '../components/ChatWindow/Voicewaveform';
import { buildClientId } from '../utils/messageMedia';
import UserAvatar from '../components/UserAvatar';
import UserPostStoryViewer from '../components/UserPostStoryViewer';
import HighlightedText from '../components/HighlightedText';
import useNotifications from '../hooks/useNotifications';
import usePersistentNotifications from '../hooks/usePersistentNotifications';
import { loadChatPage } from '../loadChatPage';

const renderCaptionWithHighlights = (caption, searchTerm = '') => {
  const safeCaption = typeof caption === 'string' ? caption : '';
  const parts = safeCaption.split(/(\s+|[@#][\w-]+)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith('#') || part.startsWith('@')) {
      return (
        <span
          key={`${part}-${index}`}
          className={part.startsWith('@')
            ? 'text-emerald-400'
            : 'text-emerald-400 underline decoration-emerald-400/80 underline-offset-2'}
        >
          <HighlightedText text={part} searchTerm={searchTerm} />
        </span>
      );
    }

    return (
      <span key={`${part}-${index}`}>
        <HighlightedText text={part} searchTerm={searchTerm} />
      </span>
    );
  });
};

const COMMENT_LINK_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/[^\s<]+|www\.[^\s<]+|(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,}(?:\/[^\s<]*)?/gi;
const COMMENT_LINK_TRAILING_PUNCTUATION = /[.,!?;:)\]}]+$/;
const sortStoriesByViewed = (stories) =>
  stories
    .map((story, index) => ({ story, index }))
    .sort((first, second) => (
      Number(Boolean(first.story.hasViewed)) - Number(Boolean(second.story.hasViewed))
      || first.index - second.index
    ))
    .map(({ story }) => story);

const getPostSearchText = (post) => {
  const boardTexts = [post.board, ...(Array.isArray(post.boards) ? post.boards : [])]
    .flatMap((board) => [
      board?.text,
      ...(Array.isArray(board?.texts) ? board.texts.map((text) => text?.text) : []),
    ]);
  return [post.caption, post.author?.username, ...boardTexts]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase();
};

const renderCommentText = (text, searchTerm = '') => {
  const safeText = typeof text === 'string' ? text : '';
  const rendered = [];
  let cursor = 0;
  const appendPlainText = (value, position) => {
    if (!value) return;
    rendered.push(
      <span key={`comment-text-${position}`}>
        {renderCaptionWithHighlights(value, searchTerm)}
      </span>,
    );
  };

  for (const match of safeText.matchAll(COMMENT_LINK_PATTERN)) {
    const matchText = match[0];
    const start = match.index;
    if (start > cursor) {
      appendPlainText(safeText.slice(cursor, start), cursor);
    }

    const link = matchText.replace(COMMENT_LINK_TRAILING_PUNCTUATION, '');
    const trailingText = matchText.slice(link.length);
    if (link) {
      const isEmail = link.includes('@');
      const href = isEmail
        ? `mailto:${link}`
        : /^[a-z][a-z\d+.-]*:/i.test(link)
          ? link
          : `https://${link}`;
      rendered.push(
        <a
          key={`comment-link-${start}`}
          href={href}
          target={isEmail ? undefined : '_blank'}
          rel={isEmail ? undefined : 'noopener noreferrer'}
          className='text-sky-400 underline decoration-sky-400/60 underline-offset-2 hover:text-sky-300'
        >
          <HighlightedText text={link} searchTerm={searchTerm} />
        </a>,
      );
    }
    if (trailingText) {
      appendPlainText(trailingText, start + link.length);
    }
    cursor = start + matchText.length;
  }

  if (cursor < safeText.length) {
    appendPlainText(safeText.slice(cursor), cursor);
  }
  return rendered;
};

const uniqueComments = (comments = []) => {
  const seen = new Set();
  return comments.filter((comment) => {
    const id = String(comment?._id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const COMMENT_STICKERS = [
  { emoji: '🥰', label: 'Love' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😍', label: 'Heart eyes' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '👏', label: 'Applause' },
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '💖', label: 'Sparkling heart' },
  { emoji: '😎', label: 'Cool' },
  { emoji: '🙌', label: 'Praise' },
  { emoji: '🤗', label: 'Hug' },
  { emoji: '💯', label: 'Perfect' },
  { emoji: '🌟', label: 'Star' },
];

const isEmojiOnlyComment = (text) => {
  const value = String(text || '').trim();
  return Boolean(value) &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(value) &&
    /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\s]+$/u.test(value);
};

const formatUpdateTime = (timestamp) => {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Africa/Kigali',
  });
};

const formatPostAge = (timestamp) => {
  if (!timestamp) return '';

  const postedAt = new Date(timestamp).getTime();
  if (Number.isNaN(postedAt)) return '';

  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - postedAt) / 60000),
  );

  if (elapsedMinutes < 1) return 'now';
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min${elapsedMinutes === 1 ? '' : 's'}`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} h${elapsedHours === 1 ? '' : 's'}`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'}`;
};

const Home = () => {
  const [openingChat, setOpeningChat] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState('');
  const searchQuery = submittedSearchTerm.trim();
  const [topBarHidden, setTopBarHidden] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postModalShareToStory, setPostModalShareToStory] = useState(false);
  const [showBoardEditor, setShowBoardEditor] = useState(false);
  const [boardEditorShareToStory, setBoardEditorShareToStory] = useState(false);
  const [boardViewer, setBoardViewer] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchResultsTerm, setSearchResultsTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchMoreError, setSearchMoreError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [suggestedUsersLoading, setSuggestedUsersLoading] = useState(true);
  const [loadedTopAvatars, setLoadedTopAvatars] = useState(new Set());
  const [networkUnavailable, setNetworkUnavailable] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );
  const [connectivityRetry, setConnectivityRetry] = useState(0);
  const [mediaRetryVersion, setMediaRetryVersion] = useState(0);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [homePostPageSize, setHomePostPageSize] = useState(
    () => window.matchMedia('(min-width: 640px)').matches ? 9 : 4,
  );
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [morePostsError, setMorePostsError] = useState(false);
  const [postError, setPostError] = useState('');
  const normalizedSearchTerm = searchQuery.toLocaleLowerCase();
  const serverMatchingPosts = searchResultsTerm === normalizedSearchTerm ? searchResults : [];
  const serverMatchingPostIds = new Set(serverMatchingPosts.map((post) => String(post._id)));
  const localMatchingPosts = normalizedSearchTerm
    ? posts.filter((post) => (
      !serverMatchingPostIds.has(String(post._id))
      && normalizedSearchTerm.split(/\s+/).every((term) => getPostSearchText(post).includes(term))
    ))
    : [];
  const matchingPosts = [...serverMatchingPosts, ...localMatchingPosts];
  const matchingPostIds = new Set(matchingPosts.map((post) => String(post._id)));
  const displayedPosts = normalizedSearchTerm
    ? [
      ...matchingPosts,
      ...posts.filter((post) => !matchingPostIds.has(String(post._id))),
    ]
    : posts;
  const searchIsPending = Boolean(
    normalizedSearchTerm
    && !searchError
    && (searchLoading || searchResultsTerm !== normalizedSearchTerm),
  );
  const displayedHasMore = normalizedSearchTerm ? searchHasMore || hasMorePosts : hasMorePosts;
  const displayedMoreLoading = normalizedSearchTerm ? searchLoadingMore : loadingMorePosts;
  const displayedMoreError = normalizedSearchTerm
    ? searchMoreError || morePostsError
    : morePostsError;
  const [openPostMenuId, setOpenPostMenuId] = useState(null);
  const [followingUsers, setFollowingUsers] = useState(new Set());
  const [pendingFollowUsers, setPendingFollowUsers] = useState(new Set());
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [pendingLikePosts, setPendingLikePosts] = useState(new Set());
  const [likeBursts, setLikeBursts] = useState({});
  const [interestedPosts, setInterestedPosts] = useState(new Set());
  const [recommendCounts, setRecommendCounts] = useState({});
  const [recommendationHintPostId, setRecommendationHintPostId] = useState(null);
  const [galleryIndexes, setGalleryIndexes] = useState({});
  const [loadedMedia, setLoadedMedia] = useState(new Set());
  const [loadedThumbnails, setLoadedThumbnails] = useState(new Set());
  const [mediaRetryCounts, setMediaRetryCounts] = useState({});
  const [imageRatios, setImageRatios] = useState({});
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxDrag, setLightboxDrag] = useState({ x: 0, y: 0 });
  const lightboxDragStart = useRef(null);
  const galleryTouchStart = useRef({});
  const failedMediaKeysRef = useRef(new Set());
  const suppressBoardOpenRef = useRef(false);
  const postsCursorRef = useRef(null);
  const searchCursorRef = useRef(null);
  const searchRequestSequence = useRef(0);
  const searchLoadingMoreRef = useRef(false);
  const hasMorePostsRef = useRef(false);
  const loadingMorePostsRef = useRef(false);
  const homePostPageSizeRef = useRef(homePostPageSize);
  const loadMorePostsRef = useRef(null);
  const loadMoreSearchResultsRef = useRef(null);
  const feedRef = useRef(null);
  const [storyViewer, setStoryViewer] = useState(null);
  const [storyViewerList, setStoryViewerList] = useState(null);
  const [friendStories, setFriendStories] = useState([]);
  const [friendStoriesLoading, setFriendStoriesLoading] = useState(true);
  const [friendStoriesError, setFriendStoriesError] = useState('');
  const friendStoriesRequestSequence = useRef(0);
  const [ownStoryPreview, setOwnStoryPreview] = useState(null);
  const storyRequestSequence = useRef(0);
  const storyViewerRequestSequence = useRef(0);
  const [settingsTab, setSettingsTab] = useState(null);
  const [openComments, setOpenComments] = useState(new Set());
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentPreviews, setCommentPreviews] = useState({});
  const [loadingCommentPreviews, setLoadingCommentPreviews] = useState(new Set());
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loadingComments, setLoadingComments] = useState(new Set());
  const [submittingComments, setSubmittingComments] = useState(new Set());
  const [replyingTo, setReplyingTo] = useState({});
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionUsersLoaded, setMentionUsersLoaded] = useState(false);
  const [loadingMentionUsers, setLoadingMentionUsers] = useState(false);
  const [activeMention, setActiveMention] = useState(null);
  const [commentPickerPostId, setCommentPickerPostId] = useState(null);
  const [commentPickerTab, setCommentPickerTab] = useState('emoji');
  const [recordingCommentPostId, setRecordingCommentPostId] = useState(null);
  const [showAuthorUpdate, setShowAuthorUpdate] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [sharedPostId, setSharedPostId] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [shareCounts, setShareCounts] = useState({});
  const [shareModalPost, setShareModalPost] = useState(null);
  const [shareUsers, setShareUsers] = useState([]);
  const [shareLastMessages, setShareLastMessages] = useState({});
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLoadError, setShareLoadError] = useState('');
  const [shareError, setShareError] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const [shareSending, setShareSending] = useState(false);
  const shareLoadRequestRef = useRef(0);
  const { user, token, logout } = useAuth();
  const avatarActivityByUser = useContext(UserAvatarActivityContext);
  const ownStoryActivity = useUserAvatarActivity(user);
  const hasOwnActiveStories =
    ownStoryActivity.unseen.length > 0 || ownStoryActivity.viewed.length > 0;
  const storyAuthorQueue = useMemo(() => {
    const authors = [
      ...(user && hasOwnActiveStories ? [user] : []),
      ...friendStories.filter((author) => Number(author.storyCount || 0) > 0),
    ];
    const seen = new Set();
    return authors.filter((author) => {
      const authorId = String(author?._id || author?.id || '');
      if (!authorId || seen.has(authorId)) return false;
      seen.add(authorId);
      return true;
    });
  }, [friendStories, hasOwnActiveStories, user]);
  const { socket, isUserOnline } = useSocket();
  const { totalUnread } = useUnreadCounts();
  const { notify } = useNotifications(token);
  const [, setNotifications] = usePersistentNotifications(user?._id || user?.id);
  const navigate = useNavigate();

  const openChat = () => {
    if (openingChat) return;
    flushSync(() => setOpeningChat(true));
    void loadChatPage().catch((error) => {
      console.error('Failed to load the Chat page:', error);
      setOpeningChat(false);
    });
    navigate('/chat');
  };
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingPostId = searchParams.get('postId');
  const pendingCommentId = searchParams.get('commentId');
  const storyUserId = searchParams.get('storyUser');
  const storyPostId = searchParams.get('storyPost');
  const storySlideIndex = Number(searchParams.get('storySlide') || 0);
  const editProfileRequested = searchParams.get('editProfile');
  const handledStoryUserRef = useRef(null);
  const handleMenuAction = (tab) => {
    if (tab === 'profile') {
      navigate(`/dashboard/${encodeURIComponent(user?._id || user?.id)}`, {
        state: { profile: user },
      });
      return;
    }

    setSettingsTab(tab);
  };
  const lastScrollTop = useRef(0);
  const postMenuRef = useRef(null);
  const commentInputRefs = useRef({});
  const mentionUsersRequestRef = useRef(null);
  const requestedCommentPreviewsRef = useRef(new Set());

  const retryFailedMedia = useCallback(() => {
    const failedKeys = [...failedMediaKeysRef.current];
    if (failedKeys.length === 0) return;
    failedMediaKeysRef.current.clear();
    setMediaRetryCounts((current) => {
      const next = { ...current };
      failedKeys.forEach((key) => {
        next[key] = (next[key] || 0) + 1;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const handleOffline = () => setNetworkUnavailable(true);
    const handleOnline = () => {
      setNetworkUnavailable(false);
      setSuggestedUsersLoading(true);
      setLoadedTopAvatars(new Set());
      setMediaRetryVersion((version) => version + 1);
      retryFailedMedia();
      setConnectivityRetry((retry) => retry + 1);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [retryFailedMedia]);

  useEffect(() => {
    if (!networkUnavailable) return undefined;
    const retryTimer = window.setInterval(() => {
      setConnectivityRetry((retry) => retry + 1);
      setSuggestedUsersLoading(true);
      setLoadedTopAvatars(new Set());
      setMediaRetryVersion((version) => version + 1);
      retryFailedMedia();
    }, 5000);
    return () => window.clearInterval(retryTimer);
  }, [networkUnavailable, retryFailedMedia]);

  useEffect(() => {
    const desktopGrid = window.matchMedia('(min-width: 640px)');
    const syncPageSize = (event) => {
      const nextPageSize = event.matches ? 9 : 4;
      homePostPageSizeRef.current = nextPageSize;
      setHomePostPageSize(nextPageSize);
    };
    desktopGrid.addEventListener('change', syncPageSize);
    return () => desktopGrid.removeEventListener('change', syncPageSize);
  }, []);

  useEffect(() => {
    const previewPosts = posts.filter((post) => (
      Number(post.commentCount) > 0
      && !Object.prototype.hasOwnProperty.call(commentPreviews, post._id)
      && !requestedCommentPreviewsRef.current.has(post._id)
    ));
    if (previewPosts.length === 0) return;

    previewPosts.forEach((post) => requestedCommentPreviewsRef.current.add(post._id));
    setLoadingCommentPreviews((current) => new Set([
      ...current,
      ...previewPosts.map((post) => post._id),
    ]));
    void Promise.all(previewPosts.map(async (post) => {
      try {
        const { data } = await axios.get(`${API_URL}/posts/${post._id}/comments`, {
          params: { preview: true },
          headers: { Authorization: ['Bearer', token].join(' ') },
        });
        setCommentPreviews((current) => ({
          ...current,
          [post._id]: (data.comments || []).slice(0, 3),
        }));
      } catch (error) {
        requestedCommentPreviewsRef.current.delete(post._id);
        setPostError(error.response?.data?.message || 'Could not load post comments.');
      } finally {
        setLoadingCommentPreviews((current) => {
          const next = new Set(current);
          next.delete(post._id);
          return next;
        });
      }
    }));
  }, [commentPreviews, posts, token]);

  useEffect(() => {
    if (!openPostMenuId) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!postMenuRef.current?.contains(event.target)) {
        setOpenPostMenuId(null);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenPostMenuId(null);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openPostMenuId]);

  useEffect(() => {
    const updateVisibilityTimer = window.setInterval(() => {
      setShowAuthorUpdate((visible) => !visible);
    }, 3000);
    const currentTimeTimer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(updateVisibilityTimer);
      window.clearInterval(currentTimeTimer);
    };
  }, []);

  const openPostTypeMenu = () => setAddMenuOpen((open) => !open);
  const handlePostTypeSelect = (type) => {
    setAddMenuOpen(false);
    if (type === 'photo' || type === 'photoStory') {
      setPostModalShareToStory(type === 'photoStory');
      setShowPostModal(true);
    }
    if (type === 'board' || type === 'boardStory') {
      setBoardEditorShareToStory(type === 'boardStory');
      setShowBoardEditor(true);
    }
  };

  const handleBoardSave = async (boards, options) => {
    const post = await createBoardPost(token, boards, options);
    setShowBoardEditor(false);
    if (options?.shareToStory) {
      const authorId = String(user?._id || user?.id || '');
      const storyParams = new URLSearchParams({
        storyUser: authorId,
        storyPost: String(post._id),
      });
      navigate(`/home?${storyParams.toString()}`, { state: { storyAuthor: user } });
    } else {
      navigate(`/home?postId=${encodeURIComponent(post._id)}`);
    }
  };

  const postShareUrl = (post) => {
    const url = new URL('/home', window.location.origin);
    url.searchParams.set('postId', post._id);
    return url.toString();
  };

  const markPostShared = (post, count = 1) => {
    setShareCounts((current) => ({
      ...current,
      [post._id]:
        (current[post._id] ?? post.shareCount ?? post.shares?.length ?? 0) + count,
    }));
    setSharedPostId(post._id);
    window.setTimeout(() => {
      setSharedPostId((current) => (current === post._id ? null : current));
    }, 2000);
  };

  const loadShareRecipients = async () => {
    const requestId = ++shareLoadRequestRef.current;
    setShareLoading(true);
    setShareLoadError('');
    setShareError('');
    setShareNotice('');
    try {
      const headers = { Authorization: ['Bearer', token].join(' ') };
      const [usersResponse, recentResponse] = await Promise.all([
        axios.get(`${API_URL}/users`, { headers }),
        axios.get(`${API_URL}/messages/recent-contacts`, { headers }),
      ]);
      if (requestId !== shareLoadRequestRef.current) return;

      const users = usersResponse.data.users || [];
      const recentUsers = recentResponse.data.users || [];
      const usersById = new Map(
        users.map((candidate) => [String(candidate._id || candidate.id), candidate]),
      );
      const lastMessages = {};
      recentUsers.forEach((recentUser) => {
        const id = String(recentUser._id || recentUser.id);
        if (id && recentUser.lastMessageAt) {
          lastMessages[id] = { timestamp: recentUser.lastMessageAt };
        }
        if (id && !usersById.has(id)) {
          usersById.set(id, recentUser);
        }
      });
      setShareUsers([...usersById.values()]);
      setShareLastMessages(lastMessages);
    } catch (error) {
      if (requestId === shareLoadRequestRef.current) {
        setShareLoadError(
          error.response?.data?.message || 'Could not load people to share with.',
        );
      }
    } finally {
      if (requestId === shareLoadRequestRef.current) setShareLoading(false);
    }
  };

  const openPostShare = (post) => {
    setShareModalPost(post);
    setShareUsers([]);
    setShareLastMessages({});
    void loadShareRecipients();
  };

  const handleSharePost = (post) => openPostShare(post);

  const handleCopyPostLink = async () => {
    if (!shareModalPost) return;
    const postUrl = postShareUrl(shareModalPost);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(postUrl);
      } else {
        const temporaryInput = document.createElement('textarea');
        temporaryInput.value = postUrl;
        temporaryInput.setAttribute('readonly', '');
        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        document.body.appendChild(temporaryInput);
        let copied;
        try {
          temporaryInput.select();
          copied = document.execCommand('copy');
        } finally {
          temporaryInput.remove();
        }
        if (!copied) throw new Error('Could not copy post link.');
      }
      markPostShared(shareModalPost);
      setShareError('');
      setShareNotice('Link copied.');
    } catch (error) {
      setShareNotice('');
      setShareError(error.message || 'Could not copy the post link.');
    }
  };

  const handleNativePostShare = async () => {
    if (!shareModalPost || !navigator.share) return;
    try {
      await navigator.share({
        title: `${shareModalPost.author?.username || 'A user'} shared a post`,
        text: shareModalPost.caption || 'Check out this post on Chatt.',
        url: postShareUrl(shareModalPost),
      });
      markPostShared(shareModalPost);
      setShareNotice('Shared using your device sharing options.');
    } catch (error) {
      if (error.name !== 'AbortError') {
        setShareNotice('');
        setShareError(error.message || 'Could not share this post.');
      }
    }
  };

  const handleSocialPostShare = (platform) => {
    if (!shareModalPost) return;
    const postUrl = postShareUrl(shareModalPost);
    const shareText = `${shareModalPost.author?.username || 'Someone'} shared a post with you: ${postUrl}`;
    const destination = platform === 'whatsapp'
      ? `https://wa.me/?text=${encodeURIComponent(shareText)}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;
    window.open(destination, '_blank', 'noopener,noreferrer');
    markPostShared(shareModalPost);
    setShareError('');
    setShareNotice(`Opening ${platform === 'whatsapp' ? 'WhatsApp' : 'Facebook'}…`);
  };

  const handleSendPostToUsers = async (recipientIds) => {
    if (!shareModalPost) return { failedIds: recipientIds };
    if (!socket?.connected) {
      setShareError('Connect to the internet before sending this post.');
      return { failedIds: recipientIds };
    }

    const post = shareModalPost;
    const postUrl = postShareUrl(post);
    const messageContent = `${post.author?.username || 'Someone'} shared a post with you:\n${postUrl}`;
    const sharedPostPayload = {
      postId: String(post._id),
      url: postUrl,
      caption: post.caption || '',
      mediaType: post.mediaType || 'image',
      mediaUrl: post.mediaUrl || post.mediaThumbnailUrl || '',
      mediaThumbnailUrl: post.mediaThumbnailUrl || post.mediaUrl || '',
      author: {
        _id: post.author?._id || post.author?.id || '',
        username: post.author?.username || 'Unknown user',
        avatar: post.author?.avatar || post.author?.avatarThumbnail || '',
      },
      board: post.board || post.boards?.[0] || null,
    };
    const pending = new Map(
      recipientIds.map((id) => [buildClientId('post'), String(id)]),
    );
    const successfulIds = [];
    const failedIds = [];
    setShareSending(true);
    setShareError('');
    setShareNotice('');

    return new Promise((resolve) => {
      let timeoutId;
      let finished = false;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        socket.off('message_sent', onMessageSent);
        socket.off('message_error', onMessageError);
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        setShareSending(false);
        if (successfulIds.length) markPostShared(post, successfulIds.length);
        if (failedIds.length) {
          setShareError(
            `Could not send to ${failedIds.length} ${failedIds.length === 1 ? 'person' : 'people'}. Retry to send again.`,
          );
        } else {
          setShareModalPost(null);
        }
        resolve({ failedIds });
      };
      const settle = (clientId, failed) => {
        if (!pending.has(clientId)) return;
        const recipientId = pending.get(clientId);
        pending.delete(clientId);
        if (failed) failedIds.push(recipientId);
        else successfulIds.push(recipientId);
        if (!pending.size) finish();
      };
      const onMessageSent = (message) => {
        settle(String(message?.clientId || ''), false);
      };
      const onMessageError = (error) => {
        settle(String(error?.clientId || ''), true);
      };

      socket.on('message_sent', onMessageSent);
      socket.on('message_error', onMessageError);
      timeoutId = window.setTimeout(() => {
        pending.forEach((recipientId) => failedIds.push(recipientId));
        pending.clear();
        finish();
      }, 15000);

      pending.forEach((recipientId, clientId) => {
        socket.emit('send_message', {
          receiverId: recipientId,
          content: messageContent,
          messageType: 'text',
          sharedPost: sharedPostPayload,
          clientId,
        });
      });
    });
  };

  const mediaKey = (postId, mediaUrl) => `${postId}:${mediaUrl}`;

  const markMediaLoaded = (postId, mediaUrl) => {
    setLoadedMedia((current) => {
      const key = mediaKey(postId, mediaUrl);
      if (current.has(key)) return current;
      return new Set(current).add(key);
    });
  };

  const handleFeedScroll = (event) => {
    const scrollTop = event.currentTarget.scrollTop;
    const delta = scrollTop - lastScrollTop.current;
    lastScrollTop.current = scrollTop;

    if (
      event.currentTarget.scrollHeight -
        event.currentTarget.scrollTop -
        event.currentTarget.clientHeight <
      720
    ) {
      if (normalizedSearchTerm && searchHasMore) loadMoreSearchResultsRef.current?.();
      else loadMorePostsRef.current?.();
    }
    if (Math.abs(delta) < 4) return;
    if (scrollTop <= 8) {
      setTopBarHidden(false);
    } else if (delta < 0) {
      setTopBarHidden(false);
    } else if (scrollTop > 96) {
      setTopBarHidden(true);
    }
  };

  useEffect(() => {
    lastScrollTop.current = 0;
    feedRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setTopBarHidden(false);
  }, [searchQuery]);

  const normalizePosts = useCallback((entries) => {
    const currentUserId = String(user?._id || user?.id || '');
    return entries.map((post) => {
      if ((post.viewers || []).some((viewer) => (
        String(viewer?._id || viewer?.id || viewer) === currentUserId
      ))) {
        return post;
      }
      return {
        ...post,
        viewers: [
          ...(post.viewers || []),
          { _id: currentUserId, username: user?.username, avatar: user?.avatar },
        ],
      };
    });
  }, [user]);

  useEffect(() => {
    const requestId = ++searchRequestSequence.current;
    if (!searchQuery) {
      setSearchResults([]);
      setSearchResultsTerm('');
      setSearchLoading(false);
      setSearchLoadingMore(false);
      setSearchError('');
      setSearchMoreError(false);
      setSearchHasMore(false);
      searchCursorRef.current = null;
      searchLoadingMoreRef.current = false;
      return undefined;
    }

    setSearchResults([]);
    setSearchResultsTerm('');
    setSearchLoading(true);
    setSearchLoadingMore(false);
    setSearchError('');
    setSearchMoreError(false);
    setSearchHasMore(false);
    searchCursorRef.current = null;
    searchLoadingMoreRef.current = false;
    let controller;
    const timer = window.setTimeout(async () => {
      controller = new AbortController();
      try {
        const { data } = await axios.get(`${API_URL}/posts`, {
          params: { search: searchQuery, limit: 20 },
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (requestId !== searchRequestSequence.current) return;
        const foundPosts = normalizePosts(
          (data.posts || []).filter((post) => post.shareToStory !== true),
        );
        setSearchResults(foundPosts);
        setSearchResultsTerm(normalizedSearchTerm);
        const currentUserId = String(user?._id || user?.id || '');
        setLikedPosts((current) => {
          const next = new Set(current);
          foundPosts.forEach((post) => {
            const postId = String(post._id);
            if ((post.likes || []).some((like) => String(like._id || like) === currentUserId)) {
              next.add(postId);
            } else {
              next.delete(postId);
            }
          });
          return next;
        });
        searchCursorRef.current = data.nextCursor || null;
        setSearchHasMore(Boolean(data.hasMore));
      } catch (error) {
        if (requestId !== searchRequestSequence.current || axios.isCancel(error)) return;
        console.error('Failed to search posts:', error);
        setSearchError(error.response?.data?.message || 'Could not search posts.');
      } finally {
        if (requestId === searchRequestSequence.current) setSearchLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [normalizedSearchTerm, normalizePosts, searchQuery, searchRetry, token, user]);

  const loadMoreSearchResults = useCallback(async () => {
    if (
      searchLoadingMoreRef.current
      || !searchHasMore
      || !searchCursorRef.current
      || !searchQuery
    ) {
      return;
    }
    const requestId = searchRequestSequence.current;
    searchLoadingMoreRef.current = true;
    setSearchLoadingMore(true);
    setSearchMoreError(false);
    try {
      const { data } = await axios.get(`${API_URL}/posts`, {
        params: {
          search: searchQuery,
          limit: 20,
          cursor: searchCursorRef.current,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (requestId !== searchRequestSequence.current) return;
      const foundPosts = normalizePosts(
        (data.posts || []).filter((post) => post.shareToStory !== true),
      );
      setSearchResults((current) => {
        const postIds = new Set(current.map((post) => String(post._id)));
        return [...current, ...foundPosts.filter((post) => !postIds.has(String(post._id)))];
      });
      setSearchResultsTerm(normalizedSearchTerm);
      const currentUserId = String(user?._id || user?.id || '');
      setLikedPosts((current) => {
        const next = new Set(current);
        foundPosts.forEach((post) => {
          const postId = String(post._id);
          if ((post.likes || []).some((like) => String(like._id || like) === currentUserId)) {
            next.add(postId);
          } else {
            next.delete(postId);
          }
        });
        return next;
      });
      searchCursorRef.current = data.nextCursor || null;
      setSearchHasMore(Boolean(data.hasMore));
    } catch (error) {
      if (requestId !== searchRequestSequence.current) return;
      console.error('Failed to load more search results:', error);
      setSearchMoreError(true);
    } finally {
      if (requestId === searchRequestSequence.current) {
        searchLoadingMoreRef.current = false;
        setSearchLoadingMore(false);
      }
    }
  }, [normalizePosts, normalizedSearchTerm, searchHasMore, searchQuery, token, user]);

  useEffect(() => {
    loadMoreSearchResultsRef.current = loadMoreSearchResults;
  }, [loadMoreSearchResults]);

  const submitHomeSearch = (query) => {
    const trimmedQuery = query.trim();
    setSubmittedSearchTerm(trimmedQuery);
    if (trimmedQuery) setSearchRetry((retry) => retry + 1);
  };

  const recordPostViews = useCallback(async (entries) => {
    if (!navigator.onLine) return;
    await Promise.allSettled(
      entries.map((post) =>
        axios.post(`${API_URL}/posts/${post._id}/view`, null, {
          headers: { Authorization: ['Bearer', token].join(' ') },
        }),
      ),
    );
  }, [token]);

  useEffect(() => {
    if (!editProfileRequested) return;
    const frame = window.requestAnimationFrame(() => {
      setSettingsTab('account');
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('editProfile');
      setSearchParams(nextParams, { replace: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editProfileRequested, searchParams, setSearchParams]);

  const openDashboard = (profile) => {
    const profileId = profile?._id || profile?.id;
    if (!profileId) return;
    navigate(`/dashboard/${encodeURIComponent(profileId)}`, { state: { profile } });
  };

  const loadPosts = useCallback(async () => {
    const cachedPosts = cache.get('home_posts');
    const cachedImagePosts = Array.isArray(cachedPosts)
      ? cachedPosts.filter((post) => (
        (post.mediaType === 'image' || post.mediaType === 'board')
        && post.shareToStory !== true
      ))
      : null;
    if (cachedImagePosts) {
      setPosts(cachedImagePosts.slice(0, homePostPageSizeRef.current));
      const currentUserId = String(user?._id || user?.id || '');
      setLikedPosts(new Set(cachedImagePosts
        .filter((post) => (post.likes || []).some((like) => String(like._id || like) === currentUserId))
        .map((post) => String(post._id))));
      setLoadingPosts(false);
    } else {
      setLoadingPosts(true);
    }
    setPostError('');
    setMorePostsError(false);
    postsCursorRef.current = null;
    hasMorePostsRef.current = false;
    setHasMorePosts(false);
    try {
      const { data } = await axios.get(`${API_URL}/posts`, {
        params: { limit: homePostPageSizeRef.current },
        headers: { Authorization: ['Bearer', token].join(' ') },
      });
      setNetworkUnavailable(false);
      const nextPosts = data.posts || [];
      const postsWithCurrentViewer = normalizePosts(
        nextPosts.filter((post) => post.shareToStory !== true),
      );
      setPosts(postsWithCurrentViewer);
      const currentUserId = String(user?._id || user?.id || '');
      setLikedPosts((current) => {
        const postIds = new Set(postsWithCurrentViewer.map((post) => String(post._id)));
        const next = new Set([...current].filter((postId) => !postIds.has(postId)));
        postsWithCurrentViewer.forEach((post) => {
          if ((post.likes || []).some((like) => String(like._id || like) === currentUserId)) {
            next.add(String(post._id));
          }
        });
        return next;
      });
      cache.set('home_posts', postsWithCurrentViewer);
      postsCursorRef.current = data.nextCursor || null;
      hasMorePostsRef.current = Boolean(data.hasMore);
      setHasMorePosts(hasMorePostsRef.current);
      await recordPostViews(nextPosts);
    } catch (error) {
      if (!error.response) setNetworkUnavailable(true);
      setPostError(
        Array.isArray(cachedPosts) || !error.response
          ? ''
          : error.response?.data?.message || 'Could not load posts.',
      );
    } finally {
      setLoadingPosts(false);
    }
  }, [normalizePosts, recordPostViews, token, user]);

  const loadMorePosts = useCallback(async () => {
    if (
      loadingMorePostsRef.current ||
      !hasMorePostsRef.current ||
      !postsCursorRef.current
    ) {
      return;
    }
    loadingMorePostsRef.current = true;
    setLoadingMorePosts(true);
    setMorePostsError(false);
    try {
      const { data } = await axios.get(`${API_URL}/posts`, {
        params: { limit: homePostPageSizeRef.current, cursor: postsCursorRef.current },
        headers: { Authorization: ['Bearer', token].join(' ') },
      });
      setNetworkUnavailable(false);
      const nextPosts = data.posts || [];
      const postsWithCurrentViewer = normalizePosts(
        nextPosts.filter((post) => post.shareToStory !== true),
      );
      const currentUserId = String(user?._id || user?.id || '');
      setLikedPosts((current) => {
        const next = new Set(current);
        postsWithCurrentViewer.forEach((post) => {
          const postId = String(post._id);
          if ((post.likes || []).some((like) => String(like._id || like) === currentUserId)) {
            next.add(postId);
          } else {
            next.delete(postId);
          }
        });
        return next;
      });
      setPosts((current) => {
        const ids = new Set(current.map((post) => String(post._id)));
        const appended = [...current];
        postsWithCurrentViewer.forEach((post) => {
          if (!ids.has(String(post._id))) {
            ids.add(String(post._id));
            appended.push(post);
          }
        });
        cache.set('home_posts', appended);
        return appended;
      });
      postsCursorRef.current = data.nextCursor || null;
      hasMorePostsRef.current = Boolean(data.hasMore);
      setHasMorePosts(hasMorePostsRef.current);
      await recordPostViews(nextPosts);
    } catch (error) {
      if (!error.response) setNetworkUnavailable(true);
      console.error('Failed to load more posts:', error);
      setMorePostsError(true);
    } finally {
      loadingMorePostsRef.current = false;
      setLoadingMorePosts(false);
    }
  }, [normalizePosts, recordPostViews, token, user]);

  useEffect(() => {
    loadMorePostsRef.current = loadMorePosts;
  }, [loadMorePosts]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) loadPosts();
    });
    return () => {
      cancelled = true;
    };
  }, [connectivityRetry, loadPosts]);

  useEffect(() => {
    const handlePostUploaded = (event) => {
      const uploadedPost = event.detail;
      if (!uploadedPost?._id) return;
      if (uploadedPost.shareToStory === true) return;
      const post = normalizePosts([uploadedPost])[0];
      setPosts((current) => {
        const next = [post, ...current.filter((entry) => entry._id !== post._id)];
        cache.set('home_posts', next);
        return next;
      });
    };
    window.addEventListener('post-uploaded', handlePostUploaded);
    return () => window.removeEventListener('post-uploaded', handlePostUploaded);
  }, [normalizePosts]);

  useEffect(() => {
    if (!pendingPostId || loadingPosts) return;
    if (postError) return;
    const targetExists = posts.some((post) => String(post._id) === pendingPostId);
    if (!targetExists) {
      if (hasMorePostsRef.current) loadMorePostsRef.current?.();
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`post-${pendingPostId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (pendingCommentId) {
        setOpenComments((current) => new Set(current).add(pendingPostId));
        return;
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('postId');
      setSearchParams(nextParams, { replace: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadingPosts, pendingCommentId, pendingPostId, postError, posts, searchParams, setSearchParams]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleIncomingCall = (data) => {
      setIncomingCall(data);
    };

    socket.on('incoming_call', handleIncomingCall);
    return () => socket.off('incoming_call', handleIncomingCall);
  }, [socket]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleCommentReply = (data) => {
      const actorId = String(data?.actorId || '');
      const meId = String(user?._id || user?.id || '');
      if (!actorId || !meId || actorId === meId) return;
      const commentId = String(data?.commentId || '');
      const postId = String(data?.postId || '');
      setNotifications((current) => {
        const id = `comment_reply:${commentId}`;
        if (current.some((notification) => notification.id === id)) return current;
        return [{
          id,
          type: 'comment_reply',
          text: data?.preview || `${data?.actorName || 'Someone'} replied to your comment`,
          timestamp: new Date().toISOString(),
          read: false,
          actorId,
          actorAvatar: data?.actorAvatar,
          postId,
          commentId,
          parentCommentId: data?.parentCommentId,
        }, ...current].slice(0, 100);
      });
      notify(
        `${data?.actorName || 'Someone'} replied`,
        data?.preview || 'Someone replied to your comment.',
        data?.actorAvatar || undefined,
      );
    };

    const handleCommentMention = (data) => {
      const actorId = String(data?.actorId || '');
      const meId = String(user?._id || user?.id || '');
      if (!actorId || !meId || actorId === meId) return;
      const commentId = String(data?.commentId || '');
      const postId = String(data?.postId || '');
      setNotifications((current) => {
        const id = `comment_mention:${commentId}`;
        if (current.some((notification) => notification.id === id)) return current;
        return [{
          id,
          type: 'comment_mention',
          text: data?.preview || `${data?.actorName || 'Someone'} mentioned you in a comment`,
          timestamp: new Date().toISOString(),
          read: false,
          actorId,
          actorAvatar: data?.actorAvatar,
          postId,
          commentId,
        }, ...current].slice(0, 100);
      });
      notify(
        `${data?.actorName || 'Someone'} mentioned you`,
        data?.preview || 'You were mentioned in a comment.',
        data?.actorAvatar || undefined,
      );
    };

    const handlePostLikesUpdated = (data) => {
      const postId = String(data?.postId || '');
      if (!postId) return;
      setPosts((current) => current.map((post) => (
        String(post._id) === postId
          ? {
              ...post,
              likes: data.likes || [],
              likeCount: data.likeCount,
              likedByNames: data.likedByNames || [],
            }
          : post
      )));
      if (String(data.userId) === String(user?._id || user?.id || '')) {
        setLikedPosts((current) => {
          const next = new Set(current);
          if (data.liked) next.add(postId);
          else next.delete(postId);
          return next;
        });
      }
    };

    const handlePostCommentCreated = (data) => {
      const postId = String(data?.postId || '');
      if (!postId) return;
      setPosts((current) => current.map((post) => (
        String(post._id) === postId
          ? { ...post, commentCount: data.commentCount }
          : post
      )));
      if (data.comment) {
        setCommentPreviews((current) => (
          Object.prototype.hasOwnProperty.call(current, postId)
            ? {
                ...current,
                [postId]: [
                  data.comment,
                  ...current[postId].filter(
                    (comment) => String(comment._id) !== String(data.comment._id),
                  ),
                ].slice(0, 3),
              }
            : current
        ));
        setCommentsByPost((current) => {
          if (!Object.prototype.hasOwnProperty.call(current, postId)) return current;
          const comments = current[postId] || [];
          if (comments.some((comment) => String(comment._id) === String(data.comment._id))) {
            return current;
          }
          return { ...current, [postId]: uniqueComments([...comments, data.comment]) };
        });
      }
    };

    const handlePostDeleted = (data) => {
      const postId = String(data?.postId || '');
      if (!postId) return;
      setPosts((current) => {
        const next = current.filter((post) => String(post._id) !== postId);
        cache.set('home_posts', next);
        return next;
      });
    };

    socket.on('comment_reply', handleCommentReply);
    socket.on('comment_mention', handleCommentMention);
    socket.on('post_likes_updated', handlePostLikesUpdated);
    socket.on('post_comment_created', handlePostCommentCreated);
    socket.on('post_deleted', handlePostDeleted);
    return () => {
      socket.off('comment_reply', handleCommentReply);
      socket.off('comment_mention', handleCommentMention);
      socket.off('post_likes_updated', handlePostLikesUpdated);
      socket.off('post_comment_created', handlePostCommentCreated);
      socket.off('post_deleted', handlePostDeleted);
    };
  }, [socket, user, notify, setNotifications]);

  useEffect(() => {
    if (!token || !user?.gender) return;

    const loadSuggestedUser = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/users`, {
          headers: { Authorization: ['Bearer', token].join(' ') },
        });
        setNetworkUnavailable(false);
        const oppositeGender =
          String(user.gender).toLowerCase() === 'male' ? 'female' : 'male';
        const candidates = (data.users || data || [])
          .filter(
            (candidate) =>
              String(candidate._id) !== String(user._id || user.id) &&
              String(candidate.gender || '').toLowerCase() === oppositeGender,
          )
          .sort(
            (first, second) =>
              Number(
                isUserOnline(second._id) || Boolean(second.isOnline),
              ) -
              Number(isUserOnline(first._id) || Boolean(first.isOnline)),
          );
        setSuggestedUsers(candidates);
      } catch (error) {
        if (!error.response) setNetworkUnavailable(true);
      } finally {
        setSuggestedUsersLoading(false);
      }
    };

    loadSuggestedUser();
  }, [connectivityRetry, isUserOnline, token, user]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    axios.get(`${API_URL}/users/following`, {
      headers: { Authorization: ['Bearer', token].join(' ') },
    }).then(({ data }) => {
      if (active && Array.isArray(data.userIds)) {
        setFollowingUsers(new Set(data.userIds.map(String)));
      }
    }).catch((error) => {
      console.error('Could not load followed accounts:', error);
    });
    return () => {
      active = false;
    };
  }, [token]);

  const toggleFollowUser = async (targetUserId) => {
    if (pendingFollowUsers.has(targetUserId)) return;
    setPendingFollowUsers((current) => new Set(current).add(targetUserId));
    try {
      const { data } = await axios.post(
        `${API_URL}/users/${targetUserId}/follow`,
        null,
        { headers: { Authorization: ['Bearer', token].join(' ') }, timeout: 30000 },
      );
      setFollowingUsers((current) => {
        const next = new Set(current);
        if (data.following) next.add(targetUserId);
        else next.delete(targetUserId);
        return next;
      });
      setPosts((current) => current.map((post) => (
        String(post.author?._id || post.author?.id) === targetUserId
          ? { ...post, author: { ...post.author, followerCount: data.followerCount } }
          : post
      )));
      setSuggestedUsers((current) => current.map((candidate) => (
        String(candidate._id || candidate.id) === targetUserId
          ? { ...candidate, followerCount: data.followerCount }
          : candidate
      )));
    } catch (error) {
      setPostError(error.response?.data?.message || 'Could not update follow.');
    } finally {
      setPendingFollowUsers((current) => {
        const next = new Set(current);
        next.delete(targetUserId);
        return next;
      });
    }
  };

  const handleLike = async (postId) => {
    if (pendingLikePosts.has(postId)) return;
    setPendingLikePosts((current) => new Set(current).add(postId));
    try {
      const { data } = await axios.post(
        `${API_URL}/posts/${postId}/like`,
        null,
        { headers: { Authorization: ['Bearer', token].join(' ') }, timeout: 30000 },
      );
      setLikedPosts((current) => {
        const next = new Set(current);
        if (data.liked) next.add(String(postId));
        else next.delete(String(postId));
        return next;
      });
      setPosts((current) => current.map((post) => (
        String(post._id) === String(postId)
          ? {
              ...post,
              likes: data.likes || [],
              likeCount: data.likeCount,
              likedByNames: data.likedByNames || [],
            }
          : post
      )));
      if (data.liked) {
        setLikeBursts((current) => ({ ...current, [postId]: Date.now() }));
        window.setTimeout(() => {
          setLikeBursts((current) => {
            const next = { ...current };
            delete next[postId];
            return next;
          });
        }, 1300);
      }
    } catch (error) {
      setPostError(error.response?.data?.message || 'Could not update post like.');
    } finally {
      setPendingLikePosts((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  };

  const toggleComments = async (postId) => {
    const isOpen = openComments.has(postId);
    setOpenComments((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(postId);
      else next.add(postId);
      return next;
    });
    if (isOpen || commentsByPost[postId]) return;

    setLoadingComments((current) => new Set(current).add(postId));
    try {
      const { data } = await axios.get(`${API_URL}/posts/${postId}/comments`, {
        headers: { Authorization: ['Bearer', token].join(' ') },
      });
      setCommentsByPost((current) => ({
        ...current,
        [postId]: uniqueComments(data.comments || []),
      }));
    } catch (error) {
      setPostError(error.response?.data?.message || 'Could not load comments.');
    } finally {
      setLoadingComments((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!pendingPostId || !pendingCommentId || loadingPosts) return;
    if (!posts.some((post) => String(post._id) === pendingPostId)) return;

    const frame = window.requestAnimationFrame(() => {
      if (!openComments.has(pendingPostId)) {
        setOpenComments((current) => new Set(current).add(pendingPostId));
      }

      if (!Object.prototype.hasOwnProperty.call(commentsByPost, pendingPostId)) {
        if (loadingComments.has(pendingPostId)) return;
        setLoadingComments((current) => new Set(current).add(pendingPostId));
        void axios.get(`${API_URL}/posts/${pendingPostId}/comments`, {
          headers: { Authorization: ['Bearer', token].join(' ') },
        }).then(({ data }) => {
          setCommentsByPost((current) => ({
            ...current,
            [pendingPostId]: uniqueComments(data.comments || []),
          }));
        }).catch((error) => {
          setPostError(error.response?.data?.message || 'Could not load comments.');
        }).finally(() => {
          setLoadingComments((current) => {
            const next = new Set(current);
            next.delete(pendingPostId);
            return next;
          });
        });
        return;
      }

      if (!openComments.has(pendingPostId)) return;
      if (!(commentsByPost[pendingPostId] || []).some(
        (comment) => String(comment._id) === pendingCommentId,
      )) return;
      const target = document.getElementById(`comment-${pendingCommentId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('postId');
      nextParams.delete('commentId');
      setSearchParams(nextParams, { replace: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    commentsByPost,
    loadingComments,
    loadingPosts,
    openComments,
    pendingCommentId,
    pendingPostId,
    posts,
    searchParams,
    setSearchParams,
    token,
  ]);

  const submitComment = async (postId, textOverride) => {
    const text = (textOverride ?? commentDrafts[postId])?.trim();
    if (!text) return;
    const replyCommentId = replyingTo[postId];
    const requestUrl = replyCommentId
      ? `${API_URL}/posts/comments/${replyCommentId}/replies`
      : `${API_URL}/posts/${postId}/comments`;
    setSubmittingComments((current) => new Set(current).add(postId));
    try {
      const { data } = await axios.post(
        requestUrl,
        { text },
        { headers: { Authorization: ['Bearer', token].join(' ') }, timeout: 30000 },
      );
      const newComment = replyCommentId ? data.reply || data.comment : data.comment;
      setCommentsByPost((current) => {
        const comments = current[postId] || [];
        return {
          ...current,
          [postId]: comments.some((comment) => String(comment._id) === String(newComment._id))
            ? comments
            : uniqueComments([...comments, newComment]),
        };
      });
      setPosts((current) => current.map((post) => (
        String(post._id) === String(postId)
          ? { ...post, commentCount: data.commentCount ?? (post.commentCount || 0) + 1 }
          : post
      )));
      setCommentDrafts((current) => ({ ...current, [postId]: '' }));
      setCommentPickerPostId((current) => (current === postId ? null : current));
      if (replyCommentId) {
        setReplyingTo((current) => {
          const next = { ...current };
          delete next[postId];
          return next;
        });
      }
    } catch (error) {
      setPostError(error.response?.data?.message || (replyCommentId
        ? 'Could not add reply.'
        : 'Could not add comment.'));
    } finally {
      setSubmittingComments((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  };

  const loadMentionUsers = async () => {
    if (mentionUsersLoaded || mentionUsersRequestRef.current) {
      return mentionUsersRequestRef.current;
    }
    setLoadingMentionUsers(true);
    mentionUsersRequestRef.current = axios.get(`${API_URL}/users`, {
      headers: { Authorization: ['Bearer', token].join(' ') },
    }).then(({ data }) => {
      setMentionUsers(data.users || data || []);
      setMentionUsersLoaded(true);
    }).catch((error) => {
      setPostError(error.response?.data?.message || 'Could not load users for mentions.');
    }).finally(() => {
      setLoadingMentionUsers(false);
      mentionUsersRequestRef.current = null;
    });
    return mentionUsersRequestRef.current;
  };

  const updateMentionDraft = (postId, value, caretPosition) => {
    setCommentDrafts((current) => ({ ...current, [postId]: value }));
    const beforeCaret = value.slice(0, caretPosition);
    const mentionMatch = beforeCaret.match(/@([a-zA-Z0-9_.-]*)$/);
    if (!mentionMatch) {
      setActiveMention((current) => (current?.postId === postId ? null : current));
      return;
    }
    const mentionStart = caretPosition - mentionMatch[0].length;
    setActiveMention({
      postId, query: mentionMatch[1], start: mentionStart, end: caretPosition,
    });
    void loadMentionUsers();
  };

  const insertCommentEmoji = (postId, emoji) => {
    const input = commentInputRefs.current[postId];
    const value = commentDrafts[postId] || '';
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    const caret = start + emoji.length;
    setCommentDrafts((current) => ({ ...current, [postId]: nextValue }));
    setCommentPickerPostId(null);
    setActiveMention((current) => (current?.postId === postId ? null : current));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  };

  const insertMentionTrigger = (postId) => {
    const input = commentInputRefs.current[postId];
    if (!input) return;
    const value = commentDrafts[postId] || '';
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}@${value.slice(end)}`;
    const caret = start + 1;
    setCommentDrafts((current) => ({ ...current, [postId]: nextValue }));
    setActiveMention({ postId, query: '', start, end: caret });
    void loadMentionUsers();
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  };

  const insertMentionUser = (postId, selectedUser) => {
    if (!activeMention || activeMention.postId !== postId) return;
    const input = commentInputRefs.current[postId];
    const value = commentDrafts[postId] || '';
    const mentionText = `@${selectedUser.username} `;
    const nextValue = `${value.slice(0, activeMention.start)}${mentionText}${value.slice(activeMention.end)}`;
    const caret = activeMention.start + mentionText.length;
    setCommentDrafts((current) => ({ ...current, [postId]: nextValue }));
    setActiveMention(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  };

  const sendVoiceComment = async (postId, blob, duration) => {
    const replyCommentId = replyingTo[postId];
    const formData = new FormData();
    const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
    formData.append('audio', blob, `voice-comment.${extension}`);
    formData.append('duration', String(duration));
    formData.append('text', commentDrafts[postId] || '');
    const url = replyCommentId
      ? `${API_URL}/posts/comments/${replyCommentId}/replies/voice`
      : `${API_URL}/posts/${postId}/comments/voice`;
    try {
      const { data } = await axios.post(url, formData, {
        headers: { Authorization: ['Bearer', token].join(' ') },
        timeout: 180000,
      });
      const newComment = data.comment || data.reply;
      setCommentsByPost((current) => {
        const comments = current[postId] || [];
        if (comments.some((comment) => String(comment._id) === String(newComment._id))) {
          return current;
        }
        return { ...current, [postId]: [...comments, newComment] };
      });
      setCommentPreviews((current) => (
        Object.prototype.hasOwnProperty.call(current, postId)
          ? {
              ...current,
              [postId]: [
                newComment,
                ...current[postId].filter(
                  (comment) => String(comment._id) !== String(newComment._id),
                ),
              ].slice(0, 3),
            }
          : current
      ));
      setPosts((current) => current.map((post) => (
        String(post._id) === String(postId)
          ? { ...post, commentCount: data.commentCount ?? (post.commentCount || 0) + 1 }
          : post
      )));
      setCommentDrafts((current) => ({ ...current, [postId]: '' }));
      setActiveMention(null);
      if (replyCommentId) {
        setReplyingTo((current) => {
          const next = { ...current };
          delete next[postId];
          return next;
        });
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Could not send voice comment.';
      setPostError(message);
      throw new Error(message, { cause: error });
    }
  };

  const toggleCommentLike = async (commentId, postId) => {
    try {
      const { data } = await axios.post(
        `${API_URL}/posts/comments/${commentId}/like`,
        null,
        { headers: { Authorization: ['Bearer', token].join(' ') }, timeout: 30000 },
      );
      setCommentsByPost((current) => ({
        ...current,
        [postId]: (current[postId] || []).map((comment) =>
          comment._id === commentId ? data.comment : comment,
        ),
      }));
    } catch (error) {
      setPostError(error.response?.data?.message || 'Could not update comment like.');
    }
  };

  const toggleCommentDislike = async (commentId, postId) => {
    try {
      const { data } = await axios.post(
        `${API_URL}/posts/comments/${commentId}/dislike`,
        null,
        { headers: { Authorization: ['Bearer', token].join(' ') }, timeout: 30000 },
      );
      setCommentsByPost((current) => ({
        ...current,
        [postId]: (current[postId] || []).map((comment) =>
          comment._id === commentId ? data.comment : comment,
        ),
      }));
    } catch (error) {
      setPostError(error.response?.data?.message || 'Could not update comment dislike.');
    }
  };

  const toggleInterest = (postId, initialCount = 0) => {
    setInterestedPosts((current) => {
      const next = new Set(current);
      const isRemoving = next.has(postId);
      if (isRemoving) next.delete(postId);
      else next.add(postId);
      setRecommendCounts((counts) => ({
        ...counts,
        [postId]: Math.max(
          0,
          (counts[postId] ?? initialCount) + (isRemoving ? -1 : 1),
        ),
      }));
      return next;
    });
  };

  const handleRecommendClick = (post) => {
    const initialCount =
      post.recommendationCount ??
      post.recommendations?.length ??
      post.interestCount ??
      post.interestedBy?.length ??
      0;

    toggleInterest(post._id, initialCount);
    setRecommendationHintPostId(post._id);
    window.setTimeout(() => {
      setRecommendationHintPostId((current) =>
        current === post._id ? null : current,
      );
    }, 3000);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const loadFriendStories = useCallback(async () => {
    if (!token) {
      setFriendStories([]);
      setFriendStoriesLoading(false);
      return;
    }
    const requestSequence = ++friendStoriesRequestSequence.current;
    setFriendStoriesLoading(true);
    setFriendStoriesError('');
    try {
      const { data } = await axios.get(`${API_URL}/users/friends/unseen-stories`, {
        headers: { Authorization: ['Bearer', token].join(' ') },
      });
      if (requestSequence === friendStoriesRequestSequence.current) {
        setFriendStories(sortStoriesByViewed(Array.isArray(data.friends) ? data.friends : []));
      }
    } catch (error) {
      if (requestSequence !== friendStoriesRequestSequence.current) return;
      console.error('Failed to load friends’ unseen stories:', error);
      setFriendStoriesError(
        error.response?.data?.message || 'Could not load friends’ stories.',
      );
    } finally {
      if (requestSequence === friendStoriesRequestSequence.current) {
        setFriendStoriesLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadFriendStories();
    });
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadFriendStories();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadFriendStories]);

  useEffect(() => {
    const authorId = user?._id || user?.id;
    if (!token || !authorId || !hasOwnActiveStories) {
      setOwnStoryPreview(null);
      return undefined;
    }

    let active = true;
    axios.get(`${API_URL}/posts`, {
      params: { authorId, story: true, limit: 1 },
      headers: { Authorization: ['Bearer', token].join(' ') },
    }).then(({ data }) => {
      if (active) setOwnStoryPreview(data.posts?.[0] || null);
    }).catch((error) => {
      if (active) {
        console.error('Could not load your story preview:', error);
        setOwnStoryPreview(null);
      }
    });
    return () => {
      active = false;
    };
  }, [hasOwnActiveStories, token, user]);

  const loadUserStories = useCallback(async (
    author,
    startStory = {},
    authorQueue = storyAuthorQueue,
    authorIndex = authorQueue.findIndex((entry) => (
      String(entry?._id || entry?.id) === String(author?._id || author?.id)
    )),
  ) => {
    const authorId = author?._id || author?.id;
    if (!authorId) return;
    const requestSequence = ++storyRequestSequence.current;
    setStoryViewer({
      author,
      posts: [],
      loading: true,
      error: '',
      startPostId: startStory.postId,
      startSlideIndex: startStory.slideIndex,
      authorQueue,
      authorIndex,
    });
    try {
      const userPosts = [];
      let cursor;
      let hasMore = true;
      while (hasMore) {
        const { data } = await axios.get(`${API_URL}/posts`, {
          params: { limit: 50, authorId, story: true, ...(cursor ? { cursor } : {}) },
          headers: { Authorization: ['Bearer', token].join(' ') },
        });
        userPosts.push(...(data.posts || []));
        cursor = data.nextCursor || null;
        hasMore = Boolean(data.hasMore && cursor);
      }
      if (requestSequence !== storyRequestSequence.current) return;
      userPosts.sort(
        (first, second) => new Date(first.createdAt) - new Date(second.createdAt),
      );
      let startPostId = startStory.postId;
      if (!startPostId && startStory.unseenTimestamps?.length) {
        const unseenTimes = new Set(
          startStory.unseenTimestamps.map((timestamp) => Date.parse(timestamp)),
        );
        const firstUnseenPost = userPosts.find((post) =>
          unseenTimes.has(Date.parse(post.createdAt)),
        );
        startPostId = firstUnseenPost?._id;
      }
      setStoryViewer({
        author,
        posts: userPosts,
        loading: false,
        error: '',
        startPostId,
        startSlideIndex: startStory.slideIndex,
        authorQueue,
        authorIndex,
      });
    } catch (error) {
      if (requestSequence !== storyRequestSequence.current) return;
      console.error('Failed to load user posts:', error);
      setStoryViewer({
        author,
        posts: [],
        loading: false,
        error: error.response?.data?.message || 'Could not load this user’s posts.',
        authorQueue,
        authorIndex,
      });
    }
  }, [storyAuthorQueue, token]);

  const openStoryAuthor = useCallback((author, startStory = {}) => {
    const authorId = String(author?._id || author?.id || '');
    if (!authorId) return;
    let queue = storyAuthorQueue;
    let index = queue.findIndex((entry) => String(entry?._id || entry?.id) === authorId);
    if (index < 0) {
      queue = [...queue, author];
      index = queue.length - 1;
    }
    void loadUserStories(author, startStory, queue, index);
  }, [loadUserStories, storyAuthorQueue]);

  const navigateStoryAuthor = useCallback((direction) => {
    if (!storyViewer) return;
    const queue = storyViewer.authorQueue || [];
    const nextIndex = (storyViewer.authorIndex ?? -1) + direction;
    if (nextIndex < 0 || nextIndex >= queue.length) {
      if (direction > 0) {
        storyRequestSequence.current += 1;
        setStoryViewer(null);
      }
      return;
    }
    const author = queue[nextIndex];
    void loadUserStories(author, {
      postId: author.oldestUnseenPostId || author.storyPostId,
    }, queue, nextIndex);
  }, [loadUserStories, storyViewer]);

  useEffect(() => {
    if (!storyUserId) return;
    const requestKey = `${storyUserId}:${storyPostId || ''}:${storySlideIndex}`;
    if (handledStoryUserRef.current === requestKey) return;
    handledStoryUserRef.current = requestKey;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('storyUser');
    nextParams.delete('storyPost');
    nextParams.delete('storySlide');
    setSearchParams(nextParams, { replace: true, state: location.state });

    const openStories = async () => {
      let author = location.state?.storyAuthor;
      if (String(author?._id || author?.id || '') !== storyUserId) {
        author = posts.find((post) => String(post.author?._id || post.author?.id) === storyUserId)?.author;
      }
      if (!author) {
        try {
          const { data } = await axios.get(`${API_URL}/users/${storyUserId}`, {
            headers: { Authorization: ['Bearer', token].join(' ') },
          });
          author = data.user;
        } catch (error) {
          setPostError(error.response?.data?.message || 'Could not load this profile.');
          return;
        }
      }
      openStoryAuthor(author, { postId: storyPostId, slideIndex: storySlideIndex });
    };
    void openStories();
  }, [loadUserStories, location.state, openStoryAuthor, posts, searchParams, setSearchParams, storyPostId, storySlideIndex, storyUserId, token]);

  const markStoryViewed = useCallback(async (post) => {
    const postId = post?._id;
    if (!postId) return;
    try {
      await axios.post(`${API_URL}/posts/${postId}/story-view`, null, {
        headers: { Authorization: ['Bearer', token].join(' ') },
      });
      const authorId = String(post.author?._id ?? post.author?.id ?? post.authorId ?? '');
      if (authorId) {
        setFriendStories((current) => sortStoriesByViewed(current.map((story) => (
          String(story._id || story.id) === authorId
            ? { ...story, hasViewed: true }
            : story
        ))));
      }
      void loadFriendStories();
      if (authorId && post.createdAt) {
        window.dispatchEvent(new CustomEvent('post-story-viewed', {
          detail: { authorId, createdAt: post.createdAt },
        }));
      }
    } catch (error) {
      console.error('Failed to record viewed story:', error);
    }
  }, [loadFriendStories, token]);

  const loadStoryViewers = useCallback(async (post) => {
    const postId = post?._id;
    if (!postId) return;
    const requestSequence = ++storyViewerRequestSequence.current;
    setStoryViewerList((current) => ({
      postId,
      viewers: current?.postId === String(postId) ? current.viewers : [],
      loading: true,
      error: '',
    }));
    try {
      const { data } = await axios.get(
        `${API_URL}/posts/${postId}/story-viewers`,
        { headers: { Authorization: ['Bearer', token].join(' ') } },
      );
      if (requestSequence !== storyViewerRequestSequence.current) return;
      setStoryViewerList({
        postId: String(postId),
        viewers: Array.isArray(data.viewers) ? data.viewers : [],
        loading: false,
        error: '',
      });
    } catch (error) {
      if (requestSequence !== storyViewerRequestSequence.current) return;
      console.error('Failed to load story viewers:', error);
      setStoryViewerList((current) => ({
        postId: String(postId),
        viewers: current?.postId === String(postId) ? current.viewers : [],
        loading: false,
        error: error.response?.data?.message || 'Could not load story viewers.',
      }));
    }
  }, [token]);

  const sendStoryReply = useCallback(({ content, post, slideIndex }) => {
    const receiverId = post?.author?._id
      ?? post?.author?.id
      ?? post?.authorId
      ?? storyViewer?.author?._id
      ?? storyViewer?.author?.id;
    if (!socket?.connected) {
      return Promise.reject(new Error('You are offline. Reconnect to send a story reply.'));
    }
    if (!receiverId) {
      return Promise.reject(new Error('Could not identify the story owner.'));
    }

    const clientId = globalThis.crypto?.randomUUID?.()
      || `story-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.off('message_sent', onMessageSent);
        socket.off('message_error', onMessageError);
      };
      const onMessageSent = (message) => {
        if (message?.clientId !== clientId) return;
        cleanup();
        resolve();
      };
      const onMessageError = (error) => {
        if (error?.clientId !== clientId) return;
        cleanup();
        reject(new Error(error.message || 'Could not send story reply.'));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Story reply was not confirmed. Please try again.'));
      }, 10000);

      socket.on('message_sent', onMessageSent);
      socket.on('message_error', onMessageError);
      socket.emit('send_message', {
        receiverId: String(receiverId),
        content,
        messageType: 'text',
        storyPostId: String(post._id),
        storySlideIndex: slideIndex,
        clientId,
      });
    });
  }, [socket, storyViewer]);

  const closeStoryViewer = useCallback(() => {
    storyRequestSequence.current += 1;
    setStoryViewer(null);
  }, []);

  const renderPostSkeletons = (count, keyPrefix) => Array.from({ length: count }, (_, index) => (
    <article
      key={`${keyPrefix}-${index}`}
      aria-hidden='true'
      className='mx-auto w-full overflow-hidden rounded-sm border-b border-white/10 pb-5'
    >
      <div className='flex items-center gap-3 py-3'>
        <span className='people-skeleton-block h-11 w-11 shrink-0 rounded-full' />
        <span className='flex flex-1 flex-col gap-2'>
          <span className='people-skeleton-block h-3.5 w-2/5 rounded-full' />
          <span className='people-skeleton-block h-2.5 w-1/4 rounded-full' />
        </span>
        <span className='people-skeleton-block h-7 w-16 rounded-full' />
      </div>
      <div className='people-skeleton-block aspect-[4/5] w-full rounded-sm sm:aspect-square' />
      <div className='flex items-center gap-4 py-3'>
        <span className='people-skeleton-block h-6 w-16 rounded-full' />
        <span className='people-skeleton-block h-6 w-16 rounded-full' />
      </div>
      <div className='space-y-2 pb-2'>
        <span className='people-skeleton-block block h-3 w-3/4 rounded-full' />
        <span className='people-skeleton-block block h-3 w-1/2 rounded-full' />
      </div>
    </article>
  ));

  const renderStoryCard = () => {
    const storyCards = [
      ...(user ? [{
        profile: user,
        preview: ownStoryPreview,
        own: true,
        id: String(user._id || user.id || 'own-story'),
      }] : []),
      ...friendStories
        .filter((friend) => Number(friend.storyCount || 0) > 0)
        .map((friend) => ({
          profile: friend,
          preview: friend.storyPreview,
          own: false,
          id: String(friend._id || friend.id),
        })),
    ];

    return (
      <section
        aria-label='Stories'
        className='overflow-hidden py-2'
      >
        <h2 className='mb-3 px-1 text-sm font-bold text-white'>Stories</h2>
        <div className='hide-scrollbar overflow-x-auto pb-1'>
          <div className='flex w-max items-start gap-3'>
            {storyCards.map(({ profile, preview, own, id }) => {
              const previewBoard = preview?.boards?.[0] || preview?.board;
              const previewImage = preview?.mediaUrl || preview?.mediaUrls?.[0];
              const title = own ? 'Your story' : (profile?.username || 'Story');
              return (
                <button
                  key={`story-card-${id}`}
                  type='button'
                  onClick={() => {
                    if (own) {
                      if (hasOwnActiveStories) openStoryAuthor(profile);
                      else openPostTypeMenu();
                    } else {
                      openStoryAuthor(profile, {
                        postId: profile.oldestUnseenPostId || profile.storyPostId,
                      });
                    }
                  }}
                  aria-label={own
                    ? hasOwnActiveStories ? 'View your story' : 'Create a story'
                    : `View ${profile?.username || 'user'}'s story`}
                  className='relative h-52 w-32 shrink-0 overflow-hidden rounded-xl bg-gray-800 text-left shadow-lg shadow-black/30 outline-none transition hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-emerald-400'
                >
                  {previewImage ? (
                    <OptimizedImage
                      src={previewImage}
                      alt=''
                      className='absolute inset-0 h-full w-full object-cover'
                    />
                  ) : previewBoard ? (
                    <div className='absolute inset-0' style={getBoardStyle(previewBoard)}>
                      {getBoardTextElements(previewBoard).map((text, textIndex) => (
                        <div
                          key={`story-preview-text-${textIndex}`}
                          className='whitespace-pre-wrap break-words'
                          style={{
                            ...getBoardTextPositionStyle(text),
                            ...getBoardTextStyle(text),
                          }}
                        >
                          {text.text}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <UserAvatar
                      user={profile}
                      interactive={false}
                      showStoryRing={false}
                      alt=''
                      wrapperStyle={{ position: 'absolute', inset: 0 }}
                      className='h-full w-full object-cover'
                    />
                  )}
                  <div className='absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/75' />
                  <UserAvatar
                    user={profile}
                    interactive={false}
                    alt=''
                    wrapperStyle={{
                      position: 'absolute',
                      left: '0.5rem',
                      top: '0.5rem',
                      width: '2rem',
                      height: '2rem',
                    }}
                    className='h-full w-full rounded-full object-cover ring-2 ring-emerald-400'
                  />
                  {own && !hasOwnActiveStories && (
                    <span className='absolute left-[17px] top-[25px] flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-gray-900'>
                      <Plus size={13} strokeWidth={3} />
                    </span>
                  )}
                  <span className='absolute inset-x-2 bottom-2 truncate text-xs font-bold text-white drop-shadow'>
                    {title}
                  </span>
                </button>
              );
            })}
            {friendStoriesLoading && [0, 1, 2].map((item) => (
              <span
                key={`story-card-skeleton-${item}`}
                aria-hidden='true'
                className='people-skeleton-block h-52 w-32 shrink-0 rounded-xl'
              />
            ))}
          </div>
        </div>
        {friendStoriesError && (
          <p role='alert' className='mt-2 text-xs text-red-300'>
            {friendStoriesError}
          </p>
        )}
      </section>
    );
  };

  return (
    <main className='h-[100dvh] overflow-hidden bg-gray-950 text-white'>
      {openingChat && (
        <div
          role='status'
          aria-live='polite'
          className='fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-gray-950 text-white'
        >
          <div className='flex items-center gap-2 text-lg font-extrabold tracking-tight'>
            <span>Blo</span><span className='text-emerald-400'>be</span>
          </div>
          <LoaderCircle className='animate-spin text-emerald-400' size={28} />
          <p className='text-sm text-gray-300'>Opening messages…</p>
        </div>
      )}
      <SidebarTopBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onSearchSubmit={submitHomeSearch}
        onAdd={openPostTypeMenu}
        onCreatePost={openPostTypeMenu}
        onCreateGroup={() => navigate('/chat?createGroup=1')}
        onMenuAction={handleMenuAction}
        onLogout={handleLogout}
        hidden={topBarHidden}
        unreadCount={totalUnread}
        desktopOverlay
      />

      <aside
        aria-label='Stories from other users'
        className={`fixed left-0 bottom-0 z-20 hidden w-[280px] flex-col overflow-hidden border-y border-r border-white/10 bg-gray-900/90 shadow-xl shadow-black/20 backdrop-blur-xl transition-[top] duration-300 xl:flex ${topBarHidden ? 'top-0' : 'top-[70px]'}`}
      >
        <div className='border-b border-white/10 px-4 py-4'>
          <h2 className='friends-heading-gradient text-base font-extrabold'>Stories</h2>
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto px-2 py-2'>
          {friendStoriesLoading ? (
            <div className='space-y-2' aria-label='Loading friends’ stories'>
              {[0, 1, 2].map((item) => (
                <div
                  key={`friend-story-skeleton-${item}`}
                  className='flex items-center gap-3 rounded-xl px-2 py-3'
                >
                  <span className='people-skeleton-block h-11 w-11 shrink-0 rounded-full' />
                  <span className='flex-1 space-y-2'>
                    <span className='people-skeleton-block block h-3 w-3/5 rounded-full' />
                    <span className='people-skeleton-block block h-2.5 w-2/5 rounded-full' />
                  </span>
                </div>
              ))}
            </div>
          ) : friendStoriesError ? (
            <div role='alert' className='m-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-200'>
              {friendStoriesError}
            </div>
          ) : friendStories.length === 0 ? (
            <p className='px-3 py-5 text-sm leading-6 text-gray-400'>
              No active stories from other users right now.
            </p>
          ) : (
            <ul className='space-y-1'>
              {friendStories.map((friend) => {
                const friendId = String(friend._id || friend.id);
                const unseenStoryCount = Number(friend.unseenStoryCount || 0);
                const storyCount = Number(friend.storyCount || 0);
                const hasUnseenStories = unseenStoryCount > 0;
                return (
                  <li key={friendId}>
                    <button
                      type='button'
                      onClick={() => {
                        if (storyCount > 0) {
                          openStoryAuthor(friend, {
                            postId: friend.oldestUnseenPostId || friend.storyPostId,
                          });
                        } else {
                          navigate(`/chat?conversationId=${encodeURIComponent(friendId)}`);
                        }
                      }}
                      className='flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                      aria-label={storyCount > 0
                        ? `View ${storyCount} ${storyCount === 1 ? 'story' : 'stories'} from ${friend.username}`
                        : `Open chat with ${friend.username}`}
                    >
                      <UserAvatar
                        user={friend}
                        alt={`${friend.username || 'Friend'} profile`}
                        className={`h-11 w-11 rounded-full object-cover ${hasUnseenStories ? 'ring-2 ring-emerald-400' : 'ring-1 ring-white/15'}`}
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-semibold text-white'>
                          {friend.username}
                        </span>
                        <span className={`mt-0.5 block text-xs ${hasUnseenStories ? 'text-emerald-300' : 'text-gray-500'}`}>
                          {hasUnseenStories
                            ? `${unseenStoryCount} new ${unseenStoryCount === 1 ? 'story' : 'stories'}`
                            : storyCount > 0 ? 'Viewed' : 'No new story'}
                        </span>
                      </span>
                      <ChevronRight size={16} className='shrink-0 text-gray-500' aria-hidden='true' />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section
        ref={feedRef}
        onScroll={handleFeedScroll}
        className='h-full w-full overflow-y-auto overscroll-contain px-4 pb-24 pt-24 md:px-6'
      >
        <div className='mx-auto w-full max-w-2xl'>
        <div className={`${normalizedSearchTerm ? 'hidden' : 'hide-scrollbar mb-6 -mx-4 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6'}`}>
          <div className='flex w-max items-start gap-6'>
          {[user, ...(networkUnavailable || suggestedUsersLoading ? [] : suggestedUsers)]
            .filter(Boolean).map((profile) => {
            const profileId = String(profile._id || profile.id);
            const isCurrentUserProfile =
              profileId === String(user?._id || user?.id || '');
            const unseenStoryTimestamps =
              avatarActivityByUser[profileId]?.unseen || [];
            const hasUnseenStories = unseenStoryTimestamps.length > 0;
            const profileOnline =
              isUserOnline(profileId) || Boolean(profile.isOnline);
            const avatarLoaded = loadedTopAvatars.has(profileId);
            return (
              <button
                type='button'
                key={`${profileId}-${mediaRetryVersion}`}
                onClick={() => {
                  if (isCurrentUserProfile) {
                    if (hasOwnActiveStories) openStoryAuthor(profile);
                    return;
                  }
                  if (hasUnseenStories) {
                    openStoryAuthor(profile, { unseenTimestamps: unseenStoryTimestamps });
                    return;
                  }
                  navigate(`/chat?conversationId=${encodeURIComponent(profileId)}`);
                }}
                title={isCurrentUserProfile
                  ? hasOwnActiveStories ? 'View your story' : 'You have no active story'
                  : hasUnseenStories
                    ? `View ${profile.username || 'user'}'s new story`
                    : `Open chat with ${profile.username || 'user'}`}
                aria-label={isCurrentUserProfile
                  ? hasOwnActiveStories ? 'View your story' : 'You have no active story'
                  : hasUnseenStories
                    ? `View ${profile.username || 'user'}'s new story`
                    : `Open chat with ${profile.username || 'user'}`}
                className='flex w-16 flex-col items-center gap-1.5 rounded-xl p-1 outline-none transition-transform hover:scale-105 focus:outline-none focus-visible:bg-white/5'
              >
                <div className='relative h-14 w-14 shrink-0'>
                  {!avatarLoaded && (
                    <span className='people-skeleton-block absolute inset-0 z-10 rounded-full' />
                  )}
                  <UserAvatar
                    user={profile}
                    alt={`${profile.username || 'User'} profile`}
                    className='h-14 w-14 rounded-full object-cover ring-2 ring-white/10'
                    onLoad={() => setLoadedTopAvatars((current) => (
                      current.has(profileId) ? current : new Set(current).add(profileId)
                    ))}
                  />
                  <span
                    className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-gray-950 ${
                      profileOnline ? 'bg-emerald-400' : 'bg-gray-600'
                    }`}
                  />
                </div>
                <span className='w-full truncate text-center text-xs font-semibold text-white'>
                  {profile.username}
                </span>
              </button>
            );
          })}
          {(networkUnavailable || suggestedUsersLoading) && Array.from({ length: 5 }, (_, index) => (
            <div
              key={`suggested-profile-skeleton-${mediaRetryVersion}-${index}`}
              aria-hidden='true'
              className='flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl p-1'
            >
              <span className='people-skeleton-block h-14 w-14 rounded-full' />
              <span className='people-skeleton-block h-2.5 w-12 rounded-full' />
            </div>
          ))}
          </div>
        </div>

        {!normalizedSearchTerm && !loadingPosts && !networkUnavailable && postError && (
          <div className='rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200'>
            {postError}
          </div>
        )}
        {normalizedSearchTerm && searchError && (
          <div role='alert' className='rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200'>
            <p>{searchError}</p>
            <button
              type='button'
              onClick={() => setSearchRetry((retry) => retry + 1)}
              className='mt-3 rounded-xl border border-red-300/20 px-3 py-1.5 font-semibold hover:bg-red-300/10'
            >
              Retry search
            </button>
          </div>
        )}
        {!normalizedSearchTerm && !loadingPosts && !networkUnavailable && !postError && posts.length === 0 && (
          <div className='rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-gray-400'>
            No posts yet. Be the first to share something.
          </div>
        )}
        {normalizedSearchTerm && !searchIsPending && !searchError && matchingPosts.length === 0 && (
          <div className='rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-gray-400'>
          <p>No posts match “{submittedSearchTerm}”.</p>
          </div>
        )}
        {!normalizedSearchTerm && posts.length === 0 && renderStoryCard()}
        <div className='space-y-5'>
          {searchIsPending && matchingPosts.length === 0 && renderPostSkeletons(
            3,
            'home-post-search-skeleton',
          )}
          {!normalizedSearchTerm && (loadingPosts || networkUnavailable) && posts.length === 0 && renderPostSkeletons(
            homePostPageSize,
            'home-post-initial-skeleton',
          )}
          {displayedPosts.map((post, postIndex) => {
            const author = post.author || {};
            const authorId = String(author._id || author.id || '');
            const online = isUserOnline(authorId) || Boolean(author.isOnline);
            return (
              <Fragment key={post._id}>
              {normalizedSearchTerm && postIndex === 0 && (
                <h2 className='px-2 pt-3 text-xs font-bold uppercase tracking-wider text-emerald-300'>
                  {matchingPosts.length > 0 ? 'Matching content' : 'Other posts'}
                </h2>
              )}
              {normalizedSearchTerm && matchingPosts.length > 0 && postIndex === matchingPosts.length && (
                <>
                  {searchLoadingMore && renderPostSkeletons(2, 'home-post-search-more-skeleton')}
                  <h2 className='px-2 pt-3 text-xs font-bold uppercase tracking-wider text-gray-400'>
                    Other posts
                  </h2>
                </>
              )}
              <article
                id={`post-${post._id}`}
                className='scroll-mt-24 relative mx-auto w-full overflow-hidden rounded-sm border-b border-white/10 px-2 pb-5 md:px-3'
              >
                {likeBursts[post._id] && (
                  <div className='pointer-events-none absolute inset-0 z-10 overflow-hidden'>
                    {Array.from({ length: 24 }, (_, heart) => (
                      <Heart
                        key={`${likeBursts[post._id]}-${heart}`}
                        size={heart % 2 ? 16 : 21}
                        fill='currentColor'
                        className={`like-burst-heart like-burst-heart-${heart} text-rose-400`}
                      />
                    ))}
                  </div>
                )}
                <header className='flex items-center gap-3 px-0 py-3'>
                  <button
                    type='button'
                    onClick={() => openDashboard(author)}
                    aria-label={`Open ${author.username || 'user'} profile`}
                    className='relative h-11 w-11 shrink-0 rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-emerald-400'
                  >
                    <UserAvatar
                      user={author}
                      alt={`${author.username || 'User'} profile`}
                      className='h-11 w-11 rounded-full object-cover ring-1 ring-white/10'
                    />
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-600'}`}
                    />
                  </button>
                  <div className='min-w-0 flex-1'>
                    <button
                      type='button'
                      onClick={() => openDashboard(author)}
                      className='block max-w-full truncate text-sm font-bold text-white hover:underline'
                    >
                      <HighlightedText
                        text={author.username || 'Unknown user'}
                        searchTerm={normalizedSearchTerm}
                      />
                    </button>
                    <span
                      className={`block truncate text-[11px] leading-4 text-gray-400 transition-opacity duration-200 ${
                        showAuthorUpdate ? 'opacity-100' : 'opacity-0'
                      }`}
                      aria-hidden={!showAuthorUpdate}
                    >
                      Africa/Kigali
                      {` · ${formatUpdateTime(currentTime)}`}
                    </span>
                  </div>
                  <div className='flex shrink-0 items-center gap-1.5'>
                    <span className='text-[11px] font-medium text-gray-400'>
                      {formatPostAge(
                        post.createdAt ||
                          post.created_at ||
                          post.updatedAt ||
                          post.updated_at,
                      )}
                    </span>
                    {authorId && authorId !== String(user?._id || user?.id) && (
                      <div className='flex items-center gap-0'>
                        {followingUsers.has(authorId) ? (
                          <button
                            type='button'
                            aria-label={`Unfollow ${author.username || 'user'}`}
                            title='Unfollow'
                            disabled={pendingFollowUsers.has(authorId)}
                            onClick={() => void toggleFollowUser(authorId)}
                            className='flex h-9 w-9 items-center justify-center rounded-lg text-white transition-all duration-200 hover:scale-110 hover:bg-white/10 active:scale-90 disabled:opacity-50'
                          >
                            <Bell size={20} />
                          </button>
                        ) : (
                          <button
                            type='button'
                            disabled={pendingFollowUsers.has(authorId)}
                            onClick={() => void toggleFollowUser(authorId)}
                            className='rounded-lg bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:scale-105 hover:bg-emerald-400 active:scale-95 disabled:opacity-50'
                          >
                            Follow
                          </button>
                        )}
                        <div
                          className='relative'
                          ref={openPostMenuId === post._id ? postMenuRef : null}
                        >
                          <button
                            type='button'
                            aria-label={`More options for ${author.username || 'user'}'s post`}
                            aria-haspopup='menu'
                            aria-expanded={openPostMenuId === post._id}
                            onClick={() =>
                              setOpenPostMenuId((current) =>
                                current === post._id ? null : post._id,
                              )
                            }
                            className='rounded-lg p-1 text-gray-200 transition-colors hover:bg-white/10 hover:text-white'
                          >
                            <MoreVertical size={20} strokeWidth={3} />
                          </button>
                          {openPostMenuId === post._id && (
                            <div
                              role='menu'
                              className='absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-gray-900/95 py-1.5 shadow-2xl shadow-black/50 ring-1 ring-white/5 backdrop-blur-2xl animate-fade-in'
                            >
                              <button
                                type='button'
                                role='menuitem'
                                onClick={async () => {
                                  setOpenPostMenuId(null);
                                  try {
                                    await axios.post(
                                      `${API_URL}/users/${authorId}/block`,
                                      null,
                                      { headers: { Authorization: ['Bearer', token].join(' ') }, timeout: 30000 },
                                    );
                                    setPosts((current) =>
                                      current.filter(
                                        (item) =>
                                          String(item.author?._id || item.author?.id) !== authorId,
                                      ),
                                    );
                                    setSuggestedUsers((current) =>
                                      current.filter(
                                        (candidate) =>
                                          String(candidate._id || candidate.id) !== authorId,
                                      ),
                                    );
                                  } catch (error) {
                                    setPostError(
                                      error.response?.data?.message ||
                                        'Could not block this user.',
                                    );
                                  }
                                }}
                                className='w-full px-4 py-3 text-left text-sm font-medium text-gray-100 transition-colors hover:bg-white/10'
                              >
                                Block this user
                              </button>
                              <button
                                type='button'
                                role='menuitem'
                                onClick={() => {
                                  setPosts((current) =>
                                    current.filter((item) => item._id !== post._id),
                                  );
                                  setOpenPostMenuId(null);
                                }}
                                className='w-full px-4 py-3 text-left text-sm font-medium text-gray-100 transition-colors hover:bg-white/10'
                              >
                                Hide this post
                              </button>
                              <div className='my-1 border-t border-white/10' />
                              <button
                                type='button'
                                role='menuitem'
                                onClick={() => {
                                  setOpenPostMenuId(null);
                                  window.alert('Post reporting is not available yet.');
                                }}
                                className='w-full px-4 py-3 text-left text-sm font-medium text-rose-200 transition-colors hover:bg-rose-500/10'
                              >
                                Report post
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </header>
                {post.caption && (
                  <p className='pb-3 text-sm font-normal leading-6 text-gray-200'>
                    <span className='mr-1 font-semibold text-blue-400'>
                      {author.username || 'Unknown user'}
                    </span>
                    {renderCommentText(post.caption, normalizedSearchTerm)}
                  </p>
                )}
                {post.mediaType === 'board' ? (() => {
                  const boards = post.boards?.length
                    ? post.boards
                    : post.board
                      ? [post.board]
                      : [];
                  if (boards.length === 0) return null;
                  const activeBoardIndex = Math.min(
                    galleryIndexes[post._id] || 0,
                    boards.length - 1,
                  );
                  const activeBoard = boards[activeBoardIndex];
                  return (
                    <div className='relative mx-auto w-full max-w-md'>
                      <button
                        type='button'
                        onClick={() => {
                          if (suppressBoardOpenRef.current) {
                            suppressBoardOpenRef.current = false;
                            return;
                          }
                          setBoardViewer({
                            boards,
                            initialIndex: activeBoardIndex,
                            searchTerm: normalizedSearchTerm,
                          });
                        }}
                        onTouchStart={(event) => {
                          suppressBoardOpenRef.current = false;
                          galleryTouchStart.current[post._id] = event.touches[0].clientX;
                        }}
                        onTouchEnd={(event) => {
                          const start = galleryTouchStart.current[post._id];
                          if (start === undefined) return;
                          const delta = event.changedTouches[0].clientX - start;
                          delete galleryTouchStart.current[post._id];
                          if (Math.abs(delta) < 45) return;
                          suppressBoardOpenRef.current = true;
                          setGalleryIndexes((current) => ({
                            ...current,
                            [post._id]:
                              (activeBoardIndex +
                                (delta < 0 ? 1 : boards.length - 1)) %
                              boards.length,
                          }));
                        }}
                        aria-label={`Open board ${activeBoardIndex + 1} of ${boards.length}`}
                        className='relative block aspect-[4/5] w-full overflow-hidden rounded-xl text-left'
                        style={{ ...getBoardStyle(activeBoard), touchAction: 'pan-y' }}
                      >
                        {getBoardTextElements(activeBoard).map((text, textIndex) => (
                          <span
                            key={`${activeBoardIndex}-text-${textIndex}`}
                            className='absolute'
                            style={getBoardTextPositionStyle(text)}
                          >
                            <BoardTextFit board={text} searchTerm={normalizedSearchTerm} />
                          </span>
                        ))}
                      </button>
                      {boards.length > 1 && (
                        <>
                          <button
                            type='button'
                            aria-label='Previous board'
                            onClick={() => setGalleryIndexes((current) => ({
                              ...current,
                              [post._id]: (activeBoardIndex + boards.length - 1) % boards.length,
                            }))}
                            className='absolute left-3 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 md:flex'
                          >
                            <ChevronLeft size={21} />
                          </button>
                          <button
                            type='button'
                            aria-label='Next board'
                            onClick={() => setGalleryIndexes((current) => ({
                              ...current,
                              [post._id]: (activeBoardIndex + 1) % boards.length,
                            }))}
                            className='absolute right-3 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 md:flex'
                          >
                            <ChevronRight size={21} />
                          </button>
                        </>
                      )}
                      {boards.length > 1 && (
                        <div
                          role='group'
                          aria-label='Choose board'
                          className='flex justify-center gap-0.5 py-1.5'
                        >
                          {boards.map((_, index) => (
                            <button
                              key={`${post._id}-board-${index}`}
                              type='button'
                              aria-label={`Show board ${index + 1} of ${boards.length}`}
                              aria-current={activeBoardIndex === index ? 'true' : undefined}
                              onClick={() => setGalleryIndexes((current) => ({
                                ...current,
                                [post._id]: index,
                              }))}
                              className='flex h-2.5 w-2.5 items-center justify-center'
                            >
                              <span
                                className={`rounded-full transition-all duration-200 ${
                                  activeBoardIndex === index
                                    ? 'h-1.5 w-1.5 bg-emerald-400'
                                    : 'h-1 w-1 bg-white/80'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })() : (() => {
                    const gallery = post.mediaUrls?.length
                      ? post.mediaUrls
                      : [post.mediaUrl];
                    const galleryThumbnails = post.mediaThumbnailUrls?.length
                      ? post.mediaThumbnailUrls
                      : [post.mediaThumbnailUrl || post.mediaUrl];
                    const galleryMediums = post.mediaMediumUrls?.length
                      ? post.mediaMediumUrls
                      : [post.mediaMediumUrl || post.mediaUrl];
                    const galleryDimensions = post.mediaDimensions?.length
                      ? post.mediaDimensions
                      : [{
                          full: { width: post.mediaWidth, height: post.mediaHeight },
                          medium: {
                            width: post.mediaMediumWidth,
                            height: post.mediaMediumHeight,
                          },
                        }];
                    const activeIndex = Math.min(
                      galleryIndexes[post._id] || 0,
                      gallery.length - 1,
                    );
                    const imageDimensions = galleryDimensions[activeIndex] || {};
                    const fullDimensions = imageDimensions.full || {};
                    const mediumDimensions = imageDimensions.medium || {};
                    const activeMediaKey = mediaKey(post._id, gallery[activeIndex]);
                    const thumbnailMediaKey = `${activeMediaKey}:thumbnail`;
                    const hasDistinctThumbnail = Boolean(
                      galleryThumbnails[activeIndex]
                      && galleryThumbnails[activeIndex] !== gallery[activeIndex],
                    );
                    const thumbnailLoaded = loadedThumbnails.has(thumbnailMediaKey);
                    const fullMediaLoaded = loadedMedia.has(activeMediaKey);
                    const imageRatio =
                      fullDimensions.width > 0 && fullDimensions.height > 0
                        ? fullDimensions.width / fullDimensions.height
                        : imageRatios[activeMediaKey];
                    const responsiveSources = getResponsiveImageSources([
                      { url: galleryMediums[activeIndex], width: mediumDimensions.width },
                      { url: gallery[activeIndex], width: fullDimensions.width },
                    ]);
                    return (
                      <>
                        <div
                          className='relative mx-auto overflow-hidden'
                          style={{
                            ...(imageRatio
                              ? {
                                  aspectRatio: String(imageRatio),
                                  maxWidth: `${Math.min(672, imageRatio * 600)}px`,
                                  maxHeight: '600px',
                                }
                              : {}),
                          }}
                          onTouchStart={(event) => {
                            galleryTouchStart.current[post._id] = event.touches[0].clientX;
                          }}
                          onTouchEnd={(event) => {
                            const start = galleryTouchStart.current[post._id];
                            const delta = event.changedTouches[0].clientX - start;
                            if (Math.abs(delta) < 45) return;
                            setGalleryIndexes((current) => ({
                              ...current,
                              [post._id]:
                                (activeIndex + (delta < 0 ? 1 : gallery.length - 1)) %
                                gallery.length,
                            }));
                          }}
                        >
                          {likeBursts[post._id] && (
                            <div className='pointer-events-none absolute inset-0 z-20 flex items-center justify-center'>
                              <Heart
                                size={92}
                                fill='currentColor'
                                className='post-like-heart text-rose-500 drop-shadow-2xl'
                              />
                            </div>
                          )}
                          {recommendationHintPostId === post._id && (
                            <div className='pointer-events-none absolute inset-0 z-20 flex items-center justify-center'>
                              <span className='w-56 rounded-xl border border-amber-300/20 bg-gray-900/95 px-3 py-2 text-center text-[11px] font-medium leading-4 text-amber-100 shadow-xl'>
                                Tell others this is one of the best posts.
                              </span>
                            </div>
                          )}
                          {hasDistinctThumbnail && (
                            <OptimizedImage
                              key={`${thumbnailMediaKey}-${mediaRetryCounts[thumbnailMediaKey] || 0}`}
                              src={galleryThumbnails[activeIndex]}
                              alt=''
                              aria-hidden='true'
                              loading={postIndex === 0 ? 'eager' : 'lazy'}
                              onLoad={() => {
                                failedMediaKeysRef.current.delete(thumbnailMediaKey);
                                setLoadedThumbnails((current) => (
                                  current.has(thumbnailMediaKey)
                                    ? current
                                    : new Set(current).add(thumbnailMediaKey)
                                ));
                              }}
                              onError={() => {
                                failedMediaKeysRef.current.add(thumbnailMediaKey);
                                setNetworkUnavailable(true);
                              }}
                              className={`absolute inset-0 z-[1] h-full w-full object-contain transition-opacity duration-200 ${
                                thumbnailLoaded ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                          )}
                          {!thumbnailLoaded && !fullMediaLoaded && (
                            <div
                              className='people-skeleton-block absolute inset-0 z-[2]'
                              role='status'
                              aria-label={`Loading photo ${activeIndex + 1} of ${gallery.length}`}
                            >
                              <span className='sr-only'>Loading photo</span>
                            </div>
                          )}
                          <OptimizedImage
                            key={`${activeMediaKey}-${mediaRetryCounts[activeMediaKey] || 0}`}
                            src={gallery[activeIndex]}
                            thumbnailSrc={galleryThumbnails[activeIndex]}
                            srcSet={responsiveSources}
                            sizes='(min-width: 720px) 672px, calc(100vw - 2rem)'
                            width={fullDimensions.width || undefined}
                            height={fullDimensions.height || undefined}
                            loading={postIndex === 0 ? 'eager' : 'lazy'}
                            priority={postIndex === 0}
                            alt={post.caption || 'Post'}
                            onClick={() => setLightboxUrl(gallery[activeIndex])}
                            onLoad={(event) => {
                              const { naturalWidth, naturalHeight } = event.currentTarget;
                              if (naturalWidth > 0 && naturalHeight > 0) {
                                setImageRatios((current) => ({
                                  ...current,
                                  [activeMediaKey]: naturalWidth / naturalHeight,
                                }));
                              }
                              failedMediaKeysRef.current.delete(activeMediaKey);
                              markMediaLoaded(post._id, gallery[activeIndex]);
                            }}
                            onError={() => {
                              failedMediaKeysRef.current.add(activeMediaKey);
                              setNetworkUnavailable(true);
                            }}
                            className={`${imageRatio ? 'absolute inset-0 h-full w-full' : 'max-h-[600px] w-full'} z-[3] cursor-zoom-in object-contain transition-opacity duration-300 ${
                              fullMediaLoaded
                                ? 'opacity-100'
                                : 'opacity-0'
                            }`}
                          />
                          {gallery.length > 1 && (
                            <>
                              <button
                                type='button'
                                aria-label='Previous photo'
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setGalleryIndexes((current) => ({
                                    ...current,
                                    [post._id]:
                                      (activeIndex + gallery.length - 1) %
                                      gallery.length,
                                  }));
                                }}
                                className='absolute left-3 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80 md:flex'
                              >
                                <ChevronLeft size={21} />
                              </button>
                              <button
                                type='button'
                                aria-label='Next photo'
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setGalleryIndexes((current) => ({
                                    ...current,
                                    [post._id]: (activeIndex + 1) % gallery.length,
                                  }));
                                }}
                                className='absolute right-3 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80 md:flex'
                              >
                                <ChevronRight size={21} />
                              </button>
                            </>
                          )}
                        </div>
                        {gallery.length > 1 && (
                          <div
                            role='group'
                            aria-label='Choose photo'
                            className='flex justify-center gap-0.5 py-1.5'
                          >
                            {gallery.map((_, index) => (
                              <button
                                key={`${post._id}-dot-${index}`}
                                type='button'
                                aria-label={`Show photo ${index + 1} of ${gallery.length}`}
                                aria-current={index === activeIndex ? 'true' : undefined}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setGalleryIndexes((current) => ({
                                    ...current,
                                    [post._id]: index,
                                  }));
                                }}
                                className='flex h-2.5 w-2.5 items-center justify-center'
                              >
                                <span
                                  className={`rounded-full transition-all duration-200 ${
                                    index === activeIndex
                                      ? 'h-1.5 w-1.5 bg-emerald-400'
                                      : 'h-1 w-1 bg-white/80'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    );
                })()}
                <div className='flex items-center gap-4 px-0 py-2'>
                  <button
                    type='button'
                    onClick={() => handleLike(post._id)}
                    disabled={pendingLikePosts.has(post._id)}
                    aria-label='Like post'
                    title={likedPosts.has(post._id) ? 'Unlike post' : 'Like post'}
                    className='flex items-center gap-1.5 text-gray-300 transition-colors hover:text-white'
                  >
                    <Heart
                      size={20}
                      className={likedPosts.has(post._id) ? 'text-rose-400' : ''}
                      fill={likedPosts.has(post._id) ? 'currentColor' : 'none'}
                    />
                    <span className='text-[10px] font-semibold text-gray-400'>
                      {post.likeCount ?? post.likes?.length ?? 0}
                    </span>
                  </button>
                  <button
                    type='button'
                    onClick={() => toggleComments(post._id)}
                    aria-label='Comment on post'
                    title='Comments'
                    className='flex items-center gap-1.5 text-gray-300 transition-colors hover:text-white'
                  >
                    <MessageCircle size={20} />
                    <span className='text-[10px] font-semibold text-gray-400'>
                      {post.commentCount ??
                        commentsByPost[post._id]?.length ??
                        post.comments?.length ??
                        0}
                    </span>
                  </button>
                  <button
                    type='button'
                    onClick={() => handleSharePost(post)}
                    aria-label='Share post'
                    title={sharedPostId === post._id ? 'Shared' : 'Share'}
                    className='flex items-center gap-1.5 text-gray-300 transition-colors hover:text-white'
                  >
                    <Send size={20} />
                    <span className='text-[10px] font-semibold text-gray-400'>
                      {shareCounts[post._id] ??
                        post.shareCount ??
                        post.shares?.length ??
                        0}
                    </span>
                  </button>
                  <button
                    type='button'
                    onClick={() => handleRecommendClick(post)}
                    aria-label={
                      interestedPosts.has(post._id)
                        ? 'Remove interest from post'
                        : 'Mark post as interesting'
                    }
                    className={`relative ml-auto flex items-center gap-1.5 transition-colors ${
                      interestedPosts.has(post._id)
                        ? 'text-amber-400'
                        : 'text-gray-300 hover:text-amber-300'
                    }`}
                    title='Recommend'
                  >
                    <Star
                      size={20}
                      fill={interestedPosts.has(post._id) ? 'currentColor' : 'none'}
                    />
                    <span className='text-[10px] font-semibold text-gray-400'>
                      {recommendCounts[post._id] ??
                        post.recommendationCount ??
                        post.recommendations?.length ??
                        post.interestCount ??
                        post.interestedBy?.length ??
                        0}
                    </span>
                  </button>
                </div>
                {Number(post.commentCount) > 0 ? (
                  <section className='px-0 pb-3' aria-label='Post comments preview'>
                    <button
                      type='button'
                      onClick={() => toggleComments(post._id)}
                      className='text-left text-xs font-semibold text-gray-300 transition-colors hover:text-white'
                    >
                      Comments
                      {Number.isFinite(Number(post.commentCount))
                        ? ` · ${post.commentCount}`
                        : ''}
                    </button>
                    {loadingCommentPreviews.has(post._id) ? (
                      <div className='mt-2 flex gap-3 overflow-hidden' aria-label='Loading comments' role='status'>
                        <span className='people-skeleton-block h-3 w-40 shrink-0 rounded-full' />
                        <span className='people-skeleton-block h-3 w-32 shrink-0 rounded-full' />
                        <span className='people-skeleton-block h-3 w-36 shrink-0 rounded-full' />
                      </div>
                    ) : commentPreviews[post._id]?.length ? (
                      <div className='mt-1.5 flex min-w-0 flex-col items-stretch gap-1'>
                        {commentPreviews[post._id].slice(0, 3).map((comment) => (
                          <button
                            key={comment._id}
                            type='button'
                            onClick={() => toggleComments(post._id)}
                            className='block w-full min-w-0 whitespace-normal break-words text-left text-xs leading-5 text-gray-300 hover:text-white'
                          >
                            <span className='mr-1 font-semibold text-emerald-400 [overflow-wrap:anywhere]'>
                              {comment.author?.username || 'User'}
                            </span>
                            <span className='[overflow-wrap:anywhere]'>
                              {comment.text || (comment.audioUrl ? 'Voice comment' : '')}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : commentPreviews[post._id] ? (
                      <p className='mt-1.5 text-xs text-gray-400'>
                        No comments yet.
                      </p>
                    ) : (
                      <p className='mt-1.5 text-xs text-gray-400'>
                        Comments could not be loaded.
                      </p>
                    )}
                  </section>
                ) : (
                  (post.likedByNames?.length || 0) > 0 && (
                    <div
                      className='flex items-center gap-2 overflow-x-auto whitespace-nowrap px-0 pb-3 text-xs text-gray-300'
                      aria-label='People who liked this post'
                    >
                      <span className='shrink-0 font-semibold'>Liked by</span>
                      {post.likedByNames.slice(0, 3).map((name, index) => (
                        <span
                          key={`${post._id}-liker-${index}`}
                          className='shrink-0 font-semibold text-emerald-400'
                        >
                          {name}{index < Math.min(post.likedByNames.length, 3) - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                  )
                )}
                {openComments.has(post._id) && (
                  <>
                    <button
                      type='button'
                      aria-label='Close comments'
                      onClick={() => toggleComments(post._id)}
                      className='fixed inset-0 z-40 cursor-default bg-black/55 backdrop-blur-[2px]'
                    />
                    <div className='fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[86dvh] w-full max-w-2xl animate-fade-in flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#121212] shadow-2xl shadow-black/60'>
                      <div className='relative flex shrink-0 items-center justify-center border-b border-white/10 px-5 pb-4 pt-5'>
                        <span className='absolute top-2 h-1 w-10 rounded-full bg-white/25' />
                        <h2 className='text-sm font-bold text-white'>Comments</h2>
                        <button
                          type='button'
                          aria-label='Close comments'
                          onClick={() => toggleComments(post._id)}
                          className='absolute right-4 rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white'
                        >
                          <X size={20} />
                        </button>
                      </div>
                      <div className='min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 overscroll-contain'>
                      {loadingComments.has(post._id) ? (
                        <div className='space-y-5 py-2' role='status' aria-label='Loading comments'>
                          {Array.from({ length: 4 }, (_, index) => (
                            <div key={`comment-skeleton-${index}`} className='flex items-start gap-3'>
                              <span className='people-skeleton-block h-8 w-8 shrink-0 rounded-full' />
                              <span className='min-w-0 flex-1 space-y-2 pt-1'>
                                <span className='people-skeleton-block block h-3 w-24 rounded-full' />
                                <span className={`people-skeleton-block block h-3 rounded-full ${index % 2 ? 'w-4/5' : 'w-3/5'}`} />
                                <span className='people-skeleton-block block h-2.5 w-20 rounded-full' />
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : uniqueComments(commentsByPost[post._id] || []).length ? (
                        uniqueComments(commentsByPost[post._id] || []).map((comment) => (
                          <div
                            key={comment._id}
                            id={`comment-${comment._id}`}
                            className={`scroll-mt-20 flex items-start gap-3 ${comment.parentComment ? 'ml-8' : ''}`}
                          >
                            <button
                              type='button'
                              onClick={() => {
                                const commenterId = comment.author?._id || comment.author?.id;
                                if (commenterId) {
                                  navigate(`/chat?conversationId=${encodeURIComponent(commenterId)}`);
                                }
                              }}
                              aria-label={`Open chat with ${comment.author?.username || 'user'}`}
                              className='shrink-0 pt-0.5 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-full'
                            >
                              <div className='relative'>
                                <UserAvatar
                                  user={comment.author}
                                  alt={`${comment.author?.username || 'User'} profile`}
                                  className='h-8 w-8 rounded-full object-cover ring-1 ring-white/10'
                                />
                                <span
                                  className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-[#121212] ${
                                    isUserOnline(comment.author?._id) || comment.author?.isOnline
                                      ? 'bg-emerald-400'
                                      : 'bg-gray-600'
                                  }`}
                                />
                              </div>
                            </button>
                            <div className='min-w-0 flex-1'>
                              <button
                                type='button'
                                onClick={() => {
                                  const commenterId = comment.author?._id || comment.author?.id;
                                  if (commenterId) {
                                    navigate(`/chat?conversationId=${encodeURIComponent(commenterId)}`);
                                  }
                                }}
                                className='text-left text-[13px] font-semibold text-white transition hover:text-emerald-400'
                              >
                                {comment.author?.username || 'User'}
                              </button>
                              {comment.text && (
                                <p className={`mt-0.5 break-words leading-5 text-gray-200 ${
                                  isEmojiOnlyComment(comment.text) ? 'text-4xl leading-tight' : 'text-[13px]'
                                }`}>
                                  {isEmojiOnlyComment(comment.text)
                                    ? comment.text
                                    : renderCommentText(comment.text)}
                                </p>
                              )}
                              {comment.audioUrl && (
                                <VoiceWaveform
                                  src={comment.audioUrl}
                                  duration={comment.audioDuration}
                                  seed={comment._id}
                                  compact
                                  className='mt-1 h-20 max-w-xs rounded-xl bg-white/5 px-2'
                                />
                              )}
                              <div className='mt-2 flex items-center gap-4 text-[11px]'>
                                <button
                                  type='button'
                                  onClick={() => toggleCommentLike(comment._id, post._id)}
                                  className={`flex items-center gap-1 ${
                                    comment.likedByCurrentUser ? 'text-rose-400' : 'text-gray-500 hover:text-white'
                                  }`}
                                >
                                  <ThumbsUp size={13} />
                                  {comment.likeCount || 0}
                                </button>
                                <button
                                  type='button'
                                  onClick={() => toggleCommentDislike(comment._id, post._id)}
                                  className={`flex items-center gap-1 ${
                                    comment.dislikedByCurrentUser ? 'text-amber-300' : 'text-gray-500 hover:text-white'
                                  }`}
                                >
                                  <ThumbsDown size={13} />
                                  {comment.dislikeCount || 0}
                                </button>
                                <button
                                  type='button'
                                  onClick={() => setReplyingTo((current) => {
                                    if (current[post._id] === comment._id) {
                                      const next = { ...current };
                                      delete next[post._id];
                                      return next;
                                    }
                                    return { ...current, [post._id]: comment._id };
                                  })}
                                  className='flex items-center gap-1 text-gray-500 hover:text-white'
                                >
                                  <Reply size={13} /> Reply
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className='py-10 text-center text-sm text-gray-500'>
                          No comments yet. Be the first to comment.
                        </p>
                      )}
                      </div>
                      <div className='shrink-0 border-t border-white/10 bg-[#121212] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'>
                        {replyingTo[post._id] && (
                          <div className='mb-2 flex items-center justify-between gap-2 text-xs text-gray-400'>
                            <span className='truncate'>
                              Replying to{' '}
                              <span className='font-semibold text-emerald-400'>
                                {commentsByPost[post._id]?.find(
                                  (comment) => comment._id === replyingTo[post._id],
                                )?.author?.username || 'comment'}
                              </span>
                            </span>
                            <button
                              type='button'
                              onClick={() => setReplyingTo((current) => {
                                const next = { ...current };
                                delete next[post._id];
                                return next;
                              })}
                              className='shrink-0 font-medium text-gray-300 hover:text-white'
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {recordingCommentPostId !== post._id && activeMention?.postId === post._id && (
                          <div
                            role='listbox'
                            aria-label='Mention a user'
                            className='mb-2 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-[#1b1b1b] shadow-xl'
                          >
                            {loadingMentionUsers ? (
                              <p className='px-3 py-2 text-xs text-gray-400'>Finding people…</p>
                            ) : mentionUsers.filter((candidate) => (
                              String(candidate._id || candidate.id) !== String(user?._id || user?.id)
                              && String(candidate.username || '').toLowerCase()
                                .includes(activeMention.query.toLowerCase())
                            )).slice(0, 6).map((candidate) => (
                              <button
                                key={candidate._id || candidate.id}
                                type='button'
                                role='option'
                                aria-selected='false'
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => insertMentionUser(post._id, candidate)}
                                className='flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-100 transition hover:bg-white/10'
                              >
                                <UserAvatar
                                  user={candidate}
                                  alt=''
                                  className='h-7 w-7 rounded-full object-cover'
                                />
                                <span className='truncate font-medium text-emerald-400'>
                                  @{candidate.username}
                                </span>
                              </button>
                            ))}
                            {!loadingMentionUsers && !mentionUsers.some((candidate) => (
                              String(candidate._id || candidate.id) !== String(user?._id || user?.id)
                              && String(candidate.username || '').toLowerCase()
                                .includes(activeMention.query.toLowerCase())
                            )) && (
                              <p className='px-3 py-2 text-xs text-gray-400'>No users found.</p>
                            )}
                          </div>
                        )}
                        <div className='flex items-center gap-2'>
                          <UserAvatar
                            user={user}
                            alt='Your profile'
                            className='h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/10'
                          />
                          {recordingCommentPostId !== post._id && (
                            <>
                              <div className='relative min-w-0 flex-1'>
                                {commentPickerPostId === post._id && (
                                  <>
                                    <button
                                      type='button'
                                      aria-label='Close emoji and sticker picker'
                                      className='fixed inset-0 z-40 cursor-default'
                                      onClick={() => setCommentPickerPostId(null)}
                                    />
                                    <div className='absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#1b1b1b] shadow-2xl'>
                                      <div className='flex border-b border-white/10 p-1'>
                                        <button
                                          type='button'
                                          onClick={() => setCommentPickerTab('emoji')}
                                          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                            commentPickerTab === 'emoji'
                                              ? 'bg-white/10 text-white'
                                              : 'text-gray-400 hover:text-white'
                                          }`}
                                        >
                                          Emoji
                                        </button>
                                        <button
                                          type='button'
                                          onClick={() => setCommentPickerTab('stickers')}
                                          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                            commentPickerTab === 'stickers'
                                              ? 'bg-white/10 text-white'
                                              : 'text-gray-400 hover:text-white'
                                          }`}
                                        >
                                          Stickers
                                        </button>
                                      </div>
                                      {commentPickerTab === 'emoji' ? (
                                        <EmojiPicker
                                          theme={Theme.DARK}
                                          width='min(320px, calc(100vw - 2rem))'
                                          height={320}
                                          lazyLoadEmojis
                                          autoFocusSearch={false}
                                          onEmojiClick={(emojiData) => {
                                            insertCommentEmoji(post._id, emojiData.emoji);
                                          }}
                                        />
                                      ) : (
                                        <div className='grid grid-cols-4 gap-2 p-3'>
                                          {COMMENT_STICKERS.map((sticker) => (
                                            <button
                                              key={sticker.label}
                                              type='button'
                                              aria-label={`Add ${sticker.label} sticker`}
                                              title={sticker.label}
                                              onClick={() => insertCommentEmoji(post._id, sticker.emoji)}
                                              className='flex aspect-square items-center justify-center rounded-xl border border-white/5 bg-gradient-to-br from-emerald-400/15 to-blue-500/10 text-4xl transition hover:scale-105 hover:border-emerald-400/30 hover:bg-white/10 active:scale-95'
                                            >
                                              {sticker.emoji}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                                <input
                                  ref={(element) => {
                                    commentInputRefs.current[post._id] = element;
                                  }}
                                  value={commentDrafts[post._id] || ''}
                                  onChange={(event) => updateMentionDraft(
                                    post._id,
                                    event.target.value,
                                    event.target.selectionStart,
                                  )}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Escape' && activeMention?.postId === post._id) {
                                      setActiveMention(null);
                                      return;
                                    }
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                      event.preventDefault();
                                      const candidates = mentionUsers.filter((candidate) => (
                                        String(candidate._id || candidate.id) !== String(user?._id || user?.id)
                                        && String(candidate.username || '').toLowerCase()
                                          .includes((activeMention?.query || '').toLowerCase())
                                      ));
                                      if (activeMention?.postId === post._id) {
                                        if (candidates[0]) insertMentionUser(post._id, candidates[0]);
                                        return;
                                      }
                                      submitComment(post._id);
                                    }
                                  }}
                                  maxLength={1000}
                                  placeholder={replyingTo[post._id] ? 'Write a reply...' : 'Write a comment...'}
                                  className='w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-11 pr-11 text-[13px] text-white outline-none transition placeholder:text-gray-500 focus:border-white/25'
                                />
                                <button
                                  type='button'
                                  onClick={() => {
                                    setActiveMention((current) => (
                                      current?.postId === post._id ? null : current
                                    ));
                                    setCommentPickerPostId((current) => (
                                      current === post._id ? null : post._id
                                    ));
                                  }}
                                  aria-label='Add emoji or sticker'
                                  aria-expanded={commentPickerPostId === post._id}
                                  title='Add emoji or sticker'
                                  className='absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-emerald-400'
                                >
                                  <Smile size={18} />
                                </button>
                                <button
                                  type='button'
                                  onClick={() => insertMentionTrigger(post._id)}
                                  aria-label='Mention someone'
                                  title='Mention someone'
                                  className='absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-emerald-400'
                                >
                                  <AtSign size={18} />
                                </button>
                              </div>
                            </>
                          )}
                          <CommentVoiceRecorder
                            disabled={submittingComments.has(post._id)}
                            onModeChange={(active) => {
                              setRecordingCommentPostId(active ? post._id : null);
                            }}
                            onSend={(blob, duration) => sendVoiceComment(post._id, blob, duration)}
                          />
                          {recordingCommentPostId !== post._id && (
                            <button
                              type='button'
                              onClick={() => submitComment(post._id)}
                              disabled={
                                submittingComments.has(post._id) ||
                                !commentDrafts[post._id]?.trim()
                              }
                              aria-label={replyingTo[post._id] ? 'Send reply' : 'Send comment'}
                              className='rounded-full bg-white p-2.5 text-gray-900 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40'
                            >
                              {submittingComments.has(post._id) ? (
                                <LoaderCircle size={15} className='animate-spin' />
                              ) : (
                                <Send size={15} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </article>
              {postIndex === 0 && !normalizedSearchTerm && renderStoryCard()}
              </Fragment>
            );
          })}
          {(!normalizedSearchTerm || loadingMorePosts) && displayedMoreLoading && renderPostSkeletons(
            homePostPageSize,
            'home-post-more-skeleton',
          )}
        </div>
        {(displayedMoreError || (displayedHasMore && !displayedMoreLoading)) && (
          <div className='flex justify-center py-8' aria-live='polite'>
            {displayedMoreError ? (
              <button
                type='button'
                onClick={() => {
                  if (normalizedSearchTerm && searchMoreError) loadMoreSearchResultsRef.current?.();
                  else loadMorePostsRef.current?.();
                }}
                className='rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/10'
              >
                Could not load more {normalizedSearchTerm ? 'search results' : 'posts'}. Retry
              </button>
            ) : (
              normalizedSearchTerm && searchHasMore ? (
                <button
                  type='button'
                  onClick={() => loadMoreSearchResultsRef.current?.()}
                  className='rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/10'
                >
                  Load more matching posts
                </button>
              ) : (
                normalizedSearchTerm ? (
                  <button
                    type='button'
                    onClick={() => loadMorePostsRef.current?.()}
                    className='rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/10'
                  >
                    Load more posts
                  </button>
                ) : (
                  <span className='text-xs text-gray-500'>Scroll for more posts</span>
                )
              )
            )}
          </div>
        )}
        </div>
      </section>

      <MobileBottomNav
        active='home'
        onHome={() => window.location.reload()}
        onAdd={openPostTypeMenu}
        onMessages={openChat}
        unreadCount={totalUnread}
      />
      {lightboxUrl && (
        <div
          role='dialog'
          aria-modal='true'
          aria-label='Full-size post image'
          className='fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-4'
          onClick={() => setLightboxUrl(null)}
        >
          <OptimizedImage
            src={lightboxUrl}
            priority
            alt='Full-size post'
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              if (!event.isPrimary) return;
              lightboxDragStart.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = lightboxDragStart.current;
              if (!start || start.pointerId !== event.pointerId) return;
              setLightboxDrag({
                x: event.clientX - start.x,
                y: event.clientY - start.y,
              });
            }}
            onPointerUp={(event) => {
              const start = lightboxDragStart.current;
              if (!start || start.pointerId !== event.pointerId) return;
              const deltaX = event.clientX - start.x;
              const deltaY = event.clientY - start.y;
              lightboxDragStart.current = null;
              if (Math.hypot(deltaX, deltaY) > 110) {
                setLightboxUrl(null);
              }
              setLightboxDrag({ x: 0, y: 0 });
            }}
            onPointerCancel={() => {
              lightboxDragStart.current = null;
              setLightboxDrag({ x: 0, y: 0 });
            }}
            draggable='false'
            className='max-h-full max-w-full cursor-grab touch-none select-none object-contain active:cursor-grabbing'
            style={{
              transform: `translate3d(${lightboxDrag.x}px, ${lightboxDrag.y}px, 0)`,
              opacity: Math.max(
                0.35,
                1 - Math.hypot(lightboxDrag.x, lightboxDrag.y) / 500,
              ),
              transition: lightboxDragStart.current ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
            }}
          />
        </div>
      )}
      {shareModalPost && (
        <SharePostModal
          post={shareModalPost}
          users={shareUsers}
          lastMessages={shareLastMessages}
          loading={shareLoading}
          loadError={shareLoadError}
          error={shareError}
          notice={shareNotice}
          sending={shareSending}
          onClose={() => {
            shareLoadRequestRef.current += 1;
            setShareModalPost(null);
          }}
          onRetry={() => void loadShareRecipients()}
          onSend={handleSendPostToUsers}
          onCopyLink={handleCopyPostLink}
          onSocialShare={handleSocialPostShare}
          onNativeShare={navigator.share ? handleNativePostShare : null}
        />
      )}
      {showPostModal && (
        <CreatePostModal
          token={token}
          user={user}
          shareToStory={postModalShareToStory}
          onClose={() => setShowPostModal(false)}
        />
      )}
      {showBoardEditor && (
        <BoardEditor
          onClose={() => setShowBoardEditor(false)}
          shareToStory={boardEditorShareToStory}
          onSave={handleBoardSave}
        />
      )}
      {boardViewer && (
        <BoardViewer
          boards={boardViewer.boards}
          initialIndex={boardViewer.initialIndex}
          searchTerm={boardViewer.searchTerm}
          onClose={() => setBoardViewer(null)}
        />
      )}
      {storyViewer && (
        <UserPostStoryViewer
          key={String(storyViewer.author?._id || storyViewer.author?.id)}
          author={storyViewer.author}
          posts={storyViewer.posts}
          startPostId={storyViewer.startPostId}
          startSlideIndex={storyViewer.startSlideIndex}
          loading={storyViewer.loading}
          error={storyViewer.error}
          isOwnStory={String(storyViewer.author?._id || storyViewer.author?.id) === String(user?._id || user?.id)}
          onRetry={() => void loadUserStories(
            storyViewer.author,
            {
              postId: storyViewer.startPostId,
              slideIndex: storyViewer.startSlideIndex,
            },
            storyViewer.authorQueue,
            storyViewer.authorIndex,
          )}
          onViewed={markStoryViewed}
          storyViewers={storyViewerList}
          onRefreshViewers={loadStoryViewers}
          onReply={sendStoryReply}
          canNavigatePreviousAuthor={storyViewer.authorIndex > 0}
          canNavigateNextAuthor={storyViewer.authorIndex < storyViewer.authorQueue.length - 1}
          onPreviousAuthor={() => navigateStoryAuthor(-1)}
          onNextAuthor={() => navigateStoryAuthor(1)}
          onClose={closeStoryViewer}
        />
      )}
      {addMenuOpen && (
        <PostTypeMenu
          onClose={() => setAddMenuOpen(false)}
          onSelect={handlePostTypeSelect}
        />
      )}
      {settingsTab && (
        <SettingsModal
          initialTab={settingsTab === 'profile' ? 'account' : settingsTab}
          onClose={() => setSettingsTab(null)}
          onLogout={handleLogout}
        />
      )}
      {incomingCall && (
        <CallModal
          socket={socket}
          currentUser={user}
          incomingCall={incomingCall}
          onClose={() => setIncomingCall(null)}
        />
      )}
    </main>
  );
};

export default Home;
