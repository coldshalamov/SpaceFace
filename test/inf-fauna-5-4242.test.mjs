// Pulling a suture mite off a seam at the Closed Refinery makes it defend.
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
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
      tether: { active: false, targetId: null },
    },
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

test('releasing a suture mite that was knitting a seam leaves it defensive', () => {
  const site = ALIEN_SITES.closed_refinery;
  const { state, world, emitLog } = makeWorld(site.sectorId);
  materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
  const rec = ensureAlienEcologyState(state).sites[site.siteId];
  assert.notEqual(rec.state, 'awake');
  const mite = state.entityList.find((e) => e.data?.ecology?.speciesId === 'suture_mite');
  assert.ok(mite, 'a suture mite is on the refinery');
  assert.notEqual(mite.data.capturable, true);
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: mite.pos.x + 100, z: mite.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);

  state.simTime += 0.5;
  tickAlienEcology(world, 0.5);
  assert.equal(mite.data.ecology.driveState, 'repair', 'the mite is knitting before the tow');

  state.player.tether.active = true;
  state.player.tether.targetId = mite.id;
  state.simTime += 0.5;
  tickAlienEcology(world, 0.5);
  assert.equal(mite.data.ecology.driveState, 'captured');
  assert.equal(mite.data.ecology.yankedFromRepair, true);

  state.player.tether.active = false;
  state.player.tether.targetId = null;
  state.simTime += 0.5;
  tickAlienEcology(world, 0.5);
  assert.equal(mite.data.ecology.driveState, 'defend');
  assert.ok(emitLog.some((row) => row.type === 'toast'
    && row.p.text === 'The suture mite comes off the seam defensive — it was knitting that breach.'));
});
