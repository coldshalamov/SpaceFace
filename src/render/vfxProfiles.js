// Elite VFX profile resolver — maps authored part IDs + weapon defs to presentation lanes.
// Cosmetic only; sim never imports this module.
import { WEAPONS } from '../data/weapons.js';
import { SHIPS } from '../data/ships.js';

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

const DEFAULT_ENGINE = Object.freeze({
  id: 'engine_ion_small',
  style: 'ion',
  coreColor: '#88aaff',
  tailColor: '#10204a',
  boostCore: '#d8f0ff',
  cruiseCore: '#a6e8ff',
  spreadMul: 1.0,
  particleMul: 1.0,
  streakMul: 1.0,
  streakLenMul: 1.0,
  plumeCore: '#36c8ff',
  plumeHalo: '#6a4cff',
  plumeWidthMul: 1.0,
  plumeLengthMul: 1.0,
  flowSpeed: 2.4,
  noiseScale: 1.6,
  coreIntensity: 6.5,
  haloIntensity: 2.6,
  // Liquid-fire plume character (see energyMaterials.PLUME_FRAGMENT): plumeSwirl = domain-warp /
  // spiral of the flame, plumeFork = raggedness of the flickering tongues. Distinct per engine
  // family so the fleet's thruster trails read as different drives, not one recoloured tube.
  plumeSwirl: 0.5,
  plumeFork: 0.5,
});

export const ENGINE_PROFILES = Object.freeze({
  engine_ion_small: Object.freeze({
    ...DEFAULT_ENGINE,
    id: 'engine_ion_small',
    style: 'ion',
    coreColor: '#88aaff',
    tailColor: '#0c1838',
    spreadMul: 0.92,
    particleMul: 1.0,
    streakMul: 1.05,
    plumeCore: '#36c8ff',
    plumeHalo: '#5a78ff',
    flowSpeed: 2.6,
    noiseScale: 1.5,
    plumeSwirl: 0.45,
    plumeFork: 0.40,
  }),
  engine_ion_twin: Object.freeze({
    ...DEFAULT_ENGINE,
    id: 'engine_ion_twin',
    style: 'ion',
    coreColor: '#7ec8ff',
    tailColor: '#0a1e42',
    spreadMul: 1.08,
    particleMul: 1.15,
    streakMul: 1.12,
    streakLenMul: 1.1,
    plumeWidthMul: 0.92,
    plumeLengthMul: 1.08,
    plumeCore: '#42d4ff',
    plumeHalo: '#6888ff',
    flowSpeed: 2.8,
    plumeSwirl: 0.5,
    plumeFork: 0.45,
  }),
  engine_industrial: Object.freeze({
    ...DEFAULT_ENGINE,
    id: 'engine_industrial',
    style: 'industrial',
    coreColor: '#ffb35c',
    tailColor: '#2a1408',
    boostCore: '#ffe0a8',
    cruiseCore: '#ffc878',
    spreadMul: 1.35,
    particleMul: 1.25,
    streakMul: 0.88,
    streakLenMul: 1.2,
    plumeCore: '#ff9a44',
    plumeHalo: '#5c3018',
    plumeWidthMul: 1.22,
    plumeLengthMul: 1.18,
    flowSpeed: 1.9,
    noiseScale: 2.1,
    coreIntensity: 5.8,
    haloIntensity: 2.0,
    plumeSwirl: 0.7,
    plumeFork: 0.85,
  }),
  engine_resonator: Object.freeze({
    ...DEFAULT_ENGINE,
    id: 'engine_resonator',
    style: 'resonator',
    coreColor: '#8d66ff',
    tailColor: '#18082a',
    boostCore: '#c8a8ff',
    cruiseCore: '#9a7cff',
    spreadMul: 1.05,
    particleMul: 1.05,
    streakMul: 1.18,
    plumeCore: '#7a58ff',
    plumeHalo: '#2ad4aa',
    plumeWidthMul: 1.05,
    plumeLengthMul: 1.12,
    flowSpeed: 3.1,
    noiseScale: 2.8,
    coreIntensity: 7.2,
    haloIntensity: 2.8,
    plumeSwirl: 1.15,
    plumeFork: 0.55,
  }),
  engine_vector: Object.freeze({
    ...DEFAULT_ENGINE,
    id: 'engine_vector',
    style: 'vector',
    coreColor: '#39d0ff',
    tailColor: '#081828',
    boostCore: '#e8f8ff',
    cruiseCore: '#6ee0ff',
    spreadMul: 0.72,
    particleMul: 0.95,
    streakMul: 1.35,
    streakLenMul: 1.28,
    plumeWidthMul: 0.78,
    plumeLengthMul: 1.35,
    plumeCore: '#28b8ff',
    plumeHalo: '#1848a8',
    flowSpeed: 3.4,
    noiseScale: 1.2,
    coreIntensity: 7.8,
    haloIntensity: 2.4,
    plumeSwirl: 0.30,
    plumeFork: 0.30,
  }),
  engine_plasma_ring: Object.freeze({
    ...DEFAULT_ENGINE,
    id: 'engine_plasma_ring',
    style: 'plasma',
    coreColor: '#c878ff',
    tailColor: '#1a0838',
    boostCore: '#f0d0ff',
    cruiseCore: '#d8a0ff',
    spreadMul: 1.22,
    particleMul: 1.35,
    streakMul: 1.08,
    streakLenMul: 1.32,
    plumeCore: '#b060ff',
    plumeHalo: '#ff6090',
    plumeWidthMul: 1.35,
    plumeLengthMul: 1.42,
    flowSpeed: 2.2,
    noiseScale: 2.4,
    coreIntensity: 8.2,
    haloIntensity: 3.2,
    plumeSwirl: 1.0,
    plumeFork: 0.9,
  }),
});

