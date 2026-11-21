// AdminDashboard.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { io } from 'socket.io-client';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  TrashIcon,
  PencilIcon
} from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';
import Particles from './Particles'; // مسیر را بر اساس ساختار پروژه‌ات تنظیم کن
import { isStaticHost, API_BASE_URL, SOCKET_BASE_URL } from '../services/api';

const API = API_BASE_URL;
const SOCKET_URL = SOCKET_BASE_URL;

const fetchUsers = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: null,
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      throw new Error('عدم دسترسی (توکن نامعتبر یا منقضی شده)');
    }

    if (response.data && Array.isArray(response.data.users)) {
      return response.data.users;
    }

    console.warn('Unexpected /api/users response', response.data);
    return [];
  } catch (err) {
    console.error('fetchUsers error:', err);
    throw err;
  }
};

const fetchLayers = async () => {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const dbRes = await axios.get(`${API}/api/layers`, {
    headers,
    params: { storage: 'db', t: Date.now() },
  });
  const localRes = await axios.get(`${API}/api/layers`, {
    headers,
    params: { storage: 'local', t: Date.now() },
  });
  return [...(dbRes.data.layers || []), ...(localRes.data.layers || [])];
};

const AdminDashboard = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', tools: [], layers: [] });
  const [editingUser, setEditingUser] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'username', direction: 'asc' });
  const [roleFilter, setRoleFilter] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const toolsOptions = [
    'stats', 'edit', 'export', 'spatial', 'visual', 'network',
    'join', 'modeling', 'draw', 'filter', 'search'
  ];

  const { data: users = [], isLoading: isUsersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    onError: () => toast.error('خطا در دریافت کاربران'),
  });

  const { data: layers = [], isLoading: isLayersLoading } = useQuery({
    queryKey: ['layers'],
    queryFn: fetchLayers,
    onError: () => toast.error('خطا در دریافت لایه‌ها'),
  });

  const isLoading = isUsersLoading || isLayersLoading;

  useEffect(() => {
    if (isStaticHost()) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socket.on('connect', () => console.log('AdminDashboard socket connected'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      toast.error('خطا در اتصال به سرور لایه‌ها');
    });
    socket.on('layerUpdated', () => {
      queryClient.invalidateQueries(['layers']);
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const validateForm = (user) => {
    if (!user.username || user.username.length < 3) {
      toast.error('نام کاربری باید حداقل ۳ کاراکتر باشد');
      return false;
    }
    if (user.password && user.password.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return false;
    }
    if (!user.role) {
      toast.error('نقش کاربر الزامی است');
      return false;
    }
    return true;
  };

  const createUserMutation = useMutation({
    mutationFn: (newUser) =>
      axios.post(`${API}/api/register`, newUser, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }),
    onSuccess: () => {
      toast.success('کاربر جدید ایجاد شد');
      setNewUser({ username: '', password: '', role: 'user', tools: [], layers: [] });
      queryClient.invalidateQueries(['users']);
    },
    onError: (error) => toast.error(error.response?.data?.error || 'خطا در ایجاد کاربر'),
  });

  const editUserMutation = useMutation({
    mutationFn: ({ userId, updatedUser }) =>
      axios.put(`${API}/api/users/${userId}`, updatedUser, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }),
    onSuccess: () => {
      toast.success('کاربر به‌روزرسانی شد');
      setEditingUser(null);
      queryClient.invalidateQueries(['users']);
    },
    onError: (error) => toast.error(error.response?.data?.error || 'خطا در به‌روزرسانی کاربر'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) =>
      axios.delete(`${API}/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }),
    onSuccess: () => {
      toast.success('کاربر حذف شد');
      setShowDeleteConfirm(null);
      queryClient.invalidateQueries(['users']);
    },
    onError: (error) => toast.error(error.response?.data?.error || 'خطا در حذف کاربر'),
  });

  const handleCreateUser = useCallback((e) => {
    e.preventDefault();
    if (!validateForm(newUser)) return;
    createUserMutation.mutate(newUser);
  }, [newUser, createUserMutation]);

  const handleEditUser = useCallback((userId) => {
    if (!editingUser || !editingUser.id) {
      toast.error('کاربر انتخاب‌شده نامعتبر است');
      return;
    }
    if (!validateForm(editingUser)) return;
    const updatedUser = {
      username: editingUser.username,
      role: editingUser.role,
      tools: editingUser.tools,
      layers: editingUser.layers,
    };
    if (editingUser.password) updatedUser.password = editingUser.password;
    editUserMutation.mutate({ userId, updatedUser });
  }, [editingUser, editUserMutation]);

  const handleDeleteUser = useCallback((userId) => {
    deleteUserMutation.mutate(userId);
  }, [deleteUserMutation]);

  const handleToolToggle = useCallback((tool, isEdit = false) => {
    if (isEdit) {
      setEditingUser((prev) => ({ ...prev, tools: prev.tools.includes(tool) ? prev.tools.filter((t) => t !== tool) : [...prev.tools, tool] }));
    } else {
      setNewUser((prev) => ({ ...prev, tools: prev.tools.includes(tool) ? prev.tools.filter((t) => t !== tool) : [...prev.tools, tool] }));
    }
  }, []);

  const handleLayerToggle = useCallback((layer, isEdit = false) => {
    if (isEdit) {
      setEditingUser((prev) => ({ ...prev, layers: prev.layers.includes(layer.name) ? prev.layers.filter((l) => l !== layer.name) : [...prev.layers, layer.name] }));
    } else {
      setNewUser((prev) => ({ ...prev, layers: prev.layers.includes(layer.name) ? prev.layers.filter((l) => l !== layer.name) : [...prev.layers, layer.name] }));
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('tools');
    localStorage.removeItem('layers');
    navigate('/login');
    toast.success('با موفقیت خارج شدید');
  }, [navigate]);

  const sortedAndFilteredUsers = useMemo(() => {
    const userList = Array.isArray(users) ? users : [];
    let filtered = userList.filter((user) =>
      user.username?.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (roleFilter ? user.role === roleFilter : true)
    );
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const valueA = (a[sortConfig.key] || '').toString();
        const valueB = (b[sortConfig.key] || '').toString();
        if (sortConfig.direction === 'asc') return valueA.localeCompare(valueB);
        return valueB.localeCompare(valueA);
      });
    }
    return filtered;
  }, [users, searchQuery, roleFilter, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const setDefaultAccessByRole = (role, currentTools = [], currentLayers = []) => {
    if (role === 'admin') {
      return {
        tools: toolsOptions,
        layers: (Array.isArray(layers) ? layers.map(layer => layer.name) : []),
      };
    } else {
      return {
        tools: currentTools.length > 0 ? currentTools : [],
        layers: currentLayers.length > 0 ? currentLayers : [],
      };
    }
  };

  const handleNewRoleChange = (e) => {
    const newRole = e.target.value;
    const { tools, layers: updatedLayers } = setDefaultAccessByRole(newRole, newUser.tools, newUser.layers);
    setNewUser({ ...newUser, role: newRole, tools, layers: updatedLayers });
  };

  const handleEditRoleChange = (e) => {
    const newRole = e.target.value;
    const { tools, layers: updatedLayers } = setDefaultAccessByRole(newRole, editingUser?.tools || [], editingUser?.layers || []);
    setEditingUser({ ...editingUser, role: newRole, tools, layers: updatedLayers });
  };

  useEffect(() => {
    if (editingUser) {
      const { tools, layers: updatedLayers } = setDefaultAccessByRole(editingUser.role, editingUser.tools, editingUser.layers);
      setEditingUser(prev => ({ ...prev, tools, layers: updatedLayers }));
    }
    // intentionally only when editingUser.id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingUser?.id]);

  return (
    <div className="min-h-screen relative p-4 sm:p-6 font-vazir bg-gray-900 overflow-hidden">
      {/* Particles as full-page background */}
      <Particles
        particleCount={5000}
        particleSpread={12}
        speed={0.11}
        particleColors={['#60A5FA', '#7C3AED', '#34D399']}
        moveParticlesOnHover={true}
        particleHoverFactor={1.2}
        alphaParticles={true}
        particleBaseSize={100}
        sizeRandomness={0.8}
        cameraDistance={22}
        disableRotation={false}
        className=""
      />

      {/* optional overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 dark:to-black/40 pointer-events-none z-0" />

      {isLoading && (
        <div className="fixed top-4 right-4 z-[1010] bg-white dark:bg-gray-800 p-2 rounded-full shadow-lg">
          <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {/* --- MOBILE: Added padding for small screens --- */}
      <div className="relative z-10 max-w-5xl mx-auto bg-[#01010183] shadow-lg rounded-xl p-4 sm:p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">داشبورد ادمین</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              تعداد کاربران: {Array.isArray(users) ? users.length : 0} | تعداد لایه‌ها: {layers.length}
            </p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500 transition" aria-label="خروج از حساب کاربری">
            خروج
          </button>
        </div>

        {/* Create User Form */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">ایجاد کاربر جدید</h3>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1" htmlFor="new-username">نام کاربری</label>
                <input id="new-username" type="text" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" required aria-describedby="new-username-error" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1" htmlFor="new-password">رمز عبور</label>
                <input id="new-password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" required aria-describedby="new-password-error" />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1" htmlFor="new-role">نقش</label>
              <select id="new-role" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" aria-label="انتخاب نقش کاربر">
                <option value="user">کاربر عادی</option>
                <option value="editor">ویرایشگر</option>
                <option value="admin">ادمین</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">ابزارهای مجاز</label>
              <div className="flex flex-wrap gap-3">
                {toolsOptions.map((tool) => (
                  <label key={tool} className="flex items-center">
                    <input type="checkbox" checked={newUser.tools.includes(tool)} onChange={() => handleToolToggle(tool)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:bg-gray-700" />
                    <span className="mr-2 text-sm text-gray-700 dark:text-gray-300">{tool}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">لایه‌های مجاز</label>
              <div className="flex flex-wrap gap-3">
                {layers.map((layer) => (
                  <label key={layer.name} className="flex items-center">
                    <input type="checkbox" checked={newUser.layers.includes(layer.name)} onChange={() => handleLayerToggle(layer)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:bg-gray-700" />
                    <span className="mr-2 text-sm text-gray-700 dark:text-gray-300">{layer.name} ({layer.storage})</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" disabled={createUserMutation.isLoading || !newUser.username || !newUser.password} className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed" aria-label="ایجاد کاربر جدید">
              {createUserMutation.isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  در حال ایجاد...
                </span>
              ) : 'ایجاد کاربر'}
            </button>
          </form>
        </div>

        {/* User Search and List */}
        <div>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">لیست کاربران</h3>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="جستجوی کاربر..." className="w-full p-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" aria-label="جستجوی کاربر" />
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            </div>
            <div>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full sm:w-40 p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" aria-label="فیلتر بر اساس نقش">
                <option value="">همه نقش‌ها</option>
                <option value="user">کاربر عادی</option>
                <option value="editor">ویرایشگر</option>
                <option value="admin">ادمین</option>
              </select>
            </div>
          </div>

          {/* --- DESKTOP VIEW: TABLE --- */}
          <div className="overflow-x-auto hidden md:block">
            <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md">
              <thead className="hidden md:table-header-group">
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="px-4 py-2 text-right border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer" onClick={() => handleSort('username')}>
                    نام کاربری {sortConfig.key === 'username' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-2 text-right border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer" onClick={() => handleSort('role')}>
                    نقش {sortConfig.key === 'role' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-2 text-right border-b text-sm font-semibold text-gray-700 dark:text-gray-300">ابزارها</th>
                  <th className="px-4 py-2 text-right border-b text-sm font-semibold text-gray-700 dark:text-gray-300">لایه‌ها</th>
                  <th className="px-4 py-2 text-right border-b text-sm font-semibold text-gray-700 dark:text-gray-300">عملیات</th>
                </tr>
              </thead>
              <tbody className="hidden md:table-row-group">
                {sortedAndFilteredUsers.map((user, index) => (
                  <tr key={user._id} className={`transition ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'} hover:bg-gray-50 dark:hover:bg-gray-700`}>
                    <td className="px-4 py-2 border-b text-gray-700 dark:text-gray-300">{user.username}</td>
                    <td className="px-4 py-2 border-b text-gray-700 dark:text-gray-300">{user.role}</td>
                    <td className="px-4 py-2 border-b text-gray-700 dark:text-gray-300">{(user.tools || []).join(', ') || 'هیچ‌کدام'}</td>
                    <td className="px-4 py-2 border-b text-gray-700 dark:text-gray-300">
                      {(!user.layers || user.layers.length === 0) ? 'هیچ‌کدام' : user.layers.map((lname) => {
                        const linfo = layers.find((l) => l.name === lname);
                        return linfo ? `${linfo.name} (${linfo.storage})` : lname;
                      }).join(', ')}
                    </td>
                    <td className="px-4 py-2 border-b">
                      <button onClick={() => setEditingUser({ id: user._id, username: user.username, role: user.role, tools: user.tools || [], layers: user.layers || [], password: '' })} className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 transition mr-2" aria-label={`ویرایش کاربر ${user.username}`}>
                        <PencilIcon className="w-4 h-4 inline-block ml-1" /> ویرایش
                      </button>
                      <button onClick={() => setShowDeleteConfirm(user._id)} className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500 transition" aria-label={`حذف کاربر ${user.username}`}>
                        <TrashIcon className="w-4 h-4 inline-block ml-1" /> حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- MOBILE VIEW: CARDS --- */}
          <div className="md:hidden space-y-4">
            {sortedAndFilteredUsers.map((user) => (
              <div key={user._id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow">
                <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-bold text-lg text-gray-800 dark:text-gray-100">{user.username}</span>
                  <span className="px-2 py-1 text-xs font-semibold text-white bg-blue-500 rounded-full">{user.role}</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <h4 className="font-semibold text-gray-600 dark:text-gray-400">ابزارها:</h4>
                    <p className="text-gray-700 dark:text-gray-300">{(user.tools || []).join(', ') || 'هیچ‌کدام'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-600 dark:text-gray-400">لایه‌ها:</h4>
                    <p className="text-gray-700 dark:text-gray-300">
                      {(!user.layers || user.layers.length === 0) ? 'هیچ‌کدام' : user.layers.map((lname) => {
                        const linfo = layers.find((l) => l.name === lname);
                        return linfo ? `${linfo.name} (${linfo.storage})` : lname;
                      }).join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setEditingUser({ id: user._id, username: user.username, role: user.role, tools: user.tools || [], layers: user.layers || [], password: '' })} className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 transition" aria-label={`ویرایش کاربر ${user.username}`}>
                    <PencilIcon className="w-4 h-4 inline-block ml-1" /> ویرایش
                  </button>
                  <button onClick={() => setShowDeleteConfirm(user._id)} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500 transition" aria-label={`حذف کاربر ${user.username}`}>
                    <TrashIcon className="w-4 h-4 inline-block ml-1" /> حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit User Modal */}
        <AnimatePresence>
          {editingUser && (
            <motion.div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1010] p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <motion.div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} transition={{ duration: 0.3 }}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">ویرایش کاربر: {editingUser.username}</h3>
                  <button onClick={() => setEditingUser(null)} className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 focus:ring-2 focus:ring-red-500 transition" aria-label="بستن مودال ویرایش">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1" htmlFor="edit-username">نام کاربری</label>
                    <input id="edit-username" type="text" value={editingUser.username} onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" aria-describedby="edit-username-error" />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1" htmlFor="edit-password">رمز عبور (اختیاری)</label>
                    <input id="edit-password" type="password" value={editingUser.password || ''} onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" placeholder="رمز عبور جدید (اختیاری)" aria-describedby="edit-password-error" />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1" htmlFor="edit-role">نقش</label>
                    <select id="edit-role" value={editingUser.role} onChange={handleEditRoleChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" aria-label="انتخاب نقش کاربر">
                      <option value="user">کاربر عادی</option>
                      <option value="editor">ویرایشگر</option>
                      <option value="admin">ادمین</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">ابزارهای مجاز</label>
                    <div className="flex flex-wrap gap-3">
                      {toolsOptions.map((tool) => (
                        <label key={tool} className="flex items-center">
                          <input type="checkbox" checked={(editingUser.tools || []).includes(tool)} onChange={() => handleToolToggle(tool, true)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:bg-gray-700" />
                          <span className="mr-2 text-sm text-gray-700 dark:text-gray-300">{tool}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">لایه‌های مجاز</label>
                    <div className="flex flex-wrap gap-3">
                      {layers.map((layer) => (
                        <label key={layer.name} className="flex items-center">
                          <input type="checkbox" checked={(editingUser.layers || []).includes(layer.name)} onChange={() => handleLayerToggle(layer, true)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:bg-gray-700" />
                          <span className="mr-2 text-sm text-gray-700 dark:text-gray-300">{layer.name} ({layer.storage})</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => handleEditUser(editingUser.id)} disabled={editUserMutation.isLoading || !editingUser.username || !editingUser.role} className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed" aria-label="ذخیره تغییرات کاربر">
                    {editUserMutation.isLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        در حال ذخیره...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center"><CheckIcon className="w-4 h-4 ml-2" /> ذخیره تغییرات</span>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1010]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <motion.div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg max-w-sm w-full" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} transition={{ duration: 0.3 }}>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">تأیید حذف کاربر</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">آیا مطمئن هستید که می‌خواهید این کاربر را حذف کنید؟</p>
                <div className="flex gap-2">
                  <button onClick={() => handleDeleteUser(showDeleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500 transition" aria-label="تأیید حذف کاربر">
                    <TrashIcon className="w-4 h-4 inline-block ml-2" /> حذف
                  </button>
                  <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 transition" aria-label="لغو حذف کاربر">
                    <XMarkIcon className="w-4 h-4 inline-block ml-2" /> لغو
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default React.memo(AdminDashboard);
