// VERB-02 — the opening hauler raid is already happening; it does not wait for accept.
// Done check: no offer choice and no pass-on-timeout; the fight is in the sky.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import encounter344, { runtime } from '../src/data/encounters/344-opening-hauler-raid.js';

function makeHarness(seed = 4242) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  for (const name of ['encounter:choiceOffered', 'encounter:spawned', 'encounter:resolved', 'encounter:choose']) {
    bus.on(name, (p) => events.push({ name, payload: p }));
  }
  return { sim, state, bus, events };
}

function fireRaid(h) {
  const zones = zonesForSector('sector_helios_prime');
  const plan = planEncounters(h.sim.state.meta.seed, 'sector_helios_prime', 0, zones);
  const raidPlan = plan.find((it) => it.shapeId === 'opening_hauler_raid');
  assert.ok(raidPlan, 'day-0 plan must include the opening hauler raid');
  const dir = h.state.encounterDirector;
  dir.pending = [{ ...raidPlan, sectorId: 'sector_helios_prime', dueAt: 0, defers: 0 }];
  dir.pressure.combat = 30;
  h.sim.runTicks(60);
  const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
  assert.ok(live, 'the raid must fire');
  return live;
}

test('the encounter shape carries no choice card at all', () => {
  assert.equal(encounter344.choices, undefined, '015 must not author choices');
  assert.equal(encounter344.timeoutChoice, undefined, '015 must not author a timeout choice');
  assert.equal(typeof runtime.choose, 'undefined', 'the runtime must not answer choices');
});

test('fire spawns the raid with no offer and every raider already committed to the hauler', () => {
  const h = makeHarness();
  const live = fireRaid(h);
  assert.equal(live.phase, 'conflict');

  assert.ok(!h.events.some((e) => e.name === 'encounter:choiceOffered'),
    'no choice offer may be emitted — the raid does not wait for accept');

  const hauler = live.ids.map((id) => h.state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => h.state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');
  assert.ok(hauler, 'a hauler must be spawned');
  assert.ok(raiders.length >= 1, 'raiders must be spawned');

  for (const r of raiders) {
    assert.equal(r.data.combat && r.data.combat.targetId, hauler.id,
      'each raider opens with the hauler as its committed focus target');
    assert.equal(r.data.ai.targetId, hauler.id,
      'each raider opens with the hauler as its ai target');
    assert.equal(isHostileForAI(h.state, r, hauler), true,
      'thief first-fire keeps the raider->hauler attack sanctioned');
  }
});

test('the deadline resolves raid_over with no pass choice and leaves the cast in the world', () => {
  const h = makeHarness();
  const live = fireRaid(h);
  const castIds = live.ids.slice();
  assert.ok(castIds.length >= 2);

  h.state.simTime = live.deadlineAt + 1;
  h.sim.runTicks(120);

  assert.equal(live.phase, 'done');
  assert.equal(live.outcome, 'raid_over');
  assert.ok(!h.events.some((e) => e.name === 'encounter:choose'),
    'no choice may be consumed at the deadline — there is no pass-on-timeout');
  assert.equal(live.offerConsumed, undefined);

  // VERB-01 contract preserved: the released ships remain ordinary world entities.
  for (const id of castIds) {
    const e = h.state.entities.get(id);
    assert.ok(e && e.alive !== false, `cast member ${id} must still be in the world`);
    assert.equal(e.data && e.data.despawnAt, undefined,
      'released cast must not carry the resolve straggler despawn stamp');
  }
});
