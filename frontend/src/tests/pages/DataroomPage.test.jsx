import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DataroomPage } from '../../pages/DataroomPage';
import { BreadcrumbProvider } from '../../components/layout/BreadcrumbProvider';
import Header from '../../components/layout/Header';
import * as api from '../../services/api';

vi.mock('../../services/api');

vi.mock('../../components/dialogs/AddContentDialog', () => ({
    AddContentDialog: ({ isOpen, onOpenChange, onConfirm }) => {
        if (!isOpen) return null;
        return (
            <div data-testid="mock-add-content-dialog">
                <h1>Add Content Dialog</h1>
                <button onClick={() => onConfirm({ document_ids: ['doc_new'], folder_ids: [] })}>
                    Confirm
                </button>
                <button onClick={() => onOpenChange(false)}>Cancel</button>
            </div>
        );
    },
}));

vi.mock('../../contexts/UploadProvider', () => ({
    useUpload: () => ({
        addUploads: vi.fn().mockReturnValue(new Map()),
        updateUpload: vi.fn(),
    }),
}));

vi.mock('../../contexts/UserProvider', () => ({
    useUser: () => ({
        user: { id: 'u1', email: 'test@example.com', max_files_per_upload: 100 },
    }),
}));

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const original = await vi.importActual('react-router-dom');
    return {
        ...original,
        useNavigate: () => mockedNavigate,
        useParams: () => ({ dataroomId: 'dr123' }),
    };
});

