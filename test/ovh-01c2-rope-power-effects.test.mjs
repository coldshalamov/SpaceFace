// OVH-01c2 — Pilot Tree effects, wave 1: the rope and the powers (Rigger + Conjurer).
// Design: design/overhaul/06_PROGRESSION_AND_ECONOMY.md §2, 03_COMBAT.md §2/§4, 00_RULINGS.md R12.
//
// Every built node gets a seeded with/without pair on its row's threshold, driven through the
// real owner systems (tetherGameplay's latch flow, masslineThrow's release/cut, masslineImpacts'
// whip receipt, the fields deploy path, the massSeed launch plan, the bombs bay, the real
// impulseCharges blast), plus one test that an NPC gets nothing. The pilot record is built the
// way test/ovh-01a-pilot-tree.test.mjs builds one: { points, nodes, banked, offer } on state.run.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { pilotHas } from '../src/data/pilotTree.js';
import { FIELD_DEFS } from '../src/data/fields.js';
import { createFieldKernel } from '../src/core/fields/fieldKernel.js';
import { playerFieldSpec } from '../src/core/fields/fieldReadModel.js';
import { MASS_SEED_DEF } from '../src/data/massSeed.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { IMPULSE_CHARGES } from '../src/data/impulseCharges.js';
import { fields } from '../src/systems/fields.js';
import { PILOT_COMBO_MAX_BLASTS_PER_TICK } from '../src/systems/fields.js';
import { massSeed, massSeedLaunchPlan } from '../src/systems/massSeed.js';
import { bombs } from '../src/systems/bombs.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { tetherGameplay, TWIN_BRIDLE_HEAD_ID } from '../src/systems/tetherGameplay.js';
import { masslineThrow, releaseWindowHoldMinS } from '../src/systems/masslineThrow.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import {
  PILOT_ECHO_DELAY_S,
  pilotPowerCooldownScale,
  pilotPowerDepthScale,
  pilotPowerReachScale,
} from '../src/systems/powerVerbs.js';
import {
  createInputCommandSnapshotQueue,
  createInputCommandSnapshotRecord,
} from '../src/core/inputCommandSnapshot.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

const DT = 1 / 60;

// The throw lane is profile-gated (legacy47a defaults OFF in Node); the house pattern from
// test/throw-01-grip-grace.test.mjs: seed the module map for the test, restore after.
function withThrowFlags(fn) {
  const saved = { ...MASSLINE2_FLAGS };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true });
  try {
    return fn();
  } finally {
    Object.assign(MASSLINE2_FLAGS, saved);
  }
}

// The pilot record, shaped the way OVH-01a's tests shape it (runSession owns the real writes).
function pilotOf(nodeIds) {
  const points = {};
  for (const id of nodeIds) points[id.split('_')[0]] = 1;
  return { points, nodes: [...nodeIds], banked: 0, offer: null };
}

function runWithPilot(nodeIds) {
  return nodeIds ? { kind: 'survival', ruleset: 'swarm', pilot: pilotOf(nodeIds) } : { kind: 'survival', ruleset: 'swarm' };
}

function immediateBus(events = []) {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}

// ── the rope harness (tetherGameplay through the real attachment service) ────────────────────

function ropeHarness({ pilotNodes = null, headFitted = false } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, rot: 0, thrust: 0, brake: false,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 120, radius: 8, mass: 40,
    hull: 100, hullMax: 100, collides: true, data: headFitted
      ? { derived: { masslineHeadId: TWIN_BRIDLE_HEAD_ID } } : { derived: {} },
    physicsBody: { dynamic: true, mass: 40 },
  };
  const state = {
    mode: 'flight', tick: 100, simTime: 5, playerId: 1, player: {},
    input: {
      aimWorld: { x: 0, z: 0 }, aimAngle: 0, aimIntentActive: false,
      turnIntent: 0, moveX: 0, moveZ: 0, actions: {}, tetherMode: null,
    },
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_test' },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    run: runWithPilot(pilotNodes),
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = {
    creates: [], cuts: [],
    createAttachment(spec) { this.creates.push(spec); return { id: `joint_${this.creates.length}` }; },
    cutAttachment(spec) { this.cuts.push(spec); return true; },
    getAttachmentTelemetry() { return { tension: 0, impulse: 0, yank: 0, phase: 'slack' }; },
    setAttachmentReel() { return true; },
  };
  const events = [];
  const bus = immediateBus(events);
  const attachments = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  const registry = { get(id) { return id === 'actions' ? { kernel: { attachments, catalog } } : null; } };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus, helpers: { combatPhysics: physics }, registry });
  return {
    state, bus, events, attachments, system, registry, player, physics,
    spawn(id, type, x, z, overrides = {}) {
      const e = {
        id, type, alive: true, collides: true, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
        thrust: 0, brake: false, maxSpeed: 120, radius: type === 'asteroid' ? 16 : 8,
        mass: 50, hull: 100, hullMax: 100, team: 2, data: {},
        physicsBody: { dynamic: true, mass: 50 }, ...overrides,
      };
      state.entities.set(id, e);
      state.entityList.push(e);
      return e;
    },
    step({ aim = null, latch = false, cut = false, dt = DT } = {}) {
      state.tick += 1;
      state.simTime += dt;
      state.input.aimIntentActive = !!aim;
      if (aim) { state.input.aimWorld.x = aim.x; state.input.aimWorld.z = aim.z; }
      state.input.actions = {
        tetherFire: latch,
        tetherCut: cut,
        massline: latch || cut ? { latch, cut, lineControl: false, lineLength: 0 } : null,
      };
      system.update(dt, state);
    },
  };
}

// ── the fields harness (real init: real kernel, real deploy path) ────────────────────────────

