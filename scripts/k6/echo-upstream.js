/**
 * Standalone echo upstream used by the k6 load tests and the CI perf gate.
 * Run it in the background, then point the registered API at it:
 *
 *   node scripts/k6/echo-upstream.js &
 *
 * Serves:
 *   /ping            -> 200 'pong'            (load + rate-limit tests)
 *   /cached-resource -> 200 versioned body    (cache HIT test)
 */
const http = require('http');

const PORT = parseInt(process.env.ECHO_PORT, 10) || 5199;

let hitCount = 0;

const server = http.createServer((req, res) => {
  hitCount += 1;

  if (req.url === '/cached-resource') {
    // Versioned body — a cache HIT must return the FIRST version
    res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Upstream': 'echo' });
    res.end(`cached-version-1`);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'X-Upstream': 'echo',
    'X-Upstream-Hits': String(hitCount),
  });
  res.end('pong');
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`k6 echo upstream listening on http://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
