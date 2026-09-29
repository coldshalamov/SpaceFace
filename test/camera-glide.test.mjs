/**
 * Predictive camera glide: the chase camera must never be inside a solid, must start rising before
 * contact (anticipation, not reaction), must move smoothly, and must return to the set framing.
 * Pure-number simulation — no renderer, no Three.js.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCameraGlide,
  requiredGlideScale,
  resetCameraGlide,
  stepCameraGlide,
} from '../src/render/cameraGlide.js';

const MARGIN = 16;
// Default framing: 144 WU zoom at 60 degrees, camera behind (south of) the look-at target.
const RX = 0;
const RY = 125;
const RZ = -72;
const DT = 1 / 60;

function box(cx, cz, halfX, halfZ, top) {
  return { cx, cz, halfX, halfZ, roof: top + MARGIN };
}

function roofFieldOf(boxes) {
  return (x, z, pad) => {
    let floor = -Infinity;
    for (const b of boxes) {
      if (Math.abs(x - b.cx) <= b.halfX + pad && Math.abs(z - b.cz) <= b.halfZ + pad && b.roof > floor) floor = b.roof;
    }
    return floor;
  };
}

/** Fly the look-at target along a path; returns per-frame records. */
function fly({ boxes, path, seconds, glide = createCameraGlide(), startScaleReset = true, dt = DT }) {
  const roofAt = roofFieldOf(boxes);
  if (startScaleReset) resetCameraGlide(glide);
  const frames = [];
  const total = Math.round(seconds / dt);
  for (let i = 0; i <= total; i++) {
    const time = i * dt;
    const p = path(time);
    const s = stepCameraGlide(glide, i === 0 ? 0 : dt, p.x, p.z, RX, RY, RZ, roofAt);
    const camX = p.x + s * RX;
    const camY = s * RY;
    const camZ = p.z + s * RZ;
    frames.push({ time, s, camX, camY, camZ, tx: p.x, tz: p.z, floor: roofAt(camX, camZ, 0), target: glide.diag.target });
  }
  return { frames, glide, roofAt };
}

const line = (speed, z0 = -1400, x = 0) => (t) => ({ x, z: z0 + speed * t });

function assertNeverInside(frames, label) {
  for (const f of frames) {
    assert.ok(f.camY >= f.floor - 1e-6, `${label}: camera inside solid at t=${f.time.toFixed(2)} (camY ${f.camY.toFixed(1)} < floor ${f.floor.toFixed(1)})`);
  }
}

function peakAccel(frames) {
  // Vertical camera acceleration in WU/s^2 from camY second differences.
  let peak = 0;
  for (let i = 2; i < frames.length; i++) {
    const a = (frames[i].camY - 2 * frames[i - 1].camY + frames[i - 2].camY) / (DT * DT);
    if (Math.abs(a) > peak) peak = Math.abs(a);
  }
  return peak;
}

function directionChanges(frames, minStep = 0.0005) {
  let last = 0;
  let changes = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].s - frames[i - 1].s;
    if (Math.abs(d) < minStep * DT) continue;
    const sign = Math.sign(d);
    if (last && sign !== last) changes++;
    last = sign;
  }
  return changes;
}

test('requiredGlideScale finds the fixed point when dollying moves the camera column', () => {
  // A roof only 90 WU south of the target: at scale 1 the camera (72 south) is on it, and the
  // dolly moves the camera further south, still on it, until it clears the edge column.
  const field = roofFieldOf([box(0, -150, 300, 100, 200)]);
  const s = requiredGlideScale(field, 0, 0, RX, RY, RZ, 0, 16);
  const camY = s * RY;
  assert.ok(camY >= field(0 + s * RX, 0 + s * RZ, 0), 'result must clear the roof at the dollied column');
  assert.ok(s > 1);
  assert.equal(requiredGlideScale(field, 0, 900, RX, RY, RZ, 0, 16), 1, 'open space needs no dolly');
});

