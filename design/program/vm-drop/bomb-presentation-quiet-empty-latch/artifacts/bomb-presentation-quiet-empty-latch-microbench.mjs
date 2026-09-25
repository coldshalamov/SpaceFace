/**
 * Primary KPI: BombPresentationBatch.update when owner exists, bombs index empty.
 * Before = frustum rebuild + a11y + empty walk + setDrawRange(0)/visible=false every tick.
 * After  = latch after first empty publish; wake on entityIndexVersion.
 * Soft-GPU fps not claimed. Picture unchanged (mesh already invisible).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
function makeBatch() {
  return {
    count: 0,
    mesh: { visible: false },
    frustumWork: 0,
    a11yWork: 0,
    walks: 0,
    skips: 0,
    publishes: 0,
    _quietEmpty: false,
    _quietVersion: -1,
    stats: { bombs: 0, vertices: 0, drawCalls: 0, overflow: 0 },
    clip: new Float64Array(16),
  };
}
function multiply(out, a, b) {
  for (let i = 0; i < 16; i++) out[i] = a[i % 4] * b[(i / 4) | 0] + 0.0001 * i;
}
function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version : null;
}
function updateBefore(batch, state, source) {
  batch.walks++;
  batch.count = 0;
  const stats = batch.stats;
  stats.bombs = stats.vertices = stats.drawCalls = stats.overflow = 0;
  const ox = state.world.frameOrigin.x, oz = state.world.frameOrigin.z;
  batch.frustumWork++;
  const cam = state.render.camera;
  cam.updateMatrixWorld();
  multiply(batch.clip, cam.projection, cam.view);
  batch.a11yWork++;
  const brightness = state.settings.accessibility.id === 'full' ? 1 : 0.62;
  for (let i = 0; i < source.length; i++) {
    const bomb = source[i];
    if (!bomb || !bomb.alive || bomb.type !== 'bomb' || !bomb.data || !bomb.pos) continue;
    stats.bombs++;
    batch.count += 90;
  }
  batch.mesh.visible = batch.count > 0;
  stats.vertices = batch.count;
  stats.drawCalls = batch.count > 0 ? 1 : 0;
  batch.publishes++;
  return batch.count + ox * 0 + oz * 0 + brightness * 0;
}
function updateAfter(batch, state, source) {
  const version = entityIndexVersion(state);
  if (batch._quietEmpty) {
    if (version != null && version === batch._quietVersion) { batch.skips++; return 0; }
    batch._quietEmpty = false;
  }
  batch.walks++;
  batch.count = 0;
  const stats = batch.stats;
  stats.bombs = stats.vertices = stats.drawCalls = stats.overflow = 0;
  const ox = state.world.frameOrigin.x, oz = state.world.frameOrigin.z;
  batch.frustumWork++;
  const cam = state.render.camera;
  cam.updateMatrixWorld();
  multiply(batch.clip, cam.projection, cam.view);
  batch.a11yWork++;
  const brightness = state.settings.accessibility.id === 'full' ? 1 : 0.62;
  for (let i = 0; i < source.length; i++) {
    const bomb = source[i];
    if (!bomb || !bomb.alive || bomb.type !== 'bomb' || !bomb.data || !bomb.pos) continue;
    stats.bombs++;
    batch.count += 90;
  }
  batch.mesh.visible = batch.count > 0;
  stats.vertices = batch.count;
  stats.drawCalls = batch.count > 0 ? 1 : 0;
  batch.publishes++;
  if (batch.count === 0 && version != null) {
    batch._quietEmpty = true;
    batch._quietVersion = version;
  } else {
    batch._quietEmpty = false;
  }
  return batch.count + ox * 0 + oz * 0 + brightness * 0;
}
const batch = makeBatch();
const source = [];
const state = {
  world: { frameOrigin: { x: 0, z: 0 } },
  settings: { video: {}, accessibility: { id: 'full' } },
  render: {
    camera: {
      projection: new Float64Array(16),
      view: new Float64Array(16),
      updateMatrixWorld() { this._uw = (this._uw || 0) + 1; },
    },
  },
  entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 7, bombs: source },
};
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 3000; i++) fn(batch, state, source);
batch.walks = 0; batch.skips = 0; batch.publishes = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(batch, state, source);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, walks: batch.walks, skips: batch.skips,
  publishes: batch.publishes, quiet: !!batch._quietEmpty, count: batch.count,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = xs.slice().sort((x, y) => x - y);
  const m = (a.length - 1) / 2;
  return a.length % 2 ? a[m | 0] : (a[m | 0] + a[(m | 0) + 1]) / 2;
}

function proveDirtyWake() {
  const script = `
function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version : null;
}
function makeBatch() {
  return {
    count: 0, mesh: { visible: false }, clip: new Float64Array(16),
    _quietEmpty: false, _quietVersion: -1,
    stats: { bombs: 0, vertices: 0, drawCalls: 0, overflow: 0 },
    walks: 0, skips: 0,
  };
}
function multiply(out, a, b) {
  for (let i = 0; i < 16; i++) out[i] = a[i % 4] * b[(i / 4) | 0] + 0.0001 * i;
}
function update(batch, state, source) {
  const version = entityIndexVersion(state);
  if (batch._quietEmpty) {
    if (version != null && version === batch._quietVersion) { batch.skips++; return 0; }
    batch._quietEmpty = false;
  }
  batch.walks++;
  batch.count = 0;
  const stats = batch.stats;
  stats.bombs = stats.vertices = stats.drawCalls = stats.overflow = 0;
  multiply(batch.clip, state.render.camera.projection, state.render.camera.view);
  for (let i = 0; i < source.length; i++) {
    const bomb = source[i];
    if (!bomb || !bomb.alive || bomb.type !== 'bomb') continue;
    stats.bombs++; batch.count += 90;
  }
  batch.mesh.visible = batch.count > 0;
  if (batch.count === 0 && version != null) {
    batch._quietEmpty = true;
    batch._quietVersion = version;
  } else batch._quietEmpty = false;
  return batch.count;
}
const batch = makeBatch();
const source = [];
const state = {
  render: { camera: { projection: new Float64Array(16), view: new Float64Array(16) } },
  entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 1, bombs: source },
};
update(batch, state, source);
update(batch, state, source);
const latched = batch._quietEmpty === true && batch.skips === 1;
source.push({ id: 9, alive: true, type: 'bomb', pos: { x: 1, z: 2 }, data: {} });
state.entityIndex.version = 2;
update(batch, state, source);
const woke = batch._quietEmpty === false && batch.count > 0 && batch.walks === 2;
source.length = 0;
state.entityIndex.version = 3;
update(batch, state, source);
update(batch, state, source);
const relatch = batch._quietEmpty === true && batch.skips === 2;
console.log(JSON.stringify({ ok: latched && woke && relatch, latched, woke, relatch, walks: batch.walks, skips: batch.skips, count: batch.count }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'wake failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let run = 0; run < RUNS; run++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / Math.max(1e-9, after.ms),
    beforeWalks: before.walks,
    afterSkips: after.skips,
    afterWalks: after.walks,
  });
}
const speedups = pairs.map((p) => p.speedup);
const wake = proveDirtyWake();
const out = {
  name: 'bomb-presentation-quiet-empty-latch',
  primary: 'quiet-bomb-telegraph-empty-after-owner',
  iterations: ITERS,
  runs: RUNS,
  pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  dirtyWake: wake,
};
writeFileSync('artifacts/bomb-presentation-quiet-empty-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  name: out.name,
  medianSpeedup: +out.medianSpeedup.toFixed(3),
  minSpeedup: +out.minSpeedup.toFixed(3),
  maxSpeedup: +out.maxSpeedup.toFixed(3),
  dirtyWake: wake,
}, null, 2));
