/**
 * Primary KPI: seam markers quiet path — relevant asteroid walk + sleep commit.
 * Before = walk 11 rocks for seams + commitDynamicBufferOwner(0) every tick.
 * After  = latch after first quiet sleep; skip relevant+commit until dirty wake.
 * Dirty wake proof: player quantum move clears latch into full relevant.
 * Soft-GPU fps not claimed. Picture unchanged while no seams in range.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const ROCKS = 11;
const BINDINGS = 4;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ROCKS = ${ROCKS};
const BINDINGS = ${BINDINGS};
const ITERS = ${ITERS};

function makeOwner() {
  return {
    invalid: false, disposed: false, mesh: { count: 0 }, capacity: 64,
    touched: false, logicalGeneration: 0,
    diagnostics: { activeCount: 0, pendingGeneration: 0 },
    bindings: Array.from({ length: BINDINGS }, () => ({
      pending: { start: 0, end: 0, capacity: 64, logicalComponents: 0 },
      touchedSinceCommit: false, itemSize: 3,
    })),
  };
}
function commit(owner, activeCount) {
  owner.mesh.count = activeCount;
  owner.diagnostics.activeCount = activeCount;
  if (owner.touched) owner.logicalGeneration++;
  for (let index = 0; index < owner.bindings.length; index++) {
    const binding = owner.bindings[index];
    const componentLimit = Math.min(binding.pending.capacity, activeCount * binding.itemSize);
    if (binding.pending.start >= componentLimit) {
      binding.pending.start = 0; binding.pending.end = 0; binding.pending.logicalComponents = 0;
    } else if (binding.pending.end > componentLimit) {
      binding.pending.end = componentLimit;
    }
    if (binding.touchedSinceCommit) {
      binding.touchedSinceCommit = false;
      owner.diagnostics.pendingGeneration = owner.logicalGeneration;
    }
  }
  owner.touched = false;
  return true;
}

function seamRelevant(host) {
  const player = host.player;
  const px = player.pos.x, pz = player.pos.z;
  const range2 = host.drawWu * host.drawWu;
  const list = host.rocks;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.alive || e.type !== 'asteroid') continue;
    const seams = e.data && e.data.seams;
    if (!seams || !seams.length) continue;
    const dx = e.pos.x - px, dz = e.pos.z - pz;
    if (dx * dx + dz * dz <= range2) return true;
  }
  return false;
}

function sleepSeam(host) {
  const sm = host._seamMarkers;
  if (!sm || !sm.mesh) return;
  if (!commit(sm.dynamicBufferOwner, 0) && sm.mesh.count) sm.mesh.count = 0;
  host.sleeps++;
}

function latch(host) {
  const cell = Math.max(16, host.drawWu * 0.1);
  host._seamMarkersQuietPlayerQX = Math.round(host.player.pos.x / cell);
  host._seamMarkersQuietPlayerQZ = Math.round(host.player.pos.z / cell);
  host._seamMarkersQuietIndexVersion = host.indexVersion;
  host._seamMarkersQuietDrawWu = host.drawWu;
  host._seamMarkersQuietPulseKey = '';
  host._seamMarkersQuietAt = host.simTime;
  host._seamMarkersQuietHidden = true;
}

function maybeAwake(host) {
  if (host.drawWu !== host._seamMarkersQuietDrawWu) return true;
  if (host.indexVersion !== host._seamMarkersQuietIndexVersion) return true;
  if (host.simTime - (host._seamMarkersQuietAt || 0) > 0.35) return true;
  const cell = Math.max(16, host.drawWu * 0.1);
  const qx = Math.round(host.player.pos.x / cell);
  const qz = Math.round(host.player.pos.z / cell);
  if (qx !== host._seamMarkersQuietPlayerQX || qz !== host._seamMarkersQuietPlayerQZ) return true;
  return false;
}

function tickBefore(host) {
  if (seamRelevant(host)) {
    host._seamMarkersWereRelevant = true;
    host.wakes++;
    return;
  }
  host._seamMarkersWereRelevant = false;
  sleepSeam(host);
}

function tickAfter(host) {
  if (host._seamMarkersQuietHidden && !maybeAwake(host)) {
    host.skips++;
    return;
  }
  if (seamRelevant(host)) {
    host._seamMarkersWereRelevant = true;
    host._seamMarkersQuietHidden = false;
    host.wakes++;
    return;
  }
  host._seamMarkersWereRelevant = false;
  sleepSeam(host);
  latch(host);
}

function makeHost() {
  // Rocks far outside drawWu so quiet path is the settled case.
  const rocks = Array.from({ length: ROCKS }, (_, i) => ({
    alive: true, type: 'asteroid',
    pos: { x: 2000 + i * 40, z: 2000 + i * 15 },
    data: { seams: [{ localOffset: { x: 1, z: 0 } }] },
  }));
  return {
    player: { pos: { x: 0, z: 0 } },
    drawWu: 400,
    rocks,
    indexVersion: 1,
    simTime: 0,
    _seamMarkers: { mesh: { count: 0 }, dynamicBufferOwner: makeOwner() },
    _seamMarkersWereRelevant: false,
    _seamMarkersQuietHidden: false,
    _seamMarkersQuietPlayerQX: 0,
    _seamMarkersQuietPlayerQZ: 0,
    _seamMarkersQuietIndexVersion: null,
    _seamMarkersQuietDrawWu: 0,
    _seamMarkersQuietPulseKey: '',
    _seamMarkersQuietAt: 0,
    sleeps: 0, skips: 0, wakes: 0,
  };
}

const mode = ${JSON.stringify(mode)};
const host = makeHost();
const fn = mode === 'before' ? tickBefore : tickAfter;
for (let i = 0; i < 3000; i++) {
  host.simTime = i * 0.001; // stay under 0.35s re-probe during warmup for after
  fn(host);
}
// Freeze simTime for after so periodic re-probe does not fire during KPI window.
host.simTime = host._seamMarkersQuietAt;
host.sleeps = 0; host.skips = 0; host.wakes = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(host);
const ms = performance.now() - t0;

// Dirty-wake proof (after only): move player across a quantum cell.
let wakeProof = null;
if (mode === 'after') {
  const proof = makeHost();
  for (let i = 0; i < 10; i++) { proof.simTime = i * 0.001; tickAfter(proof); }
  const skipped = proof.skips;
  proof.player.pos.x += Math.max(16, proof.drawWu * 0.1) + 1;
  proof.wakes = 0; proof.skips = 0;
  // Place a seamed rock inside range so relevant returns true after wake.
  proof.rocks[0].pos.x = proof.player.pos.x + 10;
  proof.rocks[0].pos.z = proof.player.pos.z;
  tickAfter(proof);
  wakeProof = {
    latchedSkips: skipped,
    woke: proof.wakes === 1 && proof._seamMarkersQuietHidden === false,
    wakes: proof.wakes,
    hidden: proof._seamMarkersQuietHidden,
  };
}

console.log(JSON.stringify({
  ms, sleeps: host.sleeps, skips: host.skips, wakes: host.wakes,
  hidden: !!host._seamMarkersQuietHidden, mode, wakeProof,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(`child failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = xs.slice().sort((x, y) => x - y);
  const m = (a.length - 1) / 2;
  return a.length % 2 ? a[m | 0] : (a[m | 0] + a[(m | 0) + 1]) / 2;
}

const pairs = [];
let wakeProof = null;
for (let run = 0; run < RUNS; run++) {
  const before = runOnce('before');
  const after = runOnce('after');
  if (after.wakeProof) wakeProof = after.wakeProof;
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / after.ms,
    beforeSleeps: before.sleeps,
    afterSkips: after.skips,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'seam-markers-quiet-hide-latch',
  primary: 'quiet-seam-relevant-plus-sleep',
  iterations: ITERS,
  runs: RUNS,
  rocks: ROCKS,
  pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  wakeProof,
};
writeFileSync('artifacts/seam-markers-quiet-hide-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  maxSpeedup: out.maxSpeedup,
  wakeProof: out.wakeProof,
}, null, 2));
