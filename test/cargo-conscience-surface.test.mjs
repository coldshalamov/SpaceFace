import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cargoConscience,
  conscienceGlyph,
  conscienceLeanLabel,
  holdLeanChips,
  holdSentiment,
} from '../src/ui/cargoConscience.js';

// INFERENCE-27 (cargo): the BP-12 Cargo Conscience pipeline — moral tags → holdSentiment →
// state.ui.cargoConscience — ran on every cargo change with zero readers: the precomputed glyph
// was written forever and never drawn. The HUD cargo panel now renders HOLD READS lean chips
// from the same vocabulary. A lean is a read, never a rep delta; a neutral hold shows nothing.

test('contraband reads two-faced — Quiet favor and Concord risk, strongest first', () => {
  const chips = holdLeanChips({ items: { cmdty_narcotics: 4 } });
  const labels = chips.map((c) => c.label);
  assert.ok(labels.includes('Quiet favor'));
  assert.ok(labels.includes('Concord risk'));
  const quiet = chips.find((c) => c.factionId === 'faction_quiet');
  const concord = chips.find((c) => c.factionId === 'faction_scn');
  assert.equal(quiet.lean, 'warm');
  assert.equal(concord.lean, 'cool');
});

test('humanitarian cargo reads as Frontier goodwill', () => {
  const chips = holdLeanChips({ items: { cmdty_medical: 2 } });
  assert.ok(chips.some((c) => c.factionId === 'faction_free' && c.lean === 'warm'
    && c.label === 'Frontier goodwill'));
});

test('a neutral hold renders nothing — untagged cargo and empty holds stay silent', () => {
  assert.deepEqual(holdLeanChips({ items: { cmdty_ore_iron: 9 } }), []);
  assert.deepEqual(holdLeanChips({ items: {} }), []);
  assert.deepEqual(holdLeanChips(null), []);
  assert.deepEqual(holdLeanChips(undefined), []);
});

test('a mixed hold reports both tags — weapons cool the Frontier while food warms it', () => {
  const chips = holdLeanChips({ items: { cmdty_weapons: 1, cmdty_food: 1 } });
  assert.ok(chips.some((c) => c.factionId === 'faction_scn' && c.lean === 'warm'
    && c.label === 'Concord approving'));
  // weapons -1 vs food +1 net to neutral on the Frontier — the net lean is dropped honestly.
  assert.equal(chips.filter((c) => c.factionId === 'faction_free').length, 0);
});

test('chips, sentiment and glyph share one authored vocabulary', () => {
  const cargo = { items: { cmdty_narcotics: 4 } };
  const glyph = conscienceGlyph(cargo);
  const chips = holdLeanChips(cargo);
  assert.equal(glyph.label, chips[0].label, 'the dominant chip is the glyph');
  for (const chip of chips) {
    assert.equal(chip.label, conscienceLeanLabel(chip.factionId, chip.lean));
  }
});

test('the registered system writes the same leans the panel reads', () => {
  const state = { player: { cargo: { items: { cmdty_narcotics: 4 } } }, ui: {}, simTime: 0 };
  const bus = { on() {}, off() {} };
  cargoConscience.init({ state, bus });
  const precomputed = state.ui.cargoConscience;
  assert.ok(precomputed && Array.isArray(precomputed.leans));
  const chips = holdLeanChips(state.player.cargo);
  assert.equal(precomputed.leans.length, chips.length,
    'precomputed state and the render source agree');
  for (const lean of precomputed.leans) {
    const chip = chips.find((c) => c.factionId === lean.factionId);
    assert.ok(chip && chip.lean === lean.lean);
  }
  cargoConscience.destroy();
});

test('the conscience never writes reputation — factions and cargo stay untouched', () => {
  const cargo = { items: { cmdty_narcotics: 4 } };
  const state = { player: { cargo }, factions: { faction_quiet: -10 }, ui: {}, simTime: 0 };
  cargoConscience.init({ state, bus: { on() {}, off() {} } });
  assert.equal(state.factions.faction_quiet, -10);
  assert.equal(cargo.items.cmdty_narcotics, 4);
  cargoConscience.destroy();
});
