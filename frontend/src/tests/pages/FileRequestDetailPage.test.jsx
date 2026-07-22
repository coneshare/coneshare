import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { FileRequestDetailPage } from '../../pages/FileRequestDetailPage';
import { BreadcrumbProvider } from '../../components/layout/BreadcrumbProvider';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  getFileRequest: vi.fn(),
  getDocumentDownloadUrl: vi.fn(),
  updateFileRequest: vi.fn(),
  getCloudConnections: vi.fn(() => Promise.resolve({ data: [] })),
  listCloudFolders: vi.fn(() => Promise.resolve({ data: [] })),
  exportFileRequestUploads: vi.fn(() => Promise.resolve({ data: [] })),
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe('FileRequestDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getFileRequest.mockResolvedValue({
      data: {
        id: 'fr-1',
        name: 'Case Intake',
        slug: 'case-intake',
        is_active: true,
        expires_at: null,
        custom_fields: [
          { id: 'case_number', label: 'Renamed Case Field', type: 'text' },
        ],
        uploaded_files: [
          {
            id: 'upload-1',
            document_id: 'doc-1',
            document_name: 'contract.pdf',
            folder_id: 'folder-1',
            folder_name: 'Client Docs',
            uploader_name: 'Jane',
            uploader_email: 'jane@example.com',
            created_at: '2026-05-28T14:30:00Z',
            submitted_fields: {
              case_number: {
                label: 'Case Number',
                type: 'text',
                value: 'CASE-001',
              },
              confirm_accuracy: {
                label: 'Confirm Accuracy',
                type: 'checkbox',
                value: true,
              },
              subscribe_updates: {
                label: 'Subscribe Updates',
                type: 'checkbox',
                value: false,
              },
            },
          },
        ],
      },
    });
  });

  it('renders submitted field snapshot labels instead of current schema labels', async () => {
    render(
      <MemoryRouter initialEntries={['/file-requests/fr-1']}>
        <BreadcrumbProvider>
          <Routes>
            <Route path="/file-requests/:requestId" element={<FileRequestDetailPage />} />
          </Routes>
        </BreadcrumbProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('contract.pdf')).toBeInTheDocument();
    expect(screen.getByText('Case Number:')).toBeInTheDocument();
    expect(screen.getByText('CASE-001')).toBeInTheDocument();
    expect(screen.getByText('Confirm Accuracy:')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Subscribe Updates:')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.queryByText('Renamed Case Field:')).not.toBeInTheDocument();
  });
});
