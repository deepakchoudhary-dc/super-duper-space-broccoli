// k6 smoke test — one-shot sanity check that the gateway is up and serving.
//
//   k6 run scripts/k6/smoke.js
//
// Environment:
//   BASE_URL  gateway base URL (default http://localhost:5000)
//   API_KEY   a valid API key for the target upstream (required for /proxy)
//   USER_ID   owner user id (required for /proxy)
//   API_ID    registered upstream api id (required for /proxy)

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY;
const USER_ID = __ENV.USER_ID;
const API_ID = __ENV.API_ID;

export const options = {
  vus: 1,
  iterations: 3,
  thresholds: {
    http_req_failed: ['rate<0.01'], // allow zero tolerance for smoke
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health returns 200/503 (degraded ok)': (r) => r.status === 200 || r.status === 503,
  });

  if (API_KEY && USER_ID && API_ID) {
    const proxy = http.get(`${BASE_URL}/proxy/${USER_ID}/${API_ID}/ping`, {
      headers: { 'X-API-Key': API_KEY },
    });
    check(proxy, {
      'proxy request accepted': (r) => r.status < 500,
    });
  }

  sleep(0.1);
}
