// CW-AI — enemy pilots worth fighting (INV-21 items 1, 6, 7, 9, 10).
// 1) the thrown-body tier table in both doors; 6) Swarm gate groups fly as auto-squad flights;
// 7) tier-aware friendly separation + pack_pursuit's authored ring; 9) one ai:flee per pressure
// break; 10) a committed volley holds when a rock is on the line.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ObjectiveKind, hashUnit } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import {
  REFLEX_KIND,
  createReflexEngine,
  emptyReflexState,
} from '../src/ai/reflexes.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { TacticalAIStack, friendlySeparationRadiusForTier } from '../src/ai/stack.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { assignAutoSquadRecipes, createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { applySwarmFeelSpec, materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { swarmCharacterFor } from '../src/data/swarmCharacter.js';
import { SWARM_FEEL_PROFILE } from '../src/data/swarmFeelProfile.js';

const SEED = 4242;
const ALERT = Object.freeze({ verve: 0.8, poise: 0.5, weave: 0.7, dash: 0.9, aim: 0.3 });
const INTENT = Object.freeze({ kind: 'intercept' });
const TICK_STEP = 2;

const noticeThreshold = (t, rear) => Math.min(0.7, Math.max(0.08, 0.18 + 0.32 * t.dash + 0.18 * (1 - t.aim))) * (rear ? 0.5 : 1);
const notices = (id, bodyId, t, rear = false) => hashUnit(SEED, id, bodyId, 'body_dodge_notice') < noticeThreshold(t, rear);
const pilotWhere = (pred) => {
  for (let id = 1; id < 400; id++) if (pred(id)) return id;
  throw new Error('no pilot id satisfies the fixture predicate');
};

function selfFrame(over = {}) {
  return { id: 'pilot', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    hullFraction: 1, heatFraction: 0, operationalMassBand: 'light', ...over };
}

function body(over = {}) {
  return { id: 'wreck-1', kind: ContactKind.HAZARD, hostile: false, alive: true, radius: 14, tags: [],
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, ...over };
}

function thrownAt(tick, { speed = 400, etaStart = 0.8, offsetZ = 4, dir = 1, ...over } = {}) {
  const t = tick / 60;
  return body({
    pos: { x: dir * speed * (etaStart - t), z: offsetZ },
    vel: { x: -dir * speed, z: 0 },
    ...over,
  });
}

function run(pilotId, makeContacts, { ticks = 80, temperament = ALERT, self = selfFrame(), intent = INTENT } = {}) {
  const engine = createReflexEngine({ seed: SEED });
  const rs = emptyReflexState();
  const out = [];
  for (let tick = 0; tick <= ticks; tick += TICK_STEP) {
    out.push({ tick, reflex: engine.evaluate({
      entityId: pilotId, tick, self, contacts: makeContacts(tick), target: null, intent,
      temperament, reflexState: rs,
    }) });
  }
  return { frames: out, reflexState: rs };
}

const firstDodge = (frames) => frames.find((f) => f.reflex && f.reflex.kind === REFLEX_KIND.BODY_DODGE) || null;

test('CW-AI 1 — the thrown-body tier table: fodder/heavy/capital never, light one per 4 s, medium after a 0.3 s wind-up', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const dodgeFor = (tier, ticks = 80) => firstDodge(run(pilot, (tick) => [thrownAt(tick)], {
    ticks, self: selfFrame({ bodyDodgeTier: tier }),
  }).frames);

  assert.equal(dodgeFor('fodder'), null, 'a Wasp in either door is the ammunition the throw exists for');
  assert.equal(dodgeFor('heavy'), null, 'a Bruiser is terrain');
  assert.equal(dodgeFor('capital'), null, 'a capital cannot sidestep a thrown wreck');

  const light = dodgeFor('light');
  const medium = dodgeFor('medium');
  assert.ok(light, 'a light pilot answers the throw');
  assert.ok(medium, 'a medium pilot answers the throw after its wind-up');
  const reactionTicks = 8 + Math.round((1 - ALERT.dash) * 18);
  assert.ok(medium.tick >= reactionTicks + 18,
    `medium dodge waits a 0.3 s (18-tick) wind-up (fired at ${medium.tick}, reaction ${reactionTicks})`);
  assert.ok(light.tick <= medium.tick - 18 + TICK_STEP,
    `light commits a wind-up sooner than medium (light ${light.tick}, medium ${medium.tick})`);

  // The light hull's 4 s refractory is the promise the design makes: one dodge per 240 ticks.
  const engine = createReflexEngine({ seed: SEED });
  const rs = emptyReflexState();
  let firedAt = null;
  for (let tick = 0; tick <= 60 && firedAt == null; tick += TICK_STEP) {
    const out = engine.evaluate({ entityId: pilot, tick, self: selfFrame({ bodyDodgeTier: 'light' }),
      contacts: [thrownAt(tick)], target: null, intent: INTENT, temperament: ALERT, reflexState: rs });
    if (out && out.kind === REFLEX_KIND.BODY_DODGE) firedAt = tick;
  }
  assert.ok(firedAt != null);
  assert.equal(rs.cooldowns.get(REFLEX_KIND.BODY_DODGE), firedAt + 240,
    'the light hull cooldown is 240 ticks exactly');
});

// ── sensor truth: both doors carry a concrete tier ────────────────────────────

function sensorWorld(extraEntities) {
  const player = { id: 1, type: 'ship', alive: true, team: 0, mass: 20, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 8, flags: {}, data: { ai: {}, weapons: [], combat: {} } };
  const entities = [player, ...extraEntities];
  const state = {
    mode: 'flight', playerId: 1, tick: 0, simTime: 0, meta: { seed: SEED }, rng: mulberry32(SEED),
    player: { ownedShips: [], activeShipIndex: 0, tether: null },
    input: { fire: false, actions: {} },
    combat: { beams: [], entities: {} },
    entities: new Map(entities.map((e) => [e.id, e])),
    entityList: entities,
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 0, ships: entities,
      weaponShips: [], projectiles: [], vectorMines: [], collidables: entities },
    tacticalAiRuntime: { quietLatched: false },
    massline2: {},
  };
  const helpers = { getEntity: (id) => state.entities.get(id) || null, spawnEntity() { return null; },
    hash32, mulberry32 };
  const ports = Object.create(aiPorts);
  ports.init({ state, bus: { emit() {} }, helpers });
  return { state, helpers };
}

