// Depth Program R2 — fitted-only runtime verbs for named salvage variants.
//
// The item catalogs remain data authority. This system supplies only the behavior that cannot be
// expressed as an ordinary derived stat: encounter-limited reactions, real split projectiles,
// whole-wreck tractor commands, out-of-combat repair, and each unique variant's positive power
// premium over its base family. Ownership in inventory is intentionally irrelevant; every gate
// reads the current live player entity's data.fittings through core/fittedModules.js.

import { scalarHitToDamagePacket } from '../combat/damage.js';
import { fittedModuleDefs, hasFittedModule } from '../core/fittedModules.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';

export const UNIQUE_LOOT_ABILITY_STATE_VERSION = 1;
export const PALE_COIL_BLINK_DISTANCE = 240;
export const CHOIR_BELL_KNOCKBACK_SPEED = 420;
export const NESTBREAKER_SUBMUNITION_DAMAGE = 49;
export const NESTBREAKER_DIVERGENCE_RAD = 3 * Math.PI / 180;
export const TIDELINE_MAGNET_RANGE = 720;
export const TIDELINE_MAGNET_ACCEL = 520;
export const TIDELINE_SMALL_WRECK_MAX_RADIUS = 9;
export const KNITBOTS_REPAIR_RATE = 4.4;
export const KNITBOTS_OOC_DELAY_S = 5;

const PALE_COIL_ID = 'unique_pale_coil_warp_drive';
const CHOIR_BELL_ID = 'unique_choir_bell_aegis';
const NESTBREAKER_ID = 'unique_nestbreaker_rack';
const TIDELINE_ID = 'unique_tideline_tractor';
const KNITBOTS_ID = 'unique_knitbots';
const BASE_PICKUP_MAGNET_RANGE = 420;
const NESTBREAKER_SEPARATION = 1.4;
const MAX_ENCOUNTER_RECORDS = 64;
const EQUIPMENT_BY_ID = new Map(
  [...MODULES, ...WEAPONS].map((definition) => [definition.id, definition]),
);

export function createUniqueLootAbilityState() {
  return {
    schemaVersion: UNIQUE_LOOT_ABILITY_STATE_VERSION,
    sequence: 0,
    encounters: {},
  };
}

export function normalizeUniqueLootAbilityState(value) {
  const normalized = createUniqueLootAbilityState();
  normalized.sequence = nonNegativeInt(value?.sequence);
  const source = value?.encounters;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return normalized;

  const rows = [];
  for (const [rawId, rawRecord] of Object.entries(source)) {
    const encounterId = safeEncounterId(rawId);
    if (!encounterId || !rawRecord || typeof rawRecord !== 'object') continue;
    rows.push({
      encounterId,
      record: {
        active: !!rawRecord.active,
        paleCoilUsed: !!rawRecord.paleCoilUsed,
        choirBellUsed: !!rawRecord.choirBellUsed,
        order: nonNegativeInt(rawRecord.order),
        openedAt: finite(rawRecord.openedAt),
        resolvedAt: finite(rawRecord.resolvedAt, null),
      },
    });
  }
  rows.sort((a, b) => a.record.order - b.record.order
    || a.encounterId.localeCompare(b.encounterId));
  for (const row of rows.slice(-MAX_ENCOUNTER_RECORDS)) {
    normalized.encounters[row.encounterId] = row.record;
    normalized.sequence = Math.max(normalized.sequence, row.record.order);
  }
  return normalized;
}

/** Sum only the positive continuous-power surcharge of fitted unique variants over their bases. */
export function fittedUniqueEnergyPremium(state) {
  let total = 0;
  for (const definition of fittedModuleDefs(state)) {
    if (!definition?.unique || typeof definition.baseId !== 'string') continue;
    const base = EQUIPMENT_BY_ID.get(definition.baseId);
    if (!base) continue;
    const premium = finite(definition.energyDraw) - finite(base.energyDraw);
    if (premium > 0) total += premium;
  }
  return total;
}

export function isTidelineWholeWreckEligible(entity) {
  if (!entity || entity.alive === false || entity.type !== 'wreck') return false;
  if (!(finite(entity.radius) > 0 && entity.radius <= TIDELINE_SMALL_WRECK_MAX_RADIUS)) return false;
  const data = entity.data;
  if (!data || typeof data !== 'object') return false;
  if (!data.salvagePool || typeof data.salvagePool !== 'object') return false;
  if (data.uniqueWreckId || data.authoredWreckId || data.wreckMissionId || data.recoveryEncounterId) return false;
  if (data.unique || data.onboarding || data.isCommunicator || data.kind === 'derelict') return false;
  return true;
}

