// INF-9 (WF-14): the dock prompt names the station in range. dock:range carries stationId; the
// prompt used to print "DOCK AT STATION" for every berth.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAlerts, dockPromptText } from '../src/ui/alerts.js';
import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';

function makeEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(), children: [], parentNode: null, style: {}, dataset: {},
    hidden: false, _text: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    append(...ns) { ns.forEach((n) => el.appendChild(n)); },
    prepend(c) { c.parentNode = el; el.children.unshift(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    remove() { if (el.parentNode) el.parentNode.removeChild(el); },
    addEventListener() {}, querySelector() { return null; },
    get textContent() { return el._text; },
    set textContent(v) { el._text = String(v == null ? '' : v); },
  };
  return el;
}

function harness() {
  const alertsEl = makeEl('div');
  globalThis.document = {
    getElementById(id) { return id === 'alerts' ? alertsEl : null; },
    createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t),
    body: makeEl('body'), addEventListener() {}, hidden: false,
  };
  const bus = createBus();
  const state = createGameState(4242);
  createAlerts({ bus, state });
  const texts = () => {
    const out = [];
    const walk = (node) => { if (node._text) out.push(node._text); node.children.forEach(walk); };
    walk(alertsEl);
    return out;
  };
  return { bus, state, texts };
}

const longest = SECTORS.flatMap((sector) => sector.stations || []).reduce((a, b) => (b.name.length > a.name.length ? b : a));

test('a known station id names the station in the prompt', () => {
  assert.equal(dockPromptText(null, 'station_helios', '[ E ]'), '[ E ] DOCK AT HELIOS STATION');
  assert.equal(dockPromptText({}, 'station_ceres', 'E'), 'E DOCK AT CERES REFINERY');
});

test('an unknown or missing station id keeps the old text', () => {
  assert.equal(dockPromptText({}, 'station_does_not_exist', '[ E ]'), '[ E ] DOCK AT STATION');
  assert.equal(dockPromptText({}, undefined, '[ E ]'), '[ E ] DOCK AT STATION');
  assert.equal(dockPromptText({}, null, '[ E ]'), '[ E ] DOCK AT STATION');
});

test('a long station name stays a sane length', () => {
  const text = dockPromptText({}, longest.id, '[ E ]');
  assert.ok(text.length <= '[ E ] DOCK AT '.length + 28, `${text.length} chars: ${text}`);
  assert.ok(text.includes(longest.name.toUpperCase().slice(0, 12)));
  const huge = { entityIndex: { byStationId: new Map([['station_x', { type: 'station', data: { name: 'N'.repeat(80) } }]]) } };
  assert.ok(dockPromptText(huge, 'station_x', 'E').length <= 'E DOCK AT '.length + 28);
});

test('dock:range raises the named prompt and docking clears it', () => {
  const h = harness();
  h.bus.emit('dock:range', { stationId: 'station_helios', inRange: true });
  assert.ok(h.texts().some((t) => /DOCK AT HELIOS STATION$/.test(t)), `prompt reads ${JSON.stringify(h.texts())}`);
  h.bus.emit('dock:range', { stationId: 'station_helios', inRange: false });
  assert.ok(!h.texts().some((t) => /DOCK AT/.test(t)), 'leaving range clears it');
  h.bus.emit('dock:range', { stationId: 'station_ghost', inRange: true });
  assert.ok(h.texts().some((t) => /DOCK AT STATION$/.test(t)), 'an unknown id keeps the old words');
});
