import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { probeSpaceFacePort } = require('../scripts/lib/electronLaunchProtocol.cjs');

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}

test('Electron health probe accepts only the bounded SpaceFace health document', async (t) => {
  const port = await listen(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ app: 'SpaceFace', route: '/' }));
  });

  assert.equal(await probeSpaceFacePort(port, { timeoutMs: 250 }), true);
});

test('Electron health probe rejects an oversized response without waiting for its end', async (t) => {
  const port = await listen(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('x'.repeat(512));
  });

  assert.equal(await probeSpaceFacePort(port, { timeoutMs: 500, maxBytes: 128 }), false);
});

test('Electron health probe has an absolute deadline against a byte-drip server', async (t) => {
  const port = await listen(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{');
    const drip = setInterval(() => res.write(' '), 5);
    res.once('close', () => clearInterval(drip));
  });
  const started = Date.now();

  assert.equal(await probeSpaceFacePort(port, { timeoutMs: 60, maxBytes: 4096 }), false);
  assert.ok(Date.now() - started < 500, 'a trickling response must not refresh the absolute deadline');
});
