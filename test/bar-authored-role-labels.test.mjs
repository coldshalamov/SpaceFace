import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CANONICAL_CONTACTS, canonicalContactForStation, escapeHtml, endingCourier } from './fixtures/authored-contact-labels.mjs';

// Execute the real, complete renderRail/renderStage functions, not replicas of their templates.
// The DOM sinks capture innerHTML; unrelated chrome, animation and offer services are stubbed.
// This is a source-function integration check, not a browser/layout acceptance test.
const source = readFileSync(new URL('../src/ui/station/screens/bar.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'renderer boundaries must exist');
  return source.slice(first, last);
}
const helpers = section('const roleLabel =', 'const mid =');
const railFunction = section('  function renderRail(state)', '  // ---------- stage:');
const stageFunction = section('  function renderStage(state)', '  /** The waveform');
function render(initial) {
  let current = initial;
  const dispatch = [];
  const portraits = [];
  const railEl = { innerHTML: '' };
  const avatar = {};
  const stageEl = { innerHTML: '', querySelector: (s) => s === '[data-bigpic]' ? avatar : null };
  const noop = () => {};
  const context = {
    railEl, stageEl, escapeHtml, selectedId: null, saidText: null,
    contacts: () => current ? [current] : [], selected: () => current,
    stationControlAttrs: (kind) => 'data-control="' + kind + '"',
    stationRegularRecognition: () => ({ label: 'Known regular', reaction: 'Welcome back.' }),
    stationContactMemoryFor: () => ({ talkCount: 2 }),
    stationContactMemoryLine: (_, line) => line,
    getChoices: (role, contact) => { dispatch.push({role, contact}); return contact.choices || [{id:'ask',label:'Ask about work.'}]; },
    mountContactPortrait: (_, contact) => portraits.push(contact),
    dressRail: noop, railKeysHint: noop, dressStage: noop, composeStage: noop,
    appendVonnFreightLossMapOffer: noop, missionOfferHtml: () => '<section data-offer="preserved">42 cr</section>',
    frontierRumorOfferHtml: () => '', tethysRumorGuidanceHtml: () => '', dossArchiveMapOfferHtml: () => '',
    el: { isConnected: false }, deedSession: {}, sid: () => 'station_test', tellBarDeedOnce: noop,
  };
  const state = Object.freeze({ player: Object.freeze({ credits: 42 }) });
  const draw = runInNewContext(helpers + '\n' + railFunction + '\n' + stageFunction +
    '\n(state) => { renderRail(state); renderStage(state); }', context);
  return {
    railEl, stageEl, dispatch, portraits,
    draw(c = current) { current = c; draw(state); },
  };
}
function expectLabels(r, expected) {
  assert.ok(r.railEl.innerHTML.includes('sx-bar-row__role">' + escapeHtml(expected) + ' · Known regular</span>'),
    'rail should show "' + expected + '" and retain recognition suffix');
  assert.ok(r.stageEl.innerHTML.includes('sx-talk__role">' + escapeHtml(expected) + '</p>'),
    'conversation heading should show "' + expected + '"');
}
const expected = {
  kessler: 'Cargo Registrar', rook: 'Bounty Broker', voss: 'Claim Recorder',
  hale: 'Customs Officer', mira: 'Freight Seal Clerk', slate: 'Shipyard Welder',
  drift: 'Ore Ledger', quinn: 'Proprietor', sallow: 'Contract Broker',
  ferrow: 'Writ Clerk', kurtz: 'Ashfall Witness',
};
for (const card of CANONICAL_CONTACTS) {
  test(card.name + ': actual canonical producer reaches both renderer surfaces without changing dispatch', () => {
    assert.equal(card.roleLabel, expected[card.key]);
    for (const stationId of card.stationIds) {
      const c = Object.freeze(canonicalContactForStation(stationId));
      const before = JSON.stringify(c);
      const r = render(c);
      r.draw();
      expectLabels(r, expected[card.key]);
      assert.equal(r.dispatch[0].role, c.role);
      assert.equal(r.dispatch[0].contact, c);
      assert.equal(r.portraits[0], c);
      assert.equal(JSON.stringify(c), before);
      assert.ok(r.stageEl.innerHTML.includes(escapeHtml(c.line)));
      assert.ok(r.stageEl.innerHTML.includes('42 cr'));
      for (const choice of c.choices || []) assert.ok(r.stageEl.innerHTML.includes(escapeHtml(choice.label)));
    }
  });
}
test('actual settlement courier keeps authored profession and choices', () => {
  const c = Object.freeze(endingCourier[0]);
  const r = render(c); r.draw(); expectLabels(r, 'Contract Courier');
  assert.equal(r.dispatch[0].role, 'courier');
  for (const choice of c.choices) assert.ok(r.stageEl.innerHTML.includes(escapeHtml(choice.label)));
});
test('trim authored string only; harmless markup characters remain literal text in both surfaces', () => {
  const c = Object.freeze({ id: 'label', name: 'Label', role: 'bounty_hunter', roleLabel: '  Ledger <clerk> & "Registrar"  ' });
  const r = render(c); r.draw();
  expectLabels(r, 'Ledger <clerk> & "Registrar"');
  assert.ok(!r.railEl.innerHTML.includes('<clerk>'));
  assert.ok(!r.stageEl.innerHTML.includes('<clerk>'));
  assert.equal(c.role, 'bounty_hunter');
  assert.equal(c.roleLabel, '  Ledger <clerk> & "Registrar"  ');
});
test('missing, blank and nonstring authored labels preserve enum formatting', () => {
  for (const label of [undefined, null, '', ' \n\t ', 0, 42, false, true, [], {}, new String('boxed')]) {
    for (const [role, expectedLabel] of [['bounty_hunter', 'bounty hunter'], ['custom_role', 'custom role'], [undefined, 'contact'], ['', 'contact']]) {
      const c = Object.freeze({ id: 'fallback', name: 'Fallback', role, roleLabel: label });
      const r = render(c); r.draw(); expectLabels(r, expectedLabel);
      assert.equal(r.dispatch[0].role, role);
    }
  }
});
test('repeat render, contact switch, and empty rail/stage do not leave a stale profession', () => {
  const a = Object.freeze(canonicalContactForStation('station_helios'));
  const b = Object.freeze(canonicalContactForStation('station_coalition'));
  const r = render(a); r.draw(); r.draw(); expectLabels(r, 'Cargo Registrar');
  r.draw(b); expectLabels(r, 'Bounty Broker');
  assert.ok(!r.stageEl.innerHTML.includes('Cargo Registrar'));
  r.draw(null);
  assert.ok(r.railEl.innerHTML.includes('Nobody here.'));
  assert.ok(r.stageEl.innerHTML.includes('The bar is empty.'));
});
