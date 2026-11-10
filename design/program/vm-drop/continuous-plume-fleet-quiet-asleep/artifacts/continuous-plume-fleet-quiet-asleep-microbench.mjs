/**
 * Primary KPI: ProductionThrusterFleet endFrame sleep path when all families already
 * asleep (quiet settled flight — player uses plasma stream / 0 continuous sockets;
 * no NPC family open).
 * Before = every sleeping family re-runs pool begin/endWrite + 5-layer mesh count/visibility zero.
 * After  = trust _familyQuietAsleep after first sleep publish; skip re-zero.
 * Soft-GPU fps not claimed. Picture unchanged (already invisible/empty).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const FAMILIES = 6;
const LAYERS = 5;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const FAMILIES = ${FAMILIES};
const LAYERS = ${LAYERS};
function makeFleet() {
  const families = Array.from({ length: FAMILIES }, () => ({
    plume: {
      pool: {
        begins: 0, ends: 0,
        beginFrame() { this.begins++; },
        endWrite() { this.ends++; return { activeCount: 0 }; },
      },
      layerBatches: Array.from({ length: LAYERS }, () => ({
        writeCount: 0,
        mesh: { count: 0, visible: false },
      })),
      group: { visible: false },
      endUpdate() { return { activeCount: 0 }; },
    },
  }));
  return {
    families,
    _familyOpen: new Uint8Array(FAMILIES),
    _familyQuietAsleep: new Uint8Array(FAMILIES),
    ships: [],
    _familySocketDemand: new Uint32Array(FAMILIES),
    _diag: {},
    _disposed: false,
    activeShipCount: 0,
    saturated: 0,
    _frameAllocs: 0,
    shipCapacity: 0,
    _capacityGrowths: 0,
    sleeps: 0,
    skips: 0,
  };
}
function endFrameBefore(fleet) {
  let familiesActive = 0;
  for (let fi = 0; fi < fleet.families.length; fi++) {
    if (!fleet._familyOpen[fi]) {
      const fam = fleet.families[fi];
      fam.plume.pool.beginFrame();
      fam.plume.pool.endWrite();
      if (fam.plume.layerBatches) {
        for (let b = 0; b < fam.plume.layerBatches.length; b++) {
          const batch = fam.plume.layerBatches[b];
          batch.writeCount = 0;
          if (batch.mesh) {
            batch.mesh.count = 0;
            batch.mesh.visible = false;
          }
        }
      }
      if (fam.plume.group) fam.plume.group.visible = false;
      fleet.sleeps++;
      continue;
    }
    const fam = fleet.families[fi];
    fam.plume.endUpdate(0.016);
    if (fam.plume.group.visible) familiesActive += 1;
  }
  return familiesActive;
}
function endFrameAfter(fleet) {
  let familiesActive = 0;
  for (let fi = 0; fi < fleet.families.length; fi++) {
    if (!fleet._familyOpen[fi]) {
      if (fleet._familyQuietAsleep[fi]) { fleet.skips++; continue; }
      const fam = fleet.families[fi];
      fam.plume.pool.beginFrame();
      fam.plume.pool.endWrite();
      if (fam.plume.layerBatches) {
        for (let b = 0; b < fam.plume.layerBatches.length; b++) {
          const batch = fam.plume.layerBatches[b];
          batch.writeCount = 0;
          if (batch.mesh) {
            batch.mesh.count = 0;
            batch.mesh.visible = false;
          }
        }
      }
      if (fam.plume.group) fam.plume.group.visible = false;
      fleet._familyQuietAsleep[fi] = 1;
      fleet.sleeps++;
      continue;
    }
    const fam = fleet.families[fi];
    fleet._familyQuietAsleep[fi] = 0;
    fam.plume.endUpdate(0.016);
    if (fam.plume.group.visible) familiesActive += 1;
  }
  return familiesActive;
}
const fleet = makeFleet();
// all families asleep (quiet open flight)
fleet._familyOpen.fill(0);
const before = ${JSON.stringify(mode)} === 'before';
const step = before ? endFrameBefore : endFrameAfter;
// prime: first after frame publishes sleep once
for (let i = 0; i < 3000; i++) step(fleet);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) step(fleet);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, mode: ${JSON.stringify(mode)},
  sleeps: fleet.sleeps, skips: fleet.skips,
  begins: fleet.families.reduce((n, f) => n + f.plume.pool.begins, 0),
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'spawn failed');
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  pairs.push({ beforeMs: b.ms, afterMs: a.ms, speedup: b.ms / a.ms });
}
pairs.sort((x, y) => x.speedup - y.speedup);
const median = pairs[Math.floor(pairs.length / 2)].speedup;
const minSpeedup = pairs[0].speedup;
const maxSpeedup = pairs[pairs.length - 1].speedup;
const out = {
  name: 'continuous-plume-fleet-quiet-asleep',
  primary: 'quiet-6family-all-asleep-endFrame',
  iterations: ITERS,
  runs: RUNS,
  families: FAMILIES,
  layers: LAYERS,
  pairs,
  medianSpeedup: Math.round(median * 1000) / 1000,
  minSpeedup: Math.round(minSpeedup * 1000) / 1000,
  maxSpeedup: Math.round(maxSpeedup * 1000) / 1000,
};
writeFileSync('artifacts/continuous-plume-fleet-quiet-asleep-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
