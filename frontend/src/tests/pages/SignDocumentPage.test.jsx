import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignDocumentPage } from '../../pages/SignDocumentPage';
import * as api from '../../services/api';

vi.mock('../../hooks/usePdfDocument', () => ({
  usePdfDocument: () => ({
    pdfDoc: { numPages: 1 },
    numPages: 1,
    pageDimensions: [{ width: 612, height: 792 }],
    loading: false,
    error: null,
  }),
}));

vi.mock('../../components/documents/PdfPage', () => ({
  PdfPage: ({ pageNumber }) => <div data-testid={`pdf-page-${pageNumber}`}>Page {pageNumber}</div>,
}));

vi.mock('../../services/api', () => ({
  exchangeSignerToken: vi.fn(),
  getSignerSession: vi.fn(),
  submitSignerFields: vi.fn(),
  declineSignerRequest: vi.fn(),
  recordSignerPageView: vi.fn().mockResolvedValue({}),
  getSignerPdfUrl: (id) => `/api/v1/esign/sign/${id}/pdf/`,
  getSignerExecutedDownloadUrl: (id) => `/api/v1/esign/sign/${id}/download/`,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SignDocumentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/sign/req_123#token=secret_frag_tok');
  });

  it('extracts and strips #token fragment, exchanges for cookie, and renders signer fields', async () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    api.exchangeSignerToken.mockResolvedValue({ data: { message: 'ok' } });
    api.getSignerSession.mockResolvedValue({
      data: {
        request: {
          id: 'req_123',
          title: 'SAFE Financing Agreement',
          status: 'sent',
          signing_order: 'parallel',
          document_name: 'SAFE.pdf',
        },
        signer: {
          id: 'sig_1',
          name: 'Bob Founder',
          email: 'bob@founder.io',
          status: 'viewed',
          can_sign: true,
        },
        fields: [
          {
            id: 'fld_1',
            field_type: 'signature',
            page_number: 1,
            x: 10,
            y: 70,
            width: 30,
            height: 8,
            is_required: true,
            value: '',
          },
        ],
        download_url: null,
      },
    });

    api.submitSignerFields.mockResolvedValue({
      data: {
        request: {
          id: 'req_123',
          title: 'SAFE Financing Agreement',
          status: 'completed',
          signing_order: 'parallel',
          document_name: 'SAFE.pdf',
        },
        signer: {
          id: 'sig_1',
          name: 'Bob Founder',
          email: 'bob@founder.io',
          status: 'signed',
          can_sign: false,
        },
        fields: [],
        download_url: '/api/v1/esign/sign/req_123/download/',
      },
    });

    render(
      <MemoryRouter initialEntries={['/sign/req_123']}>
        <Routes>
          <Route path="/sign/:requestId" element={<SignDocumentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.exchangeSignerToken).toHaveBeenCalledWith('req_123', 'secret_frag_tok');
    });
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(await screen.findByText('SAFE Financing Agreement')).toBeInTheDocument();

    // Open signature pad modal by clicking field
    await userEvent.click(screen.getByText(/Click to signature/i));
    await userEvent.click(screen.getByRole('button', { name: /Type/i }));
    const typedInput = screen.getByLabelText(/Typed signature/i);
    await userEvent.clear(typedInput);
    await userEvent.type(typedInput, 'Bob Founder');
    await userEvent.click(screen.getByRole('button', { name: /Apply to Document/i }));

    await userEvent.click(screen.getByRole('button', { name: /Submit Signature/i }));

    await waitFor(() => {
      expect(api.submitSignerFields).toHaveBeenCalledWith('req_123', [
        expect.objectContaining({
          field_id: 'fld_1',
          signature_type: 'type',
          signature_data: 'Bob Founder',
        }),
      ]);
    });
    expect(await screen.findByText(/Download Signed PDF/i)).toBeInTheDocument();
  });
});
