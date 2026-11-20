// Pure presentation read model for the station arrival concourse (SCREENS-1-STATION).
// Reads live state without mutating simulation, RNG, or DOM.

import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { COMMODITIES } from '../../data/commodities.js';
import { SHIPS } from '../../data/ships.js';
import { WEAPONS } from '../../data/weapons.js';
import { MODULES } from '../../data/modules.js';
import { stationInfoFor } from '../../systems/missions.js';
import { SERVICE_PRICES, stationOffersService } from '../../systems/economy.js';
import { wantedTierFor, WANTED_TIER } from '../../systems/heat.js';
import { tierFor } from '../factionStanding.js';
import { buildDockArrival, berthArrivalNews } from '../dockArrival.js';
import { selectStationSign } from './adBoard.js';
import { generateContacts, missionBoardSlots } from './barContacts.js';
import { disabledServiceWhy, playerYardSummary } from './serviceQuotes.js';
import { holdUnitSellPrice } from './stationHubModel.js';
import { missionDockAttention } from './missionDockAttention.js';
import { isChoiceECourierReady } from '../../story/endings/eligibility.js';
import { decantQuote } from '../../systems/stationServices.js';
import { counted } from '../numberFormat.js';

export const SERVICE_MUNITIONS_TARGET = 10;

const STATION_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) {
    STATION_BY_ID.set(station.id, { station, sector });
  }
}
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

const FALLBACK_NOTES = Object.freeze({
  trade_hub: 'Open berths, steady traffic, and brokers watching every manifest.',
  refinery: 'Ore in, alloy out. Hot cranes on the apron and smelters running round the watch.',
  mining: 'Rock crews, assay scales, and ore hoppers moving on every shift.',
  fab: 'Plate, looms, and module bays humming behind the blast doors.',
  military: 'Tight flight control, clean contracts, and patrol cutters on short notice.',
  blackmarket: 'Quiet berths, no customs desk, and rates that follow reputation.',
  research: 'Survey dishes, sealed labs, and instruments worth more than the hull carrying them.',
});

function titleWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtCr(n) {
  return Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
}

function playerEntity(state) {
  return state && state.entities && typeof state.entities.get === 'function' && state.playerId != null
    ? state.entities.get(state.playerId) : null;
}

/** Resolve station name, faction, type, services, and character line. */
export function resolveStationIdentity(state, stationId, override = null) {
  const id = stationId || (state && state.ui && state.ui.dockedStationId) || null;
  const rec = id ? STATION_BY_ID.get(id) : null;
  if (override) {
    const fallbackType = rec?.station?.type || override.type || 'berth';
    const note = override.chartNote || rec?.station?.chartNote || FALLBACK_NOTES[fallbackType] || 'Berth open for docked vessels.';
    return {
      id,
      name: override.name || rec?.station?.name || 'Station',
      type: fallbackType,
      typeLabel: override.typeLabel || (titleWords(fallbackType) + (rec?.station?.size ? ` · Class ${rec.station.size}` : '')),
      factionId: override.factionId || rec?.station?.factionId || null,
      factionName: override.factionName || FACTION_BY_ID.get(override.factionId || rec?.station?.factionId)?.name || '',
      factionShort: FACTION_BY_ID.get(override.factionId || rec?.station?.factionId)?.short || '',
      sectorId: rec?.sector?.id || state?.world?.currentSectorId || null,
      sectorName: rec?.sector?.name || '',
      services: Array.isArray(override.services) ? override.services.slice() : (rec?.station?.services || []).slice(),
      chartNote: note,
    };
  }
  if (rec) {
    const s = rec.station;
    const fac = FACTION_BY_ID.get(s.factionId);
    const type = s.type || 'berth';
    return {
      id: s.id,
      name: s.name || String(id),
      type,
      typeLabel: titleWords(type) + (s.size ? ` · Class ${s.size}` : ''),
      factionId: s.factionId || null,
      factionName: fac ? fac.name : '',
      factionShort: fac ? (fac.short || fac.name) : '',
      sectorId: rec.sector?.id || null,
      sectorName: rec.sector?.name || '',
      services: Array.isArray(s.services) ? s.services.slice() : [],
      chartNote: s.chartNote || FALLBACK_NOTES[type] || 'Berth open for docked vessels.',
    };
  }
  const info = id ? stationInfoFor(state, id) : null;
  if (info) {
    const fac = FACTION_BY_ID.get(info.factionId);
    const type = info.type || 'berth';
    return {
      id,
      name: info.name || String(id),
      type,
      typeLabel: titleWords(type) + (info.size ? ` · Class ${info.size}` : ''),
      factionId: info.factionId || null,
      factionName: fac ? fac.name : '',
      factionShort: fac ? (fac.short || fac.name) : '',
      sectorId: info.sectorId || state?.world?.currentSectorId || null,
      sectorName: '',
      services: Array.isArray(info.services) ? info.services.slice() : [],
      chartNote: info.chartNote || FALLBACK_NOTES[type] || 'Your own berth — quiet deck, no customs desk.',
    };
  }
  return {
    id,
    name: 'Station',
    type: 'berth',
    typeLabel: 'Berth',
    factionId: null,
    factionName: '',
    factionShort: '',
    sectorId: state?.world?.currentSectorId || null,
    sectorName: '',
    services: [],
    chartNote: 'Berth open for docked vessels.',
  };
}