function shipLike(id, over) {
  return { id, type: 'ship', alive: true, team: 2, mass: 40, pos: { x: 100 * id, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 12, flags: {}, data: { ai: {}, weapons: [], combat: {} }, ...over };
}

test('CW-AI 1 — the production sensor frame carries the design tier in Adventure and Swarm', () => {
  const wasp = shipLike(2, { data: { ai: {}, weapons: [], combat: {}, enemyTypeId: 'wasp_swarmer' } });
  const dart = shipLike(3, { data: { ai: {}, weapons: [], combat: {}, lootTableId: 'detonator_dart', runCohort: 'survival' } });
  const reaver = shipLike(4, { data: { ai: {}, weapons: [], combat: {}, lootTableId: 'reaver_pirate' } });
  const corsair = shipLike(5, { data: { ai: {}, weapons: [], combat: {}, enemyTypeId: 'corsair_raider' } });
  const zealot = shipLike(6, { data: { ai: {}, weapons: [], combat: {}, enemyTypeId: 'choir_zealot', runCohort: 'survival' } });
  const lancer = shipLike(7, { data: { ai: {}, weapons: [], combat: {}, enemyTypeId: 'lancer_sniper' } });
  const anchor = shipLike(8, { data: { ai: {}, weapons: [], combat: {}, enemyTypeId: 'field_anchor_controller', runCohort: 'survival' } });
  const bruiser = shipLike(9, { data: { ai: {}, weapons: [], combat: {}, enemyTypeId: 'bruiser_brawler', runCohort: 'survival' } });
  const heavyAdventure = shipLike(10, { mass: 160, data: { ai: {}, weapons: [], combat: {} } });
  const capital = shipLike(11, { mass: 900, data: { ai: {}, weapons: [], combat: {} } });
  const { helpers } = sensorWorld([wasp, dart, reaver, corsair, zealot, lancer, anchor, bruiser,
    heavyAdventure, capital]);
  const tierOf = (id) => helpers.aiSensors.frameFor(id, 0).self.bodyDodgeTier;

  assert.equal(tierOf(2), 'fodder', 'Wasp is fodder in Adventure, not only in Swarm');
  assert.equal(tierOf(3), 'fodder', 'Detonator Dart is fodder');
  assert.equal(tierOf(4), 'light', 'Reaver is light per 03_COMBAT §9');
  assert.equal(tierOf(5), 'light', 'Corsair is light per 03_COMBAT §9');
  assert.equal(tierOf(6), 'medium', 'Zealot is medium per 03_COMBAT §9');
  assert.equal(tierOf(7), 'medium', 'Lancer is medium per 03_COMBAT §9');
  assert.equal(tierOf(8), 'medium', 'Anchor is medium per 03_COMBAT §9');
  assert.equal(tierOf(9), 'heavy', 'Bruiser is heavy');
  assert.equal(tierOf(10), 'heavy', 'an unsheeted heavy hull keeps its mass band');
  assert.equal(tierOf(11), 'capital');
  assert.equal(helpers.aiSensors.frameFor(2, 0).self.bodyDodge, false, 'fodder keeps the legacy no-dodge bit');
  assert.equal(helpers.aiSensors.frameFor(8, 0).self.bodyDodge, true, 'medium keeps the bit');
  assert.equal(helpers.aiSensors.frameFor(9, 0).self.bodyDodge, false, 'heavy is terrain');
  assert.equal(helpers.aiSensors.frameFor(11, 0).self.bodyDodge, false, 'capital is terrain');
});

test('CW-AI 1 — the sheet exposes the design dodge tier without moving the materialisation band', () => {
  assert.equal(swarmCharacterFor('corsair_raider').tier, 'medium');
  assert.equal(swarmCharacterFor('corsair_raider').dodgeTier, 'light');
  assert.equal(swarmCharacterFor('reaver_pirate').dodgeTier, 'light');
  assert.equal(swarmCharacterFor('choir_zealot').tier, 'fodder');
  assert.equal(swarmCharacterFor('choir_zealot').dodgeTier, 'medium');
  assert.equal(swarmCharacterFor('lancer_sniper').tier, 'light');
  assert.equal(swarmCharacterFor('lancer_sniper').dodgeTier, 'medium');
  assert.equal(swarmCharacterFor('field_anchor_controller').tier, 'heavy');
  assert.equal(swarmCharacterFor('field_anchor_controller').dodgeTier, 'medium');
});

// ── item 6: a gate group is a flight ─────────────────────────────────────────

function materializationCtx(state, spawned) {
  const budget = makeBudgetApi(state);
  return {
    state,
    helpers: {
      spawnBudget: budget,
      spawnEntity(spec) {
        const id = state.nextEntityId++;
        const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
        state.entities.set(id, entity);
        state.entityList.push(entity);
        spawned.push(entity);
        return entity;
      },
    },
  };
}

test('CW-AI 6 — a 20-wasp Swarm gate group splits into at least two distinct auto-squad flights', () => {
  const state = createGameState(7);
  state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const spawned = [];
  const ctx = materializationCtx(state, spawned);
  const receipt = materializeWaveBatch(ctx, {
    enemyId: 'wasp_swarmer', count: 20, wave: 1, seed: 7, packageIndex: 0, batchIndex: 0,
    gateGroup: 'front', swarm: true, ownerId: 'survival-wave:cw-ai',
  });
  assert.equal(receipt.admitted, 20);
  for (const entity of spawned) {
    assert.equal(entity.data.ai.wingId, 'swarm:1:front', 'every body in the gate group names one flight key');
  }
  const stamped = assignAutoSquadRecipes(state, spawned, 7);
  assert.ok(stamped > 0, 'the existing auto-squad recipes apply to the horde');
  const frames = new Set(spawned.map((e) => e.data.ai.squadFrameId).filter(Boolean));
  assert.ok(frames.size >= 2, `twenty wasps become multiple flights (got ${frames.size})`);
  const recipes = new Set(spawned.map((e) => e.data.ai.squadRecipe).filter(Boolean));
  assert.ok(recipes.size >= 1, 'each flight carries an authored recipe id');
  const arrivals = new Set(spawned.map((e) => `${Math.round(e.pos.x)}|${Math.round(e.pos.z)}`));
  assert.ok(arrivals.size > 2, 'the flights arrive at different vectors, not one conga line');
});

// ── item 7: tier separation and the pack ring ────────────────────────────────

test('CW-AI 7 — friendly separation is tier-aware and wired through the stack', () => {
  assert.equal(friendlySeparationRadiusForTier('fodder'), 60);
  assert.equal(friendlySeparationRadiusForTier('light'), 90);
  assert.equal(friendlySeparationRadiusForTier('medium'), 90);
  assert.equal(friendlySeparationRadiusForTier('heavy'), 118);
  assert.equal(friendlySeparationRadiusForTier('capital'), 118);

  // The planner reads the live cell at separation time.
  const planWith = (radius) => {
    const cell = { value: radius, valueOf() { return this.value; } };
    const planner = new ManeuverPlanner({ seed: SEED, config: { friendlySeparationRadius: cell } });
    let request = null;
    for (let tick = 1; tick <= 40; tick++) {
      request = planner.plan({
        tick, entityId: 7,
        perception: {
          self: { id: 7, team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
            energyFraction: 1, heatFraction: 0, operationalMassBand: 'light' },
          contacts: [{ id: 8, kind: ContactKind.SHIP, team: 2, alive: true, pos: { x: 0, z: 96 },
            vel: { x: 0, z: 0 }, radius: 12, confidence: 1, tags: [] },
          { id: 1, kind: ContactKind.SHIP, team: 3, hostile: true, alive: true, pos: { x: 500, z: 0 },
            vel: { x: 0, z: 0 }, radius: 10, confidence: 1, tags: [] }],
        },
        behavior: { maneuver: { kind: 'orbit', targetId: 1, preferredRange: 130,
          formationSlot: { x: 500, z: 0 }, formationBound: 170, breakFormation: true } },
        directive: { squadId: 'cw-ai', formation: { slot: { x: 500, z: 0 }, bound: 170, breakFormation: true } },
      });
    }
    return request.forceLocal;
  };
  const tight = planWith(60);
  const loose = planWith(118);
  assert.ok(Math.abs(tight.right - loose.right) > 0.01 || Math.abs(tight.forward - loose.forward) > 0.01,
    'the live cell changes the commanded separation force');
});

test('CW-AI 7 — the stack sets the live separation cell from the hull tier', () => {
  const actions = {
    list: () => [], canStart: () => ({ ok: false }), start: () => null,
    status: () => 'idle', interrupt: () => true,
  };
  const frame = (entityId) => ({
    tick: 0,
    self: { id: entityId, team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
      hullFraction: 1, energyFraction: 1, heatFraction: 0, bodyDodgeTier: 'fodder',
      activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'cw-ai', anchor: { x: 0, z: 0 },
        leashRadius: 1200, startedTick: 0 }), roe: RulesOfEngagement.WEAPONS_FREE },
    contacts: [{ id: 1, kind: ContactKind.SHIP, team: 3, hostile: true, alive: true,
      pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, confidence: 1, tags: [] }],
    events: [],
  });
  const stack = new TacticalAIStack({
    seed: SEED,
    ports: {
      sensors: { frameFor: frame },
      roster: { listSquads: () => [{ id: 'cw-ai-flight', doctrine: 'scavenger', faction: 'fixture',
        formation: 'wedge', formationSpacing: 72, formationBound: 170,
        members: [{ id: 2, pos: { x: 0, z: 0 }, capabilities: ['weapon'], combatDoctrineId: 'pack_pursuit',
          activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'cw-ai', anchor: { x: 0, z: 0 },
            leashRadius: 1200, startedTick: 0 }) }] }] },
      maneuver: { request: () => true },
      actions,
    },
    config: { trace: { enabled: false }, runtime: { decisionIntervalTicks: 1 } },
  });
  assert.equal(stack.maneuver.config.friendlySeparationRadius.valueOf(), 118);
  stack.update(1, {});
  assert.equal(stack.maneuver.config.friendlySeparationRadius.valueOf(), 60,
    'the fodder hull separates at 60 WU, not the flat 118');
});

