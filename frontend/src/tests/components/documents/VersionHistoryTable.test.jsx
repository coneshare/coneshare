import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VersionHistoryTable } from '../../../components/documents/VersionHistoryTable';

describe('VersionHistoryTable', () => {
  const mockVersions = [
    { id: 'v6', version_number: 6, created_at: '2026-07-06T12:00:00Z', file_size: 6000, is_primary: true },
    { id: 'v5', version_number: 5, created_at: '2026-07-05T12:00:00Z', file_size: 5000, is_primary: false },
    { id: 'v4', version_number: 4, created_at: '2026-07-04T12:00:00Z', file_size: 4000, is_primary: false },
    { id: 'v3', version_number: 3, created_at: '2026-07-03T12:00:00Z', file_size: 3000, is_primary: false },
    { id: 'v2', version_number: 2, created_at: '2026-07-02T12:00:00Z', file_size: 2000, is_primary: false },
    { id: 'v1', version_number: 1, created_at: '2026-07-01T12:00:00Z', file_size: 1000, is_primary: false },
  ];

  it('renders versions sorted by latest version first', () => {
    const onPreviewVersion = vi.fn();
    const onPromoteVersion = vi.fn();

    render(
      <VersionHistoryTable
        versions={mockVersions.slice(0, 3)}
        onPreviewVersion={onPreviewVersion}
        onPromoteVersion={onPromoteVersion}
      />
    );

    // v6 is primary
    expect(screen.getByText('v6')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    // v5 and v4 are inactive (no inactive badge should be displayed)
    expect(screen.getByText('v5')).toBeInTheDocument();
    expect(screen.getByText('v4')).toBeInTheDocument();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();

    // Pagination controls should not render for 3 versions
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders render_status and render_error details', () => {
    const onPreviewVersion = vi.fn();
    const onPromoteVersion = vi.fn();
    const mockFailedVersions = [
      { id: 'v1', version_number: 1, created_at: '2026-07-01T12:00:00Z', file_size: 1000, is_primary: false, render_status: 'failed', render_error: 'Could not process PDF' },
      { id: 'v2', version_number: 2, created_at: '2026-07-02T12:00:00Z', file_size: 2000, is_primary: false, render_status: 'processing' },
      { id: 'v3', version_number: 3, created_at: '2026-07-03T12:00:00Z', file_size: 3000, is_primary: false, render_status: 'not_generated' },
    ];

    render(
      <VersionHistoryTable
        versions={mockFailedVersions}
        onPreviewVersion={onPreviewVersion}
        onPromoteVersion={onPromoteVersion}
      />
    );

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Could not process PDF')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Not Generated')).toBeInTheDocument();
  });

  it('handles pagination controls correctly', () => {
    const onPreviewVersion = vi.fn();
    const onPromoteVersion = vi.fn();
    const onPageChange = vi.fn();

    render(
      <VersionHistoryTable
        versions={mockVersions.slice(0, 5)}
        totalCount={6}
        currentPage={1}
        pageSize={5}
        onPageChange={onPageChange}
        onPreviewVersion={onPreviewVersion}
        onPromoteVersion={onPromoteVersion}
      />
    );

    // Page 1 should display v6 to v2 (latest 5 versions)
    expect(screen.getByText('v6')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();

    // Pagination controls should be visible
    const nextButton = screen.getByRole('button', { name: /next page/i });
    expect(nextButton).toBeInTheDocument();

    // Go to next page
    fireEvent.click(nextButton);

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('triggers onPreviewVersion and onPromoteVersion callbacks', () => {
    const onPreviewVersion = vi.fn();
    const onPromoteVersion = vi.fn();

    render(
      <VersionHistoryTable
        versions={mockVersions.slice(0, 2)}
        onPreviewVersion={onPreviewVersion}
        onPromoteVersion={onPromoteVersion}
      />
    );

    // Click preview for v6
    const previewButtons = screen.getAllByRole('button', { name: /preview/i });
    fireEvent.click(previewButtons[0]);
    expect(onPreviewVersion).toHaveBeenCalledWith(expect.objectContaining({ id: 'v6' }));

    // Click restore/promote for v5 (since v6 is primary, v5 will have restore button)
    const restoreButton = screen.getByRole('button', { name: /restore/i });
    fireEvent.click(restoreButton);
    expect(onPromoteVersion).toHaveBeenCalledWith(expect.objectContaining({ id: 'v5' }));
  });
});
