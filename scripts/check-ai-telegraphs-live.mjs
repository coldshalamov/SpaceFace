#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineId, DOCTRINE_TELEGRAPH_TICKS } from '../src/ai/combatDoctrine.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const tacticalSource = stripComments(readFileSync(new URL('../src/systems/tacticalAI.js', import.meta.url), 'utf8'));
assert(!/\bintent\s*\.\s*(?:fire|fireGroup)\s*=/.test(tacticalSource),
  'live tacticalAI must not write legacy firing intent directly');
assert(tacticalSource.includes('applyAIFiringIntent'), 'live tacticalAI must route firing through the doctrine-gated adapter');

const hold = runLiveCase({
  name: 'hold_fire_hail',
  activityKind: ActivityKind.HAIL_HOLD,
  roe: RulesOfEngagement.HOLD_FIRE,
  wanted: false,
});
assert.equal(hold.fireIntent, false, 'hold-fire live SG-06 case must not arm weapons intent');
assert.equal(hold.maneuverKinds.every((kind) => kind === 'hold'), true, 'hold-fire live SG-06 case must request hold movement');

const pirate = runLiveCase({
  name: 'anonymous_weapons_free_denied',
  activityKind: ActivityKind.ATTACK_RUN,
  roe: RulesOfEngagement.WEAPONS_FREE,
  wanted: false,
});
assert.equal(pirate.fireIntent, false, 'weapons-free without an authored doctrine must fail closed');

const lawfulClean = runLiveCase({
  name: 'lawful_clean',
  activityKind: ActivityKind.PATROL_ROUTE,
  roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
  wanted: false,
  combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
  ticks: 90 * 60,
});
assert.equal(lawfulClean.fireIntent, false, 'lawful patrol must not fire on a clean player');
assert.equal(lawfulClean.firstFireTick, null, 'lawful patrol never fires during a 90-second clean idle start');
assert.equal(lawfulClean.actionStarts, 0, 'lawful patrol should not even start an attack action against a clean player');
assert.equal(lawfulClean.hostileAcquisitions, 0, 'lawful patrol never acquires the clean player as a hostile focus over 90 seconds');
assert.equal(lawfulClean.firstHostileAcquisitionTick, null);
assert.deepEqual(lawfulClean.telegraphs, [], 'lawful patrol doctrine emits no attack warning without a legal hostile target');
assert(lawfulClean.maneuverKinds.includes('formation'), 'lawful patrol doctrine preserves formation without a legal hostile target');

const lawfulWanted = runLiveCase({
  name: 'lawful_wanted',
  activityKind: ActivityKind.PATROL_ROUTE,
  roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
  wanted: true,
  combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
  ticks: 78,
  targetX: 190,
});
assert.equal(lawfulWanted.fireIntent, true, 'lawful patrol may fire once WANTED heat makes the target legal');
assert(lawfulWanted.firstFireTick >= DOCTRINE_TELEGRAPH_TICKS,
  'lawful enforcement still telegraphs before firing on a wanted player');

const interceptor = runLiveCase({
  name: 'interceptor_delayed_strike',
  activityKind: ActivityKind.ATTACK_RUN,
  roe: RulesOfEngagement.WEAPONS_FREE,
  wanted: false,
  combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
  ticks: 78,
  targetX: 190,
});
assert.equal(interceptor.telegraphs.length, 1, 'interceptor emits one actual live telegraph event');
assert.equal(interceptor.telegraphs[0].kind, 'engine_flare');
assert.equal(interceptor.telegraphs[0].durationTicks, DOCTRINE_TELEGRAPH_TICKS);
assert(interceptor.firstFireTick >= interceptor.telegraphs[0].tick + DOCTRINE_TELEGRAPH_TICKS,
  'interceptor fire is impossible before the full engine-flare window');

const ranged = runLiveCase({
  name: 'ranged_delayed_window',
  activityKind: ActivityKind.REPOSITION,
  roe: RulesOfEngagement.WEAPONS_FREE,
  wanted: false,
  combatDoctrineId: CombatDoctrineId.RANGED_DISENGAGER,
  ticks: 90,
  targetX: 620,
});
assert.equal(ranged.telegraphs.length, 1, 'ranged doctrine emits one actual charge event');
assert.equal(ranged.telegraphs[0].kind, 'weapon_charge');
assert(ranged.firstFireTick >= ranged.telegraphs[0].tick + DOCTRINE_TELEGRAPH_TICKS,
  'ranged doctrine cannot fire before charge completes');

