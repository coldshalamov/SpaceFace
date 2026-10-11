import assert from 'node:assert/strict';
import test from 'node:test';
import { startServer } from '../serve.mjs';

test('the local editor serves the surface and validates an example', async () => {
  const server = await startServer(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
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
    const missing = await fetch(`${base}/api/examples/not-a-dock`);
    assert.equal(missing.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
