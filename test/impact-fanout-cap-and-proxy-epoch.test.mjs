// Impact bursts and the collision-proxy resolve cache (no-freeze world-speed work, 2026-11-21).
// 1. physics:impact fan-out is capped per tick; the rest carry to the next tick in order, keep the
//    tick they happened on, skip bodies that died or whose id was recycled, and receipts that touch
//    the player always deliver at once. Nothing is dropped.
// 2. The proxy resolve cache validates the full fingerprint once per worker sim step; inside the step
//    a body/data/type/revision swap is still seen at once, an in-place data edit from the next step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physics, SG02_IMPACT_FANOUT_CAP } from '../src/core/physics.js';
import { resolveCollisionProxyManifest, advanceCollisionProxyResolveEpoch } from '../src/data/collisionProxyManifests.js';

function harness(receiptsPerTick) {
  const entities = new Map();
  const ent = (id, extra = {}) => { const e = { id, alive: true, mass: 1, occupantGeneration: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, ...extra }; entities.set(id, e); return e; };
  const emits = [];
  const bus = { emit: (ev, p) => { if (ev === 'physics:impact') emits.push({ a: p.aId, b: p.bId, tick: p.tick }); }, setPayloadSnapshot() {} };
  const state = { entities, playerId: 'P', tick: 1, mode: 'flight' };
  const sys = Object.create(physics);
  sys.bus = bus;
  sys._pairMaterialScratch = { impactScale: 1, restitution: 0.3, tangentDamping: 0.1 };
  sys._sg02ImpactOptionsScratch = { normal: { x: 0, z: 0 } };
  sys._sg02ImpactCarry = [];
  sys._sg02ImpactCarryNext = [];
  let queue = [];
  sys._sg02 = { drainContactImpacts: () => { const out = queue; queue = []; return out; } };
  return { sys, state, ent, emits, push: (rs) => { queue = rs; } };
}

const receipt = (aId, bId, extra = {}) => ({ aId, bId, aGeneration: 1, bGeneration: 1, impulse: 5, normal: { x: 1, z: 0 }, pos: { x: 0, z: 0 }, ...extra });

test('impact fan-out: capped per tick, carried in order with its own tick, player hits never wait', () => {
  const h = harness();
  h.ent('P');
  for (let i = 0; i < 100; i++) h.ent('r' + i);
  const burst = [];
  for (let i = 0; i < 80; i += 2) burst.push(receipt('r' + i, 'r' + (i + 1)));
  burst.push(receipt('P', 'r0'));
  h.push(burst);
  h.sys._emitSg02ContactImpacts(h.state);
  const first = h.emits.length;
  assert.equal(first, SG02_IMPACT_FANOUT_CAP + 1, 'cap non-player receipts, the player hit goes now');
  assert.ok(h.emits.some((e) => e.a === 'P'), 'the player receipt is delivered in its own tick');
  h.state.tick = 2;
  h.push([]);
  h.sys._emitSg02ContactImpacts(h.state);
  assert.equal(h.emits.length, 41, 'every carried receipt is delivered on the next tick');
  assert.ok(h.emits.slice(first).every((e) => e.tick === 1), 'a carried receipt keeps the tick it happened on');
  const order = h.emits.filter((e) => e.a !== 'P').map((e) => Number(e.a.slice(1)));
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'carried receipts keep their order');
});

test('impact fan-out: a carried receipt whose body died or was recycled is skipped', () => {
  const h = harness();
  for (let i = 0; i < 100; i++) h.ent('r' + i);
  const burst = [];
  for (let i = 0; i < 80; i += 2) burst.push(receipt('r' + i, 'r' + (i + 1)));
  h.push(burst);
  h.sys._emitSg02ContactImpacts(h.state);
  // r70 died, r72 was recycled into a new occupant before the next tick.
  h.state.entities.get('r70').alive = false;
  h.state.entities.get('r72').occupantGeneration = 2;
  h.state.tick = 2;
  h.sys._emitSg02ContactImpacts(h.state);
  assert.equal(h.emits.length, 40 - 2);
  assert.ok(!h.emits.some((e) => e.a === 'r70' || e.a === 'r72'));
});

test('proxy resolve cache: full check once per step, identity swaps seen at once', () => {
  const station = { id: 's1', type: 'station', radius: 40, collides: true, physicsBody: { shape: 'ball', radius: 40, revision: 1 },
    data: { collisionProxy: 'station_ring_hub' } };
  advanceCollisionProxyResolveEpoch();
  const m1 = resolveCollisionProxyManifest(station);
  assert.equal(resolveCollisionProxyManifest(station), m1);
  // A new data shell (the usual way identity changes) is seen inside the same step.
  station.data = { collisionProxy: null };
  const m2 = resolveCollisionProxyManifest(station);
  assert.notEqual(m2, m1 || 'none', 'a data-shell swap re-resolves at once');
  // An in-place field edit is seen from the next step.
  station.data.collisionProxy = 'station_ring_hub';
  advanceCollisionProxyResolveEpoch();
  const m3 = resolveCollisionProxyManifest(station);
  assert.deepEqual(m3, m1);
  assert.equal(resolveCollisionProxyManifest(station), m3, 'a repeat ask inside the step is the cached row');
  // A body revision bump is seen at once (a fresh resolve, not the cached row).
  station.physicsBody.revision = 2;
  const m4 = resolveCollisionProxyManifest(station);
  assert.deepEqual(m4, m1);
});
