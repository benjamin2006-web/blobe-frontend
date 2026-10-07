import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Send, X } from 'lucide-react';
import BoardTextFit from './BoardTextFit';
import {
  getBoardStyle,
  getBoardTextElements,
  getBoardTextPositionStyle,
} from './BoardPostStyles';
import OptimizedImage from './OptimizedImage';
import UserAvatar from './UserAvatar';

const STORY_DURATION = 6000;
const STORY_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

const getStorySlides = (posts) => posts.flatMap((post) => {
  if (post.mediaType === 'board') {
    const boards = post.boards?.length ? post.boards : [post.board].filter(Boolean);
    return boards.map((board, index) => ({
      key: `${post._id}-board-${index}`,
      post,
      board,
      slideIndex: index,
      isLastSlide: index === boards.length - 1,
    }));
  }

  const media = post.mediaUrls?.length ? post.mediaUrls : [post.mediaUrl].filter(Boolean);
  const thumbnails = post.mediaThumbnailUrls?.length
    ? post.mediaThumbnailUrls
    : [post.mediaThumbnailUrl || ''];
  return media.map((src, index) => ({
    key: `${post._id}-media-${index}`,
    post,
    src,
    thumbnailSrc: thumbnails[index] || (media.length === 1 ? post.mediaThumbnailUrl : ''),
    slideIndex: index,
    isLastSlide: index === media.length - 1,
  }));
});

