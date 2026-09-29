// PB-TAC-E — SF-055 wounded cargo tradeoff · SF-056 subsystem retreat-to-cover ·
// SF-057 bounded squad search residual.
//
// SF-055: a bound ambient raider still holding its take answers player fire by running
//         HARDER off the shooter's bearing — not by dropping the cargo motive for revenge.
//         Only an empty hold converts the intervention to ordinary self-defense retaliation.
// SF-056: pack_pursuit breaks its press on meaningful subsystem damage into a bounded
//         retreat toward a perceived affordance (friendly hull, then hazard shadow, then a
//         straight flee line), with hysteresis so a crippled hull cannot flicker.
// SF-057: the squad merge carries live-sighting truth — a focus built from pure memory
//         still steers the search leg but cannot aim guns at the entity's unseen position.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  overrideDirectiveForCombatDoctrine,
} from '../src/ai/combatDoctrine.js';
import {
  ActivityKind,
  RulesOfEngagement,
  normalizeActivity,
  overrideDirectiveForWingOrder,
  perceptionForWingOrderCombatDoctrine,
} from '../src/ai/doctrine.js';
import { SquadCommander } from '../src/ai/squad.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

// ── SF-055: wounded cargo tradeoff ──────────────────────────────────────────────

const AMBIENT_SECTOR = 'sector_pallas_drift';
// Authored ambush-lane disc centre in SECTOR-LOCAL space — zonesForSector rows are local while
// live entity.pos is galactic-global, so fixtures must place hulls on the global frame.
const AMBIENT_LANE = Object.freeze({ x: 1420, z: 760 });
const AMBIENT_MANIFEST = 'tac_e_test_manifest';

function lanePoint(sectorId, dx, dz) {
  return sectorLocalToGlobalForSector(
    { x: AMBIENT_LANE.x + dx, z: AMBIENT_LANE.z + dz },
    sectorId);
}

function bootAmbient(seed = 55055) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = AMBIENT_SECTOR;
  state.story.beatIndex = 7;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: lanePoint(AMBIENT_SECTOR, 5000, 5000),
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const events = { telegraph: [], cleared: [], accelerated: [], jettisoned: [] };
  bus.on('encounter:ambientPredationTelegraph', (p) => events.telegraph.push(p));
  bus.on('encounter:ambientPredationCleared', (p) => events.cleared.push(p));
  bus.on('encounter:ambientEscapeAccelerated', (p) => events.accelerated.push(p));
  bus.on('encounter:ambientCargoJettisoned', (p) => events.jettisoned.push(p));
  return { sim, state, bus, player, events, director: sim.registry.get('encounterDirector') };
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

function ambientPair(harness) {
  const raider = harness.sim.spawn(ambientRaiderSpec(lanePoint(AMBIENT_SECTOR, -200, -100)));
  const victim = harness.sim.spawn(ambientHaulerSpec(lanePoint(AMBIENT_SECTOR, 150, 60)));
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

/** Put the bound raider in its escape leg carrying `qty` secured ore. */
function loadEscape(harness, raider, qty = 6) {
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_escape';
  ai.predationObjective.escapeOrigin = { x: raider.pos.x, z: raider.pos.z };
  ai.predationObjective.escapeRadius = 100;
  ai.predationObjective.escapeDeadlineAt = harness.state.simTime + 60;
  ai.predationObjective.escapeTarget = { x: raider.pos.x + 200, z: raider.pos.z };
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty }];
  ai.predationObjective.securedQty = qty;
}

