import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Typography, CircularProgress } from '@mui/material';

/**
 * OIDC callback landing page.
 *
 * The gateway redirects here with access/refresh tokens in the URL fragment
 * (#access_token=...&refresh_token=...). We persist them and do a full reload
 * so AuthProvider re-initializes and fetches the user profile.
 */
const OIDCCallback = () => {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      navigate('/login', { state: { error: 'Single sign-on failed. Please try again.' } });
      return;
    }

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    // Full reload: AuthProvider's initialization effect runs on mount and
    // resolves the stored tokens against /api/auth/me
    window.location.replace('/dashboard');
  }, [navigate]);

  return (
    <Container maxWidth="sm" sx={{ mt: 10 }}>
      <Paper sx={{ p: 5, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Completing sign-in...
        </Typography>
      </Paper>
    </Container>
  );
};

export default OIDCCallback;
