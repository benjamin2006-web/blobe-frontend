import { Home, MoreVertical, Plus, Search, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SidebarTopBar = ({
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  onAdd,
  onCreatePost,
  onCreateGroup,
  onMenuAction,
  onLogout,
  hidden = false,
  unreadCount = 0,
  desktopOverlay = false,
}) => {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuContainerRef = useRef(null);
  const mobileInputRef = useRef(null);
  const desktopInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/home';
  const searchLabel = isHomePage ? 'Search content' : 'Search users and chats';
  const searchPlaceholder = isHomePage ? 'Search posts...' : 'Search users and chats...';

  useEffect(() => {
    if (mobileSearchOpen) mobileInputRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (desktopSearchOpen) desktopInputRef.current?.focus();
  }, [desktopSearchOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!menuContainerRef.current?.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    const closeOnScroll = () => setMobileMenuOpen(false);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [mobileMenuOpen]);

  const closeMobileSearch = () => {
    setMobileSearchOpen(false);
    if (searchTerm) onSearchChange('');
    onSearchSubmit?.('');
  };

  const closeDesktopSearch = () => {
    setDesktopSearchOpen(false);
    if (searchTerm) onSearchChange('');
    onSearchSubmit?.('');
  };

  const submitSearch = (event) => {
    if (event.key === 'Enter') handleSearchSubmit();
  };

  const handleSearchSubmit = () => {
    onSearchSubmit?.(searchTerm.trim());
    if (isHomePage) {
      setDesktopSearchOpen(false);
      setMobileSearchOpen(false);
    }
  };

  useEffect(() => {
    if (!mobileSearchOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMobileSearchOpen(false);
        if (searchTerm) onSearchChange('');
        onSearchSubmit?.('');
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileSearchOpen, onSearchChange, onSearchSubmit, searchTerm]);

  const toggleMobileSearch = () => {
    if (mobileSearchOpen) {
      closeMobileSearch();
      return;
    }
    setMobileSearchOpen(true);
  };

  return (
    <div ref={menuContainerRef} className={`fixed ${desktopOverlay ? 'md:fixed md:left-0 md:right-0' : 'md:sticky md:left-auto md:right-auto'} top-0 left-0 right-0 z-40 px-4 md:px-2.5 pt-2 pb-2 border-b border-white/10 bg-gray-900/75 backdrop-blur-xl shadow-lg shadow-black/10 will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
      hidden ? '-translate-y-[calc(100%+8px)]' : 'translate-y-0'
    }`}>
      {!mobileSearchOpen && (
        <div className={`flex items-center mb-1.5 transition-[gap] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          desktopSearchOpen && !isHomePage ? 'gap-0' : desktopSearchOpen ? 'gap-2' : 'gap-3'
        }`}>
          <div
            className={`flex flex-none items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              desktopSearchOpen && !isHomePage
                ? 'max-w-0 -translate-x-3 opacity-0'
                : 'max-w-[10rem] translate-x-0 opacity-100'
            }`}
            aria-hidden={desktopSearchOpen && !isHomePage}
          >
            <button
              type='button'
              aria-label='Refresh Blobe home'
              onClick={() => window.location.assign('/home')}
              className='flex items-center gap-2'
            >
              <img
                src='/icons/background-removed%20icon%20svg.svg'
                alt=''
                className='h-10 w-10 rounded-lg object-cover brightness-0 invert'
                width='40'
                height='40'
              />
              <h1 className='text-lg font-extrabold tracking-tight'>
                <span className='text-white'>Blo</span><span className='text-emerald-400'>be</span>
              </h1>
            </button>
          </div>
          {desktopSearchOpen ? (
            <div className={`desktop-search-expand relative ml-auto hidden min-w-0 items-center md:flex ${
              isHomePage
                ? 'desktop-search-expand-home mr-[70px]'
                : 'desktop-search-expand-chat flex-1'
            }`}>
              <Search
                className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-300'
                size={18}
              />
              <input
                ref={desktopInputRef}
                type='text'
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={submitSearch}
                className={`h-10 w-full rounded-2xl border-0 bg-white/10 pl-12 ${isHomePage ? 'pr-24' : 'pr-11'} text-sm text-white shadow-inner shadow-white/5 backdrop-blur-xl placeholder-gray-400 outline-none focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0`}
              />
              {isHomePage && (
                <button
                  type='button'
                  aria-label='Search content'
                  onClick={handleSearchSubmit}
                  disabled={!searchTerm.trim()}
                  className='absolute right-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-gray-950 shadow-sm transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40'
                >
                  Search
                </button>
              )}
              {!isHomePage && <button
                type='button'
                aria-label='Close search'
                onClick={closeDesktopSearch}
                className='absolute right-2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white'
              >
                <X size={18} />
              </button>}
            </div>
          ) : (
            <div className='relative ml-auto flex shrink-0 items-center gap-1'>
              <button
                type='button'
                aria-label={searchLabel}
                title={searchLabel}
                onClick={() => {
                  setMobileMenuOpen(false);
                  setDesktopSearchOpen(true);
                }}
                className='hidden items-center justify-center rounded-xl p-2.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white md:inline-flex'
              >
                <Search size={24} strokeWidth={2.5} />
              </button>
              {isHomePage && (
                <button
                  type='button'
                  aria-label='Create post'
                  title='Create post'
                  onClick={onCreatePost}
                  className='hidden items-center justify-center rounded-xl p-2.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white md:inline-flex'
                >
                  <Plus size={24} strokeWidth={2.5} />
                </button>
              )}
              {isHomePage && (
                <button
                  type='button'
                  aria-label={unreadCount > 0 ? `Go to Messages, ${unreadCount} unread` : 'Go to Messages'}
                  title='Messages'
                  onClick={() => navigate('/chat')}
                  className='relative hidden md:inline-flex items-center justify-center rounded-xl p-2.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
                >
                  <Send size={24} strokeWidth={2.5} />
                  {unreadCount > 0 && (
                    <span className='absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-gray-900 bg-red-500 px-1 text-[9px] font-bold leading-none text-white shadow-md'>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              )}
              <button
                type='button'
                aria-label='Go to Home'
                aria-current={isHomePage ? 'page' : undefined}
                title='Home'
                onClick={() => navigate('/home')}
                className={`hidden md:inline-flex items-center justify-center rounded-xl p-2.5 transition-colors hover:bg-white/10 hover:text-white ${
                  isHomePage ? 'bg-emerald-400/10 text-emerald-400' : 'text-gray-300'
                }`}
              >
                <Home size={24} strokeWidth={2.5} />
              </button>
            <button
              type='button'
              aria-label={searchLabel}
              aria-expanded={mobileSearchOpen}
              onClick={toggleMobileSearch}
              className='md:hidden p-2.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors'
            >
              <Search size={26} strokeWidth={2.8} />
            </button>
            <button
              type='button'
              aria-label='Create group'
              onClick={onAdd}
              className='md:hidden p-2.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors'
            >
              <Plus size={27} strokeWidth={2.8} />
            </button>
            <button
              type='button'
              aria-label='Open menu'
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className='rounded-xl p-2.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
            >
              <MoreVertical size={27} strokeWidth={2.8} />
            </button>

            {mobileMenuOpen && (
              <div className='absolute right-0 top-12 z-50 w-52 rounded-xl border border-gray-700 bg-gray-800 py-1 shadow-2xl'>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(isHomePage ? '/chat' : '/home');
                }}
                className='w-full px-4 py-3 text-left text-sm font-semibold text-emerald-300 hover:bg-white/10'
              >
                {isHomePage ? 'Open Chat' : 'Open Home'}
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onCreateGroup?.();
                }}
                className='w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/10'
              >
                Create group chat
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onMenuAction?.('account');
                }}
                className='w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/10'
              >
                My Account
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onMenuAction?.('profile');
                }}
                className='w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/10'
              >
                Dashboard
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onMenuAction?.('notifications');
                }}
                className='w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/10'
              >
                Notifications
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onMenuAction?.('people');
                }}
                className='w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/10'
              >
                People
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onMenuAction?.('appearance');
                }}
                className='w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/10'
              >
                Appearance
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onAdd?.();
                }}
                className='w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/10'
              >
                Add content
              </button>
              <button
                type='button'
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout?.();
                }}
                className='w-full px-4 py-3 text-left text-sm text-red-300 hover:bg-red-500/10'
              >
                Log out
              </button>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {mobileSearchOpen && (
        <div className='mobile-search-expand relative md:hidden'>
          <Search
            className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-300'
            size={18}
          />
          <input
            ref={mobileInputRef}
            type='text'
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={submitSearch}
            className={`h-12 w-full rounded-2xl border-0 bg-white/10 pl-12 ${isHomePage ? 'pr-24' : 'pr-11'} text-sm text-white shadow-inner shadow-white/5 backdrop-blur-xl placeholder-gray-400 outline-none focus:border-0 focus:outline-none focus:ring-0`}
          />
          {isHomePage && (
            <button
              type='button'
              aria-label='Search content'
              onClick={handleSearchSubmit}
              disabled={!searchTerm.trim()}
              className='absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-gray-950 shadow-sm transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40'
            >
              Search
            </button>
          )}
          {!isHomePage && <button
            type='button'
            aria-label='Close search'
            onClick={closeMobileSearch}
            className='absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white'
          >
            <X size={15} />
          </button>}
        </div>
      )}
    </div>
  );
};

export default SidebarTopBar;
