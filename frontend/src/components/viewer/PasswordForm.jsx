import { useState } from 'react';
import { toast } from 'sonner';
import { verifyShareLinkPassword } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

export function PasswordForm({ slug, onSuccess }) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await verifyShareLinkPassword(slug, password);
      toast.success('Access granted. Loading document...');
      onSuccess(); // Notify parent to refetch data
    } catch (err) {
      // Error is handled by the global interceptor's toast.
      // We just need to reset the loading state on failure.
      setIsLoading(false);
    }
    // Don't set isLoading to false on success, as the parent will take over.
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
        <h1 className="mb-2 text-center text-2xl font-bold dark:text-white">Password Required</h1>
        <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Please enter the password to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="password" className="dark:text-gray-300">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              placeholder="Enter password"
              autoFocus
            />
          </div>

          <div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Continue'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
