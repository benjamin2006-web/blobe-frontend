import { BellOff, LogOut, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getAvatarUrl, getGroupAvatarUrl } from '../../../utils/avatar';
import OptimizedImage from '../../OptimizedImage';
import { getTimeAgo } from '../../../utils/conversationPreview';
import { SwipeableRow } from './UserList';
import UserAvatar from '../../UserAvatar';

const GROUP_SWIPE_ACTIONS = {
  right: [
    {
      key: 'exit',
      Icon: LogOut,
      label: 'Exit group',
      className: 'bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white',
    },
  ],
  left: [
    {
      key: 'mute',
      Icon: BellOff,
      label: 'Mute group',
      className: 'bg-sky-500/15 text-sky-400 hover:bg-sky-500 hover:text-white',
    },
  ],
};

const TypingDots = () => (
  <div className='flex space-x-1 items-center'>
    <div
      className='w-1.5 h-1.5 bg-green-400 rounded-full animate-typingBounce'
      style={{ animationDelay: '0s' }}
    />
    <div
      className='w-1.5 h-1.5 bg-green-400 rounded-full animate-typingBounce'
      style={{ animationDelay: '0.15s' }}
    />
    <div
      className='w-1.5 h-1.5 bg-green-400 rounded-full animate-typingBounce'
      style={{ animationDelay: '0.3s' }}
    />
  </div>
);

