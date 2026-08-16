import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Storage as StorageIcon,
  Shield as ShieldIcon,
  Email as EmailIcon,
  Sms as SmsIcon,
  Webhook as WebhookIcon,
  Save as SaveIcon,
  Restore as RestoreIcon,
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import apiService from '../../services/api';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const Settings = () => {
  useAuth();
  const [settings, setSettings] = useState({
    // General Settings
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    theme: 'light',
    
    // Notification Settings
    emailNotifications: true,
    smsNotifications: false,
    webhookNotifications: false,
    apiAlerts: true,
    securityAlerts: true,
    usageAlerts: true,
    
    // Security Settings
    twoFactorAuth: false,
    sessionTimeout: 30,
    ipWhitelist: [],
    
    // API Settings
    defaultRateLimit: 1000,
    defaultTimeout: 30000,
    retryAttempts: 3,
    logRetention: 90,
    
    // Advanced Settings
    webhookUrl: '',
    apiVersion: 'v1',
    enableCors: true,
    enableCache: true,
    cacheTimeout: 300
  });
  
  const [loading, setLoading] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [newIpAddress, setNewIpAddress] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await apiService.get('/api/settings');
      const backendSettings = response.data?.data?.settings || response.data?.settings || response.data;
      if (backendSettings) {
        setSettings(prevSettings => ({
          ...prevSettings,
          ...backendSettings
        }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSettingChange = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      await apiService.put('/api/settings', settings);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSettings = async () => {
    try {
      await apiService.post('/api/settings/reset');
      await fetchSettings();
      toast.success('Settings reset to defaults');
    } catch (error) {
      console.error('Error resetting settings:', error);
      toast.error('Failed to reset settings');
    } finally {
      setResetDialogOpen(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error("Please type 'DELETE' to confirm account deletion");
      return;
    }
    if (!deletePassword) {
      toast.error('Password is required for account deletion');
      return;
    }

    try {
      setDeletingAccount(true);
      await apiService.delete('/api/settings/delete-account', {
        data: {
          password: deletePassword,
          confirmation: 'DELETE'
        }
      });
      toast.success('Account deleted successfully');
      setDeleteAccountDialogOpen(false);
      localStorage.clear();
      window.location.href = '/login';
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(error.response?.data?.message || 'Failed to delete account');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleAddIpAddress = () => {
    if (newIpAddress.trim() && !settings.ipWhitelist.includes(newIpAddress.trim())) {
      setSettings(prev => ({
        ...prev,
        ipWhitelist: [...prev.ipWhitelist, newIpAddress.trim()]
      }));
      setNewIpAddress('');
    }
  };

  const handleRemoveIpAddress = (ipToRemove) => {
    setSettings(prev => ({
      ...prev,
      ipWhitelist: prev.ipWhitelist.filter(ip => ip !== ipToRemove)
    }));
  };

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Português' },
    { value: 'ru', label: 'Русский' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'zh', label: '中文' }
  ];

  const timezoneOptions = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'Eastern Time' },
    { value: 'America/Chicago', label: 'Central Time' },
    { value: 'America/Denver', label: 'Mountain Time' },
    { value: 'America/Los_Angeles', label: 'Pacific Time' },
    { value: 'Europe/London', label: 'GMT' },
    { value: 'Europe/Paris', label: 'CET' },
    { value: 'Asia/Tokyo', label: 'JST' },
    { value: 'Asia/Shanghai', label: 'CST' }
  ];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          Settings
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RestoreIcon />}
            onClick={() => setResetDialogOpen(true)}
          >
            Reset to Defaults
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveSettings}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* General Settings */}
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <SettingsIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">General Settings</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Language</InputLabel>
                    <Select
                      value={settings.language}
                      onChange={handleSettingChange('language')}
                    >
                      {languageOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Timezone</InputLabel>
                    <Select
                      value={settings.timezone}
                      onChange={handleSettingChange('timezone')}
                    >
                      {timezoneOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Date Format</InputLabel>
                    <Select
                      value={settings.dateFormat}
                      onChange={handleSettingChange('dateFormat')}
                    >
                      <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                      <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                      <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Theme</InputLabel>
                    <Select
                      value={settings.theme}
                      onChange={handleSettingChange('theme')}
                    >
                      <MenuItem value="light">Light</MenuItem>
                      <MenuItem value="dark">Dark</MenuItem>
                      <MenuItem value="auto">Auto</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <NotificationsIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Notifications</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <List>
                <ListItem>
                  <ListItemIcon>
                    <EmailIcon />
                  </ListItemIcon>
                  <ListItemText primary="Email Notifications" secondary="Receive notifications via email" />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.emailNotifications}
                      onChange={handleSettingChange('emailNotifications')}
                    />
                  </ListItemSecondaryAction>
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <SmsIcon />
                  </ListItemIcon>
                  <ListItemText primary="SMS Notifications" secondary="Receive notifications via SMS" />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.smsNotifications}
                      onChange={handleSettingChange('smsNotifications')}
                    />
                  </ListItemSecondaryAction>
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <WebhookIcon />
                  </ListItemIcon>
                  <ListItemText primary="Webhook Notifications" secondary="Send notifications to webhook URL" />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.webhookNotifications}
                      onChange={handleSettingChange('webhookNotifications')}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">Alert Types</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.apiAlerts}
                        onChange={handleSettingChange('apiAlerts')}
                      />
                    }
                    label="API Alerts"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.securityAlerts}
                        onChange={handleSettingChange('securityAlerts')}
                      />
                    }
                    label="Security Alerts"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.usageAlerts}
                        onChange={handleSettingChange('usageAlerts')}
                      />
                    }
                    label="Usage Alerts"
                  />
                </AccordionDetails>
              </Accordion>

              {settings.webhookNotifications && (
                <TextField
                  fullWidth
                  label="Webhook URL"
                  value={settings.webhookUrl}
                  onChange={handleSettingChange('webhookUrl')}
                  placeholder="https://your-app.com/webhook"
                  size="small"
                  sx={{ mt: 2 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Security & API Settings */}
        <Grid item xs={12} md={6}>
          {/* Security Settings */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <SecurityIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Security Settings</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <List>
                <ListItem>
                  <ListItemIcon>
                    <ShieldIcon />
                  </ListItemIcon>
                  <ListItemText primary="Two-Factor Authentication" secondary="Add an extra layer of security" />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.twoFactorAuth}
                      onChange={handleSettingChange('twoFactorAuth')}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>

              <TextField
                fullWidth
                label="Session Timeout (minutes)"
                type="number"
                value={settings.sessionTimeout}
                onChange={handleSettingChange('sessionTimeout')}
                size="small"
                sx={{ mb: 2 }}
                inputProps={{ min: 5, max: 1440 }}
              />

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  IP Whitelist
                </Typography>
                <Box display="flex" gap={1} mb={2}>
                  <TextField
                    label="IP Address"
                    value={newIpAddress}
                    onChange={(e) => setNewIpAddress(e.target.value)}
                    size="small"
                    sx={{ flex: 1 }}
                    placeholder="192.168.1.1"
                  />
                  <Button
                    variant="outlined"
                    onClick={handleAddIpAddress}
                    disabled={!newIpAddress.trim()}
                  >
                    Add
                  </Button>
                </Box>
                {Array.isArray(settings.ipWhitelist) && settings.ipWhitelist.length > 0 && (
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {settings.ipWhitelist.map((ip) => (
                      <Chip
                        key={ip}
                        label={ip}
                        onDelete={() => handleRemoveIpAddress(ip)}
                        size="small"
                      />
                    ))}
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* API Settings */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">API Settings</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Default Rate Limit"
                    type="number"
                    value={settings.defaultRateLimit}
                    onChange={handleSettingChange('defaultRateLimit')}
                    size="small"
                    helperText="Requests per minute"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Default Timeout (ms)"
                    type="number"
                    value={settings.defaultTimeout}
                    onChange={handleSettingChange('defaultTimeout')}
                    size="small"
                    helperText="Request timeout"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Retry Attempts"
                    type="number"
                    value={settings.retryAttempts}
                    onChange={handleSettingChange('retryAttempts')}
                    size="small"
                    inputProps={{ min: 0, max: 10 }}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Log Retention (days)"
                    type="number"
                    value={settings.logRetention}
                    onChange={handleSettingChange('logRetention')}
                    size="small"
                    inputProps={{ min: 1, max: 365 }}
                  />
                </Grid>
              </Grid>

              <Box mt={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.enableCors}
                      onChange={handleSettingChange('enableCors')}
                    />
                  }
                  label="Enable CORS"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.enableCache}
                      onChange={handleSettingChange('enableCache')}
                    />
                  }
                  label="Enable Caching"
                />
              </Box>

              {settings.enableCache && (
                <TextField
                  fullWidth
                  label="Cache Timeout (seconds)"
                  type="number"
                  value={settings.cacheTimeout}
                  onChange={handleSettingChange('cacheTimeout')}
                  size="small"
                  sx={{ mt: 2 }}
                  inputProps={{ min: 60, max: 3600 }}
                />
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card sx={{ border: '1px solid', borderColor: 'error.main' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <WarningIcon sx={{ mr: 1, color: 'error.main' }} />
                <Typography variant="h6" color="error.main">Danger Zone</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                These actions are irreversible. Please proceed with caution.
              </Alert>

              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setResetDialogOpen(true)}
                >
                  Reset All Settings
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => setDeleteAccountDialogOpen(true)}
                >
                  Delete Account
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Reset Settings Dialog */}
      <ConfirmDialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        onConfirm={handleResetSettings}
        title="Reset Settings"
        content="Are you sure you want to reset all settings to their default values? This action cannot be undone."
        confirmText="Reset"
        confirmColor="warning"
      />

      {/* Delete Account Dialog */}
      <Dialog
        open={deleteAccountDialogOpen}
        onClose={() => setDeleteAccountDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: 'error.main' }}>
          Delete Account
        </DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Are you sure you want to permanently delete your account? This action cannot be undone.
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText primary="• All registered APIs will be deleted" />
            </ListItem>
            <ListItem>
              <ListItemText primary="• All API keys will be revoked immediately" />
            </ListItem>
            <ListItem>
              <ListItemText primary="• All usage analytics and logs will be permanently removed" />
            </ListItem>
          </List>
          <Alert severity="error" sx={{ my: 2 }}>
            This action is irreversible!
          </Alert>
          <TextField
            fullWidth
            label="Enter Password"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Type 'DELETE' to confirm"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            margin="normal"
            placeholder="DELETE"
            required
            helperText="Please type DELETE in all uppercase"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAccountDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteAccount}
            variant="contained"
            color="error"
            disabled={deletingAccount || deleteConfirmText !== 'DELETE' || !deletePassword}
          >
            {deletingAccount ? 'Deleting...' : 'Delete Account Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;
