import {
  AtSign,
  Bell,
  Check,
  CheckCheck,
  MessageCircle,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTimeAgo } from '../../utils/conversationPreview';

const ICONS = {
  added_to_group: { Icon: Users, color: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  removed_from_group: { Icon: UserMinus, color: 'text-rose-300', bg: 'bg-rose-400/10' },
  comment_reply: { Icon: MessageCircle, color: 'text-sky-300', bg: 'bg-sky-400/10' },
  comment_mention: { Icon: AtSign, color: 'text-violet-300', bg: 'bg-violet-400/10' },
  message_error: { Icon: Bell, color: 'text-amber-300', bg: 'bg-amber-400/10' },
};

const NotificationsPanel = ({
  notifications = [],
  onMarkAllRead,
  onClearAll,
  onRead,
  onOpenGroup,
}) => {
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const visibleNotifications = useMemo(
    () => (filter === 'unread'
      ? notifications.filter((notification) => !notification.read)
      : notifications),
    [filter, notifications],
  );

  const openNotification = (notification) => {
    onRead?.(notification.id);
    if (notification.postId) {
      const params = new URLSearchParams({ postId: String(notification.postId) });
      if (notification.commentId) params.set('commentId', String(notification.commentId));
      navigate(`/home?${params.toString()}`);
    } else if (
      notification.type === 'added_to_group'
      && notification.groupId
    ) {
      onOpenGroup?.(notification.groupId);
    }
  };

  return (
    <section
      aria-label='Activity notifications'
      className='flex min-h-0 flex-1 flex-col overflow-hidden'
    >
      <header className='border-b border-white/[0.08] px-4 py-4'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300'>
              <Bell size={17} />
            </span>
            <div className='min-w-0'>
              <h2 className='truncate text-sm font-bold text-white'>Activity</h2>
              <p className='text-xs text-gray-400'>
                {unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}
              </p>
            </div>
          </div>
          {notifications.length > 0 && (
            <div className='flex shrink-0 items-center gap-1'>
              {unreadCount > 0 && (
                <button
                  type='button'
                  onClick={onMarkAllRead}
                  className='inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                >
                  <CheckCheck size={14} />
                  <span className='hidden sm:inline'>Read all</span>
                </button>
              )}
              <button
                type='button'
                onClick={onClearAll}
                aria-label='Clear all notifications'
                title='Clear all notifications'
                className='rounded-lg p-2 text-gray-400 transition hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300'
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>

        {notifications.length > 0 && (
          <div className='mt-4 flex rounded-xl bg-white/[0.04] p-1'>
            {[
              { id: 'all', label: 'All', count: notifications.length },
              { id: 'unread', label: 'Unread', count: unreadCount },
            ].map((option) => (
              <button
                key={option.id}
                type='button'
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  filter === option.id
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {option.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  filter === option.id ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[0.06] text-gray-400'
                }`}>
                  {option.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </header>

      {notifications.length === 0 ? (
        <div className='flex flex-1 flex-col items-center justify-center px-6 py-12 text-center'>
          <span className='flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.06] bg-white/[0.04] text-gray-500'>
            <Bell size={26} />
          </span>
          <h3 className='mt-4 text-sm font-semibold text-gray-200'>Nothing to see yet</h3>
          <p className='mt-1.5 max-w-[230px] text-xs leading-5 text-gray-500'>
            Group updates, replies, and mentions will show up here.
          </p>
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className='flex flex-1 flex-col items-center justify-center px-6 py-10 text-center'>
          <Check size={22} className='text-emerald-300' />
          <p className='mt-2 text-sm font-medium text-gray-300'>No unread activity</p>
          <button
            type='button'
            onClick={() => setFilter('all')}
            className='mt-2 text-xs font-semibold text-emerald-300 hover:text-emerald-200'
          >
            View all notifications
          </button>
        </div>
      ) : (
        <div className='min-h-0 flex-1 divide-y divide-white/[0.05] overflow-y-auto'>
          {visibleNotifications.map((notification) => {
            const config = ICONS[notification.type] || {
              Icon: Bell,
              color: 'text-gray-300',
              bg: 'bg-white/[0.07]',
            };
            const actionable = Boolean(
              notification.postId
              || (notification.type === 'added_to_group' && notification.groupId),
            );
            return (
              <button
                type='button'
                key={notification.id}
                onClick={() => openNotification(notification)}
                aria-label={`${notification.read ? '' : 'Unread: '}${notification.text}${actionable ? ', open' : ''}`}
                className={`group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${
                  notification.read
                    ? 'hover:bg-white/[0.035]'
                    : 'bg-emerald-400/[0.055] hover:bg-emerald-400/[0.09]'
                }`}
              >
                <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                  <config.Icon size={17} className={config.color} />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className={`block text-[13px] leading-5 ${
                    notification.read ? 'text-gray-300' : 'font-semibold text-white'
                  }`}>
                    {notification.text}
                  </span>
                  <span className='mt-1 flex items-center gap-2 text-[11px] text-gray-500'>
                    <span>{getTimeAgo(notification.timestamp)}</span>
                    {actionable && (
                      <>
                        <span aria-hidden='true'>·</span>
                        <span className='font-semibold text-emerald-300 group-hover:text-emerald-200'>
                          {notification.postId ? 'View post' : 'Open group'}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                {!notification.read && (
                  <span className='mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.4)]' />
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default NotificationsPanel;
