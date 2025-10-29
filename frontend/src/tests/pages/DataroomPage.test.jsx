import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DataroomPage } from '../../pages/DataroomPage';
import { BreadcrumbProvider } from '../../components/layout/BreadcrumbProvider';
import * as api from '../../services/api';

vi.mock('../../services/api');

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
        folders: [
            { id: 'folder1', name: 'Sub Folder', updated_at: '2023-01-01T12:00:00Z', ancestors: [] }
        ],
        documents: [
            { id: 'ddoc1', document_id: 'doc1', document_name: 'Root Document', updated_at: '2023-01-01T12:00:00Z' }
        ]
    };

    const mockSubFolderContent = {
        id: 'folder1',
        name: 'Sub Folder',
        ancestors: [],
        sub_folders: [],
        documents: [
            { id: 'ddoc2', document_id: 'doc2', document_name: 'Nested Document', updated_at: '2023-01-02T12:00:00Z' }
        ]
    };

    const mockEmptySubFolderContent = {
        id: 'folder1',
        name: 'Sub Folder',
        ancestors: [],
        sub_folders: [],
        documents: []
    };

    beforeEach(() => {
        vi.resetAllMocks();
        api.getDataroom.mockResolvedValue({ data: mockDataroomRoot });
        api.getDataroomFolderContents.mockResolvedValue({ data: mockSubFolderContent });
        api.createDataroomFolder.mockResolvedValue({ data: {} });
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter initialEntries={['/datarooms/dr123']}>
                <BreadcrumbProvider>
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

        // it('should update breadcrumbs when navigating into a folder', async () => {
        //     const user = userEvent.setup();
        //     renderComponent();

        //     const folderItem = await screen.findByText('Sub Folder');
        //     await user.click(folderItem);

        //     await waitFor(() => {
        //         expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder1');
        //     });

        //     // Verify breadcrumb is updated
        //     const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
        //     expect(within(breadcrumbNav).getByText('Test Dataroom')).toBeInTheDocument();
        //     expect(within(breadcrumbNav).getByText('Sub Folder')).toBeInTheDocument();
        // });

        // it('should navigate back to root when breadcrumb is clicked', async () => {
        //     const user = userEvent.setup();
        //     renderComponent();

        //     // Navigate into folder first
        //     const folderItem = await screen.findByText('Sub Folder');
        //     await user.click(folderItem);
        //     await waitFor(() => {
        //         expect(screen.getByText('Nested Document')).toBeInTheDocument();
        //     });

        //     // Navigate back using breadcrumb
        //     const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' });
        //     const rootBreadcrumb = within(breadcrumbNav).getByText('Test Dataroom');
        //     await user.click(rootBreadcrumb);

        //     // Verify root API was called again and content is updated
        //     await waitFor(() => {
        //         // Initial call + call after breadcrumb click
        //         expect(api.getDataroom).toHaveBeenCalledTimes(2);
        //     });
        //     await waitFor(() => {
        //         expect(screen.getByText('Root Document')).toBeInTheDocument();
        //         expect(screen.queryByText('Nested Document')).not.toBeInTheDocument();
        //     });
        // });

        // it('should display empty state when navigating into an empty folder', async () => {
        //     api.getDataroomFolderContents.mockResolvedValue({ data: mockEmptySubFolderContent });
        //     const user = userEvent.setup();
        //     renderComponent();

        //     const folderItem = await screen.findByText('Sub Folder');
        //     await user.click(folderItem);

        //     await waitFor(() => {
        //         // This tests that the empty state is shown for a sub-folder.
        //         expect(screen.getByText('This folder is empty')).toBeInTheDocument();
        //     });
        // });
    });

    describe('Content Management', () => {
        it('should create a new folder and refresh the list', async () => {
            const user = userEvent.setup();

            const updatedMockDataroomRoot = {
                ...mockDataroomRoot,
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
            await user.click(screen.getByRole('button', { name: 'Create Folder' }));

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
    });

    describe('Selection and Sorting', () => {
        it('should allow selecting and clearing selection', async () => {
            const user = userEvent.setup();
            renderComponent();
    
            await screen.findByText('Sub Folder');
            await screen.findByText('Root Document');
    
            expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    
            const folderCheckbox = screen.getByLabelText('Select Sub Folder');
            await user.click(folderCheckbox);
            
            expect(await screen.findByText(/1 folder selected/)).toBeInTheDocument();
    
            const docCheckbox = screen.getByLabelText('Select Root Document');
            await user.click(docCheckbox);
    
            expect(await screen.findByText(/1 document, 1 folder selected/)).toBeInTheDocument();
    
            const clearButton = screen.getByRole('button', { name: 'Clear Selection' });
            await user.click(clearButton);
    
            expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
        });
    
        it('should open move dialog when move is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();
    
            const folderCheckbox = await screen.findByLabelText('Select Sub Folder');
            await user.click(folderCheckbox);
    
            const moveButton = await screen.findByRole('button', { name: /move/i });
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
});
