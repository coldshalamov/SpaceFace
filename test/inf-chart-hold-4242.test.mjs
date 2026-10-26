// The chart's Economy tab counts the ore already in the hold. Seed 4242.
// The hold owner stores usedVolume. This tab used to read a volume field the
// hold does not have, so eight units of iron still printed as an empty hold.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { addCargo } from '../src/systems/cargo.js';
import { galaxyMapScreen } from '../src/ui/galaxyMap.js';

function installDocument() {
  function el(tag) {
    return {
      tag,
      className: '',
      textContent: '',
      innerHTML: '',
      children: [],
      style: {},
      setAttribute() {},
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
      get outerHTML() { return `<${tag}></${tag}>`; },
    };
  }
  globalThis.document = { createElement: (tag) => el(tag) };
}

function cargoRow(state) {
  const html = galaxyMapScreen._economyTabHtml(state);
  const match = html.match(/Cargo<\/span><span class="gm-ins-row-val">([^<]*)<\/span>/);
  assert.ok(match, 'the Economy tab names a cargo row');
  return match[1];
}

test('the chart Economy tab counts iron already in the hold', () => {
  installDocument();
  const state = createGameState(4242);
  assert.equal(state.meta.seed, 4242);
  assert.equal(addCargo(state, 'cmdty_ore_iron', 8), 8);
  assert.equal(state.player.cargo.usedVolume, 8);
  assert.equal(state.player.cargo.capVolume, 40);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 8);
  assert.equal(cargoRow(state), '8/40 u');
});

test('an empty hold still reads empty on the chart', () => {
  installDocument();
  const state = createGameState(4242);
  assert.equal(state.player.cargo.usedVolume, 0);
  assert.equal(cargoRow(state), '0/40 u');
});