function fieldsHarness({ pilotNodes = null, aim = { x: 300, z: 0 } } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 32, flags: {}, data: {},
    physicsBody: { dynamic: true, mass: 32 },
  };
  const state = {
    mode: 'flight', tick: 10, simTime: 0.2, playerId: 1, player: {},
    input: { actions: {}, aimWorld: { x: aim.x, z: aim.z }, aimAngle: 0, aimIntentActive: true },
    ui: { screenStack: [] },
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_test' },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    run: runWithPilot(pilotNodes),
  };
  const events = [];
  const bus = immediateBus(events);
  let nextId = 900;
  const helpers = {
    spawnEntity(spec) {
      const e = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec, pos: { ...spec.pos }, vel: { ...spec.vel } };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
  };
  const system = Object.create(fields);
  system.init({ state, bus, helpers, registry: { get() { return null; } } });
  const rt = state.fields;
  return {
    state, bus, events, system, rt, player,
    spawn(id, type, x, z, overrides = {}) {
      const e = {
        id, type, alive: true, team: 1, rot: 0, pos: { x, z }, vel: { x: 0, z: 0 },
        radius: 8, mass: 32, hull: 100, hullMax: 100, data: {},
        physicsBody: { dynamic: true, mass: 32 }, ...overrides,
      };
      state.entities.set(id, e);
      state.entityList.push(e);
      return e;
    },
  };
}

function fieldsRuntimeOf(h) {
  return h.state.fields;
}

// ── Rigger — the rope ────────────────────────────────────────────────────────────────────────

test('rigger_long_reel: a body at 1.3× the base reach latches with the node, not without', () => {
  const REACH = 390; // tether_standard.maxLength (src/data/combatDefs.js)
  const at = 1.3 * REACH;

  const without = ropeHarness({ pilotNodes: null });
  const far = without.spawn(2, 'asteroid', at, 0);
  without.step({ aim: far.pos, latch: true });
  assert.ok(!without.events.some((e) => e.type === 'tether:latched'),
    'without the node the far body never latches');
  assert.ok(without.events.some((e) => e.type === 'tether:latchDenied'),
    'the refusal is the readable denial, not silence');

  const withNode = ropeHarness({ pilotNodes: ['rigger_long_reel'] });
  const farToo = withNode.spawn(2, 'asteroid', at, 0);
  withNode.step({ aim: farToo.pos, latch: true });
  const latched = withNode.events.find((e) => e.type === 'tether:latched');
  assert.ok(latched, 'with the node the same body is inside the line');
  assert.equal(latched.payload.targetId, farToo.id);
  assert.equal(pilotHas(withNode.state, 'rigger_long_reel'), true);
});

test('rigger_long_reel: the physics joint keeps the latch\'s length — one scaled number, no 390 clamp', () => {
  // PT-FIX-C item 2 — through the REAL attachment service: the policy maxLength (and through it
  // the Rapier joint's rest-length clamp) carries the pilot's reach, so a 500 WU latch is not
  // yanked back to 390 on tick 0.
  const node = ropeHarness({ pilotNodes: ['rigger_long_reel'] });
  const nodeFar = node.spawn(2, 'asteroid', 500, 0);
  node.step({ aim: nodeFar.pos, latch: true });
  assert.ok(node.events.some((e) => e.type === 'tether:latched'), 'the 500 WU latch lands');
  const nodeCreate = node.physics.creates[node.physics.creates.length - 1];
  assert.ok(nodeCreate, 'the real service created a physics joint');
  assert.ok(nodeCreate.restLength > 480 && nodeCreate.restLength <= 585,
    `the joint keeps the latch's length (got ${nodeCreate.restLength}), not the 390 clamp`);
  const nodeAtt = Object.values(node.state.combat.attachments.byId)
    .find((entry) => entry.state === 'active');
  assert.ok(Math.abs(nodeAtt.tetherPolicy.maxLength - 390 * 1.5) < 1e-6,
    `policy maxLength is the one scaled number (585), got ${nodeAtt.tetherPolicy.maxLength}`);

  // The direct create pins both ends of the contract exactly: worlds 500 apart.
  const plain = ropeHarness({ pilotNodes: null });
  const plainFar = plain.spawn(2, 'asteroid', 500, 0);
  const forced = plain.attachments.create({
    defId: 'tether_standard', ownerId: plain.player.id, targetId: plainFar.id,
    sourceWorld: { x: 0, y: 0, z: 0 }, targetWorld: { x: 500, y: 0, z: 0 },
  });
  assert.ok(forced.ok, 'a direct create without the node still builds');
  const clamped = plain.physics.creates[plain.physics.creates.length - 1];
  assert.ok(Math.abs(clamped.restLength - 390) < 1e-6,
    `without the node the joint clamps to the authored 390 (got ${clamped.restLength})`);

  const forcedNode = node.attachments.create({
    defId: 'tether_standard', ownerId: node.player.id, targetId: 3,
    sourceWorld: { x: 0, y: 0, z: 0 }, targetWorld: { x: 500, y: 0, z: 0 },
  });
  if (forcedNode.ok) {
    const kept = node.physics.creates[node.physics.creates.length - 1];
    assert.ok(Math.abs(kept.restLength - 500) < 1e-6,
      `with the node the same 500 WU request keeps its length (got ${kept.restLength})`);
  }
});

