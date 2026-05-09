import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useItemSelection } from '../../hooks/useItemSelection';

describe('useItemSelection', () => {
  const mockItems = [
    { id: 'f1', name: 'Folder A', type: 'folder' },
    { id: 'f2', name: 'Folder B', type: 'folder' },
    { id: 'd1', name: 'Doc A', type: 'document' },
    { id: 'd2', name: 'Doc B', type: 'document' },
  ];

  it('should use single-click to select one item', () => {
    const { result } = renderHook(() => useItemSelection(mockItems));

    act(() => {
      result.current.handleItemSelect('f1', 'folder');
    });
    expect(result.current.selection).toEqual({ documents: [], folders: ['f1'] });

    act(() => {
      result.current.handleItemSelect('d1', 'document');
    });
    expect(result.current.selection).toEqual({ documents: ['d1'], folders: [] });

    act(() => {
      result.current.handleItemSelect('f1', 'folder', { ctrlKey: true });
    });
    expect(result.current.selection).toEqual({ documents: ['d1'], folders: ['f1'] });
  });

  it('should clear selection', () => {
    const { result } = renderHook(() => useItemSelection(mockItems));

    act(() => {
      result.current.handleItemSelect('f1', 'folder');
      result.current.handleItemSelect('d2', 'document', { ctrlKey: true });
    });
    expect(result.current.selection).toEqual({ documents: ['d2'], folders: ['f1'] });

    act(() => {
      result.current.handleClearSelection();
    });
    expect(result.current.selection).toEqual({ documents: [], folders: [] });
  });

  it('should select a range of items with shift-click', () => {
    const { result } = renderHook(() => useItemSelection(mockItems));

    // First click to set lastSelectedItem
    act(() => {
      result.current.handleItemSelect('f1', 'folder');
    });
    expect(result.current.selection).toEqual({ documents: [], folders: ['f1'] });

    // Shift-click to select a range
    act(() => {
      result.current.handleItemSelect('d1', 'document', { shiftKey: true });
    });
    expect(result.current.selection).toEqual({ documents: ['d1'], folders: ['f1', 'f2'] });
  });

  it('should select a range in reverse with shift-click', () => {
    const { result } = renderHook(() => useItemSelection(mockItems));

    act(() => {
      result.current.handleItemSelect('d1', 'document');
    });
    act(() => {
      result.current.handleItemSelect('f1', 'folder', { shiftKey: true });
    });
    expect(result.current.selection).toEqual({ documents: ['d1'], folders: ['f1', 'f2'] });
  });

  it('should merge range with meta/ctrl + shift', () => {
    const { result } = renderHook(() => useItemSelection(mockItems));

    act(() => {
      result.current.handleItemSelect('f1', 'folder');
    });
    act(() => {
      result.current.handleItemSelect('d2', 'document', { ctrlKey: true });
    });
    act(() => {
      result.current.handleItemSelect('d1', 'document', { shiftKey: true, ctrlKey: true });
    });

    expect(result.current.selection).toEqual({ documents: ['d2', 'd1'], folders: ['f1'] });
  });
});
