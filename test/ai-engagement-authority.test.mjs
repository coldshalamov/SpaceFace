import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAIEngagement,
  isOffensiveActionDef,
  protectedStationAt,
} from '../src/ai/engagementAuthority.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { clearIneligibleAIFiringIntents } from '../src/systems/aiPorts.js';

function ship(id, team, pos, ai = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: {
      ai: { ...ai },
      intent: { fire: false },
      combat: {},
    },
  };
}

function authorizedAI(overrides = {}) {
  return {
    passive: false,
    lawful: false,
    motive: 'cargo_extortion',
    engagementTrigger: 'explicit_refusal',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 0.5,
    combatDoctrineId: 'interceptor_flyby',
    activity: normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'pirate_toll:refused',
      anchor: { x: 1400, z: 0 },
      leashRadius: 2200,
      startedTick: 100,
    }),
    roe: RulesOfEngagement.WEAPONS_FREE,
    ...overrides,
  };
}

function stateWith(ai = authorizedAI(), options = {}) {
  const player = ship(1, 0, options.playerPos || { x: 1400, z: 0 });
  const enemy = ship(2, 1, options.enemyPos || { x: 1200, z: 0 }, ai);
  const station = {
    id: 3,
    type: 'station',
    alive: true,
    factionId: 'faction_scn',
    pos: options.stationPos || { x: 0, z: 0 },
    radius: 42,
    data: { stationId: 'station_helios', dockRadius: 72 },
  };
  const entities = new Map([[1, player], [2, enemy], [3, station]]);
  return {
    tick: options.tick ?? 130,
    playerId: 1,
    player: { heat: options.wanted ? 0.3 : 0 },
    world: { currentSectorId: options.sectorId || 'sector_helios_prime' },
    entities,
    entityList: [...entities.values()],
    combat: { trace: { events: options.events || [] } },
  };
}

function authorize(state, overrides = {}) {
  const self = state.entities.get(2);
  const target = state.entities.get(1);
  return authorizeAIEngagement({
    state,
    self,
    target,
    tick: state.tick,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
    hostile: true,
    recentlyDamaged: false,
    ...overrides,
  });
}

test('offensive action detection follows effects/tags instead of one action id', () => {
  assert.equal(isOffensiveActionDef({ tags: ['weapon', 'burst'], effects: [] }), true);
  assert.equal(isOffensiveActionDef({ tags: [], effects: [{ type: 'damage' }] }), true);
  assert.equal(isOffensiveActionDef({ tags: ['tether'], effects: [{ type: 'createAttachment' }] }), false);
});

test('missing motive, trigger, zone, telegraph, or doctrine fails closed', () => {
  for (const key of ['motive', 'engagementTrigger', 'zoneId', 'approachTelegraph', 'combatDoctrineId']) {
    const state = stateWith(authorizedAI({ [key]: null }));
    const result = authorize(state);
    assert.equal(result.ok, false, `${key} must be required`);
    assert.match(result.reason, new RegExp(key === 'combatDoctrineId' ? 'doctrine' : key, 'i'));
  }
});

test('response/telegraph window and exact doctrine fire phase are authoritative', () => {
  const early = stateWith(authorizedAI(), { tick: 129 });
  assert.deepEqual(authorize(early), { ok: false, reason: 'response_window' });

  const wrongPhase = stateWith();
  assert.deepEqual(authorize(wrongPhase, {
    objectiveReason: 'combat_doctrine:interceptor_flyby:engine_flare',
  }), { ok: false, reason: 'doctrine_fire_window' });

  assert.deepEqual(authorize(stateWith(authorizedAI(), {
    playerPos: { x: 1600, z: 0 },
  })), { ok: true, reason: 'authorized' });
});

test('fresh hostility is mandatory even if a stale decision names the player', () => {
  assert.deepEqual(authorize(stateWith(), { hostile: false }), { ok: false, reason: 'target_not_hostile' });
});

test('Helios station protection blocks criminal fire but permits lawful wanted enforcement', () => {
  const criminal = stateWith(authorizedAI(), { playerPos: { x: 900, z: 0 } });
  assert.equal(protectedStationAt(criminal, criminal.entities.get(1))?.stationId, 'station_helios');
  assert.deepEqual(authorize(criminal), { ok: false, reason: 'station_protection' });

  const law = stateWith(authorizedAI({
    lawful: true,
    motive: 'law_enforcement',
    engagementTrigger: 'wanted_status',
    zoneId: 'zone_helios_core',
  }), { playerPos: { x: 900, z: 0 }, wanted: true });
  assert.deepEqual(authorize(law, { wanted: true }), { ok: true, reason: 'authorized' });
});

test('the full Helios starter sanctuary is protected even beyond the station patrol ring', () => {
  const inside = stateWith(authorizedAI(), {
    playerPos: { x: 1390, z: 0 },
    enemyPos: { x: 1600, z: 0 },
    // Keep the physical station far away so this assertion exercises the starter sanctuary,
    // not the ordinary station-centered patrol radius.
    stationPos: { x: 3200, z: 0 },
  });
  assert.equal(protectedStationAt(inside, inside.entities.get(1))?.stationId, 'station_helios');
  assert.deepEqual(authorize(inside), { ok: false, reason: 'station_protection' });

  const outside = stateWith(authorizedAI(), {
    playerPos: { x: 1410, z: 0 },
    enemyPos: { x: 1600, z: 0 },
    stationPos: { x: 3200, z: 0 },
  });
  assert.equal(protectedStationAt(outside, outside.entities.get(1)), null);
  assert.deepEqual(authorize(outside), { ok: true, reason: 'authorized' });
});

test('passive and hold-fire transitions clear stale weapon intent in the live AI port sweep', () => {
  const passive = stateWith(authorizedAI({ passive: true }));
  passive.entities.get(2).data.intent = { fire: true, fireGroup: 'primary' };
  assert.equal(clearIneligibleAIFiringIntents(passive), 1);
  assert.equal(passive.entities.get(2).data.intent.fire, false);
  assert.equal(passive.entities.get(2).data.intent.fireGroup, null);

  const hold = stateWith(authorizedAI({ roe: RulesOfEngagement.HOLD_FIRE }));
  hold.entities.get(2).data.intent.fire = true;
  assert.equal(clearIneligibleAIFiringIntents(hold), 1);
  assert.equal(hold.entities.get(2).data.intent.fire, false);
});