test('conjurer_echo: a rack bomb echoes past the bay cooldown at half strength, once, quietly', () => {
  const boot = (pilotNodes) => {
    const state = createGameState(47);
    state.mode = 'flight';
    state.simTime = 1;
    state.tick = 60;
    state.playerId = 1;
    const player = {
      id: 1, type: 'ship', alive: true, team: 0, rot: 0, mass: 32, radius: 6,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    };
    state.entities.set(1, player);
    state.entityList = [player];
    state.run = runWithPilot(pilotNodes);
    const bus = createBus();
    const toasts = [];
    const denied = [];
    bus.on('toast', (p) => toasts.push(p));
    bus.on('bombs:denied', (p) => denied.push(p));
    let nextId = 50;
    const system = Object.create(bombs);
    system.init({
      state, bus,
      helpers: {
        spawnEntity(spec) {
          const e = { id: nextId++, alive: true, ...spec };
          state.entities.set(e.id, e);
          state.entityList.push(e);
          return e;
        },
        routeCombatDamage() { return { ok: true }; },
        combatPhysics: { applyImpulse() { return true; } },
      },
    });
    const rt = state.bombs;
    rt.rack.cells[0] = { id: 'bomb_frag', count: BOMB_DEFS.bomb_frag.magazine };
    rt.selectedId = 'bomb_frag';
    const dropped = [];
    bus.on('bombs:dropped', (p) => dropped.push(p));
    return {
      state, bus, rt, dropped, toasts, denied,
      tick(n = 1) {
        for (let i = 0; i < n; i++) {
          state.simTime += DT;
          state.tick += 1;
          system.update(DT, state);
        }
      },
    };
  };

  // PT-FIX-C item 1 — the review's failure: every bomb cooldown (≥ 1.2 s, ×0.75 quick cast ≥ 0.9 s)
  // outlives the 0.5 s echo delay, so the echo used to die as a spurious "Bomb bay cycling".
  const h = boot(['conjurer_echo']);
  h.state.input.actions = { dropBomb: true };
  h.tick(1);
  assert.equal(h.dropped.length, 1, 'the key press drops the first bomb');
  const cooldownAfterFirst = h.rt.cooldowns.bomb_frag;
  assert.ok(cooldownAfterFirst > h.state.simTime + 0.4, 'the bay cooldown outlives the echo delay');

  h.tick(31); // 0.5 s + one tick of sim time
  assert.equal(h.dropped.length, 2, `the echo drops a second bomb (got ${h.dropped.length})`);
  assert.ok(!h.toasts.some((t) => /cycling/i.test(String(t.text))),
    'no spurious "Bomb bay cycling" toast');
  assert.equal(h.denied.length, 0, 'no bombs:denied refusals');
  const echoBomb = h.state.entities.get(h.dropped[1].bombId);
  assert.ok(Math.abs(echoBomb.data.strengthScale - 0.5) < 1e-9, 'the echo spawns at half strength');
  assert.equal(h.rt.cooldowns.bomb_frag, cooldownAfterFirst,
    'the echo never overwrites or restarts the bay cooldown');
  h.tick(31);
  assert.equal(h.dropped.length, 2, 'exactly one echo per fire');
});

test('rigger_quick_latch: a challenger inside 120 WU takes the selection the tick it appears', () => {
  const run = (pilotNodes) => {
    const h = ropeHarness({ pilotNodes });
    const far = h.spawn(2, 'asteroid', 340, 0);   // 87% of reach: rankable, poor comfort
    const near = h.spawn(3, 'asteroid', 460, 240); // out of reach until it moves
    for (let i = 0; i < 12; i++) h.step({});      // the standing receipt settles on the far body
    assert.equal(h.state.masslineAcquisition.selected.targetId, far.id, 'the far body owns the preview first');
    // A better body appears inside 120 WU — OFF the player→far axis so it obstructs nothing.
    near.pos.x = 78;
    near.pos.z = 92;
    for (let i = 0; i < 6; i++) h.step({});       // 0.1 s — inside the shipped 0.2 s challenger hold
    return { h, far, near };
  };

  const slow = run(null);
  assert.equal(slow.h.state.masslineAcquisition.selected.targetId, slow.far.id,
    'without the node the 0.2 s acquisition hold keeps the old pick');
  slow.h.step({ latch: true });
  assert.equal(slow.h.events.find((e) => e.type === 'tether:latched').payload.targetId, slow.far.id);

  const quick = run(['rigger_quick_latch']);
  assert.equal(quick.h.state.masslineAcquisition.selected.targetId, quick.near.id,
    'with the node the near challenger is selected the moment it ranks');
  quick.h.step({ latch: true });
  assert.equal(quick.h.events.find((e) => e.type === 'tether:latched').payload.targetId, quick.near.id);
});

test('rigger_sweet_spot: the release window doubles and an in-window release adds 25% speed', () => {
  const base = { tick: 5, run: runWithPilot(null) };
  const node = { tick: 5, run: runWithPilot(['rigger_sweet_spot']) };
  assert.equal(releaseWindowHoldMinS(base), 0.20, 'THROW-02\'s shipped floor');
  assert.equal(releaseWindowHoldMinS(node), 0.40, 'the node doubles the window');

  // The burst: the real _executeThrow, through the real attachment service's cut.
  const throwHarness = (pilotNodes, mode) => withThrowFlags(() => {
    const h = ropeHarness({ pilotNodes });
    const payload = h.spawn(2, 'asteroid', 100, 0, {
      mass: 40, vel: { x: 60, z: 0 }, physicsBody: { dynamic: true, mass: 40 },
    });
    const created = h.attachments.create({
      defId: 'tether_standard', ownerId: h.player.id, targetId: payload.id,
      sourceWorld: { x: 0, y: 0, z: 0 }, targetWorld: { x: 84, y: 0, z: 0 },
    });
    assert.ok(created.ok, 'the line is up');
    h.state.player.tether = {
      active: true, attachmentId: created.attachment.id, targetId: payload.id,
      phase: 'loaded', strain: 0.3, load: 0.5, restLength: 100,
    };
    const system = Object.create(masslineThrow);
    system.init({ state: h.state, bus: h.bus, helpers: {}, registry: h.registry });
    const ok = system._executeThrow(h.state, h.player, payload, { entity: null }, {
      valid: true, errorRad: 0, tolRad: 1, onSolution: true,
      interceptAngle: 0, payloadSpeed: 60, timeOfFlight: 1,
    }, mode);
    assert.equal(ok, true);
    const command = consumePhysicsCommand(payload);
    const dv = command && command.impulses.length === 1
      ? Math.hypot(command.impulses[0].x, command.impulses[0].z) / 40 : 0;
    return { dv, receipt: h.state.massline2.throw.lastThrow };
  });

  const plain = throwHarness(null, 'snap');
  assert.equal(plain.dv, 0, 'without the node a perfect release adds no free speed');
  assert.equal(plain.receipt.sweetSpotDv, 0);

  const sweet = throwHarness(['rigger_sweet_spot'], 'snap');
  assert.ok(Math.abs(sweet.dv - 15) < 1e-6, `+25% of 60 WU/s ≈ 15, got ${sweet.dv}`);
  assert.ok(Math.abs(sweet.receipt.sweetSpotDv - 15) < 1e-6, 'the throw receipt states the burst');

  const outside = throwHarness(['rigger_sweet_spot'], 'snap-manual');
  assert.equal(outside.dv, 0, 'a release outside the window is the plain throw it always was');
});

