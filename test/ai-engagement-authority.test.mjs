import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAIEngagement,
  inspectFirstSessionAttackerOwnership,
  isHostileForAI,
  isOffensiveActionDef,
  maintainFirstSessionAttackerOwnership,
  protectedStationAt,
  refreshFirstSessionAttackerOwnership,
} from '../src/ai/engagementAuthority.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { clearIneligibleAIFiringIntents } from '../src/systems/aiPorts.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

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
    forcePlayerTarget: true,
    hostileTeams: [0],
    motive: 'cargo_extortion',
    engagementTrigger: 'explicit_refusal',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
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
    tick: options.tick ?? 160,
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
  const early = stateWith(authorizedAI(), { tick: 159 });
  assert.deepEqual(authorize(early), { ok: false, reason: 'response_window' });

  const wrongPhase = stateWith();
  assert.deepEqual(authorize(wrongPhase, {
    objectiveReason: 'combat_doctrine:interceptor_flyby:engine_flare',
  }), { ok: false, reason: 'doctrine_fire_window' });

  assert.deepEqual(authorize(stateWith(authorizedAI(), {
    playerPos: { x: 1600, z: 0 },
  })), { ok: true, reason: 'authorized' });
});

test('station protection uses the live station index without scanning unrelated entities', () => {
  const state = stateWith(authorizedAI({ lawful: true, engagementTrigger: 'wanted_status' }), {
    wanted: true,
    sectorId: 'sector_tethys_junction',
    playerPos: { x: 40, z: 0 },
    stationPos: { x: 0, z: 0 },
  });
  const station = state.entities.get(3);
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ready: true,
    stations: [station],
  };
  state.entityList = new Proxy(state.entityList, {
    get(target, property, receiver) {
      if (property === 'filter' || property === Symbol.iterator) {
        throw new Error('full entity list must not be scanned when the station index is ready');
      }
      return Reflect.get(target, property, receiver);
    },
  });

  assert.equal(protectedStationAt(state, state.entities.get(state.playerId))?.entityId, station.id);
});

test('sub-second response windows fail closed at the production engagement seam', () => {
  const state = stateWith(authorizedAI({ noFireResponseWindowS: 0.5 }), {
    tick: 160,
    playerPos: { x: 1600, z: 0 },
  });
  assert.deepEqual(authorize(state), { ok: false, reason: 'noFireResponseWindowS' });
});

test('late-spawned threats start their response clock when they enter the live scene', () => {
  const spec = makeEnemySpawnSpec('reaver_pirate', 1, { x: 180, z: 0 }, { startedTick: 6000 });
  assert.equal(spec.data.ai.activity.startedTick, 6000,
    'a late ambient spawn must not inherit the new-game tick-zero response clock');
});

test('first-session combat permits at most two simultaneous attackers on the player', () => {
  const state = stateWith(authorizedAI(), { playerPos: { x: 1600, z: 0 } });
  for (const id of [4, 5]) {
    const attacker = ship(id, 1, { x: 1500 + id, z: id * 10 }, authorizedAI());
    attacker.data.intent.fire = true;
    attacker.data.combat.targetId = state.playerId;
    state.entities.set(id, attacker);
    state.entityList.push(attacker);
  }
  refreshFirstSessionAttackerOwnership(state, [5, 4, 2].map((id) => ownershipDecision(id, 'strike', 'action_burst')));

  assert.deepEqual(authorize(state, { self: state.entities.get(5) }),
    { ok: false, reason: 'first_session_attacker_cap' });

  state.tick = 60 * 60 * 10;
  assert.deepEqual(authorize(state, { self: state.entities.get(5) }), { ok: true, reason: 'authorized' },
    'the novice cap is a first-session pacing rule, not a permanent challenge reduction');
});

test('four offensive actors receive two stable ownership slots across ingress, cooldown, and reform', () => {
  const state = ownershipState([5, 2, 4, 3]);
  refreshFirstSessionAttackerOwnership(state, [
    ownershipDecision(5, 'ingress', null),
    ownershipDecision(2, 'strike', 'action_burst'),
    ownershipDecision(4, 'reform', null),
    ownershipDecision(3, 'control', 'action_reel'),
  ]);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [2, 3],
    waiting: [4, 5],
  });

  refreshFirstSessionAttackerOwnership(state, [
    ownershipDecision(5, 'strike', 'action_burst'),
    ownershipDecision(2, 'reform', null),
    ownershipDecision(4, 'control', 'action_reel'),
    ownershipDecision(3, 'ingress', null),
  ]);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [2, 3],
    waiting: [4, 5],
  }, 'phase, cooldown, denied-fire, and non-burst action changes cannot churn ownership');
});

