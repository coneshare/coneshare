import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { renameDocument, renameFolder, updateDataroom, renameDataroomFolder, renameDataroomDocument } from "../../services/api";
import { getLocalizedErrorMessage } from "../../utils/errorTranslator";
import { Button } from "../ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

export function RenameItemDialog({ isOpen, onOpenChange, item, onSuccess, context = 'documents' }) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (item) {
      setNewName(item.name || "");
      setError(null);
    }
  }, [item]);

  useEffect(() => {
    if (!isOpen) {
      setIsSaving(false);
      setError(null);
    }
  }, [isOpen]);

  if (!item) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      if (item.type === 'Dataroom') {
        await updateDataroom(item.id, { name: trimmedName });
      } else {
        let renameFn;
        if (context === 'dataroom') {
          renameFn = item.type === "document" ? renameDataroomDocument : renameDataroomFolder;
        } else { // documents context
          renameFn = item.type === "document" ? renameDocument : renameFolder;
        }
        await renameFn(item.id, trimmedName);
      }
      toast.success(t('documents.renameSuccess', { oldName: item.name, newName: trimmedName }));
      onSuccess(); // This will trigger a data refresh
      onOpenChange(false); // Close the dialog
    } catch (err) {
      const apiError = getLocalizedErrorMessage(err, `Failed to rename ${item.type}.`);
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isSaving) {
        onOpenChange(open);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('documents.renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('documents.renameDescription', { name: item.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                {t('documents.name')}
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
                disabled={isSaving}
                required
              />
            </div>
            {error && <p className="text-center text-sm text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!isSaving) {
                  onOpenChange(false);
                }
              }}
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !newName.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('documents.rename')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
