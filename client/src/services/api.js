import axios from 'axios';
import { toast } from 'react-toastify';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Debug: Log the API URL being used
console.log('API Base URL:', process.env.REACT_APP_API_URL || 'http://localhost:5000');

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post('/api/auth/refresh', {
            refreshToken
          });

          const { accessToken } = response.data.data.tokens;
          localStorage.setItem('accessToken', accessToken);
          
          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Handle different error types
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          console.error('Bad Request:', data.message);
          break;
        case 403:
          console.error('Forbidden:', data.message);
          break;
        case 404:
          console.error('Not Found:', data.message);
          break;
        case 429:
          toast.error('Too many requests. Please try again later.');
          break;
        case 500:
          toast.error('Server error. Please try again later.');
          break;
        default:
          console.error('Response Error:', data.message);
      }
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network Error:', error.message);
      toast.error('Network error. Please check your connection.');
    } else {
      // Something else happened
      console.error('Request Error:', error.message);
    }

    return Promise.reject(error);
  }
);

// API methods
export const authAPI = {
  login: (credentials) => api.post('/api/auth/login', credentials),
  register: (userData) => api.post('/api/auth/register', userData),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  verifyEmail: (token, email) => api.post('/api/auth/verify-email', { token, email }),
  setup2FA: () => api.post('/api/auth/setup-2fa'),
  enable2FA: (secret, token) => api.post('/api/auth/enable-2fa', { secret, token }),
  disable2FA: (token) => api.post('/api/auth/disable-2fa', { token }),
  refresh: (refreshToken) => api.post('/api/auth/refresh', { refreshToken }),
};

export const userAPI = {
  getProfile: () => api.get('/api/users/profile'),
  updateProfile: (data) => api.put('/api/users/profile', data),
  changePassword: (data) => api.post('/api/users/change-password', data),
  getActivity: (params) => api.get('/api/users/activity', { params }),
  getDashboard: (params) => api.get('/api/users/dashboard', { params }),
  getStats: () => api.get('/api/users/stats'),
  getRecentActivity: () => api.get('/api/users/recent-activity'),
  getAlerts: () => api.get('/api/users/alerts'),
};

export const apiAPI = {
  getAll: (params) => api.get('/api/apis', { params }),
  getById: (id) => api.get(`/api/apis/${id}`),
  create: (data) => api.post('/api/apis', data),
  update: (id, data) => api.put(`/api/apis/${id}`, data),
  delete: (id) => api.delete(`/api/apis/${id}`),
  getStats: (id, params) => api.get(`/api/apis/${id}/stats`, { params }),
};

export const keyAPI = {
  getAll: (params) => api.get('/api/keys', { params }),
  getById: (id) => api.get(`/api/keys/${id}`),
  create: (data) => api.post('/api/keys', data),
  update: (id, data) => api.put(`/api/keys/${id}`, data),
  delete: (id) => api.delete(`/api/keys/${id}`),
  revoke: (id) => api.post(`/api/keys/${id}/revoke`),
  regenerate: (id) => api.post(`/api/keys/${id}/regenerate`),
  getUsage: (id, params) => api.get(`/api/keys/${id}/usage`, { params }),
};

export const analyticsAPI = {
  getOverview: (params) => api.get('/api/analytics/overview', { params }),
  getApiAnalytics: (apiId, params) => api.get(`/api/analytics/api/${apiId}`, { params }),
  getRealtime: () => api.get('/api/analytics/realtime'),
  getErrors: (params) => api.get('/api/analytics/errors', { params }),
};

export const proxyAPI = {
  getStats: (params) => api.get('/proxy/stats', { params }),
  test: () => api.get('/proxy/test'),
  health: () => api.get('/proxy/health'),
};

// Convenience methods for the Dashboard component
export const getUserStats = () => userAPI.getStats();
export const getRecentActivity = () => userAPI.getRecentActivity();
export const getAlerts = () => userAPI.getAlerts();

// Convenience methods for the APIs component
export const getApis = () => apiAPI.getAll();
export const createApi = (data) => apiAPI.create(data);
export const updateApi = (id, data) => apiAPI.update(id, data);
export const deleteApi = (id) => apiAPI.delete(id);

// Convenience methods for the API Keys component
export const getApiKeys = () => keyAPI.getAll();
export const createApiKey = (data) => keyAPI.create(data);
export const updateApiKey = (id, data) => keyAPI.update(id, data);
export const deleteApiKey = (id) => keyAPI.delete(id);
export const revokeApiKey = (id) => keyAPI.revoke(id);

export default api;
