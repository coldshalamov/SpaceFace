import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROPULSION_PROFILES,
  resolvePropulsionProfile,
} from '../src/core/flight/propulsionCatalog.js';
import { applyFeelEnvelope } from '../src/data/flightFeelEnvelopes.js';
import {
  VECTORING_SLIP_LEAD_RAD,
  createPropulsionRuntime,
  stepPropulsion,
} from '../src/core/flight/propulsionKernel.js';
import { wrapAngle } from '../src/core/rng.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
import { writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import {
  bootPlayer,
  settle,
  planarSpeed,
} from '../scripts/lib/bench/scenarios/feel.screen_crossing.mjs';

const DT = 1 / 60;
const TICKS_1_5S = 90;
const TICKS_TOTAL = 120;
const LEAD_BOUND = VECTORING_SLIP_LEAD_RAD + 0.10;

function kestrelProfile() {
  const base = resolvePropulsionProfile({ isPlayer: true, driveId: 'drive_reaction_m' }, null);
  return applyFeelEnvelope(base, 'ship_kestrel');
}

function body(overrides = {}) {
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 18,
    inertia: 90,
    radius: 14,
    ...overrides,
  };
}

function pathHeading(b) { return Math.atan2(b.vel.z, b.vel.x); }
function speedOf(b) { return Math.hypot(b.vel.x, b.vel.z); }
function slipOf(b) { return wrapAngle(b.rot - pathHeading(b)); }

function advance(b, result) {
  const ax = result.force.x / b.mass;
  const az = result.force.z / b.mass;
  const bx = b.vel.x;
  const bz = b.vel.z;
  let vx = bx + ax * DT;
  let vz = bz + az * DT;
  const cap = result.maxSpeed;
  const speed = Math.hypot(vx, vz);
  if (Number.isFinite(cap) && speed > cap && speed > 1e-12) {
    const base = Math.hypot(bx, bz);
    if (base >= cap && base > 1e-12) {
      const ux = bx / base;
      const uz = bz / base;
      const along = ax * DT * ux + az * DT * uz;
      if (along > 0) { vx -= along * ux; vz -= along * uz; }
    } else {
      const scale = cap / speed;
      vx *= scale;
      vz *= scale;
    }
  }
  b.vel.x = vx;
  b.vel.z = vz;
  b.pos.x += vx * DT;
  b.pos.z += vz * DT;
  b.angVel += result.torque.y / b.inertia * DT;
  b.rot += b.angVel * DT;
}

function runLeadRecovery(profile, b, inputFn, ticks = TICKS_TOTAL, tick0 = 0) {
  let runtime = createPropulsionRuntime(profile);
  let recoveredTick = -1;
  let maxStepRot = 0;
  let minSpeed = Infinity;
  let prevRot = b.rot;
  const slips = [];
  for (let i = 0; i < ticks; i++) {
    const input = inputFn(i, b);
    const result = stepPropulsion({
      dt: DT,
      body: b,
      input: { assistMode: 'assisted', ...input },
      profile,
      runtime,
    });
    runtime = result.runtime;
    advance(b, result);
    const dRot = Math.abs(wrapAngle(b.rot - prevRot));
    if (dRot > maxStepRot) maxStepRot = dRot;
    prevRot = b.rot;
    const slip = Math.abs(slipOf(b));
    slips.push(slip);
    const speed = speedOf(b);
    if (speed < minSpeed) minSpeed = speed;
    if (recoveredTick < 0 && i >= 6 && slip <= LEAD_BOUND) recoveredTick = i;
  }
  const tailMax = Math.max(...slips.slice(TICKS_1_5S));
  return { recoveredTick, tailMax, maxStepRot, minSpeed, lastSlip: slips[slips.length - 1] };
}

function assertRecovery(run, profile, label) {
  const maxStep = profile.maxYawRate * DT * 1.5 + 1e-3;
  assert.ok(run.recoveredTick >= 0 && run.recoveredTick <= TICKS_1_5S,
    `${label}: excessive lead recovered inside 1.5 s (tick ${run.recoveredTick})`);
  assert.ok(run.tailMax <= LEAD_BOUND,
    `${label}: lead stays bounded past 2 s (tail max ${(run.tailMax * 180 / Math.PI).toFixed(1)} deg)`);
  assert.ok(run.maxStepRot <= maxStep,
    `${label}: no discontinuous heading snap (max per-step ${(run.maxStepRot * 180 / Math.PI).toFixed(2)} deg, bound ${(maxStep * 180 / Math.PI).toFixed(2)} deg)`);
  assert.ok(run.minSpeed > profile.combatSpeed * 0.4,
    `${label}: speed stays meaningful (min ${run.minSpeed.toFixed(1)} of cruise ${profile.combatSpeed.toFixed(1)})`);
}

