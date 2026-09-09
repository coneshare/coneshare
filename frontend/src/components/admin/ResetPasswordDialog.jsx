import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Eye, EyeOff, Copy, Sparkles, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { resetAdminUserPassword } from '../../services/api';

function getRandomIndex(max) {
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : globalThis.crypto;
  const array = new Uint32Array(1);
  cryptoObj.getRandomValues(array);
  return array[0] % max;
}

function generateSecurePassword(length = 16) {
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const special = '!@#$%^&*-_=+';
  const all = lowercase + uppercase + numbers + special;

  const guaranteed = [
    lowercase[getRandomIndex(lowercase.length)],
    uppercase[getRandomIndex(uppercase.length)],
    numbers[getRandomIndex(numbers.length)],
    special[getRandomIndex(special.length)],
  ];

  const remainingLength = length - guaranteed.length;
  for (let i = 0; i < remainingLength; i++) {
    guaranteed.push(all[getRandomIndex(all.length)]);
  }

  for (let i = guaranteed.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    [guaranteed[i], guaranteed[j]] = [guaranteed[j], guaranteed[i]];
  }

  return guaranteed.join('');
}

export function ResetPasswordDialog({
  isOpen,
  onOpenChange,
  user,
  onSuccess,
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setIsCopied(false);
    }
  }, [isOpen]);

  const handleGenerate = () => {
    const generated = generateSecurePassword(16);
    setPassword(generated);
    setShowPassword(true);
  };

  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setIsCopied(true);
      toast.success(t('admin.passwordCopied', 'Password copied to clipboard'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error(t('common.copyFailed', 'Failed to copy to clipboard'));
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!password || password.length < 8) {
      toast.error(t('admin.passwordMinLength', 'Password must be at least 8 characters.'));
      return;
    }
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      await resetAdminUserPassword(user.id, { password });
      toast.success(t('admin.resetPasswordSuccess', 'Password reset successfully.'));
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled by global interceptor and errorTranslator
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 dark:bg-amber-500/20">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t('admin.resetUserPassword', 'Reset User Password')}</DialogTitle>
              <DialogDescription>
                {t(
                  'admin.resetUserPasswordDesc',
                  'All existing active sessions for this user will be revoked immediately.'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="reset-password-input" className="text-sm font-medium text-foreground">
                {t('settings.newPassword', 'New Password')}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={isSubmitting}
                className="h-7 text-xs text-primary gap-1 px-2"
              >
                <Sparkles className="h-3 w-3" />
                {t('admin.generatePassword', 'Generate')}
              </Button>
            </div>

            <div className="relative flex items-center">
              <Input
                id="reset-password-input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('admin.enterNewPassword', 'Enter at least 8 characters')}
                disabled={isSubmitting}
                className="pr-20"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <div className="absolute right-1 flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting || !password}
                  title={showPassword ? t('common.hide') : t('common.show')}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                  disabled={isSubmitting || !password}
                  title={t('common.copy')}
                >
                  {isCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('admin.passwordRequirement', 'Must be at least 8 characters and not too common.')}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !password}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.saving', 'Saving...')}
                </>
              ) : (
                t('admin.resetPasswordAction', 'Reset Password')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
