// Visible adventure decisions (PQ-177.05).
//
// A decision counts only when the player can see at least two viable options and each option
// names a different tradeoff. The market and the contract desk render these records; choosing
// one goes through the existing economy and mission owners. The fun-loop measurer reads the
// same records on the reference route.

import { COMMODITIES } from '../data/commodities.js';
import { MISSION_TUNING } from '../data/missions.js';
import { SECTORS } from '../data/sectors.js';
import { SERVICE_PRICES, quote } from '../systems/economy.js';
import { evaluateTwoLegItinerary, predictPriceCurve } from '../systems/economyCycles.js';
import { missionPreflight } from './missionPreflight.js';
import { applyTradeNavigation, computeBestTrades } from './market/tradeLogic.js';
import { laneRpc } from '../core/simLaneCommands.js';

export const ADVENTURE_DECISION_BAR_PER_HOUR = 6;
export const REFERENCE_ADVENTURE_SEED = 4242;
export const REFERENCE_ADVENTURE_HOUR_S = 3600;
export const REFERENCE_ADVENTURE_STATIONS = Object.freeze([
  'station_helios',
  'station_beltout',
  'station_tethys',
  'station_ceres',
]);

const MIN_PRICE_MOVE = 0.08;
const MIN_CREDIT_GAP = 20;
const FORECAST_STEP_S = 30;
const FORECAST_STEPS = 20;
const REPAIR_HULL_FRAC = 0.15;

const COMMODITY_NAME = new Map(COMMODITIES.map((row) => [row.id, row.name]));
const STATION_NAME = new Map();
const STATION_SECTOR = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_NAME.set(station.id, station.name || station.id);
    STATION_SECTOR.set(station.id, sector.id);
  }
}

const logs = new WeakMap();

function logOf(state) {
  let log = logs.get(state);
  if (!log) {
    log = { presented: new Map(), chosen: [], chosenIds: new Set(), closedIds: new Set(), applyingIds: new Set() };
    logs.set(state, log);
  }
  return log;
}

function shortSentence(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 110) return clean;
  return `${clean.slice(0, 107).trim()}...`;
}

function stationName(id) {
  return STATION_NAME.get(id) || 'the next berth';
}

function commodityName(id) {
  return COMMODITY_NAME.get(id) || 'cargo';
}

function creditsOf(state) {
  const value = Number(state && state.player && state.player.credits);
  return Number.isFinite(value) ? value : 0;
}

function heldQty(state, commodityId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  return Math.max(0, Math.floor(Number(items && items[commodityId]) || 0));
}

