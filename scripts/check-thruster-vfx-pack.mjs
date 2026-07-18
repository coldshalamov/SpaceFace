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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VFX = resolve(ROOT, 'src/render/vfx.js');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'thruster_vfx_verify.json');

const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };
const src = readFileSync(VFX, 'utf8');

const cycles = [
  { id: 1, name: 'batched continuous plume', re: /new ContinuousPlumeSystem/ },
  { id: 2, name: 'authored socket binding', re: /_writeProductionPlumeSockets/ },
  { id: 3, name: 'legacy Kestrel trail suppression', re: /_usesProductionThruster\(e\).*return \{ particles: 0, streaks: 0 \}/s },
  { id: 4, name: 'continuous boost response', re: /opts\.boost = driveInfo\.boost/ },
  { id: 5, name: 'directional RCS system', re: /new RcsImpulseSystem/ },
  { id: 6, name: 'trail socket objects', re: /_trailSocketObjects/ },
  { id: 7, name: 'deterministic texture binding', re: /loadKestrelThrusterTextures/ },
  { id: 8, name: 'recipe-driven plume geometry', re: /KESTREL_MAIN_PLUME_RECIPE/ },
  { id: 9, name: 'RCS structural separation', re: /KESTREL_RCS_RECIPE/ },
  { id: 10, name: 'hide energy plumes idle', re: /_hideEnergyPlumes/ },
];

const cycleResults = cycles.map((c) => {
  const ok = c.re.test(src);
  assert(ok, `cycle ${c.id}: ${c.name}`);
  return { id: c.id, name: c.name, ok };
});

// Drive the real recipe, material, batching, lifecycle, and accessibility APIs.
try {
  assert(validateRecipe(KESTREL_MAIN_PLUME_RECIPE).ok, 'main plume recipe invalid');
  assert(validateRecipe(KESTREL_RCS_RECIPE).ok, 'RCS recipe invalid');
  assert(assertRcsStructurallyDistinct(KESTREL_MAIN_PLUME_RECIPE, KESTREL_RCS_RECIPE).ok,
    'RCS is not structurally distinct from main plume');
  const plume = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, { distortionEnabled: false });
  const rcs = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE);
  assert(plume.assertLayerBindings().ok, 'main plume layer binding failed');
  assert(rcs.assertLayerBindings().ok, 'RCS layer binding failed');
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const driven = plume.update(1 / 60, 1, sockets, { boost: 0.6, a11y: { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' } });
  assert(driven.activeCount > 0 && driven.frameAllocations === 0, 'main plume did not batch without frame allocations');
  rcs.fire([0, 0, 0], [0, 0, 1], 1);
  const impulse = rcs.update(1 / 60, { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' });
  assert(impulse.activeSlotCount > 0 && impulse.frameAllocations === 0, 'RCS did not batch without frame allocations');
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
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, 'thruster-pack-note.txt'), [
  'Thruster/RCS VFX pack (rank 3)',
  `cycles: ${report.cyclesPassed}/10 ok=${report.ok}`,
  'States: idle fade, continuous throttle/boost, multi-socket, paired RCS, reduced-motion/flash',
].join('\n'));

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
