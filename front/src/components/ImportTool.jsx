import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

// ✅ API bases from ENV (fallback to same-origin)
const API = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' ? '' : '');
const MAHALLE_API = API;


const ImportTool = ({ onRefresh }) => {
  const [layerName, setLayerName] = useState('New Layer');
  const [option, setOption] = useState('add_new');
  const [storage, setStorage] = useState('local');
  const [layerType, setLayerType] = useState(''); // نوع لایه هنگام ذخیره در دیتابیس
  const [targetLayer, setTargetLayer] = useState('');
  const [layers, setLayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();

  // بررسی توکن هنگام باز شدن پنل
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token && visible) {
      toast.warn('لطفاً ابتدا وارد سیستم شوید');
      setVisible(false);
      navigate('/login');
    }
  }, [visible, navigate]);

  useEffect(() => {
    const fetchLayers = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No token available');
        }
        const response = await axios.get(`${API}/api/layers`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { storage: storage || 'local' } // اطمینان از وجود storage
        });
        setLayers(response.data.layers || []);
      } catch (error) {
        console.error('Fetch layers error:', error);
        const errorMsg = error.response?.data?.error || error.message || 'خطای ناشناخته';
        toast.error('خطا در دریافت لیست لایه‌ها: ' + errorMsg);
        if (errorMsg.includes('token')) {
          setVisible(false);
          navigate('/login');
        }
      }
    };
    if (visible && (option === 'replace' || option === 'delete_and_replace')) {
      fetchLayers();
    }
  }, [visible, option, storage, navigate]);

 const handleUpload = async () => {
  const file = fileRef.current?.files?.[0];
  if (!file) {
    toast.warn('فایلی انتخاب نشده');
    return;
  }
  if ((option === 'replace' || option === 'delete_and_replace') && !targetLayer) {
    toast.warn('لایه مقصد را انتخاب کنید');
    return;
  }
  // اگر انتخاب شده که ذخیره در دیتابیس باشه، باید نوع لایه انتخاب شده باشه
  if (storage === 'db' && !layerType) {
    toast.warn('نوع لایه را انتخاب کنید');
    return;
  }

  setLoading(true);

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.warn('لطفاً ابتدا وارد سیستم شوید');
      setVisible(false);
      navigate('/login');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('option', option);
    formData.append('storage', storage);
    formData.append('name', layerName);
    if (layerType) {
      formData.append('layerType', layerType);
    }
    if (option === 'replace' || option === 'delete_and_replace') {
      formData.append('targetLayer', targetLayer);
    }

    let uploadUrl = '';
    let headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    };

    // همه آپلودها از بک‌اند محلی عبور می‌کنند تا fallback و auth یکدست بماند.
    uploadUrl = `${API}/api/upload`;

    const response = await axios.post(uploadUrl, formData, { headers });

    toast.success(response.data.message || 'فایل با موفقیت آپلود شد');
    fileRef.current.value = '';
    onRefresh && onRefresh();
    setVisible(false);
  } catch (error) {
    console.error('Upload error:', error);
    const serverMsg = error.response?.data?.error || error.message || 'خطای ناشناخته';
    toast.error('خطا در آپلود: ' + serverMsg);
    if (error.response?.status === 401 || serverMsg.includes('token')) {
      setVisible(false);
      navigate('/login');
    }
  } finally {
    setLoading(false);
  }
};

  return (
    <div className='top-1 md:top-1' style={{ position: 'absolute', zIndex: 1000 }}>
      {/* دکمه شناور */}
      <button
        onClick={() => setVisible((prev) => !prev)}
        className='md:ml-40 md:mt-1 bg-gradient-to-r from-cyan-600 to-teal-600'
        style={{
          padding: '10px 18px',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          cursor: 'pointer',
          transition: '0.3s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4338CA')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4F46E5')}
      >
        {visible ? '✖ بستن پنل' : '📂 ایمپورت لایه'}
      </button>

      {/* پنل شناور */}
      <div
        className='rounded-tl-none rounded-bl-none rounded-2xl bg-gray-800 text-white'
        style={{
          marginTop: 3,
          width: 240,
          height: storage === 'db' ? 380 : 320,
          padding: 15,
          boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
          display: visible ? 'block' : 'none',
        }}
      >
        <input
          type="text"
          value={layerName}
          onChange={(e) => setLayerName(e.target.value)}
          placeholder="نام لایه"
          className=''
          style={{
            marginBottom: 10,
            padding: 8,
            width: '100%',
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
        />
        <select
          value={storage}
          onChange={(e) => {
            setStorage(e.target.value);
            // اگر کاربر به محلی تغییر داد، نوع لایه را پاک کن چون لازم نیست
            if (e.target.value !== 'db') setLayerType('');
          }}
            className='bg-cyan-600'
          style={{
            marginBottom: 10,
            padding: 8,
            width: '100%',
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
        >
          <option value="db">ذخیره در دیتابیس</option>
          <option value="local">ذخیره در محلی</option>
        </select>

        {/* اگر ذخیره در دیتابیس انتخاب شده، انتخاب نوع لایه نمایش داده شود */}
        {storage === 'db' && (
          <select
            value={layerType}
            onChange={(e) => setLayerType(e.target.value)}
              className='bg-cyan-600'
            style={{
              marginBottom: 10,
              padding: 8,
              width: '100%',
              borderRadius: 6,
              border: '1px solid #ccc',
            }}
          >
            <option value="">نوع لایه را انتخاب کنید</option>
            <option value="mahalle">محلات</option>
            <option value="mabar">معابر</option>
            <option value="parts">قطعات</option>
          </select>
        )}

        <select
          value={option}
          onChange={(e) => setOption(e.target.value)}
          className='bg-cyan-600'
          style={{
            marginBottom: 10,
            padding: 8,
            width: '100%',
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
        >
          <option value="add_new">افزودن لایه جدید</option>
          <option value="replace">جایگزینی با حفظ داده‌های قبلی</option>
          <option value="delete_and_replace">حذف و جایگزینی کامل</option>
        </select>
        {(option === 'replace' || option === 'delete_and_replace') && (
          <select
            value={targetLayer}
            onChange={(e) => setTargetLayer(e.target.value)}
            className='bg-cyan-600'
            style={{
              marginBottom: 10,
              padding: 8,
              width: '100%',
              borderRadius: 6,
              border: '1px solid #ccc',
            }}
          >
            <option value="">لایه مقصد را انتخاب کنید</option>
            {layers.map((layer) => (
              <option key={layer.name} value={layer.name}>
                {layer.name} ({layer.count} فیچر)
              </option>
            ))}
          </select>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".geojson,.json"
          className='border p-2 '
          style={{ marginBottom: 10, width: '100%' , borderRadius: "6px"}}
        />
        <button
          onClick={handleUpload}
          disabled={loading}
          style={{
            width: '100%',
            padding: 10,
            backgroundColor: '#10B981',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            transition: '0.3s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#10B981')}
        >
          {loading ? 'در حال آپلود...' : 'آپلود فایل'}
        </button>
      </div>
    </div>
  );
};

export default ImportTool;
