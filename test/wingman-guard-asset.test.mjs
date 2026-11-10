// Wingman guard order — a guard with a target guards THAT asset, not the player.
// U11 (WF-07): the raid math already counts guard+targetRef as protection; the live
// wingman now shows up: screen ring on the asset, defensive intercept of close hostiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wingmen } from '../src/systems/wingmen.js';

function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, p) {
      for (const fn of handlers.get(name) || []) fn(p);
    },
  };
}

function makeState() {
  return {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    meta: { seed: 5150 },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { targetId: null, cargo: { items: {}, usedVolume: 0, capVolume: 40 } },
    automation: { fleet: [] },
    world: { currentSectorId: 'sector_helios_prime' },
    rng: () => 0.5,
  };
}

let nextId = 100;
function place(state, spec) {
  const id = spec.id != null ? spec.id : nextId++;
  const e = {
    id,
    type: spec.type || 'ship',
    alive: true,
    team: spec.team != null ? spec.team : 0,
    pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
    vel: { x: 0, y: 0, z: 0 },
    radius: spec.radius != null ? spec.radius : 6,
    mass: spec.mass || 10,
    hull: spec.hull != null ? spec.hull : 100,
    hullMax: spec.hullMax != null ? spec.hullMax : 100,
    flags: {},
    data: spec.data || {},
  };
  state.entities.set(id, e);
  state.entityList.push(e);
  return e;
}

function rig() {
  const state = makeState();
  const bus = makeBus();
  const helpers = { spawnEntity(spec) { return place(state, spec); } };
  const wings = Object.create(wingmen);
  wings.init({ state, bus, helpers, registry: null });
  const player = place(state, { id: 1, pos: { x: 0, z: 0 } });
  player.data.ai = {};
  return { state, bus, wings, player };
}

function guardWing(state, id, wingId, x, z, order = 'guard', targetRef = null) {
  const e = place(state, { id: wingId, team: 0, pos: { x, z }, data: { ai: {} } });
  const fs = { id, order, targetRef, _liveId: e.id, hullPct: 1 };
  state.automation.fleet.push(fs);
  return { e, fs };
}

function ticks(wings, state, n) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    wings.update(1 / 60, state);
  }
}

function anchorNear(anchor, pos, radius) {
  return Math.hypot(anchor.x - pos.x, anchor.z - pos.z) <= radius;
}

test('a guard with a target screens the asset, not the player', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: { archetype: 'miner' } } });
  const { e } = guardWing(state, 'w1', 11, 100, 0, 'guard', { kind: 'ref', refId: miner.id });
  ticks(wings, state, 5);
  const activity = e.data.ai.activity;
  assert.equal(activity.kind, 'screen');
  assert.equal(activity.reason, 'wing_order:guard');
  assert.ok(anchorNear(activity.anchor, miner.pos, 200), `anchor holds the miner (${JSON.stringify(activity.anchor)})`);
  assert.ok(!anchorNear(activity.anchor, { x: 0, z: 0 }, 200), 'anchor leaves the player');
});

test('an escort with a target is also an asset guard (matches the raid math)', () => {
  const { state, wings } = rig();
  const freighter = place(state, { id: 42, team: 2, pos: { x: -1200, z: 300 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 100, 0, 'escort', { kind: 'ref', refId: freighter.id });
  ticks(wings, state, 5);
  assert.equal(e.data.ai.activity.reason, 'wing_order:guard');
  assert.ok(anchorNear(e.data.ai.activity.anchor, freighter.pos, 200));
});

test('the guard ring follows a moving asset', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 100, 0, 'guard', { kind: 'ref', refId: miner.id });
  ticks(wings, state, 5);
  const first = { ...e.data.ai.activity.anchor };
  assert.ok(anchorNear(first, miner.pos, 200));
  miner.pos.x += 400;
  miner.pos.z -= 200;
  ticks(wings, state, 5);
  assert.ok(anchorNear(e.data.ai.activity.anchor, miner.pos, 200), 'anchor tracks the asset');
  assert.ok(Math.hypot(e.data.ai.activity.anchor.x - first.x, e.data.ai.activity.anchor.z - first.z) > 100);
});

test('a dead or vanished asset falls back to screening the player', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 100, 0, 'guard', { kind: 'ref', refId: miner.id });
  ticks(wings, state, 5);
  assert.equal(e.data.ai.activity.reason, 'wing_order:guard');
  miner.alive = false;
  ticks(wings, state, 5);
  assert.equal(e.data.ai.activity.reason, 'wing_order:screen');
  assert.ok(anchorNear(e.data.ai.activity.anchor, { x: 0, z: 0 }, 200), 'anchor returns to the player');
});

test('a guard with no target still screens the player (unchanged)', () => {
  const { state, wings } = rig();
  guardWing(state, 'w1', 11, 100, 0, 'guard', null);
  const e = state.entities.get(11);
  ticks(wings, state, 5);
  assert.equal(e.data.ai.activity.kind, 'screen');
  assert.equal(e.data.ai.activity.reason, 'wing_order:screen');
  assert.ok(anchorNear(e.data.ai.activity.anchor, { x: 0, z: 0 }, 200));
});

