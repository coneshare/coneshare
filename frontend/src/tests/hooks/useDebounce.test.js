import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../../hooks/useDebounce';

describe('useDebounce hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('updates the debounced value only after the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'first', delay: 300 } }
    );

    expect(result.current).toBe('first');

    // Update the value prop
    rerender({ value: 'second', delay: 300 });

    // Should still be 'first' before timer expires
    expect(result.current).toBe('first');

    // Advance timer past delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('second');
  });

  it('cancels intermediate timeouts on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );

    rerender({ value: 'ab', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'abc', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'abcd', delay: 300 });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('abcd');
  });
});
