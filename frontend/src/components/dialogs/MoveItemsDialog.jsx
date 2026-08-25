import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlusIcon, Loader2 } from 'lucide-react';
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
  const [isMoving, setIsMoving] = useState(false);
  // A key to force re-mounting of FolderBrowser when a new folder is created
  const [browserKey, setBrowserKey] = useState(Date.now());

  useEffect(() => {
    if (!isOpen) {
      setIsMoving(false);
    }
  }, [isOpen]);

  const handleMoveHere = async () => {
    if (isMoving) return;
    setIsMoving(true);
    try {
      await onConfirm(destinationFolder?.id || null);
    } finally {
      setIsMoving(false);
    }
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
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isMoving) {
        onOpenChange(open);
      }
    }}>
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
          <Button
            variant="outline"
            onClick={() => setIsAddFolderOpen(true)}
            disabled={isMoving}
          >
            <FolderPlusIcon className="mr-2 h-4 w-4" />
            {t('documents.createFolder')}
          </Button>
          <div className="flex gap-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!isMoving) {
                  onOpenChange(false);
                }
              }}
              disabled={isMoving}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleMoveHere} disabled={isMoving}>
              {isMoving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.moving')}
                </>
              ) : (
                t('documents.move')
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
