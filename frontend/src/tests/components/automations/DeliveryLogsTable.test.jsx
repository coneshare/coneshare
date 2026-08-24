import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeliveryLogsTable } from '../../../components/automations/DeliveryLogsTable';
import '../../../i18n';

describe('DeliveryLogsTable', () => {
  const mockDeliveries = [
    {
      id: 'del-1',
      event_type: 'document_viewed',
      status: 'delivered',
      attempt_count: 1,
      response_body_excerpt: '{"ok":true}',
      next_retry_at: null,
      delivered_at: '2026-08-24T10:00:00Z',
    },
    {
      id: 'del-2',
      event_type: 'file_request_uploaded',
      status: 'failed',
      attempt_count: 3,
      response_body_excerpt: '{"error":"timeout"}',
      next_retry_at: '2026-08-24T11:00:00Z',
      delivered_at: null,
    },
  ];

  it('renders table headers and delivery rows', () => {
    render(<DeliveryLogsTable deliveries={mockDeliveries} onReplay={vi.fn()} />);

    expect(screen.getByText('document_viewed')).toBeInTheDocument();
    expect(screen.getByText('file_request_uploaded')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Replay/i })).toHaveLength(2);
  });

  it('disables all replay buttons and displays spinner on the active replay', () => {
    render(
      <DeliveryLogsTable
        deliveries={mockDeliveries}
        onReplay={vi.fn()}
        replayingId="del-1"
      />
    );

    const replayingBtn = screen.getByRole('button', { name: /Replaying\.\.\./i });
    const replayBtn = screen.getByRole('button', { name: /^Replay$/i });

    expect(replayingBtn).toBeDisabled();
    expect(replayBtn).toBeDisabled();
  });

  it('calls onReplay with the delivery id when clicked', () => {
    const handleReplay = vi.fn();
    render(<DeliveryLogsTable deliveries={mockDeliveries} onReplay={handleReplay} />);

    const replayButtons = screen.getAllByRole('button', { name: /Replay/i });
    fireEvent.click(replayButtons[0]);

    expect(handleReplay).toHaveBeenCalledWith('del-1');
  });
});
