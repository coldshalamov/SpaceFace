import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  VERB_MOD_KEYS,
  verifyVerbKeyConsumers,
  classifyModule,
  classifyWeapon,
} from '../scripts/check-progression-verb-audit.mjs';
import {
  simulateTenHourEconomyCurve,
} from '../src/systems/economy.js';

// Ten distinct purchases corresponding to ten hourly steps in the tech curve,
// starting with Swing Drive inside the first haul (tech_drive_tuning / mod_swing_drive_m).
export const TEN_VERB_PROGRESSION_PURCHASES = Object.freeze([
  {
    hour: 1,
    techId: 'tech_drive_tuning',
    itemId: 'mod_swing_drive_m',
    verbKey: 'swingDrive',
    verbLabel: 'Pendulum dash through a taut line (Swing Drive)',
    price: 1500, // Tech research purchase inside first haul
  },
  {
    hour: 2,
    techId: 'tech_tractor_systems',
    itemId: 'mod_loot_magnet_s',
    verbKey: 'lootMagnetRange',
    verbLabel: 'Draw loose loot shards into attraction range',
    price: 1200,
  },
  {
    hour: 3,
    techId: 'tech_attack_topology',
    itemId: 'mod_twin_mount',
    verbKey: 'volley',
    verbLabel: 'Twin-mount volley attack trait rig',
    price: 3333,
  },
  {
    hour: 4,
    techId: 'tech_kinetic_drivers',
    itemId: 'wpn_concussion_cannon_s',
    verbKey: 'control_gun',
    verbLabel: 'Concussion cannon impulse push / control gun',
    price: 3667,
  },
  {
    hour: 5,
    techId: 'tech_guided_ordnance',
    itemId: 'wpn_vector_mine_m',
    verbKey: 'vector_mine',
    verbLabel: 'Deployable vector mine hazard',
    price: 4000,
  },
  {
    hour: 6,
    techId: 'tech_deflector_theory',
    itemId: 'mod_decoy_buoy_s',
    verbKey: 'countermeasure',
    verbLabel: 'Deployable decoy buoy countermeasure',
    price: 1100,
  },
  {
    hour: 7,
    techId: 'tech_impulse_ballistics',
    itemId: 'mod_charge_vector_rack',
    verbKey: 'impulseChargeCapacity',
    verbLabel: 'Impulse charge carry and throw capacity',
    price: 7500,
  },
  {
    hour: 8,
    techId: 'tech_drone_control',
    itemId: 'mod_drone_bay_l',
    verbKey: 'droneBay',
    verbLabel: 'Autonomous combat/repair drone bay',
    price: 9000,
  },
  {
    hour: 9,
    techId: 'tech_plasma_dynamics',
    itemId: 'wpn_emp_disruptor_m',
    verbKey: 'emp_disruptor',
    verbLabel: 'Shield-bypassing subsystem EMP disruptor',
    price: 10500,
  },
  {
    hour: 10,
    techId: 'tech_graviton_drives',
    itemId: 'wpn_gravity_well_m',
    verbKey: 'gravity_well',
    verbLabel: 'Singularity gravity well deployment',
    price: 9000,
  },
]);

test('Wave B8: Progression verb curve grants 10 distinct verbs across 10 hours with verified consumers within B1 income curve', () => {
  // 1. Consumer evidence verification: verifyVerbKeyConsumers() must be clean
  const outcome = verifyVerbKeyConsumers();
  assert.deepEqual(outcome.errors, [], `verb consumer verification must be error-free: ${outcome.errors.join(', ')}`);

  // 2. Exactly 10 hourly purchases
  assert.equal(TEN_VERB_PROGRESSION_PURCHASES.length, 10);

  const seenVerbs = new Set();
  const techMap = new Map(TECH_NODES.map((t) => [t.id, t]));
  const moduleMap = new Map(MODULES.map((m) => [m.id, m]));
  const weaponMap = new Map(WEAPONS.map((w) => [w.id, w]));

  let cumulativeCost = 0;
  const cumulativeCostsByHour = [];

  for (let i = 0; i < TEN_VERB_PROGRESSION_PURCHASES.length; i++) {
    const item = TEN_VERB_PROGRESSION_PURCHASES[i];
    assert.equal(item.hour, i + 1, `purchase #${i + 1} must match hour ${i + 1}`);

    // Verify tech node exists in tech tree
    const tech = techMap.get(item.techId);
    assert.ok(tech, `tech node ${item.techId} must exist in tech tree`);
    assert.equal(tech.cost.credits, item.price, `tech node ${item.techId} credit cost must match purchase price`);

    // Verify item is unlocked by this tech node
    const unlocked = (tech.unlocks?.modules || []).concat(tech.unlocks?.weapons || []);
    assert.ok(
      unlocked.includes(item.itemId),
      `tech node ${item.techId} must unlock item ${item.itemId}`,
    );

    // Verify item classification is 'verb'
    if (moduleMap.has(item.itemId)) {
      const mod = moduleMap.get(item.itemId);
      const classification = classifyModule(mod);
      assert.equal(classification.primary, 'verb', `module ${item.itemId} must classify as verb`);
    } else {
      const wpn = weaponMap.get(item.itemId);
      assert.ok(wpn, `weapon ${item.itemId} must exist`);
      const classification = classifyWeapon(wpn);
      assert.equal(classification.primary, 'verb', `weapon ${item.itemId} must classify as verb`);
    }

    // Verify distinct verbs
    assert.ok(!seenVerbs.has(item.verbKey), `hour ${item.hour} verb ${item.verbKey} must be a new verb, not a duplicate`);
    seenVerbs.add(item.verbKey);

    // First haul must be Swing Drive
    if (item.hour === 1) {
      assert.equal(item.itemId, 'mod_swing_drive_m');
      assert.equal(item.verbKey, 'swingDrive');
      const swingMod = moduleMap.get('mod_swing_drive_m');
      assert.ok(swingMod.shopOffers?.station_helios?.price > 0, 'Helios station offers Swing Drive at first-haul price');
    }

    cumulativeCost += item.price;
    cumulativeCostsByHour.push(cumulativeCost);
  }

  assert.equal(seenVerbs.size, 10, 'must have 10 distinct verbs across 10 hours');

  // 3. Verify prices sum inside the income curve from B1 (seeds 4242 and 8008)
  for (const seed of [4242, 8008]) {
    const curve = simulateTenHourEconomyCurve({ seed });
    assert.ok(curve.archetypes.length > 0);

    for (const arch of curve.archetypes) {
      let cumulativeFaucet = 0;
      for (let h = 1; h <= 10; h++) {
        const hourData = arch.hours[h - 1];
        assert.equal(hourData.hour, h);
        cumulativeFaucet += hourData.faucet;

        const costAtH = cumulativeCostsByHour[h - 1];
        const totalEarned = 5000 + cumulativeFaucet; // Start capital + cumulative faucets
        assert.ok(
          costAtH <= totalEarned,
          `archetype ${arch.id} seed ${seed} at hour ${h}: cumulative verb cost (${costAtH} cr) must sum inside earned income (${totalEarned} cr)`,
        );
      }
    }
  }
});