test('prepared ownership slots still fail closed when an actor leaves the ship authority', () => {
  const state = ownershipState([2]);
  const actor = state.entities.get(2);
  refreshFirstSessionAttackerOwnership(state, [ownershipDecision(2, 'strike', 'action_burst')]);
  actor.type = 'drone';

  assert.deepEqual(authorize(state, { self: actor }), {
    ok: false,
    reason: 'first_session_attacker_cap',
  });
  assert.equal(inspectFirstSessionAttackerOwnership(state, state.playerId), null);
});

test('death and disengage release immediately and promote overflow in stable order without starvation', () => {
  const state = ownershipState([5, 2, 4, 3]);
  const decisions = [5, 2, 4, 3].map((id) => ownershipDecision(id, 'ingress', null));
  refreshFirstSessionAttackerOwnership(state, decisions);

  state.entities.get(2).alive = false;
  refreshFirstSessionAttackerOwnership(state, decisions);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId)?.owners, [3, 4]);

  const actor3 = state.entities.get(3);
  actor3.data.ai.activity = normalizeActivity({
    kind: ActivityKind.DISENGAGE,
    reason: 'motive_collapsed',
    anchor: actor3.pos,
    startedTick: state.tick,
  });
  refreshFirstSessionAttackerOwnership(state, decisions);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [4, 5],
    waiting: [],
  });
});

test('between-decision maintenance releases invalid owners without rebuilding the decision batch', () => {
  const state = ownershipState([5, 2, 4, 3]);
  refreshFirstSessionAttackerOwnership(
    state,
    [5, 2, 4, 3].map((id) => ownershipDecision(id, 'ingress', null)),
  );

  state.entities.get(2).alive = false;
  assert.equal(maintainFirstSessionAttackerOwnership(state), 1);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [3, 4],
    waiting: [5],
  });

  state.entities.get(3).data.ai.roe = RulesOfEngagement.HOLD_FIRE;
  assert.equal(maintainFirstSessionAttackerOwnership(state), 1);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [4, 5],
    waiting: [],
  });
});

test('live deauthorization releases ownership and promotes every queued attacker in order', () => {
  const state = ownershipState([5, 2, 4, 3]);
  const decisions = [5, 2, 4, 3].map((id) => ownershipDecision(id, 'ingress', null));
  refreshFirstSessionAttackerOwnership(state, decisions);

  state.entities.get(2).data.ai.roe = RulesOfEngagement.HOLD_FIRE;
  refreshFirstSessionAttackerOwnership(state, decisions);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [3, 4],
    waiting: [5],
  });

  state.entities.get(3).data.ai.motiveSatisfied = true;
  refreshFirstSessionAttackerOwnership(state, decisions);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [4, 5],
    waiting: [],
  });
});

test('target changes and the end of the first-session window cannot leak ownership slots', () => {
  const state = ownershipState([2, 3, 4]);
  const alternate = ship(9, 0, { x: 1750, z: 80 });
  state.entities.set(alternate.id, alternate);
  state.entityList.push(alternate);
  refreshFirstSessionAttackerOwnership(state, [2, 3, 4].map((id) => ownershipDecision(id, 'ingress', null)));

  refreshFirstSessionAttackerOwnership(state, [
    ownershipDecision(2, 'ingress', null, alternate.id),
    ownershipDecision(3, 'ingress', null),
    ownershipDecision(4, 'ingress', null),
  ]);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [3, 4],
    waiting: [],
  });
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, alternate.id), {
    targetId: alternate.id,
    owners: [2],
    waiting: [],
  });

  state.tick = 60 * 60 * 10;
  refreshFirstSessionAttackerOwnership(state, []);
  assert.equal(inspectFirstSessionAttackerOwnership(state, state.playerId), null);
  assert.equal(inspectFirstSessionAttackerOwnership(state, alternate.id), null);
});

test('actors absent from a complete tactical batch release stale target ownership', () => {
  const state = ownershipState([2, 3, 4]);
  refreshFirstSessionAttackerOwnership(state, [2, 3, 4].map((id) => ownershipDecision(id, 'ingress', null)));
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [2, 3],
    waiting: [4],
  });

  refreshFirstSessionAttackerOwnership(state, [
    ownershipDecision(3, 'reform', null),
    ownershipDecision(4, 'ingress', null),
  ]);
  assert.deepEqual(inspectFirstSessionAttackerOwnership(state, state.playerId), {
    targetId: state.playerId,
    owners: [3, 4],
    waiting: [],
  }, 'a ship no longer present in the complete live decision batch must not hold a slot');
});

