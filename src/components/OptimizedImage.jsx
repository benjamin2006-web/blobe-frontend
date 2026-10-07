import { useState } from 'react';
import { API_URL } from '../utils/apiUrl';

const resolveMediaUrl = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/')) return value;
  try {
    const apiOrigin = new URL(API_URL, window.location.origin);
    return new URL(value, apiOrigin).toString();
  } catch {
    return value;
  }
};

const OptimizedImage = ({
  src,
  thumbnailSrc,
  srcSet,
  sizes,
  priority = false,
  loading,
  decoding = 'async',
  onError,
  ...props
}) => {
  const [failedThumbnail, setFailedThumbnail] = useState('');
  const [failedResponsiveSource, setFailedResponsiveSource] = useState('');
  const imageSrc = resolveMediaUrl(src);
  const imageThumbnailSrc = resolveMediaUrl(thumbnailSrc);
  const sourceKey = `${imageSrc || ''}\n${imageThumbnailSrc || ''}`;
  const responsiveSourcesActive = Boolean(
    srcSet && failedResponsiveSource !== sourceKey,
  );
  const useThumbnail = responsiveSourcesActive
    ? false
    : srcSet
      ? Boolean(imageThumbnailSrc && failedResponsiveSource === sourceKey)
      : Boolean(imageThumbnailSrc && failedThumbnail !== sourceKey);
  return (
    <img
      {...props}
      src={useThumbnail ? imageThumbnailSrc : imageSrc}
      srcSet={responsiveSourcesActive ? srcSet : undefined}
      sizes={responsiveSourcesActive ? sizes : undefined}
      loading={loading || (priority ? 'eager' : 'lazy')}
      decoding={decoding}
      fetchPriority={priority ? 'high' : undefined}
      onError={(event) => {
        if (responsiveSourcesActive) {
          setFailedResponsiveSource(sourceKey);
          return;
        }
        if (!srcSet && useThumbnail && imageThumbnailSrc !== imageSrc) {
          setFailedThumbnail(sourceKey);
          return;
        }
        onError?.(event);
      }}
    />
  );
};

export default OptimizedImage;
