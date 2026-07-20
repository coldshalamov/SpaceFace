import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

let pursuitSlot = {};
try {
  pursuitSlot = await import('../src/core/flight/pursuitSlotAssist.js');
} catch {
  // The first TDD red intentionally observes that PQ-007 has no pursuit-slot contract yet.
}
import * as controlLab from '../scripts/lib/masslineControlLab.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  createAutoTargetRuntime,
  tickAutoTarget,
  toggleAutoTarget,
} from '../src/combat/autoTargetMode.js';

test('PQ-007 exposes one pure target-relative pursuit-slot contract', () => {
  assert.equal(typeof pursuitSlot.createPursuitSlot, 'function');
  assert.equal(typeof pursuitSlot.adjustPursuitSlot, 'function');
  assert.equal(typeof pursuitSlot.stepPursuitSlotAssist, 'function');
  assert.equal(typeof pursuitSlot.PURSUIT_SLOT_TUNING_V1, 'object');
});

test('selection captures the player position as a target-heading-relative bearing and range', () => {
  const slot = pursuitSlot.createPursuitSlot({
    host: { pos: { x: 100, z: 160 } },
    target: { id: 9, pos: { x: 100, z: -40 }, vel: { x: 12, z: 0 }, rot: 0 },
    source: 'mmb',
  });

  assert.equal(slot.active, true);
  assert.equal(slot.targetId, 9);
  assert.equal(slot.source, 'mmb');
  assert(Math.abs(slot.bearing - Math.PI / 2) < 1e-9);
  assert.equal(slot.range, 200);
});

test('relative trackpad deltas have a deadzone, shaped gain, bounds, and persistent hold', () => {
  const start = { active: true, targetId: 2, bearing: 0, range: 240, source: 'g' };
  const noise = pursuitSlot.adjustPursuitSlot(start, { movementX: 0.5, movementY: -0.5 });
  assert.deepEqual(noise, start, 'sub-deadzone pointer noise must not move the station');

  const small = pursuitSlot.adjustPursuitSlot(start, { movementX: 3, movementY: -3 });
  const large = pursuitSlot.adjustPursuitSlot(start, { movementX: 30, movementY: -30 });
  assert(small.bearing > 0 && small.range > start.range);
  assert(large.bearing - start.bearing > (small.bearing - start.bearing) * 10,
    'the gain curve must preserve granular nudges while giving decisive gestures more authority');

  const held = pursuitSlot.adjustPursuitSlot(large, { movementX: 0, movementY: 0 });
  assert.deepEqual(held, large, 'finger lift holds the selected slot without a timer or yaw command');

  let bounded = start;
  for (let i = 0; i < 100; i++) bounded = pursuitSlot.adjustPursuitSlot(bounded, { movementX: 900, movementY: -900 });
  assert(bounded.range <= pursuitSlot.PURSUIT_SLOT_TUNING_V1.maxRange);
  assert(bounded.bearing >= -Math.PI && bounded.bearing <= Math.PI);
});

test('the controller is translation/rotation invariant and clamps additive authority', () => {
  const tuning = pursuitSlot.PURSUIT_SLOT_TUNING_V1;
  const profile = { mainAccel: 80, strafeAccel: 44 };
  const base = pursuitSlot.stepPursuitSlotAssist({
    dt: 1 / 60,
    host: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 150 },
    target: { id: 2, pos: { x: 220, z: 40 }, vel: { x: 8, z: 3 }, rot: 0 },
    slot: { active: true, targetId: 2, bearing: 2.4, range: 180, source: 'g' },
    profile,
  });
  assert.equal(base.active, true);
  assert(Number.isFinite(base.impulse.x) && Number.isFinite(base.impulse.z));
  const accel = Math.hypot(base.impulse.x, base.impulse.z) / (150 / 60);
  assert(accel <= profile.mainAccel * tuning.maxAccelerationFraction + 1e-9);

  const angle = 0.73;
  const offset = { x: -340, z: 810 };
  const rotate = (p) => ({
    x: p.x * Math.cos(angle) - p.z * Math.sin(angle),
    z: p.x * Math.sin(angle) + p.z * Math.cos(angle),
  });
  const translate = (p) => ({ x: p.x + offset.x, z: p.z + offset.z });
  const rotated = pursuitSlot.stepPursuitSlotAssist({
    dt: 1 / 60,
    host: { pos: translate(rotate({ x: 0, z: 0 })), vel: rotate({ x: 0, z: 0 }), mass: 150 },
    target: { id: 2, pos: translate(rotate({ x: 220, z: 40 })), vel: rotate({ x: 8, z: 3 }), rot: angle },
    slot: { active: true, targetId: 2, bearing: 2.4, range: 180, source: 'g' },
    profile,
  });
  const expected = rotate(base.impulse);
  assert(Math.abs(rotated.impulse.x - expected.x) < 1e-9);
  assert(Math.abs(rotated.impulse.z - expected.z) < 1e-9);
});

