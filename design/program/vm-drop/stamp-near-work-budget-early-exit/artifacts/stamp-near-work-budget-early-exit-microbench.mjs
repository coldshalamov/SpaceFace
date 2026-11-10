/**
 * Primary KPI: stampNearWorkBudget under quiet shipLike.
 * Before = always-awake Set.insert + full shipLike scan (bench toggle on).
 * After  = skip awake inserts + early-exit at NEAR budget (production default).
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function runOnce(insertAwake, iters = 80000, ships = 80) {
  const script = `
import { stampNearWorkBudget, setNearWorkAlwaysAwakeSetInsertForBench } from './src/core/activityScheduler.js';
import { SIM_TIER } from './src/world/activityClassification.js';
setNearWorkAlwaysAwakeSetInsertForBench(${insertAwake});
const ships = [];
ships.push({ id: 1, isPlayer: true, alive: true, _nearWorkAlwaysAwake: true });
ships.push({ id: 2, alive: true, ai: { combatant: true }, _nearWorkAlwaysAwake: true });
ships.push({ id: 3, alive: true, ai: { combatant: true }, _nearWorkAlwaysAwake: true });
for (let i = 0; i < ${ships} - 3; i++) {
  const s1 = i % 3 !== 0;
  ships.push({
    id: 100 + i, alive: true, _nearWorkAlwaysAwake: false,
    activity: { simTier: s1 ? SIM_TIER.S1_NEAR : SIM_TIER.S3_DORMANT },
  });
}
const state = { tick: 0, playerId: 1, entityIndex: { shipLike: ships }, nearWorkIds: new Set() };
for (let i = 0; i < 400; i++) { state.tick = i; stampNearWorkBudget(state); }
const t0 = performance.now();
for (let i = 0; i < ${iters}; i++) { state.tick = i; stampNearWorkBudget(state); }
process.stdout.write(JSON.stringify({ ms: performance.now() - t0 }));
`;
  spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: ROOT });
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', cwd: ROOT, timeout: 120000,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

const pairs = [];
for (let i = 0; i < 9; i++) {
  const before = runOnce(true);
  const after = runOnce(false);
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
  });
}
const xs = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const out = {
  label: 'stamp-near-work-budget-early-exit',
  primary: 'quiet-80shipLike-#61-shape',
  pairs,
  medianSpeedup: xs[Math.floor(xs.length / 2)],
  minSpeedup: xs[0],
  maxSpeedup: xs[xs.length - 1],
  note: 'Before=always-awake Set.insert + full shipLike scan. After=skip awake inserts + early-exit at budget. Soft-GPU fps not claimed.',
};
writeFileSync(new URL('./stamp-near-work-budget-early-exit-microbench.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
