// Catalyst fitting is a reader of ships' authoritative occupancy, never another inventory.
// The only writes here are our small reward receipt. ships owns every module transfer.
import { resolveCatalyst } from './catalog.js';
import { SHIPS } from '../../data/ships.js';

export const CATALYST_TRIAL_RECEIPT_ID = 'kinetic_catalysts_field_trial_v1';
const MAX_SLOTS = 64;
const CLAIMING = new WeakSet();
const HULLS = new Map(SHIPS.map(def => [def.id, def]));
// Exactly the canonical buildSlotList order preceding utility; no mount indices are authored here.
const BEFORE_UTILITY = ['weapon', 'shield', 'engine', 'cargo', 'mining'];

const moduleIdOf = value => typeof value === 'string' ? value : value?.defId;
const activeIndex = state => Number.isInteger(state?.player?.activeShipIndex)
  && state.player.activeShipIndex >= 0 ? state.player.activeShipIndex : 0;

/** Fail closed on ambiguous fits, including two copies of the same relic. */
export function validateCatalystFittings(fittings, { replaceSlot, moduleId } = {}) {
  if (!Array.isArray(fittings) || fittings.length > MAX_SLOTS) {
    return { ok: false, reason: 'invalid_fittings', conflicts: [] };
  }
  const found = [];
  for (let slotIndex = 0; slotIndex < fittings.length; slotIndex++) {
    const value = slotIndex === replaceSlot ? moduleId : moduleIdOf(fittings[slotIndex]);
    const def = resolveCatalyst(value);
    if (def) found.push({ id: def.id, moduleId: def.moduleId, slotIndex });
  }
  if (Number.isInteger(replaceSlot) && replaceSlot >= fittings.length && replaceSlot < MAX_SLOTS) {
    const def = resolveCatalyst(moduleId);
    if (def) found.push({ id: def.id, moduleId: def.moduleId, slotIndex: replaceSlot });
  }
  if (found.length > 1) return { ok: false, reason: 'catalyst_conflict', conflicts: found };
  return { ok: true, reason: null, conflicts: [], ...(found[0] || { id: null, moduleId: null, slotIndex: null }) };
}

/** Inventory, parked hulls and renderer snapshots can never turn a catalyst on. */
export function readFittedCatalyst(state) {
  const declaredIndex = state?.player?.activeShipIndex;
  if (declaredIndex != null && (!Number.isInteger(declaredIndex) || declaredIndex < 0)) {
    return { id: null, moduleId: null, slotIndex: null, shipIndex: null,
      valid: false, reason: 'invalid_active_ship', conflicts: [] };
  }
  const shipIndex = activeIndex(state);
  const owned = state?.player?.ownedShips?.[shipIndex];
  let check = validateCatalystFittings(owned?.fittings);
  if (check.ok && check.id) {
    const hull = HULLS.get(owned.defId);
    const offset = hull ? BEFORE_UTILITY.reduce((n, type) => n + (hull.slots?.[type]?.length || 0), 0) : -1;
    const utilitySlot = hull?.slots?.utility?.[check.slotIndex - offset];
    if (!hull || utilitySlot == null || owned.fittings[check.slotIndex] !== check.moduleId) {
      check = { ok: false, reason: 'incompatible_catalyst_slot', conflicts: [] };
    }
    // A changed vessel must not inherit the parked hull's relic through stale meta data.
    const entity = state?.entities?.get?.(state.playerId);
    if (check.ok && entity?.data?.defId && entity.data.defId !== owned.defId) {
      check = { ok: false, reason: 'active_hull_mismatch', conflicts: [] };
    }
  }
  return { id: check.ok ? check.id : null, moduleId: check.ok ? check.moduleId : null,
    slotIndex: check.ok ? check.slotIndex : null, shipIndex,
    valid: check.ok, reason: check.reason, conflicts: check.conflicts };
}

/** Minimal ships.moduleFitBlocker hook, alongside findMasslineHeadConflict. */
export function findCatalystFitConflict(fittings, slotIndex, requestedDef) {
  if (!resolveCatalyst(requestedDef?.id || requestedDef?.moduleId || requestedDef)) return null;
  if (!Array.isArray(fittings) || fittings.length > MAX_SLOTS) {
    return { id: null, name: 'invalid catalyst fitting', reason: 'invalid_fittings' };
  }
  for (let i = 0; i < fittings.length; i++) {
    if (i === slotIndex) continue;
    const def = resolveCatalyst(moduleIdOf(fittings[i]));
    if (def) return { id: def.moduleId, name: def.name, reason: 'catalyst_conflict', slotIndex: i };
  }
  return null;
}

function namespace(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.kineticCatalysts || typeof state.kineticCatalysts !== 'object') {
    state.kineticCatalysts = { schemaVersion: 1, receipts: [] };
  }
  if (!Array.isArray(state.kineticCatalysts.receipts)) state.kineticCatalysts.receipts = [];
  return state.kineticCatalysts;
}

