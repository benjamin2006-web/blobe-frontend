import axios from 'axios';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Eye,
  Grid3X3,
  Image as ImageIcon,
  LoaderCircle,
  Lock,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BoardTextFit from '../components/BoardTextFit';
import { BoardViewer } from '../components/BoardPost';
import { useSocket } from '../contexts/SocketContext';
import {
  getBoardStyle,
  getBoardTextElements,
  getBoardTextPositionStyle,
} from '../components/BoardPostStyles';
import OptimizedImage from '../components/OptimizedImage';
import UserAvatar from '../components/UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import { useUserAvatarActivity } from '../contexts/UserAvatarActivityContext';
import { API_URL } from '../utils/apiUrl';

const getBoards = (post) => post.boards?.length
  ? post.boards
  : [post.board].filter(Boolean);

const getImageSources = (post) => {
  return post.mediaUrls?.length
    ? post.mediaUrls
    : [post.mediaUrl].filter(Boolean);
};

const getImageThumbnails = (post) => (
  post.mediaThumbnailUrls?.length
    ? post.mediaThumbnailUrls
    : [post.mediaThumbnailUrl].filter(Boolean)
);

const formatCount = (count = 0) => {
  const value = Number(count) || 0;
  const units = [
    { threshold: 1_000_000_000, suffix: 'b' },
    { threshold: 1_000_000, suffix: 'm' },
    { threshold: 1_000, suffix: 'k' },
  ];
  const unit = units.find(({ threshold }) => value >= threshold);
  if (!unit) return String(value);
  const abbreviated = Math.floor((value / unit.threshold) * 10) / 10;
  return `${Number.isInteger(abbreviated) ? abbreviated : abbreviated.toFixed(1)}${unit.suffix}`;
};

const renderBio = (bio) => {
  const pattern = /(https?:\/\/[^\s]+|www\.[^\s]+|\+?\d[\d\s().-]{5,}\d)/gi;
  const parts = [];
  let previousEnd = 0;

  for (const match of bio.matchAll(pattern)) {
    const value = match[0];
    const start = match.index;
    const isUrl = /^(https?:\/\/|www\.)/i.test(value);
    const linkedValue = isUrl ? value.replace(/[.,!?;:]+$/, '') : value;
    const trailingPunctuation = value.slice(linkedValue.length);
    const digits = linkedValue.replace(/\D/g, '');

    if (start > previousEnd) parts.push(bio.slice(previousEnd, start));
    if (isUrl) {
      const href = /^www\./i.test(linkedValue) ? `https://${linkedValue}` : linkedValue;
      parts.push(
        <a
          key={start}
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          className='break-all font-medium text-emerald-400 hover:text-emerald-300 hover:underline'
        >
          {linkedValue}
        </a>,
      );
      if (trailingPunctuation) parts.push(trailingPunctuation);
    } else if (digits.length >= 7) {
      parts.push(
        <a
          key={start}
          href={`tel:${linkedValue.replace(/[^\d+]/g, '')}`}
          className='font-medium text-emerald-400 hover:text-emerald-300 hover:underline'
        >
          {linkedValue}
        </a>,
      );
    } else {
      parts.push(value);
    }
    previousEnd = start + value.length;
  }

  if (previousEnd < bio.length) parts.push(bio.slice(previousEnd));
  return parts;
};

