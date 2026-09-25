/**
 * #122 projectile-trails-quiet-empty-latch — portable quiet CPU.
 * Before = indexedTypeScan(projectiles) + entityIndexVersion + cache check
 *   + resetProjectileTrailDiag (7-class zero) every tick while empty.
 * After  = latch after first empty observe; wake on entityIndexVersion /
 *   _projectileCacheDirty only.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ITERS = 200000;
const RUNS = 13;

const DIAG_CLASSES = ['kinetic', 'rail', 'missile', 'plasma', 'pulse', 'emp', 'other'];

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
const DIAG_CLASSES = ${JSON.stringify(DIAG_CLASSES)};

function makeDiag() {
  const byClass = {};
  for (const c of DIAG_CLASSES) byClass[c] = { particles: 0, streaks: 0, sprites: 0 };
  return { candidates: 0, particlesSpawned: 0, streaksSpawned: 0, spritesSpawned: 0, byClass };
}
function resetDiag(diag) {
  diag.candidates = 0;
  diag.particlesSpawned = 0;
  diag.streaksSpawned = 0;
  diag.spritesSpawned = 0;
  for (let i = 0; i < DIAG_CLASSES.length; i++) {
    const t = diag.byClass[DIAG_CLASSES[i]];
    t.particles = 0; t.streaks = 0; t.sprites = 0;
  }
}
function indexedTypeScan(state, bucket) {
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true
    && typeof bucket === 'string' && Array.isArray(index[bucket])) {
    return index[bucket];
  }
  return (state && state.entityList) || [];
}
function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version
    : null;
}

function make() {
  return {
    state: {
      entityIndex: {
        __spacefaceEntityIndexV1: true,
        ready: true,
        version: 5,
        projectiles: [],
      },
      entityList: [],
    },
    _projectileCandidates: [],
    _projectileCacheDirty: false,
    _projectileListRef: null,
    _projectileListLength: -1,
    _projectileListVersion: -1,
    _projectileTrailDiag: makeDiag(),
    _projectileTrailsQuietEmpty: false,
    _projectileTrailsQuietIndexVersion: -1,
    refreshCalls: 0,
    resetCalls: 0,
  };
}

function refresh(sys) {
  sys.refreshCalls++;
  const list = indexedTypeScan(sys.state, 'projectiles');
  const version = entityIndexVersion(sys.state);
  if (!sys._projectileCacheDirty && sys._projectileListRef === list
    && sys._projectileListLength === list.length
    && sys._projectileListVersion === version) return;
  sys._projectileCandidates.length = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.alive || e.type !== 'projectile') continue;
    sys._projectileCandidates.push(e);
  }
  sys._projectileListRef = list;
  sys._projectileListLength = list.length;
  sys._projectileListVersion = version;
  sys._projectileCacheDirty = false;
}

function before(sys) {
  refresh(sys);
  const relevant = sys._projectileCandidates.length > 0;
  if (!relevant) {
    sys.resetCalls++;
    resetDiag(sys._projectileTrailDiag);
  }
  return relevant;
}

function after(sys) {
  if (sys._projectileTrailsQuietEmpty) {
    if (sys._projectileCacheDirty) {
      sys._projectileTrailsQuietEmpty = false;
    } else {
      const version = entityIndexVersion(sys.state);
      if (version == null || version !== sys._projectileTrailsQuietIndexVersion) {
        sys._projectileTrailsQuietEmpty = false;
      } else {
        return false;
      }
    }
  }
  refresh(sys);
  if (sys._projectileCandidates.length > 0) {
    sys._projectileTrailsQuietEmpty = false;
    return true;
  }
  sys.resetCalls++;
  resetDiag(sys._projectileTrailDiag);
  const version = entityIndexVersion(sys.state);
  if (version != null) {
    sys._projectileTrailsQuietEmpty = true;
    sys._projectileTrailsQuietIndexVersion = version;
  } else {
    sys._projectileTrailsQuietEmpty = false;
    sys._projectileTrailsQuietIndexVersion = -1;
  }
  return false;
}

const sys = make();
const fn = ${mode === 'before' ? 'before' : 'after'};
// Prime latch path for after so steady-state is measured.
if ('${mode}' === 'after') {
  after(sys);
}
sys.refreshCalls = 0;
sys.resetCalls = 0;
for (let i = 0; i < 20000; i++) fn(sys);
sys.refreshCalls = 0;
sys.resetCalls = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(sys);
const ms = performance.now() - t0;
process.stdout.write(JSON.stringify({
  ms,
  mode: '${mode}',
  refreshCalls: sys.refreshCalls,
  resetCalls: sys.resetCalls,
  quiet: !!sys._projectileTrailsQuietEmpty,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'bench child failed');
  }
  return JSON.parse(r.stdout);
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  pairs.push({
    beforeMs: b.ms,
    afterMs: a.ms,
    speedup: b.ms / a.ms,
    beforeRefresh: b.refreshCalls,
    afterRefresh: a.refreshCalls,
    beforeReset: b.resetCalls,
    afterReset: a.resetCalls,
  });
}
pairs.sort((x, y) => x.speedup - y.speedup);
const median = pairs[(pairs.length - 1) >> 1].speedup;
const out = {
  name: 'projectile-trails-quiet-empty-latch',
  primary: 'quiet-projectile-trails-empty-relevant',
  iterations: ITERS,
  runs: RUNS,
  pairs,
  medianSpeedup: median,
  minSpeedup: pairs[0].speedup,
  maxSpeedup: pairs[pairs.length - 1].speedup,
};
writeFileSync(
  'artifacts/projectile-trails-quiet-empty-latch-microbench.json',
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify({
  medianSpeedup: +median.toFixed(3),
  minSpeedup: +pairs[0].speedup.toFixed(3),
  maxSpeedup: +pairs[pairs.length - 1].speedup.toFixed(3),
  afterRefreshMedian: pairs[(pairs.length - 1) >> 1].afterRefresh,
  afterResetMedian: pairs[(pairs.length - 1) >> 1].afterReset,
}, null, 2));
