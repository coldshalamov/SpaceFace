// BP-07.1 MASS-PERSONALITY.
//
// Pure shipyard/outfitting readout over the LIVE propulsion profile. This helper does not tune
// handling; it exposes the numbers getDerivedStats already hands the flight kernel.
//
// PQ-176.03 (2026-09-12): the four bars used to read the compatibility flight model
// (`derived.flightModel`: angularAccel / inertia / maxSpeed / angularBrake). The default route
// flies the V3 kernel over `derived.propulsion` (AGENTS.md §5), and since PQ-176.00 / PQ-176.01 that is
// the profile the drive, the thruster bay and the mass law move — so the screen said "top speed
// 145" for a hull that fights at 84 and travels at 470, and nothing a player fitted moved a bar.
// The bars now read the profile the ship actually flies, with the compatibility model only as a
// fallback for a hull that has none.
import { SHIPS } from '../../data/ships.js';
import { getDerivedStats } from '../../systems/ships.js';
import { getPropulsionProfile } from '../../core/flight/propulsionCatalog.js';

// The propulsion families name their numbers differently (a reaction drive has `reverseAccel` and
// `combatSpeed`; an interceptor profile has `maxBrakeAccel` and `maxSpeed`; a freighter has
// `rcsReverseAccel`), so each axis carries the chain of live keys it accepts, first hit wins.
export const HANDLING_PROFILE_AXES = Object.freeze([
  // yaw authority: what the thruster bay and the load do to how fast the nose comes round
  Object.freeze({ id: 'agility', label: 'Agility', field: 'yawAccel', fields: Object.freeze(['yawAccel']), fallback: 'angularAccel', higherMeans: 'snappier' }),
  // the operational mass the kernel integrates (hull + modules + cargo)
  Object.freeze({ id: 'inertia', label: 'Inertia', field: 'mass', fields: Object.freeze(['mass']), fallback: 'inertia', higherMeans: 'heavier' }),
  // the drive's travel ceiling: where a fitted drive's speed actually lands
  Object.freeze({ id: 'topSpeed', label: 'Top speed', field: 'travelCeiling', fields: Object.freeze(['travelCeiling', 'maxSpeed']), fallback: 'maxSpeed', higherMeans: 'faster' }),
  // reverse thrust: what stops you
  Object.freeze({ id: 'brake', label: 'Brake', field: 'reverseAccel', fields: Object.freeze(['reverseAccel', 'maxBrakeAccel', 'brakeAccel', 'rcsReverseAccel']), fallback: 'angularBrake', higherMeans: 'shorter stop' }),
]);

/** The speed the profile fights at, by family. */
const FIGHT_SPEED_FIELDS = Object.freeze(['combatSpeed', 'maxSpeed', 'precisionSpeed']);

const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));

function firstLive(propulsion, fields) {
  if (!propulsion) return { value: NaN, field: null };
  for (const field of fields) {
    const value = finite(propulsion[field], NaN);
    if (Number.isFinite(value)) return { value, field };
  }
  return { value: NaN, field: null };
}

/** The live key an axis actually read for this profile, or null when it fell back to the compatibility model. */
export function handlingAxisSource(derived, axis) {
  const propulsion = derived && derived.propulsion;
  if (!propulsion) return null;
  if (axis.field === 'mass') {
    const live = finite(propulsion.mass, NaN);
    if (Number.isFinite(live) && live > 0) return 'propulsion.mass';
    return Number.isFinite(finite(derived.operationalMass, NaN)) ? 'derived.operationalMass' : null;
  }
  const hit = firstLive(propulsion, axis.fields || [axis.field]);
  return hit.field ? `propulsion.${hit.field}` : null;
}

/** The number an axis reads for one derived profile: live propulsion first, compatibility model as the fallback. */
export function handlingAxisValue(derived, axis) {
  const propulsion = derived && derived.propulsion;
  if (axis.field === 'mass') {
    const live = propulsion && finite(propulsion.mass, NaN);
    if (Number.isFinite(live) && live > 0) return live;
    const operational = finite(derived && derived.operationalMass, NaN);
    if (Number.isFinite(operational) && operational > 0) return operational;
    const mass = finite(derived && derived.mass, NaN);
    if (Number.isFinite(mass) && mass > 0) return mass;
  } else {
    const hit = firstLive(propulsion, axis.fields || [axis.field]);
    if (Number.isFinite(hit.value)) return hit.value;
  }
  const model = derived && derived.flightModel;
  return finite(model && model[axis.fallback], 0);
}

