import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';

import { PublicUploadPage } from '../../pages/PublicUploadPage';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  getPublicFileRequest: vi.fn(),
  requestPublicUpload: vi.fn(),
  finalizePublicUpload: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    put: vi.fn(),
  },
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: (...args) => toastError(...args),
  },
}));

describe('PublicUploadPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getPublicFileRequest.mockResolvedValue({
      data: {
        name: 'Upload Docs',
        owner_name: 'Owner',
        max_file_size: 10000000,
        allowed_file_types: ['pdf', '.docx'],
        message: '',
      },
    });
    api.requestPublicUpload.mockResolvedValue({
      data: {
        upload_url: 'https://upload.example.com',
        storage_key: 'org/key',
        unique_name: 'Quarterly.PDF',
      },
    });
    api.finalizePublicUpload.mockResolvedValue({ data: { detail: 'ok' } });
    axios.put.mockResolvedValue({});
  });

  const renderPage = (url = '/upload/test-slug') =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/upload/:slug" element={<PublicUploadPage />} />
        </Routes>
      </MemoryRouter>
    );

  it('shows normalized allowed types and sets file input accept', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    expect(screen.getByText('Allowed file types: .pdf, .docx')).toBeInTheDocument();
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toHaveAttribute('accept', '.pdf,.docx');
  });

  it('blocks disallowed file extension before upload request', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    const fileInput = container.querySelector('input[type="file"]');
    const badFile = new File(['x'], 'malware.exe', { type: 'application/octet-stream' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('These files are not allowed: malware.exe. Allowed types: .pdf, .docx')
    );
    expect(screen.queryByText('malware.exe')).not.toBeInTheDocument();
    expect(api.requestPublicUpload).not.toHaveBeenCalled();
  });

  it('uploads allowed extension case-insensitively and passes server error detail through', async () => {
    api.requestPublicUpload.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'File type not allowed. Allowed file types: .pdf, .docx.',
        },
      },
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Your Email'), { target: { value: 'jane@example.com' } });

    const fileInput = container.querySelector('input[type="file"]');
    const allowedUppercaseFile = new File(['pdf'], 'Quarterly.PDF', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [allowedUppercaseFile] } });
    expect(screen.getByText('Quarterly.PDF')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Upload 1 File\(s\)/i }));

    await waitFor(() => {
      expect(api.requestPublicUpload).toHaveBeenCalledWith('test-slug', {
        file_name: 'Quarterly.PDF',
        file_size: allowedUppercaseFile.size,
      });
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining('Error uploading Quarterly.PDF: File type not allowed.')
      );
      expect(screen.getByText('File type not allowed. Allowed file types: .pdf, .docx.')).toBeInTheDocument();
    });
  });

  it('renders custom fields and submits values on finalize', async () => {
    api.getPublicFileRequest.mockResolvedValueOnce({
      data: {
        name: 'Upload Docs',
        owner_name: 'Owner',
        max_file_size: 10000000,
        allowed_file_types: ['pdf'],
        message: '',
        custom_fields: [
          { id: 'case_number', label: 'Case Number', type: 'text', required: true },
          { id: 'document_type', label: 'Document Type', type: 'select', required: true, options: ['Invoice', 'Contract'] },
        ],
      },
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Your Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Case Number *'), { target: { value: 'CASE-001' } });
    fireEvent.change(screen.getByLabelText('Document Type *'), { target: { value: 'Contract' } });

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['pdf'], 'Quarterly.PDF', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload 1 File\(s\)/i }));

    await waitFor(() => {
      expect(api.finalizePublicUpload).toHaveBeenCalledWith(
        'test-slug',
        expect.objectContaining({
          custom_field_values: {
            case_number: 'CASE-001',
            document_type: 'Contract',
          },
        })
      );
    });
  });

  it('blocks whitespace-only required custom text before upload request', async () => {
    api.getPublicFileRequest.mockResolvedValueOnce({
      data: {
        name: 'Upload Docs',
        owner_name: 'Owner',
        max_file_size: 10000000,
        allowed_file_types: ['pdf'],
        message: '',
        custom_fields: [
          { id: 'case_number', label: 'Case Number', type: 'text', required: true },
        ],
      },
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Your Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Case Number *'), { target: { value: '   ' } });

    const fileInput = container.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [new File(['pdf'], 'Quarterly.PDF', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload 1 File\(s\)/i }));

    expect(api.requestPublicUpload).not.toHaveBeenCalled();
    expect(screen.getByText('Case Number is required.')).toBeInTheDocument();
  });

  it('blocks unchecked required custom checkbox before upload request', async () => {
    api.getPublicFileRequest.mockResolvedValueOnce({
      data: {
        name: 'Upload Docs',
        owner_name: 'Owner',
        max_file_size: 10000000,
        allowed_file_types: ['pdf'],
        message: '',
        custom_fields: [
          { id: 'confirm_accuracy', label: 'Confirm Accuracy', type: 'checkbox', required: true },
        ],
      },
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Your Email'), { target: { value: 'jane@example.com' } });

    const fileInput = container.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [new File(['pdf'], 'Quarterly.PDF', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload 1 File\(s\)/i }));

    expect(api.requestPublicUpload).not.toHaveBeenCalled();
    expect(screen.getByText('Confirm Accuracy must be checked.')).toBeInTheDocument();
  });

  it('shows a friendly malware-scan error message', async () => {
    api.finalizePublicUpload.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          detail: 'Upload blocked: security scan detected a potentially malicious file.',
        },
      },
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Your Email'), { target: { value: 'jane@example.com' } });

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['pdf'], 'Quarterly.PDF', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload 1 File\(s\)/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining('Error uploading Quarterly.PDF: This file was blocked by our security scan.')
      );
      expect(screen.getByText('This file was blocked by our security scan. Please remove it and upload a different file.')).toBeInTheDocument();
    });
  });

  it('shows a friendly scanner-unavailable error message', async () => {
    api.finalizePublicUpload.mockRejectedValueOnce({
      response: {
        status: 503,
        data: {
          detail: 'Upload could not be verified by security scanner. Please try again later.',
        },
      },
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Your Email'), { target: { value: 'jane@example.com' } });

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['pdf'], 'Quarterly.PDF', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload 1 File\(s\)/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining('Error uploading Quarterly.PDF: Uploads are temporarily unavailable because the security scanner is offline.')
      );
      expect(screen.getByText('Uploads are temporarily unavailable because the security scanner is offline. Please try again later.')).toBeInTheDocument();
    });
  });

  it('accepts multi-part allowed extension in client-side precheck', async () => {
    api.getPublicFileRequest.mockResolvedValueOnce({
      data: {
        name: 'Upload Docs',
        owner_name: 'Owner',
        max_file_size: 10000000,
        allowed_file_types: ['.tar.gz'],
        message: '',
      },
    });

    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    const fileInput = container.querySelector('input[type="file"]');
    const archive = new File(['x'], 'backup.TAR.GZ', { type: 'application/gzip' });
    fireEvent.change(fileInput, { target: { files: [archive] } });

    expect(screen.getByText('backup.TAR.GZ')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining('These files are not allowed'));
  });

  it('enables compact shell when embed=1 is present', async () => {
    renderPage('/upload/test-slug?embed=1');

    await waitFor(() => {
      expect(screen.getByText('Upload Docs')).toBeInTheDocument();
    });

    const shell = screen.getByTestId('public-upload-shell');
    expect(shell.className).toContain('min-h-0');
    expect(shell.className).toContain('bg-transparent');
    expect(shell.className).not.toContain('min-h-screen');
  });
});
