// WORLD-25: entering a hazard raises the alert line the HUD already owns; leaving clears it.
// world.js emits hazard:enter/hazard:exit with the player entity id — radiation raises a warn
// pill, nebula an info pill, exit clears the same key.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAlerts } from '../src/ui/alerts.js';

function installDom() {
  function makeEl(tag = 'div') {
    const el = {
      tagName: String(tag).toUpperCase(), children: [], parentNode: null, style: {}, dataset: {},
      hidden: false, _text: '',
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {}, getAttribute() { return null; },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      append(...ns) { ns.forEach((n) => el.appendChild(n)); },
      prepend(c) { c.parentNode = el; el.children.unshift(c); return c; },
      removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c; },
      remove() { if (el.parentNode) el.parentNode.removeChild(el); },
      addEventListener() {}, querySelector() { return null; },
      get textContent() { return el.children.map((c) => c.textContent).join('') || el._text; },
      set textContent(v) { el._text = String(v == null ? '' : v); },
    };
    return el;
  }
  const alertsEl = makeEl('div');
  globalThis.document = {
    getElementById: (id) => (id === 'alerts' ? alertsEl : null),
    createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t),
    body: makeEl('body'), addEventListener() {}, hidden: false,
  };
  return alertsEl;
}

function harness() {
  const alertsEl = installDom();
  const bus = createBus();
  const state = { playerId: 'player_1' };
  createAlerts({ bus, state });
  return { bus, alertsEl };
}

function pillTexts(root) {
  return root.children.map((el) => el.textContent);
}

test('WORLD-25: entering radiation raises one persistent line; leaving clears it', () => {
  const h = harness();
  h.bus.emit('hazard:enter', { entityId: 'player_1', zoneType: 'radiation', intensity: 0.8 });
  assert.deepEqual(pillTexts(h.alertsEl), ['RADIATION FIELD']);
  // Re-emitting entry refreshes the same keyed pill — still one line.
  h.bus.emit('hazard:enter', { entityId: 'player_1', zoneType: 'radiation', intensity: 0.8 });
  assert.equal(h.alertsEl.children.length, 1);
  h.bus.emit('hazard:exit', { entityId: 'player_1', zoneType: 'radiation' });
  assert.equal(h.alertsEl.children.length, 0, 'exit clears the line');
});

test('WORLD-25: nebula raises an info line and clears on exit', () => {
  const h = harness();
  h.bus.emit('hazard:enter', { entityId: 'player_1', zoneType: 'nebula', intensity: 0.4 });
  assert.deepEqual(pillTexts(h.alertsEl), ['NEBULA FIELD']);
  h.bus.emit('hazard:exit', { entityId: 'player_1', zoneType: 'nebula' });
  assert.equal(h.alertsEl.children.length, 0);
});

test('WORLD-25: another entity crossing a zone never raises the line', () => {
  const h = harness();
  h.bus.emit('hazard:enter', { entityId: 'npc_9', zoneType: 'radiation', intensity: 1 });
  h.bus.emit('hazard:exit', { entityId: 'npc_9', zoneType: 'radiation' });
  assert.equal(h.alertsEl.children.length, 0);
});

test('WORLD-25: overlapping hazards keep independent lines', () => {
  const h = harness();
  h.bus.emit('hazard:enter', { entityId: 'player_1', zoneType: 'radiation' });
  h.bus.emit('hazard:enter', { entityId: 'player_1', zoneType: 'nebula' });
  assert.equal(h.alertsEl.children.length, 2);
  h.bus.emit('hazard:exit', { entityId: 'player_1', zoneType: 'radiation' });
  assert.deepEqual(pillTexts(h.alertsEl), ['NEBULA FIELD'], 'only the exited hazard clears');
});
