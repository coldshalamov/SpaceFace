// check:massline2 — Massline Physics Identity (Wave M2) contract check.
// design/revamp/MASSLINE_PHYSICS_IDENTITY.md
//
// Verifies, headlessly and deterministically:
//   1. Flag discipline: every massline2 flag defaults OFF under node; the master flag gates reads.
//   2. Inertness: with flags off, the new systems leave a fixture state untouched (golden safety
//      belt #2 — belt #1 is that sf-sim's curated list never runs them at all).
//   3. Registry wiring + ordering invariants (cloak before the AI slot; tumbleStates after
//      aiPorts and before weapons; masslineThrow after masslineImpacts).
//   4. The solver contracts: constrained lead solve intercepts a rotating tethered target where
//      the linear solver misses; throw solutions sweep through onSolution once per revolution.
//   5. System behaviors with flags forced on: armed throw auto-cuts on the solution frame and
//      announces massline:throw; tumble entry queues a real torque impulse, zeroes control and
//      fire intent, stamps the morale window, and recovers; the cloak toggles/drains/gates
//      perception honestly (in/out of radius) and NEVER hides the player from himself; loot
//      shards ride the loot:drop seam; terrain anchors spawn big-and-few and refuse busy bubbles;
//      jettison produces a capped reaction impulse; the player is never a victim of the new
//      impact-damage paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MASSLINE2_FLAGS, massline2Flag } from '../src/data/featureFlags.js';
import {
  aimTrueProjectileVelocity, solveTetherLeadSolution, solveThrowSolution,
  solutionToleranceRad, tetherPairKinematics,
} from '../src/combat/tetherFireControl.js';
import { solveLeadAngle, weapons } from '../src/systems/weapons.js';
import { masslineThrow, releaseAssistMode } from '../src/systems/masslineThrow.js';
import { bulletTime } from '../src/systems/bulletTime.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { masslineImpactDamage } from '../src/systems/masslineImpactDamage.js';
import { cloak } from '../src/systems/cloak.js';
import { lootShards } from '../src/systems/lootShards.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import {
  impulseCharges, bombPropulsionAvailable, BOMB_PROPULSION_DIALS,
} from '../src/systems/impulseCharges.js';
import { cloakHidesPlayerFrom } from '../src/systems/aiPorts.js';
import { ENCOUNTER_SCRIPTS, patrolCanInitiateScan } from '../src/systems/encounterScripts.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createRegistry } from '../src/core/registry.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import {
  MASSLINE_TUMBLE_KIND,
  readMasslineTumbleStatus,
  TUMBLE_STATUS_ID,
} from '../src/combat/tumbleStatus.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  applyBulletTimeAudioTreatment, BULLET_TIME_AUDIO,
} from '../src/audio/audioSystem.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { contextualAttachmentWorlds } from '../src/systems/tetherGameplay.js';

const failures = [];
function section(name, fn) {
  try { fn(); console.log(`  PASS ${name}`); }
  catch (err) { failures.push(name); console.error(`  FAIL ${name}\n    ${err && err.message}`); }
}

function makeBus() {
  const events = [];
  const handlers = new Map();
  return {
    events,
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn);
      handlers.set(name, list);
      return () => {};
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload, name);
    },
  };
}

function makeState(overrides = {}) {
  const entities = new Map();
  return {
    mode: 'flight',
    tick: 100,
    simTime: 10,
    playerId: 1,
    entities,
    entityList: [],
    meta: { seed: 47 },
    settings: { gameplay: {} },
    input: { actions: {}, aimWorld: { x: 0, z: 0 }, moveX: 0, moveZ: 0, turnIntent: 0 },
    player: { targetId: null, tether: { active: false, targetId: null, attachmentId: null, phase: 'slack' } },
    ui: { docked: false, screenStack: [] },
    ...overrides,
  };
}

function addEntity(state, e) {
  const ent = {
    alive: true, team: 1, radius: 6, mass: 20,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, data: {},
    ...e,
  };
  state.entities.set(ent.id, ent);
  state.entityList.push(ent);
  return ent;
}

function withFlags(on, fn) {
  const saved = { ...MASSLINE2_FLAGS };
  for (const key of Object.keys(MASSLINE2_FLAGS)) MASSLINE2_FLAGS[key] = on;
  try { fn(); } finally { Object.assign(MASSLINE2_FLAGS, saved); }
}

function initSystem(system, state, bus, helpers = {}, registry = null) {
  system.init({ state, bus, helpers, registry });
  return system;
}

// ── 1. Flag discipline ────────────────────────────────────────────────────────────────────────
section('flags default OFF under node and the master flag gates reads', () => {
  for (const [key, value] of Object.entries(MASSLINE2_FLAGS)) {
    assert.equal(value, false, `MASSLINE2_FLAGS.${key} must be false headless (IS_BROWSER model)`);
  }
  assert.equal(massline2Flag('throw'), false);
  MASSLINE2_FLAGS.throw = true;
  assert.equal(massline2Flag('throw'), false, 'sub-flag without master must read false');
  MASSLINE2_FLAGS.enabled = true;
  assert.equal(massline2Flag('throw'), true, 'master + sub must read true');
  assert.equal(massline2Flag('nonexistent'), false, 'unknown names read false');
  MASSLINE2_FLAGS.enabled = false;
  MASSLINE2_FLAGS.throw = false;
});

