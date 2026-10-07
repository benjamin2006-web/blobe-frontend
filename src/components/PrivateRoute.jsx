import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThreeDots from './ThreeDots';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-gray-900">
        <h1 className="text-xl font-extrabold">
          <span className="text-white">Blo</span><span className="text-emerald-400">be</span>
        </h1>
        <ThreeDots size="md" className="text-emerald-400" />
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
};

export default PrivateRoute;
