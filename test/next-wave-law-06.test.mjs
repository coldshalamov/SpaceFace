// LAW-06: opening a black-market register asks the dock to wash papers.
// The market does not write the ledger. A lawful berth does not ask.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  TETHYS_BLACK_MARKET_DISCOVERY,
  TETHYS_BLACK_MARKET_RUN,
} from '../src/data/frontierRumors.js';
import {
  canLaunderSalvageAtStation,
  launderCutCredits,
} from '../src/data/salvageLegality.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';
import { requestMarketLaunder } from '../src/ui/station/screens/market.js';

const LAWFUL_BERTH = 'station_helios';

function deliveredAccess(state) {
  state.world = state.world || {};
  state.world.frontierRumors = {
    byId: {
      [TETHYS_BLACK_MARKET_DISCOVERY.rumorId]: {
        phase: 'contacted',
        contactId: TETHYS_BLACK_MARKET_DISCOVERY.contactId,
        entranceRun: {
          runId: TETHYS_BLACK_MARKET_RUN.runId,
          phase: 'delivered',
        },
      },
    },
  };
}

test('the market open emits one launder intent and the dock writes the ledger once', () => {
  assert.equal(canLaunderSalvageAtStation(LAWFUL_BERTH), false);
  const state = createGameState(4242);
  const bus = createBus();
  const disguise = Object.assign({}, pirateDisguise);
  disguise.init({ state, bus, helpers: {} });

  state.playerId = 900001;
  state.entities.set(state.playerId, {
    id: state.playerId,
    alive: true,
    pos: { x: 0, z: 0 },
  });
  const hot = spawnJettisonedCargoPod(state, {
    commodityId: TETHYS_BLACK_MARKET_RUN.commodityId,
    amount: TETHYS_BLACK_MARKET_RUN.amount,
    pos: { x: 20, z: 0 },
  });
  const legal = spawnJettisonedCargoPod(state, {
    commodityId: 'cmdty_food',
    amount: TETHYS_BLACK_MARKET_RUN.amount,
    pos: { x: 40, z: 0 },
  });
  assert.ok(hot && legal);
  const hotId = hot.data.commodityId;
  const hotAmount = hot.data.amount;
  const legalId = legal.data.commodityId;

  deliveredAccess(state);
  state.ui.dockedStationId = TETHYS_BLACK_MARKET_RUN.stationId;
  state.factions = state.factions || {};
  const faction = state.factions.faction_quiet || (state.factions.faction_quiet = {});
  faction.rep = 0;
  state.player.credits = launderCutCredits(hotId, hotAmount, faction.rep);
  const heatBefore = state.player.heat = 0.4;

  const intents = [];
  const charges = [];
  bus.on('dock:launder', (payload) => intents.push(payload));
  bus.on('economy:chargeCredits', (payload) => charges.push(payload));

  assert.equal(requestMarketLaunder(bus, state), true);
  assert.equal(requestMarketLaunder(bus, state), true);

  assert.equal(intents.length, 2);
  assert.deepEqual(intents[0], { stationId: TETHYS_BLACK_MARKET_RUN.stationId });
  assert.deepEqual(intents[1], intents[0]);
  assert.equal(state.player.launderLedger.length, 1);
  const row = state.player.launderLedger[0];
  assert.equal(row.stationId, TETHYS_BLACK_MARKET_RUN.stationId);
  assert.equal(row.cut, launderCutCredits(hotId, hotAmount, row.reputation));
  assert.equal(row.reputation, faction.rep);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amount, row.cut);
  assert.equal(hot.data.laundered, true);
  assert.notEqual(legal.data.laundered, true);
  assert.equal(legal.data.commodityId, legalId);
  assert.equal(state.player.heat, heatBefore);

  const before = intents.length;
  state.ui.dockedStationId = LAWFUL_BERTH;
  assert.equal(requestMarketLaunder(bus, state), false);
  assert.equal(intents.length, before);
  assert.equal(state.player.launderLedger.length, 1);

  const src = readFileSync(new URL('../src/ui/station/screens/market.js', import.meta.url), 'utf8');
  assert.match(src, /requestMarketLaunder\(ctx\.bus, st\)/);
  assert.doesNotMatch(src, /launderLedger\s*\.push|launderLedger\s*\.unshift/);
});
