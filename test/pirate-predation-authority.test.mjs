// PQ-047 bounded pirate predation production-route regressions.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeAIEngagement,
  isAuthorizedPredationRelation,
  isHostileForAI,
} from '../src/ai/engagementAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const SECTOR_ID = 'sector_tethys_junction';
const ENCOUNTER_ID = 'pq047:curtain-convoy';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });

function boot(seed = 47001) {
  // Production ownership order for this seam: spawn admission precedes encounter materialization.
  // Tactical target/fire authorization is exercised directly through its final exported oracle.
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: ANCHOR.x - 900, z: ANCHOR.z + 200 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 8,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const events = { telegraph: [], engaged: [], cleared: [], resolved: [] };
  bus.on('encounter:predationTelegraph', (payload) => events.telegraph.push(payload));
  bus.on('encounter:predationEngaged', (payload) => events.engaged.push(payload));
  bus.on('encounter:predationCleared', (payload) => events.cleared.push(payload));
  bus.on('encounter:resolved', (payload) => events.resolved.push(payload));
  return {
    sim,
    state,
    bus,
    player,
    events,
    director: sim.registry.get('encounterDirector'),
  };
}

function bootTactical(seed = 47009) {
  const tactical = createTacticalAISystem();
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector, aiPorts, tactical] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { x: ANCHOR.x - 900, z: ANCHOR.z + 200 },
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  return {
    sim, state, bus, player, tactical,
    events: { telegraph: [], engaged: [], cleared: [], resolved: [] },
    director: sim.registry.get('encounterDirector'),
  };
}

function fire(harness, encounterId = ENCOUNTER_ID) {
  const result = harness.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy',
    encounterId,
    sectorId: SECTOR_ID,
    anchor: { ...ANCHOR },
    zoneType: 'trade_lane',
    zoneRadius: 800,
    force: true,
  });
  assert.deepEqual(result, { ok: true, encounterId });
  const live = harness.state.encounterDirector.live[encounterId];
  assert.ok(live, 'authored route remains live after materialization');
  return live;
}

function actors(harness, live) {
  const entities = harness.state.entities;
  const haulers = live.ids
    .filter((id) => live.roles[id] === 'hauler')
    .map((id) => entities.get(id))
    .filter(Boolean)
    .sort(compareIds);
  const raiders = live.ids
    .filter((id) => live.roles[id] === 'raider')
    .map((id) => entities.get(id))
    .filter(Boolean)
    .sort(compareIds);
  return {
    haulers,
    raiders,
    target: entities.get(live.data.predationTargetId),
    raider: entities.get(live.data.predationRaiderId),
  };
}

function compareIds(a, b) {
  const an = Number(a.id);
  const bn = Number(b.id);
  return Number.isFinite(an) && Number.isFinite(bn) && an !== bn
    ? an - bn
    : String(a.id).localeCompare(String(b.id));
}

function activate(harness, live) {
  const waitS = Math.max(2.1, live.data.predationNoFireUntil - harness.state.simTime + 1.1);
  harness.sim.runTicks(Math.ceil(waitS * 60));
  assert.equal(live.data.predationStatus, 'active', 'director opens the exact relation after its response window');
  return actors(harness, live);
}

function authorize(harness, raider, target, overrides = {}) {
  const doctrineId = raider.data.ai.combatDoctrineId;
  const phase = doctrineId === 'ranged_disengager' ? 'fire_window' : 'strike';
  return authorizeAIEngagement({
    state: harness.state,
    self: raider,
    target,
    tick: harness.state.tick,
    objectiveReason: `combat_doctrine:${doctrineId}:${phase}`,
    ...overrides,
  });
}

