import { useContext } from 'react';
import { UnreadCountsContext } from './UnreadCountsContext';

export const useUnreadCounts = () => {
  const context = useContext(UnreadCountsContext);
  if (!context) {
    throw new Error('useUnreadCounts must be used within UnreadCountsProvider');
  }
  return context;
};
