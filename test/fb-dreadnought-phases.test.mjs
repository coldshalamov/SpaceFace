/**
 * FB-020 — the Iron Maw phases on destroyed turret mounts, never on a health-bar mark.
 *
 * The packet's law: `dreadnought_boss` authors `subsystems.turretHp` + `phaseAtTurretsLost`, every
 * turret mount registers as a real destructible subsystem (`subsystem_turret_<i>`), and each
 * authored edge changes the fight — edge 1 vents the authored wasp screen and shortens the
 * broadside, edge 2 tears the prow plate (prowSurface stops banking, the PROW RIB weak point
 * opens) and cuts the hull's RCS pods (turn authority drops through thruster health, not a gyro).
 * A hull-only damage ramp with turrets intact produces no edge.
 *
 * RUN: `node --test test/fb-dreadnought-phases.test.mjs`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import {
  damageSubsystem, applyPendingSubsystemTransitions, recomputeCombatantModifiers,
} from '../src/combat/subsystems.js';
import {
  turretMountsOf, turretLossCount, turretPhaseEdges, isTurretSubsystemId,
} from '../src/combat/turretSubsystems.js';
import { weaponBankReadiness } from '../src/systems/weapons.js';
import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { applyTurretEdgeEffects } from '../src/systems/tacticalAI.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { measureThrusterAuthority } from '../src/core/physicsAuthority.js';
import { weakPointForEntity, isHitInWeakArc } from '../src/data/weakPoints.js';
import { bossSurfaceAuthoringOf, resolveBossSurfaceContact } from '../src/combat/bossSurface.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';

const SEED = 4242; // the packet's fixed seed
const EDGES = [4, 10];
const MOUNT_COUNT = 14; // 2 torpedo + 2 heavy beam + 6 autocannon + 4 flak, all turret-mounted

function bossSpec() {
  const spec = makeEnemySpawnSpec('dreadnought_boss', 8, { x: 800, z: 0 });
  spec.id = 97701;
  spec.alive = true;
  return spec;
}

function bossState(entity) {
  return {
    tick: 0,
    seed: SEED,
    meta: { seed: SEED },
    entities: new Map([[entity.id, entity]]),
    entityList: [entity],
    playerId: 1,
    bus: { emit: () => true, on: () => null },
    combat: undefined,
    run: { kind: 'open', phase: 'inactive' },
    aiEncounter: { schemaVersion: 1, nextSeq: 1, commands: [] },
  };
}

function killTurret(ctx, entity, runtime, index) {
  const id = `subsystem_turret_${index}`;
  damageSubsystem(ctx, entity, runtime, id, 5000, { kinetic: 1 }, 1);
  ctx.state.tick += 1;
  applyPendingSubsystemTransitions(ctx, entity, runtime);
  recomputeCombatantModifiers(ctx, entity, runtime);
}

function perception(selfOverrides = {}) {
  return {
    self: {
      ...selfOverrides,
      id: selfOverrides.id ?? 97701,
      team: 1,
      pos: { x: 800, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      combatDoctrineId: CombatDoctrineId.CAPITAL_BROADSIDE,
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: 'fb020_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 3400,
        preferredRange: 260,
        startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [shipContact(1)],
    events: [],
  };
}

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    ageTicks: 0,
    hostile: true,
    confidence: 1,
    threat: 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: 0, z: 0 },
    tethered: false,
    operationalMassBand: 'capital',
    mobilityBand: 'low',
    cargoBand: 'empty',
    tetherabilityBand: 'poor',
    tags: [],
  };
}

function baseDirective() {
  return Object.freeze({
    tick: 0,
    squadId: 'fixture',
    memberId: 97701,
    role: 'striker',
    tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
    formation: null,
  });
}

function driveDoctrine(runtime, tick, turretsLost, hullFraction = 1) {
  return runtime.update({
    tick,
    entityId: 97701,
    doctrineId: CombatDoctrineId.CAPITAL_BROADSIDE,
    perception: perception({ turretsLost, turretPhaseEdges: EDGES, hullFraction }),
    directive: baseDirective(),
  });
}

test('FB-020 data leg: the row authors turret subsystems + mount-loss edges, no hull phases', () => {
  const def = ENEMY_TYPES.find((e) => e.id === 'dreadnought_boss');
  assert.ok(def, 'dreadnought_boss row exists');
  assert.equal(def.subsystems.turretHp, 300, 'authored per-mount health');
  assert.deepEqual(def.subsystems.phaseAtTurretsLost, EDGES, 'edges are mount-loss counts');
  assert.equal(def.subsystems.phases, undefined, 'hull-fraction phases are gone');
  assert.equal(def.reinforcements.turretsLostAtLeast, 4, 'the screen vents on the first edge');
  assert.ok(def.prowSurface && def.prowSurface.arcDeg > 0, 'the bow starts plated');
  assert.equal(def.weakPoint.opensAtTurretEdge, 2, 'the PROW RIB window opens on the second edge');
});

test('FB-020 spawn: every turret mount is keyed to its own destructible subsystem', () => {
  const spec = bossSpec();
  assert.ok(spec.data.subsystems && spec.data.subsystems.turretHp === 300,
    'spawn copies the authored subsystem block');
  const mounts = spec.data.weapons.filter((w) => isTurretSubsystemId(w.subsystemId));
  assert.equal(mounts.length, MOUNT_COUNT, `all ${MOUNT_COUNT} mounts carry a turret subsystem id`);
  const ids = new Set(mounts.map((w) => w.subsystemId));
  assert.equal(ids.size, MOUNT_COUNT, 'mount subsystem ids are unique');
  assert.ok(spec.data.weakPoint && spec.data.weakPoint.opensAtTurretEdge === 2,
    'the gated prow window rides the entity');
});

test('FB-020 runtime: mounts register as subsystems; killing one silences only its gun', () => {
  const catalog = createCombatCatalog();
  const entity = bossSpec();
  const state = bossState(entity);
  const runtime = ensureCombatant(state, entity, catalog);
  const mountCount = Object.keys(runtime.subsystems).filter(isTurretSubsystemId).length;
  assert.equal(mountCount, MOUNT_COUNT, 'one destructible row per mount');
  assert.equal(runtime.subsystems.subsystem_turret_0.maxHealth, 300, 'authored turretHp');

  const ctx = { state, catalog, currentAttackerId: 1 };
  killTurret(ctx, entity, runtime, 0);
  assert.equal(runtime.subsystems.subsystem_turret_0.destroyed, true, 'mount 0 is torn off');
  assert.equal(turretLossCount(runtime), 1);

  const mounts = turretMountsOf(entity);
  assert.equal(weaponBankReadiness(mounts[0].mount, runtime).disabled, true,
    'the dead mount goes silent');
  assert.equal(weaponBankReadiness(mounts[1].mount, runtime).ready, true,
    'the rest of the battery keeps firing');
  assert.equal(entity.hull, entity.hullMax, 'subsystem kills never touch the health bar');
});

test('FB-020 edges: mount loss at 4 and 10 fires the two phase transitions', () => {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  let r = driveDoctrine(runtime, 0, 0);
  assert.equal(r.phase, 'broadside_charge');
  assert.equal(r.bossStage, 0);
  assert.equal(r.turretEdge, 0);

  // Three mounts gone is inside the first edge — no transition.
  r = driveDoctrine(runtime, 60, 3, 0.5);
  assert.equal(r.bossStage, 0, 'pre-edge losses do not phase the boss');
  assert.equal(r.turretEdge, 0);

  // Fourth mount falls: edge 1 — the vent beat.
  r = driveDoctrine(runtime, 120, 4);
  assert.equal(r.bossStage, 1, 'the first edge advances the stage');
  assert.equal(r.turretEdge, 1);
  assert.equal(r.telegraph.kind, 'swarmer_vent', 'the vent is telegraphed as its own beat');
  assert.equal(r.telegraphStarted, true, 'the edge telegraphs exactly once at transition');
  // The posture change is real: the broadside cycle shortens (fire window cadence changes).
  r = driveDoctrine(runtime, 150, 4);
  assert.equal(r.phase, 'broadside_fire', 'edge 1 keeps the broadside cadence running, faster');

  // Ninth mount: still inside edge 1.
  r = driveDoctrine(runtime, 400, 9);
  assert.equal(r.bossStage, 1);

  // Tenth mount falls: edge 2 — the desperation battery.
  r = driveDoctrine(runtime, 460, 10);
  assert.equal(r.bossStage, 2, 'the second edge advances the stage');
  assert.equal(r.turretEdge, 2);
  assert.equal(r.telegraph.kind, 'broadside_desperation');
  assert.equal(r.telegraphStarted, true);
});

test('FB-020 law: a hull-only damage ramp with turrets intact produces no edge', () => {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  driveDoctrine(runtime, 0, 0, 1);
  // Burn the hull to near death without touching a single mount.
  for (const [tick, hull] of [[60, 0.66], [120, 0.33], [180, 0.10], [240, 0.02]]) {
    const r = driveDoctrine(runtime, tick, 0, hull);
    assert.equal(r.bossStage, 0, `hull ${hull} with turrets intact stays in the opening act`);
    assert.equal(r.turretEdge, 0);
    assert.notEqual(r.telegraph?.kind, 'swarmer_vent');
    assert.notEqual(r.telegraph?.kind, 'broadside_desperation');
  }
});

test('FB-020 edge 2 tears the prow: surface opens, weak point exposes, turn authority drops', () => {
  const entity = bossSpec();
  const state = bossState(entity);

  // Before the edge: the bow is plated and the weak-point window is shut.
  const plate = bossSurfaceAuthoringOf(entity);
  assert.ok(plate && plate.material === 'iron_plate', 'the prow plate banks shots at spawn');
  const bowHit = { point: { x: entity.pos.x + 40, z: entity.pos.z }, tick: 0 };
  assert.equal(resolveBossSurfaceContact({ surface: entity, receipt: bowHit }).response, 'reflect',
    'a shot on the plated bow banks off');
  assert.equal(weakPointForEntity(entity), null, 'the PROW RIB window is not open yet');
  const yawBefore = measureThrusterAuthority(entity).yaw;
  assert.equal(yawBefore, 1, 'RCS pods start healthy');

  // Edge 2 crosses: the applicator tears the plate and cuts the pods.
  applyTurretEdgeEffects(entity, { turretEdge: 2 }, state);
  assert.equal(entity.data._prowWindowOpen, true, 'the prow window is open');
  assert.equal(bossSurfaceAuthoringOf(entity), null, 'the torn plate no longer banks shots');
  const wp = weakPointForEntity(entity);
  assert.ok(wp && wp.label === 'PROW RIB', 'the prow rib is now the rewarded seam');
  assert.equal(isHitInWeakArc(entity, { x: entity.pos.x + 40, z: entity.pos.z }, wp), true,
    'a bow hit lands inside the opened window');
  const yawAfter = measureThrusterAuthority(entity).yaw;
  assert.ok(yawAfter < yawBefore && yawAfter < 0.8,
    `turn authority drops through mass (yaw ${yawBefore} -> ${yawAfter}), not a gyro cap`);

  // The effects latch: re-applying the same edge does not re-injure or re-announce.
  applyTurretEdgeEffects(entity, { turretEdge: 2 }, state);
  assert.equal(measureThrusterAuthority(entity).yaw, yawAfter, 'the wound is applied once');
});

test('FB-020 vent: the authored screen spawns once on the first edge, never on hull alone', () => {
  const catalog = createCombatCatalog();
  const entity = bossSpec();
  const state = bossState(entity);
  const runtime = ensureCombatant(state, entity, catalog);
  const ctx = { state, catalog, currentAttackerId: 1 };
  const encounter = state.aiEncounter;
  const emitted = [];
  const port = { helpers: {}, bus: { emit: (ev, p) => { emitted.push({ ev, p }); return true; } } };

  // Hull shredded, mounts intact: the hull threshold is now a mercy gate (0.35), and the
  // authored beat stays tied to mount loss.
  entity.hull = entity.hullMax * 0.5;
  aiEncounter._queueAuthoredReinforcements.call(port, encounter, state);
  assert.equal(encounter.commands.length, 0, 'hull at 50% with turrets intact calls nothing');

  // Turrets 0..2 die: inside the first edge, still nothing.
  for (let i = 0; i < 3; i++) killTurret(ctx, entity, runtime, i);
  aiEncounter._queueAuthoredReinforcements.call(port, encounter, state);
  assert.equal(encounter.commands.length, 0, 'three mounts down is still inside the edge');

  // The fourth mount falls: the authored screen vents.
  killTurret(ctx, entity, runtime, 3);
  assert.equal(turretLossCount(runtime), 4, 'the first edge is crossed');
  aiEncounter._queueAuthoredReinforcements.call(port, encounter, state);
  assert.equal(encounter.commands.length, 1, 'the edge vents the screen');
  assert.equal(encounter.commands[0].packageId, 'iron_maw_screen');
  assert.ok(emitted.some((e) => e.ev === 'ai:encounterCommand'), 'the call is announced');

  // Once-ever: further losses re-run the queue without a second call.
  killTurret(ctx, entity, runtime, 4);
  aiEncounter._queueAuthoredReinforcements.call(port, encounter, state);
  assert.equal(encounter.commands.length, 1, 'the screen vents exactly once');
});
