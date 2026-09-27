// detonator_dart — the kamikaze hull: fast, fragile, low-mass, and its ONLY weapon is the blast
// impulseCharges owns. These tests pin the physical contract: spawn spec, doctrine phases,
// fail-closed fire authority, the exactly-once blast, and its seat in the authored wave-2 route.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
  normalizeCombatDoctrineId,
} from '../src/ai/combatDoctrine.js';
import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  SURVIVAL_WAVES,
  THROW_CLASS_MAX_MASS,
  catalogQuestionIssues,
  validateWaveRecipe,
} from '../src/data/survivalWaves.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import {
  doctrinePhaseStage,
  grammarForDoctrine,
  isLiveDoctrineId,
} from '../src/presentation/combatChoreography.js';
import { leftoverTelegraphKind } from '../src/ui/threatHalo.js';

const DART_DEF = ENEMY_TYPES.find((e) => e.id === 'detonator_dart');

// ── enemy definition + spawn spec ──────────────────────────────────────────────

test('detonator_dart is fast, fragile, weaponless and inside the throw class', () => {
  assert.ok(DART_DEF, 'detonator_dart must exist on the roster');
  assert.ok(DART_DEF.mass <= THROW_CLASS_MAX_MASS,
    `a dart the player cannot shove or sling is not the physical problem (mass ${DART_DEF.mass})`);
  assert.ok(DART_DEF.maxSpeed >= 150, 'the dart must visibly be the fastest thing in the room');
  assert.ok(DART_DEF.hull <= 60, 'fragile hull: the fight is where it dies, not whether');
  assert.deepEqual(DART_DEF.weapons, [], 'a kamikaze mounts no guns');
  assert.equal(DART_DEF.combatDoctrineId, 'detonator_run');
  assert.equal(DART_DEF.telegraph.cue, 'detonator_fuse');
  assert.ok(Number.isFinite(DART_DEF.detonator.blastRadius)
    && Number.isFinite(DART_DEF.detonator.damage)
    && Number.isFinite(DART_DEF.detonator.impulse)
    && Number.isFinite(DART_DEF.detonator.triggerRange),
    'the fuse needs authored blast numbers, not a defaults guess');
  assert.ok(DART_DEF.detonator.triggerRange < DART_DEF.detonator.blastRadius,
    'the fuse must fire before the blast edge — it pops next to a hull, not on top of one');
});

test('makeEnemySpawnSpec carries the fuse and the doctrine through data', () => {
  const spec = makeEnemySpawnSpec('detonator_dart', 1, { x: 0, z: 0 }, { startedTick: 0 });
  assert.deepEqual(spec.data.detonator, DART_DEF.detonator);
  assert.equal(spec.data.ai.combatDoctrineId, 'detonator_run');
  assert.equal(spec.data.ai.approachTelegraph, 'detonator_fuse');
  assert.equal(spec.data.silhouette, 'detonator_dart');
  assert.equal(spec.mass, DART_DEF.mass);
  assert.equal(spec.data.weapons.length, 0, 'no mount resolves onto a kamikaze hull');
});

test('an unknown enemy id fails loudly and still returns a safe fallback', () => {
  const warnings = [];
  const prior = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const spec = makeEnemySpawnSpec('not_a_real_enemy', 1, { x: 0, z: 0 });
    assert.ok(spec, 'the fallback keeps the spawn slot filled rather than returning null');
    assert.equal(spec.data.lootTableId, ENEMY_TYPES[0].id, 'fallback is the canonical first type');
    assert.equal(spec.data.spawnFallbackFor, 'not_a_real_enemy',
      'the spec must carry the authored id so callers can distinguish fallback from intent');
  } finally {
    console.warn = prior;
  }
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('not_a_real_enemy'), 'the diagnostic names the bad id');
});

// ── doctrine runtime ──────────────────────────────────────────────────────────

