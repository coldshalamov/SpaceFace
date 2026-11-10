/**
 * Primary KPI: status-attached quiet path — combat.entities collect + housekeeping.
 * Before = Object.keys collect every tick (legacy) over N combat rows with no burn/goo.
 * After  = production collect (for...in + STATUS_ROW_IDS) once, then quiet latch skip
 *          until statusNextPendingSeq advances.
 * Dirty wake: bump statusNextPendingSeq + inject burn → latch clears, victim found.
 * Soft-GPU fps not claimed. Picture unchanged while no burn/goo statuses.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const ENTITIES = 32;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
import {
  collectStatusAttachedVictims,
  planStatusAttachedEmit,
  statusAttachedAccessibility,
} from './src/render/statusAttachedVfx.js';

const ENTITIES = ${ENTITIES};
const ITERS = ${ITERS};
const STATUS_ROWS_LEGACY = Object.freeze({
  status_burning: Object.freeze({ kind: 'burn' }),
  status_goo: Object.freeze({ kind: 'goo' }),
});

function makeState() {
  const entities = new Map();
  const table = Object.create(null);
  for (let i = 1; i <= ENTITIES; i++) {
    entities.set(i, { id: i, alive: true, pos: { x: i * 10, z: 0 }, radius: 6 });
    // Non-burn/goo status row so the table is non-empty (quiet combat residual).
    table[String(i)] = {
      statuses: { status_shielded: { id: 'status_shielded', expiresTick: 1e9, stacks: 1 } },
    };
  }
  return {
    tick: 100,
    playerId: 1,
    mode: 'flight',
    entities,
    combat: { entities: table, statusNextPendingSeq: 7 },
    settings: { video: {}, accessibility: {} },
  };
}

function statusRemainingSeconds(active, tick) {
  if (!active || !Number.isFinite(active.expiresTick)) return 0;
  return Math.max(0, (active.expiresTick - tick) / 60);
}

function collectLegacy(state, out) {
  out.length = 0;
  const table = state.combat.entities;
  const entities = state.entities;
  const tick = state.tick;
  const player = entities.get(state.playerId);
  const px = player.pos.x, pz = player.pos.z;
  for (const key of Object.keys(table)) {
    const runtime = table[key];
    const statuses = runtime && runtime.statuses;
    if (!statuses) continue;
    const entity = entities.get(key) || entities.get(Number(key));
    if (!entity || entity.alive === false || !entity.pos) continue;
    for (const statusId of Object.keys(STATUS_ROWS_LEGACY)) {
      const active = statuses[statusId];
      if (!(statusRemainingSeconds(active, tick) > 0)) continue;
      out.push({ key: entity.id, statusId });
    }
  }
  return out;
}

function updateBefore(host) {
  const victims = collectLegacy(host.state, host.out);
  host.live.clear();
  for (let i = 0; i < victims.length; i++) host.live.add(victims[i].key);
  host.stale.length = 0;
  for (const key of host.cd.keys()) {
    if (!host.live.has(key)) host.stale.push(key);
  }
  for (let i = 0; i < host.stale.length; i++) host.cd.delete(host.stale[i]);
  host.collects++;
}

function updateAfter(host) {
  const combat = host.state.combat;
  const pendingSeq = combat.statusNextPendingSeq;
  if (host.quietEmpty && pendingSeq === host.quietSeq) {
    host.skips++;
    return;
  }
  const victims = collectStatusAttachedVictims(host.state, host.out);
  host.live.clear();
  const acc = statusAttachedAccessibility(host.state.settings);
  for (let i = 0; i < victims.length; i++) {
    const victim = victims[i];
    host.live.add(victim.key);
    const plan = planStatusAttachedEmit(victim, host.cd.get(victim.key) || 0, acc, 1 / 60);
    host.cd.set(victim.key, plan.nextCadenceAgeS);
  }
  host.stale.length = 0;
  for (const key of host.cd.keys()) {
    if (!host.live.has(key)) host.stale.push(key);
  }
  for (let i = 0; i < host.stale.length; i++) host.cd.delete(host.stale[i]);
  host.collects++;
  if (victims.length === 0 && host.cd.size === 0) {
    host.quietEmpty = true;
    host.quietSeq = pendingSeq;
  } else {
    host.quietEmpty = false;
  }
}

const host = {
  state: makeState(),
  out: [],
  live: new Set(),
  cd: new Map(),
  stale: [],
  quietEmpty: false,
  quietSeq: -1,
  collects: 0,
  skips: 0,
};
const fn = ${JSON.stringify(mode)} === 'before' ? updateBefore : updateAfter;
for (let i = 0; i < 2000; i++) fn(host);
host.collects = 0; host.skips = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(host);
const ms = performance.now() - t0;

let woke = null;
if (${JSON.stringify(mode)} === 'after') {
  // Dirty wake: new burn status bumps pending seq.
  host.state.combat.statusNextPendingSeq += 1;
  const id = '5';
  host.state.combat.entities[id].statuses.status_burning = {
    id: 'status_burning', stacks: 1, expiresTick: host.state.tick + 600,
  };
  const beforeLatch = host.quietEmpty;
  fn(host);
  woke = {
    beforeLatch,
    afterLatch: host.quietEmpty,
    victims: host.out.length,
    woke: beforeLatch === true && host.out.length > 0,
  };
}

console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)}, collects: host.collects, skips: host.skips,
  quietEmpty: host.quietEmpty, woke,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

const pairs = [];
let wakeProof = null;
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  if (after.woke) wakeProof = after.woke;
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / Math.max(1e-9, after.ms),
    beforeCollects: before.collects,
    afterCollects: after.collects,
    afterSkips: after.skips,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'status-attached-quiet-empty-latch',
  primary: 'quiet-status-attached-empty-latch',
  iterations: ITERS,
  entities: ENTITIES,
  runs: RUNS,
  pairs,
  medianSpeedup: +median(speedups).toFixed(3),
  minSpeedup: +Math.min(...speedups).toFixed(3),
  maxSpeedup: +Math.max(...speedups).toFixed(3),
  dirtyWake: wakeProof,
};
writeFileSync('artifacts/status-attached-quiet-empty-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
