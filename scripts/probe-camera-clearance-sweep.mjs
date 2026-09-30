#!/usr/bin/env node
// Camera-clearance sweep: sweeps EVERY structure kind in modelTruthCensus.json
// (stations, places, wrecks, rocks, gates) across zooms, speeds, and approach bearings.
// Acceptance: insideFrames 0, hardClampFrames ~0, peak vertical acceleration gentle,
// and camera returns to set zoom.
//
// Usage:
//   node scripts/probe-camera-clearance-sweep.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createCameraGlide,
  resetCameraGlide,
  stepCameraGlide,
  GLIDE_TUNING,
} from '../src/render/cameraGlide.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CENSUS_PATH = path.join(ROOT, 'src', 'data', 'modelTruthCensus.json');
const OUT_DIR = path.join(ROOT, '.devshots', 'camera-clearance');

const MARGIN = 16;
const DT = 1 / 60;
const TILT_RAD = 60 * Math.PI / 180;

const ZOOMS = [45, 58, 144, 330];
const SPEEDS = [
  { name: 'crawl', speed: 40 },
  { name: 'cruise', speed: 195 },
  { name: 'boost', speed: 400 },
];
const BEARINGS = [
  0,
  Math.PI * 0.25,
  Math.PI * 0.5,
  Math.PI,
  Math.PI * 1.5,
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));

// Filter to structures: stations, places, wrecks, rocks, gates
const STRUCTURE_FAMILIES = new Set(['station', 'place', 'gate', 'wreck', 'rock', 'rock-authored']);
const structures = census.rows.filter((r) => STRUCTURE_FAMILIES.has(r.family));

console.log(`Sweeping ${structures.length} structures across ${ZOOMS.length} zooms x ${SPEEDS.length} speeds x ${BEARINGS.length} bearings = ${structures.length * ZOOMS.length * SPEEDS.length * BEARINGS.length} scenarios...`);

let totalScenarios = 0;
let totalInsideFrames = 0;
let totalHardClampFrames = 0;
let maxPeakAccel = 0;
let failCount = 0;

const summaryByFamily = {};

