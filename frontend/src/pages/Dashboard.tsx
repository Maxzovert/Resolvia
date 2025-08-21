import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ticketsAPI, kbAPI, agentAPI } from '@/lib/api'
import { formatRelativeTime, getStatusColor } from '@/lib/utils'
import { Plus, Ticket, BookOpen, Brain, TrendingUp } from 'lucide-react'
import api from '@/lib/api';

interface Stats {
  totalTickets: number
  statusStats: Array<{ _id: string; count: number }>
  overdueTickets?: number
  resolvedToday?: number
}

interface RecentTicket {
  _id: string
  title: string
  status: string
  priority: string
  createdAt: string
  createdBy: { name: string; email: string }
  assignee?: { name: string; email: string }
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingAssignments, setPendingAssignments] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData()
    if (user?.role === 'admin') {
      fetchPendingAssignments();
    }
  }, [user])

  const loadDashboardData = async () => {
    try {
      const [statsResponse, ticketsResponse] = await Promise.all([
        ticketsAPI.getStats(),
        ticketsAPI.getTickets({ limit: 5, page: 1 })
      ])

      setStats(statsResponse.data)
      setRecentTickets(ticketsResponse.data.tickets)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingAssignments = async () => {
    try {
      const response = await api.get('/tickets/pending-assignments');
      console.log('Pending assignments response:', response.data);
      
      if (response.data.pendingAssignments && response.data.pendingAssignments.length > 0) {
        console.log('First pending assignment structure:', response.data.pendingAssignments[0]);
        console.log('pendingAssignment field:', response.data.pendingAssignments[0].pendingAssignment);
        console.log('requestedBy field:', response.data.pendingAssignments[0].pendingAssignment?.requestedBy);
        
        // Validate data structure
        const validAssignments = response.data.pendingAssignments.filter((ticket: any) => {
          if (!ticket.pendingAssignment || !ticket.pendingAssignment.requestedBy) {
            console.warn('Invalid ticket structure:', ticket);
            return false;
          }
          return true;
        });
        
        console.log('Valid assignments after filtering:', validAssignments.length);
        setPendingAssignments(validAssignments);
      } else {
        console.log('No pending assignments found');
        setPendingAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching pending assignments:', error);
      setPendingAssignments([]);
    }
  };

  const approveAssignment = async (ticketId: string) => {
    try {
      await api.post(`/tickets/${ticketId}/assign/approve`, { adminNotes: '' });
      fetchPendingAssignments();
    } catch (err) {
      console.error('Error approving assignment:', err);
    }
  };

  const rejectAssignment = async (ticketId: string) => {
    try {
      await api.post(`/tickets/${ticketId}/assign/reject`, { adminNotes: '' });
      fetchPendingAssignments();
    } catch (err) {
      console.error('Error rejecting assignment:', err);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const getQuickActions = () => {
    const actions = []
    
    if (user?.role === 'user' || user?.role === 'admin') {
      actions.push({
        title: 'Create Ticket',
        description: 'Submit a new support request',
        href: '/tickets/new',
        icon: Plus,
        color: 'bg-blue-500'
      })
    }

    actions.push({
      title: 'Browse Knowledge Base',
      description: 'Find answers to common questions',
      href: '/kb',
      icon: BookOpen,
      color: 'bg-green-500'
    })

    if (user?.role === 'agent') {
      actions.push({
        title: 'Agent Dashboard',
        description: 'Review AI suggestions and manage tickets',
        href: '/agent',
        icon: Brain,
        color: 'bg-purple-500'
      })
    }

    if (user?.role === 'admin') {
      actions.push({
        title: 'Admin Panel',
        description: 'Complete system overview and ticket management',
        href: '/admin',
        icon: Brain,
        color: 'bg-purple-500'
      })
    }

    return actions
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-32 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting()}, {user?.name}!
        </h1>
        <p className="text-muted-foreground">
          Welcome to your Resolvia dashboard. Here's what's happening today.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTickets || 0}</div>
            {user?.role === 'user' && (
              <p className="text-xs text-muted-foreground">Your tickets</p>
            )}
          </CardContent>
        </Card>

        {stats?.statusStats.map((stat) => (
          <Card key={stat._id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium capitalize">
                {stat._id.replace('_', ' ')}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.count}</div>
              <Badge variant="outline" className={getStatusColor(stat._id)}>
                {stat._id}
              </Badge>
            </CardContent>
          </Card>
        ))}

        {(user?.role === 'agent' || user?.role === 'admin') && stats?.overdueTickets !== undefined && (
          <Card className="border-destructive">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Overdue</CardTitle>
              <Ticket className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.overdueTickets}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {getQuickActions().map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.title} to={action.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-md ${action.color} text-white`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{action.title}</CardTitle>
                        <CardDescription>{action.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Recent Tickets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Tickets</h2>
          <Link to="/tickets">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </div>
        
        {recentTickets.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {recentTickets.map((ticket) => (
                  <Link 
                    key={ticket._id} 
                    to={`/tickets/${ticket._id}`}
                    className="block p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{ticket.title}</p>
                        <div className="flex items-center mt-1 text-sm text-muted-foreground">
                          <span>By {ticket.createdBy.name}</span>
                          <span className="mx-2">•</span>
                          <span>{formatRelativeTime(ticket.createdAt)}</span>
                        </div>
                      </div>
                      <Badge className={getStatusColor(ticket.status)}>
                        {ticket.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No tickets yet</p>
              {(user?.role === 'user' || user?.role === 'admin') && (
                <Button className="mt-4" asChild>
                  <Link to="/tickets/new">Create your first ticket</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Admin Section - Pending Assignment Requests */}
      {user?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Assignment Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-gray-500 mb-4">Use the Admin Panel for comprehensive ticket management</p>
              <Link to="/admin">
                <Button>Go to Admin Panel</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
