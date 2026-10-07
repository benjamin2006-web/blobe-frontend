import { useCallback, useEffect, useRef } from 'react';

// The local blob: preview of a just-sent photo or voice note is only replaced by
// the server URL once the upload finishes. Revoking the object URL in that same
// instant can cut off an <img> that is still painting the preview, so revocation
// is deferred by a moment instead.
const REVOKE_DELAY_MS = 2000;

/**
 * Owns every blob: URL created for optimistic media previews.
 *
 * Centralising ownership keeps the lifetime rules in one place:
 *  • `create` mints a URL and remembers it,
 *  • `release` revokes a URL exactly once (never the remote server URL),
 *  • `releaseUnreferenced` garbage-collects previews whose message was replaced
 *    or dropped (conversation switch, discard, reconnect re-fetch),
 *  • unmounting the chat revokes whatever is left.
 */
export const useObjectUrls = () => {
  const urlsRef = useRef(new Set());
  const timersRef = useRef(new Map());

  const create = useCallback((source) => {
    const url = URL.createObjectURL(source);
    urlsRef.current.add(url);
    return url;
  }, []);

  const release = useCallback((url, delayMs = REVOKE_DELAY_MS) => {
    if (!url || !urlsRef.current.has(url)) return;
    urlsRef.current.delete(url);

    if (delayMs > 0) {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        URL.revokeObjectURL(url);
      }, delayMs);
      timersRef.current.set(timer, url);
      return;
    }

    URL.revokeObjectURL(url);
  }, []);

  /** Revokes every owned URL that is not in `keep` (the currently rendered set). */
  const releaseUnreferenced = useCallback(
    (keep, delayMs = REVOKE_DELAY_MS) => {
      urlsRef.current.forEach((url) => {
        if (!keep.has(url)) release(url, delayMs);
      });
    },
    [release],
  );

  const releaseAll = useCallback(() => {
    timersRef.current.forEach((url, timer) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    });
    timersRef.current.clear();

    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);

  return { create, release, releaseUnreferenced, releaseAll };
};

export default useObjectUrls;