test('curtain route materializes one manifest carrier plus authored raiders with stable exact selection', () => {
  const harness = boot();
  const live = fire(harness);
  const { haulers, raiders, target, raider } = actors(harness, live);

  assert.equal(haulers.length, 1, 'the ignored civilian branch is now the physical carrier');
  assert.ok(raiders.length >= 2, 'the authored hostile squad materializes as raiders, not haulers');
  assert.equal(target, haulers[0], 'stable carrier ordering selects the lowest live identity');
  assert.equal(raiders[0].data.lootTableId, 'pd_screen_escort', 'the readable PD controller anchors the curtain');
  assert.notEqual(raider, raiders[0], 'the PD controller remains the curtain instead of attacking its protected charge');
  assert.equal(raider, raiders.find((candidate) => candidate.data.lootTableId !== 'pd_screen_escort'),
    'stable ordering selects the first offensive raider for the theft objective');
  assert.equal(raider.data.ai.combatDoctrineId, 'interceptor_flyby',
    'the selected raider gets the authored first-fire attack run while the PD anchor keeps screening');
  assert.equal(target.team, 2);
  assert.equal(target.data.ai.encounterRole, 'hauler');
  assert.equal(target.data.predationRole, 'manifest_carrier');
  assert.ok(target.data.cargoManifest.lines.some((line) => line.qty > 0));
  assert.deepEqual(target.data.freightCustody, {
    status: 'carrier',
    carrierId: target.id,
    carrierIdentityKey: `${live.id}:hauler:0`,
    encounterId: live.id,
    manifestId: target.data.cargoManifest.manifestId,
  });

  assert.equal(harness.events.telegraph.length, 1);
  assert.equal(harness.events.telegraph[0].targetId, target.id);
  assert.equal(harness.events.telegraph[0].raiderId, raider.id);
  assert.equal(harness.events.telegraph[0].motive, 'cargo_raid');
  assert.equal(harness.events.telegraph[0].approachTelegraph, 'pd_curtain_closing');
  assert.ok(harness.events.telegraph[0].responseWindowS >= 1);
  assert.ok(harness.events.telegraph[0].deadlineAt > harness.events.telegraph[0].noFireUntil);
  assert.equal(raider.data.ai.predationObjective.targetIdentityKey, target.data.predationIdentityKey);
  assert.equal(raider.data.ai.passive, true);
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, target), false);
  assert.deepEqual(authorize(harness, raider, target), { ok: false, reason: 'passive' });
  assert.equal(isHostileForAI(harness.state, raider, harness.player), false, 'telegraph never targets the player');
});

test('predation admission waits for carrier, PD curtain, and offensive raider without side effects', () => {
  const harness = boot(47010);
  const budget = harness.sim.helpers.spawnBudget;
  const heldOwner = 'fixture:predation-floor';
  assert.equal(budget.request(budget.max() - 2, heldOwner), budget.max() - 2);
  const beforeEntityIds = [...harness.state.entities.keys()];
  const beforeFizzle = harness.state.encounterDirector.stats.fizzled;
  const request = (encounterId) => harness.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  });

  assert.deepEqual(request(`${ENCOUNTER_ID}:cap-two`), { ok: false, reason: 'spawn_cap' });
  assert.deepEqual([...harness.state.entities.keys()], beforeEntityIds, 'rejection spawns no partial premise');
  assert.equal(harness.state.encounterDirector.stats.fizzled, beforeFizzle, 'rejection is not a fired/fizzled encounter');
  assert.equal(harness.state.encounterDirector.cooldowns.curtain_convoy, undefined, 'rejection cannot consume cooldown');
  assert.equal(budget.current(), budget.max() - 2, 'rejection retains only the fixture reservation');

  assert.equal(budget.releaseSome(heldOwner, 1), 1);
  const admittedId = `${ENCOUNTER_ID}:cap-three`;
  assert.deepEqual(request(admittedId), { ok: true, encounterId: admittedId });
  const live = harness.state.encounterDirector.live[admittedId];
  const { haulers, raiders, raider } = actors(harness, live);
  assert.equal(haulers.length, 1);
  assert.equal(raiders.length, 2);
  assert.ok(raiders.some((candidate) => candidate.data.lootTableId === 'pd_screen_escort'));
  assert.notEqual(raider.data.lootTableId, 'pd_screen_escort');
});

test('response expiry opens only the selected raider-to-manifest relation and remains tick-idempotent', () => {
  const harness = boot(47002);
  const live = fire(harness);
  const { haulers, raiders, target, raider } = activate(harness, live);

  assert.equal(harness.events.engaged.length, 1);
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, target), true);
  assert.equal(isHostileForAI(harness.state, raider, target), true);
  assert.deepEqual(authorize(harness, raider, target), { ok: true, reason: 'authorized' });
  assert.equal(isHostileForAI(harness.state, target, raider), false, 'the exception is directional');
  assert.equal(isHostileForAI(harness.state, raider, harness.player), false, 'selected raider cannot switch to the player');
  const originalMotive = raider.data.ai.motive;
  const originalTrigger = raider.data.ai.engagementTrigger;
  raider.data.ai.retaliationTargetId = harness.player.id;
  raider.data.ai.motive = 'self_defense';
  raider.data.ai.engagementTrigger = 'player_attack';
  assert.equal(isHostileForAI(harness.state, raider, harness.player), false,
    'active predation is the complete hostility set even if a retaliation flag appears');
  assert.deepEqual(authorize(harness, raider, harness.player), {
    ok: false,
    reason: 'predation_relation_stale',
  });
  delete raider.data.ai.retaliationTargetId;
  raider.data.ai.motive = originalMotive;
  raider.data.ai.engagementTrigger = originalTrigger;

  const innocent = harness.sim.spawn({
    type: 'ship', team: 2, pos: { x: target.pos.x + 20, z: target.pos.z },
    vel: { x: 0, z: 0 }, hull: 80, hullMax: 80, radius: 7,
    data: { ai: { passive: true }, intent: {} },
  });
  assert.equal(isHostileForAI(harness.state, raider, innocent), false, 'team 2 never becomes globally hostile');
  assert.equal(haulers.every((carrier) => carrier === target), true);
  for (const standby of raiders.filter((candidate) => candidate !== raider)) {
    assert.equal(standby.data.ai.passive, true);
    assert.equal(standby.data.ai.predationTargetId, undefined);
    assert.equal(isHostileForAI(harness.state, standby, target), false);
  }

  harness.sim.runTicks(180);
  assert.equal(harness.events.engaged.length, 1, 'later and duplicate cadence ticks cannot re-open the objective');
});

