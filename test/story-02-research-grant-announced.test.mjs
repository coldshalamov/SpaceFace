// STORY-02: research points earned announce themselves. `research:pointsChanged` (missions is
// the sole writer) raises one alert line naming the grant; a zero-delta emit stays silent.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAlerts } from '../src/ui/alerts.js';
import { missions } from '../src/systems/missions.js';
import { createGameState } from '../src/core/gameState.js';

function installDom() {
  function makeEl(tag = 'div') {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      parentNode: null,
      style: {},
      dataset: {},
      hidden: false,
      _text: '',
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {},
      getAttribute() { return null; },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      append(...ns) { ns.forEach((n) => el.appendChild(n)); },
      prepend(c) { c.parentNode = el; el.children.unshift(c); return c; },
      removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c; },
      remove() { if (el.parentNode) el.parentNode.removeChild(el); },
      addEventListener() {},
      querySelector() { return null; },
      get textContent() { return el._text; },
      set textContent(v) { el._text = String(v == null ? '' : v); },
    };
    return el;
  }
  const alertsEl = makeEl('div');
  globalThis.document = {
    getElementById(id) { return id === 'alerts' ? alertsEl : null; },
    createElement: (t) => makeEl(t),
    createElementNS: (ns, t) => makeEl(t),
    body: makeEl('body'),
    addEventListener() {},
    hidden: false,
  };
  return alertsEl;
}

function harness() {
  const alertsEl = installDom();
  const bus = createBus();
  const said = [];
  bus.on('voice:say', (p) => said.push(p));
  createAlerts({ bus, state: {} });
  return { bus, said, alertsEl };
}

test('STORY-02: a grant raises one alert line naming the source', () => {
  const h = harness();
  h.bus.emit('research:pointsChanged', {
    researchPoints: 7, source: 'first:anomaly:triangulated', scope: 'anomaly', granted: 3,
  });
  const lines = h.said.filter((p) => p.channel === 'alert');
  assert.equal(lines.length, 1, 'one line for the grant');
  assert.match(lines[0].text, /\+3 RP/);
  assert.match(lines[0].text, /first anomaly/i);
  assert.equal(lines[0].id, 'alert:research:first-anomaly');
});

test('STORY-02: zero and missing deltas stay silent', () => {
  const h = harness();
  h.bus.emit('research:pointsChanged', { researchPoints: 7, source: 'clause_honor' });
  h.bus.emit('research:pointsChanged', { researchPoints: 7, source: 'clause_honor', granted: 0 });
  assert.equal(h.said.length, 0);
});

test('STORY-02: a contract settlement speaks both of its grants', () => {
  const h = harness();
  h.bus.emit('research:pointsChanged', { researchPoints: 6, source: 'mission:recon_scan', granted: 6 });
  h.bus.emit('research:pointsChanged', { researchPoints: 8, source: 'clause_honor', granted: 2 });
  const lines = h.said.filter((p) => p.channel === 'alert');
  assert.equal(lines.length, 2, 'two distinct sources each get a line');
  assert.match(lines[0].text, /recon contract/);
  assert.match(lines[1].text, /honored clause/);
});

test('STORY-02: the mission-type emit carries source and granted through the writer', () => {
  // Prove the production payload shape reaches the surface: missions' settlement emits
  // source+granted, which is what alerts.js translates into the named line.
  const state = createGameState(4242);
  const bus = createBus();
  const emitted = [];
  bus.on('research:pointsChanged', (p) => emitted.push(p));
  const sys = Object.create(missions);
  sys.state = state;
  sys.bus = bus;
  // The first-grant path carries scope+granted+source in one emit.
  state.player.researchPoints = 0;
  sys._grantResearchFirst('anomaly:triangulated', { poiId: 'poi_x' });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].source, 'first:anomaly:triangulated');
  assert.equal(emitted[0].scope, 'anomaly');
  assert.equal(emitted[0].granted, 3);
  assert.equal(state.player.researchPoints, 3);
  // A repeat of the same durable record pays nothing and emits nothing.
  sys._grantResearchFirst('anomaly:triangulated', { poiId: 'poi_x' });
  assert.equal(emitted.length, 1);
  assert.equal(state.player.researchPoints, 3);
});
