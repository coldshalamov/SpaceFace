// O24: the retail-boot gate's argument handling, plan and static-server helpers.
// No browser, no build, no network: --dry-run must never launch anything.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHECK_NAMES, NEW_GAME_SELECTOR, UsageError, buildPlan, isCancelledAssetRequest, mimeTypeFor, parseArgs, parseRange,
  resolveStaticFile,
} from '../scripts/check-retail-boot.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/check-retail-boot.mjs', import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 30_000 });
}

test('--dry-run prints the whole plan and exits 0 without a bundle on disk', () => {
  const result = run('--dry-run');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /plan mode: build then boot/);
  assert.match(result.stdout, /plan build: node scripts\/build-bundle\.mjs -> build\/web/);
  assert.match(result.stdout, /plan serve: build\/web on an ephemeral 127\.0\.0\.1 port/);
  assert.match(result.stdout, /plan browser: headless chromium on software GL/);
  assert.ok(result.stdout.includes(NEW_GAME_SELECTOR), 'names the menu marker it waits for');
  assert.match(result.stdout, /window\.SF defined/);
  for (const name of CHECK_NAMES) assert.ok(result.stdout.includes(name), `plan lists check ${name}`);
  assert.match(result.stdout, /dry-run OK/);
  assert.doesNotMatch(result.stdout, /PASS|FAIL/, 'a dry run must not report check verdicts');
});

test('--dry-run --use-existing skips the build and honours --dir/--menu-timeout-ms', () => {
  const dir = mkdtempSync(join(tmpdir(), 'retail-boot-test-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    const result = run('--dry-run', '--use-existing', `--dir=${dir}`, '--menu-timeout-ms=90000');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /plan mode: boot an existing bundle \(no build\)/);
    assert.match(result.stdout, /plan build: skipped/);
    assert.match(result.stdout, /within 90000 ms/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown flag or a bad number is a usage error (exit 2), not a run', () => {
  for (const args of [['--bogus'], ['--dry-run', '--menu-timeout-ms=abc'], ['--menu-timeout-ms=5'], ['--dry-run=1']]) {
    const result = run(...args);
    assert.equal(result.status, 2, `${args.join(' ')} -> ${result.status}`);
    assert.match(result.stderr, /\[retail-boot\]/);
    assert.doesNotMatch(result.stdout, /PASS|FAIL/);
  }
});

test('--use-existing with no bundle on disk is a usage error that says how to get one', () => {
  const missing = join(tmpdir(), 'retail-boot-definitely-missing-dir');
  const result = run('--dry-run', `--dir=${missing}`);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no retail bundle/);
  assert.match(result.stderr, /build:bundle/);
});

test('parseArgs and buildPlan are pure and agree with each other', () => {
  const options = parseArgs([]);
  assert.equal(options.build, true);
  assert.equal(options.dryRun, false);
  assert.equal(parseArgs(['--use-existing']).build, false);
  assert.equal(parseArgs([`--dir=${resolve('x')}`]).build, false, '--dir serves a prebuilt folder, so it never builds');
  assert.throws(() => parseArgs(['--nope']), UsageError);
  assert.ok(buildPlan(options).some((line) => line.startsWith('checks: ')));
});

test('static server helpers: MIME types the retail bundle needs, Range parsing, no traversal', () => {
  assert.match(mimeTypeFor('chunk-ABCD1234.js'), /^text\/javascript/);
  assert.equal(mimeTypeFor('rapier.wasm'), 'application/wasm');
  assert.equal(mimeTypeFor('ship.GLB'), 'model/gltf-binary');
  assert.equal(mimeTypeFor('intro.mp4'), 'video/mp4');
  assert.equal(mimeTypeFor('mystery.xyz'), 'application/octet-stream');

  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=50-5000', 100), { start: 50, end: 99 });
  assert.equal(parseRange('bytes=100-', 100), 'bad');
  assert.equal(parseRange('bytes=abc', 100), 'bad');
  assert.equal(parseRange(undefined, 100), null);

  const dir = mkdtempSync(join(tmpdir(), 'retail-boot-static-'));
  try {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'index.html'), 'root');
    writeFileSync(join(dir, 'sub', 'index.html'), 'sub');
    writeFileSync(join(dir, 'a b.js'), 'x');
    assert.equal(resolveStaticFile(dir, '/'), join(dir, 'index.html'));
    assert.equal(resolveStaticFile(dir, '/sub/?x=1'), join(dir, 'sub', 'index.html'));
    assert.equal(resolveStaticFile(dir, '/a%20b.js#frag'), join(dir, 'a b.js'));
    assert.equal(resolveStaticFile(dir, '/missing.js'), null);
    assert.equal(resolveStaticFile(dir, '/../secret'), null);
    assert.equal(resolveStaticFile(dir, '/%2e%2e/secret'), null);
    assert.equal(resolveStaticFile(dir, '/%E0%A4%A'), null, 'malformed escape is a miss, not a throw');
    assert.equal(resolveStaticFile(dir, '/a%00.js'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a game-cancelled asset load is a note; a cancelled chunk, a 404, or any other failure still fails', () => {
  const base = 'http://127.0.0.1:63286';
  // The two exact lines the first real run produced on a clean boot.
  assert.equal(isCancelledAssetRequest({ type: 'error', text: `Request failed ${base}/assets/ships/release/render-packages/pod-repair-patch/render.glb: net::ERR_ABORTED` }), true);
  assert.equal(isCancelledAssetRequest({ type: 'error', text: `Request failed ${base}/assets/ships/release/render-packages/works-massline-core/render.glb: net::ERR_ABORTED` }), true);
  // Aborted code is never excused: a half-loaded chunk or worker is a broken boot.
  assert.equal(isCancelledAssetRequest({ type: 'error', text: `Request failed ${base}/chunk-ABCD1234.js: net::ERR_ABORTED` }), false);
  assert.equal(isCancelledAssetRequest({ type: 'error', text: `Request failed ${base}/workers/sim.js: net::ERR_ABORTED` }), false);
  // Other failure classes and missing files are never excused.
  assert.equal(isCancelledAssetRequest({ type: 'error', text: `Request failed ${base}/assets/x.glb: net::ERR_CONNECTION_RESET` }), false);
  assert.equal(isCancelledAssetRequest({ type: 'error', text: `HTTP 404 ${base}/assets/x.glb` }), false);
  assert.equal(isCancelledAssetRequest({ type: 'pageerror', text: `Request failed ${base}/assets/x.glb: net::ERR_ABORTED` }), false);
  assert.equal(isCancelledAssetRequest(null), false);
});
