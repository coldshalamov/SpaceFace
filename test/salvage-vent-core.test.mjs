// Venting pays a hot core (INF-U13, WF-16): the careful approach ejects a
// scoopable reactor core on a 25 s fuse — scoop it, or it cooks off alone and
// can light the row. Sibling fireballs pop hot cores in the blast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { salvageActions } from '../src/systems/salvageActions.js';

function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    off(name, fn) {
      const list = handlers.get(name) || [];
      handlers.set(name, list.filter((f) => f !== fn));
    },
    emit(name, p) {
      for (const fn of handlers.get(name) || []) fn(p);
    },
  };
}

function rig() {
  const state = {
    simTime: 100, tick: 6000, playerId: 1,
    entities: new Map(), entityList: [],
    player: { tether: null },
  };
  const bus = makeBus();
  const onHits = [];
  const registry = { get: (name) => (name === 'combat' ? { onHit: (p) => onHits.push(p) } : null) };
  const sys = Object.create(salvageActions);
  sys.init({ state, bus, registry });
  const spawns = [];
  const ejected = [];
  const detonated = [];
  const toasts = [];
  bus.on('entity:spawnRequest', (p) => spawns.push(p));
  bus.on('salvage:coreEjected', (p) => ejected.push(p));
  bus.on('salvage:coreDetonated', (p) => detonated.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, sys, onHits, spawns, ejected, detonated, toasts };
}

let nextId = 100;
function place(ctx, spec) {
  const id = spec.id != null ? spec.id : nextId++;
  const e = {
    id,
    type: spec.type || 'ship',
    alive: true,
    team: spec.team != null ? spec.team : 0,
    pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
    vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
    radius: spec.radius != null ? spec.radius : 8,
    hull: 100, hullMax: 100,
    data: spec.data || {},
  };
  ctx.state.entities.set(id, e);
  ctx.state.entityList.push(e);
  return e;
}

function wreck(ctx, id, x, z, extra = {}) {
  return place(ctx, {
    id, type: 'wreck', team: -1, pos: { x, z }, radius: 10,
    data: { unstableReactor: { dueAt: 10000, damage: 20, vented: false, burst: false, towedClear: false, ...extra } },
  });
}

// Materialize a captured spawnRequest spec as a live entity (what coreSystem does).
function materialize(ctx, spec, id) {
  return place(ctx, { id, ...spec, pos: { ...spec.pos }, vel: { ...(spec.vel || {}) }, data: { ...spec.data } });
}

test('venting ejects one scoopable core with a hashed kick and announces the fuse', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0);
  ctx.bus.emit('salvage:ventReactor', { wreckId: w.id });
  assert.equal(w.data.unstableReactor.vented, true);
  assert.equal(ctx.spawns.length, 1, 'one spawn request');
  const spec = ctx.spawns[0].spec;
  assert.equal(spec.type, 'pickup');
  assert.equal(spec.data.kind, 'cargo');
  assert.equal(spec.data.commodityId, 'cmdty_salvage_electronics');
  assert.ok(spec.data.amount >= 2, 'worth the trip');
  assert.equal(spec.data.ventedCore, true);
  assert.equal(spec.data.cooledAt, 125, '25 s fuse');
  assert.equal(spec.data.despawnAt, 160, '60 s TTL');
  assert.ok(Math.hypot(spec.pos.x, spec.pos.z) > 10, 'kicked clear of the hull');
  assert.ok(Math.hypot(spec.vel.x, spec.vel.z) > 20, 'ejected with real velocity');
  assert.equal(ctx.ejected.length, 1);
  assert.ok(ctx.toasts.some((t) => /critical in 25s/.test(t.text)), 'the fuse is announced');
  // Deterministic: the same wreck vents the same way.
  const ctx2 = rig();
  const w2 = wreck(ctx2, 50, 0, 0);
  ctx2.bus.emit('salvage:ventReactor', { wreckId: w2.id });
  assert.deepEqual(ctx2.spawns[0].spec.pos, ctx.spawns[0].spec.pos);
});

