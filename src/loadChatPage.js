let chatPagePromise;

export const loadChatPage = () => {
  if (!chatPagePromise) {
    chatPagePromise = import('./pages/Chat').catch((error) => {
      chatPagePromise = null;
      throw error;
    });
  }
  return chatPagePromise;
};