const UserPostStoryViewer = ({
  author,
  posts = [],
  startPostId,
  startSlideIndex = 0,
  loading = false,
  error = '',
  onRetry,
  onViewed,
  isOwnStory = false,
  storyViewers,
  onRefreshViewers,
  onReply,
  canNavigatePreviousAuthor = false,
  canNavigateNextAuthor = false,
  onPreviousAuthor,
  onNextAuthor,
  onClose,
}) => {
  const slides = useMemo(() => getStorySlides(posts), [posts]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState('next');
  const [appliedStartKey, setAppliedStartKey] = useState('');
  const [readySlideKey, setReadySlideKey] = useState('');
  const [loadedFullSlideKey, setLoadedFullSlideKey] = useState('');
  const [failedThumbnailSlideKey, setFailedThumbnailSlideKey] = useState('');
  const [failedSlideKey, setFailedSlideKey] = useState('');
  const [replyBySlide, setReplyBySlide] = useState({});
  const [sending, setSending] = useState(false);
  const seenPosts = useRef(new Set());
  const activeSlide = slides[activeIndex];
  const activeSlideReady =
    Boolean(activeSlide?.board) || readySlideKey === activeSlide?.key;
  const activeReply = replyBySlide[activeSlide?.key] || {};
  const replyText = activeReply.text || '';
  const activePostId = String(activeSlide?.post?._id || '');
  const visibleViewers = storyViewers?.postId === activePostId
    ? storyViewers.viewers
    : [];

  useEffect(() => {
    if (!isOwnStory || !activeSlide?.post?._id || !onRefreshViewers) return undefined;
    const refresh = () => onRefreshViewers(activeSlide.post);
    refresh();
    const interval = window.setInterval(refresh, 7000);
    return () => window.clearInterval(interval);
  }, [activeSlide?.post, isOwnStory, onRefreshViewers]);

  useEffect(() => {
    if (loading || !startPostId) return;
    const startKey = `${startPostId}:${startSlideIndex}`;
    if (appliedStartKey === startKey) return;
    const index = slides.findIndex(
      (slide) => String(slide.post?._id) === String(startPostId)
        && slide.slideIndex === startSlideIndex,
    );
    if (index >= 0) {
      setActiveIndex(index);
      setAppliedStartKey(startKey);
    }
  }, [appliedStartKey, loading, slides, startPostId, startSlideIndex]);

  const updateActiveReply = useCallback((updates) => {
    if (!activeSlide) return;
    setReplyBySlide((current) => ({
      ...current,
      [activeSlide.key]: { ...current[activeSlide.key], ...updates },
    }));
  }, [activeSlide]);

  const markViewed = useCallback((slide) => {
    const postId = slide?.post?._id;
    if (!slide?.isLastSlide || !postId || seenPosts.current.has(String(postId))) return;
    seenPosts.current.add(String(postId));
    onViewed?.(slide.post);
  }, [onViewed]);

  const next = useCallback(() => {
    if (!activeSlide) return;
    markViewed(activeSlide);
    if (activeIndex >= slides.length - 1) {
      if (canNavigateNextAuthor) onNextAuthor?.();
      else onClose?.();
      return;
    }
    setSlideDirection('next');
    setActiveIndex((index) => index + 1);
  }, [
    activeIndex,
    activeSlide,
    canNavigateNextAuthor,
    markViewed,
    onClose,
    onNextAuthor,
    slides.length,
  ]);

  const previous = useCallback(() => {
    setSlideDirection('previous');
    setActiveIndex((index) => Math.max(0, index - 1));
  }, []);

  const sendReply = useCallback(async (content) => {
    const message = content.trim();
    if (!message || !activeSlide?.post || sending) return;
    const slideKey = activeSlide.key;
    setSending(true);
    updateActiveReply({ error: '', sent: false });
    try {
      await onReply?.({
        content: message,
        post: activeSlide.post,
        slideIndex: activeSlide.slideIndex,
      });
      setReplyBySlide((current) => ({
        ...current,
        [slideKey]: { ...current[slideKey], text: '', sent: true },
      }));
      window.setTimeout(() => {
        setReplyBySlide((current) => ({
          ...current,
          [slideKey]: { ...current[slideKey], sent: false },
        }));
      }, 2200);
    } catch (error) {
      setReplyBySlide((current) => ({
        ...current,
        [slideKey]: { ...current[slideKey], error: error.message || 'Could not send reply.' },
      }));
    } finally {
      setSending(false);
    }
  }, [activeSlide, onReply, sending, updateActiveReply]);

  useEffect(() => {
    if (loading || (!error && slides.length > 0)) return;
    if (canNavigateNextAuthor) onNextAuthor?.();
    else onClose?.();
  }, [canNavigateNextAuthor, error, loading, onClose, onNextAuthor, slides.length]);

  useEffect(() => {
    const nextSlide = slides[activeIndex + 1];
    if (!nextSlide?.src) return;
    const image = new Image();
    image.src = nextSlide.thumbnailSrc || nextSlide.src;
  }, [activeIndex, slides]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [next, onClose, previous]);

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={`${author?.username || 'User'} posts`}
      className='story-author-enter fixed inset-0 z-[85] flex items-center justify-center bg-black'
    >
      <button
        type='button'
        aria-label='Skip to the previous person’s statuses'
        title='Previous person’s statuses'
        disabled={!canNavigatePreviousAuthor}
        onClick={onPreviousAuthor}
        className='absolute left-2 top-1/2 z-[90] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80 disabled:pointer-events-none disabled:opacity-0 md:flex md:left-[calc(50%-17rem)]'
      >
        <ChevronLeft size={24} />
      </button>
      <button
        type='button'
        aria-label='Skip to the next person’s statuses'
        title='Next person’s statuses'
        disabled={!canNavigateNextAuthor}
        onClick={onNextAuthor}
        className='absolute right-2 top-1/2 z-[90] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80 disabled:pointer-events-none disabled:opacity-0 md:flex md:right-[calc(50%-17rem)]'
      >
        <ChevronRight size={24} />
      </button>
      <div className='relative flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#111]'>
        <div className='absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.65rem,env(safe-area-inset-top))]'>
          {!loading && !error && slides.length > 0 && (
            <div className='mb-3 flex gap-1'>
              {slides.map((slide, index) => (
                <span key={slide.key} className='h-1 flex-1 overflow-hidden rounded-full bg-white/30'>
                  <span
                  className={`block h-full rounded-full bg-emerald-400 ${
                      index < activeIndex ? 'w-full' : index === activeIndex ? 'animate-story-progress' : 'w-0'
                    }`}
                    onAnimationEnd={() => {
                      if (index === activeIndex && !activeReply.paused && !sending) next();
                    }}
                    style={index === activeIndex ? {
                      animationDuration: `${STORY_DURATION}ms`,
                      animationPlayState: activeReply.paused || sending ? 'paused' : 'running',
                    } : undefined}
                  />
                </span>
              ))}
            </div>
          )}
          <header className='flex items-center gap-3 text-white'>
            <UserAvatar
              user={author}
              alt={`${author?.username || 'User'} profile`}
              className='h-10 w-10 rounded-full object-cover'
            />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-semibold'>{author?.username || 'User'}</p>
              {activeSlide?.post?.createdAt && (
                <p className='text-xs text-white/70'>
                  {new Date(activeSlide.post.createdAt).toLocaleString()}
                </p>
              )}
            </div>
            <button
              type='button'
              onClick={onClose}
              aria-label='Close stories'
              className='rounded-full p-2 text-white hover:bg-white/15'
            >
              <X size={22} />
            </button>
          </header>
        </div>

        {loading ? (
          <div className='flex flex-1 items-center justify-center pt-20 text-sm text-white/70' role='status'>
            Loading posts…
          </div>
        ) : error ? (
          <div className='flex flex-1 flex-col items-center justify-center gap-4 px-8 pt-20 text-center'>
            <p className='text-sm text-white/75'>{error}</p>
            <button
              type='button'
              onClick={onRetry}
              className='rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600'
            >
              Try again
            </button>
          </div>
        ) : !activeSlide ? (
          <div className='flex flex-1 items-center justify-center px-8 pt-20 text-center text-sm text-white/70'>
            No active posts to show.
          </div>
        ) : (
          <main
            className='relative flex min-h-0 flex-1 items-center justify-center pb-28 pt-20'
          >
            <div
              key={activeSlide.key}
              className={`story-slide-enter-${slideDirection} relative flex h-full w-full items-center justify-center`}
            >
              {activeSlide.board ? (
                <div
                  className='relative h-full max-h-[82%] w-full max-w-md'
                  style={getBoardStyle(activeSlide.board)}
                >
                  {getBoardTextElements(activeSlide.board).map((text, index) => (
                    <div
                      key={`${activeSlide.key}-${index}`}
                      className='absolute'
                      style={getBoardTextPositionStyle(text)}
                    >
                      <BoardTextFit board={text} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className='relative flex h-full w-full flex-col items-center justify-center'>
                  {activeSlide.thumbnailSrc && activeSlide.thumbnailSrc !== activeSlide.src && (
                    <OptimizedImage
                      key={`${activeSlide.key}-thumbnail`}
                      src={activeSlide.thumbnailSrc}
                      alt=''
                      aria-hidden='true'
                      priority
                      className={`absolute max-h-full max-w-full object-contain transition-opacity duration-200 ${loadedFullSlideKey === activeSlide.key || failedThumbnailSlideKey === activeSlide.key ? 'opacity-0' : 'opacity-100'}`}
                      onLoad={() => setReadySlideKey(activeSlide.key)}
                      onError={() => setFailedThumbnailSlideKey(activeSlide.key)}
                    />
                  )}
                  <OptimizedImage
                    key={activeSlide.key}
                    src={activeSlide.src}
                    alt={`${author?.username || 'User'} post`}
                    priority
                    className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${activeSlide.thumbnailSrc && activeSlide.thumbnailSrc !== activeSlide.src && loadedFullSlideKey !== activeSlide.key && failedThumbnailSlideKey !== activeSlide.key ? 'opacity-0' : 'opacity-100'}`}
                    onLoad={() => {
                      setLoadedFullSlideKey(activeSlide.key);
                      setReadySlideKey(activeSlide.key);
                    }}
                    onError={() => {
                      if (!activeSlide.thumbnailSrc || activeSlide.thumbnailSrc === activeSlide.src) {
                        setFailedSlideKey(activeSlide.key);
                      }
                    }}
                  />
                  {!activeSlideReady && failedSlideKey !== activeSlide.key && (
                    <div className='absolute inset-0 flex items-center justify-center bg-black/20' role='status' aria-label='Loading status image'>
                      <LoaderCircle size={28} className='animate-spin text-emerald-300' />
                    </div>
                  )}
                  {failedSlideKey === activeSlide.key && (
                    <p role='alert' className='absolute rounded-xl bg-black/70 px-4 py-3 text-sm text-white/80'>
                      This image could not be loaded. Tap the right side to skip.
                    </p>
                  )}
                  {activeSlide.post.caption && (
                    <p className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-8 pt-16 text-sm text-white'>
                      {activeSlide.post.caption}
                    </p>
                  )}
                </div>
              )}
            </div>
            <button
              type='button'
              aria-label='Previous status from this person'
              title='Previous status'
              onClick={previous}
              className='absolute inset-y-0 left-0 z-10 w-1/3 cursor-pointer bg-transparent'
            />
            <button
              type='button'
              aria-label={activeIndex === slides.length - 1
                ? 'Finish this person’s statuses and continue'
                : 'Next status from this person'}
              title='Next status'
              onClick={next}
              className='absolute inset-y-0 right-0 z-10 w-1/3 cursor-pointer bg-transparent'
            />
          </main>
        )}
        {!loading && !error && activeSlide && isOwnStory && visibleViewers.length > 0 && (
          <div
            className='story-viewers-rail absolute bottom-[21%] left-2 top-[12%] z-20 w-[min(42vw,10rem)] overflow-hidden pointer-events-none'
            aria-label={`${visibleViewers.length} people viewed this story`}
          >
            <div
              className='story-viewers-track absolute inset-x-0 bottom-0 flex flex-col'
              style={{ animationDuration: `${Math.max(4, visibleViewers.length * 1.8)}s` }}
            >
              {[false, true].map((isDuplicate) => (
                <ul
                  key={isDuplicate ? 'duplicate' : 'viewers'}
                  className='flex shrink-0 flex-col-reverse gap-2 py-1'
                  aria-hidden={isDuplicate || undefined}
                >
                  {visibleViewers.map((viewer, index) => (
                    <li key={`${viewer._id || viewer.id}-${index}`}>
                      <div className='flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-2 py-1.5 shadow-lg backdrop-blur-xl'>
                        <UserAvatar
                          user={viewer}
                          alt={`${viewer.username || 'Viewer'} profile`}
                          className='h-8 w-8 rounded-full object-cover'
                        />
                        <span className='truncate text-xs font-medium text-white/95'>
                          {viewer.username || 'User'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        )}
        {!loading && !error && activeSlide && (
          <footer className='absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-10'>
            <div className='mb-2 flex items-center justify-center gap-3' aria-label='Quick story reactions'>
              {STORY_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type='button'
                  aria-label={`React ${emoji}`}
                  disabled={sending}
                  onClick={() => void sendReply(emoji)}
                  className='rounded-full p-1 text-2xl transition-transform hover:scale-125 disabled:opacity-50'
                >
                  {emoji}
                </button>
              ))}
            </div>
            {!author?.isPrivate && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendReply(replyText);
                }}
                className='flex items-center gap-2'
              >
                <input
                  value={replyText}
                  onChange={(event) => updateActiveReply({ text: event.target.value })}
                  onFocus={() => updateActiveReply({ paused: true })}
                  onBlur={() => updateActiveReply({ paused: false })}
                  maxLength={1000}
                  placeholder={`Reply to ${author?.username || 'story'}…`}
                  aria-label='Reply to story'
                  className='min-w-0 flex-1 rounded-full border border-white/50 bg-black/35 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/65 focus:border-white'
                />
                <button
                  type='submit'
                  aria-label='Send story reply'
                  disabled={!replyText.trim() || sending}
                  className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-45'
                >
                  {sending ? <LoaderCircle size={17} className='animate-spin' /> : <Send size={17} />}
                </button>
              </form>
            )}
            {(activeReply.error || activeReply.sent) && (
              <p role='status' className={`mt-1.5 text-center text-xs ${activeReply.error ? 'text-red-300' : 'text-emerald-200'}`}>
                {activeReply.error || 'Reply sent'}
              </p>
            )}
          </footer>
        )}
      </div>
    </div>
  );
};

export default UserPostStoryViewer;
