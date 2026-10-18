import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { handleAlienEcologyEvent, tickAlienEcology } from '../src/systems/alienEcology.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

// The live purge ring is the M module. The packet named an S id that is not in the catalog.
const PURGE_RING = 'mod_hull_purge_ring_m';

function fixture() {
  const site = ALIEN_SITES.warm_freighter;
  const state = {
    meta: { seed: 4242 }, simTime: 0, playerId: 1, entities: new Map(), entityList: [],
    rng: mulberry32(4242), player: { cargo: { items: {}, capVolume: 100, capMass: 100, usedMass: 0, usedVolume: 0 } },
    world: { currentSectorId: site.sectorId, sectors: {} },
  };
  const events = [];
  let next = 100;
  const world = {
    state, registry: { get: () => null }, active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ ...p }), _toLocal: (p) => ({ ...p }),
    bus: { emit: (type, payload) => events.push({ type, payload }) },
    helpers: {
      mulberry32, hash32,
      spawnEntity(spec) {
        const e = {
          ...spec, id: next++, alive: true, occupantGeneration: 1,
          pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 },
        };
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity(id) { state.entities.get(id).alive = false; },
    },
  };
  const player = {
    id: 1, type: 'player', alive: true, occupantGeneration: 1, radius: 10,
    pos: { x: site.center.x + 10000, z: site.center.z }, vel: { x: 0, z: 0 }, rot: 0,
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const ae = ensureAlienEcologyState(state);
  ae.revelation = 3;
  ae.sites[site.siteId] = {
    state: 'awake', relaySevered: false, deadFauna: {}, signals: [],
    beats: { long: true, mid: true, close: true }, offersEmitted: {},
  };
  function fauna(speciesId, offset = 0) {
    const species = FAUNA_SPECIES[speciesId];
    return world.helpers.spawnEntity({
      type: 'fauna', pos: { x: site.center.x + offset, z: site.center.z },
      radius: species.radius, rot: 0, hull: 100, homeSectorId: site.sectorId,
      data: {
        ecology: {
          speciesId, siteId: site.siteId, faunaKey: `fixture:${speciesId}:${next}`,
          anchor: { ...site.center }, driveState: species.drives.idle, phase: 0, stim: {}, driveT: 0,
        },
      },
    });
  }
  return {
    state, world, site, player, events, fauna,
    tick(dt = 0.1) { state.simTime += dt; tickAlienEcology(world, dt); },
  };
}

function attach(f, leech) {
  leech.data.ecology.attachTargetId = f.player.id;
  leech.data.ecology.attachGeneration = f.player.occupantGeneration;
  leech.data.ecology.attachAngle = 0;
  f.player.vel.x = 20;
}

function shells(f) {
  return f.state.player.cargo.items.cmdty_sterile_shell || 0;
}

function dock(f) {
  f.player.data.fittings = [PURGE_RING];
  handleAlienEcologyEvent(f.world, 'dock:docked', { stationId: 'fixture' });
}

test('B135 heat calcifies an attached hull leech; a purge ring yields one sterile shell', () => {
  const f = fixture();
  const leech = f.fauna('hull_leech');
  attach(f, leech);
  const ae = ensureAlienEcologyState(f.state);
  ae.exposure = 0;
  for (let i = 0; i < 20; i++) f.tick();
  assert.ok(ae.exposure > 0.01, 'a live attached leech fouls the hull');
  const fouled = ae.exposure;
  f.state.combat = {
    entities: { [f.player.id]: { statuses: { status_burn: { stacks: 1 } } } },
  };
  f.tick();
  assert.equal(leech.data.ecology.calcified, true);
  assert.equal(leech.data.material, 'calcite');
  const crusted = ae.exposure;
  assert.ok(crusted <= fouled + 1e-9, 'the calcifying tick does not keep fouling the hull');
  f.player.vel.x = 0;
  for (let i = 0; i < 100; i++) f.tick();
  assert.equal(leech.data.ecology.attachTargetId, f.player.id, 'a crust stays on the hull at rest');
  assert.equal(leech.alive, true);
  assert.ok(ae.exposure <= crusted + 1e-9, 'a calcified crust stops exposure gain');
  dock(f);
  assert.equal(shells(f), 1);
  assert.equal(leech.alive, false);
  assert.equal(leech.data.ecology.attachTargetId, null);
  assert.equal(ae.sites[f.site.siteId].deadFauna[leech.data.ecology.faunaKey], true);
  dock(f);
  assert.equal(shells(f), 1, 'a second berth does not mint another shell');
  assert.equal(f.events.filter((e) => e.type === 'toast' && /brittle sterile crust/.test(e.payload.text)).length, 1);
  assert.equal(f.events.filter((e) => e.type === 'toast' && /sterile shell recovered/.test(e.payload.text)).length, 1);
});

test('B135 a purge ring flings a live leech off and grants no sterile shell', () => {
  const f = fixture();
  const leech = f.fauna('hull_leech');
  attach(f, leech);
  assert.notEqual(leech.data.ecology.calcified, true);
  ensureAlienEcologyState(f.state).exposure = 0;
  dock(f);
  assert.equal(leech.data.ecology.driveState, 'flee');
  assert.equal(leech.alive, true);
  assert.equal(leech.data.ecology.attachTargetId, null);
  assert.equal(shells(f), 0);
  dock(f);
  assert.equal(shells(f), 0, 'purging a live leech twice still grants nothing');
  assert.equal(f.events.filter((e) => e.type === 'toast' && /sterile shell/.test(e.payload.text)).length, 0);
  assert.equal(f.events.filter((e) => e.type === 'toast' && /dislodges the hull leech/.test(e.payload.text)).length, 1);
});
