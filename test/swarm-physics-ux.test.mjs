// SWARM-03 — the physics UX pass (SWARM_EXPANSION §10):
//   • power-rail slots pulse when their verb is tactically live (latch in reach,
//     armed ordnance on the field, a pack inside the well footprint)
//   • physics kill causes reach the stunt line
//   • wave packages arrive in throw-shaped clumps, not streams
//   • the rope stays first-hand without touching the (owner-pending) default package
//
// Everything here is headless: the rail model is pure, the materializer is
// deterministic, and the callout mounts against the same fake-document seam the
// PQ-146 suite uses.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import {
  materializeWaveBatch,
  SWARM_CLUMP_RADIUS_WU,
  SURVIVAL_SPAWN_DISTANCE,
} from '../src/systems/waveMaterialization.js';
import {
  readRailModel,
  SWARM_LIVE_SLOTS,
  SWARM_WELL_OPPORTUNITY_MIN,
  SWARM_WELL_PACK_MIN,
} from '../src/ui/powerRail.js';
import { readOrdnanceModel } from '../src/ui/orrery/hudAdapter.js';
import {
  createStuntCallout,
  calloutTextFor,
} from '../src/ui/stuntCallout.js';

const DT = 1 / 60;

/* --- rail model fixtures ------------------------------------------------------ */

function hostile(id, x, z, over = {}) {
  return {
    id, alive: true, type: 'ship',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    mass: 12,
    data: { runCohort: 'survival' },
    ...over,
  };
}

function railState(over = {}) {
  const entities = new Map();
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  entities.set(1, player);
  const state = {
    simTime: 120,
    tick: 7200,
    mode: 'flight',
    playerId: 1,
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
    player: {
      massSeed: { cooldownUntil: 0 },
      tether: { active: false },
      cargo: { items: {} },
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
    },
    fields: { cooldowns: {}, deployed: {}, coneActive: false },
    bombs: {},
    entities,
    entityList: [...entities.values()],
    masslineAcquisition: null,
    ...over,
  };
  state.entities = entities;
  return state;
}

