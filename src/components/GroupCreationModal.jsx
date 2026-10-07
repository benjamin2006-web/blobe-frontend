import { ArrowLeft, ArrowRight, Check, Search, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ThreeDots from './ThreeDots';

// Deterministic color based on user id
const AVATAR_COLORS = [
  'bg-slate-600', 'bg-zinc-600', 'bg-emerald-800', 'bg-teal-800',
  'bg-sky-800', 'bg-indigo-800', 'bg-violet-800', 'bg-lime-800'
];
const avatarColor = (id) => AVATAR_COLORS[(id?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

const GroupAvatar = ({ name, size = 'lg' }) => {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-20 h-20 text-3xl' };
  const initial = name?.trim()?.[0]?.toUpperCase();
  return (
    <div className={`flex items-center justify-center rounded-full ${sizes[size]} bg-white/10 text-white font-bold flex-shrink-0`}>
      {initial || <Users size={size === 'lg' ? 30 : 16} className="text-gray-400" />}
    </div>
  );
};

const GroupCreationModal = ({ users, onClose, onCreate }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    if (step === 0) nameRef.current?.focus();
  }, [step]);

  const filtered = useMemo(
    () => users.filter(u => u.username.toLowerCase().includes(search.toLowerCase())),
    [users, search]
  );

  const selectedUsers = useMemo(
    () => users.filter(u => selected.has(u._id)),
    [users, selected]
  );

  const toggleUser = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleNext = () => {
    setError('');
    if (step === 0) {
      if (!name.trim()) { setError('Please enter a group name'); return; }
      if (name.trim().length < 2) { setError('Name must be at least 2 characters'); return; }
    }
    if (step === 1 && selected.size === 0) {
      setError('Please add at least one member');
      return;
    }
    setStep(s => s + 1);
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      await onCreate({ name: name.trim(), description: description.trim(), memberIds: [...selected] });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = ['Name your group', 'Add members', 'Review & create'];
  const stepSubtitles = [
    'Give your group a name and optional description',
    `Select who to add (${selected.size} selected)`,
    'Everything looks good? Create the group!'
  ];

  // ---- UI only below this line ----
  const field =
    'w-full rounded-xl bg-white/[0.06] px-4 py-3 text-base text-white placeholder-gray-500 outline-none ring-0 transition-colors focus:bg-white/[0.1] focus:outline-none focus:ring-0 md:text-sm';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — bottom sheet on mobile, centered card on desktop */}
      <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-gradient-to-br from-[#0d0d0f] via-[#0a0a0c] to-black text-white animate-fade-in md:max-h-[85dvh] md:max-w-md md:rounded-3xl">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2.5 md:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-5 pb-4 pt-3 md:px-6 md:pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Users size={24} strokeWidth={2.6} className="flex-shrink-0 text-white" />
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold leading-tight text-white">{stepTitles[step]}</h2>
                <p className="mt-0.5 text-xs leading-snug text-gray-400">{stepSubtitles[step]}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="group flex h-9 w-9 flex-shrink-0 items-center justify-center text-gray-400 outline-none transition-colors duration-200 hover:text-white focus:outline-none"
            >
              <X size={20} strokeWidth={2.8} className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-90 group-hover:scale-125 group-active:rotate-180 group-active:scale-75" />
            </button>
          </div>
          {/* Step progress */}
          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-white' : 'bg-white/15'}`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4 md:px-6">

          {/* Step 0 – Name & Description */}
          {step === 0 && (
            <div className="flex-1 space-y-5 pt-2">
              <div className="flex justify-center">
                <GroupAvatar name={name} size="lg" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-300">
                  Group name <span className="text-gray-500">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNext()}
                    maxLength={50}
                    placeholder="e.g. Design Team, Family Group..."
                    className={`${field} pr-16`}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">{name.length}/50</span>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-300">
                  Description <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder="What's this group about?"
                  className={`${field} resize-none`}
                />
                <div className="mt-1 text-right text-xs text-gray-500">{description.length}/200</div>
              </div>
            </div>
          )}

          {/* Step 1 – Member Selection */}
          {step === 1 && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
              {/* Selected chips */}
              {selected.size > 0 && (
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-white/[0.05] p-2">
                  {selectedUsers.map(u => (
                    <button
                      type="button"
                      key={u._id}
                      onClick={() => toggleUser(u._id)}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white outline-none transition-colors hover:bg-white/20 focus:outline-none"
                    >
                      <span>{u.username}</span>
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search people..."
                  className={`${field} pl-10`}
                />
              </div>

              {/* User list */}
              <div className="max-h-[40dvh] min-h-[10rem] flex-1 space-y-1 overflow-y-auto md:max-h-64">
                {filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No users found</p>
                ) : (
                  filtered.map(u => {
                    const isSelected = selected.has(u._id);
                    return (
                      <button
                        type="button"
                        key={u._id}
                        onClick={() => toggleUser(u._id)}
                        className={`flex w-full items-center gap-3 rounded-xl p-2.5 outline-none transition-colors focus:outline-none ${
                          isSelected ? 'bg-white/[0.12]' : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor(u._id)}`}>
                          {u.username[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-medium text-white">{u.username}</p>
                          <p className="truncate text-xs text-gray-400">{u.email}</p>
                        </div>
                        <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                          isSelected ? 'bg-white' : 'bg-white/10'
                        }`}>
                          {isSelected && <Check size={14} strokeWidth={3} className="text-black" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Step 2 – Review */}
          {step === 2 && (
            <div className="flex-1 space-y-5 pt-2">
              {/* Group preview card */}
              <div className="rounded-2xl bg-white/[0.06] p-5 text-white">
                <div className="flex items-center gap-4">
                  <GroupAvatar name={name} size="lg" />
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-bold leading-tight">{name}</h3>
                    {description && <p className="mt-1 line-clamp-2 text-sm text-gray-300">{description}</p>}
                    <p className="mt-2 text-xs text-gray-400">{selected.size + 1} members (including you)</p>
                  </div>
                </div>
              </div>

              {/* Members list */}
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-300">Members</p>
                <div className="max-h-[32dvh] space-y-1.5 overflow-y-auto md:max-h-44">
                  {/* Current user – admin */}
                  <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
                      You
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-white">You</span>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-black">Admin</span>
                  </div>
                  {selectedUsers.map(u => (
                    <div key={u._id} className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5">
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(u._id)}`}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{u.username}</span>
                      </div>
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-gray-300">Member</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-200">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-black/30 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:px-6 md:py-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => { setStep(s => s - 1); setError(''); }}
              className="flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/20 focus:outline-none"
            >
              <ArrowLeft size={16} strokeWidth={2.8} /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/20 focus:outline-none"
            >
              Cancel
            </button>
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-700 px-6 py-3 text-sm font-bold text-white outline-none transition hover:opacity-90 focus:outline-none md:flex-none md:min-w-32"
            >
              Next <ArrowRight size={16} strokeWidth={2.8} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 py-3 text-sm font-bold text-white outline-none transition hover:opacity-90 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:flex-none md:min-w-40"
            >
              {loading ? <ThreeDots size="sm" className="text-white" /> : <Check size={16} strokeWidth={2.8} />}
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupCreationModal;