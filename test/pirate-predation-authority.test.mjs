// PQ-047 bounded pirate predation production-route regressions.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeAIEngagement,
  isAuthorizedAmbientPredationRelation,
  isAuthorizedPredationRelation,
  isHostileForAI,
} from '../src/ai/engagementAuthority.js';
import { ambientObjective } from '../src/ai/ambientPredation.js';
import { getFarActor, insertFarActor } from '../src/world/farActorTable.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
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
  const events = { telegraph: [], aiTelegraph: [], engaged: [], cleared: [], resolved: [] };
  bus.on('encounter:predationTelegraph', (payload) => events.telegraph.push(payload));
  bus.on('ai:telegraph', (payload) => events.aiTelegraph.push(payload));
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
  const events = { telegraph: [], aiTelegraph: [], engaged: [], cleared: [], resolved: [] };
  bus.on('encounter:predationTelegraph', (payload) => events.telegraph.push(payload));
  bus.on('ai:telegraph', (payload) => events.aiTelegraph.push(payload));
  bus.on('encounter:predationEngaged', (payload) => events.engaged.push(payload));
  bus.on('encounter:predationCleared', (payload) => events.cleared.push(payload));
  bus.on('encounter:resolved', (payload) => events.resolved.push(payload));
  return {
    sim, state, bus, player, tactical,
    events,
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

test('predation warning projects one physical offensive-raider-to-carrier approach cue', () => {
  const harness = bootTactical(47011);
  const startedTick = harness.state.tick;
  const live = fire(harness, `${ENCOUNTER_ID}:physical-telegraph`);
  const { target, raider, raiders } = actors(harness, live);
  const approachCues = () => harness.events.aiTelegraph
    .filter((payload) => payload.kind === 'pd_curtain_closing');

  assert.equal(harness.events.telegraph.length, 1, 'the domain warning remains its own event');
  assert.equal(approachCues().length, 1, 'the physical relation cue projects exactly once');
  assert.deepEqual(approachCues()[0], {
    entityId: raider.id,
    targetId: target.id,
    encounterId: live.id,
    doctrineId: 'interceptor_flyby',
    kind: 'pd_curtain_closing',
    durationTicks: 240,
    tick: startedTick,
  });
  assert.notEqual(raider.data.lootTableId, 'pd_screen_escort',
    'the cue originates at the selected offensive raider, not the PD screen');
  assert.equal(target.data.predationRole, 'manifest_carrier');
  assert.notEqual(target.id, harness.player.id, 'the physical cue points at the civilian carrier');
  assert.equal(raiders.some((candidate) => (
    candidate.data.lootTableId === 'pd_screen_escort'
      && candidate.id === approachCues()[0].entityId
  )), false);

  // Let the authored warning expire. Tactical AI may emit its later engine_flare as a distinct
  // doctrine phase; neither that event nor director cadence may duplicate the approach cue.
  raider.pos.x = target.pos.x + 300;
  raider.pos.z = target.pos.z - 100;
  harness.sim.runTicks(Math.ceil((live.data.predationNoFireUntil - harness.state.simTime + 3) * 60));
  assert.equal(live.data.predationStatus, 'active');
  assert.ok(harness.events.aiTelegraph.some((payload) => payload.kind === 'engine_flare'),
    'the later tactical engine flare remains a distinct cue');
  assert.equal(approachCues().length, 1,
    'response-window and tactical cadence never repeat the authored approach cue');
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

// ── Ambient manifest predation — unscripted NPC piracy ──────────────────────────────────────────
// The director's cadenced evaluator pairs an idle non-lawful pirate with a manifested civilian
// hauler in low-security, lane-adjacent space — no encounter script, no player involvement.
// Fixture sector: Pallas Drift (security 0.42 < the 0.55 ceiling) with the authored ambush_lane
// disc centred at (1420, 760) r=640.

const AMBIENT_SECTOR = 'sector_pallas_drift';
// Authored ambush-lane disc centre in SECTOR-LOCAL space — zonesForSector rows are local while
// live entity.pos is galactic-global, so fixtures must place hulls on the global frame.
const AMBIENT_LANE = Object.freeze({ x: 1420, z: 760 });
const AMBIENT_MANIFEST = 'ambient_test_manifest';

function lanePoint(sectorId, dx, dz) {
  return sectorLocalToGlobalForSector(
    { x: AMBIENT_LANE.x + dx, z: AMBIENT_LANE.z + dz },
    sectorId);
}

function ambientRaiderSpec(pos) {
  return {
    type: 'ship',
    team: 1,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    hull: 120,
    hullMax: 120,
    shield: 50,
    radius: 18,
    data: {
      intent: {},
      weapons: [{ id: 'wpn_autocannon_s' }],
      ai: {
        archetype: 'pirate',
        lawful: false,
        combatDoctrineId: 'interceptor_flyby',
        motive: 'assigned_interdiction',
        engagementTrigger: 'authorized_hostile_spawn',
        zoneId: 'zone_pallas_ambush',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 2,
        activity: {
          kind: 'attack_run',
          reason: 'zone_hostile:hunt',
          anchor: { ...pos },
          leashRadius: 2600,
          startedTick: 0,
          targetId: null,
        },
        roe: 'weapons_free',
      },
    },
  };
}

function ambientHaulerSpec(pos, manifestId = AMBIENT_MANIFEST, qty = 24) {
  return {
    type: 'ship',
    team: 2,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    hull: 80,
    hullMax: 80,
    shield: 0,
    radius: 14,
    data: {
      intent: {},
      trafficRole: 'hauler',
      role: 'hauler',
      cargoManifest: {
        manifestId,
        lines: [{ commodityId: 'cmdty_ore_iron', qty }],
        totalQty: qty,
      },
      ai: { passive: true },
    },
  };
}

function ambientPodSpec(pos, ownerId, qty = 6) {
  return {
    type: 'payload',
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    hull: 100,
    hullMax: 100,
    radius: 8,
    ownerId,
    data: {
      payloadType: 'jettisoned_cargo',
      ownerId,
      commodityId: 'cmdty_ore_iron',
      amount: qty,
      salvagePool: { cmdty_ore_iron: qty },
    },
  };
}

function bootAmbient(seed = 47060, overrides = {}) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = overrides.sectorId || AMBIENT_SECTOR;
  state.story.beatIndex = 7;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: lanePoint(state.world.currentSectorId, 5000, 5000),
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const events = { telegraph: [], engaged: [], cleared: [], secured: [] };
  bus.on('encounter:ambientPredationTelegraph', (p) => events.telegraph.push(p));
  bus.on('encounter:ambientPredationEngaged', (p) => events.engaged.push(p));
  bus.on('encounter:ambientPredationCleared', (p) => events.cleared.push(p));
  bus.on('encounter:ambientCargoSecured', (p) => events.secured.push(p));
  return { sim, state, bus, player, events, director: sim.registry.get('encounterDirector') };
}

/** Idle pirate + manifested hauler sharing the authored ambush lane in low-security space. */
function ambientPair(harness, opts = {}) {
  const raider = harness.sim.spawn(ambientRaiderSpec(
    opts.raiderPos || lanePoint(harness.state.world.currentSectorId, -200, -100)));
  const victim = harness.sim.spawn(ambientHaulerSpec(
    opts.victimPos || lanePoint(harness.state.world.currentSectorId, 150, 60),
    opts.manifestId, opts.victimQty));
  return { raider, victim };
}

function boundAmbientRaid(harness, ticks = 2 * 60) {
  harness.sim.runTicks(ticks);
  assert.ok(harness.events.telegraph.length >= 1, 'evaluator binds an ambient raid');
  const p = harness.events.telegraph[0];
  const raider = harness.state.entities.get(p.raiderId);
  const victim = harness.state.entities.get(p.targetId);
  assert.ok(raider && victim, 'bound pair entities remain live');
  return { raidId: p.raidId, raider, victim, payload: p };
}

test('idle pirate hunts a manifested hauler with no script and no player involvement', () => {
  const harness = bootAmbient();
  const { raider, victim } = ambientPair(harness);
  const { raidId } = boundAmbientRaid(harness, 2 * 60);
  const telegraph = harness.events.telegraph[0];

  assert.equal(harness.events.telegraph.length, 1);
  assert.equal(telegraph.raiderId, raider.id);
  assert.equal(telegraph.targetId, victim.id);
  assert.ok(raidId.startsWith('ambient:raid:'), 'ambient ids never collide with scripted encounter ids');
  assert.equal(telegraph.manifestId, AMBIENT_MANIFEST);
  assert.equal(telegraph.sectorId, AMBIENT_SECTOR);
  assert.ok(telegraph.telegraphS >= 3, 'bounded stalk before weapons free');
  assert.ok(telegraph.engageAt > harness.state.simTime, 'still inside the stalk window');

  const ai = raider.data.ai;
  assert.equal(raider.data.predationRole, 'raider');
  assert.equal(victim.data.predationRole, 'manifest_carrier');
  assert.equal(victim.data.predationEncounterId, raidId);
  assert.equal(ai.predationStatus, 'telegraph');
  assert.equal(ai.predationTargetId, victim.id);
  assert.equal(ai.predationObjective.kind, 'ambient_manifest_raid');
  assert.equal(ai.motive, 'ambient_cargo_raid');
  assert.equal(ai.engagementTrigger, 'ambient_manifest_predation');
  assert.equal(ai.roe, 'hold_fire', 'telegraph stalks under hold-fire');
  assert.equal(ai.activity.targetId, victim.id);

  // The final authority oracle opens the relation exactly and only for the bound victim.
  assert.equal(isAuthorizedAmbientPredationRelation(harness.state, raider, victim), true);
  assert.equal(isHostileForAI(harness.state, raider, victim), true);
  assert.equal(isHostileForAI(harness.state, raider, harness.player), false,
    'a bound raider never peels onto the player');
  assert.equal(isHostileForAI(harness.state, victim, raider), false, 'the exception is directional');
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, victim), false,
    'ambient raids never satisfy the scripted relation');

  // Telegraph -> weapons-free transition opens fire authority at the authored moment.
  harness.sim.runTicks(Math.ceil((telegraph.engageAt - harness.state.simTime + 1) * 60));
  assert.equal(raider.data.ai.predationStatus, 'active');
  assert.equal(raider.data.ai.roe, 'weapons_free');
  assert.equal(harness.events.engaged.length, 1);
  assert.equal(harness.events.engaged[0].raidId, raidId);
  assert.deepEqual(authorize(harness, raider, victim), { ok: true, reason: 'authorized' });
});

test('ambient pairing is deterministic on a fixed seed', () => {
  const first = bootAmbient(47061);
  const second = bootAmbient(47061);
  ambientPair(first);
  ambientPair(second);
  first.sim.runTicks(8 * 60);
  second.sim.runTicks(8 * 60);
  assert.equal(first.events.telegraph.length, 1);
  assert.equal(second.events.telegraph.length, 1);
  assert.deepEqual(
    first.events.telegraph.map((p) => [p.raidId, p.raiderId, p.targetId, p.telegraphS]),
    second.events.telegraph.map((p) => [p.raidId, p.raiderId, p.targetId, p.telegraphS]),
    'identical seeds bind the identical pair on the identical tick');
});

test('ambient evaluator excludes lawful actors, lawful presence, and the Ceres pocket', () => {
  // Lawful pirate — a lawman hull never raids.
  {
    const harness = bootAmbient(47062);
    const { raider } = ambientPair(harness);
    raider.data.ai.lawful = true;
    harness.sim.runTicks(8 * 60);
    assert.equal(harness.events.telegraph.length, 0, 'lawful actors never raid');
    assert.equal(raider.data.predationRole, undefined);
  }
  // Lawful presence — a patrol hull inside the bubble suppresses the pairing.
  {
    const harness = bootAmbient(47063);
    ambientPair(harness);
    harness.sim.spawn({
      type: 'ship', team: 1,
      pos: lanePoint(harness.state.world.currentSectorId, 400, 0),
      vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 10,
      data: { intent: {}, weapons: [{ id: 'wpn_autocannon_s' }],
        ai: { archetype: 'brawler', lawful: true, combatDoctrineId: 'brawler_commit',
          motive: 'law_enforcement', engagementTrigger: 'wanted_status',
          zoneId: 'zone_pallas_ambush', approachTelegraph: 'engine_flare',
          noFireResponseWindowS: 2 } },
    });
    harness.sim.runTicks(8 * 60);
    assert.equal(harness.events.telegraph.length, 0, 'lawful presence suppresses pairing');
  }
  // The authored Ceres cast pocket owns its own choreography.
  {
    const harness = bootAmbient(47064, { sectorId: 'sector_ceres_belt' });
    ambientPair(harness);
    harness.sim.runTicks(8 * 60);
    assert.equal(harness.events.telegraph.length, 0, 'ambient predation never runs in the Ceres pocket');
  }
  // High-security sectors (Tethys Junction, 0.65) are above the ceiling.
  {
    const harness = bootAmbient(47065, { sectorId: SECTOR_ID });
    ambientPair(harness);
    harness.sim.runTicks(8 * 60);
    assert.equal(harness.events.telegraph.length, 0, 'secure sectors never spawn ambient raids');
  }
});

test('ambient raid cap binds at most one concurrent raid', () => {
  const harness = bootAmbient(47066);
  ambientPair(harness);
  ambientPair(harness, {
    raiderPos: lanePoint(harness.state.world.currentSectorId, 240, -160),
    victimPos: lanePoint(harness.state.world.currentSectorId, -100, 180),
    manifestId: `${AMBIENT_MANIFEST}:b`,
  });
  harness.sim.runTicks(8 * 60);
  assert.equal(harness.events.telegraph.length, 1, 'the bounded cap keeps one live ambient raid');
  const boundIds = [...harness.state.entities.values()]
    .filter((entity) => entity.data && entity.data.predationRole === 'raider')
    .map((entity) => entity.id);
  assert.equal(boundIds.length, 1);
});

test('ambient deadline and stale identity fail closed with one bounded clear', () => {
  const harness = bootAmbient(47067);
  ambientPair(harness);
  const { raidId, raider, victim } = boundAmbientRaid(harness);

  // Deadline expiry releases the pair and restores the raider's pre-raid doctrine.
  raider.data.ai.predationObjective.deadlineTick = 0;
  raider.data.ai.predationObjective.deadlineAt = 0;
  harness.sim.runTicks(61);
  assert.equal(harness.events.cleared.length, 1);
  assert.equal(harness.events.cleared[0].raidId, raidId);
  assert.equal(harness.events.cleared[0].reason, 'objective_timeout');
  assert.equal(raider.data.ai.predationStatus, 'cleared');
  assert.equal(raider.data.ai.predationTargetId, undefined);
  assert.equal(raider.data.predationRole, undefined);
  assert.equal(victim.data.predationRole, undefined);
  assert.equal(raider.data.ai.motive, 'assigned_interdiction', 'pre-raid doctrine snapshot restored');
  assert.equal(isHostileForAI(harness.state, raider, victim), false);
  assert.equal(Number.isFinite(raider.data.ai.ambientRaidCooldownUntil), true, 'per-raider refractory');
  assert.equal(Number.isFinite(victim.data.ambientVictimCooldownUntil), true, 'per-victim refractory');
  harness.sim.runTicks(120);
  assert.equal(harness.events.cleared.length, 1, 'expiry clears exactly once');
  // The refractory window keeps the same pair from instantly re-binding.
  assert.equal(harness.events.telegraph.length, 1);
});