test('rigger_whip_snap: a mid-swing tap of the reel flings the latched body to 1.5× speed', () => {
  const run = (pilotNodes) => withThrowFlags(() => {
    const h = ropeHarness({ pilotNodes });
    const payload = h.spawn(2, 'asteroid', 100, 0, {
      mass: 40, vel: { x: 60, z: 0 }, physicsBody: { dynamic: true, mass: 40 },
    });
    h.state.player.tether = {
      active: true, attachmentId: 7, targetId: payload.id, phase: 'loaded', restLength: 100,
    };
    const system = Object.create(masslineThrow);
    system.init({ state: h.state, bus: h.bus, helpers: {}, registry: h.registry });
    system.update(DT, h.state); // one settled swing tick: _swing is live and taut
    h.state.input.actions.massline = { cut: true, latch: false, lineControl: false, lineLength: 0 };
    h.bus.emit('tether:cut', { targetId: payload.id }); // tetherGameplay's tap-cut receipt
    const command = consumePhysicsCommand(payload);
    const dv = command && command.impulses.length === 1
      ? Math.hypot(command.impulses[0].x, command.impulses[0].z) / 40 : 0;
    return { dv, events: h.events };
  });

  const plain = run(null);
  assert.equal(plain.dv, 0, 'without the node a tap-cut is just the cut');
  assert.ok(!plain.events.some((e) => e.type === 'massline:whipSnap'));

  const snapped = run(['rigger_whip_snap']);
  assert.ok(Math.abs(snapped.dv - 30) < 1e-6, `×1.5 of 60 WU/s is +30, got ${snapped.dv}`);
  const receipt = snapped.events.find((e) => e.type === 'massline:whipSnap');
  assert.ok(receipt, 'the fling publishes its receipt');
  assert.equal(receipt.payload.payloadId, 2);
  assert.ok(Math.abs(receipt.payload.dvWu - 30) < 1e-6);
});

test('rigger_crane: a body on your line hits as if it were twice as heavy', () => {
  const run = (pilotNodes) => {
    const player = {
      id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    };
    const rock = {
      id: 2, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 },
      radius: 16, mass: 40, data: {},
    };
    const victim = {
      id: 3, type: 'ship', alive: true, team: 1, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 30, data: {},
    };
    const entities = new Map([[1, player], [2, rock], [3, victim]]);
    const state = {
      mode: 'flight', tick: 40, simTime: 2 / 3, playerId: 1,
      player: { tether: { active: true, targetId: rock.id, attachmentId: 9, phase: 'loaded' } },
      entities, entityList: [...entities.values()],
      run: runWithPilot(pilotNodes),
    };
    const events = [];
    const bus = immediateBus(events);
    const system = Object.create(masslineImpacts);
    system.init({ state, bus, registry: null });
    system.update(DT, state);
    return events.find((e) => e.type === 'tether:whipImpact');
  };

  const plain = run(null);
  assert.ok(plain, 'the whip impact is observed without the node');
  assert.equal(plain.payload.mass, 40, 'the honest tonnage never changes');
  assert.equal(plain.payload.momentum, 40 * 60, 'mass × relSpeed, the shipped read');
  assert.equal(plain.payload.towedMassMult, 1);

  const craned = run(['rigger_crane']);
  assert.equal(craned.payload.mass, 40, 'the record still tells the truth about the body');
  assert.equal(craned.payload.momentum, 40 * 60 * 2, 'the damage-relevant read doubles');
  assert.equal(craned.payload.towedMassMult, 2);
});

test('rigger_second_line: the run grants twin_bridle; without it a second line is refused as today', () => {
  const without = ropeHarness({ pilotNodes: null });
  const a = without.spawn(2, 'ship', 90, 0, { team: 1, mass: 55, physicsBody: { dynamic: true, mass: 55 } });
  const b = without.spawn(3, 'ship', 150, 40, { team: 1, mass: 55, physicsBody: { dynamic: true, mass: 55 } });
  without.step({ aim: a.pos, latch: true });
  assert.ok(without.events.some((e) => e.type === 'tether:latched'), 'the first press takes the ordinary line');
  without.step({ aim: b.pos, latch: true });
  const active = Object.values(without.state.combat.attachments.byId)
    .filter((entry) => entry.state === 'active');
  assert.equal(active.length, 1, 'the second press never creates a second line');

  const withNode = ropeHarness({ pilotNodes: ['rigger_second_line'] });
  const a2 = withNode.spawn(2, 'ship', 90, 0, { team: 1, mass: 55, physicsBody: { dynamic: true, mass: 55 } });
  const b2 = withNode.spawn(3, 'ship', 150, 40, { team: 1, mass: 55, physicsBody: { dynamic: true, mass: 55 } });
  withNode.step({ aim: a2.pos, latch: true });
  assert.ok(withNode.events.some((e) => e.type === 'massline:bridleEndpointSelected'),
    'the first press opens the twin bridle setup');
  withNode.step({ aim: b2.pos, latch: true });
  const bridle = Object.values(withNode.state.combat.attachments.byId)
    .filter((entry) => entry.state === 'active');
  assert.equal(bridle.length, 1, 'the run grants the existing twin_bridle capability');
  assert.equal(bridle[0].controlMode, TWIN_BRIDLE_HEAD_ID);
  assert.deepEqual([bridle[0].ownerId, bridle[0].targetId], [a2.id, b2.id]);
  assert.equal(bridle[0].controllerId, withNode.player.id, 'the pilot owns the second line');
});

// ── Conjurer — the powers ────────────────────────────────────────────────────────────────────

