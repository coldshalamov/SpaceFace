// The sim worker's boot rehearsal (no-freeze world-speed work, 2026-11-21): a throwaway Swarm
// fight runs in its own host before the real game, so combat code is compiled before the first
// fight. Nothing of it may reach the real game: storage it wrote is gone and the real host's
// writes still relay to main.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { rehearseSimWorkload } from '../scripts/lib/simRehearsal.mjs';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

test('boot rehearsal fights, then hands storage back to the real host clean', async () => {
  const real = createSimHost(); // the worker builds its host at module load, before the rehearsal
  try {
    const receipt = await rehearseSimWorkload(createSimHost, { scenarioContract, steps: 120, budgetMs: 20000 });
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
    assert.ok(receipt.steps >= 120, 'the rehearsal stepped the sim');
    assert.ok(receipt.deaths > 0, 'the rehearsal fight killed something (weapons, impacts and deaths ran)');
    globalThis.localStorage.setItem('sf.rehearsal.leak', 'x');
    real.reclaimLaneStorage();
    assert.equal(globalThis.localStorage.getItem('sf.rehearsal.leak'), null, 'rehearsal storage is cleared');
    await real.init({ profile: 'production', seed: 4242, scenarioContract, initialSharedStoreKeys: { 'sf.settings': '{}' } });
    real.drainStorageOps();
    globalThis.localStorage.setItem('sf.after.reclaim', 'y');
    const ops = real.drainStorageOps() || [];
    assert.ok(ops.some((op) => op.key === 'sf.after.reclaim'), 'the real host relays its own writes again');
  } finally {
    real.shutdown();
  }
});
