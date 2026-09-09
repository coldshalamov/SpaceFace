// PQ-177.00 — leftover ticker + dock card. Headless. Prints a blockade line
// and its card with event provenance. No soak. No headed capture.
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import {
  buildEventCard,
  createMarketNews,
  tickerEventRef,
} from '../src/ui/marketNews.js';

const SEED = 17700;
const STATION = 'station_helios';
const CMDTY = 'cmdty_ore_iron';

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [economy], updateOrder: [] });
  const news = createMarketNews({ bus: sim.bus, state: sim.state, helpers: {} });
  return { sim, state: sim.state, bus: sim.bus, econ: sim.registry.get('economy'), news };
}

function dispose(t) {
  t.news.destroy();
  t.sim.dispose();
  economy._instance = null;
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
