// Integrated-GPU effects & overdraw budget (DEMO-FRAME-1, ?rfx=-vfxBudget = off).
//
// Large translucent volumes (raymarched gas boxes, stacked flipbook clouds, unbounded GPU spark
// rings, long 24-segment weapon wakes, and dense 3D mesh particle bursts) saturate fill rate and
// dynamic vertex uploads on integrated GPUs during crowded Swarm waves. This policy activates
// automatically on integrated/software GPUs and low-quality presets, and toggles live per frame
// via frameCostFixOn('vfxBudget') with zero shader recompiles or pool rebuilds.
import { frameCostFixOn } from '../frameCostSwitches.js';

export const VFX_BUDGET = Object.freeze({
  // Volumetric gas raymarch: fewer steps (4..11 vs 6..28 = ~60% fewer 3D texture fetches/px)
  // and bounded overlapping box count per frame.
  gasMinSteps: 4,
  gasMaxSteps: 11,
  gasDefaultMinSteps: 6,
  gasDefaultMaxSteps: 28,
  gasMaxDrawn: 10,

  // GPU SparkField: cap effective active ring + submitted instance count (768 vs 4096) and cap
  // per-frame translucent PUFF/GLOW overdraw scale & burst count.
  sparkMaxInstances: 768,
  sparkMaxPuffScale: 24,
  sparkMaxGlowScale: 30,
  sparkMaxPuffsPerFrame: 18,
  sparkMaxGlowsPerFrame: 20,

  // WeaponRibbonPool: cap simultaneous drawn wakes & visible arc length so CPU triangulation and
  // 5-attribute bufferSubData uploads drop ~50-65% during multi-ship crossfire.
  ribbonMaxDrawn: 28,
  ribbonVisibleArcWu: 24,

  // Instanced translucent sprite/flipbook buckets: per-bucket caps + per-frame overdraw area budget
  // (measured in normalized screen-fraction area units) so clouds never stack 10x deep over ROPs.
  spriteBucketCaps: Object.freeze({
    flipSmoke: 14,
    smoke: 14,
    flipFire: 18,
    combustion: 18,
    flipRing: 24,
    ring: 24,
    ringLo: 28,
    flipSpark: 28,
    glow: 28,
    glowLo: 36,
    flipWisp: 4,
  }),
  spriteMaxSmokeScale: 26,
  spriteMaxOverdrawArea: 2.2,

  // Quarks 3D mesh particles: bounded live ceilings for additive bursts and scaled burst counts.
  quarksBurstScale: 0.55,
  quarksAdditiveCaps: Object.freeze({
    impactSpall: 44,
    shieldShards: 36,
    muzzleSparks: 28,
    damageVenting: 18,
    retroVenting: 16,
    casingEjection: 24,
  }),
  quarksSolidCapScale: 0.6,
});

export function isLowOrIntegratedVfxTarget(state) {
  if (!state) return false;
  const gpuTier = state.render && state.render.gpu && state.render.gpu.tier;
  if (gpuTier === 'integrated' || gpuTier === 'software') return true;
  const video = state.settings && state.settings.video;
  if (!video) return false;
  return video.qualityPreset === 'low'
    || video.qualityPreset === 'integrated'
    || video.qualityPreset === 'igpu60'
    || video.particleQuality === 'low';
}

export function isVfxBudgetActive(state) {
  return frameCostFixOn('vfxBudget') && isLowOrIntegratedVfxTarget(state);
}
