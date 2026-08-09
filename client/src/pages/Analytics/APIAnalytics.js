import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
  Divider,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  ArrowBack,
  Refresh,
  Download,
  TrendingUp,
  TrendingDown,
  Api as ApiIcon,
  Speed,
  CheckCircle,
  Error,
  Warning,
  Timeline
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { toast } from 'react-toastify';
import apiService from '../../services/api';
import MetricCard from '../../components/common/MetricCard';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const APIAnalytics = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [api, setApi] = useState(null);
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchAPIDetails();
      fetchAnalytics();
    }
  }, [id, timeRange]);

  const fetchAPIDetails = async () => {
    try {
      const response = await apiService.get(`/api/apis/${id}`);
      const apiData = response.data?.data?.api || response.data?.data || response.data;
      setApi(apiData);
    } catch (error) {
      console.error('Error fetching API details:', error);
      toast.error('Failed to load API details');
      navigate('/analytics');
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiService.get(`/apis/${id}/analytics?timeRange=${timeRange}`);
      
      // Mock analytics data
      const mockAnalytics = {
        totalRequests: 15420,
        successRate: 98.5,
        avgResponseTime: 245,
        errorRate: 1.5,
        uniqueUsers: 1247,
        bandwidth: '2.3 GB',
        requestsOverTime: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [{
            label: 'Requests',
            data: [2100, 2300, 1800, 2500, 2200, 1900, 2600],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            fill: true,
            tension: 0.4
          }]
        },
        responseTimeOverTime: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [{
            label: 'Avg Response Time (ms)',
            data: [230, 250, 240, 260, 245, 235, 255],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            fill: true,
            tension: 0.4
          }]
        },
        statusCodeDistribution: {
          labels: ['2xx Success', '4xx Client Error', '5xx Server Error'],
          datasets: [{
            data: [98.5, 1.2, 0.3],
            backgroundColor: [
              'rgba(75, 192, 192, 0.8)',
              'rgba(255, 206, 86, 0.8)',
              'rgba(255, 99, 132, 0.8)'
            ],
            borderColor: [
              'rgba(75, 192, 192, 1)',
              'rgba(255, 206, 86, 1)',
              'rgba(255, 99, 132, 1)'
            ],
            borderWidth: 1
          }]
        },
        topEndpoints: [
          { endpoint: '/api/v1/users', requests: 4520, avgResponseTime: 180 },
          { endpoint: '/api/v1/orders', requests: 3240, avgResponseTime: 320 },
          { endpoint: '/api/v1/products', requests: 2890, avgResponseTime: 150 },
          { endpoint: '/api/v1/auth/login', requests: 2100, avgResponseTime: 420 },
          { endpoint: '/api/v1/dashboard', requests: 1870, avgResponseTime: 280 }
        ],
        recentErrors: [
          { timestamp: new Date().toISOString(), endpoint: '/api/v1/users/123', status: 404, message: 'User not found' },
          { timestamp: new Date(Date.now() - 3600000).toISOString(), endpoint: '/api/v1/orders', status: 500, message: 'Internal server error' },
          { timestamp: new Date(Date.now() - 7200000).toISOString(), endpoint: '/api/v1/auth/login', status: 401, message: 'Invalid credentials' }
        ]
      };
      
      setAnalytics(mockAnalytics);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
    toast.success('Analytics data refreshed');
  };

  const handleExport = () => {
    toast.info('Export functionality will be implemented soon');
  };

  const timeRangeOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' }
  ];

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
    },
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading analytics...</Typography>
      </Box>
    );
  }

  if (!api) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="text.secondary">
          API not found
        </Typography>
        <Button onClick={() => navigate('/analytics')} sx={{ mt: 2 }}>
          Back to Analytics
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center">
          <IconButton onClick={() => navigate('/analytics')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box>
            <Typography variant="h4" component="h1">
              {api.name} Analytics
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Detailed performance metrics and usage statistics
            </Typography>
          </Box>
        </Box>
        
        <Box display="flex" alignItems="center" gap={2}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              {timeRangeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <IconButton
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh Data"
          >
            <Refresh />
          </IconButton>
          
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleExport}
          >
            Export
          </Button>
        </Box>
      </Box>

      {/* Key Metrics */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Requests"
            value={analytics.totalRequests?.toLocaleString() || '0'}
            icon={<ApiIcon />}
            color="primary"
            trend={{
              value: 12.5,
              direction: 'up',
              label: 'vs last period'
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Success Rate"
            value={`${analytics.successRate || 0}%`}
            icon={<CheckCircle />}
            color="success"
            trend={{
              value: 2.1,
              direction: 'up',
              label: 'vs last period'
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Response Time"
            value={`${analytics.avgResponseTime || 0}ms`}
            icon={<Speed />}
            color="warning"
            trend={{
              value: 8.3,
              direction: 'down',
              label: 'vs last period'
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Unique Users"
            value={analytics.uniqueUsers?.toLocaleString() || '0'}
            icon={<TrendingUp />}
            color="info"
            trend={{
              value: 15.7,
              direction: 'up',
              label: 'vs last period'
            }}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Request Volume Chart */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Request Volume Over Time
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line data={analytics.requestsOverTime} options={chartOptions} />
            </Box>
          </Paper>
        </Grid>

        {/* Status Code Distribution */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Response Status Distribution
            </Typography>
            <Box sx={{ height: 300 }}>
              <Doughnut data={analytics.statusCodeDistribution} options={doughnutOptions} />
            </Box>
          </Paper>
        </Grid>

        {/* Response Time Chart */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Average Response Time
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line data={analytics.responseTimeOverTime} options={chartOptions} />
            </Box>
          </Paper>
        </Grid>

        {/* Top Endpoints */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Top Endpoints
            </Typography>
            <List>
              {(Array.isArray(analytics.topEndpoints) ? analytics.topEndpoints : []).map((endpoint, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2" noWrap>
                          {endpoint.endpoint}
                        </Typography>
                        <Chip
                          label={endpoint.requests.toLocaleString()}
                          size="small"
                          color="primary"
                        />
                      </Box>
                    }
                    secondary={`Avg: ${endpoint.avgResponseTime}ms`}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Recent Errors */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Errors
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {Array.isArray(analytics.recentErrors) && analytics.recentErrors.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Timestamp</TableCell>
                      <TableCell>Endpoint</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Message</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analytics.recentErrors.map((error, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {new Date(error.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {error.endpoint}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={error.status}
                            color="error"
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{error.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="success">
                No recent errors found. Your API is performing well!
              </Alert>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default APIAnalytics;
