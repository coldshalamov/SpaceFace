// Ricochet Foundry authored room description (PQ-133.04 / CRU-028..031).
//
// This module is renderer- and physics-neutral. The same bounded piece records drive the
// simulation entities/collision proxies and the Three.js presentation, so the visible plate is
// never a decorative lie around a different collider. Coordinates are local to the arena centre.

export const RICOCHET_FOUNDRY_ARENA_ID = 'helios_core';
export const MIRRORJAW_ENEMY_ID = 'mirrorjaw_foreman';
export const FOUNDRY_SURFACE_OWNER = 'survival:ricochet-foundry';
export const FOUNDRY_SURFACE_LIMIT = 12;

export const FOUNDRY_SURFACE_MATERIAL = Object.freeze({
  reflective: 'reflective',
  absorbent: 'furnace',
  structural: 'station',
});

const RAW_LAYOUT = [
  // Five boundary pieces leave a wide, unmistakable entry bay in the south wall.
  { id: 'wall_north', kind: 'wall', x: 0, z: 480, rot: 0, halfLength: 650, halfWidth: 24, height: 42, material: 'structural' },
  { id: 'wall_west', kind: 'wall', x: -650, z: 0, rot: Math.PI / 2, halfLength: 480, halfWidth: 24, height: 42, material: 'structural' },
  { id: 'wall_east', kind: 'wall', x: 650, z: 0, rot: Math.PI / 2, halfLength: 480, halfWidth: 24, height: 42, material: 'structural' },
  { id: 'wall_south_w', kind: 'wall', x: -390, z: -480, rot: 0, halfLength: 260, halfWidth: 24, height: 42, material: 'structural' },
  { id: 'wall_south_e', kind: 'wall', x: 390, z: -480, rot: 0, halfLength: 260, halfWidth: 24, height: 42, material: 'structural' },

  // Two fixed banks create distinct diagonal corridors around the furnace.
  // The west plate sits inside the entry glass, but beyond the starter hull + forward-muzzle
  // envelope. The first player shot can discover the law without spawning inside the reflector.
  { id: 'bank_west', kind: 'plate', x: 20, z: -315, rot: -Math.PI * 0.18, halfLength: 22, halfWidth: 7, height: 18, material: 'reflective' },
  { id: 'bank_east', kind: 'plate', x: 272, z: 104, rot: -Math.PI * 0.16, halfLength: 145, halfWidth: 18, height: 34, material: 'reflective' },
  { id: 'furnace', kind: 'furnace', x: 0, z: 34, rot: 0, halfLength: 105, halfWidth: 82, height: 76, material: 'absorbent' },

  // Shutters translate along their local X axes. Their render root follows the authoritative body.
  { id: 'shutter_west', kind: 'shutter', x: -438, z: 165, rot: Math.PI / 2, halfLength: 138, halfWidth: 22, height: 58, material: 'reflective', machinery: true },
  { id: 'shutter_east', kind: 'shutter', x: 438, z: -132, rot: Math.PI / 2, halfLength: 138, halfWidth: 22, height: 58, material: 'reflective', machinery: true },

  // Heavy but movable: Massline/impulse can change the next bank. The first slice deliberately
  // budgets two and no more.
  { id: 'loose_west', kind: 'loose_plate', x: -126, z: 286, rot: Math.PI * 0.09, halfLength: 92, halfWidth: 16, height: 28, material: 'reflective', dynamic: true },
  { id: 'loose_east', kind: 'loose_plate', x: 174, z: 302, rot: -Math.PI * 0.13, halfLength: 92, halfWidth: 16, height: 28, material: 'reflective', dynamic: true },
];

export const RICOCHET_FOUNDRY_LAYOUT = Object.freeze(RAW_LAYOUT.map((row) => Object.freeze({ ...row })));

if (RICOCHET_FOUNDRY_LAYOUT.length !== FOUNDRY_SURFACE_LIMIT) {
  throw new Error(`Ricochet Foundry layout must contain exactly ${FOUNDRY_SURFACE_LIMIT} pieces`);
}

export function foundryArenaCenterFromEntry(entry = {}) {
  return Object.freeze({
    x: Number.isFinite(entry.x) ? entry.x : 0,
    z: (Number.isFinite(entry.z) ? entry.z : 0) + 360,
  });
}

export function foundryWorldPieces(center = {}) {
  const cx = Number.isFinite(center.x) ? center.x : 0;
  const cz = Number.isFinite(center.z) ? center.z : 0;
  return RICOCHET_FOUNDRY_LAYOUT.map((row) => ({
    ...row,
    x: cx + row.x,
    z: cz + row.z,
  }));
}

export function foundryProxyIdFor(kind) {
  if (kind === 'wall') return 'ricochet_foundry_wall';
  if (kind === 'furnace') return 'ricochet_foundry_furnace';
  if (kind === 'shutter') return 'ricochet_foundry_shutter';
  return 'ricochet_foundry_plate';
}

export function foundrySurfaceMaterialFor(material) {
  return FOUNDRY_SURFACE_MATERIAL[material] || FOUNDRY_SURFACE_MATERIAL.structural;
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic shutter offset in world units along the room X axis. Warnings occupy the first
 * quarter of each cycle; movement is continuous and therefore visible before a lane becomes tight.
 */
export function foundryShutterOffset(id, phase, elapsedS) {
  if (id !== 'shutter_west' && id !== 'shutter_east') return 0;
  const side = id === 'shutter_west' ? -1 : 1;
  const time = Math.max(0, Number.isFinite(elapsedS) ? elapsedS : 0);
  if (phase === 'idle' || phase === 'loose_plate') return 0;
  if (phase === 'furnace_active' || phase === 'absorbent_screen') return side * 54;
  if (phase === 'boss') return -side * 118;
  if (phase === 'shutter_lane_close') return id === 'shutter_west' ? 0 : -118;

  const period = phase === 'shutter_slow' ? 8 : 6;
  const local = (time % period) / period;
  const warned = local < 0.25 ? 0 : smoothstep01((local - 0.25) / 0.75);
  const travel = Math.sin(warned * Math.PI) * 118;
  if (phase === 'shutter_alternating') {
    const active = Math.floor(time / period) % 2 === 0 ? 'shutter_west' : 'shutter_east';
    return id === active ? -side * travel : side * 42;
  }
  return id === 'shutter_west' ? travel : 0;
}

export function mirrorjawPhaseFor(hull, hullMax) {
  const max = Number.isFinite(hullMax) && hullMax > 0 ? hullMax : 1;
  const fraction = Math.max(0, Math.min(1, (Number.isFinite(hull) ? hull : max) / max));
  if (fraction > 0.66) return 'reflective_ram';
  if (fraction > 0.33) return 'absorbent_screen';
  return 'unmoored_reactor';
}

/** Front plating is a ±52° authored arc; rear machinery remains a normal damage target. */
export const MIRRORJAW_DIRECTIONAL_SURFACE = Object.freeze({
  material: 'reflective',
  arcCenter: 0,
  arcHalfWidth: 52 * Math.PI / 180,
});
