import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from 'node:http';
import { startServer } from '../serve.mjs';

test('the local editor serves the surface and validates an example', async () => {
  const server = await startServer(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const modules = ['/lib/glyphs.mjs', '/lib/scene.mjs', '/lib/history.mjs', '/lib/inspector.mjs', '/lib/paint.mjs', '/lib/security.mjs', '/lib/stableJson.mjs'];
    for (const modulePath of modules) {
      const served = await fetch(`${base}${modulePath}`);
      const source = await served.text();
      assert.equal(served.status, 200, modulePath);
      assert.equal(served.headers.get('content-type'), 'text/javascript; charset=utf-8', modulePath);
      assert.equal(source.includes('export '), true, modulePath);
    }
    const html = await fetch(`${base}/`).then((res) => res.text());
    for (const label of ['Validate', 'Run lab', 'Export', 'Undo', 'Redo', 'Clone', 'Group', 'Snap', 'Keyboard']) {
      assert.equal(html.includes(label), true, label);
    }
    assert.equal(html.includes('id="stage"'), true);
    const health = await fetch(`${base}/api/health`).then((res) => res.json());
    assert.equal(health.ok, true);
    const example = await fetch(`${base}/api/examples/dock.intercept-cargo`).then((res) => res.json());
    assert.equal(example.ok, true);
    assert.equal(example.project.schema, 'spaceface.creatorsDock.v1');
    const validated = await fetch(`${base}/api/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: example.project }),
    }).then((res) => res.json());
    assert.equal(validated.ok, true, (validated.issues || []).join('\n'));
    const escaped = await fetch(`${base}/api/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: example.project, out: '../outside' }),
    });
    assert.equal(escaped.status, 400);
    const foreign = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://unrelated.example' },
      body: JSON.stringify({ project: example.project }),
    });
    assert.equal(foreign.status, 403, 'a foreign page must not run local scenarios');
    const reboundStatus = await new Promise((resolve, reject) => {
      const req = request(`${base}/api/health`, { headers: { host: `unrelated.example:${port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(reboundStatus, 403, 'loopback binding must reject a rebound Host');
    const form = await fetch(`${base}/api/save`, {
      method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ project: example.project }),
    });
    assert.equal(form.status, 415);
    const invalidSave = await fetch(`${base}/api/save`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ project: { id: 'invalid_http_regression', schema: 'unknown' } }),
    });
    assert.equal(invalidSave.status, 400, 'invalid documents must not reach the filesystem');
    const invalidBody = await fetch(`${base}/api/validate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null',
    });
    assert.equal(invalidBody.status, 400);
    const missing = await fetch(`${base}/api/examples/not-a-dock`);
    assert.equal(missing.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