test('authorized fire records a deterministic motive and doctrine trace on the attacker', () => {
  const state = stateWith(authorizedAI(), { playerPos: { x: 1600, z: 0 } });
  const enemy = state.entities.get(2);
  applyAIFiringIntent({
    entityId: enemy.id,
    directive: {
      tactic: 'swarm_pincer',
      objective: {
        kind: ObjectiveKind.FOCUS,
        targetId: state.playerId,
        reason: 'combat_doctrine:interceptor_flyby:strike',
      },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: { doctrineId: 'interceptor_flyby', phase: 'strike', fireWindow: true },
  }, state);

  assert.equal(enemy.data.intent.fire, true);
  assert.deepEqual(enemy.data.ai.lastAggressionTrace, {
    tick: state.tick,
    targetId: state.playerId,
    motive: 'cargo_extortion',
    engagementTrigger: 'explicit_refusal',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    tactic: 'swarm_pincer',
    doctrineId: 'interceptor_flyby',
    doctrinePhase: 'strike',
  });
});

function ownershipState(ids) {
  const state = stateWith(authorizedAI(), { playerPos: { x: 1600, z: 0 } });
  state.entities.delete(2);
  state.entityList = state.entityList.filter((entity) => entity.id !== 2);
  for (const id of ids) {
    const actor = ship(id, 1, { x: 1450 + id * 8, z: id * 12 }, authorizedAI());
    actor.data.combat.targetId = state.playerId;
    state.entities.set(id, actor);
    state.entityList.push(actor);
  }
  return state;
}

function ownershipDecision(entityId, phase, actionId, targetId = 1) {
  return {
    entityId,
    directive: {
      tactic: 'swarm_pincer',
      objective: {
        kind: ObjectiveKind.FOCUS,
        targetId,
        reason: `combat_doctrine:interceptor_flyby:${phase}`,
      },
    },
    action: { actionId, targetId, status: actionId ? 'running' : 'idle' },
    combatDoctrine: {
      doctrineId: 'interceptor_flyby',
      phase,
      targetId,
      fireWindow: phase === 'strike',
    },
  };
}

test('fresh hostility is mandatory even if a stale decision names the player', () => {
  assert.deepEqual(authorize(stateWith(), { hostile: false }), { ok: false, reason: 'target_not_hostile' });
});

test('profit-motive fire requires a resolved escalation while vendettas remain distinct', () => {
  const pending = stateWith(authorizedAI({ engagementTrigger: 'demand_pending' }), {
    playerPos: { x: 1600, z: 0 },
  });
  assert.deepEqual(authorize(pending), { ok: false, reason: 'robbery_not_escalated' });

  const vendetta = stateWith(authorizedAI({
    motive: 'personal_vendetta',
    engagementTrigger: 'named_hunter_grudge',
  }), { playerPos: { x: 1600, z: 0 } });
  assert.deepEqual(authorize(vendetta), { ok: true, reason: 'authorized' });
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

test('lawful AI applies WANTED gating to wingmen the same way as the clean player', () => {
  const clean = stateWith(authorizedAI({
    lawful: true,
    motive: 'law_enforcement',
    engagementTrigger: 'wanted_status',
  }), { wanted: false });
  const patrol = clean.entities.get(2);
  const player = clean.entities.get(1);
  const wingman = ship('wing_1', 0, { x: 1410, z: 0 });
  clean.entities.set('wing_1', wingman);
  clean.entityList.push(wingman);

  assert.equal(isHostileForAI(clean, patrol, player), false);
  assert.equal(isHostileForAI(clean, patrol, wingman), false,
    'clean player flight must not read as hostile to lawful patrols');

  const wanted = stateWith(authorizedAI({
    lawful: true,
    motive: 'law_enforcement',
    engagementTrigger: 'wanted_status',
  }), { wanted: true });
  const wantedPatrol = wanted.entities.get(2);
  const wantedWing = ship('wing_2', 0, { x: 1410, z: 0 });
  assert.equal(isHostileForAI(wanted, wantedPatrol, wanted.entities.get(1)), true);
  assert.equal(isHostileForAI(wanted, wantedPatrol, wantedWing), true,
    'WANTED heat still marks the whole player flight hostile');

  const raider = stateWith(authorizedAI({ lawful: false }));
  const raiderShip = raider.entities.get(2);
  const raiderWing = ship('wing_3', 0, { x: 1410, z: 0 });
  assert.equal(isHostileForAI(raider, raiderShip, raiderWing), true,
    'non-lawful hostiles still treat wingmen as opposing team');
});
