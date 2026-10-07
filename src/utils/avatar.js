const initialsUrl = (name = 'user') => {
  const initials = name.trim().slice(0, 1).toUpperCase() || '?';
  const hue =
    [...name].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="hsl(${hue} 55% 45%)"/><text x="60" y="72" text-anchor="middle" font-family="Arial,sans-serif" font-size="58" font-weight="700" fill="white">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const getAvatarUrl = (user, options = {}) =>
  optimizeImageUrl(
    user?.avatarThumbnail ||
  user?.avatar ||
  (user?.gender === 'male'
    ? '/icons/male%20icon.png'
    : user?.gender === 'female'
      ? '/icons/female%20icon.png'
      : initialsUrl(user?.username || user?.email || 'user')),
    { width: 128, height: 128, crop: 'fill', ...options },
  );

export const hasCustomAvatar = (user) => Boolean(user?.avatar);

export const getGroupAvatarUrl = (group, options = {}) =>
  optimizeImageUrl(group?.avatarThumbnail || group?.avatar || initialsUrl(group?.name || 'group'), {
    width: 128,
    height: 128,
    crop: 'fill',
    ...options,
  });
import { optimizeImageUrl } from './imageOptimization';
