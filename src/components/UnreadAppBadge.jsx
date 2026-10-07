import { useEffect } from 'react';
import { useUnreadCounts } from '../contexts/useUnreadCounts';

const faviconWithBadge = (count) => {
  if (!count) return '/icons/background-removed%20icon%20svg.svg';

  const label = count > 99 ? '99+' : String(count);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#111827"/><path d="M13 17h38v27H31l-11 8v-8h-7z" fill="#22c55e"/><circle cx="49" cy="15" r="14" fill="#ef4444"/><text x="49" y="19" text-anchor="middle" font-family="Arial,sans-serif" font-size="${label.length > 2 ? 9 : 12}" font-weight="700" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const UnreadAppBadge = () => {
  const { totalUnread } = useUnreadCounts();

  useEffect(() => {
    const title = document.querySelector('title');
    const icon = document.querySelector('link[rel~="icon"]');
    const originalTitle = title?.textContent || 'Blobe';
    const originalIcon =
      icon?.getAttribute('href') || '/icons/background-removed%20icon%20svg.svg';
    const displayedTitle = totalUnread > 0
      ? `(${totalUnread > 99 ? '99+' : totalUnread}) ${originalTitle.replace(/^\(\d+\+?\)\s*/, '')}`
      : originalTitle.replace(/^\(\d+\+?\)\s*/, '');

    if (title) title.textContent = displayedTitle;
    if (icon) icon.href = totalUnread ? faviconWithBadge(totalUnread) : originalIcon;

    if (totalUnread > 0) {
      navigator.setAppBadge?.(totalUnread)?.catch?.((error) => {
        console.warn('Could not update the app unread badge:', error);
      });
    } else {
      navigator.clearAppBadge?.()?.catch?.((error) => {
        console.warn('Could not clear the app unread badge:', error);
      });
    }

    return () => {
      if (title) title.textContent = originalTitle;
      if (icon) icon.href = originalIcon;
    };
  }, [totalUnread]);

  return null;
};

export default UnreadAppBadge;
