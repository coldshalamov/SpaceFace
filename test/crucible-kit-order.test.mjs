// test/crucible-kit-order.test.mjs — PQ-137.05 kit-balance: free Pulse must not out-resolve the physics kit.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { WEAPONS } from '../src/data/weapons.js';
import { CRUCIBLE_DEFAULT_STARTER_ID } from '../src/ui/crucibleLaunch.js';
import {
  countKitKills,
  isAttributedPhysicsKill,
  isHostileKill,
} from '../scripts/lib/bench/swarmMetrics.mjs';
import {
  KIT_ORDER_SEEDS,
  KIT_ORDER_TICK_CAP,
  formatKitOrderReport,
  median,
  runCrucibleKitOrder,
} from '../scripts/lib/bench/crucibleKitOrder.mjs';

const TICK = (tick, type, data = {}) => ({ tick, type, data });

test('pinned seeds include the three named Crucible seeds and twenty integers', () => {
  assert.equal(KIT_ORDER_SEEDS.length, 20);
  assert.ok(KIT_ORDER_SEEDS.includes(4242));
  assert.ok(KIT_ORDER_SEEDS.includes(8008));
  assert.ok(KIT_ORDER_SEEDS.includes(13502));
  assert.equal(KIT_ORDER_TICK_CAP, 5400);
});

test('fresh Crucible still starts with shove-first physics_toolkit', () => {
  assert.equal(CRUCIBLE_DEFAULT_STARTER_ID, 'physics_toolkit');
  const kit = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'physics_toolkit');
  assert.ok(kit);
  assert.equal(kit.loadout[0].defId, 'wpn_concussion_cannon_m');
  assert.ok(!kit.loadout.some((slot) => slot.defId === 'wpn_railgun_m'));
  const pulse = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s');
  assert.ok(pulse.dmg > 0 && pulse.rof > 0, 'Pulse stays a readable starter gun');
  assert.equal(pulse.dmg, 8);
  assert.equal(pulse.rof, 5.5);
  assert.equal(pulse.impulsePerHit, 84, 'B4 starter 5% cruise impulse is intact');
  assert.equal(pulse.heatPerShot, 8, 'kit-balance vent lever; not a deleted gun');
});

test('countKitKills splits hostile vs physics-attributed vs gun on the real helpers', () => {
  const collision = TICK(100, 'entity:killed', {
    cause: 'collision', targetId: 10, archetype: 'fighter', killerId: 10,
  });
  const weapon = TICK(120, 'entity:killed', {
    cause: 'weapon', targetId: 11, archetype: 'fighter', killerId: 1,
  });
  const player = TICK(200, 'entity:killed', {
    cause: 'player', targetId: 1, archetype: 'player', killerId: 11,
  });
  assert.equal(isHostileKill(collision), true);
  assert.equal(isAttributedPhysicsKill(collision), true);
  assert.equal(isHostileKill(weapon), true);
  assert.equal(isAttributedPhysicsKill(weapon), false);
  assert.equal(isHostileKill(player), false);
  const counts = countKitKills([collision, weapon, player]);
  assert.equal(counts.hostile, 2);
  assert.equal(counts.physics, 1);
  assert.equal(counts.gun, 1);
  assert.equal(median([0, 1, 4, 8]), 2.5);
});

test('20-seed Crucible kit-order: physics_toolkit median hostile kills beat energy_baseline', {
  timeout: 3_900_000,
  // Default suite stays fast. The 40-minute proof is
  // `KIT_ORDER_FULL=1` or `node scripts/check-crucible-kit-order.mjs`.
  skip: process.env.KIT_ORDER_FULL !== '1',
}, async () => {
  const result = await runCrucibleKitOrder({
    seeds: KIT_ORDER_SEEDS,
    tickCap: KIT_ORDER_TICK_CAP,
  });
  console.log(formatKitOrderReport(result));
  assert.equal(result.seeds.length, 20);
  assert.ok(result.energyAnyKill, 'Pulse kit must record ≥ 1 hostile kill on at least one seed');
  assert.ok(result.physicsAnyKill, 'physics kit must record ≥ 1 hostile kill on at least one seed');
  assert.ok(
    result.physicsMedianHostile > result.energyMedianHostile,
    `physics median ${result.physicsMedianHostile} must exceed Pulse median ${result.energyMedianHostile}`,
  );
  assert.equal(result.ok, true, result.reason);
});