export const uniqueLootAbilities = {
  name: 'uniqueLootAbilities',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._nearbyScratch = [];
    ensureAbilityState(this.state);

    this._unsubscribers = [
      this.bus.on('encounter:spawned', (payload) => this._onEncounterSpawned(payload)),
      this.bus.on('encounter:resolved', (payload) => this._onEncounterResolved(payload)),
      this.bus.on('ship:dash', (payload) => this._onShipDash(payload)),
      this.bus.on('entity:spawned', (payload) => this._onEntitySpawned(payload)),
      this.bus.on('save:loaded', () => {
        this.state.player.uniqueLootAbilities = normalizeUniqueLootAbilityState(
          this.state.player.uniqueLootAbilities,
        );
      }),
    ];
  },

  newGame() {
    if (this.state?.player) this.state.player.uniqueLootAbilities = createUniqueLootAbilityState();
  },

  update(dt, state) {
    const player = livePlayer(state);
    if (!player || player.alive === false) return;

    // Restored missiles or a future target-acquisition path may not pass through entity:spawned
    // while their encounter is active. The marker makes this deterministic fallback idempotent.
    if (state.mode === 'flight' && hasFittedModule(state, CHOIR_BELL_ID)) {
      const projectiles = state.entityIndex?.projectiles || state.entityList || [];
      for (const projectile of projectiles) this._tryChoirBellDeflection(projectile, player);
    }

    if (state.mode === 'flight') {
      this._updateTideline(dt, state, player);
      this._drainUniqueEnergyPremium(dt, state, player);
    }
    this._updateKnitbots(dt, state, player);
  },

  _onEncounterSpawned(payload) {
    const encounterId = safeEncounterId(payload?.encounterId);
    if (!encounterId) return;
    const abilityState = ensureAbilityState(this.state);
    let record = abilityState.encounters[encounterId];
    if (!record) {
      record = {
        active: false,
        paleCoilUsed: false,
        choirBellUsed: false,
        order: 0,
        openedAt: 0,
        resolvedAt: null,
      };
      abilityState.encounters[encounterId] = record;
    }
    record.active = true;
    record.order = ++abilityState.sequence;
    record.openedAt = finite(this.state.simTime);
    record.resolvedAt = null;
    trimEncounterRecords(abilityState);
  },

  _onEncounterResolved(payload) {
    const encounterId = safeEncounterId(payload?.encounterId);
    const record = encounterId && ensureAbilityState(this.state).encounters[encounterId];
    if (!record) return;
    record.active = false;
    record.resolvedAt = finite(this.state.simTime);
  },

  _onShipDash(payload) {
    const player = livePlayer(this.state);
    if (!player || payload?.shipId !== player.id) return;
    if (!hasFittedModule(this.state, PALE_COIL_ID)) return;
    const selected = newestUnusedEncounter(ensureAbilityState(this.state), 'paleCoilUsed');
    if (!selected) return;

    selected.record.paleCoilUsed = true;
    const from = { x: finite(player.pos?.x), z: finite(player.pos?.z) };
    const heading = finite(player.rot);
    player.pos.x = from.x + Math.cos(heading) * PALE_COIL_BLINK_DISTANCE;
    player.pos.z = from.z + Math.sin(heading) * PALE_COIL_BLINK_DISTANCE;
    player.flags = player.flags || {};
    player.flags.noInterp = true;
    this.bus.emit('uniqueLoot:paleCoilBlink', {
      shipId: player.id,
      encounterId: selected.encounterId,
      coordSpace: 'global_v1',
      from,
      to: { x: player.pos.x, z: player.pos.z },
      distance: PALE_COIL_BLINK_DISTANCE,
    });
  },

  _onEntitySpawned(payload) {
    const entity = payload?.entity;
    if (!entity || entity.alive === false || entity.type !== 'projectile') return;
    this._splitNestbreaker(entity);
    const player = livePlayer(this.state);
    if (player && hasFittedModule(this.state, CHOIR_BELL_ID)) {
      this._tryChoirBellDeflection(entity, player);
    }
  },

  _splitNestbreaker(projectile) {
    const data = projectile.data;
    if (!data || data.kind !== 'missile' || data.weaponId !== NESTBREAKER_ID) return;
    if (data.nestbreakerSubmunition != null) return;
    const ownerId = data.ownerId ?? projectile.ownerId;
    if (ownerId !== this.state.playerId || !hasFittedModule(this.state, NESTBREAKER_ID)) return;
    if (typeof this.helpers?.spawnEntity !== 'function') return;

    const speed = Math.hypot(finite(projectile.vel?.x), finite(projectile.vel?.z));
    const baseAngle = speed > 1e-6
      ? Math.atan2(projectile.vel.z, projectile.vel.x)
      : finite(projectile.rot);
    const perpendicularX = -Math.sin(baseAngle);
    const perpendicularZ = Math.cos(baseAngle);
    const center = { x: finite(projectile.pos?.x), z: finite(projectile.pos?.z) };
    const firstAngle = baseAngle - NESTBREAKER_DIVERGENCE_RAD;
    const secondAngle = baseAngle + NESTBREAKER_DIVERGENCE_RAD;
    const launchSpeed = speed > 1e-6 ? speed : Math.max(1, finite(data.projSpeed, 320));

    projectile.pos.x = center.x - perpendicularX * NESTBREAKER_SEPARATION * 0.5;
    projectile.pos.z = center.z - perpendicularZ * NESTBREAKER_SEPARATION * 0.5;
    projectile.vel.x = Math.cos(firstAngle) * launchSpeed;
    projectile.vel.z = Math.sin(firstAngle) * launchSpeed;
    projectile.rot = firstAngle;
    projectile.data = nestbreakerData(data, 1, projectile.pos);

    const childPos = {
      x: center.x + perpendicularX * NESTBREAKER_SEPARATION * 0.5,
      z: center.z + perpendicularZ * NESTBREAKER_SEPARATION * 0.5,
    };
    this.helpers.spawnEntity({
      type: 'projectile',
      pos: childPos,
      vel: { x: Math.cos(secondAngle) * launchSpeed, z: Math.sin(secondAngle) * launchSpeed },
      rot: secondAngle,
      radius: projectile.radius,
      mass: projectile.mass,
      team: projectile.team,
      ownerId: projectile.ownerId,
      factionId: projectile.factionId,
      ttl: projectile.ttl,
      collides: projectile.collides,
      collisionMask: projectile.collisionMask,
      data: nestbreakerData(data, 2, childPos),
    });
    this.bus.emit('uniqueLoot:nestbreakerSplit', {
      ownerId,
      sourceProjectileId: projectile.id,
      count: 2,
      damageEach: NESTBREAKER_SUBMUNITION_DAMAGE,
    });
  },

  _tryChoirBellDeflection(projectile, player) {
    const data = projectile?.data;
    if (!projectile || projectile.alive === false || projectile.type !== 'projectile') return false;
    if (!data || data.kind !== 'missile' || data.targetId !== player.id || data.choirBellDeflected) return false;
    const encounterId = missileEncounterId(projectile, this.state);
    const record = encounterId && ensureAbilityState(this.state).encounters[encounterId];
    if (!record?.active || record.choirBellUsed) return false;

    const toPlayerX = finite(player.pos?.x) - finite(projectile.pos?.x);
    const toPlayerZ = finite(player.pos?.z) - finite(projectile.pos?.z);
    const velocityX = finite(projectile.vel?.x);
    const velocityZ = finite(projectile.vel?.z);
    if (velocityX * toPlayerX + velocityZ * toPlayerZ <= 0) return false;

    let awayX = -toPlayerX;
    let awayZ = -toPlayerZ;
    let distance = Math.hypot(awayX, awayZ);
    if (distance <= 1e-6) {
      awayX = -velocityX;
      awayZ = -velocityZ;
      distance = Math.hypot(awayX, awayZ) || 1;
    }
    awayX /= distance;
    awayZ /= distance;
    const speed = Math.hypot(velocityX, velocityZ);
    const outwardSpeed = Math.max(speed, CHOIR_BELL_KNOCKBACK_SPEED);
    const desiredX = awayX * outwardSpeed;
    const desiredZ = awayZ * outwardSpeed;
    const mass = positive(projectile.physicsBody?.mass, positive(projectile.mass, 1));

    record.choirBellUsed = true;
    data.targetId = null;
    data.turnRate = 0;
    data.choirBellDeflected = true;
    data.choirBellEncounterId = encounterId;
    queuePhysicsImpulse(projectile, {
      x: (desiredX - velocityX) * mass,
      y: 0,
      z: (desiredZ - velocityZ) * mass,
    });
    this.bus.emit('uniqueLoot:choirBellPulse', {
      shipId: player.id,
      projectileId: projectile.id,
      encounterId,
      impulseVelocity: { x: desiredX - velocityX, z: desiredZ - velocityZ },
    });
    return true;
  },

  _updateTideline(dt, state, player) {
    if (!hasFittedModule(state, TIDELINE_ID)) return;
    // Wreck-only unique: ordinary ore pickups are owned by mining.playerPickupMagnetRange once
    // the fitted tractor scoop outranges this unique's old pickup annulus.
    const nearby = queryNearbyEntities(
      state,
      player.pos,
      TIDELINE_MAGNET_RANGE,
      this._nearbyScratch,
      state.entityList,
    );
    for (const entity of nearby) {
      if (!entity || entity.alive === false || entity.id === player.id) continue;
      if (entity.type === 'pickup') continue;
      if (!isTidelineWholeWreckEligible(entity)) continue;
      const dx = finite(player.pos?.x) - finite(entity.pos?.x);
      const dz = finite(player.pos?.z) - finite(entity.pos?.z);
      const distance = Math.hypot(dx, dz);
      if (!(distance > 1e-6 && distance <= TIDELINE_MAGNET_RANGE)) continue;
      queueTractorImpulse(entity, dx / distance, dz / distance, dt);
    }
  },

  _updateKnitbots(dt, state, player) {
    if (!hasFittedModule(state, KNITBOTS_ID)) return;
    if (!(Number.isFinite(player.hull) && Number.isFinite(player.hullMax) && player.hull < player.hullMax)) return;
    const sinceDamage = finite(state.simTime) - finite(player.lastDamageT, -1e9);
    if (sinceDamage < KNITBOTS_OOC_DELAY_S) return;
    player.hull = Math.min(player.hullMax, player.hull + KNITBOTS_REPAIR_RATE * dt);
    // No docked-drone mutation lives here. Automation groups are deployed records, and recall
    // removes them; inventing a repairable docked hull would create false persistence semantics.
  },

  _drainUniqueEnergyPremium(dt, state, player) {
    const premium = fittedUniqueEnergyPremium(state);
    if (!(premium > 0) || !Number.isFinite(player.cap)) return;
    player.cap = Math.max(0, player.cap - premium * dt);
  },

  serialize() {
    return normalizeUniqueLootAbilityState(ensureAbilityState(this.state));
  },

  deserialize(data) {
    if (this.state?.player) {
      this.state.player.uniqueLootAbilities = normalizeUniqueLootAbilityState(data);
    }
  },

  dispose() {
    for (const unsubscribe of this._unsubscribers || []) unsubscribe();
    this._unsubscribers = [];
    this._nearbyScratch = [];
  },
};

