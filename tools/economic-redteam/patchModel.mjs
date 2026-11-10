// Runtime image of FIX.patch. The landing diff is FIX.patch. These installers
// let a regression exercise that diff against the live writers without editing
// src/systems/cargo.js or src/systems/economy.js.

import { COMMODITIES } from '../../src/data/commodities.js';
import { SECTORS } from '../../src/data/sectors.js';
import { ECONOMY_BALANCE } from '../../src/data/economyDerived.js';
import { stationTradeMults } from '../../src/economy/stationConditions.js';
import { priceModForState } from '../../src/systems/factions.js';
import { combatFlag } from '../../src/data/featureFlags.js';
import { addCargo, cashInSalvage, salvageBayCap } from '../../src/systems/cargo.js';
import { stationRecord } from './runtime.mjs';

export function pricedStandingFor(state, stationId) {
  const info = stationRecord(stationId);
  const base = priceModForState(state, info && info.factionId);
  const cond = stationTradeMults(state, stationId, info);
  const standing = {
    buy: base.buy * (cond.buy == null ? 1 : cond.buy),
    sell: base.sell * (cond.sell == null ? 1 : cond.sell),
  };
  const spread = ECONOMY_BALANCE.market.spread;
  const spreadDen = 1 - spread / 2;
  const washSellCap = spreadDen > 0 ? standing.buy * (1 + spread / 2) / spreadDen : standing.sell;
  const pricedSell = standing.sell > washSellCap ? washSellCap : standing.sell;
  return { standing, pricedSell, spread };
}

/** Quote wrapper matching the economy hunk: sell totals scale by the clamped multiplier. */
export function installWashGuard(econ) {
  const orig = econ.quote;
  econ.quote = function quoteWithWashGuard(stationId, commodityId, side, qty) {
    const quoted = orig.call(this, stationId, commodityId, side, qty);
    if (!quoted || quoted.ok !== true || side !== 'sell') return quoted;
    const live = Number(quoted.standingPriceMultiplier);
    if (!(live > 0)) return quoted;
    const { pricedSell } = pricedStandingFor(this.state, stationId);
    const scale = pricedSell / live;
    if (!(scale < 0.999999)) return quoted;
    const total = Math.floor(quoted.total * scale);
    return {
      ...quoted,
      total,
      unitAvg: quoted.qty ? quoted.unitAvg * scale : quoted.unitAvg,
      standingPriceMultiplier: pricedSell,
    };
  };
  return econ;
}

function commodityRow(id) {
  for (const row of COMMODITIES) if (row && row.id === id) return row;
  return null;
}

function bayFineMult(row) {
  const table = { legal: 0, restricted: 0.8, illegal: 1.2, contraband: 1.5 };
  const legality = row && row.legality;
  if (legality && table[legality] != null) return table[legality];
  return row && Number(row.fineMult) > 0 ? Number(row.fineMult) : 1;
}

function dockStationInfo(state) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  if (!stationId) return null;
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      if (station && station.id === stationId) {
        return { ...station, sectorId: sector.id, factionId: station.factionId || sector.factionId || null };
      }
    }
  }
  return null;
}

/** Replaces cargo._cashInSalvage with the FIX.patch body. */
export function installCargoFix(cargoSys) {
  cargoSys._cashInSalvage = function cashInSalvageFixed() {
    if (!combatFlag('salvageBay')) return;
    const state = this.state;
    const bay = state && state.player && state.player.salvageBay;
    if (!bay || !bay.items) return;
    const info = dockStationInfo(state);
    const fence = !!(info && info.type === 'blackmarket');
    const seized = [];
    const parked = [];
    for (const id of Object.keys(bay.items)) {
      const row = commodityRow(id);
      const qty = Math.floor(Number(bay.items[id]) || 0);
      if (qty <= 0 || !row || !row.legality || row.legality === 'legal') continue;
      delete bay.items[id];
      if (fence) {
        const accepted = addCargo(state, id, qty);
        const left = qty - accepted;
        if (left > 0) parked.push({ id, qty: left });
      } else {
        seized.push({ commodityId: id, qty, row });
      }
    }
    const sale = cashInSalvage(state);
    if (!bay.items || typeof bay.items !== 'object') bay.items = {};
    for (const held of parked) bay.items[held.id] = (Math.floor(Number(bay.items[held.id]) || 0) + held.qty);
    if (!sale && parked.length === 0) {
      bay.items = {};
      bay.usedVolume = 0;
    }
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    if (sale && sale.credits > 0) {
      this.bus.emit('economy:grantCredits', {
        amount: sale.credits,
        reason: 'salvage:bay_sale',
        receiptId: `salvage_bay:${state.tick | 0}`,
      });
    }
    if (sale) {
      this.bus.emit('salvage:bayCashedIn', { units: sale.units, credits: sale.credits, lots: sale.lots });
    }
    if (seized.length) {
      let fine = 0;
      for (const stack of seized) fine += (Number(stack.row.basePrice) || 0) * stack.qty * bayFineMult(stack.row);
      fine = Math.round(fine);
      if (fine > 0) this.bus.emit('economy:chargeCredits', { amount: fine, reason: 'fine:contraband' });
    }
    this.bus.emit('salvage:changed', {
      used: Math.round(Number(bay.usedVolume) || 0),
      cap: Math.round(salvageBayCap(state)),
    });
  };
  return cargoSys;
}
