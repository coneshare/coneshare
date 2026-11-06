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

  it('renders in view-only mode when canManage is false', () => {
    const docWithOwner = {
      ...mockDoc,
      created_by_user: { id: 'u1', name: 'Bob Owner', email: 'bob@example.com' },
    };
    renderComponent({ document: docWithOwner, canManage: false });

    // Should display owner badge
    expect(screen.getByText('Owner: Bob Owner')).toBeInTheDocument();

    // Should not render pencil or rename trigger
    expect(screen.queryByRole('button', { name: 'Rename Document' })).not.toBeInTheDocument();

    // Heading click should not open input
    const heading = screen.getByRole('heading', { name: 'Sample Document.pdf' });
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Should not render Get Link / Share button
    expect(screen.queryByRole('button', { name: /getLink|Share/i })).not.toBeInTheDocument();
  });

  describe('Document Description', () => {
    it('renders document description when present', () => {
      const docWithDesc = {
        ...mockDoc,
        description: 'Quarterly financial analysis report.',
      };
      renderComponent({ document: docWithDesc });

      expect(screen.getByText('Quarterly financial analysis report.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Description' })).toBeInTheDocument();
    });

    it('renders placeholder when description is empty and canManage is true', () => {
      renderComponent({ document: { ...mockDoc, description: '' }, canManage: true });

      expect(screen.getByText('Add description...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Description' })).toBeInTheDocument();
    });

    it('does not render description or placeholder when canManage is false and description is empty', () => {
      renderComponent({ document: { ...mockDoc, description: '' }, canManage: false });

      expect(screen.queryByText('Add description...')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit Description' })).not.toBeInTheDocument();
    });

    it('renders description without edit trigger when canManage is false and description is present', () => {
      const docWithDesc = {
        ...mockDoc,
        description: 'Investor memo.',
      };
      renderComponent({ document: docWithDesc, canManage: false });

      expect(screen.getByText('Investor memo.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit Description' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Investor memo.'));
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('enters editing mode when clicking the description text or edit button', () => {
      const docWithDesc = {
        ...mockDoc,
        description: 'Initial description',
      };
      renderComponent({ document: docWithDesc });

      const descText = screen.getByText('Initial description');
      fireEvent.click(descText);

      const input = screen.getByPlaceholderText('Add description...');
      expect(input).toBeInTheDocument();
      expect(input.value).toBe('Initial description');
    });

    it('cancels description edit on Escape key press', () => {
      const docWithDesc = {
        ...mockDoc,
        description: 'Keep this description',
      };
      renderComponent({ document: docWithDesc });

      fireEvent.click(screen.getByText('Keep this description'));
      const input = screen.getByPlaceholderText('Add description...');
      fireEvent.change(input, { target: { value: 'Changed text' } });
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByPlaceholderText('Add description...')).not.toBeInTheDocument();
      expect(screen.getByText('Keep this description')).toBeInTheDocument();
    });

    it('submits description edit on Enter key press or blur', () => {
      const onUpdateDescription = vi.fn();
      const docWithDesc = {
        ...mockDoc,
        description: 'Old description',
      };
      renderComponent({ document: docWithDesc, onUpdateDescription });

      // 1. Submit on Enter
      fireEvent.click(screen.getByText('Old description'));
      let input = screen.getByPlaceholderText('Add description...');
      fireEvent.change(input, { target: { value: 'Updated on Enter' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      expect(onUpdateDescription).toHaveBeenCalledWith('Updated on Enter');

      // 2. Submit on Blur
      onUpdateDescription.mockClear();
      fireEvent.click(screen.getByText('Old description'));
      input = screen.getByPlaceholderText('Add description...');
      fireEvent.change(input, { target: { value: 'Updated on Blur' } });
      fireEvent.blur(input);
      expect(onUpdateDescription).toHaveBeenCalledWith('Updated on Blur');
    });

    it('does not trigger update if description is unchanged', () => {
      const onUpdateDescription = vi.fn();
      const docWithDesc = {
        ...mockDoc,
        description: 'Same description',
      };
      renderComponent({ document: docWithDesc, onUpdateDescription });

      fireEvent.click(screen.getByText('Same description'));
      const input = screen.getByPlaceholderText('Add description...');
      fireEvent.blur(input);
      expect(onUpdateDescription).not.toHaveBeenCalled();
    });
  });
});
