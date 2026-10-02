import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { swarmDoctrineStamp } from '../src/data/swarmMode.js';
import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
} from '../src/ai/combatDoctrine.js';

// FB-017 — the two authored variant pairs must be distinct behavioral problems, not stat
// inflation: the zealot guards a marked ally behind a prow plate (escort_screen) where the
// wasp packs (swarm_pack / pack_pursuit in swarm mode); the ghost relocates to the opposite
// flank after every shot and never fires inside the lock band (ranged_stalker) where the
// lancer dwells and re-shoots the same lane (ranged_disengager). Hull parity inside each pair
// is pinned so the difference is behavior only.

const byId = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const directive = baseDirective();

test('FB-017: each variant pair holds identical hull — the difference is behavior, not stats', () => {
  assert.equal(byId.get('wasp_swarmer').hull, byId.get('choir_zealot').hull,
    'wasp/zealot hull parity');
  assert.equal(byId.get('lancer_sniper').hull, byId.get('quiet_ghost').hull,
    'lancer/ghost hull parity');
});

test('FB-017: the zealot is a guardian — escort_screen on the row plus a prow plate', () => {
  const zealot = byId.get('choir_zealot');
  assert.equal(zealot.combatDoctrineId, CombatDoctrineId.ESCORT_SCREEN,
    'zealot row doctrine is the ward-screen guardian, not the wasp pack rush');
  assert.ok(zealot.prowSurface && zealot.prowSurface.material === 'plate',
    'zealot reads its guardian identity on the hull — a plated prow');
  const spec = makeEnemySpawnSpec('choir_zealot', 4, { x: 0, z: 0 });
  assert.equal(spec.data.ai.combatDoctrineId, CombatDoctrineId.ESCORT_SCREEN,
    'spawn path stamps the guardian doctrine');
  // Swarm mode still packs it — the stamp table owns the battle type, the row owns the default.
  assert.equal(swarmDoctrineStamp('choir_zealot', { swarm: true }), 'pack_pursuit',
    'inside a swarm wave the zealot still joins the pack rush');
  assert.equal(swarmDoctrineStamp('choir_zealot', { swarm: false }), null,
    'outside a swarm wave the zealot keeps its own guardian doctrine');
});

test('FB-017: the ghost is a stalker — ranged_stalker on the row, spawned through', () => {
  const ghost = byId.get('quiet_ghost');
  assert.equal(ghost.combatDoctrineId, CombatDoctrineId.RANGED_STALKER);
  const spec = makeEnemySpawnSpec('quiet_ghost', 4, { x: 0, z: 0 });
  assert.equal(spec.data.ai.combatDoctrineId, CombatDoctrineId.RANGED_STALKER);
  assert.equal(spec.data.ai.approachTelegraph, 'sensor_ghost');
});

test('FB-017: the stalker never fires inside the lock band — it relocates instead', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 97 });
  const closeFrame = () => perception([shipContact(1, { x: 400, mobilityBand: 'low', threat: 0.95 })]);
  let result = runtime.update({
    tick: 0, entityId: 'ghost', doctrineId: CombatDoctrineId.RANGED_STALKER,
    perception: closeFrame(), directive,
  });
  assert.equal(result.phase, 'relocate',
    'a contact inside the lock band sends the stalker to egress on tick zero');
  assert.notEqual(result.maneuverKind, ManeuverKind.HOLD, 'relocation must move, not sit');
  assert.equal(result.faceTarget, false, 'a relocating hull is not aim-solving its target');
  // Still inside the band at tick 30: holds relocation, never reaches charge_cue.
  result = runtime.update({
    tick: 30, entityId: 'ghost', doctrineId: CombatDoctrineId.RANGED_STALKER,
    perception: closeFrame(), directive,
  });
  assert.equal(result.phase, 'relocate', 'the stalker keeps relocating while pressed inside 520');
  assert.equal(result.fireWindow, false);
});

