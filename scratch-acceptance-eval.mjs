// scratch-acceptance-eval.mjs — evaluate the cadence acceptance bar on the verify ledgers.
// Bar: hours 5–9 encounter:spawned ≥ 4/hour sustained; zero 3+ hour zero-spawn windows;
// sector boundary flips < 2/hour (continuous enter+exit pairs).
import { readFileSync, readdirSync } from 'node:fs';

const DIR = '.devshots/actual-game-verify';
let failed = false;
for (const f of readdirSync(DIR).filter((f) => f.includes('10h'))) {
  const j = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
  const hours = j.hours_detail || [];
  const tag = `${j.archetype}-s${j.seed}`;
  console.log(`=== ${tag} ===`);

  // 1. spawned per hour, hours 5–9
  let barOk = true;
  const spawnedByHour = hours.map((h) => (h.eventTypes && h.eventTypes['encounter:spawned']) || 0);
  for (let hr = 5; hr <= 9; hr++) {
    const n = spawnedByHour[hr] ?? 0;
    const ok = n >= 4;
    if (!ok) barOk = false;
    console.log(`  h${hr} spawned=${n} ${ok ? 'OK' : 'FAIL'}`);
  }
  if (!barOk) failed = true;

  // 2. zero-spawn windows ≥ 3 hours anywhere in hours 0–9
  let window = 0, maxWindow = 0;
  for (let hr = 0; hr <= 9; hr++) {
    if ((spawnedByHour[hr] ?? 0) === 0) { window++; maxWindow = Math.max(maxWindow, window); }
    else window = 0;
  }
  const windowOk = maxWindow < 3;
  if (!windowOk) failed = true;
  console.log(`  longest zero-spawn window: ${maxWindow}h ${windowOk ? 'OK' : 'FAIL'}`);

  // 3. boundary flips per hour (sector:enter with continuous payload = free-flight membership)
  for (const h of hours) {
    const rows = (h.targeted && h.targeted['sector:enter']) || [];
    let flips = 0;
    for (const row of rows) {
      const d = row.data || row;
      if (d && (d.continuous === true || d.noTeleport === true)) flips++;
    }
    if (flips >= 2) {
      const ok = false;
      failed = true;
      console.log(`  h${h.hour} boundary flips=${flips} FAIL`);
    } else if (flips > 0) {
      console.log(`  h${h.hour} boundary flips=${flips} OK`);
    }
  }
  // mercy + relocation telemetry
  const mercy = hours.reduce((a, h) => a + ((h.eventTypes && h.eventTypes['harasser:disengaged']) || 0), 0);
  const tel = hours.reduce((a, h) => a + ((h.eventTypes && h.eventTypes['encounter:telegraph']) || 0), 0);
  const spn = hours.reduce((a, h) => a + ((h.eventTypes && h.eventTypes['encounter:spawned']) || 0), 0);
  console.log(`  totals: telegraph=${tel} spawned=${spn} mercyDisengaged=${mercy}`);
}
console.log(failed ? 'ACCEPTANCE: FAIL' : 'ACCEPTANCE: PASS');
process.exit(failed ? 1 : 0);