test('stale victim identity releases the ambient raid fail-closed', () => {
  const harness = bootAmbient(47068);
  ambientPair(harness);
  const { raider, victim } = boundAmbientRaid(harness);
  victim.data.predationIdentityKey = 'recycled:identity';
  harness.sim.runTicks(61);
  assert.equal(harness.events.cleared.length, 1);
  assert.equal(harness.events.cleared[0].reason, 'target_lost');
  assert.equal(raider.data.ai.predationStatus, 'cleared');
});

test('player fire on a bound ambient raider converts it to self-defense retaliation', () => {
  const harness = bootAmbient(47069);
  ambientPair(harness);
  const { raidId, raider, victim } = boundAmbientRaid(harness);

  harness.bus.emit('combat:damage', {
    attackerId: harness.player.id,
    targetId: raider.id,
    applied: 12,
    pos: { ...raider.pos },
  });

  const ai = raider.data.ai;
  assert.equal(raider.data.predationRole, undefined, 'player intervention ends the binding');
  assert.equal(ai.predationStatus, 'cleared');
  assert.equal(ai.predationEndReason, 'player_intervention');
  assert.equal(ai.retaliationTargetId, harness.player.id);
  assert.equal(ai.motive, 'self_defense');
  assert.equal(ai.engagementTrigger, 'player_attack');
  assert.equal(ai.roe, 'weapons_free');
  assert.equal(ai.activity.targetId, harness.player.id);
  assert.equal(victim.data.predationRole, undefined, 'the released hauler is free');
  assert.equal(harness.events.cleared.length, 1);
  assert.equal(harness.events.cleared[0].reason, 'player_intervention');
  assert.equal(isHostileForAI(harness.state, raider, harness.player), true,
    'the released raider can defend itself');
  assert.equal(isHostileForAI(harness.state, raider, victim), false,
    'the released raider does not retain victim hostility');
});

