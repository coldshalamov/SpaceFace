// INFERENCE unit — five freight_arrival headlines, an ARRIVAL dock card and its ticker styling
// were authored for the freight-arrival moment, and the only listener was the visual fanfare:
// a station taking delivery never printed a word while its loss twin made the wire. The
// arrival now speaks in the same cited voice, keyed per intent (replay-safe) with a
// per-station cooldown so a busy lane's docking rhythm cannot wallpaper the wire.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { buildArrivalIntent } from '../src/economy/freightCausality.js';
import { createMarketNews } from '../src/ui/marketNews.js';

const STATION_ID = 'st_test_hub';
const SECTOR_ID = 'sector_tethys_junction';

function makeArrival({ intentId, commodityId = 'cmdty_ore_iron', qty = 20, stationId = STATION_ID } = {}) {
  return buildArrivalIntent({
    seed: 4242,
    freighterKey: `freighter_${intentId || 'a'}`,
    stationId,
    sectorId: SECTOR_ID,
    dockSeq: 3,
    liveScale: 1,
    manifest: {
      manifestId: `man_${intentId || 'a'}`,
      lines: [{ commodityId, qty }],
    },
    intentId: intentId || undefined,
  });
}

function boot({ simTime = 1000 } = {}) {
  const bus = createBus();
  const news = [];
  const voices = [];
  const state = {
    meta: { seed: 4242 },
    simTime,
    mode: 'flight',
    ui: {},
    world: {
      currentSectorId: SECTOR_ID,
      activeSector: { stations: [{ id: STATION_ID, name: 'Meridian Exchange' }] },
    },
  };
  bus.on('news:headline', (p) => news.push(p || {}));
  createMarketNews({ bus, state, helpers: { voice: { say: (p) => { voices.push(p); return true; } } } });
  return { bus, state, news, voices };
}

const arrivalHeadlines = (news) => news.filter((n) => n.kind === 'freight_arrival');

test('a station taking delivery prints a cited freight_arrival headline', () => {
  const { bus, news } = boot();
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_1' }));
  assert.equal(arrivalHeadlines(news).length, 1);
  const rec = arrivalHeadlines(news)[0];
  assert.ok(typeof rec.headline === 'string' && rec.headline.length > 0, 'a headline line is committed');
  assert.ok(!/\{(station|noun|name)\}/.test(rec.headline), 'template tokens are filled, not printed raw');
  assert.equal(rec.intentId, 'arr_1', 'the line traces back to its causal intent');
  assert.equal(rec.source, 'freight_causality', 'the line is cited, not anonymous');
});

test('the same intent never prints twice', () => {
  const { bus, news } = boot();
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_1' }));
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_1' }));
  assert.equal(arrivalHeadlines(news).length, 1);
});

test('a busy lane cannot wallpaper the wire: one per station per cooldown', () => {
  const { bus, state, news } = boot();
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_1' }));
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_2' }));
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_3' }));
  assert.equal(arrivalHeadlines(news).length, 1, 'back-to-back docks at one station stay quiet');
  state.simTime += 241;
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_4' }));
  assert.equal(arrivalHeadlines(news).length, 2, 'after the window the station speaks again');
});

test('the cooldown is per station, not global', () => {
  const { bus, news } = boot();
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_a', stationId: 'st_alpha' }));
  bus.emit('freight:arrival', makeArrival({ intentId: 'arr_b', stationId: 'st_beta' }));
  assert.equal(arrivalHeadlines(news).length, 2, 'two stations taking delivery both make the wire');
});

test('a loss-shaped or bare payload never rides the arrival seam', () => {
  const { bus, news } = boot();
  bus.emit('freight:arrival', { intentId: 'x1', kind: 'freight_loss', stationId: STATION_ID, trades: [{ commodityId: 'cmdty_ore_iron', qty: 5 }] });
  bus.emit('freight:arrival', null);
  bus.emit('freight:arrival', { intentId: 'x2', kind: 'freight_arrival' });
  bus.emit('freight:arrival', { intentId: 'x3', kind: 'freight_arrival', stationId: STATION_ID, trades: [] });
  assert.equal(arrivalHeadlines(news).length, 0);
});
