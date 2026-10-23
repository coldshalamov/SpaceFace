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

// Rope-scale read contracts. These helpers do not move cargo, mint a measurement,
// or file a slip; their callers retain those authorities.
const massScaleKinds = new Set(['weight_audit', 'sealed_recovery', 'carrier_frame']);
const massRecord = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const massText = (v) => typeof v === 'string' && v.length > 0;
const massPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const massSlot = (v) => Number.isSafeInteger(v) && v >= 0;
const massKey = (v) => massText(v) && !['__proto__', 'constructor', 'prototype'].includes(v);

/** Match the physical mass precedence used by tetherGameplay, but never invent 1 t. */
export function physicalMassT(entity) {
  if (!entity || entity.alive === false) return null;
  if (massPositive(entity.physicsBody?.mass)) return entity.physicsBody.mass;
  return massPositive(entity.mass) ? entity.mass : null;
}

/** Read only an active tow target's authored declaration, never its displayed title. */
export function massDeclarationForTarget(state, target) {
  if (!target || target.alive === false || target.id == null
      || state?.entities?.get?.(target.id) !== target) return null;
  const data = target.data;
  if (!massRecord(data)) return null;
  const tag = data.missionTag ?? data.missionId;
  if (tag == null || (data.missionTag != null && data.missionId != null
      && String(data.missionTag) !== String(data.missionId))) return null;
  const matches = (Array.isArray(state?.missions?.active) ? state.missions.active : [])
    .filter((m) => m && String(m.id) === String(tag));
  if (matches.length !== 1) return null;
  const m = matches[0], d = m.params?.massDeclaration;
  if (m.status !== 'active' || m.type !== 'tow_recovery' || !massRecord(d)
      || d.version !== 1 || !massScaleKinds.has(d.kind) || !massPositive(d.declaredMassT)
      || !massSlot(d.targetSlot) || !massText(d.issuer) || !massText(d.reference)
      || !massText(m.sourceOfferId) || !massText(m.stationId)
      || !Array.isArray(m.targetEntityIds) || !m.targetEntityIds.includes(target.id)) return null;
  let slot = data.missionTargetSlot;
  const prefix = 'mission:' + m.id + ':';
  if (slot == null && typeof data.identityKey === 'string' && data.identityKey.startsWith(prefix)) {
    const tail = data.identityKey.slice(prefix.length);
    if (/^\d+$/.test(tail)) slot = Number(tail);
  }
  if (!massSlot(slot) || slot !== d.targetSlot) return null;
  return {
    missionId: m.id, sourceOfferId: m.sourceOfferId, targetSlot: slot,
    kind: d.kind, issuer: d.issuer, reference: d.reference,
    declaredMassT: d.declaredMassT, issuingStationId: m.stationId,
  };
}

/** Absolute mismatch and ratio in tonnes; 1e-6 is the caller consistency epsilon, not a gameplay margin. */
export function massDiscrepancy(declaredMassT, measuredMassT) {
  if (!massPositive(declaredMassT) || !massPositive(measuredMassT)) return null;
  const deltaMassT = Math.abs(measuredMassT - declaredMassT);
  const ratio = measuredMassT / declaredMassT;
  if (!Number.isFinite(deltaMassT) || (!Number.isFinite(ratio) || ratio <= 0)) return null;
  return { declaredMassT, measuredMassT, deltaMassT, ratio, discrepant: deltaMassT > 1e-6 };
}

const massTime = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Detached plain save data. Invalid evidence is discarded, not upgraded into a slip. */
export function normalizeMassScaleState(raw) {
  const out = { version: 1, slips: {}, completed: {}, fenceOffers: {} };
  if (!massRecord(raw) || (raw.version != null && raw.version !== 1)) return out;
  for (const [key, s] of Object.entries(massRecord(raw.slips) ? raw.slips : {})) {
    if (!massKey(key) || !massRecord(s) || key !== s.slipId
        || !massText(s.sourceOfferId) || !massText(s.missionId)
        || !massSlot(s.targetSlot) || key !== 'mass-slip:' + s.sourceOfferId + ':' + s.targetSlot
        || !massScaleKinds.has(s.kind) || !massText(s.issuer) || !massText(s.reference)
        || !massText(s.issuingStationId)) continue;
    const disc = massDiscrepancy(s.declaredMassT, s.measuredMassT);
    if (!disc) continue;
    const row = {
      slipId: key, sourceOfferId: s.sourceOfferId, missionId: s.missionId,
      kind: s.kind, issuer: s.issuer, reference: s.reference, targetSlot: s.targetSlot,
      ...disc, issuingStationId: s.issuingStationId,
      weighedTick: massSlot(s.weighedTick) ? s.weighedTick : null,
      weighedSimTime: massTime(s.weighedSimTime), filedAtStations: {},
    };
    for (const [station, filing] of Object.entries(massRecord(s.filedAtStations) ? s.filedAtStations : {})) {
      const outcome = s.kind === 'weight_audit' ? 'mass_discrepancy_filed'
        : s.kind === 'carrier_frame' ? 'mass_frame_disputed' : null;
      if (!massKey(station) || station !== s.issuingStationId || !outcome
          || !massRecord(filing) || filing.outcome !== outcome) continue;
      row.filedAtStations[station] = {
        outcome, tick: massSlot(filing.tick) ? filing.tick : null, simTime: massTime(filing.simTime),
      };
    }
    if (s.storyLine === true) row.storyLine = true;
    out.slips[key] = row;
  }
  for (const [key, done] of Object.entries(massRecord(raw.completed) ? raw.completed : {})) {
    if (massKey(key) && key.startsWith('eco_mass_scale_') && done === true) out.completed[key] = true;
  }
  for (const [key, f] of Object.entries(massRecord(raw.fenceOffers) ? raw.fenceOffers : {})) {
    if (!massKey(key) || !massRecord(f) || f.offerId !== 'eco_mass_scale_fence_' + key) continue;
    out.fenceOffers[key] = { offerId: f.offerId, completed: f.completed === true };
  }
  if (Array.isArray(raw.pendingNotices)) {
    out.pendingNotices = raw.pendingNotices.filter((n) => massRecord(n) && massText(n.text))
      .slice(0, 8).map((n) => ({ text: n.text, statusText: massText(n.statusText) ? n.statusText : null }));
  }
  return out;
}
