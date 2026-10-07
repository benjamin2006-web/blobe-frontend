import axios from 'axios';
import { LockKeyhole, Plus, Send, Users, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { API_URL } from '../../../utils/apiUrl';
import GroupCreationModal from '../../GroupCreationModal';
import CreatePostModal from '../../CreatePostModal';
import { BoardEditor } from '../../BoardPost';
import PostTypeMenu from '../../PostTypeMenu';
import MobileBottomNav from '../MobileBottomNav';
import SidebarTopBar from '../SidebarTopBar';
import GroupList from './GroupList';
import UserList from './UserList';
import { createBoardPost } from '../../../utils/boardPosts';

const SettingsModal = lazy(() => import('../../SettingsModal'));

const TabButton = ({
  active,
  onClick,
  icon: Icon,
  iconSize = 15,
  iconStrokeWidth = 2,
  label,
  unreadCount = 0,
}) => (
  <button
    onClick={onClick}
    aria-label={unreadCount > 0 ? `${label}, ${unreadCount} unread` : label}
    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
      active
        ? 'bg-white/15 text-white'
        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
    }`}
  >
    <span className='relative inline-flex'>
      <Icon size={iconSize} strokeWidth={iconStrokeWidth} />
      {unreadCount > 0 && (
        <span className='absolute -right-2 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-gray-900 bg-red-500 px-1 text-[9px] font-bold leading-none text-white shadow-md'>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </span>
    <span>{label}</span>
  </button>
);

const ChatSidebar = ({
  users,
  groups,
  currentUser,
  selectedUser,
  selectedGroup,
  onSelectUser,
  onSelectGroup,
  onGroupCreated,
  onDeleteUser,
  onLockUser,
  onMuteUser,
  onBlockUser,
  onExitGroup,
  onMuteGroup,
  onLogout,
  openCreateGroup = false,
  isUserOnline,
  isUserTyping,
  loading: parentLoading,
  lastMessages: lastMessagesFromParent,
  groupLastMessages,
  groupTypingUsers,
  unreadCounts = {},
  groupUnreadCounts = {},
  notifications = [],
  onMarkAllNotificationsRead,
  onClearAllNotifications,
  onNotificationRead,
  onUserSearchChange,
  onLoadMoreUsers,
  usersHasMore = false,
  loadingMoreUsers = false,
  usersLoadError = false,
  onRetryLoadMoreUsers,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('dms');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postModalShareToStory, setPostModalShareToStory] = useState(false);
  const [showBoardEditor, setShowBoardEditor] = useState(false);
  const [boardEditorShareToStory, setBoardEditorShareToStory] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [mobileModal, setMobileModal] = useState(null);
  const [showEncryptionLabel, setShowEncryptionLabel] = useState(true);
  const [showEncryptionInfo, setShowEncryptionInfo] = useState(false);
  const lastConversationScrollTop = useRef(0);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (openCreateGroup) setShowGroupModal(true);
  }, [openCreateGroup]);

  const maybeLoadMoreUsers = (event) => {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 140) {
      onLoadMoreUsers?.();
    }
  };

  const handleConversationListScroll = (event) => {
    const scrollTop = event.currentTarget.scrollTop;
    const delta = scrollTop - lastConversationScrollTop.current;
    lastConversationScrollTop.current = scrollTop;
    if (Math.abs(delta) >= 3) {
      setShowEncryptionLabel(scrollTop <= 8 || delta < 0);
    }
    maybeLoadMoreUsers(event);
  };

  const handleDesktopUserListScroll = (event) => {
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    handleConversationListScroll(event);
  };

  const totalUnread = useMemo(
    () =>
      Object.values(unreadCounts).reduce((sum, count) => sum + (count || 0), 0) +
      Object.values(groupUnreadCounts).reduce((sum, count) => sum + (count || 0), 0),
    [groupUnreadCounts, unreadCounts],
  );

  const totalDirectUnread = useMemo(
    () =>
      Object.values(unreadCounts).reduce(
        (sum, count) => sum + (Number(count) || 0),
        0,
      ),
    [unreadCounts],
  );

  const totalGroupUnread = useMemo(
    () =>
      Object.values(groupUnreadCounts).reduce(
        (sum, count) => sum + (Number(count) || 0),
        0,
      ),
    [groupUnreadCounts],
  );

  const onlineCount = useMemo(
    () => users.filter((u) => isUserOnline(u._id)).length,
    [users, isUserOnline],
  );

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [users, searchTerm],
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter((g) =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [groups, searchTerm],
  );

  const handleCreateGroup = async ({ name, description, memberIds }) => {
    const api = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await api.post('/groups', { name, description, memberIds });
    if (onGroupCreated) onGroupCreated(res.data.group);
    return res.data.group;
  };

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
      const authorId = String(currentUser?._id || currentUser?.id || '');
      const storyParams = new URLSearchParams({
        storyUser: authorId,
        storyPost: String(post._id),
      });
      navigate(`/home?${storyParams.toString()}`, {
        state: { storyAuthor: currentUser },
      });
    } else {
      navigate(`/home?postId=${encodeURIComponent(post._id)}`);
    }
  };

  const listProps = {
    isUserOnline,
    isUserTyping,
    lastMessages: lastMessagesFromParent,
    loading: parentLoading,
    unreadCounts,
    onDeleteUser,
    onLockUser,
    onMuteUser,
    onBlockUser,
    hasMore: usersHasMore,
    loadingMore: loadingMoreUsers,
    loadError: usersLoadError,
    onLoadMore: onLoadMoreUsers,
    onRetryLoadMore: onRetryLoadMoreUsers,
  };

  const groupListProps = {
    groupLastMessages,
    groupTypingUsers,
    loading: parentLoading,
    groupUnreadCounts,
  };

  return (
    <>
      {/* Sidebar — always fully expanded.
          Mobile: takes full width (Chat.jsx hides it when a chat is open).
          md+:    fixed width 320px, always visible beside the chat window.   */}
      <div className='w-full md:w-80 h-full min-h-0 bg-gray-900 text-white flex flex-col shadow-xl flex-shrink-0'>
        <div className='md:contents h-[76px] flex-shrink-0'>
          <SidebarTopBar
            onlineCount={onlineCount}
            searchTerm={searchTerm}
            unreadCount={totalUnread}
            onSearchChange={(value) => {
              setSearchTerm(value);
              onUserSearchChange?.(value);
            }}
            onAdd={() => setAddMenuOpen((open) => !open)}
            onCreateGroup={() => setShowGroupModal(true)}
            onMenuAction={(tab) => setMobileModal(tab)}
            onLogout={() => {
              if (confirm('Log out of Blobe?')) onLogout?.();
            }}
          />
        </div>

        {/* DMs / Groups tab switcher — desktop only */}
        <div className='hidden md:block px-4 pb-3 pt-3'>
          <div className='flex gap-1 bg-white/5 rounded-xl p-1'>
            <TabButton
              active={activeTab === 'dms'}
              onClick={() => setActiveTab('dms')}
              icon={Send}
              iconSize={20}
              iconStrokeWidth={2.2}
              label='Messages'
              unreadCount={totalDirectUnread}
            />
            <TabButton
              active={activeTab === 'groups'}
              onClick={() => setActiveTab('groups')}
              icon={Users}
              iconSize={20}
              label='Groups'
              unreadCount={totalGroupUnread}
            />
          </div>
        </div>

        {/* New Group button — desktop only */}
        {activeTab === 'groups' && (
          <div className='hidden md:block px-4 pb-3'>
            <button
              onClick={() => setShowGroupModal(true)}
              className='w-full flex items-center justify-center gap-2 py-2.5 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-medium text-gray-300 hover:text-white transition-all'
            >
              <Plus size={15} /> New Group
            </button>
          </div>
        )}

        {/* Mobile list: users and groups share one WhatsApp-style conversation list. */}
        {activeTab === 'dms' ? (
          <>
            <div
              aria-hidden={!showEncryptionLabel}
              className={`flex shrink-0 items-center justify-center gap-1.5 overflow-hidden px-3 text-emerald-400 transition-[max-height,opacity,padding] duration-200 ${
                showEncryptionLabel
                  ? 'max-h-8 pb-2 pt-1 opacity-100'
                  : 'max-h-0 pb-0 pt-0 opacity-0'
              }`}
            >
              <LockKeyhole size={13} aria-hidden='true' />
              <button
                type='button'
                onClick={() => setShowEncryptionInfo(true)}
                aria-haspopup='dialog'
                className='text-[11px] font-semibold tracking-wide transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
              >
                Blobe End to End Encryption
              </button>
            </div>
            <div
              className='flex min-h-0 flex-1 flex-col overflow-y-auto md:hidden'
              onScroll={handleConversationListScroll}
            >
              <GroupList
                groups={filteredGroups}
                selectedGroup={selectedGroup}
                onSelectGroup={onSelectGroup}
                isExpanded={true}
                unifiedMobile
                onExitGroup={onExitGroup}
                onMuteGroup={onMuteGroup}
                {...groupListProps}
              />
              <UserList
                users={filteredUsers}
                selectedUser={selectedUser}
                onSelectUser={onSelectUser}
                isExpanded={true}
                unifiedMobile
                onDeleteUser={onDeleteUser}
                onLockUser={onLockUser}
                onMuteUser={onMuteUser}
                onBlockUser={onBlockUser}
                {...listProps}
              />
            </div>
            <div className='hidden min-h-0 flex-1 md:flex'>
              <UserList
                users={filteredUsers}
                selectedUser={selectedUser}
                onSelectUser={onSelectUser}
                isExpanded={true}
                onScroll={handleDesktopUserListScroll}
                {...listProps}
              />
            </div>
          </>
        ) : activeTab === 'groups' ? (
          <div className='flex min-h-0 flex-1'>
            <GroupList
              groups={filteredGroups}
              selectedGroup={selectedGroup}
              onSelectGroup={onSelectGroup}
              isExpanded={true}
              unifiedMobile
              onExitGroup={onExitGroup}
              onMuteGroup={onMuteGroup}
              {...groupListProps}
            />
          </div>
        ) : null}

        {/* ── Mobile FAB: New Group (only on Groups tab) ── */}
        {activeTab === 'groups' && (
          <div className='md:hidden flex justify-end px-4 pb-2'>
            <button
              onClick={() => setShowGroupModal(true)}
              className='flex items-center gap-2 px-4 py-2.5 bg-white text-gray-900 text-sm font-bold rounded-2xl shadow-lg hover:bg-gray-100 active:scale-95 transition-all animate-fade-in'
            >
              <Plus size={16} strokeWidth={2.5} /> New Group
            </button>
          </div>
        )}

        {/* ── Mobile bottom navigation bar ── */}
        <div className='pb-14 md:pb-0'>
          <MobileBottomNav
            active='messages'
            onHome={() => navigate('/home')}
            onAdd={() => setAddMenuOpen((open) => !open)}
            onMessages={() => setActiveTab('dms')}
            unreadCount={totalUnread}
          />
        </div>
      </div>

      {mobileModal && (
        <Suspense fallback={null}>
          <SettingsModal
            onClose={() => setMobileModal(null)}
            onLogout={onLogout}
            initialTab={mobileModal}
            notifications={notifications}
            onMarkAllNotificationsRead={onMarkAllNotificationsRead}
            onClearAllNotifications={onClearAllNotifications}
            onNotificationRead={onNotificationRead}
            onOpenNotificationGroup={(groupId) => {
              const group = groups.find((entry) => String(entry._id) === String(groupId));
              if (group) onSelectGroup(group);
              setMobileModal(null);
            }}
          />
        </Suspense>
      )}

      {showEncryptionInfo && (
        <div
          className='fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4'
          role='presentation'
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowEncryptionInfo(false);
          }}
        >
          <button
            type='button'
            aria-label='Close encryption information'
            className='absolute inset-0 cursor-default'
            onClick={() => setShowEncryptionInfo(false)}
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='encryption-info-title'
            className='modal-in relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[#0b1210] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.75)]'
          >
            <div className='relative'>
              <div className='flex items-start justify-between gap-4'>
                <div className='flex items-center gap-2.5'>
                  <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/15 text-emerald-300 shadow-inner shadow-white/10'>
                    <LockKeyhole size={19} aria-hidden='true' />
                  </span>
                  <h2 id='encryption-info-title' className='text-base font-bold'>
                    What is end-to-end encryption?
                  </h2>
                </div>
                <button
                  type='button'
                  aria-label='Close'
                  onClick={() => setShowEncryptionInfo(false)}
                  className='rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white'
                >
                  <X size={18} />
                </button>
              </div>
              <p className='mt-4 text-sm leading-6 text-gray-100/85'>
                End-to-end encryption protects a message so that only the people
                in the conversation can read it. The message is encrypted on the
                sender’s device and decrypted on the recipient’s device, so the
                service hosting it cannot read its contents.
              </p>
              <div className='mt-4 rounded-2xl border border-amber-200/20 bg-amber-300/[0.12] p-3.5 shadow-inner shadow-white/[0.04]'>
                <p className='text-sm font-semibold text-amber-200'>
                  This protection is not currently available for Blobe messages.
                </p>
                <p className='mt-1 text-xs leading-5 text-amber-100/75'>
                  Don’t assume chat messages are end-to-end encrypted or use this
                  label as a guarantee of message privacy.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {showGroupModal && (
        <GroupCreationModal
          users={users}
          onClose={() => setShowGroupModal(false)}
          onCreate={handleCreateGroup}
        />
      )}
      {addMenuOpen && (
        <PostTypeMenu
          onClose={() => setAddMenuOpen(false)}
          onSelect={handlePostTypeSelect}
        />
      )}
      {showPostModal && (
        <CreatePostModal
          token={token}
          user={currentUser}
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
    </>
  );
};

export default ChatSidebar;
