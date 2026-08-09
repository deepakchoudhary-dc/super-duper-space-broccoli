import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

import { useAuth } from './contexts/AuthContext';
import { useLoading } from './contexts/LoadingContext';

// Layout components
import Layout from './components/layout/Layout';
import AuthLayout from './components/layout/AuthLayout';

// Auth pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyEmail from './pages/auth/VerifyEmail';
import TwoFactorAuth from './pages/auth/TwoFactorAuth';

// Dashboard pages
import Dashboard from './pages/dashboard/Dashboard';
import Profile from './pages/Profile/Profile';
import Security from './pages/Profile/Security';

// API Management pages
import APIs from './pages/apis/APIs';
import APIDetails from './pages/apis/APIDetails';
import CreateAPI from './pages/apis/CreateAPI';
import EditAPI from './pages/apis/EditAPI';

// API Keys pages
import APIKeys from './pages/APIKeys/APIKeys';
import APIKeyDetails from './pages/APIKeys/APIKeyDetails';
import CreateAPIKey from './pages/APIKeys/CreateAPIKey';
import EditAPIKey from './pages/APIKeys/EditAPIKey';

// Analytics pages
import Analytics from './pages/Analytics/Analytics';
import APIAnalytics from './pages/Analytics/APIAnalytics';
import RealTimeAnalytics from './pages/Analytics/RealTimeAnalytics';
import ErrorAnalytics from './pages/Analytics/ErrorAnalytics';

// Documentation pages
import Documentation from './pages/Documentation/Documentation';
import APIDocumentation from './pages/Documentation/APIDocumentation';

// Settings pages
import Settings from './pages/Settings/Settings';

// Error pages
import NotFound from './pages/Error/NotFound';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="background.default"
      >
        <CircularProgress size={40} />
      </Box>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Public Route component (redirects to dashboard if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="background.default"
      >
        <CircularProgress size={40} />
      </Box>
    );
  }

  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

// Loading overlay component
const LoadingOverlay = () => {
  const { isLoading, loadingMessage } = useLoading();

  if (!isLoading) return null;

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      width="100%"
      height="100%"
      bgcolor="rgba(255, 255, 255, 0.8)"
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      zIndex={9999}
    >
      <CircularProgress size={40} sx={{ mb: 2 }} />
      <Box color="text.secondary" fontSize="0.875rem">
        {loadingMessage}
      </Box>
    </Box>
  );
};

function App() {
  return (
    <Box>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={
          <PublicRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </PublicRoute>
        } />
        
        <Route path="/register" element={
          <PublicRoute>
            <AuthLayout>
              <Register />
            </AuthLayout>
          </PublicRoute>
        } />
        
        <Route path="/forgot-password" element={
          <PublicRoute>
            <AuthLayout>
              <ForgotPassword />
            </AuthLayout>
          </PublicRoute>
        } />
        
        <Route path="/reset-password" element={
          <PublicRoute>
            <AuthLayout>
              <ResetPassword />
            </AuthLayout>
          </PublicRoute>
        } />
        
        <Route path="/verify-email" element={
          <PublicRoute>
            <AuthLayout>
              <VerifyEmail />
            </AuthLayout>
          </PublicRoute>
        } />
        
        <Route path="/two-factor" element={
          <PublicRoute>
            <AuthLayout>
              <TwoFactorAuth />
            </AuthLayout>
          </PublicRoute>
        } />

        {/* Protected routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Profile routes */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/profile/security" element={
          <ProtectedRoute>
            <Layout>
              <Security />
            </Layout>
          </ProtectedRoute>
        } />

        {/* API Management routes */}
        <Route path="/apis" element={
          <ProtectedRoute>
            <Layout>
              <APIs />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/apis/create" element={
          <ProtectedRoute>
            <Layout>
              <CreateAPI />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/apis/:id" element={
          <ProtectedRoute>
            <Layout>
              <APIDetails />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/apis/:id/edit" element={
          <ProtectedRoute>
            <Layout>
              <EditAPI />
            </Layout>
          </ProtectedRoute>
        } />

        {/* API Keys routes */}
        <Route path="/keys" element={
          <ProtectedRoute>
            <Layout>
              <APIKeys />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/keys/create" element={
          <ProtectedRoute>
            <Layout>
              <CreateAPIKey />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/keys/:id" element={
          <ProtectedRoute>
            <Layout>
              <APIKeyDetails />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/keys/:id/edit" element={
          <ProtectedRoute>
            <Layout>
              <EditAPIKey />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Analytics routes */}
        <Route path="/analytics" element={
          <ProtectedRoute>
            <Layout>
              <Analytics />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/analytics/api/:id" element={
          <ProtectedRoute>
            <Layout>
              <APIAnalytics />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/analytics/realtime" element={
          <ProtectedRoute>
            <Layout>
              <RealTimeAnalytics />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/analytics/errors" element={
          <ProtectedRoute>
            <Layout>
              <ErrorAnalytics />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Documentation routes */}
        <Route path="/documentation" element={
          <ProtectedRoute>
            <Layout>
              <Documentation />
            </Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/documentation/api/:id" element={
          <ProtectedRoute>
            <Layout>
              <APIDocumentation />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Settings routes */}
        <Route path="/settings" element={
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* 404 page */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Global loading overlay */}
      <LoadingOverlay />
    </Box>
  );
}

export default App;
