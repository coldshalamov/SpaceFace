import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { createMarketNews, generateHeadline } from '../src/ui/marketNews.js';

function boot({ voiceAccepted = true } = {}) {
  const bus = createBus();
  const voices = [];
  const headlines = [];
  const toasts = [];
  const state = {
    meta: { seed: 47010 },
    simTime: 37.5,
    ui: {},
  };
  bus.on('news:headline', (payload) => headlines.push(payload));
  bus.on('toast', (payload) => toasts.push(payload));
  const news = createMarketNews({
    bus,
    state,
    helpers: {
      voice: {
        say(payload) {
          voices.push(payload);
          return voiceAccepted;
        },
      },
    },
  });
  return { bus, state, news, voices, headlines, toasts };
}

test('stable encounter freight loss resolves once with provenance and toast fallback', () => {
  const t = boot({ voiceAccepted: false });
  try {
    const payload = Object.freeze({
      kind: 'loss',
      cause: 'freight_loss',
      intentId: 'fl_market_news_047',
      encounterId: 'enc_convoy_047',
      stationId: 'st_tethys_hub',
      sectorId: 'sector_tethys_junction',
      manifestId: 'manifest_convoy_047',
      freighterKey: 'encounter:enc_convoy_047',
      primaryCommodityId: 'cmdty_fuel_cells',
      source: 'traffic_live',
      news: {
        kind: 'freight_loss',
        commodityId: 'cmdty_fuel_cells',
        source: 'freight_causality',
      },
    });

    t.bus.emit('freight:loss', payload);
    t.bus.emit('freight:loss', payload);

    assert.equal(t.news.getLog().length, 1, 'stable intent is committed once');
    assert.equal(t.voices.length, 1, 'voice arbiter is attempted once');
    assert.equal(t.toasts.length, 1, 'declined voice falls back once');
    assert.equal(t.headlines.length, 1, 'downstream headline relays once');
    for (const record of [t.news.getLog()[0], t.voices[0], t.headlines[0]]) {
      assert.equal(record.intentId, payload.intentId);
      assert.equal(record.encounterId, payload.encounterId);
      assert.equal(record.stationId, payload.stationId);
      assert.equal(record.commodityId, payload.primaryCommodityId);
      assert.equal(record.kind, 'freight_loss');
    }
    assert.equal(typeof t.headlines[0].headline, 'string');
    assert.ok(t.headlines[0].headline.length > 0);
    assert.equal(t.toasts[0].text, t.headlines[0].headline);
    assert.equal(t.toasts[0].intentId, payload.intentId);
    assert.equal(t.toasts[0].encounterId, payload.encounterId);
    assert.equal(t.toasts[0].stationId, payload.stationId);
    assert.equal(t.toasts[0].commodityId, payload.primaryCommodityId);
    assert.equal(t.toasts[0].newsKind, 'freight_loss');

    t.bus.emit('save:loaded', {});
    assert.equal(t.news.getLog().length, 0, 'rewind clears the transient visible log');
    t.bus.emit('freight:loss', payload);
    assert.equal(t.news.getLog().length, 1, 'a re-settled loss after rewind is visible again');
    assert.equal(t.voices.length, 2);
    assert.equal(t.toasts.length, 2);
    assert.equal(t.headlines.length, 2);
    t.bus.emit('freight:loss', payload);
    assert.equal(t.news.getLog().length, 1, 'the re-settled timeline still deduplicates live re-entry');
    assert.equal(t.voices.length, 2);
    assert.equal(t.toasts.length, 2);
    assert.equal(t.headlines.length, 2);
  } finally {
    t.news.destroy();
  }
});

test('news:publish surfaces authored text literally once and preserves its metadata', () => {
  const t = boot();
  try {
    const payload = Object.freeze({
      text: 'TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST',
      kind: 'wreck_rumor',
      sourceRef: 'news.tragedy_at_helios',
      wreckId: 'wreck_choir_tender',
      sectorId: 'sector_helios_prime',
      channelId: 'news',
      followup: false,
      receiptId: 'depth-r1:d10:first-read',
    });

    t.bus.emit('news:publish', payload);

    const [record] = t.news.getLog();
    assert.equal(t.news.getLog().length, 1, 'self-emitted news:headline must not log twice');
    assert.equal(record.text, payload.text, 'authored text must bypass generated templates');
    assert.equal(record.sourceRef, payload.sourceRef);
    assert.equal(record.wreckId, payload.wreckId);
    assert.equal(record.sectorId, payload.sectorId);
    assert.equal(record.channelId, payload.channelId);
    assert.equal(record.followup, false);
    assert.equal(record.receiptId, payload.receiptId, 'additional authored metadata survives');

    assert.equal(t.voices.length, 1);
    assert.equal(t.voices[0].channel, 'news', 'authored news still uses the one-voice news lane');
    assert.equal(t.voices[0].text, payload.text);
    assert.equal(t.voices[0].sourceRef, payload.sourceRef);
    assert.equal(t.voices[0].wreckId, payload.wreckId);
    assert.deepEqual(t.toasts, [], 'accepted voice does not duplicate as a toast');

    assert.equal(t.headlines.length, 1);
    assert.equal(t.headlines[0].headline, payload.text);
    for (const key of ['kind', 'sourceRef', 'wreckId', 'sectorId', 'channelId', 'followup', 'receiptId']) {
      assert.equal(t.headlines[0][key], payload[key], `news:headline preserves ${key}`);
    }
  } finally {
    t.news.destroy();
  }
});

test('economy event headlines retain the generated surface contract', () => {
  const t = boot();
  try {
    const event = {
      type: 'shortage',
      stationId: 'station_helios',
      commodityId: 'cmdty_medical',
      eventId: 'econ-shortage-1',
    };
    const expected = generateHeadline(event, { seed: hash32(t.state.meta.seed) >>> 0 });

    t.bus.emit('economy:eventStarted', event);

    assert.equal(t.news.getLog().length, 1);
    assert.equal(t.news.getLog()[0].text, expected);
    assert.deepEqual(t.voices, [{ channel: 'news', text: expected, kind: 'shortage' }]);
    assert.deepEqual(t.headlines, [{
      headline: expected,
      kind: 'shortage',
      stationId: 'station_helios',
    }]);
  } finally {
    t.news.destroy();
  }
});
