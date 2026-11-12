// PERF-02a drawn-pose continuity: the player hull's presented pose is allowed to keep
// moving — forward — when the snapshot fence's raw presented position corrects backward.
// A snap is absorbed into a decaying offset (drawn continues at the smoothed velocity),
// a real 40+ WU teleport is drawn whole (respawn/dock/warp must not ease through space),
// steady motion passes through untouched, and the yaw channel heals the same way
// wrap-aware — a heading crossing ±pi is not a snap.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPoseContinuity,
  POSE_CONTINUITY_JUMP_WU,
  POSE_CONTINUITY_TELEPORT_WU,
} from '../src/render/poseContinuity.js';

const DT = 1 / 60;
const SPEED = 60; // WU/s along +x: one world unit per presented frame.

function out() { return { x: 0, z: 0, yaw: 0 }; }

test('steady motion passes through unchanged', () => {
  const cont = createPoseContinuity();
  const o = out();
  for (let n = 0; n < 120; n++) {
    const r = n * (SPEED * DT);
    cont.sample(7, r, 0, 0.4, DT, o);
    assert.ok(Math.abs(o.x - r) < 1e-9, `frame ${n}: drawn ${o.x} should equal raw ${r}`);
    assert.ok(Math.abs(o.yaw - 0.4) < 1e-9);
  }
  assert.equal(cont.offset(7), 0);
});

test('a strictly forward slowdown neither creates a lead nor draws the hull backward', () => {
  const cont = createPoseContinuity();
  const o = out();
  let raw = 0;
  for (let n = 0; n < 60; n++) {
    raw += 2;
    cont.sample(7, raw, 0, 0, DT, o);
  }
  let previous = o.x;
  let maxLead = 0;
  let maxRetreat = 0;
  for (let n = 0; n < 35; n++) {
    raw += 0.01;
    cont.sample(7, raw, 0, 0, DT, o);
    maxLead = Math.max(maxLead, o.x - raw);
    maxRetreat = Math.max(maxRetreat, previous - o.x);
    previous = o.x;
  }
  assert.deepEqual({ ledRaw: maxLead > 1e-9, drewBackward: maxRetreat > 1e-9 },
    { ledRaw: false, drewBackward: false }, `lead ${maxLead} WU, retreat ${maxRetreat} WU`);
  assert.equal(o.x, raw, 'a genuinely slower trajectory remains the drawn trajectory');
});

test('a sustained raw reversal and a perpendicular turn still change drawn direction', () => {
  const cont = createPoseContinuity();
  const o = out();
  for (let n = 0; n <= 60; n++) cont.sample(7, n, 0, 0, DT, o);
  for (let n = 1; n <= 60; n++) cont.sample(7, 60 - n, 0, Math.PI, DT, o);
  assert.ok(Math.abs(o.x) < 0.2, 'a sustained reversal catches the reversing ship');
  for (let n = 1; n <= 60; n++) cont.sample(7, 0, n, -Math.PI / 2, DT, o);
  assert.ok(Math.abs(o.x) < 0.05 && Math.abs(o.z - 60) < 0.05, 'a real turn follows the new path');
});

test('accelerating into a sustained turn at low render cadence does not build a second flight path', () => {
  const cont = createPoseContinuity();
  const o = out();
  let x = 0, z = 0, angle = 0;
  const dt = 0.075;
  for (let n = 0; n < 60; n++) {
    x += 0.7;
    cont.sample(7, x, z, 0, dt, o);
  }
  let largestOffset = 0;
  for (let n = 0; n < 280; n++) {
    const step = Math.min(13, 0.7 + n * 0.35);
    if (n < 180) angle += 0.10;
    x += step * Math.cos(angle);
    z += step * Math.sin(angle);
    cont.sample(7, x, z, -angle, dt, o);
    largestOffset = Math.max(largestOffset, Math.hypot(o.x - x, o.z - z));
  }
  assert.ok(largestOffset < 0.05, `drawn hull strayed ${largestOffset.toFixed(2)} WU from the smooth pose stream`);
});

