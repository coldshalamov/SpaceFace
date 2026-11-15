// services.js — Breakwater Spur canonical service adapters. Credits are written
// only by the economy owner (chargeCredits requireFull/commit fences,
// grantCredits receipts); cargo only by the cargo owner (removeCargo);
// repair/fuel application only by the station yard (_applyJobDelta). This
// module owns quotes and the spur's finite stock ledger — nothing else.

import {
  BREAKWATER_OWNER, BREAKWATER_STOCK, BREAKWATER_COOP_JOBS,
  BREAKWATER_BONDED, BREAKWATER_CHARTER,
} from './definition.js';
import { sellableCargoQuantity } from '../../systems/cargo.js';
import { quoteMissionEconomics } from '../../economy/economyMissionTerms.js';
import { cartridgesSeated } from './project.js';

const REPAIR_CR_PER_HP = 0.9;   // canonical economy rate (SERVICE_PRICES.repairCrPerHp)
const FUEL_CR_PER_UNIT = 3;     // canonical economy rate (SERVICE_PRICES.fuelCrPerUnit)

function finite(n, fallback = 0) { return Number.isFinite(n) ? n : fallback; }

// Same integer-unit quote and rounded debit as the actual service writer.
export function breakwaterServicePrice(kind, units) {
  return units > 0 ? Math.max(1, Math.round(units * (kind === 'repair' ? REPAIR_CR_PER_HP : FUEL_CR_PER_UNIT))) : 0;
}
export function affordableBreakwaterServiceUnits(kind, units, credits) {
  const available = Math.max(0, Math.floor(finite(units)));
  const balance = Math.max(0, finite(credits));
  let low = 0, high = available;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (breakwaterServicePrice(kind, mid) <= balance) low = mid; else high = mid - 1;
  }
  return low;
}

