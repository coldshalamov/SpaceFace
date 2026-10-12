import assert from 'node:assert/strict';
import test from 'node:test';
import { setLaneDraftView, snapshotSurvivalDraft, SURVIVAL_DRAFT_READS } from '../src/core/simLaneCommands.js';

// Worker lane: survivalDraft lives in the worker; without a main-side facade the Swarm armory
// read "No equipment matches this search". The worker snapshots the owner's read surface and
// the facade answers the screen from it.
test('snapshotSurvivalDraft copies every read the armory screen makes', () => {
  const owner = Object.fromEntries(SURVIVAL_DRAFT_READS.map((n) => [n, () => (n === 'currentOffers' ? [{ id: 'o1', defId: 'wpn_x', price: 5 }] : n === 'currentWave' ? 1 : null)]));
  const snap = snapshotSurvivalDraft(owner);
  assert.deepEqual(Object.keys(snap).sort(), [...SURVIVAL_DRAFT_READS].sort());
  assert.equal(snap.currentOffers.length, 1);
  assert.equal(snapshotSurvivalDraft(null), null);
});

test('worker-lane registry answers survivalDraft from the shipped view', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(src, /case 'survivalDraft':/, 'registry has a survivalDraft lane facade');
  const host = (await import('node:fs')).readFileSync(new URL('../scripts/lib/simWorkerHost.mjs', import.meta.url), 'utf8');
  assert.match(host, /draftView: survivalDraftViewIfChanged\(state\)/, 'worker ships the armory view on tick replies');
  const main = (await import('node:fs')).readFileSync(new URL('../src/core/simLaneMain.js', import.meta.url), 'utf8');
  assert.match(main, /setLaneDraftView\(msg\.draftView\)/, 'main stores the shipped view');
  setLaneDraftView({ currentOffers: [{ id: 'a' }], currentWave: 2 });
  setLaneDraftView(null);
});
