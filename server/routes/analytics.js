const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * SECURITY: clamp `days` to [1, 365] — previously interpolated raw into
 * `INTERVAL '${parseInt(days)} days'` which allowed NaN crashes (`INTERVAL 'NaN days'`)
 * and unbounded/negative windows. All intervals now use parameterized
 * MAKE_INTERVAL(days => $N).
 */
const safeDays = (value, fallback = 30) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(365, parsed));
};

// Get overall analytics for user's APIs
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = safeDays(req.query.days);

    const analyticsQuery = `
      SELECT 
        COUNT(DISTINCT aul.api_id) as active_apis,
        COUNT(DISTINCT aul.api_key_id) as active_keys,
        COUNT(*) as total_requests,
        COUNT(CASE WHEN aul.status_code >= 200 AND aul.status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN aul.status_code >= 400 THEN 1 END) as error_requests,
        AVG(aul.response_time) as avg_response_time,
        SUM(aul.request_size) as total_request_size,
        SUM(aul.response_size) as total_response_size,
        COUNT(DISTINCT aul.ip_address) as unique_ips
      FROM api_usage_logs aul
      WHERE aul.user_id = $1 AND aul.created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
    `;

    const result = await pool.query(analyticsQuery, [userId, days]);
    const analytics = result.rows[0];

    // Get time series data
    const timeSeriesQuery = `
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time) as avg_response_time
      FROM api_usage_logs
      WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
    `;

    const timeSeriesResult = await pool.query(timeSeriesQuery, [userId, days]);

    res.json({
      success: true,
      data: {
        overview: {
          activeApis: parseInt(analytics.active_apis) || 0,
          activeKeys: parseInt(analytics.active_keys) || 0,
          totalRequests: parseInt(analytics.total_requests) || 0,
          successfulRequests: parseInt(analytics.successful_requests) || 0,
          errorRequests: parseInt(analytics.error_requests) || 0,
          avgResponseTime: parseFloat(analytics.avg_response_time) || 0,
          totalRequestSize: parseInt(analytics.total_request_size) || 0,
          totalResponseSize: parseInt(analytics.total_response_size) || 0,
          uniqueIps: parseInt(analytics.unique_ips) || 0,
          successRate: analytics.total_requests > 0 ? 
            ((analytics.successful_requests / analytics.total_requests) * 100).toFixed(2) : '0.00'
        },
        timeSeries: timeSeriesResult.rows.map(row => ({
          date: row.date,
          requests: parseInt(row.requests),
          successfulRequests: parseInt(row.successful_requests),
          errorRequests: parseInt(row.error_requests),
          avgResponseTime: parseFloat(row.avg_response_time) || 0
        }))
      }
    });

  } catch (error) {
    logger.error('Get analytics overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics overview'
    });
  }
});

