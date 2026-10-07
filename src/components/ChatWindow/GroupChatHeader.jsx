import axios from 'axios';
import {
  ArrowLeft,
  Camera,
  Check,
  Crown,
  Edit3,
  LogOut,
  MoreVertical,
  Search,
  Shield,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../utils/apiUrl';
import { getGroupAvatarUrl } from '../../utils/avatar';
import { uploadAvatar } from '../../utils/b2Media';
import AvatarPickerModal, { NONE } from '../AvatarPickerModal';
import OptimizedImage from '../OptimizedImage';
import UserAvatar from '../UserAvatar';

const GroupAvatar = ({ group, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-14 h-14' };
  const members = (group?.members || [])
    .map((member) => member?.user || member)
    .filter(Boolean)
    .slice(0, 3);

  if (members.length > 1) {
    const positions = [
      'left-0 top-0',
      'right-0 top-0',
      'bottom-0 left-1/2 -translate-x-1/2',
    ];

    return (
      <div
        className={`${sizes[size]} relative flex-shrink-0`}
        aria-label={`${group?.name || 'Group'} members`}
      >
        {members.map((member, index) => (
          <UserAvatar
            user={member}
            key={member._id || index}
            alt=''
            className={`absolute h-1/2 w-1/2 rounded-full object-cover ${positions[index]}`}
          />
        ))}
      </div>
    );
  }

  return (
    <OptimizedImage
      src={getGroupAvatarUrl(group)}
      alt={group?.name}
      className={`${sizes[size]} rounded-full object-cover flex-shrink-0`}
    />
  );
};

const GroupInfoPanel = ({
  group,
  currentUser,
  onClose,
  onGroupUpdated,
  onGroupLeft,
  onGroupDeleted,
}) => {
  const { token } = useAuth();
  const currentUserId = String(currentUser?.id || currentUser?._id);
  const myRole = group.members.find(
    (m) => String(m.user._id) === currentUserId,
  )?.role;
  const isAdmin = myRole === 'admin';
  const isCreator =
    String(group.createdBy?._id || group.createdBy) === currentUserId;

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editDesc, setEditDesc] = useState(group.description || '');
  const [savingEdit, setSavingEdit] = useState(false);

  // Avatar
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // Add members
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [addingUser, setAddingUser] = useState(null);

  // Member action menu — fixed position to escape overflow-hidden container
  const [memberMenu, setMemberMenu] = useState(null); // { uid, top, right }
  const openMemberMenu = (e, uid) => {
    const r = e.currentTarget.getBoundingClientRect();
    const winW = window.innerWidth;
    const menuW = 176; // w-44
    const right = Math.max(8, winW - r.right);
    setMemberMenu({
      uid,
      top: r.bottom + 4,
      right: right + menuW > winW - 8 ? winW - menuW - 8 : right,
    });
  };

  const [loading, setLoading] = useState(false);

  const api = useMemo(
    () =>
      axios.create({
        baseURL: API_URL,
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );

  // Fetch all users when add-members is opened
  useEffect(() => {
    if (!showAddMembers) return;
    api
      .get('/users')
      .then((r) => setAllUsers(r.data.users || []))
      .catch(() => {});
  }, [showAddMembers, api]);

  const memberIds = new Set(group.members.map((m) => String(m.user._id)));
  const addableUsers = allUsers.filter(
    (u) =>
      !memberIds.has(String(u._id)) &&
      (u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(userSearch.toLowerCase())),
  );

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await api.put(`/groups/${group._id}`, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      onGroupUpdated(res.data.group);
      setEditing(false);
    } catch {
      alert('Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveAvatar = async (selection, crop) => {
    setSavingAvatar(true);
    try {
      const uploaded =
        selection === NONE ? null : await uploadAvatar(selection, token, undefined, crop);
      const avatar = uploaded?.ref || null;
      const res = await api.put(`/groups/${group._id}`, { avatar });
      onGroupUpdated(res.data.group);
      setShowAvatarPicker(false);
    } catch {
      alert('Failed to update avatar');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleAddMember = async (userId) => {
    setAddingUser(userId);
    try {
      const res = await api.post(`/groups/${group._id}/members`, { userId });
      onGroupUpdated(res.data.group);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add member');
    } finally {
      setAddingUser(null);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Remove this member from the group?')) return;
    try {
      const res = await api.delete(`/groups/${group._id}/members/${userId}`);
      onGroupUpdated(res.data.group);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove member');
    }
    setMemberMenu(null);
  };

  const handleChangeRole = async (userId, role) => {
    try {
      const res = await api.put(`/groups/${group._id}/members/${userId}/role`, {
        role,
      });
      onGroupUpdated(res.data.group);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to change role');
    }
    setMemberMenu(null);
  };

  const handleLeave = async () => {
    if (!confirm(`Leave "${group.name}"?`)) return;
    setLoading(true);
    try {
      await api.post(`/groups/${group._id}/leave`);
      onGroupLeft(group._id);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to leave');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${group.name}"? This cannot be undone.`))
      return;
    setLoading(true);
    try {
      await api.delete(`/groups/${group._id}`);
      onGroupDeleted(group._id);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='w-full overflow-hidden rounded-3xl border border-white/10 bg-gray-950/95 text-white shadow-2xl shadow-black/50 backdrop-blur-xl max-h-[85dvh] flex flex-col'>
      {/* ── Header ── */}
      <div className='flex-shrink-0 border-b border-white/10 bg-white/[0.04] p-4'>
        <div className='flex items-start gap-3'>
          {/* Avatar */}
          <div className='relative flex-shrink-0'>
            <GroupAvatar group={group} size='lg' />
            {isAdmin && (
              <button
                onClick={() => setShowAvatarPicker(true)}
                className='absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 transition-opacity hover:opacity-100'
                title='Change photo'
              >
                <Camera size={16} className='text-white' />
              </button>
            )}
          </div>

          {/* Name / edit */}
          <div className='flex-1 min-w-0'>
            {editing ? (
              <div className='space-y-1.5'>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className='w-full bg-white/10 text-white text-sm font-semibold border border-white/20 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/40 placeholder-white/40'
                  placeholder='Group name'
                  maxLength={60}
                  autoFocus
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className='w-full bg-white/10 text-white text-xs border border-white/20 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/40 placeholder-white/40 resize-none'
                  placeholder='Description (optional)'
                  rows={2}
                  maxLength={200}
                />
                <div className='flex gap-1.5'>
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit || !editName.trim()}
                    className='flex items-center gap-1 px-3 py-1 bg-white text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors'
                  >
                    <Check size={11} /> {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditName(group.name);
                      setEditDesc(group.description || '');
                    }}
                    className='px-3 py-1 bg-white/10 text-white text-xs rounded-lg hover:bg-white/20 transition-colors'
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className='flex items-center gap-1.5'>
                  <h3 className='font-bold text-white text-base truncate'>
                    {group.name}
                  </h3>
                  {isAdmin && (
                    <button
                      onClick={() => setEditing(true)}
                      title='Edit group'
                      className='text-white/50 hover:text-white transition-colors flex-shrink-0'
                    >
                      <Edit3 size={13} />
                    </button>
                  )}
                </div>
                {group.description && (
                  <p className='text-gray-300 text-xs mt-0.5 line-clamp-2'>
                    {group.description}
                  </p>
                )}
                <p className='text-gray-400 text-xs mt-1 flex items-center gap-1'>
                  <Users size={10} /> {group.members.length} members
                </p>
              </>
            )}
          </div>

          <button
            onClick={onClose}
            className='text-gray-400 hover:text-white flex-shrink-0 p-1'
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className='flex-1 overflow-y-auto min-h-0'>
        {/* Members section */}
        <div className='p-4 pb-2'>
          <div className='flex items-center justify-between mb-2.5'>
            <p className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
              Members · {group.members.length}
            </p>
            {isAdmin && (
              <button
                onClick={() => {
                  setShowAddMembers((v) => !v);
                  setUserSearch('');
                }}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                  showAddMembers
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <UserPlus size={12} /> {showAddMembers ? 'Done' : 'Add'}
              </button>
            )}
          </div>

          {/* Add members search */}
          {showAddMembers && isAdmin && (
            <div className='mb-3 space-y-2'>
              <div className='relative'>
                <Search
                  size={13}
                  className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'
                />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder='Search people to add…'
                  className='w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
                  autoFocus
                />
              </div>
              <div className='space-y-1 max-h-36 overflow-y-auto'>
                {addableUsers.length === 0 ? (
                  <p className='text-xs text-gray-400 text-center py-2'>
                    {userSearch
                      ? 'No users found'
                      : 'All users are already members'}
                  </p>
                ) : (
                  addableUsers.slice(0, 8).map((u) => (
                    <div
                      key={u._id}
                      className='flex items-center gap-2.5 p-2 rounded-xl hover:bg-gray-50'
                    >
                      <UserAvatar
                        user={u}
                        alt={u.username}
                        className='w-7 h-7 rounded-full object-cover flex-shrink-0'
                      />
                      <span className='flex-1 text-sm text-gray-800 truncate'>
                        {u.username}
                      </span>
                      <button
                        onClick={() => handleAddMember(u._id)}
                        disabled={addingUser === u._id}
                        className='px-2.5 py-1 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors'
                      >
                        {addingUser === u._id ? '…' : 'Add'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Member list */}
          <div className='space-y-0.5'>
            {group.members.map((m) => {
              const uid = String(m.user._id);
              const isMe = uid === currentUserId;
              const isMemberAdmin = m.role === 'admin';
              const isGroupCreator =
                uid === String(group.createdBy?._id || group.createdBy);
              const canManage = isAdmin && !isMe && !isGroupCreator;
              return (
                <div
                  key={uid}
                  className='group relative flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/[0.06]'
                >
                  <div className='relative flex-shrink-0'>
                    <UserAvatar
                      user={m.user}
                      alt={m.user.username}
                      className='w-8 h-8 rounded-full object-cover'
                    />
                    {m.user.isOnline && (
                      <span className='absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-white' />
                    )}
                  </div>

                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-1.5'>
                      <p className='truncate text-sm font-medium text-white'>
                        {m.user.username}
                      </p>
                      {isMe && (
                        <span className='text-xs text-gray-400'>(you)</span>
                      )}
                    </div>
                    <p className='text-xs text-gray-500'>
                      {m.user.isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>

                  <div className='flex items-center gap-1 flex-shrink-0'>
                    {isGroupCreator && (
                      <span className='flex items-center gap-0.5 text-[10px] font-bold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full'>
                        <Crown size={9} /> Owner
                      </span>
                    )}
                    {isMemberAdmin && !isGroupCreator && (
                      <span className='flex items-center gap-0.5 text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-full'>
                        <Shield size={9} /> Admin
                      </span>
                    )}

                    {/* Admin action menu trigger */}
                    {canManage && (
                      <button
                        onClick={(e) => openMemberMenu(e, uid)}
                        className='opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded-lg transition-all'
                      >
                        <MoreVertical size={14} className='text-gray-500' />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className='space-y-1 border-t border-white/10 px-4 pb-4 pt-2'>
          {!isCreator && (
            <button
              onClick={handleLeave}
              disabled={loading}
              className='w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-xl transition-colors disabled:opacity-50'
            >
              <LogOut size={15} /> Leave Group
            </button>
          )}
          {isCreator && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className='w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50'
            >
              <Trash2 size={15} /> Delete Group
            </button>
          )}
        </div>
      </div>

      {showAvatarPicker && (
        <AvatarPickerModal
          user={{ username: group.name, avatar: group.avatar }}
          onClose={() => setShowAvatarPicker(false)}
          onSave={handleSaveAvatar}
          saving={savingAvatar}
        />
      )}

      {/* Member action menu — portal to document.body, guaranteed above all containers */}
      {memberMenu &&
        (() => {
          const { uid, top, right } = memberMenu;
          const m = group.members.find((mb) => String(mb.user._id) === uid);
          if (!m) return null;
          const isMemberAdmin = m.role === 'admin';
          const isGroupCreator =
            uid === String(group.createdBy?._id || group.createdBy);
          const canDemote = isCreator && isMemberAdmin && !isGroupCreator;
          return ReactDOM.createPortal(
            <>
              <div
                className='fixed inset-0 z-[199]'
                onClick={() => setMemberMenu(null)}
              />
              <div
                className='fixed z-[200] w-44 overflow-hidden rounded-xl border border-white/10 bg-gray-900 py-1 shadow-2xl animate-fade-in'
                style={{ top, right }}
              >
                {!isMemberAdmin && (
                  <button
                    onClick={() => handleChangeRole(uid, 'admin')}
                    className='flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10'
                  >
                    <Shield size={14} className='text-blue-500' /> Make Admin
                  </button>
                )}
                {isMemberAdmin && canDemote && (
                  <button
                    onClick={() => handleChangeRole(uid, 'member')}
                    className='flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10'
                  >
                    <ShieldOff size={14} className='text-orange-500' /> Remove
                    Admin
                  </button>
                )}
                {(!isMemberAdmin || isCreator) && (
                  <>
                    <div className='my-0.5 border-t border-white/10' />
                    <button
                      onClick={() => handleRemoveMember(uid)}
                      className='flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10'
                    >
                      <UserMinus size={14} /> Remove from group
                    </button>
                  </>
                )}
              </div>
            </>,
            document.body,
          );
        })()}
    </div>
  );
};

const GroupChatHeader = ({
  selectedGroup,
  groupTypingUsers,
  onGroupUpdated,
  onGroupLeft,
  onGroupDeleted,
  currentUser,
  onBack,
  // Meet / video call — plug your logic in here. Receives the selected group.
  onStartMeet,
  isUserOnline,
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const [showMeet, setShowMeet] = useState(false);

  if (!selectedGroup) return null;

  const typing = groupTypingUsers?.[selectedGroup._id];
  const typingNames =
    typing?.size > 0 ? [...typing].slice(0, 2).join(', ') : null;
  const memberCount = selectedGroup.members?.length ?? 0;
  const allMembers = (selectedGroup.members || [])
    .map((member) => member.user)
    .filter(Boolean);
  const isMemberOnline = (member) =>
    isUserOnline?.(member._id) ?? Boolean(member.isOnline);
  const onlineMembers = allMembers.filter(isMemberOnline);

  return (
    <div className='relative border-b border-white/10 bg-gray-950/80 px-3 py-3 text-white backdrop-blur-xl md:px-6 md:py-4'>
      <div className='flex items-center justify-between'>
        {/* Left – back button (mobile) + group info */}
        <div className='flex items-center gap-2 md:gap-3'>
          <button
            onClick={onBack}
            className='-ml-1 rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white md:hidden'
            aria-label='Back'
          >
            <ArrowLeft size={20} />
          </button>
          <GroupAvatar group={selectedGroup} />
          <div>
            <h2 className='font-semibold text-white'>{selectedGroup.name}</h2>
            <p className='text-xs'>
              {typingNames ? (
                <span className='text-green-600'>{typingNames} typing...</span>
              ) : (
                <span className='flex items-center gap-1 text-gray-400'>
                  <Users size={11} /> {memberCount} members
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right – meet button + 3-dots menu button */}
        <div className='flex items-center gap-1 relative'>
          <button
            onClick={() => {
              setShowInfo(false);
              setShowMeet((value) => !value);
            }}
            className='rounded-full p-2 transition-colors hover:bg-white/10'
            title='Start video meet'
            aria-label='Start video meet'
          >
            <Video size={18} className='text-gray-300' />
          </button>

          <button
            onClick={() => {
              setShowMeet(false);
              setShowInfo((value) => !value);
            }}
            className='rounded-full p-2 transition-colors hover:bg-white/10'
            title='Group info'
            aria-label='Group info'
          >
            <MoreVertical size={18} className='text-gray-300' />
          </button>

          {showMeet &&
            ReactDOM.createPortal(
              <>
                <div
                  className='fixed inset-0 z-[300] bg-black/20 backdrop-blur-[2px]'
                  onClick={() => setShowMeet(false)}
                />
                <div className='pointer-events-none fixed inset-0 z-[301] flex items-center justify-center p-4 md:pointer-events-auto md:inset-auto md:right-6 md:top-20 md:block md:p-0'>
                  <div className='pointer-events-auto max-h-[calc(100dvh-2rem)] w-[min(100%,24rem)] overflow-y-auto rounded-2xl border border-white/20 bg-gray-900/65 p-3 text-white shadow-2xl shadow-black/50 backdrop-blur-2xl modal-in'>
                    <div className='mb-2 flex items-center justify-between'>
                      <div>
                        <p className='text-sm font-semibold'>Start meeting</p>
                        <p className='text-xs text-gray-400'>
                          {onlineMembers.length}/{memberCount} members online
                        </p>
                      </div>
                      <Users size={16} className='text-emerald-400' />
                    </div>

                    <div className='mb-2 max-h-[min(15rem,45dvh)] space-y-1 overflow-y-auto'>
                      {allMembers.length ? (
                        allMembers.map((member) => {
                          const online = isMemberOnline(member);
                          return (
                            <div
                              key={member._id}
                              className='flex items-center gap-2 rounded-lg bg-white/[0.06] px-2 py-1.5'
                            >
                              <UserAvatar
                                user={member}
                                alt=''
                                className='h-7 w-7 rounded-full object-cover'
                              />
                              <span className='min-w-0 flex-1 truncate text-xs'>
                                {member.username}
                              </span>
                              <span className='flex items-center gap-1 text-[10px]'>
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-gray-600'}`}
                                />
                                <span
                                  className={
                                    online
                                      ? 'text-emerald-300'
                                      : 'text-gray-500'
                                  }
                                >
                                  {online ? 'Online' : 'Offline'}
                                </span>
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className='py-3 text-center text-xs text-gray-500'>
                          No group members
                        </p>
                      )}
                    </div>

                    <button
                      type='button'
                      disabled={!onlineMembers.length}
                      onClick={() => {
                        setShowMeet(false);
                        onStartMeet?.(selectedGroup, onlineMembers);
                      }}
                      className='flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40'
                    >
                      <Video size={16} /> Start meeting
                    </button>
                  </div>
                </div>
              </>,
              document.body,
            )}

          {/* Info panel — centered modal via portal */}
          {showInfo &&
            ReactDOM.createPortal(
              <>
                <div
                  className='fixed inset-0 z-[209] bg-black/50 backdrop-blur-sm'
                  onClick={() => setShowInfo(false)}
                />
                <div className='fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none'>
                  <div className='pointer-events-auto w-full max-w-lg modal-in'>
                    <GroupInfoPanel
                      group={selectedGroup}
                      currentUser={currentUser}
                      onClose={() => setShowInfo(false)}
                      onGroupUpdated={onGroupUpdated}
                      onGroupLeft={onGroupLeft}
                      onGroupDeleted={onGroupDeleted}
                    />
                  </div>
                </div>
              </>,
              document.body,
            )}
        </div>
      </div>
    </div>
  );
};

export default GroupChatHeader;
