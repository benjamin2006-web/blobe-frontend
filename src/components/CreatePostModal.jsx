import { ChevronLeft, Clock, Hash, Image, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import OptimizedImage from './OptimizedImage';
import UserAvatar from './UserAvatar';
import { usePostUpload } from '../contexts/PostUploadContext';

const CreatePostModal = ({
  token,
  user,
  shareToStory = false,
  onClose,
}) => {
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishPromptOpen, setPublishPromptOpen] = useState(false);
  const [expiry, setExpiry] = useState('1d');
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewTouchStart = useRef(null);
  const inputRef = useRef(null);
  const captionRef = useRef(null);
  const { startPostUpload } = usePostUpload();

  const previewUrlsRef = useRef([]);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const chooseFile = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    const maxFiles = 10;
    if (selectedFiles.length > maxFiles) {
      setError(`Choose up to ${maxFiles} photos.`);
      event.target.value = '';
      return;
    }
    const valid = selectedFiles.every((nextFile) => nextFile.type.startsWith('image/'));
    if (!valid) {
      setError('Choose image files only.');
      event.target.value = '';
      return;
    }
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setFiles(selectedFiles);
    setPreviewUrls(selectedFiles.map((nextFile) => URL.createObjectURL(nextFile)));
    setPreviewIndex(0);
    setError('');
  };

  const createPost = () => {
    if (!files.length) {
      setError('Choose at least one photo to share.');
      return;
    }
    if (!shareToStory && !['1h', '5h', '1d', '5d'].includes(expiry)) {
      setError('Expiry must be 1h, 5h, 1d, or 5d.');
      return;
    }
    if (shareToStory) {
      publishPost(true);
      return;
    }
    setPublishPromptOpen(true);
  };

  const publishPost = (shareToStory) => {
    setSaving(true);
    setPublishPromptOpen(false);
    setError('');
    try {
      startPostUpload({
        files,
        caption,
        expiry: shareToStory ? '1d' : expiry,
        token,
        shareToStory,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not create post.');
      setSaving(false);
    }
  };

  const removePreview = (index) => {
    const nextFiles = files.filter((_, fileIndex) => fileIndex !== index);
    const nextPreviewUrls = previewUrls.filter((_, previewFileIndex) => previewFileIndex !== index);
    URL.revokeObjectURL(previewUrls[index]);
    setFiles(nextFiles);
    setPreviewUrls(nextPreviewUrls);
    setPreviewIndex((current) => Math.min(current, Math.max(0, nextPreviewUrls.length - 1)));
  };

  const insertHashtag = () => {
    const textarea = captionRef.current;
    const cursorStart = textarea?.selectionStart ?? caption.length;
    const cursorEnd = textarea?.selectionEnd ?? caption.length;
    const before = caption.slice(0, cursorStart);
    const after = caption.slice(cursorEnd);
    const prefix = before && !/\s$/.test(before) ? ' ' : '';
    const nextCaption = `${before}${prefix}#${after}`;
    setCaption(nextCaption);
    window.requestAnimationFrame(() => {
      if (!textarea) return;
      const nextCursor = cursorStart + prefix.length + 1;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  // ---- UI only below this line ----

  const expiryLabels = { '1h': '1 hour', '5h': '5 hours', '1d': '1 day', '5d': '5 days' };
  const glass = 'border border-white/10 bg-white/[0.06] backdrop-blur-xl';

  return (
    <div className='fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-0 backdrop-blur-md md:p-6'>
      <div className='relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-br from-[#0d0d0f] via-[#0a0a0c] to-black text-white animate-fade-in md:h-auto md:max-h-[calc(100dvh-3rem)] md:max-w-xl md:rounded-3xl md:border md:border-white/10'>
        {/* Soft light for the glass effect */}
        <div className='pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06] blur-3xl' />
        <div className='pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-white/[0.04] blur-3xl' />

        {/* Header */}
        <div className='relative flex shrink-0 items-center justify-between px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:border-b md:border-white/10 md:px-5 md:py-4'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full p-2 text-white transition hover:bg-white/10 md:hidden'
            aria-label='Close'
          >
            <ChevronLeft size={26} />
          </button>
          <h2 className='flex-1 text-center text-base font-bold md:text-left md:text-xl'>New post</h2>
          <button
            type='button'
            onClick={onClose}
            className='hidden rounded-full p-2 text-gray-400 transition hover:bg-white/10 hover:text-white md:block'
            aria-label='Close'
          >
            <X size={20} />
          </button>
          <span className='w-10 md:hidden' aria-hidden='true' />
        </div>

        {/* Body — single column, same on mobile and PC */}
        <div className='relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-2 md:space-y-5 md:px-6 md:pb-6 md:pt-5'>
          {/* Caption */}
          <div className='rounded-2xl bg-white/[0.06] p-3 backdrop-blur-xl'>
            <div className='flex items-start gap-3'>
              <UserAvatar
                user={user}
                alt={`${user?.username || 'User'} profile`}
                className='h-10 w-10 shrink-0 self-start rounded-full object-cover'
              />
              <textarea
                ref={captionRef}
                autoFocus
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder='Describe your post, add hashtags...'
                className='min-h-20 flex-1 resize-none bg-transparent text-[15px] leading-6 text-white outline-none ring-0 placeholder:text-gray-500 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0'
              />
            </div>
            <div className='mt-2 flex items-center justify-between'>
              <button
                type='button'
                onClick={insertHashtag}
                aria-label='Add hashtag'
                className='flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white transition hover:opacity-90'
              >
                <Hash size={15} strokeWidth={2.6} />
                Hashtags
              </button>
              <span className='text-xs text-gray-500'>{caption.length}/500</span>
            </div>
          </div>

          {/* Media */}
          <div>
            {previewUrls.length ? (
              <div
                className='relative h-[min(46dvh,24rem)] w-full overflow-hidden rounded-2xl bg-black/50 md:h-[min(52dvh,28rem)]'
                onTouchStart={(event) => {
                  previewTouchStart.current = event.touches[0].clientX;
                }}
                onTouchEnd={(event) => {
                  if (previewTouchStart.current === null || previewUrls.length < 2) return;
                  const delta = event.changedTouches[0].clientX - previewTouchStart.current;
                  previewTouchStart.current = null;
                  if (Math.abs(delta) < 45) return;
                  setPreviewIndex((current) =>
                    Math.max(0, Math.min(previewUrls.length - 1, current + (delta < 0 ? 1 : -1))),
                  );
                }}
              >
                <OptimizedImage
                  src={previewUrls[previewIndex]}
                  alt={`Post preview ${previewIndex + 1}`}
                  className='h-full w-full object-contain'
                />
                {previewUrls.length > 1 && (
                  <div className='absolute inset-x-3 top-2 flex gap-1'>
                    {previewUrls.map((url, index) => (
                      <button
                        type='button'
                        key={url}
                        aria-label={`Show selected media ${index + 1}`}
                        onClick={() => setPreviewIndex(index)}
                        className='h-4 flex-1 py-1.5'
                      >
                        <span
                          className={`block h-[3px] w-full rounded-full transition ${
                            index === previewIndex ? 'bg-white' : 'bg-white/35'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type='button'
                  onClick={() => removePreview(previewIndex)}
                  className={`absolute right-2 rounded-full border border-white/15 bg-black/50 p-1.5 text-white backdrop-blur-md transition hover:bg-black/70 ${
                    previewUrls.length > 1 ? 'top-7' : 'top-2'
                  }`}
                  aria-label={`Remove selected media ${previewIndex + 1}`}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                type='button'
                onClick={() => inputRef.current?.click()}
                className={`flex h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border-dashed border-white/20 px-4 text-center text-gray-400 transition hover:border-white/40 hover:bg-white/[0.09] hover:text-white ${glass}`}
              >
                <div className='flex gap-3 text-white'>
                  <Image size={28} strokeWidth={2.4} />
                </div>
                <span className='text-sm font-semibold text-white'>
                  Choose up to 10 photos
                </span>
              </button>
            )}
            <input
              ref={inputRef}
              type='file'
              accept='image/*'
              multiple
              onChange={chooseFile}
              className='hidden'
            />
          </div>

          {/* Expiry */}
          {!shareToStory && (
            <div>
              <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-white'>
                <Clock size={16} className='text-gray-400' />
                Post expires
              </div>
              <div role='group' aria-label='Post expiry options' className='grid grid-cols-4 gap-2'>
                {['1h', '5h', '1d', '5d'].map((option) => (
                  <button
                    type='button'
                    key={option}
                    aria-pressed={expiry === option}
                    onClick={() => setExpiry(option)}
                    className={`min-w-0 rounded-xl px-2 py-2.5 text-center transition ${
                      expiry === option
                        ? 'bg-emerald-700 text-white'
                        : `${glass} text-gray-300 hover:bg-white/[0.12] hover:text-white`
                    }`}
                  >
                    <span className='block text-sm font-bold'>{option}</span>
                    <span className='block text-[10px] font-medium opacity-70'>{expiryLabels[option]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {shareToStory && (
            <p className='text-center text-xs text-emerald-100/75'>
              Your story expires after 24 hours.
            </p>
          )}

          {/* Status */}
          {error && (
            <div className='space-y-2'>
              <p className='rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 backdrop-blur-md'>{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className='relative flex shrink-0 gap-3 border-t border-white/10 bg-black/30 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:justify-end md:px-6 md:py-4'>
          <button
            type='button'
            onClick={onClose}
            className={`flex-1 rounded-full px-6 py-3 text-[15px] font-bold text-white transition hover:bg-white/[0.14] md:min-w-32 md:flex-none ${glass}`}
          >
            Discard
          </button>
          <button
            type='button'
            disabled={saving}
            onClick={createPost}
            className='flex-1 rounded-full bg-emerald-700 px-6 py-3 text-[15px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:min-w-32 md:flex-none'
          >
            {saving ? 'Starting...' : shareToStory ? 'Share to Story' : 'Post'}
          </button>
        </div>
      </div>
      {publishPromptOpen && !shareToStory && (
        <div
          role='alertdialog'
          aria-modal='true'
          aria-labelledby='publish-image-title'
          aria-describedby='publish-image-description'
          className='fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm'
        >
          <div className='w-full max-w-sm rounded-3xl border border-emerald-300/15 bg-emerald-950 p-5 text-white'>
            <h2 id='publish-image-title' className='text-lg font-semibold'>Ready to post?</h2>
            <p id='publish-image-description' className='mt-2 text-sm leading-6 text-white/70'>
              Choose where these photos appear. Stories are available for up to 24 hours.
            </p>
            <div className='mt-6 flex flex-col gap-3'>
              <button
                type='button'
                autoFocus
                disabled={saving}
                onClick={() => publishPost(false)}
                className='w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50'
              >
                Post Only
              </button>
              <button
                type='button'
                disabled={saving}
                onClick={() => publishPost(true)}
                className='w-full rounded-xl border border-emerald-300/25 bg-emerald-900 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-800 disabled:opacity-50'
              >
                Share To Story
              </button>
              <button
                type='button'
                onClick={() => setPublishPromptOpen(false)}
                className='w-full rounded-xl px-4 py-2 text-sm font-medium text-white/65 transition hover:bg-white/5 hover:text-white'
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePostModal;