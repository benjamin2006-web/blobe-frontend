const DATABASE_NAME = 'datasave-offline';
const DATABASE_VERSION = 1;

const STORES = {
  users: 'users',
  appData: 'app_data',
  pendingActions: 'pending_actions',
  syncQueue: 'sync_queue',
  settings: 'settings',
};

let databasePromise;

const openDatabase = () => {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not supported by this browser.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      Object.values(STORES).forEach((name) => {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: name === STORES.appData || name === STORES.settings ? 'key' : 'id' });
        }
      });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Could not open offline storage.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Offline storage upgrade is blocked by another app tab.'));
    };
  });
  return databasePromise;
};

const runTransaction = async (storeNames, mode, run) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    let result;
    try {
      result = run(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () =>
      reject(transaction.error || new Error('Offline storage transaction was aborted.'));
    transaction.onerror = () =>
      reject(transaction.error || new Error('Offline storage transaction failed.'));
  });
};

const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Offline storage request failed.'));
  });

export const getAppData = async (key) =>
  runTransaction([STORES.appData], 'readonly', (transaction) =>
    requestResult(transaction.objectStore(STORES.appData).get(key)),
  );

export const getAllAppData = async () =>
  runTransaction([STORES.appData], 'readonly', (transaction) =>
    requestResult(transaction.objectStore(STORES.appData).getAll()),
  );

export const putAppData = async (key, value) =>
  runTransaction([STORES.appData], 'readwrite', (transaction) =>
    transaction.objectStore(STORES.appData).put({
      key,
      value,
      updatedAt: Date.now(),
    }),
  );

export const putQueueAction = async (action) => {
  const record = {
    ...action,
    id: action.tempId,
    status: 'pending',
    attempts: action.attempts || 0,
    updatedAt: Date.now(),
  };
  return runTransaction(
    [STORES.pendingActions, STORES.syncQueue],
    'readwrite',
    (transaction) => {
      transaction.objectStore(STORES.pendingActions).put(record);
      transaction.objectStore(STORES.syncQueue).put(record);
    },
  );
};

export const getQueueActions = async () =>
  runTransaction([STORES.syncQueue], 'readonly', (transaction) =>
    requestResult(transaction.objectStore(STORES.syncQueue).getAll()),
  ).then((records) => records.sort((a, b) => a.queuedAt - b.queuedAt));

export const updateQueueAction = async (id, changes) =>
  runTransaction(
    [STORES.pendingActions, STORES.syncQueue],
    'readwrite',
    (transaction) => {
      [STORES.pendingActions, STORES.syncQueue].forEach((name) => {
        const store = transaction.objectStore(name);
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) {
            store.put({ ...request.result, ...changes, updatedAt: Date.now() });
          }
        };
      });
    },
  );

export const removeQueueAction = async (id) =>
  runTransaction(
    [STORES.pendingActions, STORES.syncQueue],
    'readwrite',
    (transaction) => {
      transaction.objectStore(STORES.pendingActions).delete(id);
      transaction.objectStore(STORES.syncQueue).delete(id);
    },
  );

export const clearOfflineUserData = async () =>
  runTransaction(
    [
      STORES.users,
      STORES.appData,
      STORES.pendingActions,
      STORES.syncQueue,
      STORES.settings,
    ],
    'readwrite',
    (transaction) => {
      Object.values(STORES).forEach((name) => transaction.objectStore(name).clear());
    },
  );

export const hydrateLocalCache = async () => {
  const records = await getAllAppData();
  records.forEach(({ key, value, updatedAt }) => {
    const storageKey = `nc_cache_${key}`;
    const current = window.localStorage.getItem(storageKey);
    let currentUpdatedAt = 0;
    try {
      currentUpdatedAt = JSON.parse(current)?.ts || 0;
    } catch (error) {
      console.warn(`Could not read local offline cache entry "${key}":`, error);
    }
    if (current === null || currentUpdatedAt < (updatedAt || 0)) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
      } catch (error) {
        console.error(`Could not hydrate offline cache entry "${key}":`, error);
      }
    }
  });
};