test('a second vent is a no-op — one wreck pays one core', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0);
  ctx.bus.emit('salvage:ventReactor', { wreckId: w.id });
  ctx.bus.emit('salvage:ventReactor', { wreckId: w.id });
  assert.equal(ctx.spawns.length, 1, 'no double core');
});

test('an unscooped core warns, then cooks off alone and burns the blast', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0);
  place(ctx, { id: 1, pos: { x: 40, z: 0 } });
  const near = place(ctx, { id: 2, team: 1, pos: { x: 60, z: 0 } });
  place(ctx, { id: 3, team: 1, pos: { x: 900, z: 0 } });
  ctx.bus.emit('salvage:ventReactor', { wreckId: w.id });
  const core = materialize(ctx, ctx.spawns[0].spec, 60);
  ctx.state.simTime = 120; // inside the warn window, before the fuse
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(core.alive, true, 'still live before the fuse');
  assert.ok(ctx.toasts.some((t) => /going critical/.test(t.text)), 'one warning toast');
  ctx.state.simTime = 126; // past the fuse
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(core.alive, false, 'the fuse pops it');
  assert.equal(ctx.detonated.length, 1);
  assert.ok(ctx.onHits.some((h) => h.targetId === near.id && h.damageType === 'thermal'),
    'the near pirate burns');
  assert.ok(ctx.onHits.every((h) => h.targetId !== 3), 'the distant pirate is safe');
});

test('damage pops a hot core with attribution; a cold core is inert', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0);
  place(ctx, { id: 1, pos: { x: 40, z: 0 } });
  ctx.bus.emit('salvage:ventReactor', { wreckId: w.id });
  const core = materialize(ctx, ctx.spawns[0].spec, 60);
  ctx.bus.emit('combat:damage', { targetId: core.id, attackerId: 1, applied: 5, amount: 5 });
  assert.equal(core.alive, false, 'hot + shot = popped');
  assert.equal(ctx.detonated[0].triggeredBy, 1, 'attribution follows the shooter');
  assert.ok(ctx.onHits.every((h) => h.ownerId === 1));
  // Cold core: past the fuse, still on the field (magnet owns it), damage ignored.
  const ctx2 = rig();
  const w2 = wreck(ctx2, 50, 0, 0);
  ctx2.bus.emit('salvage:ventReactor', { wreckId: w2.id });
  const cold = materialize(ctx2, ctx2.spawns[0].spec, 61);
  ctx2.state.simTime = 200;
  ctx2.bus.emit('combat:damage', { targetId: cold.id, attackerId: 1, applied: 50, amount: 50 });
  assert.equal(cold.alive, true, 'cold cores do not pop');
  assert.equal(ctx2.detonated.length, 0);
});

test('a hot core pop lights a sibling reactor; a sibling blast pops a hot core', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0);
  const sib = wreck(ctx, 51, 40, 0, { dueAt: 10000 });
  ctx.bus.emit('salvage:ventReactor', { wreckId: w.id });
  const core = materialize(ctx, ctx.spawns[0].spec, 60);
  core.pos.x = 30; core.pos.z = 0; // inside the core blast of the sibling
  ctx.bus.emit('combat:damage', { targetId: core.id, attackerId: 1, applied: 5, amount: 5 });
  assert.equal(ctx.detonated[0].chained, 1, 'the pop lit the sibling');
  assert.equal(sib.data.unstableReactor.dueAt, 100.5, 'half a second later');
  // Reverse: a reactor blast catches a fresh hot core.
  const ctx2 = rig();
  const w2 = wreck(ctx2, 50, 0, 0, { dueAt: 50 });
  const w3 = wreck(ctx2, 52, 500, 0);
  ctx2.bus.emit('salvage:ventReactor', { wreckId: w3.id });
  const core2 = materialize(ctx2, ctx2.spawns[0].spec, 61);
  core2.pos.x = 20; core2.pos.z = 0; // inside the reactor blast
  ctx2.sys.update(1 / 60, ctx2.state);
  assert.equal(core2.alive, false, 'the blast popped the hot core');
  assert.equal(ctx2.detonated.length, 1, 'one core detonation receipt');
});