function put(state, entity) {
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

test('the Line pulses only while the massline receipt holds a ready hostile', () => {
  const state = railState();
  const wasp = put(state, hostile(7, 150, 0));

  // No acquisition receipt yet — the rail is quiet.
  let model = readRailModel(state, state.simTime);
  assert.equal(model[SWARM_LIVE_SLOTS.line].live, undefined);

  // The tether's own receipt names the wasp latchable.
  state.masslineAcquisition = { selected: { targetId: 7, status: 'ready' } };
  model = readRailModel(state, state.simTime);
  assert.equal(model[SWARM_LIVE_SLOTS.line].live, true);
  assert.match(model[SWARM_LIVE_SLOTS.line].why, /throw/i);

  // A denied or lost pick is not "in reach".
  state.masslineAcquisition = { selected: { targetId: 7, status: 'out-of-range', reason: 'out-of-range' } };
  assert.equal(readRailModel(state, state.simTime)[SWARM_LIVE_SLOTS.line].live, undefined);
  state.masslineAcquisition = { selected: { targetId: 7, status: 'ready' } };
  wasp.alive = false;
  assert.equal(readRailModel(state, state.simTime)[SWARM_LIVE_SLOTS.line].live, undefined,
    'a corpse is not a throwable hostile');

  // Ambient traffic is not ammunition for the run even when it is latchable.
  wasp.alive = true;
  wasp.data.runCohort = 'ambient';
  assert.equal(readRailModel(state, state.simTime)[SWARM_LIVE_SLOTS.line].live, undefined);
});

test('the Blast pulse is armed ordnance on the field — swarm runs only', () => {
  const state = railState();
  put(state, hostile(7, 200, 0));
  put(state, { id: 40, alive: true, type: 'charge', pos: { x: 40, z: 10 }, data: { ownerId: 1, armed: true } });
  const model = readRailModel(state, state.simTime);
  assert.equal(model[SWARM_LIVE_SLOTS.blast].state, 'armed');
  assert.equal(model[SWARM_LIVE_SLOTS.blast].live, true);

  // Nothing armed: the slot is quiet, not pulsing at a dead field.
  state.entities.get(40).data.armed = false;
  assert.equal(readRailModel(state, state.simTime)[SWARM_LIVE_SLOTS.blast].live, undefined);

  // The same armed charge in ADVENTURE earns no pulse — the cue is swarm language.
  state.entities.get(40).data.armed = true;
  state.run = null;
  const adventure = readRailModel(state, state.simTime);
  assert.equal(adventure[SWARM_LIVE_SLOTS.blast].live, undefined);
  assert.equal(adventure[SWARM_LIVE_SLOTS.line].live, undefined);
  assert.equal(adventure[SWARM_LIVE_SLOTS.well].live, undefined);
});

test('the Well pulses on a held pack and on a reachable clump — never on an empty field', () => {
  const state = railState();
  const model0 = readRailModel(state, state.simTime);
  assert.equal(model0[SWARM_LIVE_SLOTS.well].live, undefined, 'no hostiles, no pulse');

  // A deployed well holding at least SWARM_WELL_PACK_MIN bodies pulses.
  const emitter = put(state, { id: 50, alive: true, type: 'emitter', pos: { x: 300, z: 0 }, data: {} });
  state.fields.deployed.f1 = { fieldId: 'f1', kind: 'well', emitterId: 50 };
  for (let i = 0; i < SWARM_WELL_PACK_MIN; i += 1) put(state, hostile(10 + i, 320 + i * 10, 5));
  let model = readRailModel(state, state.simTime);
  assert.equal(model[SWARM_LIVE_SLOTS.well].live, true);
  assert.match(model[SWARM_LIVE_SLOTS.well].why, /holding a pack/i);

  // A cooling well cannot act — the pulse yields to the cooldown readout.
  state.fields.cooldowns.well = state.simTime + 4;
  model = readRailModel(state, state.simTime);
  assert.equal(model[SWARM_LIVE_SLOTS.well].live, undefined);
  assert.match(model[SWARM_LIVE_SLOTS.well].why, /recharging/i);
  state.fields.cooldowns.well = 0;

  // No deployed well: a clump of OPPORTUNITY_MIN within deploy range still pulses.
  state.fields.deployed = {};
  const dead = put(state, hostile(60, 300, 0, { alive: false }));
  void dead;
  for (let i = 0; i < SWARM_WELL_OPPORTUNITY_MIN - 1; i += 1) {
    put(state, hostile(20 + i, 330 + i * 12, 8));
  }
  // 10..11 live + 20..21 live = 4 bodies around (310..340, ~0..8): a pack.
  model = readRailModel(state, state.simTime);
  assert.equal(model[SWARM_LIVE_SLOTS.well].live, true);
  assert.match(model[SWARM_LIVE_SLOTS.well].why, /in well range/i);

  // The same pack beyond deploy reach earns nothing.
  for (const e of state.entities.values()) {
    if (e.id !== 1 && e.alive !== false) { e.pos.x += 4000; }
  }
  assert.equal(readRailModel(state, state.simTime)[SWARM_LIVE_SLOTS.well].live, undefined);
});

test('the arena shelf retires the planet-grazing verb and keeps the physics verbs', () => {
  const state = railState();
  const model = readRailModel(state, state.simTime);
  assert.equal(model[8].state, 'locked');
  assert.match(model[8].why, /no planet band/i);
  // Cone stays: the sluice plows arena debris — real ammunition.
  assert.equal(model[7].state, 'ready');
});

test('the live flag flows through the Cluster ordnance model unchanged', () => {
  const state = railState();
  put(state, hostile(7, 150, 0));
  state.masslineAcquisition = { selected: { targetId: 7, status: 'ready' } };
  const ordnance = readOrdnanceModel(state, null, { tether: ['Digit3'] });
  assert.equal(ordnance[String(SWARM_LIVE_SLOTS.line)].live, true);
  assert.equal(ordnance[String(SWARM_LIVE_SLOTS.well)].live, undefined);
});

/* --- wave arrivals -------------------------------------------------------------- */

function matHarness(seed = 7) {
  const state = createGameState(seed);
  const bus = createBus();
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  return { state, bus, helpers, spawned, ctx: { state, bus, helpers } };
}

function batch(h, over) {
  return materializeWaveBatch(h.ctx, {
    ownerId: 'survival-wave-w1', enemyId: 'wasp_swarmer', count: 5,
    gateGroup: 'front', distance: SURVIVAL_SPAWN_DISTANCE, seed: 7,
    wave: 3, packageIndex: 2, batchIndex: 1,
    ...over,
  });
}

test('a swarm batch lands as one throw-shaped clump inside the charge blast', () => {
  const h = matHarness();
  const receipt = batch(h, { swarm: true });
  assert.equal(receipt.admitted, 5);
  const bodies = h.spawned.filter((e) => e.type !== 'ship' || e.id !== h.state.playerId);
  const spawned = h.spawned.slice(-5);
  assert.equal(spawned.length, 5);
  // Pairwise: the whole pack fits inside one charge blast (~105 wu radius).
  for (const a of spawned) {
    for (const b of spawned) {
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      assert.ok(d <= SWARM_CLUMP_RADIUS_WU * 2 + 1e-6,
        `clump pair ${Math.round(d)} wu exceeds one blast`);
    }
  }
  // And it still arrives on the authored gate ring, not on top of the pilot.
  const player = h.state.entities.get(h.state.playerId);
  for (const e of spawned) {
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    assert.ok(d > SURVIVAL_SPAWN_DISTANCE * 0.7, 'the clump respects the approach ring');
  }
  void bodies;
});

test('the clump is deterministic and does not leak into adventure waves', () => {
  const a = matHarness();
  batch(a, { swarm: true });
  const posA = a.spawned.slice(-5).map((e) => ({ x: e.pos.x, z: e.pos.z }));
  const b = matHarness();
  batch(b, { swarm: true });
  const posB = b.spawned.slice(-5).map((e) => ({ x: e.pos.x, z: e.pos.z }));
  assert.deepEqual(posA, posB, 'same seed + wave + package + batch → same clump');

  const adv = matHarness();
  batch(adv, { swarm: false });
  const spread = adv.spawned.slice(-5);
  let widest = 0;
  for (const e1 of spread) for (const e2 of spread) {
    widest = Math.max(widest, Math.hypot(e1.pos.x - e2.pos.x, e1.pos.z - e2.pos.z));
  }
  assert.ok(widest > SWARM_CLUMP_RADIUS_WU * 2, 'adventure still fans across the gate sector');
});

/* --- the stunt line -------------------------------------------------------------- */

function fakeElement(tag) {
  const el = {
    tag, children: [], attributes: {}, className: '', textContent: '', hidden: false,
    parentNode: null, _classes: new Set(), _styles: {},
    classList: {
      add(...n) { for (const x of n) el._classes.add(x); },
      remove(...n) { for (const x of n) el._classes.delete(x); },
      contains(n) { return el._classes.has(n); },
      toggle(n, on) { const w = on === undefined ? !el._classes.has(n) : !!on; if (w) el._classes.add(n); else el._classes.delete(n); return w; },
    },
    style: { setProperty(k, v) { el._styles[k] = String(v); }, removeProperty(k) { delete el._styles[k]; }, display: '', left: '' },
    setAttribute(k, v) { el.attributes[k] = String(v); },
    removeAttribute(k) { delete el.attributes[k]; },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
  };
  return el;
}

function fakeDocument() {
  const doc = { head: fakeElement('head'), body: fakeElement('body'), documentElement: fakeElement('html') };
  doc.getElementById = () => null;
  doc.createElement = (t) => fakeElement(t);
  return doc;
}

function calloutState(over = {}) {
  return {
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
    mode: 'flight',
    ui: { screenStack: [] },
    tick: 670,
    playerId: 1,
    stunts: {},
    settings: { video: { motionReduce: false } },
    ...over,
  };
}

test('physics kill causes ride the stunt line; gun kills stay quiet', () => {
  const bus = createBus();
  const owner = createStuntCallout({ state: calloutState(), bus, doc: fakeDocument() });
  bus.emit('swarm:killPopup', { pos: { x: 0, z: 0 }, word: 'SLAMMED', cause: 'terrain', wave: 2 });
  owner.update(0);
  let text = calloutTextFor(owner.root);
  assert.match(text, /SLAMMED/, 'the cause word lands on the lane');

  bus.emit('swarm:killPopup', { pos: { x: 0, z: 0 }, word: 'SLAMMED', cause: 'terrain', wave: 2 });
  owner.update(10);
  text = calloutTextFor(owner.root);
  assert.match(text, /SLAMMED\s*×2/, 'a repeat rolls the count, not a second line');

  bus.emit('swarm:killPopup', { pos: { x: 0, z: 0 }, word: 'MINED', cause: 'explosive', wave: 2 });
  bus.emit('swarm:killPopup', { pos: { x: 0, z: 0 }, word: 'SHREDDED', cause: 'direct', wave: 2 });
  bus.emit('swarm:killPopup', { pos: { x: 0, z: 0 }, word: 'DOWN', cause: 'direct', wave: 2 });
  owner.update(20);
  text = calloutTextFor(owner.root);
  assert.match(text, /MINED/);
  assert.ok(!/SHREDDED/.test(text), 'gun kills never needed teaching');
  assert.ok(!/\bDOWN\b/.test(text));
  owner.destroy();
});

test('the cause lane stays dark outside a run even if a stray popup arrives', () => {
  const bus = createBus();
  const owner = createStuntCallout({
    state: calloutState({ run: null, mode: 'flight' }),
    bus, doc: fakeDocument(),
  });
  bus.emit('swarm:killPopup', { pos: { x: 0, z: 0 }, word: 'SLAMMED', cause: 'terrain', wave: 2 });
  owner.update(0);
  assert.ok(owner.root.hidden, 'adventure flight never sees the cause lane');
  owner.destroy();
});
