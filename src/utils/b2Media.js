import axios from 'axios';
import { API_URL } from './apiUrl';

const MAX_IMAGE_UPLOAD_BYTES = 40 * 1024 * 1024;
const POST_IMAGE_MAX_EDGE = 2560;
const POST_IMAGE_COMPRESSION_THRESHOLD = 2 * 1024 * 1024;
const POST_IMAGE_TARGET_BYTES = 2 * 1024 * 1024;

const encodeWebP = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Could not compress image for upload.'));
  }, 'image/webp', quality);
});

export const preparePostImage = async (file) => {
  if (
    !['image/jpeg', 'image/png'].includes(file?.type)
    || typeof createImageBitmap !== 'function'
    || file.size <= POST_IMAGE_COMPRESSION_THRESHOLD
  ) {
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, POST_IMAGE_MAX_EDGE / longestEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare image for upload.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let optimized = await encodeWebP(canvas, 0.84);
    if (optimized.size > POST_IMAGE_TARGET_BYTES) {
      optimized = await encodeWebP(canvas, 0.72);
    }
    if (optimized.size > POST_IMAGE_TARGET_BYTES) {
      const scale = Math.min(1, 2048 / Math.max(canvas.width, canvas.height));
      canvas.width = Math.max(1, Math.round(canvas.width * scale));
      canvas.height = Math.max(1, Math.round(canvas.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      optimized = await encodeWebP(canvas, 0.72);
      if (optimized.size > POST_IMAGE_TARGET_BYTES) {
        optimized = await encodeWebP(canvas, 0.62);
      }
    }
    if (optimized.size >= file.size) return file;
    const filename = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([optimized], `${filename}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } finally {
    bitmap?.close();
  }
};

const uploadImageToB2 = async (file, folder, token, onUploadProgress, crop) => {
  if (!file?.type.startsWith('image/')) {
    throw new Error('The selected file is not an image.');
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error('Choose an image smaller than 40 MB.');
  }
  const formData = new FormData();
  formData.append('file', file);
  if (crop) {
    formData.append('cropX', String(crop.x));
    formData.append('cropY', String(crop.y));
    formData.append('cropWidth', String(crop.width));
    formData.append('cropHeight', String(crop.height));
  }
  const { data } = await axios.post(
    `${API_URL}/users/media/upload`,
    formData,
    {
      params: { folder },
      headers: { Authorization: ['Bearer', token].join(' ') },
      timeout: 180000,
      onUploadProgress: (event) => {
        if (onUploadProgress && event.total) {
          onUploadProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    },
  );
  return {
    ref: data.ref,
    url: data.url,
    thumbnailUrl: data.thumbnailUrl,
    width: data.width,
    height: data.height,
  };
};

export const uploadAvatar = (file, token, onUploadProgress, crop) =>
  uploadImageToB2(file, 'avatars', token, onUploadProgress, crop);

export const uploadChatImage = async (file, token, onUploadProgress) => {
  const uploaded = await uploadImageToB2(file, 'messages', token, onUploadProgress);
  return uploaded.ref;
};

export const uploadPostMedia = async (file, token, onUploadProgress) => {
  if (!file?.type.startsWith('image/')) {
    throw new Error('Post uploads support images only.');
  }
  const uploaded = await uploadImageToB2(file, 'posts', token, onUploadProgress);
  return { url: uploaded.ref, resourceType: 'b2' };
};
