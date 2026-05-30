import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QnAPanel } from '../../../components/viewer/QnAPanel';
import * as api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getPublicQnaThreads: vi.fn(),
  createPublicQnaThread: vi.fn(),
  createPublicQnaMessage: vi.fn(),
}));

describe('QnAPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const renderPanel = (props = {}) => render(
    <QnAPanel
      open
      onOpenChange={vi.fn()}
      slug="test-slug"
      viewId="view-123"
      contextLabel="Test Document"
      {...props}
    />
  );

  it('loads and renders existing threads', async () => {
    api.getPublicQnaThreads.mockResolvedValue({
      data: [
        {
          id: 'thread-1',
          subject: 'Existing question',
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [
            {
              id: 'msg-1',
              body: 'Can you explain this?',
              sender_type: 'viewer',
              sender_email: 'viewer@example.com',
              created_at: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByText('Existing question').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Can you explain this?')).toBeInTheDocument();
    expect(api.getPublicQnaThreads).toHaveBeenCalledWith('test-slug', {
      viewSessionId: 'view-123',
      dataroomDocumentId: null,
      dataroomFolderId: null,
    });
  });

  it('creates a thread with dataroom context', async () => {
    const user = userEvent.setup();
    api.getPublicQnaThreads.mockResolvedValue({ data: [] });
    api.createPublicQnaThread.mockResolvedValue({
      data: {
        id: 'thread-2',
        subject: 'New subject',
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [
          {
            id: 'msg-2',
            body: 'New message',
            sender_type: 'viewer',
            sender_email: 'viewer@example.com',
            created_at: new Date().toISOString(),
          },
        ],
      },
    });

    renderPanel({ dataroomDocumentId: 'ddoc-1' });

    await user.type(screen.getByLabelText(/question subject/i), 'New subject');
    await user.type(screen.getByLabelText(/question message/i), 'New message');
    await user.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => {
      expect(api.createPublicQnaThread).toHaveBeenCalledWith('test-slug', {
        viewSessionId: 'view-123',
        subject: 'New subject',
        body: 'New message',
        dataroomDocumentId: 'ddoc-1',
        dataroomFolderId: null,
      });
    });
    expect(screen.getAllByText('New subject').length).toBeGreaterThan(0);
  });

  it('replies to an open thread', async () => {
    const user = userEvent.setup();
    api.getPublicQnaThreads.mockResolvedValue({
      data: [
        {
          id: 'thread-1',
          subject: 'Existing question',
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        },
      ],
    });
    api.createPublicQnaMessage.mockResolvedValue({
      data: {
        id: 'msg-3',
        body: 'Reply body',
        sender_type: 'viewer',
        sender_email: 'viewer@example.com',
        created_at: new Date().toISOString(),
      },
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByText('Existing question').length).toBeGreaterThan(0);
    });
    await user.type(screen.getByLabelText(/reply message/i), 'Reply body');
    await user.click(screen.getByLabelText(/send reply/i));

    await waitFor(() => {
      expect(api.createPublicQnaMessage).toHaveBeenCalledWith('test-slug', 'thread-1', {
        viewSessionId: 'view-123',
        body: 'Reply body',
      });
    });
    expect(screen.getByText('Reply body')).toBeInTheDocument();
  });

  it('disables replies for closed threads', async () => {
    api.getPublicQnaThreads.mockResolvedValue({
      data: [
        {
          id: 'thread-closed',
          subject: 'Closed question',
          status: 'closed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        },
      ],
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByText('Closed question').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/this thread is closed/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/send reply/i)).not.toBeInTheDocument();
  });
});
