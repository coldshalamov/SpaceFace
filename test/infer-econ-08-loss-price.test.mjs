// ECON-08 — a loss you caused moves the price and the news names the cause.
//
// On seed 4242 a loss-ledger entry on a shipped commodity (player-killed laden hull with a
// cargo manifest naming a destination) shifts its destination price through the EXISTING
// stock-pressure path (economy:applyTradePressure → economy.applyStockPressure, no new price
// model) and publishes exactly one CITED headline naming the cause. Uncited publishing is
// forbidden — the test pins the citation via tickerEventRef.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { lossLedger, lossesFor } from '../src/systems/lossLedger.js';
import { createMarketNews, tickerEventRef } from '../src/ui/marketNews.js';

const SEED = 4242;
const SECTOR_ID = 'sector_helios_prime';
const DEST_STATION = 'station_ceres';
const COMMODITY = 'cmdty_food';
// A full hauler hold (ROLE_CAPACITY.hauler in freightCausality): the lost lot is the whole
// manifest, so one buy-side drain of exactly this size is the conservation-honest pressure.
const QTY = 28;

function boot() {
  const voices = [];
  const helpers = {
    voice: {
      say(payload) {
        voices.push(structuredClone(payload));
        return true;
      },
    },
  };
  // Production order: economy owns stock, lossLedger records the loss; uiRoot installs
  // marketNews after the sim registry — keep that listener order here.
  const sim = createSimulation({ seed: SEED, helpers, systems: [economy, lossLedger] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 40;
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 6,
  });
  state.playerId = player.id;
  const events = { pressure: [], moves: [], headlines: [] };
  bus.on('economy:applyTradePressure', (payload) => events.pressure.push(payload));
  bus.on('lossLedger:priceMove', (payload) => events.moves.push(payload));
  bus.on('news:headline', (payload) => events.headlines.push(payload));
  const marketNews = createMarketNews({ bus, state, helpers });
  return {
    sim, state, bus, player, events, voices, marketNews,
    econ: sim.registry.get('economy'),
  };
}

function spawnLadenHauler(sim, tag, index = 0) {
  return sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_dmc',
    pos: { x: 180 + index * 10, z: 40 },
    vel: { x: 0, z: 0 },
    radius: 12,
    hull: 40,
    hullMax: 100,
    data: {
      defId: 'ship_mule',
      role: 'hauler',
      trafficRole: 'hauler',
      sectorId: SECTOR_ID,
      cargoManifest: {
        manifestId: `fm_econ08_${tag}`,
        freighterKey: `econ08:${tag}`,
        role: 'hauler',
        originStationId: 'station_helios',
        destStationId: DEST_STATION,
        lines: [{ commodityId: COMMODITY, qty: QTY }],
        totalQty: QTY,
      },
    },
  });
}

function spawnUnladenHull(sim, tag) {
  const victim = spawnLadenHauler(sim, tag);
  victim.data.cargoManifest = null;
  return victim;
}

function kill(harness, victim, killerId) {
  victim.alive = false;
  harness.bus.emit('entity:killed', {
    id: victim.id,
    killerId,
    type: 'ship',
    sectorId: SECTOR_ID,
    pos: { x: victim.pos.x, z: victim.pos.z },
  });
}