const tetherRaider = runLiveCase({
  name: 'tether_raider_delayed_attach',
  activityKind: ActivityKind.ATTACK_RUN,
  roe: RulesOfEngagement.WEAPONS_FREE,
  wanted: false,
  combatDoctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
  ticks: 52,
  targetX: 120,
  tetherAfterTick: 31,
});
assert.equal(tetherRaider.telegraphs.length, 1, 'tether raider emits one spool cue');
assert.equal(tetherRaider.telegraphs[0].kind, 'attach_spool');
const attachStart = tetherRaider.starts.find((entry) => entry.actionId === 'action_attach');
assert(attachStart && attachStart.tick >= tetherRaider.telegraphs[0].tick + DOCTRINE_TELEGRAPH_TICKS,
  `canonical action_attach is impossible before the full spool cue; starts=${JSON.stringify(tetherRaider.starts)}`);
const reelStart = tetherRaider.starts.find((entry) => entry.actionId === 'action_reel');
assert(reelStart && reelStart.tick > attachStart.tick,
  `tether control must continue through canonical action_reel; starts=${JSON.stringify(tetherRaider.starts)}`);
assert.equal(tetherRaider.firstFireTick, null, 'tether attach window never arms ordinary weapons');

const defaultBatch = runProductionDefaultBatchCase();

process.stdout.write(JSON.stringify({
  schema: 'spaceface.ai.telegraphs_live_sg06.v1',
  cases: [hold, pirate, lawfulClean, lawfulWanted, interceptor, ranged, tetherRaider],
  defaultBatch,
  deterministic: true,
}, null, 2) + '\n');

function runProductionDefaultBatchCase() {
  const actorIds = [1, 2, 3, 4, 5];
  const targetId = 99;
  const sensorCalls = [];
  const starts = [];
  const maneuverRequests = [];
  const telegraphs = [];
  const state = defaultBatchState(actorIds, targetId);
  const bus = createBus();
  bus.on('ai:telegraph', (payload) => telegraphs.push(payload));
  const tacticalAI = createTacticalAISystem({
    seed: 0x06110600,
    config: { trace: { enabled: false } },
    sensors: {
      frameFor(entityId, tick) {
        sensorCalls.push(`${tick}:${entityId}`);
        return defaultBatchFrame(entityId, tick, entityId === 2 && tick === 2 ? [] : [defaultBatchTarget(targetId)]);
      },
    },
    roster: { listSquads: () => defaultBatchRoster(actorIds) },
    maneuver: { request: (request) => { maneuverRequests.push(request); return true; } },
    actionPortFactory: () => actionPort(starts, state),
  });
  tacticalAI.init({ state, bus, helpers: {} });
  tacticalAI.update(1 / 60, state);
  assert.equal(tacticalAI.stack.executor.config.minCommitTicks, 18, 'live fixture uses production-default executor commit');
  assert.equal(tacticalAI.stack.selector.config.minCommitTicks, 18, 'live fixture uses production-default selector commit');
  const callsAfterTick0 = sensorCalls.length;
  for (const tick of [1, 2]) {
    state.tick = tick;
    tacticalAI.update(1 / 60, state);
  }
  assert(sensorCalls.length > callsAfterTick0,
    'production default should stagger member decisions across intervening simulation ticks');
  const decisionAtTick2 = tacticalAI.stack.lastResult.decisions.find((entry) => entry.entityId === 2);
  assert(sensorCalls.includes('2:2'), 'authored doctrine member receives its deterministic three-tick stagger slot');
  assert.equal(decisionAtTick2.directive.objective.kind, 'focus',
    'telegraph fixture actor must own a current squad attack allocation');
  assert.equal(decisionAtTick2.combatDoctrine.targetId, null, 'fresh negative frame clears stale doctrine target');
  assert.equal(decisionAtTick2.action.actionId, null, 'fresh negative frame cannot start an attack action');
  assert.equal(state.entities.get(2).data.intent.fire, false);
  for (let tick = 3; tick <= 10; tick++) {
    state.tick = tick;
    tacticalAI.update(1 / 60, state);
  }
  const decision = tacticalAI.stack.lastResult.decisions.find((entry) => entry.entityId === 2);
  for (const actorId of actorIds) {
    const ticks = sensorCalls
      .filter((entry) => entry.endsWith(`:${actorId}`))
      .map((entry) => Number(entry.split(':')[0]));
    assert(ticks.length >= 1, `actor ${actorId} must receive a production sensor refresh`);
    for (let index = 1; index < ticks.length; index++) {
      const expectedFreshness = actorId === 2 ? 3 : 6;
      assert(ticks[index] - ticks[index - 1] <= expectedFreshness,
        `actor ${actorId} sensor freshness must stay within its bounded stagger`);
    }
  }
  assert.equal(decision.combatDoctrine.targetId, targetId,
    'authored doctrine member reacquires from a later fresh staggered frame');
  return {
    memberCount: actorIds.length,
    memberBatchSize: tacticalAI.stack.memberBatchSize,
    memberBatchTargetTicks: tacticalAI.stack.memberBatchTargetTicks,
    memberBatchSpreadTicks: tacticalAI.stack.memberBatchSpreadTicks,
    executorMinCommitTicks: tacticalAI.stack.executor.config.minCommitTicks,
    selectorMinCommitTicks: tacticalAI.stack.selector.config.minCommitTicks,
    decisionTicks: Array.from({ length: 11 }, (_, tick) => tick),
    tick2SensorCalls: sensorCalls.filter((entry) => entry.startsWith('2:')).sort(),
    telegraphs: telegraphs.filter((entry) => entry.entityId === 2),
    doctrineActionStarts: starts.filter((entry) => entry.entityId === 2),
    maneuverRequests: maneuverRequests.length,
  };
}

