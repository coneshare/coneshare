import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewerToolbar } from '../../../components/viewer/ViewerToolbar';

describe('ViewerToolbar', () => {
  const mockOnPageChange = vi.fn();
  const mockOnZoomIn = vi.fn();
  const mockOnZoomOut = vi.fn();
  const mockOnFitWidth = vi.fn();
  const mockOnFullScreen = vi.fn();
  const mockOnPrint = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <ViewerToolbar
        currentPage={3}
        totalPages={10}
        onPageChange={mockOnPageChange}
        zoomLevel={1}
        onZoomIn={mockOnZoomIn}
        onZoomOut={mockOnZoomOut}
        onFitWidth={mockOnFitWidth}
        onFullScreen={mockOnFullScreen}
        onPrint={mockOnPrint}
        allowDownload={true}
        downloadUrl="https://example.com/file.pdf"
        downloadFileName="test.pdf"
        viewId="test-view-id"
        {...props}
      />
    );
  };

  it('renders all controls correctly', () => {
    renderComponent();
    
    // Check page navigation
    expect(screen.getByTitle('Previous page')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('3');
    expect(screen.getByText('/ 10')).toBeInTheDocument();
    expect(screen.getByTitle('Next page')).toBeInTheDocument();

    // Check zoom controls
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Fit to width')).toBeInTheDocument();

    // Check actions
    expect(screen.getByTitle('Download file')).toBeInTheDocument();
    expect(screen.getByTitle('Print document')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle fullscreen')).toBeInTheDocument();
  });

  it('triggers onZoomIn and onZoomOut callbacks', async () => {
    renderComponent();
    
    await userEvent.click(screen.getByTitle('Zoom in'));
    expect(mockOnZoomIn).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTitle('Zoom out'));
    expect(mockOnZoomOut).toHaveBeenCalledTimes(1);
  });

  it('triggers onFitWidth callback', async () => {
    renderComponent();
    
    await userEvent.click(screen.getByTitle('Fit to width'));
    expect(mockOnFitWidth).toHaveBeenCalledTimes(1);
  });

  it('triggers onFullScreen callback', async () => {
    renderComponent();
    
    await userEvent.click(screen.getByTitle('Toggle fullscreen'));
    expect(mockOnFullScreen).toHaveBeenCalledTimes(1);
  });

  it('triggers onPrint callback', async () => {
    renderComponent();
    
    await userEvent.click(screen.getByTitle('Print document'));
    expect(mockOnPrint).toHaveBeenCalledTimes(1);
  });

  it('disables previous page button on first page', () => {
    renderComponent({ currentPage: 1 });
    expect(screen.getByTitle('Previous page')).toBeDisabled();
    expect(screen.getByTitle('Next page')).toBeEnabled();
  });

  it('disables next page button on last page', () => {
    renderComponent({ currentPage: 10 });
    expect(screen.getByTitle('Previous page')).toBeEnabled();
    expect(screen.getByTitle('Next page')).toBeDisabled();
  });

  it('handles page number input jump on enter', async () => {
    renderComponent();
    
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '5{Enter}');

    expect(mockOnPageChange).toHaveBeenCalledWith(5);
  });

  it('handles page number input jump on blur', async () => {
    renderComponent();
    
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '8');
    input.blur();

    expect(mockOnPageChange).toHaveBeenCalledWith(8);
  });

  it('resets input value if typed page number is out of range', async () => {
    renderComponent();
    
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '15{Enter}');

    expect(mockOnPageChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('3');
  });

  it('resets input value if typed page number is invalid', async () => {
    renderComponent();
    
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'invalid{Enter}');

    expect(mockOnPageChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('3');
  });

  it('hides download button when allowDownload is false', () => {
    renderComponent({ allowDownload: false });
    expect(screen.queryByTitle('Download file')).not.toBeInTheDocument();
  });

  it('renders correctly for videos (hides page nav, zoom, and print)', () => {
    renderComponent({ isVideo: true });

    // Page navigation should NOT be in the document
    expect(screen.queryByTitle('Previous page')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('/ 10')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Next page')).not.toBeInTheDocument();

    // Zoom controls should NOT be in the document
    expect(screen.queryByTitle('Zoom out')).not.toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Zoom in')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Fit to width')).not.toBeInTheDocument();

    // Print should NOT be in the document
    expect(screen.queryByTitle('Print document')).not.toBeInTheDocument();

    // Download and Fullscreen SHOULD be in the document
    expect(screen.getByTitle('Download file')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle fullscreen')).toBeInTheDocument();
  });
});
