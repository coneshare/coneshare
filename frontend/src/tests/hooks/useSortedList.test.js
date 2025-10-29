import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSortedList } from '../../hooks/useSortedList';

describe('useSortedList', () => {
  const mockItems = [
    { name: 'Document C', type: 'document', updated_at: '2023-01-03T12:00:00Z', file_size: 100 },
    { name: 'Folder A', type: 'folder', updated_at: '2023-01-01T12:00:00Z' },
    { name: 'Document B', type: 'document', updated_at: '2023-01-02T12:00:00Z', file_size: 50 },
  ];

  it('should sort by name ascending by default, with folders first', () => {
    const { result } = renderHook(() => useSortedList(mockItems));

    expect(result.current.sortedItems.map(item => item.name)).toEqual([
      'Folder A',
      'Document B',
      'Document C',
    ]);
  });

  it('should handle sorting by a different key and direction', () => {
    const { result } = renderHook(() => useSortedList(mockItems));

    act(() => {
      result.current.handleSort('updated_at');
    });

    expect(result.current.sortedItems.map(item => item.name)).toEqual([
      'Folder A',
      'Document B',
      'Document C',
    ]);
    expect(result.current.sortConfig).toEqual({ key: 'updated_at', direction: 'ascending' });

    act(() => {
      result.current.handleSort('updated_at');
    });

    expect(result.current.sortedItems.map(item => item.name)).toEqual([
      'Folder A',
      'Document C',
      'Document B',
    ]);
    expect(result.current.sortConfig).toEqual({ key: 'updated_at', direction: 'descending' });
  });

  it('should sort by file size, keeping folders first', () => {
    const { result } = renderHook(() => useSortedList(mockItems));

    act(() => {
        result.current.handleSort('file_size');
    });

    expect(result.current.sortedItems.map(item => item.name)).toEqual([
        'Folder A',
        'Document B',
        'Document C',
    ]);

    act(() => {
        result.current.handleSort('file_size');
    });

    expect(result.current.sortedItems.map(item => item.name)).toEqual([
        'Folder A',
        'Document C',
        'Document B',
    ]);
  });
});
