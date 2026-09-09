// Scenario entity profile resolution: aliases → production ship ids / asteroid specs /
// enemy archetypes. There is no ship.starter / asteroid.heavy / enemy.* registry in
// production data — this module owns the mapping for lab scenarios.
// Enemy entities always go through makeEnemySpawnSpec (the live combat spawn builder).

import { SHIPS } from '../../data/ships.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../systems/ships.js';
import { makeEnemySpawnSpec } from '../../systems/combat.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((e) => [e.id, e]));

/** Override keys the enemy spawn branch actually applies. Unknown keys must not be ignored. */
const ENEMY_OVERRIDE_KEYS = Object.freeze(['dynamic', 'hull', 'level', 'mass', 'radius']);

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
  // Direct ENEMY_TYPES id (e.g. wasp_swarmer) — same convention as ship_*.
  if (ENEMY_BY_ID.has(profileId)) {
    return {
      kind: 'enemy',
      enemyTypeId: profileId,
      profileId,
    };
  }
  // Namespaced alias enemy.<id> (parallel to ship.kestrel vs ship_kestrel).
  if (profileId.startsWith('enemy.')) {
    const enemyTypeId = profileId.slice('enemy.'.length);
    if (ENEMY_BY_ID.has(enemyTypeId)) {
      return {
        kind: 'enemy',
        enemyTypeId,
        profileId,
      };
    }
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

  if (profile.kind === 'enemy') {
    const unhandled = Object.keys(overrides).filter((key) => !ENEMY_OVERRIDE_KEYS.includes(key)).sort();
    if (unhandled.length) {
      throw new Error(
        `unhandled enemy override key(s) for ${profile.enemyTypeId}: ${unhandled.join(', ')}`,
      );
    }
    const level = Number.isFinite(overrides.level) ? overrides.level : undefined;
    const pos = { x: entity.pos.x, z: entity.pos.z };
    const spec = makeEnemySpawnSpec(profile.enemyTypeId, level, pos, {
      factionId: entity.factionId || undefined,
    });
    if (!spec) {
      throw new Error(`makeEnemySpawnSpec failed for ${profile.enemyTypeId}`);
    }
    // compileSimScenario writes team: e.team ?? 0. A compiled 0 must not overwrite the
    // builder's hostile team — that would spawn a friend (scanner treats team 0 as allied).
    if (Number.isFinite(entity.team) && entity.team !== 0) spec.team = entity.team;
    if (Number.isFinite(entity.heading)) spec.rot = entity.heading;
    spec.data = spec.data || {};
    spec.data.ai = spec.data.ai || {};
    // Live Combat Lab / sandbox stamps this after makeEnemySpawnSpec. Without it a spawned
    // hostile never becomes hostile and every combat claim built on the scenario is worthless.
    spec.data.ai.spawnContext = 'encounter';
    spec.data.scenarioRole = entity.role || entity.alias;
    spec.data.scenarioAlias = entity.alias;
    spec.data.labProfile = profile.profileId;
    if (entity.persistent !== false) {
      spec.flags = { ...(spec.flags || {}), persistent: true };
    }
    if (Number.isFinite(overrides.mass)) spec.mass = overrides.mass;
    if (Number.isFinite(overrides.radius)) spec.radius = overrides.radius;
    if (Number.isFinite(overrides.hull)) spec.hull = overrides.hull;
    spec.physicsBody = {
      ...(spec.physicsBody || {}),
      dynamic: overrides.dynamic !== false,
    };
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
  const ids = new Set(Object.keys(ENTITY_PROFILE_REGISTRY));
  for (const enemy of ENEMY_TYPES) {
    if (!enemy || typeof enemy.id !== 'string' || !enemy.id) continue;
    ids.add(enemy.id);
    ids.add(`enemy.${enemy.id}`);
  }
  return [...ids].sort();
}
