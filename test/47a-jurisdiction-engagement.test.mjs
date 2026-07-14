import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAIEngagement,
  is47aScavengerCounterplayAuthorized,
} from '../src/ai/engagementAuthority.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';

function makeState({
  simTime = 20,
  playerX = 1250,
  actorId = 'scavenger_harasser',
  motive = 'screen_recovery_claim',
  doctrineId = actorId === 'scavenger_thief' ? 'tether_control_raider' : 'ranged_disengager',
  activated = true,
  trigger = 'explicit_refusal',
} = {}) {
  const player = ship(1, 0, playerX, {});
  const actor = ship(2, 1, 1300, {
    liveColdStartSafe: true,
    dormantUntilBeat: 'scavenger_arrival',
    passive: false,
    lawful: false,
    motive,
    engagementTrigger: trigger,
    zoneId: 'zone_47a_wreck_field',
    approachTelegraph: 'weapon_charge',
    noFireResponseWindowS: 1,
    combatDoctrineId: doctrineId,
    roe: RulesOfEngagement.WEAPONS_FREE,
    activity: normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'combat_doctrine:ranged_disengager:fire_window',
      anchor: { x: 1300, z: 0 },
      leashRadius: 2600,
      startedTick: 1000,
      targetId: 1,
      encounterId: 'scenario.47a.mass-discrepancy',
    }),
  });
  actor.data.scenarioActorId = actorId;
  actor.data._liveColdStartActivated = activated;
  actor.data.combat = { targetId: player.id, lockTarget: player.id };
  actor.data.intent = { fire: true, fireGroup: 'primary' };
  const station = {
    id: 3,
    type: 'station',
    alive: true,
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 0, z: 0 },
    data: { stationId: 'station_helios', dockRadius: 72 },
  };
  const entities = new Map([[player.id, player], [actor.id, actor], [station.id, station]]);
  return {
    mode: 'flight',
    tick: 1200,
    simTime,
    playerId: player.id,
    player: { heat: 0 },
    story: { beatIndex: 2 },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    scenario: {
      active: { id: 'scenario.47a.mass-discrepancy' },
      actorBindings: {
        [actorId]: { status: 'bound', entityId: actor.id },
      },
      safeOpening: {
        spindleClaimed: true,
        demandIssuedAt: 7,
        response: 'refuse',
        noFireUntilS: 20,
      },
    },
    entities,
    entityList: [...entities.values()],
  };
}

function ship(id, team, x, ai) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    data: { ai: { ...ai }, combat: {}, intent: { fire: false } },
  };
}

function authorize(state) {
  return authorizeAIEngagement({
    state,
    self: state.entities.get(2),
    target: state.entities.get(1),
    tick: state.tick,
    objectiveReason: 'combat_doctrine:ranged_disengager:fire_window',
    hostile: true,
  });
}

function runLawSecurity(state) {
  lawSecurity.init({
    state,
    bus: { on() {}, emit() {} },
    helpers: {},
  });
  lawSecurity.update(1 / 60, state);
}

test('47-A REFUSE remains fail-closed until the exact authored no-fire deadline', () => {
  const before = makeState({ simTime: 19.999 });
  assert.equal(is47aScavengerCounterplayAuthorized(before, before.entities.get(2), before.entities.get(1)), false);
  assert.deepEqual(authorize(before), { ok: false, reason: 'station_protection' });
  runLawSecurity(before);
  assert.equal(before.entities.get(2).data.ai.passive, true);
  assert.equal(before.entities.get(2).data.ai.engagementTrigger, 'jurisdiction_withdrawal');

  const atDeadline = makeState({ simTime: 20 });
  assert.equal(is47aScavengerCounterplayAuthorized(atDeadline, atDeadline.entities.get(2), atDeadline.entities.get(1)), true);
  assert.deepEqual(authorize(atDeadline), { ok: true, reason: 'authorized' });
  runLawSecurity(atDeadline);
  assert.equal(atDeadline.entities.get(2).data.ai.passive, false);
  assert.equal(atDeadline.entities.get(2).data.ai.engagementTrigger, 'explicit_refusal');
  assert.equal(atDeadline.entities.get(2).data.combat.targetId, atDeadline.playerId);
});

test('the exception is limited to the two authored actors and the outer 200-WU seam', () => {
  const thief = makeState({ actorId: 'scavenger_thief', motive: 'recover_evidence_spindle' });
  assert.equal(is47aScavengerCounterplayAuthorized(thief, thief.entities.get(2), thief.entities.get(1)), true);

  const genericPirate = makeState({ actorId: 'ambient_pirate' });
  assert.equal(is47aScavengerCounterplayAuthorized(genericPirate, genericPirate.entities.get(2), genericPirate.entities.get(1)), false);
  assert.deepEqual(authorize(genericPirate), { ok: false, reason: 'station_protection' });
  runLawSecurity(genericPirate);
  assert.equal(genericPirate.entities.get(2).data.ai.passive, true);
  assert.equal(genericPirate.entities.get(2).data.ai.roe, RulesOfEngagement.HOLD_FIRE);

  const spoofedActor = makeState();
  spoofedActor.scenario.actorBindings.scavenger_harasser.entityId = 999;
  assert.equal(is47aScavengerCounterplayAuthorized(spoofedActor, spoofedActor.entities.get(2), spoofedActor.entities.get(1)), false);
  assert.deepEqual(authorize(spoofedActor), { ok: false, reason: 'station_protection' });

  const innerSanctuary = makeState({ playerX: 1199 });
  assert.equal(is47aScavengerCounterplayAuthorized(innerSanctuary, innerSanctuary.entities.get(2), innerSanctuary.entities.get(1)), false);
  assert.deepEqual(authorize(innerSanctuary), { ok: false, reason: 'station_protection' });

  const forgedPatrol = makeState();
  const patrol = forgedPatrol.entities.get(2);
  patrol.data.ai.lawful = true;
  patrol.data.ai.motive = 'law_enforcement';
  assert.equal(is47aScavengerCounterplayAuthorized(forgedPatrol, patrol, forgedPatrol.entities.get(1)), false);
});
