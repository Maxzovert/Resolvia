import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Article {
  _id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  helpfulCount: number;
  createdBy: {
    _id: string;
    name: string;
    email: string;
  };
}

const ArticleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchArticle();
    }
  }, [id]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/kb/articles/${id}`);
      console.log('Article response:', response.data); // Debug log
      setArticle(response.data.article || response.data);
    } catch (err) {
      setError('Failed to fetch article');
      console.error('Error fetching article:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteArticle = async () => {
    if (!confirm('Are you sure you want to delete this article?')) {
      return;
    }

    try {
      await api.delete(`/kb/articles/${id}`);
      navigate('/kb');
    } catch (err) {
      console.error('Error deleting article:', err);
    }
  };

  const formatContent = (content: string) => {
    // Simple formatting for line breaks and basic markdown-like syntax
    return content
      .split('\n')
      .map((line, index) => (
        <p key={index} className="mb-3 last:mb-0">
          {line}
        </p>
      ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading article...</div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error || 'Article not found'}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => navigate('/kb')}
        >
          ← Back to Knowledge Base
        </Button>
        {user?.role === 'admin' && (
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => navigate(`/kb/${id}/edit`)}
            >
              Edit Article
            </Button>
            <Button 
              variant="destructive"
              onClick={deleteArticle}
            >
              Delete Article
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <CardTitle className="text-3xl">{article?.title || 'Untitled'}</CardTitle>
            
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">{article?.category || 'Uncategorized'}</Badge>
              {article?.status === 'draft' && (
                <Badge variant="secondary">Draft</Badge>
              )}
              {article?.tags?.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div>
                <span className="font-medium">Author:</span> {article?.createdBy?.name || 'Unknown'}
              </div>
              <div className="flex gap-4">
                <span>
                  <span className="font-medium">Created:</span>{' '}
                  {article?.createdAt ? new Date(article.createdAt).toLocaleDateString() : 'Unknown'}
                </span>
                <span>
                  <span className="font-medium">Updated:</span>{' '}
                  {article?.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="prose max-w-none">
            <div className="text-gray-800 leading-relaxed">
              {article?.body ? formatContent(article.body) : 'No content available'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Related Articles or Feedback Section */}
      <Card>
        <CardHeader>
          <CardTitle>Was this article helpful?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button variant="outline">👍 Yes</Button>
            <Button variant="outline">👎 No</Button>
            <Button variant="outline">💬 Leave Feedback</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ArticleDetail;
