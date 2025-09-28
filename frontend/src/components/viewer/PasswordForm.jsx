import * as React from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

// NOTE: This is a placeholder component for V1.
// The full password verification flow will be implemented in a future version.
// This will involve submitting the password to an API endpoint that can
// validate it and return a short-lived session token for viewing.

export function PasswordForm({ slug }) {
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    // In the future, this will call an API to verify the password.
    // For now, it just simulates a network request and does nothing on completion.
    console.log('Attempting password verification for:', slug);
    setTimeout(() => setIsSubmitting(false), 2000);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-4 text-center text-2xl font-bold">Password Required</h1>
        <p className="mb-6 text-center text-sm text-gray-600">
          Please enter the password to view this document.
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying...' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