/** Active Law Desk fine offer at the docked station, or null. */
export function activeLawFineOffer(state, stationId) {
  const offer = state?.lawSecurity?.fineOffer;
  const tier = wantedTierFor(Number(state?.player?.heat) || 0);
  if (tier !== WANTED_TIER.SCAN && tier !== WANTED_TIER.BOUNTY) return null;
  if (!offer || String(stationId || '') !== String(offer.stationId || '')) return null;
  if (!['offered', 'working'].includes(offer.status)) return null;
  return offer;
}

/**
 * Combined service-ship model (Repair + Refuel + Rearm).
 * Each item remains individually pressable, while the primary button bundles every
 * actionable service in priority order (repair -> refuel -> rearm).
 */
export function buildServiceBundle(state, entity, serviceQuoteFn) {
  const s = state || {};
  const ship = entity || playerEntity(s);
  const credits = Math.max(0, Math.floor(Number(s.player?.credits) || 0));
  const fuel = s.fuel || {};
  const cargo = s.player?.cargo || {};
  const muniAboard = Math.max(0, Math.floor(Number(cargo.items?.cmdty_munitions) || 0));
  const yard = playerYardSummary(s);

  const safeQuote = (type) => {
    if (typeof serviceQuoteFn !== 'function') return null;
    try { return serviceQuoteFn(type, s, ship); } catch (_) { return null; }
  };

  // 1. Repair
  const repQ = safeQuote('repair');
  const repairItem = (() => {
    if (repQ) {
      const done = !!repQ.disabled && !disabledServiceWhy(repQ) && /full|intact/i.test(`${repQ.buttonLabel || ''} ${repQ.detail || ''}`);
      const why = repQ.disabled ? disabledServiceWhy(repQ) : '';
      const chips = Array.isArray(repQ.chips) ? repQ.chips : [];
      const blockChip = why && (chips.find((c) => c && (c.kind === 'bad' || c.kind === 'warn')) || chips[0]);
      const cost = Math.max(0, Math.round(Number(repQ.cost) || 0));
      const debtCr = Math.max(0, Math.round(Number(repQ.debtCr) || 0));
      return {
        id: 'repair',
        type: 'repair',
        label: 'Repair',
        cost,
        debtCr,
        amount: Number(repQ.amount) || 0,
        done,
        disabled: !!repQ.disabled,
        actionable: !repQ.disabled && (Number(repQ.amount) > 0 || cost > 0 || debtCr > 0),
        priceText: done ? 'Intact' : (repQ.disabled ? (blockChip?.text || repQ.buttonLabel || 'Unavailable') : (debtCr > 0 ? 'On the note' : `${fmtCr(cost)} cr`)),
        why,
        detail: repQ.detail || '',
      };
    }
    const missing = ship && ship.hullMax > 0 ? Math.max(0, ship.hullMax - (ship.hull || 0)) : 0;
    const cost = Math.ceil(missing * (SERVICE_PRICES.repairCrPerHp || 2));
    return {
      id: 'repair',
      type: 'repair',
      label: 'Repair',
      cost,
      debtCr: 0,
      amount: missing,
      done: missing <= 0.5,
      disabled: missing <= 0.5 || credits < cost,
      actionable: missing > 0.5 && credits >= cost,
      priceText: missing <= 0.5 ? 'Intact' : `${fmtCr(cost)} cr`,
      why: missing > 0.5 && credits < cost ? `Need ${fmtCr(cost)} cr` : '',
      detail: '',
    };
  })();

  // 2. Refuel
  const fuelQ = safeQuote('refuel');
  const refuelItem = (() => {
    if (fuelQ) {
      const done = !!fuelQ.disabled && !disabledServiceWhy(fuelQ) && /full/i.test(`${fuelQ.buttonLabel || ''} ${fuelQ.detail || ''}`);
      const why = fuelQ.disabled ? disabledServiceWhy(fuelQ) : '';
      const chips = Array.isArray(fuelQ.chips) ? fuelQ.chips : [];
      const blockChip = why && (chips.find((c) => c && (c.kind === 'bad' || c.kind === 'warn')) || chips[0]);
      const cost = Math.max(0, Math.round(Number(fuelQ.cost) || 0));
      const debtCr = Math.max(0, Math.round(Number(fuelQ.debtCr) || 0));
      return {
        id: 'refuel',
        type: 'refuel',
        label: 'Refuel',
        cost,
        debtCr,
        amount: Number(fuelQ.amount) || 0,
        done,
        disabled: !!fuelQ.disabled,
        actionable: !fuelQ.disabled && (Number(fuelQ.amount) > 0 || cost > 0 || debtCr > 0),
        priceText: done ? 'Full' : (fuelQ.disabled ? (blockChip?.text || fuelQ.buttonLabel || 'Unavailable') : (debtCr > 0 ? 'On the note' : `${fmtCr(cost)} cr`)),
        why,
        detail: fuelQ.detail || '',
      };
    }
    const missing = fuel.max > 0 ? Math.max(0, fuel.max - (fuel.current || 0)) : 0;
    const cost = Math.ceil(missing * (SERVICE_PRICES.fuelCrPerUnit || 3));
    return {
      id: 'refuel',
      type: 'refuel',
      label: 'Refuel',
      cost,
      debtCr: 0,
      amount: missing,
      done: missing <= 0.5,
      disabled: missing <= 0.5 || credits < cost,
      actionable: missing > 0.5 && credits >= cost,
      priceText: missing <= 0.5 ? 'Full' : `${fmtCr(cost)} cr`,
      why: missing > 0.5 && credits < cost ? `Need ${fmtCr(cost)} cr` : '',
      detail: '',
    };
  })();

  // 3. Rearm (top up munitions to SERVICE_MUNITIONS_TARGET without flooding cargo hold)
  const ammoQ = safeQuote('ammo');
  const rearmItem = (() => {
    const need = Math.max(0, SERVICE_MUNITIONS_TARGET - muniAboard);
    if (need <= 0) {
      return {
        id: 'resupply',
        type: 'ammo',
        label: 'Rearm',
        cost: 0,
        debtCr: 0,
        amount: 0,
        done: true,
        disabled: true,
        actionable: false,
        priceText: `Stocked (${muniAboard})`,
        why: '',
        detail: `${muniAboard} munitions aboard`,
      };
    }
    if (ammoQ) {
      if (ammoQ.disabled) {
        const why = disabledServiceWhy(ammoQ) || ammoQ.detail || 'Unavailable';
        const chips = Array.isArray(ammoQ.chips) ? ammoQ.chips : [];
        const blockChip = chips.find((c) => c && (c.kind === 'bad' || c.kind === 'warn')) || chips[0];
        return {
          id: 'resupply',
          type: 'ammo',
          label: 'Rearm',
          cost: 0,
          debtCr: 0,
          amount: 0,
          done: false,
          disabled: true,
          actionable: false,
          priceText: blockChip?.text || 'Unavailable',
          why,
          detail: ammoQ.detail || '',
        };
      }
      const unitCr = SERVICE_PRICES.ammoCrPerUnit || 12;
      const units = Math.max(0, Math.min(need, Math.floor(Number(ammoQ.amount) || 0)));
      const cost = Math.round(units * unitCr);
      if (units <= 0) {
        return {
          id: 'resupply',
          type: 'ammo',
          label: 'Rearm',
          cost: 0,
          debtCr: 0,
          amount: 0,
          done: false,
          disabled: true,
          actionable: false,
          priceText: 'Unavailable',
          why: 'Not enough hold space or credits for munitions',
          detail: '',
        };
      }
      return {
        id: 'resupply',
        type: 'ammo',
        label: 'Rearm',
        cost,
        debtCr: 0,
        amount: units,
        done: false,
        disabled: false,
        actionable: true,
        priceText: `${fmtCr(cost)} cr`,
        why: '',
        detail: `${units} munitions (${muniAboard} aboard)`,
      };
    }
    const unitCr = SERVICE_PRICES.ammoCrPerUnit || 12;
    const cost = Math.round(need * unitCr);
    return {
      id: 'resupply',
      type: 'ammo',
      label: 'Rearm',
      cost,
      debtCr: 0,
      amount: need,
      done: false,
      disabled: credits < cost,
      actionable: credits >= cost,
      priceText: `${fmtCr(cost)} cr`,
      why: credits < cost ? `Need ${fmtCr(cost)} cr` : '',
      detail: `${need} munitions`,
    };
  })();

  const items = [repairItem, refuelItem, rearmItem];

  // Plan what a single press of "Service ship" executes within available credits (repair -> refuel -> rearm).
  let remainingCr = credits;
  const actionableItems = [];
  let totalCost = 0;
  let totalDebt = 0;
  for (const item of items) {
    if (!item.actionable) continue;
    if (item.cost <= remainingCr) {
      actionableItems.push(item);
      remainingCr -= item.cost;
      totalCost += item.cost;
      totalDebt += item.debtCr || 0;
    } else if (item.type === 'ammo' && remainingCr >= (SERVICE_PRICES.ammoCrPerUnit || 12)) {
      const unitCr = SERVICE_PRICES.ammoCrPerUnit || 12;
      const affordableUnits = Math.min(item.amount, Math.floor(remainingCr / unitCr));
      if (affordableUnits > 0) {
        const partialCost = Math.round(affordableUnits * unitCr);
        actionableItems.push({ ...item, amount: affordableUnits, cost: partialCost });
        remainingCr -= partialCost;
        totalCost += partialCost;
      }
    }
  }

  const ready = items.every((item) => item.done);
  const blocked = !ready && actionableItems.length === 0;
  const blockedReasons = items.filter((i) => !i.done && i.disabled && i.why).map((i) => `${i.label}: ${i.why}`);
  const blockedReason = blockedReasons[0] || (blocked ? 'Service unavailable at this station.' : '');

  let primaryLabel = 'Ship is ready';
  if (actionableItems.length > 0) {
    primaryLabel = totalCost > 0
      ? `Service ship · ${fmtCr(totalCost)} cr`
      : (totalDebt > 0 ? 'Service ship · on the note' : 'Service ship');
  } else if (blocked) {
    primaryLabel = 'Service unavailable';
  }

  const hullPct = ship && ship.hullMax > 0 ? Math.round(Math.max(0, Math.min(1, (ship.hull || 0) / ship.hullMax)) * 100) : 100;
  const fuelPct = fuel.max > 0 ? Math.round(Math.max(0, Math.min(1, (fuel.current || 0) / fuel.max)) * 100) : 100;
  const summaryLine = ready
    ? 'Hull intact · Fuel full · Munitions stocked'
    : `Hull ${hullPct}% · Fuel ${fuelPct}% · Munitions ${muniAboard}/${SERVICE_MUNITIONS_TARGET}`;

  const decant = (() => {
    try { return decantQuote(s); } catch (_) { return null; }
  })();

  return {
    items,
    actionableItems,
    totalCost,
    totalDebt,
    ready,
    blocked,
    blockedReason,
    primaryLabel,
    summaryLine,
    yard,
    decant: decant && decant.ok && decant.cells > 0 ? decant : null,
  };
}

