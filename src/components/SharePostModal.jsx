import {
  Check,
  Link,
  LoaderCircle,
  MessageCircle,
  Search,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { sortUsersByLastMessage } from '../utils/conversationPreview';
import UserAvatar from './UserAvatar';

const SharePostModal = ({
  post,
  users,
  lastMessages,
  loading,
  loadError,
  error,
  notice,
  sending,
  onClose,
  onRetry,
  onSend,
  onCopyLink,
  onSocialShare,
  onNativeShare,
}) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortUsersByLastMessage(
      users.filter((candidate) =>
        String(candidate.username || '').toLowerCase().includes(query),
      ),
      lastMessages,
    );
  }, [users, search, lastMessages]);

  const recentUsers = filteredUsers.filter(
    (candidate) => lastMessages?.[String(candidate._id)]?.timestamp,
  );
  const otherUsers = filteredUsers.filter(
    (candidate) => !lastMessages?.[String(candidate._id)]?.timestamp,
  );

  const toggleUser = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selected.size || sending) return;
    const result = await onSend([...selected]);
    if (result?.failedIds) {
      setSelected(new Set(result.failedIds));
    }
  };

  const renderUsers = (entries) => entries.map((candidate) => {
    const id = String(candidate._id);
    const checked = selected.has(id);
    return (
      <button
        key={id}
        type='button'
        onClick={() => toggleUser(id)}
        disabled={sending}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-60 ${
          checked ? 'bg-emerald-400/[0.08]' : ''
        }`}
      >
        <UserAvatar
          user={candidate}
          alt={candidate.username || 'User'}
          className='h-11 w-11 shrink-0 rounded-full object-cover'
        />
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-semibold text-gray-100'>
            {candidate.username || 'User'}
          </span>
          {candidate.email && (
            <span className='block truncate text-xs text-gray-400'>
              {candidate.email}
            </span>
          )}
        </span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            checked
              ? 'border-emerald-400 bg-emerald-500'
              : 'border-white/25'
          }`}
        >
          {checked && <Check size={11} className='text-white' />}
        </span>
      </button>
    );
  });

  return (
    <div
      className='fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-4'
      role='presentation'
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !sending) onClose();
      }}
    >
      <button
        type='button'
        aria-label='Close share dialog'
        className='absolute inset-0 bg-black/65 backdrop-blur-sm'
        onClick={onClose}
        disabled={sending}
      />
      <section
        role='dialog'
        aria-modal='true'
        aria-labelledby='share-post-title'
        className='relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-gray-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl md:max-w-md md:rounded-2xl'
      >
        <header className='flex shrink-0 items-center justify-between border-b border-white/10 bg-white/[0.04] px-5 py-4'>
          <div>
            <h2 id='share-post-title' className='text-base font-bold text-white'>
              Share post
            </h2>
            <p className='mt-0.5 max-w-[250px] truncate text-xs text-gray-400'>
              From {post.author?.username || 'a user'}
            </p>
          </div>
          <button
            type='button'
            aria-label='Close share dialog'
            onClick={onClose}
            disabled={sending}
            className='flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-gray-300 transition hover:bg-white/20 hover:text-white'
          >
            <X size={16} />
          </button>
        </header>

        <div className='shrink-0 border-b border-white/10 px-4 py-3'>
          <div className='relative'>
            <Search
              size={15}
              className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'
            />
            <input
              type='search'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search people'
              aria-label='Search people to share with'
              className='w-full rounded-xl border border-white/10 bg-white/[0.07] py-2.5 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20'
            />
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto divide-y divide-white/[0.06]'>
          {loading ? (
            <div className='space-y-4 px-4 py-5' role='status' aria-label='Loading people'>
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className='flex items-center gap-3'>
                  <span className='people-skeleton-block h-11 w-11 shrink-0 rounded-full' />
                  <span className='flex-1 space-y-2'>
                    <span className='people-skeleton-block block h-3 w-28 rounded-full' />
                    <span className='people-skeleton-block block h-3 w-40 rounded-full' />
                  </span>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className='px-5 py-10 text-center'>
              <p className='text-sm text-rose-300'>{loadError}</p>
              <button
                type='button'
                onClick={onRetry}
                className='mt-3 text-sm font-semibold text-emerald-400 hover:text-emerald-300'
              >
                Try again
              </button>
            </div>
          ) : filteredUsers.length ? (
            <>
              {recentUsers.length > 0 && (
                <div>
                  <p className='bg-white/[0.03] px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500'>
                    <MessageCircle size={12} className='mr-1.5 inline' />
                    Recent chats
                  </p>
                  {renderUsers(recentUsers)}
                </div>
              )}
              {otherUsers.length > 0 && (
                <div>
                  <p className='bg-white/[0.03] px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500'>
                    People
                  </p>
                  {renderUsers(otherUsers)}
                </div>
              )}
            </>
          ) : (
            <p className='px-5 py-10 text-center text-sm text-gray-400'>
              {search ? `No people found for "${search}"` : 'No people to share with yet.'}
            </p>
          )}
        </div>

        <footer className='shrink-0 border-t border-white/10 bg-white/[0.04] px-4 py-3'>
          <div className='mb-3 grid grid-cols-4 justify-items-center gap-2'>
            <button
              type='button'
              onClick={onCopyLink}
              className='flex flex-col items-center gap-1.5 text-xs text-gray-300 transition hover:text-white'
            >
              <span className='flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.07]'>
                <Link size={17} />
              </span>
              Copy link
            </button>
            <button
              type='button'
              onClick={() => onSocialShare('whatsapp')}
              className='flex flex-col items-center gap-1.5 text-xs text-gray-300 transition hover:text-white'
            >
              <span className='flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm shadow-emerald-950/30 transition hover:brightness-110'>
                <svg aria-hidden='true' viewBox='0 0 24 24' className='h-6 w-6 fill-current'>
                  <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51l-.57-.01c-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.437-9.884 9.89-9.884 2.64.001 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.002 5.45-4.437 9.884-9.887 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c-.001 2.096.547 4.142 1.588 5.946L.057 24l6.305-1.655a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.412z' />
                </svg>
              </span>
              WhatsApp
            </button>
            <button
              type='button'
              onClick={() => onSocialShare('facebook')}
              className='flex flex-col items-center gap-1.5 text-xs text-gray-300 transition hover:text-white'
            >
              <span className='flex h-10 w-10 items-center justify-center rounded-full bg-[#0866FF] text-white shadow-sm shadow-blue-950/30 transition hover:brightness-110'>
                <svg aria-hidden='true' viewBox='0 0 24 24' className='h-6 w-6 fill-current'>
                  <path d='M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.016 4.388 11.017 10.125 11.898v-8.41H7.078v-3.488h3.047V9.41c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.49 0-1.954.93-1.954 1.885v2.26h3.328l-.532 3.488h-2.796v8.41C19.612 23.09 24 18.089 24 12.073' />
                </svg>
              </span>
              Facebook
            </button>
            {onNativeShare && (
              <button
                type='button'
                onClick={onNativeShare}
                className='flex flex-col items-center gap-1.5 text-xs text-gray-300 transition hover:text-white'
              >
                <span className='flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.07]'>
                  <Share2 size={17} />
                </span>
                More options
              </button>
            )}
          </div>
          {error && !loading && (
            <p role='alert' className='mb-2 text-center text-xs text-rose-300'>
              {error}
            </p>
          )}
          {notice && !error && (
            <p role='status' className='mb-2 text-center text-xs text-emerald-300'>
              {notice}
            </p>
          )}
          <div className='flex items-center justify-between gap-3'>
            <span className='text-xs text-gray-400'>
              {selected.size ? `${selected.size} selected` : 'Select people'}
            </span>
            <button
              type='button'
              onClick={handleSend}
              disabled={!selected.size || loading || Boolean(loadError) || sending}
              className='flex min-w-24 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40'
            >
              {sending ? (
                <LoaderCircle size={15} className='animate-spin' />
              ) : (
                <Send size={15} />
              )}
              Send
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default SharePostModal;
