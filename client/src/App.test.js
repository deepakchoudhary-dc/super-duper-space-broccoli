import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import App from './App';
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { LoadingProvider } from './contexts/LoadingContext';

// Mock the auth context's API calls so the app boots without a backend
jest.mock('./services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockRejectedValue(new Error('no backend in tests')),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } }
  }
}));

test('renders the application shell and redirects to login', async () => {
  render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoadingProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LoadingProvider>
      </ThemeProvider>
    </BrowserRouter>
  );

  // Public route: unauthenticated users land on the login screen
  expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  // The sign-in form is present
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});
