import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Loader2, Sparkles } from 'lucide-react';
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
import { Progress } from '../ui/Progress';
import { formatBytes } from '../../lib/formatters';
import { updateAdminDataroom } from '../../services/api';

const PRESETS = [
  { label: 'Unlimited', value: 0 },
  { label: '500 MB', value: 500 },
  { label: '1 GB', value: 1024 },
  { label: '5 GB', value: 5120 },
  { label: '10 GB', value: 10240 },
];

export function AdjustStorageQuotaDialog({
  isOpen,
  onOpenChange,
  dataroom,
  onSuccess,
}) {
  const { t } = useTranslation();
  const [quotaMb, setQuotaMb] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && dataroom) {
      setQuotaMb(dataroom.storage_quota_mb ?? 0);
    }
  }, [isOpen, dataroom]);

  const handlePresetClick = (val) => {
    setQuotaMb(val);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!dataroom?.id) return;

    const parsed = Number(quotaMb);
    if (
      quotaMb === '' ||
      quotaMb === null ||
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > 1048576
    ) {
      toast.error(t('admin.dataroomsInvalidQuota'));
      return;
    }

    setIsSubmitting(true);
    try {
      await updateAdminDataroom(dataroom.id, { storage_quota_mb: parsed });
      toast.success(t('admin.dataroomsQuotaUpdatedSuccess'));
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled by api interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentUsedBytes = dataroom?.storage_used_bytes || 0;
  const currentQuotaMb = parseInt(quotaMb, 10) || 0;
  const currentQuotaBytes = currentQuotaMb * 1024 * 1024;
  const usagePercentage = currentQuotaBytes > 0 ? Math.min((currentUsedBytes / currentQuotaBytes) * 100, 100) : 0;

  let progressColor = 'bg-emerald-500';
  if (usagePercentage > 90) {
    progressColor = 'bg-rose-500';
  } else if (usagePercentage > 70) {
    progressColor = 'bg-amber-500';
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <HardDrive className="h-5 w-5 text-primary" />
            {t('admin.adjustQuotaTitle')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {t('admin.adjustQuotaDesc', {
              name: dataroom?.name,
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} noValidate className="p-6 space-y-5">
          {/* Current Usage Preview */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">{t('admin.currentStorageUsage')}</span>
              <span className="font-semibold text-foreground">{formatBytes(currentUsedBytes)}</span>
            </div>
            {currentQuotaMb > 0 ? (
              <>
                <Progress value={usagePercentage} className="h-2" indicatorClassName={progressColor} />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{usagePercentage.toFixed(1)}% {t('admin.used')}</span>
                  <span>{currentQuotaMb} MB {t('admin.limit')}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                {t('admin.unlimitedCapacityNote')}
              </p>
            )}
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {t('admin.quickPresets')}
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    parseInt(quotaMb, 10) === preset.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground hover:bg-muted border-border'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Numeric Input */}
          <div className="space-y-1.5">
            <label htmlFor="quota_mb" className="text-sm font-medium">
              {t('admin.storageQuotaMbLabel')}
            </label>
            <Input
              id="quota_mb"
              type="number"
              min="0"
              max="1048576"
              value={quotaMb}
              onChange={(e) => setQuotaMb(e.target.value)}
              placeholder="0"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              {t('admin.quotaHelpText')}
            </p>
          </div>

          <DialogFooter className="pt-2 border-t flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
