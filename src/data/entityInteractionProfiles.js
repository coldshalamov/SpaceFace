// Shared semantic identity for player-facing world interactions.
//
// Entity `type` remains the simulation/save discriminator. These immutable profiles are the common
// presentation and capability vocabulary consumed by mining, drill, massline, scanner/HUD, and VFX
// so a rock-shaped object cannot advertise one identity while behaving as another.

const profile = (value) => Object.freeze({
  mineable: false,
  drillable: false,
  salvageable: false,
  beamExtractable: false,
  tetherable: false,
  destructible: false,
  hazardous: false,
  beamVerb: null,
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
  pickup: profile({ kind: 'pickup', tetherable: true, destructible: false }),
  payload: profile({ kind: 'payload', tetherable: true, destructible: true }),
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
  const authored = data.scanLabel || data.label || data.name;
  if (typeof authored === 'string' && authored.trim()) return authored.trim();

  const semantic = interactionProfileForEntity(entity);
  if (semantic.kind === 'unstable_reactor_wreck') return 'Unstable Reactor Wreck';
  if (semantic.kind === 'wreck') return 'Wreckage';
  if (semantic.kind === 'asteroid') return ASTEROID_LABELS[data.typeId] || 'Asteroid';
  if (semantic.kind === 'ship') return 'Ship';
  if (semantic.kind === 'drone') return 'Drone';
  if (semantic.kind === 'station') return 'Station';
  if (semantic.kind === 'pickup') return 'Cargo Pickup';
  if (semantic.kind === 'payload') return 'Payload';
  return 'Unknown Contact';
}

export function isUnstableReactorWreck(entity) {
  if (!entity || entity.type !== 'wreck') return false;
  const data = entity.data || {};
  return data.parentType === 'reactor' || !!data.unstableReactor;
}
