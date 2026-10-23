// Ships-owned physical helm handoff. Neither body nor native physics handle is replaced.
// Custody/title eligibility belongs to shipjack; this seam protects body and inventory truth.
import { SHIPS } from '../data/ships.js';
import { writePhysicsControl } from '../core/physicsAuthority.js';
import { isBlackFlagAdventure, SHIPJACK_HANDOFF_RANGE_WU } from '../shipjack/model.js';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';

const TRANSFER_CAP = 1024; // Terminal keys never evict: saturation fails closed, never replays.
const SAFE_ID = /^[A-Za-z0-9_:.\-]{1,128}$/;
const HULLS = new Map(SHIPS.map(def => [def.id, def]));
const COMPONENTS = new Map([...MODULES, ...WEAPONS].map(def => [def.id, def]));

function planAdmission(owner, to, vesselId) {
  const p = owner.state.player;
  const def = HULLS.get(to.data?.defId);
  if (!def) return { ok: false, reason: 'unsupported_hull' };
  let index = p.ownedShips.findIndex(item => item.vesselId === vesselId);
  const admitted = index < 0;
  const title = owner.state.shipjack?.vesselsById?.[vesselId]?.title;
  if (title === 'sold' || title === 'returned') return { ok: false, reason: 'custody_settled' };
  const owned = admitted ? {
    defId: def.id, vesselId, fittings: (to.data.fittings || []).slice(),
    fittedInstances: to.data.fittedInstances ? structuredClone(to.data.fittedInstances) : {},
    appearance: to.data.appearance ? structuredClone(to.data.appearance) : undefined,
    livingHull: to.data.livingHull ? structuredClone(to.data.livingHull) : undefined,
    name: String(to.data.shipName || to.data.name || '').slice(0, 48),
    shipjackProvisional: true, shipjackNoLegacyWeapon: true,
  } : p.ownedShips[index];
  if (owned.defId !== def.id) return { ok: false, reason: 'hull_identity_conflict' };
  if (!owner.validateTransferFittings(owned)) return { ok: false, reason: 'unsupported_fittings' };
  if (admitted && p.ownedShips.length >= 64) return { ok: false, reason: 'fleet_capacity' };
  if (admitted) {
    const held = new Set((p.moduleInventory || []).map(item => item.instanceId));
    for (const hull of p.ownedShips) for (const item of Object.values(hull.fittedInstances || {})) if (item?.instanceId) held.add(item.instanceId);
    for (const [slot, item] of Object.entries(owned.fittedInstances)) {
      if (!item || !SAFE_ID.test(item.instanceId || '') || item.defId !== owned.fittings[slot] || held.has(item.instanceId)) return { ok: false, reason: 'component_identity_conflict' };
      held.add(item.instanceId);
    }
    const subs = owner.state.combat?.entities?.[to.id]?.subsystems || {};
    for (let slot = 0; slot < owned.fittings.length; slot += 1) {
      const defId = owned.fittings[slot];
      if (!defId) continue;
      owned.fittedInstances[slot] ||= { instanceId: owner.nextInstanceId(), defId,
        provenance: { vesselId, source: 'shipjack_capture' } };
      const instance = owned.fittedInstances[slot];
      const provenance = instance.provenance && typeof instance.provenance === 'object' ? instance.provenance
        : typeof instance.provenance === 'string' ? { label: instance.provenance } : {};
      // An existing older source remains the forensic owner; capture cannot wash its trail.
      if (!provenance.sourceVesselId && !provenance.vesselId) {
        instance.provenance = { ...provenance, sourceVesselId: vesselId, source: provenance.source || 'shipjack_capture', titleAtCapture: title || 'disputed' };
      } else if (!provenance.titleAtCapture && (provenance.sourceVesselId || provenance.vesselId) === vesselId) {
        instance.provenance = { ...provenance, titleAtCapture: title || 'disputed' };
      }
      const component = COMPONENTS.get(defId);
      const key = component?.slotType === 'engine' ? 'subsystem_drive'
        : component?.slotType === 'sensor' ? 'subsystem_sensor'
          : component?.slotType === 'reactor' ? 'subsystem_power'
            : (component?.slotType === 'weapon' || WEAPONS.some(w => w.id === defId)) ? 'subsystem_weapon' : null;
      const sub = key && subs[key];
      if (sub && Number.isFinite(sub.health) && sub.maxHealth > 0) {
        const existing = owned.fittedInstances[slot].condition;
        owned.fittedInstances[slot].condition = Math.min(typeof existing === 'number' ? existing : 1, Math.max(0, Math.min(1, sub.health / sub.maxHealth)));
      }
    }
    if (to.data.cargo?.items) owned.cargo = structuredClone(to.data.cargo);
    index = p.ownedShips.length;
  }
  return { ok: true, owned, index, admitted };
}