function playerShip(state) {
  if (!state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(state.playerId) || null;
}

export function isInterestingDecision(decision) {
  if (!decision || !Array.isArray(decision.options)) return false;
  const viable = decision.options.filter((option) => (
    option && option.viable !== false && String(option.tradeoff || '').trim().length >= 8
  ));
  if (viable.length < 2) return false;
  const text = new Set(viable.map((option) => option.tradeoff.trim()));
  const stake = new Set(viable.map((option) => String(option.stake ?? '')));
  return text.size >= 2 && stake.size >= 2 && !stake.has('');
}

function contractTradeoff(offer) {
  const pay = Math.max(0, Math.round(Number(offer.reward_cr) || 0));
  const risk = Math.max(0, Math.round(Number(offer.riskTier) || 0));
  const minutes = Number(offer.time_limit_s) > 0
    ? Math.max(1, Math.round(Number(offer.time_limit_s) / 60))
    : null;
  const collateral = Math.max(0, Math.round(Number(offer.collateral_cr) || 0));
  const dest = offer.destStationId
    ? stationName(offer.destStationId)
    : (offer.destSectorId ? 'the destination sector' : 'this berth');
  const clause = Array.isArray(offer.clauses) && offer.clauses[0] && offer.clauses[0].prose
    ? shortSentence(offer.clauses[0].prose)
    : '';
  const parts = [
    `Pays ${pay.toLocaleString('en-US')} cr`,
    `risk ${risk}`,
    dest,
  ];
  if (minutes) parts.push(`${minutes} min`);
  parts.push(collateral > 0
    ? `${collateral.toLocaleString('en-US')} cr collateral if it fails`
    : 'no collateral');
  if (clause) parts.push(clause);
  return parts.join(' · ');
}

function offerViable(state, offer) {
  if (!offer || !offer.id || offer.storyDisposition) return false;
  const preflight = missionPreflight(offer, state);
  return !preflight.blocker;
}

function contractStake(offer) {
  return [
    Math.round(Number(offer.reward_cr) || 0),
    Math.round(Number(offer.riskTier) || 0),
    offer.destStationId || offer.destSectorId || '',
    (offer.clauses && offer.clauses[0] && offer.clauses[0].id) || '',
  ].join(':');
}

function listContractDecision(state, stationId) {
  const boards = state && state.missions && state.missions.boards;
  const board = boards && boards[stationId];
  const slots = board && Array.isArray(board.slots) ? board.slots : [];
  const viable = slots.filter((offer) => offerViable(state, offer));
  if (viable.length < 2) return null;
  const ranked = [...viable].sort((a, b) => (
    (Number(b.reward_cr) || 0) - (Number(a.reward_cr) || 0)
    || String(a.id).localeCompare(String(b.id))
  ));
  const first = ranked[0];
  let second = null;
  let bestGap = -1;
  for (let i = 1; i < ranked.length; i++) {
    const candidate = ranked[i];
    if (contractStake(candidate) === contractStake(first)) continue;
    const gap = Math.abs((Number(first.reward_cr) || 0) - (Number(candidate.reward_cr) || 0))
      + Math.abs((Number(first.riskTier) || 0) - (Number(candidate.riskTier) || 0)) * 50;
    if (gap > bestGap) {
      bestGap = gap;
      second = candidate;
    }
  }
  if (!second) return null;
  const epoch = board.refreshEpoch != null
    ? board.refreshEpoch
    : Math.floor((Number(state.simTime) || 0) / (MISSION_TUNING.refreshSec || 300));
  const pair = [first.id, second.id].map(String).sort();
  return {
    id: `contract:${stationId}:${epoch}:${pair.join('+')}`,
    kind: 'contract',
    surface: 'contracts',
    situation: 'Two posted jobs can be taken. The pay, the risk, and what you forfeit are different.',
    options: [first, second].map((offer) => ({
      id: `take:${offer.id}`,
      label: offer.title || 'Posted job',
      tradeoff: contractTradeoff(offer),
      stake: contractStake(offer),
      viable: true,
      effect: {
        type: 'acceptMission',
        missionId: offer.id,
        rewardCr: Math.round(Number(offer.reward_cr) || 0),
      },
    })),
  };
}

function listForecastDecision(state, stationId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  if (!items || typeof items !== 'object') return null;
  let best = null;
  for (const commodityId of Object.keys(items).sort()) {
    const qty = heldQty(state, commodityId);
    if (qty < 1) continue;
    const live = quote(stationId, commodityId, 'sell', qty);
    if (!live || !live.ok) continue;
    const curve = predictPriceCurve(state, stationId, commodityId, FORECAST_STEPS, FORECAST_STEP_S);
    if (!curve || curve.length < 2) continue;
    const start = Number(curve[0].mid) || 0;
    const end = Number(curve[curve.length - 1].mid) || 0;
    if (!(start > 0)) continue;
    const move = (end - start) / start;
    const gap = Math.abs(end - start) * qty;
    if (Math.abs(move) < MIN_PRICE_MOVE || gap < MIN_CREDIT_GAP) continue;
    if (!best || gap > best.gap) {
      best = { commodityId, qty, live, end, move, gap, minutes: Math.round((FORECAST_STEPS * FORECAST_STEP_S) / 60) };
    }
  }
  if (!best) return null;
  const name = commodityName(best.commodityId);
  const sellTotal = Math.round(Number(best.live.total) || 0);
  const laterTotal = Math.round(best.end * best.qty);
  const up = best.move > 0;
  const band = Math.round(best.move / 0.05);
  return {
    id: `forecast:${stationId}:${best.commodityId}:${up ? 'up' : 'down'}:${band}`,
    kind: 'forecast',
    surface: 'market',
    situation: `${name} sells here now, or you can hold for the forecast.`,
    options: [
      {
        id: 'sell_now',
        label: `Sell ${name}`,
        tradeoff: `Sell ${best.qty} now for ${sellTotal.toLocaleString('en-US')} cr. You forfeit the later price.`,
        stake: `sell:${sellTotal}`,
        viable: true,
        effect: { type: 'sell', commodityId: best.commodityId, qty: best.qty },
      },
      {
        id: 'hold',
        label: `Hold ${name}`,
        tradeoff: up
          ? `Hold ${best.qty}. Forecast ${laterTotal.toLocaleString('en-US')} cr in ${best.minutes} min, but it can miss.`
          : `Hold ${best.qty}. Forecast falls to ${laterTotal.toLocaleString('en-US')} cr in ${best.minutes} min. You miss today's bid.`,
        stake: `hold:${laterTotal}`,
        viable: true,
        effect: { type: 'hold', commodityId: best.commodityId, qty: best.qty, forecastUp: up },
      },
    ],
  };
}

function listHaulDecision(state, stationId) {
  const trades = computeBestTrades(state, stationId);
  let best = null;
  for (const trade of trades) {
    const buy = Number(trade.buyHere) || 0;
    const margin = Number(trade.margin) || 0;
    const units = Math.max(0, Math.floor(Number(trade.loadUnits) || 0));
    const profit = Math.round(Number(trade.loadProfit) || 0);
    if (!(buy > 0) || units < 1 || profit < MIN_CREDIT_GAP) continue;
    if (margin / buy < MIN_PRICE_MOVE) continue;
    if (trade.intelSource === 'market') continue;
    const live = quote(stationId, trade.cmdtyId, 'buy', units);
    if (!live || !live.ok) continue;
    if (!best || profit > best.profit) best = { trade, units, profit, buy };
  }
  if (!best) return null;
  const cargo = state.player && state.player.cargo;
  const cargoFree = cargo && Number(cargo.capVolume) > 0
    ? Math.max(0, Number(cargo.capVolume) - (Number(cargo.usedVolume) || 0))
    : best.units;
  const plan = evaluateTwoLegItinerary({
    credits: creditsOf(state),
    cargoFree,
    leg1: { qty: best.units, unitCr: best.buy, unitVolume: 1, stock: best.units },
    leg2: { qty: best.units },
  });
  if (!(plan.leg1Taken > 0)) return null;
  best = { ...best, units: plan.leg1Taken };
  const name = best.trade.cmdtyName || commodityName(best.trade.cmdtyId);
  const dest = stationName(best.trade.destStation);
  const cost = Math.round(best.units * best.buy);
  return {
    id: `haul:${stationId}:${best.trade.destStation}:${best.trade.cmdtyId}:${best.profit}`,
    kind: 'haul',
    surface: 'market',
    situation: `${name} pays more at ${dest} than it costs here. Prices can move before you arrive.`,
    options: [
      {
        id: 'haul',
        label: `Haul to ${dest}`,
        tradeoff: `Buy ${best.units} for ${cost.toLocaleString('en-US')} cr and set course for ${dest}. The payout is an estimate.`,
        stake: `haul:${cost}:${best.profit}`,
        viable: true,
        effect: {
          type: 'haul',
          commodityId: best.trade.cmdtyId,
          qty: best.units,
          destStationId: best.trade.destStation,
        },
      },
      {
        id: 'stay',
        label: 'Keep the credits',
        tradeoff: `Keep ${cost.toLocaleString('en-US')} cr. Skip the ${best.profit.toLocaleString('en-US')} cr margin.`,
        stake: `stay:${creditsOf(state)}`,
        viable: true,
        effect: { type: 'stay' },
      },
    ],
  };
}

function listRepairDecision(state, stationId) {
  const ship = playerShip(state);
  if (!ship) return null;
  const hullMax = Number(ship.hullMax) || 0;
  const hull = Number(ship.hull) || 0;
  const armorMax = Number(ship.armorMax) || 0;
  const armor = Number(ship.armorHp) || 0;
  // The economy charges hull AND armor together and may queue the weld; quote the same
  // total the yard will charge so the tradeoff never understates the bill.
  const missHull = Math.max(0, hullMax - hull);
  const missArmor = Math.max(0, armorMax - armor);
  const totalMiss = missHull + missArmor;
  const totalMax = hullMax + armorMax;
  if (!(totalMax > 0) || totalMiss <= 0.5) return null;
  if ((totalMax - totalMiss) / totalMax > 1 - REPAIR_HULL_FRAC) return null;
  const cost = Math.round(totalMiss * SERVICE_PRICES.repairCrPerHp);
  if (cost < MIN_CREDIT_GAP || creditsOf(state) < cost) return null;
  const services = stationServices(stationId);
  if (services.length && !services.includes('repair')) return null;
  const armorWords = armorMax > 0 ? `, armor ${Math.round(armor)} → ${Math.round(armorMax)}` : '';
  const armorLeft = armorMax > 0 ? ` (armor ${Math.round(armor)})` : '';
  return {
    id: `repair:${stationId}:${Math.round(hull)}:${Math.round(armor)}`,
    kind: 'repair',
    surface: 'market',
    situation: 'Battered hull. The yard here can fix it.',
    options: [
      {
        id: 'repair',
        label: 'Repair now',
        tradeoff: `Pay ${cost.toLocaleString('en-US')} cr. Hull ${Math.round(hull)} → ${Math.round(hullMax)}${armorWords}.`,
        stake: `repair:${cost}`,
        viable: true,
        effect: { type: 'repair', cost },
      },
      {
        id: 'fly',
        label: 'Fly damaged',
        tradeoff: `Keep the ${cost.toLocaleString('en-US')} cr. Hull stays at ${Math.round(hull)}${armorLeft}.`,
        stake: `fly:${Math.round(hull)}:${Math.round(armor)}`,
        viable: true,
        effect: { type: 'fly' },
      },
    ],
  };
}

function stationServices(stationId) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === stationId);
    if (station) return Array.isArray(station.services) ? station.services : [];
  }
  return [];
}

