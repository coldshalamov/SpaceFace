import {
  ACTION_DEFS,
  ATTACHMENT_DEFS,
  COMBAT_PROFILES,
  COMBAT_SCHEMA_VERSION,
  DAMAGE_MODEL,
  DEFAULT_COMBAT_PROFILE_BY_TYPE,
  STATUS_DEFS,
  SUBSYSTEM_DEFS,
} from '../data/combatDefs.js';
import { ensureCombatTrace } from './trace.js';

export function createCombatCatalog(overrides = {}) {
  const actions = overrides.actions || ACTION_DEFS;
  const statuses = overrides.statuses || STATUS_DEFS;
  const subsystems = overrides.subsystems || SUBSYSTEM_DEFS;
  const attachments = overrides.attachments || ATTACHMENT_DEFS;
  const profiles = overrides.profiles || COMBAT_PROFILES;
  return Object.freeze({
    schemaVersion: COMBAT_SCHEMA_VERSION,
    actionDefs: actions,
    statusDefs: statuses,
    subsystemDefs: subsystems,
    attachmentDefs: attachments,
    combatProfiles: profiles,
    damageModel: overrides.damageModel || DAMAGE_MODEL,
    actions: indexById(actions, 'ActionDef'),
    statuses: indexById(statuses, 'StatusDef'),
    subsystems: indexById(subsystems, 'SubsystemDef'),
    attachments: indexById(attachments, 'AttachmentDef'),
    profiles: indexById(profiles, 'CombatProfile'),
  });
}

export function ensureCombatState(state) {
  if (!state.combat || typeof state.combat !== 'object') state.combat = {};
  const combat = state.combat;
  combat.schemaVersion = COMBAT_SCHEMA_VERSION;
  if (!Array.isArray(combat.beams)) combat.beams = [];
  if (!(combat.threatTables instanceof Map)) combat.threatTables = new Map();
  if (!combat.actions || typeof combat.actions !== 'object') combat.actions = {};
  if (!Number.isInteger(combat.actions.nextRequestSeq) || combat.actions.nextRequestSeq < 1) combat.actions.nextRequestSeq = 1;
  if (!Number.isInteger(combat.actions.nextInstanceSeq) || combat.actions.nextInstanceSeq < 1) combat.actions.nextInstanceSeq = 1;
  if (!Array.isArray(combat.actions.requests)) combat.actions.requests = [];
  if (!combat.actions.activeByActor || typeof combat.actions.activeByActor !== 'object') combat.actions.activeByActor = {};
  if (!combat.actions.cooldownReadyTickByActor || typeof combat.actions.cooldownReadyTickByActor !== 'object') combat.actions.cooldownReadyTickByActor = {};
  if (!combat.entities || typeof combat.entities !== 'object') combat.entities = {};
  if (!combat.attachments || typeof combat.attachments !== 'object') combat.attachments = {};
  if (!Number.isInteger(combat.attachments.nextId) || combat.attachments.nextId < 1) combat.attachments.nextId = 1;
  if (!combat.attachments.byId || typeof combat.attachments.byId !== 'object') combat.attachments.byId = {};
  ensureCombatTrace(combat);
  return combat;
}

export function ensureCombatant(state, entity, catalog) {
  if (!entity || entity.id == null) return null;
  const combat = ensureCombatState(state);
  const key = entityKey(entity.id);
  let runtime = combat.entities[key];
  const profile = resolveCombatProfile(entity, catalog);
  if (!runtime || runtime.profileId !== (profile && profile.id)) {
    runtime = createCombatantRuntime(entity, profile, catalog, runtime);
    combat.entities[key] = runtime;
  }
  syncCombatantBounds(entity, runtime, profile);
  return runtime;
}

export function removeCombatantRuntime(state, entityId) {
  const combat = ensureCombatState(state);
  delete combat.entities[entityKey(entityId)];
  delete combat.actions.activeByActor[entityKey(entityId)];
  delete combat.actions.cooldownReadyTickByActor[entityKey(entityId)];
}

