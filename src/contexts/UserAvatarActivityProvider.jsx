import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { UserAvatarActivityContext } from './UserAvatarActivityContext';
import { API_URL } from '../utils/apiUrl';

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_COUNTS = {};

const retainActiveTimestamps = (timestamps, now = Date.now()) =>
  (Array.isArray(timestamps) ? timestamps : []).filter((timestamp) => {
    const createdAt = Date.parse(timestamp);
    return Number.isFinite(createdAt) && createdAt <= now && createdAt + DAY_MS > now;
  });

const retainActivity = (activity, now = Date.now()) => {
  const unseen = retainActiveTimestamps(activity?.unseen, now);
  const viewed = retainActiveTimestamps(activity?.viewed, now);
  return unseen.length || viewed.length ? { unseen, viewed } : null;
};

const UserAvatarActivityProvider = ({ children }) => {
  const { token, user } = useAuth();
  const userId = String(user?._id || user?.id || '');
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let active = true;
    let requestSequence = 0;
    const controller = new AbortController();

    const refreshCounts = async () => {
      const sequence = ++requestSequence;
      try {
        const response = await fetch(`${API_URL}/posts/recent-counts`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Recent post count request failed (${response.status}).`);
        }
        const data = await response.json();
        if (!active || sequence !== requestSequence) return;
        if (data?.success !== true || !Array.isArray(data.counts)) {
          throw new Error('Recent post count response was invalid.');
        }

        const nextCounts = {};
        data.counts.forEach((entry) => {
          if (entry?.userId == null || !Array.isArray(entry.createdAt)) return;
          const activeTimestamps = retainActiveTimestamps(entry.createdAt);
          const unseenTimestamps = retainActiveTimestamps(entry.unseenAt ?? entry.createdAt);
          const unseen = new Set(unseenTimestamps);
          const activity = retainActivity({
            unseen: unseenTimestamps,
            viewed: activeTimestamps.filter((timestamp) => !unseen.has(timestamp)),
          });
          if (activity) nextCounts[String(entry.userId)] = activity;
        });
        setCounts(nextCounts);
      } catch (error) {
        if (error.name !== 'AbortError') console.error('Could not refresh profile post rings:', error);
      }
    };

    const onPostUploaded = (event) => {
      const post = event.detail;
      if (post?.shareToStory !== true) return;
      const authorId = post?.author?._id ?? post?.author?.id ?? post?.authorId ?? post?.userId;
      const createdAt = post?.createdAt;
      if (authorId != null && createdAt && retainActiveTimestamps([createdAt]).length) {
        setCounts((previous) => {
          const key = String(authorId);
          const current = previous[key] || EMPTY_COUNTS;
          const unseen = current.unseen || [];
          if (unseen.includes(createdAt)) return previous;
          return { ...previous, [key]: { ...current, unseen: [...unseen, createdAt] } };
        });
      }
      void refreshCounts();
    };

    const onPostStoryViewed = (event) => {
      const { authorId, createdAt } = event.detail || {};
      if (authorId == null || !createdAt) return;
      const key = String(authorId);
      setCounts((previous) => {
        const current = previous[key];
        if (!current) return previous;
        const unseen = (current.unseen || []).filter(
          (timestamp) => timestamp !== createdAt,
        );
        if (unseen.length === (current.unseen || []).length) return previous;
        const viewed = current.viewed || [];
        const next = { ...previous };
        const activity = retainActivity({
          unseen,
          viewed: viewed.includes(createdAt) ? viewed : [...viewed, createdAt],
        });
        if (activity) next[key] = activity;
        else delete next[key];
        return next;
      });
      void refreshCounts();
    };

    window.addEventListener('post-uploaded', onPostUploaded);
    window.addEventListener('post-story-viewed', onPostStoryViewed);
    void refreshCounts();

    return () => {
      active = false;
      controller.abort();
      window.removeEventListener('post-uploaded', onPostUploaded);
      window.removeEventListener('post-story-viewed', onPostStoryViewed);
    };
  }, [token, userId]);

  useEffect(() => {
    const nextExpiry = Object.values(counts)
      .flatMap((activity) => [...(activity.unseen || []), ...(activity.viewed || [])])
      .map((timestamp) => Date.parse(timestamp) + DAY_MS)
      .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > Date.now())
      .sort((left, right) => left - right)[0];
    if (nextExpiry == null) return undefined;

    const timer = window.setTimeout(() => {
      const now = Date.now();
      setCounts((previous) => {
        const next = {};
        Object.entries(previous).forEach(([id, activity]) => {
          const activeActivity = retainActivity(activity, now);
          if (activeActivity) next[id] = activeActivity;
        });
        return next;
      });
    }, Math.max(0, nextExpiry - Date.now()));

    return () => window.clearTimeout(timer);
  }, [counts]);

  return (
    <UserAvatarActivityContext.Provider value={token ? counts : EMPTY_COUNTS}>
      {children}
    </UserAvatarActivityContext.Provider>
  );
};

export default UserAvatarActivityProvider;
