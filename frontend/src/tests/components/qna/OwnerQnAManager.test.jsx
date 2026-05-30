import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerQnAManager } from '../../../components/qna/OwnerQnAManager';
import * as api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getOwnerQnaThreads: vi.fn(),
  createOwnerQnaMessage: vi.fn(),
  updateOwnerQnaThreadStatus: vi.fn(),
}));

describe('OwnerQnAManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const thread = {
    id: 'thread-1',
    subject: 'Question about terms',
    status: 'open',
    context_type: 'document',
    context_name: 'Investor deck.pdf',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [
      {
        id: 'msg-1',
        body: 'Can you clarify this clause?',
        sender_type: 'viewer',
        sender_email: 'viewer@example.com',
        created_at: new Date().toISOString(),
      },
    ],
  };

  it('loads owner Q&A threads for a document', async () => {
    api.getOwnerQnaThreads.mockResolvedValue({ data: [thread] });

    render(<OwnerQnAManager documentId="doc-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Question about terms').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Can you clarify this clause?')).toBeInTheDocument();
    expect(api.getOwnerQnaThreads).toHaveBeenCalledWith({
      documentId: 'doc-1',
      dataroomId: null,
      status: 'open',
    });
  });

  it('sends an owner reply', async () => {
    const user = userEvent.setup();
    api.getOwnerQnaThreads.mockResolvedValue({ data: [thread] });
    api.createOwnerQnaMessage.mockResolvedValue({
      data: {
        id: 'msg-2',
        body: 'Owner answer',
        sender_type: 'user',
        sender_name: 'Owner',
        created_at: new Date().toISOString(),
      },
    });

    render(<OwnerQnAManager documentId="doc-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Question about terms').length).toBeGreaterThan(0);
    });
    await user.type(screen.getByLabelText('Owner Q&A reply'), 'Owner answer');
    await user.click(screen.getByLabelText(/send owner q&a reply/i));

    await waitFor(() => {
      expect(api.createOwnerQnaMessage).toHaveBeenCalledWith('thread-1', 'Owner answer');
    });
    expect(screen.getByText('Owner answer')).toBeInTheDocument();
  });

  it('closes an open thread', async () => {
    const user = userEvent.setup();
    api.getOwnerQnaThreads.mockResolvedValue({ data: [thread] });
    api.updateOwnerQnaThreadStatus.mockResolvedValue({
      data: { ...thread, status: 'closed' },
    });

    render(<OwnerQnAManager dataroomId="dr-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Question about terms').length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(api.updateOwnerQnaThreadStatus).toHaveBeenCalledWith('thread-1', 'closed');
    });
  });
});
