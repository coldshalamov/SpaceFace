// Player-facing compass. One convention for every bearing a pilot reads.
//
// The chase camera sits on −z and looks toward +z, so world +z is screen up
// (src/ui/hud.js objectiveBearingGlyph, measured 2026-09-19). The radar draws the
// same way: y = center − dz, and the N mark sits above the dial. North is −z.
// East is +x (screen left on that same camera). South is −z. West is −x.
//
// Cryo quadrant keys put nw/ne on +z, which is north here.

const HYPHEN = Object.freeze([
  'east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east',
]);
const LETTERS = Object.freeze(['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']);

/** Index 0 is east, matching atan2(-dz, dx). −1 when the offset is not a finite vector. */
export function playerBearingIndex(dx, dz) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return -1;
  return (Math.round(Math.atan2(-dz, dx) / (Math.PI / 4)) + 8) % 8;
}

/** 'north', 'northeast', 'east', … Empty when the offset is not finite. */
export function playerBearingName(dx, dz) {
  const index = playerBearingIndex(dx, dz);
  return index < 0 ? '' : HYPHEN[index].replace('-', '');
}

/** 'north', 'north-east', 'east', … The scanner and kettle tells use the hyphen. */
export function playerBearingHyphen(dx, dz) {
  const index = playerBearingIndex(dx, dz);
  return index < 0 ? '' : HYPHEN[index];
}

/** 'N', 'NE', 'E', … Chart octants, rumor cards, and the scan compass. */
export function playerBearingLetter(dx, dz) {
  const index = playerBearingIndex(dx, dz);
  return index < 0 ? '' : LETTERS[index];
}

/**
 * World offset of each cryo quadrant key. +z (nw/ne) is player north, screen up.
 * Kept beside the compass so a dressing comment cannot re-teach the opposite north.
 */
export const CRYO_KEY_VECTOR = Object.freeze({
  nw: Object.freeze({ x: -1, z: 1 }),
  ne: Object.freeze({ x: 1, z: 1 }),
  sw: Object.freeze({ x: -1, z: -1 }),
  se: Object.freeze({ x: 1, z: -1 }),
});

/** The player half shared by every key, or null when they do not share one axis. */
export function sharedPlayerHalf(keys) {
  if (!Array.isArray(keys) || keys.length < 2) return null;
  const vecs = [];
  for (const key of keys) {
    const vector = CRYO_KEY_VECTOR[key];
    if (!vector) return null;
    vecs.push(vector);
  }
  const sameX = vecs.every((vector) => Math.sign(vector.x) === Math.sign(vecs[0].x));
  const sameZ = vecs.every((vector) => Math.sign(vector.z) === Math.sign(vecs[0].z));
  if (sameZ && !sameX) return vecs[0].z > 0 ? 'north' : 'south';
  if (sameX && !sameZ) return vecs[0].x > 0 ? 'east' : 'west';
  return null;
}

/**
 * 'west is cold, east is hot' or 'south is cold, north is hot' when the thermal map is two
 * halves. Null when the cold and hot keys do not each share one player half.
 */
export function cryoThermalSentence(thermal) {
  if (!thermal || typeof thermal !== 'object') return null;
  const cold = [];
  const hot = [];
  for (const key of ['nw', 'ne', 'sw', 'se']) {
    if (thermal[key] === 'cold') cold.push(key);
    else if (thermal[key] === 'hot') hot.push(key);
  }
  const coldHalf = sharedPlayerHalf(cold);
  const hotHalf = sharedPlayerHalf(hot);
  if (!coldHalf || !hotHalf || coldHalf === hotHalf) return null;
  return `${coldHalf} is cold, ${hotHalf} is hot`;
}
