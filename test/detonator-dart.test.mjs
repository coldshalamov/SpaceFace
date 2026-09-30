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
  SURVIVAL_ENDLESS_OVERLAYS,
  SURVIVAL_WAVES,
  THROW_CLASS_MAX_MASS,
  catalogQuestionIssues,
  validateWaveRecipe,
} from '../src/data/survivalWaves.js';
import {
  SWARM_ROSTER,
  pickSwarmArchetype,
  swarmCatalogIssues,
  swarmEligibleEnemyIds,
} from '../src/data/swarmMode.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { lightCookoffEligible } from '../src/combat/lightCookoff.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { resolveBossSurfaceContact } from '../src/combat/bossSurface.js';
import { specialistPlanByEnemyId } from '../src/ai/specialistPlans.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
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
          const preHull = target.hull || 0;
          const preShield = target.shield || 0;
          target.shield = Math.max(0, preShield - amount);
          const rest = Math.max(0, amount - preShield);
          target.hull = preHull - rest;
          // The production router publishes combat:damage for every routed hit
          // (src/combat/damage.js) — doctrine cycles complete on this receipt.
          bus.emit('combat:damage', {
            targetId: req.targetId,
            attackerId: req.attackerId,
            amount,
            applied: rest,
            hullDamage: rest,
            shieldDamage: Math.min(preShield, amount),
            dominantLayer: rest > 0 ? 'hull' : 'shield',
            before: { hull: preHull, shield: preShield },
            after: { hull: target.hull, shield: target.shield },
          });
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

test('a recycled entity id keeps a live fuse — no permanent dud', () => {
  const h = blastHarness({ dartAlive: false, dartX: 900 });
  h.bus.emit('entity:killed', { id: 7, killerId: 1 });
  h.system.update(1 / 60, h.state);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 1,
    'the first dart still death-pops');

  // Core hands the corpse's id to the next spawn: same id, NEW entity object.
  h.state.entities.delete(7);
  h.state.entityList.splice(h.state.entityList.findIndex((e) => e.id === 7), 1);
  const second = dart(7, 900, 0);
  h.state.entities.set(7, second);
  h.state.entityList.push(second);

  // A duplicated kill receipt arriving after the recycle resolves to the LIVE dart: refused.
  h.bus.emit('entity:killed', { id: 7, killerId: 1 });
  h.system.update(1 / 60, h.state);
  h.system.update(1 / 60, h.state);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 1,
    'a stale receipt on the recycled id cannot pop the living dart');

  // And the recycled dart's own fuse still works — it reaches a hostile and pops.
  second.pos.x = 30;
  h.system.update(1 / 60, h.state);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 2,
    'the recycled-id dart is not a permanent dud');
  assert.equal(second.alive, false);
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

// ── the choreography commit beat (PIC-17) ─────────────────────────────────────
// The dart mounts no weapon, so nothing ever emitted combat:fire for it — the authored
// detonator_run grammar reached its 'commit' action row only by comment. impulseCharges
// now publishes the detonation itself as the doctrine's action through that same channel.

function doctrineHarness(opts = {}) {
  const h = blastHarness(opts);
  // Doctrine darts carry their row through data.ai (makeEnemySpawnSpec pins it).
  h.dart.data.ai = { combatDoctrineId: 'detonator_run' };
  const orchestrator = Object.create(presentationOrchestrator);
  orchestrator.init({ state: h.state, bus: h.bus });
  h.orchestrator = orchestrator;
  h.bus.emit('ai:telegraph', {
    entityId: 7, targetId: 1,
    doctrineId: 'detonator_run', phase: 'fuse_cue',
    kind: 'detonator_fuse', durationTicks: 30, tick: h.state.tick,
  });
  // The fuse telegraph precedes the pop by ~30 ticks in production; letting the tick roll
  // keeps the pop's commit+aftermath+damage receipts from sharing a lane budget with the
  // setup/telegraph pair, which is arbitration pressure the live game never creates.
  h.state.tick += 30;
  h.state.simTime += 0.5;
  return h;
}

