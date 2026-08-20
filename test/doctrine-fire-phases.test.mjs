/**
 * Live engagement-authority fire windows must match the phases combatDoctrine advertises.
 * A missing table key fail-closes the guns even while fireWindow is true (brawler / capital).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { CombatDoctrineId } from '../src/ai/combatDoctrine.js';

function ship(id, team, pos, ai = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { ai: { ...ai }, intent: { fire: false }, combat: {} },
  };
}

function stateFor(doctrineId) {
  const player = ship(1, 0, { x: 1600, z: 0 });
  const enemy = ship(2, 1, { x: 1200, z: 0 }, {
    passive: false,
    lawful: false,
    forcePlayerTarget: true,
    hostileTeams: [0],
    motive: 'cargo_extortion',
    engagementTrigger: 'explicit_refusal',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    combatDoctrineId: doctrineId,
    activity: normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'doctrine_fire_phase_test',
      anchor: { x: 1400, z: 0 },
      leashRadius: 2200,
      startedTick: 100,
    }),
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  return {
    tick: 200,
    playerId: 1,
    player: { heat: 0 },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[1, player], [2, enemy]]),
    entityList: [player, enemy],
    combat: { trace: { events: [] } },
    self: enemy,
    target: player,
  };
}

function ask(state, phase) {
  return authorizeAIEngagement({
    state,
    self: state.self,
    target: state.target,
    tick: 200,
    objectiveReason: `combat_doctrine:${state.self.data.ai.combatDoctrineId}:${phase}`,
    hostile: true,
  });
}

const CASES = [
  [CombatDoctrineId.INTERCEPTOR_FLYBY, 'strike', true],
  [CombatDoctrineId.INTERCEPTOR_FLYBY, 'commit', true],
  [CombatDoctrineId.INTERCEPTOR_FLYBY, 'ingress', false],
  [CombatDoctrineId.BRAWLER_COMMIT, 'commit', true],
  [CombatDoctrineId.BRAWLER_COMMIT, 'engine_flare', false],
  [CombatDoctrineId.CAPITAL_BROADSIDE, 'broadside_fire', true],
  [CombatDoctrineId.CAPITAL_BROADSIDE, 'broadside_charge', false],
  [CombatDoctrineId.RANGED_DISENGAGER, 'fire_window', true],
  [CombatDoctrineId.FIELD_ANCHOR_CONTROLLER, 'anchor_hold', true],
  [CombatDoctrineId.TETHER_CONTROL_RAIDER, 'control', false],
];

test('doctrine fire phases: advertised gun windows authorize; telegraph/egress do not', () => {
  for (const [doctrineId, phase, expectOk] of CASES) {
    const state = stateFor(doctrineId);
    const result = ask(state, phase);
    assert.equal(
      result.ok,
      expectOk,
      `${doctrineId}:${phase} expected ok=${expectOk}, got ${result.ok} (${result.reason})`,
    );
    if (!expectOk) assert.equal(result.reason, 'doctrine_fire_window');
  }
});
