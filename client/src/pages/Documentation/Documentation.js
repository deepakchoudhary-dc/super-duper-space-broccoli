import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Description as DescriptionIcon,
  Api as ApiIcon,
  Code as CodeIcon,
  Launch as LaunchIcon,
  ExpandMore as ExpandMoreIcon,
  BookmarkBorder as BookmarkIcon,
  Share as ShareIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';

const Documentation = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [docs, setDocs] = useState([]);
  const [apis, setApis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    fetchDocumentation();
    fetchAPIs();
  }, []);

  const fetchDocumentation = async () => {
    try {
      // Mock documentation data - replace with actual API call
      const mockDocs = [
        {
          id: 1,
          title: 'Getting Started with API Guardian',
          description: 'Learn the basics of API management and security',
          category: 'getting-started',
          content: 'Complete guide to get started with API Guardian platform...',
          lastUpdated: new Date().toISOString(),
          tags: ['beginner', 'setup', 'basics']
        },
        {
          id: 2,
          title: 'Authentication & Security',
          description: 'Comprehensive guide to API authentication methods',
          category: 'security',
          content: 'Learn about API key management, JWT tokens, and security best practices...',
          lastUpdated: new Date().toISOString(),
          tags: ['security', 'authentication', 'best-practices']
        },
        {
          id: 3,
          title: 'Rate Limiting Configuration',
          description: 'How to configure and manage API rate limits',
          category: 'configuration',
          content: 'Detailed instructions on setting up rate limiting for your APIs...',
          lastUpdated: new Date().toISOString(),
          tags: ['rate-limiting', 'configuration', 'performance']
        },
        {
          id: 4,
          title: 'Analytics & Monitoring',
          description: 'Understanding API analytics and monitoring features',
          category: 'analytics',
          content: 'Guide to tracking API usage, performance metrics, and error monitoring...',
          lastUpdated: new Date().toISOString(),
          tags: ['analytics', 'monitoring', 'metrics']
        },
        {
          id: 5,
          title: 'Troubleshooting Common Issues',
          description: 'Solutions to frequently encountered problems',
          category: 'troubleshooting',
          content: 'Common issues and their solutions when working with API Guardian...',
          lastUpdated: new Date().toISOString(),
          tags: ['troubleshooting', 'support', 'faq']
        }
      ];
      setDocs(mockDocs);
    } catch (error) {
      console.error('Error fetching documentation:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAPIs = async () => {
    try {
      const response = await apiService.get('/api/apis');
      const apisList = response.data?.data?.apis || response.data?.apis || (Array.isArray(response.data?.data) ? response.data.data : []);
      setApis(Array.isArray(apisList) ? apisList : []);
    } catch (error) {
      console.error('Error fetching APIs:', error);
      setApis([]);
    }
  };

  const categories = [
    { value: 'all', label: 'All Documentation' },
    { value: 'getting-started', label: 'Getting Started' },
    { value: 'security', label: 'Security' },
    { value: 'configuration', label: 'Configuration' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'troubleshooting', label: 'Troubleshooting' }
  ];

  const filteredDocs = docs.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const quickStartSteps = [
    {
      step: 1,
      title: 'Register Your API',
      description: 'Add your API endpoint to the platform',
      action: () => navigate('/apis/create')
    },
    {
      step: 2,
      title: 'Generate API Keys',
      description: 'Create secure keys for API access',
      action: () => navigate('/keys/create')
    },
    {
      step: 3,
      title: 'Configure Security',
      description: 'Set up authentication and rate limiting',
      action: () => navigate('/profile/security')
    },
    {
      step: 4,
      title: 'Monitor Usage',
      description: 'Track API performance and analytics',
      action: () => navigate('/analytics')
    }
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading documentation...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Documentation
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Comprehensive guides and API references to help you get the most out of API Guardian
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Search and Filters */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box display="flex" gap={2} mb={3}>
              <TextField
                fullWidth
                placeholder="Search documentation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Box display="flex" gap={1} flexWrap="wrap">
              {categories.map((category) => (
                <Chip
                  key={category.value}
                  label={category.label}
                  variant={selectedCategory === category.value ? 'filled' : 'outlined'}
                  onClick={() => setSelectedCategory(category.value)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Paper>

          {/* Documentation List */}
          {filteredDocs.length === 0 ? (
            <Card>
              <CardContent>
                <Box textAlign="center" py={4}>
                  <DescriptionIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No documentation found
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try adjusting your search terms or browse by category
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ) : (
            <Box>
              {filteredDocs.map((doc) => (
                <Card key={doc.id} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                      <Box flex={1}>
                        <Typography variant="h6" gutterBottom>
                          {doc.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {doc.description}
                        </Typography>
                        <Box display="flex" gap={1} mb={2}>
                          {doc.tags.map((tag) => (
                            <Chip key={tag} label={tag} size="small" variant="outlined" />
                          ))}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Last updated: {new Date(doc.lastUpdated).toLocaleDateString()}
                        </Typography>
                      </Box>
                      <Box display="flex" gap={1}>
                        <Tooltip title="Bookmark">
                          <IconButton size="small">
                            <BookmarkIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Share">
                          <IconButton size="small">
                            <ShareIcon />
                          </IconButton>
                        </Tooltip>
                        <Button
                          variant="outlined"
                          size="small"
                          endIcon={<LaunchIcon />}
                        >
                          Read More
                        </Button>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Quick Start Guide */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Start Guide
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Get up and running with API Guardian in 4 simple steps
              </Typography>
              <List>
                {quickStartSteps.map((step) => (
                  <ListItem key={step.step} sx={{ px: 0 }}>
                    <ListItemIcon>
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {step.step}
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={step.title}
                      secondary={step.description}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 'medium' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                    <Button
                      size="small"
                      onClick={step.action}
                      sx={{ ml: 1 }}
                    >
                      Start
                    </Button>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>

          {/* API References */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  API References
                </Typography>
                <Button
                  size="small"
                  startIcon={<ApiIcon />}
                  onClick={() => navigate('/apis')}
                >
                  View All
                </Button>
              </Box>
              {apis.length === 0 ? (
                <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
                  No APIs registered yet. <br />
                  <Button size="small" onClick={() => navigate('/apis/create')}>
                    Register your first API
                  </Button>
                </Alert>
              ) : (
                <List>
                  {(Array.isArray(apis) ? apis.slice(0, 3) : []).map((api) => (
                    <ListItem
                      key={api.id}
                      sx={{ px: 0, cursor: 'pointer' }}
                      onClick={() => navigate(`/documentation/api/${api.id}`)}
                    >
                      <ListItemIcon>
                        <ApiIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={api.name}
                        secondary={`v${api.version || '1.0.0'}`}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                  {apis.length > 3 && (
                    <ListItem sx={{ px: 0 }}>
                      <Button
                        size="small"
                        fullWidth
                        onClick={() => navigate('/apis')}
                      >
                        View {apis.length - 3} more APIs
                      </Button>
                    </ListItem>
                  )}
                </List>
              )}
            </CardContent>
          </Card>

          {/* Help & Support */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Need Help?
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Can't find what you're looking for? We're here to help!
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CodeIcon />}
                  fullWidth
                >
                  Code Examples
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  fullWidth
                >
                  Download SDKs
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  sx={{ mt: 1 }}
                >
                  Contact Support
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Documentation;