function excessiveLeadBody(profile, sign, courseRad = 0) {
  const speed = profile.combatSpeed * 0.98;
  const vx = Math.cos(courseRad) * speed;
  const vz = Math.sin(courseRad) * speed;
  return body({ vel: { x: vx, z: vz }, rot: courseRad + sign * 0.85, angVel: sign * 0.9 });
}

test('excessive post-contact lead corrects back inside the allowance while turn and thrust hold', () => {
  const profile = kestrelProfile();
  for (const sign of [1, -1]) {
    const b = excessiveLeadBody(profile, sign);
    const run = runLeadRecovery(profile, b, () => ({
      throttle: 1, turn: sign, velocityVectoring: true,
    }));
    assertRecovery(run, profile, `turn ${sign > 0 ? '+' : '-'} slip ${sign > 0 ? '+' : '-'}0.85`);
  }
});

test('lead correction survives the angle wrap at +/-PI', () => {
  const profile = kestrelProfile();
  const nearPi = Math.PI - 0.02;
  for (const sign of [1, -1]) {
    const b = excessiveLeadBody(profile, sign, nearPi);
    const run = runLeadRecovery(profile, b, () => ({
      throttle: 1, turn: sign, velocityVectoring: true,
    }));
    assertRecovery(run, profile, `wrapped course, turn ${sign}`);
  }
});

test('a glancing velocity redirect under a held turn also recovers', () => {
  const profile = kestrelProfile();
  const speed = profile.combatSpeed * 0.95;
  const b = body({ vel: { x: speed, z: 0 }, rot: 0, angVel: 0.9 });
  const strike = 0.6;
  const c = Math.cos(strike);
  const s = Math.sin(strike);
  const vx = c * b.vel.x - s * b.vel.z;
  const vz = s * b.vel.x + c * b.vel.z;
  b.vel.x = vx;
  b.vel.z = vz;
  const run = runLeadRecovery(profile, b, () => ({ throttle: 1, turn: 1, velocityVectoring: true }));
  assertRecovery(run, profile, 'post-contact course redirect');
});

test('boosted reversal then release: holding turn and thrust settles onto the new path', () => {
  const profile = kestrelProfile();
  const speed = profile.combatSpeed * 0.9;
  const b = body({ vel: { x: -speed, z: 0 }, rot: 0.4, angVel: 0 });
  let runtime = createPropulsionRuntime(profile);
  for (let i = 0; i < 40; i++) {
    const result = stepPropulsion({
      dt: DT, body: b,
      input: { assistMode: 'assisted', throttle: 1, turn: 1, boost: true, velocityVectoring: true },
      profile, runtime,
    });
    runtime = result.runtime;
    advance(b, result);
  }
  const run = runLeadRecovery(profile, b, () => ({ throttle: 1, turn: 1, velocityVectoring: true }));
  const releaseSpeed = speedOf(b);
  assert.ok(releaseSpeed > profile.combatSpeed * 0.4, `post-release speed ${releaseSpeed.toFixed(1)}`);
  assert.ok(run.maxStepRot <= profile.maxYawRate * DT * 1.5 + 1e-3,
    `no heading snap across the boost release (max ${(run.maxStepRot * 180 / Math.PI).toFixed(2)} deg/step)`);
  assert.ok(run.tailMax <= LEAD_BOUND || run.lastSlip <= LEAD_BOUND,
    `bounded lead after release (tail ${(run.tailMax * 180 / Math.PI).toFixed(1)} deg)`);
});

