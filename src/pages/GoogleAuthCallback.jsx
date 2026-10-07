import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThreeDots from '../components/ThreeDots';
import { useAuth } from '../contexts/AuthContext';

const GoogleAuthCallback = () => {
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const [error, setError] = useState(() => (
    new URLSearchParams(window.location.hash.slice(1)).get('token')
      ? ''
      : 'Google sign-up was cancelled or failed.'
  ));

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', '/auth/google/callback');
    if (!token) return;
    localStorage.setItem('token', token);
    refreshSession()
      .then((success) => {
        if (success) navigate('/chat', { replace: true });
        else setError('Could not finish Google sign-up.');
      })
      .catch(() => setError('Could not finish Google sign-up.'));
  }, [navigate, refreshSession]);

  return (
    <main className='min-h-[100dvh] flex items-center justify-center bg-gray-950 text-white p-6'>
      {error ? (
        <div className='text-center space-y-4'>
          <p className='text-red-300'>{error}</p>
          <button
            type='button'
            onClick={() => navigate('/register')}
            className='rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15'
          >
            Back to registration
          </button>
        </div>
      ) : (
        <div className='flex items-center gap-3 text-gray-300'>
          <ThreeDots size='sm' className='text-green-400' />
          Completing Google sign-up…
        </div>
      )}
    </main>
  );
};

export default GoogleAuthCallback;