const ENGINE_FILE_BY_DEF_ID = Object.freeze({
  ship_kestrel: 'engine_ion_small',
  ship_drifter: 'engine_ion_small',
  ship_ranger: 'engine_ion_small',
  ship_pelican: 'engine_ion_twin',
  ship_ironback: 'engine_ion_twin',
  ship_wasp: 'engine_vector',
  ship_hornet: 'engine_vector',
  ship_mule: 'engine_industrial',
  ship_atlas: 'engine_industrial',
  ship_bastion: 'engine_plasma_ring',
  ship_warden: 'engine_plasma_ring',
  ship_colossus: 'engine_plasma_ring',
  ship_leviathan: 'engine_plasma_ring',
});

const ENGINE_FILE_BY_DRIVE_ID = Object.freeze({
  drive_reaction_s: 'engine_vector',
  drive_reaction_m: 'engine_ion_small',
  drive_reaction_l: 'engine_ion_twin',
  drive_gravimetric_s: 'engine_resonator',
  drive_pulse_plate_m: 'engine_vector',
  drive_torch_l: 'engine_plasma_ring',
  drive_field_sail_m: 'engine_resonator',
});

const MUZZLE_PART_PROFILES = Object.freeze({
  weapon_pulse_cannon: Object.freeze({ lane: 'energy', sizeMul: 1.0, sparkMul: 1.0, ring: false }),
  weapon_lance: Object.freeze({ lane: 'beam', sizeMul: 1.35, sparkMul: 0.35, ring: true }),
  weapon_railgun: Object.freeze({ lane: 'ballistic', sizeMul: 1.25, sparkMul: 1.4, ring: true, arc: true }),
  weapon_gatling: Object.freeze({ lane: 'ballistic', sizeMul: 0.72, sparkMul: 0.85, ring: false, rapid: true }),
  weapon_turret_dual: Object.freeze({ lane: 'ballistic', sizeMul: 0.88, sparkMul: 1.0, ring: false }),
  weapon_heavy_cannon: Object.freeze({ lane: 'explosive', sizeMul: 1.45, sparkMul: 1.1, ring: true, smoke: true }),
});

const DEFAULT_MUZZLE = Object.freeze({
  lane: 'ballistic',
  sizeMul: 1.0,
  sparkMul: 1.0,
  ring: false,
  smoke: false,
  arc: false,
  rapid: false,
  coreColor: null,
  accentColor: null,
});

export function partIdFromUrl(url) {
  if (!url) return null;
  const name = String(url).split('/').pop() || '';
  const base = name.replace(/\.glb$/i, '');
  return base || null;
}

export function partIdFromSlotUrls(slots, slotName, index = 0) {
  if (!slots || !slotName) return null;
  const list = slots[slotName];
  if (!list || !list.length) return null;
  const url = list[Math.min(index, list.length - 1)];
  return partIdFromUrl(url);
}

export function primaryEnginePartId(meta) {
  if (!meta) return null;
  const fromSlot = partIdFromSlotUrls(meta.slots, 'engine', 0);
  if (fromSlot && ENGINE_PROFILES[fromSlot]) return fromSlot;
  const defId = meta.defId;
  if (defId && ENGINE_FILE_BY_DEF_ID[defId]) return ENGINE_FILE_BY_DEF_ID[defId];
  const shipDef = defId ? SHIP_BY_ID.get(defId) : null;
  const driveId = meta.driveId || (shipDef && shipDef.driveId) || null;
  if (driveId && ENGINE_FILE_BY_DRIVE_ID[driveId]) return ENGINE_FILE_BY_DRIVE_ID[driveId];
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  if (role.includes('miner') || role.includes('freighter')) return 'engine_industrial';
  if (role.includes('interceptor') || role.includes('fighter')) return 'engine_vector';
  if (role.includes('capital') || role.includes('gunship') || role.includes('corvette')) return 'engine_plasma_ring';
  return 'engine_ion_small';
}