test('SF-055: player fire on a cargo-laden raider accelerates the escape, not revenge', () => {
  const harness = bootAmbient(55101);
  ambientPair(harness);
  const { raidId, raider, victim } = boundAmbientRaid(harness);
  loadEscape(harness, raider, 6);

  // Stand the player on the far side from the current escape bearing.
  harness.player.pos.x = raider.pos.x + 400;
  harness.player.pos.z = raider.pos.z;
  const before = raider.data.ai.predationObjective.escapeTarget;

  harness.bus.emit('combat:damage', {
    attackerId: harness.player.id,
    targetId: raider.id,
    applied: 12,
    pos: { ...raider.pos },
  });

  const ai = raider.data.ai;
  assert.equal(raider.data.predationRole, 'raider', 'a laden raider keeps its binding — it flees, it does not turn');
  assert.equal(ai.predationStatus, 'cargo_escape', 'still running the escape leg');
  assert.equal(ai.motive, 'ambient_cargo_raid', 'the cargo motive survives being shot at');
  assert.equal(ai.retaliationTargetId, undefined, 'no revenge conversion while the hold is full');
  assert.equal(ai.roe, 'hold_fire', 'a fleeing thief is not shooting back');
  assert.equal(ai.activity.kind, 'flee');
  assert.equal(harness.events.accelerated.length, 1);
  assert.equal(harness.events.accelerated[0].raidId, raidId);
  assert.equal(harness.events.cleared.length, 0, 'the raid did not release as an intervention');

  // The escape leg re-aims away from the ATTACKER — not the spent victim's bearing.
  const target = ai.predationObjective.escapeTarget;
  assert.notDeepEqual(target, before, 'the hit bent the escape line');
  const away = (target.x - raider.pos.x) * (raider.pos.x - harness.player.pos.x)
    + (target.z - raider.pos.z) * (raider.pos.z - harness.player.pos.z);
  assert.ok(away > 0, 'the new escape target runs off the shooter');
  assert.ok(ai.predationObjective.securedQty > 0, 'what the hit shed stays on the ledger');
});

test('SF-055: a mid-recovery raider with cargo aboard breaks into the escape leg', () => {
  const harness = bootAmbient(55102);
  ambientPair(harness);
  const { raider } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  // cargo_recovery with freight already aboard — the pod scoop is still running.
  ai.predationStatus = 'cargo_recovery';
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty: 4 }];
  ai.predationObjective.securedQty = 4;
  ai.predationObjective.podIds = [];

  harness.player.pos.x = raider.pos.x - 300;
  harness.player.pos.z = raider.pos.z;
  harness.bus.emit('combat:damage', {
    attackerId: harness.player.id,
    targetId: raider.id,
    applied: 9,
    pos: { ...raider.pos },
  });

  assert.equal(ai.predationStatus, 'cargo_escape', 'the wounded thief abandons the scoop and runs');
  assert.equal(ai.predationObjective.escapeDeadlineAt > harness.state.simTime, true);
  assert.equal(ai.activity.kind, 'flee');
  assert.equal(ai.retaliationTargetId, undefined);
  assert.equal(harness.events.accelerated.length, 1);
  // The escape line points away from the player, wherever the victim happened to be.
  const t = ai.predationObjective.escapeTarget;
  assert.ok(t.x > raider.pos.x, 'escape runs off the shooter bearing');
});

test('SF-055: only an empty hold converts the hit to retaliation', () => {
  const harness = bootAmbient(55103);
  ambientPair(harness);
  const { raider } = boundAmbientRaid(harness);
  const ai = raider.data.ai;
  ai.predationStatus = 'cargo_escape';
  ai.predationObjective.escapeOrigin = { x: raider.pos.x, z: raider.pos.z };
  ai.predationObjective.escapeRadius = 100;
  ai.predationObjective.escapeDeadlineAt = harness.state.simTime + 60;
  ai.predationObjective.escapeTarget = { x: raider.pos.x + 200, z: raider.pos.z };
  // One unit aboard — the first pressured ditch empties the hold (ceil(1*0.34)=1).
  ai.predationObjective.secured = [{ commodityId: 'cmdty_ore_iron', qty: 1 }];
  ai.predationObjective.securedQty = 1;

  harness.bus.emit('combat:damage', {
    attackerId: harness.player.id,
    targetId: raider.id,
    applied: 10,
    pos: { ...raider.pos },
  });

  // Jettison ran first — the shed left the hold empty, so this hit IS the intervention.
  assert.equal(harness.events.jettisoned.length, 1, 'the last crate spilled under fire');
  assert.equal(ai.predationObjective, undefined, 'the binding released once nothing remained to protect');
  assert.equal(ai.predationStatus, 'cleared');
  assert.equal(ai.predationEndReason, 'player_intervention');
  assert.equal(ai.motive, 'self_defense', 'an empty-handed raider finally fights back');
  assert.equal(ai.retaliationTargetId, harness.player.id);
  assert.equal(ai.roe, 'weapons_free');
  assert.equal(harness.events.cleared.length, 1);
  assert.equal(harness.events.cleared[0].reason, 'player_intervention');
  // Conservation: shed pod + nothing aboard = the whole take is accounted for.
  const pods = [...harness.state.entities.values()].filter((e) => (
    e.type === 'payload' && e.data && e.data.spillCause === 'pressure_jettison'));
  assert.equal(pods.length, 1);
  assert.equal(pods[0].data.salvagePool.cmdty_ore_iron, 1);
});

