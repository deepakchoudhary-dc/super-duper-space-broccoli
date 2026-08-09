import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Grid,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Security,
  VpnKey,
  Smartphone,
  Delete,
  Add,
  Visibility,
  VisibilityOff,
  Warning,
  CheckCircle,
  LocationOn,
  Computer,
  Phone
} from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const SecuritySettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // Password change states
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  // 2FA states
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFADialog, setTwoFADialog] = useState(false);
  const [twoFADisableDialog, setTwoFADisableDialog] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [disableVerificationCode, setDisableVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);

  // Security settings
  const [securitySettings, setSecuritySettings] = useState({
    loginNotifications: true,
    sessionTimeout: 30,
    ipWhitelist: false,
    deviceTracking: true
  });

  // Active sessions
  const [activeSessions, setActiveSessions] = useState([]);

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async () => {
    try {
      const [settingsResponse, meResponse] = await Promise.all([
        api.get('/api/settings').catch(() => ({ data: { data: {} } })),
        api.get('/api/auth/me').catch(() => ({ data: { data: {} } }))
      ]);

      if (settingsResponse.data?.data?.settings?.security) {
        setSecuritySettings(prev => ({ ...prev, ...settingsResponse.data.data.settings.security }));
      }
      if (meResponse.data?.data?.user) {
        setTwoFAEnabled(meResponse.data.data.user.twoFactorEnabled || false);
      }
    } catch (error) {
      console.error('Failed to fetch security data:', error);
      // Mock data for development
      setActiveSessions([
        {
          id: '1',
          device: 'Chrome on Windows',
          location: 'New York, USA',
          ip: '192.168.1.100',
          lastActivity: new Date(),
          current: true
        },
        {
          id: '2',
          device: 'Safari on iPhone',
          location: 'New York, USA',
          ip: '192.168.1.101',
          lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000),
          current: false
        }
      ]);
    }
  };

  const handlePasswordChange = (e) => {
    setPasswordForm({
      ...passwordForm,
      [e.target.name]: e.target.value
    });
    setError('');
    setMessage('');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/users/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      
      setMessage('Password changed successfully');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    try {
      const response = await api.post('/api/auth/setup-2fa');
      setQrCode(response.data.data.qrCode);
      setTwoFASecret(response.data.data.secret);
      setBackupCodes(response.data.data.backupCodes || []);
      setTwoFADialog(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to setup 2FA');
    }
  };

  const handleVerify2FA = async () => {
    if (verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/enable-2fa', {
        secret: twoFASecret,
        token: verificationCode
      });
      
      setTwoFAEnabled(true);
      setTwoFADialog(false);
      setVerificationCode('');
      setMessage('Two-factor authentication enabled successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (disableVerificationCode.length !== 6) {
      setError('Please enter a 6-digit verification code to disable 2FA');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/disable-2fa', {
        token: disableVerificationCode
      });
      setTwoFAEnabled(false);
      setTwoFADisableDialog(false);
      setDisableVerificationCode('');
      setMessage('Two-factor authentication disabled');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = async (setting, value) => {
    try {
      const updatedSettings = {
        ...securitySettings,
        [setting]: value
      };
      
      await api.put('/api/settings', {
        security: updatedSettings
      });
      
      setSecuritySettings(updatedSettings);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update setting');
    }
  };

  const handleTerminateSession = async (sessionId) => {
    try {
      await api.delete(`/api/user/sessions/${sessionId}`);
      setActiveSessions(sessions => sessions.filter(s => s.id !== sessionId));
      setMessage('Session terminated successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to terminate session');
    }
  };

  const getDeviceIcon = (device) => {
    if (device.toLowerCase().includes('iphone') || device.toLowerCase().includes('android')) {
      return <Phone />;
    }
    return <Computer />;
  };

  const passwordRequirements = [
    { text: 'At least 8 characters', met: passwordForm.newPassword.length >= 8 },
    { text: 'Contains uppercase letter', met: /[A-Z]/.test(passwordForm.newPassword) },
    { text: 'Contains lowercase letter', met: /[a-z]/.test(passwordForm.newPassword) },
    { text: 'Contains number', met: /\d/.test(passwordForm.newPassword) },
    { text: 'Contains special character', met: /[!@#$%^&*]/.test(passwordForm.newPassword) }
  ];

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Security Settings
      </Typography>

      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Password Change */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <VpnKey sx={{ mr: 2, color: 'primary.main' }} />
                <Typography variant="h6">
                  Change Password
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Box component="form" onSubmit={handleChangePassword}>
                <TextField
                  fullWidth
                  margin="normal"
                  label="Current Password"
                  name="currentPassword"
                  type={showPasswords.current ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordChange}
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPasswords({
                          ...showPasswords,
                          current: !showPasswords.current
                        })}
                      >
                        {showPasswords.current ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    )
                  }}
                />
                
                <TextField
                  fullWidth
                  margin="normal"
                  label="New Password"
                  name="newPassword"
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPasswords({
                          ...showPasswords,
                          new: !showPasswords.new
                        })}
                      >
                        {showPasswords.new ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    )
                  }}
                />
                
                <TextField
                  fullWidth
                  margin="normal"
                  label="Confirm New Password"
                  name="confirmPassword"
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPasswords({
                          ...showPasswords,
                          confirm: !showPasswords.confirm
                        })}
                      >
                        {showPasswords.confirm ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    )
                  }}
                />

                {passwordForm.newPassword && (
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
                        {req.met ? '✓' : '○'} {req.text}
                      </Typography>
                    ))}
                  </Box>
                )}
                
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  sx={{ mt: 2 }}
                >
                  {loading ? <CircularProgress size={20} /> : 'Change Password'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Two-Factor Authentication */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Security sx={{ mr: 2, color: 'primary.main' }} />
                <Typography variant="h6">
                  Two-Factor Authentication
                </Typography>
                <Chip
                  label={twoFAEnabled ? 'Enabled' : 'Disabled'}
                  color={twoFAEnabled ? 'success' : 'default'}
                  size="small"
                  sx={{ ml: 2 }}
                />
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Add an extra layer of security to your account by requiring a verification code from your mobile device.
              </Typography>
              
              {twoFAEnabled ? (
                <Box>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Two-factor authentication is currently enabled for your account.
                  </Alert>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setTwoFADisableDialog(true)}
                    disabled={loading}
                  >
                    Disable 2FA
                  </Button>
                </Box>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<Smartphone />}
                  onClick={handleEnable2FA}
                >
                  Enable 2FA
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Security Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Security Preferences
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <List>
                <ListItem>
                  <ListItemText
                    primary="Login Notifications"
                    secondary="Receive email notifications when someone logs into your account"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={securitySettings.loginNotifications}
                      onChange={(e) => handleSettingChange('loginNotifications', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemText
                    primary="Device Tracking"
                    secondary="Track and monitor devices that access your account"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={securitySettings.deviceTracking}
                      onChange={(e) => handleSettingChange('deviceTracking', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemText
                    primary="IP Whitelist"
                    secondary="Only allow access from approved IP addresses"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={securitySettings.ipWhitelist}
                      onChange={(e) => handleSettingChange('ipWhitelist', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Sessions */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Active Sessions
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Device</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>IP Address</TableCell>
                      <TableCell>Last Activity</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(Array.isArray(activeSessions) ? activeSessions : []).map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            {getDeviceIcon(session.device)}
                            <Box ml={1}>
                              <Typography variant="body2">
                                {session.device}
                              </Typography>
                              {session.current && (
                                <Chip
                                  label="Current Session"
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                />
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            <LocationOn fontSize="small" sx={{ mr: 0.5 }} />
                            {session.location}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>
                          {session.ip}
                        </TableCell>
                        <TableCell>
                          {session.lastActivity.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {!session.current && (
                            <Tooltip title="Terminate Session">
                              <IconButton
                                color="error"
                                onClick={() => handleTerminateSession(session.id)}
                              >
                                <Delete />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 2FA Setup Dialog */}
      <Dialog open={twoFADialog} onClose={() => setTwoFADialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            1. Install an authenticator app like Google Authenticator or Authy on your mobile device.
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            2. Scan the QR code below with your authenticator app:
          </Typography>
          
          {qrCode && (
            <Box display="flex" justifyContent="center" mb={2}>
              <QRCodeSVG value={qrCode} size={200} />
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mb: 2 }}>
            3. Enter the 6-digit code from your authenticator app:
          </Typography>
          
          <TextField
            fullWidth
            label="Verification Code"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputProps={{
              style: { textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.5rem' }
            }}
            placeholder="000000"
          />
          
          {backupCodes.length > 0 && (
            <Box mt={2}>
              <Alert severity="warning">
                <Typography variant="body2" gutterBottom>
                  <strong>Important:</strong> Save these backup codes in a secure location. 
                  You can use them to access your account if you lose your authenticator device.
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                  {(Array.isArray(backupCodes) ? backupCodes : []).map((code, index) => (
                    <Chip key={index} label={code} variant="outlined" />
                  ))}
                </Box>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTwoFADialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleVerify2FA}
            variant="contained"
            disabled={loading || verificationCode.length !== 6}
          >
            {loading ? <CircularProgress size={20} /> : 'Verify & Enable'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 2FA Disable Dialog */}
      <Dialog open={twoFADisableDialog} onClose={() => setTwoFADisableDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Please enter your 6-digit authentication code to confirm disabling 2FA:
          </Typography>
          <TextField
            fullWidth
            label="Verification Code"
            value={disableVerificationCode}
            onChange={(e) => setDisableVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputProps={{
              style: { textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.5rem' }
            }}
            placeholder="000000"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTwoFADisableDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDisable2FA}
            variant="contained"
            color="error"
            disabled={loading || disableVerificationCode.length !== 6}
          >
            {loading ? <CircularProgress size={20} /> : 'Confirm Disable'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SecuritySettings;