/**
 * Pure engine-profile id — no object allocation. Prefer this on hot paths.
 *
 * Authority order (first hit wins):
 *  1. Explicit authored engine slot on meta
 *  2. Explicit meta.defId / meta.driveId drive tables
 *  3. defIdFallback only when meta lacks authoritative engine data
 *  4. Ship-def drive / role heuristics for known defIds
 *  5. Default ion_small
 *
 * @param {object|null|undefined} meta mesh meta or null
 * @param {string|null|undefined} [defIdFallback]
 * @returns {string}
 */
export function resolveEngineProfileId(meta, defIdFallback = null) {
  // 1. Authored engine slot always outranks hull/fallback defaults (including ion_small).
  if (meta) {
    const fromSlot = partIdFromSlotUrls(meta.slots, 'engine', 0);
    if (fromSlot && ENGINE_PROFILES[fromSlot]) return fromSlot;
  }
  // 2. Explicit defId / driveId on meta.
  if (meta && meta.defId && ENGINE_FILE_BY_DEF_ID[meta.defId]) {
    return ENGINE_FILE_BY_DEF_ID[meta.defId];
  }
  if (meta && meta.driveId && ENGINE_FILE_BY_DRIVE_ID[meta.driveId]) {
    return ENGINE_FILE_BY_DRIVE_ID[meta.driveId];
  }
  // 3. Caller fallback only when meta had no authoritative engine/def/drive data.
  if (defIdFallback && ENGINE_FILE_BY_DEF_ID[defIdFallback]) {
    return ENGINE_FILE_BY_DEF_ID[defIdFallback];
  }
  // 4. Role / drive heuristics from known ship defs (meta.defId or fallback).
  const defId = (meta && meta.defId) || defIdFallback || null;
  if (defId) {
    const shipDef = SHIP_BY_ID.get(defId);
    if (shipDef) {
      if (shipDef.driveId && ENGINE_FILE_BY_DRIVE_ID[shipDef.driveId]) {
        return ENGINE_FILE_BY_DRIVE_ID[shipDef.driveId];
      }
      const role = String(shipDef.role || '').toLowerCase();
      if (role.includes('miner') || role.includes('freighter')) return 'engine_industrial';
      if (role.includes('interceptor') || role.includes('fighter')) return 'engine_vector';
      if (role.includes('capital') || role.includes('gunship') || role.includes('corvette')) {
        return 'engine_plasma_ring';
      }
    }
  }
  // 5. Last resort default.
  return 'engine_ion_small';
}

/**
 * Frozen base profile by id — no allocation, no faction tint.
 * @param {string|null|undefined} profileId
 */
export function getEngineProfileBase(profileId) {
  if (profileId && ENGINE_PROFILES[profileId]) return ENGINE_PROFILES[profileId];
  return DEFAULT_ENGINE;
}

/**
 * Presentation profile. Without faction tint returns the frozen base (no alloc).
 * Faction tint still allocates a small overlay object — avoid on dense hot paths;
 * use getEngineProfileBase + resolveEngineProfileId instead.
 */
export function resolveEngineProfile(meta, factionThruster) {
  const id = resolveEngineProfileId(meta);
  const base = getEngineProfileBase(id);
  if (!factionThruster) return base;
  return {
    ...base,
    id,
    coreColor: blendHex(base.coreColor, factionThruster, 0.38),
    plumeCore: blendHex(base.plumeCore, factionThruster, 0.28),
  };
}

const WEAPON_PRESENTATION = Object.freeze({
  beam: Object.freeze({ family: 'beam', variant: 'continuous-beam' }),
  missile: Object.freeze({ family: 'missile', variant: 'missile' }),
  torpedo: Object.freeze({ family: 'missile', variant: 'torpedo' }),
  emp: Object.freeze({ family: 'emp', variant: 'disruptor' }),
  rail: Object.freeze({ family: 'rail', variant: 'railgun' }),
  siegeRail: Object.freeze({ family: 'rail', variant: 'siege-lance' }),
  thermal: Object.freeze({ family: 'plasma', variant: 'thermal-bolt' }),
  pulse: Object.freeze({ family: 'plasma', variant: 'pulse-bolt' }),
  flak: Object.freeze({ family: 'kinetic', variant: 'flak' }),
  kinetic: Object.freeze({ family: 'kinetic', variant: 'autocannon' }),
  // SF-10 physics-first families. Each is mechanically distinct from the DPS weapons AND from each
  // other (STEP 9 forbidden shortcut #5 — the three must not share one VFX). The RCS disruptor
  // deliberately keeps the emp family: it IS a disruption weapon, so concussion / mine / emp are
  // three different families across the trio.
  concussion: Object.freeze({ family: 'concussion', variant: 'concussion-slug' }),
  mine: Object.freeze({ family: 'mine', variant: 'vector-mine' }),
});

