import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  ShieldCheckIcon,
  XMarkIcon,
  UserPlusIcon,
  TrashIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

export default function AdminPanel({ layers, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('editor');

  const availableTools = [
    { id: 'stats', label: 'Layer Management' },
    { id: 'table', label: 'Attribute Table' },
    { id: 'spatial', label: 'Spatial Analysis' },
    { id: 'visual', label: 'Visual Thematic' },
    { id: 'draw', label: 'Geometry Editor' },
  ];

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsers(res.data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/register', {
        username: newUsername,
        password: newPassword,
        role: newRole,
      });
      setShowAddUser(false);
      setNewUsername('');
      setNewPassword('');
      fetchUsers();
    } catch (err) {
      alert(`User creation failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleDeleteUser = async (username) => {
    if (confirm(`Are you sure you want to remove user "${username}"?`)) {
      try {
        await api.delete(`/users/${username}`);
        fetchUsers();
      } catch (err) {
        alert(err.response?.data?.error || err.message);
      }
    }
  };

  const handleToggleTool = async (user, toolId) => {
    const currentTools = user.tools || [];
    const newTools = currentTools.includes(toolId)
      ? currentTools.filter((t) => t !== toolId)
      : [...currentTools, toolId];

    try {
      await api.put(`/users/${user.username}`, { tools: newTools });
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-6 h-6 text-indigo-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">GIS User & Access Control</h2>
              <p className="text-xs text-slate-400">Configure roles, tool permissions, and layer rights</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Active System Accounts ({users.length})
            </h3>
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <UserPlusIcon className="w-4 h-4" />
              <span>Create User</span>
            </button>
          </div>

          {/* User List */}
          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.username}
                className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-200">
                      {u.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-200">{u.username}</span>
                        <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${
                          u.role === 'admin'
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                            : 'bg-blue-950 text-blue-400 border border-blue-800'
                        }`}>
                          {u.role}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">Created: {new Date(u.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {u.username !== 'admin' && (
                    <button
                      onClick={() => handleDeleteUser(u.username)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg"
                      title="Delete User"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Tool Permissions Toggles */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                    Tool Permissions:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTools.map((t) => {
                      const hasPerm = u.role === 'admin' || u.tools?.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          disabled={u.role === 'admin'}
                          onClick={() => handleToggleTool(u, t.id)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                            hasPerm
                              ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                              : 'bg-slate-800 text-slate-500 border border-slate-700'
                          }`}
                        >
                          {hasPerm && <CheckIcon className="w-3 h-3" />}
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add User Modal Dialog */}
        {showAddUser && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
              <h4 className="text-sm font-semibold text-slate-100">Create New Account</h4>
              <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                  >
                    <option value="user">User (Viewer & Basic)</option>
                    <option value="editor">Editor (Feature Editing & Draw)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUser(false)}
                    className="px-3 py-1.5 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
