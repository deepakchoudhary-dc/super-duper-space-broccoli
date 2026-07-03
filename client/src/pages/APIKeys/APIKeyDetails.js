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
  Tooltip,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  ArrowBack,
  Edit,
  Delete,
  Settings,
  Key,
  Security,
  Speed,
  Visibility,
  MoreVert,
  ContentCopy,
  CheckCircle,
  Error,
  Warning,
  Analytics,
  History,
  Refresh
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { keyAPI, analyticsAPI } from '../../services/api';
import MetricCard from '../../components/common/MetricCard';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const APIKeyDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [analytics, setAnalytics] = useState({});
  const [usageLogs, setUsageLogs] = useState([]);

  useEffect(() => {
    if (id) {
      fetchAPIKeyDetails();
      fetchAnalytics();
      fetchUsageLogs();
    }
  }, [id]);

  const fetchAPIKeyDetails = async () => {
    try {
      setLoading(true);
      const response = await keyAPI.getById(id);
      setApiKey(response.data.data.key);
    } catch (error) {
      console.error('Error fetching API key details:', error);
      toast.error('Failed to load API key details');
      navigate('/keys');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await analyticsAPI.getKeyAnalytics(id);
      setAnalytics(response.data.data.overview || {});
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const fetchUsageLogs = async () => {
    try {
      const response = await keyAPI.getUsage(id);
      setUsageLogs(response.data.data.usage || []);
    } catch (error) {
      console.error('Error fetching usage logs:', error);
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
    navigate(`/keys/${id}/edit`);
    handleMenuClose();
  };

  const handleDelete = () => {
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  const confirmDelete = async () => {
    try {
      await keyAPI.delete(id);
      toast.success('API key deleted successfully');
      navigate('/keys');
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const handleToggleStatus = async () => {
    try {
      const newStatus = apiKey.status === 'active' ? 'inactive' : 'active';
      await keyAPI.update(id, { status: newStatus });
      setApiKey({ ...apiKey, status: newStatus });
      toast.success(`API key ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      console.error('Error updating API key status:', error);
      toast.error('Failed to update API key status');
    }
  };

  const handleRegenerateKey = async () => {
    try {
      const response = await keyAPI.regenerate(id);
      setApiKey({ ...apiKey, key: response.data.data.key.key });
      toast.success('API key regenerated successfully');
    } catch (error) {
      console.error('Error regenerating API key:', error);
      toast.error('Failed to regenerate API key');
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'error';
      case 'expired':
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
      case 'expired':
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
        <Typography>Loading API key details...</Typography>
      </Box>
    );
  }

  if (!apiKey) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="text.secondary">
          API key not found
        </Typography>
        <Button onClick={() => navigate('/keys')} sx={{ mt: 2 }}>
          Back to API Keys
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/keys')} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Box flex={1}>
          <Typography variant="h4" component="h1">
            {apiKey.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {apiKey.description}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Chip
            label={apiKey.status}
            color={getStatusColor(apiKey.status)}
            icon={getStatusIcon(apiKey.status)}
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
            icon={<Analytics />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Success Rate"
            value={`${analytics.successRate || 0}%`}
            icon={<CheckCircle />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Last Used"
            value={apiKey.lastUsed ? new Date(apiKey.lastUsed).toLocaleDateString() : 'Never'}
            icon={<History />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Rate Limit"
            value={`${apiKey.rateLimit || 1000}/min`}
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
          <Tab label="Permissions" />
          <Tab label="Usage" />
          <Tab label="Settings" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {/* API Key Information */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  API Key Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Key ID"
                      secondary={
                        <Box display="flex" alignItems="center">
                          {apiKey.id}
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(apiKey.id)}
                            sx={{ ml: 1 }}
                          >
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Box>
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="API Key"
                      secondary={
                        <Box display="flex" alignItems="center">
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {apiKey.key ? `${apiKey.key.substring(0, 8)}...${apiKey.key.substring(apiKey.key.length - 8)}` : 'Hidden'}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(apiKey.key)}
                            sx={{ ml: 1 }}
                          >
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Box>
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Created" secondary={new Date(apiKey.createdAt).toLocaleDateString()} />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Expires" 
                      secondary={apiKey.expiresAt ? new Date(apiKey.expiresAt).toLocaleDateString() : 'Never'} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Associated API" secondary={apiKey.apiName || 'All APIs'} />
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
                  Security & Limits
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <List>
                  <ListItem>
                    <ListItemIcon>
                      <Speed />
                    </ListItemIcon>
                    <ListItemText
                      primary="Rate Limit"
                      secondary={`${apiKey.rateLimit || 1000} requests per minute`}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Security />
                    </ListItemIcon>
                    <ListItemText
                      primary="IP Restrictions"
                      secondary={apiKey.allowedIps?.length ? `${apiKey.allowedIps.length} IPs allowed` : 'No restrictions'}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Visibility />
                    </ListItemIcon>
                    <ListItemText
                      primary="Permissions"
                      secondary={`${apiKey.permissions?.length || 0} permissions granted`}
                    />
                  </ListItem>
                </List>

                <Box mt={2}>
                  <Button
                    variant="outlined"
                    startIcon={<Refresh />}
                    onClick={handleRegenerateKey}
                    sx={{ mr: 1 }}
                  >
                    Regenerate Key
                  </Button>
                  <Button
                    variant={apiKey.status === 'active' ? 'outlined' : 'contained'}
                    color={apiKey.status === 'active' ? 'error' : 'success'}
                    onClick={handleToggleStatus}
                  >
                    {apiKey.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tabValue === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              API Key Permissions
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {apiKey.permissions?.length ? (
              <List>
                {apiKey.permissions.map((permission, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary={permission.name}
                      secondary={permission.description}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Alert severity="info">
                This API key has full access to all available endpoints.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {tabValue === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Usage History
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {usageLogs.length ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Timestamp</TableCell>
                      <TableCell>Method</TableCell>
                      <TableCell>Endpoint</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Response Time</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {usageLogs.slice(0, 10).map((log, index) => (
                      <TableRow key={index}>
                        <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                        <TableCell>
                          <Chip label={log.method} size="small" />
                        </TableCell>
                        <TableCell>{log.endpoint}</TableCell>
                        <TableCell>
                          <Chip
                            label={log.status}
                            color={log.status >= 200 && log.status < 300 ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{log.responseTime}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">
                No usage data available for this API key.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {tabValue === 3 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Key Settings
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Alert severity="info">
              Key settings configuration will be implemented in future versions.
            </Alert>
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
          Edit Key
        </MenuItem>
        <MenuItem onClick={handleRegenerateKey}>
          <Refresh sx={{ mr: 1 }} fontSize="small" />
          Regenerate Key
        </MenuItem>
        <MenuItem onClick={() => handleToggleStatus()}>
          {apiKey.status === 'active' ? (
            <>
              <Error sx={{ mr: 1 }} fontSize="small" />
              Deactivate
            </>
          ) : (
            <>
              <CheckCircle sx={{ mr: 1 }} fontSize="small" />
              Activate
            </>
          )}
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1 }} fontSize="small" />
          Delete Key
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete API Key"
        content={
          <Box>
            <Typography gutterBottom>
              Are you sure you want to delete "{apiKey.name}"?
            </Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>
              This action cannot be undone. Applications using this key will lose access immediately.
            </Alert>
          </Box>
        }
        confirmText="Delete"
        confirmColor="error"
      />
    </Box>
  );
};

export default APIKeyDetails;
