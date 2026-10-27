import { occupantGenerationOf } from '../core/entity.js';
// PQ-177.06 — operation-owned cargo and one-commit sales.
// Production adapter for tools/reference/.../transferPlan.mjs semantics. That file is never imported.
// Canonical writers stay economy→credits and cargo→player cargo. An operation hold is NOT the
// player hold: workers may only move their own shipment.

export function ensureShipment(group) {
  if (!group || typeof group !== 'object') return null;
  if (!group.shipment || typeof group.shipment !== 'object') {
    group.shipment = {
      id: `shipment:${group.id || 'op'}`,
      owner: `operation:${group.id || 'op'}`,
      origin: group.sectorId || null,
      destination: null,
      items: {},
      deliveryState: 'loading',
    };
  }
  if (!group.shipment.items || typeof group.shipment.items !== 'object' || Array.isArray(group.shipment.items)) {
    group.shipment.items = {};
  }
  if (!group.saleReceipts || typeof group.saleReceipts !== 'object' || Array.isArray(group.saleReceipts)) {
    group.saleReceipts = {};
  }
  return group.shipment;
}

export function shipmentUsed(group) {
  const shipment = ensureShipment(group);
  if (!shipment) return 0;
  let used = 0;
  for (const qty of Object.values(shipment.items)) used += Math.max(0, qty | 0);
  return used;
}

export function shipmentQty(group, good) {
  const shipment = ensureShipment(group);
  if (!shipment || !good) return 0;
  return Math.max(0, shipment.items[good] | 0);
}

export function addToShipment(group, good, qty, capVolume) {
  const shipment = ensureShipment(group);
  if (!shipment || !good) return 0;
  const want = Math.max(0, Math.floor(Number(qty) || 0));
  if (want <= 0) return 0;
  const cap = Math.max(0, Math.floor(Number(capVolume) || 0));
  const room = Math.max(0, cap - shipmentUsed(group));
  const take = cap > 0 ? Math.min(want, room) : want;
  if (take <= 0) return 0;
  shipment.items[good] = (shipment.items[good] | 0) + take;
  shipment.deliveryState = 'loading';
  return take;
}

export function takeFromShipment(group, good, qty) {
  const shipment = ensureShipment(group);
  if (!shipment || !good) return 0;
  const want = Math.max(0, Math.floor(Number(qty) || 0));
  const have = shipment.items[good] | 0;
  const take = Math.min(want, have);
  if (take <= 0) return 0;
  const left = have - take;
  if (left <= 0) delete shipment.items[good];
  else shipment.items[good] = left;
  return take;
}

export function tradeFingerprint(plan) {
  return JSON.stringify([
    plan.stationId || null,
    plan.good,
    plan.quantity,
    plan.unitPrice,
    plan.quoteVersion,
  ]);
}

export function commitShipmentSale(group, plan, apply) {
  const shipment = ensureShipment(group);
  if (!shipment) return { ok: false, reason: 'no_shipment' };
  const intentId = plan && plan.intentId;
  if (typeof intentId !== 'string' || !intentId) return { ok: false, reason: 'invalid_intent' };
  const prior = group.saleReceipts[intentId];
  if (prior) {
    if (prior.fingerprint !== tradeFingerprint(plan)) {
      return { ok: false, reason: 'receipt_id_collision' };
    }
    return { ok: true, duplicate: true, receipt: prior.receipt };
  }
  const quantity = Math.max(0, Math.floor(Number(plan.quantity) || 0));
  if (quantity <= 0) return { ok: false, reason: 'invalid_quantity' };
  if (shipmentQty(group, plan.good) < quantity) return { ok: false, reason: 'insufficient_stock' };
  const removed = takeFromShipment(group, plan.good, quantity);
  if (removed !== quantity) return { ok: false, reason: 'insufficient_stock' };
  const credited = apply && typeof apply === 'function' ? apply(plan) : 0;
  const receipt = {
    id: intentId,
    stationId: plan.stationId || null,
    good: plan.good,
    quantity,
    unitPrice: plan.unitPrice | 0,
    total: plan.total | 0,
    quoteVersion: plan.quoteVersion,
    credited: credited | 0,
  };
  group.saleReceipts[intentId] = { fingerprint: tradeFingerprint(plan), receipt };
  shipment.destination = plan.stationId || shipment.destination;
  shipment.deliveryState = shipmentUsed(group) > 0 ? 'loading' : 'delivered';
  group.pendingSale = null;
  return { ok: true, duplicate: false, receipt };
}

export function ensureCommittedIntents(state) {
  if (!state || !state.economy) return null;
  if (!state.economy.committedIntents || typeof state.economy.committedIntents !== 'object'
    || Array.isArray(state.economy.committedIntents)) {
    state.economy.committedIntents = {};
  }
  return state.economy.committedIntents;
}

// ── AL-STORY-1 (row 423) — manifest declarations vs the rope's own reading ──────────────
// Pure helpers: they never move cargo, alter an entity's mass, or touch shipment records.
// The declaration lives on the mission's params (params.massDeclaration); the measured
// number comes off the live body only.