test('conjurer_quick_cast: the power recovery clock runs at ×0.75', () => {
  const boot = (pilotNodes) => {
    const h = fieldsHarness({ pilotNodes });
    h.system._deployRadial(h.state, fieldsRuntimeOf(h), 'well');
    const rt = fieldsRuntimeOf(h);
    assert.ok(rt.deployed && Object.keys(rt.deployed).length === 1, 'the well deployed');
    return rt.cooldowns.well - h.state.simTime;
  };
  const plain = boot(null);
  const quick = boot(['conjurer_quick_cast']);
  assert.equal(pilotPowerCooldownScale({ run: runWithPilot(['conjurer_quick_cast']) }), 0.75);
  assert.ok(Math.abs(quick - plain * 0.75) < 1e-9,
    `recovery ×0.75: ${quick.toFixed(3)} vs ${plain.toFixed(3)}`);
  assert.ok(plain > 1, 'the shipped Pull recovery is a real clock');
});

test('conjurer_wide_bore: every power\'s radius or reach is ×1.4', () => {
  const plainState = { tick: 3, playerId: 1, input: { aimWorld: { x: 300, z: 0 } }, run: runWithPilot(null) };
  const boreState = { tick: 3, playerId: 1, input: { aimWorld: { x: 300, z: 0 } }, run: runWithPilot(['conjurer_wide_bore']) };
  const pilot = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 0 };
  for (const kind of ['well', 'repulsor', 'cone', 'skim']) {
    assert.equal(playerFieldSpec(kind, pilot, plainState).radius, FIELD_DEFS[kind].radius,
      `${kind}: authored radius without the node`);
    assert.ok(Math.abs(playerFieldSpec(kind, pilot, boreState).radius - FIELD_DEFS[kind].radius * 1.4) < 1e-9,
      `${kind}: ×1.4 with the node`);
  }
  // The well's throw range reaches with it.
  const plainPlan = playerFieldSpec('well', pilot, plainState);
  const borePlan = playerFieldSpec('well', pilot, { ...boreState, input: { aimWorld: { x: 5000, z: 0 } } });
  assert.ok(borePlan.center.x > plainPlan.center.x + 100,
    'a far aim lands the well further out with the node (deployRange ×1.4)');

  // PIN: the bolt's flight is the reach.
  const plainSeed = massSeedLaunchPlan(pilot, plainState);
  const boreSeed = massSeedLaunchPlan(pilot, boreState);
  const flew = (plan) => Math.hypot(plan.lockPos.x - plan.spawnPos.x, plan.lockPos.z - plan.spawnPos.z);
  assert.ok(Math.abs(flew(plainSeed) - MASS_SEED_DEF.travelSpeed * MASS_SEED_DEF.travelTimeS) < 1e-6,
    'the authored bolt distance without the node');
  assert.ok(Math.abs(flew(boreSeed) - MASS_SEED_DEF.travelSpeed * 1.4 * MASS_SEED_DEF.travelTimeS) < 1e-6,
    'the bolt flies ×1.4 with the node');

  // BOMB: the blast radius is stamped on the drop.
  const bootBombs = (pilotNodes, owner) => {
    const state = createGameState(47);
    state.mode = 'flight';
    state.simTime = 1;
    state.tick = 60;
    state.playerId = 1;
    const player = owner;
    state.entities.set(owner.id, owner);
    state.entityList = [owner];
    state.run = runWithPilot(pilotNodes);
    const bus = createBus();
    let nextId = 50;
    const system = Object.create(bombs);
    system.init({
      state, bus,
      helpers: {
        spawnEntity(spec) {
          const e = { id: nextId++, alive: true, ...spec };
          state.entities.set(e.id, e);
          state.entityList.push(e);
          return e;
        },
        routeCombatDamage() { return { ok: true }; },
        combatPhysics: { applyImpulse() { return true; } },
      },
    });
    if (owner.id === state.playerId) {
      const rt = state.bombs;
      rt.rack.cells[0] = { id: 'bomb_frag', count: BOMB_DEFS.bomb_frag.magazine };
      rt.selectedId = 'bomb_frag';
    }
    return { state, system, dropped: system.drop(owner, 'bomb_frag', state) };
  };
  const player1 = (pilotNodes) => ({
    id: 1, type: 'ship', alive: true, team: 0, rot: 0, mass: 32, radius: 6,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  });
  const plainBomb = bootBombs(null, player1(null));
  const boreBomb = bootBombs(['conjurer_wide_bore'], player1());
  assert.equal(plainBomb.dropped.data.radiusScale, 1, 'authored blast without the node');
  assert.ok(Math.abs(boreBomb.dropped.data.radiusScale - 1.4) < 1e-9, '×1.4 with the node');
});

test('conjurer_deep_cast: hold deepens the release from ×1 at 0.4 s to ×1.5 at 1.2 s; a tap is unchanged', () => {
  // The hold rides the recorded input command itself (input.js measures the grip at the release
  // fire and writes integer sim ticks beside the action); the sim reads only that field.
  const depthState = (pilotNodes, holdTicks, field = 'deployWellHoldTicks') => ({
    tick: 10,
    playerId: 1,
    run: runWithPilot(pilotNodes),
    input: { actions: { [field]: holdTicks } },
  });
  const NODE = ['conjurer_deep_cast'];
  assert.equal(pilotPowerDepthScale(depthState(NODE, 0), 'pull'), 1, 'no measured hold is a tap');
  assert.equal(pilotPowerDepthScale(depthState(NODE, 6), 'pull'), 1, 'a tap is unchanged');
  assert.equal(pilotPowerDepthScale(depthState(NODE, 24), 'pull'), 1, '0.4 s of hold is still ×1');
  assert.ok(Math.abs(pilotPowerDepthScale(depthState(NODE, 48), 'pull') - 1.25) < 1e-9,
    'halfway through the ramp');
  assert.equal(pilotPowerDepthScale(depthState(NODE, 72), 'pull'), 1.5, '×1.5 at 1.2 s');
  assert.equal(pilotPowerDepthScale(depthState(NODE, 400), 'pull'), 1.5, 'and never deeper');
  assert.equal(pilotPowerDepthScale(depthState(null, 72), 'pull'), 1, 'no node, no depth');
  assert.equal(pilotPowerDepthScale(depthState(NODE, 0), 'shove'), 1,
    'a press-fired verb carries no hold');
  assert.equal(pilotPowerDepthScale(depthState(NODE, 72, 'dropBombHoldTicks'), 'bomb'), 1.5,
    'the Bomb verb reads the action it fired');
  assert.equal(pilotPowerDepthScale(depthState(NODE, 72, 'deployMassSeedHoldTicks'), 'pin'), 1.5,
    'so does Pin');

  // The deploy the hold deepens: the real well deploy carries the strength.
  const deploy = (pilotNodes, holdTicks) => {
    const h = fieldsHarness({ pilotNodes });
    h.state.input.actions.deployWell = true;
    h.state.input.actions.deployWellHoldTicks = holdTicks;
    h.system._deployRadial(h.state, fieldsRuntimeOf(h), 'well');
    const fieldId = Object.keys(fieldsRuntimeOf(h).deployed)[0];
    return h.system._kernel.get(fieldId);
  };
  assert.equal(deploy(null, 72).strength, FIELD_DEFS.well.strength, 'authored strength without the node');
  assert.ok(Math.abs(deploy(['conjurer_deep_cast'], 72).strength - FIELD_DEFS.well.strength * 1.5) < 1e-9,
    'a 1.2 s hold deepens the well to ×1.5');
  assert.equal(deploy(['conjurer_deep_cast'], 6).strength, FIELD_DEFS.well.strength,
    'a tapped deploy is unchanged');
  // The command is one tick deep: the next tick's neutral command reads ×1 again.
  const h = fieldsHarness({ pilotNodes: NODE });
  h.state.input.actions.deployWell = true;
  h.state.input.actions.deployWellHoldTicks = 72;
  h.system._deployRadial(h.state, fieldsRuntimeOf(h), 'well');
  h.state.input.actions.deployWell = false;
  h.state.input.actions.deployWellHoldTicks = 0;
  assert.equal(pilotPowerDepthScale(h.state, 'pull'), 1, 'a later tick does not read a stale hold');
});

