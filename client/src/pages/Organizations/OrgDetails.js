import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  Chip,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  ArrowBack,
  Group,
  PersonAdd,
  Delete,
  AdminPanelSettings
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { orgAPI } from '../../services/api';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const roleColor = (role) => {
  switch (role) {
    case 'owner': return 'error';
    case 'admin': return 'warning';
    default: return 'primary';
  }
};

const canManage = (role) => role === 'owner' || role === 'admin';

const OrgDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [yourRole, setYourRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    fetchOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchOrg = async () => {
    try {
      setLoading(true);
      const response = await orgAPI.getById(id);
      setOrg(response.data.data.org);
      setMembers(response.data.data.members || []);
      setYourRole(response.data.data.yourRole || 'member');
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      toast.error(error.response?.data?.message || 'Failed to load organization');
      navigate('/orgs');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    try {
      setAdding(true);
      await orgAPI.addMember(id, { email: memberEmail.trim(), role: memberRole });
      toast.success('Member added');
      setAddOpen(false);
      setMemberEmail('');
      setMemberRole('member');
      fetchOrg();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      await orgAPI.updateMemberRole(id, userId, { role });
      toast.success('Role updated');
      fetchOrg();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    }
  };

  const confirmRemove = async () => {
    try {
      await orgAPI.removeMember(id, removeTarget.user_id);
      toast.success('Member removed');
      setRemoveOpen(false);
      setRemoveTarget(null);
      fetchOrg();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove member');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!org) return null;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton onClick={() => navigate('/orgs')} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Box flex={1}>
          <Typography variant="h4" component="h1">
            {org.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your role: <Chip label={yourRole} size="small" color={roleColor(yourRole)} sx={{ ml: 0.5 }} />
          </Typography>
        </Box>
        {canManage(yourRole) && (
          <Button
            variant="contained"
            startIcon={<PersonAdd />}
            onClick={() => setAddOpen(true)}
          >
            Add Member
          </Button>
        )}
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" mb={2}>
            <Group color="primary" sx={{ mr: 1 }} />
            <Typography variant="h6">Members ({members.length})</Typography>
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  {canManage(yourRole) && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.user_id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <AdminPanelSettings sx={{ mr: 1, fontSize: 20, color: 'text.secondary' }} />
                        <Typography variant="body2">
                          {member.first_name || member.last_name
                            ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
                            : 'Unnamed'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{member.email}</Typography>
                    </TableCell>
                    <TableCell>
                      {member.user_id === org.owner_user_id ? (
                        <Chip label="owner" size="small" color="error" />
                      ) : canManage(yourRole) ? (
                        <FormControl size="small">
                          <Select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                            disabled={yourRole === 'admin' && member.role === 'admin'}
                          >
                            <MenuItem value="member">member</MenuItem>
                            <MenuItem value="admin">admin</MenuItem>
                          </Select>
                        </FormControl>
                      ) : (
                        <Chip label={member.role} size="small" color={roleColor(member.role)} />
                      )}
                    </TableCell>
                    {canManage(yourRole) && (
                      <TableCell align="right">
                        {member.user_id !== org.owner_user_id && (
                          <IconButton
                            size="small"
                            color="error"
                            title="Remove member"
                            onClick={() => {
                              setRemoveTarget(member);
                              setRemoveOpen(true);
                            }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Add Member</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Email address"
            type="email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            margin="normal"
            placeholder="teammate@example.com"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Role</InputLabel>
            <Select
              value={memberRole}
              label="Role"
              onChange={(e) => setMemberRole(e.target.value)}
            >
              <MenuItem value="member">Member — view &amp; use shared APIs</MenuItem>
              <MenuItem value="admin">Admin — manage members and APIs</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddMember} disabled={adding}>
            {adding ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={confirmRemove}
        title="Remove member"
        content={
          <Box>
            <Typography gutterBottom>
              Remove {removeTarget?.email} from this organization?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              They will lose access to all org-scoped APIs and keys immediately.
            </Typography>
          </Box>
        }
        confirmText="Remove"
        confirmColor="error"
      />
    </Box>
  );
};

export default OrgDetails;
