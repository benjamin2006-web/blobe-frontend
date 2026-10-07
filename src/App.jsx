import { lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { loadChatPage } from './loadChatPage';
import ChatLoadingFallback from './components/ChatLoadingFallback';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import PrivateRoute from './components/PrivateRoute';
import PublicRoute from './components/PublicRoute';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import UnreadAppBadge from './components/UnreadAppBadge';
import UnreadCountsProvider from './contexts/UnreadCountsProvider';
import PostUploadProvider from './contexts/PostUploadProvider';
import UserAvatarActivityProvider from './contexts/UserAvatarActivityProvider';
import AvatarActionProvider from './components/AvatarActionProvider';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const GoogleAuthCallback = lazy(() => import('./pages/GoogleAuthCallback'));
const Chat = lazy(loadChatPage);
const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

const AppRouteFallback = () => {
  const { pathname } = useLocation();
  if (pathname === '/chat') return <ChatLoadingFallback />;
  return (
    <div
      className='flex min-h-screen items-center justify-center bg-gray-950 text-sm text-gray-400'
      role='status'
    >
      Loading…
    </div>
  );
};

function App() {
  return (
    <>
      <PWAInstallPrompt />
      <Router>
        <AuthProvider>
          <SocketProvider>
            <PostUploadProvider>
              <UserAvatarActivityProvider>
                <AvatarActionProvider>
                  <UnreadCountsProvider>
                    <UnreadAppBadge />
                    <Suspense fallback={<AppRouteFallback />}>
                      <Routes>
                        <Route
                          path="/login"
                          element={<PublicRoute><Login key="login" /></PublicRoute>}
                        />
                        <Route
                          path="/forgot-password"
                          element={<PublicRoute><Login key="forgot-password" /></PublicRoute>}
                        />
                        <Route path="/register" element={<Register />} />
                        <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
                        <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
                        <Route path="/home" element={<PrivateRoute><Home /></PrivateRoute>} />
                        <Route path="/dashboard/:userId" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                        <Route path="/" element={<Navigate to="/chat" />} />
                        {/* All settings are now inside the Settings modal — no separate routes needed */}
                      </Routes>
                    </Suspense>
                  </UnreadCountsProvider>
                </AvatarActionProvider>
              </UserAvatarActivityProvider>
            </PostUploadProvider>
          </SocketProvider>
        </AuthProvider>
      </Router>
    </>
  );
}

export default App;
