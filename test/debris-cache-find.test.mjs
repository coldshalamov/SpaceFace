// Sealed survivor caches in generic debris (INF-U18, WF-10): a deep read of a
// loss-less wreck can expose a seeded physical cache, and a biting beam cracks
// the same cache in unscanned hulls. Loss-linked wrecks keep their story-only
// reads; authored mirrors stay exact; no hull pays twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { debrisCacheFor } from '../src/data/scanReveal.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { mining } from '../src/systems/mining.js';

function scanRig(seed = 47) {
  const state = {
    simTime: 1000, tick: 60000, playerId: 1,
    meta: { seed },
    entities: new Map(), entityList: [],
    world: { currentSectorId: 'sector_test', sectors: { sector_test: { id: 'sector_test', name: 'Test Field' } } },
    lossLedger: { bySector: { sector_test: [] } },
    player: {},
  };
  const bus = createBus();
  const sys = Object.create(scanReveal);
  sys.init({ state, bus });
  const spawns = [];
  const caches = [];
  const investigated = [];
  const toasts = [];
  bus.on('entity:spawnRequest', (p) => spawns.push(p));
  bus.on('scan:debrisCache', (p) => caches.push(p));
  bus.on('scan:wreckInvestigated', (p) => investigated.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, sys, spawns, caches, investigated, toasts };
}

function mineRig(seed = 5150) {
  const bus = createBus();
  const state = {
    mode: 'flight',
    simTime: 100,
    tick: 6000,
    meta: { seed },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { targetId: null, cargo: { items: {}, usedVolume: 0, capVolume: 40 } },
    world: { currentSectorId: 'sector_helios_prime' },
    rng: () => 0.5,
  };
  const pods = [];
  const mine = Object.create(mining);
  mine.init({
    state, bus,
    helpers: { spawnEntity(spec) { const pod = { id: 900 + pods.length, ...spec }; pods.push(pod); return pod; } },
    registry: { get: () => null },
  });
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 10, hull: 100, hullMax: 100,
    data: { ai: {} },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const spawns = [];
  const caches = [];
  const toasts = [];
  bus.on('entity:spawnRequest', (p) => spawns.push(p));
  bus.on('scan:debrisCache', (p) => caches.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, mine, player, pods, spawns, caches, toasts };
}

function placeWreck(state, id, x, z, { pool = null, lossId = null, sourceKey = null } = {}) {
  const e = {
    id, type: 'wreck', alive: true, team: -1,
    pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 },
    radius: 8, hull: 10, hullMax: 10,
    data: {
      ...(lossId ? { provenance: { lossId } } : {}),
      ...(pool ? { salvagePool: { ...pool } } : {}),
      ...(sourceKey ? { salvageSourceKey: sourceKey } : {}),
    },
  };
  state.entities.set(id, e);
  state.entityList.push(e);
  return e;
}

// First wreck id in the sweep whose seeded roll does (or does not) hold a cache.
function findCacheId(seed, want, cold) {
  for (let id = 1; id < 2000; id++) {
    const probe = { id, type: 'wreck', data: { salvagePool: cold ? {} : { cmdty_scrap_metal: 20 } } };
    const hit = debrisCacheFor(probe, seed) != null;
    if (hit === want) return id;
  }
  throw new Error('no deterministic cache id in sweep');
}

test('a deep read exposes the seeded cache as physical pods, once per hull', () => {
  const ctx = scanRig();
  const id = findCacheId(47, true, false);
  const wreck = placeWreck(ctx.state, id, 100, 0, { pool: { cmdty_scrap_metal: 20 } });
  const expected = debrisCacheFor(wreck, 47);
  assert.ok(expected && expected.lots.length >= 1);
  assert.deepEqual(debrisCacheFor(wreck, 47), expected, 'the roll is deterministic');
  ctx.bus.emit('scan:pulse', { pos: { x: 100, z: 0 } });
  assert.equal(wreck.data.debrisCache, 'claimed');
  assert.equal(ctx.spawns.length, expected.lots.length, 'one pod per lot');
  assert.ok(ctx.spawns.every((s) => s.spec && s.spec.type === 'pickup' && s.spec.data.debrisCache === true));
  assert.deepEqual(ctx.spawns.map((s) => s.spec.data.commodityId).sort(),
    expected.lots.map((l) => l.commodityId).sort());
  assert.equal(ctx.caches.length, 1);
  assert.equal(ctx.caches[0].via, 'scan');
  assert.equal(ctx.caches[0].wreckId, id);
  assert.ok(ctx.toasts.some((t) => /Sealed cache in the debris/.test(t.text)));
  ctx.bus.emit('scan:pulse', { pos: { x: 100, z: 0 } });
  assert.equal(ctx.spawns.length, expected.lots.length, 'a re-scan pays nothing more');
});

