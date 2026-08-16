// k6 load test — sustained proxy throughput with hard performance gates.
//
//   k6 run scripts/k6/load.js
//
// Ramp from 1 to 50 VUs over 30s, hold 60s, then ramp down. Fails the run if:
//   - p95 latency exceeds 500ms (proxy + upstream round-trip budget)
//   - more than 1% of requests error (5xx/429 from the gateway)
//
// Environment:
//   BASE_URL  gateway base URL (default http://localhost:5000)
//   API_KEY   valid API key (required)
//   USER_ID   owner user id (required)
//   API_ID    registered upstream api id (required)

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY;
const USER_ID = __ENV.USER_ID;
const API_ID = __ENV.API_ID;

export const options = {
  stages: [
    { duration: '10s', target: 1 },   // warm up
    { duration: '30s', target: 50 },  // ramp up
    { duration: '60s', target: 50 },  // sustained load
    { duration: '10s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],     // p95 under 500ms
    http_req_failed: ['rate<0.01'],       // <1% errors
    http_reqs: ['rate>100'],              // >100 req/s sustained
  },
};

export default function () {
  if (!API_KEY || !USER_ID || !API_ID) {
    throw new Error('API_KEY, USER_ID and API_ID env vars are required');
  }

  const res = http.get(`${BASE_URL}/proxy/${USER_ID}/${API_ID}/ping`, {
    headers: {
      'X-API-Key': API_KEY,
      // Ask for gzip to exercise the compression path
      'Accept-Encoding': 'gzip',
    },
  });

  check(res, {
    'status < 500': (r) => r.status < 500,
    'has request id': (r) => r.headers['X-Request-Id'] !== undefined,
  });
}
