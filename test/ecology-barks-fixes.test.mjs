// Lane 3 audit items 6, 7, 14: a fouled hull that never cleaned off-site, scripted lures
// cleared before they could steer, and a spawn-stamped bark that out-ranked every live line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { ALIEN_SITES, EXPOSURE_MODEL, alienSitesForSector } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { tickAlienEcology, materializeAlienEcology } from '../src/systems/alienEcology.js';
import { barkDirector, classifyBarkSituation } from '../src/systems/barkDirector.js';

function field(sectorId, siteId = null) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.world.currentSectorId = sectorId;
  const site = siteId ? ALIEN_SITES[siteId] : null;
  const player = { id: 1, type: 'player', alive: true, radius: 10,
    pos: site ? { ...site.center } : { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { fittings: [] } };
  state.entities.set(1, player);
  state.entityList.push(player);
  const events = [];
  const world = {
    state, active: { dressing: [], pois: [] },
    _toGlobal: p => ({ ...p }), _toLocal: p => ({ ...p }),
    helpers: { hash32, mulberry32, spawnEntity() { return null; }, removeEntity() {} },
    bus: { emit: (type, payload) => events.push({ type, payload }) },
  };
  const ae = ensureAlienEcologyState(state);
  return { state, world, ae, events, player, site,
    tick(dt = 0.5) { state.simTime += dt; tickAlienEcology(world, dt); } };
}

test('a fouled hull decays in a sector with no alien site', () => {
  assert.equal(alienSitesForSector('sector_helios_prime').length, 0, 'fixture: a site-free sector');
  const f = field('sector_helios_prime');
  f.ae.exposure = 0.6;
  for (let i = 0; i < 20; i++) f.tick(0.5);
  const expected = Math.max(0, 0.6 - EXPOSURE_MODEL.decayPerSec * 10);
  assert.ok(f.ae.exposure < 0.6, `exposure decays off-site (${f.ae.exposure})`);
  assert.ok(Math.abs(f.ae.exposure - expected) < 1e-9, 'at the authored clean-space rate');
});

test('a scripted lure point survives the fauna tick and steers until it burns out', () => {
  const f = field(ALIEN_SITES.warm_freighter.sectorId, 'warm_freighter');
  f.ae.revelation = 3;
  f.ae.sites.warm_freighter = { state: 'awake', relaySevered: false,
    deadFauna: {}, signals: [], beats: { long: true, mid: true, close: true }, offersEmitted: {} };
  const species = FAUNA_SPECIES.hull_leech;
  const site = f.site;
  const body = { id: 200, type: 'fauna', alive: true,
    pos: { x: site.center.x + 400, z: site.center.z }, vel: { x: 0, z: 0 },
    rot: Math.PI, radius: species.radius, hull: 100, occupantGeneration: 1, homeSectorId: site.sectorId,
    data: { ecology: { speciesId: 'hull_leech', siteId: 'warm_freighter', faunaKey: 'fixture:leech',
      anchor: { ...site.center }, driveState: species.drives.idle, phase: 0, stim: {}, driveT: 0 } } };
  f.state.entities.set(body.id, body);
  f.state.entityList.push(body);
  // Park the player far away so proximity alone never drives the animal.
  f.player.pos = { x: site.center.x - 5000, z: site.center.z - 5000 };
  const point = { x: site.center.x + 400, z: site.center.z + 300 };
  body.data.ecology.lureTarget = { ...point, until: f.state.simTime + 5 };
  const before = Math.hypot(body.pos.x - point.x, body.pos.z - point.z);
  f.tick(0.1);
  const eco = body.data.ecology;
  assert.ok(eco.lureTarget, 'the torch / bait point is not cleared by the next fauna tick');
  assert.equal(eco.lureTarget.x, point.x);
  assert.equal(eco.driveState, 'investigate', 'the lure drive holds');
  for (let i = 0; i < 10; i++) f.tick(0.1);
  assert.ok(Math.hypot(body.pos.x - point.x, body.pos.z - point.z) < before, 'the animal moves toward the point');
  for (let i = 0; i < 60; i++) f.tick(0.1);
  assert.equal(eco.lureTarget, null, 'an expired scripted lure clears');
});

