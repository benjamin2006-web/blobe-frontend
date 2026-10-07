import { useContext, useId } from 'react';
import { AvatarActionContext } from '../contexts/AvatarActionContext';
import { useUserAvatarActivity } from '../contexts/UserAvatarActivityContext';
import { getAvatarUrl } from '../utils/avatar';
import OptimizedImage from './OptimizedImage';

const UserAvatar = ({
  user,
  src = getAvatarUrl(user),
  alt = user?.username || 'avatar',
  className = '',
  wrapperStyle,
  interactive = true,
  showStoryRing = true,
  ...imageProps
}) => {
  const activity = useUserAvatarActivity(user);
  const openAvatarActions = useContext(AvatarActionContext);
  const gradientId = `story-ring-${useId().replace(/:/g, '')}`;
  const canOpenActions =
    interactive && Boolean(openAvatarActions) && Boolean(user?._id || user?.id || user?.userId);

  const openActions = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openAvatarActions?.(user);
  };

  return (
    <span
      className={`relative isolate inline-flex shrink-0 rounded-full align-middle ${canOpenActions ? 'cursor-pointer' : ''}`}
      style={wrapperStyle}
      onClick={canOpenActions ? openActions : undefined}
      onKeyDown={canOpenActions ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          openActions(event);
        }
      } : undefined}
      role={canOpenActions ? 'button' : undefined}
      tabIndex={canOpenActions ? 0 : undefined}
      aria-label={canOpenActions ? `Open ${user?.username || 'user'} profile options` : undefined}
    >
      <OptimizedImage
        {...imageProps}
        src={src}
        alt={alt}
        className={className}
      />
      {showStoryRing && (activity.unseen.length > 0 || activity.viewed.length > 0) && (
        <svg
          className='pointer-events-none absolute -inset-[3px] z-20 h-[calc(100%+6px)] w-[calc(100%+6px)] overflow-visible'
          viewBox='0 0 36 36'
          preserveAspectRatio='none'
          aria-hidden='true'
        >
          <defs>
            <linearGradient id={gradientId} x1='0%' y1='100%' x2='100%' y2='0%'>
              <stop offset='0%' stopColor='#10b981' />
              <stop offset='45%' stopColor='#ffffff' />
              <stop offset='75%' stopColor='#34d399' />
              <stop offset='100%' stopColor='#047857' />
            </linearGradient>
          </defs>
          <circle
            cx='18'
            cy='18'
            r='17.2'
            fill='none'
            stroke={activity.unseen.length > 0 ? `url(#${gradientId})` : '#64748b'}
            strokeWidth='2'
            className={activity.unseen.length > 0 ? 'story-ring-unseen' : undefined}
          />
        </svg>
      )}
    </span>
  );
};

export default UserAvatar;
