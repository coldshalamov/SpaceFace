// ECON-05: a sink charge posts one receipt line naming its SESSION_SINK_KINDS kind. The writer
// emits economy:sinkCharged with kind+causeWord+amount; alerts raises one keyed floor line.
// Zero-credit charges emit nothing (charged>0 gate in chargeCredits) and stay silent.
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
  globalThis.document = {
    getElementById: (id) => (id === 'alerts' ? makeEl('div') : null),
    createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t),
    body: makeEl('body'), addEventListener() {}, hidden: false,
  };
}

function harness() {
  installDom();
  const bus = createBus();
  const state = createGameState(4242);
  const said = [];
  bus.on('voice:say', (p) => said.push(p));
  createAlerts({ bus, state });
  const sys = Object.create(economy);
  sys.state = state;
  sys.bus = bus;
  return { bus, said, state, sys };
}

test('ECON-05: a sink charge raises one line naming its kind word', () => {
  const h = harness();
  h.state.player.credits = 5000;
  h.sys.chargeCredits(1200, 'fine:contraband');
  const lines = h.said.filter((p) => p.channel === 'alert');
  assert.equal(lines.length, 1, 'one receipt line for the charge');
  assert.match(lines[0].text, /FINE/);
  assert.match(lines[0].text, /1200 CR/);
  assert.match(lines[0].text, /restricted cargo/, 'kind maps to its authored cause word');
});

test('ECON-05: repair and toll kinds each speak their own word', () => {
  const h = harness();
  h.state.player.credits = 5000;
  h.sys.chargeCredits(300, 'service:repair');
  h.sys.chargeCredits(150, 'service:dock_toll');
  const texts = h.said.filter((p) => p.channel === 'alert').map((p) => p.text);
  assert.equal(texts.length, 2, 'one line per charge');
  assert.match(texts[0], /REPAIR −300 CR/);
  assert.match(texts[1], /TOLL −150 CR/);
});

test('ECON-05: zero-credit and floor-clamped charges post nothing', () => {
  const h = harness();
  h.state.player.credits = 0;
  h.sys.chargeCredits(500, 'fine:contraband'); // clamps to 0 — no charge moved
  assert.equal(h.said.filter((p) => p.channel === 'alert').length, 0);
  h.bus.emit('economy:sinkCharged', {});       // malformed emit: no id
  assert.equal(h.said.filter((p) => p.channel === 'alert').length, 0);
});
