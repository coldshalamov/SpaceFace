import assert from 'node:assert/strict';
import test from 'node:test';

import { CODEX_DEEDS, codexDeedPages } from '../src/data/codexDeeds.js';
import { PLAYER_DEEDS } from '../src/data/titles.js';
import { createTitlesSystem } from '../src/systems/titles.js';
import { codexProgressSummary } from '../src/ui/screens/codex.js';

class TestBus {
  constructor() { this.listeners = new Map(); }
  on(event, listener) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return () => {};
  }
  emit(event, payload) {
    for (const listener of [...(this.listeners.get(event) || [])]) listener(payload);
  }
}

function harness() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, data: {} };
  const state = {
    story: {},
    tick: 900,
    simTime: 15,
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [player],
  };
  const bus = new TestBus();
  createTitlesSystem().init({ state, bus, helpers: {} });
  return { state, bus };
}

test('Codex deed pages are a fixed read model over the canonical title catalog', () => {
  assert.deepEqual(CODEX_DEEDS.map((page) => page.id), PLAYER_DEEDS.map((deed) => deed.id));
  assert.equal(CODEX_DEEDS.length, 6);
  for (const page of CODEX_DEEDS) {
    assert.match(page.headline, /\S/);
    assert.match(page.report, /\S/);
    assert.match(page.fieldNote, /^Working note:/);
  }
  assert.equal(codexDeedPages({}).filter((page) => page.earned).length, 0);
});

test('a canonical physical deed receipt unlocks one news report and Continue reconstructs it', () => {
  const { state, bus } = harness();
  const payload = {
    id: 71,
    killerId: state.playerId,
    presentation: { style: { id: 'burn_up' } },
  };
  bus.emit('entity:killed', payload);
  bus.emit('entity:killed', payload);

  let pages = codexDeedPages(state.story);
  const smokewalker = pages.find((page) => page.id === 'deed_smokewalker');
  assert.equal(smokewalker.earned, true);
  assert.equal(pages.filter((page) => page.earned).length, 1,
    'duplicate kill delivery cannot create a second report');
  assert.match(smokewalker.report, /burn line/);

  const saved = JSON.parse(JSON.stringify(state.story));
  pages = codexDeedPages(saved);
  assert.equal(pages.find((page) => page.id === 'deed_smokewalker').earned, true);
  const summary = codexProgressSummary(saved);
  assert.equal(summary.items.find((item) => item.key === 'Deeds').value, '1/6 reports');
  assert.match(summary.items.find((item) => item.key === 'Completion').value, /^\d+%$/);
});

test('unattributed or merely descriptive outcomes leave every Codex deed locked', () => {
  const { state, bus } = harness();
  bus.emit('entity:killed', {
    id: 72,
    killerId: 99,
    presentation: { style: { id: 'burn_up' } },
  });
  bus.emit('entity:killed', {
    id: 73,
    killerId: state.playerId,
    presentation: { style: { id: 'ordinary' } },
  });
  assert.equal(codexDeedPages(state.story).filter((page) => page.earned).length, 0);
});
