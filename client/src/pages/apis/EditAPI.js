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
  Api,
  Help
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import apiService from '../../services/api';

const EditAPI = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    endpoint: '',
    version: '1.0.0',
    status: 'active',
    requiresAuth: true,
    isPublic: false,
    rateLimit: 1000,
    rateLimitWindow: 60,
    allowedMethods: ['GET'],
    tags: [],
    documentation: '',
    webhookUrl: '',
    retryAttempts: 3,
    timeout: 30000
  });
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (id) {
      fetchAPIDetails();
    }
  }, [id]);

  const fetchAPIDetails = async () => {
    try {
      setLoading(true);
      const response = await apiService.get(`/api/apis/${id}`);
      const apiData = response.data?.data?.api || response.data?.data || response.data || {};
      setFormData({
        name: apiData.name || '',
        description: apiData.description || '',
        endpoint: apiData.baseUrl || apiData.endpoint || '',
        version: apiData.version || '1.0.0',
        status: apiData.status || 'active',
        requiresAuth: apiData.requiresAuth ?? true,
        isPublic: apiData.isPublic ?? false,
        rateLimit: apiData.rateLimit || 1000,
        rateLimitWindow: apiData.rateLimitWindow || 60,
        allowedMethods: apiData.allowedMethods || ['GET'],
        tags: apiData.tags || [],
        documentation: apiData.documentationUrl || apiData.documentation || '',
        webhookUrl: apiData.webhookUrl || '',
        retryAttempts: apiData.retryAttempts || 3,
        timeout: apiData.timeout || 30000
      });
    } catch (error) {
      console.error('Error fetching API details:', error);
      toast.error('Failed to load API details');
      navigate('/apis');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleMethodChange = (event) => {
    setFormData(prev => ({
      ...prev,
      allowedMethods: event.target.value
    }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('API name is required');
      return;
    }

    if (!formData.endpoint.trim()) {
      toast.error('API endpoint is required');
      return;
    }

    try {
      setSaving(true);
      await apiService.put(`/apis/${id}`, formData);
      toast.success('API updated successfully');
      navigate(`/apis/${id}`);
    } catch (error) {
      console.error('Error updating API:', error);
      toast.error(error.response?.data?.message || 'Failed to update API');
    } finally {
      setSaving(false);
    }
  };

  const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

  if (loading) {
    return (
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <IconButton onClick={() => navigate('/apis')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h4" component="h1">
            Edit API
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
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/apis')} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" component="h1">
          Edit API: {formData.name}
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
                    label="API Name"
                    value={formData.name}
                    onChange={handleInputChange('name')}
                    required
                    placeholder="Enter API name"
                    helperText="A descriptive name for your API"
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
                    placeholder="Describe what your API does"
                    helperText="Brief description of API functionality"
                  />
                </Grid>

                <Grid item xs={12} sm={8}>
                  <TextField
                    fullWidth
                    label="API Endpoint"
                    value={formData.endpoint}
                    onChange={handleInputChange('endpoint')}
                    required
                    placeholder="https://api.example.com/v1"
                    helperText="Base URL for your API"
                  />
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Version"
                    value={formData.version}
                    onChange={handleInputChange('version')}
                    placeholder="1.0.0"
                    helperText="API version"
                  />
                </Grid>

                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Allowed HTTP Methods</InputLabel>
                    <Select
                      multiple
                      value={formData.allowedMethods}
                      onChange={handleMethodChange}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {httpMethods.map((method) => (
                        <MenuItem key={method} value={method}>
                          {method}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <TextField
                      label="Add Tag"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      size="small"
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      variant="outlined"
                      onClick={handleAddTag}
                      startIcon={<Add />}
                      disabled={!newTag.trim()}
                    >
                      Add
                    </Button>
                  </Box>
                  {formData.tags.length > 0 && (
                    <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {formData.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          onDelete={() => handleRemoveTag(tag)}
                          size="small"
                        />
                      ))}
                    </Box>
                  )}
                </Grid>
              </Grid>
            </Paper>

            {/* Advanced Settings */}
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Advanced Settings
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Rate Limit (requests)"
                    type="number"
                    value={formData.rateLimit}
                    onChange={handleInputChange('rateLimit')}
                    helperText="Maximum requests allowed"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Rate Limit Window (seconds)"
                    type="number"
                    value={formData.rateLimitWindow}
                    onChange={handleInputChange('rateLimitWindow')}
                    helperText="Time window for rate limiting"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Timeout (milliseconds)"
                    type="number"
                    value={formData.timeout}
                    onChange={handleInputChange('timeout')}
                    helperText="Request timeout duration"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Retry Attempts"
                    type="number"
                    value={formData.retryAttempts}
                    onChange={handleInputChange('retryAttempts')}
                    helperText="Number of retry attempts on failure"
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Webhook URL (optional)"
                    value={formData.webhookUrl}
                    onChange={handleInputChange('webhookUrl')}
                    placeholder="https://your-app.com/webhook"
                    helperText="URL to receive API event notifications"
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Documentation URL (optional)"
                    value={formData.documentation}
                    onChange={handleInputChange('documentation')}
                    placeholder="https://docs.example.com/api"
                    helperText="Link to API documentation"
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          {/* Settings Sidebar */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                API Settings
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <List>
                <ListItem>
                  <ListItemIcon>
                    <Api />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <FormControl fullWidth size="small">
                        <InputLabel>Status</InputLabel>
                        <Select
                          value={formData.status}
                          onChange={handleInputChange('status')}
                        >
                          <MenuItem value="active">Active</MenuItem>
                          <MenuItem value="inactive">Inactive</MenuItem>
                          <MenuItem value="maintenance">Maintenance</MenuItem>
                        </Select>
                      </FormControl>
                    }
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <Security />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.requiresAuth}
                            onChange={handleInputChange('requiresAuth')}
                          />
                        }
                        label="Requires Authentication"
                      />
                    }
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <Visibility />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.isPublic}
                            onChange={handleInputChange('isPublic')}
                          />
                        }
                        label="Public Access"
                      />
                    }
                  />
                </ListItem>
              </List>
            </Paper>

            {/* Help Card */}
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <Help sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Need Help?</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  View our API management guide for best practices and troubleshooting.
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
            onClick={() => navigate(`/apis/${id}`)}
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
  );
};

export default EditAPI;