/**
 * The declared-mass metadata an ACTIVE mission carries for this physical target, or null.
 * The target must be stamped with that mission's identity (data.missionId / data.missionTag)
 * and the declaration's durable target slot — unrelated asteroids, escorts, and ambient
 * cargo never carry a declaration.
 */
export function massDeclarationForTarget(state, target) {
  if (!state || !target || target.alive === false || target.destroyed === true) return null;
  if (!state.entities?.get || state.entities.get(target.id) !== target) return null;
  const data = target.data && typeof target.data === 'object' ? target.data : null;
  if (!data) return null;
  const missionId = data.missionId != null && data.missionId !== ''
    ? String(data.missionId)
    : (data.missionTag != null && data.missionTag !== '' ? String(data.missionTag) : null);
  if (!missionId) return null;
  const active = state.missions && Array.isArray(state.missions.active) ? state.missions.active : null;
  if (!active) return null;
  const mission = active.find((m) => m && String(m.id) === String(missionId));
  if (!mission || mission.status !== 'active' || mission.type !== 'tow_recovery') return null;
  if (!Array.isArray(mission.targetEntityIds)
      || !mission.targetEntityIds.some(id => String(id) === String(target.id))) return null;
  const decl = mission.params && mission.params.massDeclaration;
  if (!decl || typeof decl !== 'object') return null;
  const declaredMassT = Number(decl.declaredMassT);
  const targetSlot = Number(decl.targetSlot);
  if (!Number.isFinite(declaredMassT) || !(declaredMassT > 0)
      || !Number.isSafeInteger(targetSlot) || targetSlot < 0) return null;
  if (massTargetSlotOf(data, missionId) !== targetSlot) return null;
  return {
    version: Number.isFinite(Number(decl.version)) ? Number(decl.version) : 1,
    kind: typeof decl.kind === 'string' && decl.kind ? decl.kind : null,
    declaredMassT,
    issuer: typeof decl.issuer === 'string' && decl.issuer ? decl.issuer : null,
    reference: decl.reference != null ? String(decl.reference) : null,
    targetSlot,
    missionId: String(mission.id),
    sourceOfferId: mission.sourceOfferId != null ? String(mission.sourceOfferId) : String(mission.id),
    issuingStationId: mission.destStationId != null ? String(mission.destStationId) : null,
  };
}

// A mission owner grants this transient lease only while stamping the actual original
// recovery body. Saved declaration fields alone never grant a Line-tier exception.
const massScaleTowLeases = new WeakMap();
const MASS_SCALE_ISSUERS = Object.freeze({ weight_audit: 'station_helios', sealed_recovery: 'station_smuggler', carrier_frame: 'station_ceres' });
function activeMassScaleTowMission(state, target) {
  if (!target || target.alive !== true || !(target.hull > 0) || target.type !== 'asteroid'
    || state?.entities?.get(target.id) !== target || target.data?.physicalRole !== 'slag_core') return null;
  const data=target.data,mission=state.missions?.active?.find(m=>m?.status==='active'
    &&m.type==='tow_recovery'&&m.id===data.missionId&&m.id===data.missionTag);
  const decl=mission?.params?.massDeclaration,stationId=MASS_SCALE_ISSUERS[decl?.kind];
  if (!mission || !stationId || decl.version!==1 || decl.targetSlot!==0
    || mission.destStationId!==stationId
    || mission.sourceOfferId!==`eco_mass_scale_${decl.kind}_${stationId}`
    || data.missionTargetSlot!==0 || data.identityKey!==`mission:${mission.id}:0`
    || !data.worldRecordId || !Number.isFinite(decl.declaredMassT) || !(decl.declaredMassT>0)) return null;
  return mission;
}
export function registerMassScaleTow(state, target, mission) {
  const generation=occupantGenerationOf(target);
  if (generation==null || activeMassScaleTowMission(state,target)!==mission) return false;
  massScaleTowLeases.set(target,{state,generation,mission,recordId:target.data.worldRecordId,identity:target.data.identityKey});
  return true;
}
export function isOriginalMassScaleTow(state, target) {
  const lease=target&&massScaleTowLeases.get(target),mission=activeMassScaleTowMission(state,target);
  return !!(lease&&mission&&lease.state===state&&lease.mission===mission
    &&lease.generation===occupantGenerationOf(target)&&lease.recordId===target.data.worldRecordId
    &&lease.identity===target.data.identityKey&&massDeclarationForTarget(state,target));
}

