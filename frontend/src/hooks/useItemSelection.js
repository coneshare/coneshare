import { useState, useCallback } from 'react';

export function useItemSelection(allItems) {
  const [selection, setSelection] = useState({ documents: [], folders: [] });
  const [lastSelectedItem, setLastSelectedItem] = useState(null);

  const handleItemSelect = useCallback((id, type, event) => {
    const currentIndex = allItems.findIndex(
      (item) => item.id === id && item.type === type
    );

    if (event?.shiftKey && lastSelectedItem) {
      const lastIndex = allItems.findIndex(
        (item) =>
          item.id === lastSelectedItem.id && item.type === lastSelectedItem.type
      );
      const start = Math.min(currentIndex, lastIndex);
      const end = Math.max(currentIndex, lastIndex);
      const itemsToSelect = allItems.slice(start, end + 1);

      setSelection((prev) => {
        const newSelection = {
          documents: [...prev.documents],
          folders: [...prev.folders],
        };
        itemsToSelect.forEach((item) => {
          if (
            item.type === "folder" &&
            !newSelection.folders.includes(item.id)
          ) {
            newSelection.folders.push(item.id);
          } else if (
            item.type === "document" &&
            !newSelection.documents.includes(item.id)
          ) {
            newSelection.documents.push(item.id);
          }
        });
        return newSelection;
      });
    } else {
      setSelection((prevSelection) => {
        const newSelection = { ...prevSelection };
        if (type === "folder") {
          const current = newSelection.folders;
          newSelection.folders = current.includes(id)
            ? current.filter((folderId) => folderId !== id)
            : [...current, id];
        } else {
          const current = newSelection.documents;
          newSelection.documents = current.includes(id)
            ? current.filter((docId) => docId !== id)
            : [...current, id];
        }
        return newSelection;
      });
      setLastSelectedItem({ id, type });
    }
  }, [allItems, lastSelectedItem]);

  const handleClearSelection = useCallback(() => {
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
  }, []);

  return { selection, setSelection, setLastSelectedItem, handleItemSelect, handleClearSelection };
}
