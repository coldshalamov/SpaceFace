/**
 * Proxy: quiet FieldForcePresentation residual under prepareFrame / vfx.
 * Before = every idle tick (no fields.active, all slots empty) still pays
 *   frustum rebuild + 10-slot reserved walk + batch.begin + commitDynamicBufferOwner(0).
 * After  = quiet latch after first empty publish; wake when active.length>0 or any slot live.
 * Soft-GPU fps not claimed. Picture unchanged (mesh already count=0/visible=false).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const SLOTS = 10;
const BINDINGS = 9;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
const SLOTS = ${SLOTS};
const BINDINGS = ${BINDINGS};

function assertWritable(owner) {
  if (!owner || owner.invalid) throw new Error('invalid');
  owner.asserts++;
}
function commitOwner(owner, count) {
  owner.commits++;
  owner.lastCount = count;
  for (let b = 0; b < BINDINGS; b++) owner.bindings[b]++;
}
function makeHost() {
  const slots = Array.from({ length: SLOTS }, () => ({
    id: null, seedId: null, kind: null, release: -1, seen: false, reserved: false,
  }));
  return {
    quiet: false,
    skips: 0,
    walks: 0,
    commits: 0,
    time: 0,
    frame: 0,
    slots,
    stats: { active: 0, releasing: 0, surfaces: 0, dropped: 0, unknown: 0, culled: 0 },
    owner: { invalid: false, asserts: 0, commits: 0, lastCount: 0, bindings: new Uint32Array(BINDINGS) },
    mesh: { count: 0, visible: false },
    frustumWork: 0,
    projection: new Float64Array(16),
    view: new Float64Array(16),
    state: {
      simTime: 0,
      settings: { video: {}, accessibility: {} },
      render: {
        camera: {
          projectionMatrix: { elements: new Float64Array(16) },
          matrixWorldInverse: { elements: new Float64Array(16) },
        },
      },
      fields: { active: [] },
      massSeed: null,
    },
  };
}
function multiply(out, a, b) {
  for (let i = 0; i < 16; i++) out[i] = a[i % 4] * b[(i / 4) | 0] + 0.0001 * i;
}
function setFrustum(h) {
  h.frustumWork++;
  const cam = h.state.render.camera;
  multiply(h.projection, cam.projectionMatrix.elements, cam.matrixWorldInverse.elements);
}
function anySlotLive(h) {
  for (let i = 0; i < h.slots.length; i++) {
    if (h.slots[i].id != null) return true;
  }
  return false;
}
function maybeAwake(h) {
  const list = h.state.fields && h.state.fields.active;
  if (Array.isArray(list) && list.length > 0) return true;
  if (h.state.massSeed) return true;
  return anySlotLive(h);
}
function before(h, dt) {
  h.walks++;
  h.time += dt;
  h.frame++;
  const video = h.state.settings.video;
  const a11y = h.state.settings.accessibility;
  const motion = !!(video.motionReduce || a11y.reducedMotion);
  const flash = !!(video.flashReduce || a11y.flashReduce);
  const stats = h.stats;
  stats.active = 0; stats.releasing = 0; stats.dropped = 0; stats.unknown = 0; stats.culled = 0;
  setFrustum(h);
  const list = h.state.fields.active;
  const count = list.length;
  for (const s of h.slots) {
    s.seen = false; s.reserved = false;
    for (let i = 0; i < count; i++) {
      if (list[i] && s.id === list[i].id) { s.reserved = true; break; }
    }
  }
  // batch.begin
  let batchCount = 0;
  // no surfaces
  // batch.end → commit(0)
  assertWritable(h.owner);
  commitOwner(h.owner, batchCount);
  h.mesh.count = batchCount;
  h.mesh.visible = batchCount > 0;
  h.commits++;
  stats.surfaces = batchCount;
  return stats;
}
function after(h, dt) {
  if (h.quiet) {
    if (!maybeAwake(h)) { h.skips++; return h.stats; }
    h.quiet = false;
  }
  h.walks++;
  h.time += dt;
  h.frame++;
  const video = h.state.settings.video;
  const a11y = h.state.settings.accessibility;
  const motion = !!(video.motionReduce || a11y.reducedMotion);
  const flash = !!(video.flashReduce || a11y.flashReduce);
  const stats = h.stats;
  stats.active = 0; stats.releasing = 0; stats.dropped = 0; stats.unknown = 0; stats.culled = 0;
  setFrustum(h);
  const list = h.state.fields.active;
  const count = list.length;
  for (const s of h.slots) {
    s.seen = false; s.reserved = false;
    for (let i = 0; i < count; i++) {
      if (list[i] && s.id === list[i].id) { s.reserved = true; break; }
    }
  }
  let batchCount = 0;
  assertWritable(h.owner);
  commitOwner(h.owner, batchCount);
  h.mesh.count = batchCount;
  h.mesh.visible = batchCount > 0;
  h.commits++;
  stats.surfaces = batchCount;
  if (count === 0 && !anySlotLive(h) && batchCount === 0) {
    h.quiet = true;
  }
  return stats;
}
const h = makeHost();
const fn = ${JSON.stringify(mode)} === 'before' ? before : after;
for (let i = 0; i < 3000; i++) fn(h, 0.016);
h.skips = 0; h.walks = 0; h.commits = 0; h.frustumWork = 0; h.owner.commits = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(h, 0.016);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, skips: h.skips, walks: h.walks,
  commits: h.commits, ownerCommits: h.owner.commits, frustum: h.frustumWork, quiet: h.quiet,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}

function dirtyWakeProof() {
  const script = `
import { performance } from 'node:perf_hooks';
let quiet = false;
let walks = 0;
let skips = 0;
const slots = [{ id: null }];
const state = { fields: { active: [] }, massSeed: null };
function anyLive() { return slots[0].id != null; }
function awake() {
  if (state.fields.active.length > 0) return true;
  if (state.massSeed) return true;
  return anyLive();
}
function tick() {
  if (quiet) {
    if (!awake()) { skips++; return 'skip'; }
    quiet = false;
  }
  walks++;
  if (state.fields.active.length === 0 && !anyLive()) quiet = true;
  return 'walk';
}
for (let i = 0; i < 100; i++) tick();
const latched = quiet === true && skips > 50;
state.fields.active.push({ id: 1, kind: 'well' });
const woke = tick() === 'walk' && quiet === false;
slots[0].id = null;
state.fields.active.length = 0;
tick(); // re-latch
const relatch = quiet === true;
console.log(JSON.stringify({ ok: latched && woke && relatch, latched, woke, relatch, walks, skips }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'wake failed');
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  pairs.push({
    beforeMs: b.ms, afterMs: a.ms, speedup: b.ms / a.ms,
    beforeWalks: b.walks, afterSkips: a.skips, afterWalks: a.walks,
    beforeCommits: b.ownerCommits, afterCommits: a.ownerCommits,
  });
}
pairs.sort((x, y) => x.speedup - y.speedup);
const mid = pairs[Math.floor(pairs.length / 2)];
const wake = dirtyWakeProof();
const out = {
  name: 'field-force-quiet-empty-latch',
  primary: 'quiet-field-force-empty-frustum+commit0',
  iterations: ITERS,
  runs: RUNS,
  pairs,
  medianSpeedup: +mid.speedup.toFixed(3),
  minSpeedup: +pairs[0].speedup.toFixed(3),
  maxSpeedup: +pairs[pairs.length - 1].speedup.toFixed(3),
  dirtyWake: wake,
};
writeFileSync('artifacts/field-force-quiet-empty-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
