/** Bounded renewable extraction-work budget; economy owns this state, not asteroids or cargo.
 * One pool per canonical sector. Quantities are charged by reference work seconds, so
 * swapping ore IDs cannot multiply the faucet. Saveable high-water sequences reject replay.
 */
import { ECONOMY_BALANCE as B } from '../data/economyDerived.js';
import { recoverStock, finite, clamp } from './economyMath.js';
const C = B.resource;
const validKey = (key) => typeof key === 'string' && key.length > 0 && key.length <= 160
  && !['__proto__', 'constructor', 'prototype'].includes(key);
const validSeq = (seq) => Number.isSafeInteger(seq) && seq > 0;
const held = (pool) => Object.values(pool.leases).reduce((sum, lease) => sum + lease.workS, 0);
const copy = (value) => JSON.parse(JSON.stringify(value));

function newPool(now) {
  return { availableWorkS: C.capacityWorkS, updatedAt: now, highWater: 0, leases: {} };
}

/** Expirations are integrated at their exact simulation timestamps, not at the next render. */
export function advanceResourcePool(pool, now) {
  if (!Number.isFinite(now) || now < pool.updatedAt) return false;
  const expirations = Object.values(pool.leases).filter((l) => l.expiresAt <= now)
    .sort((a,b) => a.expiresAt-b.expiresAt || a.seq-b.seq);
  const advance = (to) => {
    pool.availableWorkS = recoverStock(pool.availableWorkS,
      Math.max(0,C.capacityWorkS-held(pool)),to-pool.updatedAt,C.halfLifeS);
    pool.updatedAt = to;
  };
  for (const lease of expirations) {
    advance(Math.max(pool.updatedAt,lease.expiresAt));
    // An unacknowledged spawn might exist: expiry burns the reservation, never refunds it.
    delete pool.leases[lease.id];
  }
  advance(now);
  return true;
}

export function resourceIntent(state, action, request, {maxTier=0} = {}) {
  const reject = (reason) => ({ok:false,reason});
  if (!state?.economy || !validKey(request?.sectorId)) return reject('bad_sector');
  const now = state.simTime;
  if (!Number.isFinite(now) || now < 0) return reject('bad_clock');
  if (!['reserve','settle','cancel'].includes(action)) return reject('bad_action');
  const bag = state.economy.resourceWork ||= {};
  const pool = Object.hasOwn(bag,request.sectorId) ? bag[request.sectorId] : null;
  if (pool && !advanceResourcePool(pool,now)) return reject('clock_regression');
  if (action === 'reserve') {
    const commodity = B.commodities[request.commodityId];
    if (!commodity || commodity.valuation !== 'extract') return reject('not_extractable');
    if (commodity.economyTier > maxTier) return reject('tier_unavailable');
    if (!validSeq(request.seq)) return reject('bad_sequence');
    if (!Number.isSafeInteger(request.qty) || request.qty <= 0) return reject('bad_quantity');
    const active = pool || (bag[request.sectorId] = newPool(now));
    const id = `rw:${request.sectorId}:${request.seq}`;
    if (active.leases[id]) {
      const prior = active.leases[id];
      return prior.commodityId === request.commodityId && prior.requestedQty === request.qty
        ? {ok:true,duplicate:true,...copy(prior)} : reject('sequence_conflict');
    }
    if (request.seq <= active.highWater) return reject('stale_sequence');
    if (Object.keys(active.leases).length >= C.maxLeasesPerSector) return reject('lease_capacity');
    const workPerUnit = commodity.workMinutes*60/commodity.lotUnits;
    const qty = Math.min(request.qty,Math.floor((Math.min(active.availableWorkS,Math.max(C.maxGrantWorkS,workPerUnit))+1e-9)/workPerUnit));
    if (qty < 1) return reject('work_depleted');
    const workS = qty*workPerUnit;
    const lease = {id,seq:request.seq,commodityId:request.commodityId,requestedQty:request.qty,qty,
      workS,issuedAt:now,expiresAt:now+C.maxLeaseS,maxTravelWu:C.maxTravelWu};
    active.availableWorkS = Math.max(0,active.availableWorkS-workS);
    active.highWater = request.seq;
    active.leases[id] = lease;
    return {ok:true,duplicate:false,...copy(lease)};
  }
  if (!pool) return reject('no_pool');
  const lease = typeof request.leaseId === 'string' && Object.hasOwn(pool.leases,request.leaseId)
    ? pool.leases[request.leaseId] : null;
  if (!lease) return reject('unknown_or_expired_lease');
  const producedQty = action === 'cancel' ? 0 : request.producedQty;
  if (!Number.isSafeInteger(producedQty) || producedQty < 0 || producedQty > lease.qty) return reject('bad_production');
  const consumedWorkS = lease.workS*producedQty/lease.qty;
  delete pool.leases[lease.id];
  pool.availableWorkS = Math.min(C.capacityWorkS-held(pool),pool.availableWorkS+lease.workS-consumedWorkS);
  return {ok:true,leaseId:lease.id,producedQty,consumedWorkS};
}

/** Read-only snapshot. This does not tick budgets or mint resources on save. */
export function serializeResourceWork(bag) { return copy(bag || {}); }

/** Bound hostile/old saves; only caller-supplied canonical sector IDs survive. */
export function restoreResourceWork(data, sectorIds) {
  const out = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const sectorId of sectorIds) {
    if (!validKey(sectorId) || !Object.hasOwn(data,sectorId)) continue;
    const src = data[sectorId];
    if (!src || typeof src !== 'object') continue;
    const pool = newPool(Math.max(0,finite(src.updatedAt)));
    pool.highWater = validSeq(src.highWater) ? src.highWater : 0;
    for (const item of Object.values(src.leases || {}).slice(0,C.maxLeasesPerSector)) {
      const commodity = item && B.commodities[item.commodityId];
      if (!commodity || commodity.valuation !== 'extract' || !validSeq(item.seq)
          || !Number.isSafeInteger(item.qty) || item.qty <= 0
          || !Number.isFinite(item.expiresAt) || item.expiresAt <= pool.updatedAt) continue;
      const workS = item.qty*commodity.workMinutes*60/commodity.lotUnits;
      if (workS > Math.max(C.maxGrantWorkS,commodity.workMinutes*60/commodity.lotUnits) || held(pool)+workS > C.capacityWorkS) continue;
      const id = `rw:${sectorId}:${item.seq}`;
      pool.leases[id] = {id,seq:item.seq,commodityId:item.commodityId,
        requestedQty: Math.max(item.qty,Math.floor(finite(item.requestedQty,item.qty))),qty:item.qty,workS,
        issuedAt: clamp(finite(item.issuedAt),0,pool.updatedAt),
        expiresAt: Math.min(item.expiresAt,pool.updatedAt+C.maxLeaseS),maxTravelWu:C.maxTravelWu};
      pool.highWater = Math.max(pool.highWater,item.seq);
    }
    pool.availableWorkS = clamp(finite(src.availableWorkS),0,C.capacityWorkS-held(pool));
    out[sectorId] = pool;
  }
  return out;
}
