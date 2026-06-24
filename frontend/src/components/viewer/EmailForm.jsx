import { useState } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { requestShareLinkAccess, confirmShareLinkEmailAccess } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { AccessOwnerCard } from './AccessOwnerCard';

export function EmailForm({
  slug,
  onSuccess,
  publicMeta = null,
  requiresConfirmation = false,
  emailToConfirm = '',
  token = '',
}) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [localRequiresConfirmation, setLocalRequiresConfirmation] = useState(requiresConfirmation);

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

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const response = await confirmShareLinkEmailAccess(slug, token);
      toast.success(response.data.message);
      onSuccess();
    } catch (err) {
      setIsLoading(false);
    }
  };

  if (localRequiresConfirmation && emailToConfirm) {
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
            You are verifying access to this document as <strong className="break-all text-gray-900">{emailToConfirm}</strong>.
          </p>
          <div className="space-y-4">
            <Button onClick={handleConfirm} size="lg" className="w-full active:scale-[0.98] transition-transform" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Continue to Document'}
            </Button>
            <div className="text-center">
              <button
                onClick={() => setLocalRequiresConfirmation(false)}
                className="text-xs font-semibold text-blue-600 hover:underline"
                disabled={isLoading}
              >
                Use a different email address
              </button>
            </div>
          </div>
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

  if (hasSubmitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg border border-gray-100/80 animate-fadeIn">
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

          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Mail className="h-6 w-6" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Check Your Email</h1>
          <p className="mb-6 text-sm text-gray-500 leading-relaxed">
            A verification link has been sent to <strong className="text-gray-900">{email}</strong>. Please click the link in the email to continue.
          </p>
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
          This secure link requires email verification. Enter your email below to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-semibold text-gray-600">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                placeholder="Enter your email"
                autoFocus
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" size="lg" className="w-full active:scale-[0.98] transition-transform" disabled={isLoading}>
              {isLoading ? 'Submitting...' : 'Continue'}
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