test('a rapid turn-sign swap stays continuous and re-bounds the lead', () => {
  const profile = kestrelProfile();
  const speed = profile.combatSpeed * 0.9;
  const b = body({ vel: { x: speed, z: 0 }, rot: 0, angVel: 0 });
  const turns = [1, -1, 1];
  let runtime = createPropulsionRuntime(profile);
  let prevRot = b.rot;
  let maxStepRot = 0;
  let finalSlip = Infinity;
  for (let leg = 0; leg < turns.length; leg++) {
    for (let i = 0; i < 40; i++) {
      const result = stepPropulsion({
        dt: DT, body: b,
        input: { assistMode: 'assisted', throttle: 1, turn: turns[leg], velocityVectoring: true },
        profile, runtime,
      });
      runtime = result.runtime;
      advance(b, result);
      const dRot = Math.abs(wrapAngle(b.rot - prevRot));
      if (dRot > maxStepRot) maxStepRot = dRot;
      prevRot = b.rot;
      finalSlip = Math.abs(slipOf(b));
    }
  }
  assert.ok(maxStepRot <= profile.maxYawRate * DT * 1.5 + 1e-3,
    `no snap across the sign swap (max ${(maxStepRot * 180 / Math.PI).toFixed(2)} deg/step)`);
  assert.ok(finalSlip <= LEAD_BOUND,
    `lead re-bounds after the swap (${(finalSlip * 180 / Math.PI).toFixed(1)} deg)`);
});

test('W + strafe + turn applies the same excess-lead correction', () => {
  const profile = kestrelProfile();
  const b = excessiveLeadBody(profile, 1);
  const run = runLeadRecovery(profile, b, () => ({
    throttle: 1, strafe: 0.6, turn: 1, velocityVectoring: true,
  }));
  assert.ok(run.maxStepRot <= profile.maxYawRate * DT * 1.5 + 1e-3, 'continuous heading');
  assert.ok(run.recoveredTick >= 0 && run.recoveredTick <= TICKS_1_5S,
    `strafe-assisted excessive lead recovers (tick ${run.recoveredTick})`);
});

test('drift and newtonian keep inertial sideways flight: no lead correction', () => {
  const profile = kestrelProfile();
  const speed = profile.combatSpeed * 0.9;
  for (const mode of ['drift', 'newtonian']) {
    const b = body({ vel: { x: speed, z: 0 }, rot: 0.85, angVel: 0.9 });
    const result = stepPropulsion({
      dt: DT, body: b,
      input: { assistMode: mode, throttle: 1, turn: 1, velocityVectoring: true },
      profile, runtime: createPropulsionRuntime(profile),
    });
    const expected = profile.maxYawRate;
    assert.ok(Math.abs(Math.abs(result.telemetry.targetYawRate) - expected) < 1e-6,
      `${mode}: full yaw authority is never lead-bounded (got ${result.telemetry.targetYawRate})`);
  }
});

test('REAL PATH: a contact-scale velocity redirect on the Kestrel recovers within 1.5 s and stays welded', async () => {
  const host = await bootPlayer(4242, 'ship_kestrel');
  try {
    host.state.settings.gameplay.velocityVectoring = true;
    settle(host);
    host.step(300, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const player = host.player;
    const cruiseSpeed = planarSpeed(player);
    assert.ok(cruiseSpeed > 5, 'fixture reached cruise');

    const theta = 0.85;
    const mass = Number.isFinite(player.mass) && player.mass > 0 ? player.mass : 1;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const vx = player.vel.x;
    const vz = player.vel.z;
    queuePhysicsImpulse(player, {
      x: ((c * vx - s * vz) - vx) * mass,
      y: 0,
      z: ((s * vx + c * vz) - vz) * mass,
    });
    queuePhysicsTorqueImpulse(player, { x: 0, y: -1.2 * (Number.isFinite(player.inertia) ? player.inertia : 90), z: 0 });
    host.step(1, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: -1 }); } });
    const slip0 = Math.abs(wrapAngle((player.rot || 0) - Math.atan2(player.vel.z, player.vel.x)));
    assert.ok(slip0 > VECTORING_SLIP_LEAD_RAD + 0.05,
      `fixture produced an excessive lead (${(slip0 * 180 / Math.PI).toFixed(1)} deg)`);

    let recoveredTick = -1;
    let tailMax = 0;
    let minSpeed = Infinity;
    const weld = trackRotWeld();
    host.step(TICKS_TOTAL, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: -1 }); },
      after: ({ host: h, index }) => {
        const p = h.player;
        sampleRotWeld(weld, p);
        const heading = Math.atan2(p.vel.z, p.vel.x);
        const slip = Math.abs(wrapAngle((p.rot || 0) - heading));
        if (index >= TICKS_1_5S && slip > tailMax) tailMax = slip;
        const speed = planarSpeed(p);
        if (speed < minSpeed) minSpeed = speed;
        if (recoveredTick < 0 && index >= 6 && slip <= LEAD_BOUND) recoveredTick = index;
      },
    });
    assert.ok(recoveredTick >= 0 && recoveredTick <= TICKS_1_5S,
      `real path: lead recovered inside 1.5 s (tick ${recoveredTick})`);
    assert.ok(tailMax <= LEAD_BOUND,
      `real path: lead stays bounded past 1.5 s (tail max ${(tailMax * 180 / Math.PI).toFixed(1)} deg)`);
    assert.ok(weld.maxRatio <= 1.05,
      `real path: heading rides yawRate*dt, never teleports (max ratio ${weld.maxRatio.toFixed(3)})`);
    assert.ok(minSpeed > cruiseSpeed * 0.4,
      `real path: speed stays meaningful (min ${minSpeed.toFixed(1)} of cruise ${cruiseSpeed.toFixed(1)})`);
  } finally {
    host.dispose();
  }
});

