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
  'pallas_den_fence',
  'pallas_shoal_scav',
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
  assert.equal(pockets.length, 5);
  const ids = new Set();
  for (const pocket of pockets) {
    assert.equal(pocket.actorSlots.length, 2);
    for (const slot of pocket.actorSlots) ids.add(slot.id);
  }
  assert.equal(ids.size, 10);
});

test('elapsed time cannot move hulls or certify fictional Pallas handoffs', () => {
  const state = world();
  const before = [...state.entities.values()].map(e => structuredClone(e));
  assert.equal(stepPallasWorkLoop({ ...state, world: { currentSectorId: 'sector_helios_prime' } }, 1), null);
  let loop;
  for (let second = 0; second < 1200; second++) loop = stepPallasWorkLoop(state, 1);
  assert.equal(loop.phase, 'waiting');
  assert.equal(loop.arrived, false);
  assert.deepEqual([...state.entities.values()], before);
  assert.deepEqual(PALLAS_HANDOFF_ORDER, ['escort_join', 'sker_marks', 'hollow_hub']);
});
