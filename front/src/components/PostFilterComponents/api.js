// api.js
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "",
  withCredentials: false, // اگر از کوکی/credential استفاده می‌کنی، true کن
});

// این اینترسپتور هدر Authorization را از localStorage اضافه می‌کند
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);
