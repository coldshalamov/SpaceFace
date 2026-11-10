// A stone lung exhale at the Black Orchard pulls grazers off their circuit to feed.
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

test('grazers break off and feed when the stone lung exhales', () => {
  const site = ALIEN_SITES.black_orchard;
  const { state, world, emitLog } = makeWorld(site.sectorId);
  materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
  const rec = ensureAlienEcologyState(state).sites[site.siteId];
  rec.state = 'awake';
  const lung = state.entityList.find((e) => e.data?.ecology?.speciesId === 'stone_lung'
    && e.data.ecology.siteId === site.siteId);
  const backs = state.entityList.filter((e) => e.data?.ecology?.speciesId === 'glassback'
    && e.data.ecology.siteId === site.siteId);
  assert.ok(lung, 'a stone lung is rooted in the orchard');
  assert.ok(backs.length >= 1, 'glassbacks graze the orchard');
  backs.forEach((back, i) => {
    back.pos.x = lung.pos.x + 36;
    back.pos.z = lung.pos.z + i * 8;
  });
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: lung.pos.x + 2000, z: lung.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  for (const e of state.entityList) {
    if (e.data?.ecology?.speciesId === 'stone_lung') e.data.ecology.nextVentAt = -1;
  }

  state.simTime += 0.5;
  tickAlienEcology(world, 0.5);
  assert.ok((rec.signals || []).some((s) => s.kind === 'spore_density' && s.vent === true));
  state.simTime += 0.5;
  tickAlienEcology(world, 0.5);

  const back = backs[0];
  assert.equal(back.data.ecology.driveState, 'feed');
  assert.ok(back.data.ecology.feedTarget, 'the grazer has a feed point');
  const feedD = Math.hypot(
    back.data.ecology.feedTarget.x - lung.pos.x,
    back.data.ecology.feedTarget.z - lung.pos.z,
  );
  assert.ok(feedD < 80, 'the feed point is the lung exhale');
  assert.ok(emitLog.some((row) => row.type === 'toast'
    && row.p.text === "Grazers break off and feed on the stone lung's exhale."));
});