export function resolveCombatProfile(entity, catalog) {
  if (!entity) return null;
  const explicit = entity.data && entity.data.combatProfileId;
  const profileId = explicit || DEFAULT_COMBAT_PROFILE_BY_TYPE[entity.type];
  return profileId ? catalog.profiles.get(profileId) || null : null;
}

export function syncCombatantBounds(entity, runtime, profile = null) {
  if (!runtime) return;
  const heatMax = profile && profile.heat && finiteNonNegative(profile.heat.max)
    ? profile.heat.max : (finiteNonNegative(runtime.heatMax) ? runtime.heatMax : 100);
  runtime.heatMax = heatMax;
  runtime.heat = clamp(finiteNonNegative(runtime.heat) ? runtime.heat : 0, 0, heatMax);
  if (Number.isFinite(entity.capMax)) entity.cap = clamp(Number(entity.cap) || 0, 0, Math.max(0, entity.capMax));
  if (Number.isFinite(entity.hullMax)) entity.hull = clamp(Number(entity.hull) || 0, 0, Math.max(0, entity.hullMax));
  if (Number.isFinite(entity.shieldMax)) entity.shield = clamp(Number(entity.shield) || 0, 0, Math.max(0, entity.shieldMax));
  if (Number.isFinite(entity.armorMax)) entity.armorHp = clamp(Number(entity.armorHp) || 0, 0, Math.max(0, entity.armorMax));
}

export function entityKey(id) {
  return String(id);
}

export function cloneData(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneData);
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = cloneData(item);
  return out;
}

function createCombatantRuntime(entity, profile, catalog, previous) {
  const runtime = {
    schemaVersion: COMBAT_SCHEMA_VERSION,
    entityId: entity.id,
    profileId: profile ? profile.id : null,
    heat: previous && finiteNonNegative(previous.heat) ? previous.heat : 0,
    heatMax: profile && profile.heat ? profile.heat.max : 100,
    immunityTags: profile ? [...(profile.immunityTags || [])].sort() : [],
    baseCapabilities: profile ? cloneData(profile.capabilities || {}) : {},
    capabilities: profile ? cloneData(profile.capabilities || {}) : {},
    multipliers: { movement: 1, capRegen: 1, heatDissipation: 1 },
    blockedActionTags: [],
    subsystems: {},
    statuses: {},
    pendingStatuses: [],
    sockets: {},
    revision: previous && Number.isInteger(previous.revision) ? previous.revision + 1 : 1,
  };

  for (const subsystemId of (profile && profile.subsystemIds) || []) {
    const def = catalog.subsystems.get(subsystemId);
    if (!def) continue;
    const old = previous && previous.subsystems && previous.subsystems[subsystemId];
    const maxHealth = Math.max(0, Number(def.health) || 0);
    const oldFraction = old && old.maxHealth > 0 ? clamp(old.health / old.maxHealth, 0, 1) : 1;
    runtime.subsystems[subsystemId] = {
      id: subsystemId,
      health: maxHealth * oldFraction,
      maxHealth,
      destroyed: old ? !!old.destroyed : false,
      effectiveDisabled: old ? !!old.effectiveDisabled : false,
      pendingTransition: old && old.pendingTransition ? cloneData(old.pendingTransition) : null,
      lastDamageTick: old && Number.isInteger(old.lastDamageTick) ? old.lastDamageTick : -1,
    };
  }

  for (const socket of (profile && profile.sockets) || []) {
    runtime.sockets[socket.id] = {
      id: socket.id,
      tags: [...(socket.tags || [])].sort(),
      localPos: Array.isArray(socket.localPos) ? socket.localPos.slice(0, 2) : [0, 0],
      maxAttachments: Math.max(1, Math.floor(socket.maxAttachments || 1)),
    };
  }
  return runtime;
}

function indexById(items, label) {
  const map = new Map();
  for (const item of items || []) {
    if (!item || typeof item.id !== 'string' || !item.id) throw new TypeError(`${label} requires a non-empty id`);
    if (map.has(item.id)) throw new Error(`Duplicate ${label} id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
