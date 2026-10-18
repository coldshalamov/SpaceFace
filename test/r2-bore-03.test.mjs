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
import { asteroidSites } from '../src/systems/asteroidSites.js';

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
