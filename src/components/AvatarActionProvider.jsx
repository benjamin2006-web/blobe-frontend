import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AvatarActionContext } from '../contexts/AvatarActionContext';
import { useUserAvatarActivity } from '../contexts/UserAvatarActivityContext';
import { getAvatarUrl } from '../utils/avatar';
import OptimizedImage from './OptimizedImage';

const getUserId = (user) => String(user?._id || user?.id || user?.userId || '');

const AvatarActionDialog = ({ user, onClose, onViewStory }) => {
  const activity = useUserAvatarActivity(user);
  const hasActiveStory = activity.unseen.length > 0 || activity.viewed.length > 0;
  const [showImage, setShowImage] = useState(!hasActiveStory);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const gesture = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const startImageDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setIsDraggingImage(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveImageDrag = (event) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    setImageOffset({
      x: event.clientX - gesture.current.startX,
      y: event.clientY - gesture.current.startY,
    });
  };

  const endImageDrag = (event) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    const offset = {
      x: event.clientX - gesture.current.startX,
      y: event.clientY - gesture.current.startY,
    };
    gesture.current = null;
    setIsDraggingImage(false);
    if (Math.max(Math.abs(offset.x), Math.abs(offset.y)) >= 100) {
      onClose();
      return;
    }
    setImageOffset({ x: 0, y: 0 });
  };

  const viewStory = () => onViewStory(user);

  return createPortal(
    <div
      className='fixed inset-0 z-[450] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm'
      role='presentation'
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {showImage ? (
        <div
          className='fixed inset-0 z-[451] flex items-center justify-center bg-black/95 p-4'
          onClick={onClose}
        >
          <div
            className='touch-none select-none'
            onPointerDown={startImageDrag}
            onPointerMove={moveImageDrag}
            onPointerUp={endImageDrag}
            onPointerCancel={endImageDrag}
            onClick={(event) => event.stopPropagation()}
            style={{
              transform: `translate3d(${imageOffset.x}px, ${imageOffset.y}px, 0) scale(${Math.max(0.82, 1 - Math.max(Math.abs(imageOffset.x), Math.abs(imageOffset.y)) / 1400)})`,
              opacity: Math.max(0.4, 1 - Math.max(Math.abs(imageOffset.x), Math.abs(imageOffset.y)) / 500),
              transition: isDraggingImage ? 'none' : 'transform 180ms ease, opacity 180ms ease',
            }}
          >
            <OptimizedImage
              src={user.avatarFull || user.avatar || getAvatarUrl(user, { width: 1024, height: 1024 })}
              alt={`${user.username || 'User'} profile`}
              className='max-h-[90dvh] max-w-[92vw] rounded-2xl object-contain'
              decoding='async'
              draggable={false}
            />
          </div>
          <button
            type='button'
            onClick={onClose}
            aria-label='Close profile image'
            className='absolute right-4 top-4 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:flex'
          >
            <X size={22} />
          </button>
        </div>
      ) : (
        <section
          role='dialog'
          aria-modal='true'
          aria-label={`${user.username || 'User'} profile actions`}
          className='relative flex w-full max-w-sm items-center gap-3 text-white'
        >
          <div className='relative z-10 h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-full border-[3px] border-emerald-200/80 bg-emerald-900 shadow-[0_0_28px_rgba(52,211,153,0.45)]'>
            <OptimizedImage
              src={user.avatarThumbnail || user.avatar || getAvatarUrl(user)}
              alt={`${user.username || 'User'} profile`}
              className='h-full w-full object-cover'
            />
          </div>
          <div className='relative flex min-w-0 flex-1 flex-col overflow-visible rounded-[1.35rem] border border-emerald-100/30 bg-gradient-to-br from-emerald-300/30 via-green-800/75 to-emerald-950/90 p-2 shadow-[0_12px_48px_rgba(5,150,105,0.32)] backdrop-blur-2xl before:absolute before:-left-[0.48rem] before:top-1/2 before:h-4 before:w-4 before:-translate-y-1/2 before:rotate-45 before:border-b before:border-l before:border-emerald-100/30 before:bg-emerald-800/90'>
            <div className='absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_top_left,rgba(167,243,208,0.22),transparent_58%)] pointer-events-none' />
            {hasActiveStory && (
              <button
                type='button'
                onClick={viewStory}
                className='relative z-10 min-h-11 rounded-xl px-4 text-left text-sm font-semibold tracking-wide text-emerald-50 transition duration-200 hover:bg-emerald-100/15 hover:pl-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100'
              >
                View story
              </button>
            )}
            <button
              type='button'
              onClick={() => setShowImage(true)}
              className='relative z-10 min-h-11 rounded-xl px-4 text-left text-sm font-semibold tracking-wide text-emerald-50 transition duration-200 hover:bg-emerald-100/15 hover:pl-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100'
            >
              View profile
            </button>
          </div>
        </section>
      )}
    </div>,
    document.body,
  );
};

const AvatarActionProvider = ({ children }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const navigate = useNavigate();

  const openAvatarActions = useCallback((user) => {
    if (!getUserId(user)) return;
    setSelectedUser(user);
  }, []);

  const closeAvatarActions = useCallback(() => setSelectedUser(null), []);

  const viewStory = useCallback((user) => {
    const userId = getUserId(user);
    if (!userId) return;
    setSelectedUser(null);
    navigate(`/home?storyUser=${encodeURIComponent(userId)}`, {
      state: { storyAuthor: user },
    });
  }, [navigate]);

  return (
    <AvatarActionContext.Provider value={openAvatarActions}>
      {children}
      {selectedUser && (
        <AvatarActionDialog
          key={getUserId(selectedUser)}
          user={selectedUser}
          onClose={closeAvatarActions}
          onViewStory={viewStory}
        />
      )}
    </AvatarActionContext.Provider>
  );
};

export default AvatarActionProvider;