export function resolveWeaponPresentationFamily(weaponId, weaponData = null, fallbackData = null) {
  const fallback = fallbackData || (weaponId ? WEAPON_BY_ID.get(weaponId) : null) || null;
  const data = weaponData || fallback;
  const id = String(weaponId || (data && data.id) || (fallback && fallback.id) || '').toLowerCase();
  const tracking = String((data && data.tracking) ?? (fallback && fallback.tracking) ?? '').toLowerCase();
  const damageType = String(
    (data && (data.damageType ?? data.dmgType))
      ?? (fallback && (fallback.damageType ?? fallback.dmgType))
      ?? '',
  ).toLowerCase();
  const continuous = (data && data.continuous) ?? (fallback && fallback.continuous);
  const projSpeed = (data && data.projSpeed) ?? (fallback && fallback.projSpeed);

  if (continuous || projSpeed === Infinity || tracking === 'hitscan') {
    return WEAPON_PRESENTATION.beam;
  }
  // SF-10: a deployed vector mine is neither projectile nor beam — resolve it to its own family
  // (this also fills the missing "mine" particle family the graphics checkpoint calls out).
  if (tracking === 'deploy' || id.includes('vector_mine')) {
    return WEAPON_PRESENTATION.mine;
  }
  if (tracking === 'homing' || id.includes('missile') || id.includes('torpedo') || id.includes('rack')) {
    return id.includes('torpedo') ? WEAPON_PRESENTATION.torpedo : WEAPON_PRESENTATION.missile;
  }
  if (damageType === 'emp' || id.includes('emp') || id.includes('disruptor')) {
    return WEAPON_PRESENTATION.emp;
  }
  if (id.includes('railgun') || id.includes('siege_lance') || id.includes('siege-lance')) {
    return id.includes('siege') ? WEAPON_PRESENTATION.siegeRail : WEAPON_PRESENTATION.rail;
  }
  if (damageType === 'thermal' || damageType === 'plasma' || id.includes('plasma')) {
    return WEAPON_PRESENTATION.thermal;
  }
  if (damageType === 'energy' || id.includes('pulse_laser')) {
    return WEAPON_PRESENTATION.pulse;
  }
  // SF-10: the concussion slug is kinetic mechanically but must NOT read as an autocannon tracer —
  // give it its own heavy-slam family before the generic kinetic fallback.
  if (id.includes('concussion')) {
    return WEAPON_PRESENTATION.concussion;
  }
  if (id.includes('flak')) return WEAPON_PRESENTATION.flak;
  return WEAPON_PRESENTATION.kinetic;
}

const IMPACT_PRESENTATION_PROFILES = Object.freeze({
  kinetic: Object.freeze({
    mode: 'directional-fragments', primaryShape: 'spray', life: 0.18, fragmentCount: 12,
    coreColor: '#fff3d2', accentColor: '#ff9c48', lightPeak: 2.2,
  }),
  rail: Object.freeze({
    mode: 'penetration-streak', primaryShape: 'line', life: 0.11, fragmentCount: 7,
    coreColor: '#ffffff', accentColor: '#9edcff', lightPeak: 3.4,
  }),
  plasma: Object.freeze({
    mode: 'thermal-splash', primaryShape: 'tendrils', life: 0.42, fragmentCount: 9,
    coreColor: '#fff1c8', accentColor: '#ff6a28', lightPeak: 3.0,
  }),
  beam: Object.freeze({
    mode: 'sustained-contact', primaryShape: 'contact-line', life: 0.08, fragmentCount: 3,
    coreColor: '#f4fbff', accentColor: '#56cfff', lightPeak: 1.2,
  }),
  missile: Object.freeze({
    mode: 'combustion-burst', primaryShape: 'irregular-burst', life: 0.62, fragmentCount: 15,
    coreColor: '#fff0c0', accentColor: '#ff7028', lightPeak: 4.6,
  }),
  emp: Object.freeze({
    mode: 'disruption-arcs', primaryShape: 'forks', life: 0.28, fragmentCount: 6,
    coreColor: '#f2ffff', accentColor: '#668cff', lightPeak: 2.0,
  }),
  // SF-10 — distinct MODE + life:fragmentCount + a non-ring primaryShape from every family above.
  // Concussion reads as a compressive slam (the payoff is really the terrain impact it sets up);
  // the mine reads as an outward radial shove.
  concussion: Object.freeze({
    mode: 'concussive-slam', primaryShape: 'displacement-wave', life: 0.5, fragmentCount: 20,
    coreColor: '#ffe9c4', accentColor: '#c98a4a', lightPeak: 3.6,
  }),
  mine: Object.freeze({
    mode: 'radial-shove', primaryShape: 'shockfront', life: 0.36, fragmentCount: 18,
    coreColor: '#cfe8ff', accentColor: '#5aa0ff', lightPeak: 2.6,
  }),
});

