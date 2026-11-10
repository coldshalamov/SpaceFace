import assert from 'node:assert/strict';
import test from 'node:test';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { suppressDefeatedLock } from '../src/ai/perception.js';
import { SquadCommander } from '../src/ai/squad.js';
import { bombInteractionState } from '../src/combat/bombDynamics.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import {
  capitalOpeningAnnouncement,
  resolveCapitalOpening,
} from '../src/combat/subsystems.js';
import { interactionDisplayName } from '../src/data/entityInteractionProfiles.js';
import {
  countermeasures,
  missileMatchesLineage,
  selectLockLineage,
} from '../src/systems/countermeasures.js';
import {
  clearDestroyedBombLocks,
  redirectLiveBomb,
} from '../src/systems/bombs.js';
import { ordnanceChargeDebit } from '../src/systems/impulseCharges.js';
import { guidanceAcceptsTarget, weaponBankReadiness, weapons } from '../src/systems/weapons.js';

test('one chaff use breaks one missile lock and leaves the other threat flying', () => {
  const events = [];
  const player = ship('player', 0, 0, {
    fittings: ['mod_chaff_dispenser_m'],
    identityGeneration: 7,
    cm: { stock: 1, cooldownT: 0, effectT: 0, effect: null },
  });
  const locked = shooter('alpha', 1, {
    lockTarget: 'player', lockProgress: 1, lockGeneration: 2, lockTargetGeneration: 7,
  }, [{ id: 'player', kind: 'ship', visible: true, ageTicks: 0, targetGeneration: 7 }, { kind: 'lock', id: 'alpha', lockLineage: { shooterId: 'alpha', generation: 2, targetId: 'player' } }, { id: 'bravo', kind: 'ship', visible: true }]);
  const other = shooter('bravo', 0.9, {
    lockTarget: 'player', lockProgress: 0.9, lockGeneration: 4, lockTargetGeneration: 7,
  });
  const building = shooter('charlie', 0.8, { lockTarget: 'player', lockProgress: 0.8, lockGeneration: 0 });
  const alphaMissile = missile('m-alpha', 'alpha', 'player', 2, 7, 30, 0);
  const bravoMissile = missile('m-bravo', 'bravo', 'player', 4, 7, -30, 0);
  const state = {
    mode: 'flight',
    simTime: 10,
    tick: 600,
    playerId: 'player',
    rng: () => 0,
    input: {},
    entities: new Map([
      ['player', player], ['alpha', locked], ['bravo', other], ['charlie', building],
      ['m-alpha', alphaMissile], ['m-bravo', bravoMissile],
    ]),
    entityList: [player, locked, other, building, alphaMissile, bravoMissile],
  };
  const host = Object.assign({}, countermeasures, {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _diag: { threatSpatialQueries: 0, effectSpatialQueries: 0, projectileCandidates: 0 },
    _projectileScratch: [],
    _cmQuiet: null,
  });

  assert.equal(host._tryDeploy(player), true);
  assert.equal(player.data.cm.stock, 0);
  assert.equal(events.some((event) => event.name === 'audio:cue' && event.payload.id === 'cm_chaff'), true);
  assert.equal(locked.data.combat.lockTarget, null);
  assert.equal(locked.data.combat.lockGeneration, 3);
  assert.equal(other.data.combat.lockTarget, 'player');
  assert.equal(other.data.combat.lockProgress, 0.9);
  assert.equal(building.data.combat.lockTarget, 'player');
  const lineage = player.data.cm.effect.lineage;
  assert.equal(lineage.shooterId, 'alpha');
  assert.equal(missileMatchesLineage(alphaMissile.data, lineage), true);
  assert.equal(missileMatchesLineage(bravoMissile.data, lineage), false);
  assert.equal(locked.data.perceptionContacts.some((contact) => contact.id === 'bravo'), true);
  assert.equal(locked.data.perceptionContacts.some((contact) => contact.kind === 'lock'), false);

  host.update(1 / 60, state);
  assert.equal(alphaMissile.alive, true);
  assert.equal(alphaMissile.collides, true);
  assert.equal(alphaMissile.data.diverted, true);
  assert.equal(bravoMissile.data.diverted, undefined);
  assert.equal(bravoMissile.data.targetId, 'player');

  events.length = 0;
  player.data.cm.cooldownT = 0;
  assert.equal(host._tryDeploy(player), false);
  assert.equal(player.data.cm.stock, 0);
  assert.equal(events.some((event) => event.name === 'countermeasure:deployed'), false);
  assert.equal(events.some((event) => event.name === 'audio:cue' && event.payload.id === 'cm_chaff'), false);
  assert.equal(events.find((event) => event.name === 'countermeasure:denied').payload.reason, 'empty');
});

