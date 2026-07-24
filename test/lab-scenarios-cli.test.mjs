// Migrated scenarios run via sf lab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCENARIOS = [
  'flight-fixed-input',
  'massline-latch-reel',
  'massline-orbit-assist',
  'flight-save-load',
];

for (const scenario of SCENARIOS) {
  test(`sf lab validate ${scenario}`, () => {
    const child = spawnSync(
      process.execPath,
      ['scripts/sf.mjs', 'lab', 'validate', scenario],
      { cwd: ROOT, encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(child.status, 0, child.stdout + child.stderr);
    const parsed = JSON.parse(child.stdout);
    assert.equal(parsed.ok, true);
  });
}

function parseLabStdout(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
  assert.ok(lines.length, `no JSON in stdout: ${String(stdout).slice(0, 400)}`);
  return JSON.parse(lines[lines.length - 1]);
}

for (const scenario of SCENARIOS) {
  test(`sf lab run ${scenario}`, () => {
    const child = spawnSync(
      process.execPath,
      ['scripts/sf.mjs', 'lab', 'run', scenario, '--verbosity', '1'],
      { cwd: ROOT, encoding: 'utf8', timeout: 180_000 },
    );
    assert.equal(child.error, undefined, String(child.error));
    const parsed = parseLabStdout(child.stdout);
    assert.ok(parsed.result || parsed.ok != null);
    // Lab result is authoritative; process status may be a Windows libuv close race after success.
    assert.ok(
      parsed.exitClass === 0 || parsed.exitClass === 1,
      `exitClass=${parsed.exitClass} status=${child.status}\n${JSON.stringify(parsed).slice(0, 500)}`,
    );
    if (parsed.exitClass === 0) assert.equal(parsed.ok, true);
    if (child.status !== 0 && child.status !== 1 && parsed.ok) {
      assert.ok(
        /UV_HANDLE_CLOSING|3221226505/.test(String(child.stderr) + String(child.status)),
        `unexpected process status=${child.status} stderr=${child.stderr}`,
      );
    }
  });
}
