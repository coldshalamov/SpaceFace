// Crews clear a cooking reactor (INF-U19, WF-01): gunfire that cooks a fuse —
// or a virgin timer inside the warning window — sends nearby working ships
// running, with one shouted warning and one shaken-loose unit per hull.
// Hostiles hold their attack runs and burn; the wing holds formation.
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
  const said = [];
  const registry = { get: () => null };
  const sys = Object.create(salvageActions);
  sys.init({ state, bus, registry, helpers: { voice: { say: (line) => said.push(line) } } });
  const spawns = [];
  const flights = [];
  const toasts = [];
  bus.on('entity:spawnRequest', (p) => spawns.push(p));
  bus.on('salvage:cookerFlight', (p) => flights.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, sys, said, spawns, flights, toasts };
}

let nextId = 100;
function place(ctx, spec) {
  const id = spec.id != null ? spec.id : nextId++;
  const e = {
    id,
    type: spec.type || 'ship',
    alive: true,
    team: spec.team != null ? spec.team : 2,
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

function cook(ctx, target) {
  ctx.bus.emit('combat:damage', { targetId: target.id, attackerId: 7, applied: 10, amount: 10 });
}

test('a cooked fuse sends nearby workers running, one warning, far ships work on', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0);
  const miner = place(ctx, { id: 60, pos: { x: 150, z: 0 }, data: { ai: { archetype: 'miner' } } });
  const far = place(ctx, { id: 61, pos: { x: 2000, z: 0 }, data: { ai: { archetype: 'hauler' } } });
  cook(ctx, w);
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(miner.data.intent.mode, 'salvage_cooker_flee', 'the miner runs');
  assert.ok(Math.abs(miner.data.intent.aimAngle - 0) < 1e-9, 'directly away from the wreck');
  assert.equal(miner.data.intent.moveZ, 1);
  assert.equal(miner.data.intent.boost, true, 'close in means boosting');
  assert.equal(miner.data.intent.fire, false);
  assert.ok(miner.data.ai._cookerFlee, 'the stamp holds the run');
  assert.equal((far.data.intent && far.data.intent.mode) || null, null, 'far ships work on');
  assert.equal(ctx.flights.length, 1, 'one flight event per cooker');
  assert.equal(ctx.flights[0].shipId, miner.id);
  assert.ok(ctx.toasts.some((t) => /clearing the wreck/.test(t.text)), 'the site is warned');
  assert.ok(ctx.said.some((l) => l.kind === 'salvage_cooker_flee'), 'out loud, once');
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(ctx.flights.length, 1, 'the warning does not repeat');
});

test('an uncooked far-timer reactor moves nobody', () => {
  const ctx = rig();
  wreck(ctx, 50, 0, 0); // dueAt 10000, never touched
  const miner = place(ctx, { id: 60, pos: { x: 150, z: 0 }, data: { ai: { archetype: 'miner' } } });
  ctx.sys.update(1 / 60, ctx.state);
  assert.ok(!miner.data.intent || miner.data.intent.mode !== 'salvage_cooker_flee');
  assert.equal(ctx.flights.length, 0);
});

test('a virgin timer inside the window still clears the site', () => {
  const ctx = rig();
  wreck(ctx, 50, 0, 0, { dueAt: 105 }); // 5 s out, nobody shot it
  const miner = place(ctx, { id: 60, pos: { x: 150, z: 0 }, data: { ai: { archetype: 'miner' } } });
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(miner.data.intent.mode, 'salvage_cooker_flee');
});

