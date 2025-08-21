import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Ticket {
  _id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    _id: string;
    name: string;
    email: string;
  };
  assignee?: {
    _id: string;
    name: string;
    email: string;
  };
  pendingAssignment?: {
    requestedBy: {
      _id: string;
      name: string;
      email: string;
    };
    requestedAt: string;
    status: string;
    adminNotes?: string;
  };
}

interface AdminStats {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  overdueTickets: number;
  pendingAssignments: number;
  totalUsers: number;
  totalAgents: number;
}

const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAdminData();
    }
  }, [user]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [ticketsResponse, pendingResponse, statsResponse] = await Promise.all([
        api.get('/tickets?limit=50'),
        api.get('/tickets/pending-assignments'),
        api.get('/tickets/meta/stats'),
      ]);
      
      setTickets(ticketsResponse.data.tickets || []);
      setPendingAssignments(pendingResponse.data.pendingAssignments || []);
      setStats(statsResponse.data);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveAssignment = async (ticketId: string) => {
    try {
      await api.post(`/tickets/${ticketId}/assign/approve`, { adminNotes: '' });
      fetchAdminData();
    } catch (error) {
      console.error('Error approving assignment:', error);
    }
  };

  const rejectAssignment = async (ticketId: string) => {
    try {
      await api.post(`/tickets/${ticketId}/assign/reject`, { adminNotes: '' });
      fetchAdminData();
    } catch (error) {
      console.error('Error rejecting assignment:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'triaged': return 'bg-purple-100 text-purple-800';
      case 'waiting_human': return 'bg-orange-100 text-orange-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
    if (categoryFilter !== 'all' && ticket.category !== categoryFilter) return false;
    return true;
  });

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">Access denied. Admin only.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading admin panel...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Complete system overview and ticket management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAdminData}>
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Admin Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Tickets</p>
                <p className="text-2xl font-bold">{stats?.totalTickets || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <span className="text-2xl">⏳</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Pending Assignments</p>
                <p className="text-2xl font-bold">{pendingAssignments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-2xl">✅</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">In Progress</p>
                <p className="text-2xl font-bold">{stats?.inProgressTickets || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <span className="text-2xl">🚨</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Overdue</p>
                <p className="text-2xl font-bold">{stats?.overdueTickets || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Assignment Requests */}
      {pendingAssignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Assignment Requests</CardTitle>
            <CardDescription>Review and approve agent assignment requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingAssignments.map((ticket) => (
                <div key={ticket._id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link 
                        to={`/tickets/${ticket._id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {ticket.title}
                      </Link>
                      <p className="text-sm text-gray-500">
                        Requested by: {ticket.pendingAssignment?.requestedBy?.name || 'Unknown Agent'} ({ticket.pendingAssignment?.requestedBy?.email || 'No email'})
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(ticket.pendingAssignment?.requestedAt || '').toLocaleDateString()}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge className={getStatusColor(ticket.status)}>
                          {ticket.status}
                        </Badge>
                        <Badge className={getPriorityColor(ticket.priority)}>
                          {ticket.priority}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        onClick={() => approveAssignment(ticket._id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                        onClick={() => rejectAssignment(ticket._id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Tickets with Filters */}
      <Card>
        <CardHeader>
          <CardTitle>All Tickets</CardTitle>
          <CardDescription>Complete overview of all tickets in the system</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="triaged">Triaged</SelectItem>
                  <SelectItem value="waiting_human">Waiting Human</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Priority</label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tickets Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Ticket</th>
                  <th className="text-left p-2">User</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Priority</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-left p-2">Assigned To</th>
                  <th className="text-left p-2">Created</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket._id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <Link 
                        to={`/tickets/${ticket._id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {ticket.title}
                      </Link>
                    </td>
                    <td className="p-2">
                      <div>
                        <p className="font-medium">{ticket.createdBy.name}</p>
                        <p className="text-xs text-gray-500">{ticket.createdBy.email}</p>
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge className={getStatusColor(ticket.status)}>
                        {ticket.status}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <Badge className={getPriorityColor(ticket.priority)}>
                        {ticket.priority}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <span className="capitalize">{ticket.category}</span>
                    </td>
                    <td className="p-2">
                      {ticket.assignee ? (
                        <div>
                          <p className="font-medium">{ticket.assignee.name}</p>
                          <p className="text-xs text-gray-500">{ticket.assignee.email}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="p-2 text-gray-500">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-2">
                      <Link 
                        to={`/tickets/${ticket._id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredTickets.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No tickets found with current filters</p>
            </div>
          )}
          
          <div className="mt-4 text-center">
            <Link to="/tickets">
              <Button variant="outline">View All Tickets</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

           </div>
   );
 };

export default AdminPanel;
