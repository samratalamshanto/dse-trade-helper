import http from 'node:http';

// Dev only: hands the trades key to the owner's browser. Bound to 127.0.0.1 so only this machine can connect; headers are not trusted.
const ALLOWED = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

export const allowedOrigin = (origin: string | undefined): origin is string => !!origin && ALLOWED.has(origin);

export function startDevKeyServer(port = Number(process.env.NEXT_PUBLIC_DEV_KEY_PORT ?? 3011)): http.Server | undefined {
  const g = globalThis as { devKeyServer?: http.Server };
  if (g.devKeyServer) return g.devKeyServer; // hot reload runs register() again
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' || req.url !== '/trades-key') { res.writeHead(404).end(); return; }
    const origin = req.headers.origin;
    if (!allowedOrigin(origin)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
    res.end(JSON.stringify({ key: process.env.TRADES_API_KEY ?? '' }));
  });
  server.on('error', (e) => console.warn(`dev key server not started on 127.0.0.1:${port}; the trades key box stays`, e));
  server.listen(port, '127.0.0.1');
  g.devKeyServer = server;
  return server;
}