test('cooldown refusal stays distinct from having no incoming lock', () => {
  const events = [];
  const cooling = ship('player', 0, 0, {
    fittings: ['mod_chaff_dispenser_m'],
    cm: { cooldownT: 4, effectT: 0, effect: null },
  });
  const bare = ship('idle', 10, 0, { fittings: ['mod_chaff_dispenser_m'], cm: { cooldownT: 0, effectT: 0, effect: null } });
  const state = {
    mode: 'flight', simTime: 3, tick: 20, playerId: 'player', rng: () => 0, input: {},
    entities: new Map([['player', cooling], ['idle', bare]]),
    entityList: [cooling, bare],
  };
  const host = Object.assign({}, countermeasures, {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _diag: { threatSpatialQueries: 0, effectSpatialQueries: 0, projectileCandidates: 0 },
    _projectileScratch: [],
  });
  host._tryDeploy(cooling);
  host._tryDeploy(bare);
  assert.deepEqual(events.filter((event) => event.name === 'countermeasure:denied').map((event) => event.payload.reason), ['cooldown', 'no_lock']);
  assert.equal(selectLockLineage(state, cooling), null);
});

test('a recycled target id cannot inherit an in-flight missile', () => {
  const oldBody = { id: 'mark', alive: true, pos: { x: 0, z: 80 }, vel: { x: 0, z: 0 }, data: { identityGeneration: 1 } };
  const round = missile('round', 'alpha', 'mark', 0, 1, 40, 0);
  round.vel = { x: 80, z: 0 };
  const newborn = { id: 'mark', alive: true, pos: { x: 0, z: 80 }, vel: { x: 0, z: 0 }, data: { identityGeneration: 2 } };
  assert.equal(guidanceAcceptsTarget(round.data, oldBody), true);
  assert.equal(guidanceAcceptsTarget(round.data, newborn), false);
  const state = { entityList: [round], simTime: 0, tick: 1 };
  const host = {
    helpers: { getEntity() { return newborn; } },
    state,
  };
  weapons._steerHoming.call(host, 0.5, state);
  assert.equal(round.alive, true);
  assert.equal(round.collides, true);
  assert.ok(Math.abs(round.vel.z) < 1, 'the new body does not pull the old missile');
});

test('a defeated lock contact does not erase the second attacker', () => {
  const left = suppressDefeatedLock([
    { id: 'alpha', kind: 'ship', lockLineage: { shooterId: 'alpha', generation: 2, targetId: 'player' } },
    { id: 'bravo', kind: 'ship' },
  ], { shooterId: 'alpha', generation: 2, targetId: 'player' });
  assert.deepEqual(left.map((contact) => contact.id), ['bravo']);
});

