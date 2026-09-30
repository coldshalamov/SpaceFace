// Shared semantic identity for player-facing world interactions.
//
// Entity `type` remains the simulation/save discriminator. These immutable profiles are the common
// presentation and capability vocabulary consumed by mining, drill, massline, scanner/HUD, and VFX
// so a rock-shaped object cannot advertise one identity while behaving as another.

import { COMMODITIES } from './commodities.js';
import { MODULES } from './modules.js';

const profile = (value) => Object.freeze({
  mineable: false,
  drillable: false,
  salvageable: false,
  beamExtractable: false,
  tetherable: false,
  destructible: false,
  hazardous: false,
  beamVerb: null,
  classLabel: null,
  ...value,
});

const PROFILES = Object.freeze({
  asteroid: profile({
    kind: 'asteroid',
    mineable: true,
    drillable: true,
    beamExtractable: true,
    tetherable: true,
    destructible: true,
    beamVerb: 'mine',
  }),
  wreck: profile({
    kind: 'wreck',
    salvageable: true,
    beamExtractable: true,
    tetherable: true,
    destructible: true,
    beamVerb: 'salvage',
  }),
  unstable_reactor_wreck: profile({
    kind: 'unstable_reactor_wreck',
    salvageable: true,
    beamExtractable: true,
    tetherable: true,
    destructible: true,
    hazardous: true,
    beamVerb: 'salvage',
  }),
  ship: profile({ kind: 'ship', tetherable: true, destructible: true }),
  drone: profile({ kind: 'drone', tetherable: true, destructible: true }),
  station: profile({ kind: 'station', tetherable: true, destructible: false }),
  pickup: profile({ kind: 'pickup', tetherable: true, destructible: false, classLabel: 'Loose Cargo' }),
  payload: profile({ kind: 'payload', tetherable: true, destructible: true, classLabel: 'Cargo Mass' }),
  mine: profile({ kind: 'mine', destructible: true, hazardous: true, classLabel: 'Proximity Hazard' }),
  massSeed: profile({ kind: 'massSeed', tetherable: true, destructible: true, classLabel: 'Anchor Device' }),
  beacon: profile({ kind: 'beacon', classLabel: 'Nav Beacon' }),
  charge: profile({ kind: 'charge', destructible: true, hazardous: true, classLabel: 'Ordnance' }),
  bomb: profile({ kind: 'bomb', destructible: true, hazardous: true, classLabel: 'Ordnance' }),
  fauna: profile({ kind: 'fauna', tetherable: true, destructible: true, classLabel: 'Fauna' }),
  derelict: profile({ kind: 'derelict', salvageable: true, tetherable: true, destructible: true, classLabel: 'Derelict' }),
  cache: profile({ kind: 'cache', classLabel: 'Cache' }),
  anomaly: profile({ kind: 'anomaly', classLabel: 'Anomaly' }),
  landmark: profile({ kind: 'landmark', classLabel: 'Landmark' }),
  claim: profile({ kind: 'claim', classLabel: 'Claim Beacon' }),
  fx: profile({ kind: 'fx', classLabel: 'Landmark' }),
  unknown: profile({ kind: 'unknown' }),
});

const ASTEROID_LABELS = Object.freeze({
  ast_common_rock: 'Silicate Asteroid',
  ast_metallic: 'Metallic Asteroid',
  ast_icy: 'Ice Asteroid',
  ast_crystalline: 'Crystalline Asteroid',
  ast_gas_cloud: 'Volatile Asteroid',
  ast_rare_exotic: 'Exotic Asteroid',
});

const KIND_FALLBACK_NAMES = Object.freeze({
  mine: 'Proximity Mine',
  massSeed: 'Anchor Mass Seed',
  beacon: 'Nav Beacon',
  charge: 'Impulse Charge',
  bomb: 'Drift Bomb',
  fauna: 'Fauna',
  derelict: 'Derelict',
  cache: 'Supply Cache',
  anomaly: 'Anomaly',
  landmark: 'Landmark',
  claim: 'Claim Beacon',
});

let cargoNameMaps = null;
function cargoNameFor(data) {
  if (!data) return null;
  const id = typeof data.commodityId === 'string' && data.commodityId ? data.commodityId
    : typeof data.moduleId === 'string' && data.moduleId ? data.moduleId
    : null;
  if (!id) return null;
  if (!cargoNameMaps) {
    cargoNameMaps = {
      commodities: new Map(COMMODITIES.map((c) => [c.id, c.name])),
      modules: new Map(MODULES.map((m) => [m.id, m.name])),
    };
  }
  return cargoNameMaps.commodities.get(id) || cargoNameMaps.modules.get(id) || null;
}

function humanizeTypeSlug(type) {
  if (typeof type !== 'string' || !type) return null;
  const words = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  if (!words) return null;
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function interactionProfileForEntity(entity) {
  if (!entity) return PROFILES.unknown;
  if (entity.type === 'wreck' && isUnstableReactorWreck(entity)) {
    return PROFILES.unstable_reactor_wreck;
  }
  return PROFILES[entity.type] || PROFILES.unknown;
}

export function interactionDisplayName(entity) {
  if (!entity) return 'Unknown Contact';
  const data = entity.data || {};
  const authored = data.scanLabel || data.label || data.name || data.displayName
    || data.callsign || entity.name;
  if (typeof authored === 'string' && authored.trim()) return authored.trim();

  const semantic = interactionProfileForEntity(entity);
  if (semantic.kind === 'unstable_reactor_wreck') return 'Unstable Reactor Wreck';
  if (semantic.kind === 'wreck') return 'Wreckage';
  if (semantic.kind === 'asteroid') return ASTEROID_LABELS[data.typeId] || 'Asteroid';
  if (semantic.kind === 'ship') return 'Ship';
  if (semantic.kind === 'drone') return 'Drone';
  if (semantic.kind === 'station') return data.isGate ? 'Jump Gate' : 'Station';
  if (semantic.kind === 'pickup') {
    const cargo = cargoNameFor(data);
    return cargo || 'Cargo Pickup';
  }
  if (semantic.kind === 'payload') {
    return data.payloadType === 'jettisoned_cargo' ? 'Jettisoned Cargo Pod' : 'Cargo Mass';
  }
  if (semantic.kind === 'fauna') {
    return (typeof data.speciesName === 'string' && data.speciesName) || 'Fauna';
  }
  if (semantic.kind && KIND_FALLBACK_NAMES[semantic.kind]) return KIND_FALLBACK_NAMES[semantic.kind];
  return humanizeTypeSlug(entity.type) || 'Unknown Contact';
}

export function presentationStatusWord(entity) {
  const admission = entity && entity.presentationAdmission;
  if (admission === 'pending') return 'Appearance loading';
  if (admission === 'unavailable') return 'Appearance unavailable';
  return null;
}

export function isUnstableReactorWreck(entity) {
  if (!entity || entity.type !== 'wreck') return false;
  const data = entity.data || {};
  return data.parentType === 'reactor' || !!data.unstableReactor;
}