// ── SF-056: wounded pack hull retreats to a perceived affordance ────────────────

function doctrinePerception(contacts, selfOverrides = {}) {
  return {
    self: {
      ...selfOverrides,
      id: selfOverrides.id ?? 2,
      team: 1,
      pos: { x: selfOverrides.x ?? 0, z: selfOverrides.z ?? 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: 0,
      combatDoctrineId: selfOverrides.combatDoctrineId || CombatDoctrineId.PACK_PURSUIT,
      activity: {
        kind: selfOverrides.activity || ActivityKind.ATTACK_RUN,
        reason: 'pb_tac_e_fixture',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: selfOverrides.roe || RulesOfEngagement.WEAPONS_FREE,
    },
    contacts,
    events: [],
  };
}

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    team: values.team ?? 0,
    alive: values.alive ?? true,
    valid: values.valid ?? true,
    visible: values.visible ?? true,
    hostile: values.hostile ?? true,
    confidence: values.confidence ?? 1,
    threat: values.threat ?? 0.7,
    pos: { x: values.x ?? 160, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    tethered: false,
    operationalMassBand: 'medium',
    mobilityBand: 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'good',
    tags: [],
  };
}

function hazardContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.HAZARD,
    alive: true,
    valid: true,
    visible: values.visible ?? true,
    hostile: null,
    confidence: 1,
    threat: 0,
    pos: { x: values.x ?? 0, z: values.z ?? 0 },
    vel: { x: 0, z: 0 },
    radius: values.radius ?? 40,
    tags: [],
  };
}

const WOUNDED = { subsystem_drive: 0.4, subsystem_weapon: 0.9 };
const HEALTHY = { subsystem_drive: 1, subsystem_weapon: 1 };

function packUpdate(runtime, tick, perception, entityId = 2) {
  return runtime.update({
    tick,
    entityId,
    doctrineId: CombatDoctrineId.PACK_PURSUIT,
    perception,
    directive: null,
  });
}

test('SF-056: subsystem damage breaks the press into a retreat toward the pack', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 7 });
  const target = shipContact(1, { x: 160, z: 0 });
  const ally = shipContact(7, { x: -300, z: 40, hostile: false, team: 1, threat: 0 });

  // Healthy: the pack hull presses.
  let result = packUpdate(runtime, 0, doctrinePerception([target, ally], {
    subsystemFractions: HEALTHY,
  }));
  assert.equal(result.phase, 'press');
  assert.equal(result.maneuverKind, ManeuverKind.ORBIT);
  assert.equal(result.fireWindow, true, 'press is the fire window');

  // Drive half-dead: the same member falls back on the nearest friendly hull.
  result = packUpdate(runtime, 5, doctrinePerception([target, ally], {
    subsystemFractions: WOUNDED,
  }));
  assert.equal(result.phase, 'retreat', 'meaningful subsystem damage breaks the press');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT);
  assert.equal(result.maneuverTargetId, null, 'the retreat anchor is a point, not the hostile');
  assert.equal(result.faceTarget, false, 'nose comes off the target during the fallback');
  assert.equal(result.fireWindow, false, 'a hull falling back to cover is not firing');
  assert.deepEqual(result.flightPoint, { x: ally.pos.x, z: ally.pos.z },
    'the retreat runs to the pack — the nearest visible friendly hull IS the cover');
});