test('a guard intercepts hostiles closing on the asset', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 1400, 0, 'guard', { kind: 'ref', refId: miner.id });
  const pirate = place(state, { id: 51, team: 1, pos: { x: 1700, z: 100 }, data: { ai: {}, combat: {} } });
  ticks(wings, state, 5);
  assert.equal(e.data.combat.targetId, pirate.id, 'guard takes the threat');
  assert.equal(e.data.ai.activity.kind, 'attack_run');
  assert.equal(e.data.ai.activity.reason, 'wing_order:guard_intercept');
  assert.ok(anchorNear(e.data.ai.activity.anchor, miner.pos, 200), 'intercept stays leashed to the asset');
  assert.equal(e.data.ai.activity.leashRadius, 1000);
});

test('a distant pirate does not pull the guard off station', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 1400, 0, 'guard', { kind: 'ref', refId: miner.id });
  place(state, { id: 51, team: 1, pos: { x: 1500 + 900, z: 0 }, data: { ai: {}, combat: {} } });
  ticks(wings, state, 5);
  assert.equal(e.data.ai.activity.reason, 'wing_order:guard');
  assert.equal(e.data.combat.targetId, null);
});

test('any hull actively targeting the asset is answered, whatever its team', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 1400, 0, 'guard', { kind: 'ref', refId: miner.id });
  const rogue = place(state, {
    id: 52, team: 2, pos: { x: 1600, z: 0 },
    data: { ai: {}, combat: { targetId: miner.id } },
  });
  ticks(wings, state, 5);
  assert.equal(e.data.combat.targetId, rogue.id);
  assert.equal(e.data.ai.activity.reason, 'wing_order:guard_intercept');
});

test('killing the threat returns the guard to the ring', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 1400, 0, 'guard', { kind: 'ref', refId: miner.id });
  const pirate = place(state, { id: 51, team: 1, pos: { x: 1700, z: 100 }, data: { ai: {}, combat: {} } });
  ticks(wings, state, 5);
  assert.equal(e.data.combat.targetId, pirate.id);
  pirate.alive = false;
  ticks(wings, state, 5);
  assert.equal(e.data.combat.targetId, null);
  assert.equal(e.data.ai.activity.reason, 'wing_order:guard');
  assert.ok(anchorNear(e.data.ai.activity.anchor, miner.pos, 200));
});

test('the nearest of two threats wins, deterministically', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  const { e } = guardWing(state, 'w1', 11, 1400, 0, 'guard', { kind: 'ref', refId: miner.id });
  place(state, { id: 58, team: 1, pos: { x: 1900, z: 0 }, data: { ai: {}, combat: {} } });
  place(state, { id: 51, team: 1, pos: { x: 1700, z: 0 }, data: { ai: {}, combat: {} } });
  ticks(wings, state, 5);
  assert.equal(e.data.combat.targetId, 51);
});

test('two guards on one asset spread the ring instead of stacking', () => {
  const { state, wings } = rig();
  const miner = place(state, { id: 41, team: 2, pos: { x: 1500, z: 0 }, data: { ai: {} } });
  guardWing(state, 'w1', 11, 1400, 0, 'guard', { kind: 'ref', refId: miner.id });
  guardWing(state, 'w2', 12, 1400, 50, 'guard', { kind: 'ref', refId: miner.id });
  ticks(wings, state, 5);
  const a = state.entities.get(11).data.ai.activity.anchor;
  const b = state.entities.get(12).data.ai.activity.anchor;
  assert.ok(anchorNear(a, miner.pos, 200));
  assert.ok(anchorNear(b, miner.pos, 200));
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 50, 'ring slots differ');
});

test('guarding the player or a loose pickup is just a player screen', () => {
  const { state, wings } = rig();
  const pickup = place(state, { id: 44, type: 'pickup', team: -1, pos: { x: 800, z: 0 }, data: {} });
  guardWing(state, 'w1', 11, 100, 0, 'guard', { kind: 'ref', refId: pickup.id });
  guardWing(state, 'w2', 12, 120, 0, 'guard', { kind: 'ref', refId: 1 });
  ticks(wings, state, 5);
  for (const id of [11, 12]) {
    const e = state.entities.get(id);
    assert.equal(e.data.ai.activity.reason, 'wing_order:screen');
    assert.ok(anchorNear(e.data.ai.activity.anchor, { x: 0, z: 0 }, 200));
    assert.equal(e.data.wingmanGuardId, null);
  }
});

test('a guard can hold a rock (claim protection)', () => {
  const { state, wings } = rig();
  const rock = place(state, {
    id: 43, type: 'asteroid', team: -1, pos: { x: 900, z: -400 }, radius: 10,
    data: { typeId: 'ast_common_rock', oreHP: 400, oreHPMax: 400 },
  });
  const { e } = guardWing(state, 'w1', 11, 100, 0, 'guard', { kind: 'ref', refId: rock.id });
  ticks(wings, state, 5);
  assert.equal(e.data.ai.activity.reason, 'wing_order:guard');
  assert.ok(anchorNear(e.data.ai.activity.anchor, rock.pos, 200));
});
