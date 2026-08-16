import React from 'react';
import {
  Box,
  Typography,
  Button,
  Container
} from '@mui/material';
import {
  Error,
  Refresh,
  Home
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const ErrorBoundary = ({ error, resetError, children }) => {
  const navigate = useNavigate();

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: 4,
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 1
          }}
        >
          <Error
            sx={{
              fontSize: 80,
              color: 'error.main',
              mb: 2
            }}
          />
          <Typography variant="h4" gutterBottom>
            Oops! Something went wrong
          </Typography>
          <Typography variant="body1" color="textSecondary" sx={{ mb: 3, maxWidth: 600 }}>
            We're sorry, but something unexpected happened. The error has been logged and our team has been notified.
          </Typography>
          
          {process.env.NODE_ENV === 'development' && (
            <Box
              sx={{
                bgcolor: 'grey.100',
                p: 2,
                borderRadius: 1,
                mb: 3,
                maxWidth: '100%',
                overflow: 'auto'
              }}
            >
              <Typography variant="body2" component="pre" sx={{ fontSize: '0.8rem' }}>
                {error.toString()}
              </Typography>
            </Box>
          )}
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={resetError}
            >
              Try Again
            </Button>
            <Button
              variant="outlined"
              startIcon={<Home />}
              onClick={() => navigate('/')}
            >
              Go Home
            </Button>
          </Box>
        </Box>
      </Container>
    );
  }

  return children;
};

export default ErrorBoundary;
