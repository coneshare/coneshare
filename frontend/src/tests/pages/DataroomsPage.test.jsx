import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DataroomsPage } from '../../pages/DataroomsPage';
import * as api from '../../services/api';

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
        api.updateDataroom.mockResolvedValue({ data: {} });
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

    it('should open rename dialog when rename action is clicked', async () => {
        const user = userEvent.setup();
        renderComponent();

        const dataroomCard = await screen.findByText('Dataroom One');
        const cardContainer = dataroomCard.closest('div.group');

        // Hover to show actions button
        await user.hover(cardContainer);

        const actionsButton = await screen.findByRole('button', { name: 'Actions' });
        await user.click(actionsButton);

        const renameMenuItem = await screen.findByText('Rename');
        await user.click(renameMenuItem);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Rename Dataroom/i })).toBeInTheDocument();
        });
        
        expect(screen.getByLabelText('Name')).toHaveValue('Dataroom One');
    });

    it('should call updateDataroom and refresh when rename is confirmed', async () => {
        const user = userEvent.setup();
        renderComponent();
    
        const dataroomCard = await screen.findByText('Dataroom One');
        await user.hover(dataroomCard.closest('div.group'));
        await user.click(await screen.findByRole('button', { name: 'Actions' }));
        await user.click(await screen.findByText('Rename'));
    
        const dialogTitle = await screen.findByRole('heading', { name: /Rename Dataroom/i });
        expect(dialogTitle).toBeInTheDocument();
    
        const nameInput = screen.getByLabelText('Name');
        await user.clear(nameInput);
        await user.type(nameInput, 'Renamed Dataroom');
    
        const renameButton = screen.getByRole('button', { name: 'Rename' });
        await user.click(renameButton);
    
        await waitFor(() => {
            expect(api.updateDataroom).toHaveBeenCalledWith('dr1', { name: 'Renamed Dataroom' });
        });
    
        // It should close the dialog and refresh the list
        expect(screen.queryByRole('heading', { name: /Rename Dataroom/i })).not.toBeInTheDocument();
        await waitFor(() => {
            // Initial call + refresh call
            expect(api.getDatarooms).toHaveBeenCalledTimes(2);
        });
    });
});
