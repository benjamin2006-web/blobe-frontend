export const BOARD_BACKGROUNDS = [
  { backgroundColor: '#128c7e' },
  { backgroundColor: '#1f3a2e' },
  { backgroundColor: '#7e57c2' },
  { backgroundColor: '#e91e63' },
  { backgroundColor: '#f4511e' },
  { backgroundColor: '#1e88e5' },
  { backgroundColor: '#121218' },
  { backgroundColor: '#f5f1e6' },
  { backgroundImage: 'linear-gradient(135deg,#ff7e5f,#feb47b)' },
  { backgroundImage: 'linear-gradient(135deg,#2193b0,#6dd5ed)' },
  { backgroundImage: 'linear-gradient(135deg,#667eea,#764ba2)' },
  {
    backgroundColor: '#fffdf5',
    backgroundImage: 'repeating-linear-gradient(transparent 0 31px, #b9d3ee 31px 32px)',
  },
];

const FONTS = [
  'system-ui, sans-serif',
  "'Caveat', cursive",
  "'Merriweather', Georgia, serif",
  "'Playfair Display', Georgia, serif",
  "'Space Mono', monospace",
  "'Bebas Neue', Impact, sans-serif",
];
const REF_WIDTH = 448;
const cqw = (px) => `${(px / REF_WIDTH) * 100}cqw`;

export const getBoardStyle = (board) => ({
  containerType: 'inline-size',
  ...BOARD_BACKGROUNDS[board?.backgroundIndex ?? 0],
});

export const getBoardTextElements = (board) => (
  board?.texts?.length
    ? board.texts
    : board?.text
      ? [{
          text: board.text,
          font: board.font,
          color: board.color,
          size: board.size,
          align: board.align,
          bold: board.bold,
          italic: board.italic,
          positionX: board.positionX,
          positionY: board.positionY,
        }]
      : []
);

export const getBoardTextPositionStyle = (board) => {
  const legacyPosition = board?.positionX == null && board?.positionY == null;
  const positionX = legacyPosition ? 50 : board.positionX ?? 50;
  const positionY = legacyPosition ? 50 : board.positionY ?? 50;
  return {
    position: 'absolute',
    left: `${positionX}%`,
    top: `${positionY}%`,
    width: '88%',
    height: '84%',
    transform: 'translate(-50%, -50%)',
  };
};

export const getBoardTextStyle = (board) => ({
  fontFamily: board?.font || FONTS[0],
  color: board?.color || '#ffffff',
  fontSize: cqw(board?.size || 40),
  textAlign: board?.align || 'center',
  fontWeight: board?.bold ? 700 : 400,
  fontStyle: board?.italic ? 'italic' : 'normal',
  lineHeight: 1.25,
});

export const BOARD_FONTS = FONTS;
