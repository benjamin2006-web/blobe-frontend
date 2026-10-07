// Use the Vite HTTPS proxy when the app is opened over HTTPS to avoid
// mixed-content blocking on other devices.
const hostname = window.location.hostname;
const backendUrl = `${window.location.protocol}//${hostname}:5000`;
const proxiedUrl = window.location.origin;

export const API_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol === 'https:' ? proxiedUrl : backendUrl}/api`;
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (window.location.protocol === 'https:' ? proxiedUrl : backendUrl);