test('player fire releases a scripted raider into self-defense instead of leaving it suppressed', () => {
  const harness = boot(47071);
  const live = fire(harness, `${ENCOUNTER_ID}:retaliation`);
  const { target, raider } = activate(harness, live);

  assert.equal(isHostileForAI(harness.state, raider, target), true, 'scripted raid is live');
  harness.bus.emit('combat:damage', {
    attackerId: harness.player.id,
    targetId: raider.id,
    applied: 15,
    pos: { ...raider.pos },
  });

  const ai = raider.data.ai;
  assert.equal(ai.retaliationTargetId, harness.player.id);
  assert.equal(ai.motive, 'self_defense');
  assert.equal(ai.predationTargetId, undefined);
  assert.equal(raider.data.predationRole, undefined);
  assert.equal(isHostileForAI(harness.state, raider, harness.player), true,
    'a scripted raider can defend itself after the player shoots it');
  assert.equal(isHostileForAI(harness.state, raider, target), false,
    'self-defense does not keep the bounded prey relation');

  harness.sim.runTicks(61);
  assert.equal(live.data.predationStatus, 'cleared');
  assert.equal(live.data.predationEndReason, 'raider_lost',
    'the scripted tick reconciles the released raider fail-closed');
});

test('ambient recovery secures spilled pods physically, then escapes with the loot', () => {
  const harness = bootAmbient(47072);
  ambientPair(harness);
  const { raidId, raider, victim } = boundAmbientRaid(harness);

  // Drive the pair through telegraph into the active phase.
  const ai = raider.data.ai;
  harness.sim.runTicks(Math.ceil((ai.predationObjective.engageAt - harness.state.simTime + 1) * 60));
  assert.equal(ai.predationStatus, 'active');

  // Traffic's violence machinery dumped under fire — one pod leaves the hauler.
  victim.data.violenceCargoSpilled = true;
  const pod = harness.sim.spawn(ambientPodSpec(
    { x: victim.pos.x + 60, z: victim.pos.z }, victim.id, 6));
  harness.sim.runTicks(2 * 60);
  assert.equal(ai.predationStatus, 'cargo_recovery');
  assert.equal(ai.activity.kind, 'transit');
  assert.equal(ai.roe, 'hold_fire', 'recovery never fires');

  // The raider physically reaches the pod and secures it.
  raider.pos.x = pod.pos.x;
  raider.pos.z = pod.pos.z;
  harness.sim.runTicks(2 * 60);
  assert.equal(harness.events.secured.length, 1);
  assert.equal(harness.events.secured[0].raidId, raidId);
  assert.equal(harness.events.secured[0].qty, 6);
  assert.equal(ai.predationStatus, 'cargo_escape', 'secured loot triggers the escape leg');
  assert.equal(ai.activity.kind, 'flee');
  assert.equal(ai.predationObjective.securedQty, 6);
  assert.equal(harness.state.entities.has(pod.id), false, 'the pod entity is consumed');

  // Escape completes at the deterministic radius: the raid clears and the raider is a pirate again.
  const origin = ai.predationObjective.escapeOrigin;
  raider.pos.x = origin.x + ai.predationObjective.escapeRadius + 50;
  harness.sim.runTicks(2 * 60);
  assert.equal(harness.events.cleared.length, 1);
  assert.equal(harness.events.cleared[0].reason, 'escaped');
  assert.equal(harness.events.cleared[0].securedQty, 6);
  assert.equal(ai.predationStatus, 'cleared');
  assert.equal(ai.motive, 'assigned_interdiction', 'successful raider resumes ordinary piracy');
});

