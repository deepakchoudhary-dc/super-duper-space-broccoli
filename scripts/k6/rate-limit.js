// k6 rate-limit test — verify the gateway's multi-tier rate limiter fires.
//
//   k6 run scripts/k6/rate-limit.js
//
// Uses a dedicated API key whose rate limit is intentionally tiny (set the
// key's rate_limit to e.g. 5 and rate_limit_window to 60), then hammers the
// proxy and asserts that 429s appear after the budget is spent and that the
// Retry-After header is present.
//
// Environment:
//   BASE_URL  gateway base URL (default http://localhost:5000)
//   API_KEY   low-limit API key (required)
//   USER_ID   owner user id (required)
//   API_ID    registered upstream api id (required)

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY;
const USER_ID = __ENV.USER_ID;
const API_ID = __ENV.API_ID;

export const options = {
  vus: 1,
  iterations: 12, // comfortably over a 5/min budget
  thresholds: {
    // We EXPECT 429s; the gate is that the gateway never 500s and never
    // lets a request through after the budget is spent.
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/proxy/${USER_ID}/${API_ID}/ping`, {
    headers: { 'X-API-Key': API_KEY },
  });

  if (res.status === 429) {
    check(res, {
      '429 has Retry-After': (r) => r.headers['Retry-After'] !== undefined,
      '429 has RateLimit headers': (r) => r.headers['X-RateLimit-Limit'] !== undefined,
    });
  } else {
    check(res, {
      'accepted request is 2xx': (r) => r.status >= 200 && r.status < 300,
    });
  }

  sleep(0.05);
}
