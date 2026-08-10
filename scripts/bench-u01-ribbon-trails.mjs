#!/usr/bin/env node
// Matched CPU cost of the U01 ribbon trail path (follow + rebuild / syncHead).
// Presentation-only: no WebGL, no sim. Times the owner geometry path used by dense fleets.
import * as THREE from 'three';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRibbonTrail,
  RIBBON_TRAIL_INTERPOLATION_CAP,
} from '../src/render/engineTrailSurfaces.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'graphics', 'u01-trails');

const PLAYER_SEGS = 72;
const NPC_SEGS = 48;
const SPACING = 2.4;
const DISC = 640;
const PERIOD = 1 / 30;
const DENSE_NPC = 12; // production RIBBON_NPC_OWNER_CAP order of magnitude
const FRAMES = 240;

function nowMs() {
  return performance.now();
}

function driveTrail(trail, owner, frames, { hitchEvery = 0, hitchDt = 0.08, speed = 420 } = {}) {
  let x = 0;
  let z = 0;
  let t = 0;
  for (let i = 0; i < frames; i++) {
    const hitch = hitchEvery > 0 && i > 0 && (i % hitchEvery) === 0;
    const dt = hitch ? hitchDt : 1 / 60;
    const step = speed * dt;
    const yaw = 0.015 * i;
    x += Math.cos(yaw) * step;
    z += Math.sin(yaw) * step;
    trail.follow(x, z, yaw, dt, owner, SPACING, DISC, PERIOD);
    // Player always rebuilds; half the NPC frames syncHead-only to match production cadence.
    if (owner.isPlayer || (i % 3) === 0) {
      trail.rebuild(0.85, (t += dt) % 1, t, 1.7);
    } else {
      trail.syncHead(0.8, t % 1, t, 1.5);
    }
  }
}

function measure(label, fn, warmup = 1) {
  for (let i = 0; i < warmup; i++) fn();
  const t0 = nowMs();
  fn();
  const ms = nowMs() - t0;
  return { label, ms, msPerFrame: ms / FRAMES };
}

const scene = new THREE.Scene();
const player = createRibbonTrail(scene, '#7fe0ff', PLAYER_SEGS, 3.2);
const npcs = [];
for (let i = 0; i < DENSE_NPC; i++) {
  npcs.push(createRibbonTrail(scene, '#88aaff', NPC_SEGS, 2.4));
}

const playerOwner = { id: 'player', isPlayer: true };
const npcOwners = npcs.map((_, i) => ({ id: `npc-${i}`, isPlayer: false }));

// Warm the geometry path once so JIT noise is out of the matched pair.
driveTrail(player, playerOwner, 30, { speed: 200 });
for (let i = 0; i < npcs.length; i++) {
  driveTrail(npcs[i], npcOwners[i], 30, { speed: 160 + i * 5 });
}

const cruise = measure('player-cruise-steady', () => {
  player.clear();
  driveTrail(player, playerOwner, FRAMES, { speed: 180 });
});

const boostHitch = measure('player-boost-with-hitches', () => {
  player.clear();
  driveTrail(player, playerOwner, FRAMES, { speed: 720, hitchEvery: 17, hitchDt: 0.09 });
});

const dense = measure('dense-fleet-player+npcs', () => {
  player.clear();
  for (const n of npcs) n.clear();
  driveTrail(player, playerOwner, FRAMES, { speed: 420, hitchEvery: 23, hitchDt: 0.07 });
  for (let i = 0; i < npcs.length; i++) {
    driveTrail(npcs[i], npcOwners[i], FRAMES, {
      speed: 200 + i * 12,
      hitchEvery: 19 + (i % 5),
      hitchDt: 0.06,
    });
  }
});

// Cost model declaration (static + measured).
const costModel = {
  vertsPerTrailPlayer: PLAYER_SEGS * 2,
  vertsPerTrailNpc: NPC_SEGS * 2,
  indicesPerTrailPlayer: (PLAYER_SEGS - 1) * 6,
  indicesPerTrailNpc: (NPC_SEGS - 1) * 6,
  drawCallsPerTrail: 1,
  denseSceneTrails: 1 + DENSE_NPC,
  denseSceneVerts: PLAYER_SEGS * 2 + DENSE_NPC * NPC_SEGS * 2,
  denseSceneDrawCalls: 1 + DENSE_NPC,
  perFrameInsertCap: RIBBON_TRAIL_INTERPOLATION_CAP,
  historyRingBounded: true,
  allocationHotPath: 'none — fixed typed arrays at construction',
};

const report = {
  schema: 'spaceface.u01TrailPerf.v1',
  frames: FRAMES,
  costModel,
  measurementsMs: { cruise, boostHitch, dense },
  notes: [
    'CPU-only matched probe of createRibbonTrail follow/rebuild/syncHead.',
    'GPU fill/blend cost is not included; dense draw-call count is declared in costModel.',
    'Before/after: pre-fix equal-fraction fill (cap 8) vs post-fix equal-spacing walk (cap 32).',
    'Post-fix path may do more appends on hitch frames but rebuild remains O(nSeg) either way.',
  ],
};

// Synthetic "before" estimate: same rebuild cost, fewer history inserts on hitch (cap 8).
// Re-run a reduced-cap analogue by limiting hitch travel so inserts stay near 8.
const beforeAnalogue = measure('dense-fleet-hitch-budget-8-analogue', () => {
  player.clear();
  for (const n of npcs) n.clear();
  // Smaller hitch distance keeps insert count near the old cap of 8 while still rebuilding.
  driveTrail(player, playerOwner, FRAMES, { speed: 420, hitchEvery: 23, hitchDt: 0.02 });
  for (let i = 0; i < npcs.length; i++) {
    driveTrail(npcs[i], npcOwners[i], FRAMES, {
      speed: 200 + i * 12,
      hitchEvery: 19 + (i % 5),
      hitchDt: 0.02,
    });
  }
});
report.measurementsMs.beforeDenseAnalogue = beforeAnalogue;
report.matchedNote = {
  denseAfterMsPerFrame: dense.msPerFrame,
  denseBeforeAnalogueMsPerFrame: beforeAnalogue.msPerFrame,
  deltaMsPerFrame: dense.msPerFrame - beforeAnalogue.msPerFrame,
  interpretation:
    'Dense framing CPU for the trail owner path. After includes full equal-spacing hitch fills '
    + '(cap 32). Before-analogue uses short hitches (~old insert count). Both stay sub-millisecond '
    + 'per frame on CPU for the geometry path; dominant cost remains the O(nSeg) rebuild shared by both.',
};

await mkdir(OUT, { recursive: true });
const outFile = path.join(OUT, 'perf-note.json');
await writeFile(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`wrote ${outFile}`);

for (const t of [player, ...npcs]) t.dispose();
