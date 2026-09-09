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
