#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ContactKind } from '../src/ai/contracts.js';
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
  name: 'weapons_free_attack',
  activityKind: ActivityKind.ATTACK_RUN,
  roe: RulesOfEngagement.WEAPONS_FREE,
  wanted: false,
});
assert.equal(pirate.fireIntent, true, 'weapons-free live SG-06 case should arm visible weapon intent');
assert(pirate.maneuverKinds.includes('intercept'), 'weapons-free attack should produce controlled intercept movement');

const lawfulClean = runLiveCase({
  name: 'lawful_clean',
  activityKind: ActivityKind.PATROL_ROUTE,
  roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
  wanted: false,
});
assert.equal(lawfulClean.fireIntent, false, 'lawful patrol must not fire on a clean player');
assert.equal(lawfulClean.actionStarts, 0, 'lawful patrol should not even start an attack action against a clean player');

const lawfulWanted = runLiveCase({
  name: 'lawful_wanted',
  activityKind: ActivityKind.PATROL_ROUTE,
  roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
  wanted: true,
});
assert.equal(lawfulWanted.fireIntent, true, 'lawful patrol may fire once WANTED heat makes the target legal');

process.stdout.write(JSON.stringify({
  schema: 'spaceface.ai.telegraphs_live_sg06.v1',
  cases: [hold, pirate, lawfulClean, lawfulWanted],
  deterministic: true,
}, null, 2) + '\n');

function runLiveCase({ name, activityKind, roe, wanted }) {
  const state = makeState({ activityKind, roe, wanted });
  const maneuverRequests = [];
  const actionStarts = [];
  const tacticalAI = createTacticalAISystem({
    seed: 0x06110600,
    sensors: { frameFor: (_entityId, tick) => sensorFrame(state, tick) },
    roster: { listSquads: () => tacticalRoster() },
    maneuver: { request: (request) => { maneuverRequests.push(request); return true; } },
    actionPortFactory: () => actionPort(actionStarts),
    config: {
      runtime: { decisionIntervalTicks: 1 },
      trace: { enabled: false },
      squad: { minTacticTicks: 1 },
      behavior: { minCommitTicks: 1, switchMargin: 0 },
      utility: { minCommitTicks: 1, switchMargin: 0 },
    },
  });
  tacticalAI.init({ state, bus: null, helpers: {} });
  for (let tick = 0; tick < 4; tick++) {
    state.tick = tick;
    tacticalAI.update(1 / 60, state);
  }
  const npc = state.entities.get(2);
  return {
    name,
    fireIntent: !!(npc.data.intent && npc.data.intent.fire),
    actionStarts: actionStarts.length,
    maneuverKinds: [...new Set(maneuverRequests.map((request) => request.kind))].sort(),
  };
}

function makeState({ activityKind, roe, wanted }) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
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
    pos: { x: -360, z: 0 },
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
          anchor: { x: -360, z: 0 },
          leashRadius: 1200,
          startedTick: 0,
        }),
        roe,
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
  };
}

function tacticalRoster() {
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
    }],
  }];
}

function sensorFrame(state, tick) {
  const npc = state.entities.get(2);
  const player = state.entities.get(1);
  const lawfulGate = npc.data.ai.roe === RulesOfEngagement.LAWFUL_WANTED_ONLY;
  const hostile = !lawfulGate || state.player.heat >= 0.15;
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
    },
    contacts: [{
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
      tags: ['armed'],
    }],
    events: [],
  };
}

function actionPort(starts) {
  return {
    list() {
      return [{
        id: 'fixture_attack',
        tags: ['attack'],
        minCommitTicks: 1,
        switchMargin: 0,
        range: 700,
        preferredRange: 220,
        targetKinds: [ContactKind.SHIP],
      }];
    },
    canStart() { return { ok: true, reason: 'fixture_ok' }; },
    start(entityId, actionId, request) {
      starts.push({ entityId, actionId, targetId: request.targetId });
      return `${entityId}:${starts.length}`;
    },
    status() { return 'running'; },
    interrupt() { return true; },
  };
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
