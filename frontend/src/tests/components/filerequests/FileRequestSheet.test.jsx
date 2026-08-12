import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FileRequestSheet } from '../../../components/filerequests/FileRequestSheet';
import '../../../i18n';
import {
  createFileRequest,
  updateFileRequest,
  getRootFolderId,
} from '../../../services/api';

vi.mock('../../../services/api', () => ({
  createFileRequest: vi.fn(),
  updateFileRequest: vi.fn(),
  getRootFolderId: vi.fn(),
}));

vi.mock('../../../components/documents/FolderBrowser', () => ({
  FolderBrowser: ({ onCurrentFolderChange, onLoadingChange }) => {
    useEffect(() => {
      onLoadingChange?.(false);
      onCurrentFolderChange?.({ id: 'folder-123', name: 'Root' });
    }, [onCurrentFolderChange, onLoadingChange]);
    return <div data-testid="folder-browser">Folder Browser</div>;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FileRequestSheet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getRootFolderId.mockResolvedValue({ data: { id: 'root-folder-id' } });
    createFileRequest.mockResolvedValue({ data: { id: 'fr-1' } });
    updateFileRequest.mockResolvedValue({ data: { id: 'fr-1' } });
  });

  it('normalizes and submits allowed_file_types on create', async () => {
    const onSuccess = vi.fn();
    render(
      <FileRequestSheet
        isOpen
        onOpenChange={vi.fn()}
        folder={null}
        currentRequest={null}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText('Name (Visible to public)'), {
      target: { value: 'Request A' },
    });
    fireEvent.change(screen.getByLabelText('Allowed File Types (Optional)'), {
      target: { value: 'pdf, .DOCX, xlsx, .pdf' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Link/i }));

    await waitFor(() => {
      expect(createFileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Request A',
          folder: 'folder-123',
          allowed_file_types: ['.pdf', '.docx', '.xlsx'],
        })
      );
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('prefills and normalizes allowed_file_types on edit', async () => {
    const onSuccess = vi.fn();
    const currentRequest = {
      id: 'fr-9',
      name: 'Existing',
      message: '',
      expires_at: null,
      max_file_size: null,
      folder: 'folder-123',
      folder_name: '__root__',
      allowed_file_types: ['.pdf', '.docx'],
    };

    render(
      <FileRequestSheet
        isOpen
        onOpenChange={vi.fn()}
        folder={null}
        currentRequest={currentRequest}
        onSuccess={onSuccess}
      />
    );

    const allowedInput = screen.getByLabelText('Allowed File Types (Optional)');
    expect(allowedInput).toHaveValue('.pdf, .docx');

    fireEvent.change(allowedInput, {
      target: { value: '.pdf, docx, XLSX' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(updateFileRequest).toHaveBeenCalledWith(
        'fr-9',
        expect.objectContaining({
          allowed_file_types: ['.pdf', '.docx', '.xlsx'],
        })
      );
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('submits custom intake field schema on create', async () => {
    const onSuccess = vi.fn();
    render(
      <FileRequestSheet
        isOpen
        onOpenChange={vi.fn()}
        folder={null}
        currentRequest={null}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText('Name (Visible to public)'), {
      target: { value: 'Request A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Field/i }));
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Document Type' },
    });
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'select' },
    });
    fireEvent.change(screen.getByLabelText('Options'), {
      target: { value: 'Invoice, Contract' },
    });
    fireEvent.click(screen.getByLabelText('Required'));

    fireEvent.click(screen.getByRole('button', { name: /Create Link/i }));

    await waitFor(() => {
      expect(createFileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          custom_fields: [
            expect.objectContaining({
              id: 'document_type',
              label: 'Document Type',
              type: 'select',
              required: true,
              options: ['Invoice', 'Contract'],
            }),
          ],
        })
      );
    });
  });

  it('deduplicates slugified custom field ids', async () => {
    render(
      <FileRequestSheet
        isOpen
        onOpenChange={vi.fn()}
        folder={null}
        currentRequest={null}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Name (Visible to public)'), {
      target: { value: 'Request A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Field/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add Field/i }));

    const labels = screen.getAllByLabelText('Label');
    fireEvent.change(labels[0], { target: { value: 'Case Number' } });
    fireEvent.change(labels[1], { target: { value: 'Case Number' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Link/i }));

    await waitFor(() => {
      expect(createFileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          custom_fields: [
            expect.objectContaining({ id: 'case_number' }),
            expect.objectContaining({ id: 'case_number_2' }),
          ],
        })
      );
    });
  });
});
