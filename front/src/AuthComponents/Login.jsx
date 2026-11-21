// Login.jsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { motion } from 'framer-motion';
import { UserIcon, LockClosedIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/solid';
import Particles from './Particles'; // مسیر را طبق پروژه‌ات تنظیم کن

// ✅ API base از ENV یا مسیر نسبی (same-origin)؛ هیچ URL هاردکدی نداریم
const API = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' ? '' : '');

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();
  const usernameRef = useRef(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const isValidInput = useCallback(() => {
    if (!username || username.length < 3) {
      toast.error('نام کاربری باید حداقل ۳ کاراکتر باشد');
      return false;
    }
    if (!password || password.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return false;
    }
    return true;
  }, [username, password]);

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault();
      if (!isValidInput()) return;
      setIsProcessing(true);
      try {
        const { data } = await axios.post(`${API}/api/login`, { username, password }/*, { withCredentials: true }*/);
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('tools', JSON.stringify(data.tools));
        localStorage.setItem('layers', JSON.stringify(data.layers));
        toast.success('ورود موفقیت‌آمیز بود!');
        navigate('/map');
      } catch (error) {
        const errorMessage = error?.response?.data?.error || 'خطا در ورود به سیستم';
        toast.error(errorMessage);
      } finally {
        setIsProcessing(false);
      }
    },
    [username, password, navigate, isValidInput]
  );

  return (
    <div className="min-h-screen relative bg-gray-900 font-vazir p-4 flex items-center justify-center">
      {/* Particles به عنوان بک‌گراند تمام صفحه */}
      <Particles
        particleCount={5000}
        particleSpread={12}
        speed={0.12}
        particleColors={['#60A5FA', '#7C3AED', '#34D399']}
        moveParticlesOnHover={true}
        particleHoverFactor={1.5}
        alphaParticles={true}
        particleBaseSize={120}
        sizeRandomness={0.9}
        cameraDistance={24}
        disableRotation={false}
        className=""
      />

      {/* لایهٔ نیمه‌شفاف روی بک‌گراند (اختیاری) */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 dark:to-black/40 pointer-events-none z-5" />

      {/* فرم */}
      <motion.div
        className="bg-[#01010183] p-8 rounded-lg shadow-md w-full max-w-md relative z-10"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6 text-center">
          ورود به سیستم
        </h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1" htmlFor="username">
              نام کاربری
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              required
              aria-label="نام کاربری"
              aria-describedby="username-error"
              disabled={isProcessing}
              ref={usernameRef}
            />
            <UserIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute left-3 top-9" />
            {username && username.length < 3 && (
              <motion.p className="text-sm text-red-600 dark:text-red-400 mt-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} id="username-error">
                نام کاربری باید حداقل ۳ کاراکتر باشد
              </motion.p>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1" htmlFor="password">
              رمز عبور
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              required
              aria-label="رمز عبور"
              aria-describedby="password-error"
              disabled={isProcessing}
            />
            <LockClosedIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute left-3 top-9" />
            {password && password.length < 6 && (
              <motion.p className="text-sm text-red-600 dark:text-red-400 mt-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} id="password-error">
                رمز عبور باید حداقل ۶ کاراکتر باشد
              </motion.p>
            )}
          </div>

          <button
            type="submit"
            disabled={isProcessing || username.length < 3 || password.length < 6}
            className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            aria-label="ورود به سیستم"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4 ml-2 inline" />
            ورود
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default React.memo(Login);