/** Secured tow ownership admission does not move the pilot, body or cargo. */
export function admitCapturedVessel(owner, request = {}) {
  const state = owner.state, p = state?.player;
  const fail = reason => ({ ok: false, reason });
  if (!p || !isBlackFlagAdventure(state) || (state.run?.kind && state.run.kind !== 'adventure')) return fail('adventure_only');
  const to = state.entities?.get(request.targetId);
  if (!to || to.alive === false || !(to.hull > 0) || to.type !== 'ship') return fail('body_unavailable');
  if (!SAFE_ID.test(request.vesselId || '') || to.data?.vesselId !== request.vesselId || request.targetGeneration == null
    || request.targetGeneration !== (to.data?.shipjackGeneration ?? to.occupantGeneration)) return fail('stale_target');
  const plan = planAdmission(owner, to, request.vesselId);
  if (!plan.ok) return plan;
  if (plan.admitted) {
    p.ownedShips.push(plan.owned);
    to.data.fittedInstances = plan.owned.fittedInstances;
    if (plan.owned.cargo) to.data.cargo = plan.owned.cargo;
    to.flags ||= {}; to.flags.persistent = true;
    owner.bus.emit('ship:captured', { operationId: request.operationId, vesselId: request.vesselId, index: plan.index, targetId: to.id });
  }
  return { ok: true, vesselId: request.vesselId, index: plan.index, admitted: plan.admitted };
}

