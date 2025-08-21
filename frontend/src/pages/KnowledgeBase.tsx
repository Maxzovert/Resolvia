import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
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

const KnowledgeBase: React.FC = () => {
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const response = await api.get('/kb/articles');
      setArticles(response.data);
    } catch (err) {
      setError('Failed to fetch articles');
      console.error('Error fetching articles:', err);
    } finally {
      setLoading(false);
    }
  };

  const categories = Array.from(new Set(articles.map(article => article.category)));

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || article.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const truncateContent = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading knowledge base...</div>
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Knowledge Base</h1>
        {user?.role === 'admin' && (
          <Link to="/kb/new">
            <Button>Create New Article</Button>
          </Link>
        )}
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Search Articles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Search</label>
              <Input
                placeholder="Search articles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Articles Grid */}
      <div className="grid gap-6">
        {filteredArticles.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500">No articles found</p>
              {user?.role === 'admin' && (
                <Link to="/kb/new" className="mt-4 inline-block">
                  <Button>Create the first article</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredArticles.map((article) => (
            <Card key={article._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <Link 
                      to={`/kb/${article._id}`}
                      className="text-xl font-semibold text-blue-600 hover:text-blue-800 block mb-2"
                    >
                      {article.title}
                    </Link>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline">{article.category}</Badge>
                      {!article.isPublic && (
                        <Badge variant="secondary">Private</Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <p className="text-gray-600 mb-4">
                  {truncateContent(article.body)}
                </p>
                
                {article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {article.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>By {article.createdBy.name}</span>
                  <span>Updated: {new Date(article.updatedAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;