test('SF-056: without a friendly hull, the fallback shelters behind a hazard', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 7 });
  const target = shipContact(1, { x: 160, z: 0 });
  const rock = hazardContact(9, { x: -120, z: 0, radius: 40 });

  packUpdate(runtime, 0, doctrinePerception([target, rock], { subsystemFractions: HEALTHY }));
  const result = packUpdate(runtime, 5, doctrinePerception([target, rock], {
    subsystemFractions: WOUNDED,
  }));
  assert.equal(result.phase, 'retreat');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT);
  // The anchor sits on the hazard's far side from the threat — rock between hull and shooter.
  const anchor = result.flightPoint;
  assert.ok(anchor.x < rock.pos.x - 40, 'the cover shadow sits beyond the rock, away from the threat');
  assert.ok(Math.abs(anchor.z) < 5, 'the shadow keeps the rock on the threat line');
});

test('SF-056: with no affordance at all the fallback is a bounded straight flee', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 7 });
  const target = shipContact(1, { x: 160, z: 0 });

  packUpdate(runtime, 0, doctrinePerception([target], { subsystemFractions: HEALTHY }));
  const result = packUpdate(runtime, 5, doctrinePerception([target], {
    subsystemFractions: WOUNDED,
  }));
  assert.equal(result.phase, 'retreat');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT);
  // Self at origin, threat at +x: the flee line runs -x.
  assert.ok(result.flightPoint.x < -400, 'with nothing perceived the run is straight off the threat');
  assert.ok(Math.abs(result.flightPoint.z) < 1);
});

test('SF-056: the wound latch stops flee/attack oscillation — repair re-arms it', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 7 });
  const target = shipContact(1, { x: 160, z: 0 });
  const ally = shipContact(7, { x: -300, z: 0, hostile: false, team: 1, threat: 0 });

  packUpdate(runtime, 0, doctrinePerception([target, ally], { subsystemFractions: HEALTHY }));
  let result = packUpdate(runtime, 5, doctrinePerception([target, ally], {
    subsystemFractions: WOUNDED,
  }));
  assert.equal(result.phase, 'retreat');

  // The fallback ends on arrival (stand the member on its anchor, past the minimum run).
  const settled = packUpdate(runtime, 5 + 61, doctrinePerception([target, ally], {
    x: ally.pos.x, z: ally.pos.z, subsystemFractions: WOUNDED,
  }));
  assert.equal(settled.phase, 'press', 'arrival at cover ends the retreat — it fights hurt');

  // The latch is spent: the same wound cannot trigger a second fallback.
  const held = packUpdate(runtime, 5 + 70, doctrinePerception([target, ally], {
    x: 160, z: 0, subsystemFractions: WOUNDED,
  }));
  assert.equal(held.phase, 'press', 'no oscillation — a still-wounded hull stays in the fight');

  // A real repair past the exit band re-arms the fallback; a fresh wound triggers it again.
  packUpdate(runtime, 5 + 80, doctrinePerception([target, ally], {
    x: 160, z: 0, subsystemFractions: { subsystem_drive: 0.9, subsystem_weapon: 0.9 },
  }));
  const rewounded = packUpdate(runtime, 5 + 90, doctrinePerception([target, ally], {
    x: 160, z: 0, subsystemFractions: { subsystem_drive: 0.3, subsystem_weapon: 0.9 },
  }));
  assert.equal(rewounded.phase, 'retreat', 'a repaired hull earns the fallback again');
});

test('SF-056: a mid-band subsystem fraction never triggers the fallback', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 7 });
  const target = shipContact(1, { x: 160, z: 0 });
  const result = packUpdate(runtime, 0, doctrinePerception([target], {
    subsystemFractions: { subsystem_drive: 0.62, subsystem_weapon: 0.9 },
  }));
  assert.equal(result.phase, 'press', 'a half-healthy subsystem is a grind, not a rout');
});