const Dashboard = () => {
  const { userId } = useParams();
  const { token, user: currentUser } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(location.state?.profile || null);
  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [postPageSize, setPostPageSize] = useState(
    () => window.matchMedia('(min-width: 640px)').matches ? 9 : 4,
  );
  const [postLoadError, setPostLoadError] = useState('');
  const [error, setError] = useState('');
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [openPostMenuId, setOpenPostMenuId] = useState(null);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [following, setFollowing] = useState(false);
  const [pendingFollow, setPendingFollow] = useState(false);
  const [actionError, setActionError] = useState('');
  const [dashboardStats, setDashboardStats] = useState(null);
  const [friendStories, setFriendStories] = useState([]);
  const [friendStoriesLoading, setFriendStoriesLoading] = useState(true);
  const [friendStoriesError, setFriendStoriesError] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [peopleListType, setPeopleListType] = useState('');
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');
  const [peopleOffset, setPeopleOffset] = useState(0);
  const [peopleHasMore, setPeopleHasMore] = useState(false);
  const [peopleRetry, setPeopleRetry] = useState(0);
  const peopleLoadingRef = useRef(false);
  const peopleHasMoreRef = useRef(false);
  const peopleScrollRef = useRef(null);
  const peopleSentinelRef = useRef(null);
  const dashboardScrollRef = useRef(null);
  const postsSentinelRef = useRef(null);
  const postPageSizeRef = useRef(postPageSize);
  const loadingMorePostsRef = useRef(false);
  const isOwnProfile = String(currentUser?._id || currentUser?.id) === userId;
  const activeStories = useUserAvatarActivity(profile);

  const loadFriendStories = useCallback(async () => {
    if (!token) {
      setFriendStories([]);
      setFriendStoriesLoading(false);
      return;
    }
    setFriendStoriesLoading(true);
    setFriendStoriesError('');
    try {
      const { data } = await axios.get(`${API_URL}/users/friends/unseen-stories`, {
        headers: { Authorization: ['Bearer', token].join(' ') },
      });
      setFriendStories(Array.isArray(data.friends) ? data.friends : []);
    } catch (loadError) {
      console.error('Failed to load friends’ unseen stories:', loadError);
      setFriendStoriesError(
        loadError.response?.data?.message || 'Could not load friends’ stories.',
      );
    } finally {
      setFriendStoriesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
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
    const desktopGrid = window.matchMedia('(min-width: 640px)');
    const syncPageSize = (event) => {
      const nextPageSize = event.matches ? 9 : 4;
      postPageSizeRef.current = nextPageSize;
      setPostPageSize(nextPageSize);
    };
    desktopGrid.addEventListener('change', syncPageSize);
    return () => desktopGrid.removeEventListener('change', syncPageSize);
  }, []);

  const openPeopleList = (type) => {
    setPeople([]);
    setPeopleError('');
    setPeopleLoading(true);
    setPeopleOffset(0);
    setPeopleHasMore(false);
    peopleLoadingRef.current = true;
    peopleHasMoreRef.current = false;
    setPeopleListType(type);
  };

  const loadDashboardStats = useCallback(async () => {
    if (!token || !isOwnProfile) return;
    try {
      const { data } = await axios.get(`${API_URL}/users/${userId}/dashboard-stats`, {
        headers: { Authorization: ['Bearer', token].join(' ') },
      });
      setDashboardStats(data);
    } catch (statsError) {
      setActionError(statsError.response?.data?.message || 'Could not load dashboard statistics.');
    }
  }, [isOwnProfile, token, userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadDashboardStats();
    });
    return () => {
      cancelled = true;
    };
  }, [loadDashboardStats]);

  useEffect(() => {
    if (!token || isOwnProfile) return;
    axios.post(`${API_URL}/users/${userId}/profile-view`, null, {
      headers: { Authorization: ['Bearer', token].join(' ') },
    }).catch((viewError) => {
      console.error('Could not record profile visit:', viewError);
    });
  }, [isOwnProfile, token, userId]);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (active) setProfile(data.user);
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.message || 'Could not load this profile.');
          setLoading(false);
        }
      }
    };
    void loadProfile();
    return () => {
      active = false;
    };
  }, [token, userId]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleBioUpdated = (update) => {
      if (String(update?.userId) !== String(userId) || typeof update.bio !== 'string') return;
      setProfile((current) => current ? { ...current, bio: update.bio } : current);
    };
    socket.on('profile_bio_updated', handleBioUpdated);
    return () => socket.off('profile_bio_updated', handleBioUpdated);
  }, [socket, userId]);

  useEffect(() => {
    if (!peopleListType || !token) return undefined;
    let active = true;
    axios.get(`${API_URL}/users/${userId}/${peopleListType}`, {
      params: { offset: peopleOffset },
      headers: { Authorization: `Bearer ${token}` },
    }).then(({ data }) => {
      if (active) {
        const nextUsers = Array.isArray(data.users) ? data.users : [];
        setPeople((current) => {
          if (peopleOffset === 0) return nextUsers;
          const existingIds = new Set(current.map((person) => String(person._id || person.id)));
          return [...current, ...nextUsers.filter((person) => (
            !existingIds.has(String(person._id || person.id))
          ))];
        });
        peopleHasMoreRef.current = Boolean(data.hasMore);
        setPeopleHasMore(Boolean(data.hasMore));
        setPeopleError('');
      }
    }).catch((loadError) => {
      if (active) {
        setPeopleError(loadError.response?.data?.message || `Could not load ${peopleListType}.`);
      }
    }).finally(() => {
      if (active) {
        peopleLoadingRef.current = false;
        setPeopleLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [peopleListType, peopleOffset, peopleRetry, token, userId]);

  useEffect(() => {
    const root = peopleScrollRef.current;
    const sentinel = peopleSentinelRef.current;
    if (!root || !sentinel || !peopleListType || !peopleHasMore) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (
        entry.isIntersecting
        && peopleHasMoreRef.current
        && !peopleLoadingRef.current
      ) {
        peopleLoadingRef.current = true;
        setPeopleLoading(true);
        setPeopleOffset((current) => current + 5);
      }
    }, { root, rootMargin: '0px 0px 48px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [peopleHasMore, people.length, peopleListType]);

  useEffect(() => {
    if (!peopleListType) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPeopleListType('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [peopleListType]);

  useEffect(() => {
    if (!token || isOwnProfile) return undefined;
    let active = true;
    axios.get(`${API_URL}/users/following`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(({ data }) => {
      if (active && Array.isArray(data.userIds)) {
        setFollowing(data.userIds.map(String).includes(userId));
      }
    }).catch((loadError) => {
      if (active) {
        setActionError(loadError.response?.data?.message || 'Could not load follow status.');
      }
    });
    return () => {
      active = false;
    };
  }, [isOwnProfile, token, userId]);

  const toggleFollow = async () => {
    if (pendingFollow) return;
    setPendingFollow(true);
    setActionError('');
    try {
      const { data } = await axios.post(
        `${API_URL}/users/${userId}/follow`,
        null,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 },
      );
      setFollowing(Boolean(data.following));
      setProfile((current) => current
        ? { ...current, followerCount: data.followerCount }
        : current);
    } catch (followError) {
      setActionError(followError.response?.data?.message || 'Could not update follow.');
    } finally {
      setPendingFollow(false);
    }
  };

  const saveBio = async () => {
    if (savingBio) return;
    setSavingBio(true);
    setActionError('');
    setBioSaved(false);
    const bio = bioDraft.trim();
    try {
      await axios.put(
        `${API_URL}/users/profile`,
        { bio },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      window.location.reload();
    } catch (saveError) {
      setActionError(saveError.response?.data?.message || 'Could not save your bio.');
    } finally {
      setSavingBio(false);
    }
  };

  const deletePost = async (post) => {
    if (deletingPostId) return;
    const confirmed = window.confirm(
      'Permanently delete this post, its comments, and its stored media? This cannot be undone.',
    );
    if (!confirmed) return;
    setDeletingPostId(String(post._id));
    setActionError('');
    setOpenPostMenuId(null);
    try {
      await axios.delete(`${API_URL}/posts/${post._id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000,
      });
      setPosts((current) => current.filter((item) => String(item._id) !== String(post._id)));
      void loadDashboardStats();
      setSelectedBoard((current) => (
        String(current?.post?._id) === String(post._id) ? null : current
      ));
      setSelectedImage((current) => (
        String(current?.post?._id) === String(post._id) ? null : current
      ));
    } catch (deleteError) {
      setActionError(deleteError.response?.data?.message || 'Could not permanently delete this post.');
    } finally {
      setDeletingPostId(null);
    }
  };

  const loadPosts = useCallback(async (cursor, append) => {
    if (append) {
      if (loadingMorePostsRef.current) return;
      loadingMorePostsRef.current = true;
      setLoadingMore(true);
      setPostLoadError('');
    }
    else {
      setLoading(true);
      setError('');
      setPostLoadError('');
    }
    try {
      const { data } = await axios.get(`${API_URL}/posts`, {
        params: {
          authorId: userId,
          archive: true,
          limit: postPageSizeRef.current,
          ...(cursor ? { cursor } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setPosts((current) => {
        if (!append) return data.posts || [];
        const existingIds = new Set(current.map((post) => String(post._id)));
        return [...current, ...(data.posts || []).filter((post) => (
          !existingIds.has(String(post._id))
        ))];
      });
      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (loadError) {
      const message = loadError.response?.data?.message || 'Could not load this dashboard.';
      if (append) setPostLoadError(message);
      else setError(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMorePostsRef.current = false;
    }
  }, [token, userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadPosts(null, false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadPosts]);

  useEffect(() => {
    const root = dashboardScrollRef.current;
    const sentinel = postsSentinelRef.current;
    if (!root || !sentinel || !hasMore || loading || loadingMore || postLoadError) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingMorePostsRef.current) return;
      void loadPosts(nextCursor, true);
    }, { root, rootMargin: '0px 0px 320px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPosts, loading, loadingMore, nextCursor, postLoadError]);

  const allBoards = useMemo(
    () => selectedBoard ? getBoards(selectedBoard.post) : [],
    [selectedBoard],
  );

  useEffect(() => {
    if (!selectedImage) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedImage(null);
      if (event.key === 'ArrowLeft') {
        setSelectedImage((current) => ({
          ...current,
          index: Math.max(0, current.index - 1),
        }));
      }
      if (event.key === 'ArrowRight') {
        setSelectedImage((current) => ({
          ...current,
          index: Math.min(current.images.length - 1, current.index + 1),
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage]);

  return (
    <main ref={dashboardScrollRef} className='fixed inset-0 z-10 h-[100dvh] overflow-y-auto overscroll-contain bg-gray-950 pb-10 text-white'>
      <header className='sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-gray-950/85 px-4 backdrop-blur-xl'>
        <button
          type='button'
          onClick={() => navigate(-1)}
          aria-label='Go back'
          className='rounded-full p-2 text-gray-300 transition hover:bg-white/10 hover:text-white'
        >
          <ArrowLeft size={21} />
        </button>
        <div className='min-w-0 flex-1'>
          <h1 className='truncate text-base font-bold'>Dashboard</h1>
          <p className='truncate text-xs text-gray-400'>{profile?.username || 'Profile'}</p>
        </div>
      </header>

      <aside
        aria-label="Friends' and followed accounts"
        className='fixed bottom-0 left-0 top-14 z-20 hidden w-[280px] flex-col overflow-hidden border-y border-r border-white/10 bg-gray-900/90 shadow-xl shadow-black/20 backdrop-blur-xl xl:flex'
      >
        <div className='border-b border-white/10 px-4 py-4'>
          <h2 className='friends-heading-gradient text-base font-extrabold'>
            Friends' &amp; followed
          </h2>
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto px-2 py-2'>
          {friendStoriesLoading ? (
            <div className='space-y-2' aria-label='Loading friends and followed accounts'>
              {[0, 1, 2].map((item) => (
                <div
                  key={`dashboard-friend-skeleton-${item}`}
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
              No chat friends or followed accounts to show yet.
            </p>
          ) : (
            <ul className='space-y-1'>
              {friendStories.map((friend) => {
                const friendId = String(friend._id || friend.id);
                const unseenStoryCount = Number(friend.unseenStoryCount || 0);
                const hasUnseenStories = unseenStoryCount > 0;
                return (
                  <li key={friendId}>
                    <button
                      type='button'
                      onClick={() => {
                        if (hasUnseenStories) {
                          navigate(`/home?storyUser=${encodeURIComponent(friendId)}`, {
                            state: { storyAuthor: friend },
                          });
                        } else {
                          navigate(`/chat?conversationId=${encodeURIComponent(friendId)}`);
                        }
                      }}
                      className='flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                      aria-label={hasUnseenStories
                        ? `View ${unseenStoryCount} unseen ${unseenStoryCount === 1 ? 'story' : 'stories'} from ${friend.username}`
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
                            : 'No new story'}
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

      <section className='mx-auto max-w-4xl px-4 xl:ml-[300px] xl:mr-8 xl:max-w-none'>
        <div className='flex flex-col items-center border-b border-white/10 py-7 text-center sm:py-10'>
          {activeStories.length > 0 ? (
            <button
              type='button'
              aria-label={`View ${profile?.username || 'user'} status`}
              title='View status'
              onClick={() => navigate(`/home?storyUser=${encodeURIComponent(userId)}`, {
                state: { storyAuthor: profile },
              })}
              className='rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-emerald-400'
            >
              <UserAvatar
                user={profile}
                alt={`${profile?.username || 'User'} profile`}
                className='h-24 w-24 rounded-full object-cover ring-2 ring-white/10 sm:h-28 sm:w-28'
              />
            </button>
          ) : (
            <UserAvatar
              user={profile}
              alt={`${profile?.username || 'User'} profile`}
              className='h-24 w-24 rounded-full object-cover ring-2 ring-white/10 sm:h-28 sm:w-28'
            />
          )}
          <div className='mt-4 flex w-full flex-col items-center'>
            <h2 className='max-w-full truncate text-xl font-semibold sm:text-2xl'>
              {profile?.username || 'Loading profile…'}
            </h2>
            {editingBio ? (
              <div className='mt-3 w-full max-w-xl space-y-2 text-left'>
                <textarea
                  value={bioDraft}
                  onChange={(event) => setBioDraft(event.target.value)}
                  maxLength={200}
                  rows={3}
                  aria-label='Profile bio'
                  placeholder='Add a short bio…'
                  className='w-full resize-y rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400'
                />
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-xs text-gray-400'>{bioDraft.length}/200</span>
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      onClick={() => {
                        setBioDraft(profile?.bio || '');
                        setEditingBio(false);
                      }}
                      disabled={savingBio}
                      className='rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50'
                    >
                      Cancel
                    </button>
                    <button
                      type='button'
                      onClick={() => void saveBio()}
                      disabled={savingBio}
                      className='rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50'
                    >
                      {savingBio ? 'Saving…' : 'Save bio'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className='mt-2 flex max-w-full items-center justify-center gap-2'>
                  {profile?.bio && (
                    <p className='max-w-xl whitespace-pre-wrap break-words text-sm text-gray-300'>
                      {renderBio(profile.bio)}
                    </p>
                  )}
                  {isOwnProfile && (
                    <button
                      type='button'
                      aria-label={profile?.bio ? 'Edit bio' : 'Add bio'}
                      title={profile?.bio ? 'Edit bio' : 'Add bio'}
                      onClick={() => {
                        setBioDraft(profile?.bio || '');
                        setBioSaved(false);
                        setActionError('');
                        setEditingBio(true);
                      }}
                      className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-400 transition hover:bg-emerald-400/10 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                    >
                      {profile?.bio ? <Pencil size={16} /> : <Plus size={18} />}
                    </button>
                  )}
                </div>
                {isOwnProfile && bioSaved && (
                  <p className='mt-1 text-xs text-emerald-400' role='status'>Bio updated.</p>
                )}
              </>
            )}
            <div className='mt-5 flex w-full max-w-md items-center justify-center gap-3'>
              {!isOwnProfile && (
                <>
                  <button
                    type='button'
                    onClick={() => navigate(`/chat?conversationId=${encodeURIComponent(userId)}`)}
                    aria-label={profile?.isPrivate ? 'Private account' : 'Send message'}
                    className='inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 active:scale-[0.98]'
                  >
                    {profile?.isPrivate ? <Lock size={18} /> : <Send size={18} />}
                    {profile?.isPrivate ? (
                      <span>Private</span>
                    ) : (
                      <>
                        <span className='sm:hidden'>Message</span>
                        <span className='hidden sm:inline'>Send message</span>
                      </>
                    )}
                  </button>
                  {following ? (
                    <button
                      type='button'
                      aria-label={`Unfollow ${profile?.username || 'user'}`}
                      title='Unfollow'
                      disabled={pendingFollow}
                      onClick={() => void toggleFollow()}
                      className='inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/10 active:scale-95 disabled:opacity-50'
                    >
                      {pendingFollow
                        ? <LoaderCircle size={20} className='animate-spin' />
                        : <Bell size={20} />}
                    </button>
                  ) : (
                    <button
                      type='button'
                      disabled={pendingFollow}
                      onClick={() => void toggleFollow()}
                      className='min-h-11 flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50'
                    >
                      {pendingFollow ? 'Following…' : 'Follow'}
                    </button>
                  )}
                </>
              )}
              {isOwnProfile && (
                <button
                  type='button'
                  onClick={() => navigate('/home?editProfile=1')}
                  className='min-h-11 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10'
                >
                  Edit profile
                </button>
              )}
            </div>
            <div className='mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-300'>
              <button
                type='button'
                onClick={() => openPeopleList('followers')}
                aria-label={`View ${profile?.followerCount ?? profile?.followers?.length ?? 0} followers`}
                className='inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
              >
                <Users size={16} />
                <strong className='text-white'>
                  {profile?.followerCount ?? profile?.followers?.length ?? 0}
                </strong> followers
              </button>
              <button
                type='button'
                onClick={() => openPeopleList('following')}
                aria-label={`View ${formatCount(profile?.followingCount)} following`}
                className='inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
              >
                <UserRoundCheck size={16} />
                <strong className='text-white'>{formatCount(profile?.followingCount)}</strong> following
              </button>
              {isOwnProfile && (
                <>
                  <span className='inline-flex items-center gap-2'>
                    <Eye size={16} />
                    <strong className='text-white'>{formatCount(dashboardStats?.totalPostViews)}</strong> views
                  </span>
                  <span className='inline-flex items-center gap-2'>
                    <ChartNoAxesCombined size={16} />
                    <strong className='text-white'>{formatCount(dashboardStats?.profileVisits)}</strong> profile visits
                  </span>
                </>
              )}
            </div>
            {actionError && (
              <p role='alert' className='mt-3 text-sm text-red-300'>{actionError}</p>
            )}
          </div>
        </div>

        <div className='flex items-center gap-2 py-4 text-xs font-bold uppercase tracking-[0.18em] text-gray-300'>
          <Grid3X3 size={15} />
          Posts
          <span className='font-bold tracking-normal text-white'>
            {formatCount(isOwnProfile && dashboardStats
              ? dashboardStats.totalPostCount
              : posts.length)}
            {!(isOwnProfile && dashboardStats) && hasMore ? '+' : ''}
          </span>
        </div>

        {!loading && error && (
          <div role='alert' className='rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200'>
            {error}
          </div>
        )}
        {!loading && !error && posts.length === 0 && (
          <div className='flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-14 text-center'>
            <ImageIcon size={32} className='text-gray-500' />
            <p className='mt-3 font-semibold'>No posts yet</p>
            <p className='mt-1 text-sm text-gray-400'>Images and boards will appear here.</p>
          </div>
        )}

        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3'>
          {loading && Array.from({ length: postPageSize }, (_, index) => (
            <div
              key={`post-skeleton-${index}`}
              aria-hidden='true'
              className='people-skeleton-block aspect-[4/5] rounded-sm'
            />
          ))}
          {posts.map((post) => {
            const images = getImageSources(post);
            const thumbnails = getImageThumbnails(post);
            const board = getBoards(post)[0];
            const image = images[0];
            return (
              <div
                key={post._id}
                className={`group relative aspect-[4/5] overflow-hidden ${
                  image ? 'people-skeleton-block' : 'bg-gray-900'
                }`}
              >
                <button
                  type='button'
                  onClick={() => {
                    if (board) setSelectedBoard({ post });
                    else if (image) setSelectedImage({ post, images, index: 0 });
                  }}
                  aria-label={`Open ${board ? 'board' : 'image'} post`}
                  className='absolute inset-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400'
                >
                  {board ? (
                    <div
                      className='relative h-full w-full overflow-hidden'
                      style={{ containerType: 'inline-size', ...getBoardStyle(board) }}
                    >
                      {getBoardTextElements(board).map((text, textIndex) => (
                        <div
                          key={textIndex}
                          className='absolute'
                          style={getBoardTextPositionStyle(text)}
                        >
                          <BoardTextFit board={text} />
                        </div>
                      ))}
                    </div>
                  ) : image ? (
                    <OptimizedImage
                      src={thumbnails[0] || image}
                      alt={post.caption || 'Post image'}
                      className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                    />
                  ) : null}
                  <span className='pointer-events-none absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-1 text-[10px] font-semibold text-white shadow'>
                    <Eye size={12} />
                    {formatCount(post.viewCount ?? post.viewers?.length)}
                  </span>
                  {post.mediaType === 'image' && images.length > 1 && (
                    <span className='absolute right-2 top-2 rounded bg-black/55 p-1 text-white'>
                      <Play size={13} fill='currentColor' />
                    </span>
                  )}
                  <div className='pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/65 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100'>
                    <span className='line-clamp-2 text-xs text-white'>{post.caption}</span>
                    <span className='mt-1 inline-flex items-center gap-1 text-[10px] text-gray-200'>
                      <CalendarDays size={11} />
                      {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                </button>
                {isOwnProfile && (
                  <div className='absolute right-1.5 top-1.5 z-10'>
                    <button
                      type='button'
                      aria-label='Post options'
                      aria-haspopup='menu'
                      aria-expanded={openPostMenuId === String(post._id)}
                      disabled={deletingPostId === String(post._id)}
                      onClick={() => setOpenPostMenuId((current) => (
                        current === String(post._id) ? null : String(post._id)
                      ))}
                      className='flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow transition hover:bg-black/85 disabled:opacity-50'
                    >
                      {deletingPostId === String(post._id)
                        ? <LoaderCircle size={17} className='animate-spin' />
                        : <MoreVertical size={18} />}
                    </button>
                    {openPostMenuId === String(post._id) && (
                      <div
                        role='menu'
                        className='absolute right-0 top-full mt-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-gray-900 py-1 shadow-xl'
                      >
                        <button
                          type='button'
                          role='menuitem'
                          onClick={() => void deletePost(post)}
                          className='flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/15'
                        >
                          <Trash2 size={16} />
                          Delete post
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {loadingMore && Array.from({ length: postPageSize }, (_, index) => (
            <div
              key={`post-skeleton-${nextCursor}-${index}`}
              aria-hidden='true'
              className='people-skeleton-block aspect-[4/5] rounded-sm'
            />
          ))}
        </div>

        {postLoadError && (
          <div className='flex flex-col items-center gap-3 py-6'>
            <p role='alert' className='text-sm text-red-300'>{postLoadError}</p>
            <button
              type='button'
              onClick={() => void loadPosts(nextCursor, true)}
              className='rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10'
            >
              Try again
            </button>
          </div>
        )}
        {hasMore && !loading && !loadingMore && !postLoadError && (
          <div className='flex justify-center py-7'>
            <button
              type='button'
              onClick={() => void loadPosts(nextCursor, true)}
              className='rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50'
            >
              Load more posts
            </button>
          </div>
        )}
        {hasMore && <div ref={postsSentinelRef} aria-hidden='true' className='h-px' />}
      </section>

      {peopleListType && (
        <div
          className='fixed inset-0 z-[65] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4'
          onClick={() => setPeopleListType('')}
        >
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='profile-people-title'
            className='flex max-h-[min(78dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-gray-900 shadow-2xl sm:rounded-2xl'
            onClick={(event) => event.stopPropagation()}
          >
            <header className='flex items-center justify-between border-b border-white/10 px-5 py-4'>
              <h2 id='profile-people-title' className='text-base font-semibold text-white'>
                {peopleListType === 'followers' ? 'Followers' : 'Following'}
              </h2>
              <button
                type='button'
                aria-label='Close people list'
                onClick={() => setPeopleListType('')}
                className='rounded-full p-2 text-gray-300 transition hover:bg-white/10 hover:text-white'
              >
                <X size={20} />
              </button>
            </header>
            <div
              ref={peopleScrollRef}
              className='h-[min(42dvh,18rem)] min-h-32 overflow-y-auto overscroll-contain p-2'
              onScroll={(event) => {
                const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
                if (
                  scrollHeight - scrollTop - clientHeight < 64
                  && peopleHasMoreRef.current
                  && !peopleLoadingRef.current
                ) {
                  peopleLoadingRef.current = true;
                  setPeopleLoading(true);
                  setPeopleOffset((current) => current + 5);
                }
              }}
            >
              {peopleError && (
                <div className='px-4 py-8 text-center'>
                  <p role='alert' className='text-sm text-red-300'>{peopleError}</p>
                  <button
                    type='button'
                    onClick={() => {
                      peopleLoadingRef.current = true;
                      setPeopleLoading(true);
                      setPeopleError('');
                      setPeopleRetry((current) => current + 1);
                    }}
                    className='mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-400 hover:bg-white/10'
                  >
                    Try again
                  </button>
                </div>
              )}
              {!peopleLoading && !peopleError && people.length === 0 && (
                <p className='px-4 py-8 text-center text-sm text-gray-400'>
                  No {peopleListType} yet.
                </p>
              )}
              {people.map((person) => {
                const personId = String(person._id || person.id || '');
                return (
                  <button
                    key={personId}
                    type='button'
                    onClick={() => {
                      setPeopleListType('');
                      if (personId) navigate(`/dashboard/${encodeURIComponent(personId)}`, {
                        state: { profile: person },
                      });
                    }}
                    className='flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                  >
                    <UserAvatar
                      user={person}
                      alt={`${person.username || 'User'} profile`}
                      className='h-11 w-11 rounded-full object-cover'
                      loading='lazy'
                    />
                    <span className='min-w-0 flex-1 truncate text-sm font-semibold text-white'>
                      {person.username || 'Unknown user'}
                    </span>
                  </button>
                );
              })}
              {peopleLoading && Array.from({ length: 5 }, (_, index) => (
                <div
                  key={`people-skeleton-${peopleOffset}-${index}`}
                  aria-hidden='true'
                  className='flex min-h-[66px] items-center gap-3 rounded-xl px-3 py-2.5'
                >
                  <span className='people-skeleton-block h-11 w-11 shrink-0 rounded-full' />
                  <span className='flex flex-1 flex-col gap-2'>
                    <span className={`people-skeleton-block h-3.5 rounded-full ${index % 2 ? 'w-2/5' : 'w-1/3'}`} />
                    <span className={`people-skeleton-block h-2.5 rounded-full ${index % 2 ? 'w-1/4' : 'w-1/5'}`} />
                  </span>
                </div>
              ))}
              <div ref={peopleSentinelRef} aria-hidden='true' className='h-px' />
            </div>
          </section>
        </div>
      )}

      {selectedBoard && (
        <BoardViewer
          board={allBoards[0]}
          boards={allBoards}
          onClose={() => setSelectedBoard(null)}
        />
      )}
      {selectedImage && (
        <div
          role='dialog'
          aria-modal='true'
          aria-label='Post image'
          className='fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4'
          onClick={() => setSelectedImage(null)}
        >
          <button
            type='button'
            aria-label='Close post'
            onClick={() => setSelectedImage(null)}
            className='absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-white/15'
          >
            <X size={23} />
          </button>
          {selectedImage.index > 0 && (
            <button
              type='button'
              aria-label='Previous image'
              onClick={(event) => {
                event.stopPropagation();
                setSelectedImage((current) => ({ ...current, index: current.index - 1 }));
              }}
              className='absolute left-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-white/15'
            >
              <ChevronLeft size={26} />
            </button>
          )}
          <OptimizedImage
            src={selectedImage.images[selectedImage.index]}
            alt={selectedImage.post.caption || 'Post image'}
            className='max-h-[82vh] max-w-full object-contain'
            onClick={(event) => event.stopPropagation()}
          />
          {selectedImage.index < selectedImage.images.length - 1 && (
            <button
              type='button'
              aria-label='Next image'
              onClick={(event) => {
                event.stopPropagation();
                setSelectedImage((current) => ({ ...current, index: current.index + 1 }));
              }}
              className='absolute right-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-white/15'
            >
              <ChevronRight size={26} />
            </button>
          )}
          {selectedImage.images.length > 1 && (
            <div className='absolute bottom-7 flex gap-2' onClick={(event) => event.stopPropagation()}>
              {selectedImage.images.map((src, index) => (
                <button
                  key={`${src}-${index}`}
                  type='button'
                  aria-label={`Show image ${index + 1}`}
                  onClick={() => setSelectedImage((current) => ({ ...current, index }))}
                  className={`h-2 w-2 rounded-full ${selectedImage.index === index ? 'bg-white' : 'bg-white/40'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default Dashboard;
