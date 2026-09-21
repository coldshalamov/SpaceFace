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

test('INF-089 broke refuel names the price block and the Market remedy when carrying cargo', () => {
  const state = { player: { credits: 0, cargo: { usedVolume: 5, capVolume: 40 } }, fuel: { ...TANK } };
  const q = serviceQuote('refuel', state, null);
  assert.equal(q.disabled, true);
  assert.ok(q.disabledReason.includes('cr/u'));
  assert.equal(q.remedy, 'Sell cargo at the Market to raise fuel money');
  assert.equal(disabledServiceWhy(q), `${q.disabledReason} — ${q.remedy}`);
});

test('INF-089 broke refuel with an empty hold points at contracts/salvage instead', () => {
  const state = { player: { credits: 0, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  const q = serviceQuote('refuel', state, null);
  assert.equal(q.disabled, true);
  assert.equal(q.remedy, 'Take a station contract or sell salvage, then refuel');
});

test('INF-089 the reason updates after earning: full quote when covered, advisory partial when short', () => {
  const broke = { player: { credits: 0, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  assert.equal(serviceQuote('refuel', broke, null).disabled, true);
  const rich = { player: { credits: 100000, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  const full = serviceQuote('refuel', rich, null);
  assert.equal(full.disabled, false);
  assert.equal(full.buttonLabel, 'Refuel');
  assert.equal(disabledServiceWhy(full), '');
  // advisory warning, NOT a hard blocker: a short wallet still buys a partial fill.
  // (fuel runs 6 cr/u here, so 10 cr covers one of the 18 missing units.)
  const short = { player: { credits: 10, cargo: { usedVolume: 0, capVolume: 40 } }, fuel: { ...TANK } };
  const partial = serviceQuote('refuel', short, null);
  assert.equal(partial.disabled, false);
  assert.equal(partial.buttonLabel, 'Partial Refuel');
});

test('INF-089 reason-only dead ends still speak (repair while broke)', () => {
  const state = {
    player: { credits: 0, cargo: { usedVolume: 0, capVolume: 40 } },
    fuel: { current: 20, max: 20 },
  };
  const entity = { hull: 50, hullMax: 100, armorHp: 0, armorMax: 0 };
  const q = serviceQuote('repair', state, entity);
  assert.equal(q.disabled, true);
  assert.equal(disabledServiceWhy(q), q.disabledReason);
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