/** Find the strongest live commodity price move at this station (relative to base price). */
function biggestMarketMover(state, stationId) {
  const market = stationId && state?.economy?.markets?.[stationId];
  if (!market || typeof market !== 'object') return null;
  let best = null;
  for (const [cmdtyId, entry] of Object.entries(market)) {
    if (!entry || typeof entry !== 'object') continue;
    const def = COMMODITY_BY_ID.get(cmdtyId);
    if (!def || !(def.basePrice > 0)) continue;
    const mid = Number(entry.lastMid || entry.lastBuy || entry.lastSell);
    if (!Number.isFinite(mid) || mid <= 0) continue;
    const pct = Math.round(((mid - def.basePrice) / def.basePrice) * 100);
    if (!best || Math.abs(pct) > Math.abs(best.pct)) {
      best = { id: cmdtyId, name: def.name, pct, buy: entry.lastBuy, sell: entry.lastSell };
    }
  }
  return best;
}

/** Single news line replacing the two BAY SCREEN + STATION WIRE tickers. */
export function buildConcourseNews(state, stationId, stationIdentity) {
  const s = state || {};
  const id = stationId || stationIdentity?.id || null;

  // 1. Urgent: active Law Desk fine at this berth.
  const fine = activeLawFineOffer(s, id);
  if (fine) {
    const working = fine.status === 'working';
    return {
      tag: 'Law Desk',
      text: working
        ? `Working off your ${fmtCr(fine.amount)} cr fine — stay docked until cleared.`
        : `Port security holds a ${fmtCr(fine.amount)} cr fine on your hull. Settle or answer it in People.`,
      priority: 'urgent',
      actionDoor: 'people',
      actionSub: 'law',
    };
  }

  // 2. Live arrival / market / rumor / deed / returning-pilot news.
  try {
    const arrival = buildDockArrival(s, {
      id,
      name: stationIdentity?.name,
      services: stationIdentity?.services,
      typeLabel: stationIdentity?.typeLabel,
      factionName: stationIdentity?.factionName,
    });
    const combined = berthArrivalNews(arrival, '');
    if (combined) {
      return {
        tag: arrival.returnSummary ? 'While away' : 'Station News',
        text: combined,
        priority: arrival.returnSummary ? 'high' : 'normal',
        actionDoor: null,
      };
    }
    if (arrival.eventCard && arrival.eventCard.body) {
      return {
        tag: arrival.eventCard.badge || 'Station News',
        text: `${arrival.eventCard.title ? arrival.eventCard.title + ' — ' : ''}${arrival.eventCard.body}`,
        priority: arrival.eventCard.tone === 'danger' ? 'high' : 'normal',
        actionDoor: null,
      };
    }
  } catch (_) { /* fall through to market mover or berth wire */ }

  // 3. Notable local price movement on the exchange.
  const mover = biggestMarketMover(s, id);
  if (mover && Math.abs(mover.pct) >= 8) {
    const dir = mover.pct > 0 ? 'up' : 'down';
    return {
      tag: 'Market Watch',
      text: `${mover.name} is ${dir} ${Math.abs(mover.pct)}% against average on the ${stationIdentity?.name || 'local'} board.`,
      priority: 'normal',
      actionDoor: 'market',
    };
  }

  // 4. Low-emphasis flavour chatter when nothing urgent is happening.
  try {
    const sign = selectStationSign(s, 'crawl') || selectStationSign(s, 'bay');
    if (sign && sign.text) {
      return {
        tag: sign.sponsor || 'Berth Wire',
        text: sign.text,
        priority: 'ambient',
        actionDoor: null,
      };
    }
  } catch (_) { /* silent fallback */ }

  return {
    tag: 'Berth Wire',
    text: 'All bays clear. Exchange and dock desks operating on normal watch.',
    priority: 'ambient',
    actionDoor: null,
  };
}

