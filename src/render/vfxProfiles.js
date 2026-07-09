// Elite VFX profile resolver — maps authored part IDs + weapon defs to presentation lanes.
// Cosmetic only; sim never imports this module.
import { WEAPONS } from '../data/weapons.js';
import { resolveWeaponCueTable } from '../data/combatDefs.js';
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

export function resolveEngineProfile(meta, factionThruster) {
  const id = primaryEnginePartId(meta);
  const base = ENGINE_PROFILES[id] || DEFAULT_ENGINE;
  if (!factionThruster) return { ...base, id };
  return {
    ...base,
    id,
    coreColor: blendHex(base.coreColor, factionThruster, 0.38),
    plumeCore: blendHex(base.plumeCore, factionThruster, 0.28),
  };
}

function muzzleLaneFromWeapon(weaponId) {
  const w = weaponId ? WEAPON_BY_ID.get(weaponId) : null;
  if (!w) return 'ballistic';
  if (w.continuous || w.projSpeed === Infinity || String(w.tracking || '') === 'hitscan') return 'beam';
  const cue = resolveWeaponCueTable(weaponId, WEAPONS);
  const muzzle = cue && cue.muzzle ? String(cue.muzzle) : '';
  if (muzzle.includes('energy')) return 'energy';
  if (muzzle.includes('explosive') || muzzle.includes('missile')) return 'explosive';
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
  const lane = (partBase && partBase.lane) || muzzleLaneFromWeapon(weaponId);
  const colors = muzzleColorsForLane(lane);
  return {
    ...DEFAULT_MUZZLE,
    ...partBase,
    lane,
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
    size0: 0.28,
    size1: 0.0,
    stretch: 2.2,
    streakLen: 5.2,
    streakOpacity: 0.72,
    particleCount: 1,
    coreColor: '#e8f8ff',
    tailColor: '#4a9acc',
    drag: 0.12,
  }),
  missile: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'missile',
    mode: 'smoke',
    life: 0.48,
    size0: 2.0,
    size1: 3.8,
    stretch: 0,
    particleCount: 2,
    spawnMul: 1.15,
    coreColor: '#4a3830',
    tailColor: '#1e1a18',
    drag: 0.58,
  }),
  plasma: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'plasma',
    mode: 'heat',
    life: 0.30,
    size0: 1.55,
    size1: 0.15,
    stretch: 0.72,
    particleCount: 3,
    coreColor: '#ff9040',
    tailColor: '#cc3018',
    drag: 0.34,
  }),
  kinetic: Object.freeze({
    ...PROJECTILE_TRAIL_BASE,
    class: 'kinetic',
    mode: 'spark',
    life: 0.07,
    size0: 0.42,
    size1: 0.0,
    stretch: 0.28,
    particleCount: 1,
    coreColor: '#ffd090',
    tailColor: '#6a5040',
    drag: 0.68,
  }),
});

function isMissileProjectile(data, damageType) {
  const kind = String((data && data.kind) || '').toLowerCase();
  if (kind === 'missile') return true;
  return damageType === 'missile' || damageType === 'rocket' || damageType === 'torpedo';
}

export function resolveProjectileTrailProfile(weaponId, projectileData = null) {
  const data = projectileData || {};
  const wid = String(weaponId || data.weaponId || '').toLowerCase();
  const damageType = String(data.damageType || data.dmgType || '').toLowerCase();

  if (wid.includes('railgun')) {
    return { ...PROJECTILE_TRAIL_PROFILES.rail };
  }
  if (isMissileProjectile(data, damageType)) {
    return { ...PROJECTILE_TRAIL_PROFILES.missile };
  }

  const cue = resolveWeaponCueTable(weaponId || data.weaponId, WEAPONS);
  const projCue = cue && cue.projectile ? String(cue.projectile) : '';

  if (projCue.includes('missile')) {
    return { ...PROJECTILE_TRAIL_PROFILES.missile };
  }
  if (projCue.includes('explosive') || damageType === 'explosive' || damageType === 'plasma' || damageType === 'thermal') {
    return { ...PROJECTILE_TRAIL_PROFILES.plasma };
  }
  if (projCue.includes('energy') || damageType === 'energy') {
    return { ...PROJECTILE_TRAIL_PROFILES.plasma };
  }
  if (projCue.includes('kinetic') || damageType === 'kinetic' || !damageType) {
    return { ...PROJECTILE_TRAIL_PROFILES.kinetic };
  }
  return { ...PROJECTILE_TRAIL_PROFILES.kinetic };
}

