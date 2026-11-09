// Adapter to existing single writers. No wallet, cargo-cache or hull writer lives here.
import { addCargo, removeCargo, sellableCargoQuantity } from '../../systems/cargo.js';
import { stationServices } from '../../systems/stationServices.js';
import { TENDER_CONFIG as C } from './model.js';

const serviceBindings = new WeakMap();
function ownedVessel(state) { return state.player?.ownedShips?.[state.player.activeShipIndex || 0]?.vesselId || ''; }
/** Called only after the save owner has restored/remapped the actual player hull. */
export function rebindTenderService(ctx, row) {
  serviceBindings.delete(ctx.state);
  const e = ctx.state.entities?.get(ctx.state.playerId), j = row.service;
  if (!j || !e?.alive || (ctx.state.player.activeShipIndex || 0) !== j.shipIndex
    || (e.data?.defId || '') !== j.shipDefId || (j.vesselId && ownedVessel(ctx.state) !== j.vesselId)) return false;
  serviceBindings.set(ctx.state, { jobId: j.id, entity: e, generation: e.occupantGeneration });
  return true;
}

export function tenderCostQuote(state, cost) {
  const items = Object.entries(cost?.items || {}).map(([id, qty]) => ({
    id, qty, available: sellableCargoQuantity(state, id),
  }));
  return {
    credits: cost?.credits || 0, balance: Number(state.player?.credits) || 0, items,
    canUseParts: items.every(r => r.available >= r.qty),
    canUseCredits: (Number(state.player?.credits) || 0) >= (cost?.credits || 0),
  };
}

/** Exact charge is the economy owner's transaction fence. A stale balance, absent owner,
 * or reentrant request cannot consume parts or move progression for a partial payment. */
export function payTenderCost(ctx, cost, method, commit) {
  const { state, bus } = ctx;
  const quote = tenderCostQuote(state, cost);
  const useParts = method !== 'credits';
  if (useParts && !quote.canUseParts) return { ok: false, reason: 'Recovered parts are short. Sealed freight is not accepted.' };
  if (!useParts && !quote.canUseCredits) return { ok: false, reason: `Need ${quote.credits} cr; you have ${quote.balance} cr.` };
  const removed = [];
  const request = {
    amount: useParts ? 0 : quote.credits, expectedCredits: quote.balance,
    requireFull: true, reason: 'salvageTender:restoration', result: false,
    commit() {
      if (useParts) {
        if (!quote.items.every(r => sellableCargoQuantity(state, r.id) >= r.qty)) return false;
        for (const item of quote.items) {
          const n = removeCargo(state, item.id, item.qty);
          if (n) removed.push([item.id, n]);
          if (n !== item.qty) {
            for (const [id, qty] of removed) addCargo(state, id, qty);
            return false;
          }
        }
      }
      if (commit() === true) return true;
      for (const [id, qty] of removed) addCargo(state, id, qty);
      return false;
    },
  };
  bus.emit('economy:chargeCredits', request);
  return request.result === true ? { ok: true, payment: useParts ? 'parts' : 'credits' }
    : { ok: false, reason: 'The quote changed or the payment owner is unavailable. Nothing was installed.' };
}

