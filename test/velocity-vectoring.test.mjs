// Velocity-vectoring assist (design/FEEL_CONTRACT.md §C "Velocity-vectoring assist";
// docs/TUNING_JOBS.md job 1) — kernel-level contract.
//
// "Turn NOW when I twitch." / "If I swing well, slingshot well, fly well, I EARN speed and I KEEP
// it." (design/VISION.md). Below the cap the assist rotates the velocity vector toward the
// commanded direction with a speed-preserving lateral force; above the cap it is zero.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROPULSION_PROFILES,
  resolvePropulsionProfile,
} from '../src/core/flight/propulsionCatalog.js';
import { applyFeelEnvelope } from '../src/data/flightFeelEnvelopes.js';
import {
  OVERCAP_ASSIST_BLEND_WU_S,
  VELOCITY_VECTORING_DEFAULTS,
  createPropulsionRuntime,
  stepPropulsion,
} from '../src/core/flight/propulsionKernel.js';
import { assertEarnedSpeed, measureEarnedSpeed } from '../scripts/lib/feelRegression.mjs';

const DT = 1 / 60;
const TWITCH = 'Turn NOW when I twitch.';
const EARNED = 'If I swing well, slingshot well, fly well, I EARN speed and I KEEP it.';

/** The starter hull's live player profile: catalog drive + player translation feel + Hitch envelope. */
function hitchPlayerProfile() {
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

function step(profile, b, input, runtime = createPropulsionRuntime(profile)) {
  return stepPropulsion({ dt: DT, body: b, input: { assistMode: 'assisted', ...input }, profile, runtime });
}

function stripVectoring(result) {
  const { vectoring, ...telemetry } = result.telemetry;
  void vectoring;
  return { ...result, telemetry };
}

function speedOf(b) { return Math.hypot(b.vel.x, b.vel.z); }
function headingOf(b) { return Math.atan2(b.vel.z, b.vel.x); }
function wrap(a) { let v = a % (Math.PI * 2); if (v <= -Math.PI) v += Math.PI * 2; if (v > Math.PI) v -= Math.PI * 2; return v; }

/**
 * Euler integration plus a port of the physics owner's thrust-only speed clamp
 * (src/core/sg02DynamicBodyOwner.js `_clampSpeed`): given momentum survives, thrust may reach the
 * cap but not exceed it. Kernel-level only — the real-path numbers live in
 * test/velocity-vectoring.real-path.mjs.
 */
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

function simulate(profile, b, inputFn, ticks, stopFn = null) {
  let runtime = createPropulsionRuntime(profile);
  let last = null;
  for (let i = 0; i < ticks; i++) {
    const input = inputFn(i, b);
    last = step(profile, b, input, runtime);
    runtime = last.runtime;
    advance(b, last);
    if (stopFn && stopFn(i, b, last)) return { ticks: i + 1, result: last, stopped: true };
  }
  return { ticks, result: last, stopped: false };
}

test(`opt-out is byte-identical: no flag, no vectoring key, no change — "${EARNED}"`, () => {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const input = { throttle: 0.7, strafe: -0.6, turn: 0.9 };
  const b = () => body({ vel: { x: 60, z: -12 }, angVel: 0.4, rot: 0.6 });
  const plain = step(profile, b(), input);
  const explicitOff = step(profile, b(), { ...input, velocityVectoring: false });
  assert.deepEqual(explicitOff, plain, 'velocityVectoring:false must be the same as no key');
  assert.equal('vectoring' in plain.telemetry, false, 'no key means no telemetry key (frozen-fixture shape)');
  assert.equal('vectoring' in explicitOff.telemetry, false);
});

test(`above the cap the assist is zero: forces identical to the unassisted kernel — "${EARNED}"`, () => {
  const profile = hitchPlayerProfile();
  const cruise = profile.combatSpeed;
  for (const speed of [cruise * 2, cruise + OVERCAP_ASSIST_BLEND_WU_S, cruise + OVERCAP_ASSIST_BLEND_WU_S + 0.001]) {
    const make = () => body({ vel: { x: speed, z: 0 }, rot: 0.8 });
    const input = { throttle: 1, strafe: 1, turn: 1 };
    const off = step(profile, make(), input);
    const on = step(profile, make(), { ...input, velocityVectoring: true });
    assert.deepEqual(on.force, off.force, `${EARNED} — at ${speed.toFixed(1)} WU/s the force must not change`);
    assert.deepEqual(on.torque, off.torque);
    assert.equal(on.telemetry.vectoring.active, false);
    assert.equal(on.telemetry.vectoring.reason, 'above-cap');
    assert.deepEqual(stripVectoring(on), off, 'only the shape-gated telemetry key may differ');
  }
  // Inside the blend window the rate tapers: half way through the 15 WU/s window it is half.
  const mid = step(profile, body({ vel: { x: cruise + OVERCAP_ASSIST_BLEND_WU_S / 2, z: 0 }, rot: 0.8 }),
    { throttle: 1, velocityVectoring: true });
  assert.equal(mid.telemetry.vectoring.active, true);
  assert.ok(Math.abs(mid.telemetry.vectoring.rateRadS - VELOCITY_VECTORING_DEFAULTS.rateCapRadS * 0.5) < 1e-9,
    `blend: rate at cap+7.5 is half the cap rate (got ${mid.telemetry.vectoring.rateRadS})`);
});

test(`B1 with the assist on: earned speed kept hands-off and forward-held (2x cruise, 10 s) — "${EARNED}"`, () => {
  // The contract's own B1 guard (scripts/lib/feelRegression.mjs), with the packet opted in.
  const rows = measureEarnedSpeed((args) => stepPropulsion({
    ...args,
    input: { ...args.input, velocityVectoring: true },
  }));
  assertEarnedSpeed(rows);
  for (const row of rows) assert.ok(row.keptFraction >= 0.999999, `${EARNED} — kept ${row.keptFraction}`);
  console.log('B1 with vectoring on (kernel):', JSON.stringify(rows));
  // Harder: the nose is swung off the velocity the whole time (full turn held, hands off) — the
  // one case where a vectoring assist that leaked above the cap would bend or bleed speed. (Full
  // turn WITH forward held is not a B1 arm: once the nose points backward, W is the flip-and-burn
  // brake, on the unmodified kernel too.)
  const swung = measureEarnedSpeed((args) => stepPropulsion({
    ...args,
    input: { ...args.input, throttle: 0, velocityVectoring: true, turn: 1 },
  }));
  for (const row of swung) assert.ok(row.keptFraction >= 0.999999, `${EARNED} — nose swung hands off, kept ${row.keptFraction}`);
  // And whatever strafe thrust does above the cap with the nose swung and no main drive, it does
  // identically with the assist on or off — the assist adds nothing there. (The forward-held
  // rows are excluded on purpose: W with the nose swung past 90 deg is the flip-and-burn brake,
  // the ship drops below the cap inside the 10 s, and from there the assist is legitimately live.)
  for (const extra of [{ turn: 1 }, { turn: 1, strafe: 1 }]) {
    const handsOff = (rows) => rows.filter((row) => row.throttle === 0);
    const off = measureEarnedSpeed((args) => stepPropulsion({ ...args, input: { ...args.input, ...extra } }));
    const on = measureEarnedSpeed((args) => stepPropulsion({ ...args, input: { ...args.input, ...extra, velocityVectoring: true } }));
    assert.deepEqual(handsOff(on), handsOff(off), `above the cap, the assist changes nothing about a hands-off ship with ${JSON.stringify(extra)} held`);
  }
});

test(`below the cap the velocity rotates toward the command at the band rate and keeps its speed — "${TWITCH}"`, () => {
  const profile = hitchPlayerProfile();
  const cruise = profile.combatSpeed;
  const speed = cruise * 0.5;
  const noseOffset = Math.PI / 3;
  const b = body({ vel: { x: speed, z: 0 }, rot: noseOffset });
  const result = step(profile, b, { throttle: 1, velocityVectoring: true });
  const v = result.telemetry.vectoring;
  assert.equal(v.active, true);
  const expectedRate = VELOCITY_VECTORING_DEFAULTS.rateLowRadS
    + (VELOCITY_VECTORING_DEFAULTS.rateCapRadS - VELOCITY_VECTORING_DEFAULTS.rateLowRadS) * 0.5;
  assert.ok(Math.abs(v.rateRadS - expectedRate) < 1e-9, `rate at half cap is the band midpoint (got ${v.rateRadS})`);
  assert.ok(Math.abs(v.errorRad - noseOffset) < 1e-9, 'error is nose minus velocity heading');
  assert.ok(Math.abs(v.deltaRad - expectedRate * DT) < 1e-12, 'one tick rotates by rate x dt');
  assert.equal(v.saturated, false);
  // The assist's own force is a pure rotation: apply only it and the speed does not move.
  const rx = b.vel.x + v.ax * DT;
  const rz = b.vel.z + v.az * DT;
  assert.ok(Math.abs(Math.hypot(rx, rz) - speed) < 1e-9, `${EARNED} — a pure rotation keeps speed (${Math.hypot(rx, rz)} vs ${speed})`);
  assert.ok(Math.abs(wrap(Math.atan2(rz, rx)) - expectedRate * DT) < 1e-9, 'the rotation lands on the requested angle');
});

test('the vectoring force never exceeds the drive\'s forward authority (hull identity survives)', () => {
  const heavy = PROPULSION_PROFILES.drive_reaction_l;
  const b = body({ vel: { x: heavy.combatSpeed, z: 0 }, rot: Math.PI / 3, mass: 90, inertia: 260 });
  const result = step(heavy, b, { throttle: 1, velocityVectoring: true });
  const v = result.telemetry.vectoring;
  assert.equal(v.active, true);
  assert.equal(v.saturated, true, 'a 60 WU/s^2 drive cannot vector 0.9 rad/s at 170 WU/s');
  assert.ok(v.accel <= heavy.mainAccel + 1e-6, `bounded by mainAccel (${v.accel} vs ${heavy.mainAccel})`);
  assert.ok(v.accel > heavy.mainAccel * 0.999, 'and it uses that authority in full');
  const light = hitchPlayerProfile();
  const lb = body({ vel: { x: light.combatSpeed, z: 0 }, rot: Math.PI / 3 });
  const lr = step(light, lb, { throttle: 1, velocityVectoring: true });
  assert.ok(lr.telemetry.vectoring.accel <= light.mainAccel + 1e-6, 'Hitch is bounded by its own main authority');
});

test('gates: brake, drift, newtonian, no throttle, dead speed and a flip all leave the assist idle', () => {
  const profile = hitchPlayerProfile();
  const half = profile.combatSpeed * 0.5;
  const cases = [
    ['brake', { throttle: 1, brake: true }, { vel: { x: half, z: 0 }, rot: 0.8 }],
    ['mode', { throttle: 1, assistMode: 'drift' }, { vel: { x: half, z: 0 }, rot: 0.8 }],
    ['mode', { throttle: 1, assistMode: 'newtonian' }, { vel: { x: half, z: 0 }, rot: 0.8 }],
    ['no-throttle', { throttle: 0, turn: 1 }, { vel: { x: half, z: 0 }, rot: 0.8 }],
    ['no-throttle', { throttle: 0, strafe: 1 }, { vel: { x: half, z: 0 }, rot: 0.8 }],
    ['dead-speed', { throttle: 1 }, { vel: { x: 0.05, z: 0 }, rot: 0.8 }],
    ['faded', { throttle: 1 }, { vel: { x: half, z: 0 }, rot: Math.PI }],
  ];
  for (const [reason, input, overrides] of cases) {
    const result = step(profile, body(overrides), { ...input, velocityVectoring: true });
    const v = result.telemetry.vectoring;
    assert.equal(v.active, false, `${reason}: inactive`);
    assert.equal(v.reason, reason);
    assert.equal(v.ax, 0);
    assert.equal(v.az, 0);
  }
  // The flip fade is smooth: at 135 deg the assist is at half strength, not a cliff.
  const flip135 = step(profile, body({ vel: { x: half, z: 0 }, rot: Math.PI * 0.75 }), { throttle: 1, velocityVectoring: true });
  const straight = step(profile, body({ vel: { x: half, z: 0 }, rot: Math.PI * 0.25 }), { throttle: 1, velocityVectoring: true });
  assert.ok(Math.abs(flip135.telemetry.vectoring.rateRadS - straight.telemetry.vectoring.rateRadS * 0.5) < 1e-9,
    'smoothstep(90deg, 180deg) is 0.5 at 135deg');
});

test('the command is the nose offset by the strafe: W+D bends toward the strafe side, nose-left bends left', () => {
  const profile = hitchPlayerProfile();
  const half = profile.combatSpeed * 0.5;
  const strafeRight = step(profile, body({ vel: { x: half, z: 0 }, rot: 0 }), { throttle: 1, strafe: 1, velocityVectoring: true });
  const v = strafeRight.telemetry.vectoring;
  assert.equal(v.active, true);
  assert.ok(Math.abs(v.errorRad - Math.PI / 4) < 1e-9, 'W+D commands 45 deg to the strafe side');
  assert.ok(v.deltaRad > 0, 'positive strafe rotates the velocity toward positive heading (same side as a positive turn)');
  const noseLeft = step(profile, body({ vel: { x: half, z: 0 }, rot: -0.5 }), { throttle: 1, velocityVectoring: true });
  assert.ok(noseLeft.telemetry.vectoring.deltaRad < 0, 'nose to the left rotates the velocity left');
  const aligned = step(profile, body({ vel: { x: half, z: 0 }, rot: 0 }), { throttle: 1, velocityVectoring: true });
  assert.equal(aligned.telemetry.vectoring.active, true);
  assert.equal(aligned.telemetry.vectoring.accel, 0, 'aligned: authority held, nothing to do');
});

test('rate overrides through the packet select a variant; determinism holds for the same input stream', () => {
  const profile = hitchPlayerProfile();
  const half = profile.combatSpeed * 0.5;
  const make = () => body({ vel: { x: half, z: 0 }, rot: 0.8 });
  const hot = step(profile, make(), { throttle: 1, velocityVectoring: { rateLowRadS: 2.0, rateCapRadS: 1.1 } });
  assert.ok(Math.abs(hot.telemetry.vectoring.rateRadS - 1.55) < 1e-9, `override midpoint (got ${hot.telemetry.vectoring.rateRadS})`);
  const a = step(profile, make(), { throttle: 1, strafe: 0.3, turn: 0.7, velocityVectoring: true });
  const b = step(profile, make(), { throttle: 1, strafe: 0.3, turn: 0.7, velocityVectoring: true });
  assert.deepEqual(a, b, 'fixed inputs, fixed result');
});

// ---------------------------------------------------------------------------------------------
// Kernel-level redirect numbers (Euler + thrust-only clamp port). The real-path numbers are the
// evidence; this prints the same quadruple in milliseconds and guards the direction of travel.
// ---------------------------------------------------------------------------------------------
const VARIANTS = Object.freeze([
  { id: 'off', velocityVectoring: false },
  { id: '1.2/0.7', velocityVectoring: { rateLowRadS: 1.2, rateCapRadS: 0.7 } },
  { id: '1.6/0.9 (band, default)', velocityVectoring: true },
  { id: '2.0/1.1', velocityVectoring: { rateLowRadS: 2.0, rateCapRadS: 1.1 } },
]);

function cruiseBody(profile) {
  const b = body();
  simulate(profile, b, () => ({ throttle: 1 }), 900);
  return b;
}

function sweepTime(profile, flag, inputFn, targetRad = Math.PI / 2, maxTicks = 1800) {
  const b = cruiseBody(profile);
  const cruise = speedOf(b);
  const rot0 = b.rot;
  let prev = headingOf(b);
  let swept = 0;
  let minSpeed = Infinity;
  let speedSum = 0;
  const run = simulate(profile, b, (i, bb) => ({ ...inputFn(i, bb, rot0), velocityVectoring: flag }), maxTicks, (i, bb) => {
    const h = headingOf(bb);
    swept += wrap(h - prev);
    prev = h;
    const sp = speedOf(bb);
    speedSum += sp;
    if (sp < minSpeed) minSpeed = sp;
    return Math.abs(swept) >= targetRad;
  });
  const timeS = run.stopped ? run.ticks * DT : null;
  const meanSpeed = speedSum / run.ticks;
  const rate = timeS ? Math.abs(swept) / timeS : 0;
  return { cruise, timeS, meanSpeed, minSpeed, radiusWu: rate > 0 ? meanSpeed / rate : null };
}

function noseTo(offsetRad) {
  return (i, b, rot0) => {
    const err = wrap((rot0 + offsetRad) - b.rot);
    return { throttle: 1, turn: Math.max(-1, Math.min(1, err / 0.32)) };
  };
}

test(`kernel redirect table: twitch, W+turn sweep and W+strafe+turn per variant — "${TWITCH}"`, () => {
  const profile = hitchPlayerProfile();
  const rows = [];
  for (const variant of VARIANTS) {
    const twitch = sweepTime(profile, variant.velocityVectoring, noseTo(Math.PI * 100 / 180));
    const turn = sweepTime(profile, variant.velocityVectoring, () => ({ throttle: 1, turn: 1 }));
    const redirect = sweepTime(profile, variant.velocityVectoring, () => ({ throttle: 1, strafe: 1, turn: 1 }));
    rows.push({ variant: variant.id, twitch90: twitch, turn90: turn, redirect90: redirect });
  }
  const fmt = (m) => `${m.timeS == null ? 'never' : m.timeS.toFixed(3) + ' s'} (mean ${m.meanSpeed.toFixed(1)}, min ${m.minSpeed.toFixed(1)} WU/s, r ${m.radiusWu == null ? '-' : m.radiusWu.toFixed(1)} WU)`;
  console.log(`kernel redirect table, Hitch player profile, cruise ${rows[0].twitch90.cruise.toFixed(1)} WU/s:`);
  for (const row of rows) {
    console.log(`  ${row.variant.padEnd(24)} twitch100->90deg ${fmt(row.twitch90)} | W+turn 90deg ${fmt(row.turn90)} | W+strafe+turn 90deg ${fmt(row.redirect90)}`);
  }
  // NOTE on the `off` row: this harness has no steady damping, so at the cap the governor cuts
  // thrust entirely and the unassisted ship only bends its path once the nose leads by 90 deg and
  // the governor slams full thrust against the reversed component — a speed dump whose heading
  // flips through zero. The real path (Rapier) cruises a hair under the cap and keeps a little
  // thrust on, so its `off` numbers are far better than these. Only the real-path numbers
  // (test/velocity-vectoring.real-path.mjs) are evidence for the bars; here the assertions guard
  // the assist's own direction of travel on the well-conditioned twitch arm.
  const off = rows[0];
  const band = rows.find((r) => r.variant.startsWith('1.6/0.9'));
  assert.ok(off.twitch90.timeS != null && band.twitch90.timeS != null, 'both arms must complete the 90 deg redirect');
  assert.ok(band.twitch90.timeS < off.twitch90.timeS * 0.75,
    `${TWITCH} — the band assist must redirect a held 100 deg twitch at least 25% sooner (${band.twitch90.timeS} vs ${off.twitch90.timeS} s)`);
  assert.ok(band.twitch90.timeS <= 2.0,
    `${TWITCH} — a held 100 deg twitch at cruise bends the path 90 deg within 2 s (got ${band.twitch90.timeS} s)`);
  assert.ok(band.twitch90.minSpeed >= band.twitch90.cruise * 0.9,
    `${EARNED} — the twitch keeps >= 90% of cruise while bending (min ${band.twitch90.minSpeed} of ${band.twitch90.cruise})`);
  for (const row of rows.slice(1)) {
    assert.ok(row.turn90.timeS != null && row.redirect90.timeS != null,
      `${row.variant}: W+turn and W+strafe+turn must both complete a 90 deg sweep`);
    assert.ok(row.turn90.minSpeed >= row.turn90.cruise * 0.75,
      `${EARNED} — ${row.variant}: a held full turn keeps >= 75% of cruise (min ${row.turn90.minSpeed})`);
  }
});