test('the shipped tactical route makes the offensive raider first-fire while the PD curtain holds', () => {
  const harness = bootTactical();
  const live = fire(harness, `${ENCOUNTER_ID}:tactical`);
  const { target, raider, raiders } = actors(harness, live);
  assert.notEqual(raider.data.lootTableId, 'pd_screen_escort');
  assert.equal(raider.data.ai.combatDoctrineId, 'interceptor_flyby');

  // The headless seam has no physics owner, so establish a clear authored ingress lane that does
  // not put the PD wingmate between the selected raider and carrier, then observe warning to fire.
  raider.pos.x = target.pos.x + 300;
  raider.pos.z = target.pos.z - 100;
  const noFireUntil = live.data.predationNoFireUntil;
  const maxTicks = Math.ceil(Math.max(3, noFireUntil - harness.state.simTime + 3) * 60);
  let firstFireAt = null;
  for (let tick = 0; tick < maxTicks && firstFireAt == null; tick++) {
    harness.sim.step();
    if (raider.data.intent?.fire === true) firstFireAt = harness.state.simTime;
  }

  const decision = harness.tactical.stack.lastResult.decisions
    .find((candidate) => candidate.entityId === raider.id);
  assert.equal(live.data.predationStatus, 'active');
  assert.ok(firstFireAt != null, 'the selected relation reaches the real SG-06 fire adapter');
  assert.ok(firstFireAt >= noFireUntil,
    `the authored warning remains non-firing until ${noFireUntil}, observed ${firstFireAt}`);
  assert.equal(decision.directive.focusTargetId, target.id);
  assert.notEqual(raiders.find((candidate) => candidate.data.lootTableId === 'pd_screen_escort')?.data?.intent?.fire, true,
    'the readable PD anchor remains the curtain and never attacks its protected carrier');
});

test('manifest, role, and runtime identity are revalidated at the final oracle', () => {
  const harness = boot(47003);
  const live = fire(harness);
  const { target, raider } = activate(harness, live);
  const manifest = target.data.cargoManifest;

  target.data.cargoManifest = null;
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, target), false);
  assert.deepEqual(authorize(harness, raider, target, { hostile: true }), {
    ok: false,
    reason: 'predation_relation_stale',
  }, 'a caller-supplied hostile bit cannot bypass the exact predation relation');
  target.data.cargoManifest = manifest;

  live.roles[target.id] = 'escort';
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, target), false, 'escort role is ineligible');
  live.roles[target.id] = 'hauler';

  const oldTarget = target;
  const recycled = {
    ...oldTarget,
    data: { ai: { ...oldTarget.data.ai }, intent: {} },
  };
  harness.state.entities.set(oldTarget.id, recycled);
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, oldTarget), false, 'stale object identity is rejected');
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, recycled), false, 'reused id lacks stable carrier identity');
  harness.state.entities.set(oldTarget.id, oldTarget);
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, oldTarget), true);
});

test('drive disable, custody transfer, and target death each clear once and disarm the raider', () => {
  const cases = [
    {
      label: 'drive disable',
      reason: 'target_disabled',
      mutate(h, live, target) {
        h.state.combat = { entities: { [String(target.id)]: { capabilities: { drive: false } } } };
        h.sim.runTicks(61);
      },
    },
    {
      label: 'custody transfer',
      reason: 'custody_changed',
      mutate(h, live, target) {
        target.data.freightCustody = {
          ...target.data.freightCustody,
          status: 'transferred',
          carrierId: h.player.id,
        };
        h.sim.runTicks(61);
      },
    },
    {
      label: 'target death',
      reason: 'target_destroyed',
      mutate(h, live, target) {
        h.bus.emit('entity:killed', {
          id: target.id,
          killerId: live.data.predationRaiderId,
          sectorId: SECTOR_ID,
          pos: { ...target.pos },
        });
        target.alive = false;
      },
    },
  ];

  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const harness = boot(47010 + i);
    const live = fire(harness, `${ENCOUNTER_ID}:${i}`);
    const { target, raider } = activate(harness, live);
    item.mutate(harness, live, target);
    assert.equal(live.data.predationStatus, 'cleared', item.label);
    assert.equal(live.data.predationEndReason, item.reason, item.label);
    assert.equal(raider.data.ai.passive, true, item.label);
    assert.equal(isHostileForAI(harness.state, raider, target), false, item.label);
    assert.equal(harness.events.cleared.length, 1, item.label);
    harness.sim.runTicks(180);
    assert.equal(harness.events.cleared.length, 1, `${item.label} remains idempotent`);
  }
});

