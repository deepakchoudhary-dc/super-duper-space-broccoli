import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Tab,
  Tabs,
  Alert,
  Menu,
  MenuItem,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  ArrowBack,
  Edit,
  Delete,
  Settings,
  Api,
  Security,
  Speed,
  Visibility,
  MoreVert,
  ContentCopy,
  CheckCircle,
  Error,
  Warning,
  Key
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiAPI, keyAPI, analyticsAPI } from '../../services/api';
import MetricCard from '../../components/common/MetricCard';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const APIDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [api, setApi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [analytics, setAnalytics] = useState({});

  useEffect(() => {
    if (id) {
      fetchAPIDetails();
      fetchAPIKeys();
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchAPIDetails = async () => {
    try {
      setLoading(true);
      const response = await apiAPI.getById(id);
      setApi(response.data.data.api);
    } catch (error) {
      console.error('Error fetching API details:', error);
      toast.error('Failed to load API details');
      navigate('/apis');
    } finally {
      setLoading(false);
    }
  };

  const fetchAPIKeys = async () => {
    try {
      const response = await keyAPI.getAll({ apiId: id });
      setApiKeys(response.data.data.keys || []);
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await analyticsAPI.getApiAnalytics(id);
      setAnalytics(response.data.data.overview || {});
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    navigate(`/apis/${id}/edit`);
    handleMenuClose();
  };

  const handleDelete = () => {
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  const confirmDelete = async () => {
    try {
      await apiAPI.delete(id);
      toast.success('API deleted successfully');
      navigate('/apis');
    } catch (error) {
      console.error('Error deleting API:', error);
      toast.error('Failed to delete API');
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const handleToggleStatus = async () => {
    try {
      const newStatus = api.status === 'active' ? 'inactive' : 'active';
      await apiAPI.update(id, { status: newStatus });
      setApi({ ...api, status: newStatus });
      toast.success(`API ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      console.error('Error updating API status:', error);
      toast.error('Failed to update API status');
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'error';
      case 'maintenance':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return <CheckCircle fontSize="small" />;
      case 'inactive':
        return <Error fontSize="small" />;
      case 'maintenance':
        return <Warning fontSize="small" />;
      default:
        return null;
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading API details...</Typography>
      </Box>
    );
  }

  if (!api) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="text.secondary">
          API not found
        </Typography>
        <Button onClick={() => navigate('/apis')} sx={{ mt: 2 }}>
          Back to APIs
        </Button>
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
        <Box flex={1}>
          <Typography variant="h4" component="h1">
            {api.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {api.description}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Chip
            label={api.status}
            color={getStatusColor(api.status)}
            icon={getStatusIcon(api.status)}
          />
          <IconButton onClick={handleMenuOpen}>
            <MoreVert />
          </IconButton>
        </Box>
      </Box>

      {/* Quick Stats */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Requests"
            value={analytics.totalRequests || 0}
            icon={<Api />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Active Keys"
            value={apiKeys.filter(key => key.status === 'active').length}
            icon={<Key />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Success Rate"
            value={`${analytics.successRate || 0}%`}
            icon={<CheckCircle />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Response Time"
            value={`${analytics.avgResponseTime || 0}ms`}
            icon={<Speed />}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Overview" />
          <Tab label="API Keys" />
          <Tab label="Analytics" />
          <Tab label="Settings" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {/* API Information */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  API Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <List>
                  <ListItem>
                    <ListItemText
                      primary="API ID"
                      secondary={
                        <Box display="flex" alignItems="center">
                          {api.id}
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(api.id)}
                            sx={{ ml: 1 }}
                          >
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Box>
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Version" secondary={api.version || '1.0.0'} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Endpoint" secondary={api.endpoint || 'Not specified'} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Created" secondary={new Date(api.createdAt).toLocaleDateString()} />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Last Updated" secondary={new Date(api.updatedAt).toLocaleDateString()} />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Security Settings */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Security Settings
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <List>
                  <ListItem>
                    <ListItemIcon>
                      <Security />
                    </ListItemIcon>
                    <ListItemText
                      primary="Authentication Required"
                      secondary={api.requiresAuth ? 'Yes' : 'No'}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Speed />
                    </ListItemIcon>
                    <ListItemText
                      primary="Rate Limiting"
                      secondary={api.rateLimit ? `${api.rateLimit} requests/minute` : 'Not configured'}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Visibility />
                    </ListItemIcon>
                    <ListItemText
                      primary="Public Access"
                      secondary={api.isPublic ? 'Enabled' : 'Disabled'}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tabValue === 1 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">API Keys</Typography>
              <Button
                variant="contained"
                startIcon={<Key />}
                onClick={() => navigate(`/keys/create?apiId=${id}`)}
              >
                Create New Key
              </Button>
            </Box>
            {apiKeys.length === 0 ? (
              <Alert severity="info">
                No API keys have been created for this API yet.
              </Alert>
            ) : (
              <List>
                {apiKeys.map((key) => (
                  <ListItem key={key.id} divider>
                    <ListItemText
                      primary={key.name}
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            Key: {key.keyPrefix || (key.key ? key.key.substring(0, 20) + '...' : '')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Created: {new Date(key.createdAt).toLocaleDateString()}
                          </Typography>
                        </Box>
                      }
                    />
                    <Chip
                      label={key.status}
                      color={getStatusColor(key.status)}
                      size="small"
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}

      {tabValue === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Analytics Overview
            </Typography>
            <Alert severity="info">
              Detailed analytics will be implemented in future versions.
            </Alert>
          </CardContent>
        </Card>
      )}

      {tabValue === 3 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              API Settings
            </Typography>
            <Box mt={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={api.status === 'active'}
                    onChange={handleToggleStatus}
                  />
                }
                label="API Active"
              />
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEdit}>
          <Edit sx={{ mr: 1 }} fontSize="small" />
          Edit API
        </MenuItem>
        <MenuItem onClick={handleMenuClose}>
          <Settings sx={{ mr: 1 }} fontSize="small" />
          Settings
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1 }} fontSize="small" />
          Delete API
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete API"
        content={
          <Box>
            <Typography gutterBottom>
              Are you sure you want to delete "{api.name}"?
            </Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>
              This action cannot be undone. All associated API keys will be deactivated.
            </Alert>
          </Box>
        }
        confirmText="Delete"
        confirmColor="error"
      />
    </Box>
  );
};

export default APIDetails;
