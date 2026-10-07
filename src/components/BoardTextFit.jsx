import { useLayoutEffect, useRef, useState } from 'react';
import { getBoardTextStyle } from './BoardPostStyles';
import HighlightedText from './HighlightedText';

const REFERENCE_WIDTH = 448;
const MIN_FONT_SIZE = 14;
const FIT_TOLERANCE = 0.5;

const pointHitsText = (event, root) => {
  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(event.clientX, event.clientY);
  } else if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }
  if (!range || !root.contains(range.startContainer)) return false;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.length) return false;
  const offset = Math.min(range.startOffset, node.textContent.length - 1);
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  const rect = range.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
};

const BoardTextFit = ({
  board,
  editable = false,
  onChange,
  onFitChange,
  onFitResult,
  cursor = 'text',
  dragging = false,
  onTextBounds,
  textElementIndex,
  searchTerm = '',
  onRenderedTextPointerDown,
  onRenderedTextPointerMove,
  onRenderedTextPointerUp,
  onRenderedTextPointerCancel,
}) => {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const textareaRef = useRef(null);
  const selectionRef = useRef(null);
  const onFitChangeRef = useRef(onFitChange);
  const onFitResultRef = useRef(onFitResult);
  const onTextBoundsRef = useRef(onTextBounds);
  const [fit, setFit] = useState({ fontSize: null, textHeight: null, fits: true });
  const preferredStyle = getBoardTextStyle(board);
  const text = board?.text || '';
  const preferredSize = Number(board?.size) || 40;
  const handleRenderedTextPointerDown = (event) => {
    if (editable || !pointHitsText(event, containerRef.current)) {
      return false;
    }
    return onRenderedTextPointerDown?.(event, textElementIndex) ?? false;
  };
  const saveSelection = (textarea) => {
    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  };
  const handleTextChange = (event) => {
    saveSelection(event.currentTarget);
    onChange?.(event);
  };

  useLayoutEffect(() => {
    onFitChangeRef.current = onFitChange;
  }, [onFitChange]);

  useLayoutEffect(() => {
    onFitResultRef.current = onFitResult;
  }, [onFitResult]);

  useLayoutEffect(() => {
    if (!editable || !textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.focus({ preventScroll: true });
    const selection = selectionRef.current;
    const start = selection
      ? Math.min(selection.start, textarea.value.length)
      : textarea.value.length;
    const end = selection
      ? Math.min(selection.end, textarea.value.length)
      : start;
    textarea.setSelectionRange(start, end);
  }, [editable]);

  useLayoutEffect(() => {
    onTextBoundsRef.current = onTextBounds;
  }, [onTextBounds]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return undefined;

    let frame = 0;
    let cancelled = false;
    const calculateFit = () => {
      if (cancelled) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      const maxSize = Math.max(1, (preferredSize * width) / REFERENCE_WIDTH);
      const minSize = Math.min(maxSize, MIN_FONT_SIZE);
      const fitsAt = (fontSize) => {
        measure.style.fontSize = `${fontSize}px`;
        return (
          measure.getBoundingClientRect().height <= height + FIT_TOLERANCE &&
          measure.scrollWidth <= width + FIT_TOLERANCE
        );
      };

      let renderedSize = maxSize;
      let fits = fitsAt(maxSize);
      if (!fits) {
        let low = minSize;
        let high = maxSize;
        if (fitsAt(minSize)) {
          for (let attempt = 0; attempt < 12 && high - low > 0.25; attempt += 1) {
            const middle = (low + high) / 2;
            if (fitsAt(middle)) low = middle;
            else high = middle;
          }
          renderedSize = low;
          fits = true;
        } else {
          renderedSize = minSize;
        }
      }
      measure.style.fontSize = `${renderedSize}px`;
      const textHeight = measure.getBoundingClientRect().height;

      setFit((current) => {
        if (
          current.fits === fits &&
          current.fontSize !== null &&
          Math.abs(current.fontSize - renderedSize) < 0.1 &&
          Math.abs((current.textHeight || 0) - textHeight) < 0.1
        ) {
          return current;
        }
        return { fontSize: renderedSize, textHeight, fits };
      });
      onFitChangeRef.current?.(fits);
      onFitResultRef.current?.({
        fits,
        fontSize: renderedSize,
        preferredFontSize: maxSize,
      });
    };
    const updateFit = () => {
      if (cancelled) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(calculateFit);
    };

    const observer = new ResizeObserver(updateFit);
    observer.observe(container);
    calculateFit();
    document.fonts?.ready.then(updateFit);
    document.fonts?.addEventListener?.('loadingdone', updateFit);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      document.fonts?.removeEventListener?.('loadingdone', updateFit);
    };
  }, [
    board?.align,
    board?.bold,
    board?.font,
    board?.italic,
    board?.size,
    preferredSize,
    text,
  ]);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure) return;
    const range = document.createRange();
    range.selectNodeContents(measure);
    const bounds = range.getBoundingClientRect();
    const containerBounds = containerRef.current?.getBoundingClientRect();
    if (!containerBounds) return;
    const verticalOffset = Math.max(
      0,
      (containerRef.current.clientHeight - (fit.textHeight || bounds.height)) / 2,
    );
    onTextBoundsRef.current?.({
      left: bounds.left - containerBounds.left,
      top: bounds.top - containerBounds.top + verticalOffset,
      right: bounds.right - containerBounds.left,
      bottom: bounds.bottom - containerBounds.top + verticalOffset,
    });
  }, [fit.fontSize, fit.textHeight, text, board?.align, board?.font, board?.bold, board?.italic]);

  const textStyle = {
    ...preferredStyle,
    fontSize: fit.fontSize ? `${fit.fontSize}px` : preferredStyle.fontSize,
  };

  return (
    <div
      ref={containerRef}
      className='relative flex h-full min-h-0 w-full items-center overflow-hidden'
      style={{ containerType: 'inline-size' }}
    >
      <div
        ref={measureRef}
        aria-hidden='true'
        className='pointer-events-none invisible absolute left-0 top-0 m-0 w-full whitespace-pre-wrap break-words'
        style={{ ...textStyle, fontSize: `${fit.fontSize || MIN_FONT_SIZE}px`, overflowWrap: 'anywhere' }}
      >
        {`${text}\u200b`}
      </div>
      {editable ? (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onSelect={(event) => saveSelection(event.currentTarget)}
          autoFocus
          placeholder='Type a board'
          aria-label='Board text'
          maxLength={400}
          wrap='soft'
          spellCheck
          autoCapitalize='sentences'
          className={`relative z-10 w-full resize-none touch-none appearance-none border-0 bg-transparent p-0 shadow-none outline-none ring-0 placeholder:opacity-50 focus:border-0 focus:outline-none focus:ring-0 ${dragging ? 'select-none' : ''}`}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            ...textStyle,
            caretColor: board?.color || '#ffffff',
            cursor: dragging ? 'grabbing' : cursor,
            userSelect: dragging ? 'none' : 'text',
            height: fit.fits && fit.textHeight
              ? `${fit.textHeight}px`
              : '100%',
            maxHeight: '100%',
            flex: 'none',
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxSizing: 'border-box',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            overflowY: fit.fits ? 'hidden' : 'auto',
          }}
        />
      ) : !fit.fits ? (
        <p className='relative z-10 m-0 w-full text-center text-sm text-white/80'>
          This board text cannot fit on this screen. Try a larger screen to view it.
        </p>
      ) : (
        <p
          data-board-text-index={textElementIndex}
          onPointerDown={(event) => {
            if (handleRenderedTextPointerDown(event)) {
              event.stopPropagation();
            }
          }}
          onPointerMove={onRenderedTextPointerMove}
          onPointerUp={onRenderedTextPointerUp}
          onPointerCancel={onRenderedTextPointerCancel}
          className='relative z-10 m-0 w-full whitespace-pre-wrap break-words'
          style={{
            ...textStyle,
            overflowWrap: 'anywhere',
            touchAction: 'none',
            userSelect: 'none',
            cursor,
          }}
        >
          <HighlightedText text={text} searchTerm={searchTerm} />
        </p>
      )}
    </div>
  );
};

export default BoardTextFit;
