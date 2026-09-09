// PQ-177.00 — leftover ticker + dock card. Headless. Prints a blockade line
// and its card with event provenance. No soak. No headed capture.
//
// Honesty note (review 2026-09-09). This file deliberately proves three separate things, because
// the leaf's done-when ("every ticker line traces to a sim event; capture of a blockade line and
// its card") is only partly live:
//   1. The trace rule is real production behaviour — createMarketNews refuses an uncited line.
//   2. The blockade kind is NOT test-only. economy.rollSpontaneousEvent picks from
//      ['shortage','boom','blockade','piracy'] and calls the same injectEvent, so the injected
//      event in test 1 is production-shaped. Test 2 waits for the seeded roll and proves it.
//   3. The dock CARD (badge/title/body) reaches no renderer. `news:dockCards` has zero
//      subscribers and state.ui.marketNews.lastCard's only live reader is dockArrival.localNews,
//      which mines it for a plain headline string. Test 3 prints what the berth actually shows.
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { buildDockArrival } from '../src/ui/dockArrival.js';
import {
  buildEventCard,
  createMarketNews,
  tickerEventRef,
} from '../src/ui/marketNews.js';

const SEED = 17700;
const STATION = 'station_helios';
const STATION_NAME = 'Helios Station';
const CMDTY = 'cmdty_ore_iron';

function boot({ stepEconomy = false } = {}) {
  const sim = createSimulation({
    seed: SEED,
    systems: [economy],
    updateOrder: stepEconomy ? [economy] : [],
  });
  const news = createMarketNews({ bus: sim.bus, state: sim.state, helpers: {} });
  return { sim, state: sim.state, bus: sim.bus, econ: sim.registry.get('economy'), news };
}

function dispose(t) {
  t.news.destroy();
  t.sim.dispose();
  economy._instance = null;
}

/** The berth's live news line: stationApp.js renders exactly this string on arrival. */
function berthLine(state) {
  return buildDockArrival(state, { id: STATION, name: STATION_NAME, services: [] }).news;
}

test('every ticker line traces to a sim event; a blockade line and dock card exist', () => {
  const t = boot();
  try {
    t.econ.ensureMarket(STATION);
    const ev = t.econ.injectEvent({
      type: 'blockade',
      stationId: STATION,
      commodityId: CMDTY,
      duration: 120,
    });
    assert.ok(ev && ev.id, 'economy.injectEvent must write a live econ event');
    assert.equal(ev.type, 'blockade');

    // The berth line is asserted here, while the blockade is the only station event. localNews
    // returns the NEWEST station-matching log record, so a later station event supersedes it.
    const blockadeBerthLine = berthLine(t.state);
    assert.ok(blockadeBerthLine, 'the blockade reaches the live berth news line');

    t.bus.emit('news:publish', {
      text: 'TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST',
      kind: 'wreck_rumor',
      sourceRef: 'news.tragedy_at_helios',
      wreckId: 'wreck_choir_tender',
      sectorId: 'sector_helios_prime',
      channelId: 'news',
      receiptId: 'pq-177-00:authored',
    });
    t.bus.emit('freight:loss', {
      kind: 'loss',
      cause: 'freight_loss',
      intentId: 'fl_pq177_00',
      encounterId: 'enc_pq177_00',
      stationId: STATION,
      sectorId: 'sector_helios_prime',
      primaryCommodityId: CMDTY,
      news: { kind: 'freight_loss', commodityId: CMDTY, source: 'freight_causality' },
    });

    const log = t.news.getLog();
    assert.ok(log.length >= 3, 'blockade + authored + freight lines stay on the ticker');
    for (const rec of log) {
      const ref = tickerEventRef(rec);
      assert.ok(ref && ref.eventId, `ticker line must cite a sim event: ${rec && rec.text}`);
      assert.equal(rec.eventId, ref.eventId);
    }

    const blockade = log.find((rec) => rec.kind === 'blockade');
    assert.ok(blockade, 'blockade headline is on the ticker');
    const blockadeRef = tickerEventRef(blockade);
    assert.equal(blockadeRef.eventId, ev.id);
    assert.equal(blockadeRef.source, 'economy:eventStarted');
    assert.match(blockade.text, /blockade|sealed|locked|embargo|choke|customs/i);
    assert.equal(blockadeBerthLine, blockade.text);

    t.bus.emit('dock:docked', { stationId: STATION });
    const card = t.news.getLastCard();
    assert.ok(card, 'docking under the blockade builds a card');
    assert.equal(card.kind, 'blockade');
    assert.equal(card.badge, 'BLOCKADE');
    assert.equal(card.eventId, ev.id);
    assert.ok(card.title);
    assert.ok(card.body);
    assert.equal(card.headline, blockade.text);

    const seed = hash32(t.state.meta.seed) >>> 0;
    const pure = buildEventCard({
      type: 'blockade',
      stationId: STATION,
      commodityId: CMDTY,
      eventId: ev.id,
    }, { seed });
    assert.equal(pure.badge, 'BLOCKADE');
    assert.equal(pure.eventId, ev.id);
    assert.equal(pure.headline, blockade.text);

    assert.equal(
      t.news.surface({ type: 'shortage', stationId: STATION, commodityId: CMDTY }),
      null,
      'a headline with no sim event id must not stay on the ticker',
    );

    console.log(`PQ-177.00 blockade line: ${blockade.text}`);
    console.log(`PQ-177.00 event: ${blockadeRef.source} ${blockadeRef.eventId}`);
    console.log(`PQ-177.00 dock card: ${card.badge} ${card.title} — ${card.body}`);
  } finally {
    dispose(t);
  }
});

