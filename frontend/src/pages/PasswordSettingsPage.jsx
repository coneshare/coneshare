import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { authService } from '../services/authService';
import { setPassword } from '../services/api';

function PasswordSettingsPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setIsSaving(true);
    try {
      await setPassword({
        old_password: currentPassword,
        new_password1: newPassword,
        new_password2: confirmPassword,
      });
      toast.success('Password updated successfully. Please log in again.');
      await authService.logout();
      navigate('/login');
    } catch (error) {
      const apiErrors = error.response?.data || {};
      const formattedErrors = {
        currentPassword: apiErrors.old_password?.join(' '),
        newPassword: apiErrors.new_password1?.join(' '),
        confirmPassword: apiErrors.new_password2?.join(' '),
      };
      setErrors(formattedErrors);
      if (Object.values(formattedErrors).every(v => !v)) {
        toast.error('Failed to update password. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:mx-4 sm:pt-8">
      <Toaster richColors />
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Change Password</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            {errors.currentPassword && <p className="text-sm text-red-500">{errors.currentPassword}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            {errors.newPassword && <p className="text-sm text-red-500">{errors.newPassword}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword}</p>}
          </div>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default PasswordSettingsPage;