test('CW-AI 7 — pack_pursuit press holds its authored 78-150 WU ring, not the faction standoff', () => {
  // The real materialized Wasp: its faction profile samples a 279-WU standoff, but the design's
  // pack doctrine owns 78-150. The sensor self must hand the doctrine the authored ring.
  const wasp = makeEnemySpawnSpec('wasp_swarmer', 1, { x: 100, z: 0 });
  applySwarmFeelSpec(wasp, 'wasp_swarmer', SWARM_FEEL_PROFILE);
  wasp.id = 2;
  wasp.alive = true;
  wasp.team = 2;
  wasp.data.runCohort = 'survival';
  wasp.data.ai.combatDoctrineId = 'pack_pursuit';
  wasp.data.ai.activity = normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'cw-ai',
    anchor: { x: 0, z: 0 }, leashRadius: 1200, startedTick: 0 });
  wasp.data.ai.roe = RulesOfEngagement.WEAPONS_FREE;
  const { helpers } = sensorWorld([wasp]);
  const frame = helpers.aiSensors.frameFor(wasp.id, 0);
  assert.equal(frame.self.bodyDodgeTier, 'fodder');
  assert.ok(frame.self.factionBehavior.preferredRange >= 74 && frame.self.factionBehavior.preferredRange <= 155,
    `faction band resolves to the ring (got ${frame.self.factionBehavior.preferredRange})`);

  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  const directive = {
    objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'cw-ai' },
    formation: { kind: 'wedge', slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: false },
  };
  const contact = { id: 1, kind: ContactKind.SHIP, team: 0, hostile: true, alive: true, valid: true,
    visible: true, confidence: 1, pos: { x: 180, z: 0 }, vel: { x: 0, z: 0 }, radius: 14, tags: [] };
  let snapshot = null;
  for (let tick = 0; tick < 30; tick++) {
    snapshot = runtime.update({ tick, entityId: wasp.id, doctrineId: 'pack_pursuit',
      perception: { self: frame.self, contacts: [contact] }, directive });
  }
  assert.equal(snapshot.phase, 'press');
  assert.ok(snapshot.preferredRange >= 74 && snapshot.preferredRange <= 155,
    `press holds the authored ring, not the sampled 279 standoff (got ${snapshot.preferredRange})`);
});

