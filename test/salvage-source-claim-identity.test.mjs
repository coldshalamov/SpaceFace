// Salvage source claim identity — two ownership-seam regressions in salvage.js.
//
// 1) Stale point.entityId misdirection. `points[].entityId` is a bare numeric id, not a
//    world-ledger reference: when the bound source body dies through a path that never
//    retires the point (combat kill, teardown, lifetime cull), the id goes back through
//    freeIds and the next spawn occupies it. _entityForPoint's fast path used to trust the
//    id with only an alive check, so claimSource() stamped `salvorClaimedBy` on the foreign
//    body and _syncSourceEntity() wrote `salvagePool` onto it — a phantom claim/pool that
//    releaseSourceClaim's data-matched sweep could never reach.
//
// 2) Unreleasable stamp on ledger loss. releaseSourceClaim used to refuse (ok:false) before
//    running the stamp sweep whenever the source record was absent or named a different
//    claimant — so a body that kept `salvageSourceKey`+`salvorClaimedBy` past a ledger row
//    loss stayed custody-locked forever (traffic._clearSalvorClaim delegates source-bound
//    release wholly to this API and never deletes the data stamp itself).

import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { VESTA_DERELICT_SALVAGE_SOURCE as SOURCE } from '../src/data/sectorZones.js';
import { salvage } from '../src/systems/salvage.js';

const SCRAP = 'cmdty_scrap_metal';
const CLAIMANT = 'wr_salvor_41';
const poolTotal = (pool) => Object.values(pool || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);

function boot(t) {
  const sim = createSimulation({ seed: 4242, systems: [salvage] });
  t.after(() => sim.dispose());
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SOURCE.sectorId;
  sim.bus.emit('sector:enter', { sectorId: SOURCE.sectorId });
  const wreck = sim.state.entityList.find((entity) => entity.alive !== false
    && entity.data && entity.data.salvageSourceKey === SOURCE.sourceKey);
  assert.ok(wreck, 'sector entry materializes the Vesta source wreck');
  const point = sim.state.salvage.points.find((p) => p && p.sourceKey === SOURCE.sourceKey);
  assert.ok(point, 'the source point is planned');
  assert.equal(point.entityId, wreck.id, 'the point binds the spawned body');
  return { sim, state: sim.state, wreck, point, api: sim.helpers.salvage };
}

// Kill the bound body through the non-ledger path (no retire), then let the next spawn
// recycle its id onto an unrelated ship — the production freeIds mechanism, not a mock.
function recycleWreckId({ sim, state, wreck }) {
  const deadId = wreck.id;
  assert.equal(sim.helpers.removeEntity(deadId, { immediate: true }), true);
  assert.equal(state.entities.has(deadId), false);
  const foreign = sim.spawn({
    type: 'ship', team: 1, pos: { x: 50, z: 50 }, radius: 6, mass: 100,
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {},
  });
  assert.equal(foreign.id, deadId, 'the foreign body recycles the dead source id');
  assert.equal(state.entities.get(deadId), foreign);
  return foreign;
}

test('a recycled entity id cannot take a source claim stamp meant for the dead wreck', (t) => {
  const ctx = boot(t);
  const foreign = recycleWreckId(ctx);

  const claimed = ctx.api.claimSource({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT, workId: 'job:41' });
  assert.equal(claimed.ok, true, 'the ledger claim itself still lands');
  assert.equal(claimed.source.claimId, CLAIMANT);
  assert.equal(foreign.data.salvorClaimedBy, undefined,
    'the recycled-id ship must not inherit the wreck claim stamp');
  assert.equal(ctx.api.entityForPoint(SOURCE.salvagePointId, SOURCE.sourceKey), null,
    'no live body still carries this source point');
  assert.equal(ctx.point.entityId, null, 'the stale binding is dropped, not re-trusted');
});

