// VFX→lighting director: one table maps VFX families to dynamic-light requests.
// Pure data + pure math. Sim never imports this; presenters call presetFor() and
// route the result through vfx._flashLight (the single admission/cull/a11y owner).
// Pools are fixed elsewhere (6 event + 2 weapon); this file invents no lights.

export const VFX_LIGHT_KINDS = Object.freeze([
  'muzzle', 'explosion', 'beam', 'shield', 'mining', 'thrust', 'field', 'pickup',
]);

// peak = PointLight intensity at spawn; distance = falloff radius (WU);
// decay = flash snap (higher = snappier); priority = pool admission weight.
const PRESETS = {
  muzzle: { color: '#9adcff', peak: 2.4, decay: 9, distance: 78, priority: 0.45 },
  explosion: { color: '#ffb05b', peak: 7.5, decay: 6, distance: 120, priority: 0.9 },
  explosionCapital: { color: '#fff0c0', peak: 12.0, decay: 5.5, distance: 150, priority: 1.0 },
  beam: { color: '#8d66ff', peak: 2.8, decay: 8, distance: 90, priority: 0.55 },
  shield: { color: '#6fd8ff', peak: 2.8, decay: 8, distance: 86, priority: 0.5 },
  mining: { color: '#ffd9a0', peak: 1.6, decay: 10, distance: 72, priority: 0.3 },
  thrust: { color: '#39d0ff', peak: 3.2, decay: 7, distance: 140, priority: 0.72 },
  field: { color: '#b49aff', peak: 4.6, decay: 6, distance: 155, priority: 0.65 },
  pickup: { color: '#d7efff', peak: 2.8, decay: 9, distance: 86, priority: 0.35 },
};

Object.freeze(PRESETS);
for (const key of Object.keys(PRESETS)) Object.freeze(PRESETS[key]);

export const VFX_LIGHT_PRESETS = PRESETS;

export function presetFor(kind) {
  if (typeof kind !== 'string') return null;
  const key = kind.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (key === 'explosioncapital' || key === 'capitalexplosion') return PRESETS.explosionCapital;
  const table = {
    muzzle: 'muzzle', explosion: 'explosion', beam: 'beam', shield: 'shield',
    mining: 'mining', thrust: 'thrust', field: 'field', pickup: 'pickup',
  };
  const hit = table[key];
  return hit ? PRESETS[hit] : null;
}

// Scale a preset for a sized event without inventing a new color identity.
// sizeMul scales peak mildly (sqrt keeps dense exchanges from washing out);
// capital events use the dedicated explosionCapital preset instead.
export function scalePreset(preset, { sizeMul = 1, boost = 0 } = {}) {
  if (!preset) return null;
  const size = Number.isFinite(sizeMul) && sizeMul > 0 ? sizeMul : 1;
  const boostBlend = Number.isFinite(boost) ? Math.max(0, Math.min(1, boost)) : 0;
  const peak = Math.max(0, preset.peak * (0.6 + 0.4 * Math.sqrt(size)) * (1 + 0.15 * boostBlend));
  return Object.freeze({
    color: preset.color,
    peak: Math.round(peak * 100) / 100,
    decay: preset.decay,
    distance: preset.distance,
    priority: preset.priority,
  });
}

export function describeVfxLightPlan() {
  return Object.freeze({
    schema: 'spaceface.vfxColorLightDirector.v1',
    kinds: VFX_LIGHT_KINDS,
    poolNote: '6 event + 2 weapon fixed; this director routes, never resizes',
  });
}
