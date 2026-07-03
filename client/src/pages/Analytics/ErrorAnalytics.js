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
  TableRow,
  TablePagination,
  Collapse,
  IconButton,
  Alert,
  Tooltip,
  TextField
} from '@mui/material';
import {
  Error,
  Warning,
  ExpandMore,
  ExpandLess,
  Search,
  FilterList,
  Download,
  Refresh,
  Timeline,
  BugReport,
  Code,
  AccessTime
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
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
import api from '../../services/api';

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

const ErrorAnalytics = () => {
  const [dateRange, setDateRange] = useState({
    start: dayjs().subtract(7, 'days'),
    end: dayjs()
  });
  const [filters, setFilters] = useState({
    statusCode: 'all',
    endpoint: '',
    severity: 'all'
  });
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const [errorData, setErrorData] = useState({
    summary: {
      totalErrors: 0,
      errorRate: 0,
      avgResolutionTime: 0,
      criticalErrors: 0
    },
    charts: {
      errorTrend: {
        labels: [],
        datasets: []
      },
      errorsByType: {
        labels: [],
        datasets: []
      },
      errorsByEndpoint: {
        labels: [],
        datasets: []
      }
    },
    errorLogs: [],
    topErrors: []
  });

  useEffect(() => {
    fetchErrorData();
  }, [dateRange, filters]);

  const fetchErrorData = async () => {
    setLoading(true);
    try {
      const params = {
        startDate: dateRange.start.format('YYYY-MM-DD HH:mm:ss'),
        endDate: dateRange.end.format('YYYY-MM-DD HH:mm:ss'),
        ...filters
      };

      const response = await api.get('/api/analytics/errors', { params });
      setErrorData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch error data:', error);
      // Mock data for development
      setErrorData({
        summary: {
          totalErrors: 1247,
          errorRate: 2.3,
          avgResolutionTime: 45,
          criticalErrors: 23
        },
        charts: {
          errorTrend: {
            labels: generateDateLabels(),
            datasets: [{
              label: '4xx Errors',
              data: generateRandomData(7, 10, 50),
              borderColor: 'rgb(255, 152, 0)',
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              tension: 0.4
            }, {
              label: '5xx Errors',
              data: generateRandomData(7, 5, 25),
              borderColor: 'rgb(244, 67, 54)',
              backgroundColor: 'rgba(244, 67, 54, 0.1)',
              tension: 0.4
            }]
          },
          errorsByType: {
            labels: ['404 Not Found', '500 Internal Server Error', '401 Unauthorized', '429 Rate Limited', '403 Forbidden'],
            datasets: [{
              data: [45, 25, 15, 10, 5],
              backgroundColor: ['#ff9800', '#f44336', '#e91e63', '#9c27b0', '#673ab7']
            }]
          },
          errorsByEndpoint: {
            labels: ['/api/users', '/api/auth/login', '/api/products', '/api/orders', '/api/payments'],
            datasets: [{
              label: 'Error Count',
              data: [120, 89, 67, 45, 23],
              backgroundColor: 'rgba(244, 67, 54, 0.8)'
            }]
          }
        },
        errorLogs: generateMockErrorLogs(),
        topErrors: [
          {
            error: 'Database connection timeout',
            count: 156,
            firstSeen: dayjs().subtract(2, 'days'),
            lastSeen: dayjs().subtract(1, 'hour'),
            severity: 'critical',
            status: 'open'
          },
          {
            error: 'Invalid JWT token',
            count: 89,
            firstSeen: dayjs().subtract(1, 'day'),
            lastSeen: dayjs().subtract(30, 'minutes'),
            severity: 'high',
            status: 'investigating'
          },
          {
            error: 'Rate limit exceeded',
            count: 67,
            firstSeen: dayjs().subtract(6, 'hours'),
            lastSeen: dayjs().subtract(5, 'minutes'),
            severity: 'medium',
            status: 'resolved'
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

  const generateMockErrorLogs = () => {
    const errors = [
      'Internal Server Error',
      'Database Connection Failed',
      'Authentication Failed',
      'Rate Limit Exceeded',
      'Validation Error',
      'File Not Found',
      'Unauthorized Access',
      'Service Unavailable'
    ];

    const endpoints = [
      '/api/users/profile',
      '/api/auth/login',
      '/api/products/search',
      '/api/orders/create',
      '/api/payments/process'
    ];

    const methods = ['GET', 'POST', 'PUT', 'DELETE'];

    return Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      timestamp: dayjs().subtract(Math.floor(Math.random() * 168), 'hours'),
      statusCode: Math.random() > 0.6 ? 500 : (Math.random() > 0.5 ? 404 : 401),
      error: errors[Math.floor(Math.random() * errors.length)],
      endpoint: endpoints[Math.floor(Math.random() * endpoints.length)],
      method: methods[Math.floor(Math.random() * methods.length)],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
      userId: Math.random() > 0.3 ? `user_${Math.floor(Math.random() * 1000)}` : null,
      stackTrace: `Error: ${errors[Math.floor(Math.random() * errors.length)]}\n    at Controller.handleRequest (/app/controllers/base.js:45:12)\n    at Router.dispatch (/app/routes/index.js:23:8)`,
      resolved: Math.random() > 0.7,
      severity: Math.random() > 0.8 ? 'critical' : (Math.random() > 0.6 ? 'high' : 'medium')
    }));
  };

  const handleExpandRow = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'default';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'resolved': return 'success';
      case 'investigating': return 'warning';
      case 'open': return 'error';
      default: return 'default';
    }
  };

  const MetricCard = ({ title, value, subtitle, icon, color = 'primary' }) => (
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
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
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

  const filteredErrorLogs = errorData.errorLogs.filter(log => {
    if (filters.statusCode !== 'all' && log.statusCode.toString() !== filters.statusCode) {
      return false;
    }
    if (filters.endpoint && !log.endpoint.toLowerCase().includes(filters.endpoint.toLowerCase())) {
      return false;
    }
    if (filters.severity !== 'all' && log.severity !== filters.severity) {
      return false;
    }
    return true;
  });

  const paginatedErrorLogs = filteredErrorLogs.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          Error Analytics
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={() => console.log('Export error data')}
          >
            Export Errors
          </Button>
          <Button
            variant="contained"
            startIcon={<Refresh />}
            onClick={fetchErrorData}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={2}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DateTimePicker
                label="Start Date"
                value={dateRange.start}
                onChange={(newValue) => setDateRange({ ...dateRange, start: newValue })}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={2}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DateTimePicker
                label="End Date"
                value={dateRange.end}
                onChange={(newValue) => setDateRange({ ...dateRange, end: newValue })}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status Code</InputLabel>
              <Select
                value={filters.statusCode}
                label="Status Code"
                onChange={(e) => setFilters({ ...filters, statusCode: e.target.value })}
              >
                <MenuItem value="all">All Status Codes</MenuItem>
                <MenuItem value="400">400 Bad Request</MenuItem>
                <MenuItem value="401">401 Unauthorized</MenuItem>
                <MenuItem value="403">403 Forbidden</MenuItem>
                <MenuItem value="404">404 Not Found</MenuItem>
                <MenuItem value="429">429 Rate Limited</MenuItem>
                <MenuItem value="500">500 Internal Server Error</MenuItem>
                <MenuItem value="502">502 Bad Gateway</MenuItem>
                <MenuItem value="503">503 Service Unavailable</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Severity</InputLabel>
              <Select
                value={filters.severity}
                label="Severity"
                onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
              >
                <MenuItem value="all">All Severities</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Search Endpoint"
              value={filters.endpoint}
              onChange={(e) => setFilters({ ...filters, endpoint: e.target.value })}
              InputProps={{
                startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Errors"
            value={errorData.summary.totalErrors.toLocaleString()}
            subtitle="Last 7 days"
            icon={<Error color="error" />}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Error Rate"
            value={`${errorData.summary.errorRate}%`}
            subtitle="Of total requests"
            icon={<Timeline color="warning" />}
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Resolution Time"
            value={`${errorData.summary.avgResolutionTime}min`}
            subtitle="Time to resolve"
            icon={<AccessTime color="info" />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Critical Errors"
            value={errorData.summary.criticalErrors}
            subtitle="Needs immediate attention"
            icon={<BugReport color="error" />}
            color="error"
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Error Trend Over Time
            </Typography>
            <Line data={errorData.charts.errorTrend} options={chartOptions} />
          </Paper>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Error Types Distribution
            </Typography>
            <Doughnut data={errorData.charts.errorsByType} />
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Errors by Endpoint
            </Typography>
            <Bar data={errorData.charts.errorsByEndpoint} options={chartOptions} />
          </Paper>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Top Error Patterns
            </Typography>
            {errorData.topErrors.map((error, index) => (
              <Box key={index} display="flex" alignItems="center" justifyContent="space-between" py={1}>
                <Box flex={1}>
                  <Typography variant="body2" fontWeight="bold">
                    {error.error}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    First seen: {error.firstSeen.format('MMM DD, HH:mm')}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    label={error.count}
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                  <Chip
                    label={error.severity}
                    size="small"
                    color={getSeverityColor(error.severity)}
                  />
                  <Chip
                    label={error.status}
                    size="small"
                    color={getStatusColor(error.status)}
                  />
                </Box>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>

      {/* Error Logs Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            Error Logs ({filteredErrorLogs.length})
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Timestamp</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Error</TableCell>
                <TableCell>Endpoint</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedErrorLogs.map((log) => (
                <React.Fragment key={log.id}>
                  <TableRow>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleExpandRow(log.id)}
                      >
                        {expandedRows[log.id] ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {log.timestamp.format('MMM DD, HH:mm:ss')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.statusCode}
                        size="small"
                        color={log.statusCode >= 500 ? 'error' : 'warning'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{log.error}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {log.method} {log.endpoint}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {log.userId || 'Anonymous'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.severity}
                        size="small"
                        color={getSeverityColor(log.severity)}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.resolved ? 'Resolved' : 'Open'}
                        size="small"
                        color={log.resolved ? 'success' : 'error'}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                      <Collapse in={expandedRows[log.id]} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                          <Typography variant="h6" gutterBottom component="div">
                            Error Details
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Typography variant="body2" color="textSecondary">
                                <strong>IP Address:</strong> {log.ip}
                              </Typography>
                              <Typography variant="body2" color="textSecondary">
                                <strong>User Agent:</strong> {log.userAgent}
                              </Typography>
                            </Grid>
                            <Grid item xs={12}>
                              <Typography variant="body2" color="textSecondary" gutterBottom>
                                <strong>Stack Trace:</strong>
                              </Typography>
                              <Box
                                sx={{
                                  backgroundColor: 'grey.100',
                                  p: 2,
                                  borderRadius: 1,
                                  fontFamily: 'monospace',
                                  fontSize: '0.8rem',
                                  overflow: 'auto'
                                }}
                              >
                                <pre>{log.stackTrace}</pre>
                              </Box>
                            </Grid>
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredErrorLogs.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>
    </Box>
  );
};

export default ErrorAnalytics;
