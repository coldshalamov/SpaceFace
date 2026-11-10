import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { economy } from '../src/systems/economy.js';
import {
  applyDomainPathUpdate,
  canonicalSignature,
  configureDomainMirroring,
  createDomainDiffer,
  createDomainMirroringProfile,
  createDomainProbeChecker,
  DOMAIN_COLD_BYTES,
  DOMAIN_COLD_TICKS,
} from '../scripts/lib/simReadModel.mjs';

const STATION = 'station_helios';

function bootRealMarket() {
  const state = createGameState(47);
  state.simTime = 40;
  const econ = Object.create(economy);
  econ.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  const market = econ.ensureMarket(STATION);
  assert.ok(market && Object.keys(market).length > 0, 'seed 47 must mint a real station market');
  return { state, econ, market };
}

function applyResult(mirror, result) {
  const touched = new WeakSet();
  for (const update of result.updates) applyDomainPathUpdate(mirror, update, touched);
}

function pathIs(update, ...segs) {
  return update && update.segs.length === segs.length
    && update.segs.every((segment, index) => segment === segs[index]);
}

test('station marketLive projection keeps live fields and explicit 60-pass cadence', (t) => {
  configureDomainMirroring(createDomainMirroringProfile('station'));
  t.after(() => configureDomainMirroring({}));

  const { state, econ, market } = bootRealMarket();
  state.economy.marketIntel[STATION] = {
    cmdty_ore_iron: { source: 'survey', seenAt: 40, confidence: 0.8 },
  };
  state.player.marketMemory[STATION] = {
    cmdty_ore_iron: { buy: 33, sell: 29, seenAt: 40 },
  };

  const authorityBeforeQuotes = {
    market: state.economy.markets[STATION],
    cycles: state.economy.cycles[STATION],
    marketIntel: state.economy.marketIntel[STATION],
    marketMemory: state.player.marketMemory[STATION],
  };
  const authoritySignatureBeforeQuotes = canonicalSignature(authorityBeforeQuotes);
  const resetCycles = structuredClone(state.economy.cycles[STATION]);
  const differ = createDomainDiffer({ probe: true });
  const mirror = new Map();
  const checker = createDomainProbeChecker(mirror);

  const initial = differ.diff(state, 0);
  const marketUpdate = initial.updates.find((update) => pathIs(update, 'economy', 'markets', STATION));
  assert.ok(marketUpdate, 'initial station market is still minted at once');
  assert.ok(marketUpdate.bytes < DOMAIN_COLD_BYTES,
    'history projection makes the real seed-47 station leaf a sub-cold payload');
  assert.ok(!Object.hasOwn(marketUpdate.v.cmdty_ore_iron, 'history'));

  applyResult(mirror, initial);
  assert.deepEqual(checker.consume(initial.probe).events, []);

  const mirroredMarket = mirror.get('economy').markets[STATION];
  assert.deepEqual(Object.keys(mirroredMarket).sort(), Object.keys(market).sort(),
    'projection keeps every real commodity listing');
  for (const [commodityId, sourceListing] of Object.entries(market)) {
    const mirroredListing = mirroredMarket[commodityId];
    assert.ok(mirroredListing, `listing ${commodityId} remains on the facade`);
    assert.equal(Object.hasOwn(mirroredListing, 'history'), false,
      `${commodityId} history is the only omitted listing field`);
    for (const key of Object.keys(sourceListing)) {
      if (key === 'history') continue;
      assert.deepEqual(mirroredListing[key], sourceListing[key],
        `${commodityId}.${key} remains parity-identical`);
    }
  }
  assert.deepEqual(mirror.get('economy').cycles[STATION], state.economy.cycles[STATION],
    'cycle authority remains fully mirrored');
  assert.deepEqual(mirror.get('economy').marketIntel[STATION], state.economy.marketIntel[STATION],
    'marketIntel remains fully mirrored');
  assert.deepEqual(mirror.get('player').marketMemory[STATION], state.player.marketMemory[STATION],
    'player market memory remains fully mirrored');

  const quoteIds = Object.keys(market);
  for (let i = 0; i < 24; i++) {
    const quote = econ.quote(STATION, quoteIds[i % quoteIds.length], i % 2 ? 'buy' : 'sell', 1 + (i % 3));
    assert.equal(quote.ok, true, `real quote ${i + 1} remains authoritative`);
  }
  assert.equal(canonicalSignature({
    market: state.economy.markets[STATION],
    cycles: state.economy.cycles[STATION],
    marketIntel: state.economy.marketIntel[STATION],
    marketMemory: state.player.marketMemory[STATION],
  }), authoritySignatureBeforeQuotes,
  '24 quote reads do not alter authority or mirror-only projection inputs');

  const recurrences = [];
  for (let tick = 1; tick <= DOMAIN_COLD_TICKS * 3; tick++) {
    market.cmdty_ore_iron.stock += 1;
    const result = differ.diff(state, tick);
    if (result.updates.some((update) => pathIs(update, 'economy', 'markets', STATION))) {
      recurrences.push(tick);
    }
    applyResult(mirror, result);
    assert.deepEqual(checker.consume(result.probe).events, [], `probe parity at tick ${tick}`);
  }
  assert.ok(recurrences.length >= 2, 'a changed real market should refresh during the test window');
  for (let i = 1; i < recurrences.length; i++) {
    assert.ok(recurrences[i] - recurrences[i - 1] >= DOMAIN_COLD_TICKS,
      'projected sub-4KiB market never falls back to the 10-pass economy cadence');
  }

  const replacement = structuredClone(state.economy.markets[STATION]);
  replacement.cmdty_ore_iron.stock += 1;
  state.economy.markets[STATION] = replacement;
  const replacementTick = recurrences.at(-1) + 1;
  const rebound = differ.diff(state, replacementTick);
  assert.ok(rebound.updates.some((update) => pathIs(update, 'economy', 'markets', STATION)),
    'a replaced market object is an immediate reset/rebind boundary');
  applyResult(mirror, rebound);
  assert.deepEqual(checker.consume(rebound.probe).events, []);

  const deleted = { ...state.economy.markets };
  delete state.economy.markets[STATION];
  const removal = differ.diff(state, DOMAIN_COLD_TICKS * 3 + 1);
  assert.ok(removal.updates.some((update) => update.del && pathIs(update, 'economy', 'markets', STATION)),
    'market deletion is structural and is not held behind the cadence');
  applyResult(mirror, removal);
  assert.equal(Object.hasOwn(mirror.get('economy').markets, STATION), false);

  state.economy.markets = deleted;
  state.economy.cycles = { [STATION]: resetCycles };
  const resetMarket = createDomainDiffer().diff(state, 0).updates
    .find((update) => pathIs(update, 'economy', 'markets', STATION));
  assert.ok(resetMarket, 'a fresh differ mints the reset market immediately');
  assert.equal(Object.hasOwn(resetMarket.v.cmdty_ore_iron, 'history'), false,
    'reset uses the same history-free market projection');
});
