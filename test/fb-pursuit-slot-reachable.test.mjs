// FB-001 — the pursuit-slot assist that exists becomes a reachable assisted-flight option.
//
// Two halves, both pinned here:
//
// 1. REACHABILITY. The pure module (`src/core/flight/pursuitSlotAssist.js`) used to have no
//    caller: the shipped route deliberately retired the unconditional pursuit path in favour of
//    the dynamic combat stick (test/pursuit-slot.test.mjs pins that decision). FB-001 re-surfaces
//    the assist as an OPT-IN flight option: flightV3 steps it from the same player branch that
//    steps the orbit assist, strictly gated behind `gameplay.pursuitSlotAssist` (default OFF, so
//    goldens and the default feel are untouched), reachable through the Settings row beside the
//    orbit-assist option plus the target lock the player already holds. No new input binding,
//    and input.js stays out of slot creation entirely.
//
// 2. THE DONE-WHEN SCENARIO. Seed 4242 fixed scenario, an NPC fleeing on a curve for 20 s:
//    time-in-slot with the assist on is at least double time-in-slot with it off, the player's
//    speed never exceeds what thrust can produce (per-tick velocity change bound), and the
//    assist's authority is bounded by thrust the hull already has. The chase runs through the
//    REAL spawn chain and the REAL kernel (stepPropulsion) the same way
//    test/propulsion-spawned-ship-authority.test.mjs does — fixtures only for the fleeing NPC.
//
// Determinism: the curve and the policy are pure functions of the tick; no Math.random, no wall
// time. `createGameState(4242)` is the named seed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createPursuitSlot, PURSUIT_SLOT_TUNING_V1, stepPursuitSlotAssist } from '../src/core/flight/pursuitSlotAssist.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';

const DT = 1 / 60;
const SCENARIO_TICKS = 20 * 60; // 20 s
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --------------------------------------------------------------------------------------------
// 1. Reachability — the wiring exists and is gated
// --------------------------------------------------------------------------------------------

test('FB-001 the setting ships default-off and the route is reachable through existing surfaces', () => {
  const state = createGameState(4242);
  assert.equal(state.settings.gameplay.pursuitSlotAssist, false,
    'default off: the default route, its feel, and every golden stay exactly as shipped');

  const flightSource = read('../src/systems/flightV3.js');
  assert.match(flightSource, /from '\.\.\/core\/flight\/pursuitSlotAssist\.js'/,
    'flightV3 is the assist caller');
  assert.match(flightSource, /pursuitSlotAssist !== true/,
    'strict gate: the assist runs only when the setting is explicitly true');

  const settingsSource = read('../src/ui/screens/settings.js');
  assert.match(settingsSource, /Pursuit slot assist/,
    'the option is surfaced beside the orbit-assist row');
  assert.match(settingsSource, /'gameplay', 'pursuitSlotAssist'/,
    'the row writes the gameplay key the flight gate reads');

  const inputSource = read('../src/systems/input.js');
  assert.doesNotMatch(inputSource, /createPursuitSlot|adjustPursuitSlot/,
    'reachability needs no new input binding: settings row + the existing target lock');
});

