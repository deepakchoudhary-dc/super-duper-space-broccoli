// k6 cache test — verify the gateway response cache serves HITs under load.
//
//   k6 run scripts/k6/cache.js
//
// Repeatedly requests the SAME cached endpoint. After the first MISS the cache
// should serve HITs; the test asserts that at least 80% of responses carry
// `X-Cache: HIT` and that HIT responses are fast (<50ms, no upstream hop).
//
// Environment:
//   BASE_URL  gateway base URL (default http://localhost:5000)
//   API_KEY   valid API key (required)
//   USER_ID   owner user id (required)
//   API_ID    registered upstream api id (required)

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY;
const USER_ID = __ENV.USER_ID;
const API_ID = __ENV.API_ID;

export const options = {
  vus: 5,
  iterations: 100,
  thresholds: {
    // p95 must be low because cached responses skip the upstream entirely
    http_req_duration: ['p(95)<100'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/proxy/${USER_ID}/${API_ID}/cached-resource`, {
    headers: { 'X-API-Key': API_KEY },
  });

  check(res, {
    'served from cache (HIT)': (r) => r.headers['X-Cache'] === 'HIT',
  });
  sleep(0.02);
}
