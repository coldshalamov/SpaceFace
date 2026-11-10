import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crucibleDraftScreen } from '../src/ui/screens/crucibleDraft.js';
import { fakeDom } from './helpers/fake-dom.mjs';

const offer = (id, extra = {}) => ({
  id, name: `Card ${id}`, price: 50, available: true, purchased: false,
  defId: 'wpn_autocannon_s', kind: 'weapon', category: 'Weapons',
  verb: 'Ram', blurb: 'A blunt idea.', ...extra,
});

function mountShop({ wave = 0, category = 'All', query = '', offers = [offer('gun')], recommendations = [] } = {}) {
  const previousDocument = globalThis.document;
  const doc = fakeDom();
  doc.createElementNS = (_namespace, tagName) => doc.createElement(tagName);
  globalThis.document = doc;
  const root = doc._make('div');
  const listeners = new Map();
  const owner = {
    currentOffers: () => offers,
    currentWave: () => wave,
    lastNotice: () => null,
    rerollState: () => null,
    recommendedOffers: () => recommendations,
  };
  const ctx = {
    state: { run: { phase: 'draft', ruleset: 'swarm', wave, credits: 80 }, player: { ownedShips: [] } },
    registry: { get: name => name === 'survivalDraft' ? owner : null },
    screenManager: { top: () => 'crucibleDraft' },
    bus: {
      emit(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => listeners.get(name).delete(fn);
      },
      off() {},
    },
  };
  const screen = Object.create(crucibleDraftScreen);
  screen.mount(root, ctx);
  const cards = screen._cards;
  let html = '';
  Object.defineProperty(cards, 'innerHTML', {
    configurable: true,
    get() { return html; },
    set(value) { html = String(value); if (!html) cards.children = []; },
  });
  screen._category = category;
  screen._query = query;
  screen._search.value = query;
  let searchFocuses = 0;
  screen._search.focus = () => { searchFocuses += 1; };
  screen.refresh(ctx);
  const restore = () => {
    screen.dispose();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
  return { screen, ctx, restore, searchFocuses: () => searchFocuses };
}

function emptyStates(screen) {
  return screen._cards.children.filter(node => String(node.className).split(/\s+/).includes('orr-armory-empty'));
}

test('opening Ships shelf explains the chosen hull and its real reset path', () => {
  const fitting = offer('gun');
  const flyingHull = offer('hull', {
    name: 'Kestrel', defId: 'ship_kestrel', kind: 'hull', category: 'Ships', _flying: true, price: 0,
  });
  const m = mountShop({ category: 'Ships', offers: [flyingHull, fitting] });
  try {
    const [empty] = emptyStates(m.screen);
    assert.ok(empty, 'opening Ships has no resale card, so it needs an explanation');
    assert.equal(empty.textContent,
      'Your launch hull is already selected. Fit it from the other shelves.');
    assert.doesNotMatch(empty.textContent, /go on sale|after round 1/,
      'One Hull contracts do not promise a later ship purchase');
    const reset = empty.children.find(node => node.tagName === 'button');
    assert.ok(reset);
    assert.equal(reset.textContent, 'Back to all fittings');
    reset.click();
    assert.equal(m.screen._category, 'All');
    assert.equal(m.screen._query, '');
    assert.equal(m.screen._search.value, '');
    assert.equal(m.searchFocuses(), 1, 'the reset returns keyboard focus to search');
    assert.equal(emptyStates(m.screen).length, 0, 'the refreshed all-stock shelf shows its fitting');
    assert.ok(m.screen._cards.children.some(node => String(node.className).includes('sf-cru-card')));
  } finally { m.restore(); }
});

test('a genuine no-match search keeps its clear action and returns to stock', () => {
  const m = mountShop({ query: 'no-such-part', offers: [offer('gun')] });
  try {
    const [empty] = emptyStates(m.screen);
    assert.ok(empty);
    assert.equal(empty.textContent, 'No equipment matches this search.');
    const reset = empty.children.find(node => node.tagName === 'button');
    assert.equal(reset.textContent, 'Clear filters');
    reset.click();
    assert.equal(m.screen._query, '');
    assert.equal(m.screen._search.value, '');
    assert.equal(m.searchFocuses(), 1);
    assert.equal(emptyStates(m.screen).length, 0);
    assert.ok(m.screen._cards.children.some(node => String(node.className).includes('sf-cru-card')));
  } finally { m.restore(); }
});

test('a Recommended-only shelf does not also claim that nothing is available', () => {
  const recommended = offer('recommended');
  const m = mountShop({ offers: [recommended], recommendations: [recommended] });
  try {
    assert.equal(emptyStates(m.screen).length, 0,
      'the visible Recommended card means the shelf is not empty');
    assert.ok(m.screen._cards.children.some(node => node.textContent === 'Recommended for your build'));
    assert.ok(m.screen._cards.children.some(node => String(node.className).includes('sf-cru-card')));
  } finally { m.restore(); }
});

