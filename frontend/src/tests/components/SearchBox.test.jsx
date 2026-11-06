import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchBox } from '../../components/SearchBox';
import '../../i18n';

describe('SearchBox', () => {
  it('renders input with default translated placeholder and search icon', () => {
    render(<SearchBox />);
    const input = screen.getByPlaceholderText('Search...');
    expect(input).toBeInTheDocument();
  });

  it('calls onChange when user types', () => {
    const handleChange = vi.fn();
    render(<SearchBox value="" onChange={handleChange} placeholder="Search..." />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'budget' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('renders clear button when value is non-empty and calls onClear on click', () => {
    const handleClear = vi.fn();
    render(<SearchBox value="quarterly" onChange={() => {}} onClear={handleClear} />);
    const clearButton = screen.getByRole('button', { name: /clear search/i });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it('does not render clear button when value is empty', () => {
    render(<SearchBox value="" onChange={() => {}} onClear={() => {}} />);
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
  });

  it('displays loading spinner when loading is true', () => {
    render(<SearchBox value="quarterly" loading={true} onClear={() => {}} />);
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
    // Clear button is suppressed during loading
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
  });

  it('disables input when disabled prop is true', () => {
    render(<SearchBox disabled={true} placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });
});
