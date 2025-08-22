import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../lib/api';

interface TicketSummary {
  _id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'triaged' | 'waiting_human' | 'in_progress' | 'resolved' | 'closed';
  category: string;
  createdAt: string;
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
    status: 'pending' | 'approved' | 'rejected';
    adminNotes?: string;
  };
}

interface AgentStats {
  assignedTickets: number;
  resolvedToday: number;
  avgResponseTime: number;
  customerSatisfaction: number;
}

interface Suggestion {
  _id: string;
  ticketId: string;
  content: string;
  confidence: number;
  type: 'solution' | 'escalation' | 'assignment';
  createdAt: string;
}

const AgentDashboard: React.FC = () => {
  const [assignedTickets, setAssignedTickets] = useState<TicketSummary[]>([]);
  const [unassignedTickets, setUnassignedTickets] = useState<TicketSummary[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TicketSummary[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<{[key: string]: {canRequest: boolean, reason?: string}}>({});

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Check assignment availability for each unassigned ticket
  useEffect(() => {
    if (unassignedTickets.length > 0) {
      unassignedTickets.forEach(ticket => {
        checkAssignmentAvailability(ticket._id);
      });
    }
  }, [unassignedTickets]);

  const checkAssignmentAvailability = async (ticketId: string) => {
    try {
      const response = await api.get(`/tickets/${ticketId}/can-request-assignment`);
      setAssignmentStatus(prev => ({
        ...prev,
        [ticketId]: response.data
      }));
    } catch (error) {
      console.error('Error checking assignment availability:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [ticketsResponse, unassignedResponse, statsResponse, suggestionsResponse] = await Promise.all([
        api.get('/agent/tickets'),
        api.get('/tickets?unassigned=true'),
        api.get('/agent/stats'),
        api.get('/agent/suggestions')
      ]);
      
      setAssignedTickets(ticketsResponse.data);
      setUnassignedTickets(unassignedResponse.data.tickets || []);
      setStats(statsResponse.data);
      setSuggestions(suggestionsResponse.data);
      
      // Fetch agent's own assignment requests
      try {
        const myRequestsResponse = await api.get('/tickets?myRequests=true');
        setPendingRequests(myRequestsResponse.data.tickets || []);
      } catch (err) {
        console.error('Error fetching my requests:', err);
        setPendingRequests([]);
      }
    } catch (err) {
      setError('Failed to fetch dashboard data');
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateTicketStatus = async (ticketId: string, newStatus: string) => {
    try {
      await api.put(`/tickets/${ticketId}`, { status: newStatus });
      setAssignedTickets(prev => prev.map(ticket =>
        ticket._id === ticketId ? { ...ticket, status: newStatus as any } : ticket
      ));
    } catch (err) {
      console.error('Error updating ticket status:', err);
    }
  };

  const dismissSuggestion = async (suggestionId: string) => {
    try {
      await api.delete(`/agent/suggestions/${suggestionId}`);
      setSuggestions(prev => prev.filter(s => s._id !== suggestionId));
    } catch (err) {
      console.error('Error dismissing suggestion:', err);
    }
  };

  const assignTicket = async (ticketId: string) => {
    try {
      await api.post(`/tickets/${ticketId}/assign`, { assigneeId: null }); // Assign to self
      // Refresh data to show updated assignments
      fetchDashboardData();
    } catch (err) {
      console.error('Error assigning ticket:', err);
    }
  };

  const requestAssignment = async (ticketId: string) => {
    try {
      await api.post(`/tickets/${ticketId}/assign`, {});
      // Refresh data to show updated status
      fetchDashboardData();
    } catch (err) {
      console.error('Error requesting assignment:', err);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'in-progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'solution': return '💡';
      case 'escalation': return '⚠️';
      case 'assignment': return '👥';
      default: return '📝';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Agent Dashboard</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <span className="text-2xl">📋</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Assigned Tickets</p>
                  <p className="text-2xl font-bold">{stats.assignedTickets}</p>
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
                  <p className="text-sm text-gray-600">Resolved Today</p>
                  <p className="text-2xl font-bold">{stats.resolvedToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <span className="text-2xl">⏱️</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Avg Response Time</p>
                  <p className="text-2xl font-bold">{stats.avgResponseTime}h</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <span className="text-2xl">⭐</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Satisfaction</p>
                  <p className="text-2xl font-bold">{stats.customerSatisfaction}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned Tickets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Assigned Tickets</CardTitle>
            <Link to="/tickets">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {assignedTickets.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No assigned tickets</p>
              ) : (
                assignedTickets.slice(0, 5).map((ticket) => (
                  <div key={ticket._id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <Link 
                        to={`/tickets/${ticket._id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {ticket.title}
                      </Link>
                      <p className="text-sm text-gray-500">
                        {ticket.createdBy.name} • {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Badge className={getPriorityColor(ticket.priority)}>
                          {ticket.priority}
                        </Badge>
                        <Badge className={getStatusColor(ticket.status)}>
                          {ticket.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {ticket.status === 'open' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateTicketStatus(ticket._id, 'in_progress')}
                        >
                          Start
                        </Button>
                      )}
                      {ticket.status === 'in_progress' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateTicketStatus(ticket._id, 'resolved')}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Unassigned Tickets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Available Tickets</CardTitle>
            <Link to="/tickets?status=triaged">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unassignedTickets.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No unassigned tickets available</p>
              ) : (
                unassignedTickets.map((ticket) => (
                  <div key={ticket._id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Link 
                          to={`/tickets/${ticket._id}`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          {ticket.title}
                        </Link>
                        <p className="text-sm text-gray-500">{ticket.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge className={getStatusColor(ticket.status)}>
                            {ticket.status}
                          </Badge>
                          <Badge variant="outline">{ticket.priority}</Badge>
                          <Badge variant="outline">{ticket.category}</Badge>
                        </div>
                        
                        {/* Assignment Status */}
                        {assignmentStatus[ticket._id] && (
                          <div className="mt-2">
                            {assignmentStatus[ticket._id].canRequest ? (
                              <p className="text-sm text-green-600">✅ Available for assignment</p>
                            ) : (
                              <p className="text-sm text-orange-600">⚠️ {assignmentStatus[ticket._id].reason}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        {assignmentStatus[ticket._id]?.canRequest ? (
                          <Button
                            size="sm"
                            onClick={() => requestAssignment(ticket._id)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            Request Assignment
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            className="text-gray-400"
                          >
                            {assignmentStatus[ticket._id]?.reason || 'Checking...'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* My Assignment Requests */}
        {pendingRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>My Assignment Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingRequests.map((ticket) => (
                  <div key={ticket._id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Link 
                          to={`/tickets/${ticket._id}`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          {ticket.title}
                        </Link>
                        <p className="text-sm text-gray-500">
                          Status: {ticket.pendingAssignment?.status === 'pending' ? '⏳ Pending Approval' : 
                                   ticket.pendingAssignment?.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
                        </p>
                        <p className="text-sm text-gray-500">
                          Requested: {new Date(ticket.pendingAssignment?.requestedAt || '').toLocaleDateString()}
                        </p>
                        {ticket.pendingAssignment?.adminNotes && (
                          <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded mt-2">
                            <strong>Admin Notes:</strong> {ticket.pendingAssignment.adminNotes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle>AI Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestions.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No suggestions available</p>
              ) : (
                suggestions.map((suggestion) => (
                  <div key={suggestion._id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-2">
                        <span className="text-lg">{getSuggestionIcon(suggestion.type)}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium capitalize">{suggestion.type} Suggestion</p>
                          <p className="text-sm text-gray-600 mt-1">{suggestion.content}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline">
                              {Math.round(suggestion.confidence * 100)}% confidence
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {new Date(suggestion.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dismissSuggestion(suggestion._id)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link to="/tickets/new">
              <Button variant="outline" className="w-full">
                Create Ticket
              </Button>
            </Link>
            <Link to="/kb">
              <Button variant="outline" className="w-full">
                Knowledge Base
              </Button>
            </Link>
            <Link to="/tickets?status=open">
              <Button variant="outline" className="w-full">
                Unassigned Tickets
              </Button>
            </Link>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={fetchDashboardData}
            >
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentDashboard;