const GroupAvatar = ({ group, size = 'md' }) => {
  const sizes = { sm: 'w-9 h-9', md: 'w-12 h-12', lg: 'w-14 h-14' };
  const members = (group?.members || [])
    .map((member) => member?.user || member)
    .filter(Boolean)
    .slice(0, 3);

  if (members.length > 1) {
    const avatarPositions = [
      'left-0 top-0',
      'right-0 top-0',
      'left-1/2 bottom-0 -translate-x-1/2',
    ];

    return (
      <div
        className={`${sizes[size]} relative flex-shrink-0`}
        aria-label={`${group?.name || 'Group'} members`}
      >
        {members.map((member, index) => (
          <OptimizedImage
            key={member._id || index}
            src={getAvatarUrl(member)}
            alt=''
            className={`absolute h-1/2 w-1/2 rounded-full object-cover ${avatarPositions[index]}`}
          />
        ))}
      </div>
    );
  }

  if (members.length === 1) {
    return (
      <UserAvatar
        user={members[0]}
        alt={group?.name}
        className={`${sizes[size]} flex-shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <OptimizedImage
      src={getGroupAvatarUrl(group)}
      alt={group?.name}
      className={`${sizes[size]} flex-shrink-0 rounded-full object-cover`}
    />
  );
};

const GroupList = ({
  groups,
  selectedGroup,
  onSelectGroup,
  groupLastMessages,
  groupTypingUsers,
  isExpanded,
  unifiedMobile = false,
  loading,
  groupUnreadCounts = {},
  onExitGroup,
  onMuteGroup,
}) => {
  const [openRowId, setOpenRowId] = useState(null);
  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => {
      const ta =
        groupLastMessages?.[a._id]?.timestamp || a.lastMessageAt || a.createdAt;
      const tb =
        groupLastMessages?.[b._id]?.timestamp || b.lastMessageAt || b.createdAt;
      return new Date(tb) - new Date(ta);
    });
  }, [groups, groupLastMessages]);

  if (loading) {
    return (
      <div
        className={`${unifiedMobile ? '' : 'flex-1 min-h-0 overflow-y-auto'} p-4 space-y-3`}
      >
        {[1, 2].map((i) => (
          <div key={i} className='animate-pulse bg-gray-800 h-16 rounded-lg' />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    if (unifiedMobile) return null;
    return (
      <div
        className={`${unifiedMobile ? '' : 'flex-1 min-h-0 overflow-y-auto'} p-4`}
      >
        <div className='text-center py-8'>
          <Users
            className='mx-auto text-gray-600 mb-2'
            size={isExpanded ? 32 : 24}
          />
          <p className='text-gray-500 text-sm'>No groups yet</p>
        </div>
      </div>
    );
  }

  // Collapsed – avatar only
  if (!isExpanded) {
    return (
      <div className='flex-1 overflow-y-auto min-h-0 py-4'>
        <div className='space-y-3'>
          {sorted.map((group) => {
            const isSelected = selectedGroup?._id === group._id;
            const typing = groupTypingUsers?.[group._id]?.size > 0;
            const row = (
              <button
                key={group._id}
                onClick={() => onSelectGroup(group)}
                className={`relative block mx-auto transition-all ${
                  isSelected
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 rounded-full'
                    : 'hover:ring-2 hover:ring-gray-600 hover:ring-offset-2 hover:ring-offset-gray-900 rounded-full'
                }`}
                title={group.name}
              >
                <GroupAvatar name={group.name} size='md' />
                {typing && (
                  <div className='absolute -bottom-1 -right-1 px-1.5 py-1 bg-green-500 rounded-full ring-2 ring-gray-900'>
                    <TypingDots />
                  </div>
                )}
              </button>
            );

            if (!unifiedMobile) return row;

            return (
              <SwipeableRow
                key={group._id}
                id={`group-${group._id}`}
                openId={openRowId}
                onOpenChange={setOpenRowId}
                actions={GROUP_SWIPE_ACTIONS}
                onAction={(action) => {
                  if (action === 'exit') onExitGroup?.(group);
                  if (action === 'mute') onMuteGroup?.(group);
                }}
              >
                {row}
              </SwipeableRow>
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded – full cards
  return (
    <div className={unifiedMobile ? '' : 'flex-1 min-h-0 overflow-y-auto'}>
      <div className='p-4 pt-0'>
        <div className='space-y-1'>
          {sorted.map((group) => {
            const isSelected = selectedGroup?._id === group._id;
            const lastMsg = groupLastMessages?.[group._id];
            const typing = groupTypingUsers?.[group._id];
            const typingNames =
              typing?.size > 0 ? [...typing].slice(0, 2).join(', ') : null;
            const timeAgo = getTimeAgo(
              lastMsg?.timestamp || group.lastMessageAt,
            );
            const memberCount = group.members?.length ?? 0;
            const unreadCount = groupUnreadCounts[String(group._id)] || 0;

            const row = (
              <button
                key={group._id}
                onClick={() => onSelectGroup(group)}
                className={`w-full text-left p-3 transition-all ${
                  isSelected
                    ? 'bg-gray-800 ring-1 ring-gray-700'
                    : 'hover:bg-gray-800'
                } ${unreadCount > 0 && !isSelected ? 'bg-gray-800/30' : ''}`}
              >
                <div className='flex items-start space-x-3'>
                  <GroupAvatar group={group} />
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center justify-between mb-0.5'>
                      <p
                        className={`font-medium text-sm truncate ${unreadCount > 0 ? 'text-white font-semibold' : 'text-gray-200'}`}
                      >
                        {group.name}
                      </p>
                      <div className='flex items-center gap-1.5 flex-shrink-0 ml-1'>
                        {timeAgo && !typingNames && (
                          <span
                            className={`text-xs ${unreadCount > 0 ? 'text-green-400' : 'text-gray-500'}`}
                          >
                            {timeAgo}
                          </span>
                        )}
                        {unreadCount > 0 && (
                          <span className='min-w-[18px] h-[18px] bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none'>
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className='flex items-center justify-between'>
                      {typingNames ? (
                        <p className='text-xs text-green-400 truncate flex items-center gap-1'>
                          <span>{typingNames} typing</span>
                          <TypingDots />
                        </p>
                      ) : lastMsg ? (
                        <p
                          className={`text-xs truncate ${unreadCount > 0 ? 'text-white font-medium' : 'text-gray-400'}`}
                        >
                          <span className='text-gray-500'>
                            {lastMsg.isMine ? 'You' : lastMsg.senderName}:{' '}
                          </span>
                          {lastMsg.content}
                        </p>
                      ) : (
                        <p className='text-xs text-gray-600 truncate'>
                          {memberCount} members
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );

            if (!unifiedMobile) return row;

            return (
              <SwipeableRow
                key={group._id}
                id={`group-${group._id}`}
                openId={openRowId}
                onOpenChange={setOpenRowId}
                actions={GROUP_SWIPE_ACTIONS}
                onAction={(action) => {
                  if (action === 'exit') onExitGroup?.(group);
                  if (action === 'mute') onMuteGroup?.(group);
                }}
              >
                {row}
              </SwipeableRow>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GroupList;
