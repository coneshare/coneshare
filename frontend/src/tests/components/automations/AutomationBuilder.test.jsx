import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AutomationBuilder } from '../../../components/automations/AutomationBuilder';
import '../../../i18n';

describe('AutomationBuilder', () => {
  const mockDestinations = [
    { id: 'dest-1', name: 'Slack Channel', destination_type: 'slack' },
    { id: 'dest-2', name: 'Webhook Server', destination_type: 'webhook' },
  ];

  it('renders form and disables submit button when required fields are missing', () => {
    render(
      <AutomationBuilder
        destinations={mockDestinations}
        shareLinks={[]}
        datarooms={[]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Automation/i })).toBeDisabled();
  });

  it('enables submit button when valid and submits payload', () => {
    const handleSubmit = vi.fn();
    render(
      <AutomationBuilder
        destinations={mockDestinations}
        shareLinks={[]}
        datarooms={[]}
        onSubmit={handleSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'My Rule' } });
    fireEvent.click(screen.getByLabelText(/Slack Channel/i));

    const submitBtn = screen.getByRole('button', { name: /Create Automation/i });
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Rule',
        scope_type: 'global',
        destinations: ['dest-1'],
        subscribed_events: ['document_viewed'],
      })
    );
  });

  it('disables inputs and buttons when loading', () => {
    const handleCancel = vi.fn();
    render(
      <AutomationBuilder
        destinations={mockDestinations}
        shareLinks={[]}
        datarooms={[]}
        onSubmit={vi.fn()}
        onCancel={handleCancel}
        loading={true}
      />
    );

    expect(screen.getByLabelText(/Name/i)).toBeDisabled();
    expect(screen.getByLabelText(/Scope/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Saving\.\.\./i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
  });
});
