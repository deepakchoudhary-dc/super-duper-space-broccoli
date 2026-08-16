/**
 * Per-Upstream Circuit Breaker + Active Health Checker
 * ----------------------------------------------------
 * Mirrors what Kong/Envoy do for upstream resilience:
 *
 *  - CLOSED   : normal operation; consecutive failures counted.
 *  - OPEN     : after N consecutive failures the circuit trips; requests fail
 *               fast with 503 (no upstream attempt) for a cooldown window.
 *  - HALF-OPEN: after cooldown, a single probe request is allowed through; if
 *               it succeeds the circuit resets to CLOSED, otherwise it re-opens.
 *
 * Active health checking periodically probes upstream /health endpoints and
 * reports state to Prometheus.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const config = require('../config/env');
const logger = require('./logger');
const metrics = require('./metrics');

const states = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor({ baseUrl, apiId, threshold, cooldownMs, healthPath }) {
    this.baseUrl = baseUrl;
    this.apiId = apiId;
    this.threshold = threshold || config.proxy.circuitBreakerThreshold;
    this.cooldownMs = cooldownMs || config.proxy.circuitBreakerCooldownMs;
    this.healthPath = healthPath || '/health';

    this.state = states.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openUntil = 0;
    this.lastProbeAt = 0;
    this.lastHealthCheckAt = 0;
    this.isHealthy = true;
    this.healthCheckTimer = null;
  }

  /**
   * Called BEFORE forwarding a request. Returns true if the request may proceed.
   */
  allowRequest() {
    const now = Date.now();

    if (this.state === states.CLOSED) {
      return true;
    }

    if (this.state === states.OPEN) {
      // Half-open transition after cooldown
      if (now >= this.openUntil) {
        this.state = states.HALF_OPEN;
        this.successCount = 0;
        logger.warn('Circuit breaker entering HALF_OPEN', { apiId: this.apiId, baseUrl: this.baseUrl });
      } else {
        return false;
      }
    }

    // HALF_OPEN: allow only one probe request at a time
    if (this.state === states.HALF_OPEN) {
      if (now - this.lastProbeAt < 1000) {
        return false;
      }
      this.lastProbeAt = now;
      return true;
    }

    return true;
  }

  /**
   * Called AFTER an upstream request completes.
   * @param {boolean} success
   */
  recordResult(success) {
    if (this.state === states.OPEN) return;

    if (success) {
      this.successCount += 1;
      this.failureCount = 0;
      if (this.state === states.HALF_OPEN && this.successCount >= 1) {
        // Probe succeeded — reset
        this.state = states.CLOSED;
        this.openUntil = 0;
        logger.info('Circuit breaker reset to CLOSED', { apiId: this.apiId });
      }
    } else {
      this.failureCount += 1;
      if (this.state === states.HALF_OPEN || this.failureCount >= this.threshold) {
        this.trip();
      }
    }
    this.syncMetrics();
  }

  trip() {
    this.state = states.OPEN;
    this.openUntil = Date.now() + this.cooldownMs;
    this.failureCount = 0;
    logger.logSecurityEvent('CIRCUIT_OPENED', {
      apiId: this.apiId,
      baseUrl: this.baseUrl,
      cooldownMs: this.cooldownMs
    });
    this.syncMetrics();
  }

  syncMetrics() {
    metrics.setCircuitBreakerState(this.apiId, this.state === states.CLOSED);
  }

  getState() {
    return this.state;
  }

  // -------------------------------------------------------------------------
  // Active health checking
  // -------------------------------------------------------------------------
  startHealthCheck() {
    if (this.healthCheckTimer) return;
    const intervalMs = config.proxy.healthCheckIntervalMs;
    this.healthCheckTimer = setInterval(() => this.probeHealth(), intervalMs);
    this.healthCheckTimer.unref();
    // Run an immediate probe shortly after registration
    setTimeout(() => this.probeHealth(), 1000).unref();
  }

  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  probeHealth() {
    const now = Date.now();
    if (now - this.lastHealthCheckAt < 5000) return; // rate limit probes
    this.lastHealthCheckAt = now;

    const target = `${this.baseUrl.replace(/\/+$/, '')}${this.healthPath.startsWith('/') ? '' : '/'}${this.healthPath}`;

    let url;
    try {
      url = new URL(target);
    } catch (err) {
      this.isHealthy = false;
      return;
    }

    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        timeout: config.proxy.healthCheckTimeoutMs,
        headers: { 'User-Agent': 'api-guardian-healthcheck/1.0' }
      },
      (res) => {
        res.resume();
        const healthy = res.statusCode >= 200 && res.statusCode < 400;
        this.isHealthy = healthy;
        if (!healthy) {
          this.recordResult(false);
        }
        logger.debug('Upstream health probe', {
          apiId: this.apiId,
          target,
          statusCode: res.statusCode,
          healthy
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('healthcheck timeout'));
    });

    req.on('error', () => {
      this.isHealthy = false;
      this.recordResult(false);
      logger.warn('Upstream health probe failed', { apiId: this.apiId, target });
    });
  }

  destroy() {
    this.stopHealthCheck();
  }
}

// ---------------------------------------------------------------------------
// Registry (shared across proxy instances)
// ---------------------------------------------------------------------------
const breakers = new Map(); // baseUrl -> CircuitBreaker

const getCircuitBreaker = ({ baseUrl, apiId, healthPath }) => {
  if (!breakers.has(baseUrl)) {
    breakers.set(baseUrl, new CircuitBreaker({ baseUrl, apiId, healthPath }));
  }
  return breakers.get(baseUrl);
};

const getBreakerState = (baseUrl) => {
  const breaker = breakers.get(baseUrl);
  return breaker ? breaker.getState() : states.CLOSED;
};

const destroyAll = () => {
  for (const breaker of breakers.values()) {
    breaker.destroy();
  }
  breakers.clear();
};

module.exports = {
  CircuitBreaker,
  getCircuitBreaker,
  getBreakerState,
  destroyAll,
  states
};