function collectPlayerImpacts(host) {
  const hits = [];
  host.bus.on('physics:impact', (p) => {
    if (p && (p.aId === host.state.playerId || p.bId === host.state.playerId)) hits.push(p);
  });
  return hits;
}

function trackRotWeld() {
  return { prevRot: null, prevAngVel: 0, maxRatio: 0 };
}

function sampleRotWeld(weld, p) {
  const rot = p.rot || 0;
  if (weld.prevRot != null) {
    const dRot = Math.abs(wrapAngle(rot - weld.prevRot));
    const yawRate = Math.abs(p.angVel || 0);
    const bound = Math.max(yawRate, weld.prevAngVel) * DT;
    const ratio = bound > 1e-4 ? dRot / bound : (dRot > 1e-3 ? Infinity : 1);
    if (ratio > weld.maxRatio) weld.maxRatio = ratio;
  }
  weld.prevRot = rot;
  weld.prevAngVel = Math.abs(p.angVel || 0);
}

test('REAL PATH: a plain assisted turn from cruise never invents or stalls the lead', async () => {
  const host = await bootPlayer(4242, 'ship_kestrel');
  try {
    host.state.settings.gameplay.velocityVectoring = true;
    settle(host);
    host.step(300, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const player = host.player;
    const cruiseSpeed = planarSpeed(player);
    assert.ok(cruiseSpeed > 5, 'fixture reached cruise');
    const startRot = player.rot || 0;
    const weld = trackRotWeld();
    let tailMax = 0;
    let minSpeed = Infinity;
    host.step(TICKS_TOTAL, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1 }); },
      after: ({ host: h, index }) => {
        const p = h.player;
        sampleRotWeld(weld, p);
        const speed = planarSpeed(p);
        if (speed < minSpeed) minSpeed = speed;
        if (index >= 30) {
          const slip = Math.abs(wrapAngle((p.rot || 0) - Math.atan2(p.vel.z, p.vel.x)));
          if (slip > tailMax) tailMax = slip;
        }
      },
    });
    const turned = Math.abs(wrapAngle((player.rot || 0) - startRot));
    assert.ok(turned > 0.5, `a held turn must actually carve (rotated ${(turned * 180 / Math.PI).toFixed(1)} deg)`);
    assert.ok(tailMax <= LEAD_BOUND,
      `plain turn rides the authored lead, never the excessive one (tail ${(tailMax * 180 / Math.PI).toFixed(1)} deg)`);
    assert.ok(weld.maxRatio <= 1.05,
      `plain turn heading rides yawRate*dt (max ratio ${weld.maxRatio.toFixed(3)})`);
    assert.ok(minSpeed > cruiseSpeed * 0.4,
      `plain turn keeps speed (min ${minSpeed.toFixed(1)} of cruise ${cruiseSpeed.toFixed(1)})`);
  } finally {
    host.dispose();
  }
});

