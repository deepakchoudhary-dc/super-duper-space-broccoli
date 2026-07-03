import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Badge,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Timeline,
  Speed,
  Error,
  CheckCircle,
  Warning,
  Refresh,
  Pause,
  PlayArrow,
  Clear
} from '@mui/icons-material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend
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
  Legend
);

const RealTimeAnalytics = () => {
  const [isLive, setIsLive] = useState(true);
  const [realTimeData, setRealTimeData] = useState({
    currentRPS: 0,
    averageResponseTime: 0,
    activeConnections: 0,
    errorRate: 0
  });
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [{
      label: 'Requests per Second',
      data: [],
      borderColor: 'rgb(75, 192, 192)',
      backgroundColor: 'rgba(75, 192, 192, 0.1)',
      tension: 0.4
    }]
  });
  const [recentRequests, setRecentRequests] = useState([]);
  const [recentErrors, setRecentErrors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  const intervalRef = useRef(null);
  const maxDataPoints = 30;

  useEffect(() => {
    if (isLive) {
      startRealTimeUpdates();
    } else {
      stopRealTimeUpdates();
    }

    return () => stopRealTimeUpdates();
  }, [isLive]);

  const startRealTimeUpdates = () => {
    intervalRef.current = setInterval(fetchRealTimeData, 2000); // Update every 2 seconds
    fetchRealTimeData(); // Initial fetch
  };

  const stopRealTimeUpdates = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const fetchRealTimeData = async () => {
    try {
      // In a real application, this would fetch from a WebSocket or real-time API
      const mockData = generateMockRealTimeData();
      
      setRealTimeData(mockData.metrics);
      updateChartData(mockData.metrics.currentRPS);
      setRecentRequests(mockData.recentRequests);
      setRecentErrors(mockData.recentErrors);
      setAlerts(mockData.alerts);
    } catch (error) {
      console.error('Failed to fetch real-time data:', error);
    }
  };

  const updateChartData = (newRPS) => {
    setChartData(prevData => {
      const newLabels = [...prevData.labels, dayjs().format('HH:mm:ss')];
      const newData = [...prevData.datasets[0].data, newRPS];

      // Keep only the last maxDataPoints
      if (newLabels.length > maxDataPoints) {
        newLabels.shift();
        newData.shift();
      }

      return {
        labels: newLabels,
        datasets: [{
          ...prevData.datasets[0],
          data: newData
        }]
      };
    });
  };

  const generateMockRealTimeData = () => {
    // Simulate real-time data
    const baseRPS = 50;
    const currentRPS = Math.max(0, baseRPS + Math.random() * 30 - 15);
    const responseTime = 150 + Math.random() * 100;
    const activeConnections = 45 + Math.floor(Math.random() * 20);
    const errorRate = Math.random() * 2;

    return {
      metrics: {
        currentRPS: Math.round(currentRPS),
        averageResponseTime: Math.round(responseTime),
        activeConnections,
        errorRate: Math.round(errorRate * 10) / 10
      },
      recentRequests: generateMockRequests(),
      recentErrors: generateMockErrors(),
      alerts: generateMockAlerts()
    };
  };

  const generateMockRequests = () => {
    const endpoints = ['/api/users', '/api/auth/login', '/api/products', '/api/orders'];
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    
    return Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      timestamp: dayjs().subtract(i * 2, 'seconds').format('HH:mm:ss'),
      method: methods[Math.floor(Math.random() * methods.length)],
      endpoint: endpoints[Math.floor(Math.random() * endpoints.length)],
      status: Math.random() > 0.1 ? 200 : (Math.random() > 0.5 ? 404 : 500),
      responseTime: Math.round(50 + Math.random() * 200)
    }));
  };

  const generateMockErrors = () => {
    const errors = [
      'Internal Server Error',
      'Database Connection Timeout',
      'Rate Limit Exceeded',
      'Unauthorized Access',
      'Invalid Request Format'
    ];

    if (Math.random() > 0.7) {
      return [{
        id: Date.now(),
        timestamp: dayjs().format('HH:mm:ss'),
        error: errors[Math.floor(Math.random() * errors.length)],
        endpoint: '/api/users/profile',
        count: Math.floor(Math.random() * 5) + 1
      }];
    }
    return [];
  };

  const generateMockAlerts = () => {
    const alerts = [];
    
    if (realTimeData.errorRate > 5) {
      alerts.push({
        id: 'high-error-rate',
        type: 'error',
        message: `High error rate detected: ${realTimeData.errorRate}%`,
        timestamp: dayjs().format('HH:mm:ss')
      });
    }
    
    if (realTimeData.averageResponseTime > 500) {
      alerts.push({
        id: 'slow-response',
        type: 'warning',
        message: `Slow response time: ${realTimeData.averageResponseTime}ms`,
        timestamp: dayjs().format('HH:mm:ss')
      });
    }

    return alerts;
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  const getStatusColor = (status) => {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400 && status < 500) return 'warning';
    if (status >= 500) return 'error';
    return 'default';
  };

  const MetricCard = ({ title, value, unit, icon, color = 'primary', trend }) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="h6">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
              {unit && (
                <Typography variant="body1" component="span" color="textSecondary">
                  {unit}
                </Typography>
              )}
            </Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}.light`,
              borderRadius: '50%',
              width: 60,
              height: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            {icon}
            {isLive && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: 'success.main',
                  animation: 'pulse 2s infinite'
                }}
              />
            )}
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
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Requests per Second'
        },
        min: 0
      }
    },
    animation: {
      duration: 0 // Disable animation for real-time updates
    }
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          Real-Time Analytics
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          <FormControlLabel
            control={
              <Switch
                checked={isLive}
                onChange={(e) => setIsLive(e.target.checked)}
                color="primary"
              />
            }
            label="Live Updates"
          />
          <IconButton onClick={fetchRealTimeData} disabled={isLive}>
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, backgroundColor: 'error.light' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6" color="error.main">
              Active Alerts
            </Typography>
            <IconButton size="small" onClick={clearAlerts}>
              <Clear />
            </IconButton>
          </Box>
          {alerts.map((alert) => (
            <Box key={alert.id} display="flex" alignItems="center" gap={1} mb={1}>
              {alert.type === 'error' ? <Error color="error" /> : <Warning color="warning" />}
              <Typography variant="body2">{alert.message}</Typography>
              <Typography variant="caption" color="textSecondary">
                {alert.timestamp}
              </Typography>
            </Box>
          ))}
        </Paper>
      )}

      {/* Real-time Metrics */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Requests/sec"
            value={realTimeData.currentRPS}
            icon={<Timeline color="primary" />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Response Time"
            value={realTimeData.averageResponseTime}
            unit="ms"
            icon={<Speed color="info" />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Active Connections"
            value={realTimeData.activeConnections}
            icon={<CheckCircle color="success" />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Error Rate"
            value={realTimeData.errorRate}
            unit="%"
            icon={<Error color="error" />}
            color="error"
          />
        </Grid>
      </Grid>

      {/* Real-time Chart */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                Requests per Second (Real-time)
              </Typography>
              <Chip
                icon={isLive ? <PlayArrow /> : <Pause />}
                label={isLive ? 'Live' : 'Paused'}
                color={isLive ? 'success' : 'default'}
                size="small"
              />
            </Box>
            <Line data={chartData} options={chartOptions} />
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Requests
            </Typography>
            <List dense>
              {recentRequests.map((request) => (
                <ListItem key={request.id}>
                  <ListItemIcon>
                    <Chip
                      label={request.method}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={request.endpoint}
                    secondary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="caption">
                          {request.timestamp}
                        </Typography>
                        <Chip
                          label={request.status}
                          size="small"
                          color={getStatusColor(request.status)}
                        />
                        <Typography variant="caption" color="textSecondary">
                          {request.responseTime}ms
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Errors
            </Typography>
            {recentErrors.length > 0 ? (
              <List dense>
                {recentErrors.map((error) => (
                  <ListItem key={error.id}>
                    <ListItemIcon>
                      <Error color="error" />
                    </ListItemIcon>
                    <ListItemText
                      primary={error.error}
                      secondary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="caption">
                            {error.timestamp}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {error.endpoint}
                          </Typography>
                          <Badge badgeContent={error.count} color="error">
                            <Box />
                          </Badge>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box display="flex" alignItems="center" justifyContent="center" py={4}>
                <CheckCircle color="success" sx={{ mr: 1 }} />
                <Typography color="textSecondary">
                  No recent errors
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <style>
        {`
          @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
            }
            70% {
              box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
            }
          }
        `}
      </style>
    </Box>
  );
};

export default RealTimeAnalytics;
