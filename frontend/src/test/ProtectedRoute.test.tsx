import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import { AuthProvider } from '../contexts/AuthContext'
import * as api from '../lib/api'

// Mock the API
vi.mock('../lib/api', () => ({
  authAPI: {
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

function TestWrapper({ children, user }: { children: React.ReactNode, user?: any }) {
  const mockGetProfile = vi.mocked(api.authAPI.getProfile)
  
  if (user) {
    mockGetProfile.mockResolvedValue({ data: { user } } as any)
  } else {
    mockGetProfile.mockRejectedValue(new Error('No token'))
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        {children}
      </AuthProvider>
    </BrowserRouter>
  )
}

const TestComponent = () => <div>Protected Content</div>

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should show loading spinner initially', () => {
    const mockGetProfile = vi.mocked(api.authAPI.getProfile)
    mockGetProfile.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    )

    expect(screen.getByRole('status')).toBeInTheDocument() // Loading spinner
  })

  it('should render protected content for authenticated user', async () => {
    const mockUser = {
      _id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    render(
      <TestWrapper user={mockUser}>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    )

    expect(await screen.findByText('Protected Content')).toBeInTheDocument()
  })

  it('should redirect to login for unauthenticated user', async () => {
    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    )

    // Should not render protected content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('should render content for user with required role', async () => {
    const mockUser = {
      _id: '1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    render(
      <TestWrapper user={mockUser}>
        <ProtectedRoute requiredRole="admin">
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    )

    expect(await screen.findByText('Protected Content')).toBeInTheDocument()
  })

  it('should redirect for user without required role', async () => {
    const mockUser = {
      _id: '1',
      name: 'Regular User',
      email: 'user@example.com',
      role: 'user',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    render(
      <TestWrapper user={mockUser}>
        <ProtectedRoute requiredRole="admin">
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    )

    // Should not render protected content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('should allow access for user with one of multiple required roles', async () => {
    const mockUser = {
      _id: '1',
      name: 'Agent User',
      email: 'agent@example.com',
      role: 'agent',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    render(
      <TestWrapper user={mockUser}>
        <ProtectedRoute requiredRole={['agent', 'admin']}>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    )

    expect(await screen.findByText('Protected Content')).toBeInTheDocument()
  })

  it('should deny access for user without any of multiple required roles', async () => {
    const mockUser = {
      _id: '1',
      name: 'Regular User',
      email: 'user@example.com',
      role: 'user',
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }

    render(
      <TestWrapper user={mockUser}>
        <ProtectedRoute requiredRole={['agent', 'admin']}>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    )

    // Should not render protected content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })
})
