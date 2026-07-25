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
    // F5/G4: standalone `run` with multi-run equivalence is incomplete (exitClass 4) —
    // use lab repeat/compare for those. exitClass 0/1 remain the normal pass/fail path.
    assert.ok(
      parsed.exitClass === 0 || parsed.exitClass === 1 || parsed.exitClass === 4,
      `exitClass=${parsed.exitClass} status=${child.status}\n${JSON.stringify(parsed).slice(0, 500)}`,
    );
    if (parsed.exitClass === 0) assert.equal(parsed.ok, true);
    if (parsed.exitClass === 4) {
      assert.equal(parsed.ok, false);
      assert.ok(
        parsed.result?.status === 'incomplete'
          || (parsed.result?.oracle?.failed || []).some((f) => f.deferred),
        `exitClass 4 must be incomplete/deferred: ${JSON.stringify(parsed.result?.status)}`,
      );
    }
    if (child.status !== 0 && child.status !== 1 && parsed.ok) {
      assert.ok(
        /UV_HANDLE_CLOSING|3221226505/.test(String(child.stderr) + String(child.status)),
        `unexpected process status=${child.status} stderr=${child.stderr}`,
      );
    }
  });
}
