import { useState, useEffect } from 'react';

/**
 * Custom hook that delays updating the returned value until a specified delay has passed
 * since the last change to the input value.
 *
 * @template T
 * @param {T} value - The input value to debounce
 * @param {number} [delay=300] - Delay in milliseconds
 * @returns {T} The debounced value
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
