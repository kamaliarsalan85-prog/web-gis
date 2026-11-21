import React, { Suspense, lazy } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import ErrorBoundary from './ErrorBoundary';
import Login from './AuthComponents/Login';
import { shouldUseHashRouter } from './services/api';
import './App.css';

const CoreMap = lazy(() => import('./components/CoreMap'));
const AdminDashboard = lazy(() => import('./AuthComponents/AdminDashboard'));

const PageLoader = () => (
  <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-sm text-slate-300">در حال بارگذاری...</p>
    </div>
  </div>
);

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const Router = shouldUseHashRouter() ? HashRouter : BrowserRouter;

// Protected Route Component for generic users
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Protected Route Component specifically for Admins
const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'admin') {
    return <Navigate to="/map" replace />;
  }
  return children;
};

// Redirect logged in users away from login page
const PublicRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (token) {
    return <Navigate to="/map" replace />;
  }
  return children;
};

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                }
              />
              <Route
                path="/map"
                element={
                  <ProtectedRoute>
                    <CoreMap />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                }
              />
              {/* Fallback routes */}
              <Route path="/" element={<Navigate to="/map" replace />} />
              <Route path="*" element={<Navigate to="/map" replace />} />
            </Routes>
          </Suspense>
        </Router>
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={true}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
