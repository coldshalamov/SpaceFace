// SFQ-B064: the first verb-changing fit is felt on the first undock. A pure table: for each early
// module whose fit changes what a key does, one short line naming what the pilot can now DO and
// the live bound key. systems/onboarding.js remembers the fit and speaks the line once per profile
// at the next undock. No stats, no DOM, no randomness.
//
// Table order is the order of verb change: when several are fitted in one dock the earliest entry
// speaks now and the rest wait for later undocks. The transverse snare head and the Repulsion Trap
// already speak at the fit (TEACH-04 and INF-4) and are deliberately not duplicated here.

/** @typedef {(action: string, empty?: string) => string} KeyLabel */

export const FIT_FEEL = Object.freeze([
  Object.freeze({
    defId: 'mod_veil_step',
    verbId: 'veilStep',
    line: (key) => `Veil Step fitted \u2014 ${key('boost', 'BOOST')} now blinks you: hold to aim, release to arrive.`,
  }),
  Object.freeze({
    defId: 'mod_swing_drive_s',
    verbId: 'swingDrive',
    line: (key) => `Swing Drive fitted \u2014 ${key('boost', 'BOOST')} on a taut Massline swings you around the anchor.`,
  }),
  Object.freeze({
    defId: 'mod_gravity_bumper_s',
    verbId: 'gravityBumper',
    line: (key) => `Gravity Bumper fitted \u2014 ${key('boost', 'BOOST')} throws off every hull your nose touches; faster arrivals hit harder.`,
  }),
  Object.freeze({
    defId: 'mod_charge_rack',
    verbId: 'chargeRack',
    line: (key) => `Charge Rack fitted \u2014 ${key('chargeThrow', 'THROW')} throws a charge, ${key('chargeDetonate', 'DETONATE')} sets it off.`,
  }),
  Object.freeze({
    defId: 'wpn_concussion_cannon_s',
    verbId: 'concussionCannon',
    line: (key) => `Concussion Cannon fitted \u2014 ${key('fire', 'FIRE')} kicks light hulls tumbling; it shoves more than it burns.`,
  }),
  Object.freeze({
    defId: 'wpn_autocannon_s',
    verbId: 'autocannon',
    line: (key) => `Autocannon fitted \u2014 ${key('fire', 'FIRE')} chews armor and knocks light hulls around.`,
  }),
  Object.freeze({
    defId: 'mod_ram_plate',
    verbId: 'ramPlate',
    line: () => 'Ram Plate fitted \u2014 fly nose-first into them: your hull now hits harder than it takes.',
  }),
  Object.freeze({
    defId: 'mod_winch_hd',
    verbId: 'heavyWinch',
    line: (key) => `Heavy-Duty Winch fitted \u2014 ${key('tether', 'LATCH')} lines now spool out longer and reel in faster.`,
  }),
  Object.freeze({
    defId: 'mod_thermal_sink_s',
    verbId: 'thermalSink',
    line: () => 'Thermal Sink fitted \u2014 your guns now run cooler and fire longer before they vent.',
  }),
  Object.freeze({
    defId: 'mod_cargo_scanner_s',
    verbId: 'cargoScanner',
    line: () => 'Cargo Scanner fitted \u2014 a scanned hull now shows what it carries.',
  }),
]);

const BY_DEF_ID = new Map(FIT_FEEL.map((row, index) => [row.defId, { row, index }]));

export const FIT_FELT_HINT_PREFIX = 'fitFelt:';

export function fitFeelFor(defId) {
  const hit = BY_DEF_ID.get(defId);
  return hit ? hit.row : null;
}

export function fitFeltHintKey(defId) {
  return `${FIT_FELT_HINT_PREFIX}${defId}`;
}

/** Table order of a defId (lower speaks first); Infinity when the module has no felt line. */
export function fitFeelRank(defId) {
  const hit = BY_DEF_ID.get(defId);
  return hit ? hit.index : Infinity;
}

/** The one line for a fitted module, with keys resolved by the caller's label function. */
export function fitFeelLine(defId, key) {
  const row = fitFeelFor(defId);
  return row ? row.line(key) : null;
}