// ── 2. Inertness with flags off ───────────────────────────────────────────────────────────────
section('flags-off updates leave a live-looking fixture untouched', () => {
  const bus = makeBus();
  const state = makeState();
  const player = addEntity(state, { id: 1, type: 'ship', team: 0 });
  const rock = addEntity(state, { id: 2, type: 'asteroid', pos: { x: 60, z: 0 }, mass: 640 });
  state.player.tether = { active: true, targetId: 2, attachmentId: 'att_1', phase: 'loaded', reeling: true };
  state.input.actions.throwArm = true;
  state.input.actions.bulletTime = true;
  state.input.actions.cloakToggle = true;
  const helpers = {
    combatPhysics: { applyImpulse() { throw new Error('impulse with flags off'); } },
    mulberry32, hash32,
    spawnEntity() { throw new Error('spawn with flags off'); },
  };
  for (const system of [masslineThrow, bulletTime, cloak, tumbleStates, masslineImpactDamage, lootShards, terrainAnchors, jettisonImpulse]) {
    initSystem(system, state, bus, helpers, { get: () => null });
    system.update(1 / 60, state);
  }
  bus.emit('entity:killed', { id: 2, killerId: 1, type: 'ship', pos: { x: 0, z: 0 } });
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 20 });
  bus.emit('encounter:telegraph', { pos: { x: 0, z: 0 } });
  bus.emit('tether:whipImpact', { targetId: 2, victimId: 1, rating: 'crushing', momentum: 99999 });
  assert.equal(state.massline2.throw.armed, false, 'throw must stay idle');
  assert.equal(state.massline2.bulletTime.active, false, 'bullet time must stay off');
  assert.equal(state.massline2.cloak.active, false, 'cloak must stay off');
  assert.equal(player.data.tumble, undefined, 'no tumble with flags off');
  assert.ok(!bus.events.some((e) => e.name === 'massline:throw' || e.name === 'loot:drop'),
    'no massline events with flags off');
  state.massline2.cloak = { active: true, radius: 50 };
  assert.equal(patrolCanInitiateScan(state, { pos: { x: 500, z: 0 } }, player), true,
    'flag-off customs behavior must remain byte-compatible');
});

// ── 3. Registry wiring + ordering ─────────────────────────────────────────────────────────────
section('registry order: cloak<aiSlot, aiPorts<tumbleStates<weapons, masslineImpacts<masslineThrow', () => {
  const ctx = { state: makeState({ settings: { gameplay: {} } }), bus: makeBus(), helpers: {} };
  const registry = createRegistry(ctx);
  const names = registry.updateOrder.map((s) => s.name);
  // Live registry order must match the authoritative production update-order IDs.
  assert.deepEqual(
    names.map((n) => (n === 'tacticalAI' || n === 'ai' ? 'aiSlot' : n === 'flight' ? 'flightSlot' : n)),
    [...PRODUCTION_UPDATE_ORDER],
    'createRegistry updateOrder must match PRODUCTION_UPDATE_ORDER (slot names normalized)',
  );
  for (const required of ['masslineThrow', 'bulletTime', 'tumbleStates', 'masslineImpactDamage', 'cloak', 'lootShards', 'terrainAnchors', 'jettisonImpulse', 'masslineHud']) {
    assert.ok(names.includes(required), `${required} missing from UPDATE_ORDER`);
  }
  const at = (n) => names.indexOf(n);
  assert.ok(at('cloak') < at('ai'), 'cloak must settle before the AI slot builds sensor frames');
  assert.ok(at('aiPorts') < at('tumbleStates'), 'tumbleStates must overwrite aiPorts control');
  assert.ok(at('tumbleStates') < at('weapons'), 'tumbleStates must clear fire before weapons');
  assert.ok(at('masslineImpacts') < at('masslineThrow'), 'throw reads settled massline mirrors');
});

section('release-assist setting and slow-time indicator presentation are reachable and motion-safe', () => {
  assert.equal(releaseAssistMode({ settings: { gameplay: {} } }), 'arm');
  assert.equal(releaseAssistMode({ settings: { gameplay: { masslineReleaseAssist: 'snap' } } }), 'snap');
  assert.equal(releaseAssistMode({ settings: { gameplay: { masslineReleaseAssist: 'off' } } }), 'off');
  const settingsSrc = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  assert.match(settingsSrc, /Massline release assist/);
  assert.match(settingsSrc, /'bulletTime', 'cloak'/,
    'bullet-time and cloak verbs must remain visible in the rebind list');
  assert.doesNotMatch(settingsSrc.match(/const REBINDABLE = \[[\s\S]*?\];/)?.[0] || '', /throwArm/,
    'contextual RMB throw arm must not become a fake key-binding row');
  const hudSrc = readFileSync(new URL('../src/ui/masslineHud.js', import.meta.url), 'utf8');
  assert.match(hudSrc, /transition:transform 60ms linear/,
    'throw/self marks must tween between slow-time sim updates');
  assert.match(hudSrc, /prefers-reduced-motion: reduce/);
  assert.match(hudSrc, /ml2-reduced-motion/,
    'in-game motionReduce must disable the transition without a new rAF loop');
  assert.doesNotMatch(hudSrc, /requestAnimationFrame\s*\(/,
    'massline HUD must not own an idle animation loop');
});

// ── 4a. Constrained lead solve beats the linear solver on a swinging target ──────────────────
section('constrained lead solve intercepts a rotating tethered target', () => {
  // Player at origin; target orbiting the shared COM. Build an honest rotating two-body state.
  const dist = 100;
  const omega = 1.4; // rad/s — a hard swing
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: dist * omega * (620 / 640) * -0.0 }, mass: 20 };
  // COM at target-weighted point; emulate pure rotation: target tangential velocity relative to
  // player = omega x r. Give the pair zero COM drift for a clean geometric assertion.
  const target = {
    pos: { x: dist, z: 0 },
    vel: { x: 0, z: omega * dist * (20 / (20 + 620)) + omega * dist * (620 / (20 + 620)) },
    mass: 620, radius: 8,
  };
  // Simpler honest construction: velocities of both bodies orthogonal to the line, opposite
  // signs, mass-weighted so the COM is static.
  const mp = 20, mt = 620;
  target.vel = { x: 0, z: omega * dist * (mp / (mp + mt)) };
  player.vel = { x: 0, z: -omega * dist * (mt / (mp + mt)) };

  const kin = tetherPairKinematics(player, target);
  assert.ok(Math.abs(kin.omega - omega) < 0.05, `pair omega ${kin.omega} should read ~${omega}`);

  const projSpeed = 360;
  const sol = solveTetherLeadSolution(player, target, projSpeed, { taut: true });
  assert.ok(sol.constrained, 'solver must take the constrained branch');

  // Advance the true circular motion to the solver's time-of-flight and measure the miss.
  const advance = (t) => {
    const ang = kin.omega * t;
    const qx = (target.pos.x - kin.comX) * Math.cos(ang) - (target.pos.z - kin.comZ) * Math.sin(ang);
    const qz = (target.pos.x - kin.comX) * Math.sin(ang) + (target.pos.z - kin.comZ) * Math.cos(ang);
    return { x: kin.comX + qx, z: kin.comZ + qz };
  };
  const bulletAt = (angle, t) => {
    const velocity = aimTrueProjectileVelocity(angle, projSpeed, player.vel);
    return { x: player.pos.x + velocity.x * t, z: player.pos.z + velocity.z * t };
  };
  const tHit = sol.time;
  const truth = advance(tHit);
  const bullet = bulletAt(sol.angle, tHit);
  const constrainedMiss = Math.hypot(bullet.x - truth.x, bullet.z - truth.z);
  assert.ok(constrainedMiss <= target.radius, `constrained miss ${constrainedMiss.toFixed(2)} must be <= radius ${target.radius}`);

  const linearAngle = solveLeadAngle(player, target, projSpeed);
  const tLin = tHit; // compare at the same flight time scale
  const linBullet = bulletAt(linearAngle, tLin);
  const linearMiss = Math.hypot(linBullet.x - advance(tLin).x, linBullet.z - advance(tLin).z);
  assert.ok(linearMiss > constrainedMiss, `linear solver (${linearMiss.toFixed(2)}) should miss worse than constrained (${constrainedMiss.toFixed(2)})`);
});