// ── item 9: one flee per pressure break ─────────────────────────────────────

function unilateralBus() {
  const listeners = new Map();
  return {
    on(name, fn) { let set = listeners.get(name); if (!set) listeners.set(name, set = new Set()); set.add(fn); },
    off(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
  };
}

test('CW-AI 9 — a hurt fighter announces the pressure break exactly once', () => {
  const npc = shipLike(2, {
    team: 1, pos: { x: 0, z: 0 }, rot: 0, radius: 12, hull: 40, hullMax: 100, cap: 100, capMax: 100,
    data: {
      ai: {
        squadId: 'cw-ai-pressure', doctrine: 'scavenger',
        activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'cw-ai_pressure',
          anchor: { x: 0, z: 0 }, leashRadius: 1200, startedTick: 0 }),
        roe: RulesOfEngagement.WEAPONS_FREE, combatDoctrineId: 'interceptor_flyby',
        hostileTeams: [0], motive: 'assigned_interdiction', engagementTrigger: 'authorized_hostile_spawn',
        zoneId: 'zone_fixture_hostile', approachTelegraph: 'engine_flare', noFireResponseWindowS: 1,
      },
      intent: {},
      weapons: [{ projSpeed: 420, gimbalArc: 1.2 }],
      combat: {},
    },
  });
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 190, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 14, data: {} };
  const state = {
    tick: 0, simTime: 0, playerId: 1, player: { heat: 0 }, meta: { seed: SEED },
    entities: new Map([[1, player], [2, npc]]),
    combat: { trace: { events: [] } },
  };
  const bus = unilateralBus();
  const flees = [];
  bus.on('ai:flee', (payload) => flees.push(payload));
  const tacticalAI = createTacticalAISystem({
    seed: SEED,
    sensors: {
      frameFor: (entityId, tick) => ({
        tick,
        self: { id: entityId, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
          hullFraction: 0.4, energyFraction: 1, heatFraction: 0, capabilities: ['weapon'],
          subsystemFractions: {}, activity: npc.data.ai.activity, roe: RulesOfEngagement.WEAPONS_FREE,
          combatDoctrineId: 'interceptor_flyby' },
        contacts: [{ id: 1, kind: ContactKind.SHIP, team: 0, classification: 'player_ship_sensor_track',
          pos: { x: 190, z: 0 }, vel: { x: 0, z: 0 }, radius: 14, confidence: 1, threat: 0.9,
          hostile: true, alive: true, valid: true, visible: true, tags: ['armed'] }],
        events: [],
      }),
    },
    roster: { listSquads: () => [{ id: 'cw-ai-pressure', doctrine: 'scavenger', faction: 'faction_reach',
      formation: 'wedge', formationSpacing: 72, formationBound: 170,
      members: [{ id: 2, preferredRole: 'striker', capabilities: ['drive', 'sensor', 'weapon'],
        combatDoctrineId: 'interceptor_flyby' }] }] },
    maneuver: { request: () => true },
    actionPortFactory: () => ({
      list: () => [{ id: 'action_burst', tags: ['attack'], minCommitTicks: 1, switchMargin: 0,
        range: 700, preferredRange: 220, targetKinds: [ContactKind.SHIP] }],
      canStart: () => ({ ok: true, reason: 'fixture_ok' }),
      start: () => ({ entityId: 2, actionId: 'action_burst', startedTick: state.tick }),
      status: () => 'completed', interrupt: () => true,
    }),
    config: {
      runtime: { decisionIntervalTicks: 1 }, trace: { enabled: false },
      squad: { minTacticTicks: 1 }, behavior: { minCommitTicks: 1, switchMargin: 0 },
      utility: { minCommitTicks: 1, switchMargin: 0 },
    },
  });
  tacticalAI.init({ state, bus, helpers: {} });
  let pressureBreaks = 0;
  for (let tick = 0; tick < 150; tick++) {
    state.tick = tick;
    state.simTime = tick / 60;
    tacticalAI.update(1 / 60, state);
    const decision = tacticalAI.stack.lastResult?.decisions?.find((entry) => entry.entityId === 2);
    if (decision?.combatDoctrine?.outcome === 'pressure_break') pressureBreaks++;
  }
  assert.ok(pressureBreaks >= 1, 'the doctrine decided to break');
  assert.equal(flees.length, 1, `one flee per break, not one per tick (got ${flees.length})`);
  assert.equal(flees[0].entityId, 2);
  assert.equal(flees[0].reason, 'pressure_break');
  assert.equal(flees[0].doctrineId, 'interceptor_flyby');
  tacticalAI.dispose?.();
});

