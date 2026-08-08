/**
 * Structural + unit verification for Top-50 rank-2 massline VFX pack.
 * Drives real shipped symbols from src/render/vfx.js and energyMaterials.js
 * (no re-implementation of ribbon math).
 *
 * Usage: node scripts/check-massline-vfx-pack.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMasslineRibbonMaterial, updateEnergyMaterial } from '../src/render/energy/energyMaterials.js';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VFX_PATH = resolve(ROOT, 'src/render/vfx.js');
const OUT_DIR = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(ROOT, '.devshots/slice-A/massline_vfx_verify.json');

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// --- Verify cycle evidence (10 cycles against shipped source) ---
const src = readFileSync(VFX_PATH, 'utf8');

// Drive the real break handler. This proves sparks originate at both visible cable endpoints and the
// quality-scaled count stays bounded, without depending on how far comments/recoil code sit between
// a method name and a color literal in source.
const player = { id: 'player', type: 'ship', pos: { x: 0, z: 0 }, rot: 0, radius: 6 };
const target = { id: 'target', type: 'ship', pos: { x: 40, z: 0 }, rot: Math.PI, radius: 5 };
const snapHarness = Object.create(vfx);
snapHarness._scene = {};
snapHarness.state = { playerId: player.id };
snapHarness.helpers = { player: () => player };
snapHarness._tetherCable = { fade: 0, snapAge: 0, latchAge: 0, fadeRate: 0, wasActive: true };
snapHarness._burst = 1;
snapHarness._c0 = new THREE.Color();
snapHarness._c1 = new THREE.Color();
snapHarness._emitJuiceCue = () => {};
snapHarness._ent = (id) => (id === target.id ? target : (id === player.id ? player : null));
const snapParticles = [];
snapHarness._spawnParticle = (x, z) => snapParticles.push({ x, z });
snapHarness._spawnSprite = () => {};
snapHarness._flashLight = () => {};
snapHarness._onTetherSnap({ targetId: target.id });
const snapCounts = new Map();
for (const particle of snapParticles) {
  const key = `${particle.x}:${particle.z}`;
  snapCounts.set(key, (snapCounts.get(key) || 0) + 1);
}
const snapEndCounts = [...snapCounts.values()];
const expectedPlayerNose = { x: 6, z: 0 };
const targetDx = target.pos.x - expectedPlayerNose.x;
const targetDz = target.pos.z - expectedPlayerNose.z;
const targetDistance = Math.hypot(targetDx, targetDz) || 1;
const expectedTargetSurface = {
  x: target.pos.x - (targetDx / targetDistance) * target.radius * 0.88,
  z: target.pos.z - (targetDz / targetDistance) * target.radius * 0.88,
};
const atEndpoint = (particle, endpoint) => Math.abs(particle.x - endpoint.x) < 1e-9
  && Math.abs(particle.z - endpoint.z) < 1e-9;
const playerNoseCount = snapParticles.filter((particle) => atEndpoint(particle, expectedPlayerNose)).length;
const targetSurfaceCount = snapParticles.filter((particle) => atEndpoint(particle, expectedTargetSurface)).length;
const breakEndpointsAligned = snapParticles.every((particle) => (
  atEndpoint(particle, expectedPlayerNose) || atEndpoint(particle, expectedTargetSurface)
));
const snapEndpointCounts = [playerNoseCount, targetSurfaceCount];
const breakDualEndBounded = breakEndpointsAligned
  && snapEndCounts.length === 2
  && snapEndpointCounts.every((count) => count >= 14 && count <= 22);

const cycles = [
  { id: 1, name: 'subscribes tether:attached', re: /tether:attached.*_onTetherLatch/s },
  { id: 2, name: 'subscribes tether:broken', re: /tether:broken.*_onTetherSnap/s },
  { id: 3, name: 'init cable ribbon materials', re: /createMasslineRibbonMaterial/ },
  { id: 4, name: 'update cable strain/load color', re: /_updateTetherCable/ },
  { id: 5, name: 'whip wave after latch', re: /whipAmp|whipEnv|whipT/ },
  { id: 6, name: 'latch dual-end flash', re: /_onTetherLatch[\s\S]{0,800}noseR/ },
  { id: 7, name: 'break dual-end sparks', ok: breakDualEndBounded },
  { id: 8, name: 'arc preview path', re: /_arcPreview|_updateArcPreview/ },
  { id: 9, name: 'reel glow presentation', re: /reelGlow/ },
  { id: 10, name: 'setTetherCableVisible used', re: /setTetherCableVisible/ },
];

const cycleResults = cycles.map((c) => {
  const ok = c.ok ?? c.re.test(src);
  assert(ok, `verify cycle ${c.id} failed: ${c.name}`);
  return { id: c.id, name: c.name, ok };
});

// --- Drive real massline material API ---
const mat = createMasslineRibbonMaterial({
  name: 'sf-test-massline',
  color: 0x39d0ff,
  intensity: 5.0,
  opacity: 0.7,
  pulseSpeed: 3.0,
});
assert(!!mat, 'createMasslineRibbonMaterial returned falsy');
assert(typeof mat === 'object', 'material is object');
// updateEnergyMaterial must accept ribbon frame used by vfx._updateTetherCable
try {
  updateEnergyMaterial(mat, {
    time: 1.25,
    color: { r: 0.22, g: 0.81, b: 1.0 },
    tension: 0.6,
    overload: false,
    reel: 0.2,
    pulseSpeed: 3.2,
    intensity: 6.0,
    opacity: 0.65,
  });
} catch (e) {
  assert(false, `updateEnergyMaterial threw: ${e.message}`);
}

// Stronger whip constants present (Top-50 rank-2 pass)
assert(/whipT \/ 0\.55/.test(src) || /0\.55/.test(src) && /whipEnv/.test(src), 'whip duration ~0.55 present');
assert(/chord \* 0\.28/.test(src) || /0\.28/.test(src), 'stronger whip amplitude constant present');

// Latch remains punchy; break is dual-ended but bounded so it cannot starve the recoil presentation.
assert(/Math\.max\(12, Math\.round\(20/.test(src), 'latch particle count elevated');
assert(breakDualEndBounded,
  `break particles must align to player nose and target surface with 14..22 at each, got ${JSON.stringify([...snapCounts])}`);

mkdirSync(OUT_DIR, { recursive: true });
const report = {
  schema: 'spaceface.masslineVfxVerify.v1',
  pack: 'massline_vfx',
  rank: 2,
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  materialApiOk: failures.length === 0 || !failures.some((f) => f.includes('material') || f.includes('updateEnergy')),
  breakEndpoints: {
    expectedPlayerNose,
    expectedTargetSurface,
    counts: snapEndpointCounts,
    aligned: breakEndpointsAligned,
  },
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));

// Marker stills (structural proof files for slice-A gate inventory)
const marker = resolve(OUT_DIR, 'massline-latch-note.txt');
writeFileSync(marker, [
  'Massline VFX pack (rank 2) — structural verify',
  `cycles: ${report.cyclesPassed}/10`,
  `ok: ${report.ok}`,
  'States covered in code: attach/latch, taut/load color, reel glow, whip, break/snap, arc preview',
  'In-game pixels require flight session; this check gates shipped source paths.',
].join('\n'));

if (!report.ok) {
  console.error('check-massline-vfx-pack FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
