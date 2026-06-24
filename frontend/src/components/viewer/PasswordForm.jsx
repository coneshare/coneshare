import { useState } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { verifyShareLinkPassword } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { AccessOwnerCard } from './AccessOwnerCard';

export function PasswordForm({ slug, onSuccess, publicMeta = null }) {
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg border border-gray-100/80 animate-fadeIn">
        {/* Section 1: Logo */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Coneshare Logo" className="h-8 w-8" />
            <span className="text-xl font-bold tracking-tight text-gray-900">Coneshare</span>
          </div>
          <p className="mt-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Secure File Share
          </p>
        </div>

        {/* Section 2: Owner & Document Info */}
        <AccessOwnerCard publicMeta={publicMeta} />

        {/* Section 3: Verification Methods */}
        <p className="mb-6 text-left text-sm text-gray-500">
          This secure link is password protected. Enter the password below to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-semibold text-gray-600">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                placeholder="Enter password"
                autoFocus
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" size="lg" className="w-full active:scale-[0.98] transition-transform" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Unlock Document'}
            </Button>
          </div>
        </form>
      </div>

      {/* Footer Links */}
      <div className="mt-6 flex items-center justify-center gap-3 text-xs text-gray-400">
        <a
          href="https://www.coneshare.com/about"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          About Coneshare
        </a>
        <span className="text-gray-300">&bull;</span>
        <a
          href="https://www.coneshare.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          Terms
        </a>
        <span className="text-gray-300">&bull;</span>
        <a
          href="https://www.coneshare.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          Privacy Policy
        </a>
      </div>
    </div>
  );
}