test('FB-017: post-shot the stalker relocates to the opposite flank — a sequence the lancer never runs', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 97 });
  // Standoff inside the rejoin band so the relocation leg runs its full authored timeout.
  const frame = () => perception([shipContact(1, { x: 560, mobilityBand: 'low', threat: 0.95 })]);
  const seq = [];
  let firstSide = null;
  for (let tick = 0; tick <= 300; tick += 1) {
    const result = runtime.update({
      tick, entityId: 'ghost', doctrineId: CombatDoctrineId.RANGED_STALKER,
      perception: frame(), directive,
    });
    if (seq.length === 0 || seq[seq.length - 1] !== result.phase) seq.push(result.phase);
    if (result.phase === 'charge_cue' && firstSide == null) firstSide = result.side;
    if (tick === 45) {
      assert.equal(result.phase, 'charge_cue');
      assert.equal(result.telegraph.kind, 'sensor_ghost',
        'the stalker announces a lock-from-nowhere, not a gun heating');
      assert.equal(result.telegraph.durationTicks, DOCTRINE_TELEGRAPH_TICKS);
    }
  }
  assert.deepEqual(seq,
    ['outer_standoff', 'charge_cue', 'fire_window', 'relocate', 'outer_standoff', 'charge_cue', 'fire_window', 'relocate'],
    'ghost cycle: shoot, relocate, rejoin, shoot again from the other side — never the lancer reset');
});

test('FB-017: lancer and ghost produce different phase sequences over an identical drive', () => {
  const frame = () => perception([shipContact(1, { x: 620, mobilityBand: 'low', threat: 0.95 })]);
  const sequenceFor = (doctrineId) => {
    const runtime = new CombatDoctrineRuntime({ seed: 97 });
    const seq = [];
    for (let tick = 0; tick <= 200; tick += 1) {
      const result = runtime.update({
        tick, entityId: 'shooter', doctrineId,
        perception: frame(), directive,
      });
      if (seq.length === 0 || seq[seq.length - 1] !== result.phase) seq.push(result.phase);
    }
    return seq;
  };
  const lancer = sequenceFor(CombatDoctrineId.RANGED_DISENGAGER);
  const ghost = sequenceFor(CombatDoctrineId.RANGED_STALKER);
  assert.ok(lancer.includes('reset'), 'the lancer dwells in an explicit post-shot reset');
  assert.ok(!lancer.includes('relocate'), 'the lancer never relocates');
  assert.ok(ghost.includes('relocate'), 'the ghost relocates after every shot');
  assert.ok(!ghost.includes('reset'), 'the ghost never dwells on the spent lane');
  assert.notDeepEqual(ghost, lancer, 'identical drives must produce distinct sequences');
});

function perception(contactsValue, selfOverrides = {}) {
  return {
    self: {
      ...selfOverrides,
      id: selfOverrides.id ?? 2,
      team: 1,
      pos: { x: selfOverrides.x ?? 0, z: selfOverrides.z ?? 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: 0,
      combatDoctrineId: selfOverrides.combatDoctrineId || null,
      activity: {
        kind: selfOverrides.activity || ActivityKind.ATTACK_RUN,
        reason: 'fb017_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: selfOverrides.roe || RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: contactsValue,
    events: [],
  };
}

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: values.alive ?? true,
    valid: values.valid ?? true,
    visible: values.visible ?? true,
    ageTicks: values.ageTicks ?? 0,
    hostile: values.hostile ?? true,
    confidence: values.confidence ?? 1,
    threat: values.threat ?? 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    tethered: values.tethered ?? false,
    operationalMassBand: values.operationalMassBand || 'medium',
    mobilityBand: values.mobilityBand || 'medium',
    cargoBand: values.cargoBand || 'empty',
    tetherabilityBand: values.tetherabilityBand || 'good',
    tags: values.tags || [],
  };
}

function baseDirective() {
  return Object.freeze({
    tick: 0,
    squadId: 'fb017',
    memberId: 2,
    role: 'striker',
    tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fb017' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}
