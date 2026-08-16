import React, { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Grid
} from '@mui/material';
import { Security, ArrowBack } from '@mui/icons-material';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const TwoFactorAuth = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get credentials from navigation state
  const credentials = location.state?.credentials;
  const email = credentials?.email;

  useEffect(() => {
    if (!credentials) {
      navigate('/login');
      return;
    }
  }, [credentials, navigate]);

  useEffect(() => {
    let interval;
    if (resendCooldown > 0) {
      interval = setInterval(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/api/auth/verify-2fa', {
        email: credentials.email,
        password: credentials.password,
        twoFactorCode: code
      });

      // Use the login function from context to set user state
      await login(credentials, code);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    setError('');

    try {
      await api.post('/api/auth/resend-2fa', {
        email: credentials.email
      });
      setResendCooldown(60); // 60 second cooldown
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setResendLoading(false);
    }
  };

  if (!credentials) {
    return null; // Will redirect to login
  }

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', padding: 4, alignItems: 'center' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 60,
              height: 60,
              borderRadius: '50%',
              backgroundColor: 'primary.main',
              mb: 2
            }}
          >
            <Security sx={{ color: 'white', fontSize: 30 }} />
          </Box>

          <Typography component="h1" variant="h4" sx={{ mb: 1 }}>
            Two-Factor Authentication
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            Enter the 6-digit verification code from your authenticator app
          </Typography>

          {email && (
            <Typography variant="body2" sx={{ mb: 2, color: 'primary.main' }}>
              Signing in as: {email}
            </Typography>
          )}

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
              id="code"
              label="Verification Code"
              name="code"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={handleChange}
              inputProps={{
                maxLength: 6,
                pattern: '[0-9]{6}',
                style: { 
                  textAlign: 'center', 
                  fontSize: '1.5rem',
                  letterSpacing: '0.5rem'
                }
              }}
              placeholder="000000"
              helperText="Enter the 6-digit code from your authenticator app"
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading || code.length !== 6}
            >
              {loading ? <CircularProgress size={24} /> : 'Verify & Sign In'}
            </Button>

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleResendCode}
                  disabled={resendLoading || resendCooldown > 0}
                >
                  {resendLoading ? (
                    <CircularProgress size={20} />
                  ) : resendCooldown > 0 ? (
                    `Resend Code (${resendCooldown}s)`
                  ) : (
                    'Resend Code'
                  )}
                </Button>
              </Grid>
            </Grid>
          </Box>

          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center' }}>
            <ArrowBack sx={{ mr: 1, fontSize: 16 }} />
            <Button
              component={RouterLink}
              to="/login"
              variant="text"
              size="small"
            >
              Back to Login
            </Button>
          </Box>
    </Box>
  );
};

export default TwoFactorAuth;
