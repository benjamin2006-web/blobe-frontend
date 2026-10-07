import { Camera, Check, Eye, FileText, MapPin, Plus, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import VoiceRecorder from './VoiceRecorder';
import OptimizedImage from '../OptimizedImage';

const ChatInput = ({
  onSendMessage,
  onSendMediaMessage,
  selectedUser,
  onTypingStart,
  onTypingStop,
  replyTo,
  onCancelReply,
  onSendReply,
  editingMessage,
  onEditMessage,
  onCancelEdit,
}) => {
  const [newMessage, setNewMessage] = useState(editingMessage?.content || '');
  const [replyContent, setReplyContent] = useState('');
  // uploadingImage removed - WhatsApp-style: no upload banner shown to user
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationProgress, setLocationProgress] = useState('');
  const [locationFix, setLocationFix] = useState(null);
  const [voiceComposerActive, setVoiceComposerActive] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const editingMessageId = editingMessage?._id;

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (replyTo && textareaRef.current) textareaRef.current.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!editingMessageId) return;
    textareaRef.current?.focus();
  }, [editingMessageId]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height =
      Math.min(textareaRef.current.scrollHeight, 120) + 'px';
  }, [newMessage]);

  const handleSend = () => {
    if (editingMessage) {
      if (!newMessage.trim()) return;
      onEditMessage?.(editingMessage, newMessage);
      setNewMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      if (onTypingStop) onTypingStop();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    } else if (replyTo) {
      if (replyContent.trim() && onSendReply) {
        onSendReply(replyContent.trim());
        setReplyContent('');
      }
    } else if (newMessage.trim()) {
      onSendMessage(newMessage.trim(), 'text');
      setNewMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      if (onTypingStop) onTypingStop();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleCancelEdit = () => {
    onCancelEdit?.();
    setNewMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (onTypingStop) onTypingStop();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    if (replyTo) setReplyContent(value);
    else setNewMessage(value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    if (value.trim() && !editingMessage) {
      if (onTypingStart) onTypingStart();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (onTypingStop) onTypingStop();
      }, 2000);
    } else {
      if (onTypingStop) onTypingStop();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

      // ── Image upload ──────────────────────────────────────────────────────────
  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    // Persist the File objects in a ref BEFORE clearing the input — once
    // e.target.value is reset to '' the DOM file list is wiped, so
    // sendImageNow would otherwise never find a file to upload.
    selectedFilesRef.current = files;
    e.target.value = '';
    if (!files.length) return;

    if (files.some((file) => !file.type.startsWith('image/'))) {
      setUploadError('Only image files are supported.');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }
    if (files.some((file) => file.size > 40 * 1024 * 1024)) {
      setUploadError('Each image must be smaller than 40 MB.');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }

    // Drop any previously staged previews (the user can pick files again before
    // sending) so their object URLs never leak.
    localUrlRef.current.forEach((url) => URL.revokeObjectURL(url));

    const localUrls = files.map((file) => URL.createObjectURL(file));
    localUrlRef.current = localUrls;
    setImagePreview(localUrls[0]);
    setUploadError('');
    // No visible upload spinner: the preview is shown, then the upload continues
    // in the background while the message already appears in the chat.
  };

  // Called when the user taps the send button on the image preview.
  //
  // The File is handed straight to the chat, which renders the message from a
  // local blob: URL and uploads it in the background (progress / failure are
  // reported on the bubble itself). Uploading before sending is deliberately
  // avoided: it left the photo invisible until the upload finished, and the
  // temporary placeholder used back then could not be matched against the
  // server's `message_sent` event, which rendered the photo twice.
  const sendImageNow = () => {
    if (!imagePreview || !selectedUser) return;

    const file = selectedFilesRef.current[0] || null;
    if (!file) {
      setUploadError('The selected image could not be read. Please pick it again.');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }

    const previewObjectUrl = imagePreview.startsWith('blob:')
      ? imagePreview
      : null;

    // Fire and forget — the upload continues after this component forgets the
    // preview, and the message owns its own object URL from here on.
    onSendMediaMessage?.({
      kind: 'image',
      blob: file,
      viewOnce: !selectedUser.isGroup && viewOnce,
    });
    setViewOnce(false);

    // Cleanup of the composer preview only. The message owns its own object URL
    // from here on; any other staged previews (multi-select sends the previewed
    // file) are released too.
    setImagePreview(null);
    setUploadError('');
    localUrlRef.current.forEach((url) => {
      if (url !== previewObjectUrl) URL.revokeObjectURL(url);
    });
    localUrlRef.current = [];
    selectedFilesRef.current = [];
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Cancel the image selection (discard without sending).
  const cancelImage = () => {
    setImagePreview(null);
    setViewOnce(false);
    setUploadError('');
    localUrlRef.current?.forEach((url) => URL.revokeObjectURL(url));
    localUrlRef.current = [];
    selectedFilesRef.current = [];
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Keep refs to the object URLs and File objects so we can revoke/use
  // them on cancel/send (the file input is cleared after selection).
  const localUrlRef = useRef([]);
  const selectedFilesRef = useRef([]);

  const handleDocumentSelect = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setAttachmentMenuOpen(false);
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setUploadError('Use Photo or camera to send images.');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setUploadError('Files must be smaller than 40 MB.');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }
    setUploadError('');
    onSendMediaMessage?.({ kind: 'file', blob: file });
  };

  const getLocationFix = (options) =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  const getAccuracyGrade = (accuracy) => {
    if (accuracy <= 5) return { label: 'Excellent', color: 'text-emerald-300' };
    if (accuracy <= 20) return { label: 'Good', color: 'text-green-300' };
    if (accuracy <= 100) return { label: 'Fair', color: 'text-yellow-300' };
    if (accuracy <= 500) return { label: 'Bad', color: 'text-orange-300' };
    return { label: 'Very Bad', color: 'text-red-300' };
  };

  const shareLocation = () => {
    setAttachmentMenuOpen(false);
    if (!navigator.geolocation) {
      setUploadError('Location sharing is not supported by this browser.');
      return;
    }
    setUploadError('');
    setLocationFix(null);
    setLocationProgress('Requesting a fresh high-accuracy GPS fix…');
    setIsLocating(true);
    void (async () => {
      let gpsPosition = null;
      try {
        gpsPosition = await getLocationFix({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      } catch (error) {
        if (error?.code === 1) {
          setUploadError('Allow location access in your browser to share your location.');
          setIsLocating(false);
          setLocationProgress('');
          return;
        }
      }

      const gpsIsAccurate =
        gpsPosition && Number.isFinite(gpsPosition.coords.accuracy)
          ? gpsPosition.coords.accuracy <= 100
          : false;
      let chosenPosition = gpsPosition;

      if (!gpsIsAccurate) {
        setLocationProgress(
          gpsPosition
            ? 'GPS accuracy is low. Checking the best available Wi-Fi/cell-assisted location…'
            : 'GPS fix unavailable. Checking the best available Wi-Fi/cell-assisted location…',
        );
        try {
          const assistedPosition = await getLocationFix({
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 0,
          });
          const assistedAccuracy = assistedPosition.coords?.accuracy;
          const currentAccuracy = chosenPosition?.coords?.accuracy;
          if (
            !chosenPosition ||
            !Number.isFinite(currentAccuracy) ||
            (Number.isFinite(assistedAccuracy) && assistedAccuracy < currentAccuracy)
          ) {
            chosenPosition = assistedPosition;
          }
        } catch {
          if (!chosenPosition) {
            setUploadError(
              'Could not determine your location using GPS or browser-assisted positioning. Check location services, move outdoors for a clearer GPS signal, and retry.',
            );
            setIsLocating(false);
            setLocationProgress('');
            return;
          }
        }
      }

      setIsLocating(false);
      setLocationProgress('');
      const { latitude, longitude, accuracy } = chosenPosition.coords;
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(accuracy) ||
        accuracy < 0 ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        setUploadError('The browser returned invalid coordinates. No location was sent; please retry.');
        return;
      }
      setLocationFix({
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
        accuracy,
        ...getAccuracyGrade(accuracy),
      });
    })().catch(() => {
      setUploadError(
        'Location capture failed unexpectedly. Check your browser location settings and retry.',
      );
      setIsLocating(false);
      setLocationProgress('');
    });
  };

  const sendLocation = () => {
    if (!locationFix) return;
    onSendMessage?.(
      JSON.stringify({
        latitude: locationFix.latitude,
        longitude: locationFix.longitude,
      }),
      'location',
    );
    setLocationFix(null);
  };

  const retryLocation = () => {
    setLocationFix(null);
    shareLocation();
  };

  if (!selectedUser) return null;

  const currentValue = editingMessage
    ? newMessage
    : replyTo
      ? replyContent
      : newMessage;
  const placeholder = editingMessage
    ? 'Edit message...'
    : replyTo
      ? `Reply to ${replyTo.sender?.username || 'message'}...`
      : 'Message...';

  return (
    <div className='relative z-20 bg-gray-900/90 backdrop-blur-xl border-t border-white/10 safe-bottom'>
      {!voiceComposerActive && (
        <>
          {/* Image preview with send/cancel — WhatsApp-style: message sent immediately, upload is background */}
          {imagePreview && (
            <div className='mx-3 mt-2 sm:mx-4 px-3 py-2 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3'>
              <OptimizedImage
                src={imagePreview}
                alt='preview'
                className='w-14 h-14 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/15'
              />
              <div className='flex-1 min-w-0 flex items-center gap-2'>
                <p className='flex-1 text-xs font-semibold text-gray-200 truncate'>
                  {selectedUser.isGroup
                    ? selectedUser.name
                    : selectedUser.username}
                </p>
                {!selectedUser.isGroup && (
                  <button
                    type='button'
                    onClick={() => setViewOnce((value) => !value)}
                    title='Send as view once'
                    aria-label='Send photo as view once'
                    aria-pressed={viewOnce}
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                      viewOnce
                        ? 'bg-amber-400/20 text-amber-200'
                        : 'text-gray-400 hover:bg-white/10 hover:text-amber-200'
                    }`}
                  >
                    <Eye size={17} />
                  </button>
                )}
                <button
                  type='button'
                  onClick={sendImageNow}
                  title='Send'
                  className='flex h-8 w-8 items-center justify-center rounded-full bg-[#00a884] text-white transition-all hover:bg-[#06cf9c] active:scale-90 flex-shrink-0'
                >
                  <Send size={16} className='-ml-0.5 mt-0.5' />
                </button>
                <button
                  type='button'
                  onClick={cancelImage}
                  title='Discard'
                  className='flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white active:scale-90 flex-shrink-0'
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <div className='mx-3 mt-2 sm:mx-4 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-2xl flex items-center justify-between gap-2'>
              <p className='text-xs text-red-300'>{uploadError}</p>
              <button
                onClick={() => setUploadError('')}
                className='flex-shrink-0 rounded-full p-1 text-red-300/80 transition-colors hover:bg-red-500/15 hover:text-red-200'
              >
                <X size={14} />
              </button>
            </div>
          )}

          {locationProgress && (
            <div
              role='status'
              className='mx-3 mt-2 sm:mx-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs text-sky-100'
            >
              {locationProgress}
            </div>
          )}

          {locationFix && (
            <div className='mx-3 mt-2 sm:mx-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-white'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='text-sm font-semibold'>
                    Location accuracy:{' '}
                    <span className={locationFix.color}>{locationFix.label}</span>
                    <span className='ml-1 text-xs font-normal text-white/60'>
                      (about {Math.round(locationFix.accuracy)} m)
                    </span>
                  </p>
                  <p className='mt-1 text-xs text-white/60'>
                    {locationFix.latitude.toFixed(6)}, {locationFix.longitude.toFixed(6)}
                  </p>
                  {locationFix.accuracy > 100 && (
                    <p className='mt-1.5 text-xs text-orange-200'>
                      Accuracy is poor. Move outside to an open space for a stronger GPS signal, then retry.
                    </p>
                  )}
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <button
                    type='button'
                    onClick={retryLocation}
                    className='rounded-full px-3 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white'
                  >
                    Retry
                  </button>
                  <button
                    type='button'
                    onClick={sendLocation}
                    className='rounded-full bg-[#00a884] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#06cf9c]'
                  >
                    {locationFix.accuracy > 100 ? 'Send anyway' : 'Send location'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {editingMessage && (
            <div className='mx-3 mt-2 flex items-center justify-between gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/10 px-3 py-2 sm:mx-4'>
              <div className='min-w-0'>
                <p className='text-xs font-semibold text-blue-200'>Editing message</p>
                <p className='truncate text-xs text-gray-300'>
                  {editingMessage.content}
                </p>
              </div>
              <button
                type='button'
                onClick={handleCancelEdit}
                aria-label='Cancel editing'
                className='flex-shrink-0 rounded-full p-1.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Reply banner */}
          {replyTo && !editingMessage && (
            <div className='mx-3 mt-2 sm:mx-4 px-3 py-2 bg-white/5 border border-white/10 rounded-2xl flex items-start gap-2'>
              <div className='flex-1 min-w-0 pl-2.5 border-l-[3px] border-blue-500 rounded-sm'>
                <p className='text-xs font-bold text-blue-400 truncate'>
                  Replying to {replyTo.sender?.username}
                </p>
                <p className='text-xs text-gray-300 truncate mt-0.5'>
                  {replyTo.messageType === 'image'
                    ? '📷 Photo'
                    : replyTo.messageType === 'voice'
                      ? '🎤 Voice message'
                      : replyTo.content?.substring(0, 70)}
                </p>
              </div>
              <button
                onClick={onCancelReply}
                className='flex-shrink-0 p-1.5 hover:bg-white/10 rounded-full transition-colors'
              >
                <X size={14} className='text-gray-400' />
              </button>
            </div>
          )}
        </>
      )}

      {/* Input row */}
      <div className='px-3 py-2.5 sm:px-4 sm:py-3'>
        <div className='flex items-end gap-1.5 sm:gap-2'>
          {/* Attachments */}
          {!voiceComposerActive && !editingMessage && (
            <div className='relative flex h-11 w-11 flex-shrink-0 items-center justify-center'>
              {attachmentMenuOpen && (
                <>
                  <button
                    type='button'
                    aria-label='Close attachments menu'
                    className='fixed inset-0 z-20 cursor-default'
                    onClick={() => setAttachmentMenuOpen(false)}
                  />
                  <div className='absolute bottom-14 left-0 z-30 flex min-w-48 flex-col gap-1 rounded-2xl border border-white/10 bg-[#202c33] p-2 shadow-2xl shadow-black/50'>
                    <button
                      type='button'
                      onClick={() => {
                        setAttachmentMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className='flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white transition hover:bg-white/10'
                    >
                      <Camera size={19} className='text-sky-400' />
                      Photo or camera
                    </button>
                    <button
                      type='button'
                      onClick={() => documentInputRef.current?.click()}
                      className='flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white transition hover:bg-white/10'
                    >
                      <FileText size={19} className='text-violet-400' />
                      File
                    </button>
                    <button
                      type='button'
                      onClick={shareLocation}
                      disabled={isLocating}
                      className='flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60'
                    >
                      <MapPin size={19} className='text-emerald-400' />
                      {isLocating ? 'Getting accurate location…' : 'Location'}
                    </button>
                  </div>
                </>
              )}
              <button
                type='button'
                onClick={() => setAttachmentMenuOpen((open) => !open)}
                aria-label={attachmentMenuOpen ? 'Close attachments' : 'Add attachment'}
                aria-expanded={attachmentMenuOpen}
                title='Add attachment'
                className={`flex h-10 w-10 items-center justify-center rounded-full text-gray-300 transition hover:bg-white/10 hover:text-white active:scale-95 ${attachmentMenuOpen ? 'rotate-45' : ''}`}
              >
                <Plus size={25} />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            multiple
            className='hidden'
            onChange={handleImageSelect}
          />
          <input
            ref={documentInputRef}
            type='file'
            accept='application/*,text/*'
            className='hidden'
            onChange={handleDocumentSelect}
          />

          {/* Voice recorder */}
          {!editingMessage && (
            <div
              className={`${voiceComposerActive ? 'w-full' : 'flex h-11 min-w-[2.75rem] flex-shrink-0 items-center justify-center'}`}
            >
              <VoiceRecorder
                selectedUser={selectedUser}
                onSendMediaMessage={onSendMediaMessage}
                viewOnce={viewOnce && !selectedUser.isGroup}
                onViewOnceChange={setViewOnce}
                onRecordingChange={setVoiceComposerActive}
              />
            </div>
          )}

          {/* Textarea */}
          {!voiceComposerActive && (
            <form
              className='relative flex-1'
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
            >
              <textarea
                ref={textareaRef}
                value={currentValue}
                onChange={handleChange}
                enterKeyHint='send'
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && editingMessage) {
                    event.preventDefault();
                    handleCancelEdit();
                    return;
                  }
                  if (event.nativeEvent.isComposing) return;
                  handleKeyDown(event);
                }}
                placeholder={placeholder}
                rows={1}
                className='hide-scrollbar block w-full resize-none overflow-y-auto rounded-3xl border border-white/10 bg-white/5 py-[11px] pl-4 pr-14 text-[15px] leading-[22px] text-white placeholder-gray-500 shadow-inner transition-all focus:border-blue-500/50 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50'
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
              <button
                type='submit'
                onPointerDown={(event) => {
                  if (event.pointerType === 'touch') event.preventDefault();
                }}
                disabled={!currentValue.trim()}
                aria-label={editingMessage ? 'Save message edit' : 'Send message'}
                className='absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-900/40 transition-all hover:bg-blue-500 active:scale-90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500 disabled:shadow-none'
                title={editingMessage ? 'Save edit (Enter)' : 'Send (Enter)'}
              >
                {editingMessage ? (
                  <Check size={18} strokeWidth={2.4} />
                ) : (
                  <Send size={17} strokeWidth={2.2} className='-ml-0.5 mt-0.5' />
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
