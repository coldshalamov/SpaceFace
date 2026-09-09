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
