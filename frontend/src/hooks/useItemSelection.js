import { useState, useCallback } from 'react';

export function useItemSelection(allItems) {
  const [selection, setSelection] = useState({ documents: [], folders: [] });
  const [lastSelectedItem, setLastSelectedItem] = useState(null);

  const handleItemSelect = useCallback((id, type, event) => {
    const isMetaToggle = Boolean(event?.metaKey || event?.ctrlKey);
    const isShiftRange = Boolean(event?.shiftKey);
    const currentIndex = allItems.findIndex(
      (item) => item.id === id && item.type === type
    );
    if (currentIndex < 0) return;

    if (isShiftRange && lastSelectedItem) {
      const lastIndex = allItems.findIndex(
        (item) =>
          item.id === lastSelectedItem.id && item.type === lastSelectedItem.type
      );
      if (lastIndex < 0) return;
      const start = Math.min(currentIndex, lastIndex);
      const end = Math.max(currentIndex, lastIndex);
      const itemsToSelect = allItems.slice(start, end + 1);

      setSelection((prev) => {
        const newSelection = isMetaToggle
          ? {
              documents: [...prev.documents],
              folders: [...prev.folders],
            }
          : { documents: [], folders: [] };

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
      return;
    }

    if (isMetaToggle) {
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
    } else {
      setSelection((prevSelection) => {
        const alreadySelected =
          type === "folder"
            ? prevSelection.folders.includes(id)
            : prevSelection.documents.includes(id);
        const isSoleSelection =
          prevSelection.documents.length + prevSelection.folders.length === 1;

        if (alreadySelected && isSoleSelection) {
          return prevSelection;
        }

        return type === "folder"
          ? { documents: [], folders: [id] }
          : { documents: [id], folders: [] };
      });
    }

    setLastSelectedItem({ id, type });
  }, [allItems, lastSelectedItem]);

  const handleClearSelection = useCallback(() => {
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
  }, []);

  return { selection, setSelection, setLastSelectedItem, handleItemSelect, handleClearSelection };
}
