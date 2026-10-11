// SFQ-B064: the first verb-changing fit is felt on the first undock. A pure table keyed on what the
// module DOES (its `mods` flags, or its weapon id), so siblings and Mk2 variants get the same
// line, and gated on the live derived stats so a line is never false for the current fit (a Veil
// Step replaces boost, so the boost-verb rows stay silent while it is fitted). Lines name what the
// pilot can now DO and the live bound key; no stats, no DOM, no randomness.
//
// Table order is the order of verb change: when several are fitted the earliest entry speaks at
// this undock and the rest wait for later undocks. The transverse snare head and the Repulsion
// Trap already speak at the fit (TEACH-04 / INF-4) and are deliberately not in the table.

/** @typedef {(action: string, empty?: string) => string} KeyLabel */

const mods = (def) => (def && def.mods) || {};

export const FIT_FEEL = Object.freeze([
  Object.freeze({
    verbId: 'veilStep',
    match: (def) => !!mods(def).phaseBlink,
    live: (derived) => !!(derived && derived.phaseBlink),
    line: (key, def) => `${def.name} fitted \u2014 ${key('boost', 'BOOST')} now blinks you: hold to aim, release to arrive.`,
  }),
  Object.freeze({
    verbId: 'swingDrive',
    match: (def) => !!mods(def).swingDrive,
    live: (derived) => !!(derived && derived.swingDrive && !derived.phaseBlink),
    line: (key, def) => `${def.name} fitted \u2014 ${key('boost', 'BOOST')} on a taut Massline swings you around the anchor.`,
  }),
  Object.freeze({
    verbId: 'hullBurst',
    match: (def) => !!mods(def).hullBurst,
    live: (derived) => !!(derived && derived.hullBurstKind && !derived.phaseBlink),
    line: (key, def) => `${def.name} fitted \u2014 ${key('boost', 'BOOST')} fires the burst: whatever your nose touches takes it, harder the faster you arrive.`,
  }),
  Object.freeze({
    verbId: 'chargeRack',
    match: (def) => Number(mods(def).impulseChargeCapacity) > 0,
    live: () => true,
    line: (key, def) => `${def.name} fitted \u2014 ${key('chargeThrow', 'THROW')} throws a charge, ${key('chargeDetonate', 'DETONATE')} sets it off.`,
  }),
  Object.freeze({
    verbId: 'concussionCannon',
    match: (def) => !!def && (def.id === 'wpn_concussion_cannon_s' || String(def.impulseProvenance || '').startsWith('concussion')),
    live: () => true,
    line: (key, def) => `${def.name} fitted \u2014 ${key('fire', 'FIRE')} kicks light hulls tumbling; it shoves more than it burns.`,
  }),
  Object.freeze({
    verbId: 'autocannon',
    match: (def) => !!def && String(def.id || '').startsWith('wpn_autocannon'),
    live: () => true,
    line: (key, def) => `${def.name} fitted \u2014 ${key('fire', 'FIRE')} chews armor and knocks light hulls around.`,
  }),
  Object.freeze({
    verbId: 'ramPlate',
    match: (def) => Number(mods(def).ramDamageDealtMult) > 1,
    live: (derived) => !!(derived && Number(derived.ramDamageDealtMult) > 1),
    line: (key, def) => `${def.name} fitted \u2014 fly nose-first into them: your hull now hits harder than it takes.`,
  }),
  Object.freeze({
    verbId: 'heavyWinch',
    match: (def) => Number(mods(def).tetherReelRateMult) > 1 || Number(mods(def).tetherSpoolMult) > 1,
    live: (derived) => !!(derived && (Number(derived.tetherReelRateMult) > 1 || Number(derived.tetherSpoolMult) > 1)),
    line: (key, def) => `${def.name} fitted \u2014 ${key('tether', 'LATCH')} lines now spool out longer and reel in faster.`,
  }),
  Object.freeze({
    verbId: 'thermalSink',
    match: (def) => Number(mods(def).weaponHeatDissipPct) > 0,
    live: (derived) => !!(derived && Number(derived.weaponHeatDissipPct) > 0),
    line: (key, def) => `${def.name} fitted \u2014 your guns now run cooler and fire longer before they vent.`,
  }),
  Object.freeze({
    verbId: 'cargoScanner',
    match: (def) => !!mods(def).revealCargo,
    live: () => true,
    line: (key, def) => `${def.name} fitted \u2014 a scanned hull now shows what it carries.`,
  }),
]);

export const FIT_FELT_HINT_PREFIX = 'fitFelt:';

/** The table row a module (or weapon) definition belongs to, or null. */
export function fitFeelRowFor(def) {
  if (!def) return null;
  return FIT_FEEL.find((row) => row.match(def)) || null;
}

export function fitFeltHintKey(row) {
  return `${FIT_FELT_HINT_PREFIX}${row.verbId}`;
}

export function fitFeelRank(row) {
  const index = FIT_FEEL.indexOf(row);
  return index < 0 ? Infinity : index;
}

/**
 * The one felt line owed for a fit: the earliest table row among the fitted definitions whose
 * hint is unspent and whose verb is live for the current derived stats. Pure.
 * @returns {{ row: object, def: object, hintKey: string } | null}
 */
export function pickFitFelt(fittedDefs, derived, hints) {
  const spent = hints || {};
  let best = null;
  const seen = new Set();
  for (const def of fittedDefs || []) {
    const row = fitFeelRowFor(def);
    if (!row || seen.has(row.verbId)) continue;
    seen.add(row.verbId);
    const hintKey = fitFeltHintKey(row);
    if (spent[hintKey] || !row.live(derived)) continue;
    if (!best || fitFeelRank(row) < fitFeelRank(best.row)) best = { row, def, hintKey };
  }
  return best;
}