export function resolveImpactPresentationProfile(weaponId, weaponData = null) {
  const presentation = resolveWeaponPresentationFamily(weaponId, weaponData);
  const base = IMPACT_PRESENTATION_PROFILES[presentation.family] || IMPACT_PRESENTATION_PROFILES.kinetic;
  const scale = presentation.variant === 'siege-lance'
    ? 1.8
    : (presentation.variant === 'torpedo' ? 1.5 : 1);
  return { ...base, family: presentation.family, variant: presentation.variant, scale };
}

function muzzleLaneForFamily(family) {
  if (family === 'beam') return 'beam';
  if (family === 'plasma' || family === 'emp') return 'energy';
  if (family === 'missile') return 'explosive';
  // A concussion slug launches with a heavy recoil (smoke + ring), not a light tracer flash; a
  // vector mine is lobbed. Keeps their muzzles off the autocannon's identity.
  if (family === 'concussion') return 'explosive';
  if (family === 'mine') return 'ballistic';
  return 'ballistic';
}

function muzzleColorsForLane(lane) {
  switch (lane) {
    case 'energy':
      return { coreColor: '#e8f8ff', accentColor: '#39d0ff', lightColor: '#66eeff' };
    case 'explosive':
      return { coreColor: '#fff0d0', accentColor: '#ff8844', lightColor: '#ffb35c' };
    case 'beam':
      return { coreColor: '#d8f0ff', accentColor: '#66ccff', lightColor: '#88ddff' };
    default:
      return { coreColor: '#ffffff', accentColor: '#ffcc88', lightColor: '#ffaa66' };
  }
}

export function resolveMuzzleProfile(weaponId, weaponPartId) {
  const partBase = weaponPartId && MUZZLE_PART_PROFILES[weaponPartId] ? MUZZLE_PART_PROFILES[weaponPartId] : null;
  const presentation = resolveWeaponPresentationFamily(weaponId);
  const lane = weaponId ? muzzleLaneForFamily(presentation.family) : ((partBase && partBase.lane) || 'ballistic');
  const colors = muzzleColorsForLane(lane);
  return {
    ...DEFAULT_MUZZLE,
    ...partBase,
    lane,
    family: presentation.family,
    variant: presentation.variant,
    weaponId: weaponId || null,
    weaponPartId: weaponPartId || null,
    ...colors,
  };
}

function blendHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a || b || '#ffffff';
  const mix = (x, y) => Math.round(x + (y - x) * t);
  return rgbToHex(mix(ca.r, cb.r), mix(ca.g, cb.g), mix(ca.b, cb.b));
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Projectile trail wisps — cosmetic lane keyed by weapon class (rail / missile / plasma / kinetic).
const PROJECTILE_TRAIL_BASE = Object.freeze({
  class: 'kinetic',
  mode: 'spark',
  life: 0.10,
  size0: 0.45,
  size1: 0.0,
  stretch: 0.35,
  streakLen: 0,
  streakOpacity: 0,
  particleCount: 1,
  spawnMul: 1.0,
  coreColor: '#ffcc88',
  tailColor: '#5a4030',
  drag: 0.62,
});

