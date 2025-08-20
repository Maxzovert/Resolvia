import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../contexts/AuthContext'
import * as api from '../lib/api'

// Mock the API
vi.mock('../lib/api', () => ({
  authAPI: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}))

// Test component to use the auth context
function TestComponent() {
  const { user, login, logout, isAuthenticated, loading } = useAuth()

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <div data-testid="auth-status">
        {isAuthenticated ? 'Authenticated' : 'Not authenticated'}
      </div>
      {user && <div data-testid="user-name">{user.name}</div>}
      <button onClick={() => login('test@example.com', 'password')}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should render loading state initially', () => {
    const mockGetProfile = vi.mocked(api.authAPI.getProfile)
    mockGetProfile.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should show not authenticated when no user', async () => {
    const mockGetProfile = vi.mocked(api.authAPI.getProfile)
    mockGetProfile.mockRejectedValue(new Error('No token'))

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Not authenticated')
    })
  })

  it('should login user successfully', async () => {
    const mockLogin = vi.mocked(api.authAPI.login)
    const mockGetProfile = vi.mocked(api.authAPI.getProfile)
    
    const mockUser = {
      _id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user' as const,
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    mockGetProfile.mockRejectedValue(new Error('No token'))
    mockLogin.mockResolvedValue({
      data: {
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      }
    } as any)

    const user = userEvent.setup()

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Not authenticated')
    })

    await user.click(screen.getByText('Login'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated')
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User')
    })

    expect(mockLogin).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password'
    })
    expect(localStorage.getItem('accessToken')).toBe('access-token')
    expect(localStorage.getItem('refreshToken')).toBe('refresh-token')
  })

  it('should logout user successfully', async () => {
    const mockLogin = vi.mocked(api.authAPI.login)
    const mockLogout = vi.mocked(api.authAPI.logout)
    const mockGetProfile = vi.mocked(api.authAPI.getProfile)
    
    const mockUser = {
      _id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user' as const,
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    mockGetProfile.mockRejectedValue(new Error('No token'))
    mockLogin.mockResolvedValue({
      data: {
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      }
    } as any)
    mockLogout.mockResolvedValue({ data: { message: 'Logged out' } } as any)

    const user = userEvent.setup()

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // First login
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Not authenticated')
    })

    await user.click(screen.getByText('Login'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated')
    })

    // Then logout
    await user.click(screen.getByText('Logout'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Not authenticated')
    })

    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
  })

  it('should load existing user from token', async () => {
    const mockGetProfile = vi.mocked(api.authAPI.getProfile)
    
    const mockUser = {
      _id: '1',
      name: 'Existing User',
      email: 'existing@example.com',
      role: 'user' as const,
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    localStorage.setItem('accessToken', 'existing-token')
    mockGetProfile.mockResolvedValue({
      data: { user: mockUser }
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated')
      expect(screen.getByTestId('user-name')).toHaveTextContent('Existing User')
    })

    expect(mockGetProfile).toHaveBeenCalled()
  })
})