// ── SF-057: squad cooperation without target omniscience ───────────────────────

function memberSelf(id, x = 0, z = 0) {
  return {
    id,
    team: 1,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    hullFraction: 1,
    disabled: false,
    tethered: false,
    capabilities: ['drive', 'sensor', 'weapon'],
    factionBehavior: null,
    // combatActorEligible requires a weapons-legal ROE before any doctrine will run.
    roe: 'weapons_free',
  };
}

function squadContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    team: 0,
    alive: true,
    valid: true,
    visible: values.visible ?? true,
    hostile: true,
    confidence: values.confidence ?? 1,
    threat: 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: 0, z: 0 },
    tethered: false,
    dispatchedTarget: values.dispatchedTarget === true,
    tags: [],
  };
}

function memberPerception(id, contacts, x = 0, z = 0) {
  return { tick: 60, self: memberSelf(id, x, z), contacts, events: [] };
}

function twoMemberSquad(commander) {
  commander.registerSquad({
    id: 'search_wing',
    doctrine: 'scavenger',
    faction: 'fixture',
    members: [
      { id: 700, preferredRole: 'leader', capabilities: ['drive', 'sensor', 'weapon'] },
      { id: 701, preferredRole: 'striker', capabilities: ['drive', 'sensor', 'weapon'] },
    ],
  });
}

function objectiveOn(result, targetId) {
  for (const directive of result.directives.values()) {
    if (directive.objective && directive.objective.targetId === targetId) return directive.objective;
  }
  return null;
}

test('SF-057: a merged contact carried by one live sighting still marks the objective observed', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  twoMemberSquad(commander);
  const target = squadContact(900, { x: 500, z: 0 });
  const frames = new Map([
    [700, memberPerception(700, [target], 0, 0)],
    [701, memberPerception(701, [{ ...target, visible: false, confidence: 0.4 }], 20, 5)],
  ]);
  const result = commander.update('search_wing', 60, frames);
  const objective = objectiveOn(result, 900);
  assert.ok(objective, 'a live sighting keeps the shared focus');
  assert.equal(objective.targetObserved, true, 'one member seeing it is the squad seeing it');
});

test('SF-057: a pure-memory focus cannot aim guns — the squad may only search', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  twoMemberSquad(commander);
  const stale = squadContact(900, { x: 500, z: 0, visible: false, confidence: 0.45 });
  const frames = new Map([
    [700, memberPerception(700, [stale], 0, 0)],
    [701, memberPerception(701, [{ ...stale, confidence: 0.5 }], 20, 5)],
  ]);
  const result = commander.update('search_wing', 60, frames);
  const objective = objectiveOn(result, 900);
  assert.ok(objective, 'the bounded search objective survives on memory');
  assert.equal(objective.targetObserved, false,
    'no member currently sees it — the shared track is a last fix, not a firing solution');
});

test('SF-057: the fire channel closes on an unobserved target and reopens on the reacquired fix', () => {
  const state = createGameState(557);
  state.tick = 570;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  const shooter = fixtureShip(700, 1, 0, 0, fixtureCombatAI());
  const target = fixtureShip(900, 0, 320, 0, null);
  state.playerId = target.id;
  state.entities = new Map([[shooter.id, shooter], [target.id, target]]);
  state.entityList = [shooter, target];

  const decisionFor = (targetObserved) => ({
    entityId: shooter.id,
    directive: {
      objective: {
        kind: ObjectiveKind.FOCUS,
        targetId: target.id,
        reason: 'combat_doctrine:interceptor_flyby:strike',
        targetObserved,
      },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: { fireWindow: true },
  });

  applyAIFiringIntent(decisionFor(false), state);
  assert.equal(shooter.data.intent.fire, false, 'the squad memory is not a firing solution');
  assert.equal(shooter.data.intent.fireBlockReason, 'target_unobserved');
  assert.equal(shooter.data.combat.aimCommit, null, 'a stale corridor dissolves with the contact');

  applyAIFiringIntent(decisionFor(true), state);
  assert.equal(shooter.data.intent.fire, true, 'a fresh sighting restores the gun channel');
});

test('SF-057: an authored mark flies the assignment but is not a sighting', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  twoMemberSquad(commander);
  // A CONTROL-dispatched offender: reported, not seen. The tag authorizes the responder to MANEUVER
  // on its assignment — the objective survives — but fire still waits for a member's own sighting:
  // the report may be stale, and the fire gate resolves the live entity position.
  const mark = squadContact(900, { x: 500, z: 0, visible: false, confidence: 0.6, dispatchedTarget: true });
  const frames = new Map([
    [700, memberPerception(700, [mark], 0, 0)],
    [701, memberPerception(701, [mark], 20, 5)],
  ]);
  const result = commander.update('search_wing', 60, frames);
  const objective = objectiveOn(result, 900);
  assert.ok(objective, 'the dispatched track still produces a live objective — the search leg runs');
  assert.equal(objective.targetObserved, false,
    'a reported mark is a search anchor, not a firing solution');
});

