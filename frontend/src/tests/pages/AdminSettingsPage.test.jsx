import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AdminSettingsPage } from '../../pages/AdminSettingsPage'
import * as api from '../../services/api'
import '../../i18n';

vi.mock('../../services/api', () => ({
  getAdminSettings: vi.fn(),
  updateAdminSetting: vi.fn(),
}))

describe('AdminSettingsPage typed inputs', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders boolean setting as checkbox and submits boolean value', async () => {
    api.getAdminSettings.mockResolvedValue({
      data: [
        {
          key: 'ENABLE_PUBLIC_SIGNUP',
          value: false,
          value_type: 'bool',
          raw_value: 'false',
          description: 'Enable public signup with email verification.',
        },
      ],
    })
    api.updateAdminSetting.mockResolvedValue({
      data: {
        key: 'ENABLE_PUBLIC_SIGNUP',
        value: true,
        value_type: 'bool',
        raw_value: 'true',
      },
    })

    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    )

    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.updateAdminSetting).toHaveBeenCalledWith('ENABLE_PUBLIC_SIGNUP', true)
    })
  })

  it('renders int setting as number input and submits numeric value', async () => {
    api.getAdminSettings.mockResolvedValue({
      data: [
        {
          key: 'MAX_FILES_PER_UPLOAD',
          value: 10,
          value_type: 'int',
          raw_value: '10',
          description: 'Maximum files per upload.',
        },
      ],
    })
    api.updateAdminSetting.mockResolvedValue({
      data: {
        key: 'MAX_FILES_PER_UPLOAD',
        value: 20,
        value_type: 'int',
        raw_value: '20',
      },
    })

    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>
    )

    const input = await screen.findByDisplayValue('10')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.updateAdminSetting).toHaveBeenCalledWith('MAX_FILES_PER_UPLOAD', 20)
    })
  })
})