const cuesOf = (h, id) =>
  h.events.filter((e) => e.name === 'presentation:cue' && e.payload && e.payload.id === id);
const cueIndex = (h, id) =>
  h.events.findIndex((e) => e.name === 'presentation:cue' && e.payload && e.payload.id === id);
const commitFires = (h) => h.events.filter((e) => e.name === 'combat:fire');

test('proximity: the detonation IS the detonator_run commit beat — once, in order', () => {
  const h = doctrineHarness({ dartX: 30 });
  assert.equal(cuesOf(h, 'combat.doctrine.setup').length, 1, 'the telegraph staged the row');
  assert.equal(cuesOf(h, 'combat.doctrine.telegraph').length, 1);

  h.system.update(1 / 60, h.state);

  const fires = commitFires(h);
  assert.equal(fires.length, 1, 'one detonation publishes exactly one commit receipt');
  assert.equal(fires[0].payload.ownerId, 7);
  assert.equal(fires[0].payload.sourceId, 7);
  assert.equal(fires[0].payload.doctrineId, 'detonator_run');
  assert.equal(fires[0].payload.actionId, 'commit');
  assert.equal(fires[0].payload.trigger, 'proximity');
  assert.equal(fires[0].payload.detonation, true);

  const actions = cuesOf(h, 'combat.doctrine.action');
  assert.equal(actions.length, 1, 'the commit beat lands once');
  const action = actions[0].payload;
  assert.equal(action.sourceId, 7);
  assert.equal(action.targetId, 1);
  assert.equal(action.sourceEvent, 'combat:fire');
  for (const tag of ['detonator_run', 'wedge', 'commit', 'action']) {
    assert.ok(action.tags.includes(tag), `commit cue carries '${tag}'`);
  }

  // The blast still reads as ONE pop, and the four-beat row lands in authored order:
  // setup -> telegraph -> action(commit) -> aftermath (the player's combat:damage completes
  // the cycle). Commit must precede the receipts that resolve it.
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 1);
  assert.equal(h.events.filter((e) => e.name === 'charge:detonated').length, 1);
  const order = ['combat.doctrine.setup', 'combat.doctrine.telegraph',
    'combat.doctrine.action', 'combat.doctrine.aftermath'].map((id) => cueIndex(h, id));
  assert.ok(order.every((i) => i >= 0), `all four beats emitted: ${order}`);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], `beat ${i} follows beat ${i - 1}: ${order}`);
  }
});

test('death: a killed dart commits at queue time, before its cycle can be cleared', () => {
  const h = doctrineHarness({ dartAlive: false, dartX: 40 });
  // The kill dispatch runs impulseCharges' handler first (registry order): the commit must
  // already be out before the orchestrator's own entity:killed listener clears the cycle.
  h.bus.emit('entity:killed', { id: 7, killerId: 1 });
  assert.equal(commitFires(h).length, 1, 'the commit published inside the kill dispatch');
  assert.equal(commitFires(h)[0].payload.trigger, 'death');
  assert.equal(cuesOf(h, 'combat.doctrine.action').length, 1,
    'the action cue beat the entity:killed cycle clear');

  h.system.update(1 / 60, h.state);
  const receipt = h.events.find((e) => e.name === 'detonator:detonated');
  assert.ok(receipt, 'the queued blast still resolves on the next tick');
  assert.equal(receipt.payload.trigger, 'death');
  assert.equal(commitFires(h).length, 1, 'the blast does not publish a second commit');
  assert.equal(cuesOf(h, 'combat.doctrine.action').length, 1);
});

test('duplicated kill receipts publish exactly one commit and one pop', () => {
  const h = doctrineHarness({ dartAlive: false, dartX: 40 });
  h.bus.emit('entity:killed', { id: 7, killerId: 1 });
  h.bus.emit('entity:killed', { id: 7, killerId: 1 });
  h.system.update(1 / 60, h.state);
  h.system.update(1 / 60, h.state);
  assert.equal(commitFires(h).length, 1, 'the once-gate lives at queue time, not only blast time');
  assert.equal(cuesOf(h, 'combat.doctrine.action').length, 1);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 1);
});

