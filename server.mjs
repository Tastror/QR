import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export function createStaticServer(directory = resolve(projectRoot, 'dist')) {
  return createServer(async (request, response) => {
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
    const send = (status, message, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) { send(405, 'Method not allowed', { Allow: 'GET, HEAD' }); return; }
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/healthz') { send(200, '{"status":"ok","service":"qr"}', { 'Content-Type': 'application/json; charset=utf-8' }); return; }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some((part) => part.startsWith('.'))) { send(404, 'Not found'); return; }
      const root = await realpath(directory);
      const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!path.startsWith(root + sep)) { send(404, 'Not found'); return; }
      const actual = await realpath(path);
      if (!actual.startsWith(root + sep)) { send(404, 'Not found'); return; }
      const info = await stat(actual);
      const type = MIME[extname(actual)];
      if (!info.isFile() || !type) { send(404, 'Not found'); return; }
      response.writeHead(200, {
        'Content-Type': type,
        'Content-Length': info.size,
        'Cache-Control': /^\/assets\/.+-[A-Z0-9]+\./.test(pathname) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = createReadStream(actual);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (error instanceof URIError || error instanceof TypeError) send(400, 'Bad request');
      else if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) send(404, 'Not found');
      else send(500, 'Server error');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createStaticServer();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  server.listen(port, host, () => console.log(`QR listening at http://${host}:${server.address().port}`));
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
