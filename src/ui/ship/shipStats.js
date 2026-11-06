// P1 — THE SHIP SHEET's one stat model.
//
// THE PROBLEM THIS SOLVES. Every hull surface in the game used to print the simulator's own
// numbers: `Agility 8.8` (yawAccel, rad/s²), `Inertia 18` (tonnes), `Brake 78` (reverseAccel,
// wu/s²), `CORE · 0 DRAW`. Two adjacent rows were in different units, neither had a top, and a
// player could not tell whether 8.8 was good. There was also no aggregate: nothing said what kind
// of ship the fit had become.
//
// WHAT THIS IS. One pure presenter that reads the SAME derived block the flight kernel obeys
// (`getDerivedStats`, `buildWeaponList`, `sustainedFireForFit`, and the live-profile readers in
// `shipCapabilities.js`) and maps it onto six bounded 1–10 stats with FIXED, DOCUMENTED ANCHORS.
// It is not a second calculator: it re-reads, it never re-derives, and it changes no tuning.
//
// RULES THIS FILE KEEPS (master plan P1):
//   - exactly six stats, never seven;
//   - 1–10, never a percentage, never an engineering unit in the player's reading;
//   - anchors are absolute, not roster-relative, so adding a hull never moves another hull's bar
//     (the old `handlingProfileDomain()` min/max-over-the-roster did exactly that);
//   - a bigger gun can never lower Firepower, and a heavier hull can never raise Handling.
//
// THE ANCHOR TABLE is `SHIP_STAT_DEFS`. `floor` is the raw reading that scores 1 and `ceiling` the
// raw reading that scores 10; between them the score is log-linear, which is what makes one scale
// stretch from a 140-hull scout to a 3200-hull capital without flattening the starter hulls.
//
// Player-facing deltas are reported in TENTHS (`delta` = after.tenths − before.tenths) while the
// headline number stays a whole 1–10. That is deliberate: a part that moves a bar by 0.4 must be
// visible, and "+0.4" is still a number on a scale the player can see the end of.

import { SHIPS } from '../../data/ships.js';
import { WEAPONS } from '../../data/weapons.js';
import { buildWeaponList, getDerivedStats } from '../../systems/ships.js';
import {
  forwardAccelFor,
  governedFightSpeedFor,
  governedYawRateFor,
  towClassMassFor,
} from '../../systems/shipCapabilities.js';
import { sustainedFireForFit } from './fitReadout.js';

const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weaponDef) => [weaponDef.id, weaponDef]));

/** The six stats, in the order every surface prints them. Nothing else may be added here. */
export const SHIP_STAT_DEFS = Object.freeze([
  Object.freeze({
    id: 'firepower',
    label: 'Firepower',
    meaning: 'Damage per second you can keep on a target.',
    floor: 10,
    ceiling: 130,
    unit: 'damage/s',
  }),
  Object.freeze({
    id: 'toughness',
    label: 'Toughness',
    meaning: 'How much it takes to kill you.',
    floor: 125,
    ceiling: 5700,
    unit: 'effective hull',
  }),
  Object.freeze({
    id: 'speed',
    label: 'Speed',
    meaning: 'How fast you fly with the throttle down, and how much more boost gives you.',
    floor: 130,
    ceiling: 430,
    unit: 'wu/s',
  }),
  Object.freeze({
    id: 'handling',
    label: 'Handling',
    meaning: 'How fast the nose comes round and how short the stop is.',
    floor: 6.5,
    ceiling: 90,
    unit: 'turn × brake',
  }),
  Object.freeze({
    id: 'power',
    label: 'Power',
    meaning: 'How long you can fire and cast before the capacitor runs dry.',
    floor: 100,
    ceiling: 2400,
    unit: 'capacitor',
  }),
  Object.freeze({
    id: 'muscle',
    label: 'Muscle',
    meaning: 'What the Line and a ram can move.',
    floor: 15,
    ceiling: 2000,
    unit: 'tonnes',
  }),
]);

const STAT_BY_ID = new Map(SHIP_STAT_DEFS.map((def) => [def.id, def]));

/**
 * The identity words. Each is the ship's STRONGEST stat said as a job, so the word is a statement
 * about how the ship plays and never about which modules happen to be bolted on. Order is the
 * tie-break when two stats are level.
 */
