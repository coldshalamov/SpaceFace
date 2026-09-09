// Prompt 01 acceptance check for the masslineTelemetry system.
// Uses a small mock state and instantiates the system directly — no Rapier, no full harness.
import assert from 'node:assert/strict';

import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';

const DT = 1 / 60;

await assertNoActiveTetherReportsInactive();
await assertActiveTetherKinematicsMatchSpec();
await assertChangingTargetIdResetsLatchAccumulators();
await assertMissingTargetDoesNotThrow();
await assertNeverMutatesEntitiesOrTether();

console.log('Massline telemetry checks OK');

// 1. No active tether produces active:false.
async function assertNoActiveTetherReportsInactive() {
  const system = freshSystem();
  const state = mockState({ player: makePlayer({ pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }) });

  system.update(DT, state);

  const t = state.player.masslineTelemetry;
  assert.equal(t.active, false, 'no active tether should report active:false');
  assert.equal(t.targetId, null, 'inactive telemetry should not carry a targetId');
  assert.equal(t.latchTick, null, 'inactive telemetry should not carry a latchTick');
}

// 2. Active tether with player at (0,0), target at (100,0), player velocity (0,50), target velocity (0,0)
//    produces: distance ~100, radialSpeed ~0, |tangentialSpeed| ~50, angularSpeed ~0.5
async function assertActiveTetherKinematicsMatchSpec() {
  const system = freshSystem();
  const player = makePlayer({ pos: { x: 0, z: 0 }, vel: { x: 0, z: 50 } });
  const target = makeEntity({ pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 } });
  const state = mockState({ player, target, targetId: target.id });
  state.player.tether = activeTether({ targetId: target.id, strain: 0.3, restLength: 100, phase: 'loaded' });

  system.update(DT, state);

  const t = state.player.masslineTelemetry;
  assert.equal(t.active, true, 'active tether should report active:true');
  assert.equal(t.targetId, target.id, 'telemetry should echo the tether targetId');
  assert.ok(Math.abs(t.distance - 100) < 1e-6, `distance should be ~100; got ${t.distance}`);
  assert.ok(Math.abs(t.radialSpeed) < 1e-6, `radialSpeed should be ~0; got ${t.radialSpeed}`);
  assert.ok(Math.abs(Math.abs(t.tangentialSpeed) - 50) < 1e-6,
    `|tangentialSpeed| should be ~50; got ${t.tangentialSpeed}`);
  assert.ok(Math.abs(t.angularSpeed - 0.5) < 1e-6, `angularSpeed should be ~0.5; got ${t.angularSpeed}`);
  assert.ok(Math.abs(t.playerSpeed - 50) < 1e-6, `playerSpeed should be ~50; got ${t.playerSpeed}`);
  assert.equal(t.targetSpeed, 0, `targetSpeed should be 0; got ${t.targetSpeed}`);
  assert.equal(t.phase, 'loaded', 'telemetry should mirror the tether phase');
  // Per-latch maxima should pick up the current frame on the first update for this latch.
  assert.ok(Math.abs(t.maxTangentialSpeedSinceLatch - 50) < 1e-6,
    `maxTangentialSpeedSinceLatch should track |tangentialSpeed|; got ${t.maxTangentialSpeedSinceLatch}`);
  assert.ok(Math.abs(t.maxAngularSpeedSinceLatch - 0.5) < 1e-6,
    `maxAngularSpeedSinceLatch should track angularSpeed; got ${t.maxAngularSpeedSinceLatch}`);
  assert.equal(t.latchTick, state.tick, 'first observation of a latch should stamp latchTick');
}

