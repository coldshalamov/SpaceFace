// Scenario entity profile resolution: aliases → production ship ids / asteroid specs.
// There is no ship.starter / asteroid.heavy registry in production data — this module owns
// the mapping for lab scenarios.

import { SHIPS } from '../../data/ships.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../systems/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

/** Stable profile ids used in scenario JSON. */
export const ENTITY_PROFILE_REGISTRY = Object.freeze({
  'ship.starter': {
    kind: 'ship',
    shipId: NEW_GAME.shipId || 'ship_kestrel',
    defaultModules: NEW_GAME.fittedModules || [],
  },
  'ship.kestrel': {
    kind: 'ship',
    shipId: 'ship_kestrel',
    defaultModules: NEW_GAME.fittedModules || [],
  },
  'asteroid.heavy': {
    kind: 'asteroid',
    radius: 6,
    mass: 400,
    type: 'payload',
  },
  'asteroid.light': {
    kind: 'asteroid',
    radius: 5,
    mass: 200,
    type: 'payload',
  },
  'asteroid.mid': {
    kind: 'asteroid',
    radius: 6,
    mass: 400,
    type: 'payload',
  },
  'payload.anchor': {
    kind: 'asteroid',
    radius: 6,
    mass: 400,
    type: 'payload',
  },
});

/**
 * Resolve a scenario profile id (or direct ship_* id) to a builder description.
 * @param {string} profileId
 */
export function resolveEntityProfile(profileId) {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error('entity profile id is required');
  }
  if (ENTITY_PROFILE_REGISTRY[profileId]) {
    return { ...ENTITY_PROFILE_REGISTRY[profileId], profileId };
  }
  if (profileId.startsWith('ship_') && SHIP_BY_ID.has(profileId)) {
    return {
      kind: 'ship',
      shipId: profileId,
      defaultModules: [],
      profileId,
    };
  }
  // Direct asteroid.spec:radius:mass
  if (profileId.startsWith('asteroid.spec:')) {
    const parts = profileId.split(':');
    const radius = Number(parts[1]);
    const mass = Number(parts[2]);
    if (!Number.isFinite(radius) || !Number.isFinite(mass)) {
      throw new Error(`invalid asteroid.spec profile: ${profileId}`);
    }
    return { kind: 'asteroid', radius, mass, type: 'payload', profileId };
  }
  throw new Error(`unknown entity profile: ${profileId}`);
}

/**
 * Build a spawnable entity spec from a compiled entity + resolved profile.
 * @param {object} entity compiled entity row
 * @param {object} state game state (for player fittings)
 * @param {object} [opts]
 */
export function buildEntitySpawnSpec(entity, state, opts = {}) {
  const profile = resolveEntityProfile(entity.profile);
  const overrides = entity.overrides || {};

  if (profile.kind === 'ship') {
    const modules = Array.isArray(entity.loadout)
      ? entity.loadout
      : (entity.loadout && Array.isArray(entity.loadout.modules)
        ? entity.loadout.modules
        : profile.defaultModules);
    const fittings = fittingsFromDefaultModules(profile.shipId, modules || []);
    const spec = makeShipEntitySpec(profile.shipId, {
      team: entity.team ?? 0,
      factionId: entity.factionId || (entity.isPlayer ? 'faction_free' : null),
      isPlayer: !!entity.isPlayer,
      player: entity.isPlayer ? state.player : null,
      fittings,
      pos: { x: entity.pos.x, z: entity.pos.z },
      rot: entity.heading || 0,
    });
    if (entity.persistent !== false) {
      spec.flags = { ...(spec.flags || {}), persistent: true };
    }
    if (Number.isFinite(overrides.mass)) spec.mass = overrides.mass;
    if (Number.isFinite(overrides.radius)) spec.radius = overrides.radius;
    if (Number.isFinite(overrides.hull)) spec.hull = overrides.hull;
    return { spec, profile, seedVel: entity.vel, angularVelocity: entity.angularVelocity };
  }

  const radius = Number.isFinite(overrides.radius) ? overrides.radius : profile.radius;
  const mass = Number.isFinite(overrides.mass) ? overrides.mass : profile.mass;
  const spec = {
    type: profile.type || 'payload',
    team: entity.team ?? 2,
    factionId: entity.factionId || null,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x || 0, z: entity.vel.z || 0 },
    rot: entity.heading || 0,
    radius,
    mass,
    collides: true,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: mass * 8,
      dynamic: overrides.dynamic !== false,
      ccd: false,
      material: 'payload',
      revision: 0,
    },
    data: {
      scenarioRole: entity.role || entity.alias,
      scenarioAlias: entity.alias,
      labProfile: profile.profileId,
    },
    flags: entity.persistent !== false ? { persistent: true } : {},
  };
  return { spec, profile, seedVel: entity.vel, angularVelocity: entity.angularVelocity };
}

export function listEntityProfiles() {
  return Object.keys(ENTITY_PROFILE_REGISTRY).sort();
}
