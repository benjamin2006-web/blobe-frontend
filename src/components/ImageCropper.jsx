import { useRef, useState } from 'react';

const FRAME_SIZE = 256;
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const cropFrom = (dimensions, offset, width, height) => {
  const x = clamp(-offset.x / width, 0, 1);
  const y = clamp(-offset.y / height, 0, 1);
  return {
    x,
    y,
    width: Math.min(1 - x, FRAME_SIZE / width),
    height: Math.min(1 - y, FRAME_SIZE / height),
  };
};

const ImageCropper = ({ src, onCropChange, onError, rounded = true }) => {
  const [loadedImage, setLoadedImage] = useState(null);
  const [zoomState, setZoomState] = useState(null);
  const [offsetState, setOffsetState] = useState(null);
  const dragRef = useRef(null);

  const dimensions =
    loadedImage && loadedImage.src === src ? loadedImage.dimensions : null;
  const zoom = zoomState && zoomState.src === src ? zoomState.value : 1;
  const baseScale = dimensions
    ? Math.max(
        FRAME_SIZE / dimensions.width,
        FRAME_SIZE / dimensions.height,
      )
    : 1;
  const scale = baseScale * zoom;
  const imageWidth = (dimensions?.width || FRAME_SIZE) * scale;
  const imageHeight = (dimensions?.height || FRAME_SIZE) * scale;
  const centeredOffset = {
    x: (FRAME_SIZE - imageWidth) / 2,
    y: (FRAME_SIZE - imageHeight) / 2,
  };
  const offset =
    offsetState && offsetState.src === src
      ? offsetState.value
      : centeredOffset;

  const publishCrop = (nextOffset, width = imageWidth, height = imageHeight) => {
    if (dimensions) {
      onCropChange?.(cropFrom(dimensions, nextOffset, width, height));
    }
  };

  const startDrag = (event) => {
    if (!dimensions) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const moveDrag = (event) => {
    if (!dragRef.current || !dimensions) return;
    const start = dragRef.current;
    const nextOffset = {
      x: clamp(start.offsetX + event.clientX - start.pointerX, FRAME_SIZE - imageWidth, 0),
      y: clamp(start.offsetY + event.clientY - start.pointerY, FRAME_SIZE - imageHeight, 0),
    };
    setOffsetState({ src, value: nextOffset });
    publishCrop(nextOffset);
  };

  const changeZoom = (event) => {
    const nextZoom = Number(event.target.value);
    const nextScale = baseScale * nextZoom;
    const nextWidth = (dimensions?.width || FRAME_SIZE) * nextScale;
    const nextHeight = (dimensions?.height || FRAME_SIZE) * nextScale;
    const ratio = nextZoom / zoom;
    const nextOffset = {
      x: clamp(
        FRAME_SIZE / 2 - (FRAME_SIZE / 2 - offset.x) * ratio,
        FRAME_SIZE - nextWidth,
        0,
      ),
      y: clamp(
        FRAME_SIZE / 2 - (FRAME_SIZE / 2 - offset.y) * ratio,
        FRAME_SIZE - nextHeight,
        0,
      ),
    };
    setZoomState({ src, value: nextZoom });
    setOffsetState({ src, value: nextOffset });
    publishCrop(nextOffset, nextWidth, nextHeight);
  };

  return (
    <div className='flex flex-col items-center gap-3'>
      <div
        className={`relative h-64 w-64 touch-none overflow-hidden bg-gray-900 ${rounded ? 'rounded-full' : 'rounded-xl'}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        role='img'
        aria-label='Drag the photo to choose the visible crop'
      >
        {src && (
          <img
            src={src}
            alt=''
            draggable={false}
            onLoad={(event) => {
              const nextDimensions = {
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              };
              const nextScale = Math.max(
                FRAME_SIZE / nextDimensions.width,
                FRAME_SIZE / nextDimensions.height,
              );
              const nextWidth = nextDimensions.width * nextScale;
              const nextHeight = nextDimensions.height * nextScale;
              const nextOffset = {
                x: (FRAME_SIZE - nextWidth) / 2,
                y: (FRAME_SIZE - nextHeight) / 2,
              };
              setLoadedImage({ src, dimensions: nextDimensions });
              setZoomState({ src, value: 1 });
              setOffsetState({ src, value: nextOffset });
              onCropChange?.(cropFrom(nextDimensions, nextOffset, nextWidth, nextHeight));
            }}
            onError={onError}
            className='pointer-events-none absolute max-w-none select-none'
            style={{
              width: imageWidth,
              height: imageHeight,
              left: offset.x,
              top: offset.y,
            }}
          />
        )}
        {dimensions && (
          <div className='pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/30' />
        )}
      </div>
      {dimensions && (
        <label className='flex w-full max-w-xs items-center gap-3 text-xs text-gray-500'>
          <span>Zoom</span>
          <input
            type='range'
            min='1'
            max='3'
            step='0.01'
            value={zoom}
            onChange={changeZoom}
            aria-label='Zoom profile picture'
            className='min-w-0 flex-1 accent-gray-900'
          />
        </label>
      )}
      <p className='text-xs text-gray-500'>Drag to reposition; use the slider to zoom.</p>
    </div>
  );
};

export default ImageCropper;