test('a doctrineless dart stays a plain detonation — no commit, no doctrine cue', () => {
  const h = blastHarness({ dartX: 30 });
  const orchestrator = Object.create(presentationOrchestrator);
  orchestrator.init({ state: h.state, bus: h.bus });
  // A player-dropped/ordinary dart carries data.detonator but no doctrine row. Even with the
  // orchestrator live, its pop must not manufacture a doctrine action.
  h.system.update(1 / 60, h.state);
  assert.equal(commitFires(h).length, 0, 'no combat:fire without a detonator_run doctrine');
  assert.equal(cuesOf(h, 'combat.doctrine.action').length, 0);
  assert.equal(h.events.filter((e) => e.name === 'detonator:detonated').length, 1,
    'the blast itself is unchanged');
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

test('the swarm roster carries the dart from wave 5, and every swarm-named id resolves', () => {
  const row = SWARM_ROSTER.find((entry) => entry.enemyId === 'detonator_dart');
  assert.ok(row, 'the endless ruleset must field the dart');
  assert.equal(row.role, 'pressure');
  assert.equal(row.fromWave, 5, 'one newcomer per wave — wave 5 was the free slot');
  assert.ok(!swarmEligibleEnemyIds(4).has('detonator_dart'), 'not yet legal at wave 4');
  assert.ok(swarmEligibleEnemyIds(5).has('detonator_dart'), 'legal from its unlock wave');
  // Wave-5 newcomer bias is 2.5x; a roll at the top of the wheel lands the dart.
  const dart = pickSwarmArchetype(5, 0.99);
  assert.equal(dart.enemyId, 'detonator_dart', 'the unlock wave actually fields it, not just lists it');
  assert.equal(swarmCatalogIssues().length, 0,
    'every roster and boss-rotation id is a live catalog member');
});

test('endless overlays field the dart and the catalog gate proves every named id', () => {
  const overlay = SURVIVAL_ENDLESS_OVERLAYS.find((row) => row.pressureEnemyId === 'detonator_dart'
    || row.massEnemyId === 'detonator_dart' || row.controlEnemyId === 'detonator_dart');
  assert.ok(overlay, 'an endless overlay carries the dart into deep-run compositions');
  assert.equal(catalogQuestionIssues().length, 0,
    'question props, role problems and overlays all name live catalog ids');
  // The package gate still fails bad ids the moment a recipe ships one.
  const recipe = SURVIVAL_WAVES.find((r) => r.arenaId === COMBAT_LAB_ARENAS[0].id && r.wave === 2);
  const bad = { ...recipe, packages: [...recipe.packages, { ...recipe.packages[0], enemyId: 'wasp_typo' }] };
  const result = validateWaveRecipe(bad);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.path.endsWith('.enemyId')), 'the failure names the bad id');
});

// ── one blast per hull: no generic cookoff under the fuse ──────────────────────

test('a dart does not ALSO light-cook-off — its authored pop is the whole blast', () => {
  const state = { run: { kind: 'survival' } };
  const dartHull = {
    type: 'ship', alive: false, mass: 20,
    data: { runCohort: 'survival', shipClass: 'drone', detonator: { ...DART_DEF.detonator } },
  };
  // Throw-class survival hull — would cook off if not for the detonator exclusion.
  assert.equal(lightCookoffEligible(state, dartHull), false,
    'the fuse pop is the dart\'s death blast; a second small burst would be double-dipping');
  const plainWasp = {
    type: 'ship', alive: false, mass: 16,
    data: { runCohort: 'survival', shipClass: 'drone' },
  };
  assert.equal(lightCookoffEligible(state, plainWasp), true, 'ordinary lights still cook off');
});

// ── plan-level integration ────────────────────────────────────────────────────

