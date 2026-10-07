import { createContext, useContext } from 'react';

export const PostUploadContext = createContext(null);

export const usePostUpload = () => {
  const context = useContext(PostUploadContext);
  if (!context) {
    throw new Error('usePostUpload must be used within PostUploadProvider');
  }
  return context;
};