export function handlingProfileDomain(shipIds = SHIPS.map((shipDef) => shipDef.id)) {
  const rows = shipIds.map((shipId) => derivedFor(shipId)).filter(Boolean);
  const domain = {};
  for (const axis of HANDLING_PROFILE_AXES) {
    const values = rows.map((row) => handlingAxisValue(row, axis));
    const min = Math.min(...values);
    const max = Math.max(...values);
    domain[axis.id] = Object.freeze({ field: axis.field, min, max });
  }
  return Object.freeze(domain);
}

export function handlingProfileForShip(shipId, options = {}) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;

  const derived = getDerivedStats(shipId, options.fittings || [], options.player || null);
  const model = derived.flightModel || {};
  const propulsion = derived.propulsion || null;
  const domain = options.domain || handlingProfileDomain();
  const drive = getPropulsionProfile(shipDef.driveId) || null;
  const axes = HANDLING_PROFILE_AXES.map((axis) => {
    const raw = handlingAxisValue(derived, axis);
    const bounds = domain[axis.id] || { min: raw, max: raw };
    const liveSource = handlingAxisSource(derived, axis);
    return Object.freeze({
      id: axis.id,
      label: axis.label,
      source: liveSource || `flightModel.${axis.fallback}`,
      raw,
      bar: normalize(raw, bounds.min, bounds.max),
      higherMeans: axis.higherMeans,
    });
  });
  // What the profile predicts before the player commits (PQ-176.03): the speed the ship fights
  // at, the speed it travels at, how long a full reversal takes under its own reverse thrust,
  // and the turn radius at fight speed. The radius is the one the flight checks already use:
  // governed fight speed divided by the yaw-rate ceiling on this same profile (combatSpeed /
  // maxYawRate). Both numbers are the derived profile the bars read. The player feel envelope
  // scales yaw only later, inside flight, and this helper does not reach in there.
  const combatSpeed = firstLive(propulsion, FIGHT_SPEED_FIELDS).value;
  const travelCeiling = firstLive(propulsion, ['travelCeiling', 'maxSpeed']).value;
  const reverseAccel = firstLive(propulsion, HANDLING_PROFILE_AXES[3].fields).value;
  const maxYawRate = firstLive(propulsion, ['maxYawRate']).value;
  const predictions = Object.freeze({
    combatSpeed: Number.isFinite(combatSpeed) ? combatSpeed : null,
    travelCeiling: Number.isFinite(travelCeiling) ? travelCeiling : null,
    reversalTimeS: Number.isFinite(combatSpeed) && Number.isFinite(reverseAccel) && reverseAccel > 0
      ? round3((2 * combatSpeed) / reverseAccel)
      : null,
    maxYawRate: Number.isFinite(maxYawRate) ? maxYawRate : null,
    turnRadiusWu: Number.isFinite(combatSpeed) && combatSpeed > 0 && Number.isFinite(maxYawRate) && maxYawRate > 0
      ? round3(combatSpeed / maxYawRate)
      : null,
    massLoadFactor: propulsion ? finite(propulsion.massLoadFactor, 1) : 1,
  });

  return Object.freeze({
    shipId: shipDef.id,
    name: shipDef.name,
    role: shipDef.role || 'ship',
    driveId: shipDef.driveId || null,
    driveFamily: drive && drive.family || null,
    driveLabel: drive && drive.label || null,
    flightClass: model.flightClass || derived.flightClass || 'scout',
    axes: Object.freeze(axes),
    predictions,
    fingerprint: axes.map((axis) => `${axis.id}:${round3(axis.raw)}`).join('|'),
  });
}

export function handlingProfilesForShips(shipIds = SHIPS.map((shipDef) => shipDef.id), options = {}) {
  const domain = options.domain || handlingProfileDomain(shipIds);
  return Object.freeze(shipIds
    .map((shipId) => handlingProfileForShip(shipId, { ...options, domain }))
    .filter(Boolean));
}

function derivedFor(shipId) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  return getDerivedStats(shipId, [], null) || null;
}

function normalize(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 50;
  return Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round3(value) {
  return Math.round(finite(value, 0) * 1000) / 1000;
}
