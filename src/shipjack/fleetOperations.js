// Paid recovery dispatch. This owner moves custody/location records, never inventory or money.
// automation owns its purchased drone/trader groups; it has no owned-hull tow-service seam.
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { hash32 } from '../core/rng.js';
import { ensureShipjack, isBlackFlagAdventure, peekShipjack, vesselHistory } from './model.js';

import { FLEET_OPERATION_LIMITS, recoveryRoute } from './fleetPersistence.js';
export { FLEET_OPERATION_LIMITS, recoveryRoute, normalizeFleetPersistence } from './fleetPersistence.js';
const STATIONS = new Map(SECTORS.flatMap(s => (s.stations || []).map(st => [st.id, { ...st, sectorId: s.id }])));
const HULLS = new Map(SHIPS.map(s => [s.id, s]));
const FINAL = new Set(['destroyed', 'returned', 'sold', 'impounded', 'missing']);
const LOCK = new WeakSet();
const fail = reason => ({ ok: false, reason });
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_:.-]{3,120}$/.test(value);

function sourceFacts(state, payload) {
  if (!isBlackFlagAdventure(state)) return fail('Recovery dispatch is available in Adventure only');
  const sj = peekShipjack(state), vessel = sj?.vesselsById?.[payload.vesselId];
  const owned = state.player?.ownedShips?.find(s => s.vesselId === payload.vesselId);
  if (!vessel || !owned || vessel.custodian !== 'player') return fail('A physically acquired vessel in your custody is required');
  if (state.player.ownedShips[state.player.activeShipIndex] === owned || vessel.location?.entityId === state.playerId || vessel.location?.kind === 'active') return fail('The piloted ship cannot be placed on a recovery transport');
  if (vessel.location?.kind === 'missing') return fail('The physical signal is lost. Plot its last trajectory; a tender cannot collect an unconfirmed hull.');
  if (FINAL.has(vessel.location?.kind) || vessel.title === 'sold' || vessel.title === 'returned'
    || !(vessel.condition?.hull > 0)) return fail('This vessel is destroyed, released, or under an authority hold');
  if (vessel.location?.kind === 'in_transit') return fail('This vessel is already aboard a recovery transport');
  return { ok: true, sj, vessel, owned };
}

function fingerprint(vessel, stationId, action) {
  return hash32(vessel.vesselId, vessel.generation, vessel.revision || 0,
    vessel.custodian, vessel.title, vessel.location?.kind, vessel.location?.sectorId,
    vessel.location?.stationId || '', vessel.condition?.hull, stationId, action).toString(36);
}

export function quoteFleetOperation(state, payload = {}) {
  if (!['recover', 'secure_berth'].includes(payload.action)) return fail('Unknown recovery service');
  const f = sourceFacts(state, payload);
  if (!f.ok) return f;
  if (f.sj.fleetOperations?.[payload.vesselId]) return fail('A recovery crew is already assigned to this vessel');
  if (f.sj.yards?.[payload.vesselId]) return fail('Collect or cancel the cutter job before transporting this hull');
  const stationId = payload.stationId || (state.ui?.docked === true ? state.ui.dockedStationId : null);
  const station = STATIONS.get(stationId);
  if (!station || !(station.services || []).some(s => s === 'repair' || s === 'shipyard')) return fail('Choose a named repair yard or receiving berth');
  if (f.vessel.location.kind === 'berth' && f.vessel.location.stationId === stationId) return fail('This hull is already secured at that berth');
  const route = recoveryRoute(f.vessel.location.sectorId, station.sectorId);
  if (!route) return fail('No verified jump route reaches this receiving berth');
  const hull = HULLS.get(f.owned.defId);
  if (!hull) return fail('The receiver does not support this hull class');
  const hops = route.length - 1;
  const localTravel = Math.min(90, 20 + Math.hypot(finite(f.vessel.location.pos?.x), finite(f.vessel.location.pos?.z)) / 160);
  const legSeconds = Math.ceil(localTravel + hops * 45);
  const at = finite(state.simTime), departureAt = at + FLEET_OPERATION_LIMITS.dispatchDelay;
  const feeCr = Math.ceil(180 + finite(hull.mass, 20) * 2 + hops * 140 + (1 - f.vessel.condition.hull) * 120);
  return { ok: true, quote: { version: 1, vesselId: f.vessel.vesselId, action: payload.action,
    stationId, stationName: station.name, sourceSectorId: f.vessel.location.sectorId,
    route, feeCr, departureAt, pickupAt: departureAt + legSeconds,
    arrivalAt: departureAt + 2 * legSeconds, expiresAt: at + FLEET_OPERATION_LIMITS.quoteLife,
    fingerprint: fingerprint(f.vessel, stationId, payload.action),
    riskLine: 'Insured tow preserves hull, fittings and cargo. Cancel before dispatch for a full refund. An unavailable pickup costs 25% travel; title and warrants remain.' } };
}

