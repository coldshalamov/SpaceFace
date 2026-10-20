// Row 465 RC-MARKET-WHY — the market explains itself (M1).
//
// Four read-only claims on the default route:
//   A. a price move names the pilot's own sale/purchase, or worked-out local belts, before the
//      generic cycle label (RC-28);
//   B. trade-route cards carry a lane-safety word from the worse end of the lane;
//   C. the mechanic never says "Clean plate" over a hull whose points are down (RC-29);
//   D. the bar's market tag is this station's news or nothing (RC-30).
// Every read is pure: no economy writes, no field-depletion state creation.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { addCargo } from '../src/systems/cargo.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { regimeLabel } from '../src/systems/economyCycles.js';
import { defaultLivingHull } from '../src/core/livingHull.js';
import { leftoverMechanicCard, leftoverMechanicLines } from '../src/story/mechanicVoice.js';
import { barContactIntelTags } from '../src/ui/station/barContacts.js';
import { lastMoveCause } from '../src/ui/marketDriverPresenter.js';
import {
  computeBestTrades,
  formatRouteCard,
  laneSecurityWord,
} from '../src/ui/market/tradeLogic.js';

const HERE = 'station_helios';
const THERE = 'station_coalition';
const IRON = 'cmdty_ore_iron';
const IRON_DEF = COMMODITIES.find((c) => c.id === IRON);
const FRESH = 'cmdty_food';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [economy] });
  sim.state.mode = 'flight';
  sim.state.player.credits = 100000;
  sim.state.player.cargo.capVolume = 250;
  sim.state.simTime = 600;
  sim.state.ui.dockedStationId = HERE;
  const owner = sim.registry.get('economy');
  for (const sid of [HERE, THERE]) { owner.ensureMarket(sid); owner.snapshotIntel(sid); }
  return { sim, owner, state: sim.state };
}

function advance(state, owner, seconds) {
  const target = state.simTime + seconds;
  while (state.simTime < target - 1e-6) {
    const dt = Math.min(5, target - state.simTime);
    state.simTime += dt;
    owner.update(dt, state);
  }
}

function causeAt(state, owner) {
  const entry = owner.getMarket(HERE)[IRON];
  return lastMoveCause({ state, stationId: HERE, commodity: IRON_DEF, entry });
}

test('selling 20 iron at Helios names your sale', () => {
  const { sim, owner, state } = boot();
  try {
    addCargo(state, IRON, 40);
    const sold = owner.execute(HERE, IRON, 'sell', 20);
    assert.equal(sold.ok, true);
    const cause = causeAt(state, owner);
    assert.equal(cause.kind, 'player_trade');
    assert.equal(cause.text, 'Last move: your sale of 20 Iron Ore here');
    assert.equal(cause.eventId, null, 'eventId stays the evt_ contract');
    assert.equal(cause.receiptId, state.player.tradeLedger[0].receiptId);
    const cycle = state.economy.cycles[HERE] && state.economy.cycles[HERE][IRON];
    const regime = (cycle && (cycle.regime || cycle.family)) || 'stable';
    assert.ok(!cause.text.includes(regimeLabel(regime)), 'the cycle label is not spoken over your own trade');
  } finally { sim.dispose(); economy._instance = null; }
});

test('the newest cause wins, in both orders', () => {
  const { sim, owner, state } = boot();
  try {
    addCargo(state, IRON, 60);
    assert.equal(owner.execute(HERE, IRON, 'sell', 20).ok, true);
    advance(state, owner, 10);
    const ev = owner.injectEvent({ type: 'shortage', stationId: HERE, commodityId: IRON, duration: 900 });
    const dashed = causeAt(state, owner);
    assert.equal(dashed.kind, 'event', 'a fresher sim event outranks an older sale');
    assert.equal(dashed.eventId, ev.id);
    advance(state, owner, 10);
    assert.equal(owner.execute(HERE, IRON, 'sell', 20).ok, true);
    assert.equal(causeAt(state, owner).kind, 'player_trade', 'a fresher sale outranks an older event');
    assert.equal(owner.execute(HERE, IRON, 'buy', 1).ok, true);
    assert.match(causeAt(state, owner).text, /your purchase of \d+ Iron Ore here/);
  } finally { sim.dispose(); economy._instance = null; }
});

test('the player-trade window expires one recovery half-life later', () => {
  const { sim, owner, state } = boot();
  try {
    addCargo(state, IRON, 20);
    assert.equal(owner.execute(HERE, IRON, 'sell', 20).ok, true);
    assert.equal(causeAt(state, owner).kind, 'player_trade');
    advance(state, owner, Math.ceil(281.25) + 10);
    assert.notEqual(causeAt(state, owner).kind, 'player_trade', 'the sale stops being the mover');
  } finally { sim.dispose(); economy._instance = null; }
});

