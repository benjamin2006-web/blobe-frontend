import axios from 'axios';
import {
  AlertCircle,
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../utils/apiUrl';
import { getAvatarUrl } from '../../utils/avatar';
import OptimizedImage from '../OptimizedImage';
import UserAvatar from '../UserAvatar';

const formatLastSeen = (lastSeen, now) => {
  if (!lastSeen || !now) return 'Offline';
  const lastSeenTime = new Date(lastSeen).getTime();
  if (!Number.isFinite(lastSeenTime) || lastSeenTime <= 0) return 'Offline';
  const diff = Math.max(0, now - lastSeenTime);
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days === 1) return 'Yesterday';
  return new Date(lastSeen).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const formatLocation = (location) => {
  if (!location) return 'Not shared';
  if (location.address || location.formattedAddress) {
    return location.address || location.formattedAddress;
  }
  if (location.lat != null && location.lon != null) return 'Location shared';
  return 'Not shared';
};

/* ── Confirm dialog ──────────────────────────────────────────── */
const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  loading,
}) =>
  ReactDOM.createPortal(
    <>
      <div
        className='fixed inset-0 z-[299] bg-black/60 backdrop-blur-sm'
        onClick={onCancel}
      />
      <div className='fixed inset-0 z-[300] flex items-center justify-center p-4'>
        <div className='bg-gray-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-xs overflow-hidden animate-fade-in'>
          <div className='flex items-start gap-3 px-5 pt-5 pb-3'>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-500/15' : 'bg-yellow-500/15'}`}
            >
              <AlertCircle
                size={18}
                className={danger ? 'text-red-400' : 'text-yellow-400'}
              />
            </div>
            <div className='flex-1 min-w-0 pt-0.5'>
              <p className='font-bold text-white text-sm'>{title}</p>
              <p className='text-xs text-gray-400 mt-1 leading-relaxed'>
                {message}
              </p>
            </div>
          </div>
          <div className='px-4 pb-4 flex gap-2 mt-1'>
            <button
              onClick={onCancel}
              className='flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-semibold text-gray-200 transition-colors active:scale-[0.98]'
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 ${
                danger
                  ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/30'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/30'
              }`}
            >
              {loading ? '…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );

/* ── User Info Panel ─────────────────────────────────────────── */
export const UserInfoPanel = ({
  selectedUser,
  profileOnly = false,
  position,
  onClose,
  onUserBlocked,
  onUserMuted,
  onChatDeleted,
  onRefreshUsers,
}) => {
  const { token } = useAuth();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [profileOffset, setProfileOffset] = useState({ x: 0, y: 0 });
  const [profileClosing, setProfileClosing] = useState(false);
  const profileGestureRef = useRef({ active: false, startX: 0, startY: 0 });
  const profileCloseTimerRef = useRef(null);
  const [profileImageOpen, setProfileImageOpen] = useState(false);
  const [profileImageOffset, setProfileImageOffset] = useState({ x: 0, y: 0 });
  const [profileImageClosing, setProfileImageClosing] = useState(false);
  const profileImageGestureRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
  });
  const profileImageCloseTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (profileCloseTimerRef.current) {
        clearTimeout(profileCloseTimerRef.current);
      }
      if (profileImageCloseTimerRef.current) {
        clearTimeout(profileImageCloseTimerRef.current);
      }
    },
    [],
  );

  const closeProfileImage = (offset = { x: 0, y: 0 }) => {
    if (!profileImageOpen || profileImageClosing) return;
    setProfileImageClosing(true);
    setProfileImageOffset(offset);
    profileImageCloseTimerRef.current = setTimeout(() => {
      profileImageCloseTimerRef.current = null;
      setProfileImageOpen(false);
      setProfileImageClosing(false);
      setProfileImageOffset({ x: 0, y: 0 });
    }, 200);
  };

  const onProfileImagePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    profileImageGestureRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onProfileImagePointerMove = (event) => {
    const gesture = profileImageGestureRef.current;
    if (!gesture.active || profileImageClosing) return;
    setProfileImageOffset({
      x: event.clientX - gesture.startX,
      y: event.clientY - gesture.startY,
    });
  };

  const onProfileImagePointerEnd = (event) => {
    const gesture = profileImageGestureRef.current;
    if (!gesture.active) return;
    const offset = {
      x: event.clientX - gesture.startX,
      y: event.clientY - gesture.startY,
    };
    profileImageGestureRef.current = { active: false, startX: 0, startY: 0 };
    if (Math.max(Math.abs(offset.x), Math.abs(offset.y)) >= 120) {
      closeProfileImage({
        x: Math.abs(offset.x) >= Math.abs(offset.y)
          ? Math.sign(offset.x) * window.innerWidth
          : 0,
        y: Math.abs(offset.y) > Math.abs(offset.x)
          ? Math.sign(offset.y) * window.innerHeight
          : 0,
      });
    } else {
      setProfileImageOffset({ x: 0, y: 0 });
    }
  };

  const onProfileImageWheel = (event) => {
    if (Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) < 45) return;
    closeProfileImage({
      x: Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ? Math.sign(event.deltaX) * window.innerWidth
        : 0,
      y: Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? Math.sign(event.deltaY) * window.innerHeight
        : 0,
    });
  };

  const closeProfile = (offset = { x: 0, y: 0 }) => {
    if (!profileOnly || profileClosing) {
      onClose();
      return;
    }
    setProfileClosing(true);
    setProfileOffset(offset);
    profileCloseTimerRef.current = setTimeout(() => {
      profileCloseTimerRef.current = null;
      onClose();
    }, 200);
  };

  const onProfilePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    profileGestureRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onProfilePointerMove = (event) => {
    const gesture = profileGestureRef.current;
    if (!gesture.active || profileClosing) return;
    setProfileOffset({
      x: event.clientX - gesture.startX,
      y: event.clientY - gesture.startY,
    });
  };

  const onProfilePointerEnd = (event) => {
    const gesture = profileGestureRef.current;
    if (!gesture.active) return;
    const offset = {
      x: event.clientX - gesture.startX,
      y: event.clientY - gesture.startY,
    };
    profileGestureRef.current = { active: false, startX: 0, startY: 0 };
    if (Math.max(Math.abs(offset.x), offset.y) >= 120) {
      closeProfile({
        x: Math.abs(offset.x) >= offset.y
          ? Math.sign(offset.x) * window.innerWidth
          : 0,
        y: offset.y > Math.abs(offset.x) ? window.innerHeight : 0,
      });
    } else {
      setProfileOffset({ x: 0, y: 0 });
    }
  };

  const onProfileWheel = (event) => {
    if (Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) < 45) return;
    closeProfile({
      x: Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ? Math.sign(event.deltaX) * window.innerWidth
        : 0,
      y: Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? window.innerHeight
        : 0,
    });
  };

  const api = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` },
  });

  const run = async (fn) => {
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      alert(e.response?.data?.message || 'Action failed');
    } finally {
      setLoading(false);
      setConfirm(null);
    }
  };

  const actions = {
    mute: () =>
      run(async () => {
        await api.post(`/users/${selectedUser._id}/mute`);
        setIsMuted(true);
        onUserMuted?.(selectedUser._id);
      }),
    unmute: () =>
      run(async () => {
        await api.post(`/users/${selectedUser._id}/unmute`);
        setIsMuted(false);
      }),
    block: () =>
      run(async () => {
        await api.post(`/users/${selectedUser._id}/block`);
        setIsBlocked(true);
        onUserBlocked?.(selectedUser._id);
        onRefreshUsers?.();
        onClose();
      }),
    unblock: () =>
      run(async () => {
        await api.post(`/users/${selectedUser._id}/unblock`);
        setIsBlocked(false);
        onRefreshUsers?.();
      }),
    deleteChat: () =>
      run(async () => {
        await api.delete(`/users/${selectedUser._id}/chats`);
        onChatDeleted?.(selectedUser._id);
        onClose();
      }),
    report: () => {
      alert(`${selectedUser.username} has been reported.`);
      onClose();
    },
  };

  return ReactDOM.createPortal(
    <>
      <div
        className={`fixed inset-0 z-[209] transition-opacity duration-200 ${profileOnly ? 'bg-black/55 backdrop-blur-[2px]' : ''} ${profileClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={() => closeProfile()}
      />
      <div
        className={
          profileOnly
            ? 'fixed inset-x-0 bottom-0 z-[210] max-h-[min(72dvh,520px)] overflow-y-auto rounded-t-[28px] border border-white/10 bg-gray-950/70 pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/70 ring-1 ring-white/5 backdrop-blur-2xl animate-fade-in touch-none'
            : 'fixed z-[210] w-[min(190px,calc(100vw-16px))] overflow-hidden rounded-xl border border-white/10 bg-gray-950/95 py-1 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur-2xl animate-fade-in'
        }
        style={
          profileOnly
            ? {
                transform: `translate3d(${profileOffset.x}px, ${profileOffset.y}px, 0) scale(${profileClosing ? 0.96 : 1 - Math.min(0.04, profileOffset.y / 2400)})`,
                opacity: profileClosing
                  ? 0
                  : Math.max(0.45, 1 - profileOffset.y / 500),
                transition: profileGestureRef.current.active
                  ? 'none'
                  : 'transform 200ms ease, opacity 200ms ease',
              }
            : { top: position?.top, right: position?.right }
        }
        onWheel={profileOnly ? onProfileWheel : undefined}
        onPointerDown={profileOnly ? onProfilePointerDown : undefined}
        onPointerMove={profileOnly ? onProfilePointerMove : undefined}
        onPointerUp={profileOnly ? onProfilePointerEnd : undefined}
        onPointerCancel={profileOnly ? onProfilePointerEnd : undefined}
      >
        {profileOnly && (
          <div className='flex justify-center pt-3'>
            <span className='h-1 w-10 rounded-full bg-white/25 shadow-[0_0_12px_rgba(255,255,255,0.12)]' />
          </div>
        )}
        {profileOnly ? (
          <div className='relative flex flex-col items-center px-5 pb-5 pt-4 text-center'>
            <UserAvatar
              user={selectedUser}
              alt={selectedUser.username}
              onClick={() => {
                setProfileImageOffset({ x: 0, y: 0 });
                setProfileImageClosing(false);
                setProfileImageOpen(true);
              }}
              className='h-20 w-20 flex-shrink-0 cursor-pointer rounded-full object-cover ring-2 ring-white/10 shadow-xl shadow-black/30 transition-transform active:scale-95'
            />
            <div className='mt-3 min-w-0 max-w-full'>
              <h2 className='truncate text-lg font-bold text-white'>
                {selectedUser.username}
              </h2>
            </div>
            <button
              onClick={() => closeProfile()}
              aria-label='Close profile'
              className='absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white'
            >
              <X size={19} />
            </button>
          </div>
        ) : null}
        {profileOnly ? (
          <div className='mx-5 mb-4 space-y-3 border-t border-white/10 pt-4'>
            <div>
              <p className='text-[11px] font-semibold uppercase tracking-wider text-gray-500'>
                Address
              </p>
              <p className='mt-1 text-sm text-gray-200'>
                {formatLocation(selectedUser.location)}
              </p>
            </div>
            <div>
              <p className='text-[11px] font-semibold uppercase tracking-wider text-gray-500'>
                Bio
              </p>
              <p className='mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-300'>
                {selectedUser.bio || 'No bio added'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className='px-1 py-0'>
              <button
                onClick={() => setConfirm(isMuted ? 'unmute' : 'mute')}
                className='w-full touch-manipulation select-none rounded-lg px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10 active:bg-white/15'
              >
                {isMuted ? 'Unmute user' : 'Mute user'}
              </button>
              <button
                onClick={() => setConfirm(isBlocked ? 'unblock' : 'block')}
                className='w-full touch-manipulation select-none rounded-lg px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10 active:bg-white/15'
              >
                {isBlocked ? 'Unlock chat' : 'Lock chat'}
              </button>
              <button
                onClick={() => setConfirm('deleteChat')}
                className='w-full touch-manipulation select-none rounded-lg px-3 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-red-500/15 active:bg-red-500/20'
              >
                Delete chat
              </button>
              <button
                onClick={actions.report}
                className='w-full touch-manipulation select-none rounded-lg px-3 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-red-500/15 active:bg-red-500/20'
              >
                Report user
              </button>
            </div>
          </>
        )}
      </div>

      {profileOnly &&
        profileImageOpen &&
        ReactDOM.createPortal(
          <div
            className={`fixed inset-0 z-[320] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md transition-opacity duration-200 ${profileImageClosing ? 'opacity-0' : 'opacity-100'}`}
            onClick={() => closeProfileImage()}
            onWheel={onProfileImageWheel}
          >
            <UserAvatar
              user={selectedUser}
              src={selectedUser.avatarFull || selectedUser.avatar || getAvatarUrl(selectedUser)}
              alt={`${selectedUser.username} profile`}
              interactive={false}
              width='1024'
              height='1024'
              decoding='async'
              className='max-h-[90vh] max-w-[92vw] select-none rounded-3xl object-contain shadow-2xl touch-none'
              wrapperStyle={{
                transform: `translate3d(${profileImageOffset.x}px, ${profileImageOffset.y}px, 0) scale(${profileImageClosing ? 0.92 : 1 - Math.min(0.08, Math.max(Math.abs(profileImageOffset.x), Math.abs(profileImageOffset.y)) / 1800)})`,
                opacity: profileImageClosing
                  ? 0
                  : Math.max(
                      0.35,
                      1 -
                        Math.max(
                          Math.abs(profileImageOffset.x),
                          Math.abs(profileImageOffset.y),
                        ) /
                          500,
                    ),
                transition: profileImageGestureRef.current.active
                  ? 'none'
                  : 'transform 200ms ease, opacity 200ms ease',
                cursor: profileImageGestureRef.current.active
                  ? 'grabbing'
                  : 'grab',
              }}
              onPointerDown={onProfileImagePointerDown}
              onPointerMove={onProfileImagePointerMove}
              onPointerUp={onProfileImagePointerEnd}
              onPointerCancel={onProfileImagePointerEnd}
              onClick={(event) => event.stopPropagation()}
            />
            <button
              type='button'
              onClick={() => closeProfileImage()}
              aria-label='Close profile image'
              className='hidden md:flex absolute right-4 top-4 h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:scale-90'
            >
              <X size={20} />
            </button>
          </div>,
          document.body,
        )}

      {/* Confirm dialogs */}
      {confirm === 'mute' && (
        <ConfirmDialog
          title='Mute Notifications'
          message={`You won't get alerts from ${selectedUser.username}.`}
          confirmLabel='Mute'
          onConfirm={actions.mute}
          onCancel={() => setConfirm(null)}
          loading={loading}
        />
      )}
      {confirm === 'unmute' && (
        <ConfirmDialog
          title='Unmute'
          message={`You'll receive alerts from ${selectedUser.username} again.`}
          confirmLabel='Unmute'
          onConfirm={actions.unmute}
          onCancel={() => setConfirm(null)}
          loading={loading}
        />
      )}
      {confirm === 'deleteChat' && (
        <ConfirmDialog
          title='Delete All Chats'
          message={`All messages with ${selectedUser.username} will be deleted permanently.`}
          confirmLabel='Delete'
          onConfirm={actions.deleteChat}
          onCancel={() => setConfirm(null)}
          loading={loading}
          danger
        />
      )}
      {confirm === 'block' && (
        <ConfirmDialog
          title='Lock Chat'
          message={`${selectedUser.username} won't be able to message you.`}
          confirmLabel='Lock'
          onConfirm={actions.block}
          onCancel={() => setConfirm(null)}
          loading={loading}
          danger
        />
      )}
      {confirm === 'unblock' && (
        <ConfirmDialog
          title='Unlock Chat'
          message={`${selectedUser.username} will be able to message you again.`}
          confirmLabel='Unlock'
          onConfirm={actions.unblock}
          onCancel={() => setConfirm(null)}
          loading={loading}
        />
      )}
    </>,
    document.body,
  );
};

