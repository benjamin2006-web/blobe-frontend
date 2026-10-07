import axios from 'axios';
import {
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCircle,
  Database,
  Edit2,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  MessageCircle,
  Palette,
  Shield,
  Trash2,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import 'react-phone-number-input/style.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import useNotifications from '../hooks/useNotifications';
import {
  DEFAULT_WALLPAPER_DESKTOP,
  WALLPAPER_OPTIONS,
  useWallpaper,
} from '../hooks/useWallpaper';
import { API_URL } from '../utils/apiUrl';
import { uploadAvatar } from '../utils/b2Media';
import AvatarPickerModal, { NONE } from './AvatarPickerModal';
import NotificationsPanel from './ChatSidebar/NotificationsPanel';
import OptimizedImage from './OptimizedImage';
import PhoneCountrySelect from './PhoneCountrySelect';
import ThreeDots from './ThreeDots';
import UserAvatar from './UserAvatar';

// ── Settings persistence (localStorage) ─────────────────────────────────────
const SETTINGS_KEY = 'chatAppSettings';
const DEFAULT = {
  notifications: { messages: true, groups: true, sound: true, typing: true },
  privacy: { readReceipts: true, onlineStatus: true, lastSeen: true },
};
const loadPrefs = () => {
  try {
    return {
      ...DEFAULT,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'),
    };
  } catch {
    return DEFAULT;
  }
};
const savePrefs = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

// ── Shared helpers ───────────────────────────────────────────────────────────
const useApi = (token) =>
  useMemo(
    () =>
      axios.create({
        baseURL: API_URL,
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );

const Toggle = ({ checked, onChange, icon: Icon, label, description, disabled = false }) => (
  <div className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
    disabled ? 'bg-gray-50/60 opacity-70' : 'bg-gray-50 hover:bg-gray-100'
  }`}>
    <div className='flex items-center gap-3'>
      {Icon && (
        <div className='w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center flex-shrink-0'>
          <Icon size={16} className='text-gray-600' />
        </div>
      )}
      <div>
        <p className='text-sm font-semibold text-gray-900'>{label}</p>
        {description && (
          <p className='text-xs text-gray-500 mt-0.5'>{description}</p>
        )}
      </div>
    </div>
    <label className={`relative inline-flex items-center flex-shrink-0 ml-4 ${
      disabled ? 'cursor-wait' : 'cursor-pointer'
    }`}>
      <input
        type='checkbox'
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className='sr-only peer'
      />
      <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-gray-900 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
    </label>
  </div>
);

const SectionTitle = ({ title, subtitle }) => (
  <div className='mb-6'>
    <h2 className='text-xl font-bold text-gray-900'>{title}</h2>
    {subtitle && <p className='text-sm text-gray-500 mt-1'>{subtitle}</p>}
    <div className='h-px bg-gray-200 mt-4' />
  </div>
);

const Flash = ({ type, text }) => (
  <div
    className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
      type === 'success'
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-red-50 text-red-700 border border-red-200'
    }`}
  >
    {type === 'success' ? <Check size={14} /> : <X size={14} />}
    {text}
  </div>
);

// ── Account tab ──────────────────────────────────────────────────────────────
const AccountTab = ({ user, token, updateUser }) => {
  const api = useApi(token);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  const avatarPreviewUrlRef = useRef(null);
  const [username, setUsername] = useState(user?.username || '');
  const [editingUsername, setEditingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [editingEmail, setEditingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [phone, setPhone] = useState(user?.phone || undefined);
  const [editingPhone, setEditingPhone] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [bio, setBio] = useState(user?.bio || '');
  const [editingBio, setEditingBio] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [flash, setFlash] = useState(null);

  const setFlashMsg = (type, text) => {
    setFlash({ type, text });
    setTimeout(() => setFlash(null), 3000);
  };

  useEffect(
    () => () => {
      if (avatarPreviewUrlRef.current) {
        URL.revokeObjectURL(avatarPreviewUrlRef.current);
      }
    },
    [],
  );

  const closeAvatarPicker = () => {
    if (avatarPreviewUrlRef.current) {
      URL.revokeObjectURL(avatarPreviewUrlRef.current);
      avatarPreviewUrlRef.current = null;
    }
    setSelectedAvatarFile(null);
    setShowPicker(false);
  };

  const handleSaveAvatar = async (selection, crop) => {
    setSavingAvatar(true);
    try {
      const clear = selection === NONE || selection === '';
      const uploaded = clear ? null : await uploadAvatar(selection, token, undefined, crop);
      const avatar = uploaded?.ref || '';
      const response = await api.put('/users/profile', { avatar });
      updateUser({
        avatar: response.data.user?.avatar || avatar,
        avatarFull: response.data.user?.avatarFull || '',
        avatarThumbnail: response.data.user?.avatarThumbnail || '',
      });
      closeAvatarPicker();
      setFlashMsg('success', clear ? 'Avatar removed.' : 'Avatar saved!');
      window.location.reload();
    } catch (error) {
      if (error.response?.data?.profileUpdated) {
        updateUser({ avatar: '', avatarFull: '', avatarThumbnail: '' });
        setFlashMsg('error', error.response.data.message);
        window.setTimeout(() => window.location.reload(), 1500);
        return;
      }
      setFlashMsg('error', 'Failed to save avatar');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFlashMsg('error', 'Please choose an image file.');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setFlashMsg('error', 'Choose an image smaller than 40 MB.');
      return;
    }
    if (avatarPreviewUrlRef.current) {
      URL.revokeObjectURL(avatarPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    avatarPreviewUrlRef.current = previewUrl;
    setSelectedAvatarFile({ file, previewUrl });
    setShowPicker(true);
  };

  const handleSaveUsername = async () => {
    if (!username.trim() || username === user?.username) {
      setEditingUsername(false);
      return;
    }
    setSavingUsername(true);
    try {
      const res = await api.put('/users/profile', {
        username: username.trim(),
      });
      updateUser({ username: res.data.user?.username || username.trim() });
      setEditingUsername(false);
      setFlashMsg('success', 'Username updated!');
      window.location.reload();
    } catch (err) {
      setFlashMsg('error', err.response?.data?.message || 'Failed to update');
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSaveEmail = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || trimmedEmail === user?.email) {
      setEditingEmail(false);
      setEmail(user?.email || '');
      return;
    }
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!validEmail) {
      setFlashMsg('error', 'Enter a valid email address.');
      return;
    }
    setSavingEmail(true);
    try {
      const response = await api.put('/users/profile', { email: trimmedEmail });
      const savedEmail = response.data.user?.email || trimmedEmail;
      const status = response.data.user?.emailVerificationStatus || 'waiting_for_verification';
      updateUser({ email: savedEmail, emailVerificationStatus: status });
      setEmail(savedEmail);
      setEditingEmail(false);
      setFlashMsg('success', 'Email updated. Waiting for verification.');
      window.location.reload();
    } catch (error) {
      setFlashMsg('error', error.response?.data?.message || 'Failed to update email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePhone = async () => {
    if (!phone || phone === user?.phone) {
      setEditingPhone(false);
      setPhone(user?.phone || undefined);
      return;
    }
    let isValidPhoneNumber;
    try {
      ({ isValidPhoneNumber } = await import('libphonenumber-js/max'));
    } catch (error) {
      console.error('Unable to load strict phone validation metadata.', error);
      setFlashMsg('error', 'Unable to validate the phone number right now. Please try again.');
      return;
    }
    if (!isValidPhoneNumber(phone)) {
      setFlashMsg('error', 'Enter a valid phone number, including its country code.');
      return;
    }
    setSavingPhone(true);
    try {
      const response = await api.put('/users/profile', { phone });
      const savedPhone = response.data.user?.phone || phone;
      const status = response.data.user?.phoneVerificationStatus || 'waiting_for_verification';
      updateUser({ phone: savedPhone, phoneVerificationStatus: status });
      setPhone(savedPhone);
      setEditingPhone(false);
      setFlashMsg('success', 'Telephone number updated. Waiting for verification.');
      window.location.reload();
    } catch (error) {
      setFlashMsg('error', error.response?.data?.message || 'Failed to update telephone number.');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      await api.put('/users/profile', { bio: bio.trim() });
      updateUser({ bio: bio.trim() });
      setEditingBio(false);
      setFlashMsg('success', 'Notes saved!');
      window.location.reload();
    } catch {
      setFlashMsg('error', 'Failed to save notes');
    } finally {
      setSavingBio(false);
    }
  };

  return (
    <div className='space-y-5'>
      <SectionTitle
        title='My Account'
        subtitle='Manage your profile picture, username, and account'
      />

      {flash && <Flash {...flash} />}

      {/* Avatar */}
      <div className='bg-gray-50 rounded-2xl p-5'>
        <p className='text-xs font-bold text-gray-500 uppercase tracking-wider mb-4'>
          Profile Picture
        </p>
        <div className='flex items-center gap-5'>
          <input
            ref={avatarInputRef}
            type='file'
            accept='image/*'
            onChange={handleAvatarFileChange}
            className='hidden'
          />
          <button
            type='button'
            onClick={() => avatarInputRef.current?.click()}
            disabled={savingAvatar}
            aria-label='Choose a profile picture'
            className='relative group flex-shrink-0 focus:outline-none'
          >
            <UserAvatar
              user={user}
              alt='avatar'
              className='w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md'
            />
            <div className='absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'>
              <Camera size={18} className='text-white' />
            </div>
          </button>
          <div className='space-y-2.5'>
            <div>
              <p className='text-sm font-semibold text-gray-800'>
                Upload a profile picture
              </p>
              <p className='text-xs text-gray-500'>
                Your picture is securely stored on Backblaze B2.
              </p>
            </div>
            <div className='flex gap-2'>
              {user?.avatar && (
                <button
                  onClick={() => handleSaveAvatar(NONE)}
                  disabled={savingAvatar}
                  className='flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50'
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile info */}
      <div className='bg-gray-50 rounded-2xl p-5 space-y-4'>
        <p className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
          Profile Info
        </p>

        {/* Username */}
        <div>
          <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
            Username
          </label>
          {editingUsername ? (
            <div className='flex gap-2 mt-1.5'>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveUsername();
                  if (e.key === 'Escape') {
                    setEditingUsername(false);
                    setUsername(user?.username || '');
                  }
                }}
                className='flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
                autoFocus
              />
              <button
                onClick={handleSaveUsername}
                disabled={savingUsername}
                className='px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors'
              >
                {savingUsername ? (
                  <ThreeDots size='xs' className='text-current' />
                ) : (
                  <Check size={13} />
                )}
                Save
              </button>
              <button
                onClick={() => {
                  setEditingUsername(false);
                  setUsername(user?.username || '');
                }}
                className='px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-xl transition-colors'
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className='flex items-center justify-between mt-1.5 p-3 bg-white border border-gray-200 rounded-xl'>
              <span className='text-sm font-medium text-gray-900'>
                {user?.username}
              </span>
              <button
                onClick={() => setEditingUsername(true)}
                className='flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-semibold transition-colors'
              >
                <Edit2 size={12} /> Edit
              </button>
            </div>
          )}
        </div>

        {/* Email */}
        <div>
          <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
            Email
          </label>
          {editingEmail ? (
            <div className='mt-1.5 space-y-2'>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEmail();
                  if (e.key === 'Escape') {
                    setEditingEmail(false);
                    setEmail(user?.email || '');
                  }
                }}
                className='w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20'
                autoFocus
              />
              <div className='flex justify-end gap-2'>
                <button
                  type='button'
                  onClick={() => {
                    setEditingEmail(false);
                    setEmail(user?.email || '');
                  }}
                  className='rounded-lg px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={handleSaveEmail}
                  disabled={savingEmail || !email.trim()}
                  className='flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-gray-700 disabled:opacity-50'
                >
                  {savingEmail ? <ThreeDots size='xs' className='text-current' /> : <Check size={11} />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className='mt-1.5 flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3'>
              <div className='min-w-0'>
                <span className='block truncate text-sm text-gray-700'>{user?.email || 'Not set'}</span>
                {user?.emailVerificationStatus === 'waiting_for_verification' && (
                  <span className='mt-1 block text-xs text-amber-600'>Waiting for verification.</span>
                )}
              </div>
              <button
                type='button'
                onClick={() => {
                  setEmail(user?.email || '');
                  setEditingEmail(true);
                }}
                className='ml-3 flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-gray-500 transition-colors hover:text-gray-800'
              >
                <Edit2 size={12} /> Edit
              </button>
            </div>
          )}
        </div>

        {/* Telephone */}
        <div>
          <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
            Telephone number
          </label>
          {editingPhone ? (
            <div className='mt-1.5 space-y-2'>
              <div className='account-phone-field min-w-0 overflow-visible rounded-xl border transition focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/20'>
                <PhoneInput
                  international
                  defaultCountry={parsePhoneNumberFromString(phone || '')?.country}
                  flags={flags}
                  countrySelectComponent={PhoneCountrySelect}
                  placeholder='Enter telephone number'
                  value={phone}
                  onChange={setPhone}
                  inputComponent='input'
                  className='account-phone-input'
                />
              </div>
              <div className='flex justify-end gap-2'>
                <button
                  type='button'
                  onClick={() => {
                    setEditingPhone(false);
                    setPhone(user?.phone || undefined);
                  }}
                  className='rounded-lg px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={handleSavePhone}
                  disabled={savingPhone || !phone}
                  className='flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-gray-700 disabled:opacity-50'
                >
                  {savingPhone ? <ThreeDots size='xs' className='text-current' /> : <Check size={11} />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className='mt-1.5 flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3'>
              <div className='min-w-0'>
                <span className='block truncate text-sm text-gray-700'>{user?.phone || 'Not set'}</span>
                {user?.phoneVerificationStatus === 'waiting_for_verification' && (
                  <span className='mt-1 block text-xs text-amber-600'>Waiting for verification.</span>
                )}
              </div>
              <button
                type='button'
                onClick={() => {
                  setPhone(user?.phone || undefined);
                  setEditingPhone(true);
                }}
                className='ml-3 flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-gray-500 transition-colors hover:text-gray-800'
              >
                <Edit2 size={12} /> Edit
              </button>
            </div>
          )}
          <p className='mt-1.5 text-xs text-gray-400'>
            Your telephone number is private and only used for your account.
          </p>
        </div>

        {/* Joined */}
        <div>
          <label className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
            Member Since
          </label>
          <div className='mt-1.5 p-3 bg-white border border-gray-100 rounded-xl text-sm text-gray-700'>
            {user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : '—'}
          </div>
        </div>
      </div>

      {/* Bio / Personal Notes */}
      <div className='bg-gray-50 rounded-2xl p-5'>
        <div className='flex items-center justify-between mb-3'>
          <div>
            <p className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
              Bio / Notes
            </p>
            <p className='text-xs text-gray-400 mt-0.5'>
              A short note about yourself — visible to you in settings
            </p>
          </div>
          {!editingBio && (
            <button
              onClick={() => setEditingBio(true)}
              className='flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-semibold transition-colors'
            >
              <Edit2 size={12} /> {bio ? 'Edit' : 'Add'}
            </button>
          )}
        </div>

        {editingBio ? (
          <div className='space-y-2'>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={4}
              placeholder='Write something about yourself — your role, interests, or a personal note…'
              className='w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'
              autoFocus
            />
            <div className='flex items-center justify-between'>
              <span className='text-xs text-gray-400'>{bio.length}/200</span>
              <div className='flex gap-2'>
                <button
                  onClick={() => {
                    setEditingBio(false);
                    setBio(user?.bio || '');
                  }}
                  className='px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors'
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBio}
                  disabled={savingBio}
                  className='flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors'
                >
                  {savingBio ? (
                    <ThreeDots size='xs' className='text-current' />
                  ) : (
                    <Check size={11} />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setEditingBio(true)}
            className='min-h-[60px] p-3 bg-white border border-dashed border-gray-300 rounded-xl cursor-text hover:border-gray-400 transition-colors'
          >
            {bio ? (
              <p className='text-sm text-gray-800 leading-relaxed whitespace-pre-wrap'>
                {bio}
              </p>
            ) : (
              <p className='text-sm text-gray-400 italic'>
                Click to add a bio or personal note…
              </p>
            )}
          </div>
        )}
      </div>


      {showPicker && (
        <AvatarPickerModal
          selectedFile={selectedAvatarFile?.file}
          previewUrl={selectedAvatarFile?.previewUrl}
          onClose={closeAvatarPicker}
          onSave={handleSaveAvatar}
          saving={savingAvatar}
        />
      )}
    </div>
  );
};

// ── Notifications tab ────────────────────────────────────────────────────────
const NotificationsTab = ({
  notifications,
  onMarkAllRead,
  onClearAll,
  onRead,
  onOpenGroup,
}) => {
  const { permission, requestPermission } = useNotifications();
  const [prefs, setPrefs] = useState(() => loadPrefs().notifications);
  const [permissionError, setPermissionError] = useState('');

  const update = (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    savePrefs({ ...loadPrefs(), notifications: next });
    window.location.reload();
  };

  const enableBrowserNotifications = async () => {
    setPermissionError('');
    try {
      await requestPermission();
      window.location.reload();
    } catch (error) {
      console.error('Could not enable browser notifications:', error);
      setPermissionError('Could not update browser notification permission.');
    }
  };

  return (
    <div className='space-y-5'>
      <SectionTitle
        title='Notifications'
        subtitle='Review activity and control how you receive alerts'
      />

      <div className='h-[340px] min-h-[240px] max-h-[45vh] overflow-hidden rounded-2xl border border-gray-700 bg-gray-900'>
        <NotificationsPanel
          notifications={notifications}
          onMarkAllRead={onMarkAllRead}
          onClearAll={onClearAll}
          onRead={onRead}
          onOpenGroup={onOpenGroup}
        />
      </div>

      {/* Browser permission */}
      {permission !== 'denied' && (
      <div
        className={`rounded-2xl p-5 border ${permission === 'granted' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}
      >
        <div className='flex items-center gap-4'>
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${permission === 'granted' ? 'bg-green-100' : 'bg-blue-100'}`}
          >
            {permission === 'granted' ? (
              <Bell size={20} className='text-green-600' />
            ) : (
              <BellOff size={20} className='text-blue-500' />
            )}
          </div>
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-bold text-gray-900'>
              {permission === 'granted'
                ? 'Browser notifications active'
                : 'Enable browser notifications'}
            </p>
            <p className='text-xs text-gray-500 mt-0.5'>
              {permission === 'granted'
                ? 'You receive alerts when the tab is not focused.'
                : "Get pinged when messages arrive while you're away."}
            </p>
          </div>
          {permission === 'default' && (
            <button
              onClick={enableBrowserNotifications}
              className='px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors flex-shrink-0'
            >
              Enable
            </button>
          )}
          {permission === 'granted' && (
            <span className='px-3 py-1 bg-green-200 text-green-800 text-xs font-bold rounded-full flex-shrink-0'>
              Active
            </span>
          )}
        </div>
      </div>
      )}
      {permissionError && (
        <p role='alert' className='text-sm text-red-600'>{permissionError}</p>
      )}

      <div className='space-y-2'>
        <Toggle
          checked={prefs.messages}
          onChange={() => update('messages')}
          icon={MessageCircle}
          label='Message Notifications'
          description='Browser alert for new direct messages'
        />
        <Toggle
          checked={prefs.groups}
          onChange={() => update('groups')}
          icon={Users}
          label='Group Notifications'
          description='Browser alert for new group messages'
        />
        <Toggle
          checked={prefs.sound}
          onChange={() => update('sound')}
          icon={Volume2}
          label='Sound Effects'
          description='Play a sound when messages arrive'
        />
        <Toggle
          checked={prefs.typing}
          onChange={() => update('typing')}
          icon={Eye}
          label='Typing Indicators'
          description='See animated dots when someone is typing'
        />
      </div>
    </div>
  );
};

// ── Privacy tab ──────────────────────────────────────────────────────────────
const PrivacyTab = ({ user, token, updateUser }) => {
  const api = useApi(token);
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(() => ({
    ...DEFAULT.privacy,
    ...loadPrefs().privacy,
    ...user?.privacySettings,
  }));
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = async (key) => {
    if (saving) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setSaveError('');
    try {
      const response = await api.put('/users/profile', { privacySettings: next });
      const savedSettings = response.data.user?.privacySettings || next;
      setPrefs({ ...DEFAULT.privacy, ...savedSettings });
      updateUser({ privacySettings: savedSettings });
      setSavedAt(Date.now());
      window.location.reload();
    } catch (error) {
      setPrefs(previous);
      setSaveError(error.response?.data?.message || 'Could not save privacy settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='space-y-5'>
      <SectionTitle
        title='Privacy & Security'
        subtitle='Control who can see your information and activity'
      />

      {savedAt && (
        <div className='px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2'>
          <CheckCircle size={14} /> Privacy settings saved
        </div>
      )}
      {saveError && (
        <div role='alert' className='rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700'>
          {saveError}
        </div>
      )}

      <div className='space-y-2'>
        <Toggle
          checked={prefs.readReceipts}
          onChange={() => update('readReceipts')}
          disabled={saving}
          icon={Eye}
          label='Read Receipts'
          description="Let others see when you've read their messages"
        />
        <Toggle
          checked={prefs.onlineStatus}
          onChange={() => update('onlineStatus')}
          disabled={saving}
          icon={Eye}
          label='Online Status'
          description='Show your online presence to other users'
        />
        <Toggle
          checked={prefs.lastSeen}
          onChange={() => update('lastSeen')}
          disabled={saving}
          icon={EyeOff}
          label='Last Seen'
          description='Show when you were last active'
        />
      </div>

      <div className='bg-gray-50 rounded-2xl p-5'>
        <p className='text-xs font-bold text-gray-500 uppercase tracking-wider mb-3'>
          Data Management
        </p>
        <div className='space-y-2'>
          <button className='w-full flex items-center justify-between p-3.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left'>
            <div className='flex items-center gap-3'>
              <Database size={16} className='text-gray-500' />
              <div>
                <p className='text-sm font-semibold text-gray-800'>
                  Download My Data
                </p>
                <p className='text-xs text-gray-400'>
                  Export all your messages and profile data
                </p>
              </div>
            </div>
            <span className='text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium'>
              Soon
            </span>
          </button>
          <button
            type='button'
            onClick={() => navigate('/forgot-password')}
            className='w-full flex items-center justify-between p-3.5 bg-white border border-gray-200 rounded-xl hover:bg-red-50 hover:border-red-200 transition-colors text-left group'
          >
            <div className='flex items-center gap-3'>
              <Lock
                size={16}
                className='text-gray-500 group-hover:text-red-500 transition-colors'
              />
              <div>
                <p className='text-sm font-semibold text-gray-800 group-hover:text-red-700 transition-colors'>
                  Change Password
                </p>
                <p className='text-xs text-gray-400'>
                  Update your account password
                </p>
              </div>
            </div>
            <span className='text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium group-hover:bg-red-100 group-hover:text-red-500 transition-colors'>
              Change
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ── People tab ───────────────────────────────────────────────────────────────
const PeopleTab = ({ token }) => {
  const api = useApi(token);
  const [subTab, setSubTab] = useState('blocked');
  const [blocked, setBlocked] = useState([]);
  const [muted, setMuted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [b, m] = await Promise.all([
          api.get('/users/blocked/list'),
          api.get('/users/muted/list'),
        ]);
        setBlocked(b.data.blockedUsers || []);
        setMuted(m.data.mutedUsers || []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const handleUnblock = async (uid) => {
    setActionId(uid);
    try {
      await api.post(`/users/${uid}/unblock`);
      setBlocked((p) => p.filter((u) => u._id !== uid));
    } catch {
      alert('Failed to unblock');
    } finally {
      setActionId(null);
    }
  };

  const handleUnmute = async (uid) => {
    setActionId(uid);
    try {
      await api.post(`/users/${uid}/unmute`);
      setMuted((p) => p.filter((u) => u._id !== uid));
    } catch {
      alert('Failed to unmute');
    } finally {
      setActionId(null);
    }
  };

  const list = subTab === 'blocked' ? blocked : muted;

  return (
    <div className='space-y-5'>
      <SectionTitle
        title='People'
        subtitle='Manage users you have blocked or muted'
      />

      <div className='flex gap-1 bg-gray-100 p-1 rounded-xl'>
        {[
          {
            id: 'blocked',
            icon: Ban,
            label: 'Blocked',
            count: blocked.length,
            color: 'text-red-600 bg-red-100',
          },
          {
            id: 'muted',
            icon: VolumeX,
            label: 'Muted',
            count: muted.length,
            color: 'text-orange-600 bg-orange-100',
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${subTab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <t.icon size={14} />
            {t.label}
            {t.count > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${t.color}`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className='flex items-center justify-center py-16'>
          <ThreeDots size='lg' className='text-gray-400' />
        </div>
      ) : list.length === 0 ? (
        <div className='text-center py-12 bg-gray-50 rounded-2xl'>
          {subTab === 'blocked' ? (
            <Ban size={36} className='mx-auto text-gray-300 mb-3' />
          ) : (
            <VolumeX size={36} className='mx-auto text-gray-300 mb-3' />
          )}
          <p className='text-sm font-semibold text-gray-500'>
            No {subTab} users
          </p>
          <p className='text-xs text-gray-400 mt-1'>
            Users you{' '}
            {subTab === 'blocked' ? 'block in chats' : 'mute in chats'} will
            appear here
          </p>
        </div>
      ) : (
        <div className='space-y-2'>
          {list.map((u) => (
            <div
              key={u._id}
              className='flex items-center gap-3 p-3.5 bg-gray-50 border border-gray-100 rounded-xl hover:bg-gray-100 transition-colors'
            >
              <UserAvatar
                user={u}
                alt={u.username}
                className='w-10 h-10 rounded-full object-cover flex-shrink-0'
              />
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-bold text-gray-900 truncate'>
                  {u.username}
                </p>
                <p className='text-xs text-gray-400 truncate'>{u.email}</p>
              </div>
              <button
                onClick={() =>
                  subTab === 'blocked'
                    ? handleUnblock(u._id)
                    : handleUnmute(u._id)
                }
                disabled={actionId === u._id}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 flex-shrink-0 ${
                  subTab === 'blocked'
                    ? 'bg-white border-green-200 text-green-700 hover:bg-green-50'
                    : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
                }`}
              >
                {actionId === u._id ? (
                  <ThreeDots size='xs' className='text-current' />
                ) : (
                  <Check size={12} />
                )}
                {subTab === 'blocked' ? 'Unblock' : 'Unmute'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Appearance (wallpaper) tab ───────────────────────────────────────────────
const WALLPAPERS = [
  {
    id: 'automatic',
    label: 'Device default',
    url: null,
    preview: DEFAULT_WALLPAPER_DESKTOP,
  },
  ...WALLPAPER_OPTIONS,
];

const AppearanceTab = () => {
  const { wallpaper, setWallpaper } = useWallpaper();

  return (
    <div className='space-y-5'>
      <SectionTitle
        title='Appearance'
        subtitle='Personalise your chat window background'
      />

      {/* Live preview */}
      <div className='rounded-2xl overflow-hidden border border-gray-200 shadow-sm'>
        <div
          className='h-40 bg-gray-100 relative flex flex-col justify-end'
          style={{
            backgroundImage: `url("${wallpaper || DEFAULT_WALLPAPER_DESKTOP}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Sample bubbles */}
          <div className='p-3 space-y-2'>
            <div className='flex justify-start'>
              <div className='bg-gray-700 text-white text-xs px-3 py-1.5 rounded-2xl rounded-bl-sm max-w-[60%] shadow'>
                Hey! How are you?
              </div>
            </div>
            <div className='flex justify-end'>
              <div className='bg-blue-500 text-white text-xs px-3 py-1.5 rounded-2xl rounded-br-sm max-w-[60%] shadow'>
                Doing great, thanks!
              </div>
            </div>
          </div>
        </div>
        <div className='px-4 py-2 bg-white border-t border-gray-100'>
          <p className='text-xs text-gray-400 text-center'>
            {wallpaper
              ? 'Selected wallpaper applied on all screen sizes'
              : 'Device default applied (desktop or mobile)'}
          </p>
        </div>
      </div>

      {/* Wallpaper grid */}
      <div>
        <p className='text-xs font-bold text-gray-500 uppercase tracking-wider mb-3'>
          Choose Wallpaper
        </p>
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
          {WALLPAPERS.map((wp) => {
            const isSelected = (wallpaper || null) === wp.url;
            return (
              <button
                key={wp.id}
                onClick={() => setWallpaper(wp.url)}
                className={`relative rounded-2xl overflow-hidden border-2 transition-all aspect-video focus:outline-none ${
                  isSelected
                    ? 'border-gray-900 shadow-lg scale-[1.02]'
                    : 'border-gray-200 hover:border-gray-400 hover:shadow-md'
                }`}
              >
                {wp.preview ? (
                  <OptimizedImage
                    src={wp.preview}
                    alt={wp.label}
                    className='w-full h-full object-cover'
                    loading='lazy'
                  />
                ) : (
                  /* None tile */
                  <div className='w-full h-full bg-white flex items-center justify-center'>
                    <div className='text-center'>
                      <div className='w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-1'>
                        <X size={14} className='text-gray-400' />
                      </div>
                      <span className='text-xs text-gray-400 font-medium'>
                        None
                      </span>
                    </div>
                  </div>
                )}

                {/* Selected badge */}
                {isSelected && (
                  <div className='absolute top-2 right-2 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center shadow-md'>
                    <Check size={13} className='text-white' />
                  </div>
                )}

                {/* Label */}
                <div className='absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent py-1.5 px-2'>
                  <p className='text-white text-xs font-semibold truncate'>
                    {wp.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Navigation tabs config ───────────────────────────────────────────────────
const TABS = [
  { id: 'account', label: 'My Account', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  { id: 'people', label: 'People', icon: Users },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

const getTabTitle = (tabId) =>
  TABS.find((tab) => tab.id === tabId)?.label || 'Settings';

// ── Root component ───────────────────────────────────────────────────────────
const SettingsModal = ({
  onClose,
  initialTab = 'account',
  onLogout,
  notifications = [],
  onMarkAllNotificationsRead,
  onClearAllNotifications,
  onNotificationRead,
  onOpenNotificationGroup,
}) => {
  const { user, token, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);

  // Close on Escape
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return <AccountTab user={user} token={token} updateUser={updateUser} />;
      case 'notifications':
        return (
          <NotificationsTab
            notifications={notifications}
            onMarkAllRead={onMarkAllNotificationsRead}
            onClearAll={onClearAllNotifications}
            onRead={onNotificationRead}
            onOpenGroup={onOpenNotificationGroup}
          />
        );
      case 'privacy':
        return <PrivacyTab user={user} token={token} updateUser={updateUser} />;
      case 'people':
        return <PeopleTab token={token} />;
      case 'appearance':
        return <AppearanceTab />;
      default:
        return null;
    }
  };

  return (
    <div className='fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-4'>
      {/* Backdrop — tap outside to close on desktop */}
      <div
        className='absolute inset-0 bg-black/70 backdrop-blur-sm'
        onClick={onClose}
      />

      {/* Modal: mobile bottom sheet, desktop centered settings card. */}
      <div className='settings-modal-dark relative flex flex-col md:flex-row w-full md:max-w-4xl h-[92dvh] md:h-[88vh] rounded-t-[28px] md:rounded-2xl shadow-2xl overflow-hidden'>
        {/* ── MOBILE: compact sheet header ── */}
        <div className='relative flex flex-col items-center bg-gray-900 px-5 py-4 text-center border-b border-white/10 flex-shrink-0 md:hidden'>
          <UserAvatar
            user={user}
            alt='avatar'
            className='w-16 h-16 rounded-full object-cover ring-2 ring-white/10 shadow-lg shadow-black/30'
          />
          <div className='mt-2 min-w-0 max-w-full'>
            <p className='text-base font-bold text-white truncate'>{user?.username}</p>
            <p className='mt-0.5 text-xs text-gray-400 truncate'>{getTabTitle(activeTab)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label='Close settings'
            className='absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white'
          >
            <X size={19} />
          </button>
        </div>

        {/* ── DESKTOP: left sidebar nav ── */}
        <div className='hidden md:flex w-56 bg-gray-900 flex-col flex-shrink-0'>
          <div className='p-4 border-b border-gray-800'>
            <div className='min-w-0'>
              <p className='text-sm font-bold text-white truncate'>
                {user?.username}
              </p>
              <p className='text-xs text-gray-400 truncate'>{user?.email}</p>
            </div>
          </div>

          <nav className='flex-1 overflow-y-auto min-h-0 p-3 space-y-0.5'>
            <p className='text-xs font-bold text-gray-600 uppercase tracking-wider px-3 py-2'>
              User Settings
            </p>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                  activeTab === tab.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                }`}
              >
                <tab.icon size={16} className='flex-shrink-0' />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className='p-3 border-t border-gray-800'>
            <button
              onClick={() => {
                if (confirm('Log out of Blobe?')) {
                  onClose();
                  onLogout();
                }
              }}
              className='w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-all'
            >
              <LogOut size={16} className='flex-shrink-0' /> Log Out
            </button>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className='flex-1 flex flex-col overflow-hidden settings-modal-content'>
          <div className='hidden md:flex justify-end px-4 md:px-6 pt-3 pb-0 flex-shrink-0'>
            <button
              onClick={onClose}
              className='w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors'
              title='Close (Esc)'
            >
              <X size={16} className='text-gray-600' />
            </button>
          </div>
          <div className='flex-1 overflow-y-auto min-h-0 px-4 md:px-8 py-4 md:py-6'>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
