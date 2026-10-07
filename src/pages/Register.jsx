import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Loader2,
  CheckCircle2,
  Camera,
} from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import { getCountries } from 'libphonenumber-js';
import 'react-phone-number-input/style.css';
import axios from 'axios';
import ThreeDots from '../components/ThreeDots';
import ImageCropper from '../components/ImageCropper';
import PhoneCountrySelect from '../components/PhoneCountrySelect';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../utils/apiUrl';
import SocialLoginIcons from '../components/SocialLoginIcons';
import { useCachedImages } from '../hooks/useCachedImages';
import { uploadAvatar } from '../utils/b2Media';
import OptimizedImage from '../components/OptimizedImage';

const STEP_IMAGES = [
  '/signup.jpg',
  '/signup%20steps.jpg',
  '/couple-showing-wechat-icon.jpg',
  '/signup.jpg',
];

const PasswordStrength = ({ password }) => {
  const checks = [
    { label: '6+ chars', pass: password.length >= 6 },
    { label: 'Letter', pass: /[a-zA-Z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className='flex flex-wrap gap-1.5 mt-2'>
      {checks.map((c) => (
        <div
          key={c.label}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all duration-300 ${c.pass ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
        >
          {c.pass && <Check size={10} />}
          {c.label}
        </div>
      ))}
    </div>
  );
};

const MIN_AGE = 16;
const MAX_AGE = 90;

// Don't auto-focus on touch devices: it pops the keyboard and shifts the layout.
const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches;

/*
  Shared responsive class strings
  - text-base on mobile (16px) prevents iOS Safari zoom-on-focus; sm:text-sm on larger screens
  - 48px minimum touch targets
*/
const inputBase =
  'w-full py-3.5 bg-white border rounded-xl text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200';
const primaryBtn =
  'flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-4 min-h-[48px] rounded-xl hover:bg-gray-800 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-base sm:text-sm';
const backBtn =
  'flex items-center justify-center w-14 min-h-[48px] flex-shrink-0 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 active:scale-95 transition-all';
const labelClass =
  'block text-xs font-semibold text-gray-500 uppercase tracking-wider';
const eyeBtn =
  'absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors';
const errorBox =
  'animate-error-shake bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2';

const Register = () => {
  const getImg = useCachedImages(STEP_IMAGES);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStep = Number(searchParams.get('step'));
  const [validatedStep1, setValidatedStep1] = useState(null);
  const [step2Complete, setStep2Complete] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [direction, setDirection] = useState('forward');
  const [animKey, setAnimKey] = useState(0);
  const [barActive, setBarActive] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  // use undefined so react-phone-number-input can return an E.164 string when set
  const [phone, setPhone] = useState(undefined);
  const [defaultCountry, setDefaultCountry] = useState(() => {
    try {
      const lang = navigator?.language || navigator?.userLanguage || '';
      const parts = lang.split('-');
      return parts[1] ? parts[1].toUpperCase() : undefined;
    } catch {
      return undefined;
    }
  });
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestKey, setSuggestKey] = useState(0);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [ageInput, setAgeInput] = useState('');
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState('');
  const [profileCrop, setProfileCrop] = useState(null);

  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const step1Complete =
    validatedStep1 !== null &&
    validatedStep1.username === username.trim() &&
    validatedStep1.email === email.trim() &&
    validatedStep1.phone === phone;
  const maxAllowedStep = step1Complete
    ? step2Complete
      ? registrationComplete
        ? 4
        : 3
      : 2
    : 1;
  const validRequestedStep =
    Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 4
      ? requestedStep
      : 1;
  const step = registrationComplete
    ? 4
    : Math.min(validRequestedStep, maxAllowedStep);

  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const ageRef = useRef(null);
  const { register, updateUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('step') !== String(step)) {
      setSearchParams({ step: String(step) }, { replace: true });
    }
  }, [searchParams, setSearchParams, step]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`IP country lookup failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((location) => {
        const country = String(location.country_code || '').toUpperCase();
        if (!getCountries().includes(country)) {
          throw new Error('IP country lookup returned an unsupported country code');
        }
        setDefaultCountry(country);
      })
      .catch((lookupError) => {
        if (lookupError.name !== 'AbortError') {
          console.warn('Unable to detect the default phone country by IP.', lookupError);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!profileImagePreview) return undefined;
    return () => URL.revokeObjectURL(profileImagePreview);
  }, [profileImagePreview]);

  useEffect(() => {
    if (isTouchDevice()) return;
    if (step === 1) usernameRef.current?.focus();
    if (step === 2) passwordRef.current?.focus();
    if (step === 3) ageRef.current?.focus();
  }, [step]);

  const showError = (msg) => {
    setError(msg);
    setErrorKey((k) => k + 1);
  };

  // Debounced username check
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus(null);
      setSuggestions([]);
      return;
    }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const res = await axios.post(`${API_URL}/auth/check-username`, {
          username,
        });
        if (res.data.available) {
          setUsernameStatus('available');
          setSuggestions([]);
        } else {
          setUsernameStatus('taken');
          setSuggestions(res.data.suggestions || []);
          setSuggestKey((k) => k + 1);
        }
      } catch {
        setUsernameStatus(null);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [username]);

  const goForward = (nextStep) => {
    setDirection('forward');
    setBarActive(false);
    setSearchParams({ step: String(nextStep) });
    setAnimKey((k) => k + 1);
    setError('');
  };

  const goBack = () => {
    setError('');
    setBarActive(false);
    setDirection('back');
    setSearchParams({ step: String(Math.max(1, step - 1)) });
    setAnimKey((k) => k + 1);
  };

  // Step 1 → 2
  const handleStep1 = async (e) => {
    e.preventDefault();
    if (!/^[A-Za-z_]/.test(username.trim())) {
      showError('Username must start with a letter or underscore');
      return;
    }
    if (usernameStatus === 'taken') {
      showError('Please choose an available username');
      return;
    }
    if (email && !email.includes('@')) {
      showError('Enter a valid email address');
      return;
    }
    const submittedUsername = username.trim();
    const submittedEmail = email.trim();
    const submittedPhone = phone;
    let validPhone = false;
    if (submittedPhone) {
      try {
        const { isValidPhoneNumber } = await import('libphonenumber-js/max');
        validPhone = isValidPhoneNumber(String(submittedPhone));
      } catch (validationError) {
        console.error('Unable to load strict phone validation metadata.', validationError);
        showError('Unable to validate your phone number right now. Please try again.');
        return;
      }
    }
    if (!validPhone) {
      showError(
        String(submittedPhone || '').startsWith('+250')
          ? 'Enter a valid Rwanda telephone number with the correct network prefix'
          : 'Enter a valid phone number for your country',
      );
      return;
    }
    setError('');
    setBarActive(true);
    if (usernameStatus !== 'available') {
      try {
        const res = await axios.post(`${API_URL}/auth/check-username`, {
          username: submittedUsername,
        });
        if (!res.data.available) {
          setUsernameStatus('taken');
          setSuggestions(res.data.suggestions || []);
          setSuggestKey((k) => k + 1);
          showError('Username is already taken');
          setBarActive(false);
          return;
        }
        setUsernameStatus('available');
      } catch {
        showError('Could not verify username');
        setBarActive(false);
        return;
      }
    }
    if (
      username.trim() !== submittedUsername ||
      email.trim() !== submittedEmail ||
      phone !== submittedPhone
    ) {
      setBarActive(false);
      return;
    }
    setValidatedStep1({
      username: submittedUsername,
      email: submittedEmail,
      phone: submittedPhone,
    });
    goForward(2);
  };

  // Step 2 → 3
  const handleStep2 = (e) => {
    e.preventDefault();
    if (!step1Complete) {
      setSearchParams({ step: '1' }, { replace: true });
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      showError("Passwords don't match");
      return;
    }
    setError('');
    setBarActive(true);
    setStep2Complete(true);
    setTimeout(() => goForward(3), 400);
  };

  // Step 3 → submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!step1Complete || !step2Complete || registrationComplete) {
      setSearchParams(
        { step: String(step1Complete ? (step2Complete ? 3 : 2) : 1) },
        { replace: true },
      );
      return;
    }
    const age = Number(ageInput);
    if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
      showError(`Please enter an age between ${MIN_AGE} and ${MAX_AGE}`);
      return;
    }
    const estimatedDob = `${new Date().getFullYear() - age}-07-01`;
    setError('');
    setLoading(true);
    setBarActive(true);
    const result = await register(
      username,
      email,
      password,
      estimatedDob,
      isPrivateAccount,
      phone,
    );
    if (result.success) {
      setLoading(false);
      setBarActive(false);
      setRegistrationComplete(true);
      goForward(4);
    } else {
      showError(result.error);
      setLoading(false);
      setBarActive(false);
    }
  };

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Please choose an image file');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      showError('Choose an image smaller than 40 MB');
      return;
    }
    setProfileImage(file);
    setProfileImagePreview(URL.createObjectURL(file));
    setProfileCrop(null);
    setError('');
  };

  const finishProfileStep = async (event) => {
    event.preventDefault();
    if (!profileImage) {
      navigate('/chat');
      return;
    }
    setLoading(true);
    setBarActive(true);
    try {
      const token = localStorage.getItem('token');
      const uploaded = await uploadAvatar(profileImage, token, undefined, profileCrop);
      const response = await axios.put(
        `${API_URL}/users/profile`,
        { avatar: uploaded.ref },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      updateUser({
        avatar: response.data.user?.avatar || uploaded.url,
        avatarFull: response.data.user?.avatarFull || uploaded.url,
        avatarThumbnail: response.data.user?.avatarThumbnail || uploaded.thumbnailUrl,
      });
      navigate('/chat');
    } catch (uploadError) {
      showError(
        uploadError.response?.data?.message ||
          uploadError.message ||
          'Could not save your profile image',
      );
      setLoading(false);
      setBarActive(false);
    }
  };

  const skipProfileStep = () => navigate('/chat');

  const passwordMatch = confirm && password === confirm;
  const age = Number(ageInput);
  const ageOk =
    Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE;

  const UsernameStatusIcon = () => {
    if (usernameStatus === 'checking')
      return <Loader2 size={16} className='text-gray-400 animate-spin' />;
    if (usernameStatus === 'available')
      return <CheckCircle2 size={16} className='text-green-500' />;
    if (usernameStatus === 'taken')
      return <X size={16} className='text-red-500' />;
    return null;
  };

  const ErrorMessage = () =>
    error ? (
      <div key={errorKey} role='alert' className={errorBox}>
        <span className='mt-0.5 flex-shrink-0'>⚠</span>
        <span className='break-words min-w-0'>{error}</span>
      </div>
    ) : null;

  const stepClass =
    direction === 'back' ? 'animate-step-back' : 'animate-step-forward';

  return (
    <div className='h-full min-h-[100dvh] overflow-y-auto overscroll-y-contain flex flex-col lg:flex-row bg-gray-50'>
      {/* Image: banner on mobile/tablet, side panel on desktop */}
      <div className='relative w-full h-32 min-[400px]:h-40 sm:h-48 md:h-60 lg:h-screen lg:w-[45%] lg:sticky lg:top-0 overflow-hidden flex-shrink-0 [@media(max-height:480px)_and_(max-width:1023px)]:hidden'>
        <OptimizedImage
          key={step}
          src={getImg(STEP_IMAGES[step - 1])}
          alt=''
          priority
          className='absolute inset-0 w-full h-full object-cover object-center animate-img-fade'
        />
        <div className='absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/20 pointer-events-none' />
      </div>

      {/* Form area */}
      <div
        className='flex-1 flex items-start lg:items-center justify-center px-3 min-[400px]:px-4 sm:px-6 md:px-10 lg:p-6 pt-4 -mt-8 sm:-mt-10 md:-mt-12 lg:mt-0 relative z-10 [@media(max-height:480px)_and_(max-width:1023px)]:mt-0'
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className='w-full max-w-md md:max-w-lg'>
          {/* ── Card ── */}
          <div className='animate-card-in relative bg-white rounded-2xl shadow-lg lg:shadow-sm border border-gray-100 px-4 min-[400px]:px-5 sm:px-8 md:px-12 pt-1 pb-6 min-[400px]:pb-8 sm:pb-10 md:pb-12 overflow-hidden'>
            {/* Loading bar */}
            <div className='absolute top-0 left-0 right-0 h-[3px] overflow-hidden rounded-t-2xl'>
              {barActive && (
                <div className='absolute inset-y-0 bg-green-500 animate-loading-bar' />
              )}
            </div>

            <div key={animKey} className={`${stepClass} mt-6 sm:mt-8`}>
              {/* ══ Step 1 ══ */}
              {step === 1 && (
                <form onSubmit={handleStep1} className='space-y-4 sm:space-y-5'>
                  <ErrorMessage />

                  {/* Username */}
                  <div className='field-1'>
                    <label htmlFor='username' className={`${labelClass} mb-2`}>
                      Username
                    </label>
                    <div className='relative'>
                      <User
                        size={18}
                        className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'
                      />
                      <input
                        id='username'
                        ref={usernameRef}
                        type='text'
                        value={username}
                        autoComplete='username'
                        autoCapitalize='none'
                        autoCorrect='off'
                        spellCheck={false}
                        enterKeyHint='next'
                        onChange={(e) => {
                          setUsername(e.target.value);
                          setValidatedStep1(null);
                          setStep2Complete(false);
                          setError('');
                        }}
                        placeholder='Choose a username'
                        required
                        minLength={3}
                        maxLength={20}
                        className={`${inputBase} pl-11 pr-11 ${
                          usernameStatus === 'taken'
                            ? 'border-red-300   focus:ring-red-400'
                            : usernameStatus === 'available'
                              ? 'border-green-300 focus:ring-green-400'
                              : 'border-gray-200  focus:ring-green-500'
                        }`}
                      />
                      <div className='absolute right-4 top-1/2 -translate-y-1/2'>
                        <UsernameStatusIcon />
                      </div>
                    </div>

                    {usernameStatus === 'available' && (
                      <p
                        key='avail'
                        className='animate-status-fade text-xs text-green-600 mt-1.5 flex items-center gap-1 break-all'
                      >
                        <Check size={12} className='flex-shrink-0' /> @
                        {username} is available
                      </p>
                    )}
                    {usernameStatus === 'taken' && (
                      <p
                        key='taken'
                        className='animate-status-fade text-xs text-red-500 mt-1.5 flex items-center gap-1 break-all'
                      >
                        <X size={12} className='flex-shrink-0' /> @{username} is
                        already taken
                      </p>
                    )}

                    {usernameStatus === 'taken' && suggestions.length > 0 && (
                      <div key={suggestKey} className='mt-2'>
                        <p className='text-xs text-gray-400 mb-2'>
                          Try one of these:
                        </p>
                        <div className='flex flex-wrap gap-2'>
                          {suggestions.map((s, idx) => (
                            <button
                              key={s}
                              type='button'
                              onClick={() => {
                                setUsername(s);
                                setValidatedStep1(null);
                                setStep2Complete(false);
                                setError('');
                              }}
                              className={`pill-${idx + 1} text-sm sm:text-xs px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 active:scale-95 transition-all font-medium max-w-full truncate`}
                            >
                              @{s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Phone */}
                  <div className='field-2'>
                    <label htmlFor='phone' className={`${labelClass} mb-2`}>
                      Phone number
                    </label>
                    <div className='signup-phone-field flex h-12 min-w-0 overflow-visible rounded-xl border border-gray-200 bg-white transition focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100'>
                      <PhoneInput
                        international
                        defaultCountry={defaultCountry}
                        flags={flags}
                        countrySelectComponent={PhoneCountrySelect}
                        placeholder='+250 788 123 456'
                        value={phone}
                        onChange={(value) => {
                          setPhone(value);
                          setValidatedStep1(null);
                          setStep2Complete(false);
                          setError('');
                        }}
                        inputComponent='input'
                        className='signup-phone-input flex h-full min-w-0 flex-1'
                      />
                    </div>
                    <p className='text-xs text-gray-400 mt-1.5'>
                      Your phone number is private. Country is suggested using
                      an approximate external IP-location lookup; you can
                      change it.
                    </p>
                  </div>

                  {/* Email */}
                  <div className='field-2'>
                    <div className='flex items-center justify-between mb-2'>
                      <label htmlFor='email' className={labelClass}>
                        Email
                      </label>
                      <span className='text-xs text-gray-400 italic'>
                        optional
                      </span>
                    </div>
                    <div className='relative'>
                      <Mail
                        size={18}
                        className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'
                      />
                      <input
                        id='email'
                        type='email'
                        inputMode='email'
                        autoComplete='email'
                        autoCapitalize='none'
                        autoCorrect='off'
                        spellCheck={false}
                        enterKeyHint='go'
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setValidatedStep1(null);
                          setStep2Complete(false);
                          setError('');
                        }}
                        placeholder='you@example.com'
                        className={`${inputBase} pl-11 pr-4 border-gray-200 focus:ring-green-500`}
                      />
                    </div>
                    <p className='text-xs text-gray-400 mt-1.5'>
                      No email? No problem — you can add one later.
                    </p>
                  </div>

                  <button
                    type='submit'
                    className={`field-3 w-full ${primaryBtn}`}
                    disabled={
                      !username ||
                      usernameStatus === 'taken' ||
                      usernameStatus === 'checking' ||
                      barActive
                    }
                  >
                    {barActive ? (
                      <>
                        <ThreeDots size='sm' className='text-white' /> Checking…
                      </>
                    ) : (
                      <>
                        Next <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <p className='field-4 text-center text-sm text-gray-500'>
                    Already have an account?{' '}
                    <Link
                      to='/login'
                      className='inline-block py-2 font-semibold text-gray-900 hover:underline underline-offset-2'
                    >
                      Sign in
                    </Link>
                  </p>

                  <SocialLoginIcons />
                </form>
              )}

              {/* ══ Step 2 ══ */}
              {step === 2 && (
                <form onSubmit={handleStep2} className='space-y-4 sm:space-y-5'>
                  <ErrorMessage />

                  <div className='field-1'>
                    <label htmlFor='password' className={`${labelClass} mb-2`}>
                      Password
                    </label>
                    <div className='relative'>
                      <Lock
                        size={18}
                        className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'
                      />
                      <input
                        id='password'
                        ref={passwordRef}
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        required
                        autoComplete='new-password'
                        enterKeyHint='next'
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setStep2Complete(false);
                          setError('');
                        }}
                        placeholder='••••••••'
                        className={`${inputBase} pl-11 pr-12 border-gray-200 focus:ring-green-500`}
                      />
                      <button
                        type='button'
                        onClick={() => setShowPass((v) => !v)}
                        aria-label={
                          showPass ? 'Hide password' : 'Show password'
                        }
                        className={eyeBtn}
                      >
                        {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <PasswordStrength password={password} />
                  </div>

                  <div className='field-2'>
                    <label htmlFor='confirm' className={`${labelClass} mb-2`}>
                      Confirm password
                    </label>
                    <div className='relative'>
                      <Lock
                        size={18}
                        className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'
                      />
                      <input
                        id='confirm'
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        required
                        autoComplete='new-password'
                        enterKeyHint='go'
                        onChange={(e) => {
                          setConfirm(e.target.value);
                          setStep2Complete(false);
                          setError('');
                        }}
                        placeholder='••••••••'
                        className={`${inputBase} pl-11 pr-12 focus:ring-green-500 ${
                          confirm
                            ? passwordMatch
                              ? 'border-green-300'
                              : 'border-red-300'
                            : 'border-gray-200'
                        }`}
                      />
                      <button
                        type='button'
                        onClick={() => setShowConfirm((v) => !v)}
                        aria-label={
                          showConfirm ? 'Hide password' : 'Show password'
                        }
                        className={eyeBtn}
                      >
                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {confirm && !passwordMatch && (
                      <p className='animate-status-fade text-xs text-red-500 mt-1.5'>
                        Passwords don't match
                      </p>
                    )}
                    {confirm && passwordMatch && (
                      <p className='animate-status-fade text-xs text-green-600 mt-1.5 flex items-center gap-1'>
                        <Check size={12} /> Passwords match
                      </p>
                    )}
                  </div>

                  <div className='field-3 flex gap-3'>
                    <button
                      type='button'
                      onClick={goBack}
                      aria-label='Back'
                      className={backBtn}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <button
                      type='submit'
                      disabled={
                        !password || !confirm || !passwordMatch || barActive
                      }
                      className={`flex-1 ${primaryBtn}`}
                    >
                      {barActive ? (
                        <>
                          <ThreeDots size='sm' className='text-white' /> One
                          sec…
                        </>
                      ) : (
                        <>
                          Next <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* ══ Step 3 ══ */}
              {step === 3 && (
                <form
                  onSubmit={handleSubmit}
                  className='space-y-4 sm:space-y-5'
                >
                  <ErrorMessage />

                  <div className='field-1'>
                    <label htmlFor='age' className={`${labelClass} mb-2`}>
                      Age
                    </label>
                    <p className='text-xs text-gray-400 mb-3'>
                      Enter your age to continue.
                    </p>
                    <div className='relative'>
                      <input
                        id='age'
                        ref={ageRef}
                        type='text'
                        inputMode='numeric'
                        pattern='[0-9]*'
                        value={ageInput}
                        required
                        min={MIN_AGE}
                        max={MAX_AGE}
                        autoComplete='off'
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setAgeInput(digits);
                          setError('');
                        }}
                        placeholder='Enter your age'
                        aria-describedby='age-help'
                        className={`${inputBase} px-4 min-h-[50px] text-left ${
                          ageInput
                            ? ageOk
                              ? 'border-green-300 focus:ring-green-400'
                              : 'border-red-300 focus:ring-red-400'
                            : 'border-gray-200 focus:ring-green-500'
                        }`}
                      />
                    </div>
                    <p id='age-help' className='text-xs text-gray-400 mt-1.5'>
                      Ages from {MIN_AGE} to {MAX_AGE} are accepted.
                    </p>
                    {ageInput && !ageOk && (
                      <p
                        key='age-err'
                        className='animate-status-fade text-xs text-red-500 mt-1.5 flex items-center gap-1'
                      >
                        <X size={12} /> Enter an age between {MIN_AGE} and {MAX_AGE}
                      </p>
                    )}
                    {ageOk && (
                      <p
                        key='age-ok'
                        className='animate-status-fade text-xs text-green-600 mt-1.5 flex items-center gap-1'
                      >
                        <Check size={12} /> Age confirmed
                      </p>
                    )}
                  </div>

                  <fieldset className='field-2 space-y-2'>
                    <legend className={`${labelClass} mb-2`}>
                      Account privacy
                    </legend>
                    <p className='text-xs text-gray-500 mb-3'>
                      You can choose who is allowed to start a conversation
                      with you.
                    </p>
                    <button
                      type='button'
                      aria-pressed={!isPrivateAccount}
                      onClick={() => setIsPrivateAccount(false)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        !isPrivateAccount
                          ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className='block text-sm font-semibold text-gray-900'>
                        Public account
                        <span className='ml-2 text-xs font-normal text-green-700'>
                          Default
                        </span>
                      </span>
                      <span className='mt-1 block text-xs leading-relaxed text-gray-600'>
                        Anyone can message you, except people you have blocked
                        or muted.
                      </span>
                    </button>
                    <button
                      type='button'
                      aria-pressed={isPrivateAccount}
                      onClick={() => setIsPrivateAccount(true)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isPrivateAccount
                          ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className='block text-sm font-semibold text-gray-900'>
                        Private account
                      </span>
                      <span className='mt-1 block text-xs leading-relaxed text-gray-600'>
                        People cannot start a chat with you. If you message
                        someone first, they can reply in that chat. You can
                        block them or delete the chat.
                      </span>
                    </button>
                  </fieldset>

                  <div className='field-2 flex gap-3'>
                    <button
                      type='button'
                      onClick={goBack}
                      aria-label='Back'
                      className={backBtn}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <button
                      type='submit'
                      disabled={loading || !ageInput || !ageOk}
                      className={`flex-1 ${primaryBtn}`}
                    >
                      {loading ? (
                        <>
                          <ThreeDots size='sm' className='text-white' />{' '}
                          Creating account…
                        </>
                      ) : (
                        <>
                          Create account <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* ══ Step 4 ══ */}
              {step === 4 && (
                <form
                  onSubmit={finishProfileStep}
                  className='space-y-5 sm:space-y-6'
                >
                  <ErrorMessage />
                  <div className='text-center'>
                    {profileImage ? (
                      <div className='mb-4 flex justify-center'>
                        <ImageCropper
                          src={profileImagePreview}
                          onCropChange={setProfileCrop}
                          rounded
                        />
                      </div>
                    ) : (
                      <div className='mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 bg-gray-50'>
                        <Camera size={30} className='text-gray-400' />
                      </div>
                    )}
                    <h2 className='text-xl font-bold text-gray-900'>
                      Complete your profile
                    </h2>
                    <p className='mt-1 text-sm text-gray-500'>
                      Add a profile photo so people can recognize you.
                    </p>
                  </div>

                  <label
                    htmlFor='profile-image'
                    className='flex min-h-[48px] cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98]'
                  >
                    <Camera size={17} className='mr-2' />
                    {profileImage ? 'Choose another photo' : 'Choose a photo'}
                    <input
                      id='profile-image'
                      type='file'
                      accept='image/*'
                      className='hidden'
                      onChange={handleProfileImageChange}
                    />
                  </label>

                  <div className='flex gap-3'>
                    <button
                      type='submit'
                      disabled={loading || (profileImage && !profileCrop)}
                      className={`flex-1 ${primaryBtn}`}
                    >
                      {loading ? (
                        <>
                          <ThreeDots size='sm' className='text-white' /> Saving…
                        </>
                      ) : (
                        <>
                          {profileImage ? 'Finish profile' : 'Skip for now'}{' '}
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                  <button
                    type='button'
                    onClick={skipProfileStep}
                    disabled={loading}
                    className='w-full py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-40'
                  >
                    Skip this step
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
