import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from './useDebounce';

/**
 * Syncs search input state with a URL query parameter so browser Back/Forward
 * restores search state while typing remains debounced.
 *
 * @param {string} [paramKey='search'] - Query parameter name
 * @param {number} [delay=300] - Debounce delay in milliseconds
 */
export function useUrlSearch(paramKey = 'search', delay = 300) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get(paramKey) || '';
  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebounce(searchInput, delay);
  const lastSyncedUrlSearchRef = useRef(urlSearch);

  useEffect(() => {
    if (urlSearch !== lastSyncedUrlSearchRef.current) {
      lastSyncedUrlSearchRef.current = urlSearch;
      setSearchInput(urlSearch);
      return;
    }

    const trimmed = debouncedSearch.trim();
    if (trimmed !== searchInput.trim()) return;
    if (trimmed === urlSearch) return;
    lastSyncedUrlSearchRef.current = trimmed;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (trimmed) next.set(paramKey, trimmed);
        else next.delete(paramKey);
        return next;
      },
      { replace: true }
    );
  }, [debouncedSearch, searchInput, urlSearch, paramKey, setSearchParams]);

  const clearSearch = useCallback(() => {
    lastSyncedUrlSearchRef.current = '';
    setSearchInput('');
    if (searchParams.has(paramKey)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(paramKey);
          return next;
        },
        { replace: true }
      );
    }
  }, [paramKey, searchParams, setSearchParams]);

  const activeSearch = urlSearch.trim();

  return {
    searchInput,
    setSearchInput,
    debouncedSearch,
    urlSearch,
    activeSearch,
    isPending: Boolean(searchInput.trim()) && searchInput.trim() !== activeSearch,
    clearSearch,
  };
}
