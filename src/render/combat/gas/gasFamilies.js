// Gas / smoke / dust — per-family art records.
//
// The matter is authored in two places and only two: the offline solve
// (assets/vfx/gas-sim/*.json, baked by tools/bake-gas-volumes.mjs) owns SHAPE and EVOLUTION, and
// this file owns MATERIAL RESPONSE and TIMING. Nothing about a family lives in the shader.
//
// The shipped explosion film is one body tinted two ways. These four are different matter:
//
//   combustion   burnt gas: soot body, cavities that cool from the inside, emissive only where
//                the baked temperature channel is still hot
//   dust         rock flour: opaque, never emissive, the aux channel is COARSE GRAIN and it makes
//                the lumps read darker and denser than the fine haze around them
//   vent         flashed coolant: pale, cold, high albedo. Its aux channel is CONDENSATE and it
//                brightens DOWNSTREAM, so the breach is thin and fast and the head is bright
//   ambient      environmental particulate: very low extinction on purpose, so you fly through it
//                and still read the fight. Its aux channel is suspended grit catching the key
//
// The four aux behaviours are the same arithmetic with different coefficients - no branches in the
// fragment loop - so a family cannot accidentally become "the same smoke with a different tint".

import { GAS_FAMILY_FILMS } from './gasVolumeData.js';

const FILM_INDEX = new Map(GAS_FAMILY_FILMS.map((film, index) => [film.id, index]));

/**
 * @typedef {object} GasFamily
 * @property {string} id              runtime family key
 * @property {string} filmId          the baked film this family plays
 * @property {number} slot            shader family index, 0..3 - indexes the uniform arrays
 * @property {number[]} albedo        scattering colour
 * @property {number[]} emissive      colour the aux channel drives - emission, or whitening
 * @property {number} absorbGain      density to extinction; the whole "how solid is it" dial
 * @property {number} emissionGain    aux to emitted light. 0 means the family never self-lights
 * @property {number} detailAmp       sub-voxel domain warp amplitude, in film units
 * @property {number} detailScale     how many times the cell's own motion field tiles across it
 * @property {number} shadowGain      self-shadow strength along the key
 * @property {number} auxWarmth       aux tints the scatter colour toward `emissive`
 * @property {number} rimLift         brightening of thin runout, so dilution reads as dilution
 * @property {number} grainGain       aux darkens the body - coarse grain against fine haze
 * @property {number} capacity        hard live-instance cap
 * @property {number} life            seconds, at severity 1
 * @property {number} growth          end scale as a multiple of the spawn scale
 * @property {number} drift           world units per second the body coasts along its own axis
 * @property {number} spread          extra lateral scale gained across the life
 * @property {number} opacity         peak instance opacity
 * @property {number} rise           fraction of life spent ramping opacity in
 * @property {number} fade           fraction of life before opacity starts thinning out
 * @property {number} cycles         film playthroughs across one life (>1 only for loopers)
 * @property {number} drawRangeWu     beyond this camera distance the family is not drawn at all
 */