function dartPerception(targetX, selfX = 0, selfOverrides = {}) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: selfX, z: 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: selfOverrides.rot ?? 0,
      hullFraction: selfOverrides.hullFraction ?? 1,
      heatFraction: 0,
      combatDoctrineId: CombatDoctrineId.DETONATOR_RUN,
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: 'detonator_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 60,
        startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [{
      id: 1,
      kind: ContactKind.SHIP,
      alive: true, valid: true, visible: true,
      hostile: true, confidence: 1, threat: 1,
      pos: { x: targetX, z: 0 },
      vel: { x: 0, z: 0 },
      mobilityBand: 'medium', operationalMassBand: 'medium',
      cargoBand: 'empty', tetherabilityBand: 'good',
      tags: [],
    }],
    events: [],
  };
}

function dartDirective() {
  return Object.freeze({
    tick: 0, squadId: 'fixture', memberId: 2, role: 'striker', tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}

test('detonator_run telegraphs a fuse, then commits to one straight run', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 11 });
  const directive = dartDirective();

  // Approach from beyond fuse range: ingress, no telegraph.
  let r = runtime.update({ tick: 0, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(800), directive });
  assert.equal(r.phase, 'ingress');
  assert.equal(r.telegraph, null);
  assert.equal(r.maneuverKind, ManeuverKind.INTERCEPT);

  // Inside fuse range: the wind-up lights and stays a full 30 ticks while the dart closes.
  r = runtime.update({ tick: 2, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(220), directive });
  assert.equal(r.phase, 'fuse_cue');
  assert.equal(r.telegraph.kind, 'detonator_fuse');
  assert.ok(r.telegraph.durationTicks >= DOCTRINE_TELEGRAPH_TICKS);
  assert.equal(r.telegraphStarted, true);
  assert.equal(r.faceTarget, true);
  assert.equal(r.allowedActionId, null, 'the fuse is not a weapon');

  // Still lit mid-cue — no early commit.
  r = runtime.update({ tick: 20, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(150), directive });
  assert.equal(r.phase, 'fuse_cue');

  // After the cue: committed terminal approach — nose on target, still no action id.
  r = runtime.update({ tick: 34, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(90), directive });
  assert.equal(r.phase, 'commit');
  assert.equal(r.allowedActionId, null);
  assert.equal(r.maneuverKind, ManeuverKind.INTERCEPT);
  assert.equal(r.faceTarget, true);
});

test('a missed run egresses, reforms, and re-announces the next pass', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 11 });
  const directive = dartDirective();
  // Commit, then fly PAST the target: heading +x with the target now astern (x decreasing).
  runtime.update({ tick: 0, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(800), directive });
  runtime.update({ tick: 2, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(220), directive });
  runtime.update({ tick: 34, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN, perception: dartPerception(90), directive });
  // Overshot: target behind the dart's heading and distance growing again after a close pass.
  // Commit began ~tick 32 (fuse at tick 2 + 30-tick cue); at tick 44 the run has passed but the
  // 20-tick commit minimum still holds it on target — the dart commits to its own miss.
  let r = runtime.update({
    tick: 44, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN,
    perception: dartPerception(-160, 0, { vx: 150, vz: 0 }),
    directive,
  });
  assert.equal(r.phase, 'commit', 'commit survives a fresh overshoot until the minimum is lived');
  r = runtime.update({
    tick: 120, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN,
    perception: dartPerception(-160, 0, { vx: 150, vz: 0 }),
    directive,
  });
  assert.equal(r.phase, 'breakaway');
  assert.equal(r.outcome, 'detonator_missed');
  r = runtime.update({
    tick: 400, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN,
    perception: dartPerception(-160, 0, { vx: 150, vz: 0 }),
    directive,
  });
  assert.equal(r.phase, 'reform');
  r = runtime.update({
    tick: 452, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN,
    perception: dartPerception(-160, 0, { vx: 0, vz: 0 }),
    directive,
  });
  assert.equal(r.phase, 'ingress');
  assert.equal(r.cycle, 1);
  // The re-run lights the fuse again — every approach re-announces itself.
  r = runtime.update({
    tick: 460, entityId: 2, doctrineId: CombatDoctrineId.DETONATOR_RUN,
    perception: dartPerception(-160, 0),
    directive,
  });
  assert.equal(r.phase, 'fuse_cue');
  assert.equal(r.telegraph.kind, 'detonator_fuse');
});

