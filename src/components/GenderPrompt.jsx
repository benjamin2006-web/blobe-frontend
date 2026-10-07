import axios from 'axios';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../utils/apiUrl';
import OptimizedImage from './OptimizedImage';
import UserAvatar from './UserAvatar';

const OPTIONS = [
  { value: 'male', label: 'Male', icon: '/icons/male%20icon.png' },
  { value: 'female', label: 'Female', icon: '/icons/female%20icon.png' },
];

const GenderPrompt = () => {
  const { user, token, updateUser } = useAuth();
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);

  if (!user || user.gender || closed) return null;

  const saveGender = async () => {
    if (!gender || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await axios.put(
        `${API_URL}/users/profile`,
        { gender },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      updateUser({ gender: response.data.user?.gender || gender });
      window.location.reload();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Could not save your choice. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='gender-prompt-backdrop' role='dialog' aria-modal='true' aria-labelledby='gender-prompt-title'>
      <div className='gender-prompt-card'>
        <button
          type='button'
          className='gender-prompt-close'
          onClick={() => setClosed(true)}
          aria-label='Close gender prompt'
        >
          <X size={19} />
        </button>
        <UserAvatar
          user={user}
          className='gender-prompt-avatar'
          alt={`${user.username}'s profile`}
        />
        <p className='gender-prompt-kicker'>Complete your profile</p>
        <h2 id='gender-prompt-title'>How should we describe you?</h2>
        <p className='gender-prompt-copy'>
          Choose an option to personalize your profile. You can change it later in Settings.
        </p>
        <div className='gender-prompt-options'>
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type='button'
              className={`gender-prompt-option ${gender === option.value ? 'is-selected' : ''}`}
              onClick={() => setGender(option.value)}
            >
              <span className='gender-prompt-option-label'>
                <OptimizedImage src={option.icon} alt='' />
                {option.label}
              </span>
              {gender === option.value && <Check size={17} />}
            </button>
          ))}
        </div>
        {error && <p className='gender-prompt-error' role='alert'>{error}</p>}
        <button
          type='button'
          className='gender-prompt-submit'
          onClick={saveGender}
          disabled={!gender || saving}
        >
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
        <button type='button' className='gender-prompt-later' onClick={() => setClosed(true)}>
          Maybe later
        </button>
      </div>
    </div>
  );
};

export default GenderPrompt;
