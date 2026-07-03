import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText,
  Switch,
  FormControlLabel,
  Grid,
  Card,
  CardContent,
  TablePagination
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  MoreVert,
  Visibility,
  Settings,
  PlayArrow,
  Pause,
  ContentCopy,
  Api as ApiIcon,
  Speed,
  Insights
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { apiAPI } from '../../services/api';

const APIs = () => {
  const navigate = useNavigate();  const [apis, setApisState] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedApi, setSelectedApi] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    baseUrl: '',
    version: '1.0.0',
    category: 'REST',
    isPublic: false,
    documentation: '',
    authRequired: true,
    rateLimit: 1000
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchApis();
  }, []);  const fetchApis = async () => {
    try {
      const response = await apiAPI.getAll();
      setApisState(response.data.data.apis || []);
    } catch (error) {
      setError('Failed to fetch APIs');
      console.error('Error fetching APIs:', error);
      // Use mock data on error
      setApisState([
        { id: 1, name: 'User API', description: 'User management API', status: 'active' },
        { id: 2, name: 'Payment API', description: 'Payment processing API', status: 'active' },
        { id: 3, name: 'Analytics API', description: 'Analytics and reporting API', status: 'inactive' }
      ]);
    }
  };

  const handleOpenDialog = (api = null) => {
    if (api) {
      setSelectedApi(api);
      setFormData({
        name: api.name,
        description: api.description,
        baseUrl: api.baseUrl,
        version: api.version,
        category: api.category,
        isPublic: api.isPublic,
        documentation: api.documentation || '',
        authRequired: api.authRequired,
        rateLimit: api.rateLimit
      });
    } else {
      setSelectedApi(null);
      setFormData({
        name: '',
        description: '',
        baseUrl: '',
        version: '1.0.0',
        category: 'REST',
        isPublic: false,
        documentation: '',
        authRequired: true,
        rateLimit: 1000
      });
    }
    setOpenDialog(true);
    setError('');
    setSuccess('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedApi(null);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async () => {
    try {      if (selectedApi) {
        await apiAPI.update(selectedApi.id, formData);
        setSuccess('API updated successfully');
      } else {
        await apiAPI.create(formData);
        setSuccess('API created successfully');
      }
      
      await fetchApis();
      setTimeout(() => {
        handleCloseDialog();
      }, 1500);
    } catch (error) {
      setError(error.response?.data?.message || 'Operation failed');
    }
  };
  const handleDelete = async (api) => {
    if (window.confirm(`Are you sure you want to delete "${api.name}"?`)) {
      try {
        await apiAPI.delete(api.id);
        await fetchApis();
        setSuccess('API deleted successfully');
        setTimeout(() => setSuccess(''), 3000);
      } catch (error) {
        setError('Failed to delete API');
      }
    }
  };

  const handleToggleStatus = async (api) => {    try {
      await apiAPI.update(api.id, { 
        ...api, 
        status: api.status === 'active' ? 'inactive' : 'active' 
      });
      await fetchApis();
    } catch (error) {
      setError('Failed to update API status');
    }
  };

  const handleMenuOpen = (event, api) => {
    setMenuAnchor(event.currentTarget);
    setSelectedApi(api);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedApi(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'deprecated': return 'warning';
      case 'maintenance': return 'info';
      default: return 'default';
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'REST': return <ApiIcon />;
      case 'GraphQL': return <Insights />;
      case 'WebSocket': return <Speed />;
      default: return <ApiIcon />;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            API Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Register and manage your APIs with comprehensive security controls
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
        >
          Register API
        </Button>
      </Box>

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total APIs
              </Typography>
              <Typography variant="h4">
                {apis.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active APIs
              </Typography>
              <Typography variant="h4">
                {apis.filter(api => api.status === 'active').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Public APIs
              </Typography>
              <Typography variant="h4">
                {apis.filter(api => api.isPublic).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                This Month
              </Typography>
              <Typography variant="h4">
                +{apis.filter(api => {
                  const created = new Date(api.createdAt);
                  const now = new Date();
                  return created.getMonth() === now.getMonth() && 
                         created.getFullYear() === now.getFullYear();
                }).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* APIs Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>API</TableCell>
                <TableCell>Base URL</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Requests</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {apis
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((api) => (
                <TableRow key={api.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getCategoryIcon(api.category)}
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          {api.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {api.description}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {api.baseUrl}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={api.version} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={api.category} 
                      size="small" 
                      color="primary" 
                      variant="outlined" 
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={api.status}
                      size="small"
                      color={getStatusColor(api.status)}
                      variant="filled"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {(api.requestCount || 0).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(api.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Details">
                      <IconButton 
                        size="small"
                        onClick={() => navigate(`/apis/${api.id}`)}
                      >
                        <Visibility />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton 
                        size="small"
                        onClick={() => handleOpenDialog(api)}
                      >
                        <Edit />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="More Actions">
                      <IconButton 
                        size="small"
                        onClick={(e) => handleMenuOpen(e, api)}
                      >
                        <MoreVert />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={apis.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          handleToggleStatus(selectedApi);
          handleMenuClose();
        }}>
          <ListItemIcon>
            {selectedApi?.status === 'active' ? <Pause /> : <PlayArrow />}
          </ListItemIcon>
          <ListItemText>
            {selectedApi?.status === 'active' ? 'Deactivate' : 'Activate'}
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          navigator.clipboard.writeText(selectedApi?.baseUrl);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <ContentCopy />
          </ListItemIcon>
          <ListItemText>Copy URL</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          navigate(`/apis/${selectedApi?.id}`);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <Settings />
          </ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>
        <MenuItem 
          onClick={() => {
            handleDelete(selectedApi);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <Delete color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedApi ? 'Edit API' : 'Register New API'}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="API Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Version"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Base URL"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                required
                placeholder="https://api.example.com"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  label="Category"
                >
                  <MenuItem value="REST">REST API</MenuItem>
                  <MenuItem value="GraphQL">GraphQL</MenuItem>
                  <MenuItem value="WebSocket">WebSocket</MenuItem>
                  <MenuItem value="gRPC">gRPC</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Rate Limit (requests/hour)"
                type="number"
                value={formData.rateLimit}
                onChange={(e) => setFormData({ ...formData, rateLimit: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Documentation URL"
                value={formData.documentation}
                onChange={(e) => setFormData({ ...formData, documentation: e.target.value })}
                placeholder="https://docs.example.com"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                  />
                }
                label="Public API"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.authRequired}
                    onChange={(e) => setFormData({ ...formData, authRequired: e.target.checked })}
                  />
                }
                label="Authentication Required"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {selectedApi ? 'Update' : 'Register'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default APIs;
