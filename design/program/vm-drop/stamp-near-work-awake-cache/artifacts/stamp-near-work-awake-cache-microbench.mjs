import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SHIPS = 80;
const ITERS = 80000;
const RUNS = 11;
const BUDGET = 16;
const mode = process.argv[2] || 'all';

function ownerAiRecord(owner) {
  if (!owner) return null;
  if (owner.ai && typeof owner.ai === 'object') return owner.ai;
  const data = owner.data;
  if (data && data.ai && typeof data.ai === 'object') return data.ai;
  return null;
}

function ownerIsAlwaysAwake(owner, state) {
  if (!owner) return false;
  if (owner.isPlayer === true || (state && owner.id === state.playerId)) return true;
  const ai = ownerAiRecord(owner);
  if (ai && ai.combatant === true) return true;
  const slot = owner.data && owner.data.activityActorSlotId;
  return slot != null && slot !== '';
}

function makeShips() {
  const ships = [];
  for (let i = 0; i < SHIPS; i++) {
    const combatant = i < 3;
    const player = i === 0;
    ships.push({
      id: i + 1,
      alive: true,
      isPlayer: player,
      ai: combatant && !player ? { combatant: true } : null,
      data: {
        ai: i % 7 === 0 ? { passive: true } : undefined,
        activityActorSlotId: i === 2 ? 'slot' : '',
      },
      activity: { simTier: i < 10 ? 'S1_NEAR' : 'S3_DORMANT' },
      _nearWorkAlwaysAwake: undefined,
    });
  }
  return ships;
}

function stampBefore(ships, state, set) {
  set.clear();
  const tick = state.tick | 0;
  const n = ships.length;
  const start = n ? ((tick * BUDGET) % n) : 0;
  let granted = 0;
  for (let i = 0; i < n; i++) {
    const entity = ships[(start + i) % n];
    if (!entity || entity.alive === false) continue;
    if (ownerIsAlwaysAwake(entity, state)) {
      set.add(entity.id);
      continue;
    }
    const tier = entity.activity && entity.activity.simTier;
    if (tier && tier !== 'S1_NEAR') continue;
    if (granted >= BUDGET) continue;
    set.add(entity.id);
    granted++;
  }
  return set.size;
}

function stampAfter(ships, state, set) {
  set.clear();
  const tick = state.tick | 0;
  const n = ships.length;
  const start = n ? ((tick * BUDGET) % n) : 0;
  let granted = 0;
  for (let i = 0; i < n; i++) {
    const entity = ships[(start + i) % n];
    if (!entity || entity.alive === false) continue;
    let awake = entity._nearWorkAlwaysAwake;
    if (awake !== true && awake !== false) {
      awake = ownerIsAlwaysAwake(entity, state);
      entity._nearWorkAlwaysAwake = awake;
    }
    if (awake === true) {
      set.add(entity.id);
      continue;
    }
    const tier = entity.activity && entity.activity.simTier;
    if (tier && tier !== 'S1_NEAR') continue;
    if (granted >= BUDGET) continue;
    set.add(entity.id);
    granted++;
  }
  return set.size;
}

function bench(fn, warm = false) {
  const ships = makeShips();
  const state = { playerId: 1, tick: 0 };
  const set = new Set();
  if (warm) {
    for (const s of ships) {
      s._nearWorkAlwaysAwake = ownerIsAlwaysAwake(s, state);
    }
  }
  fn(ships, state, set);
  const times = [];
  let last = 0;
  for (let run = 0; run < RUNS; run++) {
    if (warm) {
      for (const s of ships) s._nearWorkAlwaysAwake = ownerIsAlwaysAwake(s, state);
    } else {
      for (const s of ships) s._nearWorkAlwaysAwake = undefined;
    }
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      state.tick = i;
      last = fn(ships, state, set);
    }
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], last };
}

if (mode === 'before') {
  const r = bench(stampBefore, false);
  console.log(JSON.stringify({ side: 'before', median_ms: +r.median.toFixed(3), last: r.last }));
  process.exit(0);
}
if (mode === 'after') {
  const r = bench(stampAfter, true);
  console.log(JSON.stringify({ side: 'after', median_ms: +r.median.toFixed(3), last: r.last }));
  process.exit(0);
}

function runSide(side) {
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), side], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status || 1);
  }
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

const before = runSide('before');
const after = runSide('after');

// Admit parity + production module parity
const ships = makeShips();
for (const s of ships) s._nearWorkAlwaysAwake = ownerIsAlwaysAwake(s, { playerId: 1 });
let parityOk = true;
for (let t = 0; t < 64; t++) {
  const setB = new Set();
  const setA = new Set();
  stampBefore(ships, { playerId: 1, tick: t }, setB);
  stampAfter(ships, { playerId: 1, tick: t }, setA);
  const b = [...setB].sort((a, c) => a - c).join(',');
  const a = [...setA].sort((a, c) => a - c).join(',');
  if (a !== b) { parityOk = false; break; }
}

const mod = await import(join(ROOT, 'src/core/activityScheduler.js'));
const prodShips = makeShips();
for (const s of prodShips) mod.refreshNearWorkAlwaysAwake(s, { playerId: 1 });
let prodParity = true;
for (let t = 0; t < 64; t++) {
  const setB = new Set();
  stampBefore(prodShips, { playerId: 1, tick: t }, setB);
  const state = { playerId: 1, tick: t, entityIndex: { shipLike: prodShips }, nearWorkIds: new Set() };
  mod.stampNearWorkBudget(state, BUDGET);
  const b = [...setB].sort((a, c) => a - c).join(',');
  const a = [...state.nearWorkIds].sort((a, c) => a - c).join(',');
  if (a !== b) { prodParity = false; break; }
}

const result = {
  label: 'stamp-near-work-awake-cache',
  before_ms: before.median_ms,
  after_ms: after.median_ms,
  speedup: +(before.median_ms / after.median_ms).toFixed(3),
  sizes: { before: before.last, after: after.last },
  admit_parity: parityOk,
  production_parity: prodParity,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(join(__dirname, 'stamp-near-work-awake-cache-microbench.json'), JSON.stringify(result, null, 2));