test('conjurer_deep_cast: the measured hold survives the input command snapshot round trip', () => {
  const queue = createInputCommandSnapshotQueue(2);
  const record = createInputCommandSnapshotRecord();
  const input = {
    moveX: 0, moveZ: 0, turnIntent: 0,
    aimWorld: { x: 300, z: 0 }, aimAngle: 0,
    mouseNdc: { x: 0, y: 0 }, pointerScreen: { x: 0, y: 0, active: false },
    actions: {
      deployWell: true,
      deployWellHoldTicks: 72,
      dropBomb: true,
      dropBombHoldTicks: 48,
      deployMassSeedHoldTicks: 0,
      chargeThrow: false,
    },
    massline: null,
    travelDrive: null,
    autoTargetVector: null,
    autoTargetPath: null,
  };
  queue.reserve(1, 42, 3);
  queue.capture(1, input, 42);
  input.actions.deployWellHoldTicks = -999; // the snapshot is detached, not a live view
  queue.consume(1, (reader, token) => reader.copyTo(token, record));
  assert.equal(record.actions.deployWell, true, 'the one-shot action survived');
  assert.equal(record.actions.deployWellHoldTicks, 72, 'the measured hold survived');
  assert.equal(record.actions.dropBombHoldTicks, 48, 'the Bomb hold survived');
  assert.equal(record.actions.dropBomb, true, 'the Bomb action its hold deepens survived too');
  assert.equal(record.actions.deployMassSeedHoldTicks, 0, 'an unset hold is 0, not undefined');

  // The depth the sim reads from the consumed record is the depth the pilot earned.
  const state = { tick: 42, playerId: 1, run: runWithPilot(['conjurer_deep_cast']), input: { actions: record.actions } };
  assert.equal(pilotPowerDepthScale(state, 'pull'), 1.5, 'a 72-tick Pull hold reads ×1.5 off the record');
  assert.equal(pilotPowerDepthScale(state, 'bomb'), 1.25, 'a 48-tick Bomb hold reads ×1.25 off the record');
  assert.equal(pilotPowerDepthScale(state, 'pin'), 1, 'Pin fired as a tap on the same record');
});

test('conjurer_echo: the power fires twice — the second at half strength, 0.5 s later, same aim', () => {
  assert.equal(PILOT_ECHO_DELAY_S, 0.5);
  const run = (pilotNodes) => {
    const h = fieldsHarness({ pilotNodes, aim: { x: 300, z: 0 } });
    h.system._deployRadial(h.state, fieldsRuntimeOf(h), 'well');
    const first = Object.keys(fieldsRuntimeOf(h).deployed)[0];
    const firstField = h.system._kernel.get(first);
    const cooldownAfterFirst = fieldsRuntimeOf(h).cooldowns.well;
    h.state.simTime += 0.5 + 1e-6;
    h.state.tick += 30;
    h.system._drainPilotEcho(h.state, fieldsRuntimeOf(h));
    const ids = Object.keys(fieldsRuntimeOf(h).deployed);
    return {
      count: ids.length,
      firstStrength: firstField.strength,
      firstCenter: { ...firstField.center },
      second: ids.length === 2 ? h.system._kernel.get(ids[1]) : null,
      cooldownAfterFirst,
      cooldownAfterDrain: fieldsRuntimeOf(h).cooldowns.well,
    };
  };

  const plain = run(null);
  assert.equal(plain.count, 1, 'one well per press without the node');

  const echo = run(['conjurer_echo']);
  assert.equal(echo.count, 2, 'the second fire is a real second field');
  assert.ok(Math.abs(echo.second.strength - FIELD_DEFS.well.strength * 0.5) < 1e-9,
    'the echo lands at half strength');
  assert.ok(Math.abs(echo.second.center.x - echo.firstCenter.x) < 1e-9
    && Math.abs(echo.second.center.z - echo.firstCenter.z) < 1e-9,
    'at the same aim point');
  assert.equal(echo.cooldownAfterDrain, echo.cooldownAfterFirst,
    'the echo never restarts the recovery clock');
});

