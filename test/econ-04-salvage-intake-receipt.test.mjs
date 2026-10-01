// ECON-04: a salvage intake the market absorbed posts one receipt line naming the yard and the
// lot's nominal value. The emit carries valueCr; the alerts listener raises exactly one alert
// line per applied intake, keyed by intake id.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAlerts } from '../src/ui/alerts.js';
import { economy } from '../src/systems/economy.js';
import { createGameState } from '../src/core/gameState.js';

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
      removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
      remove() { if (el.parentNode) el.parentNode.removeChild(el); },
      addEventListener() {}, querySelector() { return null; },
      get textContent() { return el._text; },
      set textContent(v) { el._text = String(v == null ? '' : v); },
    };
    return el;
  }
  const alertsEl = makeEl('div');
  globalThis.document = {
    getElementById(id) { return id === 'alerts' ? alertsEl : null; },
    createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t),
    body: makeEl('body'), addEventListener() {}, hidden: false,
  };
}

function harness() {
  installDom();
  const bus = createBus();
  const said = [];
  bus.on('voice:say', (p) => said.push(p));
  const state = createGameState(4242);
  createAlerts({ bus, state });
  return { bus, said, state };
}

test('ECON-04: an applied intake raises one receipt line naming value and yard', () => {
  const h = harness();
  h.bus.emit('economy:salvageIntakeApplied', {
    ok: true, intakeId: 'intake_1', yardId: 'station_helios', lotId: 'lot_9',
    commodityId: 'scrap', qty: 12, valueCr: 840,
  });
  const lines = h.said.filter((p) => p.channel === 'alert');
  assert.equal(lines.length, 1, 'one receipt line per applied intake');
  assert.match(lines[0].text, /SALVAGE INTAKE/);
  assert.match(lines[0].text, /12t scrap/);
  assert.match(lines[0].text, /840 CR/);
  assert.equal(lines[0].id, 'alert:salvage-intake:intake_1');
});

test('ECON-04: failed and malformed intakes stay silent', () => {
  const h = harness();
  h.bus.emit('economy:salvageIntakeApplied', { ok: false, reason: 'invalid_salvage_intake' });
  h.bus.emit('economy:salvageIntakeApplied', null);
  h.bus.emit('economy:salvageIntakeApplied', { ok: true, intakeId: 'intake_2', qty: 0, valueCr: 0 });
  const lines = h.said.filter((p) => p.channel === 'alert');
  assert.equal(lines.length, 1, 'only the applied zero-qty intake still names its line');
  assert.match(lines[0].text, /0t scrap/);
});

test('ECON-04: the economy emit carries the nominal lot value', () => {
  const state = createGameState(4242);
  const bus = createBus();
  const emitted = [];
  bus.on('economy:salvageIntakeApplied', (p) => emitted.push(p));
  const sys = Object.create(economy);
  sys.state = state;
  sys.bus = bus;
  // Ceres Refinery is an industrial yard listing scrap; the intake lands with a named value.
  const result = sys.applyNpcSalvageIntake({
    intakeId: 'intake_v', yardId: 'station_ceres', manifestId: 'm1', lotId: 'l1',
    lines: [{ commodityId: 'cmdty_scrap_metal', qty: 5 }],
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].qty, 5);
  assert.ok(emitted[0].valueCr > 0, 'receipt carries the nominal lot value');
  // A duplicate application re-emits nothing (the early-return path never reaches the emit).
  const dup = sys.applyNpcSalvageIntake({
    intakeId: 'intake_v', yardId: 'station_ceres', manifestId: 'm1', lotId: 'l1',
    lines: [{ commodityId: 'cmdty_scrap_metal', qty: 5 }],
  });
  assert.equal(dup.duplicate, true);
  assert.equal(emitted.length, 1, 'no second emit, so no second receipt');
});
