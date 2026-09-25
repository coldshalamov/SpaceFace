import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS, ENCOUNTER_BARKS, encountersForZoneTypes, tollAmountFor } from '../src/data/encounters.js';
import { ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';

const IDS = ['foreman_lane_toll', 'foreman_wreck_herd', 'foreman_claim_breaker'];
const byId = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const foreman = byId.get('mirrorjaw_foreman');

test('foreman open-route package: three live placements anchor the heavy', () => {
  assert.ok(foreman, 'mirrorjaw_foreman role exists');
  for (const id of IDS) {
    const enc = ENCOUNTERS[id];
    assert.ok(enc, `${id} is in the catalog`);
    assert.equal(enc.squad.anchorArchetype, 'mirrorjaw_foreman', `${id} anchors the foreman`);
    assert.ok(byId.has(enc.squad.anchorArchetype), `${id} anchor is a live archetype`);
    for (const arch of enc.squad.archetypes) {
      assert.ok(byId.has(arch), `${id} unknown escort archetype ${arch}`);
    }
    assert.ok(enc.squad.size[0] >= 2 && enc.squad.size[1] <= 4, `${id} squad stays a readable fight`);
    assert.ok(ENCOUNTER_BARKS[enc.bark], `${id} bark ${enc.bark} is live`);
    assert.equal(Object.isFrozen(enc), true, `${id} frozen`);
    assert.equal(Object.isFrozen(enc.shape), true, `${id} shape frozen`);
  }
  const orders = ENCOUNTER_MODULES.map((m) => m.encounterOrder);
  assert.equal(new Set(orders).size, orders.length, 'encounterOrder unique with new modules');
  for (const n of [337, 338, 339]) {
    assert.ok(orders.includes(n), `order ${n} registered`);
  }
});

test('foreman placements schedule in their zones and the toll prices honestly', () => {
  const lane = encountersForZoneTypes(new Set(['trade_lane']));
  assert.ok(lane.some((e) => e.id === 'foreman_lane_toll'), 'lane toll schedules on trade lanes');
  const ambushLane = encountersForZoneTypes(new Set(['ambush_lane']));
  assert.ok(ambushLane.some((e) => e.id === 'foreman_lane_toll'), 'lane toll schedules on ambush lanes');
  const field = encountersForZoneTypes(new Set(['derelict_field']));
  assert.ok(field.some((e) => e.id === 'foreman_wreck_herd'), 'wreck herd schedules in derelict fields');
  const belt = encountersForZoneTypes(new Set(['mining_belt']));
  assert.ok(belt.some((e) => e.id === 'foreman_claim_breaker'), 'claim breaker schedules in mining belts');

  const toll = ENCOUNTERS.foreman_lane_toll;
  assert.equal(toll.script, 'toll');
  assert.deepEqual(toll.choices.map((c) => c.id), ['pay', 'refuse', 'run']);
  assert.ok(toll.choices.some((c) => c.id === toll.timeoutChoice), 'timeoutChoice is a live choice');
  // A 2000cr hold prices a 240cr tithe: meaningful, never the whole run.
  assert.equal(tollAmountFor(2000), 240);
  assert.equal(tollAmountFor(0), 50, 'empty hold still prices the floor');
});

test('foreman role reads: telegraph, slow turn, counterplay, and pinned zero pay', () => {
  assert.equal(foreman.telegraph.cue, 'engine_flare');
  assert.equal(foreman.telegraph.bark, 'warn');
  // INF-025 made prow/stern directional armor the counterplay the telegraph teaches; the slow
  // turn it exploits is still pinned directly by turnRate below.
  assert.match(foreman.telegraph.line, /prow/);
  assert.match(foreman.telegraph.line, /stern/);
  assert.match(foreman.counterHint, /swarmer/);
  assert.equal(foreman.mass, 420, 'moving terrain, not a shove toy');
  assert.ok(foreman.turnRate < 1.0, 'slowest-turn heavy in its class');
  assert.ok(foreman.weapons.some((w) => w.id === 'wpn_concussion_cannon_m'), 'concussion pressure is live');
  // The survival zero-economy boundary owns this row's pay (see pq-133-04-foundry). Pricing
  // the row directly leaks campaign credits into the arena; escorts carry the fight's pay.
  assert.equal(foreman.bountyCr, 0);
  assert.equal(foreman.loot, null);
  for (const id of IDS) {
    for (const arch of ENCOUNTERS[id].squad.archetypes) {
      assert.ok(byId.get(arch).bountyCr > 0, `${id} escort ${arch} pays a bounty`);
    }
  }
});

test('foreman TTK floor keeps a starter ship honest without a wall', () => {
  const laser = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s');
  const ehp = foreman.hull + foreman.shield;
  const floorS = ehp / laser.dps;
  // 20s of uninterrupted starter-laser fire, before armor: a committed kill, never a
  // one-pass delete — and the intended fast answer stays physical (dodge the charge,
  // work the turn, throw a swarmer), not a bigger number.
  assert.ok(floorS >= 15 && floorS <= 30, `unmitigated TTK floor ${floorS.toFixed(1)}s out of band`);
});