function listForSurface(state, stationId, surface) {
  if (surface === 'contracts') {
    const contract = listContractDecision(state, stationId);
    return contract ? [contract] : [];
  }
  return [listRepairDecision(state, stationId), listForecastDecision(state, stationId), listHaulDecision(state, stationId)]
    .filter(Boolean);
}

export function presentSurfaceDecisions(state, stationId, surface) {
  const log = logOf(state);
  const out = [];
  for (const decision of listForSurface(state, stationId, surface)) {
    if (!isInterestingDecision(decision)) continue;
    if (log.chosenIds.has(decision.id) || log.closedIds.has(decision.id)) continue;
    const existing = log.presented.get(decision.id);
    if (existing) {
      out.push(existing);
      continue;
    }
    const record = {
      id: decision.id,
      kind: decision.kind,
      surface: decision.surface,
      situation: decision.situation,
      atS: Number(state.simTime) || 0,
      options: decision.options.map((option) => ({
        id: option.id,
        label: option.label,
        tradeoff: option.tradeoff.trim(),
        stake: String(option.stake),
        viable: true,
        effect: option.effect,
      })),
    };
    log.presented.set(decision.id, record);
    out.push(record);
  }
  return out;
}

function activeMissionIds(state) {
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  return new Set(active.filter((mission) => mission && mission.id).map((mission) => mission.id));
}

