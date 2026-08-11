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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createDataroom } from '../../services/api';

export function AddDataroomDialog({ isOpen, onOpenChange, onSuccess }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Dataroom name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    try {
      await createDataroom({ name });
      toast.success('Dataroom created successfully.');
      onSuccess();
      setName('');
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
          <Button type="submit" form="add-dataroom-form" disabled={isSubmitting}>
            {isSubmitting ? t('datarooms.creating') : t('datarooms.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
