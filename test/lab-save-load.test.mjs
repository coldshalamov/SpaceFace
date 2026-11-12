// Uninterrupted == save/load continuation — G1 exact same-engine identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { compareSaveLoad } from '../src/testing/lab/saveLoadCompare.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const saveLoadDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-save-load.scenario.json'),
  'utf8',
));

test('uninterrupted == in-place save/load continuation — G1 exact identity', async () => {
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: 40,
  });
  assert.notEqual(result.exitClass, 3, `infra: ${JSON.stringify(result.withSaveLoad && result.withSaveLoad.error)}`);
  assert.notEqual(result.exitClass, 4, 'invalid config');
  assert.ok('uninterruptedTraceHash' in result);
  assert.ok('saveLoadTraceHash' in result);
  assert.equal(result.ok, true, `save/load must preserve the authoritative body: ${JSON.stringify({
    status: result.status,
    first: result.firstDivergentTick,
    field: result.firstDivergentField,
    expected: result.uninterruptedTraceHash,
    actual: result.saveLoadTraceHash,
  })}`);
  assert.equal(result.uninterruptedTraceHash, result.saveLoadTraceHash);
  assert.equal(result.uninterruptedHash, result.saveLoadHash);
  assert.equal(result.firstDivergentTick, null);
  assert.equal(result.equivalence['uninterrupted-eq-save-load'].ok, true);
  assert.equal(result.contract, 'deterministic-covered');
});

test('sf lab compare flight-save-load reports exact identity', () => {
  const child = spawnSync(
    process.execPath,
    [join(ROOT, '../scripts/sf.mjs'), 'lab', 'compare', 'flight-save-load', '--verbosity', '1'],
    { cwd: join(ROOT, '..'), encoding: 'utf8', timeout: 180_000 },
  );
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, `stderr=${child.stderr}\nstdout=${child.stdout?.slice(0, 2500)}`);
  const parsed = JSON.parse(child.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.result?.uninterruptedTraceHash, parsed.result?.saveLoadTraceHash);
  assert.equal(parsed.result?.firstDivergentTick, null);
});