export function tenderServiceQuote(state, row, type) {
  const player = state.entities?.get(state.playerId);
  if (!player?.alive) return { ok: false, reason: 'A live ship is required.' };
  if (row.service) return { ok: false, reason: 'Finish or pause the booked work before starting another service.' };
  if (!row.owned) return { ok: false, reason: 'Recover and claim Morrowlight first.' };
  const hullMissing = Math.max(0, (player.hullMax || 0) - (player.hull || 0));
  const armorMissing = Math.max(0, (player.armorMax || 0) - (player.armorHp || 0));
  if (type === 'emergency') {
    if (!row.emergencyAvailable) return { ok: false, reason: 'The starter weld is spent. Restore the bench or bring scrap.' };
    const units = Math.max(0, Math.min(hullMissing, (player.hullMax || 0) * C.emergencyHullFraction - (player.hull || 0)));
    return units > 0 ? { ok: true, units, commodity: '', count: 0, hullShare: 1, armorShare: 0 }
      : { ok: false, reason: 'Your hull is already above the emergency weld floor.' };
  }
  if (type === 'refuel') {
    const missing = Math.max(0, (state.fuel?.max || 0) - (state.fuel?.current || 0));
    if (!(missing > 0)) return { ok: false, reason: 'Your fuel tank is full.' };
    if (sellableCargoQuantity(state, 'cmdty_fuel_cells') < 1) return { ok: false, reason: 'The pump needs one unsealed fuel cell from your hold.' };
    return { ok: true, units: Math.min(C.fuelPerCell, missing), commodity: 'cmdty_fuel_cells', count: 1, hullShare: 0, armorShare: 0 };
  }
  if (type !== 'repair') return { ok: false, reason: 'Unknown service.' };
  if (row.stage < 2) return { ok: false, reason: 'Restore the Working Bench for full hull and armor repair.' };
  if (!(hullMissing + armorMissing > 0)) return { ok: false, reason: 'Hull and armor are intact.' };
  if (sellableCargoQuantity(state, 'cmdty_scrap_metal') < 1) return { ok: false, reason: 'The bench needs one unsealed scrap metal from your hold.' };
  return { ok: true, units: Math.min(C.repairPerScrap, hullMissing + armorMissing), commodity: 'cmdty_scrap_metal', count: 1,
    hullShare: hullMissing / (hullMissing + armorMissing), armorShare: armorMissing / (hullMissing + armorMissing) };
}

export function bookTenderService(ctx, row, type) {
  const q = tenderServiceQuote(ctx.state, row, type);
  if (!q.ok) return q;
  const player = ctx.state.entities.get(ctx.state.playerId);
  const pending = {
    id: `${C.id}:service:${row.revision}`, type, requested: q.units, remaining: q.units, delivered: 0,
    shipIndex: ctx.state.player.activeShipIndex || 0, shipDefId: player.data?.defId || '',
    vesselId: ownedVessel(ctx.state),
    startedAt: ctx.state.simTime, rate: C.serviceRate * (row.stage >= 3 ? 2 : 1),
    hullShare: q.hullShare, armorShare: q.armorShare,
    deliveredHull: 0, deliveredArmor: 0, deliveredFuel: 0,
    paidCommodity: q.commodity, paidUnits: q.count,
    beforeProtection: (player.hull || 0) + (player.armorHp || 0), paused: false, pauseReason: '',
  };
  // Reserve before the cargo owner emits cargo:changed; a nested button cannot book twice.
  row.service = pending;
  serviceBindings.set(ctx.state, { jobId: pending.id, entity: player, generation: player.occupantGeneration });
  if (q.count && removeCargo(ctx.state, q.commodity, q.count) !== q.count) {
    row.service = null;
    return { ok: false, reason: 'The supplies changed before the work was booked.' };
  }
  if (type === 'emergency') row.emergencyAvailable = false;
  row.revision++;
  return { ok: true, service: pending };
}

/** Uses the existing yard's delivery writer without pretending the pilot is docked at a
 * station. The feature supplies scheduling and a physically checked local service berth. */