test('hostiles, the wing, and docked hulls hold through the cook', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0);
  const pirate = place(ctx, {
    id: 70, team: 1, pos: { x: 150, z: 0 },
    data: { ai: { archetype: 'pirate', hostileTeams: [0] } },
  });
  const duelist = place(ctx, {
    id: 71, team: 1, pos: { x: 160, z: 0 }, data: { ai: { forcePlayerTarget: true } },
  });
  const wing = place(ctx, { id: 72, team: 0, pos: { x: 170, z: 0 }, data: { ai: {} } });
  const docked = place(ctx, { id: 73, pos: { x: 180, z: 0 }, data: { ai: { docked: true } } });
  cook(ctx, w);
  ctx.sys.update(1 / 60, ctx.state);
  for (const [ship, label] of [[pirate, 'pirate'], [duelist, 'duelist'], [wing, 'wingman'], [docked, 'docked']]) {
    assert.ok(!ship.data.intent || ship.data.intent.mode !== 'salvage_cooker_flee', `${label} holds`);
    assert.ok(!ship.data.ai._cookerFlee, `${label} takes no stamp`);
  }
});

test('fleeing workers shake one unit loose; warships run clean; the burst releases all', () => {
  const ctx = rig();
  const w = wreck(ctx, 50, 0, 0, { dueAt: 140 });
  const miner = place(ctx, { id: 60, pos: { x: 150, z: 0 }, data: { ai: { archetype: 'miner' } } });
  const escort = place(ctx, { id: 61, pos: { x: 250, z: 0 }, data: { ai: { archetype: 'interceptor' } } });
  cook(ctx, w);
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(escort.data.intent.mode, 'salvage_cooker_flee', 'warships run too');
  const drops = ctx.spawns.filter((s) => s.spec && s.spec.data && s.spec.data.scanLabel === 'Shaken loose');
  assert.equal(drops.length, 1, 'only the worker drops');
  assert.equal(drops[0].spec.data.commodityId, 'cmdty_scrap_metal');
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(ctx.spawns.filter((s) => s.spec.data.scanLabel === 'Shaken loose').length, 1, 'one drop per cook');
  ctx.state.simTime = 141; // the fuse runs out
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(w.data.unstableReactor.burst, true);
  assert.equal(miner.data.intent.mode, 'resume', 'the run ends at the blast');
  assert.ok(!miner.data.ai._cookerFlee, 'the stamp clears');
});

// Vent a real wreck and materialize the ejected core (what coreSystem does),
// so the fuse sweep arms exactly as on the live route.
function ventedCore(ctx, wreckId = 50) {
  const w = wreck(ctx, wreckId, 0, 0);
  ctx.bus.emit('salvage:ventReactor', { wreckId: w.id });
  assert.equal(w.data.unstableReactor.vented, true);
  const spec = ctx.spawns[ctx.spawns.length - 1].spec;
  return place(ctx, {
    id: 80, type: 'pickup', team: -1,
    pos: { ...spec.pos }, vel: { ...(spec.vel || {}) },
    radius: spec.radius, data: { ...spec.data },
  });
}

test('a hot ejected core inside its window clears ships too', () => {
  const ctx = rig();
  const core = ventedCore(ctx); // cooledAt 125
  const miner = place(ctx, {
    id: 60, pos: { x: core.pos.x + 100, z: core.pos.z },
    data: { ai: { archetype: 'miner' } },
  });
  ctx.state.simTime = 122; // 3 s left on the fuse
  ctx.sys.update(1 / 60, ctx.state);
  assert.equal(miner.data.intent.mode, 'salvage_cooker_flee', 'the core clears the pocket');
  assert.equal(ctx.flights.length, 1);
  assert.equal(ctx.flights[0].core, true);
  assert.ok(core.alive !== false, 'warning is not detonation');
});

test('a hot core far from its pop moves nobody', () => {
  const ctx = rig();
  const core = ventedCore(ctx); // cooledAt 125, simTime still 100
  place(ctx, {
    id: 60, pos: { x: core.pos.x + 100, z: core.pos.z },
    data: { ai: { archetype: 'miner' } },
  });
  const miner = ctx.state.entities.get(60);
  ctx.sys.update(1 / 60, ctx.state);
  assert.ok(!miner.data.intent || miner.data.intent.mode !== 'salvage_cooker_flee');
});