function runLiveCase({ name, activityKind, roe, wanted, combatDoctrineId = null, ticks = 4, targetX = 360, tetherAfterTick = null }) {
  const state = makeState({ activityKind, roe, wanted, combatDoctrineId, targetX, tetherAfterTick });
  const maneuverRequests = [];
  const actionStarts = [];
  const telegraphs = [];
  const bus = createBus();
  bus.on('ai:telegraph', (payload) => telegraphs.push(payload));
  const tacticalAI = createTacticalAISystem({
    seed: 0x06110600,
    sensors: { frameFor: (_entityId, tick) => sensorFrame(state, tick) },
    roster: { listSquads: () => tacticalRoster(combatDoctrineId) },
    maneuver: { request: (request) => { maneuverRequests.push(request); return true; } },
    actionPortFactory: () => actionPort(actionStarts, state),
    config: {
      runtime: { decisionIntervalTicks: 1 },
      trace: { enabled: false },
      squad: { minTacticTicks: 1 },
      behavior: { minCommitTicks: 1, switchMargin: 0 },
      utility: { minCommitTicks: 1, switchMargin: 0 },
    },
  });
  tacticalAI.init({ state, bus, helpers: {} });
  let firstFireTick = null;
  let firstHostileAcquisitionTick = null;
  let hostileAcquisitions = 0;
  for (let tick = 0; tick < ticks; tick++) {
    state.tick = tick;
    state.simTime = tick / 60;
    tacticalAI.update(1 / 60, state);
    if (state.entities.get(2).data.intent?.fire && firstFireTick == null) firstFireTick = tick;
    const decision = tacticalAI.stack.lastResult?.decisions?.find((entry) => entry.entityId === 2);
    const objective = decision?.directive?.objective;
    if (objective?.kind === ObjectiveKind.FOCUS && objective.targetId === state.playerId) {
      hostileAcquisitions++;
      if (firstHostileAcquisitionTick == null) firstHostileAcquisitionTick = tick;
    }
  }
  const npc = state.entities.get(2);
  return {
    name,
    fireIntent: !!(npc.data.intent && npc.data.intent.fire),
    actionStarts: actionStarts.length,
    starts: actionStarts,
    telegraphs,
    firstFireTick,
    hostileAcquisitions,
    firstHostileAcquisitionTick,
    maneuverKinds: [...new Set(maneuverRequests.map((request) => request.kind))].sort(),
  };
}

