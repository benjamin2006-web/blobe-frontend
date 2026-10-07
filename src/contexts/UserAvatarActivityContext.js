import { createContext, useContext } from 'react';

export const UserAvatarActivityContext = createContext({});

const EMPTY_ACTIVITY = { unseen: [], viewed: [] };

export const useUserAvatarActivity = (user) => {
  const counts = useContext(UserAvatarActivityContext);
  const userId = user?._id ?? user?.id ?? user?.userId;
  return userId == null ? EMPTY_ACTIVITY : counts[String(userId)] || EMPTY_ACTIVITY;
};
