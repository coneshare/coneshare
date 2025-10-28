import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DataroomPage } from '../../pages/DataroomPage';
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
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter initialEntries={['/datarooms/dr123']}>
                <Routes>
                    <Route path="/datarooms/:dataroomId" element={<DataroomPage />} />
                </Routes>
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
});
