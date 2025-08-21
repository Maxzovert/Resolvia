import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Select } from '../components/ui/select';
import api from '../lib/api';

interface Ticket {
  _id: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  createdAt: string;
  updatedAt: string;
  customer: {
    name: string;
    email: string;
  };
  assignedTo?: {
    name: string;
    email: string;
  };
  comments: Array<{
    _id: string;
    content: string;
    author: {
      name: string;
      role: string;
    };
    createdAt: string;
  }>;
}

const TicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (id) {
      fetchTicket();
    }
  }, [id]);

  const fetchTicket = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/tickets/${id}`);
      setTicket(response.data);
    } catch (err) {
      setError('Failed to fetch ticket details');
      console.error('Error fetching ticket:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateTicketStatus = async (newStatus: string) => {
    try {
      setUpdating(true);
      await api.put(`/tickets/${id}`, { status: newStatus });
      setTicket(prev => prev ? { ...prev, status: newStatus as any } : null);
    } catch (err) {
      console.error('Error updating ticket status:', err);
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
        comments: [...prev.comments, response.data]
      } : null);
      setNewComment('');
    } catch (err) {
      console.error('Error adding comment:', err);
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
    <div className="space-y-6">
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
            <div className="flex gap-2">
              <Select
                value={ticket.status}
                onValueChange={updateTicketStatus}
                disabled={updating}
              >
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </Select>
            </div>
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
                <p>{ticket.customer.name}</p>
                <p className="text-sm text-gray-500">{ticket.customer.email}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-600">Category</h4>
                <p>{ticket.category}</p>
              </div>
              {ticket.assignedTo && (
                <div>
                  <h4 className="font-medium text-gray-600">Assigned To</h4>
                  <p>{ticket.assignedTo.name}</p>
                  <p className="text-sm text-gray-500">{ticket.assignedTo.email}</p>
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
            {ticket.comments.map((comment) => (
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
            
            {ticket.comments.length === 0 && (
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