test('REAL PATH: a real glancing rock contact recovers while turn and thrust hold', async () => {
  const host = await bootPlayer(4242, 'ship_kestrel');
  try {
    host.state.settings.gameplay.velocityVectoring = true;
    settle(host);
    host.step(300, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const player = host.player;
    const cruiseSpeed = planarSpeed(player);
    assert.ok(cruiseSpeed > 5, 'fixture reached cruise');
    const hits = collectPlayerImpacts(host);
    const heading = Math.atan2(player.vel.z, player.vel.x);
    const hx = Math.cos(heading);
    const hz = Math.sin(heading);
    const rock = host.spawnObstacle({
      pos: { x: player.pos.x + hx * 95 - -hz * 26, z: player.pos.z + hz * 95 - hx * 26 },
      radius: 22,
      mass: 480,
    });
    host.step(30, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    assert.ok(rock, 'glancing-rock fixture spawned');
    const RUN_TICKS = 360;
    let hitIndex = -1;
    let heldTurn = null;
    let recoveredTick = -1;
    let tailMax = 0;
    let minSpeed = Infinity;
    let maxSlip = 0;
    const weld = trackRotWeld();
    host.step(RUN_TICKS, {
      before: ({ state }) => {
        if (hitIndex >= 0 && heldTurn === null) {
          const slip = wrapAngle((player.rot || 0) - Math.atan2(player.vel.z || 0, player.vel.x || 0));
          heldTurn = Number.isFinite(slip) && Math.abs(slip) > 1e-3 ? Math.sign(slip) : 1;
        }
        writeRealPathInput(state, { moveZ: 1, turnIntent: heldTurn === null ? 0 : heldTurn });
      },
      after: ({ host: h, index }) => {
        const p = h.player;
        sampleRotWeld(weld, p);
        const speed = planarSpeed(p);
        if (speed < minSpeed) minSpeed = speed;
        if (hits.length && hitIndex < 0) hitIndex = index;
        if (hitIndex < 0 || index < hitIndex) return;
        const slip = Math.abs(wrapAngle((p.rot || 0) - Math.atan2(p.vel.z, p.vel.x)));
        if (slip > maxSlip) maxSlip = slip;
        if (index >= hitIndex + TICKS_1_5S && slip > tailMax) tailMax = slip;
        if (recoveredTick < 0 && index >= hitIndex + 6 && slip <= LEAD_BOUND) recoveredTick = index;
      },
    });
    assert.ok(hitIndex >= 0, 'the fixture must produce a real solver contact, not a staged velocity');
    assert.ok(hitIndex + TICKS_1_5S + 30 <= RUN_TICKS,
      `the hit must land early enough to leave a real post-contact tail (hit ${hitIndex})`);
    assert.ok(maxSlip > VECTORING_SLIP_LEAD_RAD * 0.5,
      `the glancing hit must visibly displace the path (peak slip ${(maxSlip * 180 / Math.PI).toFixed(1)} deg)`);
    assert.ok(recoveredTick >= 0 && recoveredTick <= hitIndex + TICKS_1_5S,
      `real contact: lead recovered inside 1.5 s of impact (tick ${recoveredTick}, hit ${hitIndex})`);
    assert.ok(tailMax <= LEAD_BOUND,
      `real contact: lead stays bounded afterwards (tail max ${(tailMax * 180 / Math.PI).toFixed(1)} deg)`);
    assert.ok(weld.maxRatio <= 1.05,
      `real contact: heading rides yawRate*dt (max ratio ${weld.maxRatio.toFixed(3)})`);
    assert.ok(minSpeed > cruiseSpeed * 0.2,
      `real contact: speed survives the graze (min ${minSpeed.toFixed(1)} of cruise ${cruiseSpeed.toFixed(1)})`);
  } finally {
    host.dispose();
  }
});

test('REAL PATH: live boost reversal then release settles onto the new path', async () => {
  const host = await bootPlayer(4242, 'ship_kestrel');
  try {
    host.state.settings.gameplay.velocityVectoring = true;
    settle(host);
    host.step(300, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const player = host.player;
    const cruiseSpeed = planarSpeed(player);
    assert.ok(cruiseSpeed > 5, 'fixture reached cruise');
    host.step(40, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1, boost: true }); },
    });
    const boostSpeed = planarSpeed(player);
    const weld = trackRotWeld();
    let tailMax = 0;
    let minSpeed = Infinity;
    let recoveredTick = -1;
    host.step(180, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1 }); },
      after: ({ host: h, index }) => {
        const p = h.player;
        sampleRotWeld(weld, p);
        const speed = planarSpeed(p);
        if (speed < minSpeed) minSpeed = speed;
        const slip = Math.abs(wrapAngle((p.rot || 0) - Math.atan2(p.vel.z, p.vel.x)));
        if (recoveredTick >= 0 && index > recoveredTick && slip > tailMax) tailMax = slip;
        if (recoveredTick < 0 && index >= 6 && slip <= LEAD_BOUND) recoveredTick = index;
      },
    });
    assert.ok(boostSpeed > cruiseSpeed, `live boost actually boosted (${boostSpeed.toFixed(1)} > ${cruiseSpeed.toFixed(1)})`);
    assert.ok(recoveredTick >= 0,
      'post-release lead re-bounds inside the window (earned overcap is never force-bled)');
    assert.ok(180 - recoveredTick >= 30,
      `post-release lead leaves a measurable bounded tail (recovered at ${recoveredTick})`);
    assert.ok(tailMax <= LEAD_BOUND,
      `post-release lead stays bounded (tail max ${(tailMax * 180 / Math.PI).toFixed(1)} deg)`);
    assert.ok(weld.maxRatio <= 1.05,
      `post-release heading rides yawRate*dt (max ratio ${weld.maxRatio.toFixed(3)})`);
    assert.ok(minSpeed > cruiseSpeed * 0.4,
      `post-release speed stays meaningful (min ${minSpeed.toFixed(1)} of cruise ${cruiseSpeed.toFixed(1)})`);
  } finally {
    host.dispose();
  }
});

