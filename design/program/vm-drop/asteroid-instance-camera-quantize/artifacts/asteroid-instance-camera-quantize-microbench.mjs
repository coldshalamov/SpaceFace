/**
 * Primary KPI: syncAsteroidInstancePool under quiet chase micro-moves.
 * Before = exact cameraDirty (micro-jitter forces full frustum+matrix path).
 * After  = 0.25 WU / 1e-3 quantized camera capture (reuse static submission).
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  runAsteroidInstanceCameraDirtyMicrobench,
  setAsteroidInstanceCameraCullExactCompare,
} from '../src/render/asteroidInstancePool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runPair(rockCount, frames, jitterWu) {
  runAsteroidInstanceCameraDirtyMicrobench({
    rockCount, frames: 40, jitterWu, exactCameraDirty: true,
  });
  runAsteroidInstanceCameraDirtyMicrobench({
    rockCount, frames: 40, jitterWu, exactCameraDirty: false,
  });
  const before = runAsteroidInstanceCameraDirtyMicrobench({
    rockCount, frames, jitterWu, exactCameraDirty: true,
  });
  const after = runAsteroidInstanceCameraDirtyMicrobench({
    rockCount, frames, jitterWu, exactCameraDirty: false,
  });
  return {
    rocks: rockCount,
    frames,
    jitterWu,
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
    beforeDirtyRate: +before.dirtyRate.toFixed(4),
    afterDirtyRate: +after.dirtyRate.toFixed(4),
    beforeMatrixEvals: before.matrixEvals,
    afterMatrixEvals: after.matrixEvals,
    beforeMatrixReuses: before.matrixReuses,
    afterMatrixReuses: after.matrixReuses,
  };
}

function oracle() {
  setAsteroidInstanceCameraCullExactCompare(false);
  const micro = runAsteroidInstanceCameraDirtyMicrobench({
    rockCount: 16, frames: 400, jitterWu: 0.05, exactCameraDirty: false,
  });
  const large = runAsteroidInstanceCameraDirtyMicrobench({
    rockCount: 16, frames: 400, jitterWu: 2.0, exactCameraDirty: false,
  });
  return {
    microDirtyRate: +micro.dirtyRate.toFixed(4),
    largeDirtyRate: +large.dirtyRate.toFixed(4),
    microQuieterThanLarge: micro.dirtyRate < large.dirtyRate,
    largeMostlyDirty: large.dirtyRate > 0.8,
  };
}

function isolatedPair(rockCount, frames, jitterWu) {
  const worker = `
    import { runAsteroidInstanceCameraDirtyMicrobench } from '../src/render/asteroidInstancePool.js';
    const before = runAsteroidInstanceCameraDirtyMicrobench({
      rockCount: ${rockCount}, frames: ${frames}, jitterWu: ${jitterWu}, exactCameraDirty: true,
    });
    const after = runAsteroidInstanceCameraDirtyMicrobench({
      rockCount: ${rockCount}, frames: ${frames}, jitterWu: ${jitterWu}, exactCameraDirty: false,
    });
    console.log(JSON.stringify({
      beforeMs: before.ms, afterMs: after.ms,
      speedup: before.ms / Math.max(after.ms, 1e-9),
      beforeDirtyRate: before.dirtyRate, afterDirtyRate: after.dirtyRate,
    }));
  `;
  const scriptPath = join(__dirname, '_asteroid-cam-quantize-worker.mjs');
  writeFileSync(scriptPath, worker);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`worker failed: ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const scenarios = [
  runPair(40, 3000, 0.05),
  runPair(80, 2500, 0.05),
  runPair(120, 2000, 0.05),
  runPair(120, 2000, 0.02),
  runPair(11, 4000, 0.05), // quiet Ceres rock count
];
const primary = scenarios.find((s) => s.rocks === 80 && s.jitterWu === 0.05) || scenarios[0];

const isolated = [];
for (let i = 0; i < 11; i++) {
  isolated.push(isolatedPair(80, 2000, 0.05));
}
const speedups = isolated.map((p) => p.speedup).sort((a, b) => a - b);
const median = speedups[Math.floor(speedups.length / 2)];
const floor = speedups[0];

const out = {
  label: 'asteroid-instance-camera-quantize',
  oracle: oracle(),
  scenarios,
  primary,
  isolatedPairs: isolated.map((p) => ({
    speedup: +p.speedup.toFixed(3),
    beforeMs: +p.beforeMs.toFixed(3),
    afterMs: +p.afterMs.toFixed(3),
    beforeDirtyRate: +p.beforeDirtyRate.toFixed(4),
    afterDirtyRate: +p.afterDirtyRate.toFixed(4),
  })),
  medianSpeedup: +median.toFixed(3),
  floorMinSpeedup: +floor.toFixed(3),
  note: 'Portable asteroid pool sync. Soft-GPU fps not claimed. Before=exact cameraDirty; After=0.25WU/1e-3 quantize.',
};
writeFileSync(
  new URL('./asteroid-instance-camera-quantize-microbench.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