function ensureAbilityState(state) {
  if (!state.player) state.player = {};
  const current = state.player.uniqueLootAbilities;
  if (!current || typeof current !== 'object'
    || current.schemaVersion !== UNIQUE_LOOT_ABILITY_STATE_VERSION
    || !current.encounters || typeof current.encounters !== 'object') {
    state.player.uniqueLootAbilities = normalizeUniqueLootAbilityState(current);
  }
  return state.player.uniqueLootAbilities;
}

function livePlayer(state) {
  return state?.entities?.get?.(state.playerId) || null;
}

function newestUnusedEncounter(abilityState, key) {
  let selected = null;
  for (const [encounterId, record] of Object.entries(abilityState.encounters)) {
    if (!record.active || record[key]) continue;
    if (!selected || record.order > selected.record.order
      || (record.order === selected.record.order && encounterId < selected.encounterId)) {
      selected = { encounterId, record };
    }
  }
  return selected;
}

function missileEncounterId(projectile, state) {
  const direct = safeEncounterId(projectile?.data?.encounterId);
  if (direct) return direct;
  const ownerId = projectile?.data?.ownerId ?? projectile?.ownerId;
  const owner = state?.entities?.get?.(ownerId);
  return safeEncounterId(owner?.data?.ai?.encounterId || owner?.data?.encounterId);
}

