import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { createDataroom } from '../../services/api';

export function AddDataroomDialog({ isOpen, onOpenChange, onSuccess }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await createDataroom({ name: trimmedName });
      toast.success(t('datarooms.createSuccess'));
      onSuccess?.();
      setName('');
      onOpenChange(false);
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isSubmitting) {
        onOpenChange(open);
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('datarooms.addTitle')}</DialogTitle>
          <DialogDescription>
            {t('datarooms.addDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-dataroom-form"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                {t('datarooms.nameLabel')}
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                placeholder={t('datarooms.namePlaceholder')}
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>
        </form>
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
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="add-dataroom-form"
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('datarooms.creating')}
              </>
            ) : (
              t('datarooms.create')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