// ── 4b. Throw solution sweeps ─────────────────────────────────────────────────────────────────
section('throw solution opens once per revolution with size-honest tolerance', () => {
  const aim = { pos: { x: 0, z: 300 }, vel: { x: 0, z: 0 }, radius: 12 };
  const speed = 120;
  let opened = 0;
  let last = false;
  for (let i = 0; i < 360; i++) {
    const heading = (i / 360) * Math.PI * 2;
    const payload = { pos: { x: 0, z: 0 }, vel: { x: Math.cos(heading) * speed, z: Math.sin(heading) * speed } };
    const sol = solveThrowSolution(payload, aim, { omega: 1 });
    if (sol.onSolution && !last) opened++;
    last = sol.onSolution;
    assert.ok(sol.tolRad >= solutionToleranceRad(0.5, 300) && sol.tolRad <= solutionToleranceRad(1000, 10),
      'tolerance stays inside the clamp');
  }
  assert.equal(opened, 1, `solution must open exactly once per revolution (got ${opened})`);
  const bigger = solveThrowSolution(
    { pos: { x: 0, z: 0 }, vel: { x: 0, z: speed } }, { ...aim, radius: 60 }, {});
  const smaller = solveThrowSolution(
    { pos: { x: 0, z: 0 }, vel: { x: 0, z: speed } }, { ...aim, radius: 4 }, {});
  assert.ok(bigger.tolRad > smaller.tolRad, 'bigger targets must be more forgiving');

  const quarterTurn = solveThrowSolution(
    { pos: { x: 0, z: 0 }, vel: { x: speed, z: 0 } }, aim, { omega: 1 });
  assert.ok(Math.abs(quarterTurn.timeToSolution - Math.PI / 2) < 0.02,
    `positive rotation must reach a +90deg aim in one quarter-turn (got ${quarterTurn.timeToSolution})`);
});

