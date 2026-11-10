import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS } from '../src/data/encounters.js';
import { planEncounterShape } from '../src/systems/encounterDirector.js';

const zone = {
  id: 'motive_fixture',
  name: 'Motive Fixture',
  type: 'outlaw_zone',
  center: { x: 0, z: 0 },
  radius: 400,
  danger: 0.5,
};

test('planned hostile encounters carry explicit, distinct motives', () => {
  const expectations = {
    pirate_toll: ['cargo_extortion', 'demand_pending'],
    bounty_hunter: ['bounty_collection', 'active_bounty_contract'],
    named_hunter: ['personal_vendetta', 'named_hunter_grudge'],
  };
  for (const [shapeId, [motive, trigger]] of Object.entries(expectations)) {
    const plan = planEncounterShape(ENCOUNTERS[shapeId], zone, 'sector_ashfall_reach', 1, 1, () => 0.5);
    assert.equal(plan.motive, motive, `${shapeId} motive`);
    assert.equal(plan.engagementTrigger, trigger, `${shapeId} trigger`);
  }
  assert.notEqual(ENCOUNTERS.bounty_hunter.motive, ENCOUNTERS.pirate_toll.motive);
  assert.notEqual(ENCOUNTERS.named_hunter.motive, ENCOUNTERS.pirate_toll.motive);
});
