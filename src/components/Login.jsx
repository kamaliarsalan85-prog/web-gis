import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  UserCircleIcon,
  XMarkIcon,
  KeyIcon,
  UserIcon
} from '@heroicons/react/24/outline';

export default function Login({ onClose }) {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (user, pass) => {
    setUsername(user);
    setPassword(pass);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserCircleIcon className="w-6 h-6 text-blue-400" />
            <h3 className="text-base font-semibold text-slate-100">
              {isRegister ? 'Create GIS Account' : 'Sign In to GIS Platform'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-xl text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Username</label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <KeyIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl shadow-sm transition-colors text-xs"
          >
            {loading ? 'Authenticating...' : isRegister ? 'Register' : 'Sign In'}
          </button>
        </form>

        {/* Quick Demo Fill Buttons */}
        {!isRegister && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-center">
            <span className="text-[11px] text-slate-400">Quick Demo Accounts:</span>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('admin', 'admin123')}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-md text-[11px] border border-slate-700 font-mono"
              >
                admin / admin123
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('editor', 'user123')}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-md text-[11px] border border-slate-700 font-mono"
              >
                editor / user123
              </button>
            </div>
          </div>
        )}

        {/* Toggle Login/Register */}
        <div className="text-center pt-2 text-[11px] text-slate-400">
          {isRegister ? (
            <span>
              Already have an account?{' '}
              <button
                onClick={() => setIsRegister(false)}
                className="text-blue-400 hover:underline font-medium"
              >
                Sign In
              </button>
            </span>
          ) : (
            <span>
              Need an account?{' '}
              <button
                onClick={() => setIsRegister(true)}
                className="text-blue-400 hover:underline font-medium"
              >
                Register
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
