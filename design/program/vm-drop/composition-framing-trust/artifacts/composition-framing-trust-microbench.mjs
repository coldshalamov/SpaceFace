/**
 * Primary KPI: playerHasActiveAttackerFraming residual under camera.follow after #47.
 * Before = no sticky.hadActiveAttacker → shipLike walk every call.
 * After  = live sticky trusts prior resolveChaseComposition.hasActiveAttacker (O(1)).
 * Soft-GPU fps not claimed. Pair (framing+compose) is informational only.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

function makeWorld(nShips, attackers = 0) {
  const player = {
    id: 1, type: 'ship', alive: true, hull: 100, hullMax: 100, team: 0,
    pos: { x: 0, z: 0 }, radius: 8, isPlayer: true,
  };
  const ships = [player];
  const entities = new Map([[player.id, player]]);
  for (let i = 0; i < nShips; i++) {
    const far = i % 5 !== 0;
    const r = far ? 900 + (i % 50) * 20 : 80 + (i % 20) * 15;
    const ang = i * 0.37;
    const isAttacker = i < attackers;
    const role = i % 7 === 0 ? 'pirate' : (i % 3 === 0 ? 'miner' : 'trader');
    const e = {
      id: i + 2,
      type: i % 11 === 0 ? 'drone' : 'ship',
      alive: true, hull: 50, hullMax: 50,
      team: role === 'pirate' ? 1 : (role === 'miner' ? 2 : 3),
      pos: { x: Math.cos(ang) * r, z: Math.sin(ang) * r },
      radius: 6,
      data: {
        role,
        ai: { passive: role !== 'pirate', archetype: role, spawnContext: role === 'pirate' ? 'raid' : 'ambient' },
        combat: isAttacker ? { targetId: 1, lockTarget: 1 } : { targetId: null, lockTarget: null },
      },
    };
    ships.push(e);
    entities.set(e.id, e);
  }
  return {
    playerId: 1,
    entities,
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, shipLike: ships },
    player: {},
    combat: { entities: {} },
  };
}

async function runChild(mode, nShips, attackers, iters) {
  const {
    playerHasActiveAttackerFraming,
    resolveChaseComposition,
  } = await import('../src/render/camera.js');

  const state = makeWorld(nShips, attackers);
  const player = state.entities.get(1);
  const view = { dt: 1 / 60, fov: 50, baseFov: 50, aspect: 16 / 9, tiltDeg: 60 };
  const focus = { x: 0, z: 0 };
  const out = {};
  const tetherOut = {};

  // Seed composition bit the way follow() does after the prior frame.
  const seedSticky = { id: null, remainS: 0, wasActive: false, hadActiveAttacker: false };
  resolveChaseComposition(state, player, focus, view, out, tetherOut, seedSticky);
  const had = seedSticky.hadActiveAttacker === true;

  const sticky = mode === 'after'
    ? { id: null, remainS: 0, wasActive: false, hadActiveAttacker: had }
    : { id: null, remainS: 0, wasActive: false };

  for (let i = 0; i < 500; i++) playerHasActiveAttackerFraming(state, player, sticky);

  const t0 = performance.now();
  let hits = 0;
  for (let i = 0; i < iters; i++) {
    if (playerHasActiveAttackerFraming(state, player, sticky)) hits++;
  }
  const framingMs = performance.now() - t0;

  // Informational pair (compose still walks).
  const pairSticky = mode === 'after'
    ? { id: null, remainS: 0, wasActive: false, hadActiveAttacker: had }
    : { id: null, remainS: 0, wasActive: false };
  for (let i = 0; i < 200; i++) {
    playerHasActiveAttackerFraming(state, player, pairSticky);
    resolveChaseComposition(state, player, focus, view, out, tetherOut, pairSticky);
  }
  const p0 = performance.now();
  for (let i = 0; i < iters; i++) {
    playerHasActiveAttackerFraming(state, player, pairSticky);
    resolveChaseComposition(state, player, focus, view, out, tetherOut, pairSticky);
  }
  const pairMs = performance.now() - p0;

  return { framingMs, pairMs, hits, iters, nShips, attackers, mode, seededHad: had };
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[(a.length / 2) | 0];
}

function runPair(nShips, attackers, iters) {
  const before = spawnSync(process.execPath, [__filename, 'child', 'before', String(nShips), String(attackers), String(iters)], {
    cwd: ROOT, encoding: 'utf8',
  });
  const after = spawnSync(process.execPath, [__filename, 'child', 'after', String(nShips), String(attackers), String(iters)], {
    cwd: ROOT, encoding: 'utf8',
  });
  if (before.status !== 0) throw new Error(before.stderr || before.stdout);
  if (after.status !== 0) throw new Error(after.stderr || after.stdout);
  return {
    before: JSON.parse(before.stdout.trim().split('\n').pop()),
    after: JSON.parse(after.stdout.trim().split('\n').pop()),
  };
}

const args = process.argv.slice(2);
if (args[0] === 'child') {
  const [, mode, nShips, attackers, iters] = args;
  const result = await runChild(mode, Number(nShips), Number(attackers), Number(iters));
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

const scenarios = [
  { name: 'quiet-120ships-0atk', nShips: 120, attackers: 0, iters: 20000 },
  { name: 'quiet-80ships-0atk', nShips: 80, attackers: 0, iters: 20000 },
  { name: 'combat-80ships-3atk', nShips: 80, attackers: 3, iters: 20000 },
];

const report = { scenarios: {}, floorMinSpeedup: Infinity };
const PAIRS = 7;

for (const sc of scenarios) {
  const framingSpeedups = [];
  const pairs = [];
  for (let r = 0; r < PAIRS; r++) {
    const pair = runPair(sc.nShips, sc.attackers, sc.iters);
    const framingSpeedup = pair.before.framingMs / pair.after.framingMs;
    const pairSpeedup = pair.before.pairMs / pair.after.pairMs;
    framingSpeedups.push(framingSpeedup);
    pairs.push({
      beforeFramingMs: pair.before.framingMs,
      afterFramingMs: pair.after.framingMs,
      framingSpeedup,
      beforePairMs: pair.before.pairMs,
      afterPairMs: pair.after.pairMs,
      pairSpeedup,
      beforeHits: pair.before.hits,
      afterHits: pair.after.hits,
    });
    console.error(`${sc.name} run${r}: framing ${pair.before.framingMs.toFixed(2)} → ${pair.after.framingMs.toFixed(2)} (${framingSpeedup.toFixed(2)}×); pair ${pairSpeedup.toFixed(2)}×`);
  }
  const med = median(framingSpeedups);
  const floor = Math.min(...framingSpeedups);
  report.scenarios[sc.name] = {
    medianFramingSpeedup: med,
    floorMinSpeedup: floor,
    medianBeforeFramingMs: median(pairs.map((p) => p.beforeFramingMs)),
    medianAfterFramingMs: median(pairs.map((p) => p.afterFramingMs)),
    medianPairSpeedup: median(pairs.map((p) => p.pairSpeedup)),
    pairs,
  };
  report.floorMinSpeedup = Math.min(report.floorMinSpeedup, floor);
}

writeFileSync(join(ROOT, 'artifacts/composition-framing-trust-microbench.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  primary: report.scenarios['quiet-120ships-0atk'],
  floorMinSpeedup: report.floorMinSpeedup,
  scenarios: Object.fromEntries(Object.entries(report.scenarios).map(([k, v]) => [k, {
    medianFramingSpeedup: v.medianFramingSpeedup,
    floorMinSpeedup: v.floorMinSpeedup,
    medianBeforeFramingMs: v.medianBeforeFramingMs,
    medianAfterFramingMs: v.medianAfterFramingMs,
    medianPairSpeedup: v.medianPairSpeedup,
  }])),
}, null, 2));
