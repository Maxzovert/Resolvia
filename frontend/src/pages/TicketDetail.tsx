import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Ticket {
  _id: string;
  title: string;
  description: string;
  category: 'billing' | 'tech' | 'shipping' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'triaged' | 'waiting_human' | 'in_progress' | 'resolved' | 'closed';
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

  replies: Array<{
    _id: string;
    content: string;
    author: {
      _id: string;
      name: string;
      email: string;
      role: string;
    };
    createdAt: string;
    isInternal: boolean;
  }>;
}

const TicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  console.log('TicketDetail rendered with id:', id); // Debug log
  console.log('Current URL:', window.location.href); // Debug log
  console.log('useParams result:', useParams()); // Debug log
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    console.log('useEffect triggered with id:', id); // Debug log
    if (id && id !== 'undefined' && id !== 'null') {
      fetchTicket();
    } else {
      console.error('Invalid ticket ID:', id); // Debug log
      setError('Invalid ticket ID - redirecting to tickets list');
      setLoading(false);
      // Redirect to tickets list after a short delay
      setTimeout(() => {
        navigate('/tickets');
      }, 2000);
    }
  }, [id, navigate]);

  const fetchTicket = async () => {
    try {
      console.log('Fetching ticket with id:', id); // Debug log
      setLoading(true);
      const response = await api.get(`/tickets/${id}`);
      console.log('Ticket response:', response.data); // Debug log
      setTicket(response.data.ticket);
    } catch (err) {
      console.error('Error fetching ticket:', err);
      setError('Failed to fetch ticket details');
    } finally {
      setLoading(false);
    }
  };

  const updateTicketStatus = async (newStatus: string) => {
    try {
      setUpdating(true);
      setUpdateMessage(null);
      await api.put(`/tickets/${id}`, { status: newStatus });
      setTicket(prev => prev ? { ...prev, status: newStatus as any } : null);
      setUpdateMessage(`Status updated to ${newStatus}`);
      console.log('Ticket status updated successfully to:', newStatus);
      
      // Clear success message after 3 seconds
      setTimeout(() => setUpdateMessage(null), 3000);
    } catch (err: any) {
      console.error('Error updating ticket status:', err);
      const errorMessage = err.response?.data?.error || 'Failed to update status';
      setUpdateMessage(errorMessage);
      // Revert the change on error
      fetchTicket();
      
      // Clear error message after 5 seconds for better readability
      setTimeout(() => setUpdateMessage(null), 5000);
    } finally {
      setUpdating(false);
    }
  };

  const updateTicketPriority = async (newPriority: string) => {
    try {
      setUpdating(true);
      setUpdateMessage(null);
      await api.put(`/tickets/${id}`, { priority: newPriority });
      setTicket(prev => prev ? { ...prev, priority: newPriority as any } : null);
      setUpdateMessage(`Priority updated to ${newPriority}`);
      console.log('Ticket priority updated successfully to:', newPriority);
      
      // Clear success message after 3 seconds
      setTimeout(() => setUpdateMessage(null), 3000);
    } catch (err: any) {
      console.error('Error updating ticket priority:', err);
      const errorMessage = err.response?.data?.error || 'Failed to update priority';
      setUpdateMessage(errorMessage);
      // Revert the change on error
      fetchTicket();
      
      // Clear error message after 5 seconds for better readability
      setTimeout(() => setUpdateMessage(null), 5000);
    } finally {
      setUpdating(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;

    try {
      const response = await api.post(`/tickets/${id}/comments`, {
        content: newComment
      });
      setTicket(prev => prev ? {
        ...prev,
        replies: [...prev.replies, response.data]
      } : null);
      setNewComment('');
    } catch (err) {
      console.error('Error adding comment:', err);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading ticket...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error || 'Ticket not found'}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => navigate('/tickets')}
        >
          ← Back to Tickets
        </Button>
      </div>

      {/* Ticket Details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{ticket.title}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={getStatusColor(ticket.status)}>
                  {ticket.status}
                </Badge>
                <Badge className={getPriorityColor(ticket.priority)}>
                  {ticket.priority}
                </Badge>
              </div>
            </div>
            {/* Only show status and priority controls for agents and admins */}
            {(user?.role === 'agent' || user?.role === 'admin') ? (
              <div className="flex gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  <Select
                    value={ticket.status}
                    onValueChange={updateTicketStatus}
                    disabled={updating}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
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
                  <Select
                    value={ticket.priority}
                    onValueChange={updateTicketPriority}
                    disabled={updating}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                <p>Status and priority updates are managed by support agents.</p>
                <p>Current status: <span className="font-medium">{ticket.status}</span> | Priority: <span className="font-medium">{ticket.priority}</span></p>
              </div>
            )}
            {updateMessage && (
              <div className={`text-sm ${updateMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                {updateMessage}
              </div>
            )}
            {updating && (
              <div className="text-sm text-blue-600">
                Updating...
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-600">Customer</h4>
                <p>{ticket.createdBy?.name || 'Unknown'}</p>
                <p className="text-sm text-gray-500">{ticket.createdBy?.email || 'No email'}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-600">Category</h4>
                <p>{ticket.category}</p>
              </div>
              {ticket.assignee && (user?.role === 'agent' || user?.role === 'admin') && (
                <div>
                  <h4 className="font-medium text-gray-600">Assigned To</h4>
                  <p>{ticket.assignee.name}</p>
                  <p className="text-sm text-gray-500">{ticket.assignee.email}</p>
                </div>
              )}
              <div>
                <h4 className="font-medium text-gray-600">Created</h4>
                <p>{new Date(ticket.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-600">Last Updated</h4>
                <p>{new Date(ticket.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>



      {/* Comments */}
      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ticket.replies.map((comment) => (
              <div key={comment._id} className="border-l-4 border-blue-200 pl-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{comment.author.name}</span>
                  <span className="text-sm text-gray-500">
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
              </div>
            ))}
            
            {ticket.replies.length === 0 && (
              <p className="text-gray-500 text-center py-4">No comments yet</p>
            )}
          </div>

          {/* Add Comment */}
          <div className="mt-6 pt-6 border-t">
            <h4 className="font-medium mb-2">Add Comment</h4>
            <Textarea
              placeholder="Write your comment here..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <Button 
              onClick={addComment}
              disabled={!newComment.trim()}
              className="mt-2"
            >
              Add Comment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TicketDetail;