export const BUILD_IDENTITIES = Object.freeze([
  Object.freeze({ id: 'gunship', label: 'Gunship', from: 'firepower', gloss: 'Built to put damage on a target and keep it there.' }),
  Object.freeze({ id: 'brawler', label: 'Brawler', from: 'toughness', gloss: 'Built to take the hit and still be there.' }),
  Object.freeze({ id: 'hauler', label: 'Hauler', from: 'muscle', gloss: 'Built to move mass — yours and theirs.' }),
  Object.freeze({ id: 'workhorse', label: 'Workhorse', from: 'power', gloss: 'Built to keep working after the others run dry.' }),
  Object.freeze({ id: 'runner', label: 'Runner', from: 'speed', gloss: 'Built to get there first.' }),
  Object.freeze({ id: 'skirmisher', label: 'Skirmisher', from: 'handling', gloss: 'Built to turn and stop on a coin.' }),
]);

/** A shape this flat is nobody's specialty. */
export const GENERALIST_IDENTITY = Object.freeze({
  id: 'generalist',
  label: 'Generalist',
  pair: Object.freeze([]),
  gloss: 'No single strength; every stat is close to the others.',
});

/** How flat the stat spread has to be before the sheet calls a hull a Generalist. */
export const GENERALIST_SPREAD = 2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Log-linear position between the stat's documented floor and ceiling, as a 1–10 score with two
 * decimals of internal precision. A reading at or below `floor` is 1; at or above `ceiling` is 10.
 */
export function statScoreFor(def, raw) {
  const value = finite(raw, 0);
  if (!(value > 0)) return 1;
  if (!(def.ceiling > def.floor)) return 1;
  const t = Math.log(value / def.floor) / Math.log(def.ceiling / def.floor);
  return clamp(1 + 9 * t, 1, 10);
}

/** Round a 1–10 score to the whole number a sheet prints. */
export function statValueFor(score) {
  return clamp(Math.round(finite(score, 1)), 1, 10);
}

/** The same score in tenths, the unit every delta is reported in. */
export function statTenthsFor(score) {
  return clamp(Math.round(finite(score, 1) * 10), 10, 100);
}

// ---------------------------------------------------------------------------------------------
// RAW READINGS — one function per stat, each re-reading an existing owner.
// ---------------------------------------------------------------------------------------------

/**
 * Sustained damage per second from the fitted guns, read off the weapon runtime the sim builds.
 * A continuous mount's `dmg` is already per second; a cycling mount's is per shot, so it is
 * multiplied by the rate the lock and cooldown allow. The duty factor turns "huge burst for one
 * second" into an honest engagement number without ever punishing a bigger gun below a smaller
 * one by more than the burst it adds.
 */
export function firepowerRawFor(shipDef, fittings, player, derived) {
  if (!shipDef) return 0;
  const runtimes = buildWeaponList(shipDef, fittings || [], true, derived) || [];
  let burstDps = 0;
  for (const runtime of runtimes) {
    if (!runtime) continue;
    const def = WEAPON_BY_ID.get(runtime.defId) || null;
    if (def && def.emergentPrimitive) continue;
    const dmg = finite(runtime.dmg, finite(def && def.dmg, 0));
    if (!(dmg > 0)) continue;
    if (def && def.continuous) {
      burstDps += dmg;
      continue;
    }
    const rof = finite(runtime.rof, finite(def && def.rof, 0));
    if (!(rof > 0)) continue;
    const lockS = (runtime.tracking || (def && def.tracking)) === 'homing'
      ? Math.max(0, finite(runtime.lockTimeS, finite(def && def.lockTimeS, 0)))
      : 0;
    const shotsPerS = 1 / Math.max(1 / rof, lockS);
    burstDps += dmg * shotsPerS;
  }
  if (!(burstDps > 0)) return 0;
  const sustain = sustainedFireForFit(shipDef.id, fittings || [], player);
  const seconds = sustain && Number.isFinite(sustain.seconds) ? Math.max(0, sustain.seconds) : 6;
  const duty = 0.55 + 0.45 * clamp(seconds / 6, 0, 1);
  return burstDps * duty;
}

/**
 * Effective hit points: what has to be chewed through to kill the hull. Shields come back while
 * you fly, so they count heavier than their face value; damage reduction divides the rest.
 */
