// FB-030 — Pallas Drift closes miner, hauler, ambush, and escort inside twenty minutes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { activityPocketsForSector } from '../src/data/sectorActivityPockets.js';
import { stepPallasWorkLoop, PALLAS_HANDOFF_ORDER } from '../src/systems/pallasWorkLoop.js';

const SEED = 4242;
const SLOT_IDS = [
  'pallas_seam_miner',
  'pallas_seam_surveyor',
  'pallas_hub_hauler',
  'pallas_hub_tender',
  'pallas_ambush_hauler',
  'pallas_ambush_escort',
  'pallas_grave_salvor',
  'pallas_grave_patrol',
];

function world() {
  const entities = new Map();
  const freighters = [];
  for (const id of SLOT_IDS) {
    const entity = {
      id,
      alive: true,
      pos: { x: 0, z: 0 },
      data: { activityActorSlotId: id, ai: { passive: true } },
    };
    entities.set(id, entity);
    freighters.push({ id });
  }
  return {
    meta: { seed: SEED },
    world: { currentSectorId: 'sector_pallas_drift' },
    entities,
    traffic: { freighters },
  };
}

test('Pallas pockets load as four two-actor routes on seed 4242', () => {
  const pockets = activityPocketsForSector('sector_pallas_drift');
  assert.equal(pockets.length, 4);
  const ids = new Set();
  for (const pocket of pockets) {
    assert.equal(pocket.actorSlots.length, 2);
    for (const slot of pocket.actorSlots) ids.add(slot.id);
  }
  assert.equal(ids.size, 8);
});

test('four handoffs land in order inside twenty minutes and the hulls keep working speed', () => {
  const state = world();
  const miner = state.entities.get('pallas_seam_miner');
  assert.equal(stepPallasWorkLoop({ ...state, world: { currentSectorId: 'sector_helios_prime' } }, 1), null);
  let loop = null;
  for (let second = 0; second < 1200; second += 1) loop = stepPallasWorkLoop(state, 1);
  assert.deepEqual(loop.order, [...PALLAS_HANDOFF_ORDER]);
  // Each leg turns, so the net chord is shorter than the path. The path is 36 wu every second
  // until the fourth handoff, and it has to finish inside the twenty minutes above.
  const travelled = miner.data.pallasWorkStepWU;
  assert.ok(travelled > 2700 && travelled < 2900, `miner travelled ${travelled} wu at 36 wu/s across the legs`);
  assert.ok(Math.hypot(miner.pos.x, miner.pos.z) > 1000, 'the miner was not teleported to the handoff');
  assert.equal(state.entities.get('pallas_ambush_hauler').data.ai.passive, false);
  assert.equal(state.entities.get('pallas_ambush_escort').data.pallasEscortClosing, true);
  assert.equal(loop.seed, SEED);
});
