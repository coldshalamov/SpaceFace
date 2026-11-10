// One durable subsystem-damage projection on the existing canonical world record.
// No targets, entity IDs, actions, attachment refs, statuses or derived capabilities.
import { hash32 } from '../core/rng.js';
import { PLANET_SITE } from '../data/planets.js';
import { COMBAT_PROFILES, SUBSYSTEM_DEFS, DEFAULT_COMBAT_PROFILE_BY_TYPE } from '../data/combatDefs.js';
const FIELD = 'orchardSubsystemDamage';
const defs = new Map(SUBSYSTEM_DEFS.map(d => [d.id, d]));
const profiles = new Map(COMBAT_PROFILES.map(p => [p.id, p]));
function identity(state, entity) {
  const d = entity?.data, route = d?.itinerary;
  if (!state || !entity || entity.alive !== true || !(entity.hull > 0)
    || state.entities?.get(entity.id) !== entity || entity.type !== 'ship'
    || d?.defId !== 'ship_mule' || d.jobId || d.worldSiteId
    || (d.homeSectorId && d.homeSectorId !== PLANET_SITE.sectorId)
    || (entity.homeSectorId && entity.homeSectorId !== PLANET_SITE.sectorId)
    || (d.sectorId && d.sectorId !== PLANET_SITE.sectorId)
    || (d.persistenceOwner != null && d.persistenceOwner !== 'worldRecords')
    || route?.kind !== 'anvil_work' || !['collector', 'receiver'].includes(route.role)) return null;
  const recordId = `wr_convoy_${(hash32(state.meta?.seed >>> 0 || 1, 'wr', PLANET_SITE.sectorId, 'convoy', `anvil:shift:${route.role}`) >>> 0).toString(16)}`;
  if (d.worldRecordId !== recordId) return null;
  for (const other of state.entities.values())
    if (other !== entity && other.alive !== false && other.hull > 0 && other.data?.worldRecordId === recordId) return null;
  const record = state.world?.records?.byId?.[recordId];
  if (record && (record.recordId !== recordId || record.type !== 'ship' || !(record.hull > 0)
    || record.alive === false || ['destroyed', 'defeated', 'removed', 'consumed'].includes(record.outcome) || record.sectorId !== PLANET_SITE.sectorId
    || record.shipDefId !== 'ship_mule' || record.itinerary?.kind !== 'anvil_work'
    || record.itinerary.role !== route.role || record.jobId)) return null;
  return { recordId, role: route.role, shipDefId: 'ship_mule', sectorId: PLANET_SITE.sectorId };
}
function snapshot(state, entity) {
  const id = identity(state, entity), runtime = state?.combat?.entities?.[entity?.id];
  if (!id || !runtime || runtime.orchardDamageUnresolved === true || orchardDamageUnavailable(state, entity)) return undefined; // No live damage authority: keep a prior cold record.
  const profile = profiles.get(runtime.profileId);
  if (!profile || runtime.entityId !== entity.id
    || runtime.profileId !== (entity.data.combatProfileId || DEFAULT_COMBAT_PROFILE_BY_TYPE[entity.type])) return undefined;
  const rows = [];
  for (const name of profile.subsystemIds || []) {
    const sub = runtime.subsystems?.[name], def = defs.get(name);
    if (!sub || !def || !Number.isFinite(sub.health) || sub.health < 0
      || sub.health > def.health || sub.maxHealth !== def.health) return undefined;
    // Resolve the already-earned damage/repair outcome, never its runtime tick or
    // attacker. Otherwise saving on the repair tick resurrects the old wound.
    const pending = sub.pendingTransition;
    const earnedTransition = pending && typeof pending === 'object' && !Array.isArray(pending)
      && typeof pending.destroyed === 'boolean' && Number.isInteger(pending.atTick)
      && pending.atTick >= 0 && Number.isInteger(state.tick) && pending.atTick <= state.tick + 1;
    const destroyed = sub.health === 0 || (earnedTransition
      ? pending.destroyed : sub.destroyed === true);
    if (destroyed || sub.health < def.health) rows.push({ id: name, health: sub.health, maxHealth: def.health, destroyed });
  }
  return { version: 1, ...id, profileId: runtime.profileId, subsystems: rows };
}
export function captureOrchardWorkDamage(state, entity, extra) {
  const value = snapshot(state, entity);
  if (value === undefined) return extra;
  // Empty rows deliberately replace the old wound after genuine repair.
  return { ...extra, [FIELD]: value };
}
const snapshotKeys = new Set(['version', 'recordId', 'role', 'shipDefId', 'sectorId', 'profileId', 'subsystems']);
const rowKeys = new Set(['id', 'health', 'maxHealth', 'destroyed']);
function validatedSnapshot(state, entity, profile, catalog) {
  const id = identity(state, entity);
  const saved = id && state.world?.records?.byId?.[id.recordId]?.extra?.[FIELD];
  if (!saved || saved.version !== 1 || saved.profileId !== profile?.id
    || Object.keys(saved).some(k => !snapshotKeys.has(k))
    || Object.keys(id).some(k => saved[k] !== id[k]) || !Array.isArray(saved.subsystems)
    || saved.subsystems.length > (profile.subsystemIds?.length || 0)) return null;
  const seen = new Set();
  for (const row of saved.subsystems) {
    const def = catalog.subsystems.get(row?.id);
    if (!def || Object.keys(row).some(k => !rowKeys.has(k))
      || !profile.subsystemIds.includes(row.id) || seen.has(row.id)
      || row.maxHealth !== def.health || !Number.isFinite(row.health) || row.health < 0
      || row.health > def.health || typeof row.destroyed !== 'boolean'
      || (!row.destroyed && row.health === 0)) return null;
    seen.add(row.id);
  }
  return saved;
}
export function hydrateOrchardWorkDamage(state, entity, runtime, profile, catalog) {
  if (!identity(state, entity) || !hasOrchardWorkDamage(state, entity)) return false;
  const saved = validatedSnapshot(state, entity, profile, catalog);
  if (!saved) { runtime.orchardDamageUnresolved = true; return false; }
  for (const row of saved.subsystems) Object.assign(runtime.subsystems[row.id], {
    health: row.health, destroyed: row.destroyed, effectiveDisabled: row.destroyed,
  });
  return true;
}
export function hasOrchardWorkDamage(state, entity) {
  return Object.hasOwn(state?.world?.records?.byId?.[entity?.data?.worldRecordId]?.extra || {}, FIELD);
}
export function isCanonicalOrchardDamageActor(state, entity) { return !!identity(state, entity); }
export function orchardDamageUnavailable(state, entity) {
  if (!hasOrchardWorkDamage(state, entity)) return false;
  const profile = profiles.get(entity?.data?.combatProfileId || DEFAULT_COMBAT_PROFILE_BY_TYPE[entity?.type]);
  return !validatedSnapshot(state, entity, profile, { subsystems: defs });
}
// Read-only cold status. Runtime modifiers remain the authority once instantiated.
export function orchardSavedDriveOffline(state, entity) {
  const profile = profiles.get(entity?.data?.combatProfileId || DEFAULT_COMBAT_PROFILE_BY_TYPE[entity?.type]);
  const saved = validatedSnapshot(state, entity, profile, { subsystems: defs });
  if (!saved) return false;
  const disabled = new Set(saved.subsystems.filter(s => s.destroyed).map(s => s.id));
  for (let pass = 0; pass < profile.subsystemIds.length; pass++)
    for (const id of profile.subsystemIds)
      if ((defs.get(id)?.dependencies || []).some(dep => disabled.has(dep))) disabled.add(id);
  return disabled.has('subsystem_drive');
}