test('REAL PATH: coast-turn reversal then live boost keeps earned overcap', async () => {
  const host = await bootPlayer(4242, 'ship_kestrel');
  try {
    host.state.settings.gameplay.velocityVectoring = true;
    settle(host);
    host.step(300, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const player = host.player;
    const cruiseSpeed = planarSpeed(player);
    assert.ok(cruiseSpeed > 5, 'fixture reached cruise');
    const oldHeading = Math.atan2(player.vel.z, player.vel.x);
    let maxNoseOffset = 0;
    let coastTicks = 0;
    while (coastTicks < 480 && maxNoseOffset < Math.PI * 0.8) {
      host.step(30, {
        before: ({ state }) => { writeRealPathInput(state, { turnIntent: 1 }); },
        after: ({ host: h }) => {
          const off = Math.abs(wrapAngle((h.player.rot || 0) - oldHeading));
          if (off > maxNoseOffset) maxNoseOffset = off;
        },
      });
      coastTicks += 30;
    }
    assert.ok(maxNoseOffset > Math.PI * 0.75,
      `coast turn swung the nose opposite the old velocity (peak ${(maxNoseOffset * 180 / Math.PI).toFixed(0)} deg over ${coastTicks} ticks)`);
    const weld = trackRotWeld();
    let sawBoost = false;
    let peakSpeed = 0;
    host.step(60, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1, boost: true }); },
      after: ({ host: h }) => {
        const p = h.player;
        sampleRotWeld(weld, p);
        if (p.flags && p.flags.boosting === true) sawBoost = true;
        const speed = planarSpeed(p);
        if (speed > peakSpeed) peakSpeed = speed;
      },
    });
    assert.ok(sawBoost, 'live flightV3 boost state engaged (flags.boosting)');
    assert.ok(peakSpeed > cruiseSpeed,
      `boost earned overcap through the reversal (peak ${peakSpeed.toFixed(1)} of cruise ${cruiseSpeed.toFixed(1)})`);
    assert.ok(weld.maxRatio <= 1.05,
      `boost reversal heading rides yawRate*dt (max ratio ${weld.maxRatio.toFixed(3)})`);
    let tailMax = 0;
    let flipTick = -1;
    host.step(360, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1 }); },
      after: ({ host: h, index }) => {
        const p = h.player;
        sampleRotWeld(weld, p);
        const slip = Math.abs(wrapAngle((p.rot || 0) - Math.atan2(p.vel.z, p.vel.x)));
        if (flipTick < 0 && slip < Math.PI / 2) flipTick = index;
        if (index >= 300 && slip > tailMax) tailMax = slip;
      },
    });
    assert.ok(flipTick >= 0,
      'the held turn+thrust physically flips the path under the nose inside 6 s of release');
    assert.ok(tailMax <= LEAD_BOUND,
      `once the reversal completes the lead re-bounds (tail max ${(tailMax * 180 / Math.PI).toFixed(1)} deg)`);
    assert.ok(weld.maxRatio <= 1.05,
      `release heading rides yawRate*dt (max ratio ${weld.maxRatio.toFixed(3)})`);
  } finally {
    host.dispose();
  }
});
