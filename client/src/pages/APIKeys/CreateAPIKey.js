import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  Divider,
  Grid,
  Chip,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  ArrowBack,
  ContentCopy,
  Download,
  Security,
  Settings,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { toast } from 'react-toastify';
import copy from 'copy-to-clipboard';
import dayjs from 'dayjs';
import api from '../../services/api';

const CreateAPIKey = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apis, setApis] = useState([]);
  const [createdKey, setCreatedKey] = useState(null);
  const [showKey, setShowKey] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    apiId: '',
    permissions: [],
    rateLimit: 1000,
    ipWhitelist: [],
    expiresAt: dayjs().add(1, 'year'),
    environment: 'production'
  });
  
  const [errors, setErrors] = useState({});

  const availablePermissions = [
    { id: 'read', label: 'Read', description: 'Access to read data' },
    { id: 'write', label: 'Write', description: 'Access to create and update data' },
    { id: 'delete', label: 'Delete', description: 'Access to delete data' },
    { id: 'admin', label: 'Admin', description: 'Full administrative access' }
  ];

  const environments = [
    { value: 'development', label: 'Development' },
    { value: 'staging', label: 'Staging' },
    { value: 'production', label: 'Production' }
  ];

  const steps = [
    'Basic Information',
    'API Selection',
    'Permissions & Limits',
    'Review & Create'
  ];

  useEffect(() => {
    fetchAPIs();
  }, []);

  const fetchAPIs = async () => {
    try {
      const response = await api.get('/api/apis');
      const apisList = response.data?.data?.apis || response.data?.apis || (Array.isArray(response.data?.data) ? response.data.data : []);
      setApis(Array.isArray(apisList) && apisList.length > 0 ? apisList : [
        {
          id: 'api1',
          name: 'User Management API',
          description: 'Manage user accounts and profiles',
          version: 'v1.0',
          status: 'active'
        },
        {
          id: 'api2',
          name: 'Analytics API',
          description: 'Access analytics and reporting data',
          version: 'v2.0',
          status: 'active'
        },
        {
          id: 'api3',
          name: 'Payment Processing API',
          description: 'Handle payment transactions',
          version: 'v1.5',
          status: 'active'
        }
      ]);
    } catch (error) {
      console.error('Failed to fetch APIs:', error);
      // Mock data for development
      setApis([
        {
          id: 'api1',
          name: 'User Management API',
          description: 'Manage user accounts and profiles',
          version: 'v1.0',
          status: 'active'
        },
        {
          id: 'api2',
          name: 'Analytics API',
          description: 'Access analytics and reporting data',
          version: 'v2.0',
          status: 'active'
        },
        {
          id: 'api3',
          name: 'Payment Processing API',
          description: 'Handle payment transactions',
          version: 'v1.5',
          status: 'active'
        }
      ]);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handlePermissionChange = (permissionId, checked) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        permissions: [...prev.permissions, permissionId]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        permissions: prev.permissions.filter(p => p !== permissionId)
      }));
    }
  };

  const validateStep = (step) => {
    const newErrors = {};

    switch (step) {
      case 0:
        if (!formData.name.trim()) {
          newErrors.name = 'Name is required';
        }
        if (!formData.description.trim()) {
          newErrors.description = 'Description is required';
        }
        break;
      case 1:
        if (!formData.apiId) {
          newErrors.apiId = 'Please select an API';
        }
        break;
      case 2:
        if (formData.permissions.length === 0) {
          newErrors.permissions = 'At least one permission is required';
        }
        if (formData.rateLimit < 1) {
          newErrors.rateLimit = 'Rate limit must be at least 1';
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(activeStep)) return;

    setLoading(true);
    try {
      const response = await api.post('/api/keys', {
        ...formData,
        expiresAt: formData.expiresAt.toISOString()
      });
      
      setCreatedKey(response.data.data.key);
      toast.success('API key created successfully');
      setActiveStep(prev => prev + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = () => {
    const rawKey = createdKey?.apiKey || createdKey?.key;
    if (rawKey) {
      copy(rawKey);
      toast.success('API key copied to clipboard');
    }
  };

  const getSelectedAPI = () => {
    return apis.find(api => api.id === formData.apiId);
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <TextField
              fullWidth
              label="API Key Name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              error={!!errors.name}
              helperText={errors.name}
              margin="normal"
              placeholder="e.g., Production API Key"
            />
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              error={!!errors.description}
              helperText={errors.description}
              margin="normal"
              multiline
              rows={3}
              placeholder="Describe the purpose and usage of this API key"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Environment</InputLabel>
              <Select
                value={formData.environment}
                label="Environment"
                onChange={(e) => handleChange('environment', e.target.value)}
              >
                {environments.map(env => (
                  <MenuItem key={env.value} value={env.value}>
                    {env.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Select API
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Choose which API this key will have access to
            </Typography>
            
            {errors.apiId && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errors.apiId}
              </Alert>
            )}

            <Grid container spacing={2}>
              {(Array.isArray(apis) ? apis : []).map(apiItem => (
                <Grid item xs={12} md={6} key={apiItem.id}>
                  <Card
                    sx={{
                      cursor: 'pointer',
                      border: formData.apiId === apiItem.id ? 2 : 1,
                      borderColor: formData.apiId === apiItem.id ? 'primary.main' : 'divider',
                      '&:hover': {
                        borderColor: 'primary.main'
                      }
                    }}
                    onClick={() => handleChange('apiId', apiItem.id)}
                  >
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="start">
                        <Box>
                          <Typography variant="h6">{apiItem.name}</Typography>
                          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                            {apiItem.description}
                          </Typography>
                          <Box display="flex" gap={1}>
                            <Chip label={apiItem.version} size="small" />
                            <Chip 
                              label={apiItem.status} 
                              size="small" 
                              color={apiItem.status === 'active' ? 'success' : 'default'}
                            />
                          </Box>
                        </Box>
                        {formData.apiId === apiItem.id && (
                          <Security color="primary" />
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Permissions
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Select what actions this API key can perform
            </Typography>
            
            {errors.permissions && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errors.permissions}
              </Alert>
            )}

            <FormGroup sx={{ mb: 3 }}>
              {availablePermissions.map(permission => (
                <FormControlLabel
                  key={permission.id}
                  control={
                    <Checkbox
                      checked={formData.permissions.includes(permission.id)}
                      onChange={(e) => handlePermissionChange(permission.id, e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">{permission.label}</Typography>
                      <Typography variant="body2" color="textSecondary">
                        {permission.description}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </FormGroup>

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" gutterBottom>
              Rate Limiting
            </Typography>
            <TextField
              fullWidth
              label="Requests per hour"
              type="number"
              value={formData.rateLimit}
              onChange={(e) => handleChange('rateLimit', parseInt(e.target.value) || 0)}
              error={!!errors.rateLimit}
              helperText={errors.rateLimit || 'Maximum number of requests allowed per hour'}
              margin="normal"
              inputProps={{ min: 1 }}
            />

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" gutterBottom>
              Expiration
            </Typography>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Expires At"
                value={formData.expiresAt}
                onChange={(newValue) => handleChange('expiresAt', newValue)}
                slotProps={{ textField: { fullWidth: true, margin: 'normal' } }}
                minDate={dayjs()}
              />
            </LocalizationProvider>
          </Box>
        );

      case 3:
        const selectedAPI = getSelectedAPI();
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review API Key Details
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Please review the details before creating the API key
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Basic Information
                    </Typography>
                    <Box sx={{ '& > div': { mb: 1 } }}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="textSecondary">Name:</Typography>
                        <Typography variant="body2">{formData.name}</Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="textSecondary">Environment:</Typography>
                        <Chip label={formData.environment} size="small" />
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="textSecondary">Expires:</Typography>
                        <Typography variant="body2">
                          {formData.expiresAt.format('MMM DD, YYYY')}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      API Access
                    </Typography>
                    <Box sx={{ '& > div': { mb: 1 } }}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="textSecondary">API:</Typography>
                        <Typography variant="body2">{selectedAPI?.name}</Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="textSecondary">Rate Limit:</Typography>
                        <Typography variant="body2">{formData.rateLimit}/hour</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                          Permissions:
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {formData.permissions.map(permission => (
                            <Chip
                              key={permission}
                              label={availablePermissions.find(p => p.id === permission)?.label}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        );

      default:
        return null;
    }
  };

  if (createdKey) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 4 }}>
          <Box display="flex" alignItems="center" mb={3}>
            <Security sx={{ mr: 2, color: 'success.main', fontSize: 40 }} />
            <Box>
              <Typography variant="h4" color="success.main">
                API Key Created Successfully!
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Your new API key has been generated and is ready to use
              </Typography>
            </Box>
          </Box>

          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2" gutterBottom>
              <strong>Important:</strong> This is the only time you will be able to see the complete API key. 
              Please copy it now and store it securely.
            </Typography>
          </Alert>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">API Key</Typography>
                <Box>
                  <IconButton onClick={() => setShowKey(!showKey)}>
                    {showKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                  <IconButton onClick={handleCopyKey} color="primary">
                    <ContentCopy />
                  </IconButton>
                </Box>
              </Box>
              
              <Box
                sx={{
                  p: 2,
                  backgroundColor: 'grey.100',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  border: '1px solid',
                  borderColor: 'divider'
                }}
              >
                {showKey 
                  ? (createdKey.apiKey || createdKey.key) 
                  : '•'.repeat((createdKey.apiKey || createdKey.key || '').length)}
              </Box>
            </CardContent>
          </Card>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Download />}
                onClick={() => {
                  const element = document.createElement('a');
                  const file = new Blob([JSON.stringify({
                    name: formData.name,
                    key: createdKey.apiKey || createdKey.key,
                    createdAt: new Date().toISOString()
                  }, null, 2)], { type: 'application/json' });
                  element.href = URL.createObjectURL(file);
                  element.download = `${formData.name.replace(/\s+/g, '_')}_api_key.json`;
                  document.body.appendChild(element);
                  element.click();
                  document.body.removeChild(element);
                }}
              >
                Download Key
              </Button>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button
                fullWidth
                variant="contained"
                onClick={() => navigate('/keys')}
              >
                View API Keys
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/keys')} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4">
          Create New API Key
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((label, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
              <StepContent>
                {renderStepContent(index)}
                <Box sx={{ mb: 2, mt: 3 }}>
                  <Box>
                    {index === steps.length - 1 ? (
                      <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading}
                        sx={{ mt: 1, mr: 1 }}
                      >
                        {loading ? <CircularProgress size={20} /> : 'Create API Key'}
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        onClick={handleNext}
                        sx={{ mt: 1, mr: 1 }}
                      >
                        Continue
                      </Button>
                    )}
                    <Button
                      disabled={index === 0}
                      onClick={handleBack}
                      sx={{ mt: 1, mr: 1 }}
                    >
                      Back
                    </Button>
                  </Box>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>
    </Container>
  );
};

export default CreateAPIKey;