/** True when the player has industry, refining, fabrication, or base work at this station. */
export function hasWorksAtStation(state, stationId, stationIdentity) {
  const s = state || {};
  const id = stationId || stationIdentity?.id || null;
  const services = Array.isArray(stationIdentity?.services) ? stationIdentity.services : [];
  const type = stationIdentity?.type || '';
  if (services.includes('refine') || services.includes('module_craft')) return true;
  if (type === 'refinery' || type === 'fab' || type === 'mining') return true;
  if (id && stationOffersService(s, 'refine', id)) return true;
  if (id && stationOffersService(s, 'module_craft', id)) return true;
  const activeJob = id && (s.crafting?.jobs?.[id] || (s.crafting?.active && s.crafting.active.stationId === id));
  if (activeJob) return true;
  const claims = Array.isArray(s.claims?.bodies) ? s.claims.bodies : [];
  if (claims.length > 0) return true;
  const outposts = Array.isArray(s.automation?.outposts) ? s.automation.outposts : [];
  if (outposts.length > 0) return true;
  return false;
}

function marketDoorSummary(state, stationId) {
  const mover = biggestMarketMover(state, stationId);
  const cargoItems = state?.player?.cargo?.items || {};
  let sellableKinds = 0;
  for (const [cmdtyId, qty] of Object.entries(cargoItems)) {
    if (!(Number(qty) > 0)) continue;
    let price = null;
    try { price = holdUnitSellPrice(state, stationId, cmdtyId); } catch (_) { price = null; }
    if (price != null && price > 0) sellableKinds += 1;
  }
  const movePart = mover && Math.abs(mover.pct) >= 2
    ? `${mover.name} ${mover.pct > 0 ? 'up' : 'down'} ${Math.abs(mover.pct)}%`
    : (mover && mover.buy > 0 ? `${mover.name} at ${fmtCr(mover.buy)} cr` : 'Exchange open');
  const holdPart = sellableKinds > 0
    ? `${counted(sellableKinds, 'good', 'goods')} you carry sell here`
    : 'Hold empty';
  return `${movePart} · ${holdPart}`;
}