function nestbreakerData(source, index, pos) {
  const data = clonePlain(source);
  data.nestbreakerSubmunition = index;
  data.damage = NESTBREAKER_SUBMUNITION_DAMAGE;
  data.damagePacket = scalarHitToDamagePacket({
    damage: NESTBREAKER_SUBMUNITION_DAMAGE,
    damageType: data.damageType || 'explosive',
    source: { kind: 'weapon', weaponId: NESTBREAKER_ID },
  });
  data.spawnPos = { x: finite(pos?.x), z: finite(pos?.z) };
  return data;
}

function queueTractorImpulse(entity, directionX, directionZ, dt) {
  const mass = positive(entity.physicsBody?.mass, positive(entity.mass, 1));
  return queuePhysicsImpulse(entity, {
    x: directionX * TIDELINE_MAGNET_ACCEL * mass * dt,
    y: 0,
    z: directionZ * TIDELINE_MAGNET_ACCEL * mass * dt,
  });
}

function trimEncounterRecords(abilityState) {
  const rows = Object.entries(abilityState.encounters);
  if (rows.length <= MAX_ENCOUNTER_RECORDS) return;
  rows.sort((a, b) => Number(a[1].active) - Number(b[1].active)
    || a[1].order - b[1].order || a[0].localeCompare(b[0]));
  for (const [encounterId] of rows.slice(0, rows.length - MAX_ENCOUNTER_RECORDS)) {
    delete abilityState.encounters[encounterId];
  }
}

function safeEncounterId(value) {
  if (typeof value !== 'string') return null;
  const encounterId = value.trim();
  if (!encounterId || encounterId.length > 160) return null;
  if (encounterId === '__proto__' || encounterId === 'constructor' || encounterId === 'prototype') return null;
  return encounterId;
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) out[key] = clonePlain(entry);
  return out;
}

function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
