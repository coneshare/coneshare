import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SignupVerifyPage } from '../../pages/SignupVerifyPage'
import { authService } from '../../services/authService'

vi.mock('../../services/authService')

const mockedNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  }
})

describe('SignupVerifyPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('verifies with uid and token from URL', async () => {
    authService.verifySignup.mockResolvedValue({})

    render(
      <MemoryRouter initialEntries={['/signup/verify?uid=abc123&token=tok123']}>
        <Routes>
          <Route path="/signup/verify" element={<SignupVerifyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(authService.verifySignup).toHaveBeenCalledWith({ uid: 'abc123', token: 'tok123' })
    })

    expect(screen.getByText(/your account has been verified/i)).toBeInTheDocument()
  })

  it('shows validation error from response dictionary', async () => {
    authService.verifySignup.mockRejectedValue({
      response: { data: { token: ['Token is invalid.'] } },
    })

    render(
      <MemoryRouter initialEntries={['/signup/verify?uid=abc123&token=tok123']}>
        <Routes>
          <Route path="/signup/verify" element={<SignupVerifyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Token is invalid.')).toBeInTheDocument()
    })
  })

  it('shows invalid link when uid or token missing', async () => {
    render(
      <MemoryRouter initialEntries={['/signup/verify?token=tok123']}>
        <Routes>
          <Route path="/signup/verify" element={<SignupVerifyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Invalid verification link.')).toBeInTheDocument()
    })
  })
})
