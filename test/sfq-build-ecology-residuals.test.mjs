import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { handleAlienEcologyEvent, tickAlienEcology, serializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { createDockIntent } from '../src/core/dockIntent.js';

function fixture() {
  const site = ALIEN_SITES.warm_freighter;
  const state = { meta: { seed: 4242 }, simTime: 0, playerId: 1, entities: new Map(), entityList: [],
    rng: () => 0, player: { cargo: { items: {}, capVolume: 100, capMass: 100, usedMass: 0, usedVolume: 0 } },
    world: { currentSectorId: site.sectorId, sectors: {} } };
  const events = [];
  let next = 100;
  const world = { state, registry: { get: () => null }, active: { dressing: [], pois: [] },
    _toGlobal: p => ({ ...p }), _toLocal: p => ({ ...p }), bus: { emit: (type, payload) => events.push({ type, payload }) },
    helpers: { mulberry32, hash32, spawnEntity(spec) {
      const e = { ...spec, id: next++, alive: true, occupantGeneration: 1, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    }, removeEntity(id) { state.entities.get(id).alive = false; } } };
  const player = { id: 1, type: 'player', alive: true, occupantGeneration: 1, radius: 10,
    pos: { x: site.center.x + 10000, z: site.center.z }, vel: { x: 0, z: 0 }, rot: 0, data: { fittings: [] } };
  state.entities.set(1, player); state.entityList.push(player);
  const ae = ensureAlienEcologyState(state); ae.revelation = 3;
  ae.sites[site.siteId] = { state: 'awake', relaySevered: false, deadFauna: {}, signals: [],
    beats: { long: true, mid: true, close: true }, offersEmitted: {} };
  function fauna(speciesId, offset = 0) {
    const species = FAUNA_SPECIES[speciesId];
    return world.helpers.spawnEntity({ type: 'fauna', pos: { x: site.center.x + offset, z: site.center.z },
      radius: species.radius, rot: 0, hull: 100, homeSectorId: site.sectorId,
      data: { ecology: { speciesId, siteId: site.siteId, faunaKey: `fixture:${speciesId}:${next}`,
        anchor: { ...site.center }, driveState: species.drives.idle, phase: 0, stim: {}, driveT: 0 } } });
  }
  return { state, world, site, player, events, fauna, tick(dt = 0.1) { state.simTime += dt; tickAlienEcology(world, dt); } };
}

test('B122 remote flight cannot pre-arm a heat hunter; close plume earns its charge', () => {
  const f = fixture(), hunter = f.fauna('furnace_maw');
  f.player.vel.x = 90;
  for (let i = 0; i < 100; i++) f.tick();
  assert.equal(hunter.data.ecology.heatSat, 0);
  assert.notEqual(hunter.data.ecology.driveState, 'charge');
  f.player.pos = { x: hunter.pos.x + FAUNA_SPECIES.furnace_maw.threatenR + 30, z: hunter.pos.z };
  for (let i = 0; i < 45; i++) f.tick();
  assert.ok(hunter.data.ecology.heatSat > 3);
  assert.equal(hunter.data.ecology.driveState, 'charge');
});

test('B125 a harsh tow refuses live capture without killing; settled capture commits once', () => {
  const f = fixture(), body = f.fauna('hull_leech');
  f.player.data.fittings = ['mod_capture_cradle_m'];
  f.state.player.tether = { active: true, targetId: body.id };
  body.vel.x = 120;
  for (let i = 0; i < 15; i++) f.tick();
  assert.ok(body.data.ecology.captureStress >= 1);
  f.state.player.tether.active = false;
  handleAlienEcologyEvent(f.world, 'tether:released', { targetId: body.id });
  assert.equal(f.state.player.cargo.items.cmdty_live_specimen || 0, 0);
  assert.equal(body.alive, true);
  body.vel.x = 0;
  for (let i = 0; i < 90; i++) f.tick();
  f.state.player.tether.active = true; f.tick();
  f.state.player.tether.active = false;
  handleAlienEcologyEvent(f.world, 'tether:released', { targetId: body.id });
  handleAlienEcologyEvent(f.world, 'tether:released', { targetId: body.id });
  assert.equal(f.state.player.cargo.items.cmdty_live_specimen, 1);
  assert.equal(body.alive, false);
  assert.equal(f.events.filter(e => e.type === 'toast' && /agitated/.test(e.payload.text)).length, 1);
});

test('B125 the fitted padded cradle attenuates stress during the same physical tow', () => {
  const bare = fixture(), padded = fixture();
  const bareBody = bare.fauna('hull_leech'), paddedBody = padded.fauna('hull_leech');
  padded.player.data.fittings = ['mod_capture_cradle_m'];
  bare.state.player.tether = { active: true, targetId: bareBody.id };
  padded.state.player.tether = { active: true, targetId: paddedBody.id };
  bareBody.vel.x = paddedBody.vel.x = 60;
  for (let i = 0; i < 8; i++) { bare.tick(); padded.tick(); }
  assert.ok(paddedBody.data.ecology.captureStress < bareBody.data.ecology.captureStress);
  assert.ok(paddedBody.data.ecology.captureStress > 0, 'padding keeps the handling consequence real');
});

test('B127 one carcass has one finite harvest and brood, including duplicate kill drains', () => {
  const f = fixture(), carrier = f.fauna('lantern_cyst');
  const death = { id: carrier.id, pos: { ...carrier.pos } };
  handleAlienEcologyEvent(f.world, 'entity:killed', death);
  const count = f.state.entityList.length, dressing = f.state.world.dressing.rows.length;
  const siteC = ensureAlienEcologyState(f.state).sites[f.site.siteId].siteC;
  for (let i = 0; i < 10; i++) handleAlienEcologyEvent(f.world, 'entity:killed', death);
  assert.equal(f.state.entityList.length, count); assert.equal(f.state.world.dressing.rows.length, dressing);
  assert.equal(ensureAlienEcologyState(f.state).sites[f.site.siteId].siteC, siteC);
  assert.equal(f.events.filter(e => e.type === 'alienEcology:cystRupture').length, 1);
  assert.equal(serializeAlienEcologyState(f.state).sites[f.site.siteId].deadFauna[carrier.data.ecology.faunaKey], true);
});

test('B128 a leech rides the hull, releases under quiet and cannot follow a recycled host', () => {
  const f = fixture(), leech = f.fauna('hull_leech');
  f.player.pos = { x: leech.pos.x + 10, z: leech.pos.z }; f.player.vel.x = 20;
  f.tick(); f.tick();
  assert.equal(leech.data.ecology.attachTargetId, f.player.id);
  f.player.pos.x += 300; f.tick();
  assert.ok(Math.hypot(leech.pos.x - f.player.pos.x, leech.pos.z - f.player.pos.z) < 30);
  f.player.vel.x = 0;
  for (let i = 0; i < 81; i++) f.tick();
  assert.equal(leech.data.ecology.attachTargetId, null);
  leech.data.ecology.attachTargetId = f.player.id;
  leech.data.ecology.attachGeneration = 1;
  f.player.occupantGeneration = 2; f.tick();
  assert.equal(leech.data.ecology.attachTargetId, null);
});

test('B128 an east-side grip keeps its zero local bearing while the hull rotates', () => {
  const f = fixture(), leech = f.fauna('hull_leech');
  f.player.pos = { x: leech.pos.x - 10, z: leech.pos.z };
  f.player.vel.x = 20;
  f.tick(); f.tick();
  assert.equal(leech.data.ecology.attachAngle, 0);
  assert.ok(leech.pos.x > f.player.pos.x + 10, 'zero is a real hull socket, not the missing-angle fallback');
  assert.equal(leech.pos.z, f.player.pos.z);
  f.player.rot = Math.PI / 2;
  f.tick();
  assert.ok(leech.pos.z > f.player.pos.z + 10);
  assert.ok(Math.abs(leech.pos.x - f.player.pos.x) < 1e-9);
});

test('B128 a fitted purge dislodges the attached body even on a clean hull', () => {
  const f = fixture(), leech = f.fauna('hull_leech');
  f.player.data.fittings = ['mod_hull_purge_ring_m'];
  leech.data.ecology.attachTargetId = f.player.id; leech.data.ecology.attachGeneration = 1;
  ensureAlienEcologyState(f.state).exposure = 0;
  handleAlienEcologyEvent(f.world, 'dock:docked', { stationId: 'fixture' });
  assert.equal(leech.data.ecology.attachTargetId, null);
  assert.equal(leech.alive, true);
});

test('B128 a stale dock receipt cannot purge the replacement player hull', () => {
  const f = fixture(), leech = f.fauna('hull_leech');
  f.state.mode = 'flight';
  f.world.helpers.spawnEntity({ type: 'station', pos: { ...f.player.pos }, data: { stationId: 'fixture' } });
  const stale = createDockIntent(f.state, { stationId: 'fixture' }, f.player);
  const replacement = { ...f.player, occupantGeneration: 2,
    data: { fittings: ['mod_hull_purge_ring_m'] } };
  f.state.entities.set(f.player.id, replacement);
  f.state.entityList[f.state.entityList.indexOf(f.player)] = replacement;
  leech.data.ecology.attachTargetId = replacement.id;
  leech.data.ecology.attachGeneration = replacement.occupantGeneration;
  ensureAlienEcologyState(f.state).exposure = 0.6;
  handleAlienEcologyEvent(f.world, 'dock:docked', stale);
  assert.equal(leech.data.ecology.attachTargetId, replacement.id);
  assert.equal(ensureAlienEcologyState(f.state).exposure, 0.6);
  const current = createDockIntent(f.state, { stationId: 'fixture' }, replacement);
  handleAlienEcologyEvent(f.world, 'dock:docked', current);
  assert.equal(leech.data.ecology.attachTargetId, null);
  assert.equal(ensureAlienEcologyState(f.state).exposure, 0);
});

test('B128 quiet release sends the leech away instead of freezing it in reattachment range', () => {
  const f = fixture(), leech = f.fauna('hull_leech');
  f.player.pos = { x: leech.pos.x + 10, z: leech.pos.z };
  f.player.vel.x = 20;
  f.tick(); f.tick();
  assert.equal(leech.data.ecology.attachTargetId, f.player.id);
  f.player.vel.x = 0;
  for (let i = 0; i < 81; i++) f.tick();
  assert.equal(leech.data.ecology.attachTargetId, null);
  const gap = () => Math.hypot(leech.pos.x - f.player.pos.x, leech.pos.z - f.player.pos.z);
  const releasedGap = gap();
  for (let i = 0; i < 100; i++) f.tick();
  assert.equal(leech.data.ecology.attachTargetId, null);
  assert.ok(gap() > releasedGap + 60, 'the remedy produces physical separation from the hull');
});

test('B130 a brood born at time zero matures into its authored adult after the full age', () => {
  const f = fixture(), juvenile = f.fauna('needle_swarm');
  juvenile.radius *= 0.6; juvenile.data.ecology.juvenile = true; juvenile.data.ecology.bornAt = 0;
  f.state.simTime = 119; f.tick();
  assert.equal(juvenile.data.ecology.juvenile, true);
  f.state.simTime = 121; f.tick();
  assert.equal(juvenile.data.ecology.juvenile, false);
  assert.equal(juvenile.radius, FAUNA_SPECIES.needle_swarm.radius);
  assert.equal(juvenile.data.name, FAUNA_SPECIES.needle_swarm.name);
});
