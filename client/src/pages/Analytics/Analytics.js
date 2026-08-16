import React, { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  Download,
  Refresh,
  TrendingUp,
  TrendingDown,
  Timeline,
  BarChart,
  PieChart
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement,
  BarElement
} from 'chart.js';
import dayjs from 'dayjs';
import { analyticsAPI, apiAPI } from '../../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  ArcElement,
  BarElement
);

const Analytics = () => {
  const [dateRange, setDateRange] = useState({
    start: dayjs().subtract(30, 'days'),
    end: dayjs()
  });
  const [selectedAPI, setSelectedAPI] = useState('all');
  const [apis, setApis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState({
    overview: {
      totalRequests: 0,
      successRate: 0,
      averageResponseTime: 0,
      errorRate: 0
    },
    charts: {
      requestsOverTime: {
        labels: [],
        datasets: []
      },
      statusCodes: {
        labels: [],
        datasets: []
      },
      topEndpoints: {
        labels: [],
        datasets: []
      },
      responseTimeDistribution: {
        labels: [],
        datasets: []
      }
    },
    topConsumers: [],
    recentErrors: []
  });

  useEffect(() => {
    fetchAPIs();
  }, []);

  useEffect(() => {
    fetchAnalyticsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedAPI]);
  const fetchAPIs = async () => {
    try {
      const response = await apiAPI.getAll();
      const apisList = response.data?.data?.apis || response.data?.apis || (Array.isArray(response.data?.data) ? response.data.data : []);
      setApis(Array.isArray(apisList) ? apisList : []);
    } catch (error) {
      console.error('Failed to fetch APIs:', error);
      setApis([]);
    }
  };

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const params = {
        startDate: dateRange.start.format('YYYY-MM-DD'),
        endDate: dateRange.end.format('YYYY-MM-DD'),
        apiId: selectedAPI !== 'all' ? selectedAPI : undefined
      };

      const response = await analyticsAPI.getOverview(params);
      const data = response.data?.data || response.data;
      if (data && typeof data === 'object') {
        setAnalyticsData(prev => ({
          ...prev,
          ...data,
          overview: { ...prev.overview, ...(data.overview || {}) },
          charts: { ...prev.charts, ...(data.charts || {}) },
          topConsumers: Array.isArray(data.topConsumers) ? data.topConsumers : prev.topConsumers,
          recentErrors: Array.isArray(data.recentErrors) ? data.recentErrors : prev.recentErrors
        }));
      }
    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
      // Mock data for development
      setAnalyticsData({
        overview: {
          totalRequests: 45672,
          successRate: 98.5,
          averageResponseTime: 245,
          errorRate: 1.5
        },
        charts: {
          requestsOverTime: {
            labels: generateDateLabels(),
            datasets: [{
              label: 'Requests',
              data: generateRandomData(30, 1000, 3000),
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.1)',
              tension: 0.4
            }]
          },
          statusCodes: {
            labels: ['2xx Success', '4xx Client Error', '5xx Server Error'],
            datasets: [{
              data: [85, 12, 3],
              backgroundColor: ['#4caf50', '#ff9800', '#f44336']
            }]
          },
          topEndpoints: {
            labels: ['/api/users', '/api/auth/login', '/api/products', '/api/orders', '/api/payments'],
            datasets: [{
              label: 'Requests',
              data: [8500, 6200, 4300, 3100, 2800],
              backgroundColor: 'rgba(54, 162, 235, 0.8)'
            }]
          },
          responseTimeDistribution: {
            labels: ['0-100ms', '100-500ms', '500ms-1s', '1s-5s', '5s+'],
            datasets: [{
              data: [25, 45, 20, 8, 2],
              backgroundColor: ['#4caf50', '#8bc34a', '#ffc107', '#ff9800', '#f44336']
            }]
          }
        },
        topConsumers: [
          { name: 'Mobile App v2.1', requests: 15420, percentage: 33.8 },
          { name: 'Web Dashboard', requests: 12890, percentage: 28.2 },
          { name: 'Third-party Integration', requests: 8750, percentage: 19.2 },
          { name: 'Internal Services', requests: 5890, percentage: 12.9 },
          { name: 'API Testing', requests: 2722, percentage: 5.9 }
        ],
        recentErrors: [
          {
            timestamp: dayjs().subtract(2, 'hours').format('YYYY-MM-DD HH:mm:ss'),
            endpoint: '/api/users/profile',
            status: 500,
            error: 'Internal Server Error',
            count: 3
          },
          {
            timestamp: dayjs().subtract(4, 'hours').format('YYYY-MM-DD HH:mm:ss'),
            endpoint: '/api/auth/refresh',
            status: 401,
            error: 'Unauthorized',
            count: 7
          },
          {
            timestamp: dayjs().subtract(6, 'hours').format('YYYY-MM-DD HH:mm:ss'),
            endpoint: '/api/products/search',
            status: 429,
            error: 'Rate Limit Exceeded',
            count: 12
          }
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  const generateDateLabels = () => {
    const labels = [];
    const start = dateRange.start;
    const end = dateRange.end;
    let current = start;

    while (current.isBefore(end) || current.isSame(end)) {
      labels.push(current.format('MMM DD'));
      current = current.add(1, 'day');
    }

    return labels;
  };

  const generateRandomData = (count, min, max) => {
    return Array.from({ length: count }, () => 
      Math.floor(Math.random() * (max - min + 1)) + min
    );
  };

  const handleExportData = () => {
    // Implementation for exporting analytics data
    console.log('Exporting analytics data...');
  };

  const MetricCard = ({ title, value, trend, icon, color = 'primary' }) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="h6">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
            {trend && (
              <Box display="flex" alignItems="center" mt={1}>
                {trend > 0 ? (
                  <TrendingUp color="success" fontSize="small" />
                ) : (
                  <TrendingDown color="error" fontSize="small" />
                )}
                <Typography
                  variant="body2"
                  color={trend > 0 ? 'success.main' : 'error.main'}
                  sx={{ ml: 0.5 }}
                >
                  {Math.abs(trend)}%
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}.light`,
              borderRadius: '50%',
              width: 60,
              height: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          Analytics Dashboard
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleExportData}
          >
            Export Data
          </Button>
          <Button
            variant="contained"
            startIcon={<Refresh />}
            onClick={fetchAnalyticsData}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>API</InputLabel>
              <Select
                value={selectedAPI}
                label="API"
                onChange={(e) => setSelectedAPI(e.target.value)}
              >
                <MenuItem value="all">All APIs</MenuItem>
                {(Array.isArray(apis) ? apis : []).map((api) => (
                  <MenuItem key={api.id} value={api.id}>
                    {api.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Start Date"
                value={dateRange.start}
                onChange={(newValue) => setDateRange({ ...dateRange, start: newValue })}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="End Date"
                value={dateRange.end}
                onChange={(newValue) => setDateRange({ ...dateRange, end: newValue })}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
      </Paper>

      {/* Overview Metrics */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Requests"
            value={analyticsData.overview.totalRequests.toLocaleString()}
            trend={5.2}
            icon={<Timeline color="primary" />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Success Rate"
            value={`${analyticsData.overview.successRate}%`}
            trend={0.8}
            icon={<TrendingUp color="success" />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Response Time"
            value={`${analyticsData.overview.averageResponseTime}ms`}
            trend={-2.1}
            icon={<BarChart color="info" />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Error Rate"
            value={`${analyticsData.overview.errorRate}%`}
            trend={-0.3}
            icon={<PieChart color="warning" />}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Requests Over Time
            </Typography>
            <Line data={analyticsData.charts.requestsOverTime} options={chartOptions} />
          </Paper>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Status Code Distribution
            </Typography>
            <Doughnut data={analyticsData.charts.statusCodes} />
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Top Endpoints
            </Typography>
            <Bar data={analyticsData.charts.topEndpoints} options={chartOptions} />
          </Paper>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Response Time Distribution
            </Typography>
            <Doughnut data={analyticsData.charts.responseTimeDistribution} />
          </Paper>
        </Grid>
      </Grid>

      {/* Top Consumers and Recent Errors */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Top API Consumers
            </Typography>
            {(Array.isArray(analyticsData.topConsumers) ? analyticsData.topConsumers : []).map((consumer, index) => (
              <Box key={index} display="flex" alignItems="center" justifyContent="space-between" py={1}>
                <Typography variant="body2">{consumer.name}</Typography>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body2" color="textSecondary">
                    {consumer.requests.toLocaleString()}
                  </Typography>
                  <Chip
                    label={`${consumer.percentage}%`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Box>
              </Box>
            ))}
          </Paper>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Errors
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Endpoint</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(Array.isArray(analyticsData.recentErrors) ? analyticsData.recentErrors : []).map((error, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Typography variant="body2">
                          {dayjs(error.timestamp).format('MMM DD HH:mm')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {error.endpoint}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={error.status}
                          size="small"
                          color={error.status >= 500 ? 'error' : 'warning'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{error.count}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Analytics;