test('director cleanup revokes authority through doctrine without co-writing tactical intent', () => {
  const harness = boot(47019);
  const live = fire(harness, `${ENCOUNTER_ID}:single-writer`);
  const { target, raider } = activate(harness, live);
  const tacticalIntent = Object.freeze({ fire: true, targetId: target.id, moveX: 0.25, moveZ: -0.5 });
  raider.data.intent = tacticalIntent;

  harness.director.clearPredation(live, 'single_writer_probe');

  assert.strictEqual(raider.data.intent, tacticalIntent, 'director leaves tactical intent ownership untouched');
  assert.equal(raider.data.ai.passive, true);
  assert.equal(raider.data.ai.roe, 'hold_fire');
  assert.equal(isHostileForAI(harness.state, raider, target), false);
});

test('leash escape fails closed immediately and clears after the bounded hold', () => {
  const harness = boot(47020);
  const live = fire(harness);
  const { target, raider } = activate(harness, live);
  target.pos.x = raider.pos.x + raider.data.ai.predationLeashRadius + 50;

  assert.equal(isHostileForAI(harness.state, raider, target), false, 'final authority closes before the 1 Hz owner tick');
  harness.sim.runTicks(5 * 60);
  assert.equal(live.data.predationStatus, 'cleared');
  assert.equal(live.data.predationEndReason, 'target_escaped');
  assert.equal(harness.events.cleared.length, 1);
});

test('sector, new-run, and load boundaries erase live target authority', () => {
  const boundaries = [
    {
      label: 'sector exit',
      run(h) { h.bus.emit('sector:exit', { sectorId: SECTOR_ID }); },
    },
    {
      label: 'new run',
      run(h) { h.bus.emit('game:new', { seed: h.state.meta.seed }); },
    },
    {
      label: 'load restore',
      run(h) { h.bus.emit('save:restoring', {}); },
    },
  ];
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const harness = boot(47030 + i);
    const live = fire(harness, `${ENCOUNTER_ID}:boundary:${i}`);
    const { target, raider } = activate(harness, live);
    boundary.run(harness);
    assert.equal(isHostileForAI(harness.state, raider, target), false, boundary.label);
    assert.equal(raider.data.ai.passive, true, boundary.label);
    assert.equal(raider.data.predationEncounterId, undefined, boundary.label);
    assert.equal(target.data.predationEncounterId, undefined, boundary.label);
  }
});

test('Continue rematerialization rebuilds stable role identity without reviving stale entities', () => {
  const harness = boot(47040);
  const first = fire(harness);
  const firstActors = activate(harness, first);
  const firstKeys = {
    target: firstActors.target.data.predationIdentityKey,
    raider: firstActors.raider.data.predationIdentityKey,
  };
  const oldIds = first.ids.slice();

  const durable = JSON.parse(JSON.stringify({
    named: harness.state.encounterDirector.named,
    receipts: harness.state.encounterDirector.receipts,
    cooldowns: harness.state.encounterDirector.cooldowns,
    stats: harness.state.encounterDirector.stats,
  }));
  harness.bus.emit('save:restoring', {});
  assert.equal(isHostileForAI(harness.state, firstActors.raider, firstActors.target), false);
  for (const id of oldIds) harness.state.entities.delete(id);
  harness.state.encounterDirector = durable;
  harness.bus.emit('save:loaded', {});

  const resumed = fire(harness);
  const resumedActors = actors(harness, resumed);
  assert.notEqual(resumedActors.target, firstActors.target);
  assert.notEqual(resumedActors.raider, firstActors.raider);
  assert.deepEqual({
    target: resumedActors.target.data.predationIdentityKey,
    raider: resumedActors.raider.data.predationIdentityKey,
  }, firstKeys, 'stable encounter/role keys survive runtime entity-id rematerialization');
  assert.equal(isHostileForAI(harness.state, firstActors.raider, resumedActors.target), false, 'stale raider stays inert');

  activate(harness, resumed);
  assert.equal(isAuthorizedPredationRelation(harness.state, resumedActors.raider, resumedActors.target), true);
});