test('a backward snap is absorbed — the hull never steps back', () => {
  const cont = createPoseContinuity();
  const o = out();
  const raws = [];
  const drawn = [];
  // 60 honest frames, then a pack lands 4 WU behind the guess, then honest frames resume
  // from the corrected position — the staircase the fence produces while the worker is busy.
  for (let n = 0; n <= 60; n++) raws.push(n * (SPEED * DT));
  for (let n = 61; n <= 120; n++) raws.push(n * (SPEED * DT) - 4);
  let minProgress = Infinity;
  for (const r of raws) {
    const before = drawn.length ? drawn[drawn.length - 1] : -Infinity;
    cont.sample(7, r, 0, 0, DT, o);
    drawn.push(o.x);
    if (before !== -Infinity) minProgress = Math.min(minProgress, o.x - before);
  }
  assert.ok(minProgress > 0, `drawn path must never regress along velocity (min ${minProgress})`);
  // The correction frame itself: raw stepped −4 WU while the drawn pose still moved forward.
  assert.ok(drawn[61] - drawn[60] > 0,
    'the snap frame keeps the hull moving forward, never back');
  assert.ok(drawn[61] - drawn[60] <= SPEED * DT + 1e-9,
    'the snap frame does not leap forward past its own continuation');
});

test('a backward correction after a slow render frame does not move the drawn hull back', () => {
  const cont = createPoseContinuity();
  const o = out();
  for (let n = 0; n <= 60; n++) cont.sample(7, n * 12, 0, 0, 0.075, o);
  const before = o.x;
  cont.sample(7, 60 * 12 - 22, 0, 0, 0.075, o);
  assert.ok(o.x >= before, `a late correction moved the hull back ${before - o.x} WU`);
});

test('the absorbed offset decays back onto the raw stream', () => {
  const cont = createPoseContinuity();
  const o = out();
  for (let n = 0; n <= 60; n++) cont.sample(7, n * (SPEED * DT), 0, 0, DT, o);
  const snapRaw = 60 * (SPEED * DT) - 4;
  cont.sample(7, snapRaw, 0, 0, DT, o);
  assert.ok(cont.offset(7) > 0.5, 'a 4 WU snap commits an offset to heal');
  // Feed frames that stay inside the heal band: raw lands within the absorb threshold of
  // the drawn continuation, so the residual decays instead of re-arming.
  let r = snapRaw;
  for (let n = 0; n < 90; n++) {
    r += SPEED * DT + 0.18;
    cont.sample(7, r, 0, 0, DT, o);
  }
  assert.ok(cont.offset(7) < 0.5 * Math.exp(-90 * DT / 0.12) * 40,
    'the residual keeps decaying once the stream is quiet');
  assert.ok(Math.abs(o.x - r) < 0.6, `drawn ${o.x} rejoins raw ${r}`);
});

test('a teleport draws the arriving pose whole', () => {
  const cont = createPoseContinuity();
  const o = out();
  for (let n = 0; n <= 60; n++) cont.sample(7, n * (SPEED * DT), 0, 0, DT, o);
  const last = o.x;
  // A 200 WU jump (sector hop / respawn) is not a correction to ease through.
  cont.sample(7, 200, 0, 1.2, DT, o);
  assert.equal(o.x, 200);
  assert.equal(o.yaw, 1.2);
  assert.equal(cont.offset(7), 0);
  // And the stream after the teleport re-seeds cleanly — no phantom absorb from the hop.
  cont.sample(7, 200 + SPEED * DT, 0, 1.2, DT, o);
  assert.ok(Math.abs(o.x - (200 + SPEED * DT)) < 1e-9);
  assert.ok(last < 200, 'sanity: the teleport really moved the pose');
});

