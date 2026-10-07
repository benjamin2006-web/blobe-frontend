import { API_URL } from '../utils/apiUrl';

const GoogleIcon = () => (
  <svg viewBox='0 0 24 24' className='w-5 h-5 flex-shrink-0' aria-hidden='true'>
    <path
      fill='#4285F4'
      d='M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z'
    />
    <path
      fill='#34A853'
      d='M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z'
    />
    <path
      fill='#FBBC05'
      d='M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z'
    />
    <path
      fill='#EA4335'
      d='M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z'
    />
  </svg>
);

const SocialLoginIcons = () => (
  <div className='mt-6'>
    {/* Divider */}
    <div className='flex items-center gap-3 mb-5'>
      <div className='flex-1 h-px bg-gray-200' />
      <span className='text-xs text-gray-400 font-medium whitespace-nowrap'>
        or
      </span>
      <div className='flex-1 h-px bg-gray-200' />
    </div>

    {/* Google button */}
    <button
      type='button'
      onClick={() => {
        window.location.assign(`${API_URL}/auth/google`);
      }}
      className='field-1 w-full min-h-[48px] flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-base sm:text-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 transition-all duration-200'
    >
      <GoogleIcon />
      <span className='truncate'>Continue with Google</span>
    </button>
  </div>
);

export default SocialLoginIcons;