// ── 5. Flag-on system behaviors ───────────────────────────────────────────────────────────────
withFlags(true, () => {
  section('every tether leaves the player center of mass', () => {
    const state = makeState();
    const player = { id: 1, team: 0, pos: { x: 0, z: 0 } };
    const acquired = { x: 88, y: 0, z: 3 };
    const neutral = { id: 2, type: 'ship', team: 2, pos: { x: 100, z: 20 }, data: { ai: { passive: true } } };
    const hostile = { id: 3, type: 'ship', team: 3, pos: { x: 100, z: 20 }, data: { encounter: true } };
    const asteroid = { id: 4, type: 'asteroid', team: 2, pos: { x: 100, z: 20 }, data: {} };
    const tow = contextualAttachmentWorlds(player, neutral, acquired, state);
    assert.deepEqual(tow.sourceWorld, { x: 0, y: 0, z: 0 }, 'tow line must leave from player COM');
    assert.deepEqual(tow.targetWorld, { x: 100, y: 0, z: 20 }, 'dynamic tow target must attach at its COM');
    const combat = contextualAttachmentWorlds(player, hostile, acquired, state);
    assert.deepEqual(combat.sourceWorld, { x: 0, y: 0, z: 0 },
      'hostile combat tether must not steer through a nose anchor');
    assert.deepEqual(combat.targetWorld, { x: 100, y: 0, z: 20 },
      'dynamic combat target uses its center of mass');
    assert.deepEqual(contextualAttachmentWorlds(player, asteroid, acquired, state).targetWorld, acquired,
      'immovable terrain keeps the readable surface endpoint');
  });

  section('armed throw auto-cuts on the solution frame and announces massline:throw', () => {
    const bus = makeBus();
    const state = makeState();
    addEntity(state, { id: 1, type: 'ship', team: 0, mass: 20 });
    const rock = addEntity(state, { id: 2, type: 'asteroid', pos: { x: 80, z: 0 }, vel: { x: 0, z: 90 }, mass: 640, radius: 9 });
    addEntity(state, { id: 3, type: 'ship', team: 2, pos: { x: 80, z: 400 }, vel: { x: 0, z: 0 }, radius: 10 });
    state.player.tether = { active: true, targetId: 2, attachmentId: 'att_7', phase: 'loaded', reeling: false };
    state.player.targetId = 3;
    state.input.actions.throwArm = true;
    const cuts = [];
    const registry = {
      get: (name) => (name === 'actions'
        ? { kernel: { attachments: { cut: (...args) => { cuts.push(args); return { ok: true }; } } } }
        : null),
    };
    initSystem(masslineThrow, state, bus, { combatPhysics: null }, registry);
    // The rock's velocity points almost exactly at the aim target (small x-drift over the gap is
    // inside the tolerance for a radius-10 target at ~400) — the arm must fire on this frame.
    masslineThrow.update(1 / 60, state);
    assert.equal(cuts.length, 1, 'attachment must be cut exactly once');
    assert.equal(cuts[0][2], 'tether_cut', 'cut reason must ride the canonical released path');
    const thrown = bus.events.find((e) => e.name === 'massline:throw');
    assert.ok(thrown, 'massline:throw must be announced');
    assert.equal(thrown.payload.payloadId, 2);
    assert.equal(thrown.payload.aimTargetId, 3);
    assert.ok(bus.events.some((e) => e.name === 'audio:cue' && e.payload.id === 'massline.solutionLock'),
      'solution-lock cue fires on the rising edge');
  });

  section('throw assist modes stay distinct and self-sling reads the live nav waypoint', () => {
    const makeThrowFixture = (mode) => {
      const bus = makeBus();
      const state = makeState({
        nav: { waypoint: { kind: 'local', pos: { x: -240, z: 80 }, label: 'TEST FIX' } },
      });
      state.settings.gameplay.masslineReleaseAssist = mode;
      const player = addEntity(state, { id: 1, type: 'ship', team: 0, mass: 20, vel: { x: 0, z: 70 } });
      addEntity(state, { id: 2, type: 'asteroid', pos: { x: 80, z: 0 }, vel: { x: 70, z: 0 }, mass: 640, radius: 9 });
      state.player.tether = { active: true, targetId: 2, attachmentId: 'att_mode', phase: 'loaded' };
      state.input.aimWorld = { x: 500, z: 500 };
      state.input.actions.throwArm = true;
      const cuts = [];
      const registry = { get: (name) => (name === 'actions'
        ? { kernel: { attachments: { cut: (...args) => { cuts.push(args); return { ok: true }; } } } }
        : null) };
      const system = Object.create(masslineThrow);
      initSystem(system, state, bus, { combatPhysics: { applyImpulse: () => true } }, registry);
      system.update(1 / 60, state);
      return { state, bus, player, cuts, system };
    };

    const off = makeThrowFixture('off');
    assert.equal(off.cuts.length, 1,
      'assist=off must still perform the player-requested manual throw instead of swallowing RMB');
    assert.equal(off.bus.events.find((e) => e.name === 'massline:throw')?.payload.mode, 'off');

    const snap = makeThrowFixture('snap');
    assert.equal(snap.cuts.length, 1,
      'assist=snap outside the snap window must remain a manual throw, not arm indefinitely');
    assert.equal(snap.bus.events.find((e) => e.name === 'massline:throw')?.payload.mode, 'snap-manual');

    const arm = makeThrowFixture('arm');
    assert.equal(arm.cuts.length, 0,
      'assist=arm may wait for the next solution frame');
    assert.ok(arm.state.massline2.throw.selfSolution,
      'self-sling must resolve a local nav waypoint even without a combat target');
    assert.equal(arm.state.massline2.throw.selfSolution.targetKind, 'waypoint');
  });

  section('tether fire control matches aim-true ballistics per projectile speed', () => {
    const state = makeState();
    const player = addEntity(state, {
      id: 1, type: 'ship', team: 0, mass: 20,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: -80 },
    });
    const target = addEntity(state, {
      id: 7, type: 'ship', team: 1, mass: 80, radius: 8,
      pos: { x: 100, z: 0 }, vel: { x: 0, z: 20 }, data: { encounter: true },
    });
    state.player.tether = { active: true, targetId: target.id, phase: 'loaded' };
    const host = { helpers: { getEntity: (id) => state.entities.get(id) }, _playerProjSpeed: () => 360 };
    const slow = weapons._tetherFireSolution.call(host, player, state, 220);
    const fast = weapons._tetherFireSolution.call(host, player, state, 620);
    assert.ok(Math.abs(slow.angle - fast.angle) > 0.01,
      'mixed-speed mounts need distinct constrained lead angles');

    const kin = tetherPairKinematics(player, target);
    const sol = solveTetherLeadSolution(player, target, 220, { taut: true });
    const velocity = aimTrueProjectileVelocity(sol.angle, 220, player.vel);
    const ang = kin.omega * sol.time;
    const qx = (target.pos.x - kin.comX) * Math.cos(ang) - (target.pos.z - kin.comZ) * Math.sin(ang);
    const qz = (target.pos.x - kin.comX) * Math.sin(ang) + (target.pos.z - kin.comZ) * Math.cos(ang);
    const truth = {
      x: kin.comX + kin.comVx * sol.time + qx,
      z: kin.comZ + kin.comVz * sol.time + qz,
    };
    const bullet = {
      x: player.pos.x + velocity.x * sol.time,
      z: player.pos.z + velocity.z * sol.time,
    };
    assert.ok(Math.hypot(bullet.x - truth.x, bullet.z - truth.z) <= target.radius,
      'the solver must hit under the actual aim-true projectile velocity model');
  });

  section('tumble entry: real torque impulse, zero control, no fire, morale stamp, recovery', () => {
    const bus = makeBus();
    const state = makeState();
    addEntity(state, { id: 1, type: 'ship', team: 0, mass: 200 });
    const victim = addEntity(state, {
      id: 5, type: 'ship', team: 2, pos: { x: 50, z: 0 }, vel: { x: 90, z: 0 },
      mass: 20, turnRate: 3, data: { intent: { fire: true, moveX: 1, moveZ: 1 } },
    });
    const helpers = { combatPhysics: { applyImpulse: () => true } };
    const kernel = createCombatKernel({ state, bus, helpers });
    const system = Object.create(tumbleStates);
    initSystem(system, state, bus, helpers, { get: (name) => (name === 'combat' ? { kernel } : null) });
    bus.emit('massline:throw', { payloadId: 5, payloadSpeed: 120 });
    const pending = readMasslineTumbleStatus(state, victim);
    assert.ok(pending, 'the authoritative tumble status must be scheduled');
    assert.equal(pending.data.kind, MASSLINE_TUMBLE_KIND);
    assert.equal(victim.data.tumble, undefined, 'entity data must not duplicate the active tumble fact');
    assert.ok(Number.isFinite(victim.data.tumbledAt), 'morale stamp must be written');
    system.update(1 / 60, state);
    const cmd = consumePhysicsCommand(victim);
    assert.ok(cmd && cmd.torqueImpulses.length >= 1, 'a real angular impulse must be queued');
    assert.ok(cmd.control && cmd.control.mode === 'tumbling', 'control must be overwritten to tumbling');
    assert.equal(cmd.control.torque.y, 0, 'commanded torque must be zero while tumbling');
    assert.equal(victim.data.intent.fire, false, 'fire intent must be cleared');
    assert.ok(bus.events.some((e) => e.name === 'massline:tumbled'), 'massline:tumbled must be announced');
    state.tick++;
    kernel.prePhysics(1 / 60);
    const active = state.combat.entities[String(victim.id)].statuses[TUMBLE_STATUS_ID];
    assert.equal(active.data.kind, MASSLINE_TUMBLE_KIND,
      'pending tumble metadata must become the same authoritative active status');
    // Recovery: spin caught + min duration elapsed.
    victim.angVel = 0.2;
    state.simTime += 3;
    state.tick += 180;
    system.update(1 / 60, state);
    assert.equal(readMasslineTumbleStatus(state, victim), null,
      'tumble status must clear once the RCS catches the spin');
    assert.equal(victim.data.tumble, undefined, 'recovery must not recreate the deleted duplicate state');
    assert.ok(bus.events.some((e) => e.name === 'massline:tumbleEnd'));
    kernel.prePhysics(1 / 60);
    assert.ok(!state.combat.entities[String(victim.id)].blockedActionTags.includes('weapon'),
      'clearing the active status must recompute action gates on the same production pass');
  });

  section('tumble status rejects dash/tether/weapon actions before spending capacitor', () => {
    const bus = makeBus();
    const state = makeState();
    addEntity(state, { id: 1, type: 'ship', team: 0, mass: 200, cap: 100, capMax: 100 });
    const victim = addEntity(state, {
      id: 15, type: 'ship', team: 1, mass: 20, cap: 100, capMax: 100,
      data: { intent: { fire: true } },
    });
    const helpers = { combatPhysics: { applyImpulse: () => true } };
    const kernel = createCombatKernel({ state, bus, helpers });
    const system = Object.create(tumbleStates);
    initSystem(system, state, bus, helpers, { get: (name) => (name === 'combat' ? { kernel } : null) });
    kernel.actions.requestAction({ actorId: victim.id, actionId: 'action_dash', source: { kind: 'ai' } });
    bus.emit('massline:throw', { payloadId: victim.id, payloadSpeed: 120 });
    const capBefore = victim.cap;
    state.tick++;
    kernel.prePhysics(1 / 60);
    assert.equal(victim.cap, capBefore, 'blocked tumble action must not spend capacitor');
    assert.ok(bus.events.some((e) => e.name === 'combat:actionRejected'
      && e.payload.actorId === victim.id && /disabled:tag:dash/.test(e.payload.reason)),
    'dash must reject through the canonical blocked-action contract');
  });

  section('the player NEVER tumbles and never takes the new impact damage', () => {
    const bus = makeBus();
    const state = makeState();
    const player = addEntity(state, { id: 1, type: 'ship', team: 0, mass: 20, data: {} });
    const helpers = { combatPhysics: { applyImpulse: () => true } };
    const kernel = createCombatKernel({ state, bus, helpers });
    const system = Object.create(tumbleStates);
    initSystem(system, state, bus, helpers, { get: (name) => (name === 'combat' ? { kernel } : null) });
    bus.emit('massline:throw', { payloadId: 1, payloadSpeed: 500 });
    bus.emit('tether:whipImpact', { targetId: 2, victimId: 1, rating: 'crushing', momentum: 1e9 });
    assert.equal(player.data.tumble, undefined, 'player must never tumble');
    assert.equal(readMasslineTumbleStatus(state, player), null, 'player events must not schedule tumble status');
    const playerRuntime = state.combat.entities[String(player.id)];
    kernel.statuses.schedule(player, playerRuntime, {
      id: TUMBLE_STATUS_ID,
      applyTick: state.tick + 1,
      data: { kind: MASSLINE_TUMBLE_KIND, startedAt: state.simTime, until: state.simTime + 3 },
    });
    system.update(1 / 60, state);
    assert.equal(readMasslineTumbleStatus(state, player), null,
      'even an impossible forged pending status must be cleared before it can control the player');
    const routed = [];
    const registry = { get: (n) => (n === 'combat' ? { kernel: { routeDamage: (r) => { routed.push(r); return { ok: true }; } } } : null) };
    initSystem(masslineImpactDamage, state, bus, {}, registry);
    kernel.statuses.schedule(player, playerRuntime, {
      id: TUMBLE_STATUS_ID,
      applyTick: state.tick + 1,
      data: { kind: MASSLINE_TUMBLE_KIND, startedAt: state.simTime, until: state.simTime + 3 },
    }); // even under an impossible forged state...
    bus.emit('physics:impact', { aId: 1, bId: 2, dp: 1e6, pos: { x: 0, z: 0 } });
    bus.emit('tether:whipImpact', { targetId: 1, victimId: 2, rating: 'crushing', momentum: 1e9 });
    assert.equal(routed.length, 0, '...no new damage path may ever target the player');
    kernel.statuses.clear(player, playerRuntime, TUMBLE_STATUS_ID, 'test_cleanup');
  });

  section('whip recoil and tumble contact damage route through the kernel for NPCs', () => {
    const bus = makeBus();
    const state = makeState();
    addEntity(state, { id: 1, type: 'ship', team: 0 });
    const thrown = addEntity(state, { id: 6, type: 'ship', team: 2, pos: { x: 30, z: 0 } });
    state.combat = {
      entities: {
        [String(thrown.id)]: {
          statuses: {
            [TUMBLE_STATUS_ID]: { id: TUMBLE_STATUS_ID, data: { kind: MASSLINE_TUMBLE_KIND } },
          },
          pendingStatuses: [],
        },
      },
    };
    const routed = [];
    const registry = { get: (n) => (n === 'combat' ? { kernel: { routeDamage: (r) => { routed.push(r); return { ok: true }; } } } : null) };
    initSystem(masslineImpactDamage, state, bus, {}, registry);
    bus.emit('tether:whipImpact', { targetId: 6, victimId: 9, rating: 'solid', momentum: 40000 });
    bus.emit('physics:impact', { aId: 6, bId: 9, dp: 5000, pos: { x: 30, z: 0 } });
    assert.equal(routed.length, 2, 'recoil + tumble contact must both route');
    assert.ok(routed.every((r) => r.targetId === 6 && r.attackerId === 1));
    assert.ok(routed.every((r) => r.packet && r.packet.flags && r.packet.flags.allowAnyTarget));
  });

  section('cloak toggles, drains, grows with activity, and gates perception honestly', () => {
    const bus = makeBus();
    const state = makeState();
    const player = addEntity(state, { id: 1, type: 'ship', team: 0 });
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['mod_cloak_mk1'] }];
    state.player.activeShipIndex = 0;
    initSystem(cloak, state, bus, {});
    state.input.actions.cloakToggle = true;
    cloak.update(1 / 60, state);
    state.input.actions.cloakToggle = false;
    const runtime = state.massline2.cloak;
    assert.ok(runtime.available && runtime.active, 'fitted cloak must engage on toggle');
    const quietRadius = runtime.radius;
    state.input.moveZ = 1; state.input.boost = true;
    for (let i = 0; i < 60; i++) cloak.update(1 / 60, state);
    assert.ok(runtime.radius > quietRadius * 1.8, `thrust+boost must grow the ring (${runtime.radius} vs ${quietRadius})`);
    assert.ok(runtime.energy < 1, 'energy must drain while active');
    const nearObserver = { pos: { x: player.pos.x + runtime.radius * 0.5, z: 0 } };
    const farObserver = { pos: { x: player.pos.x + runtime.radius * 2, z: 0 } };
    assert.equal(cloakHidesPlayerFrom(state, nearObserver, player), false, 'inside the ring sees you');
    assert.equal(cloakHidesPlayerFrom(state, farObserver, player), true, 'outside the ring cannot');
    bus.emit('combat:fire', { ownerId: 1 });
    assert.equal(runtime.active, false, 'firing must break the cloak');
    assert.equal(cloakHidesPlayerFrom(state, farObserver, player), false, 'a dropped cloak hides nothing');
  });

  section('cloaked patrol scans require an observer inside the live detection ring', () => {
    const makeFixture = (patrolX) => {
      const emitted = [];
      const resolved = [];
      const player = { id: 1, pos: { x: 0, z: 0 } };
      const leader = { id: 9, pos: { x: patrolX, z: 0 } };
      const state = makeState({ massline2: { cloak: { active: true, radius: 200 } } });
      const live = { phase: 'offer', factionId: 'faction_scn', data: { scan: null }, vars: {} };
      const d = {
        player: () => player,
        entsOf: () => [leader],
        emit: (name, payload) => emitted.push({ name, payload }),
        sectorSecurity: () => 2,
        despawnAll: () => {},
        resolve: (_live, outcome, meta) => { resolved.push({ outcome, meta }); return outcome; },
        rep: () => {},
        say: () => {},
      };
      ENCOUNTER_SCRIPTS.patrolScan.choose(d, live, state, 'submit');
      return { emitted, resolved };
    };
    const outside = makeFixture(500);
    assert.equal(outside.emitted.some((e) => e.name === 'patrol:proximity'), false,
      'outside-ring patrol must not initiate the customs scan');
    assert.equal(outside.resolved[0].outcome, 'cloak_evaded');
    const inside = makeFixture(100);
    assert.equal(inside.emitted.filter((e) => e.name === 'patrol:proximity').length, 1,
      'inside-ring patrol must route the unchanged economy scan seam');
    assert.equal(inside.emitted[0].payload.patrolId, 9);
    assert.equal(inside.emitted[0].payload.security, 2,
      'existing customs security/scannerCloak inputs remain economy-owned');

    // A patrol outside the ring must not hail first and only discover the cloak at submit time.
    // The physical cloak prevents the scan encounter from initiating at all.
    const hails = [];
    const offers = [];
    const fireResolved = [];
    const fireState = makeState({ massline2: { cloak: { active: true, radius: 200 } } });
    const firePlayer = { id: 1, pos: { x: 0, z: 0 } };
    let fireLeader = null;
    const fireLive = {
      anchor: { x: 1, z: 0 },
      plan: { ships: [{ id: 'patrol_fixture' }] },
      shape: { scanS: 10 },
      phase: 'pending', data: {}, vars: {},
    };
    const fireDriver = {
      player: () => firePlayer,
      stream: () => () => 0.5,
      spawnShips: (_live, ships) => {
        fireLeader = { id: 9, pos: { ...ships[0].pos } };
        return [fireLeader.id];
      },
      entsOf: () => fireLeader ? [fireLeader] : [],
      abort: (_live, outcome) => outcome,
      now: () => 10,
      say: (...args) => hails.push(args),
      hasContraband: () => false,
      offerChoices: (...args) => offers.push(args),
      despawnAll: () => {},
      resolve: (_live, outcome, meta) => { fireResolved.push({ outcome, meta }); return outcome; },
    };
    ENCOUNTER_SCRIPTS.patrolScan.fire(fireDriver, fireLive, fireState);
    assert.equal(hails.length, 0, 'an outside-ring patrol must not hail a ship it cannot detect');
    assert.equal(offers.length, 0, 'an undetected ship must not receive fake scan choices');
    assert.equal(fireResolved[0]?.outcome, 'cloak_evaded');
  });

  section('loot shards ride loot:drop; terrain anchors spawn big-and-few; jettison kicks capped', () => {
    const bus = makeBus();
    const state = makeState();
    addEntity(state, { id: 1, type: 'ship', team: 0, rot: 0, mass: 20 });
    const spawned = [];
    const impulses = [];
    const helpers = {
      mulberry32, hash32,
      spawnEntity: (spec) => { spawned.push(spec); return spec; },
      combatPhysics: { applyImpulse: (input) => { impulses.push(input); return true; } },
    };
    initSystem(lootShards, state, bus, helpers);
    initSystem(terrainAnchors, state, bus, helpers);
    initSystem(jettisonImpulse, state, bus, helpers);

    addEntity(state, { id: 9, type: 'ship', team: 1, pos: { x: 5, z: 5 }, data: { encounter: true } });
    bus.emit('entity:killed', { id: 9, killerId: 1, type: 'ship', pos: { x: 5, z: 5 } });
    const drop = bus.events.find((e) => e.name === 'loot:drop');
    assert.ok(drop && drop.payload.items.length >= 1, 'a player kill of a hostile must drop shards');
    addEntity(state, { id: 10, type: 'ship', team: 2, pos: { x: 5, z: 5 }, data: { ai: { passive: true } } });
    bus.emit('entity:killed', { id: 10, killerId: 1, type: 'ship', pos: { x: 5, z: 5 } });
    assert.equal(bus.events.filter((e) => e.name === 'loot:drop').length, 1,
      'neutral/civilian player kills must not be rewarded as hostile shards');
    bus.emit('entity:killed', { id: 11, killerId: 55, type: 'ship', pos: { x: 5, z: 5 } });
    assert.equal(bus.events.filter((e) => e.name === 'loot:drop').length, 1, 'NPC kills drop nothing');

    bus.emit('encounter:telegraph', { encounterId: 'enc_a', pos: { x: 1000, z: 1000 } });
    const anchors = spawned.filter((s) => s.type === 'asteroid');
    assert.ok(anchors.length >= 1 && anchors.length <= 3, `anchors big-and-few (got ${anchors.length})`);
    assert.ok(anchors.every((a) => a.radius >= 26), 'anchors must be LARGE');
    assert.ok(anchors.every((a) => a.data.terrainAnchor === true && Number.isFinite(a.data.despawnAt)));
    for (const a of anchors) addEntity(state, {
      id: 100 + anchors.indexOf(a), type: 'asteroid', pos: a.pos, radius: a.radius, data: a.data,
    });
    const before = spawned.length;
    bus.emit('encounter:telegraph', { encounterId: 'enc_b', pos: { x: 1000, z: 1000 } });
    assert.equal(spawned.length, before, 'a bubble with anchors must never gain gravel');
    const liveAnchor = state.entityList.find((e) => e.data && e.data.terrainAnchor);
    assert.deepEqual(liveAnchor.data.terrainAnchorEncounterIds.sort(), ['enc_a', 'enc_b'],
      'overlapping encounters must share the same few anchors');
    const longTtl = liveAnchor.data.despawnAt;
    bus.emit('encounter:resolved', { encounterId: 'enc_a' });
    assert.equal(liveAnchor.data.despawnAt, longTtl, 'one remaining encounter keeps the shared anchor');
    bus.emit('encounter:resolved', { encounterId: 'enc_b' });
    assert.equal(liveAnchor.data.despawnAt, state.simTime + 45,
      'last owner schedules bounded aftermath cleanup instead of a 15-minute orphan');

    bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 500 });
    assert.equal(impulses.length, 1, 'jettison must kick');
    const dv = Math.hypot(impulses[0].impulse.x, impulses[0].impulse.z) / 20;
    assert.ok(dv <= 45 + 1e-9, `jettison dv must be capped (got ${dv})`);
  });

  section('bullet time meter engages, drains, refuses when empty, recharges', () => {
    const bus = makeBus();
    // NOTE: never assign state.timeScale here — the repo-wide writer audit (check:time-effects)
    // scans scripts/check-*.mjs; the stubbed timeEffects below is the only scalar owner in play.
    const state = makeState();
    addEntity(state, { id: 1, type: 'ship', team: 0 });
    initSystem(bulletTime, state, bus, {});
    bulletTime.timeEffects = { set: () => {}, clear: () => {} };
    state.input.actions.bulletTime = true;
    bulletTime.update(1 / 60, state);
    const runtime = state.massline2.bulletTime;
    assert.ok(runtime.active, 'held verb with a full meter must engage');
    for (let i = 0; i < 60 * 5; i++) bulletTime.update(1 / 60, state);
    assert.equal(runtime.active, false, 'a drained meter must disengage');
    // The depletion latch: the meter recharges while the key stays held, but the verb must NOT
    // stutter back on until a fresh press — even far above the engage floor.
    assert.ok(runtime.energy >= 0.15, 'fixture: meter has recharged past the engage floor');
    bulletTime.update(1 / 60, state);
    assert.equal(runtime.active, false, 'holding through empty must not stutter back on');
    state.input.actions.bulletTime = false;
    bulletTime.update(1 / 60, state);
    state.input.actions.bulletTime = true;
    bulletTime.update(1 / 60, state);
    assert.equal(runtime.active, true, 'a fresh press after release must engage again');
    state.input.actions.bulletTime = false;
    for (let i = 0; i < 60 * 6; i++) bulletTime.update(1 / 60, state);
    assert.ok(runtime.energy > 0.9, 'meter must recharge while released');
  });

  section('bullet-time audio sweeps physical buses, slows loops, ducks music, and restores', () => {
    const fakeParam = (value) => ({
      value, calls: [],
      cancelScheduledValues(t) { this.calls.push(['cancel', t]); },
      setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); },
      linearRampToValueAtTime(v, t) { this.value = v; this.calls.push(['ramp', v, t]); },
      setTargetAtTime(v, t, tc) { this.value = v; this.calls.push(['target', v, t, tc]); },
    });
    const filters = Array.from({ length: 3 }, () => ({ frequency: fakeParam(BULLET_TIME_AUDIO.openHz) }));
    const uiFilter = { frequency: fakeParam(BULLET_TIME_AUDIO.openHz) };
    const loopRate = fakeParam(1);
    const uiLoopRate = fakeParam(1);
    const musicGain = fakeParam(0.2);
    const rt = {
      ctx: { currentTime: 4 },
      _bulletTimeFilters: filters,
      _musicBase: 0.2,
      musicBus: { gain: musicGain },
      loops: {
        physical: { busName: 'combat', sources: [{ playbackRate: loopRate }] },
        ui: { busName: 'ui', sources: [{ playbackRate: uiLoopRate }] },
      },
    };
    applyBulletTimeAudioTreatment(rt, true, false);
    assert.ok(filters.every((f) => f.frequency.value === BULLET_TIME_AUDIO.cutoffHz),
      'engine/ambient/combat filters must reach the slow-time cutoff');
    assert.equal(uiFilter.frequency.calls.length, 0, 'UI/comms path must stay crisp and untouched');
    assert.equal(loopRate.value, BULLET_TIME_AUDIO.loopRate, 'continuous loops must pitch down');
    assert.equal(uiLoopRate.value, 1, 'UI/comms loops must retain normal pitch');
    assert.ok(Math.abs(musicGain.value - 0.2 * BULLET_TIME_AUDIO.musicMult) < 1e-8,
      'music must duck by the authored multiplier');
    applyBulletTimeAudioTreatment(rt, false, false);
    assert.ok(filters.every((f) => f.frequency.value === BULLET_TIME_AUDIO.openHz),
      'physical-bus filters must reopen on exit');
    assert.equal(loopRate.value, 1, 'continuous loop rate must restore on exit');
    applyBulletTimeAudioTreatment(rt, true, true);
    assert.ok(filters.every((f) => f.frequency.value === BULLET_TIME_AUDIO.openHz),
      'muted master keeps the treatment inert');
    assert.equal(loopRate.value, 1, 'muted treatment must not alter loop rate');

    const audioSrc = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
    const startLoopAt = audioSrc.indexOf('_startLoopVoice(recipeId, position, gain)');
    const startLoop = audioSrc.slice(
      startLoopAt,
      audioSrc.indexOf('_endLoopVoice(v)', startLoopAt),
    );
    assert.match(startLoop, /rate:\s*isPhysicalAudioBus\(busName\)/,
      'continuous loops created after slow-time starts must inherit the active pitch');
  });

  section('bomb propulsion is tech-paced, drops armed aft, and rides honest radial impulse', () => {
    const oldRack = MODULES.find((m) => m.id === 'mod_charge_rack');
    const vectorRack = MODULES.find((m) => m.id === 'mod_charge_vector_rack');
    const tech = TECH_NODES.find((t) => t.id === 'tech_impulse_ballistics');
    assert.ok(oldRack && !oldRack.requiresTech, 'starting charge rack/system must remain ungated');
    assert.ok(vectorRack && vectorRack.requiresTech === tech.id && vectorRack.mods.bombPropulsion,
      'only the vector rack unlocks the aft-drop ergonomic');
    assert.ok(tech.prereqs.includes('tech_drive_tuning') && tech.unlocks.modules.includes(vectorRack.id),
      'bomb propulsion must sit after basic drive familiarity in the tech tree');

    const makeBombFixture = (researched = true, playerSpec = {}) => {
      const bus = makeBus();
      const state = makeState();
      const player = addEntity(state, {
        id: 1, type: 'ship', team: 0, mass: 32, radius: 6, rot: 0, ...playerSpec,
      });
      const pursuer = addEntity(state, { id: 8, type: 'ship', team: 2, mass: 32,
        pos: { x: -40, z: 0 }, hull: 100, shield: 0, armor: 0 });
      state.player.activeShipIndex = 0;
      state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['mod_charge_vector_rack'] }];
      state.player.researchedNodes = researched ? ['tech_drive_tuning', 'tech_impulse_ballistics'] : ['tech_drive_tuning'];
      state.player.cargo = { items: { cmdty_impulse_charge: 2 }, usedVolume: 4, usedMass: 4, capVolume: 40, capMass: 60 };
      state.input.actions.chargeThrow = true;
      state.input.actions.brake = true;
      const impulses = [];
      const damage = [];
      let nextId = 50;
      const helpers = {
        spawnEntity(spec) {
          const entity = { id: nextId++, alive: true, ...spec };
          state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
        },
        combatPhysics: { applyImpulse(input) { impulses.push(input); return true; } },
        routeCombatDamage(input) { damage.push(input); return { ok: true }; },
      };
      const system = Object.create(impulseCharges);
      system.init({ state, bus, helpers, registry: null });
      return { state, bus, system, player, pursuer, impulses, damage };
    };

    const locked = makeBombFixture(false);
    assert.equal(bombPropulsionAvailable(locked.state), false, 'research is required even if a forged save fits the rack');
    locked.system.update(1 / 60, locked.state);
    const lockedCharge = locked.state.entityList.find((e) => e.type === 'charge');
    assert.ok(lockedCharge.pos.x > 0 && !lockedCharge.data.aftDrop,
      'locked brake+throw must preserve the original nose-lob behavior');

    const h = makeBombFixture(true);
    assert.equal(bombPropulsionAvailable(h.state), true);
    h.system.update(1 / 60, h.state);
    const charge = h.state.entityList.find((e) => e.type === 'charge');
    const expectedStandoff = Math.max(BOMB_PROPULSION_DIALS.minStandoff,
      h.player.radius * BOMB_PROPULSION_DIALS.standoffRadii);
    assert.ok(charge.data.aftDrop && charge.data.armed, 'aft charge must be armed immediately');
    assert.ok(Math.abs(charge.pos.x + expectedStandoff) < 1e-9 && Math.abs(charge.pos.z) < 1e-9,
      'brake+throw must place the charge directly astern');
    assert.deepEqual(charge.vel, h.player.vel, 'aft drop must have near-zero relative velocity');
    assert.ok(h.bus.events.some((e) => e.name === 'audio:cue' && e.payload.id === 'massline.bombDrop'),
      'aft drop needs its own immediate audio acknowledgement');
    h.state.input.actions.chargeDetonate = true;
    h.state.input.actions.brake = false;
    h.system.update(1 / 60, h.state);
    const selfImpulse = h.impulses.find((i) => i.entityId === h.player.id);
    assert.ok(selfImpulse && selfImpulse.impulse.x > BOMB_PROPULSION_DIALS.referenceSelfImpulseMin,
      `self impulse must clear ${BOMB_PROPULSION_DIALS.referenceSelfImpulseMin} at reference standoff`);
    assert.ok(Math.abs(selfImpulse.impulse.z) < 1e-9, 'astern blast must kick straight forward');
    assert.ok(h.damage.some((d) => d.targetId === h.player.id), 'riding the blast must retain self-damage risk');
    assert.ok(h.damage.some((d) => d.targetId === h.pursuer.id), 'a pursuer in the aft blast lane must be hurt');

    // Live hulls reach radius 45. The aft plate must stay outside the hull while its radial blast
    // still reaches that hull surface; a radius-6-only fixture hides this failure completely.
    const capital = makeBombFixture(true, { radius: 45, mass: 600 });
    capital.system.update(1 / 60, capital.state);
    const capitalCharge = capital.state.entityList.find((e) => e.type === 'charge');
    assert.ok(Math.hypot(
      capitalCharge.pos.x - capital.player.pos.x,
      capitalCharge.pos.z - capital.player.pos.z,
    ) > capital.player.radius + capitalCharge.radius,
    'aft plate must spawn clear of the largest live hull');
    capital.state.input.actions.chargeDetonate = true;
    capital.state.input.actions.brake = false;
    capital.system.update(1 / 60, capital.state);
    assert.ok(capital.impulses.some((i) => i.entityId === capital.player.id),
      'bomb propulsion must reach the surface of the largest live hull');
    assert.ok(capital.damage.some((d) => d.targetId === capital.player.id),
      'large-hull blast riding must preserve the same damage risk');
  });
});

if (failures.length) {
  console.error(`[check-massline2] FAIL — ${failures.length} section(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('[check-massline2] PASS - flags, inertness, wiring, solvers, and system contracts green');
