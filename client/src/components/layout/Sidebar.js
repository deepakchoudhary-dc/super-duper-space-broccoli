import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Typography
} from '@mui/material';
import {
  Dashboard,
  Api,
  VpnKey,
  Analytics,
  Description,
  Settings,
  Person,
  Security,
  Group,
  Lock
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const drawerWidth = 240;

const Sidebar = ({ mobileOpen, onDrawerToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { 
      section: 'Main',
      items: [
        { label: 'Dashboard', icon: <Dashboard />, path: '/dashboard' },
        { label: 'APIs', icon: <Api />, path: '/apis' },
        { label: 'API Keys', icon: <VpnKey />, path: '/keys' },
        { label: 'Analytics', icon: <Analytics />, path: '/analytics' },
        { label: 'Documentation', icon: <Description />, path: '/documentation' },
      ]
    },
    {
      section: 'Account',
      items: [
        { label: 'Profile', icon: <Person />, path: '/profile' },
        { label: 'Security', icon: <Security />, path: '/profile/security' },
        { label: 'Organizations', icon: <Group />, path: '/orgs' },
        { label: 'Settings', icon: <Settings />, path: '/settings' },
      ]
    },
    {
      section: 'Admin',
      items: [
        { label: 'Audit Log', icon: <Lock />, path: '/admin/audit' },
      ]
    }
  ];

  const handleNavigation = (path) => {
    navigate(path);
    if (mobileOpen) {
      onDrawerToggle();
    }
  };

  const drawer = (
    <div>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Security fontSize="small" color="primary" />
            Guardian
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      
      {menuItems.map((section, sectionIndex) => (
        <Box key={section.section}>
          <Typography 
            variant="overline" 
            sx={{ 
              px: 2, 
              pt: 2, 
              pb: 1, 
              color: 'text.secondary',
              fontWeight: 'bold',
              fontSize: '0.75rem'
            }}
          >
            {section.section}
          </Typography>
          <List dense>
            {section.items.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => handleNavigation(item.path)}
                  sx={{
                    mx: 1,
                    borderRadius: 1,
                    '&.Mui-selected': {
                      backgroundColor: 'primary.main',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                      '& .MuiListItemIcon-root': {
                        color: 'white',
                      },
                    },
                  }}
                >
                  <ListItemIcon 
                    sx={{ 
                      minWidth: 40,
                      color: location.pathname === item.path ? 'inherit' : 'action.active'
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.875rem',
                      fontWeight: location.pathname === item.path ? 'medium' : 'normal'
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          {sectionIndex < menuItems.length - 1 && <Divider sx={{ my: 1 }} />}
        </Box>
      ))}
    </div>
  );

  return (
    <Box
      component="nav"
      sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
    >
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { 
            boxSizing: 'border-box', 
            width: drawerWidth,
            backgroundColor: 'background.paper',
            borderRight: '1px solid',
            borderColor: 'divider'
          },
        }}
      >
        {drawer}
      </Drawer>
      
      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { 
            boxSizing: 'border-box', 
            width: drawerWidth,
            backgroundColor: 'background.paper',
            borderRight: '1px solid',
            borderColor: 'divider'
          },
        }}
        open
      >
        {drawer}
      </Drawer>
    </Box>
  );
};

export default Sidebar;
