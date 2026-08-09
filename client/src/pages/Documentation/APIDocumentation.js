import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tab,
  Tabs
} from '@mui/material';
import {
  ArrowBack,
  ExpandMore as ExpandMoreIcon,
  ContentCopy,
  Download,
  Launch,
  Code as CodeIcon,
  Api as ApiIcon,
  Security,
  Speed,
  CheckCircle,
  Error,
  Warning
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import apiService from '../../services/api';

const APIDocumentation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [api, setApi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);

  useEffect(() => {
    if (id) {
      fetchAPIDetails();
    }
  }, [id]);

  const fetchAPIDetails = async () => {
    try {
      setLoading(true);
      const response = await apiService.get(`/api/apis/${id}`);
      const rawApi = response.data?.data?.api || response.data?.data || response.data || {};
      // Add mock documentation data
      const apiData = {
        ...rawApi,
        endpoints: [
          {
            id: 1,
            method: 'GET',
            path: '/users',
            description: 'Retrieve a list of users',
            parameters: [
              { name: 'page', type: 'integer', required: false, description: 'Page number' },
              { name: 'limit', type: 'integer', required: false, description: 'Items per page' }
            ],
            responses: {
              200: { description: 'Success', example: '{"users": [], "total": 0}' },
              400: { description: 'Bad Request' },
              401: { description: 'Unauthorized' }
            }
          },
          {
            id: 2,
            method: 'POST',
            path: '/users',
            description: 'Create a new user',
            parameters: [
              { name: 'name', type: 'string', required: true, description: 'User name' },
              { name: 'email', type: 'string', required: true, description: 'User email' }
            ],
            responses: {
              201: { description: 'Created', example: '{"id": 1, "name": "John", "email": "john@example.com"}' },
              400: { description: 'Bad Request' },
              401: { description: 'Unauthorized' }
            }
          },
          {
            id: 3,
            method: 'GET',
            path: '/users/{id}',
            description: 'Retrieve a specific user',
            parameters: [
              { name: 'id', type: 'integer', required: true, description: 'User ID' }
            ],
            responses: {
              200: { description: 'Success', example: '{"id": 1, "name": "John", "email": "john@example.com"}' },
              404: { description: 'Not Found' },
              401: { description: 'Unauthorized' }
            }
          }
        ]
      };
      setApi(apiData);
    } catch (error) {
      console.error('Error fetching API details:', error);
      toast.error('Failed to load API documentation');
      navigate('/documentation');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
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

  const getMethodColor = (method) => {
    switch (method.toUpperCase()) {
      case 'GET':
        return 'success';
      case 'POST':
        return 'primary';
      case 'PUT':
        return 'warning';
      case 'DELETE':
        return 'error';
      case 'PATCH':
        return 'info';
      default:
        return 'default';
    }
  };

  const generateCodeExample = (endpoint) => {
    const baseUrl = api.endpoint || 'https://api.example.com';
    const fullUrl = `${baseUrl}${endpoint.path}`;
    
    return {
      curl: `curl -X ${endpoint.method} "${fullUrl}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"${endpoint.method !== 'GET' ? ' \\\n  -d \'{"key": "value"}\'' : ''}`,
      javascript: `const response = await fetch('${fullUrl}', {
  method: '${endpoint.method}',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }${endpoint.method !== 'GET' ? ',\n  body: JSON.stringify({\n    key: "value"\n  })' : ''}
});

const data = await response.json();
console.log(data);`,
      python: `import requests

url = "${fullUrl}"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}${endpoint.method !== 'GET' ? '\ndata = {"key": "value"}' : ''}

response = requests.${endpoint.method.toLowerCase()}(url, headers=headers${endpoint.method !== 'GET' ? ', json=data' : ''})
print(response.json())`
    };
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading API documentation...</Typography>
      </Box>
    );
  }

  if (!api) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="text.secondary">
          API documentation not found
        </Typography>
        <Button onClick={() => navigate('/documentation')} sx={{ mt: 2 }}>
          Back to Documentation
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/documentation')} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Box flex={1}>
          <Typography variant="h4" component="h1">
            {api.name} API Documentation
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {api.description}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Chip label={`v${api.version || '1.0.0'}`} variant="outlined" />
          <Chip
            label={api.status}
            color={getStatusColor(api.status)}
            size="small"
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          {/* Tabs */}
          <Paper sx={{ mb: 3 }}>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Overview" />
              <Tab label="Endpoints" />
              <Tab label="Authentication" />
              <Tab label="Code Examples" />
            </Tabs>
          </Paper>

          {/* Tab Content */}
          {tabValue === 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  API Overview
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Base URL
                    </Typography>
                    <Box display="flex" alignItems="center" mb={2}>
                      <code style={{ flex: 1, padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                        {api.endpoint || 'https://api.example.com/v1'}
                      </code>
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(api.endpoint)}
                        sx={{ ml: 1 }}
                      >
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Version
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                      {api.version || '1.0.0'}
                    </Typography>
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Supported Methods
                    </Typography>
                    <Box display="flex" gap={1} mb={2}>
                      {(api.allowedMethods || ['GET']).map((method) => (
                        <Chip
                          key={method}
                          label={method}
                          color={getMethodColor(method)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>

                  {api.rateLimit && (
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          <strong>Rate Limit:</strong> {api.rateLimit} requests per {api.rateLimitWindow || 60} seconds
                        </Typography>
                      </Alert>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          )}

          {tabValue === 1 && (
            <Box>
              {api.endpoints?.map((endpoint) => (
                <Card key={endpoint.id} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={2} mb={2}>
                      <Chip
                        label={endpoint.method}
                        color={getMethodColor(endpoint.method)}
                        size="small"
                      />
                      <code style={{ fontFamily: 'monospace', fontSize: '1rem' }}>
                        {endpoint.path}
                      </code>
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {endpoint.description}
                    </Typography>

                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle2">Parameters</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        {endpoint.parameters?.length > 0 ? (
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Name</TableCell>
                                  <TableCell>Type</TableCell>
                                  <TableCell>Required</TableCell>
                                  <TableCell>Description</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {endpoint.parameters.map((param, index) => (
                                  <TableRow key={index}>
                                    <TableCell>
                                      <code>{param.name}</code>
                                    </TableCell>
                                    <TableCell>{param.type}</TableCell>
                                    <TableCell>
                                      {param.required ? (
                                        <Chip label="Required" color="error" size="small" />
                                      ) : (
                                        <Chip label="Optional" color="default" size="small" />
                                      )}
                                    </TableCell>
                                    <TableCell>{param.description}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No parameters required
                          </Typography>
                        )}
                      </AccordionDetails>
                    </Accordion>

                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle2">Responses</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <List>
                          {Object.entries(endpoint.responses || {}).map(([code, response]) => (
                            <ListItem key={code} sx={{ px: 0 }}>
                              <ListItemText
                                primary={
                                  <Box display="flex" alignItems="center" gap={1}>
                                    <Chip
                                      label={code}
                                      color={code.startsWith('2') ? 'success' : code.startsWith('4') ? 'warning' : 'error'}
                                      size="small"
                                    />
                                    <Typography variant="body2">
                                      {response.description}
                                    </Typography>
                                  </Box>
                                }
                                secondary={
                                  response.example && (
                                    <Box sx={{ mt: 1 }}>                                      <Box
                                        component="pre"
                                        sx={{
                                          fontSize: '0.75rem',
                                          margin: 0,
                                          backgroundColor: '#f5f5f5',
                                          padding: 1,
                                          borderRadius: 1,
                                          overflow: 'auto'
                                        }}
                                      >
                                        <code>{response.example}</code>
                                      </Box>
                                    </Box>
                                  )
                                }
                              />
                            </ListItem>
                          ))}
                        </List>
                      </AccordionDetails>
                    </Accordion>

                    <Box sx={{ mt: 2 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setSelectedEndpoint(endpoint)}
                      >
                        Try It Out
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {tabValue === 2 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Authentication
                </Typography>
                <Divider sx={{ mb: 3 }} />
                  <Alert severity="info" sx={{ mb: 3 }}>
                  This API uses API key authentication. Include your API key in the Authorization header.
                </Alert>                <Typography variant="subtitle2" gutterBottom>
                  Header Format
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontSize: '0.875rem',
                    backgroundColor: '#f5f5f5',
                    padding: 2,
                    borderRadius: 1,
                    overflow: 'auto'
                  }}
                >
                  <code>Authorization: Bearer YOUR_API_KEY</code>
                </Box>

                <Box sx={{ mt: 3 }}>
                  <Button
                    variant="contained"
                    startIcon={<ApiIcon />}
                    onClick={() => navigate('/keys/create')}
                  >
                    Generate API Key
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {tabValue === 3 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Code Examples
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                {selectedEndpoint ? (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      {selectedEndpoint.method} {selectedEndpoint.path}
                    </Typography>
                    
                    {['curl', 'javascript', 'python'].map((language) => (                      <Accordion key={language}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
                            {language === 'curl' ? 'cURL' : language}
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>                          <Box
                            component="pre"
                            sx={{
                              fontSize: '0.875rem',
                              backgroundColor: '#f5f5f5',
                              padding: 2,
                              borderRadius: 1,
                              overflow: 'auto'
                            }}
                          >
                            <code>{generateCodeExample(selectedEndpoint)[language]}</code>
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </Box>
                ) : (
                  <Alert severity="info">
                    Select an endpoint from the Endpoints tab to see code examples.
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<Download />}
                  fullWidth
                >
                  Download OpenAPI Spec
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<CodeIcon />}
                  fullWidth
                >
                  View SDKs
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Launch />}
                  fullWidth
                  onClick={() => navigate(`/apis/${id}`)}
                >
                  Manage API
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Need Help?
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Having trouble with this API? Check out our support resources.
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button variant="outlined" size="small" fullWidth>
                  Report Issue
                </Button>
                <Button variant="contained" size="small" fullWidth>
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

export default APIDocumentation;