export const PROJECTILE_TRAIL_PROFILES = Object.freeze({
  rail: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'rail',
    mode: 'streak',
    life: 0.14,
    size0: 0.62,
    size1: 0.0,
    stretch: 2.2,
    streakLen: 5.2,
    streakOpacity: 0.86,
    particleCount: 1,
    coreColor: '#e8f8ff',
    tailColor: '#4a9acc',
    drag: 0.12,
  }),
  missile: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'missile',
    mode: 'propelled',
    life: 0.34,
    size0: 1.45,
    size1: 3.35,
    stretch: 2.8,
    streakLen: 2.9,
    streakOpacity: 0.70,
    particleCount: 1,
    spawnMul: 1,
    coreColor: '#fff0c8',
    tailColor: '#302824',
    drag: 0.64,
  }),
  plasma: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'plasma',
    mode: 'thermal-wake',
    // A compact, continuously overlapping inner stream plus a broader cooling sheath. Plasma used
    // to emit three free point particles per cadence, which read as an orange bead chain in motion.
    life: 0.12,
    size0: 0.92,
    size1: 0.0,
    stretch: 1.25,
    streakLen: 3.15,
    streakOpacity: 0.54,
    particleCount: 1,
    coreColor: '#ffb05a',
    tailColor: '#b8321d',
    drag: 0.28,
  }),
  pulse: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'pulse',
    mode: 'streak',
    life: 0.085,
    size0: 0.44,
    size1: 0.0,
    stretch: 1.7,
    streakLen: 2.35,
    streakOpacity: 0.20,
    particleCount: 1,
    coreColor: '#34cfff',
    tailColor: '#165f9a',
    drag: 0.18,
  }),
  kinetic: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'kinetic',
    mode: 'tracer',
    life: 0.075,
    size0: 0.50,
    size1: 0.0,
    stretch: 1.45,
    streakLen: 2.6,
    streakOpacity: 0.68,
    particleCount: 1,
    coreColor: '#ffd090',
    tailColor: '#6a5040',
    drag: 0.68,
  }),
  emp: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'emp',
    mode: 'disruption',
    life: 0.18,
    size0: 0.72,
    size1: 0.08,
    stretch: 1.35,
    particleCount: 2,
    coreColor: '#f4fbff',
    tailColor: '#3c72a8',
    drag: 0.22,
  }),
  // SF-10 concussion slug: a heavy, slow, THICK tracer — the wide streak (class 'concussion' takes
  // the 0.42 width factor) reads as mass in flight, distinct from the needle rail trace and the
  // light autocannon tracer. Connected streak, never a glowing ball.
  concussion: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'concussion',
    mode: 'tracer',
    life: 0.13,
    size0: 0.92,
    size1: 0.0,
    stretch: 1.05,
    streakLen: 1.9,
    streakOpacity: 0.5,
    particleCount: 1,
    coreColor: '#ffdca0',
    tailColor: '#7a4a24',
    drag: 0.5,
  }),
  // SF-10 vector mine: a short cool arc as it lobs, then the deployed body carries its identity in
  // the entity mesh (visualFactory buildVectorMine). Kept minimal — the mine is not a flight weapon.
  mine: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'mine',
    mode: 'spark',
    life: 0.20,
    size0: 0.6,
    size1: 0.1,
    stretch: 0.4,
    particleCount: 1,
    coreColor: '#bcd8ff',
    tailColor: '#28527a',
    drag: 0.8,
  }),
});

const PROJECTILE_TRAIL_VARIANTS = Object.freeze({
  'continuous-beam': Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.kinetic, variant: 'continuous-beam' }),
  missile: Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.missile, variant: 'missile' }),
  torpedo: Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.missile, variant: 'torpedo' }),
  disruptor: Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.emp, variant: 'disruptor' }),
  railgun: Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.rail, variant: 'railgun' }),
  'siege-lance': Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.rail, variant: 'siege-lance' }),
  'thermal-bolt': Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.plasma, variant: 'thermal-bolt' }),
  'pulse-bolt': Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.pulse, variant: 'pulse-bolt' }),
  flak: Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.kinetic, variant: 'flak' }),
  autocannon: Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.kinetic, variant: 'autocannon' }),
  'concussion-slug': Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.concussion, variant: 'concussion-slug' }),
  'vector-mine': Object.freeze({ ...PROJECTILE_TRAIL_PROFILES.mine, variant: 'vector-mine' }),
});

export function resolveProjectileTrailProfile(weaponId, projectileData = null) {
  const data = projectileData || null;
  const resolvedWeaponId = weaponId || (data && data.weaponId) || '';
  const weaponDef = WEAPON_BY_ID.get(resolvedWeaponId) || null;
  const presentation = resolveWeaponPresentationFamily(resolvedWeaponId, data, weaponDef);
  // A pulse bolt belongs to the energy/plasma weapon family mechanically, but its wake is a short
  // coherent ion shear. Reusing the thermal-plasma heat plan emitted three orange particle beads
  // behind every cyan pulse at the real game camera.
  return PROJECTILE_TRAIL_VARIANTS[presentation.variant] || PROJECTILE_TRAIL_VARIANTS.autocannon;
}

export function createProjectileTrailSpawnPlanScratch() {
  const fallback = { size0: 0, stretch: 0 };
  return {
    skip: false,
    reason: null,
    class: 'kinetic',
    mode: 'tracer',
    emitCount: 0,
    origin: { x: 0, z: 0 },
    trailAxis: 0,
    backVel: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    coreColor: '#ffffff',
    tailColor: '#ffffff',
    life: 0,
    drag: 0,
    streak: null,
    sprite: null,
    particle: null,
    emitSmoke: false,
    _streak: { width: 0, length: 0, opacity: 0, fallback },
    _sprite: { size0: 0, size1: 0, aspect: 1 },
    _particle: { size0: 0, size1: 0, stretch: 0 },
  };
}

