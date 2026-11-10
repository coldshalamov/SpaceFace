// The first frontier crossing teaches itself — one line, once, on the first visit to an
// uncharted sector; charted sectors and return trips never speak.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { firstUseLine } from '../src/ui/hudAttention.js';
import { onboarding } from '../src/systems/onboarding.js';

function harness() {
  const bus = createBus();
  const state = {
    playerId: 'player',
    player: { hints: {} },
    entities: new Map(),
    settings: { gameplay: { tutorialHints: true } },
  };
  const shown = [];
  const sys = Object.create(onboarding);
  sys.state = state;
  sys.bus = bus;
  sys._showHint = (key, line, payload) => shown.push({ key, line, payload });
  sys.init({ state, bus });
  return { bus, state, shown };
}

test('the first uncharted arrival speaks the frontier line once', () => {
  const h = harness();
  assert.equal(firstUseLine('firstFrontier'), 'The rim keeps no records. Chart it yourself.');
  h.bus.emit('sector:enter', {
    sectorId: 'sector_kepler_scar',
    firstVisit: true,
    sector: { id: 'sector_kepler_scar', charted: false },
  });
  assert.equal(h.shown.length, 1, 'exactly one hint');
  assert.equal(h.shown[0].key, 'firstFrontier');
  h.bus.emit('sector:enter', {
    sectorId: 'sector_kepler_scar',
    firstVisit: false,
    sector: { id: 'sector_kepler_scar', charted: false },
  });
  assert.equal(h.shown.length, 1, 'return trips never re-teach');
});

test('charted sectors stay silent', () => {
  const h = harness();
  h.bus.emit('sector:enter', {
    sectorId: 'sector_helios_prime',
    firstVisit: true,
    sector: { id: 'sector_helios_prime', charted: true },
  });
  assert.equal(h.shown.length, 0, 'the core never speaks this line');
  h.bus.emit('sector:enter', { sectorId: 'sector_somewhere', firstVisit: true, sector: null });
  assert.equal(h.shown.length, 0, 'a missing sector card stays silent');
});