test('SF-057: the flag survives the full override chain — a dispatched responder cannot snipe a ghost', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  twoMemberSquad(commander);
  const state = createGameState(559);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  // Member 700 is CONTROL-dispatched onto offender 900 — an attack_run assignment naming the
  // target. The contact arrives as a REPORTED mark (visible:false + dispatchedTarget), the shape
  // doctrine.js stamps for a responder ordered beyond its own sensor reach.
  const activity = normalizeActivity({
    kind: 'attack_run', reason: 'security_response:inc_900', anchor: { x: 0, z: 0 },
    leashRadius: 2600, startedTick: 0, targetId: 900,
  });
  const shooter = fixtureShip(700, 1, 0, 0, fixtureCombatAI({ activity }));
  const target = fixtureShip(900, 0, 320, 0, null);
  state.playerId = target.id;
  state.entities = new Map([[shooter.id, shooter], [target.id, target]]);
  state.entityList = [shooter, target];

  // The whole production chain a member's decision traverses: squad merge → wing-order override
  // → doctrine-scoped perception → doctrine update → doctrine override → fire gate. Earlier
  // versions of this chain rebuilt the objective at both overrides and silently dropped the
  // flag — a dispatched mark would reach applyAIFiringIntent naked and fire on the live entity.
  const chain = (visible) => {
    const runtime = new CombatDoctrineRuntime({ seed: 7 });
    for (let tick = 600; tick < 1200; tick += 6) {
      state.tick = tick;
      const mark = squadContact(900, {
        x: 500, z: 0, visible, confidence: 0.6, dispatchedTarget: true,
      });
      // The member has closed onto the reported mark (400 WU — inside the flyby's 420 approach
      // gate) so the doctrine cycles flare→strike on schedule; the offender's LIVE position
      // (320,0) sits 180 WU off the stale fix — exactly the gap the gate exists to close.
      const perception = memberPerception(700, [mark], 100, 0);
      perception.self.activity = activity;
      const frames = new Map([
        [700, perception],
        [701, memberPerception(701, [
          squadContact(900, { x: 500, z: 0, visible: false, confidence: 0.4 }),
        ], 20, 5)],
      ]);
      const squad = commander.update('search_wing', tick, frames);
      const directive = squad.directives.get(700);
      assert.ok(directive, 'the squad still votes a directive for the dispatched member');
      const ordered = overrideDirectiveForWingOrder(directive, perception);
      assert.equal(ordered.objective && ordered.objective.targetId, 900,
        'the security_response assignment re-points the objective at the offender');
      const doctrinePerception = perceptionForWingOrderCombatDoctrine(perception, ordered);
      const doctrine = runtime.update({
        tick, entityId: 700, doctrineId: 'interceptor_flyby',
        perception: doctrinePerception, directive: ordered,
      });
      if (!doctrine) continue;
      const effective = overrideDirectiveForCombatDoctrine(ordered, doctrine, doctrinePerception);
      if (doctrine.fireWindow === true) return { effective, doctrine };
    }
    return null;
  };

  // Reported but unseen: every override keeps targetObserved false — the member may fly the
  // assignment but the gun channel stays closed on an entity nobody sees.
  const stale = chain(false);
  assert.ok(stale, 'the doctrine reaches a fire window on the marked target');
  assert.equal(stale.effective.objective.targetObserved, false,
    'the flag survives wing-order AND doctrine overrides — the mark is a search anchor');
  applyAIFiringIntent({
    entityId: shooter.id, directive: stale.effective,
    action: { actionId: 'action_burst' }, combatDoctrine: stale.doctrine,
  }, state);
  assert.equal(shooter.data.intent.fire, false,
    'a dispatched responder must not pre-aim at unseen current coordinates');
  assert.equal(shooter.data.intent.fireBlockReason, 'target_unobserved');

  // The member closes and sees it for real: the same chain now arms the guns.
  const seen = chain(true);
  assert.ok(seen, 'the doctrine reaches a fire window on the now-visible offender');
  assert.equal(seen.effective.objective.targetObserved, true,
    "the member's own sighting arms its guns — no squad-mate required");
  applyAIFiringIntent({
    entityId: shooter.id, directive: seen.effective,
    action: { actionId: 'action_burst' }, combatDoctrine: seen.doctrine,
  }, state);
  assert.equal(shooter.data.intent.fire, true, 'a live sighting at the end of the assignment fires');
});