// ── item 10: no committed volley through a rock ──────────────────────────────

function losFixture(rockPos) {
  const target = { id: 1, occupantGeneration: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 380, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {} };
  const shooter = { id: 2, occupantGeneration: 1, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { intent: { fire: false }, combat: {}, weapons: [{ projSpeed: 320, gimbalArc: 1.2 }],
      ai: { passive: false, lawful: false, forcePlayerTarget: true, hostileTeams: [0],
        motive: 'cargo_extortion', engagementTrigger: 'explicit_refusal', zoneId: 'zone_fixture',
        approachTelegraph: 'engine_flare', noFireResponseWindowS: 1, combatDoctrineId: 'ranged_disengager',
        activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'fixture',
          anchor: { x: 0, z: 0 }, leashRadius: 2200, startedTick: 0 }), roe: RulesOfEngagement.WEAPONS_FREE } } };
  const rock = { id: 9, type: 'asteroid', alive: true, collides: true, team: null,
    pos: { x: rockPos.x, z: rockPos.z }, vel: { x: 0, z: 0 }, rot: 0, radius: 80, data: {} };
  const entities = [target, shooter, rock];
  return {
    state: { tick: 60, simTime: 1, playerId: 1, player: { heat: 0 },
      world: { currentSectorId: 'sector_fixture' },
      entities: new Map(entities.map((e) => [e.id, e])), entityList: entities,
      combat: { trace: { events: [] } } },
    shooter,
  };
}

