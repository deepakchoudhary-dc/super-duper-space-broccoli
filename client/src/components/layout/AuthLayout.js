import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

const AuthContainer = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(circle at center, #1e1548 0%, #080c14 100%)',
  padding: theme.spacing(3),
}));

const AuthPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(5), // Generous, professional spacing
  maxWidth: 540, // Wider container for clean multi-column elements (e.g. register fields)
  width: '100%',
  borderRadius: 16,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  backgroundColor: '#111827', // Dark slate-grey
  boxShadow: '0 15px 35px rgba(0, 0, 0, 0.4), 0 0 30px rgba(139, 92, 246, 0.1)', // Indigo outer glow
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
  '&:hover': {
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.15)',
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(3),
  },
}));

const AuthLayout = ({ children, title }) => {
  return (
    <AuthContainer>
      <AuthPaper elevation={0}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            variant="h3"
            component="h1"
            fontWeight="800"
            sx={{
              mb: 1,
              background: 'linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: '"Outfit", sans-serif',
              letterSpacing: '-0.03em',
              textShadow: '0 4px 20px rgba(139, 92, 246, 0.15)'
            }}
          >
            API Guardian
          </Typography>
          {title && (
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
              {title}
            </Typography>
          )}
        </Box>
        {children}
      </AuthPaper>
    </AuthContainer>
  );
};

export default AuthLayout;