test('the blockade kind is not test-only: a spontaneous economy roll reaches the ticker', () => {
  // No injectEvent call in this test. economy.newGame() warms the home sector's markets exactly
  // as the live route does, then the production step is driven until the seeded scheduler
  // (EVENT_INTERVAL_S = 90 sim seconds inside econTick) rolls a blockade on its own.
  const t = boot({ stepEconomy: true });
  try {
    t.econ.newGame();
    assert.ok(
      Object.keys(t.state.economy.markets).length > 0,
      'newGame warms home-sector markets, so the spontaneous roll has targets from the first frame',
    );
    assert.equal(t.state.economy.econEvents.length, 0, 'no event exists before the sim runs');

    const DT = 1 / 60;
    const MAX_SIM_S = 3600;
    const maxSteps = Math.ceil(MAX_SIM_S / DT);
    let blockade = null;
    let steps = 0;
    while (steps < maxSteps && !blockade) {
      t.sim.step(DT);
      steps++;
      // Once per sim second: rolls are 90 s apart and MAX_LOG is 12, so this cannot miss one.
      if (steps % 60 === 0) blockade = t.news.getLog().find((rec) => rec.kind === 'blockade') || null;
    }
    const simSeconds = steps * DT;

    assert.ok(blockade, `a spontaneous blockade must reach the ticker within ${MAX_SIM_S} sim seconds`);
    const ref = tickerEventRef(blockade);
    assert.ok(ref && ref.eventId, 'the spontaneous blockade line cites its sim event');
    assert.equal(ref.source, 'economy:eventStarted');
    assert.match(blockade.text, /blockade|sealed|locked|embargo|choke|customs/i);

    // The cited id is a real live econ event, not just a headline field.
    const live = t.state.economy.econEvents.find((e) => e.id === ref.eventId);
    assert.ok(live, 'the cited event id is on state.economy.econEvents');
    assert.equal(live.type, 'blockade');
    assert.ok(live.stationId, 'the spontaneous blockade names a station');

    console.log(
      `PQ-177.00 spontaneous blockade after ${simSeconds.toFixed(0)} sim s `
      + `(no injectEvent): ${blockade.text}`,
    );
    console.log(`PQ-177.00 spontaneous event: ${ref.source} ${ref.eventId} @ ${live.stationId}`);
  } finally {
    dispose(t);
  }
});

test('the dock card is state-only: the live berth prints the headline, not the card copy', () => {
  // What the player actually sees at the berth is stationApp.js:1000 →
  // buildDockArrival(state, station).news, a single string. The card's badge/title/body are built
  // and stored on state.ui.marketNews.lastCard but no live surface renders them, and
  // `news:dockCards` has no subscribers. This test records that surface; it does not forbid a
  // future card renderer — when one lands, the leaf's card clause can move to DONE.
  const t = boot();
  try {
    t.econ.ensureMarket(STATION);
    const ev = t.econ.injectEvent({
      type: 'blockade', stationId: STATION, commodityId: CMDTY, duration: 120,
    });
    t.bus.emit('dock:docked', { stationId: STATION });

    const card = t.news.getLastCard();
    assert.ok(card && card.badge === 'BLOCKADE', 'the card object exists in state');
    assert.equal(card.eventId, ev.id);

    const view = buildDockArrival(t.state, { id: STATION, name: STATION_NAME, services: [] });
    assert.equal(typeof view.news, 'string', 'the live berth consumer yields one plain string');
    assert.equal(view.news, card.headline, 'the berth prints the headline, not the card copy');
    assert.ok(view.lines.includes(view.news), 'the headline is one of the berth arrival lines');

    console.log(`PQ-177.00 berth line (live, rendered): ${view.news}`);
    console.log(`PQ-177.00 card copy (state-only, no renderer): ${card.badge} | ${card.title} | ${card.body}`);
  } finally {
    dispose(t);
  }
});
