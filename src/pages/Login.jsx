import axios from 'axios';
import {
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';
import SocialLoginIcons from '../components/SocialLoginIcons';
import ThreeDots from '../components/ThreeDots';
import PhoneCountrySelect from '../components/PhoneCountrySelect';
import { useAuth } from '../contexts/AuthContext';
import { useCachedImages } from '../hooks/useCachedImages';
import { API_URL } from '../utils/apiUrl';
import OptimizedImage from '../components/OptimizedImage';

const STEP_IMAGES = ['/login%20steps.jpg', '/step%20login.jpg'];
const LOGIN_LOCKOUT_STORAGE_KEY = 'loginLockoutUntil';

const readLoginLockout = () => {
  const storedExpiry = window.localStorage.getItem(LOGIN_LOCKOUT_STORAGE_KEY);
  const lockedUntil = Number(storedExpiry);
  if (!Number.isFinite(lockedUntil) || lockedUntil <= Date.now()) {
    window.localStorage.removeItem(LOGIN_LOCKOUT_STORAGE_KEY);
    return null;
  }
  return lockedUntil;
};

/*
  Responsive changes vs. the original:
  - Uses min-h-[100dvh] so mobile browser toolbars don't cause jumping/cut-off.
  - Mobile & tablet portrait: image becomes a short banner on top (md:h-64),
    card is centered below. Desktop (lg+) keeps the split screen.
  - Card padding and spacing scale: px-5 → sm:px-8 → md:px-12.
  - Inputs use text-base on mobile (16px) so iOS Safari doesn't zoom on focus.
  - All buttons/inputs have >= 48px touch targets.
  - Safe-area padding for notched phones.
  - Password toggle has a larger tap area.
*/

const Login = () => {
  const getImg = useCachedImages(STEP_IMAGES);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const recoveryMode = location.pathname === '/forgot-password';
  const [lockedUntil, setLockedUntil] = useState(readLoginLockout);
  const [clock, setClock] = useState(0);
  const lockedOut = lockedUntil !== null && lockedUntil > clock;
  const showRecovery = recoveryMode || lockedOut;
  const requestedStep = Number(searchParams.get('step'));
  const [didStepOne, setDidStepOne] = useState(false);
  const validRequestedStep =
    Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 2
      ? requestedStep
      : 1;
  const step = didStepOne ? Math.min(validRequestedStep, 2) : 1;
  const [direction, setDirection] = useState('forward');
  const [animKey, setAnimKey] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [barActive, setBarActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState(
    location.state?.identifier?.includes('@')
      ? ''
      : location.state?.identifier || '',
  );
  const [recoveryPhone, setRecoveryPhone] = useState();
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (lockedOut && !recoveryMode) {
      navigate('/forgot-password', {
        replace: true,
        state: { identifier: location.state?.identifier, lockedOut: true },
      });
      return;
    }
    if (recoveryMode && location.state?.lockedOut && !lockedOut) {
      navigate('/login?step=1', { replace: true });
      return;
    }
    if (!showRecovery && searchParams.get('step') !== String(step)) {
      setSearchParams({ step: String(step) }, { replace: true });
    }
  }, [
    lockedOut,
    location.state,
    navigate,
    recoveryMode,
    searchParams,
    setSearchParams,
    showRecovery,
    step,
  ]);

  useEffect(() => {
    if (!lockedOut || lockedUntil === null) return undefined;

    const remaining = lockedUntil - Date.now();
    const expiryTimer = window.setTimeout(() => {
      window.localStorage.removeItem(LOGIN_LOCKOUT_STORAGE_KEY);
      setLockedUntil(null);
      navigate('/login?step=1', { replace: true });
    }, Math.max(0, remaining));
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);

    return () => {
      window.clearTimeout(expiryTimer);
      window.clearInterval(clockTimer);
    };
  }, [lockedOut, lockedUntil, navigate]);

  useEffect(() => {
    // Avoid auto-focus popping the keyboard over the layout on touch devices
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
    if (showRecovery || (isTouch && step === 1)) return;
    if (step === 1) identifierRef.current?.focus();
    if (step === 2) passwordRef.current?.focus();
  }, [showRecovery, step]);

  const isEmail = identifier.includes('@');
  const showError = (msg) => {
    setError(msg);
    setErrorKey((k) => k + 1);
  };

  const activateLoginLockout = (submittedIdentifier) => {
    const expiry = Date.now() + 60 * 60 * 1000;
    window.localStorage.setItem(LOGIN_LOCKOUT_STORAGE_KEY, String(expiry));
    setLockedUntil(expiry);
    navigate('/forgot-password', {
      replace: true,
      state: {
        identifier: submittedIdentifier.trim(),
        lockedOut: true,
      },
    });
  };

  const goToStep2 = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError('');
    setBarActive(true);
    try {
      const res = await axios.post(`${API_URL}/auth/check`, {
        identifier: identifier.trim(),
      });
      setFoundUser(res.data);
      setDidStepOne(true);
      setBarActive(false);
      setDirection('forward');
      setSearchParams({ step: '2' });
      setAnimKey((k) => k + 1);
    } catch (err) {
      setBarActive(false);
      if (
        err.response?.status === 429 &&
        /too many incorrect username attempts/i.test(
          err.response?.data?.message || '',
        )
      ) {
        activateLoginLockout(identifier);
        return;
      }
      showError(err.response?.data?.message || 'Something went wrong');
    }
  };

  const goBack = () => {
    setError('');
    setPassword('');
    setFoundUser(null);
    setDidStepOne(false);
    setDirection('back');
    setSearchParams({ step: '1' }, { replace: true });
    setAnimKey((k) => k + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!didStepOne) {
      setSearchParams({ step: '1' }, { replace: true });
      return;
    }
    setError('');
    setLoading(true);
    setBarActive(true);
    const result = await login(identifier.trim(), password);
    if (result.success) {
      navigate('/chat');
    } else if (
      result.status === 429 &&
      /too many incorrect (username|password) attempts/i.test(result.error)
    ) {
      activateLoginLockout(identifier);
    } else {
      showError(result.error);
      setLoading(false);
      setBarActive(false);
    }
  };

  const handleRecoverySubmit = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoveryMessage('');

    try {
      const { isValidPhoneNumber } = await import('libphonenumber-js/max');
      if (!isValidPhoneNumber(String(recoveryPhone || ''))) {
        setRecoveryError('Enter a valid phone number, including its country code.');
        return;
      }
    } catch (validationError) {
      console.error('Unable to load strict phone validation metadata.', validationError);
      setRecoveryError('Unable to validate the phone number right now. Please try again.');
      return;
    }

    setRecoveryMessage(
      'Your details are valid, but password recovery requests are not connected yet. Please contact an administrator directly for help.',
    );
  };

  const stepClass =
    direction === 'back' ? 'animate-step-back' : 'animate-step-forward';

  const inputBase =
    'w-full py-3.5 bg-white border border-gray-200 rounded-xl text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all';
  const primaryBtn =
    'w-full min-h-[48px] flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-4 rounded-xl hover:bg-gray-800 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-base sm:text-sm';
  const labelClass =
    'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2';

  return (
    <div className='min-h-[100dvh] flex flex-col lg:flex-row bg-gray-50'>
      {/* Image: banner on mobile/tablet, side panel on desktop */}
      <div className='relative w-full h-40 sm:h-52 md:h-64 lg:h-screen lg:w-[45%] lg:sticky lg:top-0 overflow-hidden flex-shrink-0'>
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
        className='flex-1 flex items-start lg:items-center justify-center px-4 sm:px-6 md:px-10 lg:p-6 -mt-10 sm:-mt-12 md:-mt-16 lg:mt-0 relative z-10 pb-8'
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className='w-full max-w-md md:max-w-lg'>
          {/* ── Card ── */}
          <div className='animate-card-in relative bg-white rounded-2xl shadow-lg lg:shadow-sm border border-gray-100 px-5 sm:px-8 md:px-12 pt-1 pb-8 sm:pb-10 md:pb-12 overflow-hidden'>
            {/* Loading bar */}
            <div className='absolute top-0 left-0 right-0 h-[3px] overflow-hidden rounded-t-2xl'>
              {barActive && (
                <div className='absolute inset-y-0 bg-green-500 animate-loading-bar' />
              )}
            </div>

            <div key={animKey} className={`${stepClass} mt-6 sm:mt-8`}>
              {showRecovery ? (
                <form
                  onSubmit={handleRecoverySubmit}
                  className='space-y-4 sm:space-y-5'
                >
                  <div className='space-y-2 text-center'>
                    <h1 className='text-2xl font-bold text-gray-900'>
                      Request a password reset
                    </h1>
                    <p className='text-sm leading-6 text-gray-500'>
                      Enter the username and phone number connected to your account.
                    </p>
                    <p className='text-xs leading-5 text-amber-800'>
                      Sending requests and issuing reset links will be enabled when admin tools are added.
                    </p>
                    {lockedOut && (
                      <p role='status' className='text-sm font-semibold text-red-700'>
                        Sign-in is locked for this browser. Try again in{' '}
                        {Math.floor(Math.max(0, lockedUntil - clock) / 60000)}:
                        {String(
                          Math.floor(
                            (Math.max(0, lockedUntil - clock) % 60000) / 1000,
                          ),
                        ).padStart(2, '0')}.
                      </p>
                    )}
                  </div>

                  {recoveryError && (
                    <div role='alert' className='bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl'>
                      {recoveryError}
                    </div>
                  )}
                  {recoveryMessage && (
                    <div role='status' className='bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-xl'>
                      {recoveryMessage}
                    </div>
                  )}

                  <div>
                    <label htmlFor='recovery-username' className={labelClass}>
                      Username
                    </label>
                    <div className='relative'>
                      <User
                        size={18}
                        className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'
                      />
                      <input
                        id='recovery-username'
                        type='text'
                        autoComplete='username'
                        required
                        value={recoveryUsername}
                        onChange={(e) => {
                          setRecoveryUsername(e.target.value);
                          setRecoveryMessage('');
                        }}
                        placeholder='Your username'
                        className={`${inputBase} pl-11 pr-4`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor='recovery-phone' className={labelClass}>
                      Telephone number
                    </label>
                    <div className='signup-phone-field flex h-12 min-w-0 overflow-visible rounded-xl border border-gray-200 bg-white transition focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100'>
                      <PhoneInput
                        id='recovery-phone'
                        international
                        defaultCountry='RW'
                        flags={flags}
                        countrySelectComponent={PhoneCountrySelect}
                        placeholder='+250 788 123 456'
                        value={recoveryPhone}
                        onChange={(value) => {
                          setRecoveryPhone(value);
                          setRecoveryMessage('');
                        }}
                        className='w-full'
                      />
                    </div>
                  </div>

                  <button
                    type='submit'
                    disabled={!recoveryUsername.trim() || !recoveryPhone}
                    className={primaryBtn}
                  >
                    <Phone size={16} /> Check details
                  </button>

                  <button
                    type='button'
                    onClick={() => navigate('/register')}
                    className='w-full py-2 text-sm font-semibold text-green-700 hover:underline underline-offset-2'
                  >
                    Create an account
                  </button>
                </form>
              ) : (
              <>
              {/* ══ Step 1 ══ */}
              {step === 1 && (
                <form onSubmit={goToStep2} className='space-y-4 sm:space-y-5'>
                  {error && (
                    <div
                      key={errorKey}
                      role='alert'
                      className='animate-error-shake bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2'
                    >
                      <span className='mt-0.5 flex-shrink-0'>⚠</span>
                      <span className='break-words min-w-0'>{error}</span>
                    </div>
                  )}

                  <div className='field-1'>
                    <label htmlFor='identifier' className={labelClass}>
                      Email or username
                    </label>
                    <div className='relative'>
                      {isEmail ? (
                        <Mail
                          size={18}
                          className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'
                        />
                      ) : (
                        <User
                          size={18}
                          className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'
                        />
                      )}
                      <input
                        id='identifier'
                        ref={identifierRef}
                        type='text'
                        inputMode='email'
                        autoCapitalize='none'
                        autoCorrect='off'
                        spellCheck={false}
                        enterKeyHint='next'
                        value={identifier}
                        required
                        autoComplete='username'
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          setError('');
                        }}
                        placeholder='you@example.com or username'
                        className={`${inputBase} pl-11 pr-4`}
                      />
                    </div>
                  </div>

                  <button
                    type='submit'
                    disabled={!identifier.trim() || barActive}
                    className={`field-2 ${primaryBtn}`}
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

                  <p className='field-3 text-center text-sm text-gray-500'>
                    No account?{' '}
                    <Link
                      to='/register'
                      className='inline-block py-2 font-semibold text-gray-900 hover:underline underline-offset-2'
                    >
                      Create one
                    </Link>
                  </p>

                  <SocialLoginIcons />
                </form>
              )}

              {/* ══ Step 2 ══ */}
              {step === 2 && (
                <form
                  onSubmit={handleSubmit}
                  className='space-y-4 sm:space-y-5'
                >
                  {/* User chip */}
                  <button
                    type='button'
                    onClick={goBack}
                    aria-label='Change account'
                    className='field-1 flex items-center gap-2.5 px-4 min-h-[44px] rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-all text-sm text-gray-700 font-medium max-w-full'
                  >
                    {foundUser?.avatar ? (
                      <OptimizedImage
                        src={foundUser.avatar}
                        alt=''
                        className='w-6 h-6 rounded-full object-cover flex-shrink-0'
                      />
                    ) : (
                      <User size={14} className='text-gray-400 flex-shrink-0' />
                    )}
                    <span className='truncate min-w-0'>{identifier}</span>
                    <ChevronDown
                      size={14}
                      className='text-gray-400 flex-shrink-0'
                    />
                  </button>

                  {error && (
                    <div
                      key={errorKey}
                      role='alert'
                      className='animate-error-shake bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2'
                    >
                      <span className='mt-0.5 flex-shrink-0'>⚠</span>
                      <span className='break-words min-w-0'>{error}</span>
                    </div>
                  )}

                  <div className='field-2'>
                    <label htmlFor='password' className={labelClass}>
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
                        enterKeyHint='go'
                        autoComplete='current-password'
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder='••••••••'
                        className={`${inputBase} pl-11 pr-12`}
                      />
                      <button
                        type='button'
                        onClick={() => setShowPass((v) => !v)}
                        aria-label={
                          showPass ? 'Hide password' : 'Show password'
                        }
                        className='absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors'
                      >
                        {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type='submit'
                    disabled={loading || !password}
                    className={`field-3 ${primaryBtn}`}
                  >
                    {loading ? (
                      <>
                        <ThreeDots size='sm' className='text-white' /> Signing
                        in…
                      </>
                    ) : (
                      <>
                        Sign In <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <div className='field-4 text-center'>
                    <button
                      type='button'
                      onClick={() =>
                        navigate('/forgot-password', {
                          state: { identifier: identifier.trim() },
                        })
                      }
                      className='inline-block py-2 px-2 text-sm font-semibold text-green-600 hover:text-green-700 hover:underline underline-offset-2 transition-colors'
                    >
                      Forgot password?
                    </button>
                  </div>
                </form>
              )}
              </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
