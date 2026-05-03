import { useState, useMemo } from 'react';

export function useSortedList(
  items,
  initialConfig = { key: 'name', direction: 'ascending' },
  options = { groupByType: true }
) {
  const [sortConfig, setSortConfig] = useState(initialConfig);
  const groupByType = options?.groupByType ?? true;

  const sortedItems = useMemo(() => {
    if (!items) return [];

    let sorted = [...items];

    sorted.sort((a, b) => {
      // Folders always come first
      if (groupByType) {
        if (a.type === "folder" && b.type === "document") return -1;
        if (a.type === "document" && b.type === "folder") return 1;
      }
      
      const dir = sortConfig.direction === "ascending" ? 1 : -1;
      const key = sortConfig.key;

      const aVal = a[key];
      const bVal = b[key];

      if (key === "updated_at") {
        return (new Date(aVal) - new Date(bVal)) * dir;
      }

      if (key === 'file_size') {
        return ((aVal || 0) - (bVal || 0)) * dir;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir;
      }
      
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;

      return 0;
    });

    return sorted;
  }, [items, sortConfig, groupByType]);

  const handleSort = (key) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === key) {
        return {
          ...prevConfig,
          direction:
            prevConfig.direction === "ascending" ? "descending" : "ascending",
        };
      }
      return { key, direction: "ascending" };
    });
  };

  return { sortedItems, sortConfig, handleSort };
}
