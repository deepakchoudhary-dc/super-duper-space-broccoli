import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Button
} from '@mui/material';
import { CheckCircle, Error } from '@mui/icons-material';
import { Link as RouterLink, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token || !email) {
        setStatus('error');
        setMessage('Invalid verification link. Please check your email for the correct link.');
        setLoading(false);
        return;
      }

      try {
        await api.post('/api/auth/verify-email', { token, email });
        setStatus('success');
        setMessage('Your email has been successfully verified! You can now login to your account.');
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Email verification failed. The link may be expired or invalid.');
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [token, email]);

  const handleResendVerification = async () => {
    if (!email) return;
    
    setLoading(true);
    try {
      await api.post('/api/auth/resend-verification', { email });
      setMessage('A new verification email has been sent to your email address.');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />;
      case 'error':
        return <Error sx={{ fontSize: 60, color: 'error.main', mb: 2 }} />;
      default:
        return <CircularProgress size={60} sx={{ mb: 2 }} />;
    }
  };

  const getTitle = () => {
    switch (status) {
      case 'success':
        return 'Email Verified!';
      case 'error':
        return 'Verification Failed';
      default:
        return 'Verifying Email...';
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            textAlign: 'center'
          }}
        >
          {getIcon()}
          
          <Typography component="h1" variant="h4" sx={{ mb: 2 }}>
            {getTitle()}
          </Typography>

          <Alert 
            severity={status === 'success' ? 'success' : status === 'error' ? 'error' : 'info'} 
            sx={{ width: '100%', mb: 3 }}
          >
            {message}
          </Alert>

          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
            {status === 'success' && (
              <Button
                component={RouterLink}
                to="/login"
                variant="contained"
                size="large"
              >
                Login to Your Account
              </Button>
            )}

            {status === 'error' && (
              <>
                <Button
                  onClick={handleResendVerification}
                  variant="contained"
                  size="large"
                  disabled={loading || !email}
                >
                  {loading ? <CircularProgress size={24} /> : 'Resend Verification Email'}
                </Button>
                
                <Button
                  component={RouterLink}
                  to="/register"
                  variant="outlined"
                  size="large"
                >
                  Create New Account
                </Button>
              </>
            )}

            <Button
              component={RouterLink}
              to="/login"
              variant="text"
              size="large"
            >
              Back to Login
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyEmail;
