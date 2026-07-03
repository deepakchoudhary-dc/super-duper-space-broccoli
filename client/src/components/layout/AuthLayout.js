import React from 'react';
import { Box, Container, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

const AuthContainer = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  padding: theme.spacing(2),
}));

const AuthPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  maxWidth: 400,
  width: '100%',
  borderRadius: theme.spacing(2),
  boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
}));

const LogoBox = styled(Box)(({ theme }) => ({
  textAlign: 'center',
  marginBottom: theme.spacing(3),
}));

const AuthLayout = ({ children, title }) => {
  return (
    <AuthContainer>
      <Container maxWidth="sm">
        <AuthPaper elevation={0}>
          <LogoBox>
            <Typography
              variant="h4"
              component="h1"
              fontWeight="bold"
              color="primary"
              gutterBottom
            >
              API Guardian
            </Typography>
            {title && (
              <Typography variant="h6" color="text.secondary">
                {title}
              </Typography>
            )}
          </LogoBox>
          {children}
        </AuthPaper>
      </Container>
    </AuthContainer>
  );
};

export default AuthLayout;
