// Row 509 (W-SUBSTANCE): ten substance materials layered over the body-class material vocabulary
// in environmentMaterials.js. A substance decides how a rock answers a throw — restitution (the
// physics contact read, resolved in physicsAuthority), break behaviour (the environment-material
// family it fractures/detonates through, plus its own break speed), and an impact VFX family.
// `data.substance` is the stable stamp; `data.material` keeps owning the fracture vocabulary.
//
// "Ice loses mass in sunlight": substance `ice` carries sublimatesPerS — a live mass fraction the
// environment-material owner sheds each second while the sector reads sunlit.

export const ROCK_SUBSTANCES = Object.freeze({
  metallic_ore: Object.freeze({ envMaterial: 'metal',    restitution: 0.34, densityMult: 1.35, breakSpeed: 130, vfxFamily: 'sparks_white_hot', label: 'Metallic ore' }),
  silicate:     Object.freeze({ envMaterial: 'rock',     restitution: 0.22, densityMult: 1.0,  breakSpeed: 110, vfxFamily: 'grit_brown',       label: 'Silicate' }),
  ice:          Object.freeze({ envMaterial: 'cryo',     restitution: 0.30, densityMult: 0.62, breakSpeed: 70,  vfxFamily: 'shatter_blue',     label: 'Ice', sublimatesPerS: 0.004 }),
  slag:         Object.freeze({ envMaterial: 'calcite',  restitution: 0.12, densityMult: 1.5,  breakSpeed: 95,  vfxFamily: 'clinker_orange',   label: 'Slag' }),
  crystal:      Object.freeze({ envMaterial: 'crystal',  restitution: 0.42, densityMult: 0.8,  breakSpeed: 80,  vfxFamily: 'prism_ring',       label: 'Crystal' }),
  reef_metal:   Object.freeze({ envMaterial: 'metal',    restitution: 0.28, densityMult: 1.15, breakSpeed: 120, vfxFamily: 'sparks_teal',      label: 'Reef metal' }),
  cooked_rock:  Object.freeze({ envMaterial: 'volatile', restitution: 0.18, densityMult: 0.9,  breakSpeed: 60,  vfxFamily: 'cook_orange',      label: 'Cooked rock' }),
  vethari_bone: Object.freeze({ envMaterial: 'calcite',  restitution: 0.26, densityMult: 0.7,  breakSpeed: 85,  vfxFamily: 'bone_pale',        label: 'Vethari bone' }),
  bloom_husk:   Object.freeze({ envMaterial: 'rock',     restitution: 0.08, densityMult: 0.45, breakSpeed: 55,  vfxFamily: 'spore_green',      label: 'Bloom husk' }),
  junk:         Object.freeze({ envMaterial: 'debris',   restitution: 0.16, densityMult: 0.5,  breakSpeed: 50,  vfxFamily: 'scrap_grey',       label: 'Junk' }),
});

// Row 509's 24 rock bodies: three sizes x the eight everyday substances (rare vethari_bone and
// bloom_husk ride authored encounters, not the base spawn table).
export const ROCK_SIZE_CLASSES = Object.freeze({
  pebble:   Object.freeze({ tier: 1, radius: 9  }),
  boulder:  Object.freeze({ tier: 2, radius: 18 }),
  monolith: Object.freeze({ tier: 3, radius: 30 }),
});
const BASE_SUBSTANCES = ['metallic_ore', 'silicate', 'ice', 'slag', 'crystal', 'reef_metal', 'cooked_rock', 'junk'];

// Row 495: the same eight substances carry authored place_rock_<sub>_<pebble|boulder|monolith>
// bodies — 24 GLBs pinned in the census. vethari_bone and bloom_husk are ROCK_SUBSTANCES with
// no family body; any caller minting a place_rock_ id must gate on THIS set, not on
// ROCK_SUBSTANCES membership, or it can emit a body that was never built.
export const ROCK_PLACE_SUBSTANCES = Object.freeze(BASE_SUBSTANCES);

export const ROCK_BODIES = Object.freeze(BASE_SUBSTANCES.flatMap((subId) =>
  Object.entries(ROCK_SIZE_CLASSES).map(([sizeClass, size]) => {
    const sub = ROCK_SUBSTANCES[subId];
    const radius = size.radius;
    return Object.freeze({
      id: `rock_${subId}_${sizeClass}`,
      substance: subId,
      sizeClass,
      tier: size.tier,
      radius,
      mass: Math.round(radius * radius * 40 * sub.densityMult),
      restitution: sub.restitution,
      breakSpeed: sub.breakSpeed,
      envMaterial: sub.envMaterial,
      vfxFamily: sub.vfxFamily,
    });
  })));

export function rockSubstanceFor(id) {
  return ROCK_SUBSTANCES[id] || null;
}

/** Katamari ladder tier for a body by radius (05 §1 bands on the rock scale). */
export function rockTierForRadius(radius) {
  const r = Number(radius) || 0;
  if (r >= 38) return 4;
  if (r >= 24) return 3;
  if (r >= 14) return 2;
  if (r >= 6) return 1;
  return 0;
}

// Row 511 (W-LADDER): the Katamari ladder floor — every stocked field carries at least
// ROCK_LADDER_MIN_PER_TIER bodies on each tier T0–T4. Pinned ladder bedrock uses these band-centre
// radii; the census tool and the world spawner read the same table.
export const ROCK_LADDER_RADII = Object.freeze([4, 9, 17, 27, 41]);
export const ROCK_LADDER_MIN_PER_TIER = 6;

/**
 * Deterministic substance pick for a spawn slot — same hash discipline as adventureMaterialFor:
 * never consume the mining/spawn rng stream.
 */
export function rockSubstanceForSlot(seed, fieldId, slot, table = BASE_SUBSTANCES) {
  let hash = 2166136261;
  for (const ch of `${seed}:${fieldId}:sub:${Math.floor(Number(slot) / 3)}`) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return table[hash % table.length];
}

/**
 * Stamp the substance contract onto a spawn `data` object and report the density multiplier for
 * the caller's mass computation. Callers set `data.material` via environmentSurfaceData first;
 * the substance may carry a different env-material truth for break behaviour, so it wins.
 */
export function applyRockSubstance(data, substanceId) {
  const sub = ROCK_SUBSTANCES[substanceId];
  if (!sub || !data) return 1;
  data.substance = substanceId;
  data.material = sub.envMaterial;
  data.impactVfx = sub.vfxFamily;
  data.breakSpeed = sub.breakSpeed;
  if (!Number.isFinite(data.tier) || data.tier <= 0) data.tier = rockTierForRadius(data.size);
  if (sub.sublimatesPerS) data.sublimatesPerS = sub.sublimatesPerS;
  if (data.tier >= 3) data.scaleCue = 'monolith';
  return sub.densityMult;
}
