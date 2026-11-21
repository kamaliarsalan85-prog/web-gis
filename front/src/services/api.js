import axios from 'axios';
import { ensureBrowserDbSeeded, handleLocalApiRequest } from './localBrowserDb.js';

export const isStaticHost = () => {
  if (import.meta.env.VITE_API_BASE) return false;
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  return hostname.endsWith('github.io') || protocol === 'file:';
};

let useLocalDbFallback = isStaticHost();

// Pre-seed the browser database on static hosts
if (typeof window !== 'undefined') {
  ensureBrowserDbSeeded().catch(() => {});
}

const executeLocalAdapter = async (config) => {
  const res = await handleLocalApiRequest(config);
  const isValid =
    typeof config.validateStatus === 'function'
      ? config.validateStatus(res.status)
      : config.validateStatus === null
      ? true
      : res.status >= 200 && res.status < 300;
  if (!isValid) {
    const err = new Error(res.data?.error || `Request failed with status code ${res.status}`);
    err.response = res;
    err.config = config;
    err.isAxiosError = true;
    throw err;
  }
  return res;
};

const isMissingBackendResponse = (response) => {
  if (!response) return false;
  if (response.status === 404 || response.status === 405) {
    // Static file hosts (GitHub Pages, Netlify, Vite static) return HTML or empty body for /api/*
    return typeof response.data === 'string' || !response.data?.status;
  }
  return false;
};

const attachInterceptors = (instance) => {
  instance.interceptors.request.use(
    (config) => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers = config.headers || {};
          if (!config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
      } catch (e) {
        // ignore
      }

      if (useLocalDbFallback && String(config.url || '').includes('/api/')) {
        config.adapter = () => executeLocalAdapter(config);
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    async (response) => {
      if (
        String(response.config?.url || '').includes('/api/') &&
        isMissingBackendResponse(response)
      ) {
        useLocalDbFallback = true;
        return executeLocalAdapter(response.config);
      }
      return response;
    },
    async (error) => {
      const config = error.config;
      if (
        config &&
        !config._retriedLocalDb &&
        String(config.url || '').includes('/api/') &&
        (error.code === 'ERR_NETWORK' || isMissingBackendResponse(error.response))
      ) {
        config._retriedLocalDb = true;
        useLocalDbFallback = true;
        return executeLocalAdapter(config);
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        try {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
        } catch (e) {
          // ignore
        }
      }
      return Promise.reject(error);
    }
  );
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
});

attachInterceptors(api);
attachInterceptors(axios);

export const safeGet = async (url, fallback) => {
  try {
    const res = await api.get(url);
    return res;
  } catch (err) {
    console.warn(`safeGet failed for ${url}, using fallback:`, err);
    return { data: fallback };
  }
};

export default api;