test('a sterile site in bloom materializes without throwing; phantoms are not stacked', () => {
  const sterile = ALIEN_SITES.sterile_zone;
  const f = field(sterile.sectorId, 'sterile_zone');
  f.ae.revelation = 3;
  materializeAlienEcology(f.world, { id: sterile.sectorId }, f.world.active, [sterile]);
  f.ae.sites.sterile_zone.state = 'bloom';
  assert.doesNotThrow(() => materializeAlienEcology(f.world, { id: sterile.sectorId }, f.world.active, [sterile]));
  const ids = f.world.active.pois.filter(p => p.phantom === true).map(p => p.poiId);
  assert.equal(ids.length, new Set(ids).size, 'each phantom contact appears once on the board');
});

function barkHarness() {
  const bus = createBus();
  const entities = new Map();
  const state = { mode: 'flight', tick: 0, simTime: 0, playerId: 1, entities, entityList: [],
    meta: { seed: 77 }, world: {}, story: { titles: { byId: {} } },
    settings: { audio: {}, accessibility: {} }, heat: { wanted: false, level: 0, fines: 0 },
    law: { fines: 0, citations: [] } };
  const add = (spec) => {
    const e = { id: spec.id, type: spec.type || 'ship', team: spec.team ?? 1, alive: true,
      factionId: spec.factionId || 'faction_scn', pos: { x: spec.x ?? 0, z: spec.z ?? 0 },
      vel: { x: 0, z: 0 }, hull: spec.hull ?? 100, hullMax: spec.hullMax ?? 100, data: spec.data || {} };
    entities.set(e.id, e);
    state.entityList.push(e);
    return e;
  };
  add({ id: 1, team: 0 });
  const says = [];
  const receipts = [];
  bus.on('barkDirector:voice', (p) => receipts.push(p));
  barkDirector.init({ state, bus, helpers: { voice: { say: (r) => { says.push(r); return true; } } } });
  return { bus, state, add, says, receipts };
}

test('a spawn-stamped bark loses to live distress, flee and warn', () => {
  const h = barkHarness();
  // combat.js stamps grammar.primaryBark on ai.barkSituation at spawn.
  const hull = h.add({ id: 7, x: 300, data: { ai: { barkSituation: 'scan', fsm: 'patrol' } } });
  assert.equal(classifyBarkSituation(hull, h.state), 'scan', 'quiet: the stamp is the voice');
  hull.data.ai.fsm = 'flee';
  assert.equal(classifyBarkSituation(hull, h.state), 'flee');
  hull.hull = 5;
  assert.equal(classifyBarkSituation(hull, h.state), 'distress', 'a crippled stamped hull calls the mayday');
  hull.hull = 100;
  hull.data.ai.fsm = 'patrol';
  hull.data.ai.warning = true;
  assert.equal(classifyBarkSituation(hull, h.state), 'warn');
});

test('a stamped hull beyond the hail radius does not scan-hail', () => {
  const h = barkHarness();
  const far = h.add({ id: 8, x: 6000, data: { ai: { barkSituation: 'scan', fsm: 'patrol' } } });
  assert.notEqual(classifyBarkSituation(far, h.state), 'scan', 'a stamp 6,000 WU off is off scope');
  const near = h.add({ id: 9, x: 200, data: { ai: { barkSituation: 'scan', fsm: 'patrol' } } });
  assert.equal(classifyBarkSituation(near, h.state), 'scan');
});

test('the fine counter voices each answer with its own line and a re-assessment speaks again', () => {
  const h = barkHarness();
  const lines = () => h.says.map(s => s.text);
  h.bus.emit('law:fineAssessed', { stationId: 'station_x', amount: 400, paid: false, offer: true });
  h.bus.emit('law:fineAssessed', { stationId: 'station_x', amount: 400, paid: true, choice: 'pay' });
  const [offer, paid] = lines();
  assert.ok(offer && /answer it/.test(offer), 'the offer asks for an answer');
  assert.ok(paid && /cleared/.test(paid) && !/answer it/.test(paid), 'a paid fine is voiced as settled');
  h.state.simTime += 1200;
  h.bus.emit('law:fineAssessed', { stationId: 'station_x', amount: 400, paid: false, offer: true });
  assert.equal(lines().length, 3, 'a new assessment at the same dock speaks');
  h.bus.emit('law:fineAssessed', { stationId: 'station_x', amount: 400, paid: false, choice: 'leave' });
  assert.match(lines()[3], /warrant stands/);
});
