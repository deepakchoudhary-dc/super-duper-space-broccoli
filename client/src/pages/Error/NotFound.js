import React from 'react';
import { Box, Typography, Button, Card, CardContent, Container } from '@mui/material';
import { ErrorOutline, Home, ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="80vh"
        textAlign="center"
      >
        <Card sx={{ p: 4, maxWidth: 500, width: '100%' }}>
          <CardContent>
            <ErrorOutline
              sx={{
                fontSize: 120,
                color: 'error.main',
                mb: 3
              }}
            />
            
            <Typography variant="h1" component="h1" sx={{ fontSize: '4rem', fontWeight: 'bold', mb: 2 }}>
              404
            </Typography>
            
            <Typography variant="h4" component="h2" gutterBottom>
              Page Not Found
            </Typography>
            
            <Typography variant="body1" color="text.secondary" paragraph>
              Oops! The page you're looking for doesn't exist. It might have been moved, deleted, or you entered the wrong URL.
            </Typography>
            
            <Box display="flex" gap={2} justifyContent="center" mt={4}>
              <Button
                variant="outlined"
                startIcon={<ArrowBack />}
                onClick={() => navigate(-1)}
              >
                Go Back
              </Button>
              <Button
                variant="contained"
                startIcon={<Home />}
                onClick={() => navigate('/dashboard')}
              >
                Go Home
              </Button>
            </Box>
          </CardContent>
        </Card>
        
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          If you think this is an error, please contact our support team.
        </Typography>
      </Box>
    </Container>
  );
};

export default NotFound;
