import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import api from '../lib/api';

interface TicketForm {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
}

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<TicketForm>({
    title: '',
    description: '',
    priority: 'medium',
    category: 'other'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    { value: 'tech', label: 'Technical Issue' },
    { value: 'billing', label: 'Billing' },
    { value: 'shipping', label: 'Shipping' },
    { value: 'other', label: 'Other' }
  ];

  const handleInputChange = (
    field: keyof TicketForm,
    value: string
  ) => {
    console.log(`Setting ${field} to:`, value); // Debug log
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/tickets', {
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        category: formData.category
      });

      console.log('Ticket created successfully:', response.data); // Debug log
      console.log('Ticket ID:', response.data._id); // Debug log
      navigate(`/tickets/${response.data._id}`);
    } catch (err: any) {
      console.error('Error creating ticket:', err);
      console.error('Error response:', err.response?.data);
      console.error('Form data sent:', formData);
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Create New Ticket</h1>
        <Button 
          variant="outline" 
          onClick={() => navigate('/tickets')}
        >
          ← Back to Tickets
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ticket Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="Brief description of the issue"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Detailed description of the issue..."
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={6}
                  required
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                type="submit" 
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Creating...' : 'Create Ticket'}
              </Button>
              <Button 
                type="button" 
                variant="outline"
                onClick={() => navigate('/tickets')}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateTicket;
