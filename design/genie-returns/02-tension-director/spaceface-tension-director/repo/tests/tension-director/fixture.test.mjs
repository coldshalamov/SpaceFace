import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenario } from '../../../fixture/simulation.mjs';

test('fixed-seed integrated consumer trace matches across an owner save/restore', async () => {
  const a = await runScenario({ archetype: 'improviser', seed: 4242, seconds: 1800 });
  const b = await runScenario({ archetype: 'improviser', seed: 4242, seconds: 1800, checkpointAt: 800 });
  assert.equal(a.policyHash, b.policyHash);
  assert.equal(a.receiptsHash, b.receiptsHash);
  assert(a.summary.combatSpawns > 0);
  assert(a.changes.some((r) => r.phase === 'recovery'));
  assert(a.changes.some((r) => r.phase === 'peak'));
  assert(a.changes.some((r) => r.phase === 'aftermath'));
});
test('legacy A/B arm is explicit and active rather than a disconnected baseline', async () => {
  const a = await runScenario({ seed: 8008, seconds: 900, enabled: false });
  assert.equal(a.summary.directorDecisions, 0);
  assert(a.summary.combatSpawns > 0);
  assert(a.timeline.some((r) => r.phase === 'violence'));
});