test('yaw absorbs a heading snap and heals wrap-aware', () => {
  const cont = createPoseContinuity();
  const o = out();
  // Steady turn at +0.6 rad/s — below the 2°/frame absorb threshold once seeded.
  const RATE = 0.6;
  let yaw = 0;
  for (let n = 0; n <= 60; n++) {
    yaw += RATE * DT;
    cont.sample(7, 0, 0, yaw, DT, o);
  }
  // A 30° yaw snap (an authoritative heading correction) is absorbed, not drawn whole.
  const snapped = yaw + (30 * Math.PI) / 180;
  cont.sample(7, 0, 0, snapped, DT, o);
  assert.ok(Math.abs(o.yaw - (yaw + RATE * DT)) < 0.05,
    `drawn yaw ${o.yaw} continues the turn instead of snapping to ${snapped}`);
});

test('a heading through the ±pi seam is not mistaken for a snap', () => {
  const cont = createPoseContinuity();
  const o = out();
  // Approach +pi and cross to −pi at 0.6 rad/s — a continuous turn.
  let yaw = Math.PI - 0.05;
  cont.sample(7, 0, 0, yaw, DT, o);
  let prev = yaw;
  for (let n = 0; n < 30; n++) {
    yaw += RATE_WRAP * DT;
    if (yaw > Math.PI) yaw -= Math.PI * 2;
    cont.sample(7, 0, 0, yaw, DT, o);
    const step = wrap(o.yaw - prev);
    prev = o.yaw;
    assert.ok(Math.abs(step - RATE_WRAP * DT) < 1e-6,
      `frame ${n}: drawn yaw step ${step} should match the turn rate`);
  }
});

const RATE_WRAP = 0.6;
function wrap(a) {
  let v = (a + Math.PI) % (Math.PI * 2);
  if (v < 0) v += Math.PI * 2;
  return v - Math.PI;
}

test('per-entity records are independent', () => {
  const cont = createPoseContinuity();
  const o = out();
  for (let n = 0; n <= 30; n++) cont.sample(7, n * (SPEED * DT), 0, 0, DT, o);
  cont.sample(7, 0, 0, 0, DT, o); // entity 7 snaps back to the origin
  const offset7 = cont.offset(7);
  // A different entity's record is untouched by 7's correction.
  cont.sample(9, 100, 0, 0, DT, o);
  assert.equal(o.x, 100);
  assert.ok(offset7 > 0);
  cont.drop(7);
  assert.equal(cont.offset(7), 0);
});

test('thresholds are the packet numbers', () => {
  assert.equal(POSE_CONTINUITY_JUMP_WU, 0.5);
  assert.equal(POSE_CONTINUITY_TELEPORT_WU, 40);
});

test('a stopped raw stream converges to the physical pose (review 2026-11-11 HIGH)', () => {
  for (const v of [60, 210]) {
    const pc = createPoseContinuity(); const out = {}; const dt = 1 / 60; let x = 0;
    for (let i = 0; i < 60; i++) { x += v * dt; pc.sample(1, x, 0, 0, dt, out); }
    for (let i = 0; i < 600; i++) pc.sample(1, x, 0, 0, dt, out);
    assert.ok(Math.abs(out.x - x) < 0.05, `v=${v}: drawn ${out.x} must rejoin raw ${x}`);
  }
});

test('a stop after a correction retires the existing lead', () => {
  const cont = createPoseContinuity();
  const o = out();
  for (let n = 0; n <= 60; n++) cont.sample(7, n, 0, 0, DT, o);
  cont.sample(7, 56, 0, 0, DT, o);
  assert.ok(cont.offset(7) > 0.5, 'the prior backward correction left an offset to heal');
  for (let n = 0; n < 120; n++) cont.sample(7, 56, 0, 0, DT, o);
  assert.equal(cont.offset(7), 0);
  assert.equal(o.x, 56);
});
