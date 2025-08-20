import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Login from '../pages/Login'
import { AuthProvider } from '../contexts/AuthContext'
import * as api from '../lib/api'

// Mock the API
vi.mock('../lib/api', () => ({
  authAPI: {
    login: vi.fn(),
    getProfile: vi.fn(),
  },
}))

// Mock router navigation
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function LoginWrapper() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    
    // Mock getProfile to return no user initially
    const mockGetProfile = vi.mocked(api.authAPI.getProfile)
    mockGetProfile.mockRejectedValue(new Error('No token'))
  })

  it('should render login form', async () => {
    render(<LoginWrapper />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to Resolvia')).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })
  })

  it('should display demo accounts information', async () => {
    render(<LoginWrapper />)

    await waitFor(() => {
      expect(screen.getByText('Demo Accounts:')).toBeInTheDocument()
      expect(screen.getByText(/admin@resolvia.com/)).toBeInTheDocument()
      expect(screen.getByText(/agent@resolvia.com/)).toBeInTheDocument()
      expect(screen.getByText(/user@resolvia.com/)).toBeInTheDocument()
    })
  })

  it('should handle successful login', async () => {
    const mockLogin = vi.mocked(api.authAPI.login)
    const mockUser = {
      _id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user' as const,
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    mockLogin.mockResolvedValue({
      data: {
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      }
    } as any)

    const user = userEvent.setup()

    render(<LoginWrapper />)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    // Fill in the form
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      })
    })
  })

  it('should show error on failed login', async () => {
    const mockLogin = vi.mocked(api.authAPI.login)
    mockLogin.mockRejectedValue({
      response: {
        data: {
          error: 'Invalid credentials'
        }
      }
    })

    const user = userEvent.setup()

    render(<LoginWrapper />)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    // Fill in the form with invalid credentials
    await user.type(screen.getByLabelText(/email/i), 'wrong@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('should show loading state during login', async () => {
    const mockLogin = vi.mocked(api.authAPI.login)
    mockLogin.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve({
        data: {
          user: {} as any,
          accessToken: 'token',
          refreshToken: 'refresh'
        }
      }), 100)
    }))

    const user = userEvent.setup()

    render(<LoginWrapper />)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    // Fill in the form
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // Check for loading state
    expect(screen.getByText('Signing in...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /signing in.../i })).toBeDisabled()
  })

  it('should require email and password fields', async () => {
    const user = userEvent.setup()

    render(<LoginWrapper />)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    // Try to submit without filling fields
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // HTML5 validation should prevent submission
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
    
    expect(emailInput.validity.valid).toBe(false)
    expect(passwordInput.validity.valid).toBe(false)
  })

  it('should have link to register page', async () => {
    render(<LoginWrapper />)

    await waitFor(() => {
      const registerLink = screen.getByRole('link', { name: /sign up/i })
      expect(registerLink).toBeInTheDocument()
      expect(registerLink).toHaveAttribute('href', '/register')
    })
  })

  it('should handle generic login error', async () => {
    const mockLogin = vi.mocked(api.authAPI.login)
    mockLogin.mockRejectedValue(new Error('Network error'))

    const user = userEvent.setup()

    render(<LoginWrapper />)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument()
    })
  })
})
