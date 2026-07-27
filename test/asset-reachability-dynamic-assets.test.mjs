import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('packaging parity gate owns the dynamic asset reachability contract', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(
    pkg.scripts['check:m6:packaging'],
    /test\/asset-reachability-dynamic-assets\.test\.mjs/,
    'the packaging gate must run the dynamic-registry regression test before its bundle probe',
  );
});

test('asset reachability reports every dynamic runtime media registry', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-asset-reachability.mjs', '--json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(
    result.stdout.trimStart(),
    /^\{/,
    '--json must emit a machine-readable report instead of the human summary',
  );

  const report = JSON.parse(result.stdout);
  assert.equal(report.pass, true, JSON.stringify(report.issues));
  assert.equal(report.dynamicRegistries.portraits.length, 15);
  assert.equal(report.dynamicRegistries.wreckCathedralEvidence.length, 5);
  assert.equal(report.dynamicRegistries.thrusterTextures.length, 9);
  assert.ok(
    report.dynamicRegistries.thrusterTextures.includes('assets/fx/thruster/plume_core_flow_v1.png'),
  );
  assert.ok(
    report.dynamicRegistries.portraits.includes('assets/portraits/portrait_kessler.jpg'),
  );
  assert.ok(
    report.dynamicRegistries.wreckCathedralEvidence.includes(
      'assets/ships/release/media/wreck-cathedral/neutral_gameplay_distance.png',
    ),
  );
});
