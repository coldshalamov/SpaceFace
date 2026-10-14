// Test verifying manifestSummary handles both manifest arrays and authored salvage pools
import test from 'node:test';
import assert from 'node:assert/strict';

import { manifestSummary } from '../src/ui/hud.js';

test('manifestSummary formats array manifest correctly', () => {
  const e = {
    data: {
      manifest: [
        { id: 'cmdty_ore', qty: 5 },
        { id: 'cmdty_parts', qty: 2 },
        { id: 'cmdty_fuel', qty: 10 },
      ],
    },
  };
  const summary = manifestSummary(e);
  assert.ok(summary.includes('x5') || summary.includes('×5'), 'includes first commodity qty');
  assert.ok(summary.includes('+1'), 'includes overflow count for 3 items');
});

test('manifestSummary falls back to salvagePool when manifest is missing', () => {
  const e = {
    data: {
      salvagePool: {
        cmdty_electronics: 3,
        cmdty_alloys: 1,
      },
    },
  };
  const summary = manifestSummary(e);
  assert.ok(summary.includes('x3') || summary.includes('×3'), 'summarizes electronics from salvagePool');
  assert.ok(summary.includes('x1') || summary.includes('×1'), 'summarizes alloys from salvagePool');
});

test('manifestSummary returns stripped when no loot exists', () => {
  const e1 = { data: {} };
  const e2 = { data: { salvagePool: { cmdty_ore: 0 } } };
  assert.equal(manifestSummary(e1), 'stripped');
  assert.equal(manifestSummary(e2), 'stripped');
});