test('a cache-less hull stamps empty and stays silent', () => {
  const ctx = scanRig();
  const id = findCacheId(47, false, false);
  const wreck = placeWreck(ctx.state, id, 100, 0, { pool: { cmdty_scrap_metal: 20 } });
  ctx.bus.emit('scan:pulse', { pos: { x: 100, z: 0 } });
  assert.equal(wreck.data.debrisCache, 'empty');
  assert.equal(ctx.spawns.length, 0);
  assert.equal(ctx.caches.length, 0);
});

test('a cold hull caches a single missed lot', () => {
  const ctx = scanRig();
  const id = findCacheId(47, true, true);
  const wreck = placeWreck(ctx.state, id, 100, 0, { pool: {} });
  const expected = debrisCacheFor(wreck, 47);
  assert.ok(expected && expected.cold === true);
  assert.equal(expected.lots.length, 1, 'picked-over hulls hide one lot at most');
  ctx.bus.emit('scan:pulse', { pos: { x: 100, z: 0 } });
  assert.equal(ctx.spawns.length, 1);
  assert.equal(ctx.caches[0].cold, true);
});

test('a loss-linked wreck keeps its story read: no cache either way', () => {
  const ctx = scanRig();
  ctx.state.lossLedger.bySector.sector_test.push({
    lossId: 'loss-keep', kind: 'trader', factionId: 'faction_drift',
    sectorId: 'sector_test', simDay: 1,
  });
  const id = findCacheId(47, true, false); // would cache if it were generic
  const wreck = placeWreck(ctx.state, id, 100, 0, {
    pool: { cmdty_scrap_metal: 20 }, lossId: 'loss-keep',
  });
  ctx.bus.emit('scan:pulse', { pos: { x: 100, z: 0 } });
  assert.equal(ctx.investigated.length, 1, 'the cartography read still fires');
  assert.ok(wreck.data.debrisCache == null, 'the cache path never touches it');
  assert.equal(ctx.caches.length, 0);
});

test('a biting beam cracks an unscanned cache; scan-after-beam pays nothing more', () => {
  const t = mineRig();
  const id = findCacheId(5150, true, false);
  const wreck = placeWreck(t.state, id, 300, 0, { pool: { cmdty_scrap_polymer: 20 } });
  t.mine._drainWreck(t.player, wreck, 18, 3);
  assert.equal(wreck.data.debrisCache, 'claimed');
  assert.equal(t.caches.length, 1);
  assert.equal(t.caches[0].via, 'beam');
  assert.ok(t.caches[0].lots.length >= 1);
  assert.equal(t.spawns.length, t.caches[0].lots.length, 'one pod per lot');
  assert.ok(t.toasts.some((x) => /beam cracked a sealed cache/.test(x.text)));
  t.mine._drainWreck(t.player, wreck, 18, 3);
  assert.equal(t.caches.length, 1, 'the second drain finds nothing new');
  // The scan path honors the beam's stamp on the same hull.
  const sys = Object.create(scanReveal);
  sys.init({ state: t.state, bus: t.bus });
  t.bus.emit('scan:pulse', { pos: { x: 300, z: 0 } });
  assert.equal(t.caches.length, 1, 'scan-after-beam pays nothing more');
});

test('an authored mirror never cracks: its ledger owns every unit', () => {
  const t = mineRig();
  const id = findCacheId(5150, true, false);
  const wreck = placeWreck(t.state, id, 300, 0, {
    pool: { cmdty_scrap_polymer: 20 }, sourceKey: 'src-authored-1',
  });
  t.mine._drainWreck(t.player, wreck, 18, 3);
  assert.ok(wreck.data.debrisCache == null);
  assert.equal(t.caches.length, 0);
  assert.equal(t.spawns.length, 0);
});