test('a raider destroyed mid-escape respills its secured cargo as ordinary residue', () => {
  const harness = bootAmbient(47073);
  ambientPair(harness);
  const { raidId, raider, victim } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_escape';
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty: 5 }];
  ai.predationObjective.securedQty = 5;

  raider.alive = false; // the kernel flags the hull dead before the killed receipt ships
  harness.bus.emit('entity:killed', {
    id: raider.id,
    killerId: victim.id,
    sectorId: AMBIENT_SECTOR,
    pos: { ...raider.pos },
  });

  assert.equal(harness.events.cleared.length, 1);
  assert.equal(harness.events.cleared[0].raidId, raidId);
  assert.equal(harness.events.cleared[0].reason, 'raider_destroyed');
  assert.equal(victim.data.predationRole, undefined);
  const residue = [...harness.state.entities.values()].filter((entity) => (
    entity.type === 'payload'
      && entity.data
      && entity.data.payloadType === 'jettisoned_cargo'
      && (entity.ownerId === raider.id || entity.data.ownerId === raider.id)
  ));
  assert.equal(residue.length, 1, 'secured cargo respills as a physical pod');
  assert.equal(residue[0].data.salvagePool.cmdty_ore_iron, 5);
});

test('a rematerialized stale ambient binding sweeps clear fail-closed', () => {
  const harness = bootAmbient(47074);
  ambientPair(harness);
  const { raider, victim } = boundAmbientRaid(harness);

  // The durable record boundary drops data.predation* but keeps the whole ai bag, and the victim
  // rematerializes under a fresh runtime id — simulate that exact stale shape.
  harness.state.entities.delete(victim.id);
  delete raider.data.predationEncounterId;
  delete raider.data.predationRole;
  delete raider.data.predationIdentityKey;
  assert.equal(ambientObjective(raider) != null, true);
  harness.sim.runTicks(61);
  assert.equal(raider.data.ai.predationStatus, 'cleared');
  assert.equal(raider.data.ai.predationObjective, undefined);
  assert.equal(raider.data.ai.ambientRestore, undefined);
  assert.equal(harness.events.cleared.length, 1);
  assert.equal(harness.events.cleared[0].reason, 'target_lost');
  assert.equal(raider.data.ai.retaliationTargetId, undefined, 'no retaliation residue');
  assert.equal(raider.data.ai.predationTargetId, undefined, 'no target residue');
  assert.equal(raider.data.ai.motive, 'assigned_interdiction', 'pre-raid doctrine restored');
});

test('an escaped raider keeps what it stole — the loot rides its durable hull', () => {
  const harness = bootAmbient(47075);
  ambientPair(harness);
  const { raidId, raider, victim } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_escape';
  ai.predationObjective.escapeOrigin = { x: raider.pos.x, z: raider.pos.z };
  ai.predationObjective.escapeRadius = 100;
  ai.predationObjective.escapeDeadlineAt = harness.state.simTime + 60;
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty: 6 }];
  ai.predationObjective.securedQty = 6;

  raider.pos.x += 150; // beyond the escape radius — the raid releases 'escaped'
  harness.sim.runTicks(2 * 60);
  assert.equal(harness.events.cleared[0].reason, 'escaped');
  assert.equal(ai.predationObjective, undefined, 'the raid binding released');
  // SF-292: the goods stay in the actual current owner's hands — the raider's durable ai bag
  // (the part of the record that survives shelving), never deleted at the release boundary.
  assert.ok(ai.stolenLoot && Array.isArray(ai.stolenLoot.lines), 'kept loot rides the hull');
  assert.equal(ai.stolenLoot.lines[0].commodityId, 'cmdty_ore_iron');
  assert.equal(ai.stolenLoot.lines[0].qty, 6);
  assert.equal(ai.stolenLoot.victimId, victim.id);
  assert.equal(ai.stolenLoot.manifestId, AMBIENT_MANIFEST);
});

