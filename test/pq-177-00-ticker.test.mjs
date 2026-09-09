// PQ-177.00 — leftover ticker + dock card. Headless. Prints a blockade line
// and its card with event provenance. No soak. No headed capture.
//
// Honesty note (review 2026-09-09). This file deliberately proves three separate things, because
// the leaf's done-when ("every ticker line traces to a sim event; capture of a blockade line and
// its card") was only partly live:
//   1. The trace rule is real production behaviour — createMarketNews refuses an uncited line.
//   2. The blockade kind is NOT test-only. economy.rollSpontaneousEvent picks from
//      ['shortage','boom','blockade','piracy'] and calls the same injectEvent, so the injected
//      event in test 1 is production-shaped. Test 2 waits for the seeded roll and proves it.
//   3. The dock CARD used to be state-only: `news:dockCards` had zero subscribers and
//      dockArrival.localNews mined lastCard for a headline string. The berth now paints leftover
//      badge/title/body/eventId through writeBerthArrival — the same writer stationApp.renderStatus
//      uses. Test 3 pins that painted surface, not only lastCard in state.
import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hash32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { buildDockArrival, writeBerthArrival } from '../src/ui/dockArrival.js';
import { stationFrameHtml } from '../src/ui/views/stationFrames.js';
import {
  buildEventCard,
  createMarketNews,
  tickerEventRef,
} from '../src/ui/marketNews.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

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

/** The berth's live news line: stationApp.js still writes this string on arrival. */
function berthLine(state) {
  return buildDockArrival(state, { id: STATION, name: STATION_NAME, services: [] }).news;
}

function berthCardHost() {
  const texts = {
    '.sxb-event__badge': '',
    '.sxb-event__title': '',
    '.sxb-event__body': '',
  };
  const attrs = {};
  return {
    hidden: true,
    querySelector(sel) {
      if (!(sel in texts)) return null;
      return {
        get textContent() { return texts[sel]; },
        set textContent(value) { texts[sel] = String(value == null ? '' : value); },
      };
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
  };
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

test('a leftover dock paints leftover card fields the berth actually writes', () => {
  // Honesty (review 2026-09-09): lastCard used to be state-only. The live berth now writes
  // leftover badge/title/body/eventId through writeBerthArrival — the same call stationApp
  // renderStatus makes. The ticker line stays. This does not invent war-tension or hunter cards.
  const t = boot();
  try {
    t.econ.ensureMarket(STATION);
    const ev = t.econ.injectEvent({
      type: 'blockade', stationId: STATION, commodityId: CMDTY, duration: 120,
    });
    t.bus.emit('dock:docked', { stationId: STATION });

    const card = t.news.getLastCard();
    assert.ok(card && card.badge === 'BLOCKADE', 'the leftover card object exists in state');
    assert.equal(card.eventId, ev.id);

    const view = buildDockArrival(t.state, { id: STATION, name: STATION_NAME, services: [] });
    assert.equal(view.news, card.headline, 'the leftover ticker line still reaches the berth');
    assert.ok(view.lines.includes(view.news), 'the headline is one of the berth arrival lines');
    assert.ok(view.eventCard, 'the leftover view model carries the card, not only lastCard');
    assert.equal(view.eventCard.badge, 'BLOCKADE');
    assert.equal(view.eventCard.title, card.title);
    assert.equal(view.eventCard.body, card.body);
    assert.equal(view.eventCard.eventId, ev.id);
    assert.match(view.eventCard.body, /iron ore is frozen/i);

    const frame = stationFrameHtml();
    assert.match(frame, /sxb-event__badge/);
    assert.match(frame, /sxb-event__title/);
    assert.match(frame, /sxb-event__body/);
    const appSrc = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');
    assert.match(appSrc, /writeBerthArrival/);
    assert.match(appSrc, /eventCard/);

    const cardEl = berthCardHost();
    const newsEl = { textContent: '' };
    const painted = writeBerthArrival({ newsEl, cardEl }, view);
    assert.equal(painted.news, card.headline);
    assert.equal(newsEl.textContent, card.headline, 'ticker line is still written');
    assert.equal(cardEl.hidden, false, 'the berth article is shown');
    assert.equal(cardEl.querySelector('.sxb-event__badge').textContent, 'BLOCKADE');
    assert.equal(cardEl.querySelector('.sxb-event__title').textContent, card.title);
    assert.equal(cardEl.querySelector('.sxb-event__body').textContent, card.body);
    assert.equal(cardEl.getAttribute('data-event-id'), ev.id);
    assert.match(cardEl.querySelector('.sxb-event__body').textContent, /iron ore is frozen/i);

    const quiet = writeBerthArrival(
      { newsEl: { textContent: '' }, cardEl: berthCardHost() },
      buildDockArrival({ ui: { marketNews: { log: [], lastCard: null } } }, {
        id: STATION, name: STATION_NAME, services: [],
      }),
    );
    assert.equal(quiet.eventCard, null, 'a quiet berth invents no card');

    console.log(`PQ-177.00 berth line (live, rendered): ${painted.news}`);
    console.log(`PQ-177.00 berth card (live, rendered): ${painted.eventCard.badge} | ${painted.eventCard.title} | ${painted.eventCard.body}`);
    console.log(`PQ-177.00 berth card event: ${painted.eventCard.eventId}`);
  } finally {
    dispose(t);
  }
});
