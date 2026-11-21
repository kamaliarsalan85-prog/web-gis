// src/DebugPanel.jsx
import React, { useState } from 'react';
import axios from 'axios';

function safeDecodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch (e) {
    return null;
  }
}

export default function DebugPanel() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [payload, setPayload] = useState(token ? safeDecodeToken(token) : null);
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [tools, setTools] = useState(localStorage.getItem('tools') || '[]');
  const [layers, setLayers] = useState(localStorage.getItem('layers') || '[]');
  const [apiResult, setApiResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshFromStorage = () => {
    const t = localStorage.getItem('token') || '';
    setToken(t);
    setPayload(t ? safeDecodeToken(t) : null);
    setRole(localStorage.getItem('role') || '');
    setTools(localStorage.getItem('tools') || '[]');
    setLayers(localStorage.getItem('layers') || '[]');
    setApiResult(null);
  };

  const doTestLayers = async () => {
    setLoading(true);
    setApiResult(null);
    try {
      const [dbRes, localRes] = await Promise.all([
        axios.get('/api/layers', { params: { storage: 'db' } }),
        axios.get('/api/layers', { params: { storage: 'local' } }),
      ]);
      setApiResult({
        ok: true,
        status: 200,
        body: {
          db: dbRes.data,
          local: localRes.data,
        },
      });
    } catch (err) {
      setApiResult({
        ok: false,
        status: err.response?.status || 'network',
        body: err.response?.data || err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const saveTokenToStorage = () => {
    try {
      if (token) localStorage.setItem('token', token);
      else localStorage.removeItem('token');
      setPayload(token ? safeDecodeToken(token) : null);
      // also set axios default header (helps in older calls)
      axios.defaults.headers.common['Authorization'] = token ? `Bearer ${token}` : undefined;
      alert('تغییرات ذخیره شد. حالا تست لایه‌ها را بزن.');
    } catch (e) {
      alert('خطا در ذخیره توکن: ' + e.message);
    }
  };

  const clearAll = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('tools');
    localStorage.removeItem('layers');
    refreshFromStorage();
    alert('localStorage پاک شد.');
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      width: 420,
      maxHeight: '70vh',
      overflowY: 'auto',
      zIndex: 9999,
      background: 'white',
      border: '1px solid #ddd',
      borderRadius: 8,
      padding: 12,
      boxShadow: '0 6px 20px rgba(0,0,0,0.12)'
    }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>⚙️ Debug Panel</h3>

      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <div><strong>Token (localStorage):</strong></div>
        <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} style={{ width: '100%' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={saveTokenToStorage} style={{ flex: 1 }}>ذخیره توکن</button>
          <button onClick={refreshFromStorage} style={{ flex: 1 }}>بارگذاری از storage</button>
        </div>
      </div>

      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <div><strong>Payload:</strong></div>
        <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', background: '#f7f7f7', padding: 8 }}>
          {payload ? JSON.stringify(payload, null, 2) : 'توکنی موجود نیست یا قابل‌شکستن نیست'}
        </pre>
      </div>

      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <div><strong>Role:</strong> {role || '—'}</div>
        <div><strong>Tools:</strong> {tools}</div>
        <div><strong>Layers:</strong> {layers}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={doTestLayers} disabled={loading} style={{ flex: 1 }}>
          {loading ? 'در حال درخواست...' : 'تست /api/layers (db+local)'}
        </button>
        <button onClick={clearAll} style={{ flex: 1, background: '#fee' }}>پاک کردن storage</button>
      </div>

      <div style={{ fontSize: 13 }}>
        <div><strong>نتیجه درخواست:</strong></div>
        <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', background: '#f7f7f7', padding: 8 }}>
          {apiResult ? JSON.stringify(apiResult, null, 2) : 'هیچ درخواستی اجرا نشده'}
        </pre>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
        نکته: اگر پاسخ 401 آمد، مقدار بالا (payload) کمک می‌کند ببینی token وجود دارد/منقضی/یا نامعتبر است.
      </div>
    </div>
  );
}
