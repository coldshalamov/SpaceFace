// ECON-05: A sink charge posts a receipt line naming the kind
// ECON-04: A salvage intake that the market absorbed posts a one-line receipt
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAlerts, sinkChargeAlertText, salvageIntakeAlertText } from '../src/ui/alerts.js';
import { SESSION_SINK_KINDS } from '../src/systems/economy.js';
import { fakeDom } from './helpers/fake-dom.mjs';

function setupHarness() {
  const dom = fakeDom();
  globalThis.document = dom;
  const root = dom.createElement('div');
  root.id = 'alerts';
  root.removeChild = function removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
  };
  dom.head.appendChild(root);

  const bus = createBus();
  const alerts = createAlerts({ root, bus });
  return { dom, root, bus, alerts };
}

function getAlertText(pill) {
  if (!pill) return '';
  const textChild = pill.children.find((c) => c.className && c.className.includes('sf-alert__text'));
  return textChild ? textChild.textContent : pill.textContent;
}

test('ECON-05: sinkChargeAlertText formats each SESSION_SINK_KINDS word correctly', () => {
  for (const kind of SESSION_SINK_KINDS) {
    const text = sinkChargeAlertText({ kind, amount: 250 });
    assert.ok(text.includes(kind.toUpperCase()), `expected ${kind.toUpperCase()} in ${text}`);
    assert.ok(text.includes('250 CR'), `expected 250 CR in ${text}`);
  }
});

test('ECON-05: sinkChargeAlertText ignores zero-credit or non-positive charges', () => {
  assert.equal(sinkChargeAlertText({ kind: 'repair', amount: 0 }), null);
  assert.equal(sinkChargeAlertText({ kind: 'toll', amount: -50 }), null);
  assert.equal(sinkChargeAlertText(null), null);
});

test('ECON-05: on seed 4242 economy:sinkCharged raises one line per charge with its SESSION_SINK_KINDS word', () => {
  const { root, bus } = setupHarness();

  for (const kind of SESSION_SINK_KINDS) {
    bus.emit('economy:sinkCharged', { id: `sink_${kind}`, kind, amount: 150 });
    const pill = root.children.find((c) => getAlertText(c).includes(kind.toUpperCase()));
    assert.ok(pill, `expected alert pill for ${kind}`);
    const text = getAlertText(pill);
    assert.ok(text.includes(kind.toUpperCase()), `pill text must contain ${kind.toUpperCase()}, got ${text}`);
    assert.ok(text.includes('150 CR'), `pill text must contain 150 CR, got ${text}`);
  }

  // Zero-credit charges must NOT raise an alert
  root.children.length = 0;
  bus.emit('economy:sinkCharged', { id: 'sink_zero', kind: 'repair', amount: 0 });
  assert.equal(root.children.length, 0, 'zero-credit charge must not post an alert');
});

test('ECON-04: salvageIntakeAlertText formats absorbed salvage intake value', () => {
  assert.equal(salvageIntakeAlertText({ qty: 12, value: 480 }), 'SALVAGE INTAKE · 480 CR');
  assert.equal(salvageIntakeAlertText({ qty: 5 }), 'SALVAGE INTAKE · 5 U');
  assert.equal(salvageIntakeAlertText({ qty: 0 }), null);
  assert.equal(salvageIntakeAlertText(null), null);
});

test('ECON-04: economy:salvageIntakeApplied raises one receipt line in alerts', () => {
  const { root, bus } = setupHarness();

  bus.emit('economy:salvageIntakeApplied', { intakeId: 'intake_test_1', qty: 8, value: 320 });
  const pill = root.children.find((c) => c.className && c.className.includes('sf-alert'));
  assert.ok(pill, 'expected salvage intake alert pill');
  const text = getAlertText(pill);
  assert.ok(text.includes('SALVAGE INTAKE · 320 CR'), `got ${text}`);
});
