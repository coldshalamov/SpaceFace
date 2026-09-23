/**
 * Offline microbench: registry.step flight long-tail — skip S2/S3/S4 without intent.
 * Stand-in approximates applyDrag / _stepCraft body work.
 */
import { SIM_TIER } from '../../spaceface-scratch/flight-dormant-skip/src/world/activityClassification.js';
import { entityNeedsFlightStep } from '../../spaceface-scratch/flight-dormant-skip/src/world/activityRuntime.js';

const CRAFT = 500;
const TICKS = 600; // 10s at 60 Hz
const DORMANT_FRACTION = 0.62; // settled sectors park most traffic far out
const NEAR_FRACTION = 0.18;

function standInFlightWork(seed) {
  let x = seed;
  for (let i = 0; i < 36; i++) x = Math.sin(x * 1.1) + Math.cos(x * 0.37);
  return x;
}

function makeFleet() {
  const fleet = [];
  for (let i = 0; i < CRAFT; i++) {
    const frac = i / CRAFT;
    let simTier = SIM_TIER.S0_EXACT;
    if (frac < DORMANT_FRACTION) simTier = SIM_TIER.S3_DORMANT;
    else if (frac < DORMANT_FRACTION + NEAR_FRACTION) simTier = SIM_TIER.S1_NEAR;
    fleet.push({
      id: i + 1,
      alive: true,
      activity: { simTier },
      vel: { x: simTier === SIM_TIER.S3_DORMANT ? 8 : 40, z: 0 },
      data: {},
    });
  }
  return fleet;
}

function run(gate) {
  const fleet = makeFleet();
  let steps = 0;
  let work = 0;
  const t0 = performance.now();
  for (let tick = 0; tick < TICKS; tick++) {
    for (let i = 0; i < fleet.length; i++) {
      const e = fleet[i];
      if (i === 0) { // player always
        steps++;
        work += standInFlightWork(i + tick);
        continue;
      }
      if (gate && !entityNeedsFlightStep(e)) continue;
      steps++;
      work += standInFlightWork(i + tick);
    }
  }
  const ms = performance.now() - t0;
  return { steps, ms, work };
}

run(false); run(true);
const before = run(false);
const after = run(true);
const out = {
  label: 'flight-dormant-skip',
  craft: CRAFT,
  ticks: TICKS,
  dormantFraction: DORMANT_FRACTION,
  nearFraction: NEAR_FRACTION,
  before: { steps: before.steps, ms: +before.ms.toFixed(3) },
  after: { steps: after.steps, ms: +after.ms.toFixed(3) },
  stepReduction: +(1 - after.steps / before.steps).toFixed(4),
  speedup: +(before.ms / Math.max(1e-9, after.ms)).toFixed(3),
};
console.log(JSON.stringify(out, null, 2));
