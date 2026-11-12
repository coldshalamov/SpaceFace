import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticColor, COLORBLIND_MODES } from '../src/ui/accessibility.js';

// The radar legend re-tints its ship chips through semanticColor when a colorblind mode is on
// (refreshLegendDots in radar.js). Every semantic state the legend uses must resolve to a plain
// hex in every mode — the dot glow suffixes '59' onto the value, so a non-hex would poison it.
const LEGEND_SEMANTICS = ['hostile', 'friendly', 'neutral'];
const HEX = /^#[0-9a-fA-F]{6}$/;

for (const mode of COLORBLIND_MODES) {
  test(`legend semantics resolve to hex in ${mode} mode`, () => {
    for (const state of LEGEND_SEMANTICS) {
      const colour = semanticColor(state, mode);
      assert.match(colour, HEX, `${state} in ${mode} mode resolved to ${colour}`);
    }
  });
}

test('legend semantics stay distinct per mode', () => {
  for (const mode of COLORBLIND_MODES) {
    if (mode === 'none') continue;
    const colours = LEGEND_SEMANTICS.map((state) => semanticColor(state, mode));
    assert.equal(new Set(colours).size, colours.length, `mode ${mode} collapses two legend hues`);
  }
});
