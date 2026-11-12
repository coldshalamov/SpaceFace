// BORE-03 — exterior radiator fins. A hollow, powered hall stays thermally faulted until a
// skin fin is welded; the fin raises the site's signature class; an ordinary damage hit
// shears the fin and the fault returns. A hall that is not overheating grows no fin.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { stepSiteThermal } from '../src/systems/siteThermalModel.js';
import { buildSiteSignature } from '../src/systems/siteSignatureModel.js';
import { combat } from '../src/systems/combat.js';
import { tileIndex } from '../src/systems/drill.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { weapons } from '../src/systems/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { scanner, setScannerSiteProjectionSource } from '../src/systems/scanner.js';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { asteroidSites, makeSiteRecord, findAsteroidSiteFromState, projectAsteroidSiteFromState } from '../src/systems/asteroidSites.js';
// The composition root (src/core/registry.js) registers the site projection with the scanner at game start; the test does the same.
setScannerSiteProjectionSource({ find: findAsteroidSiteFromState, project: projectAsteroidSiteFromState });

const HOLLOW = Object.freeze({ matrix: 0, basalt: 0, gas: 0, ores: {} });
const FABRICATOR = Object.freeze({ id: 'syn_fabricator', name: 'Fabricator', power: -10 });
const DEFS = Object.freeze({ syn_fabricator: FABRICATOR });

function hall(radiatorFins) {
  return stepSiteThermal({
    dtS: 60,
    defs: DEFS,
    machines: [{ id: 'bay', defId: 'syn_fabricator', profile: HOLLOW, powerRatio: 1 }],
    radiatorFins,
  });
}

function fixedSite(over = {}) {
  return {
    id: 'site_fixed',
    anchored: true,
    asteroidId: 7,
    sectorId: 'sector_helios_prime',
    anchor: { x: 100, z: -40, radius: 12 },
    machines: [{ id: 'bay', defId: 'syn_fabricator', col: 1, row: 1, mode: null }],
    radiatorFins: null,
    ...over,
  };
}

function fixedRuntime(powerRatio = 1) {
  return {
    geo: { bay: HOLLOW },
    powerCompByMachine: { bay: 'p0' },
    compRatio: { p0: powerRatio },
    compPower: { p0: { gen: 0, draw: 10 * powerRatio } },
  };
}

test('a hollow powered hall stays faulted without fins and settles when a fin is intact', () => {
  const bare = hall([]);
  const finned = hall([{ id: 'skin', intact: true, hull: 48 }]);
  const sheared = hall([{ id: 'skin', intact: false, hull: 0 }]);
  assert.equal(bare.worstBand, 'fault');
  assert.equal(bare.machines[0].finSink, 0);
  assert.notEqual(finned.worstBand, 'fault');
  assert.ok(finned.machines[0].bandIndex < bare.machines[0].bandIndex);
  assert.ok(finned.machines[0].finSink > 0);
  assert.equal(finned.machines[0].sink, finned.machines[0].rockSink + finned.machines[0].cooling + finned.machines[0].finSink);
  assert.equal(sheared.worstBand, 'fault');
  assert.equal(sheared.machines[0].finSink, 0);
});

test('an intact fin raises the signature class and a sheared fin does not', () => {
  const quiet = buildSiteSignature({ cleared: [], machines: [], radiatorFins: [] });
  const bright = buildSiteSignature({
    cleared: [], machines: [], radiatorFins: [{ id: 'skin', intact: true, hull: 48 }],
  });
  const sheared = buildSiteSignature({
    cleared: [], machines: [], radiatorFins: [{ id: 'skin', intact: false, hull: 0 }],
  });
  assert.equal(quiet.signatureClass, 'quiet');
  assert.ok(bright.total > quiet.total);
  assert.notEqual(bright.signatureClass, quiet.signatureClass);
  assert.equal(bright.signatureLabel, 'Bright');
  assert.equal(sheared.total, quiet.total);
  assert.equal(sheared.signatureClass, quiet.signatureClass);
  assert.ok(!bright.signatureLabel.includes('_'));
});