test('conjurer_combo: two different powers on one body within 2 s detonate the Bomb at 60%, once per body', () => {
  const CHARGE = IMPULSE_CHARGES.charge_standard;
  const run = (pilotNodes) => {
    // Close range on purpose: the enemy sits 40 WU off the player's bow, inside the blast's
    // 84 WU radius — so a combo that failed to exclude the player would show here immediately.
    const h = fieldsHarness({ pilotNodes, aim: { x: 40, z: 0 } });
    const enemy = h.spawn(2, 'ship', 40, 0, {
      hull: 150, hullMax: 150, shield: 0, shieldMax: 0, prevPos: { x: 40, z: 0 }, angVel: 0,
      // The full body spec the physics authority resolves (the chain tests' ship fixture shape).
      physicsBody: {
        schemaVersion: 1, radius: 8, mass: 16, inertiaY: 40, dynamic: true, ccd: false,
        material: 'ship', revision: 0,
      },
      data: { derived: { propulsion: { combatSpeed: 105 } } },
    });
    // The real blast owner shares the state; fields reaches it through the registry.
    const damage = [];
    const impulses = [];
    const blast = Object.create(impulseCharges);
    blast.init({
      state: h.state, bus: h.bus,
      helpers: {
        combatPhysics: { applyImpulse(req) { impulses.push(req); return true; } },
        queryRadius: null,
        routeCombatDamage(req) { damage.push(req); return { ok: true }; },
      },
      registry: { get() { return null; } },
    });
    h.system.registry = { get(id) { return id === 'impulseCharges' ? blast : null; } };

    // A Pull touch: the real deploy stamps the field, membership is the touch.
    h.system._deployRadial(h.state, fieldsRuntimeOf(h), 'well');
    const fieldId = Object.keys(fieldsRuntimeOf(h).deployed)[0];
    h.system._noteFieldComboTouches(h.state, fieldsRuntimeOf(h), enemy, [h.system._kernel.get(fieldId)]);
    // A Bomb touch: the real detonation receipt the ledger subscribes to. PT-FIX-C: the touch
    // only queues — the blast fires from the drain the force pass calls.
    h.bus.emit('charge:detonated', { ownerId: h.player.id, hits: [enemy.id], pos: { x: 40, z: 0 }, trigger: 'manual' });
    h.system._drainComboQueue(h.state);
    const firstHits = damage.filter((req) => req.targetId === enemy.id).length;
    const combo = h.events.find((e) => e.type === 'pilot:comboDetonated') || null;

    // A second pair inside the 2 s window: the same body does not detonate again.
    h.state.simTime += 0.5;
    h.state.tick += 30;
    h.system._notePowerComboTouch(h.state, enemy, 'pull');
    h.bus.emit('charge:detonated', { ownerId: h.player.id, hits: [enemy.id], pos: { x: 40, z: 0 }, trigger: 'manual' });
    h.system._drainComboQueue(h.state);
    const secondHits = damage.filter((req) => req.targetId === enemy.id).length;
    return { damage, impulses, firstHits, secondHits, combo };
  };

  const plain = run(null);
  assert.equal(plain.firstHits, 0, 'without the node two powers are just two powers');

  const combo = run(['conjurer_combo']);
  assert.equal(combo.firstHits, 1, 'the body takes the Bomb blast');
  const channels = combo.damage[0].packet.channels;
  const routed = channels.kinetic + channels.thermal + channels.ion + channels.plasma + channels.phase;
  assert.ok(Math.abs(routed - CHARGE.damage * 0.6) < 1e-9,
    `60% of the plate's damage (${CHARGE.damage}) at the body, got ${routed}`);
  assert.equal(combo.damage[0].attackerId, 1, 'credited to the player');
  assert.equal(combo.damage[0].targetId, 2, 'at that body');
  assert.ok(!combo.damage.some((req) => req.targetId === 1),
    'PT-FIX-C: the combination never blasts the player');
  assert.ok(combo.impulses.some((req) => Math.hypot(req.impulse?.x ?? req.x ?? 0, req.impulse?.z ?? req.z ?? 0) > 0),
    'the blast shoves');
  assert.ok(combo.combo, 'the detonation publishes its receipt');
  assert.deepEqual([...combo.combo.payload.powers].sort(), ['bomb', 'pull']);
  assert.equal(combo.secondHits, 1, 'once per body per 2 s');
});

test('conjurer_combo: a 40-body pack detonates at most the per-tick cap, without recursion', () => {
  const run = (pilotNodes) => {
    const h = fieldsHarness({ pilotNodes, aim: { x: 300, z: 0 } });
    const bodies = [];
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const x = 300 + Math.cos(angle) * 24;
      const z = Math.sin(angle) * 24;
      bodies.push(h.spawn(100 + i, 'ship', x, z, {
        hull: 150, hullMax: 150, shield: 0, shieldMax: 0, prevPos: { x, z }, angVel: 0,
        physicsBody: {
          schemaVersion: 1, radius: 8, mass: 16, inertiaY: 40, dynamic: true, ccd: false,
          material: 'ship', revision: 0,
        },
        data: { derived: { propulsion: { combatSpeed: 105 } } },
      }));
    }
    const damage = [];
    const blast = Object.create(impulseCharges);
    blast.init({
      state: h.state, bus: h.bus,
      helpers: {
        combatPhysics: { applyImpulse() { return true; } },
        queryRadius: null,
        routeCombatDamage(req) { damage.push(req); return { ok: true }; },
      },
      registry: { get() { return null; } },
    });
    h.system.registry = { get(id) { return id === 'impulseCharges' ? blast : null; } };

    // The whole pack sits in the deployed Pull well this force pass, then Shove's detonation
    // receipt touches every one of them.
    h.system._deployRadial(h.state, fieldsRuntimeOf(h), 'well');
    const fieldId = Object.keys(fieldsRuntimeOf(h).deployed)[0];
    const field = h.system._kernel.get(fieldId);
    for (const body of bodies) h.system._noteFieldComboTouches(h.state, fieldsRuntimeOf(h), body, [field]);
    h.bus.emit('charge:detonated', {
      ownerId: h.player.id, hits: bodies.map((b) => b.id), pos: { x: 300, z: 0 }, trigger: 'manual',
    });
    // The force pass ends: the drain fires iteratively.
    h.system._drainComboQueue(h.state);
    const detonations = h.events.filter((e) => e.type === 'pilot:comboDetonated').length;
    const queueAfterDrain = h.system._comboQueue.length;

    // A second identical wave inside the 2 s window: every row is closed — nothing refires.
    h.state.simTime += 0.5;
    h.state.tick += 30;
    for (const body of bodies) h.system._noteFieldComboTouches(h.state, fieldsRuntimeOf(h), body, [field]);
    h.bus.emit('charge:detonated', {
      ownerId: h.player.id, hits: bodies.map((b) => b.id), pos: { x: 300, z: 0 }, trigger: 'manual',
    });
    h.system._drainComboQueue(h.state);
    return { detonations, queueAfterDrain, second: h.events.filter((e) => e.type === 'pilot:comboDetonated').length - detonations };
  };

  const plain = run(null);
  assert.equal(plain.detonations, 0, 'no node, no combos');

  const combo = run(['conjurer_combo']);
  assert.equal(combo.detonations, PILOT_COMBO_MAX_BLASTS_PER_TICK,
    `at most ${PILOT_COMBO_MAX_BLASTS_PER_TICK} blasts that tick (no 40-deep recursive cascade)`);
  assert.equal(combo.queueAfterDrain, 0, 'the drain leaves nothing queued — nothing re-entered');
  assert.equal(combo.second, 0, 'once per body per window: the second wave refires nothing');
});

