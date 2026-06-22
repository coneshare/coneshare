import { useState } from 'react';
import { toast } from 'sonner';
import { requestShareLinkAccess, verifyShareLinkCode } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { AccessOwnerCard } from './AccessOwnerCard';

export function EmailForm({ slug, onSuccess, publicMeta = null }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await requestShareLinkAccess(slug, email);
      toast.success(response.data.message);
      
      if (response.data.verification_required) {
        setHasSubmitted(true);
      } else {
        onSuccess();
      }
    } catch (err) {
      // Error is handled by the global interceptor's toast.
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setIsVerifying(true);

    try {
      const response = await verifyShareLinkCode(slug, email, code);
      toast.success(response.data.message || 'Email verified successfully.');
      onSuccess();
    } catch (err) {
      // Error is handled by the global interceptor's toast.
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsLoading(true);
    try {
      const response = await requestShareLinkAccess(slug, email);
      toast.success(response.data.message);
      setCode('');
    } catch (err) {
      // Error is handled by the global interceptor's toast.
    } finally {
      setIsLoading(false);
    }
  };

  if (hasSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
        <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
          <AccessOwnerCard publicMeta={publicMeta} />
          {!publicMeta ? (
            <h1 className="mb-2 text-left text-2xl font-bold dark:text-white">Verify Your Email</h1>
          ) : null}
          <p className="mb-6 text-left text-sm text-gray-600 dark:text-gray-400">
            A 6-digit verification code has been sent to <strong>{email}</strong>. Please enter the code below to continue.
          </p>
          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <Label htmlFor="code" className="dark:text-gray-300">
                Verification Code
              </Label>
              <Input
                id="code"
                name="code"
                type="text"
                required
                maxLength={6}
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="mt-1 text-center font-mono text-xl tracking-widest"
                placeholder="000000"
                autoFocus
              />
            </div>
            <div className="space-y-3">
              <Button type="submit" className="w-full" disabled={isVerifying || isLoading}>
                {isVerifying ? 'Verifying...' : 'Verify'}
              </Button>
              <div className="flex justify-between items-center text-sm">
                <button
                  type="button"
                  onClick={() => setHasSubmitted(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  disabled={isVerifying || isLoading}
                >
                  Change Email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                  disabled={isVerifying || isLoading}
                >
                  {isLoading ? 'Sending...' : 'Resend Code'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
        <AccessOwnerCard publicMeta={publicMeta} />
        {!publicMeta ? (
          <h1 className="mb-2 text-left text-2xl font-bold dark:text-white">Email Required</h1>
        ) : null}
        <p className="mb-6 text-left text-sm text-gray-600 dark:text-gray-400">
          Please enter your email address to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="email" className="dark:text-gray-300">
              Email Address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
              placeholder="Enter your email"
              autoFocus
            />
          </div>
          <div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Submitting...' : 'Continue'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
