// TEMP probe for PQ-135 adoption — run scenarios and print raw metrics. Delete after use.
import { runM6, runM11, formatM6Table, formatM11Table, MOTION_LAB_SEED } from '../src/testing/motionScenarios.js';
import { forceSquadFrameMutation } from '../src/ai/squadFrame.js';
import { runM4Hulls } from '../src/testing/motionScenarios.js';

const which = process.argv[2] || 'all';

async function m6(label) {
  const r = await runM6({ seed: MOTION_LAB_SEED });
  const m = r.metrics;
  console.log(`\n== M6 ${label} ==`);
  console.log(formatM6Table(m));
  console.log('phases:', (r.trace && r.trace.phases || []).map((p) => `${p.phase || p.name}@${p.tick ?? p.startTick}`).join(' '));
  console.log('committedAttackersPeak', m.committedAttackersPeak, 'firstShotCount', m.firstShotCount,
    'targetExposureBeforeFirstShotS', m.targetExposureBeforeFirstShotS, 'collisions', m.collisions,
    'entryTimingSpreadS', m.entryTimingSpreadS, 'headingOscillationRms', m.headingOscillationRms,
    'controlSignChangesPerS', m.controlSignChangesPerS, 'instantTurnbacks', m.instantTurnbacks);
}

async function m4(label, shared) {
  const r = await runM4Hulls({ seed: MOTION_LAB_SEED, sharedEnvelope: shared });
  const w = r.metrics.hulls.ship_wasp;
  const a = r.metrics.hulls.ship_atlas;
  const keys = ['peakSpeed', 'peakClosingSpeed', 'peakOvershoot', 'meanHeadingError', 'offAxisBurnFraction'];
  const rel = (x, y) => {
    const min = Math.min(x, y), max = Math.max(x, y);
    const mid = (Math.abs(min) + Math.abs(max)) / 2;
    return mid > 1e-9 ? (max - min) / mid : 0;
  };
  console.log(`\n== M4h ${label} == shared=${r.metrics.sharedEnvelope}`);
  console.log('wasp ', keys.map((k) => `${k}=${w[k]}`).join(' '));
  console.log('atlas', keys.map((k) => `${k}=${a[k]}`).join(' '));
  console.log('spread>=0.18 count:', keys.filter((k) => rel(w[k], a[k]) >= 0.18).length,
    '->', keys.map((k) => `${k}:${rel(w[k], a[k]).toFixed(3)}`).join(' '));
}

if (which === 'm6' || which === 'all') {
  await m6('live');
  forceSquadFrameMutation({ laneHysteresis: false });
  await m6('noHysteresis');
  forceSquadFrameMutation(null);
}
if (which === 'm11' || which === 'all') {
  const r = await runM11({ seed: MOTION_LAB_SEED });
  console.log('\n== M11 ==');
  console.log(formatM11Table(r.metrics));
}
if (which === 'm4' || which === 'all') {
  await m4('live', false);
  await m4('forced', true);
}
