// Four honest player strategies on the same opening stake and seed.
// A strategy is degenerate only when its own trace is a closed feedback loop.

import { COMMODITIES } from '../../src/data/commodities.js';
import {
  buy,
  dock,
  leaveDock,
  lootDrop,
  sell,
  service,
  stepTicks,
} from './grammar.mjs';
import { closedWashVerdict } from './invariants.mjs';
import {
  HOME_STATION,
  IRON,
  bayQty,
  bootRedTeam,
  econOf,
  holdQty,
  stationRecord,
  stockQty,
} from './runtime.mjs';

const BUDGET = 8;

function finish(id, sim, startCredits, notes, risk) {
  return {
    id,
    credits: sim.state.player.credits,
    earned: sim.state.player.credits - startCredits,
    debt: Number(sim.state.player.debt) || 0,
    heat: Number(sim.state.player.heat) || 0,
    risk,
    notes,
  };
}

function bestLegalRoute(sim) {
  const econ = econOf(sim);
  let best = null;
  const goods = COMMODITIES.filter((row) => row && row.legality === 'legal' && (row.marketTier || 0) <= 1).slice(0, 6);
  const stations = ['station_helios', 'station_customs', 'station_forge', 'station_depot3'].filter((id) => stationRecord(id));
  for (const good of goods) {
    for (const from of stations) {
      econ.ensureMarket(from);
      for (const to of stations) {
        if (to === from) continue;
        econ.ensureMarket(to);
        const buyQ = econ.quote(from, good.id, 'buy', 8);
        const sellQ = econ.quote(to, good.id, 'sell', 8);
        if (!buyQ.ok || !sellQ.ok) continue;
        const margin = sellQ.total - buyQ.total;
        if (!best || margin > best.margin) {
          best = { from, to, commodityId: good.id, margin, buy: buyQ.total, sell: sellQ.total };
        }
      }
    }
  }
  return best;
}

export function runLegalTrader(seed) {
  const sim = bootRedTeam(seed);
  service(sim, 'loan');
  const start = sim.state.player.credits;
  const route = bestLegalRoute(sim);
  const notes = [];
  if (!route || route.margin <= 0) {
    const cycleStart = sim.state.player.credits;
    const stock0 = stockQty(sim.state, HOME_STATION, IRON);
    const cargo0 = holdQty(sim.state, IRON);
    buy(sim, IRON, 10);
    const gained = holdQty(sim.state, IRON) - cargo0;
    if (gained > 0) sell(sim, IRON, gained);
    const verdict = closedWashVerdict({
      creditsDelta: sim.state.player.credits - cycleStart,
      stockDelta: stockQty(sim.state, HOME_STATION, IRON) - stock0,
      cargoDelta: holdQty(sim.state, IRON) - cargo0,
    });
    notes.push(verdict.exploit
      ? 'Same-berth iron wash printed credits.'
      : 'No quoted two-stop route beat the spread. A same-berth wash at opening standing lost or broke even.');
    return {
      ...finish('legal_trader', sim, start, notes, { fines: 0, travel: false }),
      degenerate: verdict.exploit,
      route,
    };
  }
  dock(sim, route.from);
  buy(sim, route.commodityId, 8);
  leaveDock(sim);
  dock(sim, route.to);
  const held = holdQty(sim.state, route.commodityId);
  if (held > 0) sell(sim, route.commodityId, held);
  notes.push(`Hauled ${route.commodityId} ${route.from} -> ${route.to}. Quoted margin ${route.margin} cr before tolls.`);
  return {
    ...finish('legal_trader', sim, start, notes, { fines: 0, travel: true }),
    degenerate: false,
    route,
  };
}

