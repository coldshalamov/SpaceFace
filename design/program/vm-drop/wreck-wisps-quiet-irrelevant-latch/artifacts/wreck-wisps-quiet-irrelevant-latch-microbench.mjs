/**
 * Primary KPI: quiet wreck-wisps path when wrecks bucket empty (Map always exists).
 * Before = player resolve + indexedTypeScan + Map.clear every tick.
 * After  = latch after first empty observe; wake on entityIndexVersion only.
 * Soft-GPU fps not claimed. Picture unchanged (no wisps while empty).
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
const hostPlayer = { id: 1, alive: true, pos: { x: 0, z: 0 } };
function makeHost() {
  return {
    _wreckWispSlots: new Map(),
    _cadenceWreckWisps: 0,
    _wreckWispsQuietIdle: false,
    _wreckWispsQuietIndexVersion: -1,
    walks: 0,
    skips: 0,
    clears: 0,
    helpers: { player() { return hostPlayer; } },
    state: {
      playerId: 1,
      entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 3, wrecks: [] },
    },
  };
}
function indexedTypeScan(state, bucket) {
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready && Array.isArray(index[bucket])) {
    return index[bucket];
  }
  return [];
}
function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  if (!index || !index.__spacefaceEntityIndexV1 || index.ready !== true) return null;
  return index.version;
}
function before(host) {
  host.walks++;
  const state = host.state;
  const player = host.helpers.player();
  if (!player || !player.alive || !player.pos) return 0;
  const relevant = indexedTypeScan(state, 'wrecks').length > 0;
  if (relevant) return 1;
  host._cadenceWreckWisps = 0;
  if (host._wreckWispSlots) { host._wreckWispSlots.clear(); host.clears++; }
  return 0;
}
function after(host) {
  const version = entityIndexVersion(host.state);
  if (host._wreckWispsQuietIdle) {
    if (version != null && version === host._wreckWispsQuietIndexVersion) {
      host.skips++;
      return 0;
    }
    host._wreckWispsQuietIdle = false;
  }
  host.walks++;
  const state = host.state;
  const player = host.helpers.player();
  if (!player || !player.alive || !player.pos) {
    host._wreckWispsQuietIdle = false;
    return 0;
  }
  if (indexedTypeScan(state, 'wrecks').length > 0) {
    host._wreckWispsQuietIdle = false;
    return 1;
  }
  host._cadenceWreckWisps = 0;
  if (host._wreckWispSlots) { host._wreckWispSlots.clear(); host.clears++; }
  if (version != null) {
    host._wreckWispsQuietIdle = true;
    host._wreckWispsQuietIndexVersion = version;
  } else {
    host._wreckWispsQuietIdle = false;
    host._wreckWispsQuietIndexVersion = -1;
  }
  return 0;
}
const host = makeHost();
const fn = ${JSON.stringify(mode)} === 'before' ? before : after;
for (let i = 0; i < 3000; i++) fn(host);
host.walks = 0; host.skips = 0; host.clears = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(host);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, walks: host.walks, skips: host.skips,
  clears: host.clears, quiet: !!host._wreckWispsQuietIdle,
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
const hostPlayer = { id: 1, alive: true, pos: { x: 0, z: 0 } };
const host = {
  _wreckWispSlots: new Map([[9, 1]]),
  _cadenceWreckWisps: 1,
  _wreckWispsQuietIdle: false,
  _wreckWispsQuietIndexVersion: -1,
  walks: 0, skips: 0, clears: 0,
  helpers: { player() { return hostPlayer; } },
  state: { entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 3, wrecks: [] } },
};
function indexedTypeScan(state, bucket) {
  return state.entityIndex[bucket] || [];
}
function entityIndexVersion(state) {
  return state.entityIndex.version;
}
function step() {
  const version = entityIndexVersion(host.state);
  if (host._wreckWispsQuietIdle) {
    if (version != null && version === host._wreckWispsQuietIndexVersion) {
      host.skips++;
      return 0;
    }
    host._wreckWispsQuietIdle = false;
  }
  host.walks++;
  const player = host.helpers.player();
  if (!player || !player.alive || !player.pos) return 0;
  if (indexedTypeScan(host.state, 'wrecks').length > 0) {
    host._wreckWispsQuietIdle = false;
    return 1;
  }
  host._cadenceWreckWisps = 0;
  if (host._wreckWispSlots) { host._wreckWispSlots.clear(); host.clears++; }
  host._wreckWispsQuietIdle = true;
  host._wreckWispsQuietIndexVersion = version;
  return 0;
}
step(); step();
const latched = host._wreckWispsQuietIdle && host.skips === 1 && host.clears === 1;
host.state.entityIndex.wrecks = [{ id: 2, type: 'wreck', alive: true, pos: { x: 1, z: 1 } }];
host.state.entityIndex.version = 4;
step();
const woke = !host._wreckWispsQuietIdle && host.walks === 2;
host.state.entityIndex.wrecks = [];
host.state.entityIndex.version = 5;
step(); step();
const relatch = host._wreckWispsQuietIdle && host.skips === 2;
console.log(JSON.stringify({ ok: latched && woke && relatch, latched, woke, relatch, walks: host.walks, skips: host.skips, clears: host.clears }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'wake prove failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let run = 0; run < RUNS; run++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / after.ms,
    beforeWalks: before.walks,
    afterWalks: after.walks,
    afterSkips: after.skips,
    beforeClears: before.clears,
    afterClears: after.clears,
  });
}
const speedups = pairs.map((p) => p.speedup);
const wake = proveDirtyWake();
const out = {
  name: 'wreck-wisps-quiet-irrelevant-latch',
  primary: 'quiet-wreck-wisps-empty-bucket-version-wake',
  iterations: ITERS,
  runs: RUNS,
  pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  dirtyWake: wake,
  note: 'Prior hold modeled a wake that still re-scanned while latched (~0.96×). Version-only wake matches #115 loot-magnet. Soft-GPU fps not claimed.',
};
writeFileSync('artifacts/wreck-wisps-quiet-irrelevant-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  maxSpeedup: out.maxSpeedup,
  dirtyWake: wake,
}, null, 2));
