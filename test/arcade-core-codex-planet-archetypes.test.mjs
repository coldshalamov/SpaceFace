import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { PLANET_STATE_ASSIGNMENTS } from '../src/data/planetStates.js';
import {
  CODEX_PLANET_ARCHETYPES,
  codexPlanetArchetypePages,
} from '../src/data/codexPlanetArchetypes.js';
import { scanner } from '../src/systems/scanner.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { codexScreen } from '../src/ui/screens/codex.js';

function bootSector(sectorId, savedScanner = null) {
  const sim = createSimulation({ seed: 5353, systems: [scanner] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.input = { actions: {} };
  sim.state.world.currentSectorId = sectorId;
  sim.state.world.activeSector = {
    stations: [], fields: [], hazards: [], pois: [], gates: [], enemies: [], dressing: [],
  };
  if (savedScanner) sim.registry.get('scanner').deserialize(savedScanner);
  return sim;
}

function pulse(sim) {
  sim.state.input.actions.scanPulse = true;
  sim.runTicks(2);
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener() {}
  setAttribute() {}
}

function descendants(root) {
  return [root, ...(root.children || []).flatMap(descendants)];
}

test('the six placed bodies project exactly four useful archetype pages and nothing before a scan', () => {
  assert.equal(PLANET_STATE_ASSIGNMENTS.length, 6);
  assert.equal(CODEX_PLANET_ARCHETYPES.length, 4);
  assert.deepEqual(codexPlanetArchetypePages({}), []);
  for (const page of CODEX_PLANET_ARCHETYPES) {
    assert.match(page.title, /\S/);
    assert.match(page.body, /\S/);
    assert.match(page.note, /Working read:/);
  }
});

test('ordinary scanner pulses acquire each placed archetype once and Continue restores the same pages', () => {
  let saved = null;
  const visited = ['sector_charon_expanse', 'sector_vesta_forge', 'sector_sker_haven'];
  for (const sectorId of visited) {
    const sim = bootSector(sectorId, saved);
    pulse(sim);
    if (sectorId === visited[0]) {
      sim.runTicks(Math.ceil(8.1 / SIM_DT));
      pulse(sim);
    }
    saved = sim.registry.get('scanner').serialize();
    sim.dispose();
  }
  for (let index = 0; index < 70; index += 1) {
    const id = `signal:test:transient-${index}`;
    saved.records[id] = {
      id, sectorId: 'sector_test', sourceKind: 'salvage', sourceId: id,
      pos: { x: index, z: 0 }, firstSeenAt: 10 + index, lastScanAt: 10 + index,
    };
  }

  const restored = bootSector('sector_ashfall_reach', saved);
  const pages = codexPlanetArchetypePages(restored.state);
  assert.ok(Object.keys(restored.state.signalInvestigation.records).length <= 64);
  assert.deepEqual(pages.map((page) => page.id), CODEX_PLANET_ARCHETYPES.map((page) => page.id));
  assert.equal(new Set(pages.map((page) => page.id)).size, 4, 'the second Razor-Ring body does not duplicate its page');
  assert.equal(saved.records['signal:planet:planet_crown_of_thorns'].trackable, false,
    'a distant planetary survey never creates a fake flight waypoint');
  assert.equal(saved.records['signal:planet:planet_crown_of_thorns'].retainRecord, true,
    'first-scan acquisition stays in Scanner authority when ordinary transient records are pruned');
  assert.equal(saved.records['signal:planet:planet_shatterstone'].scanCount, 1,
    'a planet survey occupies the result list only for its first scan');

  const before = structuredClone(pages);
  pulse(restored);
  assert.deepEqual(codexPlanetArchetypePages(restored.state), before,
    'scanning the second Reach Scrawl body preserves the first earned archetype page');
  restored.dispose();
});

test('the default Codex Discoveries surface renders earned planet surveys', () => {
  const sim = bootSector('sector_charon_expanse');
  pulse(sim);
  const priorDocument = globalThis.document;
  const priorBody = codexScreen._body;
  try {
    globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
    codexScreen._body = new FakeElement('main');
    codexScreen._renderDiscoveries({ state: sim.state });
    const rows = descendants(codexScreen._body);
    assert.equal(BINDINGS.codex.code, 'KeyK');
    assert.ok(rows.some((row) => row.textContent === 'Planet Surveys'));
    assert.deepEqual(rows.filter((row) => row.dataset.codexPlanetArchetypeId)
      .map((row) => row.dataset.codexPlanetArchetypeId), ['planet_state_shatterstone']);
    assert.ok(rows.some((row) => row.textContent === 'Shatterstone'));
  } finally {
    codexScreen._body = priorBody;
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
    sim.dispose();
  }
});