test('a partial drain cannot write salvagePool onto a recycled-id foreign body', (t) => {
  const ctx = boot(t);
  const foreign = recycleWreckId(ctx);

  const drained = ctx.api.drainSource({
    sourceKey: SOURCE.sourceKey, minerId: 'miner_7', requested: { [SCRAP]: 2 },
  });
  assert.equal(drained.ok, true);
  assert.equal(drained.taken[SCRAP], 2);
  assert.equal(foreign.data.salvagePool, undefined,
    'the ledger sync must not author a pool onto an unrelated body');
  assert.equal(drained.source.remainingQty, 6);
});

test('entityForPoint recovers the rematerialized carrier past a stale binding', (t) => {
  const ctx = boot(t);
  recycleWreckId(ctx);
  const reborn = ctx.sim.spawn({
    type: 'wreck', pos: { x: 930, z: -1290 }, radius: 9, mass: 1800, hull: 1, hullMax: 1,
    data: {
      salvagePointId: SOURCE.salvagePointId,
      salvageSourceKey: SOURCE.sourceKey,
      salvagePool: { [SCRAP]: 8 },
      authoredSalvagePool: { [SCRAP]: 8 },
    },
  });
  const found = ctx.api.entityForPoint(SOURCE.salvagePointId, SOURCE.sourceKey);
  assert.equal(found, reborn, 'the data-keyed walk finds the true source body');
  const claimed = ctx.api.claimSource({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT });
  assert.equal(claimed.ok, true);
  assert.equal(reborn.data.salvorClaimedBy, CLAIMANT, 'the claim stamps the real carrier');
});

test('release clears the entity stamp when the source ledger row is gone', (t) => {
  const ctx = boot(t);
  const claimed = ctx.api.claimSource({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT });
  assert.equal(claimed.ok, true);
  assert.equal(ctx.wreck.data.salvorClaimedBy, CLAIMANT);

  // Ledger loss while the stamped body lives on — e.g. a save subtree that normalized the
  // row away. The body stamp is the only claim evidence left; release must still reach it.
  delete ctx.state.salvage.sources[SOURCE.sourceKey];
  const released = ctx.api.releaseSourceClaim({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT });
  assert.equal(released.ok, false, 'no ledger claim existed to release');
  assert.equal(ctx.wreck.data.salvorClaimedBy, undefined,
    'the orphaned stamp clears instead of welding the wreck shut forever');
});

test('release under a mismatched ledger claim clears only the caller\'s stale stamp', (t) => {
  const ctx = boot(t);
  const claimed = ctx.api.claimSource({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT });
  assert.equal(claimed.ok, true);
  assert.equal(ctx.wreck.data.salvorClaimedBy, CLAIMANT);

  // The ledger claim moved to another claimant without restamping this body (contest
  // reassignment, ledger-side transfer). The stale stamp is provably dead weight: the
  // authoritative claim names someone else.
  ctx.state.salvage.sources[SOURCE.sourceKey].claimId = 'wr_salvor_99';
  const released = ctx.api.releaseSourceClaim({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT });
  assert.equal(released.ok, false, 'the caller never held the current ledger claim');
  assert.equal(ctx.wreck.data.salvorClaimedBy, undefined, 'the stale stamp clears');
  assert.equal(ctx.api.source(SOURCE.sourceKey).claimId, 'wr_salvor_99',
    'the live ledger claim is untouched');
});

test('the ordinary release path still clears claim and stamp together', (t) => {
  const ctx = boot(t);
  assert.equal(ctx.api.claimSource({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT, workId: 'job:41' }).ok, true);
  assert.equal(ctx.wreck.data.salvorClaimedBy, CLAIMANT);
  assert.equal(ctx.api.source(SOURCE.sourceKey).workId, 'job:41');

  const released = ctx.api.releaseSourceClaim({ sourceKey: SOURCE.sourceKey, claimantId: CLAIMANT });
  assert.equal(released.ok, true);
  assert.equal(released.source.claimId, null);
  assert.equal(released.source.workId, null);
  assert.equal(ctx.wreck.data.salvorClaimedBy, undefined);
  assert.equal(poolTotal(released.source.remainingPool), 8, 'release does not touch the pool');
});
