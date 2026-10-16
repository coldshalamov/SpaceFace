// The armory's Escape guard. Esc used to launch the next round on the spot, with the credits the
// player never spent; in the swarm shop, while the wallet still buys something on the shelf, the
// first Esc now only moves focus to Launch and says what is left, and the second one goes.
// Mounted over the stub DOM so the real keydown handler is what these tests press.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  affordableOfferCount,
  crucibleDraftScreen,
  launchGuardLine,
} from '../src/ui/screens/crucibleDraft.js';
import { fakeDom } from './helpers/fake-dom.mjs';

const offer = (id, extra = {}) => ({
  id, name: `Card ${id}`, price: 50, available: true, purchased: false,
  defId: 'wpn_autocannon_s', kind: 'weapon', verb: 'Ram', blurb: 'A blunt idea.', ...extra,
});

/** Mount the real draft screen over the stub DOM; `restore()` puts the global document back. */
function mountShop({ ruleset = 'swarm', credits = 80, offers = [offer('a')] } = {}) {
  const savedDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const root = doc._make('div');
  const emitted = [];
  const owner = {
    currentOffers: () => offers,
    currentWave: () => 3,
    lastNotice: () => null,
    rerollState: () => null,
    recommendedOffers: () => [],
  };
  const ctx = {
    state: { run: { phase: 'draft', ruleset, credits }, player: { ownedShips: [] } },
    registry: { get: (name) => (name === 'survivalDraft' ? owner : null) },
    bus: { emit: (name, payload) => emitted.push([name, payload]), on() { return () => {}; }, off() {} },
  };
  const screen = Object.create(crucibleDraftScreen);
  screen.mount(root, ctx);
  screen.refresh(ctx);
  let focused = 0;
  screen._skip.focus = () => { focused += 1; };
  const press = (key) => {
    let stopped = 0;
    const event = {
      key, target: root, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { stopped += 1; },
    };
    for (const fn of root.listeners.keydown || []) fn(event);
    return { event, stopped };
  };
  const picks = () => emitted.filter(([name]) => name === 'run:draftPickRequested');
  const restore = () => {
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
  };
  return { screen, ctx, press, picks, focused: () => focused, restore, offers };
}

test('affordableOfferCount counts only what the wallet can buy now', () => {
  assert.equal(affordableOfferCount([]), 0);
  assert.equal(affordableOfferCount(null), 0);
  assert.equal(affordableOfferCount([offer('a'), offer('b')]), 2);
  assert.equal(affordableOfferCount([
    offer('poor', { available: false }),
    offer('fitted', { purchased: true }),
    offer('cradle', { kind: 'hull', _flying: true }),
    offer('switch', { kind: 'hull', _ownedIndex: 1, price: 0 }),
    offer('weld', { kind: 'service', defId: 'svc_weld' }),
  ]), 1, 'unaffordable, fitted, the flown hull and a free hull switch are not cards to buy');
});

test('launchGuardLine reads in plain words and agrees with the count', () => {
  assert.equal(launchGuardLine(2), 'You can still afford 2 cards — Esc again or Launch to go');
  assert.equal(launchGuardLine(1), 'You can still afford 1 card — Esc again or Launch to go');
});

test('wallet that affords a card: first Escape spares the credits, second Escape launches once', () => {
  const m = mountShop({ credits: 80, offers: [offer('a'), offer('b', { available: false, price: 500 })] });
  try {
    assert.equal(m.screen._skip.dataset.label, 'Launch round 4', 'the shop button is the launch');
    const first = m.press('Escape');
    assert.equal(first.event.defaultPrevented, true, 'the key is still owned end to end');
    assert.equal(first.stopped, 1, 'and still never reaches the flight handler');
    assert.equal(m.picks().length, 0, 'the first Escape launches nothing');
    assert.equal(m.focused(), 1, 'it moves focus to Launch');
    assert.equal(m.screen._note.textContent, 'You can still afford 1 card — Esc again or Launch to go');
    assert.equal(m.screen._note.attributes.role, 'status', 'announced politely to a screen reader');

    m.press('Escape');
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]], 'the second Escape resolves as ever');
  } finally { m.restore(); }
});

