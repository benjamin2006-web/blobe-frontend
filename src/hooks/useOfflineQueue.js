import { useCallback, useEffect, useState } from 'react';
import {
  getQueueActions,
  putQueueAction,
  removeQueueAction,
  updateQueueAction,
} from '../utils/offlineDb';

const LEGACY_QUEUE_KEY = 'offline_message_queue';
const QUEUE_EVENT = 'datasave-queue-updated';

const readLegacyQueue = () => {
  try {
    const value = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error('Could not read legacy offline message queue:', error);
    return [];
  }
};

const notifyQueueChanged = (syncStatus) =>
  window.dispatchEvent(
    new CustomEvent(QUEUE_EVENT, { detail: { syncStatus } }),
  );

const updateLocalFallbackQueue = (updater) => {
  const current = readLegacyQueue();
  localStorage.setItem(LEGACY_QUEUE_KEY, JSON.stringify(updater(current)));
  notifyQueueChanged();
};

const safelyUpdateFallbackQueue = (updater, operation) => {
  try {
    updateLocalFallbackQueue(updater);
  } catch (error) {
    console.error(`Could not ${operation} in the local fallback queue:`, error);
  }
};

export const useOfflineQueue = () => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState(() =>
    navigator.onLine ? 'idle' : 'offline',
  );

  const refreshPendingCount = useCallback(async () => {
    try {
      const actions = await getQueueActions();
      setPendingCount(actions.length + readLegacyQueue().length);
    } catch (error) {
      console.error('Could not refresh offline queue status:', error);
      setPendingCount(readLegacyQueue().length);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      setSyncStatus('idle');
    };
    const onOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const initializeQueue = async () => {
      try {
        const legacyItems = readLegacyQueue();
        if (legacyItems.length) {
          const actions = await getQueueActions();
          const knownIds = new Set(actions.map((item) => item.tempId));
          for (const item of legacyItems) {
            if (!knownIds.has(item.tempId)) {
              await putQueueAction({
                ...item,
                tempId:
                  item.tempId ||
                  `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                queuedAt: item.queuedAt || Date.now(),
              });
            }
          }
          localStorage.removeItem(LEGACY_QUEUE_KEY);
        }
      } catch (error) {
        console.error('Could not migrate offline actions to IndexedDB:', error);
      }
      if (active) await refreshPendingCount();
    };
    void initializeQueue();
    const handleQueueChanged = (event) => {
      void refreshPendingCount();
      if (event.detail?.syncStatus) setSyncStatus(event.detail.syncStatus);
    };
    window.addEventListener(QUEUE_EVENT, handleQueueChanged);
    return () => {
      active = false;
      window.removeEventListener(QUEUE_EVENT, handleQueueChanged);
    };
  }, [refreshPendingCount]);

  const enqueue = useCallback(async (item) => {
    const entry = {
      ...item,
      tempId:
        item.tempId ||
        `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      queuedAt: item.queuedAt || Date.now(),
      status: 'pending',
      attempts: 0,
    };
    try {
      await putQueueAction(entry);
    } catch (error) {
      console.error('IndexedDB could not store a pending action; using local fallback:', error);
      try {
        updateLocalFallbackQueue((queue) => [...queue, entry]);
      } catch (fallbackError) {
        console.error('Could not persist offline action:', fallbackError);
        throw fallbackError;
      }
    }
    notifyQueueChanged();
    return entry.tempId;
  }, []);

  const getQueue = useCallback(async () => {
    try {
      const actions = await getQueueActions();
      const queue = [...actions];
      const knownIds = new Set(actions.map((item) => item.tempId));
      readLegacyQueue().forEach((item) => {
        if (!knownIds.has(item.tempId)) queue.push(item);
      });
      return queue.sort((a, b) => a.queuedAt - b.queuedAt);
    } catch (error) {
      console.error('Could not load offline actions from IndexedDB:', error);
      return readLegacyQueue();
    }
  }, []);

  const setSynced = useCallback(() => {
    setSyncStatus('synced');
    notifyQueueChanged('synced');
  }, []);

  const acknowledge = useCallback(async (tempId) => {
    try {
      await removeQueueAction(tempId);
    } catch (error) {
      console.error('Could not acknowledge synced offline action:', error);
      safelyUpdateFallbackQueue((queue) =>
        queue.filter((item) => item.tempId !== tempId),
        'acknowledge the action',
      );
    }
    safelyUpdateFallbackQueue((queue) =>
      queue.filter((item) => item.tempId !== tempId),
      'remove the acknowledged action',
    );
    notifyQueueChanged();
    try {
      const remaining = await getQueueActions();
      if (remaining.length + readLegacyQueue().length === 0) {
        setSynced();
      }
    } catch (error) {
      console.error('Could not verify offline queue completion:', error);
    }
  }, [setSynced]);

  const markSyncing = useCallback(async (tempId) => {
    try {
      await updateQueueAction(tempId, { status: 'syncing' });
    } catch (error) {
      console.error('Could not mark offline action as syncing:', error);
    }
    safelyUpdateFallbackQueue((queue) =>
      queue.map((item) =>
        item.tempId === tempId ? { ...item, status: 'syncing' } : item,
      ),
      'mark the action as syncing',
    );
    notifyQueueChanged();
    setSyncStatus('syncing');
    notifyQueueChanged('syncing');
  }, []);

  const markRetry = useCallback(async (tempId, error) => {
    try {
      const queue = await getQueueActions();
      const item = queue.find((entry) => entry.tempId === tempId);
      if (item) {
        await updateQueueAction(tempId, {
          status: 'pending',
          attempts: (item.attempts || 0) + 1,
          lastError: error?.message || 'Sync failed',
          nextAttemptAt: Date.now() + Math.min(60_000, 1000 * 2 ** (item.attempts || 0)),
        });
      }
    } catch (storageError) {
      console.error('Could not schedule an offline action retry:', storageError);
    }
    safelyUpdateFallbackQueue((queue) =>
      queue.map((item) =>
        item.tempId === tempId
          ? {
              ...item,
              status: 'pending',
              attempts: (item.attempts || 0) + 1,
              lastError: error?.message || 'Sync failed',
              nextAttemptAt: Date.now() + 1000,
            }
          : item,
      ),
      'schedule the action retry',
    );
    notifyQueueChanged();
    setSyncStatus('error');
    notifyQueueChanged('error');
  }, []);

  return {
    isOnline,
    pendingCount,
    syncStatus,
    enqueue,
    getQueue,
    acknowledge,
    markSyncing,
    markRetry,
    setSynced,
  };
};
