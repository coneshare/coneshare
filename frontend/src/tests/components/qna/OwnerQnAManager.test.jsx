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

  it('disables owner replies on closed threads', async () => {
    api.getOwnerQnaThreads.mockResolvedValue({ data: [{ ...thread, status: 'closed' }] });

    render(<OwnerQnAManager dataroomId="dr-1" />);

    const replyInput = await screen.findByPlaceholderText('Reopen this thread to reply');
    expect(replyInput).toBeDisabled();
    expect(screen.getByLabelText(/send owner q&a reply/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('clears the active selection when a filtered thread is closed', async () => {
    const user = userEvent.setup();
    const secondThread = {
      ...thread,
      id: 'thread-2',
      subject: 'Question about folder',
      context_type: 'folder',
      context_name: 'Financials',
      messages: [
        {
          ...thread.messages[0],
          id: 'msg-2',
          body: 'Can we get the latest statements?',
        },
      ],
    };
    api.getOwnerQnaThreads.mockResolvedValue({ data: [thread, secondThread] });
    api.updateOwnerQnaThreadStatus.mockResolvedValue({
      data: { ...thread, status: 'closed' },
    });

    render(<OwnerQnAManager dataroomId="dr-1" />);

    await waitFor(() => {
      expect(screen.getByText('Can you clarify this clause?')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.getByText('Select a Q&A thread.')).toBeInTheDocument();
    });
    expect(screen.getByText('Question about folder')).toBeInTheDocument();
    expect(screen.queryByText('Can we get the latest statements?')).not.toBeInTheDocument();
  });

  it('clears stale threads when the owner context changes', async () => {
    let resolveSecondLoad;
    api.getOwnerQnaThreads
      .mockResolvedValueOnce({ data: [thread] })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondLoad = resolve;
      }));

    const { rerender } = render(<OwnerQnAManager documentId="doc-1" />);

    await waitFor(() => {
      expect(screen.getByText('Can you clarify this clause?')).toBeInTheDocument();
    });

    rerender(<OwnerQnAManager documentId="doc-2" />);

    await waitFor(() => {
      expect(screen.queryByText('Question about terms')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Can you clarify this clause?')).not.toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    resolveSecondLoad({ data: [] });

    await waitFor(() => {
      expect(screen.getByText('No Q&A threads found.')).toBeInTheDocument();
    });
  });
});
