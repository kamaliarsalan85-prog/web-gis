import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('gis_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('gis_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyUser = async () => {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          if (res.data?.user) {
            setUser(res.data.user);
            localStorage.setItem('gis_user', JSON.stringify(res.data.user));
          }
        } catch (err) {
          logout();
        }
      }
      setLoading(false);
    };
    verifyUser();
  }, [token]);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    if (res.data?.token) {
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('gis_token', res.data.token);
      localStorage.setItem('gis_user', JSON.stringify(res.data.user));
      return res.data.user;
    }
  };

  const register = async (username, password, role = 'user') => {
    const res = await api.post('/auth/register', { username, password, role });
    if (res.data?.token) {
      setToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('gis_token', res.data.token);
      localStorage.setItem('gis_user', JSON.stringify(res.data.user));
      return res.data.user;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('gis_token');
    localStorage.removeItem('gis_user');
  };

  const hasToolPermission = (toolId) => {
    if (!user) return true; // allow browsing in public mode
    if (user.role === 'admin') return true;
    return user.tools?.includes(toolId);
  };

  const hasLayerPermission = (layerName) => {
    if (!user) return true;
    if (user.role === 'admin') return true;
    return user.layers?.includes(layerName);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      hasToolPermission,
      hasLayerPermission,
      isAdmin: user?.role === 'admin',
      isEditor: user?.role === 'editor' || user?.role === 'admin'
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