// Mirror of missions.js's missionTargetSlotOf (module-private there): explicit
// data.missionTargetSlot first, then the `mission:<id>:<slot>` identityKey tail.
function massTargetSlotOf(data, missionId) {
  const explicit = Number(data.missionTargetSlot);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  const identity = typeof data.identityKey === 'string' ? data.identityKey : '';
  const prefix = `mission:${missionId}:`;
  if (!identity.startsWith(prefix)) return null;
  const tail = identity.slice(prefix.length);
  if (!/^\d+$/.test(tail)) return null;
  const parsed = Number(tail);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Read the native-normalized body mass when published; entity mass is the pre-body fallback.
 * A mission's declaration and pre-physics spawn hint never override the mass the line moves.
 */
export function physicalMassT(target) {
  if (!target || target.alive === false || target.destroyed === true) return null;
  const bodyMass = Number(target.physicsBody?.mass);
  if (Number.isFinite(bodyMass) && bodyMass > 0) return bodyMass;
  const mass = Number(target.mass);
  return Number.isFinite(mass) && mass > 0 ? mass : null;
}

/** Declared vs measured. Pure arithmetic over two positive masses; null on invalid input. */
export function massDiscrepancy(declaredMassT, measuredMassT) {
  const declared = Number(declaredMassT);
  const measured = Number(measuredMassT);
  if (!Number.isFinite(declared) || !Number.isFinite(measured)
      || !(declared > 0) || !(measured > 0)) return null;
  const deltaMassT = measured - declared;
  const ratio = measured / declared;
  if (!Number.isFinite(ratio) || !(ratio > 0)) return null;
  return {
    declaredMassT: declared,
    measuredMassT: measured,
    deltaMassT,
    ratio,
    discrepant: Math.abs(deltaMassT) > Math.max(0.1, declared * 0.05),
  };
}

/**
 * Normalize the economyContracts.massScale save slice. Tolerant of old saves — a missing
 * or malformed slice yields the empty shape; every retained row is plain serializable data.
 */
export function normalizeMassScaleState(raw) {
  const out = { version: 1, slips: {}, completed: {}, fenceOffers: {} };
  if (raw && typeof raw === 'object' && Array.isArray(raw.pendingNotices)) {
    for (const row of raw.pendingNotices) {
      if (!row || typeof row !== 'object' || typeof row.text !== 'string' || !row.text) continue;
      out.pendingNotices = out.pendingNotices || [];
      if (out.pendingNotices.length < 8) {
        out.pendingNotices.push({
          text: row.text,
          statusText: row.statusText != null ? String(row.statusText) : null,
        });
      }
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (raw.slips && typeof raw.slips === 'object' && !Array.isArray(raw.slips)) {
    for (const key of Object.keys(raw.slips).sort()) {
      const row = normalizeMassSlip(raw.slips[key]);
      if (row) out.slips[row.slipId] = row;
    }
  }
  if (raw.completed && typeof raw.completed === 'object' && !Array.isArray(raw.completed)) {
    for (const key of Object.keys(raw.completed).sort()) {
      if (raw.completed[key]) out.completed[String(key)] = true;
    }
  }
  if (raw.fenceOffers && typeof raw.fenceOffers === 'object' && !Array.isArray(raw.fenceOffers)) {
    for (const key of Object.keys(raw.fenceOffers).sort()) {
      const row = normalizeFenceOffer(raw.fenceOffers[key]);
      if (row) out.fenceOffers[String(key)] = row;
    }
  }
  return out;
}

function normalizeMassSlip(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slipId = typeof raw.slipId === 'string' && raw.slipId ? raw.slipId : null;
  const kind = typeof raw.kind === 'string' && raw.kind ? raw.kind : null;
  const discrepancy = massDiscrepancy(raw.declaredMassT, raw.measuredMassT);
  const targetSlot = Number(raw.targetSlot);
  const sourceOfferId = raw.sourceOfferId != null ? String(raw.sourceOfferId) : null;
  if (!slipId || !kind || !discrepancy
      || !Number.isSafeInteger(targetSlot) || targetSlot < 0 || !sourceOfferId) return null;
  const filedAtStations = {};
  const filed = raw.filedAtStations;
  if (filed && typeof filed === 'object' && !Array.isArray(filed)) {
    for (const stationId of Object.keys(filed).sort()) {
      const row = filed[stationId];
      if (!row || typeof row !== 'object') continue;
      filedAtStations[String(stationId)] = {
        outcome: row.outcome != null ? String(row.outcome) : null,
        tick: Number.isFinite(Number(row.tick)) ? Number(row.tick) : null,
        simTime: Number.isFinite(Number(row.simTime)) ? Number(row.simTime) : null,
      };
    }
  }
  return {
    slipId,
    sourceOfferId,
    missionId: raw.missionId != null ? String(raw.missionId) : null,
    kind,
    issuer: raw.issuer != null ? String(raw.issuer) : null,
    reference: raw.reference != null ? String(raw.reference) : null,
    targetSlot,
    ...discrepancy,
    issuingStationId: raw.issuingStationId != null ? String(raw.issuingStationId) : null,
    weighedTick: Number.isFinite(Number(raw.weighedTick)) ? Number(raw.weighedTick) : null,
    weighedSimTime: Number.isFinite(Number(raw.weighedSimTime)) ? Number(raw.weighedSimTime) : null,
    filedAtStations,
    ...(raw.storyLine === true ? { storyLine: true } : {}),
  };
}

function normalizeFenceOffer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const offerId = typeof raw.offerId === 'string' && raw.offerId ? raw.offerId : null;
  if (!offerId) return null;
  return { offerId, completed: raw.completed === true };
}
