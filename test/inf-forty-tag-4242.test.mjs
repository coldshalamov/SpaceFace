import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { factionDrift } from '../src/systems/faction_drift.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';

const POI = SECTORS.find((row) => row.id === 'sector_ceres_belt').pois
  .find((row) => row.id === 'poi_ceres_claim_tag');
const PIN = sectorLocalToGlobalForSector({ x: POI.pos.x, z: POI.pos.z }, 'sector_ceres_belt');
const LINE = 'Forty-Tag holds this face. The Drift stamp is live.';

function rock(id, x, z) {
  return { id, type: 'asteroid', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, data: {} };
}

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  const player = { id: state.playerId, type: 'ship', alive: true, pos: { x: PIN.x, z: PIN.z }, vel: { x: 0, z: 0 }, data: {} };
  const near = rock(11, PIN.x + 200, PIN.z);
  const far = rock(12, PIN.x + 230, PIN.z);
  const chartDot = rock(13, POI.pos.x, POI.pos.z);
  state.entities.set(player.id, player);
  state.entities.set(near.id, near);
  state.entities.set(far.id, far);
  state.entities.set(chartDot.id, chartDot);
  state.entityList.push(player, near, far, chartDot);
  // Ordinary belt rocks live on the field shelf until something promotes them.
  const shelf = insertAsteroidFieldRock(state, {
    id: 21,
    pos: { x: PIN.x + 40, z: PIN.z },
    radius: 8,
    homeSectorId: 'sector_ceres_belt',
    data: {},
  });
  // Center is outside 220, but the body overlaps the query disc. The stake stays on centers.
  const shelfLip = insertAsteroidFieldRock(state, {
    id: 22,
    pos: { x: PIN.x + 225, z: PIN.z },
    radius: 8,
    homeSectorId: 'sector_ceres_belt',
    data: {},
  });
  const chartShelf = insertAsteroidFieldRock(state, {
    id: 23,
    pos: { x: POI.pos.x, z: POI.pos.z },
    radius: 8,
    data: {},
  });
  const toasts = [];
  const inst = Object.create(factionDrift);
  inst.init({
    state,
    bus: { emit(ev, payload) { if (ev === 'toast') toasts.push(payload); } },
  });
  return { state, inst, near, far, chartDot, shelf, shelfLip, chartShelf, toasts };
}

test('Forty-Tag files the Drift claim on a Ceres rock within the pin reach on seed 4242', () => {
  const { state, inst, near, far, chartDot, shelf, shelfLip, chartShelf, toasts } = boot();
  assert.equal(state.entityList.includes(shelf), false);
  assert.equal(shelf.fieldResident, true);
  inst.update(1 / 60, state);
  assert.equal(near.data.claimedBy, 'faction_dmc');
  assert.equal(near.data.scanLabel, 'Forty-Tag · Drift claim');
  assert.equal(shelf.data.claimedBy, 'faction_dmc');
  assert.equal(shelf.data.scanLabel, 'Forty-Tag · Drift claim');
  assert.equal(shelf.data.claimPylonId, 'pin:poi_ceres_claim_tag');
  assert.equal(far.data.claimedBy, undefined);
  assert.equal(far.data.scanLabel, undefined);
  assert.equal(shelfLip.data.claimedBy, undefined);
  assert.equal(shelfLip.data.scanLabel, undefined);
  assert.equal(chartDot.data.claimedBy, undefined);
  assert.equal(chartShelf.data.claimedBy, undefined);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, LINE);
  inst.update(1 / 60, state);
  assert.equal(toasts.length, 1);
  assert.equal(shelf.data.claimedBy, 'faction_dmc');

  state.world.currentSectorId = 'sector_helios_prime';
  inst.update(1 / 60, state);
  assert.equal(near.data.claimedBy, undefined);
  assert.equal(near.data.scanLabel, undefined);
  assert.equal(shelf.data.claimedBy, undefined);
  assert.equal(shelf.data.scanLabel, undefined);
  assert.equal(shelf.data.claimPylonId, undefined);
  assert.equal(toasts.length, 1);
});