export function toughnessRawFor(derived) {
  if (!derived) return 0;
  const reduction = clamp(finite(derived.damageReductionMult, 1), 0.05, 1);
  const hull = finite(derived.hullMax, finite(derived.hull, 0));
  const armor = finite(derived.armorMax, 0);
  const shield = finite(derived.shieldMax, finite(derived.shield, 0));
  return (hull + armor) / reduction + 1.3 * shield;
}

/** Top speed the kernel governs in a fight, plus a fifth of the boost ceiling on top. */
export function speedRawFor(derived) {
  if (!derived) return 0;
  const fight = governedFightSpeedFor(derived);
  const boost = finite(derived.boost && derived.boost.max, 0);
  return fight + 0.2 * boost;
}

/**
 * Turn and stop as one scalar. The governed yaw ceiling dominates (that is the nose coming round)
 * and reverse thrust trims it (that is the stop); both are the two things a thruster bay moves.
 */
export function handlingRawFor(derived) {
  if (!derived) return 0;
  const yaw = Math.max(0, governedYawRateFor(derived));
  const brake = Math.max(0, brakeFor(derived));
  if (!(yaw > 0)) return 0;
  return Math.pow(yaw, 0.65) * Math.pow(Math.max(brake, 1) / 30, 0.35) * 10;
}

/**
 * Brake acceleration, read through the same family key chain `handlingProfile.js` uses so the
 * sheet and the old bars can never disagree about which field is live.
 */
function brakeFor(derived) {
  const propulsion = derived && derived.propulsion;
  for (const key of ['reverseAccel', 'maxBrakeAccel', 'brakeAccel', 'rcsReverseAccel']) {
    const live = finite(propulsion && propulsion[key], NaN);
    if (Number.isFinite(live) && live > 0) return live;
  }
  const model = derived && derived.flightModel;
  return finite(model && model.reverseAccel, finite(model && model.angularBrake, 0));
}

/** The capacitor plus five seconds of its own regen: how long a heavy fit keeps working. */
export function powerRawFor(derived) {
  if (!derived) return 0;
  const cap = finite(derived.capMax, finite(derived.cap, 0));
  const regen = finite(derived.capRegen, 0);
  return cap + 5 * regen;
}

/**
 * What the Line and a ram can move: the tow class the drive law already publishes, or — for a
 * hull too loaded to tow anything — its own mass, which is what a ram or an anchor is worth.
 */
export function muscleRawFor(derived) {
  if (!derived) return 0;
  const tow = towClassMassFor(derived);
  const mass = finite(derived.operationalMass, finite(derived.mass, 0));
  return Math.max(tow, mass * 1.5);
}

const RAW_READERS = Object.freeze({
  firepower: (shipDef, fittings, player, derived) => firepowerRawFor(shipDef, fittings, player, derived),
  toughness: (shipDef, fittings, player, derived) => toughnessRawFor(derived),
  speed: (shipDef, fittings, player, derived) => speedRawFor(derived),
  handling: (shipDef, fittings, player, derived) => handlingRawFor(derived),
  power: (shipDef, fittings, player, derived) => powerRawFor(derived),
  muscle: (shipDef, fittings, player, derived) => muscleRawFor(derived),
});

// ---------------------------------------------------------------------------------------------
// THE SHEET
// ---------------------------------------------------------------------------------------------

/**
 * The six-stat sheet for one fit. Pure: same inputs, same output, no DOM, no state.
 *
 * @param {{shipId: string, fittings?: Array, player?: object|null}} input
 * @returns {null | Readonly<object>}
 */