test('target-frame angular velocity feeds the moving slot without creating false damping', () => {
  const target = {
    id: 2,
    pos: { x: 0, z: 0 },
    vel: { x: 8, z: 3 },
    rot: 0,
    angVel: 0.2,
  };
  const slot = { active: true, targetId: 2, bearing: Math.PI / 2, range: 200, source: 'g' };
  const host = {
    pos: { x: 0, z: 200 },
    // A port-side point rotating counter-clockwise at 0.2 rad/s moves -X at 40 wu/s.
    vel: { x: target.vel.x - 40, z: target.vel.z },
    mass: 100,
  };
  const step = pursuitSlot.stepPursuitSlotAssist({
    dt: 1 / 60,
    host,
    target,
    slot,
    profile: { mainAccel: 80, strafeAccel: 40 },
  });
  assert.equal(step.active, true);
  assert(Math.hypot(step.impulse.x, step.impulse.z) < 1e-9,
    'a body already riding the rotating station must receive no corrective impulse');
  assert.equal(step.telemetry.relativeSpeed, 0);
  assert.deepEqual(step.telemetry.desiredVelocity, { x: -32, z: 3 });
});

test('manual override and unsafe inputs fail closed with no residual command', () => {
  const common = {
    dt: 1 / 60,
    host: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 100 },
    target: { id: 2, pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 },
    slot: { active: true, targetId: 2, bearing: Math.PI, range: 120, source: 'mmb' },
    profile: { mainAccel: 80, strafeAccel: 40 },
  };
  const manual = pursuitSlot.stepPursuitSlotAssist({ ...common, manualOverride: true });
  assert.equal(manual.active, false);
  assert.equal(manual.impulse, null);
  assert.equal(manual.telemetry.reason, 'manual-override');

  const lost = pursuitSlot.stepPursuitSlotAssist({ ...common, target: null });
  assert.equal(lost.active, false);
  assert.equal(lost.impulse, null);
  assert.equal(lost.telemetry.reason, 'target-lost');

  const unsafe = pursuitSlot.stepPursuitSlotAssist({
    ...common,
    host: { ...common.host, vel: { x: Number.NaN, z: 0 } },
  });
  assert.equal(unsafe.active, false);
  assert.equal(unsafe.impulse, null);
  assert.equal(unsafe.telemetry.reason, 'invalid-body');
});

test('the PQ-002 lab pins a deterministic weaving-target kill-criterion matrix', () => {
  assert.equal(typeof controlLab.pursuitSlotAcceptanceMatrix, 'function');
  const first = controlLab.pursuitSlotAcceptanceMatrix();
  const second = controlLab.pursuitSlotAcceptanceMatrix();
  assert.equal(first.schema, 'spaceface.masslineControlLab.pursuitSlotMatrix.v1');
  assert.equal(first.digest, second.digest, 'the same gain/environment matrix must be byte-stable');
  assert.match(first.digest, /^[0-9a-f]{64}$/);
  assert(first.rows.length >= 4, 'the named gains must be compared rather than guessed once');

  const selected = first.rows.find((row) => row.selected);
  assert(selected, 'the production tuning cell must be identified explicitly');
  assert.equal(selected.pass, true);
  assert(selected.metrics.settleTimeS <= 2.5);
  assert(selected.metrics.holdWithinToleranceS >= 10);
  assert.equal(selected.metrics.spinCount, 0);
  assert.equal(selected.metrics.overshootCount, 0);
  assert.equal(selected.metrics.manualOverrideTicks, 1);
});

