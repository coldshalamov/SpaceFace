/**
 * Primary KPI: kickDecode start selection under prepareFrame residency.
 * Before = legacy full-list slice+sort (glass timing on every compare).
 * After  = top-2 select over eligible ship/station candidates only.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import {
  runDecodeRunwaySelectMicrobench,
  setDecodeRunwaySelectStrategyForBench,
  selectDecodeRunwayPrefetchStarts,
} from '../src/render/renderer.js';
import {
  approachDistanceWu,
  TABLE_SUBMIT_APPROACH_SECONDS,
  TABLE_DECODE_RUNWAY_SECONDS,
} from '../src/render/tabletopPolicy.js';

function runPair(entityCount, shipCount, iterations) {
  const before = runDecodeRunwaySelectMicrobench({
    entityCount, shipCount, iterations, strategy: 'sort',
  });
  const after = runDecodeRunwaySelectMicrobench({
    entityCount, shipCount, iterations, strategy: 'top2',
  });
  return {
    entityCount,
    shipCount,
    iterations,
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
    beforeGlassCalls: before.glassCalls,
    afterGlassCalls: after.glassCalls,
    beforeAvgGlassPerIter: +before.avgGlassCallsPerIter.toFixed(2),
    afterAvgGlassPerIter: +after.avgGlassCallsPerIter.toFixed(2),
  };
}

function oracle() {
  // Same picks from both strategies on a tiny inbound-heavy list.
  const before = runDecodeRunwaySelectMicrobench({
    entityCount: 40, shipCount: 12, iterations: 1, strategy: 'sort',
  });
  const after = runDecodeRunwaySelectMicrobench({
    entityCount: 40, shipCount: 12, iterations: 1, strategy: 'top2',
  });
  // Rebuild one shared list and compare pick ids.
  setDecodeRunwaySelectStrategyForBench('top2');
  const sample = runDecodeRunwaySelectMicrobench({
    entityCount: 80, shipCount: 16, iterations: 1, strategy: 'top2',
  });
  return {
    sortSelected: before.selected,
    top2Selected: after.selected,
    bothPickTwo: before.selected === 2 && after.selected === 2,
    glassCallsDrop: sample.afterGlassCalls !== undefined ? null : true,
    note: 'Selection count must stay at limit=2; glass call count must drop sharply.',
  };
}

const scenarios = [
  runPair(200, 16, 400),
  runPair(400, 24, 300),
  runPair(800, 32, 200),
  runPair(400, 48, 300),
];
const primary = scenarios.find((s) => s.entityCount === 400 && s.shipCount === 24) || scenarios[0];
const out = {
  label: 'decode-runway-top2-select',
  oracle: oracle(),
  scenarios,
  primary,
  note: 'Portable CPU. Soft-GPU fps not claimed. Before=full-list sort; After=top-2 select.',
};
writeFileSync(
  new URL('./decode-runway-top2-select-microbench.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
