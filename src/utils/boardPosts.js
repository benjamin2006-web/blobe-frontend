import { API_URL } from './apiUrl';

const dispatchPostUploaded = (post) => {
  window.dispatchEvent(new CustomEvent('post-uploaded', { detail: post }));
};

export const createBoardPost = async (token, boards, { shareToStory = false } = {}) => {
  const persistedBoards = boards.map((board) => {
    const firstText = board.texts?.[0];
    return firstText ? { ...board, ...firstText } : board;
  });
  const response = await fetch(`${API_URL}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mediaType: 'board',
      shareToStory,
      ...(persistedBoards.length === 1 ? { board: persistedBoards[0] } : { boards: persistedBoards }),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Could not create board post.');
  }
  dispatchPostUploaded(data.post);
  return data.post;
};
