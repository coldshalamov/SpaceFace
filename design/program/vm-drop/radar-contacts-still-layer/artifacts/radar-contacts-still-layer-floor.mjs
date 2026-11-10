/**
 * #158 package floor — 5 × 11-pair isolated A/B for contacts still-layer.
 * Soft-GPU fps not a KPI.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const WORKER = `
import { performance } from 'node:perf_hooks';
import {
  censusRadarContactsStillLayer,
  createRadarContactsStillCache,
  setRadarContactsStillLayerForBench,
} from '../src/ui/radar.js';
import { tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';

const ITERS = Number(process.env.ITERS || 50000);
const WARM = 1000;
const STILL = process.env.STILL !== '0';
setRadarContactsStillLayerForBench(STILL);

const RANGE = 4000;
const rangeSq = RANGE * RANGE;
const metrics = tacticalRadarMetrics(false);
const player = { id: 1, pos: { x: 0, z: 0 }, team: 0 };
const state = { playerId: 1, factions: {} };
const contacts = [];
for (let i = 0; i < 48; i++) {
  const kind = i % 7;
  const type = kind === 0 ? 'station' : kind === 1 ? 'wreck' : kind === 2 ? 'pickup' : 'ship';
  contacts.push({
    id: 100 + i, type, alive: true, team: kind === 3 ? 1 : 0,
    pos: { x: (i % 10) * 180 - 800, z: Math.floor(i / 10) * 220 - 600 },
    vel: { x: 0, z: 0 }, rot: (i * 0.17) % (Math.PI * 2),
    data: { ai: { passive: true }, isGate: type === 'station' && i % 11 === 0 },
  });
}
const projectScratch = { x:0,y:0,dx:0,dz:0,distance:0,offRange:false,angle:0,scale:0,resolved:true };
const hostileMarks = [], infrastructureMarks = [], neutralMarks = [];
function pushHostileMark(entity, projected, distanceSq) {
  hostileMarks.push({ entity, x: projected.x, y: projected.y, distanceSq });
}
function pushInfrastructureMark(entity, projected, gate, distanceSq) {
  infrastructureMarks.push({ entity, x: projected.x, y: projected.y, gate,
    offRange: projected.offRange, angle: projected.angle, distanceSq });
}
function pushNeutralMark(entity, projected, distanceSq, meta) {
  neutralMarks.push({ entity, x: projected.x, y: projected.y, distanceSq, ...meta });
}
const cache = createRadarContactsStillCache();
const args = () => ({
  contacts, player, playerTeam: 0, state, range: RANGE, rangeSq, metrics, targetId: null,
  projectScratch, pushHostileMark, pushInfrastructureMark, pushNeutralMark,
  hostileMarks, infrastructureMarks, neutralMarks, cache,
});

censusRadarContactsStillLayer(args());
for (let i = 0; i < WARM; i++) censusRadarContactsStillLayer(args());
if (global.gc) global.gc();
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) censusRadarContactsStillLayer(args());
const us = ((performance.now() - t0) * 1000) / ITERS;

// Dirty wake
cache.armed = true;
cache.rescanDraws = 5;
cache.qx = Math.round(player.pos.x * metrics.radius / RANGE);
cache.qz = Math.round(player.pos.z * metrics.radius / RANGE);
cache.range = RANGE;
cache.targetId = null;
let sig = contacts.length * 1315423911;
for (const e of contacts) {
  if (!e?.pos) continue;
  sig = (Math.imul(sig ^ (e.id >>> 0), 0x01000193) ^ Math.round(e.pos.x) ^ (Math.round(e.pos.z) << 11)
    ^ (Math.round((Number(e.rot)||0)*32) << 3) ^ (e.team|0)) >>> 0;
}
cache.sig = sig;
cache.hostileCount = hostileMarks.length;
cache.infraCount = infrastructureMarks.length;
cache.neutralCount = neutralMarks.length;
const latched = censusRadarContactsStillLayer(args());
player.pos.x += 80;
const woke = censusRadarContactsStillLayer(args());
console.log(JSON.stringify({
  us: +us.toFixed(4), still: STILL,
  latchedSkip: !!latched.skipped, wakeSkip: !!woke.skipped,
}));
`;

writeFileSync('artifacts/_158-floor-worker.mjs', WORKER);

function pair() {
  const off = spawnSync(process.execPath, ['--expose-gc', 'artifacts/_158-floor-worker.mjs'], {
    env: { ...process.env, STILL: '0', ITERS: '50000' }, encoding: 'utf8',
  });
  const on = spawnSync(process.execPath, ['--expose-gc', 'artifacts/_158-floor-worker.mjs'], {
    env: { ...process.env, STILL: '1', ITERS: '50000' }, encoding: 'utf8',
  });
  if (off.status !== 0 || on.status !== 0) {
    return { err: (off.stderr || on.stderr || off.stdout || on.stdout || '').slice(0, 500) };
  }
  const o = JSON.parse(off.stdout.trim().split('\\n').pop());
  const n = JSON.parse(on.stdout.trim().split('\\n').pop());
  return {
    offUs: o.us, onUs: n.us, speedup: +(o.us / n.us).toFixed(4),
    dirtyWakeOk: n.latchedSkip === true && n.wakeSkip === false,
  };
}

const floors = [];
for (let f = 0; f < 5; f++) {
  const pairs = [];
  for (let i = 0; i < 11; i++) pairs.push(pair());
  const ok = pairs.filter((p) => !p.err);
  const speedups = ok.map((p) => p.speedup).sort((a, b) => a - b);
  floors.push({
    floor: f + 1,
    median: speedups[Math.floor(speedups.length / 2)],
    min: speedups[0],
    dirtyWakeOk: ok.every((p) => p.dirtyWakeOk),
    absBeforeMedian: +[...ok.map((p) => p.offUs)].sort((a, b) => a - b)[Math.floor(ok.length / 2)].toFixed(3),
    err: pairs.find((p) => p.err)?.err || null,
  });
}
const out = {
  floors,
  medians: floors.map((f) => f.median),
  mins: floors.map((f) => f.min),
  floorMin: Math.min(...floors.map((f) => f.min)),
  dirtyWakeOk: floors.every((f) => f.dirtyWakeOk),
};
console.log(JSON.stringify(out, null, 2));
writeFileSync('artifacts/radar-contacts-still-layer-floor-summary.json', JSON.stringify(out, null, 2));