function makeState({ activityKind, roe, wanted, combatDoctrineId, targetX, tetherAfterTick }) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: targetX, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 14,
    data: {},
  };
  const npc = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    hull: 100,
    hullMax: 100,
    cap: 100,
    capMax: 100,
    data: {
      ai: {
        squadId: `sg06_live_${activityKind}`,
        doctrine: roe === RulesOfEngagement.LAWFUL_WANTED_ONLY ? 'official' : 'scavenger',
        activity: normalizeActivity({
          kind: activityKind,
          reason: `live_check:${activityKind}`,
          anchor: { x: 0, z: 0 },
          leashRadius: 1200,
          startedTick: 0,
        }),
        roe,
        combatDoctrineId,
        lawful: roe === RulesOfEngagement.LAWFUL_WANTED_ONLY,
        hostileTeams: roe === RulesOfEngagement.LAWFUL_WANTED_ONLY ? [] : [0],
        motive: roe === RulesOfEngagement.LAWFUL_WANTED_ONLY ? 'law_enforcement' : 'assigned_interdiction',
        engagementTrigger: roe === RulesOfEngagement.LAWFUL_WANTED_ONLY ? 'wanted_status' : 'authorized_hostile_spawn',
        zoneId: 'zone_fixture_hostile',
        approachTelegraph: combatDoctrineId === CombatDoctrineId.RANGED_DISENGAGER ? 'weapon_charge' : 'engine_flare',
        noFireResponseWindowS: 1,
      },
      weapons: [{ defId: 'fixture_laser', projSpeed: 420 }],
      combat: {},
    },
  };
  return {
    tick: 0,
    simTime: 0,
    playerId: 1,
    player: { heat: wanted ? 0.3 : 0 },
    entities: new Map([[1, player], [2, npc]]),
    combat: { trace: { events: [] } },
    fixture: { tetherAfterTick },
  };
}

function tacticalRoster(combatDoctrineId = null) {
  return [{
    id: 'sg06_live_fixture',
    doctrine: 'scavenger',
    faction: 'faction_reach',
    formation: 'wedge',
    formationSpacing: 72,
    formationBound: 170,
    members: [{
      id: 2,
      preferredRole: 'striker',
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
      combatDoctrineId,
    }],
  }];
}

function defaultBatchRoster(actorIds) {
  return [{
    id: 'production_default_five_ship', doctrine: 'scavenger', faction: 'fixture', formation: 'wedge',
    members: actorIds.map((id) => ({
      id,
      // id 2 is the doctrine refresh probe. Keep it in a striker lane; an authored ranged support
      // correctly screens after the two light-target attacker slots are allocated and must not run
      // a combat doctrine from reserve.
      capabilities: id === 2
        ? ['drive', 'sensor', 'weapon']
        : ['drive', 'sensor', 'weapon', 'ranged'],
      combatDoctrineId: id === 2 ? CombatDoctrineId.INTERCEPTOR_FLYBY : null,
    })),
  }];
}

function defaultBatchState(actorIds, targetId) {
  const entities = new Map();
  for (const id of actorIds) {
    entities.set(id, {
      id, type: 'ship', alive: true, team: 1,
      pos: { x: 0, z: id * 12 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
      data: {
        ai: {
          activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'production_default_batch', anchor: { x: 0, z: 0 }, leashRadius: 2600, startedTick: 0 }),
          roe: RulesOfEngagement.WEAPONS_FREE,
          combatDoctrineId: id === 2 ? CombatDoctrineId.INTERCEPTOR_FLYBY : null,
        },
        intent: {},
        weapons: [{ projSpeed: 420 }],
      },
    });
  }
  entities.set(targetId, {
    id: targetId, type: 'ship', alive: true, team: 2,
    pos: { x: 190, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, data: {},
  });
  return {
    tick: 0, playerId: targetId, player: { heat: 0 }, meta: { seed: 47 }, entities,
    combat: { trace: { events: [] } },
  };
}