// 3. Changing targetId resets max values and latchTick.
async function assertChangingTargetIdResetsLatchAccumulators() {
  const system = freshSystem();
  // Player at origin; target A straight up the Z axis. Player velocity along +X is perpendicular
  // to the player->A line, so it shows up as tangential speed.
  const targetA = makeEntity({ pos: { x: 0, z: 100 }, vel: { x: 0, z: 0 } });
  const targetB = makeEntity({ pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 } });
  const player = makePlayer({ pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 } });

  // Build up maxima against target A over a couple of ticks.
  const state = mockState({ player, target: targetA, targetId: targetA.id });
  state.player.tether = activeTether({ targetId: targetA.id, strain: 0.5, restLength: 100, phase: 'loaded' });
  system.update(DT, state);
  const latchTickA = state.tick;
  // Bump the tick so a later latch reset would land on a different latchTick.
  state.tick += 17;
  system.update(DT, state);

  const beforeA = snapshot(state.player.masslineTelemetry);
  assert.ok(beforeA.maxTangentialSpeedSinceLatch > 0, 'target A should have produced tangential maxima');
  assert.equal(beforeA.latchTick, latchTickA, 'target A latch should stamp the original tick');
  assert.ok(beforeA.maxStrainSinceLatch >= 0.5, 'per-latch strain max should track observed strain');

  // Switch to target B: latch reset must zero the maxima and re-stamp latchTick.
  // For target B at (80,0) the player's +X velocity is now along the line (radial), so the
  // re-seeded tangential max comes out ~0 — the key check is the latchTick re-stamp + strain reset.
  state.entities.set(targetB.id, targetB);
  state.player.tether = activeTether({ targetId: targetB.id, strain: 0.1, restLength: 80, phase: 'capture' });
  system.update(DT, state);

  const afterB = state.player.masslineTelemetry;
  assert.equal(afterB.targetId, targetB.id, 'telemetry should switch to target B');
  assert.equal(afterB.latchTick, state.tick, 'latch reset should re-stamp latchTick to the current tick');
  assert.equal(afterB.maxStrainSinceLatch, 0.1,
    'latch reset should zero strain max and re-seed with the current frame');
  assert.equal(afterB.phase, 'capture', 'phase should follow the new tether');
  assert.equal(afterB.previousPhase, 'loaded', 'previousPhase should carry the prior phase across the latch switch');
}

// 4. Missing target does not throw and produces active:false.
async function assertMissingTargetDoesNotThrow() {
  const system = freshSystem();
  const player = makePlayer({ pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const state = mockState({ player, target: null, targetId: 99999 });
  state.player.tether = activeTether({ targetId: 99999, strain: 0.2, restLength: 50, phase: 'loaded' });

  // No entity registered under id 99999 — system must not throw.
  assert.doesNotThrow(() => system.update(DT, state));

  const t = state.player.masslineTelemetry;
  assert.equal(t.active, false, 'missing target should report active:false');
  assert.equal(t.targetId, null, 'missing target should not retain targetId kinematics');
}

// Extra invariant: the system is strictly read-only — it must not mutate entity pos/vel or tether.
async function assertNeverMutatesEntitiesOrTether() {
  const system = freshSystem();
  const player = makePlayer({ pos: { x: 0, z: 0 }, vel: { x: 0, z: 40 } });
  const target = makeEntity({ pos: { x: 120, z: 0 }, vel: { x: 5, z: 0 } });
  const state = mockState({ player, target, targetId: target.id });
  state.player.tether = activeTether({ targetId: target.id, strain: 0.4, restLength: 120, phase: 'loaded' });

  const before = snapshotEntitiesAndTether(state);
  system.update(DT, state);
  const after = snapshotEntitiesAndTether(state);

  assert.deepEqual(after, before, 'masslineTelemetry.update must not mutate entities or the tether subtree');
}

// ---- mock harness ----

function freshSystem() {
  // Systems store per-instance state; Object.create gives us a clean copy each test.
  const sys = Object.create(masslineTelemetry);
  sys.init({ state: { tick: 0 } });
  return sys;
}

function mockState({ player, target, targetId }) {
  const entities = new Map();
  entities.set(player.id, player);
  if (target) entities.set(target.id, target);
  return {
    tick: 0,
    simTime: 0,
    playerId: player.id,
    entities,
    player: {
      tether: targetId != null ? activeTether({ targetId }) : { active: false, targetId: null },
    },
  };
}

function activeTether({ targetId, strain = 0, restLength = 0, phase = 'slack' }) {
  return { active: true, targetId, strain, restLength, phase };
}

function makePlayer({ pos, vel }) {
  return { id: 1, type: 'ship', alive: true, pos: { ...pos }, vel: { ...vel }, maxSpeed: 120 };
}

function makeEntity({ pos, vel }) {
  return { id: Math.floor(Math.random() * 1e6) + 100, type: 'asteroid', alive: true, pos: { ...pos }, vel: { ...vel } };
}

function snapshot(t) {
  return {
    targetId: t.targetId,
    latchTick: t.latchTick,
    maxStrainSinceLatch: t.maxStrainSinceLatch,
    maxTangentialSpeedSinceLatch: t.maxTangentialSpeedSinceLatch,
    maxAngularSpeedSinceLatch: t.maxAngularSpeedSinceLatch,
    phase: t.phase,
  };
}

function snapshotEntitiesAndTether(state) {
  const out = { entities: [], tether: JSON.parse(JSON.stringify(state.player.tether)) };
  for (const entity of state.entities.values()) {
    out.entities.push({
      id: entity.id,
      pos: { x: entity.pos.x, z: entity.pos.z },
      vel: { x: entity.vel.x, z: entity.vel.z },
    });
  }
  out.entities.sort((a, b) => a.id - b.id);
  return out;
}
