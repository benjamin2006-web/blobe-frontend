import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoaderCircle, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { preparePostImage, uploadPostMedia } from '../utils/b2Media';
import { API_URL } from '../utils/apiUrl';
import UserAvatar from '../components/UserAvatar';
import { PostUploadContext } from './PostUploadContext';

const expiryDurations = {
  '1h': 60 * 60 * 1000,
  '5h': 5 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '5d': 5 * 24 * 60 * 60 * 1000,
};

const PostUploadProvider = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [uploadStatus, setUploadStatus] = useState(null);
  const activeUploadRef = useRef(false);
  const completionTimerRef = useRef(null);

  const dismissUploadStatus = useCallback(() => {
    window.clearTimeout(completionTimerRef.current);
    setUploadStatus(null);
  }, []);

  const startPostUpload = useCallback(({ files, caption, expiry, token, shareToStory = false }) => {
    if (activeUploadRef.current) {
      throw new Error('A post is already uploading. Please wait for it to finish.');
    }
    if (
      !files.length ||
      files.some((file) => !file?.type.startsWith('image/')) ||
      !expiryDurations[expiry]
    ) {
      throw new Error('Choose one or more images and a valid expiration time.');
    }

    activeUploadRef.current = true;
    const postingUserId = String(user?._id || user?.id || '');
    window.clearTimeout(completionTimerRef.current);
    setUploadStatus({ state: 'uploading', progress: 0, message: 'Uploading post' });

    const postFiles = Array.from(files);
    void (async () => {
      try {
        const preparedFiles = new Array(postFiles.length);
        const progressByFile = new Array(postFiles.length).fill(0);
        const completedFiles = new Set();
        let preparedCount = 0;
        let visibleProgress = 0;
        const uploadConcurrency = Math.min(2, postFiles.length);
        let nextIndex = 0;
        let preparationError = null;

        setUploadStatus({ state: 'uploading', progress: 0, message: 'Preparing photos' });
        const workers = Array.from({ length: uploadConcurrency }, async () => {
          while (nextIndex < postFiles.length && !preparationError) {
            const index = nextIndex;
            nextIndex += 1;
            try {
              preparedFiles[index] = await preparePostImage(postFiles[index]);
              preparedCount += 1;
              const preparationProgress = Math.round((preparedCount / postFiles.length) * 10);
              visibleProgress = Math.max(visibleProgress, preparationProgress);
              setUploadStatus({
                state: 'uploading',
                progress: visibleProgress,
                message: visibleProgress <= 10
                  ? `Preparing photos (${preparedCount}/${postFiles.length})`
                  : `Uploading photos (${completedFiles.size}/${postFiles.length})`,
              });
              const asset = await uploadPostMedia(preparedFiles[index], token, (value) => {
                progressByFile[index] = value;
                const uploadProgress = progressByFile.reduce((sum, item) => sum + item, 0)
                  / postFiles.length;
                const progress = Math.min(94, 10 + Math.round(uploadProgress * 0.84));
                if (progress <= visibleProgress) return;
                visibleProgress = progress;
                setUploadStatus({
                  state: 'uploading',
                  progress,
                  message: `Uploading photos (${completedFiles.size}/${postFiles.length})`,
                });
              });
              preparedFiles[index] = asset;
              completedFiles.add(index);
            } catch (error) {
              if (!preparationError) preparationError = error;
            }
          }
        });
        await Promise.all(workers);
        if (preparationError) throw preparationError;

        const uploadedAssets = preparedFiles;
        if (
          uploadedAssets.length !== postFiles.length ||
          uploadedAssets.some((asset) => !asset?.url)
        ) {
          throw new Error('Media upload finished without a usable media URL.');
        }

        setUploadStatus({ state: 'uploading', progress: 96, message: 'Publishing post' });
        const response = await fetch(`${API_URL}/posts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            caption: caption.trim(),
            mediaUrl: uploadedAssets[0].url,
            mediaAssets: uploadedAssets,
            ...(postFiles.length > 1
              ? { mediaUrls: uploadedAssets.map((asset) => asset.url) }
              : {}),
            mediaType: 'image',
            shareToStory,
            expiresAt: new Date(Date.now() + (shareToStory ? 24 * 60 * 60 * 1000 : expiryDurations[expiry])).toISOString(),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Could not create post.');
        }

        window.dispatchEvent(new CustomEvent('post-uploaded', { detail: data.post }));
        const authorId = String(data.post?.author?._id || data.post?.author?.id || '');
        if (authorId && authorId === postingUserId) {
          if (shareToStory) {
            const storyParams = new URLSearchParams({
              storyUser: authorId,
              storyPost: String(data.post._id),
            });
            navigate(`/home?${storyParams.toString()}`, {
              state: { storyAuthor: user },
            });
          } else {
            navigate(`/home?postId=${encodeURIComponent(data.post._id)}`);
          }
        }
        setUploadStatus({
          state: 'complete',
          progress: 100,
          message: shareToStory ? 'Post shared to story' : 'Post shared',
        });
        completionTimerRef.current = window.setTimeout(() => setUploadStatus(null), 3000);
      } catch (error) {
        console.error('Background post upload failed:', error);
        setUploadStatus({
          state: 'error',
          progress: 0,
          message: error.message || 'Could not upload post.',
        });
      } finally {
        activeUploadRef.current = false;
      }
    })();
  }, [navigate, user]);

  return (
    <PostUploadContext.Provider value={{ startPostUpload, uploadStatus, dismissUploadStatus }}>
      {children}
      {uploadStatus && (
        <div
          className='fixed bottom-20 right-4 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-white/10 bg-gray-900/95 p-3 text-white shadow-2xl shadow-black/50 backdrop-blur-xl md:bottom-6'
          role='status'
          aria-live='polite'
        >
          <div
            className={`h-14 w-14 shrink-0 rounded-full p-[3px] ${
              uploadStatus.state === 'error'
                ? 'bg-red-500'
                : uploadStatus.state === 'complete'
                  ? 'bg-emerald-400'
                  : ''
            }`}
            style={
              uploadStatus.state === 'uploading'
                ? {
                    background: `conic-gradient(#34d399 ${uploadStatus.progress}%, rgba(255,255,255,.18) ${uploadStatus.progress}%)`,
                  }
                : undefined
            }
            aria-label={
              uploadStatus.state === 'uploading'
                ? `Post upload ${uploadStatus.progress}% complete`
                : undefined
            }
          >
            <div className='h-full w-full rounded-full bg-gray-900 p-[2px]'>
              <UserAvatar
                user={user}
                alt='Your profile'
                className='h-full w-full rounded-full object-cover'
              />
            </div>
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-semibold'>
              {uploadStatus.state === 'uploading' && (
                <LoaderCircle size={14} className='mr-1.5 inline animate-spin' />
              )}
              {uploadStatus.message}
            </p>
            {uploadStatus.state === 'uploading' && (
              <div className='mt-1.5 h-1 w-40 max-w-full overflow-hidden rounded-full bg-white/10'>
                <div
                  className='h-full rounded-full bg-emerald-400 transition-[width] duration-200'
                  style={{ width: `${uploadStatus.progress}%` }}
                />
              </div>
            )}
          </div>
          {uploadStatus.state !== 'uploading' && (
            <button
              type='button'
              onClick={dismissUploadStatus}
              aria-label='Dismiss post upload status'
              className='rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white'
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
    </PostUploadContext.Provider>
  );
};

export default PostUploadProvider;