/** Whitelisted, scalar-only receipts. An invalid save cannot mint an arbitrary reward stream. */
export function normalizeCatalystReceipts(value) {
  if (!Array.isArray(value)) return [];
  for (const rec of value.slice(0, 4)) {
    const def = resolveCatalyst(rec?.catalystId);
    if (rec?.receiptId !== CATALYST_TRIAL_RECEIPT_ID || !def || typeof rec.instanceId !== 'string'
      || !rec.instanceId || rec.instanceId.length > 128) continue;
    return [{ receiptId: CATALYST_TRIAL_RECEIPT_ID, catalystId: def.id, moduleId: def.moduleId,
      instanceId: rec.instanceId, completed: rec.completed === true,
      grantedAt: finiteTime(rec.grantedAt), completedAt: finiteTime(rec.completedAt),
      evidenceKind: typeof rec.evidenceKind === 'string' ? rec.evidenceKind.slice(0, 48) : null,
      evidenceSequence: Number.isFinite(rec.evidenceSequence)
        ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(rec.evidenceSequence))) : 0 }];
  }
  return [];
}

export function readCatalystTrialReceipt(state, receiptId = CATALYST_TRIAL_RECEIPT_ID) {
  if (receiptId !== CATALYST_TRIAL_RECEIPT_ID) return null;
  return normalizeCatalystReceipts(state?.kineticCatalysts?.receipts)[0] || null;
}

function finiteTime(value) { return Number.isFinite(value) && value >= 0 ? value : 0; }

function locateInstance(state, instanceId, moduleId) {
  const player = state?.player;
  const inventory = Array.isArray(player?.moduleInventory) ? player.moduleInventory : [];
  // Inventory is an existing bounded owner collection; no copy or independent item store.
  for (let i = 0; i < Math.min(inventory.length, 4096); i++) {
    const item = inventory[i];
    if (item?.defId === moduleId && (instanceId == null || item.instanceId === instanceId)) {
      return { item, shipIndex: null, slotIndex: null };
    }
  }
  const owned = Array.isArray(player?.ownedShips) ? player.ownedShips : [];
  for (let s = 0; s < Math.min(owned.length, 128); s++) {
    const ship = owned[s];
    const fits = Array.isArray(ship?.fittings) ? ship.fittings : [];
    for (let i = 0; i < Math.min(fits.length, MAX_SLOTS); i++) {
      const item = ship.fittedInstances?.[i];
      if (fits[i] === moduleId && item?.defId === moduleId
        && typeof item.instanceId === 'string' && (instanceId == null || item.instanceId === instanceId)) {
        return { item, shipIndex: s, slotIndex: i };
      }
    }
  }
  return null;
}

/**
 * One explicit field-trial choice grants a real, retained inventory instance, then requests a
 * fit via the real ships owner. A failed fit retains the same item. Retry never grants again,
 * even if that item was sold, destroyed or is now installed on a parked hull.
 */
