import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
  Divider,
  Alert,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  DatePicker,
  Skeleton
} from '@mui/material';
import {
  ArrowBack,
  Save,
  Add,
  Delete,
  Security,
  Speed,
  Visibility,
  Key,
  Help,
  CalendarToday
} from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker as MUIDatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { keyAPI, apiAPI } from '../../services/api';

const EditAPIKey = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apis, setApis] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    apiId: '',
    rateLimit: 1000,
    rateLimitWindow: 60,
    expiresAt: null,
    permissions: [],
    allowedIps: [],
    status: 'active',
    webhookUrl: ''
  });
  const [newIpAddress, setNewIpAddress] = useState('');
  
  const availablePermissions = [
    { id: 'read', name: 'Read Access', description: 'View and retrieve data' },
    { id: 'write', name: 'Write Access', description: 'Create and update data' },
    { id: 'delete', name: 'Delete Access', description: 'Remove data' },
    { id: 'admin', name: 'Admin Access', description: 'Full administrative access' }
  ];

  useEffect(() => {
    if (id) {
      fetchAPIKeyDetails();
      fetchAPIs();
    }
  }, [id]);

  const fetchAPIKeyDetails = async () => {
    try {
      setLoading(true);
      const response = await keyAPI.getById(id);
      const keyData = response.data.data.key;
      setFormData({
        name: keyData.name || '',
        description: keyData.description || '',
        apiId: keyData.apiId || '',
        rateLimit: keyData.rateLimit || 1000,
        rateLimitWindow: keyData.rateLimitWindow || 60,
        expiresAt: keyData.expiresAt ? dayjs(keyData.expiresAt) : null,
        permissions: keyData.permissions || [],
        allowedIps: keyData.allowedIps || [],
        status: keyData.status || 'active',
        webhookUrl: keyData.webhookUrl || ''
      });
    } catch (error) {
      console.error('Error fetching API key details:', error);
      toast.error('Failed to load API key details');
      navigate('/keys');
    } finally {
      setLoading(false);
    }
  };

  const fetchAPIs = async () => {
    try {
      const response = await apiAPI.getAll();
      setApis(response.data.data.apis || []);
    } catch (error) {
      console.error('Error fetching APIs:', error);
    }
  };

  const handleInputChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDateChange = (date) => {
    setFormData(prev => ({
      ...prev,
      expiresAt: date
    }));
  };

  const handlePermissionChange = (permissionId) => {
    const isSelected = formData.permissions.includes(permissionId);
    const newPermissions = isSelected
      ? formData.permissions.filter(p => p !== permissionId)
      : [...formData.permissions, permissionId];
    
    setFormData(prev => ({
      ...prev,
      permissions: newPermissions
    }));
  };

  const handleAddIpAddress = () => {
    if (newIpAddress.trim() && !formData.allowedIps.includes(newIpAddress.trim())) {
      setFormData(prev => ({
        ...prev,
        allowedIps: [...prev.allowedIps, newIpAddress.trim()]
      }));
      setNewIpAddress('');
    }
  };

  const handleRemoveIpAddress = (ipToRemove) => {
    setFormData(prev => ({
      ...prev,
      allowedIps: prev.allowedIps.filter(ip => ip !== ipToRemove)
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('API key name is required');
      return;
    }

    try {
      setSaving(true);
      const submitData = {
        ...formData,
        expiresAt: formData.expiresAt ? formData.expiresAt.toISOString() : null
      };
      await keyAPI.update(id, submitData);
      toast.success('API key updated successfully');
      navigate(`/keys/${id}`);
    } catch (error) {
      console.error('Error updating API key:', error);
      toast.error(error.response?.data?.message || 'Failed to update API key');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <IconButton onClick={() => navigate('/keys')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h4" component="h1">
            Edit API Key
          </Typography>
        </Box>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3 }}>
              <Skeleton variant="text" width="30%" height={32} />
              <Skeleton variant="rectangular" width="100%" height={56} sx={{ mt: 2 }} />
              <Skeleton variant="rectangular" width="100%" height={120} sx={{ mt: 2 }} />
              <Skeleton variant="rectangular" width="100%" height={56} sx={{ mt: 2 }} />
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3 }}>
              <Skeleton variant="text" width="50%" height={32} />
              <Skeleton variant="rectangular" width="100%" height={200} sx={{ mt: 2 }} />
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box>
        {/* Header */}
        <Box display="flex" alignItems="center" mb={3}>
          <IconButton onClick={() => navigate('/keys')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h4" component="h1">
            Edit API Key: {formData.name}
          </Typography>
        </Box>

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Basic Information */}
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Key Name"
                      value={formData.name}
                      onChange={handleInputChange('name')}
                      required
                      placeholder="Enter a name for this API key"
                      helperText="A descriptive name to identify this key"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Description"
                      value={formData.description}
                      onChange={handleInputChange('description')}
                      multiline
                      rows={3}
                      placeholder="Describe the purpose of this API key"
                      helperText="Optional description of what this key is used for"
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Associated API</InputLabel>
                      <Select
                        value={formData.apiId}
                        onChange={handleInputChange('apiId')}
                      >
                        <MenuItem value="">All APIs</MenuItem>
                        {apis.map((api) => (
                          <MenuItem key={api.id} value={api.id}>
                            {api.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Status</InputLabel>
                      <Select
                        value={formData.status}
                        onChange={handleInputChange('status')}
                      >
                        <MenuItem value="active">Active</MenuItem>
                        <MenuItem value="inactive">Inactive</MenuItem>
                        <MenuItem value="expired">Expired</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Paper>

              {/* Rate Limiting */}
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Rate Limiting
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Rate Limit"
                      type="number"
                      value={formData.rateLimit}
                      onChange={handleInputChange('rateLimit')}
                      helperText="Maximum requests allowed"
                      inputProps={{ min: 1 }}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Time Window (seconds)"
                      type="number"
                      value={formData.rateLimitWindow}
                      onChange={handleInputChange('rateLimitWindow')}
                      helperText="Time window for rate limiting"
                      inputProps={{ min: 1 }}
                    />
                  </Grid>
                </Grid>
              </Paper>

              {/* Permissions */}
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Permissions
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <List>
                  {availablePermissions.map((permission) => (
                    <ListItem key={permission.id} dense>
                      <ListItemIcon>
                        <Checkbox
                          checked={formData.permissions.includes(permission.id)}
                          onChange={() => handlePermissionChange(permission.id)}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={permission.name}
                        secondary={permission.description}
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              {/* IP Restrictions */}
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  IP Address Restrictions
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <TextField
                    label="IP Address"
                    value={newIpAddress}
                    onChange={(e) => setNewIpAddress(e.target.value)}
                    size="small"
                    sx={{ flexGrow: 1 }}
                    placeholder="192.168.1.1"
                    helperText="Leave empty to allow all IPs"
                  />
                  <Button
                    variant="outlined"
                    onClick={handleAddIpAddress}
                    startIcon={<Add />}
                    disabled={!newIpAddress.trim()}
                  >
                    Add IP
                  </Button>
                </Box>
                
                {formData.allowedIps.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {formData.allowedIps.map((ip) => (
                      <Chip
                        key={ip}
                        label={ip}
                        onDelete={() => handleRemoveIpAddress(ip)}
                        size="small"
                      />
                    ))}
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Settings Sidebar */}
            <Grid item xs={12} md={4}>
              {/* Expiration */}
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Expiration
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <MUIDatePicker
                  label="Expiration Date"
                  value={formData.expiresAt}
                  onChange={handleDateChange}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      helperText: 'Leave empty for no expiration',
                      size: 'small'
                    }
                  }}
                  minDate={dayjs()}
                />
              </Paper>

              {/* Webhook */}
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Webhook (Optional)
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <TextField
                  fullWidth
                  label="Webhook URL"
                  value={formData.webhookUrl}
                  onChange={handleInputChange('webhookUrl')}
                  placeholder="https://your-app.com/webhook"
                  helperText="URL to receive usage notifications"
                  size="small"
                />
              </Paper>

              {/* Help */}
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <Help sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6">Need Help?</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Learn about API key best practices and security recommendations.
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth
                  >
                    View Documentation
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Action Buttons */}
          <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={() => navigate(`/keys/${id}`)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<Save />}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </Box>
        </form>
      </Box>
    </LocalizationProvider>
  );
};

export default EditAPIKey;