function receipt(ctx, row) {
  const sj = ensureShipjack(ctx.state);
  sj.fleetReceipts ||= [];
  sj.fleetReceipts.push(row);
  if (sj.fleetReceipts.length > FLEET_OPERATION_LIMITS.receipts) sj.fleetReceipts.splice(0, sj.fleetReceipts.length - FLEET_OPERATION_LIMITS.receipts);
  ctx.bus.emit('save:dirty', { kind: 'player', payload: { source: 'shipjack_fleet' } });
  ctx.bus.emit('shipjack:fleetReceipt', row);
  return row;
}

function execute(ctx, payload) {
  const { state, bus, registry } = ctx;
  if (!isBlackFlagAdventure(state)) return fail('Recovery dispatch is available in Adventure only');
  if (!safeId(payload.operationId)) return fail('Missing valid recovery operation identity');
  const sj = ensureShipjack(state);
  const old = sj.fleetReceipts?.find(r => r.operationId === payload.operationId);
  if (old) return old.vesselId === payload.vesselId ? old : fail('Recovery operation identity belongs to another vessel');
  sj.fleetOperations ||= {};
  const same = Object.values(sj.fleetOperations).find(j => j.operationId === payload.operationId);
  if (same) return same.vesselId === payload.vesselId ? { ok: true, ...same } : fail('Recovery operation identity belongs to another vessel');
  if (payload.action === 'cancel_recovery') {
    const job = sj.fleetOperations[payload.vesselId];
    if (!job || job.operationId !== payload.jobOperationId) return fail('Identify the original recovery order to cancel it');
    if (job.status !== 'queued' || finite(state.simTime) >= job.departureAt) return fail('The tug has departed; its finite route can no longer be recalled');
    delete sj.fleetOperations[payload.vesselId];
    const vessel = sj.vesselsById[payload.vesselId];
    if (vessel) vesselHistory(state, vessel, 'tow_cancelled', `Recovery dispatch to ${job.stationName} cancelled before departure.`);
    receipt(ctx, { ok: false, status: 'cancelled', action: job.action, operationId: job.operationId, vesselId: job.vesselId, feeCr: 0, at: finite(state.simTime) });
    // Store terminal cancellation before refund observers can submit a duplicate.
    const result = receipt(ctx, { ok: true, status: 'cancelled', action: payload.action, operationId: payload.operationId,
      vesselId: job.vesselId, refundCr: job.feeCr, at: finite(state.simTime) });
    bus.emit('economy:grantCredits', { amount: job.feeCr, reason: `shipjack:tow-refund:${job.operationId}` });
    return result;
  }
  const checked = quoteFleetOperation(state, payload);
  if (!checked.ok) return checked;
  const q = payload.quote, fresh = checked.quote;
  if (!q || q.version !== 1 || !Number.isFinite(q.expiresAt) || finite(state.simTime) > q.expiresAt
    || q.vesselId !== fresh.vesselId || q.stationId !== fresh.stationId || q.action !== fresh.action
    || q.fingerprint !== fresh.fingerprint || q.feeCr !== fresh.feeCr) return fail('Recovery quote expired or the vessel changed; request a fresh dispatch quote');
  if (Object.keys(sj.fleetOperations).length >= FLEET_OPERATION_LIMITS.active) return fail('All eight insured recovery crews are assigned');
  if (!registry?.get?.('economy')) return fail('The canonical economy owner is unavailable');
  const job = { ...fresh, operationId: payload.operationId, status: 'queued', sourceGeneration: sj.vesselsById[payload.vesselId].generation };
  const payment = { amount: job.feeCr, expectedCredits: state.player.credits, requireFull: true,
    reason: `shipjack:tow:${job.operationId}`, result: false, commit: () => {
      sj.fleetOperations[job.vesselId] = job;
      vesselHistory(state, sj.vesselsById[job.vesselId], 'tow_booked', `Insured recovery booked for ${job.stationName}; ${job.feeCr} cr prepaid.`);
      return true;
    } };
  bus.emit('economy:chargeCredits', payment);
  if (payment.result !== true) return fail('Recovery payment was refused; no dispatch was created');
  bus.emit('shipjack:fleetStarted', job);
  return { ok: true, ...job };
}