function jobsDoorSummary(state, stationId, attention) {
  let offers = [];
  try { offers = missionBoardSlots(state, stationId) || []; } catch (_) { offers = []; }
  const openCount = offers.length;
  let bestPay = 0;
  for (const offer of offers) {
    const pay = Math.max(0, Math.round(Number(offer?.reward ?? offer?.reward_cr ?? offer?.rewardCr ?? offer?.payout) || 0));
    if (pay > bestPay) bestPay = pay;
  }
  if (attention && attention.kind === 'turnin') {
    return `1 job ready to turn in${openCount > 0 ? ` · ${openCount} open` : ''}`;
  }
  if (openCount > 0 && bestPay > 0) {
    return `${openCount} open · best pays ${fmtCr(bestPay)} cr`;
  }
  if (openCount > 0) return `${counted(openCount, 'job', 'jobs')} posted on the board`;
  const activeCount = (state?.missions?.active || []).filter((m) => m && (m.status == null || m.status === 'active')).length;
  if (activeCount > 0) return `No new postings · ${counted(activeCount, 'active job', 'active jobs')}`;
  return 'Board clear for now';
}

function shipyardDoorSummary(state, stationIdentity) {
  const ship = playerEntity(state);
  const hullPct = ship && ship.hullMax > 0
    ? Math.round(Math.max(0, Math.min(1, (ship.hull || 0) / ship.hullMax)) * 100)
    : 100;
  const hullPart = hullPct >= 100 ? 'Hull intact' : `Hull ${hullPct}%`;
  const services = Array.isArray(stationIdentity?.services) ? stationIdentity.services : [];
  const hasYard = services.includes('shipyard') || services.includes('repair') || !services.length;
  if (!hasYard) return `${hullPart} · Fitting inspection only`;
  const ownedIds = new Set((state?.player?.ownedShips || []).map((s) => s?.defId).filter(Boolean));
  const stockedHulls = SHIPS.filter((s) => s && !s.starterOnly && !s.enemyOnly && !ownedIds.has(s.id)).length;
  const gunCount = WEAPONS.filter((w) => w && !w.enemyOnly && !w.hidden).length;
  if (stockedHulls > 0 && gunCount > 0) {
    return `${hullPart} · ${Math.min(stockedHulls, 9)} hulls & ${Math.min(gunCount, 12)} guns in stock`;
  }
  const modCount = MODULES.length;
  return `${hullPart} · ${modCount} parts in catalog`;
}