for (const row of structures) {
  const family = row.family;
  if (!summaryByFamily[family]) {
    summaryByFamily[family] = { count: 0, scenarios: 0, insideFrames: 0, hardClampFrames: 0, maxAccel: 0 };
  }
  summaryByFamily[family].count++;

  const b = row.bounds;
  const minX = b.min[0];
  const maxX = b.max[0];
  const minY = b.min[1];
  const maxY = b.max[1];
  const minZ = b.min[2];
  const maxZ = b.max[2];

  const halfX = (maxX - minX) * 0.5;
  const halfZ = (maxZ - minZ) * 0.5;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const roofHeight = maxY + MARGIN;
  const span = Math.max(maxX - minX, maxZ - minZ);

  const roofAt = (x, z, pad = 0) => {
    if (Math.abs(x - cx) <= halfX + pad && Math.abs(z - cz) <= halfZ + pad) {
      return roofHeight;
    }
    return -Infinity;
  };

  for (const zoom of ZOOMS) {
    const rx = 0;
    const ry = zoom * Math.sin(TILT_RAD);
    const rz = -zoom * Math.cos(TILT_RAD);

    for (const { speed } of SPEEDS) {
      for (const bearing of BEARINGS) {
        totalScenarios++;
        summaryByFamily[family].scenarios++;

        const glide = createCameraGlide(GLIDE_TUNING);
        resetCameraGlide(glide);

        const travelDist = Math.max(span * 1.5, speed * 3.5, 600);
        // Settle distance: account for peak scale descending at maxDownScalePerS plus holdS and damping tail
        const requiredScale = Math.max(1, roofHeight / ry);
        const returnTime = GLIDE_TUNING.holdS + (requiredScale - 1) / GLIDE_TUNING.maxDownScalePerS + 4.0;
        const settleDist = Math.max(travelDist, speed * returnTime);
        const flightTime = (travelDist + settleDist) / speed;
        const totalSteps = Math.ceil(flightTime / DT);

        const dirX = Math.sin(bearing);
        const dirZ = Math.cos(bearing);

        const startX = cx - dirX * travelDist;
        const startZ = cz - dirZ * travelDist;

        let insideCount = 0;
        let prevY = ry;
        let prevVy = 0;
        let peakScenarioAccel = 0;

        for (let step = 0; step <= totalSteps; step++) {
          const t = step * DT;
          const tx = startX + dirX * speed * t;
          const tz = startZ + dirZ * speed * t;

          const s = stepCameraGlide(
            glide,
            step === 0 ? 0 : DT,
            tx,
            tz,
            rx,
            ry,
            rz,
            roofAt,
            14000
          );

          const camX = tx + s * rx;
          const camY = s * ry;
          const camZ = tz + s * rz;

          const currentRoof = roofAt(camX, camZ, 0);
          if (camY < currentRoof - 1e-4) {
            insideCount++;
          }

          if (step >= 1) {
            const vy = (camY - prevY) / DT;
            if (step >= 2) {
              const ay = Math.abs(vy - prevVy) / DT;
              if (ay > peakScenarioAccel) peakScenarioAccel = ay;
            }
            prevVy = vy;
          }
          prevY = camY;
        }

        const hardClamps = glide.diag.hardFrames || 0;
        totalInsideFrames += insideCount;
        totalHardClampFrames += hardClamps;
        if (peakScenarioAccel > maxPeakAccel) maxPeakAccel = peakScenarioAccel;
        if (peakScenarioAccel > summaryByFamily[family].maxAccel) {
          summaryByFamily[family].maxAccel = peakScenarioAccel;
        }
        summaryByFamily[family].insideFrames += insideCount;
        summaryByFamily[family].hardClampFrames += hardClamps;

        // Returns to set framing after clearing the structure
        const finalScale = glide.scale;
        const returned = finalScale <= 1.05;

        if (insideCount > 0 || !returned) {
          failCount++;
          console.error(`FAIL: ${row.id} (zoom ${zoom}, speed ${speed}, bearing ${bearing.toFixed(2)}): inside=${insideCount}, hardClamps=${hardClamps}, finalScale=${finalScale.toFixed(2)}`);
        }
      }
    }
  }
}

const report = {
  totalStructures: structures.length,
  totalScenarios,
  totalInsideFrames,
  totalHardClampFrames,
  maxPeakAccelWuS2: Math.round(maxPeakAccel),
  failCount,
  byFamily: summaryByFamily,
};

fs.writeFileSync(path.join(OUT_DIR, 'sweep-report.json'), JSON.stringify(report, null, 2));

console.log('\n--- CAMERA CLEARANCE SWEEP RESULTS ---');
console.log(`Structures tested: ${structures.length}`);
console.log(`Scenarios evaluated: ${totalScenarios}`);
console.log(`Total inside frames: ${totalInsideFrames}`);
console.log(`Total hard clamp frames: ${totalHardClampFrames}`);
console.log(`Peak vertical acceleration: ${Math.round(maxPeakAccel)} WU/s^2`);
console.log(`Failures: ${failCount}`);
console.log('\nFamily Breakdown:');
for (const [fam, data] of Object.entries(summaryByFamily)) {
  console.log(`  ${fam.padEnd(16)}: ${data.count} models, insideFrames: ${data.insideFrames}, hardClamps: ${data.hardClampFrames}, maxAccel: ${Math.round(data.maxAccel)} WU/s^2`);
}

if (totalInsideFrames > 0 || failCount > 0) {
  process.exit(1);
} else {
  console.log('\nSWEEP PASSED: insideFrames 0 everywhere, smooth acceleration, returns to zoom cleanly.');
}