export function runMinerRefiner(seed) {
  const sim = bootRedTeam(seed);
  const start = sim.state.player.credits;
  const notes = [];
  leaveDock(sim);
  lootDrop(sim, { commodityId: IRON, qty: 12, source: 'mining' });
  lootDrop(sim, { commodityId: 'cmdty_ore_titanium', qty: 4, source: 'mining' });
  stepTicks(sim, 30);
  const iron = holdQty(sim.state, IRON);
  const titanium = holdQty(sim.state, 'cmdty_ore_titanium');
  notes.push(`Collected iron ${iron}, titanium ${titanium} from mining loot drops.`);
  dock(sim, HOME_STATION);
  if (iron >= 3 && titanium >= 1) {
    const built = sim.registry.get('crafting').build('bp_refine_metals', HOME_STATION);
    notes.push(built ? 'Refined metals.' : 'Refinery refused the load.');
  } else {
    notes.push('Not enough ore reached the hold to refine.');
  }
  const metals = holdQty(sim.state, 'cmdty_refined_metals');
  if (metals > 0) sell(sim, 'cmdty_refined_metals', metals);
  else if (iron > 0) sell(sim, IRON, iron);
  return {
    ...finish('miner_refiner', sim, start, notes, { fines: 0, travel: false }),
    degenerate: false,
    collected: { iron, titanium, metals },
  };
}

export function runPirateSalvager(seed) {
  const sim = bootRedTeam(seed);
  const start = sim.state.player.credits;
  const notes = [];
  let loops = 0;
  let paid = 0;
  for (let i = 0; i < BUDGET; i += 1) {
    leaveDock(sim);
    const drop = lootDrop(sim, { commodityId: 'cmdty_stolen_goods', qty: 4, source: 'kill_burst' });
    if (!drop.ok) break;
    stepTicks(sim, 48);
    if (bayQty(sim.state, 'cmdty_stolen_goods') <= 0) break;
    const cashed = dock(sim, HOME_STATION);
    loops += 1;
    if (cashed.creditsDelta > 0) paid += cashed.creditsDelta;
  }
  const degenerate = loops >= 2 && paid > 0;
  notes.push(degenerate
    ? `Kill-burst stolen goods cashed at Helios ${loops} times for ${paid} cr with no fine.`
    : `Pirate salvage loop did not repeat a clean payout (loops ${loops}, paid ${paid}).`);
  return {
    ...finish('pirate_salvager', sim, start, notes, { fines: 0, contrabandBay: true }),
    degenerate,
    loops,
    paid,
  };
}

export function runCarefulSmuggler(seed) {
  const sim = bootRedTeam(seed);
  const start = sim.state.player.credits;
  const notes = [];
  leaveDock(sim);
  lootDrop(sim, { commodityId: 'cmdty_stolen_goods', qty: 2, source: 'mining' });
  stepTicks(sim, 24);
  const lawfulQuote = econOf(sim).quote(HOME_STATION, 'cmdty_stolen_goods', 'sell', 2);
  const helios = dock(sim, HOME_STATION);
  const tried = sell(sim, 'cmdty_stolen_goods', 2);
  notes.push(`Helios sell of stolen goods: ${tried.reason || (tried.ok ? 'filled' : 'refused')}. Quote ${lawfulQuote.reason || lawfulQuote.ok}.`);
  const avoided = helios.creditsDelta >= 0 && holdQty(sim.state, 'cmdty_stolen_goods') > 0 && tried.ok !== true;
  notes.push(avoided
    ? 'Staying off the customs berth kept the hold and avoided a fine. The goods still did not sell.'
    : 'The careful hold was fined or the goods sold.');
  return {
    ...finish('careful_smuggler', sim, start, notes, { dockedCustoms: false, holdRemaining: holdQty(sim.state, 'cmdty_stolen_goods') }),
    degenerate: false,
    avoidedFine: avoided,
  };
}

export function runStrategies(seed = 1845) {
  const rows = [
    runLegalTrader(seed),
    runMinerRefiner(seed + 1),
    runPirateSalvager(seed + 2),
    runCarefulSmuggler(seed + 3),
  ];
  const ranked = [...rows].sort((a, b) => b.earned - a.earned);
  return {
    seed,
    rows,
    ranked: ranked.map((row) => ({ id: row.id, earned: row.earned, degenerate: row.degenerate })),
    degenerate: rows.filter((row) => row.degenerate).map((row) => row.id),
  };
}