/* ── Chat Header ─────────────────────────────────────────────── */
const ChatHeader = ({
  selectedUser,
  isUserOnline,
  isUserTyping,
  onBack,
  onUserBlocked,
  onUserMuted,
  onChatDeleted,
  onRefreshUsers,
  onStartCall,
  showCallActions = true,
}) => {
  const [panelType, setPanelType] = useState(null);
  const [actionPosition, setActionPosition] = useState({ top: 0, right: 0 });
  const [clock, setClock] = useState(0);
  const actionsButtonRef = useRef(null);

  const selectedUserId = selectedUser?._id;
  const userIsTyping = selectedUser
    ? isUserTyping?.(selectedUser._id)
    : false;
  const online = selectedUser ? isUserOnline?.(selectedUser._id) : false;

  useEffect(() => {
    if (!selectedUserId || online) return undefined;
    const refreshClock = () => setClock(Date.now());
    const initialTimer = window.setTimeout(refreshClock, 0);
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [online, selectedUserId]);

  if (!selectedUser) return null;

  const openProfile = () => setPanelType('profile');
  const openActions = () => {
    const rect = actionsButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const menuHeight = 190;
      const top = Math.min(
        rect.bottom + 6,
        window.innerHeight - menuHeight - 8,
      );
      setActionPosition({
        top: Math.max(8, top),
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    setPanelType('actions');
  };

  return (
    <>
      <div className='fixed inset-x-0 top-0 z-30 w-full flex-shrink-0 bg-gray-900/90 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20 px-2.5 py-2.5 md:sticky md:px-6 md:py-3.5'>
        <div className='flex items-center justify-between gap-2'>
          {/* Left */}
          <div className='flex min-w-0 items-center gap-1.5 md:gap-3'>
            <button
              onClick={onBack}
              className='md:hidden flex h-10 w-10 flex-shrink-0 items-center justify-center -ml-1 text-gray-300 hover:bg-white/10 hover:text-white rounded-full transition-colors active:scale-90'
            >
              <ArrowLeft size={20} />
            </button>
            <div
              className='group relative flex-shrink-0 cursor-pointer'
              onClick={openProfile}
            >
              <UserAvatar
                user={selectedUser}
                alt={selectedUser.username}
                className='w-11 h-11 rounded-full object-cover ring-2 ring-white/10 transition-all group-hover:ring-blue-500/50'
              />
              {online && (
                <div className='absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full ring-2 ring-gray-900' />
              )}
            </div>
            <div
              className='min-w-0 cursor-pointer rounded-xl px-1.5 py-1 transition-colors hover:bg-white/5'
              onClick={openProfile}
            >
              <h2 className='truncate font-semibold text-white text-[15px] leading-tight'>
                {selectedUser.username}
              </h2>
              <p className='mt-0.5 text-xs leading-tight'>
                {userIsTyping ? (
                  <span className='text-green-400 flex items-center gap-1.5'>
                    <span className='typing-indicator font-medium'>typing</span>
                    <span className='typing-dots flex items-center gap-0.5'>
                      <span className='typing-dot' />
                      <span className='typing-dot' />
                      <span className='typing-dot' />
                    </span>
                  </span>
                ) : online ? (
                  <span className='text-green-400 font-medium'>● Online</span>
                ) : (
                  <span className='text-gray-400'>
                    Last seen {formatLastSeen(selectedUser.lastSeen, clock)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right */}
          <div className='flex flex-shrink-0 items-center gap-0.5 md:gap-1'>
            {showCallActions && (
              <>
                <button
                  onClick={() => onStartCall?.('audio')}
                  title='Voice call'
                  className='group flex h-10 w-10 items-center justify-center rounded-full text-gray-300 transition-all hover:bg-green-500/15 hover:text-green-400 active:scale-90'
                >
                  <Phone size={20} strokeWidth={2} />
                </button>
                <button
                  onClick={() => onStartCall?.('video')}
                  title='Video call'
                  className='group flex h-10 w-10 items-center justify-center rounded-full text-gray-300 transition-all hover:bg-blue-500/15 hover:text-blue-400 active:scale-90'
                >
                  <Video size={21} strokeWidth={2} />
                </button>
                <span className='h-6 w-px bg-white/10 mx-1' aria-hidden='true' />
              </>
            )}
            <button
              ref={actionsButtonRef}
              type='button'
              onClick={openActions}
              className='flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-gray-300 transition-all hover:bg-white/10 hover:text-white active:scale-90'
              title='User settings'
            >
              <MoreVertical size={22} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {panelType && (
        <UserInfoPanel
          selectedUser={selectedUser}
          profileOnly={panelType === 'profile'}
          position={actionPosition}
          onClose={() => setPanelType(null)}
          onUserBlocked={onUserBlocked}
          onUserMuted={onUserMuted}
          onChatDeleted={onChatDeleted}
          onRefreshUsers={onRefreshUsers}
        />
      )}
    </>
  );
};

export default ChatHeader;
