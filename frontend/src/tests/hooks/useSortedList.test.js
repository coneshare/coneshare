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

  it('should sort by view count numerically', () => {
    const viewItems = [
      { name: 'Low Views', type: 'document', view_count: 1 },
      { name: 'High Views', type: 'document', view_count: 9 },
      { name: 'No Views', type: 'document', view_count: 0 },
    ];
    const { result } = renderHook(() => useSortedList(viewItems));

    act(() => {
      result.current.handleSort('view_count');
    });

    expect(result.current.sortedItems.map(item => item.name)).toEqual([
      'No Views',
      'Low Views',
      'High Views',
    ]);

    act(() => {
      result.current.handleSort('view_count');
    });

    expect(result.current.sortedItems.map(item => item.name)).toEqual([
      'High Views',
      'Low Views',
      'No Views',
    ]);
  });

  describe('localStorage persistence', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should initialize sortConfig from localStorage if valid stored value exists', () => {
      localStorage.setItem(
        'test_sort_key',
        JSON.stringify({ key: 'updated_at', direction: 'descending' })
      );

      const { result } = renderHook(() =>
        useSortedList(
          mockItems,
          { key: 'name', direction: 'ascending' },
          { groupByType: true, storageKey: 'test_sort_key' }
        )
      );

      expect(result.current.sortConfig).toEqual({
        key: 'updated_at',
        direction: 'descending',
      });
      expect(result.current.sortedItems.map(item => item.name)).toEqual([
        'Folder A',
        'Document C',
        'Document B',
      ]);
    });

    it('should fall back to initialConfig when localStorage contains invalid JSON or structure', () => {
      localStorage.setItem('test_sort_key', 'invalid json string');

      const { result } = renderHook(() =>
        useSortedList(
          mockItems,
          { key: 'name', direction: 'ascending' },
          { groupByType: true, storageKey: 'test_sort_key' }
        )
      );

      expect(result.current.sortConfig).toEqual({
        key: 'name',
        direction: 'ascending',
      });
    });

    it('should fall back to initialConfig when localStorage direction is invalid', () => {
      localStorage.setItem(
        'test_sort_key',
        JSON.stringify({ key: 'name', direction: 'invalid_dir' })
      );

      const { result } = renderHook(() =>
        useSortedList(
          mockItems,
          { key: 'name', direction: 'ascending' },
          { groupByType: true, storageKey: 'test_sort_key' }
        )
      );

      expect(result.current.sortConfig).toEqual({
        key: 'name',
        direction: 'ascending',
      });
    });

    it('should save updated sortConfig to localStorage on handleSort', () => {
      const { result } = renderHook(() =>
        useSortedList(
          mockItems,
          { key: 'name', direction: 'ascending' },
          { groupByType: true, storageKey: 'test_sort_key' }
        )
      );

      act(() => {
        result.current.handleSort('file_size');
      });

      expect(result.current.sortConfig).toEqual({
        key: 'file_size',
        direction: 'ascending',
      });
      expect(JSON.parse(localStorage.getItem('test_sort_key'))).toEqual({
        key: 'file_size',
        direction: 'ascending',
      });

      act(() => {
        result.current.handleSort('file_size');
      });

      expect(result.current.sortConfig).toEqual({
        key: 'file_size',
        direction: 'descending',
      });
      expect(JSON.parse(localStorage.getItem('test_sort_key'))).toEqual({
        key: 'file_size',
        direction: 'descending',
      });
    });

    it('should catch SecurityError and fallback to initialConfig when localStorage is blocked', () => {
      const originalLocalStorage = window.localStorage;
      const securityError = new Error('Access is denied');
      securityError.name = 'SecurityError';

      Object.defineProperty(window, 'localStorage', {
        get() {
          throw securityError;
        },
        configurable: true,
      });

      try {
        const { result } = renderHook(() =>
          useSortedList(
            mockItems,
            { key: 'name', direction: 'ascending' },
            { groupByType: true, storageKey: 'blocked_key' }
          )
        );

        expect(result.current.sortConfig).toEqual({
          key: 'name',
          direction: 'ascending',
        });

        act(() => {
          result.current.handleSort('updated_at');
        });

        expect(result.current.sortConfig).toEqual({
          key: 'updated_at',
          direction: 'ascending',
        });
      } finally {
        Object.defineProperty(window, 'localStorage', {
          value: originalLocalStorage,
          configurable: true,
          writable: true,
        });
      }
    });

    it('should validate parsed.key against allowedKeys whitelist', () => {
      localStorage.setItem(
        'test_sort_key',
        JSON.stringify({ key: 'unknown_key', direction: 'ascending' })
      );

      const { result } = renderHook(() =>
        useSortedList(
          mockItems,
          { key: 'name', direction: 'ascending' },
          {
            groupByType: true,
            storageKey: 'test_sort_key',
            allowedKeys: ['name', 'updated_at', 'file_size'],
          }
        )
      );

      // Falls back to initialConfig since 'unknown_key' is not in allowedKeys
      expect(result.current.sortConfig).toEqual({
        key: 'name',
        direction: 'ascending',
      });
    });

    it('should accept stored key if present in allowedKeys whitelist', () => {
      localStorage.setItem(
        'test_sort_key',
        JSON.stringify({ key: 'updated_at', direction: 'descending' })
      );

      const { result } = renderHook(() =>
        useSortedList(
          mockItems,
          { key: 'name', direction: 'ascending' },
          {
            groupByType: true,
            storageKey: 'test_sort_key',
            allowedKeys: ['name', 'updated_at', 'file_size'],
          }
        )
      );

      expect(result.current.sortConfig).toEqual({
        key: 'updated_at',
        direction: 'descending',
      });
    });
  });
});

