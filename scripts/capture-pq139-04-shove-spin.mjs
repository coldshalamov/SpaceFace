// PQ-139.04 — capture a shove-spin at the shipping camera (the leaf's frame evidence).
//
// Records one headed, normal-speed Crucible strip of `swarm_piloted` with the physics_toolkit
// loadout, whose tape fires the shove weapon from the player's cursor. Its projectile:hit
// moments key the strip on the player's own shove landing — the frames around each moment show
// a light hostile spun by the hit, whose card plume now draws the spin corkscrew
// (src/render/thruster/systems/continuousPlume.js instanceSpin). The player's own contrail
// corkscrew (b025ed3a) is captured by the same tape.
//
// Uses the shared capture harness (scripts/lib/bench/frameStripCapture.mjs) so the manifest,
// normal-speed floor, HUD-text check and source identity are identical to every other receipted
// strip. The screencast cost halves this box's run speed at every-3rd-frame, so the script takes
// an --every-nth override (recorded in the manifest like any other harness input); at 6 the
// capture holds ≥ 0.60 real time — the normal-speed floor — while still sampling the screw well
// (a hard tumble completes a turn in 1–3 s, i.e. 10–30 frames).
// Run: node scripts/capture-pq139-04-shove-spin.mjs [--every-nth=6]
import { captureFrameStrip, DEFAULT_STRIP_DIR } from './lib/bench/frameStripCapture.mjs';

const nthArg = process.argv.find((a) => a.startsWith('--every-nth='));
const screencastEveryNthFrame = nthArg ? Math.max(1, parseInt(nthArg.split('=')[1], 10) || 3) : 3;

const strip = await captureFrameStrip({
  bench: 'crucible',
  scenarioId: 'swarm_piloted',
  loadoutId: 'physics_toolkit',
  seed: 4242,
  headed: true,
  verbose: true,
  screencastEveryNthFrame,
});

console.log(`strip: ${strip.targetDir}`);
console.log(`manifest: ${strip.receiptDir}`);
console.log(`frames: ${strip.framesCount}, moments: ${strip.manifest.momentsCount}, `
  + `HUD text ${strip.manifest.hudTextVerified ? 'clean' : 'NOT clean'}, `
  + `real-time fraction ${strip.manifest.realtimeFraction} `
  + `(normal speed: ${strip.manifest.normalSpeed ? 'yes' : 'NO — slow motion, below the 0.60 floor'})`);
console.log(`(default strips dir: ${DEFAULT_STRIP_DIR})`);
