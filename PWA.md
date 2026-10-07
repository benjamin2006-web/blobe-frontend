# Offline PWA

The production build discovers and precaches every file under `public/` (except the service worker itself), along with the HTML entry point, generated JavaScript and CSS chunks, and bundled static assets. The shell-cache version is derived from the service-worker source plus the contents and paths of all precached files, so changing a public asset or the worker automatically installs a fresh cache. The service worker keeps its app-shell offline fallback and does not cache API responses or requests carrying an Authorization header. Cached feed/chat data and pending text messages are stored in IndexedDB. Pending direct and group text messages are retried with stable IDs and removed only after the backend acknowledges them. Media uploads and post publishing still require a network connection.

## Run and install locally

```sh
npm install
npm run build
npm run preview -- --host localhost
```

Open `https://localhost:4173` and accept the local self-signed certificate warning (or deploy behind a trusted HTTPS certificate). Localhost is also treated as a secure context by browsers, so it can be used for local development; opening the app on another device over a plain HTTP LAN address generally cannot. When the app is not already installed, a dark glass-style install dialog appears on page load with **Install** and **Cancel** options. Cancel closes the dialog without leaving a fixed install button over the page. On iOS, tap **Install** for instructions, then use Safari's Share menu and select **Add to Home Screen**.

## Verify offline behavior

1. Start the backend and open the preview online; sign in and visit the Chat and Home screens so their data can be cached.
2. Wait for the service worker to finish installing (DevTools → Application → Service Workers) and reload once.
3. In DevTools → Network, select **Offline**, then reload. The app shell should still render; previously cached conversations and feed data remain available.
4. While offline, send a direct or group text message. It appears as pending and survives a reload.
5. Restore the network. The pending count should clear after the server acknowledgement. Verify the recipient receives one copy even if a reconnect retries the queued message.
6. Inspect DevTools → Application → IndexedDB → `datasave-offline` to check `app_data` and the pending/sync queue stores.

Images, voice notes, and creating posts are not queued for offline delivery; their upload workflows require an active network connection.
