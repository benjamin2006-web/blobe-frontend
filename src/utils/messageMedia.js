import axios from 'axios';
import { API_URL } from './apiUrl';
import { uploadChatImage } from './b2Media';

const VOICE_TIMEOUT_MS = 120000;

// Optimistic-bubble bookkeeping lives under underscore-prefixed keys so it never
// collides with message fields coming back from the API. They are stripped the
// moment the persisted message replaces the placeholder.
const LOCAL_ONLY_KEYS = [
  '_isOptimistic',
  '_uploadState',
  '_uploadProgress',
  '_uploadError',
  '_localUrl',
  '_clientId',
];

/** Unique, server-safe id used to reconcile an optimistic bubble with its ack. */
export const buildClientId = (prefix = 'media') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/** True for the temporary blob: URLs that this client is responsible for. */
export const isLocalPreviewUrl = (url) =>
  typeof url === 'string' && url.startsWith('blob:');

/**
 * Builds the placeholder shown the instant the user hits send — before any
 * upload starts. `content` (images) / `audioUrl` (voice) point at the local
 * blob URL so the bubble renders immediately, and `_clientId` carries the id the
 * server echoes back on the persisted message.
 */
export const createOptimisticMediaMessage = ({
  clientId,
  messageType,
  localUrl,
  duration = 0,
  fileName = '',
  fileSize = 0,
  viewOnce = false,
  sender,
  receiver = null,
  group = null,
}) => {
  const message = {
    _id: clientId,
    _clientId: clientId,
    _isOptimistic: true,
    _uploadState: 'pending',
    _uploadProgress: 0,
    _uploadError: '',
    _localUrl: localUrl,
    sender: {
      _id: sender?._id || sender?.id,
      username: sender?.username,
      avatar: sender?.avatar,
    },
    messageType,
    status: 'sending',
    createdAt: new Date().toISOString(),
  };
  if (viewOnce) message.viewOnce = true;

  if (receiver) {
    message.receiver = { _id: receiver._id, username: receiver.username };
  }
  if (group) message.group = group;

  if (messageType === 'image') message.content = localUrl;
  if (messageType === 'file') {
    message.content = localUrl;
    message.fileName = fileName;
    message.fileSize = fileSize;
  }
  if (messageType === 'voice') {
    message.audioUrl = localUrl;
    message.audioDuration = duration;
  }

  return message;
};

/** Applies an upload-state patch to the placeholder with this clientId. */
export const patchOptimisticMessage = (list, clientId, patch) =>
  list.map((message) =>
    message._clientId === clientId ? { ...message, ...patch } : message,
  );

/** Removes a placeholder (upload discarded by the user). */
export const removeOptimisticMessage = (list, clientId) =>
  list.filter((message) => message._clientId !== clientId);

/**
 * Merges a server-confirmed message into a conversation.
 *
 * Matches the placeholder by `clientId` (the server echoes it) so the bubble is
 * replaced in place rather than appended. Also swallows repeat deliveries of the
 * same message — the REST response and the socket event for one voice note, or a
 * `message_sent` replay — which is what keeps media from appearing twice.
 */
export const reconcileServerMessage = (list, message) => {
  if (!message?._id) return list;

  const realId = String(message._id);
  const clientId = message.clientId ? String(message.clientId) : null;
  const isSameMessage = (candidate) =>
    String(candidate._id) === realId ||
    (clientId !== null &&
      (String(candidate._clientId) === clientId ||
        String(candidate._id) === clientId));

  const existingIndex = list.findIndex(isSameMessage);
  if (existingIndex === -1) return [...list, message];

  const previous = list[existingIndex];
  const hasDuplicateCopy = list.filter(isSameMessage).length > 1;

  // The persisted message is already in place and no placeholder or repeat copy
  // is left behind: hand back the same array so callers can skip the re-render.
  if (
    !hasDuplicateCopy &&
    !previous._isOptimistic &&
    String(previous._id) === realId &&
    previous.status === message.status
  ) {
    return list;
  }

  const merged = { ...previous, ...message };
  LOCAL_ONLY_KEYS.forEach((key) => delete merged[key]);

  const next = list.filter((candidate) => !isSameMessage(candidate));
  // Re-insert at the original position so the bubble does not jump.
  next.splice(Math.min(existingIndex, next.length), 0, merged);
  return next;
};

/** Every local preview URL still referenced by a rendered message. */
export const collectLocalPreviewUrls = (messages = []) => {
  const urls = new Set();
  messages.forEach((message) => {
    if (isLocalPreviewUrl(message.content)) urls.add(message.content);
    if (isLocalPreviewUrl(message.audioUrl)) urls.add(message.audioUrl);
    if (isLocalPreviewUrl(message._localUrl)) urls.add(message._localUrl);
  });
  return urls;
};

/** Human-readable reason for a failed upload, for the bubble's error state. */
export const describeUploadError = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

/** Optimizes a photo once, uploads it to B2, and resolves with its object URL. */
export const uploadMessageImage = (file, token, onUploadProgress) =>
  uploadChatImage(file, token, onUploadProgress);

export const uploadMessageFile = async ({
  file,
  receiverId,
  groupId,
  clientId,
  token,
  onUploadProgress,
}) => {
  const formData = new FormData();
  formData.append('file', file);
  if (receiverId) formData.append('receiverId', receiverId);
  if (groupId) formData.append('groupId', groupId);
  if (clientId) formData.append('clientId', clientId);
  const { data } = await axios.post(`${API_URL}/messages/file`, formData, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 180000,
    onUploadProgress: (event) => {
      if (onUploadProgress && event.total) {
        onUploadProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });
  return data.message;
};

/**
 * Uploads a voice note through the API (the server stores it in B2 and
 * persists the message). Resolves with the persisted, populated message.
 */
export const uploadVoiceMessage = async ({
  blob,
  duration = 0,
  receiverId,
  groupId,
  clientId,
  token,
  viewOnce = false,
  onUploadProgress,
}) => {
  const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
  const formData = new FormData();
  formData.append('audio', blob, `voice.${extension}`);
  formData.append('duration', String(duration || 0));
  if (clientId) formData.append('clientId', clientId);
  if (groupId) formData.append('groupId', groupId);
  else formData.append('receiverId', receiverId);
  if (viewOnce && !groupId) formData.append('viewOnce', 'true');

  const { data } = await axios.post(`${API_URL}/messages/voice`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${token}`,
    },
    timeout: VOICE_TIMEOUT_MS,
    onUploadProgress: (progressEvent) => {
      if (onUploadProgress && progressEvent.total) {
        onUploadProgress(
          Math.round((progressEvent.loaded * 100) / progressEvent.total),
        );
      }
    },
  });

  return data.message;
};