export function stepTenderService(ctx, row, dt, gate) {
  const job = row.service;
  if (!job) return null;
  const state = ctx.state, player = state.entities?.get(state.playerId);
  const binding = serviceBindings.get(state);
  const sameHull = !!player?.alive && (state.player.activeShipIndex || 0) === job.shipIndex
    && (player.data?.defId || '') === job.shipDefId && (!job.vesselId || ownedVessel(state) === job.vesselId)
    && binding?.jobId === job.id && binding.entity === player && binding.generation === player.occupantGeneration;
  if (!sameHull || !gate.ok) {
    job.paused = true; job.pauseReason = sameHull ? gate.reason : 'This work belongs to your previous hull. Return in it or cancel the unused work.';
    return null;
  }
  if (!(dt > 0) || !Number.isFinite(dt)) return null;
  job.paused = false; job.pauseReason = '';
  const amount = Math.min(job.remaining, job.rate * dt);
  const before = (job.deliveredHull || 0) + (job.deliveredArmor || 0) + (job.deliveredFuel || 0);
  const delivery = { ...job, type: job.type === 'refuel' ? 'refuel' : 'repair', meta: { shares: { hull: job.hullShare, armor: job.armorShare } } };
  stationServices._applyJobDelta(state, delivery, amount);
  const gained = Math.max(0, delivery.deliveredHull + delivery.deliveredArmor + delivery.deliveredFuel - before);
  job.deliveredHull = delivery.deliveredHull; job.deliveredArmor = delivery.deliveredArmor; job.deliveredFuel = delivery.deliveredFuel;
  job.delivered = Math.min(job.requested, job.delivered + gained);
  job.remaining = Math.max(0, job.requested - job.delivered);
  // A full tank/hull cannot burn paid work that did not fit. It waits for need or cancellation.
  if (gained <= 1e-9 && job.remaining > 1e-6) { job.paused = true; job.pauseReason = 'The serviced capacity is full; unused work remains booked.'; }
  if (job.type === 'refuel' && gained > 0) ctx.bus.emit('fuel:changed', { current: state.fuel.current, max: state.fuel.max });
  if (job.remaining > 1e-6) return { ok: true, gained, completed: false };
  row.service = null; row.revision++;
  // Mark complete before the receipt, so duplicate callbacks cannot award the work again.
  ctx.bus.emit('service:completed', {
    jobId: job.id, type: job.type === 'refuel' ? 'refuel' : 'repair', source: C.owner, cost: 0,
    restoredHull: job.deliveredHull, restoredArmor: job.deliveredArmor, units: job.deliveredFuel,
    hullMax: player.hullMax, armorMax: player.armorMax || 0, beforeProtection: job.beforeProtection,
  });
  return { ok: true, gained, completed: true, job };
}

export function cancelTenderService(ctx, row) {
  const job = row.service;
  if (!job) return { ok: false, reason: 'No service is booked.' };
  const untouched = job.delivered <= 1e-9;
  // One cell or plate becomes work when used. An untouched one is returned through cargo.
  if (untouched && job.paidUnits) {
    const accepted = addCargo(ctx.state, job.paidCommodity, job.paidUnits);
    if (accepted !== job.paidUnits) return { ok: false, reason: 'Make room for the unused supplies before cancelling.' };
  }
  if (untouched && job.type === 'emergency') row.emergencyAvailable = true;
  row.service = null; row.revision++;
  return { ok: true, refunded: untouched ? job.paidUnits : 0, spentWork: !untouched };
}

export function repairTenderHull(ctx, row, body) {
  if (!body?.alive) return { ok: false, reason: 'The original hull is unavailable.' };
  const missing = Math.max(0, body.hullMax - body.hull);
  if (!(missing > 0)) return { ok: false, reason: 'Morrowlight’s hull is intact.' };
  if (sellableCargoQuantity(ctx.state, 'cmdty_scrap_metal') < 1) return { ok: false, reason: 'Bring one unsealed scrap metal for a 30-point hull patch.' };
  if (removeCargo(ctx.state, 'cmdty_scrap_metal', 1) !== 1) return { ok: false, reason: 'The scrap changed.' };
  const job = { type: 'repair', deliveredHull: 0, deliveredArmor: 0, meta: { shares: { hull: 1, armor: 0 } } };
  // Same yard writer, bound to the actual barge; no docking or wallet state is faked.
  stationServices._applyJobDelta({ ...ctx.state, playerId: body.id }, job, Math.min(30, missing));
  row.revision++;
  return { ok: true, restoredHull: job.deliveredHull };
}