export function shipStatSheet({ shipId, fittings = [], player = null } = {}) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  const fit = Array.isArray(fittings) ? fittings : [];
  const derived = getDerivedStats(shipId, fit, player);
  if (!derived) return null;

  const stats = SHIP_STAT_DEFS.map((def) => {
    const raw = finite(RAW_READERS[def.id](shipDef, fit, player, derived), 0);
    const score = statScoreFor(def, raw);
    return Object.freeze({
      id: def.id,
      label: def.label,
      meaning: def.meaning,
      unit: def.unit,
      raw: Math.round(raw * 100) / 100,
      score: Math.round(score * 100) / 100,
      value: statValueFor(score),
      tenths: statTenthsFor(score),
    });
  });

  const identity = buildIdentityForStats(stats);
  return Object.freeze({
    shipId: shipDef.id,
    hullName: shipDef.name,
    role: shipDef.role || 'ship',
    stats: Object.freeze(stats),
    identity,
    // The engineering reading the whole sheet is built from, for the Details disclosure only.
    detail: Object.freeze({
      mass: Math.round(finite(derived.operationalMass, finite(derived.mass, 0)) * 10) / 10,
      hull: Math.round(finite(derived.hullMax, 0)),
      shield: Math.round(finite(derived.shieldMax, 0)),
      armor: Math.round(finite(derived.armorMax, 0)),
      capMax: Math.round(finite(derived.capMax, 0)),
      capRegen: Math.round(finite(derived.capRegen, 0) * 10) / 10,
      cargo: Math.round(finite(derived.cargoCap, 0)),
      fightSpeed: Math.round(governedFightSpeedFor(derived)),
      turnRate: Math.round(governedYawRateFor(derived) * 100) / 100,
      accel: Math.round(forwardAccelFor(derived)),
      towClass: Math.round(towClassMassFor(derived) * 10) / 10,
      sustainedFireS: (() => {
        const sustain = sustainedFireForFit(shipId, fit, player);
        if (!sustain) return null;
        return Number.isFinite(sustain.seconds) ? Math.round(sustain.seconds * 10) / 10 : null;
      })(),
    }),
  });
}

/**
 * The build word, computed from the SHAPE of the stats rather than from which modules are bolted
 * on: the strongest stat names the job, and a sheet too flat to have a peak is a Generalist.
 */
export function buildIdentityForStats(stats) {
  const list = Array.isArray(stats) ? stats : [];
  if (!list.length) return GENERALIST_IDENTITY;
  const byId = new Map(list.map((stat) => [stat.id, finite(stat.tenths, finite(stat.value, 1) * 10)]));
  const values = [...byId.values()];
  const spread = Math.max(...values) - Math.min(...values);
  if (spread < GENERALIST_SPREAD * 10) return GENERALIST_IDENTITY;
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of BUILD_IDENTITIES) {
    const score = finite(byId.get(candidate.from), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best || GENERALIST_IDENTITY;
}

/**
 * Per-stat difference between two sheets, in tenths. `tone` is `gain`, `loss` or `same`, which is
 * all a surface needs to paint green, red or leave it alone.
 */
export function shipStatDelta(beforeSheet, afterSheet) {
  if (!beforeSheet || !afterSheet) return Object.freeze([]);
  const beforeById = new Map(beforeSheet.stats.map((stat) => [stat.id, stat]));
  return Object.freeze(afterSheet.stats.map((after) => {
    const before = beforeById.get(after.id) || null;
    const from = before ? before.tenths : after.tenths;
    const delta = after.tenths - from;
    return Object.freeze({
      id: after.id,
      label: after.label,
      meaning: after.meaning,
      beforeValue: before ? before.value : after.value,
      afterValue: after.value,
      beforeTenths: from,
      afterTenths: after.tenths,
      delta,
      tone: delta > 0 ? 'gain' : (delta < 0 ? 'loss' : 'same'),
    });
  }));
}

/**
 * A short plain sentence for the whole sheet — the line a screen prints under the hull name
 * instead of a paragraph of engineering. It never restates a stat name; it says what the ship is.
 */
export function shipSheetSentence(sheet) {
  if (!sheet) return '';
  const identity = sheet.identity || GENERALIST_IDENTITY;
  const stats = sheet.stats || [];
  const best = stats.reduce((lead, stat) => (!lead || stat.value > lead.value || (stat.value === lead.value && stat.tenths > lead.tenths) ? stat : lead), null);
  const worst = stats.reduce((low, stat) => (!low || stat.value < low.value || (stat.value === low.value && stat.tenths < low.tenths) ? stat : low), null);
  if (identity.id === GENERALIST_IDENTITY.id) {
    return 'No weak corner and no party trick. It will do any job you point it at.';
  }
  if (!best || !worst || best.id === worst.id) return identity.gloss;
  return `${identity.gloss} Thinnest at ${worst.label.toLowerCase()}.`;
}

/** One stat's raw reading as the number the Details disclosure prints, with its unit. */
export function statDetailText(stat) {
  if (!stat) return '';
  const raw = finite(stat.raw, 0);
  const pretty = raw >= 100 ? String(Math.round(raw)) : (Math.round(raw * 10) / 10).toString();
  return `${pretty} ${stat.unit}`;
}

/** The definition row for an id, or null. */
export function shipStatDef(id) {
  return STAT_BY_ID.get(id) || null;
}
