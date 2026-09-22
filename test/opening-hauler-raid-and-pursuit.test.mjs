import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { authorizeAIEngagement, isHostileForAI } from '../src/ai/engagementAuthority.js';
import { ActivityKind } from '../src/ai/doctrine.js';
import { pirateDoctrineById } from '../src/data/pirateDoctrines.js';

function makeHarness(opts = {}) {
  const sectorId = opts.sectorId || 'sector_helios_prime';
  const sim = createSimulation({ seed: opts.seed || 101, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: opts.playerPos || { x: 180, z: 330 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:telegraph', (p) => events.push({ name: 'telegraph', payload: p }));
  bus.on('encounter:spawned', (p) => events.push({ name: 'spawned', payload: p }));
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('encounter:patrolIntervened', (p) => events.push({ name: 'patrolIntervened', payload: p }));
  bus.on('encounter:hostileCommitted', (p) => events.push({ name: 'hostileCommitted', payload: p }));
  bus.on('comms:log', (p) => events.push({ name: 'comms', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));

  return { sim, state, bus, player, events };
}

test('Day 0 schedule in sector_helios_prime plans opening_hauler_raid within minutes', () => {
  const zones = zonesForSector('sector_helios_prime');
  const plan = planEncounters(42, 'sector_helios_prime', 0, zones);
  const raid = plan.find((it) => it.shapeId === 'opening_hauler_raid');

  assert.ok(raid, 'opening_hauler_raid must be planned on Day 0 in Helios Prime');
  assert.equal(raid.tier, 'minor');
  assert.equal(raid.deck, 'combat');
  assert.ok(raid.delay >= 60 && raid.delay <= 360, `raid delay (${raid.delay}) must be within opening 1-6 minutes`);

  const hauler = raid.ships.find((s) => s.role === 'hauler');
  const raiders = raid.ships.filter((s) => s.role === 'raider');

  assert.ok(hauler, 'planned raid must include a civilian hauler');
  assert.equal(hauler.archetype, 'mule_trader');
  assert.equal(hauler.factionId, 'faction_mts');
  assert.equal(hauler.team, 2);
  assert.equal(hauler.passive, true);

  assert.ok(raiders.length >= 1, 'planned raid must include at least one raider');
  for (const r of raiders) {
    assert.equal(r.doctrine, 'thief');
    assert.equal(r.factionId, 'faction_reach');
  }
});

test('Pirate doctrines populate firstFireAgainst and authorize AI attack on hauler without player', () => {
  const thiefDoc = pirateDoctrineById('thief');
  assert.ok(thiefDoc, 'thief doctrine must exist');
  assert.equal(thiefDoc.firstFire, true);
  assert.ok(thiefDoc.firstFireAgainst.includes('faction_mts'), 'thief firstFireAgainst must include faction_mts');
  assert.ok(thiefDoc.firstFireAgainst.includes('faction_dmc'), 'thief firstFireAgainst must include faction_dmc');
  assert.ok(thiefDoc.firstFireAgainst.includes('faction_free'), 'thief firstFireAgainst must include faction_free');

  const { state } = makeHarness();
  const hauler = {
    id: 10,
    type: 'ship',
    team: 2,
    factionId: 'faction_mts',
    alive: true,
    data: { ai: { passive: true } },
  };
  const raider = {
    id: 11,
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    alive: true,
    doctrine: 'thief',
    data: {
      ai: {
        doctrine: 'thief',
        factionPresenceDoctrine: thiefDoc.factionPresenceDoctrine,
      },
    },
  };
  state.entities.set(hauler.id, hauler);
  state.entities.set(raider.id, raider);

  assert.equal(isHostileForAI(state, raider, hauler), true, 'raider must first-fire on MTS hauler');
  assert.equal(authorizeAIEngagement({ state, self: hauler, target: raider }).ok, false, 'passive hauler cannot engage');
});

test('Opening hauler raid runtime lifecycle: choices, defense, and payout', () => {
  const { sim, state, bus, events } = makeHarness();
  const zones = zonesForSector('sector_helios_prime');
  const plan = planEncounters(42, 'sector_helios_prime', 0, zones);
  const raidPlan = plan.find((it) => it.shapeId === 'opening_hauler_raid');
  assert.ok(raidPlan);

  const dir = state.encounterDirector;
  const item = { ...raidPlan, dueAt: 0, defers: 0 };
  dir.pending = [item];
  dir.pressure.combat = 30; // satisfies pressureCost 20

  sim.runTicks(60); // 1 sec tick - triggers _pump and fire()

  const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
  assert.ok(live, 'encounter must be live');
  assert.equal(live.phase, 'conflict');

  const haulerEnts = live.ids.map((id) => state.entities.get(id)).filter((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiderEnts = live.ids.map((id) => state.entities.get(id)).filter((e) => e && e.data?.ai?.encounterRole === 'raider');

  assert.equal(haulerEnts.length, 1, 'one hauler spawned');
  assert.ok(raiderEnts.length >= 1, 'raiders spawned');
  assert.equal(haulerEnts[0].team, 2, 'hauler is on civilian team 2');
  assert.ok(raiderEnts[0].data.ai.factionPresenceDoctrine.firstFireAgainst.includes('faction_mts'));

  // Player defends hauler: kill the raiders
  for (const r of raiderEnts) {
    bus.emit('entity:killed', { id: r.id, killerId: state.playerId, pos: r.pos });
    r.alive = false;
  }

  sim.runTicks(60); // tick runtime

  assert.equal(live.phase, 'done', 'encounter resolves once raiders are down');
  assert.equal(live.outcome, 'defended');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_mts' && e.payload.delta > 0),
    'MTS reputation awarded for protecting hauler');
});

test('Opening raid lands within three minutes inside ~two screen-depths on seeds 4242 and 8008', () => {
  // §22 A1 closing rule: one fixture on the canonical seeds asserts spawn range, time, and the
  // commitment event. The player sits at the new-game spawn (sector origin) while the day-0 plan
  // runs; the gated fire must deliver the fight to the player, not the other way round.
  const SCREEN_DEPTH_WU = 115;
  for (const seed of [4242, 8008]) {
    const { sim, state, events } = makeHarness({ seed, playerPos: { x: 0, z: 0 } });
    const zones = zonesForSector('sector_helios_prime');
    const plan = planEncounters(seed, 'sector_helios_prime', 0, zones);
    const raidPlan = plan.find((it) => it.shapeId === 'opening_hauler_raid');
    assert.ok(raidPlan, `seed ${seed}: day-0 plan must include the opening hauler raid`);
    assert.ok(raidPlan.delay <= 180,
      `seed ${seed}: hauler must be under attack within three minutes (delay ${raidPlan.delay.toFixed(1)}s)`);

    const dir = state.encounterDirector;
    dir.pending = [{ ...raidPlan, dueAt: raidPlan.delay, defers: 0 }];
    dir.pressure.combat = 30; // satisfies pressureCost 20
    state.simTime = raidPlan.delay + 1;
    sim.runTicks(120); // pump + fire + spawn ticks

    const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
    assert.ok(live, `seed ${seed}: the raid must fire while the player is in reach of the lane`);

    // The commitment event: the encounter committed its squad in the world.
    const spawned = events.find((e) => e.name === 'spawned' && e.payload.encounterId === live.id);
    assert.ok(spawned, `seed ${seed}: encounter:spawned is the commitment event`);

    const playerPos = state.entities.get(state.playerId).pos;
    const haulerEnt = live.ids.map((id) => state.entities.get(id))
      .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
    const raiderEnts = live.ids.map((id) => state.entities.get(id))
      .filter((e) => e && e.data?.ai?.encounterRole === 'raider');
    assert.ok(haulerEnt, `seed ${seed}: a hauler must be spawned`);
    assert.ok(raiderEnts.length >= 1, `seed ${seed}: raiders must be spawned`);

    const haulerDist = Math.hypot(haulerEnt.pos.x - playerPos.x, haulerEnt.pos.z - playerPos.z);
    assert.ok(haulerDist <= 2 * SCREEN_DEPTH_WU + 30,
      `seed ${seed}: hauler under attack must be inside ~2 screen-depths (got ${haulerDist.toFixed(0)} WU)`);
    for (const r of raiderEnts) {
      const d = Math.hypot(r.pos.x - playerPos.x, r.pos.z - playerPos.z);
      assert.ok(d <= 2 * SCREEN_DEPTH_WU + 320,
        `seed ${seed}: raider ${d.toFixed(0)} WU out — the fight must stay near the player`);
      assert.equal(isHostileForAI(state, r, haulerEnt), true,
        `seed ${seed}: raiders must actually be committed to attacking the hauler`);
    }
  }
});

test('the guaranteed raid fires during the onboarding rail and survives the day-0 replan', () => {
  // The default new-game route holds onboarding.active through a multi-minute verb rail and the
  // day:tick replan rebuilds pending at DAY_SECONDS — either one used to erase the promise.
  for (const seed of [4242, 8008]) {
    const { sim, state, events } = makeHarness({ seed, playerPos: { x: 0, z: 0 } });
    state.onboarding = { active: true, finished: false };

    const zones = zonesForSector('sector_helios_prime');
    const plan = planEncounters(seed, 'sector_helios_prime', 0, zones);
    const raidPlan = plan.find((it) => it.shapeId === 'opening_hauler_raid');
    const otherPlan = plan.find((it) => it.shapeId !== 'opening_hauler_raid');
    assert.ok(raidPlan, `seed ${seed}: day-0 plan must include the opening hauler raid`);

    const dir = state.encounterDirector;
    const raidItem = { ...raidPlan, sectorId: 'sector_helios_prime', dueAt: raidPlan.delay, defers: 0 };
    const otherItem = otherPlan
      ? { ...otherPlan, sectorId: 'sector_helios_prime', dueAt: 0, defers: 0 } : null;
    dir.pending = otherItem ? [raidItem, otherItem] : [raidItem];
    dir.plannedKey = 'sector_helios_prime#0';
    dir.pressure.combat = 30;

    // The rail is still active at the raid's due time — it must fire anyway.
    state.simTime = raidPlan.delay + 1;
    sim.runTicks(120);
    const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
    assert.ok(live, `seed ${seed}: the raid must fire while the tutorial rail is active`);
    assert.ok(events.some((e) => e.name === 'spawned' && e.payload.encounterId === live.id),
      `seed ${seed}: commitment event fires inside the rail`);
    if (otherItem) {
      assert.ok(!Object.values(dir.live).some((l) => l.shapeId === otherItem.shapeId),
        `seed ${seed}: ordinary pending items still wait out the rail`);
    }

    // An unfired guarantee outlives the day boundary: replan carries it, drops ordinary rows.
    const sim2 = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
    const state2 = sim2.state;
    state2.mode = 'flight';
    state2.world.currentSectorId = 'sector_helios_prime';
    const player2 = sim2.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6,
    });
    state2.playerId = player2.id;
    const dir2 = state2.encounterDirector;
    const unfiredRaid = { ...raidPlan, sectorId: 'sector_helios_prime', dueAt: 900, defers: 0 };
    const staleMinor = otherItem ? { ...otherItem, sectorId: 'sector_helios_prime', dueAt: 900, defers: 0 } : null;
    dir2.pending = staleMinor ? [unfiredRaid, staleMinor] : [unfiredRaid];
    dir2.plannedKey = 'sector_helios_prime#0';
    state2.simTime = 605;
    sim2.bus.emit('day:tick');
    assert.ok(dir2.pending.includes(unfiredRaid),
      `seed ${seed}: the day:tick replan must carry the unfired guarantee`);
    if (staleMinor) {
      assert.ok(!dir2.pending.includes(staleMinor),
        `seed ${seed}: ordinary rows still replan from the new day seed`);
    }
  }
});

test('the authored delay window is never pushed past three minutes by nominal spacing', () => {
  // §22.2 seeds plus a sweep over the seeds where the spacing pass used to exceed the window.
  const zones = zonesForSector('sector_helios_prime');
  for (const seed of [4242, 8008, 7, 19, 33, 61, 77, 103, 141, 166]) {
    const plan = planEncounters(seed, 'sector_helios_prime', 0, zones);
    const raid = plan.find((it) => it.shapeId === 'opening_hauler_raid');
    assert.ok(raid, `seed ${seed}: the day-0 plan must include the opening hauler raid`);
    assert.ok(raid.delay <= 170,
      `seed ${seed}: authored window [60,170] must survive nominal spacing (got ${raid.delay.toFixed(1)}s)`);
  }
});

test('A hostile sitting on a non-fighting player in lawful space triggers patrol arrival in view without weakening pest', () => {
  const { sim, state, events } = makeHarness({ sectorId: 'sector_helios_prime' }); // security: 0.90
  const dir = state.encounterDirector;

  // Pest sitting at 380 WU standoff distance
  const pest = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: 400, z: 330 },
    vel: { x: 0, z: 0 },
    hull: 180,
    hullMax: 180,
    shield: 90,
    shieldMax: 90,
    radius: 12,
    data: {
      ai: {
        archetype: 'pirate',
        preferredRange: 380,
        targetId: state.playerId,
      },
      combat: { targetId: state.playerId },
    },
  });

  const initialHull = pest.hull;
  const initialShield = pest.shield;

  // 30 seconds pass: player does not fight, still within pursuit window
  for (let s = 0; s < 30; s++) {
    state.simTime = s;
    sim.runTicks(60);
  }
  assert.equal(events.filter((e) => e.name === 'patrolIntervened').length, 0,
    'patrol must not arrive before pursuit threshold (60s)');

  // Advance to 65 seconds without player fighting
  for (let s = 30; s < 65; s++) {
    state.simTime = s;
    sim.runTicks(60);
  }

  const patrolEvent = events.find((e) => e.name === 'patrolIntervened');
  assert.ok(patrolEvent, 'patrol must arrive in view for non-fighting player in lawful space');
  assert.equal(patrolEvent.payload.attackerId, pest.id);

  // Assert pest did NOT vanish and did NOT get weaker
  assert.equal(pest.alive, true, 'pest must not vanish');
  assert.equal(pest.hull, initialHull, 'pest hull must not decrease');
  assert.equal(pest.shield, initialShield, 'pest shield must not decrease');

  // Verify the spawned patrol
  const patrol = state.entities.get(patrolEvent.payload.patrolId);
  assert.ok(patrol, 'patrol entity must exist in world');
  assert.equal(patrol.data.ai.lawful, true);
  assert.equal(patrol.data.ai.securityTargetId, pest.id);
  assert.equal(patrol.data.ai.engagementTrigger, 'security_response');
  assert.equal(patrol.data.ai.roe, 'weapons_free');
  assert.equal(typeof patrol.data.ai.activity, 'object',
    'patrol activity must be a normalized object — a bare string revokes its fire authority');
  assert.equal(patrol.data.ai.activity.kind, ActivityKind.ATTACK_RUN);
  assert.equal(patrol.data.ai.activity.targetId, pest.id);

  // Distance to player must be in view (~420 WU)
  const distToPlayer = Math.hypot(patrol.pos.x - state.entities.get(state.playerId).pos.x,
                                  patrol.pos.z - state.entities.get(state.playerId).pos.z);
  assert.ok(distToPlayer >= 350 && distToPlayer <= 500, `patrol must arrive in view (~420 WU, got ${distToPlayer})`);

  // The intervention is only real if the responder can actually shoot — let its response window
  // arm, then run the same fail-closed authority gate the weapon pipeline uses.
  sim.runTicks(120);
  const verdict = authorizeAIEngagement({
    state, self: patrol, target: pest,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  });
  assert.equal(verdict.ok, true, `patrol must be authorized to fire on the pest (got ${verdict.reason})`);
});

