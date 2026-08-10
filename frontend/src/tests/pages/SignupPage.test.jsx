import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SignupPage } from '../../pages/SignupPage'
import { authService } from '../../services/authService'
import '../../i18n'

vi.mock('../../services/authService')

describe('SignupPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const renderComponent = () => {
    return render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('submits signup request and shows accepted message', async () => {
    authService.requestSignup.mockResolvedValue({
      detail: 'If this email is valid, a verification email has been sent.',
    })

    renderComponent()
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'StrongPassword123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(authService.requestSignup).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'StrongPassword123!',
        name: '',
      })
    })

    expect(
      screen.getByText(/if this email is valid, a verification email has been sent/i)
    ).toBeInTheDocument()
  })

  it('shows backend error when request fails', async () => {
    authService.requestSignup.mockRejectedValue({
      response: { data: { detail: 'Public signup is disabled.' } },
    })

    renderComponent()
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'StrongPassword123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText('Public signup is disabled.')).toBeInTheDocument()
    })
  })

  it('shows first validation error when backend returns field errors', async () => {
    authService.requestSignup.mockRejectedValue({
      response: { data: { password: ['This password is too common.'], email: ['Invalid email.'] } },
    })

    renderComponent()
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'StrongPassword123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText('This password is too common.')).toBeInTheDocument()
    })
  })
})
