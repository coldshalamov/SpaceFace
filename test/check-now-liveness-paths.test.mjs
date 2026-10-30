import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('NOW liveness accepts exact plain src and test paths while retaining backticks', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spaceface-now-liveness-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'design', 'program'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'systems'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'fixture'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'scripts', 'check-now-liveness.mjs'),
    path.join(root, 'scripts', 'check-now-liveness.mjs'),
  );
  fs.writeFileSync(path.join(root, 'src', 'systems', 'stationBroadcast.js'), 'export {};\n');
  fs.writeFileSync(path.join(root, 'src', 'fixture', 'backtick.js'), 'export {};\n');
  fs.writeFileSync(path.join(root, 'test', 'inf-station-market-broadcast.test.mjs'), '');
  fs.writeFileSync(path.join(root, 'design', 'program', 'NOW.md'), [
    '# NOW',
    '',
    '## Active mutation windows',
    '',
    '| Task | Thread | State | Exact paths being changed now | Next terminal action |',
    '|---|---|---|---|---|',
    '| plain paths | plain-thread | active | first unit: src/systems/stationBroadcast.js + new test/inf-station-market-broadcast.test.mjs | continue |',
    '| backtick path | backtick-thread | active | `src/fixture/backtick.js` | continue |',
    '| prose only | prose-thread | active | source and test locations are being discussed | continue |',
    '',
  ].join('\n'));

  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-now-liveness.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /LIVE\s+plain paths \[plain-thread\] — newest progress: \d+ min ago/);
  assert.match(result.stdout, /LIVE\s+backtick path \[backtick-thread\] — newest progress: \d+ min ago/);
  assert.match(result.stdout, /STALE\s+prose only \[prose-thread\] — newest progress: no claimed file found on disk/);
});