test('nothing affordable: the first Escape launches at once, exactly as before', () => {
  const m = mountShop({ credits: 0, offers: [offer('a', { available: false }), offer('b', { available: false })] });
  try {
    m.press('Escape');
    assert.equal(m.picks().length, 1);
    assert.equal(m.focused(), 0, 'no detour through the warning');
    assert.doesNotMatch(m.screen._note.textContent, /afford/);
  } finally { m.restore(); }
});

test('an empty shelf launches at once too', () => {
  const m = mountShop({ credits: 900, offers: [] });
  try {
    m.press('Escape');
    assert.equal(m.picks().length, 1);
  } finally { m.restore(); }
});

test('the Gauntlet keeps its loadout on the first Escape, whatever the wallet', () => {
  const m = mountShop({ ruleset: 'scored', credits: 900, offers: [offer('a'), offer('b'), offer('c')] });
  try {
    assert.equal(m.screen._skip.dataset.label, 'Keep current loadout');
    m.press('Escape');
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]]);
    assert.equal(m.focused(), 0);
  } finally { m.restore(); }
});

test('clicking Launch after the warning resolves, and a click alone never needs the warning', () => {
  const warned = mountShop({ offers: [offer('a'), offer('b')] });
  try {
    warned.press('Escape');
    assert.equal(warned.picks().length, 0);
    warned.screen._skip.click();
    assert.equal(warned.picks().length, 1, 'explicit Launch resolves as today');
  } finally { warned.restore(); }

  const direct = mountShop({ offers: [offer('a'), offer('b')] });
  try {
    direct.screen._skip.click();
    assert.equal(direct.picks().length, 1, 'a click is not guarded');
  } finally { direct.restore(); }
});

test('a rebuilt shelf re-reads: spending the last credits turns the next Escape into a launch', () => {
  const m = mountShop({ credits: 80, offers: [offer('a')] });
  try {
    m.press('Escape');
    assert.equal(m.picks().length, 0);
    // The player buys the card: the owner's shelf now has nothing buyable, and the screen repaints.
    m.offers[0].purchased = true;
    m.offers[0].available = false;
    m.ctx.state.run.credits = 30;
    m.screen.refresh(m.ctx);
    assert.doesNotMatch(m.screen._note.textContent, /afford/, 'the old count is not left on the line');
    m.press('Escape');
    assert.equal(m.picks().length, 1, 'nothing left to spend: one Escape goes');
  } finally { m.restore(); }
});

test('a repaint with cards still affordable warns again instead of launching on a stale second press', () => {
  const m = mountShop({ credits: 200, offers: [offer('a'), offer('b')] });
  try {
    m.press('Escape');
    m.offers[0].purchased = true;
    m.offers[0].available = false;
    m.ctx.state.run.credits = 150;
    m.screen.refresh(m.ctx);
    m.press('Escape');
    assert.equal(m.picks().length, 0, 'the shelf changed since the warning, so it is read fresh');
    assert.equal(m.screen._note.textContent, 'You can still afford 1 card — Esc again or Launch to go');
    m.press('Escape');
    assert.equal(m.picks().length, 1);
  } finally { m.restore(); }
});

test('Escape inside the search field still backs out of the field first, launching nothing', () => {
  const m = mountShop({ offers: [offer('a')] });
  try {
    m.screen._search.value = 'cannon';
    m.screen._search.blur = () => {};
    const event = {
      key: 'Escape', target: m.screen._search, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
    };
    for (const fn of m.screen._root.listeners.keydown || []) fn(event);
    assert.equal(m.screen._search.value, '');
    assert.equal(m.picks().length, 0);
    assert.doesNotMatch(m.screen._note.textContent, /afford/, 'the guard is the shop key, not the field key');
    assert.equal(m.screen._launchWarned, false);
  } finally { m.restore(); }
});
