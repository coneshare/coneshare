import { useEffect, useState } from "react";
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
      } else if (context === 'dataroom') {
        if (item.type === "document") {
          await renameDataroomDocument(item.id, newName);
        } else { // folder
          await renameDataroomFolder(item.id, newName);
        }
      } else { // documents context
        if (item.type === "document") {
          await renameDocument(item.id, newName);
        } else { // folder
          await renameFolder(item.id, newName);
        }
      }
      toast.success(`${item.type} "${item.name}" was renamed to "${newName}".`);
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
            <DialogTitle>Rename {item.type}</DialogTitle>
            <DialogDescription>
              Enter a new name for &quot;{item.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
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
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
