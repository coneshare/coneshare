import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlusIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { createFolder } from '../../services/api';
import { AddFolderDialog } from './AddFolderDialog';
import { FolderBrowser } from '../documents/FolderBrowser';

export function MoveItemsDialog({ isOpen, onOpenChange, onConfirm, selectedFolderIds = [] }) {
  const { t } = useTranslation();
  const [destinationFolder, setDestinationFolder] = useState(null);
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);
  // A key to force re-mounting of FolderBrowser when a new folder is created
  const [browserKey, setBrowserKey] = useState(Date.now());

  const handleMoveHere = () => {
    onConfirm(destinationFolder?.id || null);
  };

  const handleCreateFolder = async (name) => {
    try {
      await createFolder(name, destinationFolder?.id || null);
      // Force re-mount and refresh of the browser component to show the new folder
      setBrowserKey(Date.now());
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      setIsAddFolderOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <AddFolderDialog
        isOpen={isAddFolderOpen}
        onOpenChange={setIsAddFolderOpen}
        onConfirm={handleCreateFolder}
      />
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('documents.moveTitle')}</DialogTitle>
          <DialogDescription>
            {t('documents.selectTargetFolder')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-2 min-w-0">
          <FolderBrowser
            key={browserKey}
            onCurrentFolderChange={setDestinationFolder}
            disabledFolderIds={selectedFolderIds}
          />
        </div>
        
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => setIsAddFolderOpen(true)}>
            <FolderPlusIcon className="mr-2 h-4 w-4" />
            {t('documents.createFolder')}
          </Button>
          <div className="flex gap-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleMoveHere}>
              {t('documents.move')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
