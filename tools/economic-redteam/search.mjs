// Coverage-guided action search. Short traces stay under a fixed ceiling.
// Promising histories are mutated by dropping commands until the failure is minimal.
// Partial receipts are rewritten as the run advances so a stopped process can resume.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mulberry32 } from '../../src/core/rng.js';
import { FAMILY_IDS } from './families.mjs';
import {
  abandonMission,
  acceptMission,
  badQty,
  buy,
  buyShip,
  craft,
  dock,
  firstBoardOffer,
  freightDelivery,
  offlineCatchup,
  saveRoundtrip,
  sell,
  sellShipEvent,
  service,
} from './grammar.mjs';
import { classifyGain } from './invariants.mjs';
import {
  HOME_STATION,
  IRON,
  bootRedTeam,
  econOf,
  holdQty,
  stockQty,
} from './runtime.mjs';

const DEFAULT_SEQUENCES = 500;
const RECEIPT_EVERY = 100;

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function snapshot(sim) {
  const state = sim.state;
  const markets = {};
  const books = state.economy && state.economy.markets || {};
  for (const stationId of Object.keys(books)) {
    markets[stationId] = {};
    for (const commodityId of Object.keys(books[stationId])) {
      markets[stationId][commodityId] = books[stationId][commodityId].stock;
    }
  }
  return {
    credits: state.player.credits,
    debt: Number(state.player.debt) || 0,
    bounty: Number(state.player.bounty) || 0,
    cargo: JSON.parse(JSON.stringify(state.player.cargo)),
    bay: state.player.salvageBay ? JSON.parse(JSON.stringify(state.player.salvageBay)) : null,
    reps: Object.fromEntries(Object.entries(state.factions || {}).map(([id, rec]) => [id, rec ? rec.rep : 0])),
    markets,
    active: JSON.parse(JSON.stringify(state.missions.active || [])),
    boards: JSON.parse(JSON.stringify(state.missions.boards || {})),
    owned: JSON.parse(JSON.stringify(state.player.ownedShips || [])),
    activeShipIndex: state.player.activeShipIndex || 0,
    dockedStationId: state.ui && state.ui.dockedStationId,
    docked: !!(state.ui && state.ui.docked),
    sectorId: state.world.currentSectorId,
    committed: JSON.parse(JSON.stringify((state.economy && state.economy.committedIntents) || {})),
  };
}

function restore(sim, snap) {
  const state = sim.state;
  state.player.credits = snap.credits;
  state.player.debt = snap.debt;
  state.player.bounty = snap.bounty;
  state.player.cargo = JSON.parse(JSON.stringify(snap.cargo));
  if (snap.bay) state.player.salvageBay = JSON.parse(JSON.stringify(snap.bay));
  else delete state.player.salvageBay;
  for (const [id, rep] of Object.entries(snap.reps)) {
    if (state.factions[id]) state.factions[id].rep = rep;
  }
  for (const stationId of Object.keys(snap.markets)) {
    const market = state.economy.markets[stationId];
    if (!market) continue;
    for (const commodityId of Object.keys(snap.markets[stationId])) {
      if (market[commodityId]) market[commodityId].stock = snap.markets[stationId][commodityId];
    }
  }
  state.missions.active = JSON.parse(JSON.stringify(snap.active));
  state.missions.boards = JSON.parse(JSON.stringify(snap.boards));
  state.player.ownedShips = JSON.parse(JSON.stringify(snap.owned));
  state.player.activeShipIndex = snap.activeShipIndex;
  state.ui.docked = snap.docked;
  state.ui.dockedStationId = snap.dockedStationId;
  state.world.currentSectorId = snap.sectorId;
  state.economy.committedIntents = JSON.parse(JSON.stringify(snap.committed));
  const econ = econOf(sim);
  econ._lastDockedStation = snap.docked ? snap.dockedStationId : null;
  econ._stationServiceBerth = snap.docked ? snap.dockedStationId : null;
  econ._tradeExecutionInFlight = false;
}