test('CW-AI 10 — a committed volley holds when a rock is on the firing line', () => {
  const doctrine = { doctrineId: 'ranged_disengager', phase: 'fire_window', fireWindow: true,
    cycle: 1, phaseStartedTick: 40, aimCommit: null };
  const apply = (h) => applyAIFiringIntent({
    entityId: 2,
    directive: { objective: { kind: ObjectiveKind.FOCUS, targetId: 1, targetObserved: true,
      reason: 'combat_doctrine:ranged_disengager:fire_window' } },
    action: { actionId: 'action_burst' },
    combatDoctrine: doctrine,
  }, h.state);

  const clear = losFixture({ x: 190, z: 260 });
  apply(clear);
  assert.equal(clear.shooter.data.intent.fire, true, 'the same shot is authorized with a clear lane');

  const blocked = losFixture({ x: 190, z: 0 });
  apply(blocked);
  assert.equal(blocked.shooter.data.intent.fire, false, 'a rock on the line holds the volley');
  assert.equal(blocked.shooter.data.intent.fireBlockReason, 'line_of_sight_blocked');

  // Breaking line of sight is a real counter, not a permanent jam: the rock moves and the shot lands.
  blocked.state.entities.get(9).pos = { x: 190, z: 260 };
  apply(blocked);
  assert.equal(blocked.shooter.data.intent.fire, true, 'moving the rock restores the shot');
});
