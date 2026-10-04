/**
 * Primary KPI: authored instance pool sync under prepareFrame with chase micro-moves.
 * Before = exact camera matrix equality (cameraDirty every frame).
 * After  = quantized camera capture (this package).
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import {
  runAuthoredInstanceCameraDirtyMicrobench,
  setAuthoredInstanceCameraCullExactCompare,
} from '../src/render/partsLibrary.js';

function runPair(ownerCount, frames, jitterWu) {
  // Warm both modes
  runAuthoredInstanceCameraDirtyMicrobench({ ownerCount, frames: 40, jitterWu, exactCameraDirty: true });
  runAuthoredInstanceCameraDirtyMicrobench({ ownerCount, frames: 40, jitterWu, exactCameraDirty: false });
  const before = runAuthoredInstanceCameraDirtyMicrobench({
    ownerCount, frames, jitterWu, exactCameraDirty: true,
  });
  const after = runAuthoredInstanceCameraDirtyMicrobench({
    ownerCount, frames, jitterWu, exactCameraDirty: false,
  });
  return {
    owners: ownerCount,
    frames,
    jitterWu,
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
    beforeDirtyRate: +before.dirtyRate.toFixed(4),
    afterDirtyRate: +after.dirtyRate.toFixed(4),
    beforeOwnersVisited: before.ownersVisited,
    afterOwnersVisited: after.ownersVisited,
  };
}

function oracle() {
  setAuthoredInstanceCameraCullExactCompare(false);
  const micro = runAuthoredInstanceCameraDirtyMicrobench({
    ownerCount: 8, frames: 200, jitterWu: 0.05, exactCameraDirty: false,
  });
  const large = runAuthoredInstanceCameraDirtyMicrobench({
    ownerCount: 8, frames: 200, jitterWu: 2.0, exactCameraDirty: false,
  });
  return {
    microDirtyRate: +micro.dirtyRate.toFixed(4),
    largeDirtyRate: +large.dirtyRate.toFixed(4),
    microQuieterThanLarge: micro.dirtyRate < large.dirtyRate,
    largeMostlyDirty: large.dirtyRate > 0.8,
  };
}

const scenarios = [
  runPair(80, 4000, 0.05),
  runPair(120, 4000, 0.05),
  runPair(120, 4000, 0.02),
  runPair(200, 3000, 0.05),
];
const primary = scenarios.find((s) => s.owners === 120 && s.jitterWu === 0.05) || scenarios[0];
const out = {
  label: 'authored-instance-camera-quantize',
  oracle: oracle(),
  scenarios,
  primary,
  note: 'Portable pool sync. Soft-GPU fps not claimed. Before=exact cameraDirty; After=0.25WU/1e-3 quantize.',
};
writeFileSync(
  new URL('./authored-instance-camera-quantize-microbench.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