// Get API-specific analytics
router.get('/api/:apiId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const apiId = req.params.apiId;
    const days = safeDays(req.query.days);
    const { groupBy = 'day' } = req.query;

    // Verify API ownership
    const apiQuery = 'SELECT name FROM apis WHERE id = $1 AND user_id = $2';
    const apiResult = await pool.query(apiQuery, [apiId, userId]);

    if (apiResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'API not found'
      });
    }

    const apiName = apiResult.rows[0].name;

    // Get overall statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time) as avg_response_time,
        MIN(created_at) as first_request,
        MAX(created_at) as last_request,
        COUNT(DISTINCT api_key_id) as unique_keys,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM api_usage_logs
      WHERE api_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
    `;

    const statsResult = await pool.query(statsQuery, [apiId, days]);
    const stats = statsResult.rows[0];

    // Get time series data
    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = "DATE_TRUNC('hour', created_at)";
        break;
      case 'day':
        dateFormat = "DATE_TRUNC('day', created_at)";
        break;
      case 'week':
        dateFormat = "DATE_TRUNC('week', created_at)";
        break;
      default:
        dateFormat = "DATE_TRUNC('day', created_at)";
    }

    const timeSeriesQuery = `
      SELECT 
        ${dateFormat} as period,
        COUNT(*) as requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
        AVG(response_time) as avg_response_time,
        COUNT(DISTINCT api_key_id) as unique_keys
      FROM api_usage_logs
      WHERE api_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY ${dateFormat}
      ORDER BY period DESC
    `;

    const timeSeriesResult = await pool.query(timeSeriesQuery, [apiId, days]);

    // Get top endpoints
    const endpointsQuery = `
      SELECT 
        endpoint,
        method,
        COUNT(*) as request_count,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
        AVG(response_time) as avg_response_time
      FROM api_usage_logs
      WHERE api_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY endpoint, method
      ORDER BY request_count DESC
      LIMIT 10
    `;

    const endpointsResult = await pool.query(endpointsQuery, [apiId, days]);

    // Get status code distribution
    const statusCodesQuery = `
      SELECT 
        status_code,
        COUNT(*) as count
      FROM api_usage_logs
      WHERE api_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY status_code
      ORDER BY count DESC
    `;

    const statusCodesResult = await pool.query(statusCodesQuery, [apiId, days]);

    // Get top IPs
    const geoQuery = `
      SELECT 
        ip_address,
        COUNT(*) as request_count
      FROM api_usage_logs
      WHERE api_id = $1 AND created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
      GROUP BY ip_address
      ORDER BY request_count DESC
      LIMIT 10
    `;

    const geoResult = await pool.query(geoQuery, [apiId, days]);

    res.json({
      success: true,
      data: {
        apiInfo: {
          id: apiId,
          name: apiName
        },
        overview: {
          totalRequests: parseInt(stats.total_requests) || 0,
          successfulRequests: parseInt(stats.successful_requests) || 0,
          errorRequests: parseInt(stats.error_requests) || 0,
          avgResponseTime: parseFloat(stats.avg_response_time) || 0,
          firstRequest: stats.first_request,
          lastRequest: stats.last_request,
          uniqueKeys: parseInt(stats.unique_keys) || 0,
          uniqueIps: parseInt(stats.unique_ips) || 0,
          successRate: stats.total_requests > 0 ? 
            ((stats.successful_requests / stats.total_requests) * 100).toFixed(2) : '0.00'
        },
        timeSeries: timeSeriesResult.rows.map(row => ({
          period: row.period,
          requests: parseInt(row.requests),
          successfulRequests: parseInt(row.successful_requests),
          errorRequests: parseInt(row.error_requests),
          avgResponseTime: parseFloat(row.avg_response_time) || 0,
          uniqueKeys: parseInt(row.unique_keys)
        })),
        topEndpoints: endpointsResult.rows.map(row => ({
          endpoint: row.endpoint,
          method: row.method,
          requestCount: parseInt(row.request_count),
          errorCount: parseInt(row.error_count),
          avgResponseTime: parseFloat(row.avg_response_time) || 0,
          errorRate: row.request_count > 0 ? 
            ((row.error_count / row.request_count) * 100).toFixed(2) : '0.00'
        })),
        statusCodes: statusCodesResult.rows.map(row => ({
          statusCode: row.status_code,
          count: parseInt(row.count),
          percentage: stats.total_requests > 0 ? 
            ((row.count / stats.total_requests) * 100).toFixed(2) : '0.00'
        })),
        topIps: geoResult.rows.map(row => ({
          ipAddress: row.ip_address,
          requestCount: parseInt(row.request_count),
          percentage: stats.total_requests > 0 ? 
            ((row.request_count / stats.total_requests) * 100).toFixed(2) : '0.00'
        }))
      }
    });

  } catch (error) {
    logger.error('Get API analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve API analytics'
    });
  }
});

// Get real-time analytics
router.get('/realtime', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get last hour statistics
    const realtimeQuery = `
      SELECT 
        COUNT(*) as requests_last_hour,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors_last_hour,
        AVG(response_time) as avg_response_time_last_hour,
        COUNT(DISTINCT api_id) as active_apis_last_hour,
        COUNT(DISTINCT api_key_id) as active_keys_last_hour
      FROM api_usage_logs
      WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `;

    const realtimeResult = await pool.query(realtimeQuery, [userId]);
    const realtime = realtimeResult.rows[0];

    // Get minute-by-minute data for the last hour
    const minutelyQuery = `
      SELECT 
        DATE_TRUNC('minute', created_at) as minute,
        COUNT(*) as requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors,
        AVG(response_time) as avg_response_time
      FROM api_usage_logs
      WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
      GROUP BY DATE_TRUNC('minute', created_at)
      ORDER BY minute DESC
      LIMIT 60
    `;

    const minutelyResult = await pool.query(minutelyQuery, [userId]);

    // Get current active sessions (based on recent activity)
    const activeSessionsQuery = `
      SELECT COUNT(DISTINCT ip_address) as active_sessions
      FROM api_usage_logs
      WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    `;

    const activeSessionsResult = await pool.query(activeSessionsQuery, [userId]);

    res.json({
      success: true,
      data: {
        realtime: {
          requestsLastHour: parseInt(realtime.requests_last_hour) || 0,
          errorsLastHour: parseInt(realtime.errors_last_hour) || 0,
          avgResponseTimeLastHour: parseFloat(realtime.avg_response_time_last_hour) || 0,
          activeApisLastHour: parseInt(realtime.active_apis_last_hour) || 0,
          activeKeysLastHour: parseInt(realtime.active_keys_last_hour) || 0,
          activeSessions: parseInt(activeSessionsResult.rows[0].active_sessions) || 0,
          timestamp: new Date().toISOString()
        },
        minutelyData: minutelyResult.rows.map(row => ({
          minute: row.minute,
          requests: parseInt(row.requests),
          errors: parseInt(row.errors),
          avgResponseTime: parseFloat(row.avg_response_time) || 0
        }))
      }
    });

  } catch (error) {
    logger.error('Get realtime analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve realtime analytics'
    });
  }
});

// Get error analytics
router.get('/errors', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = safeDays(req.query.days, 7);
    const { apiId } = req.query;

    let baseQuery = `
      FROM api_usage_logs aul
      JOIN apis a ON aul.api_id = a.id
      WHERE aul.user_id = $1 AND aul.status_code >= 400 
        AND aul.created_at >= CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $2)
    `;

    const queryParams = [userId, days];
    let paramCount = 2;

    if (apiId) {
      paramCount++;
      baseQuery += ` AND aul.api_id = $${paramCount}`;
      queryParams.push(apiId);
    }

    // Get error summary
    const errorSummaryQuery = `
      SELECT 
        COUNT(*) as total_errors,
        COUNT(DISTINCT aul.api_id) as affected_apis,
        COUNT(DISTINCT aul.api_key_id) as affected_keys,
        COUNT(DISTINCT aul.ip_address) as affected_ips
      ${baseQuery}
    `;

    const errorSummaryResult = await pool.query(errorSummaryQuery, queryParams);
    const errorSummary = errorSummaryResult.rows[0];

    // Get error breakdown by status code
    const statusCodeQuery = `
      SELECT 
        aul.status_code,
        COUNT(*) as error_count,
        COUNT(DISTINCT aul.api_id) as affected_apis,
        COUNT(DISTINCT aul.endpoint) as affected_endpoints
      ${baseQuery}
      GROUP BY aul.status_code
      ORDER BY error_count DESC
    `;

    const statusCodeResult = await pool.query(statusCodeQuery, queryParams);

    // Get top error endpoints
    const endpointErrorsQuery = `
      SELECT 
        aul.endpoint,
        aul.method,
        a.name as api_name,
        COUNT(*) as error_count,
        aul.error_message
      ${baseQuery}
      GROUP BY aul.endpoint, aul.method, a.name, aul.error_message
      ORDER BY error_count DESC
      LIMIT 10
    `;

    const endpointErrorsResult = await pool.query(endpointErrorsQuery, queryParams);

    // Get error timeline
    const errorTimelineQuery = `
      SELECT 
        DATE_TRUNC('hour', aul.created_at) as hour,
        COUNT(*) as error_count,
        COUNT(DISTINCT aul.api_id) as affected_apis
      ${baseQuery}
      GROUP BY DATE_TRUNC('hour', aul.created_at)
      ORDER BY hour DESC
      LIMIT 24
    `;

    const errorTimelineResult = await pool.query(errorTimelineQuery, queryParams);

    res.json({
      success: true,
      data: {
        summary: {
          totalErrors: parseInt(errorSummary.total_errors) || 0,
          affectedApis: parseInt(errorSummary.affected_apis) || 0,
          affectedKeys: parseInt(errorSummary.affected_keys) || 0,
          affectedIps: parseInt(errorSummary.affected_ips) || 0
        },
        statusCodes: statusCodeResult.rows.map(row => ({
          statusCode: row.status_code,
          errorCount: parseInt(row.error_count),
          affectedApis: parseInt(row.affected_apis),
          affectedEndpoints: parseInt(row.affected_endpoints)
        })),
        topErrorEndpoints: endpointErrorsResult.rows.map(row => ({
          endpoint: row.endpoint,
          method: row.method,
          apiName: row.api_name,
          errorCount: parseInt(row.error_count),
          errorMessage: row.error_message
        })),
        timeline: errorTimelineResult.rows.map(row => ({
          hour: row.hour,
          errorCount: parseInt(row.error_count),
          affectedApis: parseInt(row.affected_apis)
        }))
      }
    });

  } catch (error) {
    logger.error('Get error analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve error analytics'
    });
  }
});

module.exports = router;
