/**
 * Offline microbench: settled-idle early-out + middle-band pitch cadence.
 * Stand-in approximates thrust-lean + control-loss read work.
 */
import {
  ENTITY_VIEW_BAND,
  classifyEntityViewBand,
  shouldRunEntityClosures,
} from '../../spaceface-scratch/pitch-cadence/src/render/entityViewSyncBand.js';

const ENTITIES = 400;
const FRAMES = 240;
const MIDDLE_FRACTION = 0.72;
const SETTLED_FRACTION = 0.55; // parked / zero-lean share of the fleet

function standInPitchWork(seed, heavy) {
  let x = seed;
  const n = heavy ? 48 : 8; // early-out still pays a tiny predicate cost
  for (let i = 0; i < n; i++) x = Math.sin(x) * 1.7 + Math.cos(x * 0.3);
  return x;
}

function run(mode) {
  // mode: 'before' | 'settle' | 'settle+band'
  let calls = 0;
  let work = 0;
  const t0 = performance.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    const tick = frame;
    for (let slot = 0; slot < ENTITIES; slot++) {
      const isPlayer = slot === 0;
      const isMiddle = !isPlayer && (slot / ENTITIES) < MIDDLE_FRACTION;
      const settled = !isPlayer && (slot / ENTITIES) < SETTLED_FRACTION;
      const band = isPlayer || !isMiddle ? ENTITY_VIEW_BAND.INNER : ENTITY_VIEW_BAND.MIDDLE;
      if (mode !== 'before' && settled) {
        work += standInPitchWork(slot + frame * 0.01, false);
        continue;
      }
      if (mode === 'settle+band' && !isPlayer && band === ENTITY_VIEW_BAND.MIDDLE) {
        if (!shouldRunEntityClosures(band, tick, slot)) {
          work += standInPitchWork(slot + frame * 0.01, false);
          continue;
        }
      }
      calls++;
      work += standInPitchWork(slot + frame * 0.01, true);
    }
  }
  const ms = performance.now() - t0;
  return { calls, ms, work };
}

run('before'); run('settle'); run('settle+band');
const before = run('before');
const settle = run('settle');
const both = run('settle+band');
const out = {
  label: 'prepare-pitch-settle',
  entities: ENTITIES,
  frames: FRAMES,
  middleFraction: MIDDLE_FRACTION,
  settledFraction: SETTLED_FRACTION,
  before: { calls: before.calls, ms: +before.ms.toFixed(3) },
  settleOnly: { calls: settle.calls, ms: +settle.ms.toFixed(3) },
  settleAndBand: { calls: both.calls, ms: +both.ms.toFixed(3) },
  settleCallReduction: +(1 - settle.calls / before.calls).toFixed(4),
  bothCallReduction: +(1 - both.calls / before.calls).toFixed(4),
  settleSpeedup: +(before.ms / Math.max(1e-9, settle.ms)).toFixed(3),
  bothSpeedup: +(before.ms / Math.max(1e-9, both.ms)).toFixed(3),
};
console.log(JSON.stringify(out, null, 2));
