import React, { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  Typography,
  Box,
  Link,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Lock,
  ArrowBack,
  Check,
  RadioButtonUnchecked
} from '@mui/icons-material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);
  
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    if (!token || !email) {
      setTokenValid(false);
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [token, email]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/api/auth/reset-password', {
        token,
        email,
        password: formData.password
      });
      
      navigate('/login', {
        state: { message: 'Password reset successfully. You can now login with your new password.' }
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const passwordRequirements = [
    { text: 'At least 8 characters', met: formData.password.length >= 8 },
    { text: 'Contains uppercase letter', met: /[A-Z]/.test(formData.password) },
    { text: 'Contains lowercase letter', met: /[a-z]/.test(formData.password) },
    { text: 'Contains number', met: /\d/.test(formData.password) },
    { text: 'Contains special character', met: /[!@#$%^&*]/.test(formData.password) }
  ];

  if (!tokenValid) {
    return (
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', padding: 4, alignItems: 'center' }}>
            <Typography component="h1" variant="h4" sx={{ mb: 2 }}>
              Invalid Reset Link
            </Typography>
            
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              This password reset link is invalid or has expired.
            </Alert>

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
              <ArrowBack sx={{ mr: 1, fontSize: 16 }} />
              <Link component={RouterLink} to="/forgot-password" variant="body2">
                Request a new reset link
              </Link>
            </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', padding: 4, alignItems: 'center' }}>
          <Typography component="h1" variant="h4" sx={{ mb: 2 }}>
            Reset Password
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            Enter your new password below.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm New Password"
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {formData.password && (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Password Requirements:
                </Typography>
                {passwordRequirements.map((req, index) => (
                  <Typography
                    key={index}
                    variant="body2"
                    sx={{
                      color: req.met ? 'success.main' : 'text.secondary',
                      fontSize: '0.8rem'
                    }}
                  >
                    {req.met ? <Check sx={{ fontSize: '0.8rem', verticalAlign: 'middle' }} /> : <RadioButtonUnchecked sx={{ fontSize: '0.8rem', verticalAlign: 'middle' }} />}{' '}
                    {req.text}
                  </Typography>
                ))}
              </Box>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading || !formData.password || !formData.confirmPassword}
            >
              {loading ? <CircularProgress size={24} /> : 'Reset Password'}
            </Button>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
            <ArrowBack sx={{ mr: 1, fontSize: 16 }} />
            <Link component={RouterLink} to="/login" variant="body2">
              Back to Login
            </Link>
          </Box>
    </Box>
  );
};

export default ResetPassword;
