// Combat/engine effect programs that first-link inside presented flight on software GL.
// Measured family (perf lane tw4-tw7 + fx0 draw attribution, both arms, post-lift links >700 ms):
//   - liquid-plasma strand mesh (unnamed ShaderMaterial under `sf-liquid-plasma-root`), up to 2.7 s
//   - SF_ExplosionRupture_material-transport (2.2 s), SF_ActionPrimitiveMatter (1.5 s),
//     SF_FilteredForceParticleTransport (1.2 s), SF_ArcadePhysicalShardMaterial (1.1 s),
//     SF_StructuralPlateMaterial (arcade structural fx, 0.46 s in the fxs2 smoke)
//   - thruster plume layers `plume:<family>:core|distortion` (0.8-1.9 s)
//   - engine trail surfaces (`SF_TrailStreakInstances`, `SF_RibbonTrail`, unnamed ShaderMaterials)
// fx2 (10v10 vs master) cut the set to what still links >250 ms after the lift on master:
//   sf-overflow-jets (<=1.1 s), SF_ActionPrimitiveMatter (0.78 s), SF_StructuralPlateMaterial
//   (0.39 s), plume:family_industrial_main_plume:core (0.71 s), liquid plasma (0.53 s) and
//   SF_RibbonTrail (0.48 s on the fx2 arm). Driving every family through
//   warmupLiveFlightEffects cost ~+2.8 s of load, so the rest stays lazy.
// The opening warm touches one live instance of each through the exact-target pass while the
// loading shell owns the picture, so the ANGLE link is paid behind the veil, not in a frame.

import { shouldAwaitOpeningGpuCook } from './renderCapabilityProfile.js';

export const OPENING_EFFECT_ROOT_NAMES = Object.freeze([
  'sf-liquid-plasma-root',
  'SF_RibbonTrail',
  'sf-overflow-jets',
  // The live cause-mark layer (vfx/causeMarks.js) is invisible at drawRange 0 until the first scar,
  // kill or field edge, so no warm or salvo ever draws it: its single LineBasicMaterial program
  // (one key on both arms) linked on the first mark, after the lift in most runs on both arms,
  // and cost 1.0-1.24 s when that landed beside a ship admission (fx4/fx5 cand, +9-10 s). The
  // exact-target touch reveals the live mesh itself, so the warmed key is the played key.
  'sf-cause-marks',
]);

// SF_FilteredForceParticleTransport: its program exists in every run but usually links under 60 ms;
// fx4 cand run 9 paid 670 ms for it +169 ms after the lift (master: 3 post-lift links in 50 runs).
// SF_ExplosionRupture_material-transport: fx6 cand run 10 paid 834 ms for it +1.4 s after the lift.
export const OPENING_EFFECT_MATERIAL_RE = /^(SF_ActionPrimitiveMatter|SF_StructuralPlateMaterial|SF_FilteredForceParticleTransport|SF_ExplosionRupture_material-transport|plume:family_industrial_main_plume:core)$/;

// Total wall time the warm may spend in touches, and how long it waits on any one before moving on.
export const OPENING_WARM_TOUCH_BUDGET_MS = 4000;
export const OPENING_WARM_TOUCH_TIMEOUT_MS = 1000;

// Plume systems the loading warm drives (only these get real buffers); every other fleet family,
// RCS family, the retro jets and per-NPC ribbons stay lazy, as on master.
export const OPENING_EFFECT_PLUME_DRIVE_RE = /^plume:family_industrial_main_plume:core$/;

/**
 * The opening effect warm runs only on the software / no-KHR_parallel_shader_compile route, where
 * the opening GPU cook is fire-and-forget (shouldAwaitOpeningGpuCook false) and the warm was
 * measured and gated. On a parallel-compile GPU the awaited cook builds and compiles these same
 * families itself (warmupLiveFlightEffects) and rests them on its own schedule
 * (restLiveFlightEffectsAfterCook); a second builder/rester on a 250 ms timer could hide plumes
 * and reset the overflow jets between that warmup and the cook's compile pass (#434 review, A).
 */
export function openingEffectWarmAllowed({ gpu, renderer } = {}) {
  return !!gpu && !shouldAwaitOpeningGpuCook({ gpu, renderer });
}

function materialsOf(object) {
  if (!object || !object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

/**
 * Returns one touch subject per distinct effect program family found under `scene`:
 * [{ key, subject }]. Root-named effects dedupe by root name; material-matched effects dedupe
 * by material name (every ship's plume of one family shares a program). `seen` (a Set of keys)
 * lets a repeated sweep skip families it already touched.
 */
export function collectOpeningEffectSubjects(scene, seen = new Set()) {
  const out = [];
  if (!scene || typeof scene.traverse !== 'function') return out;
  const rootNames = new Set(OPENING_EFFECT_ROOT_NAMES);
  const visit = (object, insideRoot) => {
    if (!object) return;
    const name = String(object.name || '');
    let inside = insideRoot;
    if (!insideRoot && rootNames.has(name)) {
      const key = `root:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, subject: object });
      }
      inside = true;
    }
    if (!inside) {
      for (const material of materialsOf(object)) {
        const materialName = String(material && material.name || '');
        if (!OPENING_EFFECT_MATERIAL_RE.test(materialName)) continue;
        const key = `material:${materialName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, subject: object });
      }
    }
    const children = object.children || [];
    for (let i = 0; i < children.length; i++) visit(children[i], inside);
  };
  visit(scene, false);
  return out;
}
