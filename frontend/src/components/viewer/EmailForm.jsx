import { useState } from 'react';
import { toast } from 'sonner';
import { requestShareLinkAccess } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

export function EmailForm({ slug, onSuccess }) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await requestShareLinkAccess(slug, email);
      toast.success(response.data.message);
      
      if (response.data.verification_required) {
        setHasSubmitted(true); // Show "check your email" message
      } else {
        onSuccess(); // No verification needed, grant access immediately
      }
    } catch (err) {
      // Error is handled by the global interceptor's toast.
      setIsLoading(false);
    }
  };

  if (hasSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
        <div className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow-md dark:bg-gray-800">
          <h1 className="mb-2 text-2xl font-bold dark:text-white">Check Your Email</h1>
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            A verification link has been sent to <strong>{email}</strong>. Please click the link to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
        <h1 className="mb-2 text-center text-2xl font-bold dark:text-white">Email Required</h1>
        <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
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