function peopleDoorSummary(state, stationId, stationIdentity, fineOffer) {
  const facId = stationIdentity?.factionId;
  const facShort = stationIdentity?.factionShort || stationIdentity?.factionName || '';
  const rep = facId && state?.factions?.[facId] ? Number(state.factions[facId].rep) || 0 : 0;
  const trustWord = facShort ? `${facShort} trust: ${String(tierFor(rep)?.name || 'Neutral').toLowerCase()}` : '';

  if (fineOffer) {
    const fineText = fineOffer.status === 'working'
      ? `Law Desk: working off ${fmtCr(fineOffer.amount)} cr fine`
      : `Law Desk: ${fmtCr(fineOffer.amount)} cr fine waiting`;
    return [fineText, trustWord].filter(Boolean).join(' · ');
  }

  let leadName = '';
  try {
    const contacts = generateContacts(stationId, state) || [];
    const lead = contacts.find((c) => c && (c.deedId || c.storyBuyer || c.canonicalKey)) || contacts[0];
    if (lead && lead.name) leadName = `${lead.name} wants a word`;
  } catch (_) { /* fall back to quiet lounge */ }

  if (leadName && trustWord) return `${leadName} · ${trustWord}`;
  if (leadName) return leadName;
  if (trustWord) return `Lounge quiet · ${trustWord}`;
  return 'Contacts, factions, and station records';
}

