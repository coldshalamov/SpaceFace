// src/systems/shipCapabilities.js — PQ-142.00 "capabilities, not percentages".
//
// An upgrade should make the player imagine a possibility, not compare a percentage. This module
// turns the fit into four PHYSICAL VERBS, each a sentence with a number behind it, each computed
// from the law the simulation actually runs — never from a table invented for the screen:
//
//   TOW CLASS      the heaviest hull you can put under way on your line   (coupled mass + drive force)
//   SLAM SURVIVAL  the closing speed this hull walks away from            (TERRAIN_CRUMPLE_LAW)
//   LINE LOAD      the swing speed your line carries at its rated load    (the live tether policy)
//   FIELD DEPLOY   whether you can put a field in the water, and how big  (the countermeasure catalog)
//
// Nothing here is a writer. `ships` remains the sole authority for derived stats; this reads the
// derived block it already publishes plus the frozen catalogs, and returns words and numbers. It is
// deliberately synchronous and allocation-light: the fit screen calls it on every hover.
//
// Each verb is a PREDICTION of a live law, so each is falsifiable: the deterministic scenario
// `scripts/lib/bench/scenarios/fit.capability_verbs.mjs` drives the real kernels at the predicted
// speed minus one and plus one and shows the verb flipping.

import { ATTACHMENT_DEFS } from '../data/combatDefs.js';
import { MODULES } from '../data/modules.js';
import { SHIPS } from '../data/ships.js';
import {
  HEAVY_AS_TERRAIN_MASS,
  TERRAIN_CRUMPLE_LAW,
  resolveCollisionConsequence,
} from '../combat/impulseKernel.js';
import { effectiveTetherBreak } from '../combat/attachments.js';

const SHIP_BY_ID = new Map(SHIPS.map((row) => [row.id, row]));
const MODULE_BY_ID = new Map(MODULES.map((row) => [row.id, row]));
const ATTACHMENT_BY_ID = new Map(ATTACHMENT_DEFS.map((row) => [row.id, row]));

/** The player's Massline is the standard tether (src/systems/tetherGameplay.js). */
const PLAYER_TETHER_DEF_ID = 'tether_standard';

export const CAPABILITY_LAW = Object.freeze({
  // "Under way" is a speed you can steer a tow at, reached in a time you would actually wait:
  // sixty world units a second inside a second and a half. Anything slower is not a tow, it is a
  // shunt. The number is the bar the tow-class sentence names, not a tuning knob for feel.
  towUnderWaySpeed: 60,
  towUnderWaySeconds: 1.5,
  // FEEL_CONTRACT B7's own reference swing: a 100 WU line around an anchor heavy enough to be a
  // fixed point. Quoting the contract's geometry keeps the line-load number comparable to its bar.
  lineSwingRadiusWu: 100,
  // The closing-speed search for slam survival. The crumple law is monotone in closing speed above
  // its threshold, so a bisection on the live kernel is exact to the printed resolution.
  slamSearchMaxWuPerS: 2000,
  slamSearchSteps: 40,
});

const TOW_UNDER_WAY_ACCEL = CAPABILITY_LAW.towUnderWaySpeed / CAPABILITY_LAW.towUnderWaySeconds;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** "a Mule" / "an Ironback" — the sentence names a ship, so it has to read like one. */
function withArticle(name) {
  const word = String(name || '');
  return /^[AEIOU]/i.test(word) ? `an ${word}` : `a ${word}`;
}

// ---------------------------------------------------------------------------------------------
// TOW CLASS — what mass the line can put under way.
//
// A tow is one coupled body: the drive's force has to move your hull AND the load. The force the
// drive makes is the acceleration the profile publishes times the mass it is publishing it for
// (this is exactly what the kernel reconstructs: `force = acceleration * body.mass`), so a fit
// that is heavier than its rating both accelerates worse AND tows less — the same mass law, felt
// twice. The class is the heaviest hull on the roster the pair still gets under way.
// ---------------------------------------------------------------------------------------------

/** The forward force this fit's drive actually makes, in the kernel's own units. */
export function driveForceFor(derived) {
  if (!derived) return 0;
  const profile = derived.propulsion || {};
  const accel = finite(profile.mainAccel, 0)
    || finite(profile.maxAccel, 0)
    || finite(profile.rcsForwardAccel, 0)
    || finite(profile.fieldAccel, 0);
  const mass = finite(derived.operationalMass, finite(derived.mass, 0));
  return Math.max(0, accel * mass);
}