test('detonator_run normalizes and presents like a first-class doctrine', () => {
  assert.equal(normalizeCombatDoctrineId('detonator_run'), 'detonator_run');
  assert.equal(isLiveDoctrineId('detonator_run'), true);
  const grammar = grammarForDoctrine('detonator_run');
  assert.equal(grammar.telegraphKind, 'detonator_fuse');
  assert.ok(grammar.telegraphTicks >= 30);
  assert.equal(doctrinePhaseStage('detonator_run', 'breakaway'), 'break');
  assert.equal(doctrinePhaseStage('detonator_run', 'reform'), 'withdraw');
  assert.equal(leftoverTelegraphKind({ kind: 'detonator_fuse' }), 'detonator_fuse');
  assert.equal(leftoverTelegraphKind({ doctrineId: 'detonator_run' }), 'detonator_fuse');
});

// ── the blast itself ──────────────────────────────────────────────────────────

function dart(id, x, z, extras = {}) {
  return {
    id, type: 'ship', alive: true, team: 1,
    mass: 20, radius: 10,
    pos: { x, z }, vel: { x: 0, z: 0 },
    hull: 34, hullMax: 34, armorHp: 4, shield: 0,
    data: { runCohort: 'survival', detonator: { ...DART_DEF.detonator } },
    ...extras,
  };
}

function blastHarness({ dartAlive = true, dartX = 40, wingman = null } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    mass: 40, radius: 12,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, shield: 0, armorHp: 0,
    data: {},
  };
  const d = dart(7, dartX, 0, { alive: dartAlive });
  const entityList = [player, d];
  if (wingman) entityList.push(wingman);
  const events = [];
  const handlers = new Map();
  const bus = {
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
  };
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: 1,
    entityList,
    entities: new Map(entityList.map((e) => [e.id, e])),
    input: { actions: {} },
    player: { cargo: { items: {}, capVolume: 0, usedVolume: 0, usedMass: 0 } },
  };
  const impulses = [];
  const damage = [];
  const system = Object.create(impulseCharges);
  system.init({
    state, bus,
    helpers: {
      combatPhysics: { applyImpulse(req) { impulses.push(req); return true; } },
      routeCombatDamage(req) {
        damage.push(req);
        const target = state.entities.get(req.targetId);
        const channels = req.packet && req.packet.channels;
        const amount = channels
          ? Object.values(channels).reduce((sum, v) => sum + (Number(v) || 0), 0)
          : (req.packet && Number.isFinite(req.packet.damage) ? req.packet.damage : 0);
        if (target && amount > 0) {
          target.shield = Math.max(0, (target.shield || 0) - amount);
          const rest = Math.max(0, amount - (target.shield || 0));
          target.hull = (target.hull || 0) - rest;
          if (target.hull <= 0 && target.alive !== false) {
            target.alive = false;
            bus.emit('entity:killed', { id: target.id, killerId: req.attackerId });
          }
        }
        return { ok: true };
      },
    },
    registry: { get() { return null; } },
  });
  return { events, impulses, damage, player, dart: d, state, bus, system };
}

test('proximity: a dart that reaches a hostile pops itself through the shared blast', () => {
  const h = blastHarness({ dartX: 30 });
  h.system.update(1 / 60, h.state);
  const receipt = h.events.find((e) => e.name === 'detonator:detonated');
  assert.ok(receipt, 'the pop is a named receipt, not invisible physics');
  assert.equal(receipt.payload.trigger, 'proximity');
  assert.equal(receipt.payload.entityId, 7);
  assert.ok(h.events.some((e) => e.name === 'charge:detonated' && e.payload.trigger === 'detonator_dart'),
    'shared blast receipt for VFX/audio/credit consumers');
  assert.ok(h.impulses.some((r) => r.entityId === 1), 'the blast physically shoves the player hull');
  const selfHit = h.damage.find((r) => r.targetId === 7);
  assert.ok(selfHit, 'the fuse kills the dart through the damage router');
  assert.equal(selfHit.attackerId, 7, 'a self-popped dart owns its own death');
  assert.equal(h.dart.alive, false);
});

