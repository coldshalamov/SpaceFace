import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { createGameServer } = require('../scripts/lib/gameServer.cjs');

const OLD_BOOT = "export function boot() { return 'old'; }";
const NEW_BOOT = [
  'export function boot() {',
  "  const detail = { alpha: 1, beta: 2, gamma: 'three', delta: 'four' };",
  "  return { ready: true, detail, note: 'the replacement is deliberately longer' };",
  '}',
  '',
].join('\n');
const SHORT_BOOT = "export function boot() { return 'new'; }\n";
const OLD_JSON = '{"version":1,"ready":true}';
const NEW_JSON = JSON.stringify({
  version: 2, ready: true,
  flags: { bootGraph: 'rebuilt', startup: 'deferred' },
  notes: ['alpha', 'beta', 'gamma'],
});
const OLD_JSON_BIG = JSON.stringify({
  version: 1, ready: false,
  flags: { bootGraph: 'old', startup: 'eager' },
  notes: ['w', 'x', 'y', 'z'],
  padding: 'keep-this-old-body-clearly-larger-than-the-new-one',
});
const NEW_JSON_SMALL = '{"version":2,"ready":true}';

async function serveFixture(t, files, { async = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-mutable-text-'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), content);
  }
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createGameServer({ root, async, devDiagnostics: false });
  await new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', res);
  });
  t.after(() => new Promise((r) => server.close(r)));
  return { root, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function rewriteBetweenStatAndOpen(t, targetFile, replacement, useAsync) {
  const target = resolve(targetFile);
  let armed = true;
  if (useAsync) {
    const original = fsp.stat;
    fsp.stat = async function hookedStat(file, ...args) {
      const stats = await original.call(this, file, ...args);
      if (armed && resolve(String(file)) === target) {
        armed = false;
        fs.writeFileSync(target, replacement);
      }
      return stats;
    };
    t.after(() => { fsp.stat = original; });
  } else {
    const original = fs.statSync;
    fs.statSync = function hookedStatSync(file, ...args) {
      const stats = original.call(this, file, ...args);
      if (armed && resolve(String(file)) === target) {
        armed = false;
        fs.writeFileSync(target, replacement);
      }
      return stats;
    };
    t.after(() => { fs.statSync = original; });
  }
}

function compileAsClassicFunction(text) {
  return () => new Function(String(text).replace(/^export\s+/gm, ''));
}

test('a source file that grows between stat and open is delivered whole, never truncated to the stale length', async (t) => {
  for (const useAsync of [true, false]) {
    const { root, baseUrl } = await serveFixture(t, { 'boot.js': OLD_BOOT }, { async: useAsync });
    rewriteBetweenStatAndOpen(t, join(root, 'boot.js'), NEW_BOOT, useAsync);

    const response = await fetch(`${baseUrl}/boot.js`);
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.equal(text, NEW_BOOT,
      `async=${useAsync}: the served body must be the complete replacement, not a stale-length truncation`);
    assert.doesNotThrow(compileAsClassicFunction(text),
      `async=${useAsync}: a truncated boot module parses as "Unexpected end of input"`);
  }
});

test('a shrunk source file never advertises a stale larger Content-Length that leaves the client waiting', async (t) => {
  for (const useAsync of [true, false]) {
    const { root, baseUrl } = await serveFixture(t, { 'boot.js': NEW_BOOT }, { async: useAsync });
    rewriteBetweenStatAndOpen(t, join(root, 'boot.js'), SHORT_BOOT, useAsync);

    const controller = new AbortController();
    try {
      const response = await fetch(`${baseUrl}/boot.js`, { signal: controller.signal });
      const declared = response.headers.get('content-length');
      assert.notEqual(declared, String(Buffer.byteLength(NEW_BOOT)),
        `async=${useAsync}: Content-Length must not announce the pre-replacement size (${declared})`);
      const text = await response.text();
      assert.equal(text, SHORT_BOOT, `async=${useAsync}: body must be the full replacement`);
      assert.doesNotThrow(compileAsClassicFunction(text));
    } finally {
      controller.abort();
    }
  }
});

test('a JSON payload that grows between stat and open arrives complete and parses', async (t) => {
  for (const useAsync of [true, false]) {
    const { root, baseUrl } = await serveFixture(t, { 'boot.config.json': OLD_JSON }, { async: useAsync });
    rewriteBetweenStatAndOpen(t, join(root, 'boot.config.json'), NEW_JSON, useAsync);

    const response = await fetch(`${baseUrl}/boot.config.json`);
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.equal(text, NEW_JSON, `async=${useAsync}: the JSON body must equal the full replacement`);
    assert.deepEqual(JSON.parse(text), JSON.parse(NEW_JSON),
      `async=${useAsync}: a truncated config must not be what JSON.parse sees`);
  }
});

test('a shrunk JSON response advertises the new length or none, then still parses', async (t) => {
  for (const useAsync of [true, false]) {
    const { root, baseUrl } = await serveFixture(t, { 'boot.config.json': OLD_JSON_BIG }, { async: useAsync });
    rewriteBetweenStatAndOpen(t, join(root, 'boot.config.json'), NEW_JSON_SMALL, useAsync);

    const controller = new AbortController();
    try {
      const response = await fetch(`${baseUrl}/boot.config.json`, { signal: controller.signal });
      const declared = response.headers.get('content-length');
      assert.notEqual(declared, String(Buffer.byteLength(OLD_JSON_BIG)),
        `async=${useAsync}: Content-Length must not announce the pre-replacement size (${declared})`);
      assert.deepEqual(JSON.parse(await response.text()), JSON.parse(NEW_JSON_SMALL));
    } finally {
      controller.abort();
    }
  }
});

test('stable mutable text keeps its MIME and isolation headers and still honors ETag revalidation', async (t) => {
  const files = {
    'index.html': '<!doctype html><title>x</title>',
    'app.mjs': 'export const v = 1;\n',
    'sheet.css': 'body { margin: 0; }\n',
    'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'data.json': '{"a":1}',
  };
  const { baseUrl } = await serveFixture(t, files);

  const types = {
    'index.html': 'text/html',
    'app.mjs': 'text/javascript',
    'sheet.css': 'text/css',
    'icon.svg': 'image/svg+xml',
    'data.json': 'application/json',
  };
  for (const [name, type] of Object.entries(types)) {
    const response = await fetch(`${baseUrl}/${name}`);
    assert.equal(response.status, 200, name);
    assert.ok((response.headers.get('content-type') || '').startsWith(type), name);
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin', name);
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'credentialless', name);
    assert.equal(response.headers.get('cache-control'), 'no-cache', name);
    assert.equal(response.headers.get('content-length'), null,
      `${name}: mutable text must not pin a stale-able byte length`);
    assert.equal(await response.text(), files[name], name);
  }

  const first = await fetch(`${baseUrl}/app.mjs`);
  const etag = first.headers.get('etag');
  assert.ok(etag, 'mutable text still carries an ETag');
  const revalidate = await fetch(`${baseUrl}/app.mjs`, { headers: { 'If-None-Match': etag } });
  assert.equal(revalidate.status, 304, 'an unchanged mutable file must still answer 304');
  assert.equal(await revalidate.text(), '');
});

test('non-text assets keep a declared Content-Length for the stream', async (t) => {
  const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03]);
  const { baseUrl } = await serveFixture(t, { 'blob.bin': payload });

  const response = await fetch(`${baseUrl}/blob.bin`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(payload.length),
    'binary/unknown types keep the stat-declared length');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload);
});
