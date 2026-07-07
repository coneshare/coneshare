import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DocumentHeader } from '../../../components/documents/DocumentHeader';
import { TooltipProvider } from '../../../components/ui/Tooltip';

vi.mock('../../../components/ui/Tooltip', () => ({
  TooltipProvider: ({ children }) => <>{children}</>,
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: ({ children }) => <div data-testid="tooltip-content">{children}</div>,
}));

describe('DocumentHeader', () => {
  const mockDoc = {
    id: 'doc123',
    name: 'Sample Document.pdf',
    uploader_info: { name: 'Alice', email: 'alice@example.com' },
    updated_at: '2026-07-06T17:49:55.633843Z',
  };

  const renderComponent = (props = {}) => {
    return render(
      <TooltipProvider>
        <DocumentHeader
          document={mockDoc}
          onCreateLink={vi.fn()}
          onPreview={vi.fn()}
          onUploadNewVersion={vi.fn()}
          onImportVersionFromCloud={vi.fn()}
          onRefreshFromCloud={vi.fn()}
          onDownload={vi.fn()}
          onVersionHistory={vi.fn()}
          onDelete={vi.fn()}
          onRenameDocument={vi.fn()}
          isProcessing={false}
          {...props}
        />
      </TooltipProvider>
    );
  };

  it('renders document name, uploader details, and updated time', () => {
    renderComponent();
    expect(screen.getByText('Sample Document.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by Alice/i)).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Document' })).toBeInTheDocument();
  });

  it('enters editing mode when clicking the heading or pencil icon', () => {
    renderComponent();
    const heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Sample Document.pdf');
  });

  it('cancels edit on Escape key press', () => {
    renderComponent();
    const heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New Name.pdf' } });
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Sample Document.pdf')).toBeInTheDocument();
  });

  it('submits edit on Enter key press or blur', () => {
    const onRenameDocument = vi.fn();
    renderComponent({ onRenameDocument });

    // 1. Submit on Enter
    let heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);
    let input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Enter Name.pdf' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onRenameDocument).toHaveBeenCalledWith('Enter Name.pdf');

    // 2. Submit on Blur
    onRenameDocument.mockClear();
    heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);
    input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Blur Name.pdf' } });
    fireEvent.blur(input);
    expect(onRenameDocument).toHaveBeenCalledWith('Blur Name.pdf');
  });

  it('does not trigger rename if the name is unchanged or empty', () => {
    const onRenameDocument = vi.fn();
    renderComponent({ onRenameDocument });

    // Case 1: Unchanged
    let heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);
    let input = screen.getByRole('textbox');
    fireEvent.blur(input);
    expect(onRenameDocument).not.toHaveBeenCalled();

    // Case 2: Empty name (should revert)
    heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);
    input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(onRenameDocument).not.toHaveBeenCalled();
    expect(screen.getByText('Sample Document.pdf')).toBeInTheDocument();
  });

  it('renders cloud import badge and tooltip with file ID', () => {
    const cloudDoc = {
      ...mockDoc,
      cloud_import: {
        provider: 'dropbox',
        provider_display: 'Dropbox',
        file_id: '/photos/how to use the photos folder.txt',
      },
    };
    renderComponent({ document: cloudDoc });

    expect(screen.getByText(/Imported from Dropbox/i)).toBeInTheDocument();
    expect(screen.getByText('/photos/how to use the photos folder.txt')).toBeInTheDocument();
  });

  it('resets editedName to document.name when entering edit mode, overriding any failed unsaved edits', () => {
    renderComponent();
    
    // Enter edit mode
    let heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);
    
    // Change input value (simulating a failed edit attempt)
    let input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Failed Edit.pdf' } });
    
    // Blur to exit edit mode (document.name in parent remains unchanged)
    fireEvent.blur(input);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    
    // Re-enter edit mode
    heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);
    
    // Verify input contains the correct original document name
    input = screen.getByRole('textbox');
    expect(input.value).toBe('Sample Document.pdf');
  });
});