test('SF-057: a re-pointed objective derives sighting from the member\'s own contact', () => {
  // The squad picture names a different hull — the wing-order re-point lands on a target the
  // merged verdict never described, so the member's own contact row is the only honest evidence.
  const activity = normalizeActivity({
    kind: 'attack_run', reason: 'security_response:inc_900', anchor: { x: 0, z: 0 },
    leashRadius: 2600, startedTick: 0, targetId: 900,
  });
  const staleMark = squadContact(900, { x: 500, z: 0, visible: false, confidence: 0.6 });
  const perception = memberPerception(700, [staleMark], 100, 0);
  perception.self.activity = activity;
  // Squad voted a DIFFERENT focus — the override re-points, so the carry path can't apply.
  const otherFocus = {
    objective: { kind: ObjectiveKind.FOCUS, targetId: 4242, reason: 'scavenger', targetObserved: true },
    formation: null,
  };
  const ordered = overrideDirectiveForWingOrder(otherFocus, perception);
  assert.equal(ordered.objective.targetId, 900, 'the assignment re-points onto the offender');
  assert.equal(ordered.objective.targetObserved, false,
    'a stale member contact cannot borrow the squad\'s sighting of a different target');

  // The member's own live sighting of the re-pointed target arms the channel even when the
  // squad's objective carried no verdict for it.
  const livePerception = memberPerception(700, [
    squadContact(900, { x: 500, z: 0, visible: true, confidence: 0.9 }),
  ], 100, 0);
  livePerception.self.activity = activity;
  const liveOrdered = overrideDirectiveForWingOrder(otherFocus, livePerception);
  assert.equal(liveOrdered.objective.targetObserved, true,
    'the member seeing its own assignment is enough — no squad vote needed');
});

function fixtureCombatAI(overrides = {}) {
  return {
    squadId: 'search_wing',
    doctrine: 'scavenger',
    preferredRole: 'striker',
    passive: false,
    motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    combatDoctrineId: 'interceptor_flyby',
    roe: 'weapons_free',
    forcePlayerTarget: true,
    activity: normalizeActivity({
      kind: 'attack_run',
      reason: 'test_attack_run',
      anchor: { x: 0, z: 0 },
      leashRadius: 2600,
      startedTick: 0,
    }),
    ...overrides,
  };
}

function fixtureShip(id, team, x, z, ai) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: team === 1 ? 'faction_reach' : 'faction_free',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 32,
    maxSpeed: 140,
    turnRate: 2.4,
    hull: 100,
    hullMax: 100,
    cap: 100,
    capMax: 100,
    data: {
      ...(ai ? { ai } : {}),
      intent: { fire: false },
      combat: {},
      weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 420 }],
    },
  };
}