test('an escaped raider killed later drops the loot it kept — nothing vanishes', () => {
  const harness = bootAmbient(47076);
  ambientPair(harness);
  const { raidId, raider, victim } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_escape';
  ai.predationObjective.escapeOrigin = { x: raider.pos.x, z: raider.pos.z };
  ai.predationObjective.escapeRadius = 100;
  ai.predationObjective.escapeDeadlineAt = harness.state.simTime + 60;
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty: 5 }];
  ai.predationObjective.securedQty = 5;
  raider.pos.x += 150;
  harness.sim.runTicks(2 * 60);
  assert.equal(harness.events.cleared[0].reason, 'escaped');
  assert.ok(ai.stolenLoot, 'loot aboard after escape');

  // The player runs the thief down after the raid released — the kill still drops the take.
  raider.alive = false;
  harness.bus.emit('entity:killed', {
    id: raider.id, killerId: harness.player.id, sectorId: AMBIENT_SECTOR, pos: { ...raider.pos },
  });
  let residue = [...harness.state.entities.values()].filter((entity) => (
    entity.type === 'payload' && entity.data
      && entity.data.payloadType === 'jettisoned_cargo'
      && entity.data.ownerId === raider.id
  ));
  assert.equal(residue.length, 1, 'kept loot respills as a physical pod');
  assert.equal(residue[0].data.salvagePool.cmdty_ore_iron, 5);
  assert.equal(residue[0].data.stolenFromId, victim.id, 'the pod still names its freight owner');
  assert.equal(residue[0].data.manifestId, AMBIENT_MANIFEST);
  assert.equal(ai.stolenLoot, undefined, 'the ledger drained with the drop');

  // The corpse's post-delete destroyed receipt arrives on the same drained ledger — no double drop.
  harness.state.entities.delete(raider.id);
  harness.bus.emit('entity:destroyed', {
    id: raider.id, type: 'ship', pos: { ...raider.pos }, entity: raider,
  });
  residue = [...harness.state.entities.values()].filter((entity) => (
    entity.type === 'payload' && entity.data
      && entity.data.payloadType === 'jettisoned_cargo'
      && entity.data.ownerId === raider.id
  ));
  assert.equal(residue.length, 1, 'killed→destroyed drops the take exactly once');
});

test('pressure during the escape knocks the loot loose piecemeal — a pursuit recovers it', () => {
  const harness = bootAmbient(47077);
  ambientPair(harness);
  const { raidId, raider } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_escape';
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty: 6 }];
  ai.predationObjective.securedQty = 6;
  const patrol = harness.sim.spawn(ambientRaiderSpec({ x: raider.pos.x + 50, z: raider.pos.z }));

  // A lawful pursuer's fire — not the player — still pressures the ditch.
  harness.bus.emit('combat:damage', {
    targetId: raider.id, attackerId: patrol.id, applied: 4, pos: { ...raider.pos },
  });
  const firstDump = [...harness.state.entities.values()].filter((e) => (
    e.type === 'payload' && e.data && e.data.spillCause === 'pressure_jettison'));
  assert.equal(firstDump.length, 1, 'one pressured ditch, not a burst');
  assert.equal(firstDump[0].data.salvagePool.cmdty_ore_iron, 3, 'about a third of the line sheds');
  assert.equal(firstDump[0].data.stolenFromId, harness.state.entities.get(
    ai.predationObjective.targetId).id);
  assert.equal(ai.predationObjective.securedQty, 3, 'the live ledger decrements — conserved');
  assert.equal(ai.predationStatus, 'cargo_escape', 'the raider keeps running while it sheds');

  // Cooldown: a second hit inside the window drops nothing more.
  harness.bus.emit('combat:damage', {
    targetId: raider.id, attackerId: patrol.id, applied: 4, pos: { ...raider.pos },
  });
  assert.equal([...harness.state.entities.values()].filter((e) => (
    e.type === 'payload' && e.data && e.data.spillCause === 'pressure_jettison')).length, 1);
  assert.equal(ai.predationObjective.securedQty, 3);

  // After the window, sustained pressure sheds the rest in lumps — cargo total stays conserved.
  harness.state.simTime += 5;
  harness.bus.emit('combat:damage', {
    targetId: raider.id, attackerId: patrol.id, applied: 4, pos: { ...raider.pos },
  });
  const dumps = [...harness.state.entities.values()].filter((e) => (
    e.type === 'payload' && e.data && e.data.spillCause === 'pressure_jettison'));
  const spilled = dumps.reduce((sum, e) => sum + e.data.salvagePool.cmdty_ore_iron, 0);
  assert.equal(spilled + ai.predationObjective.securedQty, 6,
    'pods + remaining ledger == the stolen total');
});