/** @type {readonly GasFamily[]} */
export const GAS_FAMILIES = Object.freeze([
  Object.freeze({
    id: 'combustion',
    filmId: 'combustion-bloom',
    slot: 0,
    albedo: [0.135, 0.112, 0.098],
    emissive: [1.00, 0.340, 0.075],
    absorbGain: 15.5,
    emissionGain: 3.4,
    detailAmp: 0.013,
    detailScale: 2.6,
    shadowGain: 2.45,
    auxWarmth: 0.06,
    rimLift: 0.22,
    grainGain: 0.0,
    capacity: 10,
    life: 2.65,
    growth: 3.05,
    drift: 2.4,
    spread: 0.35,
    opacity: 0.94,
    rise: 0.055,
    fade: 0.34,
    cycles: 1,
    drawRangeWu: 1400,
  }),
  Object.freeze({
    id: 'dust',
    filmId: 'fracture-dust',
    slot: 1,
    albedo: [0.520, 0.462, 0.383],
    emissive: [0.62, 0.55, 0.44],
    absorbGain: 21.0,
    emissionGain: 0.0,
    detailAmp: 0.023,
    detailScale: 4.3,
    shadowGain: 3.05,
    auxWarmth: 0.0,
    rimLift: 0.10,
    grainGain: 0.46,
    capacity: 14,
    life: 1.95,
    growth: 2.35,
    drift: 3.1,
    spread: 0.55,
    opacity: 0.90,
    rise: 0.070,
    fade: 0.30,
    cycles: 1,
    drawRangeWu: 1100,
  }),
  Object.freeze({
    id: 'vent',
    filmId: 'coolant-plume',
    slot: 2,
    albedo: [0.660, 0.735, 0.820],
    emissive: [0.840, 0.935, 1.000],
    absorbGain: 12.5,
    emissionGain: 0.17,
    detailAmp: 0.010,
    detailScale: 3.4,
    shadowGain: 1.80,
    auxWarmth: 0.64,
    rimLift: 0.31,
    grainGain: 0.0,
    capacity: 14,
    life: 1.15,
    growth: 1.95,
    drift: 5.2,
    spread: 0.22,
    opacity: 0.80,
    rise: 0.040,
    fade: 0.26,
    cycles: 1,
    drawRangeWu: 900,
  }),
  Object.freeze({
    id: 'ambient',
    filmId: 'environmental-drift',
    slot: 3,
    albedo: [0.400, 0.452, 0.548],
    emissive: [0.720, 0.665, 0.575],
    // A tenth of combustion's extinction. Environmental gas earns its readability from low
    // optical depth and from the authored openings in the bake, NOT from being faded out -
    // fading the whole body is the "uniform grey blanket" failure this family exists to avoid.
    absorbGain: 3.1,
    emissionGain: 0.11,
    detailAmp: 0.016,
    detailScale: 1.8,
    shadowGain: 1.10,
    auxWarmth: 0.14,
    rimLift: 0.16,
    grainGain: 0.21,
    capacity: 6,
    life: 9.0,
    growth: 1.14,
    drift: 0.6,
    spread: 0.05,
    opacity: 0.52,
    rise: 0.140,
    fade: 0.78,
    cycles: 3,
    drawRangeWu: 2200,
  }),
]);

export const GAS_FAMILY_BY_ID = Object.freeze(
  Object.fromEntries(GAS_FAMILIES.map((family) => [family.id, family])),
);

/** Baked film record for a family, or null when the payload does not carry it. */
export function gasFilmFor(family) {
  const index = FILM_INDEX.get(family.filmId);
  return index == null ? null : GAS_FAMILY_FILMS[index];
}

/**
 * Impact material + event class -> family. The impacts lane owns WHEN; this owns WHAT comes out.
 * Shield contacts throw no matter at all - a shield stops the thing before it removes any of the
 * hull, so there is nothing to vent, burn or grind off.
 */
export function gasFamilyForImpact(materialId, eventClass, severity) {
  if (materialId === 'shield') return null;
  if (materialId === 'rock' || materialId === 'ice' || materialId === 'ceramic') {
    return eventClass === 'graze' || eventClass === 'pinprick' ? null : GAS_FAMILY_BY_ID.dust;
  }
  // Hull-like matter: a deep event burns, a shallow one only vents pressure.
  if (eventClass === 'detonation' || eventClass === 'breakup') return GAS_FAMILY_BY_ID.combustion;
  if (eventClass === 'breach' || eventClass === 'fracture') {
    return severity >= 0.55 ? GAS_FAMILY_BY_ID.combustion : GAS_FAMILY_BY_ID.vent;
  }
  if (eventClass === 'graze' || eventClass === 'pinprick') return null;
  return GAS_FAMILY_BY_ID.vent;
}
