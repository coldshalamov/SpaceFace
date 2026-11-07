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
//   - adding mass to the SAME fit never raises Handling, and a bigger gun never lowers Firepower.
//     (The older "a heavier hull can never raise Handling" claim is false hull-to-hull: five pairs
//     of authored hulls invert once their own drives and masses are applied.)
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
    // Anchored above the strongest fit the catalogue can actually reach. The corrected strongest
    // full legal fit (every weapon slot at its best legal gun, every module slot at its best legal
    // module) reads 2184.48 raw on the Leviathan; 3200 leaves that fit below the ceiling and keeps
    // every hull off the 10 wall, while still scoring a 10 to damage the catalogue cannot reach yet.
    // The old 1900 ceiling was below that legal maximum and pinned the Leviathan at 10.
    ceiling: 3200,
    unit: 'damage/s',
  }),
  Object.freeze({
    id: 'toughness',
    label: 'Toughness',
    meaning: 'How much it takes to kill you.',
    floor: 125,
    ceiling: 9000,
    unit: 'effective hull',
  }),
  Object.freeze({
    id: 'speed',
    label: 'Speed',
    meaning: 'How fast you fly with the throttle down, and how much a burner adds.',
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
    meaning: 'How long you can keep firing before the capacitor or the heat stops you.',
    // Seconds of sustained fire. A fit with no gun (or one that never runs dry) falls back to the
    // capacitor's reserve at POWER_REFERENCE_DRAW_PER_S, so the reading is always a duration.
    floor: 2,
    ceiling: 300,
    unit: 'seconds',
  }),
  Object.freeze({
    id: 'muscle',
    label: 'Muscle',
    meaning: 'How much Line load this hull can hold and move.',
    floor: 8,
    ceiling: 4000,
    unit: 'tow tonnes',
  }),
]);

/** A heavy mount's draw, the documented reference that turns a capacitor into a duration. */
export const POWER_REFERENCE_DRAW_PER_S = 20;

const STAT_BY_ID = new Map(SHIP_STAT_DEFS.map((def) => [def.id, def]));

/**
 * The identity words. Each is the ship's STRONGEST stat said as a job, so the word is a statement
 * about how the ship plays and never about which modules happen to be bolted on. Order is the
 * tie-break when two stats are level. `roles` is the authored hull class (data/ships.js) the word
 * belongs to: when the hull's own job is within one point of the strongest stat, the job wins the
 * word, so a tug does not print "Runner" just because its drive is quick.
 *
 * These words deliberately do not reuse the scanner's hull-role vocabulary (`Gunship`,
 * `Generalist`): a hull's authored class and a fit's build are two different statements, and the
 * ship sheet prints the authored class beside this word so the two can never be mistaken.
 */
export const BUILD_IDENTITIES = Object.freeze([
  Object.freeze({ id: 'gunship', label: 'Gunboat', from: 'firepower', roles: Object.freeze(['fighter', 'interceptor', 'gunship', 'strike']), gloss: 'Built to put damage on a target and keep it there.' }),
  Object.freeze({ id: 'brawler', label: 'Brawler', from: 'toughness', roles: Object.freeze(['corvette', 'battlecruiser', 'flagship', 'capital', 'battleship']), gloss: 'Built to take the hit and still be there.' }),
  Object.freeze({ id: 'hauler', label: 'Hauler', from: 'muscle', roles: Object.freeze(['tug', 'heavy_hauler', 'freighter', 'mining', 'mining_barge']), gloss: 'Built to move mass — yours and theirs.' }),
  Object.freeze({ id: 'workhorse', label: 'Workhorse', from: 'power', roles: Object.freeze(['explorer', 'survey', 'science']), gloss: 'Built to keep working after the others run dry.' }),
  Object.freeze({ id: 'runner', label: 'Runner', from: 'speed', roles: Object.freeze(['courier', 'racer']), gloss: 'Built to get there first.' }),
  Object.freeze({ id: 'skirmisher', label: 'Skirmisher', from: 'handling', roles: Object.freeze(['starter', 'multirole', 'scout']), gloss: 'Built to turn and stop on a coin.' }),
]);