test('the dart is a doctrine hull, not a counterplay-verb specialist', () => {
  // specialistPlans are applySpecialistCounterplay verbs (cut/disrupt/snare/ward). A kamikaze
  // has no verb to dispatch — its counterplay is physical, and impulseCharges owns the fuse.
  // The absence is deliberate; the doctrine below is its plan integration.
  assert.equal(specialistPlanByEnemyId('detonator_dart'), null);
  assert.equal(DART_DEF.combatDoctrineId, 'detonator_run');
  assert.ok(isLiveDoctrineId('detonator_run'));
  assert.ok(String(DART_DEF.counterHint).includes('shove'),
    'the counter hint names the physical answer');
});

// ── survival cohort bookkeeping ───────────────────────────────────────────────

const WAVE_DT = 1 / 60;
const WAVE_SEED = 7;

function waveBoot() {
  const state = createGameState(WAVE_SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id, p && p.entity));
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, player };
}

function waveTick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    survivalWave.update(WAVE_DT);
    survivalRun.update(WAVE_DT);
  }
}

function reachActive(h) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: WAVE_SEED, arenaId: 'helios_core' });
  h.bus.emit('run:loadoutReady', {});
  waveTick(h, 1);
  waveTick(h, SURVIVAL_ARENA_INTRO_TICKS);
  waveTick(h, SURVIVAL_WAVE_INTRO_TICKS);
  return h.state.run;
}

test('a cohort member resolves on its kill receipt — a corpse that lingers cannot hold the wave', () => {
  const h = waveBoot();
  reachActive(h);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.spawned.length, 6);
  // Kill every member WITHOUT any entity:destroyed receipt — the hulls stay in the entity map
  // as dead corpses, the way a wreck lingers. The wave must still resolve.
  for (const body of [...h.spawned]) {
    body.alive = false;
    h.bus.emit('entity:killed', { id: body.id, killerId: h.player.id });
  }
  assert.equal(survivalWave._cohort.size, 0, 'kill receipts resolved every member');
  assert.equal(survivalWave._resolved, 6);
  waveTick(h, 1);
  const cleared = h.emitted.filter((e) => e.event === 'run:waveCleared');
  assert.equal(cleared.length, 1, 'the wave cleared on kills alone — no destroy receipts needed');
  // A destroy receipt that arrives after the kill resolution does not double-count the body.
  const resolvedBefore = survivalWave._resolved;
  for (const body of h.spawned) {
    h.state.entities.delete(body.id);
    h.bus.emit('entity:destroyed', { id: body.id, entity: body });
  }
  assert.equal(survivalWave._resolved, resolvedBefore, 'late destroy receipts are deduped');
});

test('a stale destroy receipt cannot drop a live cohort member that recycled its id', () => {
  const h = waveBoot();
  reachActive(h);
  const victim = h.spawned[0];
  const recycledId = victim.id;
  victim.alive = false;
  h.bus.emit('entity:killed', { id: recycledId, killerId: h.player.id });
  assert.equal(survivalWave._cohort.has(recycledId), false, 'the kill resolved the slot');
  h.state.entities.delete(recycledId);
  // The id is recycled into a NEW live cohort body (the wave's own respawn path hands ids out
  // of freeIds inside one step). Then the predecessor's queued destroy receipt finally lands.
  const recycled = {
    id: recycledId, type: 'ship', alive: true, team: 1,
    pos: { x: 10, z: 0 }, data: { runCohort: 'survival', runWave: 1, runRole: 'mass' },
  };
  h.state.entities.set(recycledId, recycled);
  survivalWave._cohort.set(recycledId, { role: 'mass', entity: recycled });
  const sizeBefore = survivalWave._cohort.size;
  h.bus.emit('entity:destroyed', { id: recycledId, entity: victim });
  assert.equal(survivalWave._cohort.size, sizeBefore,
    'the predecessor corpse receipt does not drop the recycled live member');
  assert.equal(survivalWave._cohort.get(recycledId).entity, recycled);
  // The live member's own destroy receipt resolves it.
  h.state.entities.delete(recycledId);
  h.bus.emit('entity:destroyed', { id: recycledId, entity: recycled });
  assert.equal(survivalWave._cohort.has(recycledId), false, 'the live member resolves on its own receipt');
});

// ── determinism ───────────────────────────────────────────────────────────────

