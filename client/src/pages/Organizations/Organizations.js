import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  IconButton
} from '@mui/material';
import {
  Add,
  Group,
  ArrowForward
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { orgAPI } from '../../services/api';

const roleColor = (role) => {
  switch (role) {
    case 'owner': return 'error';
    case 'admin': return 'warning';
    default: return 'primary';
  }
};

const Organizations = () => {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    try {
      setLoading(true);
      const response = await orgAPI.getAll();
      setOrgs(response.data.data.orgs || []);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
      toast.error('Failed to load organizations');
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Organization name is required');
      return;
    }
    try {
      setCreating(true);
      const response = await orgAPI.create({ name: name.trim() });
      toast.success('Organization created');
      setCreateOpen(false);
      setName('');
      navigate(`/orgs/${response.data.data.org.id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Organizations
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Share APIs, API keys and roles with your team
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateOpen(true)}
        >
          Create Organization
        </Button>
      </Box>

      {orgs.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Group sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No organizations yet
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Create an organization to collaborate with your team on shared APIs.
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
            Create Organization
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {orgs.map((org) => (
            <Grid item xs={12} sm={6} md={4} key={org.id}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                onClick={() => navigate(`/orgs/${org.id}`)}
              >
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                    <Group color="primary" sx={{ fontSize: 40 }} />
                    <Chip label={org.role} size="small" color={roleColor(org.role)} />
                  </Box>
                  <Typography variant="h6" gutterBottom>
                    {org.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {org.memberCount} member{org.memberCount === 1 ? '' : 's'}
                  </Typography>
                  <Box display="flex" justifyContent="flex-end" mt={2}>
                    <IconButton size="small">
                      <ArrowForward fontSize="small" />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Organization</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            placeholder="Acme Corp"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Organizations;