export function buildProjectileTrailSpawnPlan(profile, entity, burst = 1, out = null) {
  const prof = profile || PROJECTILE_TRAIL_PROFILES.kinetic;
  const plan = out || createProjectileTrailSpawnPlanScratch();
  const vx = (entity && entity.vel && entity.vel.x) || 0;
  const vz = (entity && entity.vel && entity.vel.z) || 0;
  const speed = Math.hypot(vx, vz);
  plan.skip = speed < 2;
  plan.reason = plan.skip ? 'slow' : null;
  plan.streak = null;
  plan.sprite = null;
  plan.particle = null;
  plan.emitSmoke = false;
  if (plan.skip) return plan;

  const trailAxis = Math.atan2(vz, vx);
  const backX = -vx / speed;
  const backZ = -vz / speed;
  const tailOff = ((entity && entity.radius) || 0.5) * 0.65;
  const bx = entity.pos.x + backX * tailOff;
  const bz = entity.pos.z + backZ * tailOff;
  const emitCount = Math.max(1, Math.floor((prof.particleCount || 1) * (prof.spawnMul || 1) * burst));

  plan.class = prof.class || 'kinetic';
  plan.mode = prof.mode || 'spark';
  plan.emitCount = emitCount;
  plan.origin.x = bx;
  plan.origin.z = bz;
  plan.trailAxis = trailAxis;
  plan.backVel.x = backX;
  plan.backVel.z = backZ;
  plan.vel.x = vx;
  plan.vel.z = vz;
  if (plan.class === 'plasma') {
    // Match the authored projectile packet's allegiance-aware plasma palette. The wake remains
    // structurally identifiable by its broad two-layer thermal shape; this only prevents a green
    // player plasma body from towing an unrelated fixed-orange filament.
    const team = entity && entity.team;
    plan.coreColor = team === 1 ? '#ff7052' : (team === 0 ? '#d8fff0' : prof.coreColor);
    plan.tailColor = team === 1 ? '#b82c1f' : (team === 0 ? '#188c65' : prof.tailColor);
  } else {
    plan.coreColor = prof.coreColor;
    plan.tailColor = prof.tailColor;
  }
  plan.life = prof.life;
  plan.drag = prof.drag;

  if (prof.mode === 'streak' || prof.mode === 'tracer') {
    const streak = plan._streak;
    // Rail is a needle-thin electromagnetic trace. Pulse bolts retain a slightly broader ion wake
    // so the two energy families remain structurally distinct at the game camera.
    streak.width = Math.max(0.04, prof.size0 * (prof.class === 'rail' ? 0.28
      : prof.class === 'kinetic' ? 0.24 : 0.42));
    streak.length = prof.streakLen || 5.2;
    streak.opacity = prof.streakOpacity || 0.72;
    streak.fallback.size0 = prof.size0;
    streak.fallback.stretch = prof.stretch || 2.2;
    plan.streak = streak;
  } else if (prof.mode === 'propelled') {
    const streak = plan._streak;
    streak.width = Math.max(0.10, prof.size0 * 0.18);
    streak.length = prof.streakLen || 2.9;
    streak.opacity = prof.streakOpacity || 0.58;
    plan.streak = streak;
    plan._sprite.size0 = prof.size0;
    plan._sprite.size1 = prof.size1;
    plan._sprite.aspect = 2.5;
    plan.sprite = plan._sprite;
  } else if (prof.mode === 'thermal-wake') {
    const streak = plan._streak;
    streak.width = Math.max(0.16, prof.size0 * 0.25);
    streak.length = prof.streakLen || 3.15;
    streak.opacity = prof.streakOpacity || 0.52;
    plan.streak = streak;
  } else if (prof.mode === 'disruption') {
    plan._particle.size0 = prof.size0;
    plan._particle.size1 = prof.size1;
    plan._particle.stretch = prof.stretch || 0.7;
    plan.particle = plan._particle;
  } else {
    plan._particle.size0 = prof.size0;
    plan._particle.size1 = prof.size1;
    plan._particle.stretch = prof.stretch || 0.3;
    plan.particle = plan._particle;
  }
  return plan;
}

