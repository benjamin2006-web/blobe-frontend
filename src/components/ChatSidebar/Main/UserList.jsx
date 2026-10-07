import {
  Check,
  CheckCheck,
  Clock,
  Ban,
  BellOff,
  Lock,
  MessageCircle,
  Phone,
  Trash2,
  Video,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getTimeAgo } from '../../../utils/conversationPreview';
import AvatarWithActivity from '../../UserAvatar';

const TypingDots = () => (
  <div className='flex items-center space-x-1.5'>
    <div
      className='h-2 w-2 rounded-full bg-green-300 shadow-[0_0_0_1.5px_rgba(15,23,42,0.95),0_0_10px_rgba(74,222,128,0.95)] animate-typingBounce'
      style={{ animationDelay: '0s' }}
    />
    <div
      className='h-2 w-2 rounded-full bg-green-300 shadow-[0_0_0_1.5px_rgba(15,23,42,0.95),0_0_10px_rgba(74,222,128,0.95)] animate-typingBounce'
      style={{ animationDelay: '0.15s' }}
    />
    <div
      className='h-2 w-2 rounded-full bg-green-300 shadow-[0_0_0_1.5px_rgba(15,23,42,0.95),0_0_10px_rgba(74,222,128,0.95)] animate-typingBounce'
      style={{ animationDelay: '0.3s' }}
    />
  </div>
);

const TypingText = () => (
  <div className='flex items-center space-x-1'>
    <span className='text-xs text-green-400'>Typing</span>
    <div className='flex space-x-0.5'>
      <div
        className='w-1 h-1 bg-green-400 rounded-full animate-typingBounce'
        style={{ animationDelay: '0s' }}
      />
      <div
        className='w-1 h-1 bg-green-400 rounded-full animate-typingBounce'
        style={{ animationDelay: '0.15s' }}
      />
      <div
        className='w-1 h-1 bg-green-400 rounded-full animate-typingBounce'
        style={{ animationDelay: '0.3s' }}
      />
    </div>
  </div>
);

const ChatUserSkeleton = () => (
  <div className='flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#111714]/90 p-3 shadow-inner shadow-white/[0.04] backdrop-blur-xl'>
    <span className='chat-user-skeleton h-10 w-10 shrink-0 rounded-full' />
    <span className='min-w-0 flex-1 space-y-2'>
      <span className='chat-user-skeleton block h-3 w-2/5 rounded-full' />
      <span className='chat-user-skeleton block h-2.5 w-3/4 rounded-full' />
    </span>
    <span className='chat-user-skeleton h-2.5 w-8 shrink-0 rounded-full' />
  </div>
);

const UserAvatar = ({ user, size = 'md', onLoad, onError }) => {
  const sizes = { sm: 'w-9 h-9', md: 'w-10 h-10', lg: 'w-12 h-12' };
  return (
    <AvatarWithActivity
      user={user}
      alt={user?.username || 'avatar'}
      className={`${sizes[size]} rounded-full object-cover flex-shrink-0`}
      onLoad={onLoad}
      onError={onError}
    />
  );
};

const UnreadBadge = ({ count }) => {
  if (!count || count === 0) return null;
  return (
    <div className='min-w-[18px] h-[18px] bg-green-500 rounded-full flex items-center justify-center px-1 flex-shrink-0'>
      <span className='text-white text-xs font-bold leading-none'>
        {count > 99 ? '99+' : count}
      </span>
    </div>
  );
};

const MessageStatusTicks = ({ status }) => {
  if (status === 'read') {
    return <CheckCheck size={16} strokeWidth={2.5} className='text-sky-400' aria-label='Read' />;
  }
  if (status === 'delivered') {
    return <CheckCheck size={16} strokeWidth={2.5} className='text-gray-300' aria-label='Delivered' />;
  }
  if (status === 'sent' || status === 'edited') {
    return <Check size={16} strokeWidth={2.5} className='text-gray-400' aria-label='Sent' />;
  }
  return <Clock size={15} strokeWidth={2.5} className='text-gray-400' aria-label='Sending' />;
};