export function buildProjectileTrailSpawnPlan(profile, entity, burst = 1) {
  const prof = profile || PROJECTILE_TRAIL_PROFILES.kinetic;
  const vx = (entity && entity.vel && entity.vel.x) || 0;
  const vz = (entity && entity.vel && entity.vel.z) || 0;
  const speed = Math.hypot(vx, vz);
  if (speed < 2) return { skip: true, reason: 'slow' };

  const trailAxis = Math.atan2(vz, vx);
  const backX = -vx / speed;
  const backZ = -vz / speed;
  const tailOff = ((entity && entity.radius) || 0.5) * 0.65;
  const bx = entity.pos.x + backX * tailOff;
  const bz = entity.pos.z + backZ * tailOff;
  const emitCount = Math.max(1, Math.floor((prof.particleCount || 1) * (prof.spawnMul || 1) * burst));

  const plan = {
    skip: false,
    class: prof.class || 'kinetic',
    mode: prof.mode || 'spark',
    emitCount,
    origin: { x: bx, z: bz },
    trailAxis,
    backVel: { x: backX, z: backZ },
    vel: { x: vx, z: vz },
    coreColor: prof.coreColor,
    tailColor: prof.tailColor,
    life: prof.life,
    drag: prof.drag,
  };

  if (prof.mode === 'streak') {
    plan.streak = {
      width: Math.max(0.04, prof.size0 * 0.42),
      length: prof.streakLen || 5.2,
      opacity: prof.streakOpacity || 0.72,
      fallback: { size0: prof.size0, stretch: prof.stretch || 2.2 },
    };
  } else if (prof.mode === 'smoke') {
    plan.sprite = { size0: prof.size0, size1: prof.size1 };
    plan.particle = { size0: prof.size0 * 0.55, size1: prof.size1, stretch: 0 };
  } else if (prof.mode === 'heat') {
    plan.particle = { size0: prof.size0, size1: prof.size1, stretch: prof.stretch || 0.7 };
  } else {
    plan.particle = { size0: prof.size0, size1: prof.size1, stretch: prof.stretch || 0.3 };
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
  _trailAssert(kinetic.mode === 'spark', 'kinetic weapon must use spark mode', errors);
  _trailAssert(kinetic.life < PROJECTILE_TRAIL_PROFILES.plasma.life, 'kinetic life shorter than plasma', errors);

  const missile = resolveProjectileTrailProfile('wpn_missile_rack_m', { kind: 'missile', damageType: 'explosive' });
  _trailAssert(missile.class === 'missile', 'missile weapon must resolve to missile class', errors);
  _trailAssert(missile.mode === 'smoke', 'missile weapon must use smoke mode', errors);
  _trailAssert(missile.size0 > kinetic.size0, 'missile smoke wider than kinetic spark', errors);

  const plasma = resolveProjectileTrailProfile('wpn_plasma_cannon_m', { damageType: 'thermal' });
  _trailAssert(plasma.class === 'plasma', 'plasma weapon must resolve to plasma class', errors);
  _trailAssert(plasma.mode === 'heat', 'plasma weapon must use heat mode', errors);
  _trailAssert(plasma.size0 > kinetic.size0, 'plasma heat wider than kinetic spark', errors);

  const rail = resolveProjectileTrailProfile('wpn_railgun_m', { damageType: 'kinetic' });
  _trailAssert(rail.class === 'rail', 'railgun must resolve to rail class', errors);
  _trailAssert(rail.mode === 'streak', 'railgun must use streak mode', errors);
  _trailAssert(rail.stretch > plasma.stretch, 'rail stretch exceeds plasma heat', errors);

  const kineticPlan = buildProjectileTrailSpawnPlan(kinetic, sample, 1);
  const missilePlan = buildProjectileTrailSpawnPlan(missile, sample, 1);
  const plasmaPlan = buildProjectileTrailSpawnPlan(plasma, sample, 1);
  const railPlan = buildProjectileTrailSpawnPlan(rail, sample, 1);

  _trailAssert(kineticPlan.mode === 'spark', 'kinetic spawn plan mode spark', errors);
  _trailAssert(missilePlan.mode === 'smoke', 'missile spawn plan mode smoke', errors);
  _trailAssert(plasmaPlan.mode === 'heat', 'plasma spawn plan mode heat', errors);
  _trailAssert(railPlan.mode === 'streak', 'rail spawn plan mode streak', errors);
  _trailAssert(railPlan.streak && railPlan.streak.width < 0.2, 'rail streak width thin', errors);
  _trailAssert(railPlan.streak && railPlan.streak.length > 3, 'rail streak length long', errors);
  _trailAssert(missilePlan.sprite.size0 > railPlan.streak.width, 'missile puff wider than rail streak', errors);
  _trailAssert(plasmaPlan.emitCount > kineticPlan.emitCount, 'plasma emits more wisps than kinetic', errors);
  _trailAssert(kineticPlan.particle.stretch < plasmaPlan.particle.stretch, 'kinetic stretch shorter than plasma', errors);

  if (errors.length) throw new Error(`projectile trail profile contracts failed:\n${errors.join('\n')}`);
  return {
    ok: true,
    classes: { kinetic: kinetic.class, missile: missile.class, plasma: plasma.class, rail: rail.class },
    plans: {
      kinetic: kineticPlan.mode,
      missile: missilePlan.mode,
      plasma: plasmaPlan.mode,
      rail: railPlan.mode,
    },
  };
}