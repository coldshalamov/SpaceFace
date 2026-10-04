// Canonical synchronous pickup acceptance contract shared by physical collection owners and
// downstream feedback consumers. The mutable pickup:collected payload is finalized before the
// event bus returns, so consumers must treat acceptedAmount as authoritative whenever either
// acceptance field is present. Events without either field retain legacy full-consume semantics.

export const PICKUP_ACCEPTANCE_RETRY_S = 0.75;

export function finiteWholePickupAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function hasExplicitPickupAcceptance(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(payload, 'acceptedAmount') ||
    Object.prototype.hasOwnProperty.call(payload, 'rejectedAmount');
}

export function resolvePickupAcceptance(
  payload,
  requestedAmount = payload && (payload.amount ?? payload.qty),
) {
  const requested = finiteWholePickupAmount(requestedAmount);
  if (!hasExplicitPickupAcceptance(payload)) {
    return {
      requested,
      accepted: requested,
      rejected: 0,
      successfulAmount: requested,
      legacyFullConsume: true,
    };
  }

  // The accepted field is the only success authority. A rejected-only, malformed, negative, or
  // non-finite receipt therefore accepts nothing and leaves the requested physical quantity intact.
  const accepted = Math.min(requested, finiteWholePickupAmount(payload.acceptedAmount));
  return {
    requested,
    accepted,
    rejected: requested - accepted,
    successfulAmount: accepted,
    legacyFullConsume: false,
  };
}

export function successfulPickupAmount(payload, requestedAmount) {
  return requestedAmount === undefined
    ? resolvePickupAcceptance(payload).successfulAmount
    : resolvePickupAcceptance(payload, requestedAmount).successfulAmount;
}

// A partial acceptance leaves the physical remainder on the same body — and every quantity
// mirror that body carries must shrink with data.amount or raw readers over-report the
// residual. The mirrors and their own conventions:
//   • richLotSource.richQty / .lotQty — provenance fractions: the accepted side already
//     recorded min(offered, accepted) on the receipt (cargo.appendRichLot), so the remainder
//     keeps old − taken, clamped at zero.
//   • freightCustodyPod.qty — the custody annotation IS the pod's quantity
//     (podEntityForRecord requires annotation.qty === data.amount), so it takes the
//     remainder itself, on a shrink or a regrow.
//   • salvagePool[commodityId] — a pool stamped at the full quantity drains by the same
//     delta (the volatile-vent split) or a later scoop credits units already delivered.
//     Key deletion at zero mirrors the pool's own drain convention.
// Mirrors are mutated in place when mutable and replaced on data when frozen — the pod's
// own record is authoritative either way.
export function writePickupRemainder(data, remainder) {
  if (!data || typeof data !== 'object') return 0;
  const left = Math.max(0, Math.floor(Number(remainder) || 0));
  const before = Math.max(0, Math.floor(Number(data.amount) || 0));
  const taken = Math.max(0, before - left);
  data.amount = left;
  const freight = data.freightCustodyPod;
  if (freight && typeof freight === 'object' && freight.qty !== left) {
    if (Object.isFrozen(freight)) data.freightCustodyPod = { ...freight, qty: left };
    else freight.qty = left;
  }
  if (!(taken > 0)) return left;
  const rich = data.richLotSource;
  if (rich && typeof rich === 'object') {
    let shrunk = null;
    for (const key of ['richQty', 'lotQty']) {
      if (rich[key] == null) continue;
      const value = Math.max(0, Math.max(0, Math.floor(Number(rich[key]) || 0)) - taken);
      if (value !== rich[key]) (shrunk = shrunk || {})[key] = value;
    }
    if (shrunk) {
      if (Object.isFrozen(rich)) data.richLotSource = { ...rich, ...shrunk };
      else Object.assign(rich, shrunk);
    }
  }
  const pool = data.salvagePool;
  if (pool && typeof pool === 'object' && data.commodityId != null
    && Object.prototype.hasOwnProperty.call(pool, data.commodityId)) {
    const value = Math.max(0, Math.max(0, Math.floor(Number(pool[data.commodityId]) || 0)) - taken);
    if (value !== pool[data.commodityId]) {
      if (Object.isFrozen(pool)) {
        const next = { ...pool };
        if (value > 0) next[data.commodityId] = value;
        else delete next[data.commodityId];
        data.salvagePool = next;
      } else if (value > 0) pool[data.commodityId] = value;
      else delete pool[data.commodityId];
    }
  }
  return left;
}

export function clearPickupAcceptanceRetry(data) {
  if (!data || typeof data !== 'object') return;
  delete data.pickupAcceptanceRetryAt;
  delete data.pickupAcceptanceRetryCollectorId;
}

export function pickupAcceptanceRetryBlocks(data, collectorId, playerId, simTime) {
  if (!data || typeof data !== 'object') return false;
  const retryAt = Number(data.pickupAcceptanceRetryAt);
  const now = Number.isFinite(Number(simTime)) ? Number(simTime) : 0;
  if (!Number.isFinite(retryAt) || now >= retryAt) {
    clearPickupAcceptanceRetry(data);
    return false;
  }

  // Compatibility: old saves only persisted the deadline. Those holds were authored by the player
  // collector, so preserve the player embargo while allowing a distinct NPC/drone to collect.
  const retryCollectorId = data.pickupAcceptanceRetryCollectorId == null
    ? playerId
    : data.pickupAcceptanceRetryCollectorId;
  return retryCollectorId === collectorId;
}

export function setPickupAcceptanceRetry(data, collectorId, retryAt) {
  if (!data || typeof data !== 'object') return;
  const deadline = Number(retryAt);
  if (!Number.isFinite(deadline)) {
    clearPickupAcceptanceRetry(data);
    return;
  }
  data.pickupAcceptanceRetryAt = deadline;
  data.pickupAcceptanceRetryCollectorId = collectorId;
}
