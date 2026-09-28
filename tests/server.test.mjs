import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../server.mjs';

let server;
let base;
before(async () => {
  server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('serves the complete page and every referenced build asset', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('content-security-policy'), /worker-src 'self' blob:/);
  assert.equal(response.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=()');
  const html = await response.text();
  assert.match(html, /生成二维码/);
  const assets = [...html.matchAll(/(?:src|href)="(\/[^\"]+)"/g)].map((match) => match[1]);
  assert.ok(assets.length >= 3);
  for (const asset of assets) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200, asset);
    assert.ok(Number(response.headers.get('content-length')) > 0, asset);
    if (asset.startsWith('/assets/')) assert.match(response.headers.get('cache-control'), /immutable/);
  }
});

test('health and HEAD requests work without exposing source or accepting uploads', async () => {
  assert.deepEqual(await (await fetch(base + '/healthz')).json(), { status: 'ok', service: 'qr' });
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/server.mjs', '/.env', '/package.json', '/%2e%2e%2fpackage.json', '/assets/../../.git/config', '/missing.js']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base + '/%E0%A4%A')).status, 400);
  const upload = await fetch(base, { method: 'POST', body: 'private content' });
  assert.equal(upload.status, 405);
  assert.equal(upload.headers.get('allow'), 'GET, HEAD');
});
