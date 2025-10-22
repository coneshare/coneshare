import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { completeDropboxConnect } from '../services/api';

export function DropboxCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error'
  const [error, setError] = useState(null);

  useEffect(() => {
    const completeConnection = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        setError('Missing required parameters from Dropbox.');
        setStatus('error');
        return;
      }

      try {
        await completeDropboxConnect({ code, state });
        setStatus('success');
        // Redirect back to the documents page after a short delay
        setTimeout(() => navigate('/documents'), 2000);
      } catch (err) {
        const errorMessage = err.response?.data?.detail || 'An unknown error occurred.';
        setError(errorMessage);
        setStatus('error');
      }
    };

    completeConnection();
  }, [searchParams, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md dark:bg-gray-800">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h2 className="mt-4 text-xl font-semibold">Connecting to Dropbox...</h2>
            <p className="mt-2 text-muted-foreground">Please wait while we securely connect your account.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h2 className="text-xl font-semibold text-green-600">Successfully Connected!</h2>
            <p className="mt-2 text-muted-foreground">You will be redirected back to your documents shortly.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h2 className="text-xl font-semibold text-destructive">Connection Failed</h2>
            <p className="mt-2 text-muted-foreground">{error}</p>
            <Link to="/documents" className="mt-6 inline-block text-primary hover:underline">
              Go back to Documents
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