// ── Swipe-to-reveal row (touch devices only) ────────────────────────────────
// Swipe RIGHT → reveals  Delete + Lock   (left edge)
// Swipe LEFT  → reveals  Mute + Block    (right edge)

const ACTION_W = 60; // width of one action cell (px)
const MAX_OPEN = ACTION_W * 2; // 2 actions per side
const AXIS_LOCK_PX = 8; // movement needed before we decide horizontal vs vertical
const SLIDE_EASE = 'cubic-bezier(0.32, 1.28, 0.5, 1)'; // row: soft overshoot
const POP_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // icons: springy pop

const SWIPE_ACTIONS = {
  right: [
    {
      key: 'delete',
      Icon: Trash2,
      label: 'Delete chat',
      className: 'bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white',
    },
    {
      key: 'lock',
      Icon: Lock,
      label: 'Lock chat',
      className:
        'bg-amber-500/15 text-amber-400 hover:bg-amber-500 hover:text-white',
    },
  ],
  left: [
    {
      key: 'mute',
      Icon: BellOff,
      label: 'Mute user',
      className: 'bg-sky-500/15 text-sky-400 hover:bg-sky-500 hover:text-white',
    },
    {
      key: 'block',
      Icon: Ban,
      label: 'Block user',
      className:
        'bg-orange-500/15 text-orange-400 hover:bg-orange-500 hover:text-white',
    },
  ],
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Gentle resistance once the row is pulled past the fully-open position
const rubberBand = (x) => {
  const abs = Math.abs(x);
  if (abs <= MAX_OPEN) return x;
  const extra = abs - MAX_OPEN;
  return Math.sign(x) * (MAX_OPEN + 36 * (1 - Math.exp(-extra / 70)));
};

export const SwipeableRow = ({
  id,
  openId,
  onOpenChange,
  onAction,
  actions = SWIPE_ACTIONS,
  children,
}) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const rowRef = useRef(null);
  const drag = useRef({
    active: false,
    axis: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    baseX: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
    moved: false,
  });

  const moveTo = (x) => {
    offsetRef.current = x;
    setOffset(x);
  };

  // Only one row open at a time
  useEffect(() => {
    if (openId !== id && offsetRef.current !== 0 && !drag.current.active) {
      offsetRef.current = 0;
      setOffset(0);
    }
  }, [openId, id]);

  const handlePointerDown = (e) => {
    // Mouse never swipes — touch and pen only
    if (e.pointerType === 'mouse') return;
    const d = drag.current;
    d.active = true;
    d.axis = null;
    d.pointerId = e.pointerId;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.baseX = offsetRef.current;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    d.velocity = 0;
    d.moved = false;
  };

  const handlePointerMove = (e) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.pointerId) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    // Decide direction once
    if (d.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        d.axis = 'x';
        d.moved = true;
        setDragging(true);
        try {
          rowRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        if (openId !== id) onOpenChange(id);
      } else {
        d.axis = 'y'; // vertical scroll wins, leave the row alone
        d.active = false;
        return;
      }
    }

    const now = e.timeStamp;
    const dt = now - d.lastT;
    if (dt > 0) {
      d.velocity = ((e.clientX - d.lastX) / dt) * 0.6 + d.velocity * 0.4;
    }
    d.lastX = e.clientX;
    d.lastT = now;

    moveTo(rubberBand(d.baseX + dx));
  };

  const finishDrag = (e) => {
    const d = drag.current;
    if (!d.active || (e && e.pointerId !== d.pointerId)) return;
    d.active = false;
    if (d.axis !== 'x') return;

    try {
      rowRef.current?.releasePointerCapture(d.pointerId);
    } catch {
      /* ignore */
    }
    setDragging(false);

    // Stale velocity (finger paused before release) shouldn't fling the row
    if (e && e.timeStamp - d.lastT > 80) d.velocity = 0;

    // Project a little inertia so quick flicks open/close the row
    const projected = offsetRef.current + d.velocity * 160;
    const target =
      projected >= MAX_OPEN * 0.5
        ? MAX_OPEN
        : projected <= -MAX_OPEN * 0.5
          ? -MAX_OPEN
          : 0;

    moveTo(target);
    onOpenChange(target === 0 ? null : id);
  };

  // Swallow the click that follows a drag; tapping an open row just closes it
  const handleClickCapture = (e) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
      return;
    }
    if (offsetRef.current !== 0) {
      e.preventDefault();
      e.stopPropagation();
      moveTo(0);
      onOpenChange(null);
    }
  };

  const renderActions = (side) => {
    const list = actions[side] || [];
    const abs = side === 'right' ? Math.max(offset, 0) : Math.max(-offset, 0);
    const canTap = abs >= MAX_OPEN * 0.6 && !dragging;

    return (
      <div
        className={`absolute inset-y-0 flex items-center ${
          side === 'right' ? 'left-0' : 'right-0'
        }`}
        style={{ pointerEvents: canTap ? 'auto' : 'none' }}
        aria-hidden={abs === 0}
      >
        {list.map(({ key, Icon, label, className }, i) => {
          // How far this button is from the screen edge → it appears first
          const distFromEdge = side === 'right' ? i : list.length - 1 - i;
          const p = clamp01(
            (abs - distFromEdge * ACTION_W * 0.5) / (ACTION_W * 0.9),
          );
          const delay = distFromEdge * 45;
          const spin = (1 - p) * (side === 'right' ? -60 : 60);

          return (
            <div
              key={key}
              className='flex items-center justify-center'
              style={{ width: ACTION_W }}
            >
              <button
                type='button'
                title={label}
                aria-label={label}
                tabIndex={abs > 0 ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(key);
                  moveTo(0);
                  onOpenChange(null);
                }}
                className={`group w-10 h-10 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${className}`}
                style={{
                  transform: `scale(${0.35 + 0.65 * p}) rotate(${spin}deg)`,
                  opacity: p,
                  transition: dragging
                    ? 'background-color 150ms, color 150ms'
                    : `transform 380ms ${POP_EASE} ${delay}ms, opacity 200ms ease ${delay}ms, background-color 150ms, color 150ms`,
                }}
              >
                <Icon
                  size={18}
                  className='transition-transform group-active:scale-90'
                />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className='relative overflow-hidden rounded-xl p-px'>
      {renderActions('right')}
      {renderActions('left')}

      <div
        ref={rowRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClickCapture={handleClickCapture}
        onDragStart={(e) => e.preventDefault()}
        className='relative rounded-xl bg-gray-900 select-none'
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: dragging ? 'none' : `transform 420ms ${SLIDE_EASE}`,
          touchAction: 'pan-y',
          willChange: dragging ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
};

const UserList = ({
  users,
  selectedUser,
  onSelectUser,
  isUserOnline,
  isUserTyping,
  loading,
  lastMessages,
  isExpanded,
  unifiedMobile = false,
  unreadCounts = {},
  // Swipe actions — plug your logic in here. Each receives the `user` object.
  onDeleteUser,
  onLockUser,
  onMuteUser,
  onBlockUser,
  onScroll,
  hasMore = false,
  loadingMore = false,
  loadError = false,
  onRetryLoadMore,
}) => {
  const [openRowId, setOpenRowId] = useState(null);
  const [loadedAvatarKeys, setLoadedAvatarKeys] = useState(() => new Set());
  const listRef = useRef(null);

  const avatarKey = (user) => [
    user._id,
    user.avatarThumbnail || user.avatar || user.gender || user.username || '',
  ].join(':');

  const markAvatarLoaded = (key) => {
    setLoadedAvatarKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  const paginationFooter = (className = '') => (
    <div
      className={`relative flex flex-col justify-center py-2 ${
        hasMore || loadingMore || loadError ? 'min-h-[152px]' : ''
      } ${className}`}
    >
      {loadingMore ? (
        <div className='space-y-2' role='status' aria-label='Loading more conversations'>
          <ChatUserSkeleton />
          <ChatUserSkeleton />
        </div>
      ) : loadError ? (
        <div className='flex min-h-12 items-center justify-center'>
          <button
            type='button'
            onClick={onRetryLoadMore}
            className='rounded-lg px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-white/10'
          >
            Could not load users. Retry
          </button>
        </div>
      ) : hasMore ? (
        <div className='flex min-h-8 items-center justify-center'>
          <span className='text-xs text-gray-500'>Scroll to load more</span>
        </div>
      ) : null}
    </div>
  );

  const getLastMessageContent = (message) => {
    if (!message) return 'No messages yet';
    if (message.messageType === 'call') {
      return message.callType === 'video' ? 'Video call' : 'Voice call';
    }
    return message.content || 'No messages yet';
  };

  const isUnread = (userId) => {
    return (unreadCounts[String(userId)] || 0) > 0;
  };

  const swipeHandlers = {
    delete: onDeleteUser,
    lock: onLockUser,
    mute: onMuteUser,
    block: onBlockUser,
  };

  if (loading) {
    return (
      <div
        className={`${unifiedMobile ? '' : 'flex-1 min-h-0 overflow-y-auto'} p-4 space-y-2`}
        role='status'
        aria-label='Loading conversations'
      >
        {Array.from({ length: 8 }, (_, index) => (
          <ChatUserSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div
        ref={listRef}
        className={`${unifiedMobile ? '' : 'flex-1 min-h-0 overflow-y-auto'} p-4`}
      >
        <div className='text-center py-8'>
          <MessageCircle
            className='mx-auto text-gray-600 mb-2'
            size={isExpanded ? 32 : 24}
          />
          <p className='text-gray-500 text-sm'>No users found</p>
        </div>
        {paginationFooter()}
      </div>
    );
  }

  // ── Collapsed View ──────────────────────────────────────────────────────────
  if (!isExpanded) {
    return (
      <div className='flex-1 overflow-y-auto min-h-0 py-4'>
        <div className='space-y-3'>
          {users.map((user) => {
            const online = isUserOnline(user._id);
            const typing = isUserTyping?.(user._id);
            const isSelected = selectedUser?._id === user._id;
            const unread = isUnread(user._id);
            const count = unreadCounts[String(user._id)] || 0;

            return (
              <button
                key={user._id}
                onClick={() => onSelectUser(user)}
                className={`relative block mx-auto transition-all rounded-full ${
                  isSelected
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900'
                    : 'hover:ring-2 hover:ring-gray-600 hover:ring-offset-2 hover:ring-offset-gray-900'
                }`}
                title={user.username}
              >
                <UserAvatar user={user} size='md' />

                {online && !typing && (
                  <div className='absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-gray-900' />
                )}
                {typing && (
                  <div className='absolute -bottom-1 -right-2'>
                    <TypingDots />
                  </div>
                )}
                {unread && (
                  <div className='absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-0.5'>
                    <span className='text-white text-xs font-bold leading-none'>
                      {count > 9 ? '9+' : count || '•'}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Expanded View ───────────────────────────────────────────────────────────
  const renderUserRow = (user) => {
    const online = isUserOnline(user._id);
    const typing = isUserTyping?.(user._id);
    const lastMsg = lastMessages?.[String(user._id)];
    const timeAgo = getTimeAgo(lastMsg?.timestamp);
    const isSelected = selectedUser?._id === user._id;
    const unread = isUnread(user._id);
    const count = unreadCounts[String(user._id)] || 0;
    const imageKey = avatarKey(user);
    const avatarLoaded = loadedAvatarKeys.has(imageKey);

    const rowButton = (
      <button
        key={user._id}
        onClick={() => onSelectUser(user)}
        aria-busy={!avatarLoaded}
        className={`w-full text-left p-3 rounded-xl transition-all ${
          isSelected ? 'bg-gray-800 ring-1 ring-gray-700' : 'hover:bg-gray-800'
        } ${unread && !isSelected ? 'bg-gray-800/30' : ''}`}
      >
        <div className='flex items-center gap-3'>
          {/* Avatar with online indicator */}
          <div className='relative flex-shrink-0'>
            {!avatarLoaded && (
              <span
                aria-hidden='true'
                className='chat-user-skeleton absolute inset-0 z-10 h-10 w-10 rounded-full'
              />
            )}
            <UserAvatar
              user={user}
              size='md'
              onLoad={() => markAvatarLoaded(imageKey)}
              onError={() => markAvatarLoaded(imageKey)}
            />
            {avatarLoaded && online && !typing && (
              <div className='absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-gray-900' />
            )}
            {avatarLoaded && typing && (
              <div className='absolute -bottom-1 -right-2'>
                <TypingDots />
              </div>
            )}
          </div>

          {/* Text content */}
          {avatarLoaded ? (
          <div className='flex-1 min-w-0'>
            <div className='flex items-center justify-between mb-0.5'>
              <p
                className={`font-medium text-sm truncate ${unread ? 'text-white font-semibold' : 'text-gray-200'}`}
              >
                {user.username}
              </p>
              <div className='flex items-center gap-1.5 flex-shrink-0 ml-1'>
                {!typing && timeAgo && (
                  <span
                    className={`text-xs ${unread ? 'text-green-400' : 'text-gray-500'}`}
                  >
                    {timeAgo}
                  </span>
                )}
                {unread && <UnreadBadge count={count} />}
              </div>
            </div>

            <div className='flex items-center justify-between'>
              {typing ? (
                <TypingText />
              ) : lastMsg ? (
                <div className={`flex min-w-0 items-center gap-1.5 text-xs ${unread ? 'text-white font-medium' : 'text-gray-400'}`}>
                  {lastMsg.isFromMe && (
                    <span className='flex-shrink-0' aria-label={`Message ${lastMsg.status || 'sent'}`}>
                      <MessageStatusTicks status={lastMsg.status} />
                    </span>
                  )}
                  {lastMsg.messageType === 'call' && (
                    <span
                      className={`flex shrink-0 items-center justify-center rounded-full p-1 ${
                        lastMsg.callType === 'video'
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                      aria-label={getLastMessageContent(lastMsg)}
                    >
                      {lastMsg.callType === 'video' ? (
                        <Video size={13} />
                      ) : (
                        <Phone size={13} />
                      )}
                    </span>
                  )}
                  <p className='min-w-0 truncate'>{getLastMessageContent(lastMsg)}</p>
                </div>
              ) : null}
            </div>
          </div>
          ) : (
            <span
              aria-hidden='true'
              className='flex min-w-0 flex-1 items-center gap-2'
            >
              <span className='min-w-0 flex-1 space-y-2'>
                <span className='chat-user-skeleton block h-3 w-2/5 rounded-full' />
                <span className='chat-user-skeleton block h-2.5 w-3/4 rounded-full' />
              </span>
              <span className='chat-user-skeleton h-2.5 w-8 shrink-0 rounded-full' />
            </span>
          )}
        </div>
      </button>
    );

    // The unified mobile list is the only place that mounts swipe behavior.
    if (!unifiedMobile) return rowButton;

    // Touch screens: swipeable row
    return (
      <SwipeableRow
        key={user._id}
        id={String(user._id)}
        openId={openRowId}
        onOpenChange={setOpenRowId}
        onAction={(actionKey) => swipeHandlers[actionKey]?.(user)}
      >
        {rowButton}
      </SwipeableRow>
    );
  };

  return (
    <div
      ref={listRef}
      className={unifiedMobile ? '' : 'flex-1 min-h-0 overflow-y-auto'}
      onScroll={onScroll}
    >
      <div className='p-4'>
        <div className='space-y-1'>{users.map(renderUserRow)}</div>
        {paginationFooter()}
      </div>
    </div>
  );
};

export default UserList;
