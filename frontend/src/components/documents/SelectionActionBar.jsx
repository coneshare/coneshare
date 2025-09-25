import { Trash2 } from "lucide-react";
import { Button } from "../ui/Button";

export function SelectionActionBar({
  selectedDocumentsCount,
  selectedFoldersCount,
  onClearSelection,
  onDelete,
}) {
  const documentText = `${selectedDocumentsCount} document${selectedDocumentsCount !== 1 ? "s" : ""}`;
  const folderText = `${selectedFoldersCount} folder${selectedFoldersCount !== 1 ? "s" : ""}`;

  let selectionText = "";
  if (selectedDocumentsCount > 0 && selectedFoldersCount > 0) {
    selectionText = `${documentText}, ${folderText} selected`;
  } else if (selectedDocumentsCount > 0) {
    selectionText = `${documentText} selected`;
  } else if (selectedFoldersCount > 0) {
    selectionText = `${folderText} selected`;
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
      <div className="flex items-center gap-x-4">
        <span className="ml-2 text-sm font-medium">{selectionText}</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Clear Selection
        </Button>
      </div>
      <div className="flex items-center gap-x-2">
        <Button variant="outline" size="sm" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
