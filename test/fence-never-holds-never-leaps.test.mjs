// ENGINE slice 1 — the picture never holds dead and never leaps. A body cruising and turning at
// 195 wu/s through a worker silence of 300 / 700 / 1500 ms (the worker blocked: no sim time
// passes, the stream resumes where it stopped) and through a 400 ms delivery burst (the sim kept
// running, the backlog lands at once) is drawn the way the renderer draws it: fence pose plus the
// fence's correction blend. Contract: no held run >= 100 ms, no per-frame jump beyond the body's
// own continuation by more than a few wu, and no re-seat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applySnapshotPoseToMesh, createSnapshotFence } from '../src/render/snapshotFence.js';

const ID = 7;
const DT = 1 / 60;
const SPEED = 195;
const FPS = 30;

function run({ silenceMs = 0, burstMs = 0 }) {
  const fence = createSnapshotFence({ capacity: 4 });
  const mesh = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} };
  let sim = 0;
  let x = 0;
  let z = 0;
  let heading = 0;
  const pack = () => {
    const s = fence.beginPack(1, sim, 0);
    s.write(ID, 0, x, 0, z, 0, Math.sin(-heading / 2), 0, Math.cos(-heading / 2), 1, 1, 1, 1, 0);
    fence.commit();
  };
  const stepSim = () => {
    if (sim > 2.5) heading += 1.2 * DT;
    x += Math.cos(heading) * SPEED * DT;
    z += Math.sin(heading) * SPEED * DT;
    sim += DT;
  };
  const wdt = 1 / FPS;
  let wall = 0;
  let prev = null;
  let prevStep = null;
  let stillMs = 0;
  let maxStillMs = 0;
  let maxShock = 0;
  const scratch = {};
  for (let frame = 0; frame < FPS * 8; frame++) {
    wall += wdt;
    const inSilence = silenceMs > 0 && wall >= 3 && wall < 3 + silenceMs / 1000;
    const inBurst = burstMs > 0 && wall >= 3 && wall < 3 + burstMs / 1000;
    if (!inSilence) {
      for (let k = 0; k < 2; k++) stepSim();
      if (!inBurst) pack();
    }
    const alpha = fence.samplePresentationAlpha(wdt, 0, DT, 1, wdt);
    applySnapshotPoseToMesh(mesh, fence.latestSnapshot(), ID, { x: 0, z: 0 }, fence.previousSnapshot(), alpha);
    fence.beginBlendFrame(wdt);
    const drawn = fence.blendDrawnPose(ID, 0, mesh.position.x, mesh.position.z, mesh.rotation.y, scratch);
    if (prev) {
      const sx = drawn.x - prev[0];
      const sz = drawn.z - prev[1];
      if (prevStep && wall > 1.5) maxShock = Math.max(maxShock, Math.hypot(sx - prevStep[0], sz - prevStep[1]));
      if (Math.hypot(sx, sz) < 0.01) {
        stillMs += wdt * 1000;
        maxStillMs = Math.max(maxStillMs, stillMs);
      } else {
        stillMs = 0;
      }
      prevStep = [sx, sz];
    }
    prev = [drawn.x, drawn.z];
  }
  return { maxStillMs, maxShock, gapResets: fence.getPlayoutDiagnostics().gapResets };
}

for (const silenceMs of [300, 700, 1500]) {
  test(`a ${silenceMs} ms worker silence glides: never held, never a leap`, () => {
    const r = run({ silenceMs });
    assert.ok(r.maxStillMs < 100, `held ${r.maxStillMs} ms`);
    // One frame of cruise is 6.5 wu; a turning body's own frame-to-frame change is ~1.3 wu.
    assert.ok(r.maxShock < 3, `worst per-frame jump beyond continuation ${r.maxShock.toFixed(2)} wu`);
    assert.equal(r.gapResets, 0);
  });
}

test('a 400 ms delivery burst is caught up, not re-seated or leapt', () => {
  const r = run({ burstMs: 400 });
  assert.ok(r.maxStillMs < 100, `held ${r.maxStillMs} ms`);
  // The burst's coast-to-truth offset heals exponentially (first heal frame is the largest);
  // bound it well under the old one-frame re-seat (~60+ wu at this speed).
  assert.ok(r.maxShock < 4, `worst per-frame jump beyond continuation ${r.maxShock.toFixed(2)} wu`);
  assert.equal(r.gapResets, 0);
});

// ENGINE slice 3 — the player's ship (the lead body) is drawn at the stream's estimated now, a
// whole playout delay ahead of the interpolated world, and still never holds or leaps.
test('the lead body plays ahead of the delayed world by about the playout delay, smoothly', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  fence.setLeadEntity(ID);
  const OTHER = 9;
  let sim = 0;
  const pack = () => {
    const s = fence.beginPack(2, sim, 0);
    s.write(ID, 0, SPEED * sim, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
    s.write(OTHER, 0, SPEED * sim, 0, 50, 0, 0, 0, 1, 1, 1, 1, 0);
    fence.commit();
  };
  const wdt = 1 / FPS;
  let prev = null;
  let maxStillMs = 0;
  let still = 0;
  let lead = [];
  for (let frame = 0; frame < FPS * 6; frame++) {
    const silent = frame >= FPS * 3 && frame < FPS * 3 + 45; // a 1500 ms worker silence
    if (!silent) { sim += 2 * DT; pack(); }
    fence.samplePresentationAlpha(wdt, 0, DT, 1, wdt);
    fence.beginBlendFrame(wdt);
    const me = fence.presentedRawPose(ID, {});
    const other = fence.presentedRawPose(OTHER, {});
    assert.ok(fence.leadActive(ID) && !fence.leadActive(OTHER));
    const d = fence.blendDrawnPose(ID, 0, me.x, me.z, me.rot, {});
    if (frame > FPS * 2 && !silent) lead.push(me.x - other.x);
    if (prev !== null && frame > FPS) {
      if (d.x - prev < 0.01) { still += wdt * 1000; maxStillMs = Math.max(maxStillMs, still); } else still = 0;
      assert.ok(d.x - prev > -1e-6, `the lead body never steps back (frame ${frame})`);
    }
    prev = d.x;
  }
  lead.sort((a, b) => a - b);
  const p50 = lead[lead.length >> 1];
  const delayMs = fence.getPlayoutDiagnostics().playoutDelayMs;
  assert.ok(p50 > SPEED * 0.02, `the lead body plays ahead of the world (${p50.toFixed(1)} wu, delay ${delayMs.toFixed(0)} ms)`);
  assert.ok(maxStillMs < 100, `held ${maxStillMs} ms`);
});
