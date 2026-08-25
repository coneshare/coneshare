import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

export function ConfirmationDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText,
  cancelText,
  variant = "destructive",
  isLoading: externalIsLoading,
}) {
  const { t } = useTranslation();
  const [internalIsLoading, setInternalIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInternalIsLoading(false);
    }
  }, [isOpen]);

  const isSubmitting = Boolean(externalIsLoading || internalIsLoading);
  const actualConfirmText = confirmText || t('common.save');
  const actualCancelText = cancelText || t('common.cancel');

  const handleConfirm = async (e) => {
    if (isSubmitting) return;
    setInternalIsLoading(true);
    try {
      await onConfirm?.(e);
    } finally {
      setInternalIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isSubmitting) {
        onOpenChange(open);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!isSubmitting) {
                onOpenChange(false);
              }
            }}
            disabled={isSubmitting}
          >
            {actualCancelText}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {actualConfirmText}
              </>
            ) : (
              actualConfirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
