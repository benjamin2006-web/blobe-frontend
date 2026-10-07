import axios from 'axios';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL } from '../utils/apiUrl';
import { cache } from '../utils/offlineCache';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const USER_CACHE_KEY = 'nc_current_user';

const isNetworkError = (err) => !err.response; // no HTTP response = connection refused / offline

const getCachedUser = () => {
  try {
    const cached = localStorage.getItem(USER_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getCachedUser);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let active = true;
    const messageWorker = (worker) => {
      if (!active || !worker) return;
      worker.postMessage(
        token
          ? { type: 'SET_MEDIA_AUTH_TOKEN', token }
          : { type: 'CLEAR_MEDIA_CACHE' },
      );
    };
    const onControllerChange = () => messageWorker(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    messageWorker(navigator.serviceWorker.controller);
    navigator.serviceWorker.ready
      .then((registration) => messageWorker(registration.active))
      .catch((error) => console.error('Media cache worker is unavailable:', error));

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, [token]);

  const api = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` },
  });

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      const userData = response.data.user;
      setUser(userData);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
    } catch (error) {
      if (isNetworkError(error)) {
        // Server is down or device is offline — load cached profile, keep token
        const cached = localStorage.getItem(USER_CACHE_KEY);
        if (cached) {
          try {
            setUser(JSON.parse(cached));
            return;
          } catch {}
        }
        // No cached profile yet — keep token so we can retry when server is back
        // (app will show nothing useful but at least won't log the user out)
        return;
      }
      if (error.response?.status === 401) {
        // Token is invalid or expired (e.g. the server rotated its JWT signing
        // secret). Keeping it would leave every request and every socket
        // reconnect failing forever — drop it and show the login screen.
        localStorage.removeItem('token');
        localStorage.removeItem(USER_CACHE_KEY);
        cache.clearAll();
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_MEDIA_CACHE' });
        setToken(null);
        setUser(null);
        return;
      }
      // Temporary server failure (5xx) — keep the session.
      const cached = getCachedUser();
      if (cached) setUser(cached);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const initializeOfflineData = async () => {
      try {
        await cache.hydrate();
      } catch (error) {
        console.error('Could not hydrate offline app data:', error);
      }
      if (!active) return;
      if (token) {
        void fetchUser();
      } else {
        setLoading(false);
      }
    };
    void initializeOfflineData();
    return () => {
      active = false;
    };
  }, [token]);

  const refreshSession = useCallback(async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) return false;
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      const userData = response.data.user;
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
      setUser(userData);
      setToken(storedToken);
      return true;
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_MEDIA_CACHE' });
        setToken(null);
        setUser(null);
      }
      return false;
    }
  }, []);

  const login = async (identifier, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        identifier,
        password,
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
      setToken(token);
      setUser(user);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
        status: error.response?.status,
      };
    }
  };

  const register = async (username, email, password, dateOfBirth, isPrivate = false, phone = '') => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        username,
        // Only include email when actually provided — omitting the key entirely
        // prevents the backend from receiving an empty string or null
        ...(email && email.trim() ? { email: email.trim() } : {}),
        password,
        dateOfBirth: dateOfBirth || undefined,
        isPrivate,
        phone,
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
      setToken(token);
      setUser(user);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const logout = async () => {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_MEDIA_CACHE' });
    try {
      if (token) await api.post('/auth/logout');
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem(USER_CACHE_KEY);
    cache.clearAll();
    setToken(null);
    setUser(null);
  };

  const updateUser = (fields) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...fields };
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{ user, login, register, logout, loading, token, updateUser, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
};