test('ordinary damage shears the fin body and the heat bottleneck returns', () => {
  const state = createGameState(4242);
  const bus = createBus();
  const player = {
    id: state.playerId, type: 'ship', alive: true, team: 1,
    pos: { x: 80, z: -40 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 2, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const site = fixedSite();
  const rt = fixedRuntime(1);
  const lines = [];
  let nextId = 10;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, team: null, ...spec };
      entity.data = { ...(spec.data || {}) };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.state = state;
  sys.bus = bus;
  sys.ctx = { helpers };
  sys._ledger = (_site, _kind, text) => { lines.push(text); };

  sys._stepExteriorRadiators(site, state, rt, 60);
  const fin = [...state.entities.values()].find((entity) => entity.data && entity.data.radiatorFin === true);
  assert.ok(fin, 'the hot hall welds a fin body');
  assert.equal(fin.data.name, 'Radiator Fin');
  assert.equal(fin.type, 'payload');
  assert.ok(fin.hull > 0 && fin.hull < 1e6);
  assert.equal(fin.data.worldSiteTargetable, true);
  assert.equal(rt.radiator.worstBand === 'fault', false);
  assert.notEqual(rt.radiator.signatureClass, 'quiet');
  assert.ok(lines.some((text) => text.includes('Radiator') && !text.includes('skin') && !/_/.test(text)));

  const route = createDamageRouter(
    { state, bus, catalog: createCombatCatalog(), helpers: {} },
    { schedule() {} },
  );
  const shot = route({
    attackerId: player.id,
    targetId: fin.id,
    packet: scalarHitToDamagePacket({ damage: fin.hull + 30, damageType: 'kinetic' }),
    origin: { kind: 'weapon', id: 'cannon' },
  });
  assert.equal(shot.ok, true, shot.reason || 'shot rejected');
  assert.ok(shot.hullDamage > 0);
  assert.ok(!(fin.hull > 0));

  sys._stepExteriorRadiators(site, state, rt, 60);
  assert.equal(site.radiatorFins[0].intact, false);
  assert.equal(rt.radiator.worstBand, 'fault');
  assert.equal(rt.radiator.intact, 0);
  assert.equal([...state.entities.values()].some((entity) => entity.alive !== false && entity.data && entity.data.radiatorFin), false);
  assert.ok(lines.some((text) => /sheared/i.test(text) && !/_/.test(text)));

  // A second step does not grow a replacement fin. The bottleneck stays.
  sys._stepExteriorRadiators(site, state, rt, 60);
  assert.equal(site.radiatorFins[0].intact, false);
  assert.equal(rt.radiator.worstBand, 'fault');
});

test('a hall that is not overheating grows no fin and keeps a quiet signature', () => {
  const state = createGameState(4242);
  const site = fixedSite();
  const rt = fixedRuntime(0);
  const sys = Object.create(asteroidSites);
  sys.state = state;
  sys.bus = createBus();
  sys.ctx = { helpers: { spawnEntity() { throw new Error('cool hall must not spawn a fin'); } } };
  sys._ledger = () => { throw new Error('cool hall must not announce a fin'); };
  sys._stepExteriorRadiators(site, state, rt, 60);
  assert.equal(site.radiatorFins, null);
  assert.equal(rt.radiator.worstBand, 'nominal');
  assert.equal(rt.radiator.intact, 0);

  const saved = JSON.parse(JSON.stringify({ radiatorFins: [{ id: 'skin', intact: false, hull: 0 }] }));
  const restored = fixedSite({ radiatorFins: saved.radiatorFins, anchored: true });
  const hot = fixedRuntime(1);
  sys._stepExteriorRadiators(restored, state, hot, 60);
  assert.equal(restored.radiatorFins[0].intact, false);
  assert.equal(hot.radiator.worstBand, 'fault');
});

// Use the shipped site/network, weapon emission, projectile sweep and combat owners.
function productionHall() {
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: { get() { return null; } } };
  const coreHost = Object.create(core);
  coreHost.init(ctx);
  const physicsHost = Object.create(physics);
  physicsHost.init(ctx);
  const weaponsHost = Object.create(weapons);
  weaponsHost.init(ctx);
  const combatHost = Object.create(combat);
  combatHost.init(ctx);
  const sites = Object.create(asteroidSites);
  sites.init(ctx);
  const site = makeSiteRecord({ id: 'site_bore_test', asteroidId: 700,
    sectorId: state.world.currentSectorId, createdT: 0 });
  site.anchored = true;
  site.anchor = { x: 100, z: -40, radius: 12 };
  site.boreSeed = 4242;
  site.machines = [
    { id: 'core', defId: 'sm_massline_core', col: 10, row: 10 },
    { id: 'bay', defId: 'sm_fabricator', col: 11, row: 10, mode: 'sr_fab_courier' },
  ];
  // A hollow contact ring, reached through the durable excavation recipe.
  for (let row = 9; row <= 11; row++) {
    for (let col = 9; col <= 12; col++) site.cleared.push(tileIndex(col, row));
  }
  state.sites.order.push(site.id);
  state.sites.byId[site.id] = site;
  sites._tickSite(site, 1, state);
  const fin = state.entityList.find(e => e.data?.radiatorFin);
  assert.ok(fin, 'the live production step welds a fin');
  const player = ctx.helpers.spawnEntity({ type: 'ship', team: 0,
    pos: { x: fin.pos.x - 60, z: fin.pos.z }, radius: 2,
    hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  function shoot() {
    const def = WEAPONS.find(w => w.id === 'wpn_autocannon_s');
    weaponsHost._spawnProjectile(player, { defId: def.id }, def, 0, null, false, state);
    const shot = state.entityList.findLast(e => e.type === 'projectile');
    // Advance the emitted round along its own velocity, then run the ordinary sweep.
    const dt = 0.2;
    shot.prevPos.copy(shot.pos);
    shot.pos.x += shot.vel.x * dt;
    shot.pos.z += shot.vel.z * dt;
    physicsHost.sweepProjectiles(dt, state);
    return shot;
  }
  return { state, bus, ctx, coreHost, sites, site, fin, shoot };
}

test('9: a real weapon round reaches the fin through physics and combat', () => {
  const h = productionHall();
  const before = h.fin.hull;
  let hit = null;
  h.bus.on('projectile:hit', p => { hit = p; });
  h.shoot();
  assert.equal(hit?.targetId, h.fin.id, 'physics must hit the exterior fin');
  assert.ok(h.fin.hull < before, 'combat must apply the swept shot to fin hull');
});


test('10: lethal gunfire is durable before corpse sweep, save and the next site cadence', () => {
  const h = productionHall();
  for (let i = 0; i < 20 && h.fin.alive; i++) h.shoot();
  assert.equal(h.fin.alive, false, 'ordinary combat kills the fin');
  assert.equal(h.site.radiatorFins[0].intact, false, 'lethal damage must synchronously mark the durable fin');
  h.coreHost.lifetimeSweep(1 / 60, h.state);
  assert.equal(h.state.entities.has(h.fin.id), false, 'the real end-of-step sweep removes the corpse');
  const saved = h.sites.serialize();
  h.sites.deserialize(saved);
  const restored = h.sites.getSite(h.site.id);
  h.sites._tickSite(restored, 1, h.state);
  assert.equal(restored.radiatorFins[0].intact, false);
  assert.equal(restored.radiatorFins[0].hull, 0);
  assert.equal(h.sites._rt.get(restored.id).radiator.worstBand, 'fault');
  assert.equal(h.state.entityList.some(e => e.alive && e.data?.radiatorFin), false, 'Continue must not respawn a destroyed fin');
});

test('10: ordinary residency retirement preserves an intact fin and its remaining hull', () => {
  const h = productionHall();
  h.shoot();
  const remaining = h.fin.hull;
  assert.ok(remaining > 0 && remaining < h.fin.hullMax);
  h.ctx.helpers.removeEntity(h.fin.id, { reason: 'sector_exit' });
  h.coreHost.lifetimeSweep(1 / 60, h.state);
  h.sites._tickSite(h.site, 1, h.state);
  const replacement = h.state.entityList.find(e => e.alive && e.data?.radiatorFin);
  assert.ok(replacement, 'an unbroken fin rematerializes on reentry');
  assert.equal(h.site.radiatorFins[0].intact, true);
  assert.equal(replacement.hull, remaining, 'nonlethal damage survives retirement');
});


test('19: the site screen projection carries fin readings through the real worker domain mirror', () => {
  const h = productionHall();
  function mirroredProjection() {
    const domains = new Map();
    for (const update of createDomainDiffer().diff(h.state, 0).updates) {
      applyDomainPathUpdate(domains, update, new WeakSet());
    }
    return projectAsteroidSiteFromState({ ...h.state, sites: {
      byId: domains.get('sites.byId'), order: domains.get('sites.order'),
    } }, h.site.id);
  }
  const cooled = mirroredProjection();
  assert.ok(cooled.thermal, 'the public site projection must expose thermal readings');
  assert.ok(cooled.signature, 'the public site projection must expose signature readings');
  assert.notEqual(cooled.thermal.worstBand, 'fault');
  for (let i = 0; i < 20 && h.fin.alive; i++) h.shoot();
  h.coreHost.lifetimeSweep(1 / 60, h.state);
  const broken = mirroredProjection();
  assert.equal(broken.thermal.worstBand, 'fault');
  assert.ok(broken.signature.total < cooled.signature.total);
});

test('19: real scanner pulses detect a finned site farther away and report the changed hall', () => {
  const h = productionHall();
  const scan = Object.create(scanner);
  scan.init(h.ctx);
  let result;
  h.bus.on('signal:scanResults', payload => { result = payload; });
  const player = h.state.entities.get(h.state.playerId);
  const firingPos = player.pos.clone();
  function pulse(distance = 40) {
    player.pos.x = h.site.anchor.x + distance;
    player.pos.z = h.site.anchor.z;
    result = null;
    scan._pulse(h.state, player, h.state.simTime);
    return result?.signals.find(row => row.sourceId === h.site.id);
  }
  const cooled = pulse();
  assert.ok(cooled, 'the normal scanner must publish the operating site');
  assert.match(cooled.detail, /signature/i, 'the player readout must name its signature');
  assert.doesNotMatch(cooled.detail, /Thermal Fault|site_|sm_|skin/);
  const farDistance = cooled.range - 1;
  assert.ok(pulse(farDistance), 'an intact fin must be detected at its published range');
  player.pos.copy(firingPos);
  for (let i = 0; i < 20 && h.fin.alive; i++) h.shoot();
  h.coreHost.lifetimeSweep(1 / 60, h.state);
  h.sites._tickSite(h.site, 1, h.state);
  const broken = pulse();
  assert.ok(broken);
  assert.match(broken.detail, /Thermal Fault/);
  assert.match(broken.detail, /signature/i);
  assert.doesNotMatch(broken.detail, /site_|sm_|skin/);
  assert.ok(broken.range < cooled.range, 'losing the bright fin must reduce detection range');
  assert.equal(pulse(farDistance), undefined, 'the same far pulse can no longer detect the sheared site');
  h.site.sectorId = 'sector_pallas';
  assert.equal(pulse(), undefined, 'a pulse must not read sites in another sector');
});