export function createBreakwaterSpurServices(ctx) {
  const state = ctx.state;
  const bus = ctx.bus;

  function economy() { return ctx.registry?.get?.('economy') || null; }
  function yard() { return ctx.registry?.get?.('stationServices') || null; }

  function playerEntity() {
    const p = state.entities?.get?.(state.playerId);
    return p?.alive ? p : null;
  }

  // --- cargo reads -------------------------------------------------------------

  function cargoQty(cmdtyId) {
    try { return finite(sellableCargoQuantity(state, cmdtyId), 0); }
    catch { return 0; }
  }

  // --- quotes -------------------------------------------------------------------

  // The published service price list — finite stock, canonical unit prices.
  function serviceQuotes(row) {
    const stock = row.coop.stock;
    const ship = playerEntity();
    const hpMissing = Math.max(0, finite(ship?.hullMax) - finite(ship?.hull));
    const fuelMissing = Math.max(0, finite(state.fuel?.max) - finite(state.fuel?.current));
    return {
      repair: {
        units: Math.min(stock.repair, Math.floor(hpMissing)),
        pricePer: REPAIR_CR_PER_HP,
        stock: stock.repair, cap: BREAKWATER_STOCK.repairCap,
      },
      fuel: {
        units: Math.min(stock.fuel, Math.floor(fuelMissing)),
        pricePer: FUEL_CR_PER_UNIT,
        stock: stock.fuel, cap: BREAKWATER_STOCK.fuelCap,
      },
    };
  }

  function commissionQuote(row) {
    return {
      scrap: { cmdty: 'cmdty_scrap_metal', qty: 4, held: cargoQty('cmdty_scrap_metal') },
      electronics: { cmdty: 'cmdty_salvage_electronics', qty: 1, held: cargoQty('cmdty_salvage_electronics') },
    };
  }

  // Bonded charter — canonical equivalent contract quote for the published
  // terms. The authored price is fixed by the commission spec; this quote is
  // the "specialized freight information" the charter surfaces.
  function freightIntel() {
    try {
      const q = quoteMissionEconomics({
        type: BREAKWATER_BONDED.equivalentJob.type,
        tier: BREAKWATER_BONDED.equivalentJob.tier,
        riskTier: BREAKWATER_BONDED.equivalentJob.riskTier,
        distance: 2150,
        params: { cmdtyId: 'cmdty_machine_parts', qty: 1 },
        preloadedCargo: true,
      });
      return {
        equivalentRewardCr: finite(q?.rewardCr, BREAKWATER_BONDED.payCr),
        equivalentCollateralCr: finite(q?.collateralCr, BREAKWATER_BONDED.bondCr),
        expectedNetCrPerHour: finite(q?.expectedNetCrPerHour, 0),
      };
    } catch {
      return { equivalentRewardCr: BREAKWATER_BONDED.payCr, equivalentCollateralCr: BREAKWATER_BONDED.bondCr, expectedNetCrPerHour: 0 };
    }
  }

  // --- money fences ----------------------------------------------------------------

  // Exact-payment charge: commit() runs before the credit move inside the
  // economy owner's requireFull path; p.result === true only on full success.
  function chargeExact(amount, reason, commit) {
    const p={amount,reason,requireFull:true,expectedCredits:finite(state.player?.credits,0),
      commit:()=>{try{return commit ? commit()===true : true;}catch{return false;}},result:false};
    bus.emit('economy:chargeCredits',p);
    return p.result === true;
  }

  // --- commissioning debit ----------------------------------------------------------

  // Debited once from real cargo through the canonical cargo owner. The draw
  // is atomic: a short second draw returns the first, and nothing commits but
  // the paid receipt.
  async function payCommission(row) {
    if (row.commission.status === 'paid') return { ok: false, reason: 'already_paid' };
    // The dispatcher only puts the spur on the books once both originals seat —
    // the offer surfaces this at PH.READY, and the action gate holds the same line.
    if (cartridgesSeated(row) < 2) return { ok: false, reason: 'not_restored' };
    const q=commissionQuote(row);
    if (q.scrap.held<q.scrap.qty) return {ok:false,reason:'need_scrap'};
    if (q.electronics.held<q.electronics.qty) return {ok:false,reason:'need_electronics'};
    const receipt=ctx.registry?.get?.('cargo')?.acceptBreakwaterMaterials?.('commission');
    if (!receipt?.ok) return {ok:false,reason:receipt?.reason || 'cargo_unavailable'};
    return { ok: true };
  }

  // --- cooperative berth services -----------------------------------------------------

  // Finite stock + canonical debit: the yard delivery and the stock decrement
  // commit inside the economy owner's exact-charge fence — service can never
  // apply without its accepted debit, nor debit without the delivery.
  async function runService(row, kind, unitsWanted) {
    if (row.charter !== BREAKWATER_CHARTER.COOP) return { ok: false, reason: 'not_cooperative' };
    if (row.commission.status !== 'paid') return { ok: false, reason: 'not_commissioned' };
    const quotes = serviceQuotes(row);
    const offer = quotes[kind];
    if (!offer || offer.units <= 0) return { ok: false, reason: 'nothing_to_service' };
    const units = Math.max(0, Math.min(unitsWanted || offer.units, offer.units, offer.stock));
    if (units <= 0) return { ok: false, reason: 'no_stock' };
    const price = breakwaterServicePrice(kind, units);
    const station = yard();
    if (!station?._applyJobDelta) return { ok: false, reason: 'yard_unavailable' };
    const type = kind === 'repair' ? 'repair' : 'refuel';
    const applied = { units: 0 };
    const deliver = () => {
      // Yard-shaped job row so deliveredHull/deliveredFuel report the honest
      // received quantity (hull may cap below the requested units).
      const job = type === 'repair'
        ? { type: 'repair', meta: { shares: { hull: 1, armor: 0 } } }
        : { type: 'refuel' };
      station._applyJobDelta(state, job, units);
      applied.units = finite(type === 'repair' ? job.deliveredHull : job.deliveredFuel, 0);
      // Stock decrements only on accepted actual delivery; undelivered paid
      // work refunds inside the fence, the yard's _settleUndelivered pattern.
      row.coop.stock[kind] = Math.max(0, row.coop.stock[kind] - applied.units);
      return applied.units === units;
    };
    const accepted = chargeExact(price, `breakwaterSpur:${kind}`, deliver);
    if (!accepted) return {ok:false,reason:'payment_refused'};
    return { ok: true, units: applied.units, price };
  }

  // Repair the actual seated original through the combat hull owner and the
  // same exact-charge fence as the berth, with no replacement body.
  function repairCartridge(row, role, entity) {
    const cart=row.cartridges?.[role];
    if (!cart || cart.status!=='seated' || !entity || entity.id!==cart.entityId
      || entity.occupantGeneration!==cart.generation || state.entities?.get(entity.id)!==entity
      || !(entity.hull>0) || !(entity.hullMax>entity.hull)) return {ok:false,reason:'repair_unavailable'};
    const kernel=ctx.registry?.get?.('combat')?.kernel;
    const plan=kernel?.prepareRepairHulls?.([{entityId:entity.id,amount:entity.hullMax-entity.hull}],'breakwater:cartridge_repair');
    if (!plan?.ok) return {ok:false,reason:'repair_unavailable'};
    const units=plan.repairs[0].applied, price=Math.max(1,Math.round(units*REPAIR_CR_PER_HP));
    const accepted=chargeExact(price,'breakwaterSpur:cartridge_repair',()=>{
      const result=plan.commit(); if (!result?.ok) return false;
      cart.hull=entity.hull; cart.damaged=entity.hull<entity.hullMax;
      return true;
    });
    if (!accepted) return {ok:false,reason:'payment_refused'};
    plan.finalize();
    return {ok:true,units,price};
  }

  // --- cooperative jobs ---------------------------------------------------------------

  // Job 1: deliver scrap — real cargo draw, real credit grant, real stock bump.
  function deliverScrap(row) {
    const job = BREAKWATER_COOP_JOBS.scrap;
    const rec = row.coop.jobs.scrap;
    if (row.charter !== BREAKWATER_CHARTER.COOP || row.commission.status !== 'paid' || rec.status !== 'open') return {ok:false,reason:'job_closed'};
    if (cargoQty(job.cmdty)<job.qty) return {ok:false,reason:'need_scrap'};
    const accepted=ctx.registry?.get?.('cargo')?.acceptBreakwaterMaterials?.('scrap');
    if (!accepted?.ok) return {ok:false,reason:accepted?.reason || 'cargo_unavailable'};
    const receipt=economy()?.settleBreakwaterReceipt?.('scrap','breakwater:coop:scrap');
    return {ok:true,pay:receipt?.ok ? receipt.creditedCr : 0,paymentPending:!receipt?.ok};
  }

  // These jobs may enter accepted state only after the cargo owner issues a
  // durable receipt. The economy owner performs the keyed credit settlement.
  function acceptFreightPayout(row, kind, sourceId) {
    const rec = row.coop.jobs[kind];
    if (!rec || !['open', 'scheduled'].includes(rec.status) || !sourceId) return {ok:false,reason:'job_closed'};
    rec.status = 'accepted';
    row.pendingPayouts ||= {};
    row.pendingPayouts[kind] = {sourceId};
    const result = economy()?.settleBreakwaterReceipt?.(kind, sourceId);
    return {ok:true, pay:result?.ok ? result.creditedCr : 0, paymentPending:!result?.ok};
  }
  function settleSupplyLoad(row, sourceId) { return acceptFreightPayout(row, 'supply', sourceId); }
  function settleDefendedUnload(row, sourceId) { return acceptFreightPayout(row, 'defend', sourceId); }

  // --- bonded charter ------------------------------------------------------------------

  function postBond(row, stage) {
    const bond=row.bonded.bond;
    if (row.charter !== BREAKWATER_CHARTER.BONDED || row.bonded.job.status !== 'open'
      || bond.status !== 'none' || typeof stage !== 'function') return {ok:false,reason:'bond_unavailable'};
    const accepted=chargeExact(BREAKWATER_BONDED.bondCr,'breakwaterSpur:bond',()=>{
      bond.status='posted'; bond.postedAt=state.simTime; bond.pendingAdmission=true;
      return true;
    });
    if (!accepted) return {ok:false,reason:'bond_refused'};
    const admission=stage();
    if (admission?.ok) bond.pendingAdmission=false;
    return {ok:true,admission,pendingAdmission:!admission?.ok};
  }

  function refundBond(row, sourceId) {
    if (row.bonded.bond.status !== 'posted' || !sourceId) return {ok:false,reason:'no_bond'};
    row.pendingPayouts ||= {}; row.pendingPayouts.bond_refund = {sourceId};
    const result=economy()?.settleBreakwaterReceipt?.('bond_refund',sourceId);
    return {ok:true,paymentPending:!result?.ok};
  }

  function forfeitBond(row) {
    const bond = row.bonded.bond;
    if (bond.status !== 'posted') return { ok: false, reason: 'no_bond' };
    bond.status = 'forfeited';
    bond.forfeitedAt = state.simTime;
    return { ok: true };
  }

  function settleBondedJob(row, sourceId) {
    const job=row.bonded.job;
    if (job.status !== 'open' || !sourceId) return {ok:false,reason:'job_closed'};
    job.status='accepted'; row.pendingPayouts ||= {}; row.pendingPayouts.bonded={sourceId};
    const result=economy()?.settleBreakwaterReceipt?.('bonded',sourceId);
    return {ok:true,pay:result?.ok ? result.creditedCr : 0,paymentPending:!result?.ok};
  }

  return {
    serviceQuotes,
    commissionQuote,
    freightIntel,
    chargeExact,
    payCommission,
    runService,
    repairCartridge,
    deliverScrap,
    settleSupplyLoad,
    settleDefendedUnload,
    postBond,
    refundBond,
    forfeitBond,
    settleBondedJob,
  };
}
