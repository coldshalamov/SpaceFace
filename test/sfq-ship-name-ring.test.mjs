// ship:nameChanged — the ring legend uses the given name, and the class name when that is cleared.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ringLegendText } from '../src/ui/orrery/ringLegend.js';

test('SFQ ship name ring seed 4242 a given name replaces the class on the ring', () => {
  assert.equal(
    ringLegendText({ defName: 'Kestrel', classLine: 'fighter · tier 0', customName: '  Kolyma  ' }),
    'KOLYMA · FIGHTER · TIER 0',
  );
  assert.equal(
    ringLegendText({ defName: 'Kestrel', classLine: 'fighter · tier 0', customName: '   ' }),
    'KESTREL · FIGHTER · TIER 0',
  );
  assert.equal(ringLegendText({ defName: 'Kestrel', classLine: 'fighter · tier 0' }), 'KESTREL · FIGHTER · TIER 0');
  assert.equal(ringLegendText({ defName: '', classLine: '', customName: '' }), 'HULL');
});