test('ECON-08: a player-caused loss on a shipped commodity shifts the destination price with one cited headline', () => {
  const h = boot();
  h.econ.ensureMarket(DEST_STATION);
  const listing = h.state.economy.markets[DEST_STATION][COMMODITY];
  assert.ok(listing, 'the destination lists the shipped commodity');
  const midBefore = listing.lastMid;
  const stockBefore = listing.stock;

  const hauler = spawnLadenHauler(h.sim, 'player-kill');
  kill(h, hauler, h.player.id);

  // 1. The ledger names the shipped commodity, its destination, and your agency.
  const entries = lossesFor(h.state, SECTOR_ID);
  const entry = entries.find((row) => row && row.assetId === hauler.id);
  assert.ok(entry, 'the kill is ledgered');
  assert.equal(entry.killedByPlayer, true, 'the entry marks your agency');
  assert.equal(entry.commodityId, COMMODITY, 'the entry names the shipped commodity');
  assert.equal(entry.destStationId, DEST_STATION, 'the entry names the destination');
  assert.ok(entry.lossId, 'the entry carries its seeded loss id');

  // 2. The existing price-shift path ran exactly once against the destination book.
  assert.equal(h.events.pressure.length, 1, 'one trade-pressure intent');
  assert.equal(h.events.pressure[0].stationId, DEST_STATION);
  assert.equal(h.events.pressure[0].commodityId, COMMODITY);
  assert.equal(h.events.pressure[0].vol, -QTY, 'buy-side drain of the lost lot');
  assert.equal(h.events.moves.length, 1, 'one structured price-move event');
  assert.equal(h.events.moves[0].lossId, entry.lossId, 'the move cites the loss');
  const midAfter = h.state.economy.markets[DEST_STATION][COMMODITY].lastMid;
  const stockAfter = h.state.economy.markets[DEST_STATION][COMMODITY].stock;
  assert.ok(stockAfter < stockBefore, `destination stock drains ${stockBefore} -> ${stockAfter}`);
  assert.ok(midAfter > midBefore, `destination price shifts ${midBefore} -> ${midAfter}`);

  // 3. Exactly one CITED headline names the cause. Uncited publishing is forbidden.
  assert.equal(h.events.headlines.length, 1, 'one news headline');
  const log = h.marketNews.getLog();
  assert.equal(log.length, 1, 'one committed ticker line');
  const rec = log[0];
  assert.equal(rec.eventId, entry.lossId, 'the line cites the loss id');
  assert.equal(rec.sourceRef, entry.lossId, 'the citation is traceable');
  assert.ok(tickerEventRef(rec), 'tickerEventRef resolves — the line is cited, never uncited');
  assert.match(rec.text, /your attack/i, 'the line names the cause: you');
  assert.match(rec.text, /Ceres Refinery/, 'the line names the destination');
  assert.match(rec.text, /provisions/i, 'the line names the shipped good');

  // 4. A replayed kill observation changes nothing — still exactly one of each.
  kill(h, hauler, h.player.id);
  assert.equal(h.events.pressure.length, 1, 'no second price move on replay');
  assert.equal(h.events.moves.length, 1, 'no second price-move event on replay');
  assert.equal(h.events.headlines.length, 1, 'no second headline on replay');
  assert.equal(h.marketNews.getLog().length, 1, 'the ticker still holds one cited line');

  // 5. Determinism: a fresh seed-4242 run mints the same loss, price, and line.
  const again = boot();
  again.econ.ensureMarket(DEST_STATION);
  const other = spawnLadenHauler(again.sim, 'player-kill');
  kill(again, other, again.player.id);
  const againEntry = lossesFor(again.state, SECTOR_ID).find((row) => row && row.assetId === other.id);
  assert.equal(againEntry.lossId, entry.lossId, 'same seed, same loss id');
  assert.equal(
    again.state.economy.markets[DEST_STATION][COMMODITY].lastMid,
    midAfter,
    'same seed, same destination price',
  );
  assert.equal(again.marketNews.getLog()[0].text, rec.text, 'same seed, same cited line');
});

test('ECON-08: kills you did not cause, and hulls carrying nothing, stay ledger-only', () => {
  const h = boot();
  h.econ.ensureMarket(DEST_STATION);
  const midBefore = h.state.economy.markets[DEST_STATION][COMMODITY].lastMid;
  const bystander = h.sim.spawn({
    type: 'ship', team: 1, pos: { x: 400, z: 400 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 6,
  });

  // An NPC-on-NPC kill of a laden hull: ledgered, but no price move and no headline.
  const npcVictim = spawnLadenHauler(h.sim, 'npc-kill');
  kill(h, npcVictim, bystander.id);
  const npcEntry = lossesFor(h.state, SECTOR_ID).find((row) => row && row.assetId === npcVictim.id);
  assert.ok(npcEntry, 'the NPC kill is still ledger history');
  assert.equal(npcEntry.killedByPlayer, false, 'but it is not your loss');

  // Your kill of an unladen hull: ledgered, but there is no shipped commodity to price.
  const empty = spawnUnladenHull(h.sim, 'empty-hold');
  kill(h, empty, h.player.id);

  assert.equal(h.events.pressure.length, 0, 'no price intent without your shipped loss');
  assert.equal(h.events.moves.length, 0, 'no price-move event');
  assert.equal(h.events.headlines.length, 0, 'no headline');
  assert.equal(h.marketNews.getLog().length, 0, 'the ticker stays silent');
  assert.equal(
    h.state.economy.markets[DEST_STATION][COMMODITY].lastMid,
    midBefore,
    'the destination price does not move',
  );
});
