// A hold of spore catalyst reads on the cargo panel. Seed 4242. Ore stays neutral.
import test from 'node:test';
import assert from 'node:assert/strict';
import { holdLeanChips } from '../src/ui/cargoConscience.js';

test('seed 4242: living samples lean Concord, the Frontier, and the Quiet', () => {
  assert.equal(4242, 4242);
  const chips = holdLeanChips({ items: { cmdty_spore_catalyst: 3, cmdty_live_specimen: 1 } });
  const labels = chips.map((chip) => chip.label);
  assert.deepEqual(labels, ['Concord risk', 'Frontier wary', 'Quiet favor']);
  assert.equal(chips[0].magnitude, 4);
  assert.equal(chips[2].lean, 'warm');

  assert.deepEqual(holdLeanChips({ items: { cmdty_ore_iron: 8, cmdty_gate_handshake: 1 } }), []);

  const medicine = holdLeanChips({ items: { cmdty_medical: 2 } });
  assert.deepEqual(medicine.map((chip) => chip.label), ['Frontier goodwill']);
});
