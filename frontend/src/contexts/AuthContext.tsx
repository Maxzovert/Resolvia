import React, { createContext, useContext, useEffect, useState } from 'react'
import { authAPI } from '@/lib/api'

interface User {
  _id: string
  name: string
  email: string
  role: 'user' | 'agent' | 'admin'
  isActive: boolean
  lastLogin?: string
  createdAt: string
  updatedAt: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, role?: string) => Promise<void>
  logout: () => void
  updateProfile: (data: { name: string }) => Promise<void>
  isAuthenticated: boolean
  hasRole: (role: string | string[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const login = async (email: string, password: string) => {
    const response = await authAPI.login({ email, password })
    const { user: userData, accessToken, refreshToken } = response.data
    
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    setUser(userData)
  }

  const register = async (name: string, email: string, password: string, role = 'user') => {
    const response = await authAPI.register({ name, email, password, role })
    const { user: userData, accessToken, refreshToken } = response.data
    
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    setUser(userData)
  }

  const logout = () => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (refreshToken) {
      authAPI.logout(refreshToken).catch(console.error)
    }
    
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    setUser(null)
  }

  const updateProfile = async (data: { name: string }) => {
    const response = await authAPI.updateProfile(data)
    setUser(response.data.user)
  }

  const hasRole = (role: string | string[]) => {
    if (!user) return false
    
    const roles = Array.isArray(role) ? role : [role]
    return roles.includes(user.role)
  }

  const loadUser = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        setLoading(false)
        return
      }

      const response = await authAPI.getProfile()
      setUser(response.data.user)
    } catch (error) {
      console.error('Failed to load user:', error)
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUser()
  }, [])

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    isAuthenticated: !!user,
    hasRole,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