test('the same seed plans and materializes the identical wave, darts included', () => {
  const arenaId = COMBAT_LAB_ARENAS[0].id;
  const args = { seed: 47, arenaId, wave: 2, act: 0, difficulty: 1, mutators: [], buildSummary: null };
  assert.deepEqual(planWave(args), planWave({ ...args }), 'same seed -> identical plan');
  // Two boots of the run place every hull at the same point. The wave systems are module
  // singletons — each boot re-binds them, so drive each run to active before the next boot.
  const a = waveBoot();
  reachActive(a);
  const b = waveBoot();
  reachActive(b);
  assert.deepEqual(
    a.spawned.map((e) => ({ t: e.data.lootTableId, x: e.pos.x, z: e.pos.z })),
    b.spawned.map((e) => ({ t: e.data.lootTableId, x: e.pos.x, z: e.pos.z })),
    'same seed -> identical placement stream',
  );
});

// ── two stat skins that are NOT stat skins any more ────────────────────────────
// patrol_lawman and customs_cutter share ship_hornet, the patrol_interdict silhouette, the
// brawler archetype and the interceptor_flyby doctrine — the pair was differentiated by
// numbers alone. Each now carries one physical differentiator on existing machinery.

function routeHitOnLaw(target, hitPos) {
  const bus = { on() { return () => {}; }, emit() {} };
  const state = {
    tick: 300, simTime: 5, playerId: 9,
    meta: { seed: 47 },
    settings: { gameplay: { difficulty: 'standard' } },
    input: { actions: {} }, player: { credits: 0 },
    entities: new Map([[target.id, target]]),
    entityList: [target],
    world: {},
  };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return combat.ensureKernel().routeDamage({
    attackerId: 9,
    targetId: target.id,
    packet: scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic', pos: hitPos, subsystemShare: 0 }),
    origin: { kind: 'test', id: 'skin-diff' },
  });
}

test('the interceptor reads as a plated prow: face-tanking sheds, the stern pays', () => {
  const patrol = ENEMY_TYPES.find((e) => e.id === 'patrol_lawman');
  const cutter = ENEMY_TYPES.find((e) => e.id === 'customs_cutter');
  assert.equal(patrol.silhouette, cutter.silhouette, 'precondition: the pair shares one silhouette');
  assert.equal(patrol.shipId, cutter.shipId, 'precondition: the pair shares one hull');
  const spec = makeEnemySpawnSpec('patrol_lawman', 3, { x: 0, z: 0 });
  assert.ok(spec.data.directionalArmor, 'the interceptor carries authored directional armor');
  const target = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, rot: 0,
    hull: 1000, hullMax: 1000, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    data: { lootTableId: 'patrol_lawman', directionalArmor: spec.data.directionalArmor },
  };
  const front = routeHitOnLaw(target, { x: 100, z: 0 });
  const rear = routeHitOnLaw({ ...target, hull: 1000, pos: { x: 0, z: 0 }, rot: 0 }, { x: -100, z: 0 });
  assert.equal(front.directionalArc, 'front');
  assert.equal(rear.directionalArc, 'rear');
  assert.ok(rear.totalApplied > front.totalApplied, 'crossing the pass to the stern beats the prow');
});

test('the cutter reads as a plated boarding prow: nose contacts bank, flanks eat', () => {
  const cutter = ENEMY_TYPES.find((e) => e.id === 'customs_cutter');
  assert.ok(cutter.prowSurface, 'the cutter carries authored prow surface');
  const target = {
    pos: { x: 0, z: 0 }, rot: 0,
    data: { lootTableId: 'customs_cutter' },
  };
  const nose = resolveBossSurfaceContact({
    surface: target,
    receipt: { point: { x: 50, z: 0 } },
  });
  assert.equal(nose.ok, true);
  assert.equal(nose.response, 'reflect', 'a ricochet shot at the boarding prow banks');
  const flank = resolveBossSurfaceContact({
    surface: target,
    receipt: { point: { x: 0, z: 50 } },
  });
  assert.equal(flank.response, 'damage', 'outside the prow arc the contact is ordinary armor');
});
