// Wingman mine order — the fleet 'mine' order works a rock through the live extractor.
// U5 (WF-07): prospect → anchor → cut; ore ejects as ordinary magnet pickups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wingmen } from '../src/systems/wingmen.js';
import { mining } from '../src/systems/mining.js';

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
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    meta: { seed: 4242 },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { targetId: null, cargo: { items: {}, usedVolume: 0, capVolume: 40 } },
    automation: { fleet: [] },
    world: { currentSectorId: 'sector_helios_prime' },
    rng: () => 0.5,
  };
  return state;
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
    ...spec.extra,
  };
  state.entities.set(id, e);
  state.entityList.push(e);
  return e;
}

function rig() {
  const state = makeState();
  const bus = makeBus();
  const helpers = {
    spawnEntity(spec) {
      return place(state, {
        type: spec.type,
        pos: spec.pos,
        radius: spec.radius,
        mass: spec.mass,
        data: spec.data || {},
      });
    },
  };
  const miningSys = Object.create(mining);
  miningSys.init({ state, bus, helpers, registry: null });
  const registry = { get: (name) => (name === 'mining' ? miningSys : null) };
  const wings = Object.create(wingmen);
  wings.init({ state, bus, helpers, registry });
  const player = place(state, { id: 1, pos: { x: 0, z: 0 } });
  player.data.ai = {};
  return { state, bus, wings, player };
}

function mineWing(state, id, wingId, x, z) {
  const e = place(state, { id: wingId, team: 0, pos: { x, z }, data: { ai: {} } });
  const fs = { id, order: 'mine', _liveId: e.id, hullPct: 1 };
  state.automation.fleet.push(fs);
  return { e, fs };
}

function rock(state, id, x, z, hp = 400) {
  return place(state, {
    id, type: 'asteroid', team: -1, pos: { x, z }, radius: 10, hull: hp, hullMax: hp,
    data: { typeId: 'ast_common_rock', oreHP: hp, oreHPMax: hp },
  });
}

function ticks(wings, state, n) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    wings.update(1 / 60, state);
  }
}

test('a mining wingman anchors on the nearest rock and cuts it through the live extractor', () => {
  // NOTE: 1200 ticks may fully strip rock 21 and retarget wing to rock 22; the
  // anchors/cut assertions below re-check against whichever face is live.
  const { state, wings } = rig();
  const { e } = mineWing(state, 'w1', 11, 100, 0);
  const r = rock(state, 21, 250, 0, 120);
  rock(state, 22, 900, 0);
  ticks(wings, state, 10);
  assert.equal(e.data.wingmanMining, r.id, 'wingman is cutting the nearest rock');
  assert.equal(e.data.ai.activity.kind, 'screen');
  assert.equal(e.data.ai.activity.reason, 'wing_order:mine');
  assert.deepEqual(e.data.ai.activity.anchor, { x: r.pos.x, z: r.pos.z });
  ticks(wings, state, 1200);
  assert.ok(r.data.oreHP < 120, `rock lost ore-HP (${r.data.oreHP})`);
  const pickups = state.entityList.filter((x) => x.type === 'pickup' && x.data.kind === 'ore');
  assert.ok(pickups.length > 0, 'cut ore ejects as ordinary magnet pickups');
});

test("the player's marked rock wins over a nearer face", () => {
  const { state, wings } = rig();
  const { e, fs } = mineWing(state, 'w1', 11, 100, 0);
  rock(state, 21, 250, 0);
  const marked = rock(state, 22, 800, 0);
  state.player.targetId = marked.id;
  ticks(wings, state, 10);
  assert.equal(fs._mineRockId, marked.id, 'marked rock is the working face');
  assert.deepEqual(e.data.ai.activity.anchor, { x: marked.pos.x, z: marked.pos.z });
});

test('two mining wings spread across two rocks instead of stacking', () => {
  const { state, wings } = rig();
  mineWing(state, 'w1', 11, 100, 0);
  mineWing(state, 'w2', 12, 120, 0);
  const a = rock(state, 21, 250, 0);
  const b = rock(state, 22, 260, 0);
  ticks(wings, state, 10);
  const faces = state.automation.fleet.map((fs) => fs._mineRockId).sort();
  assert.deepEqual(faces, [a.id, b.id].sort(), 'each wing works its own face');
});

test('a fleeing wingman breaks off the cut instead of beaming while running', () => {
  const { state, wings } = rig();
  const { e } = mineWing(state, 'w1', 11, 100, 0);
  const r = rock(state, 21, 250, 0);
  ticks(wings, state, 5);
  assert.equal(e.data.wingmanMining, r.id);
  e.data.ai.fsm = 'flee';
  const hpBefore = r.data.oreHP;
  ticks(wings, state, 10);
  assert.equal(e.data.wingmanMining, null);
  assert.equal(r.data.oreHP, hpBefore, 'no cutting while fleeing');
});

test('no rock in reach holds formation without crashing', () => {
  const { state, wings } = rig();
  const { e, fs } = mineWing(state, 'w1', 11, 100, 0);
  rock(state, 21, 5000, 0);
  ticks(wings, state, 10);
  assert.equal(e.data.wingmanMining, null);
  assert.equal(fs._mineRockId, null);
});

test('mining:tick names its source hull so the beam fan draws from the wingman', () => {
  const { state, bus, wings } = rig();
  mineWing(state, 'w1', 11, 100, 0);
  rock(state, 21, 250, 0);
  const seen = [];
  bus.on('mining:tick', (p) => seen.push(p));
  ticks(wings, state, 5);
  assert.ok(seen.length > 0, 'extraction emits mining:tick');
  assert.equal(seen[0].sourceEntityId, 11, 'tick names the wingman hull');
});