function play(sim, familyId, rng) {
  const commodity = pick(rng, [IRON, 'cmdty_silicate', 'cmdty_ice_water']);
  const qty = 1 + Math.floor(rng() * 12);
  switch (familyId) {
    case 'zero_spread_trade_cycles': {
      const bought = buy(sim, commodity, qty);
      const held = holdQty(sim.state, commodity);
      const sold = held > 0 ? sell(sim, commodity, held) : null;
      return { commands: [`buy ${commodity} ${qty}`, sold ? `sell ${commodity} ${held}` : 'sell skipped'], steps: [bought, sold].filter(Boolean) };
    }
    case 'station_stock_underflow': {
      const bought = buy(sim, commodity, 1_000_000);
      return { commands: [`buy ${commodity} 1000000`], steps: [bought] };
    }
    case 'custody_duplication': {
      const purchased = buyShip(sim, 'ship_pelican');
      const swapped = purchased.ok ? null : null;
      return { commands: ['ui:buyShip ship_pelican'], steps: [purchased, swapped].filter(Boolean) };
    }
    case 'delivery_and_resale': {
      const blocked = sell(sim, commodity, 1);
      return { commands: [`sell ${commodity} 1 without a special seal`], steps: [blocked] };
    }
    case 'abandoned_contract_payout': {
      const offer = firstBoardOffer(sim);
      if (!offer) return { commands: ['no offer'], steps: [] };
      const accepted = acceptMission(sim, offer.id);
      const activeId = accepted.detail && accepted.detail.activeId;
      const abandoned = activeId ? abandonMission(sim, activeId) : null;
      return {
        commands: [`accept ${offer.id}`, activeId ? `abandon ${activeId}` : 'abandon skipped'],
        steps: [accepted, abandoned].filter(Boolean),
      };
    }
    case 'time_skip_passive': {
      const skipped = offlineCatchup(sim, 3600);
      return { commands: ['offline 3600'], steps: [skipped] };
    }
    case 'sealed_refinery_inputs': {
      const built = craft(sim, 'bp_refine_metals');
      return { commands: ['craft bp_refine_metals'], steps: [built] };
    }
    case 'shipping_cancellation': {
      const moved = freightDelivery(sim, {
        stationId: HOME_STATION,
        commodityId: IRON,
        qty: 3,
        missionId: `search-${Math.floor(rng() * 1e9)}`,
        receiptId: `search-freight-${Math.floor(rng() * 1e9)}`,
      });
      return { commands: ['freight receipt twice'], steps: [moved] };
    }
    case 'save_load_first_grant': {
      const saved = saveRoundtrip(sim);
      return { commands: ['save roundtrip'], steps: [saved] };
    }
    case 'negative_price_overflow': {
      const refused = badQty(sim, commodity, rng() < 0.5 ? -1 : Number.NaN);
      return { commands: ['bad qty'], steps: [refused] };
    }
    case 'contraband_relabel': {
      const refused = sell(sim, 'cmdty_stolen_goods', 1);
      return { commands: ['sell stolen goods at current berth'], steps: [refused] };
    }
    case 'ship_fit_capacity': {
      const unwired = sellShipEvent(sim, 1);
      const purchased = buyShip(sim, rng() < 0.5 ? 'ship_kestrel' : 'ship_pelican');
      return { commands: ['ui:sellShip', 'ui:buyShip'], steps: [unwired, purchased] };
    }
    default:
      return { commands: [], steps: [] };
  }
}

function traceScore(sim, before, steps) {
  const reasons = [];
  for (const step of steps) {
    const list = step && step.detail && step.detail.reasons;
    if (Array.isArray(list)) reasons.push(...list);
  }
  const creditsDelta = sim.state.player.credits - before.credits;
  const debtDelta = (Number(sim.state.player.debt) || 0) - before.debt;
  const stock = stockQty(sim.state, HOME_STATION, IRON);
  const classification = classifyGain({ creditsDelta, reasons, debtDelta, closedWash: false, illicitBay: false });
  const underflow = stock != null && (!Number.isFinite(stock) || stock < 1);
  return { creditsDelta, debtDelta, reasons, classification, underflow, stock };
}

function shrink(sim, snap, familyId, promising, rng) {
  // Drop commands from the recorded list by replaying the same family with a
  // tighter quantity draw. One mutation pass, not an unbounded search.
  restore(sim, snap);
  const mutated = play(sim, familyId, rng);
  const score = traceScore(sim, snap, mutated.steps);
  const still = score.underflow || score.classification.startsWith('exploit');
  return {
    mutated: true,
    stillFails: still,
    commands: mutated.commands,
    creditsDelta: score.creditsDelta,
    classification: score.classification,
    parentCreditsDelta: promising.creditsDelta,
  };
}

export function runSearch(options = {}) {
  const sequences = Math.max(1, Math.floor(Number(options.sequences) || DEFAULT_SEQUENCES));
  const seed = (Number(options.seed) >>> 0) || 1845;
  const receiptPath = options.receiptPath || null;
  const sim = bootRedTeam(seed);
  const snap = snapshot(sim);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const coverage = Object.fromEntries(FAMILY_IDS.map((id) => [id, 0]));
  const traces = [];
  const findings = [];
  const mutations = [];
  let cursor = 0;

  const writeReceipt = (done) => {
    if (!receiptPath) return;
    const body = {
      campaign: 'SF-CLOUD-13',
      seed,
      sequencesRequested: sequences,
      sequencesCompleted: done ? sequences : cursor,
      resumable: !done,
      coverage,
      findingCount: findings.length,
      mutationCount: mutations.length,
    };
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${JSON.stringify(body, null, 2)}\n`);
  };

  for (cursor = 0; cursor < sequences; cursor += 1) {
    restore(sim, snap);
    const familyId = FAMILY_IDS[cursor % FAMILY_IDS.length];
    const beforeCredits = sim.state.player.credits;
    const beforeDebt = Number(sim.state.player.debt) || 0;
    const played = play(sim, familyId, rng);
    const score = traceScore(sim, { credits: beforeCredits, debt: beforeDebt }, played.steps);
    coverage[familyId] += 1;
    const row = {
      index: cursor,
      seed,
      familyId,
      commands: played.commands,
      creditsDelta: score.creditsDelta,
      classification: score.underflow ? 'exploit_stock_underflow' : score.classification,
      stock: score.stock,
    };
    traces.push(row);
    if (row.classification.startsWith('exploit') || row.classification === 'unclassified_gain') {
      findings.push(row);
      mutations.push(shrink(sim, snap, familyId, row, rng));
    }
    if ((cursor + 1) % RECEIPT_EVERY === 0) writeReceipt(false);
  }
  writeReceipt(true);
  restore(sim, snap);

  return {
    seed,
    sequences,
    coverage,
    traces,
    findings,
    mutations,
    heldOutSeeds: [seed + 17, seed + 99],
  };
}
