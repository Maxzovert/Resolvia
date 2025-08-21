import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import api from '../lib/api';

interface ArticleForm {
  title: string;
  content: string;
  category: string;
  tags: string;
}

const CreateArticle: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<ArticleForm>({
    title: '',
    content: '',
    category: '',
    tags: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    { value: 'billing', label: 'Billing' },
    { value: 'tech', label: 'Technical' },
    { value: 'shipping', label: 'Shipping' },
    { value: 'other', label: 'Other' }
  ];

  const handleInputChange = (
    field: keyof ArticleForm,
    value: string | boolean
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim() || !formData.content.trim()) {
      setError('Please fill in title and content');
      return;
    }

    try {
      setLoading(true);
      const tagsArray = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const response = await api.post('/kb/articles', {
        title: formData.title,
        body: formData.content,
        category: (formData.category || 'other').toLowerCase(),
        tags: tagsArray,
        status: 'published'
      });

      navigate(`/kb/${response.data._id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create article');
      console.error('Error creating article:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Create New Article</h1>
        <Button 
          variant="outline" 
          onClick={() => navigate('/kb')}
        >
          ← Back to Knowledge Base
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Article Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Article title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                >
                  <option value="">Select a category</option>
                  {categories.map(category => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="tag1, tag2, tag3"
                  value={formData.tags}
                  onChange={(e) => handleInputChange('tags', e.target.value)}
                />
              </div>
            </div>



            <div>
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                placeholder="Write your article content here..."
                value={formData.content}
                onChange={(e) => handleInputChange('content', e.target.value)}
                rows={15}
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                You can use line breaks to format your content.
              </p>
            </div>

            <div className="flex gap-3">
              <Button 
                type="submit" 
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Creating...' : 'Create Article'}
              </Button>
              <Button 
                type="button" 
                variant="outline"
                onClick={() => navigate('/kb')}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Preview Section */}
      {(formData.title || formData.content) && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {formData.title && (
                <h2 className="text-2xl font-bold">{formData.title}</h2>
              )}
              {formData.content && (
                <div className="prose max-w-none">
                  {formData.content.split('\n').map((line, index) => (
                    <p key={index} className="mb-3 last:mb-0">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CreateArticle;
