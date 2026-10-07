import { House, Plus, Send } from 'lucide-react';
import { useState } from 'react';

const NavIcon = ({
  icon: Icon,
  active,
  onClick,
  badge,
  topBarStyle = false,
}) => {
  const [ripple, setRipple] = useState(false);

  const handleClick = () => {
    setRipple(false);
    requestAnimationFrame(() => {
      setRipple(true);
      setTimeout(() => setRipple(false), 450);
    });
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className={`relative flex flex-col items-center justify-center flex-1 select-none outline-none min-w-0 ${
        topBarStyle
          ? 'p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors'
          : 'py-1.5'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {ripple && (
        <span className='nav-tap-ripple absolute inset-0 m-auto w-7 h-7 rounded-full bg-white/20 pointer-events-none' />
      )}

      <div
        className={`relative ${
          topBarStyle ? '' : 'px-2.5 py-1.5 rounded-xl transition-colors duration-200'
        } ${
          active ? 'bg-white/15 nav-pill-in nav-glow' : 'bg-transparent'
        }`}
      >
        <Icon
          size={topBarStyle ? 23 : 20}
          strokeWidth={topBarStyle ? 2.2 : active ? 2.2 : 1.7}
          className={`transition-colors duration-200 ${
            active ? 'text-white nav-icon-pop' : 'text-gray-400'
          }`}
        />
      </div>

      {active && (
        <span className='nav-dot-up absolute bottom-0.5 w-1 h-1 rounded-full bg-white' />
      )}

      {badge > 0 && (
        <span className='absolute top-0.5 right-[calc(50%-18px)]'>
          <span className='nav-badge-ping absolute inset-0 rounded-full bg-red-500 opacity-70' />
          <span className='nav-badge-pop relative min-w-[15px] h-[15px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none'>
            {badge > 99 ? '99+' : badge}
          </span>
        </span>
      )}
    </button>
  );
};

const MobileBottomNav = ({
  onHome,
  onAdd,
  onMessages,
  active = 'messages',
  unreadCount,
}) => (
  <div className='fixed md:hidden bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-gray-900/75 backdrop-blur-xl shadow-lg shadow-black/10 flex items-center justify-evenly pb-safe nav-bar-enter'>
    <NavIcon icon={House} active={active === 'home'} onClick={onHome} />
    <NavIcon icon={Plus} active={false} onClick={onAdd} topBarStyle />
    <NavIcon
      icon={Send}
      active={active === 'messages'}
      onClick={onMessages}
      badge={unreadCount}
    />
  </div>
);

export default MobileBottomNav;
