import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignatureCapturePad } from '../../../components/viewer/SignatureCapturePad';

describe('SignatureCapturePad', () => {
  it('supports switching to Type mode and applying typed signature with identity fields', async () => {
    const onChange = vi.fn();
    const onApply = vi.fn();

    render(
      <SignatureCapturePad
        showIdentityFields
        onChange={onChange}
        onApply={onApply}
        submitLabel="Confirm Signature"
      />
    );

    await userEvent.type(screen.getByLabelText(/Full Name/), 'Alice Investor');
    await userEvent.type(screen.getByLabelText(/Company/), 'Vertex Fund');
    await userEvent.click(screen.getByRole('button', { name: /Type/i }));
    await userEvent.type(screen.getByLabelText(/Typed signature/i), 'Alice Investor');

    await userEvent.click(screen.getByRole('button', { name: /Confirm Signature/i }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        signature_type: 'type',
        signature_data: 'Alice Investor',
        signer_name: 'Alice Investor',
        signer_company: 'Vertex Fund',
      })
    );
  });
});
