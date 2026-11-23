import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A controllable local HTTP server used as a monitoring target and webhook receiver. */
export async function startTargetServer() {
  const state = { status: 200, delayMs: 0, requests: [] as RecordedRequest[] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      state.requests.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      setTimeout(() => {
        if (res.destroyed) return;
        res.statusCode = state.status;
        res.end(JSON.stringify({ ok: state.status < 400 }));
      }, state.delayMs);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    state,
    url: (path = '/') => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
