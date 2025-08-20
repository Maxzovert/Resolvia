import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) {
          throw new Error('No refresh token')
        }

        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        })

        const { accessToken, refreshToken: newRefreshToken } = response.data
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', newRefreshToken)

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  register: (data: { name: string; email: string; password: string; role?: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: (refreshToken?: string) =>
    api.post('/auth/logout', { refreshToken }),
  getProfile: () =>
    api.get('/auth/profile'),
  updateProfile: (data: { name: string }) =>
    api.put('/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/change-password', data),
}

// KB API
export const kbAPI = {
  searchArticles: (params: { query?: string; category?: string; status?: string; limit?: number; page?: number }) =>
    api.get('/kb', { params }),
  getArticle: (id: string) =>
    api.get(`/kb/${id}`),
  createArticle: (data: { title: string; body: string; tags?: string[]; status?: string; category?: string }) =>
    api.post('/kb', data),
  updateArticle: (id: string, data: Partial<{ title: string; body: string; tags: string[]; status: string; category: string }>) =>
    api.put(`/kb/${id}`, data),
  deleteArticle: (id: string) =>
    api.delete(`/kb/${id}`),
  markHelpful: (id: string) =>
    api.post(`/kb/${id}/helpful`),
  getCategories: () =>
    api.get('/kb/meta/categories'),
  getTags: () =>
    api.get('/kb/meta/tags'),
  getStats: () =>
    api.get('/kb/meta/stats'),
}

// Tickets API
export const ticketsAPI = {
  getTickets: (params: { status?: string; category?: string; limit?: number; page?: number; query?: string }) =>
    api.get('/tickets', { params }),
  getTicket: (id: string) =>
    api.get(`/tickets/${id}`),
  createTicket: (data: { title: string; description: string; category?: string; attachmentUrl?: string; priority?: string }) =>
    api.post('/tickets', data),
  updateTicket: (id: string, data: Partial<{ title: string; description: string; category: string; priority: string; status: string }>) =>
    api.put(`/tickets/${id}`, data),
  addReply: (id: string, data: { content: string; isInternal?: boolean }) =>
    api.post(`/tickets/${id}/reply`, data),
  assignTicket: (id: string, data: { assigneeId: string | null }) =>
    api.post(`/tickets/${id}/assign`, data),
  getStats: () =>
    api.get('/tickets/meta/stats'),
  getOverdue: () =>
    api.get('/tickets/meta/overdue'),
}

// Agent API
export const agentAPI = {
  getSuggestion: (ticketId: string) =>
    api.get(`/agent/suggestion/${ticketId}`),
  submitFeedback: (id: string, data: { accepted: boolean; editedReply?: string; feedbackNotes?: string; rating?: number }) =>
    api.post(`/agent/suggestion/${id}/feedback`, data),
  useSuggestion: (id: string) =>
    api.post(`/agent/suggestion/${id}/use`),
  getMetrics: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/agent/metrics', { params }),
  getPendingReview: (params?: { limit?: number; page?: number }) =>
    api.get('/agent/pending-review', { params }),
  getSuggestionsHistory: (params?: { limit?: number; page?: number; status?: string }) =>
    api.get('/agent/suggestions/history', { params }),
  getQualityTrends: (params?: { days?: number }) =>
    api.get('/agent/quality-trends', { params }),
}

// Config API
export const configAPI = {
  getConfig: () =>
    api.get('/config'),
  updateConfig: (data: Record<string, any>) =>
    api.put('/config', data),
  resetConfig: () =>
    api.post('/config/reset'),
  getHealth: () =>
    api.get('/config/health'),
  updateFeature: (data: { feature: string; enabled: boolean }) =>
    api.patch('/config/features', data),
}

// Audit API
export const auditAPI = {
  getTicketAudit: (ticketId: string, params?: { limit?: number; page?: number }) =>
    api.get(`/audit/tickets/${ticketId}`, { params }),
  getTraceAudit: (traceId: string) =>
    api.get(`/audit/traces/${traceId}`),
  getActivity: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get('/audit/activity', { params }),
  getUserActivity: (userId: string, params?: { startDate?: string; endDate?: string }) =>
    api.get(`/audit/users/${userId}`, { params }),
  searchAudit: (params: { action?: string; actor?: string; startDate?: string; endDate?: string; limit?: number; page?: number }) =>
    api.get('/audit/search', { params }),
  getStats: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/audit/stats', { params }),
}

export default api
