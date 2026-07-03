import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

const AuthContext = createContext();

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  tokens: {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken')
  }
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'LOGIN_SUCCESS':
      localStorage.setItem('accessToken', action.payload.tokens.accessToken);
      localStorage.setItem('refreshToken', action.payload.tokens.refreshToken);
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        tokens: action.payload.tokens
      };
    
    case 'LOGOUT':
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        tokens: { accessToken: null, refreshToken: null }
      };
    
    case 'UPDATE_USER':
      return {
        ...state,
        user: { ...state.user, ...action.payload }
      };
    
    case 'SET_TOKENS':
      if (action.payload.accessToken) {
        localStorage.setItem('accessToken', action.payload.accessToken);
      }
      if (action.payload.refreshToken) {
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      }
      return {
        ...state,
        tokens: { ...state.tokens, ...action.payload }
      };
    
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const response = await api.get('/api/auth/me');
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: response.data.data.user,
              tokens: {
                accessToken: token,
                refreshToken: localStorage.getItem('refreshToken')
              }
            }
          });
        } catch (error) {
          console.error('Auth initialization failed:', error);
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeAuth();
  }, []);

  const login = async (credentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await api.post('/api/auth/login', credentials);
      
      if (response.data.requiresTwoFactor) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return { requiresTwoFactor: true };
      }
      
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: response.data.data
      });
      
      toast.success('Login successful!');
      return { success: true };
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message);
      throw error;
    }
  };

  const loginWith2FA = async (credentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await api.post('/api/auth/login', credentials);
      
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: response.data.data
      });
      
      toast.success('Login successful!');
      return { success: true };
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const message = error.response?.data?.message || 'Two-factor authentication failed';
      toast.error(message);
      throw error;
    }
  };

  const register = async (userData) => {
    try {
      const response = await api.post('/api/auth/register', userData);
      toast.success('Registration successful! Please check your email for verification.');
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      toast.error(message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: 'LOGOUT' });
      toast.success('Logged out successfully');
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await api.put('/api/users/profile', profileData);
      dispatch({
        type: 'UPDATE_USER',
        payload: response.data.data.user
      });
      toast.success('Profile updated successfully');
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Profile update failed';
      toast.error(message);
      throw error;
    }
  };

  const changePassword = async (passwordData) => {
    try {
      await api.post('/api/users/change-password', passwordData);
      toast.success('Password changed successfully');
    } catch (error) {
      const message = error.response?.data?.message || 'Password change failed';
      toast.error(message);
      throw error;
    }
  };

  const setup2FA = async () => {
    try {
      const response = await api.post('/api/auth/setup-2fa');
      return response.data.data;
    } catch (error) {
      const message = error.response?.data?.message || '2FA setup failed';
      toast.error(message);
      throw error;
    }
  };

  const enable2FA = async (secret, token) => {
    try {
      await api.post('/api/auth/enable-2fa', { secret, token });
      dispatch({
        type: 'UPDATE_USER',
        payload: { twoFactorEnabled: true }
      });
      toast.success('Two-factor authentication enabled');
    } catch (error) {
      const message = error.response?.data?.message || '2FA enable failed';
      toast.error(message);
      throw error;
    }
  };

  const disable2FA = async (token) => {
    try {
      await api.post('/api/auth/disable-2fa', { token });
      dispatch({
        type: 'UPDATE_USER',
        payload: { twoFactorEnabled: false }
      });
      toast.success('Two-factor authentication disabled');
    } catch (error) {
      const message = error.response?.data?.message || '2FA disable failed';
      toast.error(message);
      throw error;
    }
  };

  const verifyEmail = async (token, email) => {
    try {
      await api.post('/api/auth/verify-email', { token, email });
      dispatch({
        type: 'UPDATE_USER',
        payload: { emailVerified: true }
      });
      toast.success('Email verified successfully');
    } catch (error) {
      const message = error.response?.data?.message || 'Email verification failed';
      toast.error(message);
      throw error;
    }
  };

  const refreshToken = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await api.post('/api/auth/refresh', { refreshToken });
      dispatch({
        type: 'SET_TOKENS',
        payload: response.data.data.tokens
      });
      
      return response.data.data.tokens.accessToken;
    } catch (error) {
      dispatch({ type: 'LOGOUT' });
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      loginWith2FA,
      register,
      logout,
      updateProfile,
      changePassword,
      setup2FA,
      enable2FA,
      disable2FA,
      verifyEmail,
      refreshToken
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