/** A shape this flat is nobody's specialty. The gloss follows the level, not just the spread. */
export const GENERALIST_IDENTITY = Object.freeze({
  id: 'generalist',
  label: 'All-Rounder',
  pair: Object.freeze([]),
  gloss: 'No single strength; every stat is close to the others.',
});

/** The flat-shape gloss, branched on the mean so a strong all-rounder does not read as a shrug. */
export function generalistGlossForMean(mean) {
  if (mean >= 65) return 'Every stat is high; there is no soft corner to attack.';
  if (mean <= 40) return 'Every stat is modest; nothing here stands out yet.';
  return 'No single strength; every stat is close to the others.';
}

/** How flat the stat spread has to be before the sheet calls a hull an All-Rounder. */
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
 * Each mount pays its OWN duty: a continuous mount's `dmg` is already per second, a cycling
 * mount's is per shot, and the heat/energy clock is that gun's own. A hot gun can no longer lower
 * every other gun's contribution; the fit-wide trigger time is the Power stat's job.
 *
 * The starter fallback gun `buildWeaponList(..., isPlayer=true)` injects into an empty player fit
 * is not fitted; it is ignored here (the Saucer's intrinsic emitters are marked and do count).
 */
export function firepowerRawFor(shipDef, fittings, player, derived) {
  if (!shipDef) return 0;
  const runtimes = realWeaponRuntimes(shipDef, fittings, player, derived);
  if (!runtimes.length) return 0;
  const capMax = finite(derived && derived.capMax, 0);
  const capRegen = finite(derived && derived.capRegen, 0);
  const rows = [];
  for (const runtime of runtimes) {
    const def = WEAPON_BY_ID.get(runtime.defId) || null;
    if (!def) continue;
    const dmg = finite(runtime.dmg, finite(def.dmg, 0));
    if (!(dmg > 0)) continue;
    const shotsPerS = shotsPerSecond(runtime, def);
    if (!(shotsPerS > 0)) continue;
    const continuous = !!(def.continuous || runtime.continuous);
    const energyPerS = continuous
      ? finite(runtime.energyCost, finite(def.energyCost, 0))
      : finite(runtime.energyCost, finite(def.energyCost, 0)) * shotsPerS;
    const heatPerS = continuous
      ? (def.heatPerSec != null ? finite(def.heatPerSec, 0) : finite(runtime.heat, 0))
      : finite(runtime.heat, finite(def.heatPerShot, 0)) * shotsPerS;
    const heatMax = finite(runtime.heatMax, finite(def.heatMax, 0));
    const cooling = finite(runtime.heatDissip, finite(def.heatDissip, 0));
    rows.push({
      burstDps: dmg * shotsPerS,
      // Each mount's own clock: its heat flow and its own draw against the capacitor. Adding a
      // second gun cannot shorten the first gun's clock (that is the global-duty bug this
      // replaced); the fit-wide trigger time is the Power stat's job.
      seconds: Math.min(
        secondsUntilEmpty(capMax, energyPerS, capRegen),
        secondsUntilEmpty(heatMax, heatPerS, cooling),
      ),
    });
  }
  if (!rows.length) return 0;
  let sustained = 0;
  for (const row of rows) {
    const duty = 0.55 + 0.45 * clamp(Number.isFinite(row.seconds) ? row.seconds / 6 : 1, 0, 1);
    sustained += row.burstDps * duty;
  }
  return sustained;
}

/** The fitted weapon runtimes, excluding the starter fallback the player does not actually carry. */
function realWeaponRuntimes(shipDef, fittings, player, derived) {
  const fit = Array.isArray(fittings) ? fittings : [];
  const runtimes = buildWeaponList(shipDef, fit, true, derived) || [];
  return runtimes.filter((runtime) => {
    if (!runtime) return false;
    if (runtime.intrinsic) return true;
    const fittedId = fit[runtime.slotIndex];
    return !!(fittedId && WEAPON_BY_ID.has(fittedId));
  });
}

function shotsPerSecond(runtime, def) {
  const rof = finite(runtime.rof, finite(def && def.rof, 0));
  const continuous = !!(def && def.continuous);
  if (continuous && !(rof > 0)) return 1;
  if (!(rof > 0)) return 0;
  const lockS = (runtime.tracking || (def && def.tracking)) === 'homing'
    ? Math.max(0, finite(runtime.lockTimeS, finite(def && def.lockTimeS, 0)))
    : 0;
  return 1 / Math.max(1 / rof, lockS);
}

function secondsUntilEmpty(max, rateIn, rateOut) {
  if (!(rateIn > 0)) return Infinity;
  if (!(max > 0)) return 0;
  const net = rateIn - Math.max(0, rateOut);
  if (!(net > 0)) return Infinity;
  return max / net;
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

/**
 * Top speed the kernel governs in a fight, lifted by a fitted burner's live burn gain. The old
 * `0.2 * boost.max` read the boost ENERGY reservoir, not a speed, and made an Atlas outrun a
 * Hornet on paper; `boost.topSpeedPct` is the speed multiplier the flight kernel actually applies.
 */
export function speedRawFor(derived) {
  if (!derived) return 0;
  const fight = governedFightSpeedFor(derived);
  const burnPct = Math.max(0, finite(derived.boost && derived.boost.topSpeedPct, 0));
  return fight * (1 + burnPct);
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

/**
 * How long the fit keeps firing, in seconds, from `sustainedFireForFit` (the same clock the
 * Details door prints). When there is no gun — or the guns never outrun the capacitor — the
 * reading falls back to the capacitor's reserve at POWER_REFERENCE_DRAW_PER_S, so a no-gun fit
 * still has a duration rather than a unitless capacity.
 */
export function powerRawFor(shipId, fittings, player, derived) {
  if (!derived) return 0;
  const fit = Array.isArray(fittings) ? fittings : [];
  const shipDef = SHIP_BY_ID.get(shipId);
  const hasRealGuns = !!(shipDef && realWeaponRuntimes(shipDef, fit, player, derived)
    .some((runtime) => finite(runtime.dmg, 0) > 0));
  if (hasRealGuns) {
    const sustain = sustainedFireForFit(shipId, fit, player);
    if (sustain && Number.isFinite(sustain.seconds) && sustain.seconds > 0) {
      return Math.max(0, sustain.seconds);
    }
  }
  const cap = finite(derived.capMax, finite(derived.cap, 0));
  const regen = finite(derived.capRegen, 0);
  return Math.max(0, (cap + 5 * regen) / POWER_REFERENCE_DRAW_PER_S);
}

/**
 * What the Line can hold and move: the tow class law the drive already publishes. The law is rated
 * at the hull's DRY mass, so cargo only ever lowers it — a loaded hold cannot buy Muscle. A hull
 * with no tow rating at all falls back to a small share of its dry mass (what a ram is worth) and
 * says so; a hull that HAS a rating but is currently too heavy says that instead, rather than
 * pretending the rating never existed.
 */
export function muscleRawFor(derived) {
  if (!derived) return 0;
  const tow = Math.max(0, towClassMassFor(derived));
  if (hasTowRating(derived)) return tow;
  const dryMass = Math.max(0, finite(derived.dryMass, finite(derived.mass, 0)));
  return 0.15 * dryMass;
}

/**
 * True when the HULL publishes a real tow rating at its dry mass. This deliberately does not read
 * the current load: an overloaded tug still has a rating, it just cannot use it right now.
 */
export function hasTowRating(derived) {
  if (!derived) return false;
  const dryMass = Math.max(0, finite(derived.dryMass, finite(derived.mass, 0)));
  if (!(dryMass > 0)) return false;
  return towClassMassFor({ ...derived, mass: dryMass, operationalMass: dryMass }) > 0;
}

const RAW_READERS = Object.freeze({
  firepower: (shipDef, fittings, player, derived) => firepowerRawFor(shipDef, fittings, player, derived),
  toughness: (shipDef, fittings, player, derived) => toughnessRawFor(derived),
  speed: (shipDef, fittings, player, derived) => speedRawFor(derived),
  handling: (shipDef, fittings, player, derived) => handlingRawFor(derived),
  power: (shipDef, fittings, player, derived) => powerRawFor(shipDef && shipDef.id, fittings, player, derived),
  muscle: (shipDef, fittings, player, derived) => muscleRawFor(derived),
});

// ---------------------------------------------------------------------------------------------
// THE SHEET
// ---------------------------------------------------------------------------------------------

/**
 * The six-stat sheet for one fit. Pure: same inputs, same output, no DOM, no state.
 *
 * @param {{shipId?: string, fittings?: Array, player?: object|null}} input
 * @returns {null | Readonly<object>}
 */
export function shipStatSheet(input = {}) {
  const { shipId, fittings = [], player = null } = input || {};
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  const fit = Array.isArray(fittings) ? fittings : [];
  const derived = getDerivedStats(shipId, fit, player);
  if (!derived) return null;
  const towRating = hasTowRating(derived);
  const liveTow = Math.max(0, towClassMassFor(derived));
  const runtimes = realWeaponRuntimes(shipDef, fit, player, derived);
  const hasGuns = runtimes.length > 0;
  const hasDamagingGuns = runtimes.some((runtime) => finite(runtime.dmg, 0) > 0);

  const stats = SHIP_STAT_DEFS.map((def) => {
    const raw = finite(RAW_READERS[def.id](shipDef, fit, player, derived), 0);
    const score = statScoreFor(def, raw);
    // One rounding path: the tenths are authoritative, the headline is those tenths read whole.
    const tenths = statTenthsFor(score);
    const value = clamp(Math.round(tenths / 10), 1, 10);
    let meaning = def.meaning;
    let note = null;
    if (def.id === 'firepower' && (!hasGuns || !(raw > 0))) {
      note = 'No damaging gun fitted.';
      meaning = 'No damaging gun fitted. Nothing on this fit puts damage on a target.';
    }
    if (def.id === 'muscle') {
      if (!towRating) {
        note = 'No Line load — it rams instead.';
        meaning = 'No Line load — this hull rams instead.';
      } else if (!(liveTow > 0)) {
        note = 'Too loaded to tow.';
        meaning = 'Too loaded to tow — the hold is heavier than the drive is rated for.';
      }
    }
    return Object.freeze({
      id: def.id,
      label: def.label,
      meaning,
      note,
      unit: def.unit,
      raw: Math.round(raw * 100) / 100,
      score: Math.round(score * 100) / 100,
      value,
      tenths,
    });
  });

  const identity = buildIdentityForStats(stats, shipDef.role || null);
  return Object.freeze({
    shipId: shipDef.id,
    hullName: shipDef.name,
    role: shipDef.role || 'ship',
    roleLabel: roleLabelFor(shipDef.role),
    stats: Object.freeze(stats),
    identity,
    // The engineering reading the whole sheet is built from, for the Details disclosure only.
    detail: Object.freeze({
      mass: Math.round(finite(derived.operationalMass, finite(derived.mass, 0)) * 10) / 10,
      ramWeight: Math.round(1.5 * finite(derived.operationalMass, finite(derived.mass, 0)) * 10) / 10,
      hull: Math.round(finite(derived.hullMax, 0)),
      shield: Math.round(finite(derived.shieldMax, 0)),
      armor: Math.round(finite(derived.armorMax, 0)),
      capMax: Math.round(finite(derived.capMax, 0)),
      capRegen: Math.round(finite(derived.capRegen, 0) * 10) / 10,
      cargo: Math.round(finite(derived.cargoCap, 0)),
      // The old handling profile's `continuousDrain` reading, kept so the engineering block still
      // says what the always-on modules cost. It is module draw, not weapon heat.
      continuousDrain: Math.round(finite(derived.continuousDrain, 0) * 10) / 10,
      fightSpeed: Math.round(governedFightSpeedFor(derived)),
      burnPct: Math.round(Math.max(0, finite(derived.boost && derived.boost.topSpeedPct, 0)) * 100),
      turnRate: Math.round(governedYawRateFor(derived) * 100) / 100,
      accel: Math.round(forwardAccelFor(derived)),
      towClass: Math.round(liveTow * 10) / 10,
      towRated: towRating,
      sustainedFireS: (() => {
        if (!hasDamagingGuns) return null;
        const sustain = sustainedFireForFit(shipId, fit, player);
        if (!sustain) return null;
        return Number.isFinite(sustain.seconds) ? Math.round(sustain.seconds * 10) / 10 : null;
      })(),
    }),
  });
}

/** The authored hull class in title case: `mining_barge` -> `Mining Barge`. */
export function roleLabelFor(role) {
  const words = String(role || 'ship').replace(/[_-]+/g, ' ').trim();
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * The build word, computed from the SHAPE of the stats rather than from which modules are bolted
 * on: the strongest stat names the job, and a sheet too flat to have a peak is an All-Rounder
 * whose gloss follows the mean level.
 */
export function buildIdentityForStats(stats, authoredRole = null) {
  const list = Array.isArray(stats) ? stats : [];
  if (!list.length) return GENERALIST_IDENTITY;
  const byId = new Map(list.map((stat) => [stat.id, finite(stat.tenths, finite(stat.value, 1) * 10)]));
  const values = [...byId.values()];
  const spread = Math.max(...values) - Math.min(...values);
  if (spread < GENERALIST_SPREAD * 10) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Object.freeze({ ...GENERALIST_IDENTITY, gloss: generalistGlossForMean(mean) });
  }
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of BUILD_IDENTITIES) {
    const score = finite(byId.get(candidate.from), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  // The authored class breaks a near-tie in favour of the job the hull was built for. It is the
  // same authored field, not a module-id classifier: a Warden whose power is a point above its
  // guns still reads as a Gunboat, and a Hawser that is quick still reads as a Hauler.
  if (authoredRole) {
    const role = String(authoredRole).toLowerCase();
    const match = BUILD_IDENTITIES.find((candidate) => candidate.roles
      && candidate.roles.includes(role)
      && finite(byId.get(candidate.from), 0) >= bestScore - 20);
    if (match) return match;
  }
  return best || GENERALIST_IDENTITY;
}

/**
 * Per-stat difference between two sheets, in tenths. `tone` is `gain`, `loss` or `same`, which is
 * all a surface needs to paint green, red or leave it alone. The before/after headline numbers are
 * read from the same tenths, so a displayed `6 -> 7` is exactly the tenths move, never a second
 * rounding of the score.
 */
export function shipStatDelta(beforeSheet, afterSheet) {
  if (!beforeSheet || !afterSheet) return Object.freeze([]);
  const beforeById = new Map(beforeSheet.stats.map((stat) => [stat.id, stat]));
  return Object.freeze(afterSheet.stats.map((after) => {
    const before = beforeById.get(after.id) || null;
    const fromTenths = before ? before.tenths : after.tenths;
    const delta = after.tenths - fromTenths;
    return Object.freeze({
      id: after.id,
      label: after.label,
      meaning: after.meaning,
      beforeValue: clamp(Math.round(fromTenths / 10), 1, 10),
      afterValue: after.value,
      beforeTenths: fromTenths,
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
    return identity.gloss;
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