test('cruise into a station: never inside, anticipated (no hard clamp), smooth, and returns', () => {
  const station = box(0, 0, 220, 220, 210);
  const { frames, glide } = fly({ boxes: [station], path: line(260), seconds: 13 });
  assertNeverInside(frames, 'cruise');
  assert.equal(glide.diag.hardFrames, 0, 'anticipation must do the work; the hard clamp is the last resort');
  assert.ok(glide.diag.maxScale > 1.5, 'camera really did clear a 210 WU roof');
  assert.ok(peakAccel(frames) < 1600, `vertical acceleration stays gentle (got ${peakAccel(frames).toFixed(0)})`);
  assert.ok(directionChanges(frames) <= 2, 'one rise and one return, no wobble');
  const last = frames[frames.length - 1];
  assert.ok(last.s < 1.02, `returned to the set framing after leaving (s=${last.s.toFixed(3)})`);

  // Anticipation: the camera is already well on its way up before the target reaches the wall.
  const wallHit = frames.find((f) => f.floor > -Infinity);
  const risenBefore = frames.filter((f) => f.time <= wallHit.time).pop();
  assert.ok(risenBefore.s > 1.25, `camera began rising before contact (s=${risenBefore.s.toFixed(2)} at first contact)`);
});

test('slow machines: 20, 10 and 4 fps never put the camera inside', () => {
  const station = box(0, 0, 220, 220, 210);
  for (const fps of [20, 10, 4]) {
    for (const speed of [120, 260]) {
      const { frames, glide } = fly({ boxes: [station], path: line(speed), seconds: 2800 / speed + 10, dt: 1 / fps });
      assertNeverInside(frames, `${fps} fps @ ${speed}`);
      assert.ok(frames[frames.length - 1].s < 1.05, `${fps} fps returns to the set framing`);
      assert.ok(glide.diag.hardFrames <= Math.max(2, glide.diag.frames * 0.1), `${fps} fps: ${glide.diag.hardFrames}/${glide.diag.frames} emergency clamps`);
    }
  }
});

test('boost speed into a tall station: never inside', () => {
  const station = box(0, 0, 300, 300, 320);
  const { frames } = fly({ boxes: [station], path: line(900, -2200), seconds: 5.5 });
  assertNeverInside(frames, 'boost');
});

test('crawling speed still eases up instead of snapping', () => {
  const station = box(0, 0, 200, 200, 180);
  const { frames, glide } = fly({ boxes: [station], path: line(35, -500), seconds: 22 });
  assertNeverInside(frames, 'crawl');
  assert.equal(glide.diag.hardFrames, 0);
  assert.ok(peakAccel(frames) < 900);
});

test('flying sideways and backwards uses the same anticipation', () => {
  const station = box(0, 0, 220, 220, 210);
  for (const [name, path] of [
    ['east', (t) => ({ x: -1400 + 260 * t, z: 0 })],
    ['west', (t) => ({ x: 1400 - 260 * t, z: 0 })],
    ['south', (t) => ({ x: 0, z: 1400 - 260 * t })],
    ['diagonal', (t) => ({ x: -1000 + 190 * t, z: -1000 + 190 * t })],
  ]) {
    const { frames, glide } = fly({ boxes: [station], path, seconds: 14 });
    assertNeverInside(frames, name);
    assert.equal(glide.diag.hardFrames, 0, `${name}: anticipated`);
  }
});

test('a gap between two towers does not yo-yo the shot', () => {
  const towers = [box(0, -110, 90, 80, 200), box(0, 110, 90, 80, 200)];
  const { frames, glide } = fly({ boxes: towers, path: line(220, -1000), seconds: 10 });
  assertNeverInside(frames, 'gap');
  assert.equal(glide.diag.hardFrames, 0);
  const peak = Math.max(...frames.map((f) => f.s));
  const overGap = frames.filter((f) => Math.abs(f.tz) < 40).map((f) => f.s);
  assert.ok(Math.min(...overGap) > 1 + (peak - 1) * 0.85, 'stays lifted across a short gap');
  assert.ok(directionChanges(frames) <= 2);
});

