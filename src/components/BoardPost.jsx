import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Italic,
  Palette,
  Plus,
  Send,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  BOARD_BACKGROUNDS,
  BOARD_FONTS,
  getBoardTextElements,
  getBoardStyle,
  getBoardTextPositionStyle,
} from './BoardPostStyles';
import BoardTextFit from './BoardTextFit';

const SIZES = [24, 32, 40, 52, 68];
const ALIGNS = ['center', 'left', 'right'];
const ALIGN_ICONS = { center: AlignCenter, left: AlignLeft, right: AlignRight };
const next = (list, index) => (index + 1) % list.length;
const iconButton =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white outline-none transition hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70';
const MAX_BOARDS = 10;
const TEXT_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#cbd5e1',
  '#64748b',
  '#111827',
  '#000000',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f472b6',
];

const createEmptyText = () => ({
  text: '',
  font: BOARD_FONTS[0],
  color: '#ffffff',
  size: 40,
  align: 'center',
  bold: false,
  italic: false,
  positionX: 50,
  positionY: 50,
});

const createEmptyBoard = () => ({
  backgroundIndex: 0,
  texts: [createEmptyText()],
});

const BoardEditor = ({ onClose, onSave, shareToStory = false }) => {
  const [boards, setBoards] = useState(() => [createEmptyBoard()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fitStatuses, setFitStatuses] = useState([[null]]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [publishPromptOpen, setPublishPromptOpen] = useState(false);
  const viewportRef = useRef(null);
  const viewportSizeRef = useRef(null);
  const board = boards[activeIndex];
  const activeText = getBoardTextElements(board)[0] || createEmptyText();
  const activeFit = fitStatuses[activeIndex]?.[0];
  const textFits = activeFit?.fits === true;
  const allBoardsReady = boards.every((draft, index) =>
    Boolean(getBoardTextElements(draft)[0]?.text.trim()) &&
    fitStatuses[index]?.[0]?.fits === true,
  );
  const AlignIcon = ALIGN_ICONS[activeText.align];
  const textColors = TEXT_COLORS.includes(activeText.color)
    ? TEXT_COLORS
    : [activeText.color, ...TEXT_COLORS];

  const updateText = (key, value) => {
    setBoards((current) =>
      current.map((draft, index) =>
        index === activeIndex
          ? {
              ...draft,
              texts: [{ ...getBoardTextElements(draft)[0], [key]: value }],
            }
          : draft,
      ),
    );
    if (['text', 'font', 'size', 'align', 'bold', 'italic'].includes(key)) {
      setFitStatuses((current) =>
        current.map((status, index) => index === activeIndex ? [null] : status),
      );
    }
    setError('');
  };

  const updateBoardBackground = () => {
    setBoards((current) =>
      current.map((draft, index) =>
        index === activeIndex
          ? {
              ...draft,
              backgroundIndex: next(BOARD_BACKGROUNDS, draft.backgroundIndex),
            }
          : draft,
      ),
    );
  };

  const updateFitStatus = (boardIndex, fitResult) => {
    setFitStatuses((current) => {
      const previous = current[boardIndex]?.[0];
      if (
        previous?.fits === fitResult.fits &&
        previous?.fontSize === fitResult.fontSize &&
        previous?.preferredFontSize === fitResult.preferredFontSize
      ) return current;
      return current.map((status, index) => index === boardIndex ? [fitResult] : status);
    });
  };

  const addBoard = () => {
    if (boards.length >= MAX_BOARDS || saving) return;
    const nextBoardIndex = boards.length;
    setBoards((current) => [...current, createEmptyBoard()]);
    setFitStatuses((current) => [...current, [null]]);
    setActiveIndex(nextBoardIndex);
    setError('');
  };

  const duplicateBoard = () => {
    if (boards.length >= MAX_BOARDS || saving) return;
    const duplicate = {
      ...board,
      texts: getBoardTextElements(board).map((text) => ({ ...text })),
    };
    const nextBoardIndex = boards.length;
    setBoards((current) => [...current, duplicate]);
    setFitStatuses((current) => [...current, [activeFit]]);
    setActiveIndex(nextBoardIndex);
    setError('');
  };

  const deleteBoard = () => {
    if (boards.length <= 1 || saving) return;
    const nextIndex = Math.min(activeIndex, boards.length - 2);
    setBoards((current) => current.filter((_, index) => index !== activeIndex));
    setFitStatuses((current) => current.filter((_, index) => index !== activeIndex));
    setActiveIndex(nextIndex);
    setError('');
  };

  const requestClose = () => {
    if (saving) return;
    setDiscardPromptOpen(true);
  };

  const publishBoards = async (shareToStory) => {
    setPublishPromptOpen(false);
    setSaving(true);
    setError('');
    try {
      await onSave?.(boards, { shareToStory });
    } catch (saveError) {
      setError(saveError.message || 'Could not create board post.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const previous = viewportSizeRef.current;
      if (previous && (previous.width !== width || previous.height !== height)) {
        setFitStatuses((current) => current.map(() => [null]));
      }
      viewportSizeRef.current = { width, height };
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='New board'
      onPointerDownCapture={(event) => {
        if (colorPaletteOpen && !event.target.closest('[data-text-color-control]')) {
          setColorPaletteOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (discardPromptOpen) {
          event.stopPropagation();
          setDiscardPromptOpen(false);
        } else if (publishPromptOpen) {
          event.stopPropagation();
          setPublishPromptOpen(false);
        } else if (previewOpen) {
          event.stopPropagation();
          setPreviewOpen(false);
        } else if (colorPaletteOpen) {
          event.stopPropagation();
          setColorPaletteOpen(false);
        } else {
          event.preventDefault();
          setDiscardPromptOpen(true);
        }
      }}
      className='fixed inset-0 z-[70] overflow-hidden bg-black'
    >
      <div
        ref={viewportRef}
        className='relative mx-auto flex h-[100dvh] min-h-0 w-full max-w-md flex-col overflow-hidden'
        style={getBoardStyle(board)}
      >
        <div className='relative z-20 flex shrink-0 items-center justify-between gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]'>
          <button type='button' aria-label='Close' onClick={requestClose} className={iconButton}><X size={24} /></button>
          <div className='flex min-w-0 items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            <button type='button' aria-label='Text size' onClick={() => updateText('size', SIZES[next(SIZES, Math.max(0, SIZES.indexOf(activeText.size)))])} className={iconButton}><CaseSensitive size={24} /></button>
            <button type='button' aria-label='Bold' aria-pressed={activeText.bold} onClick={() => updateText('bold', !activeText.bold)} className={`${iconButton} ${activeText.bold ? 'bg-white/25' : ''}`}><Bold size={20} /></button>
            <button type='button' aria-label='Italic' aria-pressed={activeText.italic} onClick={() => updateText('italic', !activeText.italic)} className={`${iconButton} ${activeText.italic ? 'bg-white/25' : ''}`}><Italic size={20} /></button>
            <button type='button' aria-label='Alignment' onClick={() => updateText('align', ALIGNS[next(ALIGNS, ALIGNS.indexOf(activeText.align))])} className={iconButton}><AlignIcon size={22} /></button>
            <button type='button' aria-label='Change font' onClick={() => updateText('font', BOARD_FONTS[next(BOARD_FONTS, BOARD_FONTS.indexOf(activeText.font))])} className={iconButton}><Type size={22} /></button>
            <button
              type='button'
              aria-label='Preview slides'
              onClick={() => {
                setPreviewIndex(activeIndex);
                setPreviewOpen(true);
              }}
              className={iconButton}
            >
              <Eye size={22} />
            </button>
            <button
              type='button'
              aria-label='Text color'
              aria-expanded={colorPaletteOpen}
              aria-controls='board-text-color-palette'
              onClick={() => setColorPaletteOpen((open) => !open)}
              className={`${iconButton} rounded-full border border-pink-300/70 bg-pink-500/10 shadow-[0_0_12px_rgba(236,72,153,0.18)] focus-visible:ring-pink-300`}
              data-text-color-control
            >
              <span className='h-6 w-6 rounded-full border-2 border-white shadow-sm' style={{ backgroundColor: activeText.color }} />
            </button>
            <button type='button' aria-label='Change background' onClick={updateBoardBackground} className={iconButton}><Palette size={22} /></button>
          </div>
          {colorPaletteOpen && (
            <div
              id='board-text-color-palette'
              role='group'
              aria-label='Text colors'
              data-text-color-control
              className='absolute left-2 right-2 top-full mt-2 flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain touch-pan-x rounded-full border border-white/15 bg-slate-950/95 px-3 py-2 shadow-2xl backdrop-blur-xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {textColors.map((color) => {
                const selected = activeText.color.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type='button'
                    aria-label={`Set text color ${color}`}
                    aria-pressed={selected}
                    title={color}
                    onClick={() => {
                      updateText('color', color);
                      setColorPaletteOpen(false);
                    }}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/25 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-950' : ''}`}
                    style={{ backgroundColor: color }}
                  >
                    {selected && <Check size={13} className='text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]' strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <main className='flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-4'>
          <BoardTextFit
            key={activeIndex}
            board={activeText}
            editable
            onChange={(event) => updateText('text', event.target.value)}
            onFitResult={(result) => updateFitStatus(activeIndex, result)}
          />
        </main>

        <div className='shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2'>
          <div role='tablist' aria-label='Boards in this post' className='mb-2 flex min-w-0 items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            {boards.map((draft, index) => {
              const previewText = getBoardTextElements(draft)[0] || createEmptyText();
              return (
                <button
                  key={index}
                  type='button'
                  role='tab'
                  aria-label={`Edit board ${index + 1}`}
                  aria-selected={activeIndex === index}
                  onClick={() => {
                    setActiveIndex(index);
                    setError('');
                  }}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 outline-none transition focus-visible:ring-2 focus-visible:ring-white/70 ${activeIndex === index ? 'border-white' : 'border-white/25'}`}
                  style={getBoardStyle(draft)}
                >
                  <span
                    className='block h-full w-full overflow-hidden p-1 text-left text-[7px] leading-[1.2]'
                    style={{
                      color: previewText.color,
                      fontFamily: previewText.font,
                      fontWeight: previewText.bold ? 700 : 400,
                      fontStyle: previewText.italic ? 'italic' : 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {previewText.text || `Board ${index + 1}`}
                  </span>
                </button>
              );
            })}
            <button
              type='button'
              aria-label='Add board'
              disabled={boards.length >= MAX_BOARDS || saving}
              onClick={addBoard}
              className='flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-white/40 bg-white/5 text-white transition hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-35'
            >
              <Plus size={22} />
            </button>
          </div>
          <div className='flex items-center justify-between'>
            <div className='min-w-0'>
              <span className='rounded-full bg-black/35 px-4 py-2 text-sm text-white'>Board {activeIndex + 1}/{boards.length}</span>
              <p className='mt-2 text-xs text-white/65'>{activeText.text.length}/400</p>
            </div>
            <div className='flex items-center gap-1'>
              <button
                type='button'
                aria-label='Duplicate slide'
                title='Duplicate slide'
                disabled={boards.length >= MAX_BOARDS || saving}
                onClick={duplicateBoard}
                className={`${iconButton} disabled:opacity-35`}
              >
                <Copy size={19} />
              </button>
              <button
                type='button'
                aria-label='Delete slide'
                title='Delete slide'
                disabled={boards.length <= 1 || saving}
                onClick={deleteBoard}
                className={`${iconButton} disabled:opacity-35`}
              >
                <Trash2 size={19} />
              </button>
            </div>
            <button
              type='button'
              aria-label={shareToStory ? 'Share boards to story' : 'Post boards'}
              title={shareToStory ? 'Share to story' : 'Post boards'}
              disabled={!allBoardsReady || saving}
              onClick={() => {
                if (shareToStory) {
                  void publishBoards(true);
                } else {
                  setPublishPromptOpen(true);
                }
              }}
              className='flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg transition active:scale-95 disabled:opacity-40'
            >
              {saving ? <span className='text-sm font-semibold'>...</span> : <Send size={24} />}
            </button>
          </div>
          {!allBoardsReady && activeText.text.trim() && !textFits && (
            <p role='alert' className='mt-2 rounded-lg border border-amber-300/25 bg-amber-950/35 px-3 py-2 text-sm text-amber-100'>
              This text still does not fit at the smallest size. Shorten the text or remove a line.
            </p>
          )}
          {activeText.text.trim() && textFits && activeFit.fontSize < activeFit.preferredFontSize - 0.5 && (
            <p className='mt-2 rounded-lg bg-black/25 px-3 py-2 text-xs text-white/75'>
              Text was automatically reduced to fit this slide.
            </p>
          )}
          {activeText.text.trim() && textFits && activeFit.fontSize >= activeFit.preferredFontSize - 0.5 && (
            <p className='mt-2 text-xs text-emerald-100/80'>
              Text fits this slide.
            </p>
          )}
          {error && <p role='alert' className='mt-2 rounded-lg bg-black/35 px-3 py-2 text-sm text-white'>{error}</p>}
          {boards.length >= MAX_BOARDS && <p className='mt-2 text-center text-xs text-white/60'>Maximum of {MAX_BOARDS} boards per post.</p>}
        </div>
        {previewOpen && (
          <div
            role='dialog'
            aria-modal='true'
            aria-label={`Preview slide ${previewIndex + 1} of ${boards.length}`}
            className='fixed inset-0 z-[80] overflow-hidden bg-black'
          >
            <div
              className='relative mx-auto flex h-[100dvh] min-h-0 w-full max-w-md flex-col overflow-hidden'
              style={getBoardStyle(boards[previewIndex])}
            >
              <header className='shrink-0 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]'>
                <div className='flex items-center gap-1.5'>
                  {boards.map((_, index) => (
                    <button
                      key={index}
                      type='button'
                      aria-label={`Preview slide ${index + 1}`}
                      aria-current={previewIndex === index ? 'step' : undefined}
                      onClick={() => setPreviewIndex(index)}
                      className='flex h-11 min-w-0 flex-1 items-center'
                    >
                      <span className='h-1 w-full overflow-hidden rounded-full bg-white/35'>
                        <span className={`block h-full rounded-full bg-white ${index <= previewIndex ? 'w-full' : 'w-0'}`} />
                      </span>
                    </button>
                  ))}
                  <button
                    type='button'
                    aria-label='Close preview'
                    onClick={() => setPreviewOpen(false)}
                    className={iconButton}
                  >
                    <X size={22} />
                  </button>
                </div>
              </header>
              <main className='relative min-h-0 flex-1 overflow-hidden'>
                {getBoardTextElements(boards[previewIndex]).map((text, index) => (
                  <div
                    key={`${previewIndex}-${index}`}
                    className='absolute'
                    style={getBoardTextPositionStyle(text)}
                  >
                    <BoardTextFit board={text} />
                  </div>
                ))}
              </main>
              <footer className='flex shrink-0 items-center justify-between gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2'>
                <button
                  type='button'
                  aria-label='Previous preview slide'
                  disabled={previewIndex === 0}
                  onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}
                  className={`${iconButton} bg-black/20 disabled:opacity-30`}
                >
                  <ChevronLeft size={24} />
                </button>
                <span className='text-xs font-medium text-white/75'>{previewIndex + 1} / {boards.length}</span>
                <button
                  type='button'
                  aria-label='Next preview slide'
                  disabled={previewIndex === boards.length - 1}
                  onClick={() => setPreviewIndex((index) => Math.min(boards.length - 1, index + 1))}
                  className={`${iconButton} bg-black/20 disabled:opacity-30`}
                >
                  <ChevronRight size={24} />
                </button>
              </footer>
            </div>
          </div>
        )}
        {publishPromptOpen && !shareToStory && (
          <div
            role='alertdialog'
            aria-modal='true'
            aria-labelledby='publish-board-title'
            aria-describedby='publish-board-description'
            className='fixed inset-0 z-[85] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm'
          >
            <div className='w-full max-w-sm rounded-3xl border border-emerald-300/15 bg-emerald-950 p-5 text-white'>
              <h2 id='publish-board-title' className='text-lg font-semibold'>Ready to post?</h2>
              <p id='publish-board-description' className='mt-2 text-sm leading-6 text-white/70'>
                Post this board, or share it to your story as well.
              </p>
              <div className='mt-6 flex flex-col gap-3'>
                <button
                  type='button'
                  autoFocus
                  disabled={saving}
                  onClick={() => publishBoards(false)}
                  className='w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50'
                >
                  Post
                </button>
                <button
                  type='button'
                  disabled={saving}
                  onClick={() => publishBoards(true)}
                  className='w-full rounded-xl border border-emerald-300/25 bg-emerald-900 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-800 disabled:opacity-50'
                >
                  Share to story
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
        {discardPromptOpen && (
          <div
            role='alertdialog'
            aria-modal='true'
            aria-labelledby='discard-board-title'
            aria-describedby='discard-board-description'
            className='fixed inset-0 z-[90] flex items-center justify-center bg-black/65 px-5 backdrop-blur-md'
          >
            <div             className='w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950 p-5 text-white'>
              <h2 id='discard-board-title' className='text-lg font-semibold'>Discard this board post?</h2>
              <p id='discard-board-description' className='mt-2 text-sm leading-6 text-white/70'>
                Your edits have not been posted. You can continue editing or discard this draft.
              </p>
              <div className='mt-6 flex gap-3'>
                <button
                  type='button'
                  autoFocus
                  onClick={() => setDiscardPromptOpen(false)}
                  className='flex-1 rounded-xl border border-emerald-300/30 bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300'
                >
                  Continue editing
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setDiscardPromptOpen(false);
                    onClose?.();
                  }}
                  className='flex-1 rounded-xl border border-red-300/30 bg-red-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300'
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const BoardViewer = ({ board, boards, initialIndex = 0, onClose, searchTerm = '' }) => {
  const boardList = boards?.length ? boards : [board].filter(Boolean);
  const boardCount = boardList.length;
  const [activeIndex, setActiveIndex] = useState(
    Math.max(0, Math.min(initialIndex, boardCount - 1)),
  );
  const pointerStart = useRef(null);
  const currentBoard = boardList[activeIndex];
  const goTo = (index) => {
    setActiveIndex(Math.max(0, Math.min(index, boardList.length - 1)));
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => Math.min(boardCount - 1, current + 1));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, boardCount, onClose]);

  if (!currentBoard) return null;

  return (
    <div role='dialog' aria-modal='true' aria-label={`Board post ${activeIndex + 1} of ${boardCount}`} className='fixed inset-0 z-[70] overflow-hidden bg-black'>
      <div className='relative mx-auto flex h-[100dvh] min-h-0 w-full max-w-md flex-col overflow-hidden' style={getBoardStyle(currentBoard)}>
        <header className='shrink-0 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]'>
          <div className='flex items-center gap-1.5'>
            {boardList.map((_, index) => (
              <button
                key={index}
                type='button'
                aria-label={`Show board ${index + 1}`}
                aria-current={activeIndex === index ? 'step' : undefined}
                onClick={() => goTo(index)}
                className='flex h-11 min-w-0 flex-1 items-center'
              >
                <span className='h-1 w-full overflow-hidden rounded-full bg-white/35'>
                  <span className={`block h-full rounded-full bg-white ${index <= activeIndex ? 'w-full' : 'w-0'}`} />
                </span>
              </button>
            ))}
            <button type='button' aria-label='Close' onClick={onClose} className={iconButton}><X size={22} /></button>
          </div>
        </header>
        <main
          className='relative min-h-0 flex-1 overflow-hidden'
          style={{ touchAction: 'pan-y' }}
          onPointerDown={(event) => {
            if (event.isPrimary && !event.target.closest('button')) {
              pointerStart.current = { x: event.clientX, id: event.pointerId };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerUp={(event) => {
            if (pointerStart.current?.id !== event.pointerId) return;
            const delta = event.clientX - pointerStart.current.x;
            pointerStart.current = null;
            if (Math.abs(delta) < 48) return;
            goTo(activeIndex + (delta < 0 ? 1 : -1));
          }}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
        >
          {getBoardTextElements(currentBoard).map((text, index) => (
            <div
              key={`${activeIndex}-${index}`}
              className='absolute'
              style={getBoardTextPositionStyle(text)}
            >
              <BoardTextFit
                key={`${activeIndex}-${index}-${text.text}`}
                board={text}
                searchTerm={searchTerm}
              />
            </div>
          ))}
        </main>
        <footer className='flex shrink-0 items-center justify-between gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2'>
          <button
            type='button'
            aria-label='Previous board'
            disabled={activeIndex === 0}
            onClick={() => goTo(activeIndex - 1)}
            className={`${iconButton} bg-black/20 disabled:opacity-30`}
          >
            <ChevronLeft size={24} />
          </button>
          <span className='text-xs font-medium text-white/75'>{activeIndex + 1} / {boardCount}</span>
          <button
            type='button'
            aria-label='Next board'
            disabled={activeIndex === boardCount - 1}
            onClick={() => goTo(activeIndex + 1)}
            className={`${iconButton} bg-black/20 disabled:opacity-30`}
          >
            <ChevronRight size={24} />
          </button>
        </footer>
      </div>
    </div>
  );
};

export { BoardEditor, BoardViewer };