function worksDoorSummary(state, stationId, stationIdentity) {
  const activeJob = stationId && (state?.crafting?.jobs?.[stationId]
    || (state?.crafting?.active && state.crafting.active.stationId === stationId ? state.crafting.active : null));
  if (activeJob) {
    const label = activeJob.outputName || activeJob.name || 'Fabrication';
    const rem = Number(activeJob.remainingS);
    return Number.isFinite(rem) && rem > 0
      ? `${label} running · ${Math.ceil(rem)}s left`
      : `${label} in progress`;
  }
  const cargoItems = state?.player?.cargo?.items || {};
  let oreUnits = 0;
  for (const [cmdtyId, qty] of Object.entries(cargoItems)) {
    const def = COMMODITY_BY_ID.get(cmdtyId);
    if (def && def.category === 'raw ore') oreUnits += Math.floor(Number(qty) || 0);
  }
  const claims = Array.isArray(state?.claims?.bodies) ? state.claims.bodies : [];
  const outposts = Array.isArray(state?.automation?.outposts) ? state.automation.outposts : [];
  const services = Array.isArray(stationIdentity?.services) ? stationIdentity.services : [];
  const hasRefinery = services.includes('refine') || stationIdentity?.type === 'refinery';
  const hasFab = services.includes('module_craft') || stationIdentity?.type === 'fab';

  if (hasRefinery) {
    return oreUnits > 0 ? `Refinery idle · ${fmtCr(oreUnits)} ore waiting` : 'Refinery idle · Ready for raw ore';
  }
  if (hasFab) {
    return claims.length > 0
      ? `Fabricator idle · ${counted(claims.length, 'base', 'bases')} linked`
      : 'Fabricator idle · Blueprints ready';
  }
  if (claims.length > 0) {
    const activeConvoy = claims.find((b) => b?.spec?.convoy);
    return activeConvoy
      ? `${counted(claims.length, 'claimed base', 'claimed bases')} · Convoy in transit`
      : `${counted(claims.length, 'claimed base', 'claimed bases')} · Manage sites & recipes`;
  }
  if (outposts.length > 0) {
    return `${counted(outposts.length, 'outpost', 'outposts')} active · Manage works`;
  }
  return 'Blueprints and base works';
}