// The sim-worker lane applies emits asynchronously off-thread, so an effect verdict can
// never come from a synchronous facade read-back — it has to ride an rpc ack (registered
// only inside the worker realm) or a bridged outcome event.
const RPC_MISSING = /no lane rpc handler/;
function rpcUnavailable(resp) {
  return !resp || resp.ok !== true || (typeof resp.error === 'string' && RPC_MISSING.test(resp.error));
}

export async function acceptMissionOnLane(bus, missionId) {
  const resp = await laneRpc('missionsCall', { method: 'acceptMission', missionId });
  if (!rpcUnavailable(resp)) {
    const res = resp && resp.result;
    return { ok: res === true || (res && res.ok === true) };
  }
  // Main lane: the emit applies synchronously; availability is verified by the caller.
  if (bus) bus.emit('ui:acceptMission', { missionId });
  return { ok: true, emitted: true };
}

const TRADE_ACK_TIMEOUT_MS = 5000;
function waitTradeOutcome(bus, commodityId, side, timeoutMs = TRADE_ACK_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!bus || typeof bus.once !== 'function') {
      resolve({ ok: false, reason: 'no_bus' });
      return;
    }
    let settled = false;
    let timer = null;
    const offs = [];
    const finish = (res) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      for (const off of offs) { try { off(); } catch (_) {} }
      resolve(res);
    };
    const match = (p) => p && p.commodityId === commodityId && p.side === side;
    offs.push(bus.once('economy:tradeCompleted', (p) => { if (match(p)) finish({ ok: true }); }));
    offs.push(bus.once('economy:tradeFailed', (p) => {
      if (match(p)) finish({ ok: false, reason: p.reason || 'trade_failed' });
    }));
    timer = setTimeout(() => finish({ ok: false, reason: 'trade_unconfirmed' }), timeoutMs);
  });
}