test('A hostile sitting on a non-fighting player in lawless space commits to grabbing range without weakening pest', () => {
  const { sim, state, events } = makeHarness({ sectorId: 'sector_sker_haven' }); // security: 0.15 (anarchy/outlaw)
  const dir = state.encounterDirector;

  const pest = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: 300, z: 400 },
    vel: { x: 0, z: 0 },
    hull: 150,
    hullMax: 150,
    shield: 70,
    shieldMax: 70,
    radius: 10,
    data: {
      ai: {
        archetype: 'pest',
        preferredRange: 350,
        targetId: state.playerId,
        // The full fail-closed authority field set a real spawned hostile carries — the committed
        // pest must still pass the same gate the weapon pipeline runs.
        motive: 'assigned_interdiction',
        engagementTrigger: 'authorized_hostile_spawn',
        zoneId: 'sector_hostile_zone',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 1,
      },
      combat: { targetId: state.playerId },
    },
  });

  const initialHull = pest.hull;
  const initialShield = pest.shield;

  // Run 65 seconds of pursuit without player fighting
  for (let s = 0; s < 65; s++) {
    state.simTime = s;
    sim.runTicks(60);
  }

  const commitEvent = events.find((e) => e.name === 'hostileCommitted');
  assert.ok(commitEvent, 'hostile must commit to grabbing range in low-security space');
  assert.equal(commitEvent.payload.attackerId, pest.id);
  assert.equal(commitEvent.payload.preferredRange, 60);

  // Assert pest did NOT vanish and did NOT get weaker
  assert.equal(pest.alive, true, 'pest must not vanish');
  assert.equal(pest.hull, initialHull, 'pest hull must not decrease');
  assert.equal(pest.shield, initialShield, 'pest shield must not decrease');

  // Assert AI now closes into grabbing range
  assert.equal(pest.data.ai.preferredRange, 60, 'preferredRange must collapse to 60 WU (touchable)');
  assert.equal(pest.data.ai.grabbingRange, true);
  assert.equal(pest.data.ai.combatDoctrineId, 'brawler_commit');

  // The commitment must be a normalized activity object — a bare 'attack_run' string fails
  // normalizeActivity and silently disarms the pest mid-charge.
  const act = pest.data.ai.activity;
  assert.equal(typeof act, 'object', 'committed activity must be a normalized object, not a bare string');
  assert.equal(act.kind, ActivityKind.ATTACK_RUN);
  assert.equal(act.targetId, state.playerId);

  // The committed pest keeps its fire authority. simTime past the 10-minute first-session window
  // skips the ownership-slot gate, which tacticalAI populates from decision batches — out of scope
  // for this fixture.
  state.simTime = 601;
  sim.runTicks(120);
  const verdict = authorizeAIEngagement({
    state, self: pest, target: state.entities.get(state.playerId),
    objectiveReason: 'combat_doctrine:brawler_commit:commit',
  });
  assert.equal(verdict.ok, true, `committed pest must keep fire authority (got ${verdict.reason})`);
});

test('Player actively fighting resets pursuit timer so resolution does not prematurely trigger', () => {
  const { sim, state, bus, events } = makeHarness({ sectorId: 'sector_helios_prime' });
  const dir = state.encounterDirector;

  const pest = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: 400, z: 330 },
    vel: { x: 0, z: 0 },
    hull: 180,
    hullMax: 180,
    data: {
      ai: { targetId: state.playerId },
      combat: { targetId: state.playerId },
    },
  });

  // Advance 40 seconds
  for (let s = 0; s < 40; s++) {
    state.simTime = s;
    sim.runTicks(60);
  }

  // Player lands damage on pest at t=40
  bus.emit('combat:damage', { attackerId: state.playerId, targetId: pest.id, amount: 25 });

  // Advance another 30 seconds (total 70s, but only 30s since last damage)
  for (let s = 40; s < 70; s++) {
    state.simTime = s;
    sim.runTicks(60);
  }

  assert.equal(events.filter((e) => e.name === 'patrolIntervened').length, 0,
    'patrol must not intervene while player is fighting back');
  assert.equal(events.filter((e) => e.name === 'hostileCommitted').length, 0,
    'grabbing range must not trigger while player is fighting back');
});
