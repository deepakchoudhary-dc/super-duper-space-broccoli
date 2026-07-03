import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Skeleton
} from '@mui/material';

const MetricCard = ({ 
  title, 
  value, 
  subtitle, 
  icon, 
  color = 'primary',
  trend,
  loading = false,
  onClick 
}) => {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box flex={1}>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" height={40} />
              <Skeleton variant="text" width="30%" />
            </Box>
            <Skeleton variant="circular" width={60} height={60} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      sx={{ 
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': onClick ? { 
          transform: 'translateY(-2px)',
          boxShadow: 4
        } : {}
      }}
      onClick={onClick}
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box flex={1}>
            <Typography color="textSecondary" gutterBottom variant="h6">
              {title}
            </Typography>
            <Typography variant="h4" component="div" sx={{ mb: 1 }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
            {trend && (
              <Box display="flex" alignItems="center" mt={1}>
                <Typography
                  variant="body2"
                  color={trend.value > 0 ? 'success.main' : 'error.main'}
                  sx={{ display: 'flex', alignItems: 'center' }}
                >
                  {trend.icon}
                  <span style={{ marginLeft: 4 }}>
                    {Math.abs(trend.value)}% {trend.label}
                  </span>
                </Typography>
              </Box>
            )}
          </Box>
          {icon && (
            <Box
              sx={{
                backgroundColor: `${color}.light`,
                borderRadius: '50%',
                width: 60,
                height: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ml: 2
              }}
            >
              {React.cloneElement(icon, { color: color })}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default MetricCard;
