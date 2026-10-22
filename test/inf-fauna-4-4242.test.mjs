// A trailing wake eel leads a cold furnace maw at the Breathing Dock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { materializeAlienEcology, tickAlienEcology } from '../src/systems/alienEcology.js';

function makeWorld(sectorId) {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
  const emitLog = [];
  const world = {
    state,
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z }, vel: spec.vel || { x: 0, z: 0 } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, p) => emitLog.push({ type, p }) },
  };
  return { state, world, emitLog };
}

test('the wake eel trail pulls a cold furnace maw into a charge', () => {
  const site = ALIEN_SITES.breathing_dock;
  const { state, world, emitLog } = makeWorld(site.sectorId);
  materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
  ensureAlienEcologyState(state).sites[site.siteId].state = 'awake';
  const maw = state.entityList.find((e) => e.data?.ecology?.speciesId === 'furnace_maw');
  const eels = state.entityList.filter((e) => e.data?.ecology?.speciesId === 'wake_eel'
    && e.data.ecology.siteId === site.siteId);
  assert.ok(maw, 'a furnace maw holds the dock');
  assert.ok(eels.length >= 1, 'a wake eel shares the dock');
  eels.forEach((eel, i) => {
    eel.pos.x = maw.pos.x + 80;
    eel.pos.z = maw.pos.z + i * 12;
  });
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: maw.pos.x + 400, z: maw.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);

  for (let i = 0; i < 4; i += 1) {
    state.simTime += 0.25;
    tickAlienEcology(world, 0.25);
  }
  const playerD = Math.hypot(player.pos.x - maw.pos.x, player.pos.z - maw.pos.z);
  assert.ok(playerD > 140, 'the player is outside the maw panic ring');
  assert.ok((maw.data.ecology.heatSat || 0) <= 3, 'the maw is still cold');
  assert.ok(eels.some((eel) => eel.data.ecology.driveState === 'trail'));
  assert.equal(maw.data.ecology.driveState, 'charge');
  assert.ok(maw.data.ecology.lureTarget, 'the maw is locked onto the trail');
  assert.ok(emitLog.some((row) => row.type === 'comms:log'
    && row.p.text === "The wake eel's trail is leading the furnace maw in."));
});