test('player fire mid-escape converts the raider and the kept loot still drops on the kill', () => {
  const harness = bootAmbient(47078);
  ambientPair(harness);
  const { raidId, raider } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_escape';
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty: 7 }];
  ai.predationObjective.securedQty = 7;

  harness.bus.emit('combat:damage', {
    targetId: raider.id, attackerId: harness.player.id, applied: 9, pos: { ...raider.pos },
  });
  assert.equal(ai.motive, 'self_defense', 'player intervention still converts the raider');
  // The first hit also knocked one lump loose; the rest transferred into the durable ledger.
  const dumps = [...harness.state.entities.values()].filter((e) => (
    e.type === 'payload' && e.data && e.data.spillCause === 'pressure_jettison'));
  const spilledQty = dumps.reduce((sum, e) => sum + e.data.salvagePool.cmdty_ore_iron, 0);
  const aboard = ai.stolenLoot
    ? ai.stolenLoot.lines.reduce((sum, l) => sum + l.qty, 0) : 0;
  assert.equal(spilledQty + aboard, 7, 'hit-ditch + kept ledger == the stolen total');

  raider.alive = false;
  harness.bus.emit('entity:killed', {
    id: raider.id, killerId: harness.player.id, sectorId: AMBIENT_SECTOR, pos: { ...raider.pos },
  });
  const allPods = [...harness.state.entities.values()].filter((e) => (
    e.type === 'payload' && e.data && e.data.salvagePool
      && e.data.salvagePool.cmdty_ore_iron > 0));
  const total = allPods.reduce((sum, e) => sum + e.data.salvagePool.cmdty_ore_iron, 0);
  assert.equal(total, 7, 'the whole take is back in the world — conserved end to end');
  assert.equal(ai.stolenLoot, undefined);
});

test('a dead raider\'s post-delete entity:destroyed still drops the cargo — payload ref, not id lookup', () => {
  const harness = bootAmbient(47079);
  ambientPair(harness);
  const { raider } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.stolenLoot = { lines: [{ commodityId: 'cmdty_ore_iron', qty: 4 }], victimId: null, manifestId: null };
  // The destroyed receipt queues after the map delete — the id lookup misses; the payload's own
  // entity ref is the only live handle (the pre-fix path dropped this cargo silently).
  raider.alive = false;
  harness.state.entities.delete(raider.id);
  harness.bus.emit('entity:destroyed', {
    id: raider.id, type: 'ship', pos: { ...raider.pos }, entity: raider,
  });
  const residue = [...harness.state.entities.values()].filter((e) => (
    e.type === 'payload' && e.data && e.data.spillCause === 'raider_destroyed'));
  assert.equal(residue.length, 1, 'the post-delete drop still conserves the freight');
  assert.equal(residue[0].data.salvagePool.cmdty_ore_iron, 4);
});

test('a virtualized (shelved) raider keeps its loot on the shared ai bag — no invisible drop', () => {
  const harness = bootAmbient(47079);
  ambientPair(harness);
  const { raider } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.stolenLoot = { lines: [{ commodityId: 'cmdty_ore_iron', qty: 4 }], victimId: null, manifestId: null };
  // The real shelf path: insertFarActor shares the entity's ai bag BY REFERENCE into the far row
  // (leanIdentityData), then removeEntity(reason:'virtualize') flags alive=false and queues a
  // destroyed receipt carrying that same ref. A respill here would strand invisible pods at the
  // shelf edge AND erase the row's ledger through the shared bag — the row IS the conservation.
  const rec = insertFarActor(harness.state, raider, harness.state.simTime, harness.sim.helpers);
  harness.sim.helpers.removeEntity(raider.id, { immediate: true, reason: 'virtualize' });
  harness.sim.runTicks(1); // flush the queued entity:destroyed receipt
  const pods = [...harness.state.entities.values()].filter((e) => e.type === 'payload');
  assert.equal(pods.length, 0, 'a stored hull drops nothing');
  const row = getFarActor(harness.state, raider.id);
  assert.equal(row, rec, 'the far row holds the shelved raider');
  assert.equal(row.data.ai.stolenLoot.lines[0].qty, 4, 'the loot rides the shelved ai bag intact');
});