describe('DataroomPage', () => {
    const mockDataroomRoot = {
        id: 'dr123',
        name: 'Test Dataroom',
        items: [
            { id: 'folder1', type: 'folder', name: 'Sub Folder', updated_at: '2023-01-01T12:00:00Z', ancestors: [] },
            { id: 'ddoc1', type: 'document', document_id: 'doc1', name: 'Root Document', updated_at: '2023-01-01T12:00:00Z' },
        ],
        folders: [
            { id: 'folder1', name: 'Sub Folder', updated_at: '2023-01-01T12:00:00Z', ancestors: [] }
        ],
        documents: [
            { id: 'ddoc1', document_id: 'doc1', name: 'Root Document', updated_at: '2023-01-01T12:00:00Z' }
        ]
    };

    const mockSubFolderContent = {
        id: 'folder1',
        name: 'Sub Folder',
        ancestors: [],
        items: [
            { id: 'ddoc2', type: 'document', document_id: 'doc2', name: 'Nested Document', updated_at: '2023-01-02T12:00:00Z', parent: 'folder1' }
        ],
        sub_folders: [],
        documents: [
            { id: 'ddoc2', document_id: 'doc2', name: 'Nested Document', updated_at: '2023-01-02T12:00:00Z' }
        ]
    };

    const mockEmptySubFolderContent = {
        id: 'folder1',
        name: 'Sub Folder',
        ancestors: [],
        items: [],
        sub_folders: [],
        documents: []
    };

    beforeEach(() => {
        vi.resetAllMocks();
        api.getDataroom.mockResolvedValue({ data: mockDataroomRoot });
        api.getDataroomFolderContents.mockResolvedValue({ data: mockSubFolderContent });
        api.createDataroomFolder.mockResolvedValue({ data: {} });
        api.updateDataroomDocument.mockResolvedValue({ data: {} });
        api.updateDataroomFolder.mockResolvedValue({ data: {} });
        api.getShareLinksForDataroom.mockResolvedValue({ data: [] });
        api.getDataroomViewSessions.mockResolvedValue({ data: { results: [], count: 0 } });
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter initialEntries={['/datarooms/dr123']}>
                <BreadcrumbProvider>
                    <Header />
                    <Routes>
                        <Route path="/datarooms/:dataroomId" element={<DataroomPage />} />
                    </Routes>
                </BreadcrumbProvider>
            </MemoryRouter>
        );
    };  

    it('should fetch and display root content initially', async () => {
        renderComponent();
        expect(api.getDataroom).toHaveBeenCalledWith('dr123');
        expect(await screen.findByRole('heading', { name: 'Test Dataroom' })).toBeInTheDocument();
        expect(await screen.findByText('Sub Folder')).toBeInTheDocument();
    });

    describe('Error and Empty States', () => {
        it('should display not found message if dataroom fails to load', async () => {
            api.getDataroom.mockRejectedValue({ response: { status: 404 } });
            renderComponent();
            expect(await screen.findByText('Dataroom not found.')).toBeInTheDocument();
        });

        it('should display empty state for a dataroom with no content', async () => {
            const emptyDataroom = { ...mockDataroomRoot, items: [], folders: [], documents: [] };
            api.getDataroom.mockResolvedValue({ data: emptyDataroom });
            renderComponent();
            expect(await screen.findByText('This dataroom is empty')).toBeInTheDocument();
        });
    });

    describe('Folder Navigation', () => {
        it('should navigate into a folder and see its content', async () => {
            const user = userEvent.setup();
            renderComponent();

            // Wait for initial content and click the folder
            const folderItem = await screen.findByText('Sub Folder');
            await user.click(folderItem);

            // Verify API call for folder content and content update
            await waitFor(() => {
                expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder1');
            });
            await waitFor(() => {
                expect(screen.getByText('Nested Document')).toBeInTheDocument();
                expect(screen.queryByText('Root Document')).not.toBeInTheDocument();
            });
        });

        it('should navigate to the document page when a document is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();
            const docItem = await screen.findByText('Root Document');
            await user.click(docItem);
            expect(mockedNavigate).toHaveBeenCalledWith('/documents/doc1');
        });

        it('should update breadcrumbs when navigating into a folder', async () => {
            const user = userEvent.setup();
            renderComponent();

            const folderItem = await screen.findByText('Sub Folder');
            await user.click(folderItem);

            await waitFor(() => {
                expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder1');
            });

            // Verify breadcrumb is updated
            const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
            expect(within(breadcrumbNav).getByText('Test Dataroom')).toBeInTheDocument();
            expect(within(breadcrumbNav).getByText('Sub Folder')).toBeInTheDocument();
        });

        it('should navigate back to root when breadcrumb is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();

            // Navigate into folder first
            const folderItem = await screen.findByText('Sub Folder');
            await user.click(folderItem);
            await waitFor(() => {
                expect(screen.getByText('Nested Document')).toBeInTheDocument();
            });

            // Navigate back using breadcrumb
            const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
            const rootBreadcrumb = within(breadcrumbNav).getByText('Test Dataroom');
            await user.click(rootBreadcrumb);

            // Verify root API was called again and content is updated
            await waitFor(() => {
                // Initial call + call after breadcrumb click
                expect(api.getDataroom).toHaveBeenCalledTimes(2);
            });
            await waitFor(() => {
                expect(screen.getByText('Root Document')).toBeInTheDocument();
                expect(screen.queryByText('Nested Document')).not.toBeInTheDocument();
            });
        });

        it('should display empty state when navigating into an empty folder', async () => {
            api.getDataroomFolderContents.mockResolvedValue({ data: mockEmptySubFolderContent });
            const user = userEvent.setup();
            renderComponent();

            const folderItem = await screen.findByText('Sub Folder');
            await user.click(folderItem);

            await waitFor(() => {
                // This tests that the empty state is shown for a sub-folder.
                expect(screen.getByText('This folder is empty')).toBeInTheDocument();
            });
        });
    });

    describe('Content Management', () => {
        it('should toggle dataroom document star status and call backend', async () => {
            const user = userEvent.setup();
            renderComponent();

            const starButton = await screen.findByLabelText('Star Root Document');
            await user.click(starButton);

            await waitFor(() => {
                expect(api.updateDataroomDocument).toHaveBeenCalledWith('ddoc1', { is_starred: true });
            });

            expect(await screen.findByLabelText('Unstar Root Document')).toBeInTheDocument();
        });

        it('should create a new folder and refresh the list', async () => {
            const user = userEvent.setup();

            const updatedMockDataroomRoot = {
                ...mockDataroomRoot,
                items: [
                    ...mockDataroomRoot.items,
                    { id: 'newFolder1', type: 'folder', name: 'New Test Folder', updated_at: '2023-01-03T12:00:00Z', ancestors: [] }
                ],
                folders: [
                    ...mockDataroomRoot.folders,
                    { id: 'newFolder1', name: 'New Test Folder', updated_at: '2023-01-03T12:00:00Z', ancestors: [] }
                ]
            };
            // Reset and configure mocks for this specific test's sequence
            api.getDataroom.mockReset()
                .mockResolvedValueOnce({ data: mockDataroomRoot })
                .mockResolvedValueOnce({ data: updatedMockDataroomRoot });

            renderComponent();

            // Check initial state
            expect(await screen.findByText('Sub Folder')).toBeInTheDocument();
            expect(screen.queryByText('New Test Folder')).not.toBeInTheDocument();

            // Open the dialog
            const addFolderButton = screen.getByTitle('Add Folder');
            await user.click(addFolderButton);

            // Interact with the dialog
            expect(await screen.findByRole('heading', { name: /Add New Folder/i })).toBeInTheDocument();
            await user.type(screen.getByLabelText('Name'), 'New Test Folder');
            await user.click(screen.getByRole('button', { name: 'Create' }));

            // Assert API call
            await waitFor(() => {
                expect(api.createDataroomFolder).toHaveBeenCalledWith({
                    name: 'New Test Folder',
                    dataroom: 'dr123',
                    parent: null,
                });
            });

            // Assert UI update
            await waitFor(() => {
                expect(screen.getByText('New Test Folder')).toBeInTheDocument();
            });

            // Assert refresh happened
            expect(api.getDataroom).toHaveBeenCalledTimes(2);
        });

        it('should move selected items and refresh the list', async () => {
            api.moveDataroomContent.mockResolvedValue({});
            const user = userEvent.setup();
            renderComponent();

            // Select item
            const docRow = await screen.findByText('Root Document').then(el => el.closest('[data-testid^="draggable-item-"]'));
            await user.click(docRow);
            
            // Open move dialog
            const moveButton = await screen.findByRole('button', { name: /^move$/i });
            await user.click(moveButton);
            
            expect(await screen.findByRole('heading', { name: /move items/i })).toBeInTheDocument();
            
            // The dialog's confirm button is "Move"
            const confirmMoveButton = await screen.findByRole('button', { name: 'Move Here' });
            await user.click(confirmMoveButton);

            // Assert API call
            await waitFor(() => {
                expect(api.moveDataroomContent).toHaveBeenCalledWith('dr123', {
                    dataroom_document_ids: ['ddoc1'],
                    dataroom_folder_ids: [],
                    destination_folder_id: null, // Moving to root
                });
            });
            
            // Assert refresh happened (getDataroom is called for root content)
            // It's called on load, when the move dialog opens, and on refresh.
            await waitFor(() => {
                expect(api.getDataroom).toHaveBeenCalledTimes(3);
            });
        });

        it('should remove selected items from the dataroom and refresh', async () => {
            api.removeContentFromDataroom.mockResolvedValue({});
            const user = userEvent.setup();
            renderComponent();

            // Select items
            const docRow = await screen.findByText('Root Document').then(el => el.closest('[data-testid^="draggable-item-"]'));
            await user.click(docRow);
            await user.keyboard('{Meta>}');
            const folderRow = screen.getByText('Sub Folder').closest('[data-testid^="draggable-item-"]');
            await user.click(folderRow);
            await user.keyboard('{/Meta}');
            
            // Click delete button
            const deleteButton = screen.getByRole('button', { name: /^remove$/i });
            await user.click(deleteButton);
            
            // Confirm deletion
            const confirmDialog = await screen.findByRole('dialog', { name: /remove items from dataroom/i });
            const confirmButton = within(confirmDialog).getByRole('button', { name: 'Remove' });
            await user.click(confirmButton);

            // Assert API call
            await waitFor(() => {
                expect(api.removeContentFromDataroom).toHaveBeenCalledWith('dr123', {
                    dataroom_document_ids: ['ddoc1'],
                    dataroom_folder_ids: ['folder1'],
                });
            });
            
            // Assert refresh happened
            await waitFor(() => {
                // Initial call + refresh call
                expect(api.getDataroom).toHaveBeenCalledTimes(2);
            });
        });

        it('should pass destination folder id when adding content to a subfolder', async () => {
            api.addContentToDataroom.mockResolvedValue({});
            const user = userEvent.setup();
            renderComponent();

            // Navigate into a folder
            const folderItem = await screen.findByText('Sub Folder');
            await user.click(folderItem);
            await waitFor(() => {
                expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder1');
            });

            // Open "Add Content" dialog
            const addContentButton = screen.getByRole('button', { name: /add content/i });
            await user.click(addContentButton);

            // In our mocked dialog, click confirm
            const dialog = await screen.findByTestId('mock-add-content-dialog');
            const confirmButton = within(dialog).getByRole('button', { name: 'Confirm' });
            await user.click(confirmButton);

            // Assert API call includes destination folder id
            await waitFor(() => {
                expect(api.addContentToDataroom).toHaveBeenCalledWith('dr123', {
                    document_ids: ['doc_new'],
                    folder_ids: [],
                    destination_folder_id: 'folder1',
                });
            });
        });

       it('should allow adding the same document to multiple locations', async () => {
            api.addContentToDataroom.mockResolvedValue({});
            const user = userEvent.setup();
            renderComponent();

            // 1. Add content to the root
            const addContentButtonRoot = await screen.findByRole('button', { name: /add content/i });
            await user.click(addContentButtonRoot);

            let dialog = await screen.findByTestId('mock-add-content-dialog');
            let confirmButton = within(dialog).getByRole('button', { name: 'Confirm' });
            await user.click(confirmButton);

            // Assert first API call to root
            await waitFor(() => {
                expect(api.addContentToDataroom).toHaveBeenCalledWith('dr123', {
                    document_ids: ['doc_new'],
                    folder_ids: [],
                    destination_folder_id: null,
                });
            });

            // 2. Navigate into a subfolder
            const folderItem = await screen.findByText('Sub Folder');
            await user.click(folderItem);
            await waitFor(() => {
                expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder1');
            });

            // 3. Add the same content to the subfolder
            const addContentButtonSubfolder = screen.getByRole('button', { name: /add content/i });
            await user.click(addContentButtonSubfolder);

            dialog = await screen.findByTestId('mock-add-content-dialog');
            confirmButton = within(dialog).getByRole('button', { name: 'Confirm' });
            await user.click(confirmButton);

            // Assert second API call to subfolder
            await waitFor(() => {
                expect(api.addContentToDataroom).toHaveBeenCalledWith('dr123', {
                    document_ids: ['doc_new'],
                    folder_ids: [],
                    destination_folder_id: 'folder1',
                });
            });

            // Verify two separate calls were made
            expect(api.addContentToDataroom).toHaveBeenCalledTimes(2);
        });

        describe('Single Item Actions via Menu', () => {
            it('should rename a document and refresh', async () => {
                api.renameDataroomDocument.mockResolvedValue({});
                const user = userEvent.setup();
                renderComponent();
        
                const docRow = await screen.findByText('Root Document').then(el => el.closest('[data-testid^="draggable-item-"]'));
                const menuTrigger = within(docRow).getByRole('button', { name: /actions for/i });
                await user.click(menuTrigger);
        
                const renameMenuItem = await screen.findByRole('menuitem', { name: /rename/i });
                await user.click(renameMenuItem);
        
                const dialog = await screen.findByRole('dialog', { name: /rename document/i });
                const input = within(dialog).getByLabelText('Name');
                await user.clear(input);
                await user.type(input, 'New Document Name.pdf');
                await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
                
                await waitFor(() => {
                    expect(api.renameDataroomDocument).toHaveBeenCalledWith('ddoc1', 'New Document Name.pdf');
                });
                
                await waitFor(() => {
                    expect(api.getDataroom).toHaveBeenCalledTimes(2); // Initial + refresh
                });
            });
        
            it('should remove a folder and refresh', async () => {
                api.removeContentFromDataroom.mockResolvedValue({});
                const user = userEvent.setup();
                renderComponent();
        
                const folderRow = await screen.findByText('Sub Folder').then(el => el.closest('[data-testid^="draggable-item-"]'));
                const menuTrigger = within(folderRow).getByRole('button', { name: /actions for/i });
                await user.click(menuTrigger);
        
                const deleteMenuItem = await screen.findByRole('menuitem', { name: /delete/i });
                await user.click(deleteMenuItem);
        
                const dialog = await screen.findByRole('dialog', { name: /remove "Sub Folder"\?/i });
                await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
        
                await waitFor(() => {
                    expect(api.removeContentFromDataroom).toHaveBeenCalledWith('dr123', {
                        dataroom_document_ids: [],
                        dataroom_folder_ids: ['folder1'],
                    });
                });
        
                await waitFor(() => {
                    expect(api.getDataroom).toHaveBeenCalledTimes(2);
                });
            });
        });
    });

    describe('Selection and Sorting', () => {
        it('should allow selecting and clearing selection', async () => {
            const user = userEvent.setup();
            renderComponent();
    
            await screen.findByText('Sub Folder');
            await screen.findByText('Root Document');
    
            expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    
            const folderRow = screen.getByText('Sub Folder').closest('[data-testid^="draggable-item-"]');
            await user.click(folderRow);
            
            expect(await screen.findByText(/1 folder selected/)).toBeInTheDocument();
    
            await user.keyboard('{Meta>}');
            const docRow = screen.getByText('Root Document').closest('[data-testid^="draggable-item-"]');
            await user.click(docRow);
            await user.keyboard('{/Meta}');
    
            expect(await screen.findByText(/1 document, 1 folder selected/)).toBeInTheDocument();
    
            const clearButton = screen.getByRole('button', { name: 'Clear Selection' });
            await user.click(clearButton);
    
            expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
        });

        it('should support additive multi-select with meta key', async () => {
            const user = userEvent.setup();
            renderComponent();

            const folderRow = await screen.findByText('Sub Folder').then(el => el.closest('[data-testid^="draggable-item-"]'));
            await user.click(folderRow);
            await user.keyboard('{Meta>}');
            const docRow = screen.getByText('Root Document').closest('[data-testid^="draggable-item-"]');
            await user.click(docRow);
            await user.keyboard('{/Meta}');

            const actionBar = await screen.findByText(/selected/);
            expect(actionBar).toHaveTextContent('1 document, 1 folder selected');
        });
    
        it('should open move dialog when move is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();
    
            const folderRow = await screen.findByText('Sub Folder').then(el => el.closest('[data-testid^="draggable-item-"]'));
            await user.click(folderRow);
    
            const moveButton = await screen.findByRole('button', { name: /^move$/i });
            await user.click(moveButton);
    
            expect(await screen.findByRole('heading', { name: /move items/i })).toBeInTheDocument();
        });
    
        it('should sort items by name', async () => {
            const user = userEvent.setup();
            const mockData = {
                ...mockDataroomRoot,
                folders: [
                    { id: 'f2', name: 'B Folder', updated_at: '2023-01-01T12:00:00Z', type: 'folder' },
                    { id: 'f1', name: 'A Folder', updated_at: '2023-01-02T12:00:00Z', type: 'folder' },
                ],
                documents: [],
            };
            api.getDataroom.mockResolvedValue({ data: mockData });
            renderComponent();
    
            await screen.findByText('A Folder');
            
            let listItems = screen.getAllByTestId(/draggable-item-/);
            // Default sort is name ascending, folders first
            expect(within(listItems[0]).getByText('A Folder')).toBeInTheDocument();
            expect(within(listItems[1]).getByText('B Folder')).toBeInTheDocument();

            // Find the "Name" column header, which is a button, and click it to reverse the sort
            const nameHeaderButton = screen.getByRole('button', { name: /Name/i });
            await user.click(nameHeaderButton);

            listItems = screen.getAllByTestId(/draggable-item-/);
            expect(within(listItems[0]).getByText('B Folder')).toBeInTheDocument();
            expect(within(listItems[1]).getByText('A Folder')).toBeInTheDocument();
        });
    });

    describe('Links and Permissions Tab', () => {
        const mockLinks = [
            { id: 'link1', name: 'Test Link', slug: 'slug1', is_active: true, view_count: 5, created_at: '2023-01-01T12:00:00Z', last_viewed_at: null, recent_view_sessions: [], dataroom_settings: [] },
        ];
        const mockViewSessionsPage1 = {
            count: 12,
            next: 'http://localhost/?page=2',
            previous: null,
            results: Array(10).fill(0).map((_, i) => ({ id: `v${i}`, viewer_email: `test${i}@example.com`, viewed_at: '2023-01-02T12:00:00Z', duration_seconds: 60, share_link_name: 'Test Link' })),
        };
        const mockViewSessionsPage2 = {
            count: 12,
            next: null,
            previous: 'http://localhost/?page=1',
            results: Array(2).fill(0).map((_, i) => ({ id: `v1${i}`, viewer_email: `test1${i}@example.com`, viewed_at: '2023-01-03T12:00:00Z', duration_seconds: 30, share_link_name: 'Test Link' })),
        };

        beforeEach(() => {
            api.getShareLinksForDataroom.mockResolvedValue({ data: mockLinks });
            api.getDataroomViewSessions
                .mockResolvedValueOnce({ data: mockViewSessionsPage1 })
                .mockResolvedValueOnce({ data: mockViewSessionsPage2 });
            api.deleteShareLink.mockResolvedValue({});
        });

        it('fetches and displays links and view sessions when tab is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();

            const linksTab = await screen.findByRole('tab', { name: /links and permissions/i });
            await user.click(linksTab);

            const linksTable = (await screen.findByRole('columnheader', { name: /settings/i })).closest('table');
            expect(within(linksTable).getByText('Test Link')).toBeInTheDocument();

            const viewsTable = (await screen.findByRole('columnheader', { name: /visitor/i })).closest('table');
            expect(within(viewsTable).getByText('test0@example.com')).toBeInTheDocument();

            expect(api.getShareLinksForDataroom).toHaveBeenCalledWith('dr123');
            expect(api.getDataroomViewSessions).toHaveBeenCalledWith('dr123', 1);
        });

        it('should open the link sheet when "Create Link" is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();
            const linksTab = await screen.findByRole('tab', { name: /links and permissions/i });
            await user.click(linksTab);

            const createLinkButton = await screen.findByRole('button', { name: /create link/i });
            await user.click(createLinkButton);

            expect(await screen.findByText('Create New Link')).toBeInTheDocument();
        });

        it('should delete a link after confirmation and refresh the list', async () => {
            const user = userEvent.setup();
            renderComponent();
            const linksTab = await screen.findByRole('tab', { name: /links and permissions/i });
            await user.click(linksTab);

            const linksTable = (await screen.findByRole('columnheader', { name: /settings/i })).closest('table');
            const row = within(linksTable).getByText('Test Link').closest('tr');
            const actionCell = within(row).getAllByRole('cell').pop();
            const dropdownTrigger = within(actionCell).getByRole('button');
            await user.click(dropdownTrigger);          

            const deleteOption = await screen.findByText('Delete');
            await user.click(deleteOption);

            const confirmDialog = await screen.findByRole('dialog', { name: /delete share link/i });
            const confirmButton = within(confirmDialog).getByRole('button', { name: 'Delete' });
            await user.click(confirmButton);

            await waitFor(() => {
                expect(api.deleteShareLink).toHaveBeenCalledWith('link1');
                expect(api.getShareLinksForDataroom).toHaveBeenCalledTimes(2);
            });
        });

        it('should open the manage permissions dialog', async () => {
            const user = userEvent.setup();
            renderComponent();
            const linksTab = await screen.findByRole('tab', { name: /links and permissions/i });
            await user.click(linksTab);

            const linksTable = (await screen.findByRole('columnheader', { name: /settings/i })).closest('table');
            const row = within(linksTable).getByText('Test Link').closest('tr');

            const actionCell = within(row).getAllByRole('cell').pop();
            const dropdownTrigger = within(actionCell).getByRole('button');
            await user.click(dropdownTrigger);          

            const permissionsOption = await screen.findByText('Manage Permissions');
            await user.click(permissionsOption);

            expect(await screen.findByRole('dialog', { name: /manage permissions for/i })).toBeInTheDocument();
        });

        it('should paginate through view sessions', async () => {
            const user = userEvent.setup();
            renderComponent();
            const linksTab = await screen.findByRole('tab', { name: /links and permissions/i });
            await user.click(linksTab);

            expect(await screen.findByText('test0@example.com')).toBeInTheDocument();
            expect(screen.queryByText('test10@example.com')).not.toBeInTheDocument();

            const nextPageButton = screen.getByRole('button', { name: /next page/i });
            await user.click(nextPageButton);

            await waitFor(() => {
                expect(api.getDataroomViewSessions).toHaveBeenCalledWith('dr123', 2);
            });

            expect(await screen.findByText('test10@example.com')).toBeInTheDocument();
            expect(screen.queryByText('test0@example.com')).not.toBeInTheDocument();
        });
    });

    describe('Direct Uploads', () => {
        beforeEach(() => {
            api.ensureDataroomFolderPaths = vi.fn().mockResolvedValue({
                data: {
                    detail: "Folder structure ensured successfully.",
                    path_mappings: { 'UploadedFolder': 'UploadedFolder' }
                }
            });
            api.uploadDataroomDocument = vi.fn().mockResolvedValue({ data: { id: 'ddoc_new' } });
        });

        it('should show the Upload options and handle file selection and folder selection upload', async () => {
            const { container } = renderComponent();

            expect(await screen.findByRole('heading', { name: 'Test Dataroom' })).toBeInTheDocument();

            const fileInput = container.querySelector('input[type="file"][multiple]');
            const folderInput = container.querySelector('input[webkitdirectory]');

            expect(fileInput).toBeInTheDocument();
            expect(folderInput).toBeInTheDocument();

            const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
            
            const { fireEvent } = await import('@testing-library/react');
            fireEvent.change(fileInput, {
                target: { files: [file] }
            });

            await waitFor(() => {
                expect(api.uploadDataroomDocument).toHaveBeenCalledTimes(1);
            });
            expect(api.uploadDataroomDocument).toHaveBeenCalledWith(
                'dr123',
                file,
                null,
                'hello.txt',
                expect.any(Function)
            );
        });

        it('should handle folder upload with conflict-resolved path mappings', async () => {
            api.ensureDataroomFolderPaths = vi.fn().mockResolvedValue({
                data: {
                    detail: "Folder structure ensured successfully.",
                    path_mappings: { 'UploadedFolder': 'UploadedFolder (1)' }
                }
            });

            const { container } = renderComponent();
            expect(await screen.findByRole('heading', { name: 'Test Dataroom' })).toBeInTheDocument();
            const folderInput = container.querySelector('input[webkitdirectory]');

            const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'UploadedFolder/Subfolder/hello.txt',
                writable: false
            });

            const { fireEvent } = await import('@testing-library/react');
            fireEvent.change(folderInput, {
                target: { files: [file] }
            });

            await waitFor(() => {
                expect(api.ensureDataroomFolderPaths).toHaveBeenCalledWith(
                    'dr123',
                    ['UploadedFolder/Subfolder'],
                    null
                );
                expect(api.uploadDataroomDocument).toHaveBeenCalledTimes(1);
            });

            expect(api.uploadDataroomDocument).toHaveBeenCalledWith(
                'dr123',
                file,
                null,
                'UploadedFolder (1)/Subfolder/hello.txt',
                expect.any(Function)
            );
        });

        it('should handle file upload defensively when currentDataroomFolder.ancestors is null', async () => {
            const user = userEvent.setup();
            
            // Mock subfolder contents with ancestors as null
            api.getDataroomFolderContents = vi.fn().mockResolvedValue({
                data: {
                    id: 'folder1',
                    name: 'Sub Folder',
                    ancestors: null,
                    items: [],
                    sub_folders: [],
                    documents: []
                }
            });

            const { container } = renderComponent();
            expect(await screen.findByRole('heading', { name: 'Test Dataroom' })).toBeInTheDocument();

            // Navigate to Sub Folder
            const folderItem = await screen.findByText('Sub Folder');
            await user.click(folderItem);

            // Wait for navigation and mock API call
            await waitFor(() => {
                expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder1');
            });

            // Trigger file upload in the subfolder
            const fileInput = container.querySelector('input[type="file"][multiple]');
            const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

            const { fireEvent } = await import('@testing-library/react');
            fireEvent.change(fileInput, {
                target: { files: [file] }
            });

            await waitFor(() => {
                expect(api.uploadDataroomDocument).toHaveBeenCalledTimes(1);
            });

            expect(api.uploadDataroomDocument).toHaveBeenCalledWith(
                'dr123',
                file,
                'folder1',
                'Sub Folder/hello.txt',
                expect.any(Function)
            );
        });
    });
});