const SERVICE_POLL_MS = 3500;
const SERVICE_POLL_STEP_MS = 120;
function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
// The service chain has no structured completed event, so the verdict is the same
// heuristic the main lane used — hull up or credits down — just waited for the mirror.
async function waitServiceSettled(state, hullBefore, creditsBefore, timeoutMs = SERVICE_POLL_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ship = playerShip(state);
    const hull = ship ? Number(ship.hull) || 0 : 0;
    if (hull > hullBefore || creditsOf(state) < creditsBefore) return { ok: true };
    if (Date.now() >= deadline) return { ok: false, reason: 'repair_failed' };
    await delay(SERVICE_POLL_STEP_MS);
  }
}

async function applyEffect(state, effect, ctx) {
  const bus = ctx && ctx.bus;
  if (!effect) return { ok: false, reason: 'no_effect' };
  if (effect.type === 'hold' || effect.type === 'stay' || effect.type === 'fly') {
    return { ok: true };
  }
  if (effect.type === 'acceptMission') {
    const before = activeMissionIds(state);
    const res = await acceptMissionOnLane(bus, effect.missionId);
    if (!res.emitted) return res.ok ? { ok: true } : { ok: false, reason: 'accept_failed' };
    // Accepted instances mint a fresh id — the growth check is the verdict, not a name hit.
    const after = activeMissionIds(state);
    if (after.size <= before.size) {
      return { ok: false, reason: 'accept_failed' };
    }
    return { ok: true };
  }
  if (effect.type === 'sell' || effect.type === 'buy' || effect.type === 'haul') {
    const economy = ctx && ctx.economy;
    const side = effect.type === 'sell' ? 'sell' : 'buy';
    const beforeCredits = creditsOf(state);
    const beforeQty = heldQty(state, effect.commodityId);
    let ok = null;
    let reason = 'trade_failed';
    if (economy && typeof economy.handleTrade === 'function') {
      const result = economy.handleTrade(effect.commodityId, side, effect.qty);
      if (result && result.ok === false) return { ok: false, reason: result.reason || 'trade_failed' };
      ok = creditsOf(state) !== beforeCredits || heldQty(state, effect.commodityId) !== beforeQty;
      reason = 'trade_unchanged';
    } else {
      const resp = await laneRpc('economyTrade', {
        commodityId: effect.commodityId, side, qty: effect.qty,
      });
      if (!rpcUnavailable(resp)) {
        const res = resp && resp.result;
        if (res && res.ok === false) return { ok: false, reason: res.reason || 'trade_failed' };
        ok = res === true || (res && res.ok === true);
      } else {
        const wait = waitTradeOutcome(bus, effect.commodityId, side);
        if (bus) bus.emit(side === 'sell' ? 'ui:sell' : 'ui:buy', { commodityId: effect.commodityId, qty: effect.qty });
        const outcome = await wait;
        if (!outcome.ok) return { ok: false, reason: outcome.reason };
        ok = true;
      }
    }
    if (!ok) return { ok: false, reason };
    if (effect.type === 'haul' && effect.destStationId) {
      try { applyTradeNavigation({ state, bus }, effect.destStationId, effect.commodityId); } catch (_) {}
    }
    return { ok: true };
  }
  if (effect.type === 'repair') {
    const ship = playerShip(state);
    const before = ship ? Number(ship.hull) || 0 : 0;
    const beforeCredits = creditsOf(state);
    if (bus) bus.emit('ui:service', { type: 'repair' });
    return waitServiceSettled(state, before, beforeCredits);
  }
  return { ok: false, reason: 'unknown_effect' };
}