/** Build the ordered door descriptors shown on the concourse (4 doors, or 5 when Works applies). */
export function buildConcourseDoors(state, stationId, stationIdentity, options = {}) {
  const s = state || {};
  const id = stationId || stationIdentity?.id || null;
  const peopleTarget = options.peopleTarget || 'people';
  let attention = options.attention || null;
  if (!attention) {
    try { attention = missionDockAttention(s, id); } catch (_) { attention = null; }
  }
  const courierReady = (() => { try { return isChoiceECourierReady(s, id); } catch (_) { return false; } })();
  const fineOffer = activeLawFineOffer(s, id);
  const handoffTarget = options.handoffTarget || null;

  const doors = [
    {
      key: '1',
      id: 'market',
      controlId: 'door-market',
      glyph: 'market',
      label: 'Market',
      summary: marketDoorSummary(s, id),
      badge: handoffTarget === 'market' ? 'Next' : '',
      tone: handoffTarget === 'market' ? 'next' : 'normal',
    },
    {
      key: '2',
      id: 'contracts',
      controlId: 'door-contracts',
      glyph: 'contracts',
      label: 'Jobs',
      summary: jobsDoorSummary(s, id, attention),
      badge: attention?.badge ? String(attention.badge) : (handoffTarget === 'contracts' ? 'Next' : ''),
      tone: attention ? 'attention' : (handoffTarget === 'contracts' ? 'next' : 'normal'),
    },
    {
      key: '3',
      id: 'shipworks',
      controlId: 'door-shipworks',
      glyph: 'shipworks',
      label: 'Shipyard',
      summary: shipyardDoorSummary(s, stationIdentity),
      badge: handoffTarget === 'shipworks' ? 'Next' : '',
      tone: handoffTarget === 'shipworks' ? 'next' : 'normal',
    },
    {
      key: '4',
      id: peopleTarget,
      controlId: 'door-people',
      glyph: 'people',
      label: 'People',
      summary: peopleDoorSummary(s, id, stationIdentity, fineOffer),
      badge: fineOffer ? 'Fine' : (courierReady ? '!' : ''),
      tone: fineOffer ? 'urgent' : (courierReady ? 'attention' : 'normal'),
      openOptions: fineOffer ? { sub: 'law' } : undefined,
    },
  ];

  if (options.forceWorks || hasWorksAtStation(s, id, stationIdentity)) {
    doors.push({
      key: '5',
      id: 'industry',
      controlId: 'door-industry',
      glyph: 'industry',
      label: 'Works',
      summary: worksDoorSummary(s, id, stationIdentity),
      badge: '',
      tone: 'normal',
    });
  }

  return doors;
}