export function executeFleetOperation(ctx, payload = {}) {
  if (LOCK.has(ctx.state)) return fail('Recovery dispatch is settling another order');
  LOCK.add(ctx.state);
  try { return execute(ctx, payload); } finally { LOCK.delete(ctx.state); }
}

function settleFailed(ctx, job, reason) {
  const sj = ensureShipjack(ctx.state);
  delete sj.fleetOperations[job.vesselId];
  const refundCr = job.status === 'queued' ? job.feeCr : Math.floor(job.feeCr * 0.75);
  const vessel = sj.vesselsById[job.vesselId];
  if (vessel) vesselHistory(ctx.state, vessel, 'tow_unavailable', `Recovery pickup failed: ${reason}. ${refundCr} cr refunded; last trajectory retained.`);
  receipt(ctx, { ok: false, status: 'failed', action: job.action, operationId: job.operationId,
    vesselId: job.vesselId, refundCr, reason, at: finite(ctx.state.simTime) });
  if (refundCr > 0) ctx.bus.emit('economy:grantCredits', { amount: refundCr, reason: `shipjack:tow-failed:${job.operationId}` });
}

export function advanceFleetOperations(ctx) {
  const { state, bus } = ctx;
  if (!isBlackFlagAdventure(state) || LOCK.has(state)) return;
  const sj = peekShipjack(state);
  if (!sj?.fleetOperations) return;
  LOCK.add(state);
  try {
    for (const job of Object.values(sj.fleetOperations).slice(0, FLEET_OPERATION_LIMITS.active)) {
      const at = finite(state.simTime), vessel = sj.vesselsById[job.vesselId];
      if (job.status === 'queued' && at >= job.departureAt) {
        const f = sourceFacts(state, job);
        if (!f.ok) { settleFailed(ctx, job, f.reason); continue; }
        job.status = 'outbound';
        bus.emit('save:dirty', { kind: 'player', payload: { source: 'shipjack_fleet' } });
        bus.emit('shipjack:fleetDeparted', job);
      }
      if (job.status === 'outbound' && at >= job.pickupAt) {
        const f = sourceFacts(state, job);
        if (!f.ok || vessel.location.sectorId !== job.sourceSectorId || vessel.generation !== job.sourceGeneration) {
          settleFailed(ctx, job, f.reason || 'The recorded vessel left its pickup sector'); continue;
        }
        const entity = state.entities?.get(vessel.location.entityId);
        if (entity?.alive && (entity.data?.vesselId !== vessel.vesselId || entity.data?.shipjackGeneration !== vessel.generation)) {
          settleFailed(ctx, job, 'The numeric contact now belongs to a different vessel'); continue;
        }
        if (entity?.alive && (typeof ctx.detachVessel !== 'function' || ctx.detachVessel(vessel) !== true)) {
          settleFailed(ctx, job, 'The physical hull could not be safely released to the tug'); continue;
        }
        vessel.location = { ...vessel.location, kind: 'in_transit', entityId: null, stationId: null, at };
        vesselHistory(state, vessel, 'tow_pickup', `Recovery crew secured the hull for ${job.stationName}; damage and cargo sealed unchanged.`);
        job.status = 'towing';
        bus.emit('save:dirty', { kind: 'player', payload: { source: 'shipjack_fleet' } });
        bus.emit('shipjack:fleetPickedUp', job);
      }
      if (job.status === 'towing' && at >= job.arrivalAt) {
        const station = STATIONS.get(job.stationId);
        if (!vessel || !station) continue; // normalizer excludes invalid destination records
        vessel.location = { kind: 'berth', stationId: station.id, sectorId: station.sectorId, entityId: null,
          pos: { x: finite(station.pos?.x), z: finite(station.pos?.z) }, vel: { x: 0, z: 0 }, rot: finite(vessel.location.rot), angVel: 0, at };
        vesselHistory(state, vessel, 'tow_arrived', `Delivered to ${job.stationName}; custody, title, cargo and installed instances unchanged.`);
        delete sj.fleetOperations[job.vesselId];
        const result = receipt(ctx, { ok: true, status: 'arrived', action: job.action, operationId: job.operationId,
          vesselId: job.vesselId, stationId: job.stationId, stationName: job.stationName, feeCr: job.feeCr, at });
        ctx.arriveVessel?.(job, vessel);
        bus.emit('shipjack:fleetArrived', result);
      }
    }
  } finally { LOCK.delete(state); }
}