test('FB-001 the gate fails closed, forms one slot per lock, and answers with bounded thrust', () => {
  const state = createGameState(4242);
  state.playerId = 1;
  state.player.targetId = 2;
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    mass: 150,
  };
  const target = {
    id: 2, type: 'ship', alive: true, pos: { x: 240, z: 0 }, vel: { x: -40, z: 20 }, rot: 0,
  };
  state.entities.set(1, player);
  state.entities.set(2, target);
  const body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 150, inertia: 300, radius: 14 };
  const input = { brake: false };
  const profile = { mainAccel: 100 };
  const flags = { controlsBlocked: false, tetherLive: false, autopilotActive: false };

  // Default-off: strictly gated, nothing stored on the entity.
  const off = flightV3._stepPursuitSlot(player, body, input, profile, DT, state, flags);
  assert.equal(off.active, false);
  assert.equal(off.impulse, null);
  assert.equal(off.telemetry.reason, 'assist-off');
  assert.equal(player._pursuitSlot, undefined, 'no slot state leaks while the setting is off');

  // On: the slot forms at the pilot's current bearing/range and the step answers with one
  // bounded impulse from thrust the hull has.
  state.settings.gameplay.pursuitSlotAssist = true;
  const on = flightV3._stepPursuitSlot(player, body, input, profile, DT, state, flags);
  assert.equal(on.active, true);
  assert.equal(on.telemetry.targetId, 2);
  assert.ok(Number.isFinite(on.impulse.x) && Number.isFinite(on.impulse.z));
  const accel = Math.hypot(on.impulse.x, on.impulse.z) / (150 * DT);
  assert.ok(accel <= profile.mainAccel * PURSUIT_SLOT_TUNING_V1.maxAccelerationFraction + 1e-9,
    'the assist never spends more than its thrust cap');
  assert.ok(player._pursuitSlot && player._pursuitSlot.targetId === 2,
    'the slot persists across ticks while the lock holds');

  // Manual flight owns the tick: rope, autopilot, blocked controls and held brake all refuse.
  for (const [key, value] of [['tetherLive', true], ['autopilotActive', true], ['controlsBlocked', true]]) {
    const overridden = flightV3._stepPursuitSlot(player, body, input, profile, DT, state, { ...flags, [key]: value });
    assert.equal(overridden.active, false, `${key} must override the assist`);
    assert.equal(overridden.telemetry.reason, 'manual-override');
  }
  const braking = flightV3._stepPursuitSlot(player, body, { brake: true }, profile, DT, state, flags);
  assert.equal(braking.active, false);
  assert.equal(braking.telemetry.reason, 'manual-override');

  // A stationary target is not a pursuit problem; a dead one loses the lock.
  const parked = flightV3._stepPursuitSlot(player, body, input, profile, DT, state,
    { ...flags, });
  assert.equal(parked.active, true, 'the moving locked target from above still holds');
  target.vel = { x: 0, z: 0 };
  const stationary = flightV3._stepPursuitSlot(player, body, input, profile, DT, state, flags);
  assert.equal(stationary.active, false);
  assert.equal(stationary.telemetry.reason, 'target-lost');
  assert.equal(player._pursuitSlot, undefined, 'the stale slot is dropped with the lock');
  target.vel = { x: -40, z: 20 };
  target.alive = false;
  const dead = flightV3._stepPursuitSlot(player, body, input, profile, DT, state, flags);
  assert.equal(dead.active, false);
  assert.equal(dead.telemetry.reason, 'target-lost');

  // A new lock forms a new slot for the new target.
  target.alive = true;
  const target3 = { id: 3, type: 'ship', alive: true, pos: { x: -180, z: 90 }, vel: { x: 30, z: -10 }, rot: 1 };
  state.player.targetId = 3;
  state.entities.set(3, target3);
  const switched = flightV3._stepPursuitSlot(player, body, input, profile, DT, state, flags);
  assert.equal(switched.active, true);
  assert.equal(switched.telemetry.targetId, 3);
  assert.equal(player._pursuitSlot.targetId, 3, 'the slot is recreated for the new lock');
});

// --------------------------------------------------------------------------------------------
// 2. The done-when scenario — real spawn chain, real kernel, scripted fleeing curve
// --------------------------------------------------------------------------------------------

const SEED = 4242;
const NPC_START = { x: 240, z: 0 };   // directly ahead of the player: the slot opens behind it
const NPC_SPEED = 65;                 // WU/s, faster than the starter needs to bother about
const NPC_TURN_RATE = 0.2;            // rad/s: a constant left curve it never stops flying

