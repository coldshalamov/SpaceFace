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

test('uninterrupted == save/load continuation — G1 exact identity (no ULP soft-pass)', async () => {
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 1,
    saveLoadAt: 40,
  });
  assert.notEqual(result.exitClass, 3, `infra: ${JSON.stringify(result.withSaveLoad && result.withSaveLoad.error)}`);
  assert.notEqual(result.exitClass, 4, 'invalid config');
  assert.ok('uninterruptedTraceHash' in result);
  assert.ok('saveLoadTraceHash' in result);

  // G1: pass only on exact identity. Unequal trace hashes or any tick field delta → fail.
  if (result.ok) {
    assert.equal(result.uninterruptedTraceHash, result.saveLoadTraceHash);
    assert.equal(result.uninterruptedHash, result.saveLoadHash);
    assert.equal(result.firstDivergentTick, null);
    assert.equal(result.equivalence['uninterrupted-eq-save-load'].ok, true);
    assert.equal(result.contract, 'deterministic-covered');
  } else {
    assert.equal(result.status, 'parity-fail');
    assert.ok(
      result.firstDivergentTick != null
        || result.uninterruptedTraceHash !== result.saveLoadTraceHash,
      `parity-fail must surface intermediate divergence: ${JSON.stringify({
        first: result.firstDivergentTick,
        field: result.firstDivergentField,
        t0: result.uninterruptedTraceHash,
        t1: result.saveLoadTraceHash,
      })}`,
    );
    // False-green closed: final-hash match must not override unequal traces.
    if (result.uninterruptedHash === result.saveLoadHash
      && result.uninterruptedTraceHash !== result.saveLoadTraceHash) {
      assert.equal(result.ok, false);
    }
  }
});

test('sf lab compare flight-save-load reports exact identity or honest fail', () => {
  const child = spawnSync(
    process.execPath,
    [join(ROOT, '../scripts/sf.mjs'), 'lab', 'compare', 'flight-save-load', '--verbosity', '1'],
    { cwd: join(ROOT, '..'), encoding: 'utf8', timeout: 180_000 },
  );
  assert.equal(child.error, undefined, String(child.error));
  // Exit 0 only when exact; exit 5 when parity-fail with first divergent tick.
  assert.ok(child.status === 0 || child.status === 5, `stderr=${child.stderr}\nstdout=${child.stdout?.slice(0, 2500)}`);
  const parsed = JSON.parse(child.stdout);
  if (parsed.ok) {
    assert.equal(parsed.result.uninterruptedTraceHash, parsed.result.saveLoadTraceHash);
  } else {
    assert.equal(parsed.exitClass, 5);
    assert.ok(
      parsed.result?.firstDivergentTick != null
        || parsed.result?.uninterruptedTraceHash !== parsed.result?.saveLoadTraceHash,
    );
  }
});
