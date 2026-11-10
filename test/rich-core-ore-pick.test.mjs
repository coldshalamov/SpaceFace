// Phase 2b #10: the rich-core ore is the cheapest rare at or above tier+1 (value tie-break), not
// the alphabetically-first one (which made cmdty_gem_emerald the payout of every tier 0–3 core).
import test from 'node:test';
import assert from 'node:assert/strict';
import { richCorePlan } from '../src/systems/mining.js';
import { ORES } from '../src/data/mining.js';

const rock = (tier) => ({ id: `ast_${tier}`, data: { tier } });

test('tier 0–3 cores pay the cheapest tier-3 rare ore, not the dearest gem', () => {
  const t3rare = ORES.filter((o) => o.tier === 3 && o.tags && o.tags.includes('rare'))
    .sort((a, b) => a.baseValue - b.baseValue);
  for (const tier of [0, 1, 2]) {
    const plan = richCorePlan(1234, rock(tier));
    assert.equal(plan.commodityId, t3rare[0].id, `tier ${tier}`);
    assert.notEqual(plan.commodityId, 'cmdty_gem_emerald');
  }
});

test('every pick is the cheapest rare at or above tier+1', () => {
  for (let tier = 0; tier <= 3; tier++) {
    const target = tier + 1;
    const pool = ORES.filter((o) => o.tier >= target && o.tags && o.tags.includes('rare'));
    const minTier = Math.min(...pool.map((o) => o.tier));
    const cheapest = pool.filter((o) => o.tier === minTier).sort((a, b) => a.baseValue - b.baseValue)[0];
    assert.equal(richCorePlan(99, rock(tier)).commodityId, cheapest.id, `tier ${tier}`);
  }
});

test('the plan stays deterministic per seed and asteroid', () => {
  assert.deepEqual(richCorePlan(7, rock(1)), richCorePlan(7, rock(1)));
});
