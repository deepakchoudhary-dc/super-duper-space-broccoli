import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
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
  MenuItem as MenuItemComponent,
  CircularProgress,
  Paper
} from '@mui/material';
import {
  Add,
  MoreVert,
  Edit,
  Delete,
  Visibility,
  VisibilityOff,
  ContentCopy,
  FilterList,
  Search,
  Key,
  Security,
  Schedule,
  TrendingUp
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import copy from 'copy-to-clipboard';
import dayjs from 'dayjs';
import api, { keyAPI, apiAPI } from '../../services/api';

const APIKeys = () => {
  const navigate = useNavigate();
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, key: null });
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [showKey, setShowKey] = useState({});
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    api: 'all'
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [apis, setApis] = useState([]);

  useEffect(() => {
    fetchAPIKeys();
    fetchAPIs();
  }, []);  const fetchAPIKeys = async () => {
    try {
      setLoading(true);
      const response = await keyAPI.getAll();
      setApiKeys(response.data.data.keys || []);    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      setApiKeys([]);
    } finally {
      setLoading(false);
    }
  };
  const fetchAPIs = async () => {
    try {
      const response = await apiAPI.getAll();
      setApis(response.data.data.apis || []);
    } catch (error) {
      console.error('Failed to fetch APIs:', error);
      setApis([]);
    }
  };

  const handleDeleteKey = async () => {
    try {
      await keyAPI.delete(deleteDialog.key.id);
      setApiKeys(keys => keys.filter(k => k.id !== deleteDialog.key.id));
      toast.success('API key deleted successfully');
    } catch (error) {
      toast.error('Failed to delete API key');
    } finally {
      setDeleteDialog({ open: false, key: null });
    }
  };

  const handleToggleKeyStatus = async (keyId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await keyAPI.update(keyId, { status: newStatus });
      
      setApiKeys(keys => keys.map(k => 
        k.id === keyId ? { ...k, status: newStatus } : k
      ));
      
      toast.success(`API key ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      toast.error('Failed to update API key status');
    }
  };

  const handleCopyKey = (key) => {
    copy(key);
    toast.success('API key copied to clipboard');
  };

  const toggleShowKey = (keyId) => {
    setShowKey(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  const maskKey = (key) => {
    if (!key) return '';
    const visible = key.slice(0, 8);
    const masked = '•'.repeat(key.length - 12);
    const ending = key.slice(-4);
    return `${visible}${masked}${ending}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'expired': return 'error';
      default: return 'default';
    }
  };

  const handleMenuClick = (event, key) => {
    setAnchorEl(event.currentTarget);
    setSelectedKey(key);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedKey(null);
  };

  const filteredKeys = apiKeys.filter(key => {
    if (filters.search && !key.name.toLowerCase().includes(filters.search.toLowerCase()) &&
        !key.apiName.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.status !== 'all' && key.status !== filters.status) {
      return false;
    }
    if (filters.api !== 'all' && key.apiId !== filters.api) {
      return false;
    }
    return true;
  });

  const paginatedKeys = filteredKeys.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const getUsagePercentage = (used, limit) => {
    return limit > 0 ? (used / limit) * 100 : 0;
  };

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'error';
    if (percentage >= 70) return 'warning';
    return 'success';
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          API Keys
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/keys/create')}
        >
          Create API Key
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Keys
                  </Typography>
                  <Typography variant="h4">
                    {apiKeys.length}
                  </Typography>
                </Box>
                <Key color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Active Keys
                  </Typography>
                  <Typography variant="h4">
                    {apiKeys.filter(k => k.status === 'active').length}
                  </Typography>
                </Box>
                <Security color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Requests
                  </Typography>
                  <Typography variant="h4">
                    {apiKeys.reduce((sum, key) => sum + key.requestsUsed, 0).toLocaleString()}
                  </Typography>
                </Box>
                <TrendingUp color="info" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Expiring Soon
                  </Typography>
                  <Typography variant="h4">
                    {apiKeys.filter(k => k.expiresAt && dayjs(k.expiresAt).diff(dayjs(), 'days') <= 30).length}
                  </Typography>
                </Box>
                <Schedule color="warning" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Search keys..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              InputProps={{
                startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                label="Status"
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
                <MenuItem value="expired">Expired</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>API</InputLabel>
              <Select
                value={filters.api}
                label="API"
                onChange={(e) => setFilters({ ...filters, api: e.target.value })}
              >
                <MenuItem value="all">All APIs</MenuItem>
                {apis.map(api => (
                  <MenuItem key={api.id} value={api.id}>
                    {api.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* API Keys Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>API</TableCell>
                <TableCell>Key</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Usage</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : paginatedKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="textSecondary">
                      No API keys found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedKeys.map((key) => {
                  const usagePercentage = getUsagePercentage(key.requestsUsed, key.rateLimit);
                  return (
                    <TableRow key={key.id}>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {key.name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            Created {dayjs(key.createdAt).format('MMM DD, YYYY')}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {key.apiName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {showKey[key.id] ? key.key : maskKey(key.key)}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => toggleShowKey(key.id)}
                          >
                            {showKey[key.id] ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleCopyKey(key.key)}
                          >
                            <ContentCopy />
                          </IconButton>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={key.status}
                          color={getStatusColor(key.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">
                            {key.requestsUsed.toLocaleString()} / {key.rateLimit.toLocaleString()}
                          </Typography>
                          <Box sx={{ width: 100, mt: 0.5 }}>
                            <Box
                              sx={{
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: 'grey.300',
                                position: 'relative'
                              }}
                            >
                              <Box
                                sx={{
                                  height: '100%',
                                  borderRadius: 2,
                                  backgroundColor: `${getUsageColor(usagePercentage)}.main`,
                                  width: `${Math.min(usagePercentage, 100)}%`
                                }}
                              />
                            </Box>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {key.lastUsed ? dayjs(key.lastUsed).fromNow() : 'Never'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          onClick={(e) => handleMenuClick(e, key)}
                        >
                          <MoreVert />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredKeys.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent
          onClick={() => {
            navigate(`/keys/${selectedKey?.id}`);
            handleMenuClose();
          }}
        >
          <Visibility sx={{ mr: 1 }} />
          View Details
        </MenuItemComponent>
        <MenuItemComponent
          onClick={() => {
            navigate(`/keys/${selectedKey?.id}/edit`);
            handleMenuClose();
          }}
        >
          <Edit sx={{ mr: 1 }} />
          Edit
        </MenuItemComponent>
        <MenuItemComponent
          onClick={() => {
            handleToggleKeyStatus(selectedKey?.id, selectedKey?.status);
            handleMenuClose();
          }}
        >
          <Security sx={{ mr: 1 }} />
          {selectedKey?.status === 'active' ? 'Deactivate' : 'Activate'}
        </MenuItemComponent>
        <MenuItemComponent
          onClick={() => {
            setDeleteDialog({ open: true, key: selectedKey });
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <Delete sx={{ mr: 1 }} />
          Delete
        </MenuItemComponent>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, key: null })}
      >
        <DialogTitle>Delete API Key</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the API key "{deleteDialog.key?.name}"? 
            This action cannot be undone and will immediately revoke access for any applications using this key.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, key: null })}>
            Cancel
          </Button>
          <Button onClick={handleDeleteKey} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default APIKeys;
