/**
 * Structural verify for Top-50 rank-3 thruster/RCS VFX pack.
 * Drives real shipped symbols from vfx.js + energy materials.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { RcsImpulseSystem, assertRcsStructurallyDistinct } from '../src/render/thruster/systems/rcsImpulse.js';
import { KESTREL_MAIN_PLUME_RECIPE, KESTREL_RCS_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';
import { validateRecipe } from '../src/render/thruster/recipes/validate.js';
import {
  listThrusterRecipePacks,
  assertAllLiveFamiliesDistinct,
  resolveThrusterRecipes,
} from '../src/render/thruster/recipes/registry.js';
import { assertContinuousThrottleResponse } from '../src/render/thruster/systems/throttleResponse.js';
import { FamilyProductionFleet } from '../src/render/thruster/systems/familyFleet.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VFX = resolve(ROOT, 'src/render/vfx.js');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'thruster_vfx_verify.json');

const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };
const src = readFileSync(VFX, 'utf8');

const FLEET = resolve(ROOT, 'src/render/thruster/systems/familyFleet.js');
const fleetSrc = readFileSync(FLEET, 'utf8');
const combined = `${src}\n${fleetSrc}`;

const cycles = [
  { id: 1, name: 'batched continuous plume', re: /new ContinuousPlumeSystem/, hay: combined },
  { id: 2, name: 'authored socket binding', re: /_writeProductionPlumeSockets/, hay: src },
  { id: 3, name: 'legacy Kestrel trail suppression', re: /_usesProductionThruster\(e\).*return \{ particles: 0, streaks: 0 \}/s, hay: src },
  { id: 4, name: 'continuous boost response', re: /setShipDrive|opts\.boost = driveInfo\.boost/, hay: src },
  { id: 5, name: 'directional RCS system', re: /new RcsImpulseSystem/, hay: combined },
  { id: 6, name: 'trail socket objects', re: /_trailSocketObjects/, hay: src },
  { id: 7, name: 'deterministic texture binding', re: /loadKestrelThrusterTextures/, hay: src },
  { id: 8, name: 'recipe-driven plume geometry', re: /KESTREL_MAIN_PLUME_RECIPE/, hay: combined },
  { id: 9, name: 'RCS structural separation', re: /KESTREL_RCS_RECIPE/, hay: combined },
  { id: 10, name: 'hide energy plumes idle', re: /_hideEnergyPlumes/, hay: src },
  { id: 11, name: 'family recipe resolver', re: /resolveThrusterRecipes/, hay: combined },
  { id: 12, name: 'multi-ship family fleet', re: /FamilyProductionFleet/, hay: src },
  { id: 13, name: 'continuum cruise/reverse signals', re: /setShipDrive\(ship, driveInfo\)|opts\.cruise = driveInfo\.cruise/, hay: src },
  { id: 14, name: 'activity-gated idle sleep', re: /Activity-gated, never "alive ship = awake"/, hay: src },
  { id: 15, name: 'pure profile id hot path', re: /resolveEngineProfileId/, hay: src },
];

const cycleResults = cycles.map((c) => {
  const ok = c.re.test(c.hay || src);
  assert(ok, `cycle ${c.id}: ${c.name}`);
  return { id: c.id, name: c.name, ok };
});

// Drive the real recipe, material, batching, lifecycle, and accessibility APIs.
try {
  assert(validateRecipe(KESTREL_MAIN_PLUME_RECIPE).ok, 'main plume recipe invalid');
  assert(validateRecipe(KESTREL_RCS_RECIPE).ok, 'RCS recipe invalid');
  assert(assertRcsStructurallyDistinct(KESTREL_MAIN_PLUME_RECIPE, KESTREL_RCS_RECIPE).ok,
    'RCS is not structurally distinct from main plume');
  assert(resolveThrusterRecipes('engine_ion_small').main === KESTREL_MAIN_PLUME_RECIPE,
    'ion_small must preserve accepted Kestrel substrate');
  const families = assertAllLiveFamiliesDistinct();
  assert(families.ok, `family distinction failed: ${families.failures.join('; ')}`);
  const packs = listThrusterRecipePacks();
  assert(packs.length >= 6, 'expected all live engine families in registry');
  for (const pack of packs) {
    assert(validateRecipe(pack.main).ok, `${pack.profileId} main invalid`);
    assert(validateRecipe(pack.rcs).ok, `${pack.profileId} rcs invalid`);
    assert(assertRcsStructurallyDistinct(pack.main, pack.rcs).ok, `${pack.profileId} rcs indistinct`);
    assert(assertContinuousThrottleResponse(pack.main).ok, `${pack.profileId} throttle not continuous`);
  }
  const plume = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  const rcs = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  assert(plume.assertLayerBindings().ok, 'main plume layer binding failed');
  assert(rcs.assertLayerBindings().ok, 'RCS layer binding failed');
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const driven = plume.update(1 / 60, 1, sockets, { boost: 0.6, a11y: { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' } });
  assert(driven.activeCount > 0 && driven.frameAllocations === 0, 'main plume did not batch without frame allocations');
  assert(plume.getActiveGeometryStats().vertexCount > 4, 'segmented geometry must sample axial envelope');
  rcs.fire([0, 0, 0], [0, 0, 1], 1);
  const impulse = rcs.update(1 / 60, { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' });
  assert(impulse.activeSlotCount > 0 && impulse.frameAllocations === 0, 'RCS did not batch without frame allocations');
  // Vector family GPU path (different structure from Kestrel).
  const vectorPack = resolveThrusterRecipes('engine_vector');
  const vectorPlume = new ContinuousPlumeSystem(THREE, vectorPack.main, { distortionEnabled: false });
  const vectorDriven = vectorPlume.update(1 / 60, 1, sockets, {
    boost: 0, cruise: 1, a11y: { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' },
  });
  assert(vectorDriven.activeCount > 0 && vectorDriven.frameAllocations === 0, 'vector family plume failed');
  assert(vectorDriven.mode === 'cruise' || vectorDriven.sample.mode === 'cruise', 'cruise continuum mode missing');
  // Multi-family fleet batch (player ion + NPC vector).
  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  fleet.beginFrame({ reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' });
  fleet.beginAdmitPhase();
  const pShip = fleet.acquireShip(1, 'engine_ion_small', true);
  const nShip = fleet.acquireShip(2, 'engine_vector', false);
  assert(pShip && nShip, 'fleet must reserve two families');
  fleet.setShipSockets(pShip, sockets, 1);
  fleet.setShipSockets(nShip, sockets, 1);
  fleet.setShipDrive(pShip, { drive: 1, boost: 0 });
  fleet.setShipDrive(nShip, { drive: 1, boost: 0 });
  const fdiag = fleet.endFrame(1 / 60);
  assert(fdiag.familiesActive >= 2, 'fleet must draw ≥2 families');
  assert(fdiag.frameAllocations === 0, 'fleet frame allocs');
  fleet.dispose();
  vectorPlume.dispose();
  plume.dispose();
  rcs.dispose();
} catch (e) {
  assert(false, `production thruster API failed: ${e.message}`);
}

mkdirSync(OUT, { recursive: true });
const report = {
  schema: 'spaceface.thrusterVfxVerify.v1',
  pack: 'thruster_rcs_vfx',
  rank: 3,
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  cyclesTotal: cycleResults.length,
  families: listThrusterRecipePacks().map((p) => p.profileId),
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, 'thruster-pack-note.txt'), [
  'Thruster/RCS VFX pack (VP-220 propulsion family)',
  `cycles: ${report.cyclesPassed}/${report.cyclesTotal} ok=${report.ok}`,
  `families: ${report.families.join(', ')}`,
  'States: idle/accel/cruise/boost/brake/reverse continuum, multi-socket, family RCS, a11y',
].join('\n'));

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  cycles: report.cyclesPassed,
  cyclesTotal: report.cyclesTotal,
  families: report.families.length,
  report: REPORT,
}, null, 2));
