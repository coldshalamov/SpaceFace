// Unstable reactors are ordnance (INF-U7, WF-05): gunfire cooks the fuse, the
// burst is radial with falloff, and sibling reactors chain.
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
  const bursts = [];
  const toasts = [];
  bus.on('salvage:reactorBurst', (p) => bursts.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, sys, onHits, bursts, toasts };
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
    vel: { x: 0, y: 0, z: 0 },
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

test('the timer burst burns everything in the fireball, not just the player', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0, { dueAt: 50 });
  const player = place(ctx, { id: 1, pos: { x: 40, z: 0 } });
  const pirate = place(ctx, { id: 2, team: 1, pos: { x: 60, z: 0 } });
  place(ctx, { id: 3, team: 1, pos: { x: 500, z: 0 } });
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(w.alive, false, 'the wreck is consumed');
  assert.deepEqual(ctx.onHits.map((h) => h.targetId).sort(), [player.id, pirate.id].sort(),
    'both hulls in the fireball are hit; the distant one is not');
  assert.ok(ctx.onHits.every((h) => h.damageType === 'thermal'));
  assert.ok(ctx.bursts[0].hits.includes(pirate.id), 'the receipt names the pirate hit');
});

test('gunfire cooks the fuse and a cracking hit pops it at once', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0, { dueAt: 10000 });
  place(ctx, { id: 1, pos: { x: 40, z: 0 } });
  ctx.bus.emit('combat:damage', { targetId: w.id, attackerId: 1, applied: 10, amount: 10 });
  assert.ok(w.data.unstableReactor.dueAt < 10000, 'the fuse shortened');
  assert.equal(w.alive, true, 'light damage does not pop it');
  assert.ok(ctx.toasts.some((t) => /cooking off/.test(t.text)), 'the cook-off is announced');
  ctx.bus.emit('combat:damage', { targetId: w.id, attackerId: 1, applied: 50, amount: 50 });
  assert.equal(w.alive, false, 'the cracking hit detonates it');
  assert.equal(ctx.bursts[0].triggeredBy, 1, 'attribution follows the shooter');
  assert.ok(ctx.onHits.every((h) => h.ownerId === 1), 'every victim payload names the shooter');
});

test('a vented reactor is inert to gunfire', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0, { dueAt: 10000, vented: true });
  ctx.bus.emit('combat:damage', { targetId: w.id, attackerId: 1, applied: 50, amount: 50 });
  assert.equal(w.alive, true, 'vented means safe');
  assert.equal(ctx.bursts.length, 0);
});

test('the fireball chains sibling reactors with a short delay', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0, { dueAt: 50 });
  const sib = wreck(ctx, 51, 100, 0, { dueAt: 10000 });
  const far = wreck(ctx, 52, 900, 0, { dueAt: 10000 });
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(ctx.bursts[0].chained, 1, 'one sibling caught');
  assert.equal(sib.data.unstableReactor.dueAt, 100.5, 'the sibling pops half a second later');
  assert.equal(far.data.unstableReactor.dueAt, 10000, 'the distant reactor is untouched');
  assert.ok(ctx.toasts.some((t) => /Chain reaction/.test(t.text)));
});

test('a towed-clear hull still cooks when shot — the remote bomb works', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0, { dueAt: 10000, towedClear: true });
  place(ctx, { id: 1, pos: { x: 400, z: 0 } });
  const pirate = place(ctx, { id: 2, team: 1, pos: { x: 30, z: 0 } });
  ctx.bus.emit('combat:damage', { targetId: w.id, attackerId: 1, applied: 50, amount: 50 });
  assert.equal(w.alive, false, 'towed-clear cooks on gunfire');
  assert.ok(ctx.onHits.some((h) => h.targetId === pirate.id), 'the pirate camp burns');
  assert.ok(!ctx.onHits.some((h) => h.targetId === 1), 'the distant shooter is safe');
});
