import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Refresh,
  Lock,
  Search
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { adminAPI } from '../../services/api';

const ACTION_LABELS = {
  API_CREATED: { color: 'primary', label: 'API Created' },
  API_UPDATED: { color: 'primary', label: 'API Updated' },
  API_DELETED: { color: 'error', label: 'API Deleted' },
  KEY_CREATED: { color: 'success', label: 'Key Created' },
  KEY_DELETED: { color: 'error', label: 'Key Deleted' },
  KEY_ROTATED: { color: 'success', label: 'Key Rotated' },
  ORG_CREATED: { color: 'info', label: 'Org Created' },
  ORG_MEMBER_ADDED: { color: 'info', label: 'Member Added' },
  ORG_MEMBER_REMOVED: { color: 'error', label: 'Member Removed' },
  ORG_MEMBER_ROLE_CHANGED: { color: 'warning', label: 'Role Changed' },
  SECURITY_WAF_BLOCK: { color: 'error', label: 'WAF Block' },
  SECURITY_SSRF_BLOCKED: { color: 'error', label: 'SSRF Blocked' },
  SECURITY_RATE_LIMIT_EXCEEDED: { color: 'warning', label: 'Rate Limited' },
  SECURITY_CIRCUIT_OPEN: { color: 'error', label: 'Circuit Open' },
  SECURITY_KEY_LEAK_REVOKED: { color: 'error', label: 'Key Leak Revoked' }
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, action, userId]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = { page: page + 1, limit: rowsPerPage };
      if (action) params.action = action;
      if (userId.trim()) params.userId = userId.trim();

      const response = await adminAPI.getAuditLogs(params);
      setLogs(response.data.data.logs || []);
      setTotal(response.data.data.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      if (error.response?.status === 403) {
        toast.error('Admin access required to view the audit trail');
      } else {
        toast.error('Failed to load audit logs');
      }
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const actionMeta = (name) => ACTION_LABELS[name] || { color: 'default', label: name };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Audit Log
          </Typography>
          <Typography variant="body2" color="text.secondary" display="flex" alignItems="center">
            <Lock fontSize="small" sx={{ mr: 0.5 }} />
            Immutable, append-only trail of security and management events (admin only)
          </Typography>
        </Box>
        <IconButton onClick={fetchLogs} title="Refresh">
          <Refresh />
        </IconButton>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" gap={2} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Action</InputLabel>
            <Select
              value={action}
              label="Action"
              onChange={(e) => { setAction(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All actions</MenuItem>
              {Object.entries(ACTION_LABELS).map(([key, meta]) => (
                <MenuItem key={key} value={key}>{meta.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setPage(0)}
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
            }}
            sx={{ minWidth: 220 }}
          />
        </Box>
      </Paper>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>User</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No audit events found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const meta = actionMeta(log.action);
                  return (
                    <TableRow key={log.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={meta.label} size="small" color={meta.color} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {log.resourceType}:{String(log.resourceId || '-').slice(0, 8)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {String(log.userId || '-').slice(0, 8)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{log.ip}</Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={JSON.stringify(log.details, null, 2)}>
                          <Typography
                            variant="body2"
                            sx={{
                              maxWidth: 260,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              cursor: 'help'
                            }}
                          >
                            {JSON.stringify(log.details)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[25, 50, 100]}
          component="div"
          count={total}
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

export default AuditLogs;