/** Deterministic fleeing curve. Pure function of the tick — the same path in both arms. */
function npcState(tick) {
  const t = tick * DT;
  const rot = NPC_TURN_RATE * t; // starts heading +X and curves left
  return {
    id: 2,
    type: 'ship',
    alive: true,
    rot,
    angVel: NPC_TURN_RATE, // the module's feed-forward must see the curve, as a real hull would
    vel: { x: NPC_SPEED * Math.cos(rot), z: NPC_SPEED * Math.sin(rot) },
    pos: {
      x: NPC_START.x + (NPC_SPEED / NPC_TURN_RATE) * Math.sin(rot),
      z: NPC_START.z + (NPC_SPEED / NPC_TURN_RATE) * (1 - Math.cos(rot)),
    },
  };
}

function wrapAngle(value) {
  let a = value % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** Desired slot point in world space for a slot held relative to the NPC's heading. */
function slotPoint(npc, slot) {
  const worldBearing = wrapAngle(npc.rot + slot.bearing);
  return {
    x: npc.pos.x + Math.cos(worldBearing) * slot.range,
    z: npc.pos.z + Math.sin(worldBearing) * slot.range,
  };
}

/**
 * The manual pursuit policy both arms fly: chase thrust + a proportional chase turn aimed at
 * the slot's desired position, easing off as the slot closes and attempting plain
 * station-keeping inside it. This is the "with it off" pilot — a competent hand that cannot
 * see relative velocity, which is exactly what the assist adds. The ON arm changes exactly
 * one thing: the assist's bounded impulse on top of the same policy.
 */
function manualPolicy(body, desired) {
  const dx = desired.x - body.pos.x;
  const dz = desired.z - body.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 24) {
    // Station-keeping attempt: hold the nose, keep a whisper of thrust. Without relative-
    // velocity feedback this cannot ride a curving slot — that is the measured gap.
    return { moveZ: 0.2, moveX: 0, turnIntent: 0, boost: false, brake: false };
  }
  const desiredBearing = Math.atan2(dz, dx);
  const error = wrapAngle(desiredBearing - body.rot);
  const throttle = dist > 120 ? 1 : Math.max(0.3, dist / 120);
  return {
    moveZ: throttle,
    moveX: 0,
    turnIntent: Math.max(-1, Math.min(1, 2.5 * error)),
    boost: false,
    brake: false,
  };
}

/**
 * Fly the 20 s chase through the real kernel. `assist` false is the OFF arm; true adds the
 * pursuit-slot assist exactly as flightV3 queues it (one bounded additive impulse per tick).
 */