test('worked-out belts come before the cycle label, and the read creates no depletion state', () => {
  const state = { meta: { seed: 4242 }, simTime: 0, player: {}, economy: { econEvents: [], cycles: {} } };
  const entry = {
    eventMods: [],
    demandDrivers: [{ id: 'depletion-scarcity', direction: 'up', delta: 0.1 }],
  };
  const depleted = lastMoveCause({ state, stationId: HERE, commodity: IRON_DEF, entry });
  assert.equal(depleted.kind, 'depletion');
  assert.equal(depleted.eventId, null);
  assert.match(depleted.text, /worked-out belts in Helios Prime/);
  assert.equal('fieldDepletion' in state, false, 'the UI read never creates the field-depletion state');

  const plain = lastMoveCause({
    state,
    stationId: HERE,
    commodity: IRON_DEF,
    entry: { eventMods: [], demandDrivers: [] },
  });
  assert.equal(plain.kind, 'cycle');
});

test('secure lane versus lawless lane, and denied cards carry no lane word', () => {
  const state = {
    simTime: 2000,
    player: {
      credits: 10000,
      cargo: { capVolume: 50, usedVolume: 0 },
      marketMemory: {
        [THERE]: { [IRON]: { buy: 20, sell: 30, seenAt: 1990 } },
        station_sker: { [FRESH]: { buy: 20, sell: 30, seenAt: 1990 } },
      },
    },
    economy: {
      markets: {
        [HERE]: {
          [IRON]: { lastBuy: 10, stock: 100 },
          [FRESH]: { lastBuy: 10, stock: 100 },
        },
      },
    },
  };
  const rows = computeBestTrades(state, HERE);
  const secure = rows.find((t) => t.cmdtyId === IRON);
  const lawless = rows.find((t) => t.cmdtyId === FRESH);
  assert.ok(secure, 'iron run to Coalition survives');
  assert.ok(lawless, 'food run to Sker survives');
  assert.equal(secure.laneRisk.word, 'secure lane');
  assert.equal(lawless.laneRisk.word, 'lawless lane');
  assert.match(formatRouteCard(secure).sub, /→ sell 30 · secure lane · /);
  assert.match(formatRouteCard(lawless).sub, /→ sell 30 · lawless lane · /);

  assert.equal(laneSecurityWord(0.98), 'secure lane');
  assert.equal(laneSecurityWord(0.6), 'watchful lane');
  assert.equal(laneSecurityWord(0.3), 'rough lane');
  assert.equal(laneSecurityWord(0.08), 'lawless lane');

  const denied = formatRouteCard({ loadUnits: 0, reason: 'tier_unavailable' });
  assert.doesNotMatch(denied.sub, / lane/);
});

function berthState({ hull = defaultLivingHull(0), entityHull = null } = {}) {
  const state = {
    meta: { seed: 4242 },
    playerId: 1,
    player: {
      credits: 5000,
      heat: 0,
      activeShipIndex: 0,
      tradeLedger: [],
      ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: hull }],
    },
    ui: { marketNews: { log: [], lastCard: null } },
  };
  if (entityHull) state.entities = new Map([[1, { id: 1, hull: entityHull.hull, hullMax: entityHull.max }]]);
  return state;
}

test('a hull at 86/100 never hears "Clean plate"', () => {
  const state = berthState({ entityHull: { hull: 86, max: 100 } });
  const lines = leftoverMechanicLines(state);
  for (const line of lines) assert.doesNotMatch(line, /Clean plate/);
  const card = leftoverMechanicCard(state);
  assert.doesNotMatch(card.body, /Clean plate/);
  assert.match(card.body, /plating reads 86 of 100/);

  // A fraction of a point is still a dent: compared raw, spoken floored.
  const nearly = leftoverMechanicCard(berthState({ entityHull: { hull: 99.6, max: 100 } }));
  assert.doesNotMatch(nearly.body, /Clean plate/);
  assert.match(nearly.body, /plating reads 99 of 100/);

  const whole = berthState({ entityHull: { hull: 100, max: 100 } });
  assert.match(leftoverMechanicCard(whole).body, /Clean plate\. Nothing on this hull to file\./);

  const noEntity = berthState();
  assert.match(leftoverMechanicCard(noEntity).body, /Clean plate\. Nothing on this hull to file\./);
});

test('the bar market tag is this station\'s news or nothing', () => {
  const ceres = { id: 'evt_1', type: 'shortage', stationId: 'station_ceres', commodityId: IRON, startT: 0 };
  const state = { simTime: 0, player: {}, economy: { econEvents: [ceres] } };
  const merchantTags = barContactIntelTags({ id: 'x', role: 'merchant' }, state, HERE);
  assert.equal(merchantTags.some((tag) => tag.label === 'Market'), false, 'a Ceres event is not Helios gossip');

  state.economy.econEvents.push({ id: 'evt_2', type: 'boom', stationId: HERE, commodityId: FRESH, startT: 0 });
  const withLocal = barContactIntelTags({ id: 'x', role: 'merchant' }, state, HERE);
  assert.equal(withLocal.some((tag) => tag.label === 'Market'), true, 'this station\'s own news still tags');

  const remoteOnly = { simTime: 0, player: {}, economy: { econEvents: [ceres] } };
  const drifter = barContactIntelTags({ id: 'y', role: 'drifter' }, remoteOnly, HERE);
  assert.equal(drifter.some((tag) => tag.label === 'Rumor'), false);
  assert.equal(drifter.some((tag) => tag.label === 'Lane'), true);
});
