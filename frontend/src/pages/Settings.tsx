import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import api from '../lib/api';

interface SystemConfig {
  _id: string;
  aiModel: string;
  autoAssignment: boolean;
  escalationRules: {
    highPriorityHours: number;
    urgentPriorityMinutes: number;
  };
  businessHours: {
    start: string;
    end: string;
    timezone: string;
  };
  emailNotifications: {
    newTicket: boolean;
    statusUpdate: boolean;
    assignment: boolean;
  };
  knowledgeBase: {
    autoSuggest: boolean;
    publicAccess: boolean;
  };
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'customer' | 'agent' | 'admin';
  isActive: boolean;
  createdAt: string;
}

const Settings: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'notifications'>('general');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configResponse, usersResponse] = await Promise.all([
        api.get('/config'),
        api.get('/auth/users')
      ]);
      setConfig(configResponse.data);
      setUsers(usersResponse.data);
    } catch (err) {
      setError('Failed to fetch settings');
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (updates: Partial<SystemConfig>) => {
    try {
      setSaving(true);
      const response = await api.put('/config', updates);
      setConfig(response.data);
    } catch (err) {
      console.error('Error updating config:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      await api.put(`/auth/users/${userId}`, { role: newRole });
      setUsers(prev => prev.map(user => 
        user._id === userId ? { ...user, role: newRole as any } : user
      ));
    } catch (err) {
      console.error('Error updating user role:', err);
    }
  };

  const toggleUserStatus = async (userId: string) => {
    try {
      const user = users.find(u => u._id === userId);
      if (!user) return;

      await api.put(`/auth/users/${userId}`, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => 
        u._id === userId ? { ...u, isActive: !u.isActive } : u
      ));
    } catch (err) {
      console.error('Error updating user status:', err);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'agent': return 'bg-blue-100 text-blue-800';
      case 'customer': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading settings...</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error || 'Failed to load settings'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'general', label: 'General' },
            { id: 'users', label: 'User Management' },
            { id: 'notifications', label: 'Notifications' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="aiModel">AI Model</Label>
                <Input
                  id="aiModel"
                  value={config.aiModel}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, aiModel: e.target.value } : null)}
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="autoAssignment"
                  checked={config.autoAssignment}
                  onChange={(e) => updateConfig({ autoAssignment: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="autoAssignment">Enable automatic ticket assignment</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business Hours</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={config.businessHours.start}
                    onChange={(e) => updateConfig({
                      businessHours: { ...config.businessHours, start: e.target.value }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={config.businessHours.end}
                    onChange={(e) => updateConfig({
                      businessHours: { ...config.businessHours, end: e.target.value }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={config.businessHours.timezone}
                    onChange={(e) => updateConfig({
                      businessHours: { ...config.businessHours, timezone: e.target.value }
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Escalation Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="highPriorityHours">High Priority Escalation (hours)</Label>
                  <Input
                    id="highPriorityHours"
                    type="number"
                    value={config.escalationRules.highPriorityHours}
                    onChange={(e) => updateConfig({
                      escalationRules: {
                        ...config.escalationRules,
                        highPriorityHours: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="urgentPriorityMinutes">Urgent Priority Escalation (minutes)</Label>
                  <Input
                    id="urgentPriorityMinutes"
                    type="number"
                    value={config.escalationRules.urgentPriorityMinutes}
                    onChange={(e) => updateConfig({
                      escalationRules: {
                        ...config.escalationRules,
                        urgentPriorityMinutes: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Management */}
      {activeTab === 'users' && (
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users.map((user) => (
                <div key={user._id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <p className="text-xs text-gray-400">
                        Joined: {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge className={getRoleColor(user.role)}>
                      {user.role}
                    </Badge>
                    <select
                      value={user.role}
                      onChange={(e) => updateUserRole(user._id, e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="customer">Customer</option>
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      variant={user.isActive ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleUserStatus(user._id)}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      {activeTab === 'notifications' && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="newTicketNotif"
                  checked={config.emailNotifications.newTicket}
                  onChange={(e) => updateConfig({
                    emailNotifications: {
                      ...config.emailNotifications,
                      newTicket: e.target.checked
                    }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="newTicketNotif">Send notifications for new tickets</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="statusUpdateNotif"
                  checked={config.emailNotifications.statusUpdate}
                  onChange={(e) => updateConfig({
                    emailNotifications: {
                      ...config.emailNotifications,
                      statusUpdate: e.target.checked
                    }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="statusUpdateNotif">Send notifications for status updates</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="assignmentNotif"
                  checked={config.emailNotifications.assignment}
                  onChange={(e) => updateConfig({
                    emailNotifications: {
                      ...config.emailNotifications,
                      assignment: e.target.checked
                    }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="assignmentNotif">Send notifications for ticket assignments</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Knowledge Base Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="autoSuggest"
                  checked={config.knowledgeBase.autoSuggest}
                  onChange={(e) => updateConfig({
                    knowledgeBase: {
                      ...config.knowledgeBase,
                      autoSuggest: e.target.checked
                    }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="autoSuggest">Enable auto-suggestions for tickets</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="publicAccess"
                  checked={config.knowledgeBase.publicAccess}
                  onChange={(e) => updateConfig({
                    knowledgeBase: {
                      ...config.knowledgeBase,
                      publicAccess: e.target.checked
                    }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="publicAccess">Allow public access to knowledge base</Label>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow-lg">
          Saving changes...
        </div>
      )}
    </div>
  );
};

export default Settings;
