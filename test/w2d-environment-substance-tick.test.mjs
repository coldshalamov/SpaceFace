// O40: the slow substance tick (rows 509/510) read `state.player.pos` (the metadata record has no
// position) and `state.sector` / `state.sectorId` (production never sets either), so arena rock refill
// and ice sublimation were dead branches. These tests drive the real shapes: the flying ship is
// `state.entities.get(state.playerId)` and the sector is `state.world.sectors[currentSectorId]`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { environmentMaterials } from '../src/systems/environmentMaterials.js';

function boot({ sectorId = 'sector_helios_prime' } = {}) {
  const state = createGameState(53);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const owner = Object.create(environmentMaterials);
  owner.init(ctx);
  state.world.sectors[sectorId] = { id: sectorId, palette: {} };
  state.world.currentSectorId = sectorId;
  return { state, helpers, owner };
}

// One slow tick = 90 fixed steps (the substance cadence).
function slowTick(h) {
  for (let i = 0; i < 90; i++) h.owner.update(1 / 60, h.state);
}

function spawnPlayer(h) {
  const ship = h.helpers.spawnEntity({
    type: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100,
  });
  h.state.playerId = ship.id;
  return ship;
}

function throwables(h, around, radius = 800) {
  return h.state.entityList.filter((e) => e.alive !== false && e.type === 'asteroid' && e.data?.restock
    && Math.hypot(e.pos.x - around.pos.x, e.pos.z - around.pos.z) <= radius);
}

test('a live survival arena below the throwable floor restocks rocks around the flying ship', () => {
  const h = boot();
  const ship = spawnPlayer(h);
  assert.equal(h.state.entities.get(h.state.playerId), ship);
  assert.equal(h.state.player.pos, undefined, 'the metadata record has no position - the fix must not depend on one');
  h.state.run = { kind: 'survival', phase: 'active' };

  assert.equal(throwables(h, ship).length, 0);
  slowTick(h);
  const fresh = throwables(h, ship);
  assert.equal(fresh.length, 6, 'refill brings the ring back up to the floor of six');
  for (const rock of fresh) {
    assert.equal(rock.data.tetherPayload, true, 'refilled rocks are usable ammunition');
    assert.ok(rock.mass > 0);
  }
  // The next slow tick has nothing left to owe.
  slowTick(h);
  assert.equal(throwables(h, ship).length, 6);
  h.owner.destroy();
});

test('open flight and a finished run keep ambient fields - no refill', () => {
  const h = boot();
  const ship = spawnPlayer(h);
  slowTick(h);
  assert.equal(throwables(h, ship).length, 0, 'no run, no refill');
  h.state.run = { kind: 'survival', phase: 'inactive' };
  slowTick(h);
  assert.equal(throwables(h, ship).length, 0, 'an inactive run owes nothing');
  h.owner.destroy();
});

test('ice sheds mass and evaporates in a sunlit sector, and keeps its mass in a dim one', () => {
  const sunlit = boot({ sectorId: 'sector_helios_prime' });
  const dim = boot({ sectorId: 'sector_anvil_storm_orchard' });
  const mk = (h) => h.helpers.spawnEntity({
    type: 'asteroid', pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 20, mass: 1000,
    hull: 100, hullMax: 100, collides: true,
    data: { sublimatesPerS: 0.004, typeId: 'ast_common_rock' },
  });
  const iceSun = mk(sunlit);
  const iceDim = mk(dim);

  slowTick(sunlit);
  slowTick(dim);
  assert.ok(iceSun.mass < 1000, `sunlit ice should lose mass (got ${iceSun.mass})`);
  assert.ok(Math.abs(iceSun.mass - 1000 * (1 - 0.004 * 1.5)) < 1e-6, 'one slow tick sheds rate x 1.5');
  assert.equal(iceDim.mass, 1000, 'a sector that is not sunlit leaves the ice alone');

  // Force it under 15% of its spawn mass and the next slow tick marks it for removal.
  iceSun.mass = iceSun.data.spawnMass * 0.1;
  slowTick(sunlit);
  assert.equal(iceSun.data.despawnAt, sunlit.state.simTime, 'under 15% of spawn mass the ice evaporates outright');
  sunlit.owner.destroy();
  dim.owner.destroy();
});