test('death: a player kill pops the dart where it died and keeps player credit', () => {
  const wing = { id: 8, type: 'ship', alive: true, team: 1, mass: 60, radius: 12,
    pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, shield: 0, armorHp: 0, data: {} };
  const h = blastHarness({ dartAlive: false, dartX: 40, wingman: wing });
  h.bus.emit('entity:killed', { id: 7, killerId: 1 });
  h.system.update(1 / 60, h.state);
  const receipt = h.events.find((e) => e.name === 'detonator:detonated');
  assert.ok(receipt);
  assert.equal(receipt.payload.trigger, 'death');
  assert.equal(receipt.payload.killerId, 1, 'a dart the player killed pops with player credit');
  const wingHit = h.damage.find((r) => r.targetId === 8);
  assert.ok(wingHit, 'the wingman in the blast eats real damage');
  assert.equal(wingHit.attackerId, 1, 'kill-chain credit survives the hop');
  assert.ok(h.impulses.some((r) => r.entityId === 8), 'the wingman is physically shoved');
});

test('an NPC kill does not steal the player chain', () => {
  const h = blastHarness({ dartAlive: false, dartX: 900 });
  h.bus.emit('entity:killed', { id: 7, killerId: 99 });
  h.system.update(1 / 60, h.state);
  const receipt = h.events.find((e) => e.name === 'detonator:detonated');
  assert.ok(receipt, 'the death pop still happens far from the player');
  assert.equal(receipt.payload.killerId, 7);
});

test('the fuse is exactly-once: duplicated kill receipts and a spent proximity pop dedupe', () => {
  const h = blastHarness({ dartAlive: false, dartX: 40 });
  h.bus.emit('entity:killed', { id: 7, killerId: 1 });
  h.bus.emit('entity:killed', { id: 7, killerId: 1 }); // sweep + kill path double receipt
  h.system.update(1 / 60, h.state);
  h.system.update(1 / 60, h.state);
  h.system.update(1 / 60, h.state);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 1,
    'three ticks and two receipts produce exactly one blast');
});

test('a dart does not cook off alone, and a wingman on its own team is not a fuse', () => {
  const wing = { id: 9, type: 'ship', alive: true, team: 1, mass: 60, radius: 12,
    pos: { x: 70, z: 0 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, data: {} };
  const h = blastHarness({ dartX: 900, wingman: wing });
  // Dart at x=900, wingman at x=70 — far apart; nothing hostile within the fuse ring.
  h.state.entities.get(1).pos.x = 3000;
  h.system.update(1 / 60, h.state);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 0);
  // Same-team hull parked inside the trigger ring: still quiet.
  h.dart.pos.x = 40;
  h.system.update(1 / 60, h.state);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 0,
    'a wingman inside the ring never triggers it — the fuse only knows hostile hulls');
});

// ── the authored route ────────────────────────────────────────────────────────

test('wave 2 of the default authored route fields the dart in its rear pressure package', () => {
  const arenaId = COMBAT_LAB_ARENAS[0].id;
  const recipe = SURVIVAL_WAVES.find((r) => r.arenaId === arenaId && r.wave === 2);
  const pkg = recipe.packages.find((p) => p.enemyId === 'detonator_dart');
  assert.ok(pkg, 'the dart rides the authored wave-2 route');
  assert.equal(pkg.role, 'pressure', 'the dart is part of the rear pressure push');
  assert.equal(pkg.gateGroup, recipe.packages.find((p) => p.enemyId === 'reaver_pirate').gateGroup,
    'darts arrive through the same rear gate as the raider pressure');
  assert.ok(validateWaveRecipe(recipe).ok);
  assert.equal(catalogQuestionIssues().length, 0, 'the wave-2 question still names bodies that ship');

  const plan = planWave({ seed: 47, arenaId, wave: 2, act: 0, difficulty: 1, mutators: [], buildSummary: null });
  assert.ok(plan.packages.some((p) => p.enemyId === 'detonator_dart'), 'the planner carries the package');
});