test('G selects the locked target slot without pointer capture, target acquisition, or weapon aim writes', () => {
  const state = createGameState(0x507007);
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  const target = { id: 2, type: 'ship', alive: true, pos: { x: 220, z: 0 }, vel: { x: 10, z: 0 }, rot: 0 };
  state.playerId = player.id;
  state.player.targetId = target.id;
  state.entities.set(player.id, player);
  state.entities.set(target.id, target);
  state.entityList.push(player, target);
  state.mode = 'flight';
  state.input.aimAngle = 0.73;
  state.input.aimWorld = { x: 42, z: -19 };
  const beforeAim = { angle: state.input.aimAngle, world: { ...state.input.aimWorld } };
  const bus = createBus();
  let acquisitionRequests = 0;
  bus.on('ui:targetNearestHostileToPlayer', () => acquisitionRequests++);

  const enabled = toggleAutoTarget(state, bus, createAutoTargetRuntime());
  assert.equal(enabled, true);
  assert.equal(state.input.pursuitSlot.active, true);
  assert.equal(state.input.pursuitSlot.targetId, target.id);
  assert.equal(state.input.autoFire, false, 'the retired G auto-fire/auto-aim flag must remain inert');
  tickAutoTarget(state, 1 / 60, bus, createAutoTargetRuntime());
  assert.deepEqual({ angle: state.input.aimAngle, world: state.input.aimWorld }, beforeAim,
    'pursuit stations the ship but never rewrites the independent weapon cursor');
  assert.equal(acquisitionRequests, 0, 'the player-selected lock must not be replaced silently');

  target.alive = false;
  tickAutoTarget(state, 1 / 60, bus, createAutoTargetRuntime());
  assert.equal(state.input.pursuitSlot.active, false);
  assert.equal(state.input.pursuitSlot.reason, 'target-lost');
});

test('the shipped route retires world-path following and exposes bounded slot telemetry plus a non-color HUD cue', () => {
  const inputSource = readFileSync(new URL('../src/systems/input.js', import.meta.url), 'utf8');
  const flightSource = readFileSync(new URL('../src/systems/flightV3.js', import.meta.url), 'utf8');
  const weaponsSource = readFileSync(new URL('../src/systems/weapons.js', import.meta.url), 'utf8');
  const assistSource = readFileSync(new URL('../src/systems/autoTargetAssist.js', import.meta.url), 'utf8');
  const modeSource = readFileSync(new URL('../src/combat/autoTargetMode.js', import.meta.url), 'utf8');
  const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const uiRootSource = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

  assert.match(inputSource, /adjustPursuitSlot/);
  assert.match(inputSource, /const duplicatePursuitPointerDelta = e\.type === 'mousemove'/,
    'either pointer event family may adjust the slot, but paired compatibility events must dedupe');
  assert.match(inputSource, /if \(!duplicatePursuitPointerDelta && inp && inp\.pursuitSlot/,
    'compatibility mousemove must not apply the same physical pointer delta a second time');
  assert.match(inputSource, /if \(pursuitPressed && !manualPursuitOverride\)/,
    'MMB must not re-arm the assist in the same tick that pilot movement releases it');
  assert.match(inputSource, /active:\s*false, reason, releasedTick:\s*state\.tick/,
    'manual override must publish its exact release tick for route evidence');
  assert.match(inputSource, /addEventListener\('blur'[\s\S]*focus-lost[\s\S]*releasedTick/,
    'window focus loss must fail closed instead of leaving an unattended slot active');
  assert.doesNotMatch(inputSource, /recordAutoTargetPath|updateAutoTargetPathDrawing/);
  assert.match(flightSource, /stepPursuitSlotAssist/);
  assert.match(flightSource, /queuePhysicsImpulse\(entity, pursuitSlot\.impulse\)/);
  assert.doesNotMatch(flightSource, /pursuitFollowPoint|AUTOPURSUIT_FOLLOW_DIST/);
  assert.doesNotMatch(assistSource, /requestPointerLock|exitPointerLock|pointerlockchange/);
  assert.doesNotMatch(modeSource, /inp\.aimAngle\s*=|inp\.aimWorld\.[xz]\s*=|followAutoTargetPath/);
  assert.doesNotMatch(weaponsSource, /if \(state\.input\.autoFire\)|_autoFireTarget|_selectedAutoFireTarget/,
    'the retired persistent locked-target weapon aim must not survive as a hidden runtime fallback');
  assert.match(mainSource, /pursuitSlot[\s\S]*active:\s*false[\s\S]*runtime-reset/,
    'new/load transitions must not carry a transient pursuit station into the next run');
  assert.doesNotMatch(uiRootSource, /auto-target-flight-path|sf-flight-path__route/);
  assert.match(hudSource, /sf-pursuit-slot/);
  assert.match(hudSource, /PURSUIT ASSIST|Pursuit assist/);
  assert.match(hudSource, /prefers-reduced-motion|transition:\s*none/);
  assert.match(hudSource, /forced-colors:\s*active/);
});