test('conjurer_echo: the Bomb charge echo is free — one charge aboard still echoes', () => {
  // PT-FIX-C item 5 — the echo is the power firing again, not the pilot paying again. The real
  // throw path spends the ONE charge the pilot holds; half a second later the echo spawns at
  // half strength from an empty hold, like Pull/Shove.
  const events = [];
  const listeners = new Map();
  const bus = {
    emit(name, payload) { events.push({ name, payload }); for (const fn of listeners.get(name) || []) fn(payload); },
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); return () => {}; },
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, rot: 0, radius: 6, mass: 32,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {},
    data: { impulseCharges: { throwCdT: 0 } },
  };
  const state = {
    mode: 'flight', tick: 10, simTime: 0.2, playerId: 1,
    input: { actions: { chargeThrow: true }, aimWorld: { x: 100, z: 0 }, aimAngle: 0 },
    ui: { screenStack: [] },
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_test' },
    player: { cargo: { items: { cmdty_impulse_charge: 1 }, capVolume: 100, usedVolume: 0, usedMass: 0 } },
    entities: new Map([[1, player]]),
    entityList: [player],
    run: runWithPilot(['conjurer_echo']),
  };
  let nextId = 60;
  const system = Object.create(impulseCharges);
  system.init({
    state, bus,
    helpers: {
      spawnEntity(spec) {
        const e = { id: nextId++, alive: true, ...spec, pos: { ...spec.pos }, vel: { ...spec.vel } };
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      combatPhysics: { applyImpulse() { return true; } },
      queryRadius: null,
      routeCombatDamage() { return { ok: true }; },
    },
    registry: { get() { return null; } },
  });

  system.update(DT, state); // the key press throws the pilot's only charge
  const thrown = events.filter((e) => e.name === 'charge:thrown');
  assert.equal(thrown.length, 1, 'the one charge aboard is thrown');
  assert.ok(!(state.player.cargo.items.cmdty_impulse_charge > 0), 'the hold is empty');

  state.simTime += 0.5 + 1e-6;
  state.tick += 31;
  system.update(DT, state); // the echo drains
  const echoes = events.filter((e) => e.name === 'charge:thrown' && e.payload.echo === true);
  assert.equal(echoes.length, 1, 'the echo fires from the empty hold — free, like Pull/Shove');
  const echoCharge = state.entities.get(echoes[0].payload.chargeId);
  assert.ok(echoCharge, 'the echoed charge is a real entity');
  assert.ok(Math.abs(echoCharge.data.strengthScale - 0.5) < 1e-9, 'at half strength');
  assert.equal(echoCharge.data.pilotEcho, true, 'and marked as the echo');
  assert.ok(!(state.player.cargo.items.cmdty_impulse_charge > 0), 'no second charge was ever spent');
});

// ── the contract ─────────────────────────────────────────────────────────────────────────────

test('the player\'s ship only: an NPC never reads the pilot record', () => {
  // The fields read model keeps the authored radius for a non-player caller.
  const state = { tick: 3, playerId: 1, input: { aimWorld: { x: 300, z: 0 } }, run: runWithPilot(['conjurer_wide_bore']) };
  const npc = { id: 99, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 3 };
  assert.equal(playerFieldSpec('well', npc, state).radius, FIELD_DEFS.well.radius,
    'an NPC well is the authored well');
  const player = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 0 };
  assert.ok(Math.abs(playerFieldSpec('well', player, state).radius - FIELD_DEFS.well.radius * 1.4) < 1e-9,
    'the player with the same record is wider');

  // The bombs bay stamps the reach for the player's own drops only.
  const bootNpc = () => {
    const st = createGameState(47);
    st.mode = 'flight';
    st.simTime = 1;
    st.tick = 60;
    st.playerId = 1;
    st.run = runWithPilot(['conjurer_wide_bore', 'conjurer_quick_cast']);
    const npcShip = {
      id: 77, type: 'ship', alive: true, team: 2, rot: 0, mass: 32, radius: 6,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    };
    st.entities.set(77, npcShip);
    st.entityList = [npcShip];
    const bus = createBus();
    let nextId = 50;
    const system = Object.create(bombs);
    system.init({
      state: st, bus,
      helpers: {
        spawnEntity(spec) {
          const e = { id: nextId++, alive: true, ...spec };
          st.entities.set(e.id, e);
          st.entityList.push(e);
          return e;
        },
        routeCombatDamage() { return { ok: true }; },
        combatPhysics: { applyImpulse() { return true; } },
      },
    });
    return { st, system, npcShip };
  };
  const npcDrop = bootNpc();
  const dropped = npcDrop.system.drop(npcDrop.npcShip, 'bomb_frag', npcDrop.st);
  assert.ok(dropped, 'the NPC drop works');
  assert.equal(dropped.data.radiusScale, 1, 'the NPC bomb keeps the authored blast');
  assert.equal(pilotPowerReachScale(npcDrop.st), 1.4,
    'the record itself still answers for the player — the owner gates it, the record does not');
});