test('an impulse redirects one armed bomb without resetting its fuze or owner', () => {
  const bomb = {
    id: 'b1', type: 'bomb', alive: true, physicsBody: false, mass: 2,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 },
    data: {
      kind: 'bomb', bombId: 'bomb_frag', ownerId: 'raider', phase: 'drift', armed: true,
      armedAt: 4, detonateAt: 12, retired: false,
    },
  };
  const before = bombInteractionState(bomb);
  const rejected = redirectLiveBomb(bomb, { x: 0, z: 0 }, 'pilot', 8);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.consumed, false);
  assert.equal(ordnanceChargeDebit(3, { accepted: false }), 3);
  assert.equal(ordnanceChargeDebit(3, { accepted: true, alreadyPaid: true }), 3);
  const redirected = redirectLiveBomb(bomb, { x: 0, z: 40 }, 'pilot', 8);
  assert.equal(redirected.ok, true);
  assert.equal(bomb.id, 'b1');
  assert.equal(bomb.physicsBody, false);
  assert.equal(bomb.data.ownerId, 'raider');
  assert.equal(bomb.data.armed, true);
  assert.equal(bomb.data.armedAt, 4);
  assert.equal(bomb.data.detonateAt, 12);
  assert.equal(bomb.data.phase, 'drift');
  assert.equal(bomb.vel.z, 20);
  assert.equal(bomb.data.redirectContributor.id, 'pilot');
  const receipt = readRecentImpulseProvenance(bomb, 8);
  assert.equal(receipt.actorId, 'pilot');
  assert.equal(receipt.sourceOwnerId, 'raider');
  assert.notEqual(before.label, bombInteractionState({ ...bomb, alive: false, data: { ...bomb.data, phase: 'spent', retired: true } }).label);
  assert.equal(interactionDisplayName(bomb), 'Armed drift bomb');
  const spent = { ...bomb, alive: false, data: { ...bomb.data, phase: 'spent', retired: true } };
  assert.equal(interactionDisplayName(spent), 'Spent bomb casing');
  assert.equal(bombInteractionState(spent).lockable, false);
  const state = {
    player: { targetId: 'b1', gunTargetId: 'b1' },
    entityList: [{ id: 'alpha', data: { combat: { lockTarget: 'b1', lockProgress: 1, targetId: 'b1' } } }],
  };
  clearDestroyedBombLocks(state, bomb);
  assert.equal(state.player.targetId, null);
  assert.equal(state.entityList[0].data.combat.lockTarget, null);
  assert.equal(bomb.data.lockable, false);
});

test('a wounded squad leaves by one corridor while one ship covers', () => {
  const commander = new SquadCommander({ seed: 3, config: { freezeResults: false } });
  commander.registerSquad({
    id: 'wing',
    members: [
      { id: 'a', capabilities: ['weapon'] },
      { id: 'b', preferredRole: 'striker', capabilities: ['weapon'] },
      { id: 'c', capabilities: ['weapon'] },
    ],
  });
  const hazard = { id: 'rock', kind: ContactKind.HAZARD, alive: true, visible: true, pos: { x: -100, z: 0 } };
  const hostile = {
    id: 'player', kind: ContactKind.SHIP, alive: true, valid: true, visible: true, hostile: true,
    confidence: 1, threat: 1, pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
  };
  const frame = (id, hull, extra = {}) => ({
    self: {
      id, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      hullFraction: hull, alive: true, disabled: false, capabilities: ['weapon'],
      occupantGeneration: extra.generation ?? 1,
      ...extra.self,
    },
    contacts: extra.contacts || [hostile, hazard],
    events: [],
  });
  const first = commander.update('wing', 10, new Map([
    ['a', frame('a', 1)],
    ['b', frame('b', 0.2)],
    ['c', frame('c', 1)],
  ]));
  const orders = [...first.directives.values()];
  const ward = orders.find((order) => order.objective.reason === 'wounded_corridor');
  const covers = orders.filter((order) => order.objective.reason === 'covering_withdrawal');
  assert.equal(ward.memberId, 'b');
  assert.equal(ward.objective.kind, ObjectiveKind.RETREAT);
  assert.equal(ward.objective.flightPoint.x, -180);
  assert.equal(ward.objective.cue, 'fighting_retreat');
  assert.equal(covers.length, 1);
  assert.notEqual(covers[0].memberId, 'b');
  assert.equal(orders.filter((order) => order.objective.kind === ObjectiveKind.RETREAT).length, 1);

  const second = commander.update('wing', 11, new Map([
    ['a', frame('a', 1)],
    ['b', frame('b', 0.2)],
    ['c', frame('c', 1)],
  ]));
  const wardAgain = [...second.directives.values()].find((order) => order.memberId === 'b');
  assert.equal(wardAgain.objective.cue, undefined);
  assert.equal(wardAgain.objective.flightPoint.x, -180);

  const blockedHostile = { ...hostile, pos: { x: -180, z: 0 } };
  commander.update('wing', 12, new Map([
    ['a', frame('a', 1, { contacts: [blockedHostile, hazard] })],
    ['b', frame('b', 0.2, { contacts: [blockedHostile, hazard] })],
    ['c', frame('c', 1, { contacts: [blockedHostile, hazard] })],
  ]));
  const replanned = [...commander.update('wing', 40, new Map([
    ['a', frame('a', 1, { contacts: [blockedHostile] })],
    ['b', frame('b', 0.2, { contacts: [blockedHostile] })],
    ['c', frame('c', 1, { contacts: [blockedHostile] })],
  ])).directives.values()].find((order) => order.memberId === 'b');
  assert.notEqual(replanned.objective.flightPoint.x, -180);

  const escaped = commander.update('wing', 41, new Map([
    ['a', frame('a', 1)],
    ['b', frame('b', 0.2, { self: { pos: { x: 1200, z: 0 } } })],
    ['c', frame('c', 1)],
  ]));
  assert.equal([...escaped.directives.values()].some((order) => order.objective.reason === 'covering_withdrawal'), false);
  assert.equal([...escaped.directives.values()].some((order) => order.objective.reason === 'wounded_corridor'), false);

  commander.registerSquad({
    id: 'orphan',
    members: [
      { id: 'dead', capabilities: ['weapon'] },
      { id: 'hurt', capabilities: ['weapon'] },
    ],
  });
  const deadLeader = commander.update('orphan', 5, new Map([
    ['dead', frame('dead', 1, { generation: 9, self: { alive: false, pos: { x: 9999, z: 9999 } }, contacts: [hostile] })],
    ['hurt', frame('hurt', 0.1, { contacts: [hostile] })],
  ]));
  const hurt = [...deadLeader.directives.values()].find((order) => order.memberId === 'hurt');
  assert.ok(hurt.objective.flightPoint);
  assert.notEqual(hurt.objective.flightPoint.x, 9999);
  assert.notEqual(hurt.objective.flightPoint.z, 9999);
});

