// BP-07.1 MASS-PERSONALITY.
//
// Pure shipyard/outfitting readout over the shipped flight model. This helper
// does not tune handling; it exposes the fields getDerivedStats already gives to
// the runtime controller.
import { SHIPS } from '../../data/ships.js';
import { getDerivedStats } from '../../systems/ships.js';
import { getPropulsionProfile } from '../../core/flight/propulsionCatalog.js';

export const HANDLING_PROFILE_AXES = Object.freeze([
  Object.freeze({ id: 'agility', label: 'Agility', field: 'angularAccel', higherMeans: 'snappier' }),
  Object.freeze({ id: 'inertia', label: 'Inertia', field: 'inertia', higherMeans: 'heavier' }),
  Object.freeze({ id: 'topSpeed', label: 'Top speed', field: 'maxSpeed', higherMeans: 'faster' }),
  Object.freeze({ id: 'brake', label: 'Brake', field: 'angularBrake', higherMeans: 'tighter' }),
]);

const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));

export function handlingProfileDomain(shipIds = SHIPS.map((shipDef) => shipDef.id)) {
  const rows = shipIds.map((shipId) => flightModelFor(shipId)).filter(Boolean);
  const domain = {};
  for (const axis of HANDLING_PROFILE_AXES) {
    const values = rows.map((row) => finite(row[axis.field], 0));
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
  const domain = options.domain || handlingProfileDomain();
  const drive = getPropulsionProfile(shipDef.driveId) || null;
  const axes = HANDLING_PROFILE_AXES.map((axis) => {
    const raw = finite(model[axis.field], 0);
    const bounds = domain[axis.id] || { min: raw, max: raw };
    return Object.freeze({
      id: axis.id,
      label: axis.label,
      source: `flightModel.${axis.field}`,
      raw,
      bar: normalize(raw, bounds.min, bounds.max),
      higherMeans: axis.higherMeans,
    });
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
    fingerprint: axes.map((axis) => `${axis.id}:${round3(axis.raw)}`).join('|'),
  });
}

export function handlingProfilesForShips(shipIds = SHIPS.map((shipDef) => shipDef.id), options = {}) {
  const domain = options.domain || handlingProfileDomain(shipIds);
  return Object.freeze(shipIds
    .map((shipId) => handlingProfileForShip(shipId, { ...options, domain }))
    .filter(Boolean));
}

function flightModelFor(shipId) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  const derived = getDerivedStats(shipId, [], null);
  return derived.flightModel || null;
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
