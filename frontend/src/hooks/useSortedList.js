import { useState, useMemo } from 'react';

export function useSortedList(
  items,
  initialConfig = { key: 'name', direction: 'ascending' },
  options = { groupByType: true, storageKey: null, allowedKeys: null }
) {
  const groupByType = options?.groupByType ?? true;
  const storageKey = options?.storageKey ?? null;
  const allowedKeys = options?.allowedKeys ?? null;

  const [sortConfig, setSortConfig] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const storage = window.localStorage;
        if (storage) {
          const saved = storage.getItem(storageKey);
          if (saved) {
            const parsed = JSON.parse(saved);
            const isKeyValid =
              typeof parsed?.key === 'string' &&
              (!Array.isArray(allowedKeys) || allowedKeys.includes(parsed.key));
            const isDirValid =
              parsed?.direction === 'ascending' || parsed?.direction === 'descending';

            if (isKeyValid && isDirValid) {
              return parsed;
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to parse sort configuration from localStorage for key "${storageKey}":`, err);
      }
    }
    return initialConfig;
  });

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

      if (key === 'file_size' || key === 'view_count') {
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
      const nextConfig =
        prevConfig.key === key
          ? {
              ...prevConfig,
              direction:
                prevConfig.direction === "ascending" ? "descending" : "ascending",
            }
          : { key, direction: "ascending" };

      if (storageKey && typeof window !== 'undefined') {
        try {
          const storage = window.localStorage;
          if (storage) {
            storage.setItem(storageKey, JSON.stringify(nextConfig));
          }
        } catch (err) {
          console.warn(`Failed to save sort configuration to localStorage for key "${storageKey}":`, err);
        }
      }

      return nextConfig;
    });
  };

  return { sortedItems, sortConfig, handleSort };
}
