// What the throat is willing to say. Pure. The tick spends the flags. Tests read the predicates.
// Knowledge is the souvenir. The force table is not in this file.

export const BOLUS_LORE = Object.freeze({
  pearlMax: 0.3,
  gritFlash: 3,
  acidShy: 0.5,
  filmAt: Object.freeze([0.25, 0.5, 0.75]),
  chart: 'Concord files this volume as Lane Contamination.',
  stitches: 'The stitches held.',
  wall: 'The wall holds.',
  acid: 'The trench is wet.',
  iris: 'It is shut. It breathes.',
  tooth: 'Not every anchor is a friend.',
  light: 'The light pins it.',
  drum: 'It heard the burn.',
  film: Object.freeze([
    'A film on the glass.',
    'The film has a pulse.',
    'You will carry this out.',
  ]),
  hush: 'You walked a closed mouth.',
  comb: 'The tooth has nothing to pull toward.',
  shy: 'Three stitches. The trench goes shy.',
  breath: 'You took it while it breathed.',
  grit: 'The grit flashes. The slab blinks.',
  ring: 'An honest anchor. The film waits while you hold it.',
  pearl: 'A clean hull. The pearl opens.',
  pearlShut: 'Too filmed. It will not open.',
  scale: 'A hauler. It is not done digesting.',
  lip: 'It only holds still for a hand that isn\'t lying.',
});

const VALVE_KEYS = Object.freeze(['bolus_valve_0', 'bolus_valve_1', 'bolus_valve_2']);

export function bolusValveCount(flags) {
  const bag = flags || {};
  let n = 0;
  for (let i = 0; i < VALVE_KEYS.length; i++) {
    if (bag[`bolus:valve:${VALVE_KEYS[i]}`]) n += 1;
  }
  return n;
}

export function bolusFilmBeat(exposure) {
  const e = Number(exposure) || 0;
  const at = BOLUS_LORE.filmAt;
  if (e >= at[2]) return 3;
  if (e >= at[1]) return 2;
  if (e >= at[0]) return 1;
  return 0;
}

export function bolusAcidScale(flags) {
  return bolusValveCount(flags) >= 3 ? BOLUS_LORE.acidShy : 1;
}

export function bolusPearlOpens(exposure) {
  return (Number(exposure) || 0) < BOLUS_LORE.pearlMax;
}

export function bolusHeldSwing(role) {
  return role === 'knob' || role === 'tendril' || role === 'valve'
    || role === 'suture' || role === 'ring' || role === 'lip';
}
