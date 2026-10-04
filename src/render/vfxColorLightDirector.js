// VFX→lighting director: one table maps VFX families to dynamic-light requests.
// Pure data + pure math. Sim never imports this; presenters call presetFor() and
// route the result through vfx._flashLight (the single admission/cull/a11y owner).
// Pools are fixed elsewhere (6 event + 2 weapon); this file invents no lights.
//
// FB-074 — the director is now the single writer for every event light in vfx.js.
// Call sites name an event kind plus an optional severity ("capital", "break",
// "terrain", a phase or cause name); the preset row carries the authored colour,
// peak, decay, distance and admission priority. Per-site literals are retired —
// a call site may still pass a size multiplier, a distance expression, or an
// authored colour source (weapon profile, doctrine style, ore tint), but it no
// longer hand-tunes the identity itself.

export const VFX_LIGHT_KINDS = Object.freeze([
  'muzzle', 'explosion', 'beam', 'shield', 'mining', 'thrust', 'field', 'pickup',
  'impact', 'graze', 'collision', 'tether', 'tell', 'law', 'cue', 'vein',
]);

// peak = PointLight intensity at spawn; distance = falloff radius (WU);
// decay = flash snap (higher = snappier); priority = pool admission weight.
const PRESETS = {
  muzzle: { color: '#9adcff', peak: 2.4, decay: 9, distance: 78, priority: 0.45 },
  // Muzzle severities — family-level ignition identities (rail / emp / thermal / pulse /
  // explosive / torpedo), never per-weapon rows. Colour stays on the weapon profile at the
  // call site; the row carries the heat signature of the family.
  muzzleRail: { color: '#e8f6ff', peak: 4.2, decay: 12, distance: 150, priority: 0.5 },
  muzzleEmp: { color: '#668cff', peak: 3.8, decay: 11, distance: 145, priority: 0.5 },
  muzzleThermal: { color: '#ff6a24', peak: 3.2, decay: 11, distance: 105, priority: 0.5 },
  muzzlePulse: { color: '#34cfff', peak: 2.8, decay: 11, distance: 125, priority: 0.5 },
  muzzleExplosive: { color: '#ff8844', peak: 3.1, decay: 10, distance: 115, priority: 0.5 },
  muzzleTorpedo: { color: '#ff8844', peak: 4.4, decay: 10, distance: 160, priority: 0.55 },

  explosion: { color: '#ffb05b', peak: 7.5, decay: 6, distance: 120, priority: 0.9 },
  explosionCapital: { color: '#fff0c0', peak: 12.0, decay: 5.5, distance: 150, priority: 1.0 },
  // Explosion severities — the phased/causal identities inside a destruction sequence.
  explosionIgnition: { color: '#fff0c0', peak: 7.5, decay: 11, distance: 120, priority: 0.85 },
  explosionBurst: { color: '#ffa050', peak: 8.0, decay: 5.5, distance: 180, priority: 0.95 },
  explosionBurstCapital: { color: '#ffa050', peak: 13.0, decay: 5.5, distance: 180, priority: 1.0 },
  explosionCompression: { color: '#ffc080', peak: 6.4, decay: 12, distance: 100, priority: 0.8 },
  explosionShear: { color: '#dcecff', peak: 6.8, decay: 12, distance: 110, priority: 0.8 },
  explosionKineticIgnition: { color: '#fff0d0', peak: 5.8, decay: 11, distance: 110, priority: 0.8 },
  explosionThermalIgnition: { color: '#ff9a48', peak: 8.2, decay: 11, distance: 110, priority: 0.85 },
  explosionTear: { color: '#ff9a50', peak: 8.4, decay: 7, distance: 140, priority: 0.9 },
  explosionBeat: { color: '#ffb05b', peak: 5.0, decay: 10, distance: 100, priority: 0.7 },
  explosionBeatRupture: { color: '#ffb05b', peak: 8.0, decay: 10, distance: 100, priority: 0.85 },
  explosionReactor: { color: '#91dfff', peak: 5.0, decay: 10, distance: 100, priority: 0.75 },
  explosionReactorRupture: { color: '#91dfff', peak: 8.0, decay: 10, distance: 100, priority: 0.9 },
  explosionBreach: { color: '#ff8a3a', peak: 2.6, decay: 12, distance: 90, priority: 0.6 },
  explosionDetonation: { color: '#fff0d0', peak: 7.5, decay: 11, distance: 120, priority: 0.9 },

  beam: { color: '#8d66ff', peak: 2.8, decay: 8, distance: 90, priority: 0.55 },
  shield: { color: '#6fd8ff', peak: 2.8, decay: 8, distance: 86, priority: 0.5 },
  // Shield severities — the scar a hit leaves on a live bubble, then the tear when it breaks.
  shieldContact: { color: '#6fd8ff', peak: 2.8, decay: 11, distance: 110, priority: 0.55 },
  shieldBreak: { color: '#39d0ff', peak: 7.2, decay: 9, distance: 240, priority: 0.95 },

  mining: { color: '#ffd9a0', peak: 1.6, decay: 10, distance: 72, priority: 0.3 },
  // Mining severities — ore-tinted at the call site; the row owns the work light's weight.
  miningContact: { color: '#ffd9a0', peak: 4.6, decay: 3.8, distance: 155, priority: 0.7 },
  miningYield: { color: '#ffd9a0', peak: 6.0, decay: 4.5, distance: 200, priority: 0.8 },
  miningShatter: { color: '#ffd9a0', peak: 5.0, decay: 4.0, distance: 170, priority: 0.75 },

  thrust: { color: '#39d0ff', peak: 3.2, decay: 7, distance: 140, priority: 0.72 },
  // Thrust severities — a quick boost flare vs the hotter afterburner ignition.
  thrustBoost: { color: '#39d0ff', peak: 2.2, decay: 14, distance: 80, priority: 0.4 },
  thrustAfterburner: { color: '#8f66ff', peak: 2.8, decay: 16, distance: 95, priority: 0.45 },

  field: { color: '#b49aff', peak: 4.6, decay: 6, distance: 155, priority: 0.65 },
  pickup: { color: '#d7efff', peak: 2.8, decay: 9, distance: 86, priority: 0.35 },

  // Surface-contact identities.
  impact: { color: '#ff9a5a', peak: 2.6, decay: 12, distance: 90, priority: 0.6 },
  impactHull: { color: '#ff7040', peak: 2.2, decay: 11, distance: 90, priority: 0.55 },
  impactDetonation: { color: '#39d0ff', peak: 4.2, decay: 8, distance: 180, priority: 0.7 },
  graze: { color: '#d8c39e', peak: 1.6, decay: 13, distance: 72, priority: 0.35 },
  collision: { color: '#bcd8ff', peak: 3.5, decay: 9, distance: 120, priority: 0.75 },
  collisionTerrain: { color: '#ffcaa0', peak: 3.5, decay: 9, distance: 120, priority: 0.75 },

  // Tether identities — the anchor catch and the endpoint recoil on a cut.
  tether: { color: '#39d0ff', peak: 3.2, decay: 12, distance: 140, priority: 0.6 },
  tetherSnap: { color: '#ffb0a0', peak: 5.4, decay: 12, distance: 200, priority: 0.7 },

  // Doctrine tells — colour stays authored per tell style; the row owns the start weight.
  // 'mark' is the enemy-face tell, 'mark-calm' its reduced-flash form, 'link' the offscreen edge.
  tell: { color: '#ffd9a0', peak: 2.6, decay: 9, distance: 140, priority: 0.5 },
  tellMark: { color: '#ffd9a0', peak: 2.6, decay: 9, distance: 140, priority: 0.5 },
  tellMarkCalm: { color: '#ffd9a0', peak: 1.4, decay: 9, distance: 140, priority: 0.5 },
  tellLink: { color: '#ffd9a0', peak: 1.8, decay: 10, distance: 110, priority: 0.45 },

  // Law/heat flip accent — colour stays on LAW_HEAT_COLORS at the call site; the calm severity
  // is the reduced-motion form (lower peak, slower snap).
  law: { color: '#ff6a4a', peak: 4.8, decay: 9, distance: 160, priority: 0.8 },
  lawCalm: { color: '#ff6a4a', peak: 2.2, decay: 6, distance: 160, priority: 0.8 },

  // Generic presentation-cue lights — style-authored colour/weight override; the row is the
  // identity a cue gets when its style declares none.
  cue: { color: '#ffffff', peak: 2.6, decay: 9, distance: 120, priority: 0.5 },

  // Rich-core vein events — the exposed seam and the payout release.
  vein: { color: '#8d66ff', peak: 2.8, decay: 8, distance: 150, priority: 0.6 },
  veinPayout: { color: '#d7e6ff', peak: 3.8, decay: 7, distance: 180, priority: 0.7 },
};

Object.freeze(PRESETS);
for (const key of Object.keys(PRESETS)) Object.freeze(PRESETS[key]);

export const VFX_LIGHT_PRESETS = PRESETS;

// Normalised lookup: 'explosionCapital', 'explosion-capital', 'explosion_capital' and
// 'explosioncapital' all resolve to the same row.
const LOOKUP = {};
for (const key of Object.keys(PRESETS)) LOOKUP[key.toLowerCase()] = key;

function normalize(value) {
  return String(value).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

// presetFor(kind, severity) — severity is a tier/phase/cause qualifier: 'capital',
// 'break', 'terrain', 'torpedo', 'reactor-rupture'. The variant row
// `${kind}${severity}` (camel case after normalisation) wins when present; otherwise
// the call falls back to the bare kind. Unknown kinds return null.
export function presetFor(kind, severity) {
  if (typeof kind !== 'string') return null;
  const key = normalize(kind);
  if (severity != null && severity !== '') {
    const variant = LOOKUP[key + normalize(severity)];
    if (variant) return PRESETS[variant];
  }
  // Historical alias kept: 'capital-explosion' orderings still hit explosionCapital.
  if (key === 'capitalexplosion') return PRESETS.explosionCapital;
  const hit = LOOKUP[key];
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
