import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createMarketNews, cardsForStation } from '../src/ui/marketNews.js';
import { leftoverEventCard } from '../src/ui/dockArrival.js';

const STATION = 'station_helios';

function dockNews(events) {
  const state = createGameState(4242);
  state.economy = { econEvents: events };
  const bus = createBus();
  const heard = [];
  bus.on('news:dockCards', (payload) => heard.push(payload));
  const news = createMarketNews({ bus, state, helpers: {} });
  bus.emit('dock:docked', { stationId: STATION });
  return { state, heard, news };
}

test('docking stores the station card without a second card event', () => {
  const eventId = 'ev-helios-blockade';
  const { state, heard, news } = dockNews([{
    id: eventId,
    type: 'blockade',
    stationId: STATION,
    commodityId: 'cmdty_ore_iron',
  }]);
  try {
    assert.equal(heard.length, 0);
    const [card] = cardsForStation(state, STATION);
    assert.ok(card && card.eventId === eventId);
    const stored = state.ui.marketNews.lastCard;
    assert.equal(stored.eventId, card.eventId);
    assert.equal(stored.badge, card.badge);
    assert.equal(stored.title, card.title);
    assert.equal(stored.body, card.body);
    const painted = leftoverEventCard(state, STATION);
    assert.equal(painted.eventId, card.eventId);
    assert.equal(painted.badge, card.badge);
    assert.equal(painted.title, card.title);
    assert.equal(painted.body, card.body);
  } finally {
    news.destroy();
  }
});

test('a quiet station still docks with no card and no card event', () => {
  const { state, heard, news } = dockNews([]);
  try {
    assert.equal(heard.length, 0);
    assert.equal(cardsForStation(state, STATION).length, 0);
    assert.equal(state.ui.marketNews.lastCard, null);
    assert.equal(leftoverEventCard(state, STATION), null);
  } finally {
    news.destroy();
  }
});