export async function chooseAdventureDecision(state, decisionId, optionId, ctx = {}) {
  const log = logOf(state);
  const record = log.presented.get(decisionId);
  if (!record) return { ok: false, reason: 'not_visible' };
  if (log.chosenIds.has(decisionId)) return { ok: true, duplicate: true, counted: false };
  // An in-flight choice already reached the async apply — a second click must not
  // apply the effect twice while the verdict is still pending.
  if (log.applyingIds.has(decisionId)) return { ok: false, reason: 'in_flight' };
  const option = record.options.find((row) => row.id === optionId);
  if (!option) return { ok: false, reason: 'missing_option' };
  log.applyingIds.add(decisionId);
  try {
    const applied = await applyEffect(state, option.effect, ctx);
    if (!applied.ok) return applied;
    log.chosenIds.add(decisionId);
    log.chosen.push({
      id: decisionId,
      kind: record.kind,
      situation: record.situation,
      chosen: option.id,
      tradeoff: option.tradeoff,
      options: record.options.map((row) => ({ id: row.id, tradeoff: row.tradeoff })),
      atS: Number(state.simTime) || 0,
    });
    return { ok: true, counted: true };
  } finally {
    log.applyingIds.delete(decisionId);
  }
}

export function dismissUnworkableDecision(state, decisionId) {
  const log = logOf(state);
  log.closedIds.add(decisionId);
}

export function adventureDecisionSummary(state) {
  const log = logs.get(state);
  const chosen = log ? log.chosen : [];
  const simTimeS = Math.max(0, Number(state && state.simTime) || 0);
  const hours = simTimeS / 3600;
  const byKind = {};
  for (const row of chosen) byKind[row.kind] = (byKind[row.kind] || 0) + 1;
  return {
    count: chosen.length,
    simTimeS,
    perHour: hours > 0 ? chosen.length / hours : 0,
    bar: ADVENTURE_DECISION_BAR_PER_HOUR,
    byKind,
    decisions: chosen.map((row) => ({
      id: row.id,
      kind: row.kind,
      situation: row.situation,
      chosen: row.chosen,
      tradeoff: row.tradeoff,
      options: row.options,
      atS: row.atS,
    })),
  };
}

export function adventureDecisionHudLine(state) {
  const log = logs.get(state);
  if (!log) return '';
  for (const record of log.presented.values()) {
    if (log.chosenIds.has(record.id) || log.closedIds.has(record.id)) continue;
    return record.situation;
  }
  const last = log.chosen[log.chosen.length - 1];
  if (!last) return '';
  const line = `${last.situation} ${last.tradeoff}`;
  return line.length > 180 ? `${line.slice(0, 177)}...` : line;
}

export function stationSectorId(stationId) {
  return STATION_SECTOR.get(stationId) || null;
}
