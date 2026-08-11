import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

export function AddFolderDialog({ isOpen, onOpenChange, onConfirm }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  // Reset name when dialog is closed
  useEffect(() => {
    if (!isOpen) {
      setName('');
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('documents.newFolderTitle')}</DialogTitle>
          <DialogDescription>
            {t('documents.folderNamePlaceholder')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} id="add-folder-form">
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t('documents.folderNameLabel')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('documents.folderNamePlaceholder')}
                autoFocus
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="add-folder-form" disabled={!name.trim()}>
            {t('documents.createFolder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
