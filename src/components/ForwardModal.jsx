import {
  Check,
  Forward,
  MessageCircle,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { sortUsersByLastMessage } from '../utils/conversationPreview';
import UserAvatar from './UserAvatar';

const ForwardModal = ({
  message,
  users,
  groups,
  currentUserId,
  lastMessages,
  groupLastMessages,
  onForward,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set()); // "u:id" or "g:id"

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const filteredUsers = useMemo(() => {
    const matchingUsers = users.filter(
      (u) =>
        String(u._id) !== String(currentUserId) &&
        u.username.toLowerCase().includes(search.toLowerCase()),
    );
    return sortUsersByLastMessage(matchingUsers, lastMessages);
  }, [users, search, currentUserId, lastMessages]);

  const filteredGroups = useMemo(() => {
    return groups
      .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const timeA =
          groupLastMessages?.[a._id]?.timestamp ||
          a.lastMessageAt ||
          a.createdAt;
        const timeB =
          groupLastMessages?.[b._id]?.timestamp ||
          b.lastMessageAt ||
          b.createdAt;
        return new Date(timeB || 0) - new Date(timeA || 0);
      });
  }, [groups, search, groupLastMessages]);

  const handleSend = () => {
    if (!selected.size) return;
    const recipients = [...selected].map((key) => {
      const [type, id] = key.split(':');
      return { type, id };
    });
    onForward(message, recipients);
    onClose();
  };

  const rawPreview =
    message.messageType === 'voice'
      ? '🎤 Voice message'
      : message.content || '';
  const preview =
    rawPreview.length > 60 ? rawPreview.slice(0, 60) + '…' : rawPreview;

  return (
    <div className='fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-4'>
      <div
        className='absolute inset-0 bg-black/60 backdrop-blur-sm'
        onClick={onClose}
      />

      <div className='relative w-full md:max-w-md max-h-[85dvh] overflow-hidden flex flex-col rounded-t-2xl md:rounded-2xl border border-white/10 bg-gray-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl'>
        {/* Header */}
        <div className='flex items-center justify-between flex-shrink-0 border-b border-white/10 bg-white/[0.04] px-5 py-4'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/10'>
              <Forward size={16} className='text-white' />
            </div>
            <div>
              <h2 className='text-sm font-bold text-white'>Forward message</h2>
              <p className='mt-0.5 max-w-[200px] truncate text-xs text-gray-400'>
                "{preview}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20'
          >
            <X size={15} className='text-white' />
          </button>
        </div>

        {/* Search */}
        <div className='flex-shrink-0 border-b border-white/10 bg-black/10 px-4 py-3'>
          <div className='relative'>
            <Search
              size={14}
              className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'
            />
            <input
              type='text'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search people and groups…'
              className='w-full rounded-xl border border-white/10 bg-white/[0.07] py-2 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20'
            />
          </div>
        </div>

        {/* List */}
        <div className='flex-1 overflow-y-auto divide-y divide-white/[0.06]'>
          {/* Users */}
          {filteredUsers.length > 0 && (
            <div>
              <p className='bg-white/[0.03] px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500'>
                <MessageCircle size={11} className='inline mr-1.5' />
                Direct Messages
              </p>
              {filteredUsers.map((u) => {
                const key = `u:${u._id}`;
                const checked = selected.has(key);
                return (
                  <button
                    key={u._id}
                    onClick={() => toggle(key)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06] ${checked ? 'bg-emerald-400/[0.08]' : ''}`}
                  >
                    <UserAvatar
                      user={u}
                      alt={u.username}
                      className='w-10 h-10 rounded-full object-cover flex-shrink-0'
                    />
                    <div className='flex-1 min-w-0 text-left'>
                      <p className='truncate text-sm font-semibold text-gray-100'>
                        {u.username}
                      </p>
                      <p className='text-xs text-gray-400 truncate'>
                        {u.email}
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        checked
                          ? 'border-emerald-400 bg-emerald-500'
                          : 'border-white/25'
                      }`}
                    >
                      {checked && <Check size={11} className='text-white' />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Groups */}
          {filteredGroups.length > 0 && (
            <div>
              <p className='bg-white/[0.03] px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500'>
                <Users size={11} className='inline mr-1.5' />
                Groups
              </p>
              {filteredGroups.map((g) => {
                const key = `g:${g._id}`;
                const checked = selected.has(key);
                return (
                  <button
                    key={g._id}
                    onClick={() => toggle(key)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06] ${checked ? 'bg-emerald-400/[0.08]' : ''}`}
                  >
                    <div className='w-10 h-10 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0'>
                      {g.name[0]?.toUpperCase()}
                    </div>
                    <div className='flex-1 min-w-0 text-left'>
                      <p className='truncate text-sm font-semibold text-gray-100'>
                        {g.name}
                      </p>
                      <p className='text-xs text-gray-400'>
                        {g.members?.length} members
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        checked
                          ? 'border-emerald-400 bg-emerald-500'
                          : 'border-white/25'
                      }`}
                    >
                      {checked && <Check size={11} className='text-white' />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filteredUsers.length === 0 && filteredGroups.length === 0 && (
            <p className='text-center text-gray-400 text-sm py-10'>
              No results for "{search}"
            </p>
          )}
        </div>

        {/* Footer */}
        <div className='flex flex-shrink-0 items-center justify-between border-t border-white/10 bg-white/[0.04] px-4 py-3'>
          <span className='text-xs text-gray-500'>
            {selected.size > 0
              ? `${selected.size} selected`
              : 'Select recipients'}
          </span>
          <button
            onClick={handleSend}
            disabled={!selected.size}
            className='flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-30'
          >
            <Send size={14} /> Forward
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForwardModal;