test('a thin tall pole between samples is still seen', () => {
  const pole = box(0, 0, 14, 14, 240);
  const { frames } = fly({ boxes: [pole], path: line(420, -1500), seconds: 7 });
  assertNeverInside(frames, 'pole');
});

test('turning through a station: never inside', () => {
  const station = box(0, 0, 200, 200, 190);
  const orbit = (t) => {
    const a = -Math.PI * 0.9 + t * 0.55;
    return { x: Math.sin(a) * 330, z: Math.cos(a) * 330 };
  };
  const { frames } = fly({ boxes: [station], path: orbit, seconds: 9 });
  assertNeverInside(frames, 'orbit');
});

test('stress: random stations, random headings and speeds — never inside, few emergency clamps', () => {
  let seed = 20260929;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let clamped = 0;
  let total = 0;
  for (let run = 0; run < 80; run++) {
    const boxes = [];
    const count = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      boxes.push(box((rand() - 0.5) * 900, (rand() - 0.5) * 900, 30 + rand() * 260, 30 + rand() * 260, 60 + rand() * 300));
    }
    const angle = rand() * Math.PI * 2;
    const speed = 40 + rand() * 660;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const start = 1500 + speed * 2;
    const path = (t) => ({ x: -dx * start + dx * speed * t, z: -dz * start + dz * speed * t });
    const seconds = (2 * start) / speed + 8;
    const { frames, glide } = fly({ boxes, path, seconds });
    assertNeverInside(frames, `stress run ${run}`);
    clamped += glide.diag.hardFrames;
    total += glide.diag.frames;
    assert.ok(frames[frames.length - 1].s < 1.05, `run ${run} returns to the set framing`);
  }
  assert.ok(clamped / total < 0.01, `emergency clamps are rare (${clamped}/${total} frames)`);
});

test('teleport into an interior: the first frame is already outside, no easing from inside', () => {
  const glide = createCameraGlide();
  const field = roofFieldOf([box(0, 0, 300, 300, 200)]);
  const s = stepCameraGlide(glide, 0, 0, 0, RX, RY, RZ, field);
  assert.ok(s * RY >= field(0, s * RZ, 0));
  assert.ok(s > 1);
});

test('empty space is inert: scale stays exactly 1 and costs no lift', () => {
  const { frames, glide } = fly({ boxes: [], path: line(800), seconds: 4 });
  assert.ok(frames.every((f) => f.s === 1));
  assert.equal(glide.diag.hardFrames, 0);
});

test('broken bounds beyond the ceiling are ignored', () => {
  const glide = createCameraGlide();
  const field = roofFieldOf([box(0, 0, 500, 500, 1.4e8)]);
  const s = stepCameraGlide(glide, 0, 0, 0, RX, RY, RZ, field, 14000);
  assert.equal(s, 1);
});

test('a roof that pops in for one frame does not fling the camera', () => {
  const glide = createCameraGlide();
  let present = false;
  const field = (x, z) => (present && Math.abs(x) < 400 && Math.abs(z) < 400 ? 300 : -Infinity);
  stepCameraGlide(glide, 0, 0, 0, RX, RY, RZ, field);
  for (let i = 0; i < 30; i++) stepCameraGlide(glide, DT, 0, 0, RX, RY, RZ, field);
  present = true;
  // The hard clamp is allowed to engage for a frame that really has a roof; what must not happen
  // is a permanent lift after it vanishes again.
  stepCameraGlide(glide, DT, 0, 0, RX, RY, RZ, field);
  present = false;
  let s = 0;
  for (let i = 0; i < 60 * 8; i++) s = stepCameraGlide(glide, DT, 0, 0, RX, RY, RZ, field);
  assert.ok(s < 1.05, `settles back to the set framing (s=${s.toFixed(3)})`);
});
