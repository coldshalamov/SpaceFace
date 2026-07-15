import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { createMarketNews, generateHeadline } from '../src/ui/marketNews.js';

function boot() {
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
          return true;
        },
      },
    },
  });
  return { bus, state, news, voices, headlines, toasts };
}

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