export function claimCatalystTrial(state, options = {}) {
  const { receiptId = CATALYST_TRIAL_RECEIPT_ID, ships } = options;
  const def = resolveCatalyst(options.catalystId);
  if (receiptId !== CATALYST_TRIAL_RECEIPT_ID || !def) return { ok: false, reason: 'invalid_trial_choice' };
  if (!state?.player || !ships || typeof ships.grantModule !== 'function'
    || typeof ships.fitModule !== 'function' || typeof ships.moduleFitBlocker !== 'function') {
    return { ok: false, reason: 'ships_owner_unavailable' };
  }
  if (!Array.isArray(state.player.moduleInventory) || state.player.moduleInventory.length > 4096
    || !Array.isArray(state.player.ownedShips) || state.player.ownedShips.length > 128) {
    return { ok: false, reason: 'owner_inventory_limit' };
  }
  if (CLAIMING.has(state)) return { ok: false, reason: 'claim_in_progress' };
  const existing = readCatalystTrialReceipt(state, receiptId);
  if (existing && existing.catalystId !== def.id) {
    return { ok: false, reason: 'trial_choice_locked', catalystId: existing.catalystId };
  }
  const declaredIndex = state.player.activeShipIndex;
  if (declaredIndex != null && (!Number.isInteger(declaredIndex) || declaredIndex < 0)) {
    return { ok: false, reason: 'invalid_active_ship' };
  }
  const shipIndex = options.shipIndex == null ? activeIndex(state) : options.shipIndex;
  if (!Number.isInteger(shipIndex) || shipIndex !== activeIndex(state)
    || !state.player.ownedShips?.[shipIndex]) return { ok: false, reason: 'active_ship_required' };
  const owned = state.player.ownedShips[shipIndex];
  if (!Array.isArray(owned.fittings) || owned.fittings.length > MAX_SLOTS) {
    return { ok: false, reason: 'invalid_fittings' };
  }
  CLAIMING.add(state);
  try {
    let rec = existing;
    let found = locateInstance(state, rec?.instanceId, def.moduleId);
    if (!rec) {
      if (!found) {
        if (state.player.moduleInventory.length >= 4096) return { ok: false, reason: 'owner_inventory_limit' };
        // A legacy occupancy without an instance must be reconciled by ships, never rewarded
        // with a second copy because our identity reader could not prove the first one.
        if (state.player.ownedShips.some(ship => Array.isArray(ship?.fittings)
          && ship.fittings.slice(0, MAX_SLOTS).includes(def.moduleId))) {
          return { ok: false, reason: 'existing_instance_needs_reconciliation' };
        }
        const granted = ships.grantModule({ defId: def.moduleId, reason: receiptId,
          provenance: { source: 'kinetic_catalysts_field_trial', sectorId: state.world?.currentSectorId || null } });
        if (!granted) return { ok: false, reason: 'module_catalog_unavailable' };
        found = locateInstance(state, null, def.moduleId);
      }
      if (!found || typeof found.item.instanceId !== 'string') {
        return { ok: false, reason: 'grant_identity_missing' };
      }
      rec = { receiptId, catalystId: def.id, moduleId: def.moduleId, instanceId: found.item.instanceId,
        grantedAt: finiteTime(state.simTime), completed: false, completedAt: 0,
        evidenceKind: null, evidenceSequence: 0 };
      namespace(state).receipts = [rec]; // before fit emits: synchronous reentry cannot regrant.
    }
    if (!found) return { ok: true, reason: 'retained_instance_unavailable', moduleId: def.moduleId,
      instanceId: rec.instanceId, fitted: false, slotIndex: null };
    if (found.shipIndex === shipIndex) {
      const fit = readFittedCatalyst(state);
      return { ok: true, reason: fit.valid ? null : fit.reason, moduleId: def.moduleId,
        instanceId: rec.instanceId, fitted: fit.valid && fit.id === def.id, slotIndex: found.slotIndex };
    }
    if (found.shipIndex != null) return { ok: true, reason: 'retained_on_other_ship', moduleId: def.moduleId,
      instanceId: rec.instanceId, fitted: false, slotIndex: null };
    const fitting = validateCatalystFittings(owned.fittings);
    // We reach this branch only for a loose identity. Even the same catalyst already
    // occupying another slot is a conflict; an owner's prospective guard is a second
    // defense, not permission to install two copies before that shared hook is wired.
    if (!fitting.ok || fitting.id) return { ok: true,
      reason: 'unfit_other_catalyst', moduleId: def.moduleId, instanceId: rec.instanceId, fitted: false, slotIndex: null };
    // Probe the real owner's slot/budget rules rather than duplicating hull slot ordering.
    // Only an empty slot is considered; trial consent never displaces an unrelated fitting.
    let slotIndex = null;
    const slots = Number.isInteger(options.slotIndex) ? [options.slotIndex]
      : Array.from({ length: MAX_SLOTS }, (_, i) => i);
    for (const i of slots) {
      if (i < 0 || i >= MAX_SLOTS || owned.fittings[i]) continue;
      if (!ships.moduleFitBlocker({ shipIndex, slotIndex: i, def: def.module || def })) { slotIndex = i; break; }
    }
    if (slotIndex == null) return { ok: true, reason: 'retained_fit_at_shipyard', moduleId: def.moduleId,
      instanceId: rec.instanceId, fitted: false, slotIndex: null };
    const fitted = ships.fitModule({ shipIndex, slotIndex, instanceId: rec.instanceId }) === true;
    const live = readFittedCatalyst(state);
    return { ok: true, reason: fitted && live.id === def.id ? null : 'retained_fit_refused', moduleId: def.moduleId,
      instanceId: rec.instanceId, fitted: fitted && live.valid && live.id === def.id, slotIndex };
  } finally { CLAIMING.delete(state); }
}

export function completeCatalystTrial(state, receiptId, evidence = {}) {
  const rec = readCatalystTrialReceipt(state, receiptId);
  const expected = { orbital_magazine: 'orbit_release', aftershock_core: 'echo_hit', load_bridge: 'bridge_transfer' };
  if (!rec || expected[rec.catalystId] !== evidence.kind || !Number.isInteger(evidence.sequence)
    || evidence.sequence <= 0) return false;
  if (rec.completed) return true;
  rec.completed = true;
  rec.completedAt = finiteTime(evidence.at ?? state.simTime);
  rec.evidenceKind = evidence.kind;
  rec.evidenceSequence = evidence.sequence;
  namespace(state).receipts = [rec];
  return true;
}