function defaultBatchFrame(entityId, tick, contacts) {
  return {
    tick,
    self: {
      id: entityId, team: 1,
      pos: { x: 0, z: entityId * 12 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
      hullFraction: 1, energyFraction: 1, heatFraction: 0, disabled: false, tethered: false,
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'], subsystemFractions: {},
      activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'production_default_batch', anchor: { x: 0, z: 0 }, leashRadius: 2600, startedTick: 0 }),
      roe: RulesOfEngagement.WEAPONS_FREE,
      combatDoctrineId: entityId === 2 ? CombatDoctrineId.INTERCEPTOR_FLYBY : null,
    },
    contacts,
    events: [],
  };
}

function defaultBatchTarget(targetId) {
  return {
    id: targetId, kind: ContactKind.SHIP, team: 2, classification: 'live_hostile',
    pos: { x: 190, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    confidence: 1, threat: 0.9, hostile: true, alive: true, valid: true, visible: true,
    tags: ['armed'],
  };
}

function sensorFrame(state, tick) {
  const npc = state.entities.get(2);
  const player = state.entities.get(1);
  const lawfulGate = npc.data.ai.roe === RulesOfEngagement.LAWFUL_WANTED_ONLY;
  const hostile = !lawfulGate || state.player.heat >= 0.15;
  const tethered = Number.isInteger(state.fixture?.tetherAfterTick) && tick >= state.fixture.tetherAfterTick;
  const contacts = [{
      id: player.id,
      kind: ContactKind.SHIP,
      team: player.team,
      classification: 'player_ship_sensor_track',
      pos: { ...player.pos },
      vel: { ...player.vel },
      radius: player.radius,
      confidence: 1,
      threat: hostile ? 0.9 : 0,
      hostile,
      tethered,
      tags: ['armed'],
      operationalMassBand: 'heavy',
      mobilityBand: 'medium',
      cargoBand: 'valuable',
      tetherabilityBand: tethered ? 'poor' : 'excellent',
    }];
  if (tethered) contacts.push({
    id: 'att_live_1', attachmentId: 'att_live_1', kind: ContactKind.TETHER,
    team: npc.team, classification: 'attachment_massline', pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 },
    radius: 2, confidence: 1, threat: 0.8, hostile: true, targetId: player.id, ownerId: npc.id,
    exposed: true, ownedBySelf: true, tethered: true, operationalMassBand: 'light', mobilityBand: 'low',
    cargoBand: 'empty', tetherabilityBand: 'poor', tags: ['massline', 'owned_by_self'],
  });
  return {
    tick,
    self: {
      id: npc.id,
      team: npc.team,
      pos: { ...npc.pos },
      vel: { ...npc.vel },
      rot: npc.rot,
      radius: npc.radius,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
      subsystemFractions: {},
      activity: npc.data.ai.activity,
      roe: npc.data.ai.roe,
      combatDoctrineId: npc.data.ai.combatDoctrineId,
    },
    contacts,
    events: [],
  };
}

function actionPort(starts, state) {
  return {
    list() {
      return [{
        id: 'action_burst',
        tags: ['attack'],
        minCommitTicks: 1,
        switchMargin: 0,
        range: 700,
        preferredRange: 220,
        targetKinds: [ContactKind.SHIP],
      }, {
        id: 'action_attach',
        tags: ['tug', 'steal'],
        minCommitTicks: 1,
        switchMargin: 0,
        range: 140,
        preferredRange: 90,
        targetKinds: [ContactKind.SHIP],
      }, {
        id: 'action_reel',
        tags: ['tug'],
        minCommitTicks: 1,
        switchMargin: 0,
        range: 0,
        preferredRange: 0,
        targetKinds: [ContactKind.TETHER],
      }];
    },
    canStart() { return { ok: true, reason: 'fixture_ok' }; },
    start(entityId, actionId, request) {
      starts.push({ entityId, actionId, targetId: request.targetId, tick: request.tick });
      return { entityId, actionId, startedTick: request.tick };
    },
    status(_entityId, handle) { return state.tick - (handle?.startedTick ?? state.tick) >= 2 ? 'completed' : 'running'; },
    interrupt() { return true; },
  };
}

function createBus() {
  const listeners = new Map();
  return {
    on(name, fn) {
      let set = listeners.get(name);
      if (!set) listeners.set(name, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(name, payload) {
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