test('a capital opening follows a disabled battery, not hull percent', () => {
  assert.equal(resolveCapitalOpening({ hullFraction: 0.1 }).open, false);
  const hit = resolveCapitalOpening({
    hullFraction: 0.95,
    data: { subsystems: { subsystem_weapon: { effectiveDisabled: true, destroyed: true } } },
  });
  assert.equal(hit.open, true);
  assert.equal(hit.reason, 'subsystem_disabled');
  const rammed = resolveCapitalOpening({
    hullFraction: 0.8,
    subsystemFractions: { subsystem_weapon: 0 },
  });
  assert.equal(rammed.open, true);
  assert.equal(rammed.transitionId, hit.transitionId);
  const firstCue = capitalOpeningAnnouncement(null, hit);
  assert.equal(firstCue.cue, 'combat.subsystem.weapon.disabled');
  assert.equal(capitalOpeningAnnouncement(hit.transitionId, hit), null);
  assert.equal(capitalOpeningAnnouncement(hit.transitionId, resolveCapitalOpening({ hullFraction: 0.2 })).cue, 'combat.subsystem.restored');

  const runtime = new CombatDoctrineRuntime({ seed: 1 });
  const self = {
    id: 'maw',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    hullFraction: 0.15,
    alive: true,
    roe: 'weapons_free',
    activity: { kind: 'attack_run', startedTick: 0 },
    capabilities: [],
    data: { subsystems: { subsystem_weapon: { effectiveDisabled: false, destroyed: false } } },
  };
  const perception = {
    self,
    contacts: [{
      id: 'pilot', kind: ContactKind.SHIP, alive: true, valid: true, visible: true, hostile: true,
      confidence: 1, threat: 1, pos: { x: 180, z: 0 }, vel: { x: 0, z: 0 },
    }],
  };
  const closed = runtime.update({ tick: 40, entityId: 'maw', doctrineId: 'capital_broadside', perception });
  assert.equal(closed.openingOpen, false);
  self.data.subsystems.subsystem_weapon.effectiveDisabled = true;
  self.data.subsystems.subsystem_weapon.destroyed = true;
  const opened = runtime.update({ tick: 41, entityId: 'maw', doctrineId: 'capital_broadside', perception });
  assert.equal(opened.openingOpen, true);
  assert.equal(opened.openingCue, 'combat.subsystem.weapon.disabled');
  assert.equal(opened.fireWindow, false);
  const repeat = runtime.update({ tick: 42, entityId: 'maw', doctrineId: 'capital_broadside', perception });
  assert.equal(repeat.openingOpen, true);
  assert.equal(repeat.openingCue, null);
  self.data.subsystems.subsystem_weapon.effectiveDisabled = false;
  self.data.subsystems.subsystem_weapon.destroyed = false;
  const recovered = runtime.update({ tick: 43, entityId: 'maw', doctrineId: 'capital_broadside', perception });
  assert.equal(recovered.openingOpen, false);
  assert.equal(recovered.openingCue, 'combat.subsystem.restored');

  const denied = authorizeAIEngagement({
    state: { tick: 4000, simTime: 4000, entities: new Map(), entityList: [] },
    self: {
      id: 'maw', alive: true, pos: { x: 0, z: 0 }, team: 1,
      data: {
        subsystems: { subsystem_weapon: { effectiveDisabled: true, destroyed: true } },
        ai: {
          passive: false,
          motive: 'raid',
          engagementTrigger: 'player_attack',
          zoneId: 'lane',
          approachTelegraph: 'broadside_charge',
          combatDoctrineId: 'capital_broadside',
          roe: 'weapons_free',
          noFireResponseWindowS: 1,
          activity: { kind: 'attack_run', startedTick: 0 },
        },
      },
    },
    target: { id: 'pilot', alive: true, pos: { x: 200, z: 0 }, team: 0 },
    tick: 4000,
    objectiveReason: 'combat_doctrine:capital_broadside:broadside_fire',
    hostile: true,
    wanted: true,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'capital_subsystem_opening');
});

test('a disabled weapon bank is not ready and does not commit, a healthy bank still can', () => {
  const runtime = {
    subsystems: {
      subsystem_weapon: { effectiveDisabled: true, destroyed: true },
      subsystem_sensor: { effectiveDisabled: false, destroyed: false },
    },
  };
  const broken = { subsystemId: 'subsystem_weapon', _cooldown: 0, _heat: 0, heatMax: 10 };
  const healthy = { subsystemId: 'subsystem_sensor', _cooldown: 0, _heat: 0, heatMax: 10 };
  assert.equal(weaponBankReadiness(broken, runtime).advertised, 'disabled');
  assert.equal(weaponBankReadiness(broken, runtime).ready, false);
  assert.equal(weaponBankReadiness(healthy, runtime).advertised, 'ready');
  const committed = [];
  const shipEntity = {
    id: 'maw',
    rot: 0,
    data: { weapons: [{ defId: 'dead', subsystemId: 'subsystem_weapon' }, { defId: 'live', subsystemId: 'subsystem_sensor' }] },
  };
  const state = { combat: { entities: { maw: runtime } }, simTime: 0 };
  weapons._serviceShip.call({
    _byId: new Map(),
    _mountRoleOpen() { return true; },
    _serviceProjectileWeapon(entity, mount) { committed.push(mount.defId); return 0; },
    _serviceBeam() { return 0; },
    _serviceDeployWeapon() { return 0; },
    _serviceEmergent() { return 0; },
  }, shipEntity, true, false, 1 / 60, state, 0, null, null);
  assert.deepEqual(committed, ['live']);
});

function ship(id, x, z, data) {
  return {
    id, type: 'ship', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, team: 0, data,
  };
}

function shooter(id, progress, combat, perceptionContacts) {
  return ship(id, progress * 10, 40, {
    combat: { ...combat },
    perceptionContacts,
  });
}

function missile(id, ownerId, targetId, lockGeneration, targetGeneration, x, z) {
  return {
    id,
    type: 'projectile',
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: -20, z: 0 },
    data: {
      kind: 'missile',
      ownerId,
      targetId,
      lockGeneration,
      targetGeneration,
      turnRate: 2,
      armed: true,
    },
  };
}
