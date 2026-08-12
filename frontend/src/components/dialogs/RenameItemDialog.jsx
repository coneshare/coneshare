import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { renameDocument, renameFolder, updateDataroom, renameDataroomFolder, renameDataroomDocument } from "../../services/api";
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

  if (!item) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      if (item.type === 'Dataroom') {
        await updateDataroom(item.id, { name: newName });
      } else {
        let renameFn;
        if (context === 'dataroom') {
          renameFn = item.type === "document" ? renameDataroomDocument : renameDataroomFolder;
        } else { // documents context
          renameFn = item.type === "document" ? renameDocument : renameFolder;
        }
        await renameFn(item.id, newName);
      }
      toast.success(`"${item.name}" was renamed to "${newName}".`);
      onSuccess(); // This will trigger a data refresh
      onOpenChange(false); // Close the dialog
    } catch (err) {
      const nameError = err.response?.data?.name;
      const apiError =
        (nameError && [nameError].flat().join(" ")) || `Failed to rename ${item.type}.`;
      setError(apiError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
                required
              />
            </div>
            {error && <p className="text-center text-sm text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? t('common.saving') : t('documents.rename')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
