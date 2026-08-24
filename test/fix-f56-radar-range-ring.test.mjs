import assert from 'node:assert/strict';
import test from 'node:test';

import { rangeRingRatioForEntity } from '../src/ui/radar.js';

test('radar range ring follows the active entity live loadout without a stale aggregate field', () => {
  const player = {
    data: {
      weapons: [{ defId: 'short', range: 1200 }],
      miningBeam: { tierId: 'beam_mk1', range: 240 },
    },
  };

  assert.equal(rangeRingRatioForEntity(player, 4000), 0.3);

  player.data.weapons = [{ defId: 'long', range: 5000 }];
  assert.equal(
    rangeRingRatioForEntity(player, 4000),
    1,
    'changing the active loadout must move the ring to the new clamped range',
  );

  player.data.weapons = [{ defId: 'short', range: 1200 }];
  player.data.miningBeam = { tierId: 'beam_industrial', range: 3000 };
  assert.equal(rangeRingRatioForEntity(player, 4000), 0.75, 'the farthest equipped mining tool also drives the ring');
});

test('radar range ring ignores invalid live ranges and retains the no-tool fallback', () => {
  const player = {
    data: {
      weapons: [{ range: Infinity }, { range: -1 }, { range: '5000' }],
      miningBeam: { range: NaN },
    },
  };

  assert.equal(rangeRingRatioForEntity(player, 4000), 0.6);
  assert.equal(rangeRingRatioForEntity({ data: { weapons: [{ range: 1200 }] } }, 0), 0.6);
});
