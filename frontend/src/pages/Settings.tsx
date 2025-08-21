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
  autoCloseEnabled: boolean;
  confidenceThreshold: number;
  slaHours: number;
  aiModel: string;
  stubMode: boolean;
  emailNotificationsEnabled: boolean;
  autoAssignmentEnabled: boolean;
  maxTicketsPerAgent: number;
  businessHours: {
    enabled: boolean;
    timezone: string;
    schedule: {
      [key: string]: { start: string; end: string };
    };
  };
  kbSettings: {
    requireApproval: boolean;
    allowUserSubmissions: boolean;
    autoTagging: boolean;
  };
  limits: {
    maxAttachmentSize: number;
    maxTicketsPerUser: number;
    rateLimitRequests: number;
    rateLimitWindow: number;
  };
  version: number;
  lastUpdatedBy?: string;
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
  const [updatingUsers, setUpdatingUsers] = useState<Set<string>>(new Set());

  console.log('Settings component rendered - config:', config); // Debug log
  console.log('Settings component rendered - loading:', loading); // Debug log
  console.log('Settings component rendered - error:', error); // Debug log

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
      console.log('Config response:', configResponse.data); // Debug log
      console.log('Users response:', usersResponse.data); // Debug log
      
      // Extract the config object from the response
      const configData = configResponse.data.config || configResponse.data;
      console.log('Extracted config data:', configData); // Debug log
      
      // Ensure all required properties exist with defaults
      const completeConfig = ensureCompleteConfig(configData);
      console.log('Complete config with defaults:', completeConfig); // Debug log
      
      setConfig(completeConfig);
      setUsers(usersResponse.data);
    } catch (err) {
      setError('Failed to fetch settings');
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to ensure config has all required properties
  const ensureCompleteConfig = (config: any): SystemConfig => {
    return {
      _id: config._id || 'config',
      autoCloseEnabled: config.autoCloseEnabled || false,
      confidenceThreshold: config.confidenceThreshold || 0.7,
      slaHours: config.slaHours || 24,
      aiModel: config.aiModel || 'gemini-pro',
      stubMode: config.stubMode || false,
      emailNotificationsEnabled: config.emailNotificationsEnabled || true,
      autoAssignmentEnabled: config.autoAssignmentEnabled || false,
      maxTicketsPerAgent: config.maxTicketsPerAgent || 10,
      businessHours: {
        enabled: config.businessHours?.enabled || true,
        timezone: config.businessHours?.timezone || 'UTC',
        schedule: config.businessHours?.schedule || {
          'Monday': { start: '09:00', end: '17:00' },
          'Tuesday': { start: '09:00', end: '17:00' },
          'Wednesday': { start: '09:00', end: '17:00' },
          'Thursday': { start: '09:00', end: '17:00' },
          'Friday': { start: '09:00', end: '17:00' },
          'Saturday': { start: '09:00', end: '17:00' },
          'Sunday': { start: '09:00', end: '17:00' },
        },
        ...config.businessHours
      },
      kbSettings: {
        requireApproval: config.kbSettings?.requireApproval || false,
        allowUserSubmissions: config.kbSettings?.allowUserSubmissions || false,
        autoTagging: config.kbSettings?.autoTagging || false,
        ...config.kbSettings
      },
      limits: {
        maxAttachmentSize: config.limits?.maxAttachmentSize || 1024 * 1024, // 1MB
        maxTicketsPerUser: config.limits?.maxTicketsPerUser || 10,
        rateLimitRequests: config.limits?.rateLimitRequests || 100,
        rateLimitWindow: config.limits?.rateLimitWindow || 60, // seconds
        ...config.limits
      },
      version: config.version || 1,
      lastUpdatedBy: config.lastUpdatedBy,
    };
  };

  const updateConfig = async (updates: Partial<SystemConfig>) => {
    try {
      setSaving(true);
      const response = await api.put('/config', updates);
      
      // Update local state with the response data
      const updatedConfig = response.data.config || response.data;
      setConfig(prev => prev ? { ...prev, ...updatedConfig } : null);
      
      console.log('Config updated successfully:', updatedConfig);
    } catch (err) {
      console.error('Error updating config:', err);
      // Revert the change on error
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      setUpdatingUsers(prev => new Set(prev).add(userId));
      const response = await api.put(`/auth/users/${userId}`, { role: newRole });
      console.log('User role updated:', response.data);
      
      // Update local state
      setUsers(prev => prev.map(user => 
        user._id === userId ? { ...user, role: newRole as any } : user
      ));
    } catch (err) {
      console.error('Error updating user role:', err);
      // Revert the change on error
      fetchData();
    } finally {
      setUpdatingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const toggleUserStatus = async (userId: string) => {
    try {
      setUpdatingUsers(prev => new Set(prev).add(userId));
      const user = users.find(u => u._id === userId);
      if (!user) return;

      const newStatus = !user.isActive;
      const response = await api.put(`/auth/users/${userId}`, { isActive: newStatus });
      console.log('User status updated:', response.data);
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u._id === userId ? { ...u, isActive: newStatus } : u
      ));
    } catch (err) {
      console.error('Error updating user status:', err);
      // Revert the change on error
      fetchData();
    } finally {
      setUpdatingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
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

  // Config is now guaranteed to be complete with defaults
  console.log('Rendering with complete config:', config);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Settings</h1>
        <Button 
          onClick={fetchData} 
          disabled={loading}
          variant="outline"
        >
          {loading ? 'Loading...' : 'Refresh Settings'}
        </Button>
      </div>

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
                  id="stubMode"
                  checked={config.stubMode}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? { ...prev, stubMode: newValue } : null);
                    await updateConfig({ stubMode: newValue });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="stubMode">Enable stub mode (for testing)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="autoAssignment"
                  checked={config.autoAssignmentEnabled}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? { ...prev, autoAssignmentEnabled: newValue } : null);
                    await updateConfig({ autoAssignmentEnabled: newValue });
                  }}
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
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="businessHoursEnabled"
                  checked={config.businessHours.enabled}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? {
                      ...prev,
                      businessHours: { ...prev.businessHours, enabled: newValue }
                    } : null);
                    await updateConfig({
                      businessHours: { ...config.businessHours, enabled: newValue }
                    });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="businessHoursEnabled">Enable business hours</Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startTime">Monday Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={config.businessHours?.schedule['Monday']?.start || '09:00'}
                    onChange={(e) => updateConfig({
                      businessHours: { 
                        ...config.businessHours, 
                        schedule: {
                          ...config.businessHours.schedule,
                          Monday: { ...config.businessHours.schedule['Monday'], start: e.target.value }
                        }
                      }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">Monday End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={config.businessHours?.schedule['Monday']?.end || '17:00'}
                    onChange={(e) => updateConfig({
                      businessHours: { 
                        ...config.businessHours, 
                        schedule: {
                          ...config.businessHours.schedule,
                          Monday: { ...config.businessHours.schedule['Monday'], end: e.target.value }
                        }
                      }
                    })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={config.businessHours?.timezone || 'UTC'}
                  onChange={(e) => updateConfig({
                    businessHours: { 
                      ...config.businessHours, 
                      timezone: e.target.value
                    }
                  })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="slaHours">SLA Hours</Label>
                  <Input
                    id="slaHours"
                    type="number"
                    value={config.slaHours || 24}
                    onChange={(e) => updateConfig({ slaHours: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="confidenceThreshold">Confidence Threshold</Label>
                  <Input
                    id="confidenceThreshold"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={config.confidenceThreshold || 0.7}
                    onChange={(e) => updateConfig({ confidenceThreshold: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="autoCloseEnabled"
                  checked={config.autoCloseEnabled}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? { ...prev, autoCloseEnabled: newValue } : null);
                    await updateConfig({ autoCloseEnabled: newValue });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="autoCloseEnabled">Enable automatic ticket closure</Label>
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
                      disabled={updatingUsers.has(user._id)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                    >
                      <option value="customer">Customer</option>
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      variant={user.isActive ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleUserStatus(user._id)}
                      disabled={updatingUsers.has(user._id)}
                    >
                      {updatingUsers.has(user._id) ? 'Updating...' : (user.isActive ? 'Deactivate' : 'Activate')}
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
                  id="emailNotificationsEnabled"
                  checked={config.emailNotificationsEnabled}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? { ...prev, emailNotificationsEnabled: newValue } : null);
                    await updateConfig({ emailNotificationsEnabled: newValue });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="emailNotificationsEnabled">Enable email notifications</Label>
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
                  id="requireApproval"
                  checked={config.kbSettings.requireApproval}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? {
                      ...prev,
                      kbSettings: { ...prev.kbSettings, requireApproval: newValue }
                    } : null);
                    await updateConfig({
                      kbSettings: { ...config.kbSettings, requireApproval: newValue }
                    });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="requireApproval">Require approval for articles</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="allowUserSubmissions"
                  checked={config.kbSettings.allowUserSubmissions}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? {
                      ...prev,
                      kbSettings: { ...prev.kbSettings, allowUserSubmissions: newValue }
                    } : null);
                    await updateConfig({
                      kbSettings: { ...config.kbSettings, allowUserSubmissions: newValue }
                    });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="allowUserSubmissions">Allow user submissions</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="autoTagging"
                  checked={config.kbSettings.autoTagging}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setConfig(prev => prev ? {
                      ...prev,
                      kbSettings: { ...prev.kbSettings, autoTagging: newValue }
                    } : null);
                    await updateConfig({
                      kbSettings: { ...config.kbSettings, autoTagging: newValue }
                    });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="autoTagging">Enable auto-tagging</Label>
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
