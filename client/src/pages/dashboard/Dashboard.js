import React, { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  IconButton,
  LinearProgress,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import {
  Api,
  VpnKey,
  Analytics,
  TrendingUp,
  Warning,
  CheckCircle,
  Error,
  Add,
  Refresh,
  NotificationsActive
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
} from 'chart.js';
import { userAPI } from '../../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    apis: 3,
    keys: 8, 
    requests: 1247,
    uptime: '99.9%'
  });
  const [recentActivity, setRecentActivity] = useState([
    {
      type: 'api_created',
      title: 'New API Created',
      description: 'Weather API was successfully registered',
      timestamp: '2 hours ago'
    },
    {
      type: 'key_generated',
      title: 'API Key Generated',
      description: 'New key generated for Payment API', 
      timestamp: '5 hours ago'
    }
  ]);
  const [alerts, setAlerts] = useState([
    {
      type: 'warning',
      title: 'Rate Limit Approaching',
      message: 'Payment API is at 80% of rate limit',
      timestamp: '30 minutes ago'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState({
    requests: {
      labels: [],
      datasets: []
    },
    errors: {
      labels: [],
      datasets: []
    },
    usage: {
      labels: [],
      datasets: []
    }
  });  useEffect(() => {
    console.log('Dashboard: Component mounted, calling fetchDashboardData');
    fetchDashboardData();
  }, []);
  const fetchDashboardData = async () => {
    try {
      console.log('Dashboard: Starting to fetch data...');
      setLoading(true);
      
      const [statsResponse, activityResponse, alertsResponse] = await Promise.all([
        userAPI.getStats(),
        userAPI.getRecentActivity(),
        userAPI.getAlerts()
      ]);

      console.log('Dashboard: Got responses:', { statsResponse, activityResponse, alertsResponse });

      setStats(statsResponse.data);
      setRecentActivity(activityResponse.data);
      setAlerts(alertsResponse.data);

      // Mock chart data
      setChartData({
        requests: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [{
            label: 'API Requests',
            data: [1200, 1500, 1800, 1400, 1600, 2000, 1700],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.4
          }]
        },
        errors: {
          labels: ['2xx', '4xx', '5xx'],
          datasets: [{
            data: [85, 12, 3],
            backgroundColor: ['#4caf50', '#ff9800', '#f44336']
          }]
        },
        usage: {
          labels: ['API A', 'API B', 'API C', 'API D'],
          datasets: [{
            label: 'Requests',
            data: [500, 300, 200, 150],
            backgroundColor: 'rgba(54, 162, 235, 0.8)'
          }]
        }
      });
    } catch (error) {
      console.error('Dashboard: Failed to fetch dashboard data:', error);
      console.error('Dashboard: Error details:', error.message, error.stack);
      // Set fallback data so dashboard doesn't stay blank
      setStats({
        apis: 0,
        keys: 0,
        requests: 0,
        uptime: '99.9%'
      });
      setRecentActivity([]);
      setAlerts([]);
    } finally {
      console.log('Dashboard: Finished fetching data, setting loading to false');
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon, color, trend, onClick }) => (
    <Card 
      sx={{ 
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s',
        '&:hover': onClick ? { transform: 'translateY(-2px)' } : {}
      }}
      onClick={onClick}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="h2" sx={{ fontWeight: 'bold' }}>
              {value}
            </Typography>
            {trend && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingUp sx={{ fontSize: 16, color: 'success.main', mr: 0.5 }} />
                <Typography variant="body2" color="success.main">
                  {trend}
                </Typography>
              </Box>
            )}
          </Box>
          <Avatar sx={{ bgcolor: color, width: 56, height: 56 }}>
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );

  const ActivityItem = ({ activity }) => (
    <ListItem>
      <ListItemIcon>
        {activity.type === 'api_created' && <Api color="primary" />}
        {activity.type === 'key_generated' && <VpnKey color="secondary" />}
        {activity.type === 'security_alert' && <Warning color="warning" />}
        {activity.type === 'request_spike' && <TrendingUp color="success" />}
      </ListItemIcon>
      <ListItemText
        primary={activity.title}
        secondary={activity.description}
      />
      <ListItemSecondaryAction>
        <Typography variant="caption" color="text.secondary">
          {activity.timestamp}
        </Typography>
      </ListItemSecondaryAction>
    </ListItem>
  );

  if (loading) {
    return (
      <Box sx={{ width: '100%' }}>
        <LinearProgress />
        <Box sx={{ p: 3 }}>
          <Typography>Loading dashboard...</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Welcome back! Here's what's happening with your APIs.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchDashboardData}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/apis/new')}
          >
            Add API
          </Button>
        </Box>
      </Box>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          {alerts.map((alert, index) => (
            <Paper 
              key={index}
              sx={{ 
                p: 2, 
                mb: 1, 
                bgcolor: alert.severity === 'error' ? 'error.light' : 'warning.light',
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              {alert.severity === 'error' ? <Error /> : <Warning />}
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                  {alert.title}
                </Typography>
                <Typography variant="body2">
                  {alert.message}
                </Typography>
              </Box>
              <Button size="small" variant="outlined">
                View
              </Button>
            </Paper>
          ))}
        </Box>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total APIs"
            value={stats.apis}
            icon={<Api />}
            color="primary.main"
            trend="+2 this week"
            onClick={() => navigate('/apis')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="API Keys"
            value={stats.keys}
            icon={<VpnKey />}
            color="secondary.main"
            trend="+5 this month"
            onClick={() => navigate('/keys')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Requests"
            value={stats.requests.toLocaleString()}
            icon={<Analytics />}
            color="success.main"
            trend="+12% vs last week"
            onClick={() => navigate('/analytics')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Uptime"
            value={stats.uptime}
            icon={<CheckCircle />}
            color="info.main"
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Request Trends
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line 
                data={chartData.requests}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Response Status
            </Typography>
            <Box sx={{ height: 300 }}>
              <Doughnut 
                data={chartData.errors}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                    },
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Bottom Row */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              API Usage by Endpoint
            </Typography>
            <Box sx={{ height: 300 }}>
              <Bar 
                data={chartData.usage}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Recent Activity
              </Typography>
              <IconButton size="small">
                <NotificationsActive />
              </IconButton>
            </Box>
            <List dense>
              {recentActivity.map((activity, index) => (
                <ActivityItem key={index} activity={activity} />
              ))}
              {recentActivity.length === 0 && (
                <ListItem>
                  <ListItemText
                    primary="No recent activity"
                    secondary="Your activity will appear here"
                  />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
