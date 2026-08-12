import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DataroomsPage } from '../../pages/DataroomsPage';
import * as api from '../../services/api';
import '../../i18n';

vi.mock('../../services/api');

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const original = await vi.importActual('react-router-dom');
    return {
        ...original,
        useNavigate: () => mockedNavigate,
    };
});

describe('DataroomsPage', () => {
    const mockDatarooms = [
        { id: 'dr1', name: 'Dataroom One', created_at: '2023-01-01T12:00:00Z' },
        { id: 'dr2', name: 'Dataroom Two', created_at: '2023-01-02T12:00:00Z' },
    ];

    beforeEach(() => {
        vi.resetAllMocks();
        api.getDatarooms.mockResolvedValue({ data: mockDatarooms });
        api.createDataroom.mockResolvedValue({ data: {} });
        api.updateDataroom.mockResolvedValue({ data: {} });
        api.deleteDataroom.mockResolvedValue({});
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter initialEntries={['/datarooms']}>
                <Routes>
                    <Route path="/datarooms" element={<DataroomsPage />} />
                </Routes>
            </MemoryRouter>
        );
    };

    it('should render the list of datarooms', async () => {
        renderComponent();
        expect(api.getDatarooms).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Dataroom One')).toBeInTheDocument();
        expect(await screen.findByText('Dataroom Two')).toBeInTheDocument();
    });

    it('should display empty state when no datarooms are available', async () => {
        api.getDatarooms.mockResolvedValue({ data: [] });
        renderComponent();
        expect(await screen.findByText('No datarooms found')).toBeInTheDocument();
    });

    it('should navigate to dataroom detail page on click', async () => {
        const user = userEvent.setup();
        renderComponent();
        const dataroomCard = await screen.findByText('Dataroom One');
        await user.click(dataroomCard);
        expect(mockedNavigate).toHaveBeenCalledWith('/datarooms/dr1');
    });

    describe('Dataroom Actions', () => {
        it('should create a new dataroom and refresh the list', async () => {
            const user = userEvent.setup();
            renderComponent();
            const addButton = screen.getByRole('button', { name: /Add Dataroom/i });
            await user.click(addButton);

            const dialogTitle = await screen.findByRole('heading', { name: /Add New Dataroom/i });
            expect(dialogTitle).toBeInTheDocument();

            const nameInput = screen.getByLabelText('Name');
            await user.type(nameInput, 'New Project Dataroom');

            const createButton = screen.getByRole('button', { name: 'Create Dataroom' });
            await user.click(createButton);

            await waitFor(() => {
                expect(api.createDataroom).toHaveBeenCalledWith({ name: 'New Project Dataroom' });
            });

            // Dialog closes and list refreshes
            expect(screen.queryByRole('heading', { name: /Add New Dataroom/i })).not.toBeInTheDocument();
            await waitFor(() => {
                expect(api.getDatarooms).toHaveBeenCalledTimes(2); // Initial + refresh
            });
        });

        it('should open rename dialog when rename action is clicked', async () => {
            const user = userEvent.setup();
            renderComponent();

            const dataroomCard = await screen.findByText('Dataroom One');
            const cardContainer = dataroomCard.closest('div.group');

            await user.hover(cardContainer);
            const actionsButton = await within(cardContainer).findByRole('button', { name: 'Actions' });
            await user.click(actionsButton);

            const renameMenuItem = await screen.findByText('Rename');
            await user.click(renameMenuItem);

            await waitFor(() => {
                expect(screen.getByRole('heading', { name: /Rename/i })).toBeInTheDocument();
            });
            expect(screen.getByLabelText('Name')).toHaveValue('Dataroom One');
        });

        it('should call updateDataroom and refresh when rename is confirmed', async () => {
            const user = userEvent.setup();
            renderComponent();

            const dataroomCard = await screen.findByText('Dataroom One');
            const cardContainer = dataroomCard.closest('div.group');
            await user.hover(cardContainer);
            const actionsButton = await within(cardContainer).findByRole('button', { name: 'Actions' });
            await user.click(actionsButton);
            await user.click(await screen.findByText('Rename'));

            const dialogTitle = await screen.findByRole('heading', { name: /Rename/i });
            expect(dialogTitle).toBeInTheDocument();

            const nameInput = screen.getByLabelText('Name');
            await user.clear(nameInput);
            await user.type(nameInput, 'Renamed Dataroom');

            const renameButton = screen.getByRole('button', { name: /Save|Rename/i });
            await user.click(renameButton);

            await waitFor(() => {
                expect(api.updateDataroom).toHaveBeenCalledWith('dr1', { name: 'Renamed Dataroom' });
            });

            expect(screen.queryByRole('heading', { name: /Rename/i })).not.toBeInTheDocument();
            await waitFor(() => {
                expect(api.getDatarooms).toHaveBeenCalledTimes(2);
            });
        });
        
        it('should delete a dataroom and refresh the list', async () => {
            const user = userEvent.setup();
            renderComponent();

            const dataroomCard = await screen.findByText('Dataroom One');
            await user.hover(dataroomCard.closest('div.group'));
            const actionsButton = await within(dataroomCard.closest('div.group')).findByRole('button', { name: 'Actions' });
            await user.click(actionsButton);

            const deleteMenuItem = await screen.findByText('Delete');
            await user.click(deleteMenuItem);

            const dialogTitle = await screen.findByRole('heading', { name: /Delete "Dataroom One"\?/i });
            expect(dialogTitle).toBeInTheDocument();

            const confirmButton = screen.getByRole('button', { name: 'Delete' });
            await user.click(confirmButton);

            await waitFor(() => {
                expect(api.deleteDataroom).toHaveBeenCalledWith('dr1');
            });

            // Dialog closes and list refreshes
            expect(screen.queryByRole('heading', { name: /Delete "Dataroom One"\?/i })).not.toBeInTheDocument();
            await waitFor(() => {
                expect(api.getDatarooms).toHaveBeenCalledTimes(2); // Initial + refresh
            });
        });
    });
});