/** The heaviest partner mass this fit can put under way, in tonnes. Zero means "nothing". */
export function towClassMassFor(derived) {
  const force = driveForceFor(derived);
  const self = finite(derived && derived.operationalMass, finite(derived && derived.mass, 0));
  if (!(force > 0) || !(self > 0)) return 0;
  return Math.max(0, force / TOW_UNDER_WAY_ACCEL - self);
}

/** The heaviest ROSTER hull at or under `massT`, so the sentence can name a ship the player knows. */
export function heaviestHullWithin(massT) {
  let best = null;
  for (const shipDef of SHIPS) {
    const m = finite(shipDef.mass, 0);
    if (m <= 0 || m > massT) continue;
    if (!best || m > finite(best.mass, 0) || (m === finite(best.mass, 0) && shipDef.id < best.id)) best = shipDef;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// SLAM SURVIVAL — the closing speed this hull walks away from.
//
// The live rule is TERRAIN_CRUMPLE_LAW, run through the real consequence kernel so this number can
// never drift from the damage the game deals. The kernel is pure and monotone in closing speed
// above the crumple threshold, so a bisection finds the exact speed at which one slam is worth the
// hull's whole structure.
//
// The pool is STRUCTURE — hull, not hull plus shield. Crumple is what the wall does to the frame;
// a deflector buffers the bill but does not change the speed at which the frame is written off, and
// pricing the verb in shields would make the sentence swing on a difficulty buffer instead of on the
// ship. Damage reduction from hardeners IS applied, because combat applies it.
//
// The law is inverse in mass twice over — the crumple term and its cap both fall as the ship gets
// heavier — so this is the verb that pays you back for being loaded, and the one place in the fit
// screen where a full hold is an advantage. Past HEAVY_AS_TERRAIN_MASS the hull stops being a
// victim of the law and becomes its instrument: anything light that meets you takes the wall's own
// arithmetic (PQ-140.01).
// ---------------------------------------------------------------------------------------------

function crumpleDamageAt(closingSpeed, massT) {
  const receipt = resolveCollisionConsequence({
    tick: 0,
    target: { id: 'fit', type: 'ship', mass: massT, alive: true },
    other: { id: 'rock', type: 'asteroid', mass: 1e6 },
    exchangedMomentum: massT * Math.max(1, closingSpeed),
    preSolveClosingSpeed: closingSpeed,
  });
  return receipt ? finite(receipt.impactDamage, 0) : 0;
}

/**
 * The closing speed at which one rock slam is worth this hull's whole structure.
 * `unbreakable` is true when the law's own mass-scaled damage cap can never reach that structure —
 * a real outcome for a heavy or heavily loaded hull, and the sentence says so instead of printing a
 * search ceiling.
 */
export function slamSurvivalSpeedFor(derived) {
  if (!derived) return { speedWuPerS: 0, unbreakable: false };
  const massT = Math.max(0.001, finite(derived.operationalMass, finite(derived.mass, 1)));
  const structure = Math.max(1, finite(derived.hullMax, 0));
  const reduction = Math.max(0.01, Math.min(1, finite(derived.damageReductionMult, 1)));
  const ceiling = CAPABILITY_LAW.slamSearchMaxWuPerS;
  if (crumpleDamageAt(ceiling, massT) * reduction < structure) {
    return { speedWuPerS: ceiling, unbreakable: true };
  }
  let low = TERRAIN_CRUMPLE_LAW.threshold;
  let high = ceiling;
  for (let i = 0; i < CAPABILITY_LAW.slamSearchSteps; i += 1) {
    const mid = (low + high) * 0.5;
    if (crumpleDamageAt(mid, massT) * reduction >= structure) high = mid;
    else low = mid;
  }
  return { speedWuPerS: low, unbreakable: false };
}

// ---------------------------------------------------------------------------------------------
// LINE LOAD — the swing speed your line carries at its rated load.
//
// SG-02 grades the rope by force against the fitted attachment's `break.maxTension`
// (`sg02DynamicBodyOwner`: "a line BREAKS by its load rating, never by how far it happens to be
// stretched"). A steady swing around an anchor heavy enough to be a fixed point carries
// m * v^2 / r, so the rated swing speed is sqrt(maxTension * r / m): it RISES with a bigger spool
// and FALLS with everything you are carrying. The standard Massline's rating is deliberately far
// above ordinary play (combatDefs: automatic overload breaks are off for the standard line), so the
// honest sentence for an unfitted hull says the line holds anything you can build; a fitted
// specialist head has a real, reachable number and the sentence names it.
// ---------------------------------------------------------------------------------------------

const SPECIALIST_HEAD_ATTACHMENT = Object.freeze({
  transverse_snare: 'attachment_transverse_snare',
  monofilament_sweep: 'attachment_snarl',
  twin_bridle: 'attachment_massline',
  elastic_whip: 'attachment_massline',
});

/** The attachment definition whose rating grades this fit's line, and how it was chosen. */
export function ratedLineFor(derived) {
  const headId = derived && derived.masslineHeadId;
  const specialistId = headId ? SPECIALIST_HEAD_ATTACHMENT[headId] : null;
  const specialist = specialistId ? ATTACHMENT_BY_ID.get(specialistId) : null;
  if (specialist) return { def: specialist, specialist: true };
  return { def: ATTACHMENT_BY_ID.get(PLAYER_TETHER_DEF_ID) || null, specialist: false };
}

/** The rated swing speed of this fit's line, in WU/s, on FEEL_CONTRACT B7's 100 WU reference line. */
export function lineLoadSpeedFor(derived) {
  const { def, specialist } = ratedLineFor(derived);
  if (!def) return { speedWuPerS: 0, maxTension: 0, specialist: false };
  const owner = { data: { derived } };
  const rating = effectiveTetherBreak(def, owner);
  const maxTension = finite(rating && rating.maxTension, 0);
  const massT = Math.max(0.001, finite(derived && derived.operationalMass, finite(derived && derived.mass, 1)));
  const r = CAPABILITY_LAW.lineSwingRadiusWu;
  const speed = maxTension > 0 ? Math.sqrt((maxTension * r) / massT) : 0;
  return { speedWuPerS: speed, maxTension, specialist };
}

// ---------------------------------------------------------------------------------------------
// FIELD DEPLOY — whether you can put a field in the water at all.
//
// The one genuinely binary verb of the four: `src/systems/countermeasures.js` reads the fitted
// module's `mods.countermeasure` block and will not deploy anything without one. No module, no
// field — the keybind does nothing. This is the unlock the packet describes: not a bigger number,
// a thing you could not do before.
// ---------------------------------------------------------------------------------------------

const FIELD_KIND_WORD = Object.freeze({
  chaff: 'a chaff cloud',
  ecm: 'a jamming bubble',
});

/** The field this fit can deploy, or `{ available: false }`. */
export function fieldDeployFor(fittings) {
  const list = Array.isArray(fittings) ? fittings : [];
  let best = null;
  for (const id of list) {
    const def = id ? MODULE_BY_ID.get(id) : null;
    const cm = def && def.mods && def.mods.countermeasure;
    if (!cm) continue;
    const radius = finite(cm.radius, 0);
    if (!best || radius > best.radiusWu) {
      best = {
        available: true,
        kind: String(cm.kind || 'field'),
        moduleId: def.id,
        moduleName: def.name,
        radiusWu: radius,
        durationS: finite(cm.durationS, 0),
        cooldownS: finite(cm.cooldownS, 0),
      };
    }
  }
  return best || { available: false, kind: null, moduleId: null, moduleName: null, radiusWu: 0, durationS: 0, cooldownS: 0 };
}

// ---------------------------------------------------------------------------------------------
// The four sentences.
// ---------------------------------------------------------------------------------------------

/**
 * The four physical verbs for one fit, each as a sentence and a number.
 *
 * @param {object} args
 * @param {object} args.derived a derived-stat block from `getDerivedStats`
 * @param {Array<string|null>} [args.fittings] the fit those stats came from (field deploy reads it)
 * @returns {{tow:object, slam:object, line:object, field:object, rows:Array<object>}}
 */
export function shipCapabilityVerbs({ derived, fittings = [] } = {}) {
  if (!derived) return { tow: null, slam: null, line: null, field: null, rows: [] };

  const towMassT = towClassMassFor(derived);
  const towHull = heaviestHullWithin(towMassT);
  const tow = {
    id: 'tow_class',
    massT: round(towMassT, 1),
    hullId: towHull ? towHull.id : null,
    hullName: towHull ? towHull.name : null,
    verb: towHull
      ? `Can tow ${withArticle(towHull.name)}`
      : 'Too loaded to tow anything',
    sub: towHull ? `${round(towMassT, 0)} t on the line` : 'no tow',
    why: towHull
      ? `Your drive gets ${round(towMassT, 0)} t under way on the line — ${CAPABILITY_LAW.towUnderWaySpeed} WU/s in `
        + `${CAPABILITY_LAW.towUnderWaySeconds} s with the load attached. ${withArticle(towHull.name)} weighs `
        + `${round(towHull.mass, 0)} t.`
      : `At ${round(finite(derived.operationalMass, 0), 0)} t you cannot get anything else moving as well as yourself. `
        + 'Drop cargo or fit a stronger drive.',
  };

  const slamResult = slamSurvivalSpeedFor(derived);
  const massT = finite(derived.operationalMass, 0);
  const isWall = massT >= HEAVY_AS_TERRAIN_MASS;
  const slam = {
    id: 'slam_survival',
    speedWuPerS: round(slamResult.speedWuPerS, 0),
    unbreakable: slamResult.unbreakable === true,
    isWall,
    verb: slamResult.unbreakable
      ? 'No rock can break this hull'
      : `Survives rock up to ${round(slamResult.speedWuPerS, 0)} WU/s`,
    sub: isWall
      ? 'and you are the wall now'
      : (slamResult.unbreakable ? 'rock-proof' : `${round(slamResult.speedWuPerS, 0)} WU/s into rock`),
    why: (slamResult.unbreakable
      ? `Rock crumples a hull above ${TERRAIN_CRUMPLE_LAW.threshold} WU/s closing, and the harder it bites the `
        + `lighter you are. At ${round(massT, 0)} t the crumple can never reach `
        + `${round(finite(derived.hullMax, 0), 0)} points of structure at any speed.`
      : `Rock crumples a hull above ${TERRAIN_CRUMPLE_LAW.threshold} WU/s closing, and the harder it bites the `
        + `lighter you are. At ${round(massT, 0)} t, ${round(finite(derived.hullMax, 0), 0)} points of structure `
        + `go at ${round(slamResult.speedWuPerS, 0)} WU/s. Your shields buffer the bill; they do not move the speed.`)
      + (isWall
        ? ` Past ${HEAVY_AS_TERRAIN_MASS} t your hull IS terrain: anything light that meets you takes the wall's arithmetic.`
        : ''),
  };

  const lineLoad = lineLoadSpeedFor(derived);
  const combatSpeed = finite(derived.propulsion && derived.propulsion.combatSpeed, 0);
  const reachable = combatSpeed > 0 ? lineLoad.speedWuPerS <= combatSpeed * 4 : true;
  const line = {
    id: 'line_load',
    speedWuPerS: round(lineLoad.speedWuPerS, 0),
    specialist: lineLoad.specialist === true,
    reachable,
    verb: reachable
      ? `Line holds a ${round(lineLoad.speedWuPerS, 0)} WU/s swing`
      : 'Line holds any swing you can build',
    // When the rating is past anything the hull can reach, printing the figure beside a verb that
    // already says "any swing" only draws the eye to a number that means nothing. The figure stays
    // in the why, where a player who wants it can read it with its geometry.
    sub: reachable ? `${round(lineLoad.speedWuPerS, 0)} WU/s on a 100 m line` : 'past anything you can fly',
    why: `On a ${CAPABILITY_LAW.lineSwingRadiusWu} m line around a heavy anchor your line reaches its rated load at `
      + `${round(lineLoad.speedWuPerS, 0)} WU/s. Everything you carry pulls that number down; a bigger spool pushes it up.`,
  };

  const fieldRow = fieldDeployFor(fittings);
  const field = {
    id: 'field_deploy',
    ...fieldRow,
    verb: fieldRow.available
      ? `Can deploy ${FIELD_KIND_WORD[fieldRow.kind] || 'a field'} ${round(fieldRow.radiusWu, 0)} m across`
      : 'Cannot deploy a field',
    sub: fieldRow.available ? `${round(fieldRow.radiusWu, 0)} m for ${round(fieldRow.durationS, 1)} s` : 'no launcher',
    why: fieldRow.available
      ? `${fieldRow.moduleName} puts ${FIELD_KIND_WORD[fieldRow.kind] || 'a field'} ${round(fieldRow.radiusWu, 0)} m across `
        + `into the water for ${round(fieldRow.durationS, 1)} s, every ${round(fieldRow.cooldownS, 0)} s.`
      : 'Nothing fitted throws a field. Fit a chaff dispenser or an ECM jammer and the countermeasure key does something.',
  };

  return { tow, slam, line, field, rows: [tow, slam, line, field] };
}