export function captureAndTransfer(owner, request = {}) {
  const state = owner.state;
  const p = state?.player;
  const { targetId, targetGeneration, vesselId, operationId } = request;
  const fail = reason => ({ ok: false, reason, operationId });
  if (!p || !SAFE_ID.test(operationId || '') || !SAFE_ID.test(vesselId || '')) return fail('invalid_identity');
  const journal = p.shipControlTransfers;
  if (journal && (journal.version !== 1 || !Array.isArray(journal.receipts) || journal.receipts.length > TRANSFER_CAP
    || journal.receipts.some(receipt => !receipt || !SAFE_ID.test(receipt.operationId || '') || !SAFE_ID.test(receipt.vesselId || '')))) return fail('invalid_transfer_journal');
  const prior = journal?.receipts.find(receipt => receipt.operationId === operationId);
  if (prior) return prior.vesselId === vesselId ? { ...prior, replayed: true } : fail('operation_identity_conflict');
  if ((journal?.receipts.length || 0) >= TRANSFER_CAP) return fail('transfer_journal_full');
  // Parent additionally checks all ephemeral runtime flags. Fail closed here on known modes.
  if (state.mode !== 'flight' || !isBlackFlagAdventure(state) || (state.run?.kind && state.run.kind !== 'adventure') || p.combatProfile === 'crucible'
    || state.ui?.docked || state.ui?.dockedStationId != null) return fail('flight_transfer_only');
  if (state.flags?.blackFlagControlTransfer === false || state.settings?.gameplay?.shipjackHandoff === false) return fail('handoff_disabled');
  const from = state.entities?.get(state.playerId);
  const to = state.entities?.get(targetId);
  if (!from || !to || from === to || from.type !== 'ship' || to.type !== 'ship') return fail('missing_body');
  if (from.alive === false || to.alive === false || !(from.hull > 0) || !(to.hull > 0)
    || from.flags?.defeated || to.flags?.defeated || from.flags?.docked || to.flags?.docked) return fail('body_unavailable');
  const generation = to.data?.shipjackGeneration ?? to.occupantGeneration;
  if (targetGeneration == null || generation !== targetGeneration || to.data?.vesselId !== vesselId) return fail('stale_target');
  if (!from.pos || !to.pos || !from.vel || !to.vel
    || ![from.pos.x, from.pos.z, to.pos.x, to.pos.z, from.vel.x, from.vel.z, to.vel.x, to.vel.z].every(Number.isFinite)) return fail('invalid_motion');
  const range = Math.hypot(to.pos.x - from.pos.x, to.pos.z - from.pos.z);
  if (range > SHIPJACK_HANDOFF_RANGE_WU) return fail('Close within 115 WU before crossing the airlock link.');
  if (Math.hypot(to.vel.x - from.vel.x, to.vel.z - from.vel.z) > 16
    || Math.abs(Number(to.angularVel?.y ?? to.angVel ?? 0)) > 0.9) return fail('transfer_unstable');
  const def = HULLS.get(to.data?.defId);
  const previous = p.ownedShips?.[p.activeShipIndex];
  if (!def || !previous || !from.data) return fail('unsupported_hull');
  const plan = planAdmission(owner, to, vesselId);
  if (!plan.ok) return fail(plan.reason);
  const { owned, index, admitted } = plan;
  if (admitted) p.ownedShips.push(owned);
  const cargoCapVolume = owner.getTransferCargoCapacity(owned);
  // Acknowledge the actual cargo owner's synchronous receipt. Missing owner cannot lose cargo.
  let swapped = false;
  const off = owner.bus.on('cargo:parkedHoldSwapped', event => {
    if (event.fromIndex === p.activeShipIndex && event.toIndex === index) swapped = true;
  });
  const swap = { fromIndex: p.activeShipIndex, toIndex: index, cargoCapVolume };
  owner.bus.emit('ship:parkedHoldSwap', swap);
  if (typeof off === 'function') off();
  if (swap.refused || !swapped) {
    if (admitted) p.ownedShips.pop();
    return fail(swap.refused || 'cargo_owner_unavailable');
  }
  // All fallible guards are above this synchronous commit. No spawn/destroy/pose writes occur.
  owner.bus.emit('ship:controlChanging', { operationId, fromId: from.id, toId: to.id });
  previous.vesselId ||= from.data.vesselId;
  from.isPlayer = false;
  from.flags ||= {};
  from.flags.persistent = true;
  from.data.ai = null;
  from.data.intent = null;
  from.data.shipjackParked = true;
  from.data.combat = { targetId: null, lockTarget: null, lockProgress: 0 };
  to.isPlayer = true;
  to.flags ||= {};
  to.flags.persistent = true;
  to.team = from.team;
  to.factionId = from.factionId;
  to.data.team = from.team;
  to.data.factionId = from.factionId;
  to.data.ai = null;
  to.data.intent = null;
  to.data.shipjackParked = false;
  to.data.combat = { targetId: null, lockTarget: null, lockProgress: 0 };
  to.data.fittedInstances = owned.fittedInstances;
  delete to.data.cargo; // Cargo now has exactly one canonical owned/live hold.
  state.playerId = to.id;
  p.activeShipIndex = index;
  p.targetId = null;
  const health = Object.fromEntries(['hull', 'shield', 'cap', 'armorHp'].map(key => [key, to[key]]));
  const weapons = to.data.weapons || [];
  owner.recomputeEntity(to.id, owned.fittings);
  for (const [key, value] of Object.entries(health)) if (Number.isFinite(value)) to[key] = Math.min(value, to[key === 'armorHp' ? 'armorMax' : key + 'Max'] ?? Infinity);
  for (const weapon of to.data.weapons || []) {
    const old = weapons.find(item => item.slotIndex === weapon.slotIndex && item.defId === weapon.defId);
    if (old) { weapon._cooldown = old._cooldown; weapon._heat = old._heat; }
  }
  // Remove any one-tick NPC/player continuous force from this body's previous controller.
  writePhysicsControl(from, { source: 'shipjack-parked' });
  writePhysicsControl(to, { source: 'shipjack-handoff' });
  const receipt = { ok: true, operationId, vesselId, fromVesselId: previous.vesselId || null,
    fromId: from.id, toId: to.id, index, tick: state.tick || 0 };
  p.shipControlTransfers ||= { version: 1, receipts: [] };
  p.shipControlTransfers.receipts.push(receipt);
  owner.bus.emit('ship:controlTransferred', receipt);
  owner.publishActiveRoleContext({ source: 'physical_handoff', previousDefId: previous.defId, announce: true });
  return receipt;
}