function flyChase({ assist }) {
  const seedState = createGameState(SEED); // named seed; sim stays deterministic (no rng use)
  const entity = {
    ...makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0,
      factionId: 'faction_free',
      isPlayer: true,
      player: null,
      fittings: NEW_GAME.fittedModules || [],
      pos: { x: 0, z: 0 },
    }),
    id: 1,
    alive: true,
    vel: { x: 0, z: 0 },
    angVel: 0,
  };
  seedState.playerId = 1;
  seedState.player.targetId = 2;
  if (assist) seedState.settings.gameplay.pursuitSlotAssist = true;
  const profile = resolvePropulsionProfile(entity, seedState);
  const body = {
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: entity.mass, inertia: (entity.flightModel && entity.flightModel.inertia) || 40,
    radius: entity.radius || 14,
  };
  const npc0 = npcState(0);
  const slot = createPursuitSlot({ host: body, target: npc0, source: 'g' });
  assert.equal(slot.active, true, 'the scenario opens with a holdable slot');
  let runtime = createPropulsionRuntime(profile);
  let inSlotTicks = 0;
  let longestHoldTicks = 0;
  let currentHoldTicks = 0;
  let maxSpeed = 0;
  let assistTicks = 0;
  const accelCap = profile.mainAccel * PURSUIT_SLOT_TUNING_V1.maxAccelerationFraction;

  for (let tick = 0; tick < SCENARIO_TICKS; tick += 1) {
    const npc = npcState(tick);
    const desired = slotPoint(npc, slot);
    const input = manualPolicy(body, desired);
    const result = stepPropulsion({ dt: DT, body, input, profile, runtime, environment: {} });
    runtime = result.runtime;
    const ax = result.force.x / body.mass;
    const az = result.force.z / body.mass;
    let dvx = ax * DT;
    let dvz = az * DT;
    let assistAccel = 0;
    if (assist) {
      const step = stepPursuitSlotAssist({ dt: DT, host: body, target: npc, slot, profile });
      if (step.active && step.impulse) {
        assistTicks += 1;
        const ix = step.impulse.x / body.mass;
        const iz = step.impulse.z / body.mass;
        assistAccel = Math.hypot(ix, iz) / DT;
        dvx += ix;
        dvz += iz;
      }
      if (step.telemetry.withinTolerance) {
        inSlotTicks += 1;
        currentHoldTicks += 1;
        longestHoldTicks = Math.max(longestHoldTicks, currentHoldTicks);
      } else {
        currentHoldTicks = 0;
      }
    } else {
      const slotError = Math.hypot(desired.x - body.pos.x, desired.z - body.pos.z);
      const relVx = body.vel.x - npc.vel.x;
      const relVz = body.vel.z - npc.vel.z;
      if (slotError <= PURSUIT_SLOT_TUNING_V1.slotTolerance
        && Math.hypot(relVx, relVz) <= PURSUIT_SLOT_TUNING_V1.velocityTolerance) {
        inSlotTicks += 1;
        currentHoldTicks += 1;
        longestHoldTicks = Math.max(longestHoldTicks, currentHoldTicks);
      } else {
        currentHoldTicks = 0;
      }
    }
    // "Player speed never exceeds what thrust can produce": the tick's velocity change may
    // never exceed the hull's kernel acceleration plus the assist's thrust cap.
    const speedBefore = Math.hypot(body.vel.x, body.vel.z);
    body.vel.x += dvx;
    body.vel.z += dvz;
    const speedAfter = Math.hypot(body.vel.x, body.vel.z);
    assert.ok(
      speedAfter <= speedBefore + (Math.hypot(ax, az) + accelCap) * DT + 1e-6,
      `tick ${tick}: velocity jumped beyond applied thrust (${speedBefore} -> ${speedAfter})`,
    );
    maxSpeed = Math.max(maxSpeed, speedAfter);
    body.pos.x += body.vel.x * DT;
    body.pos.z += body.vel.z * DT;
    body.angVel += (result.torque.y / body.inertia) * DT;
    body.rot += body.angVel * DT;
  }
  return {
    inSlotSeconds: inSlotTicks * DT,
    longestHoldSeconds: longestHoldTicks * DT,
    assistTicks,
    maxSpeed,
    profile,
  };
}

test('FB-001 seed-4242 fleeing curve: assist-on holds the slot at least twice as long as assist-off', () => {
  const off = flyChase({ assist: false });
  const on = flyChase({ assist: true });

  assert.equal(off.assistTicks, 0);
  assert.equal(on.assistTicks, SCENARIO_TICKS, 'the assist answers every tick of the chase');
  assert.ok(
    on.inSlotSeconds >= 2 * off.inSlotSeconds,
    `time-in-slot on (${on.inSlotSeconds.toFixed(2)} s) must be at least double off ` +
    `(${off.inSlotSeconds.toFixed(2)} s)`,
  );
  assert.ok(on.inSlotSeconds > off.inSlotSeconds, 'the assist must actually help, not just tie');
  assert.ok(
    on.longestHoldSeconds > 5,
    `the assist must RIDE the curving slot, not flicker through it ` +
    `(longest hold ${on.longestHoldSeconds.toFixed(2)} s)`,
  );
  assert.ok(on.maxSpeed <= NPC_SPEED * 4,
    'sanity: the chase stays in gameplay speed space, not solver abuse');
});
