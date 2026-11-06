import test from 'node:test';
import assert from 'node:assert/strict';

import {
  serviceQuote,
  disabledServiceWhy,
  disabledVitalActHtml,
} from '../src/ui/station/serviceQuotes.js';

// INF-089: one disabled station action — Refuel while broke — must explain its exact blocking
// condition plus the nearest valid action, stay reachable by keyboard focus, refresh after the
// player earns, and never turn the advisory partial-fill into a hard blocker.
const TANK = { current: 2, max: 20 };
// Docked at a berth whose services list names both the pump and the yard — a quote with no
// berth answers "not offered" (stationOffersService), which is a different contract.
const BERTH = { docked: true, dockedStationId: 'station_tethys' };

// Economy honesty item 10: broke at a pump is NOT a dead end — economy's refuel handler files
// the FB-101 hardship fill on the note, so the quote offers that verb. The real zero-credit
// dead end is the weld past the emergency floor; that one carries the reason + remedy.
const ABOVE_FLOOR = { hull: 50, hullMax: 100, armorHp: 0, armorMax: 0 };

test('INF-089 broke weld above the floor names the block and the Market remedy when carrying cargo', () => {
  const state = { ui: BERTH, player: { credits: 0, cargo: { usedVolume: 5, capVolume: 40 } }, fuel: { ...TANK } };
  const q = serviceQuote('repair', state, { ...ABOVE_FLOOR });
  assert.equal(q.disabled, true);
  assert.equal(q.disabledReason, 'need credits');
  assert.ok(q.remedy.includes('above the emergency weld floor'), q.remedy);
  assert.ok(q.remedy.endsWith('Sell cargo at the Market to raise repair money'), q.remedy);
  assert.equal(disabledServiceWhy(q), `${q.disabledReason} — ${q.remedy}`);
});

test('INF-089 broke weld with an empty hold points at contracts/salvage instead', () => {
  const state = { ui: BERTH, player: { credits: 0, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  const q = serviceQuote('repair', state, { ...ABOVE_FLOOR });
  assert.equal(q.disabled, true);
  assert.ok(q.remedy.endsWith('Take a station contract or sell salvage, then repair'), q.remedy);
});

test('INF-089 the refuel quote tracks the wallet: note fill when broke, full when covered, advisory partial when short', () => {
  const broke = { ui: BERTH, player: { credits: 0, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  const note = serviceQuote('refuel', broke, null);
  assert.equal(note.disabled, false, 'broke at a pump offers the hardship fill, not a dead end');
  assert.equal(note.buttonLabel, 'Refuel on the Note');
  assert.equal(note.cost, 0, 'nothing is charged from the wallet');
  assert.equal(note.amount, 8, 'the FB-101 reserve (8u of the 18 missing)');
  assert.ok(note.debtCr > 0, 'the quote names the debt it files');
  const rich = { ui: BERTH, player: { credits: 100000, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  const full = serviceQuote('refuel', rich, null);
  assert.equal(full.disabled, false);
  assert.equal(full.buttonLabel, 'Refuel');
  assert.equal(disabledServiceWhy(full), '');
  // advisory warning, NOT a hard blocker: a short wallet still buys a partial fill.
  // (fuel runs 6 cr/u here, so 10 cr covers one of the 18 missing units.)
  const short = { ui: BERTH, player: { credits: 10, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  const partial = serviceQuote('refuel', short, null);
  assert.equal(partial.disabled, false);
  assert.equal(partial.buttonLabel, 'Partial Refuel');
});

test('INF-089 reason-only dead ends still speak (repair while broke)', () => {
  const state = {
    ui: BERTH,
    player: { credits: 0, cargo: { usedVolume: 0, capVolume: 40 } },
    fuel: { current: 20, max: 20 },
  };
  const entity = { hull: 50, hullMax: 100, armorHp: 0, armorMax: 0 };
  const q = serviceQuote('repair', state, entity);
  assert.equal(q.disabled, true);
  assert.equal(disabledServiceWhy(q), `${q.disabledReason} — ${q.remedy}`);
  // Below the floor the same broke pilot is offered the emergency weld on the note.
  const weld = serviceQuote('repair', state, { ...entity, hull: 10 });
  assert.equal(weld.disabled, false);
  assert.equal(weld.buttonLabel, 'Weld on the Note');
  assert.equal(weld.amount, 15, 'welds up to the 25% hull floor');
  assert.equal(weld.cost, 0);
});

test('INF-089 dead-end verb stays focusable with its reason on hover/focus', () => {
  const why = 'need 3 cr/u — Sell cargo at the Market to raise fuel money';
  const html = disabledVitalActHtml('refuel', 'Refuel', 'Refuel', why);
  assert.ok(html.startsWith('<button'), 'a button, not a span');
  assert.ok(!/ disabled[= >]/.test(html), 'no disabled attribute — keeps its tab stop');
  assert.ok(html.includes('aria-disabled="true"'));
  assert.ok(html.includes(`data-why="${why}"`), 'whyReveal reads the same phrase on hover and focus');
  assert.ok(html.includes('aria-label="Refuel. '), 'screen readers hear the reason');
  const nasty = disabledVitalActHtml('refuel', 'Refuel', 'Refuel', 'a"b<c>d&e');
  assert.ok(nasty.includes('a&quot;b&lt;c&gt;d&amp;e'), 'reason is attribute-escaped');
});