function _trailAssert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function assertProjectileTrailProfileContracts() {
  const errors = [];
  const sample = {
    pos: { x: 120, z: 40 },
    vel: { x: 280, z: 40 },
    radius: 1.2,
  };

  const kinetic = resolveProjectileTrailProfile('wpn_autocannon_m', { damageType: 'kinetic' });
  _trailAssert(kinetic.class === 'kinetic', 'kinetic weapon must resolve to kinetic class', errors);
  _trailAssert(kinetic.mode === 'tracer', 'kinetic weapon must use a short tracer mode', errors);
  _trailAssert(kinetic.life < PROJECTILE_TRAIL_PROFILES.plasma.life, 'kinetic life shorter than plasma', errors);

  const missile = resolveProjectileTrailProfile('wpn_missile_rack_m', { kind: 'missile', damageType: 'explosive' });
  _trailAssert(missile.class === 'missile', 'missile weapon must resolve to missile class', errors);
  _trailAssert(missile.mode === 'propelled', 'missile weapon must use attached propulsion mode', errors);
  _trailAssert(missile.size0 > kinetic.size0, 'missile vapor wider than kinetic tracer', errors);

  const plasma = resolveProjectileTrailProfile('wpn_plasma_cannon_m', { damageType: 'thermal' });
  _trailAssert(plasma.class === 'plasma', 'plasma weapon must resolve to plasma class', errors);
  _trailAssert(plasma.mode === 'thermal-wake', 'plasma weapon must use a connected thermal wake', errors);
  _trailAssert(plasma.size0 > kinetic.size0, 'plasma wake wider than kinetic tracer', errors);

  const rail = resolveProjectileTrailProfile('wpn_railgun_m', { damageType: 'kinetic' });
  _trailAssert(rail.class === 'rail', 'railgun must resolve to rail class', errors);
  _trailAssert(rail.mode === 'streak', 'railgun must use streak mode', errors);
  _trailAssert(rail.stretch > plasma.stretch, 'rail trace stays more elongated than the plasma wake', errors);

  const pulse = resolveProjectileTrailProfile('wpn_pulse_laser_m', { damageType: 'energy' });
  _trailAssert(pulse.class === 'pulse', 'pulse laser must resolve to pulse trail class', errors);
  _trailAssert(pulse.mode === 'streak', 'pulse laser must use a connected streak wake', errors);
  _trailAssert(pulse.streakLen < rail.streakLen, 'pulse wake shorter than rail trace', errors);

  const kineticPlan = buildProjectileTrailSpawnPlan(kinetic, sample, 1);
  const missilePlan = buildProjectileTrailSpawnPlan(missile, sample, 1);
  const plasmaPlan = buildProjectileTrailSpawnPlan(plasma, sample, 1);
  const pulsePlan = buildProjectileTrailSpawnPlan(pulse, sample, 1);
  const railPlan = buildProjectileTrailSpawnPlan(rail, sample, 1);

  _trailAssert(kineticPlan.mode === 'tracer', 'kinetic spawn plan mode tracer', errors);
  _trailAssert(missilePlan.mode === 'propelled', 'missile spawn plan mode propelled', errors);
  _trailAssert(plasmaPlan.mode === 'thermal-wake', 'plasma spawn plan mode thermal-wake', errors);
  _trailAssert(pulsePlan.mode === 'streak', 'pulse spawn plan mode streak', errors);
  _trailAssert(railPlan.mode === 'streak', 'rail spawn plan mode streak', errors);
  _trailAssert(railPlan.streak && railPlan.streak.width < 0.2, 'rail streak width thin', errors);
  _trailAssert(railPlan.streak && railPlan.streak.length > 3, 'rail streak length long', errors);
  _trailAssert(kineticPlan.streak && kineticPlan.streak.length > 1.5 && kineticPlan.streak.length < railPlan.streak.length,
    'kinetic tracer must remain brief and shorter than the rail trace', errors);
  _trailAssert(kineticPlan.particle === null, 'kinetic flight must not fall back to a glowing ball recipe', errors);
  _trailAssert(missilePlan.sprite.size0 > railPlan.streak.width, 'missile vapor wider than rail streak', errors);
  _trailAssert(missilePlan.streak.length < railPlan.streak.length,
    'missile exhaust stays shorter than a rail trace', errors);
  _trailAssert(plasmaPlan.streak && plasmaPlan.streak.width > railPlan.streak.width,
    'plasma wake must remain wider than the rail trace', errors);
  _trailAssert(plasmaPlan.streak && plasmaPlan.streak.length < railPlan.streak.length,
    'plasma wake must remain shorter than the rail trace', errors);
  _trailAssert(plasmaPlan.particle === null, 'plasma wake must not emit detached particle beads', errors);

  if (errors.length) throw new Error(`projectile trail profile contracts failed:\n${errors.join('\n')}`);
  return {
    ok: true,
    classes: {
      kinetic: kinetic.class,
      missile: missile.class,
      plasma: plasma.class,
      pulse: pulse.class,
      rail: rail.class,
    },
    plans: {
      kinetic: kineticPlan.mode,
      missile: missilePlan.mode,
      plasma: plasmaPlan.mode,
      pulse: pulsePlan.mode,
      rail: railPlan.mode,
    },
  };
}
