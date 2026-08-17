import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { CODEX_DEEDS, codexDeedPages } from '../src/data/codexDeeds.js';
import { PLAYER_DEEDS } from '../src/data/titles.js';
import { combat } from '../src/systems/combat.js';
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
  assert.equal(CODEX_DEEDS.length, 8);
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
  assert.equal(summary.items.find((item) => item.key === 'Deeds').value, '1/8 reports');
  assert.match(summary.items.find((item) => item.key === 'Completion').value, /^\d+%$/);
});

test('the literal chain-three and capital firsts require their real kill receipt fields', () => {
  const { state, bus } = harness();
  bus.emit('entity:killed', {
    id: 81,
    killerId: state.playerId,
    victimClass: 'fighter',
    presentation: { style: { id: 'chain', chainDepth: 2 } },
  });
  assert.equal(codexDeedPages(state.story).find((page) => page.id === 'deed_three_deep').earned, false,
    'an ordinary chain kill is still Undertow, not the three-deep first');

  bus.emit('entity:killed', {
    id: 82,
    killerId: state.playerId,
    victimClass: 'fighter',
    presentation: { style: { id: 'chain', chainDepth: 3 } },
  });
  bus.emit('entity:killed', {
    id: 83,
    killerId: state.playerId,
    victimClass: 'capital',
    presentation: { style: { id: 'ordinary', chainDepth: 0 } },
  });
  const pages = codexDeedPages(state.story);
  assert.equal(pages.find((page) => page.id === 'deed_three_deep').earned, true);
  assert.equal(pages.find((page) => page.id === 'deed_keelbreaker').earned, true);
  assert.equal(codexProgressSummary(state.story).items.find((item) => item.key === 'Deeds').value,
    '3/8 reports', 'Undertow, Three-Deep, and Keelbreaker are three distinct physical firsts');

  const sim = createSimulation({ seed: 0x530053, systems: [combat, createTitlesSystem()] });
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_player', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 30, data: { shipClass: 'light' },
  });
  const capital = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 20, z: 0 },
    hull: 5, hullMax: 5, radius: 28, mass: 800,
    data: { shipClass: 'capital', ai: { lawful: false } },
  });
  sim.state.playerId = player.id;
  const hit = sim.registry.get('combat').ensureKernel().routeDamage({
    attackerId: player.id,
    targetId: capital.id,
    packet: { channels: { kinetic: 20 }, penetration: 1, shieldBypass: 1 },
    origin: { kind: 'weapon', id: 'wpn_siege_lance_l' },
  });
  assert.equal(hit.ok, true);
  assert.equal(capital.alive, false, 'the production Combat owner performs the capital lethal edge');
  assert.equal(codexDeedPages(sim.state.story)
    .find((page) => page.id === 'deed_keelbreaker').earned, true,
  'Combat victimClass=capital reaches the existing title owner and Codex read model');
  sim.dispose();
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
