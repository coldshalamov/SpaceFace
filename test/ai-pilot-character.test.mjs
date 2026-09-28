import test from 'node:test';
import assert from 'node:assert/strict';

import { ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { SquadCommander } from '../src/ai/squad.js';
import { temperamentFor, TEMPERAMENT_IDENTITY } from '../src/ai/temperament.js';
import {
  REFLEX_KIND,
  createReflexEngine,
  emptyReflexState,
} from '../src/ai/reflexes.js';
import { REFLEX_SPECS, REFLEX_SPEC_BY_KIND } from '../src/data/reflexLibrary.js';
import { assignAutoSquadRecipes } from '../src/systems/tacticalAI.js';
import { createSquadFrameDirector, recipeIdFromEntity } from '../src/ai/squadFrame.js';
import {
  FORMATION_SHAPE_LINE_4,
  FORMATION_SHAPES,
  SQUAD_RECIPES,
  SQUAD_RECIPE_BURNING_PASS,
  SQUAD_RECIPE_HARASSMENT_RING,
  SQUAD_RECIPE_HUNTER_PAIR,
  SQUAD_RECIPE_PICKET_WALL,
  SQUAD_RECIPE_SHEPHERD_NET,
  SQUAD_RECIPE_SIEGE_ORBIT,
  SQUAD_RECIPE_STANDOFF_GUNLINE,
  getSquadRecipe,
} from '../src/data/squadChoreography.js';

// ── temperament ──────────────────────────────────────────────────────────────

test('temperament is deterministic per entity and reads doctrine character', () => {
  const a = temperamentFor('e7', { seed: 9, doctrineId: 'interceptor_flyby' });
  const b = temperamentFor('e7', { seed: 9, doctrineId: 'interceptor_flyby' });
  assert.deepEqual(a, b, 'same seed + entity + doctrine must resolve identically');
  const skirmisher = a;
  const bruiser = temperamentFor('e8', { seed: 9, doctrineId: 'brawler_commit' });
  assert.ok(skirmisher.weave > bruiser.weave, 'skirmishers weave more than bruisers');
  assert.ok(bruiser.aim > skirmisher.aim, 'bruisers hold aim better than skirmishers');
  const wingmate = temperamentFor('e9', { seed: 9, doctrineId: 'interceptor_flyby' });
  assert.notDeepEqual(wingmate, a, 'same doctrine, different pilot — jitter must differ');
  const heavy = temperamentFor('e10', { seed: 9, doctrineId: 'interceptor_flyby', massBand: 'capital' });
  assert.ok(heavy.weave < 0.5, 'a capital hull never dodges like a wasp');
});

// ── reflex engine ────────────────────────────────────────────────────────────

const BASE_SELF = {
  id: 'e7', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  radius: 12, hullFraction: 1, heatFraction: 0.2, energyFraction: 1,
};
const DASHY = temperamentFor('d1', { seed: 3, doctrineId: 'interceptor_flyby' });
const INTENT = { kind: ManeuverKind.INTERCEPT };

function evalCtx(over = {}) {
  return {
    entityId: over.entityId ?? 'e7',
    tick: over.tick ?? 1000,
    self: { ...BASE_SELF, ...(over.self || {}) },
    contacts: over.contacts || [],
    events: over.events || null,
    squadMembers: over.squadMembers || null,
    frameIntegrity: over.frameIntegrity,
    commandId: over.commandId,
    leaderLostTick: over.leaderLostTick ?? -1,
    squadRole: over.squadRole,
    target: over.target || null,
    intent: over.intent || INTENT,
    temperament: over.temperament || DASHY,
    reflexState: over.reflexState || emptyReflexState(),
  };
}

test('an incoming projectile on a near-miss course triggers a volley jink', () => {
  const engine = createReflexEngine({ seed: 5 });
  const projectile = {
    id: 'p1', kind: 'projectile', hostile: true, alive: true,
    pos: { x: 60, z: 8 }, vel: { x: -140, z: 0 }, tags: [],
  };
  const out = engine.evaluate(evalCtx({ contacts: [projectile] }));
  assert.equal(out.kind, REFLEX_KIND.VOLLEY_JINK);
  assert.ok(Math.abs(out.lateral) > 30, 'the sidestep must be decisive');
});

test('a hull hit fires a weave burst and cools down', () => {
  const engine = createReflexEngine({ seed: 5 });
  const rs = emptyReflexState();
  rs.lastHull = 1;
  // A hostile in view keeps the sky hot — the hit reads as a combat weave, not
  // the dead-stick drift a quiet aftermath produces.
  const scene = {
    reflexState: rs,
    self: { hullFraction: 0.9 },
    contacts: [HOSTILE_WITNESS()],
  };
  const out = engine.evaluate(evalCtx(scene));
  assert.equal(out.kind, REFLEX_KIND.HIT_WEAVE);
  const rs2 = { ...rs, burst: null };
  const quiet = engine.evaluate(evalCtx({
    reflexState: rs2,
    self: { hullFraction: 0.89 },
    contacts: [HOSTILE_WITNESS()],
  }));
  assert.ok(quiet == null || quiet.kind !== REFLEX_KIND.HIT_WEAVE,
    'the refractory window stops weaving on every scratch');
});

function HOSTILE_WITNESS() {
  return {
    id: 'hx', kind: 'ship', hostile: true, alive: true, team: 3,
    pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
  };
}

test('a ship marked by a hostile inside sensor range weaves while unhit', () => {
  const engine = createReflexEngine({ seed: 5 });
  const marker = {
    id: 'h1', kind: 'ship', hostile: true, alive: true, team: 3, targetId: 'e7',
    pos: { x: 500, z: 0 }, vel: { x: -10, z: 0 }, tags: [],
  };
  const out = engine.evaluate(evalCtx({ contacts: [marker] }));
  assert.equal(out.kind, REFLEX_KIND.MARKED_WEAVE);
  assert.ok(Number.isFinite(out.lateral));
});

test('emergency intents suppress the whole trigger table', () => {
  const engine = createReflexEngine({ seed: 5 });
  const projectile = {
    id: 'p1', kind: 'projectile', hostile: true, alive: true,
    pos: { x: 60, z: 8 }, vel: { x: -140, z: 0 }, tags: [],
  };
  const out = engine.evaluate(evalCtx({
    contacts: [projectile],
    intent: { kind: ManeuverKind.RETREAT },
  }));
  assert.equal(out, null, 'a fleeing hull does not jink — the retreat IS the reaction');
});

test('hot plates throttle speed and veto boost', () => {
  const engine = createReflexEngine({ seed: 5 });
  const out = engine.evaluate(evalCtx({ self: { heatFraction: 0.9 } }));
  assert.equal(out.kind, REFLEX_KIND.SIMMER);
  assert.ok(out.speedScale < 1);
  assert.equal(out.simmer, true);
});

// ── planner integration ──────────────────────────────────────────────────────

test('the planner translates a volley jink into a lateral thruster request', () => {
  const planner = new ManeuverPlanner({
    seed: 7,
    config: {
      inputSlewPerTick: 1, emergencyInputSlewPerTick: 1,
      torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1,
      shipCollisionLookahead: 0, // isolate: reflex lane only
    },
  });
  const projectile = {
    id: 'p9', kind: 'projectile', hostile: true, alive: true,
    pos: { x: 55, z: 6 }, vel: { x: -150, z: 0 }, radius: 2, tags: [], confidence: 1,
  };
  const target = {
    id: 1, kind: 'ship', pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, tags: [], confidence: 1,
  };
  const perception = {
    tick: 1,
    self: {
      id: 2, team: 2, pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 }, rot: 0,
      radius: 12, energyFraction: 1, heatFraction: 0.1,
      combatDoctrineId: 'interceptor_flyby',
    },
    contacts: [projectile, target],
  };
  const maneuver = {
    kind: ManeuverKind.INTERCEPT, targetId: 1, faceTarget: true,
    flightPoint: { x: 500, z: 0 }, formationSlot: { x: 500, z: 0 },
    formationBound: 170, breakFormation: true,
  };
  const directive = {
    squadId: 'run',
    formation: { slot: { x: 500, z: 0 }, bound: 170, breakFormation: true },
  };
  const request = planner.plan({
    entityId: 2, tick: 1, perception, behavior: { maneuver }, directive,
  });
  assert.ok(Math.abs(request.forceLocal.right) > 0.05,
    `jink must ride the lateral thruster channel, got ${request.forceLocal.right}`);
});

// ── auto squad recipe assignment ─────────────────────────────────────────────

function mkShip(id, { squadId = 's1', doctrine = 'interceptor_flyby', targetId = 'player' } = {}) {
  return {
    id,
    alive: true,
    pos: { x: id * 10, z: 0 },
    vel: { x: 0, z: 0 },
    data: {
      ai: {
        squadId,
        roe: 'weapons_free',
        combatDoctrineId: doctrine,
        activity: { kind: 'attack_run', reason: 'test' },
      },
      combat: { targetId },
    },
  };
}

test('engaged squads get an auto recipe and a flight id; disengagement releases it', () => {
  const state = { playerId: 'player', tick: 100 };
  const ships = [mkShip(11), mkShip(12), mkShip(13)];
  const stamped = assignAutoSquadRecipes(state, ships, 7);
  assert.equal(stamped, 3);
  for (const ship of ships) {
    assert.equal(typeof ship.data.ai.squadRecipe, 'string');
    assert.ok(getSquadRecipe(ship.data.ai.squadRecipe), 'assigned id must resolve to a real recipe');
    assert.equal(ship.data.ai.autoSquadRecipe, true);
    assert.equal(ship.data.ai.squadFrameId, 's1#0');
  }
  // A marksman doctrine mix in a different squad anchors a hold-mode ranged recipe
  // (the seeded draw inside the family picks which wall/line/orbit it is).
  const mixed = [
    mkShip(21, { squadId: 's2', doctrine: 'ranged_disengager' }),
    mkShip(22, { squadId: 's2' }), mkShip(23, { squadId: 's2' }),
  ];
  assignAutoSquadRecipes(state, [...ships, ...mixed], 7);
  const mixedRecipe = getSquadRecipe(mixed[0].data.ai.squadRecipe);
  assert.ok(mixedRecipe, 'marksman mix must resolve to a real recipe');
  assert.equal(mixedRecipe.strikeMode, 'hold', 'marksman mixes anchor a hold-mode firing line');
  assert.equal(mixedRecipe.tokens.close_attack, 0, 'ranged-anchored squads do not close');
  // Weapons-free dropped → the auto stamp releases.
  for (const ship of ships) ship.data.ai.roe = 'hold_fire';
  assignAutoSquadRecipes(state, ships, 7);
  for (const ship of ships) {
    assert.equal(ship.data.ai.squadRecipe, undefined);
    assert.equal(ship.data.ai.squadFrameId, undefined);
  }
});

test('an incumbent auto stamp survives a mid-fight doctrine reassignment', () => {
  const state = { playerId: 'player', tick: 100 };
  const ships = [
    mkShip(41, { doctrine: 'ranged_disengager' }),
    mkShip(42), mkShip(43), mkShip(44),
  ];
  assignAutoSquadRecipes(state, ships, 7);
  const incumbent = ships[0].data.ai.squadRecipe;
  assert.ok(getSquadRecipe(incumbent), 'marksman mix resolves to a real recipe');
  // The enemy mind promotes the marksman to a specialist role — it must leave the
  // formation, but the rest of the flight keeps its recipe instead of re-deriving
  // and resetting the choreography mid-fight.
  ships[0].data.ai.combatDoctrineId = 'shield_breaker';
  assignAutoSquadRecipes(state, ships, 7);
  assert.equal(ships[0].data.ai.squadRecipe, undefined, 'a specialist leaves the frame');
  for (const s of ships.slice(1)) {
    assert.equal(s.data.ai.squadRecipe, incumbent,
      'surviving members keep the incumbent recipe');
    assert.equal(s.data.ai.squadFrameId, 's1#0');
  }
  // Once nobody is engaged anymore the stamp still releases cleanly.
  for (const s of ships) s.data.ai.roe = 'hold_fire';
  assignAutoSquadRecipes(state, ships, 7);
  assert.equal(ships[1].data.ai.squadRecipe, undefined);
});

test('authored recipes, passive hulls, and solo hostiles are left alone', () => {
  const state = { playerId: 'player', tick: 1 };
  const authored = mkShip(31);
  authored.data.ai.squadRecipe = 'interceptor_scissors'; // authored — no auto flag
  const solo = mkShip(32, { squadId: 's2' });
  const idle = mkShip(33);
  idle.data.ai.activity = { kind: 'drift' };
  idle.data.ai.roe = 'weapons_free';
  assignAutoSquadRecipes(state, [authored, solo, idle], 7);
  assert.equal(authored.data.ai.autoSquadRecipe, undefined, 'authored recipe stays authored');
  assert.equal(solo.data.ai.squadRecipe, undefined, 'one hull is not a formation');
  assert.equal(idle.data.ai.squadRecipe, undefined, 'an unengaged hull does not form up');
});

// ── gunline choreography ─────────────────────────────────────────────────────

test('the standoff gunline morphs to a line and volleys from the band', () => {
  const recipe = getSquadRecipe(SQUAD_RECIPE_STANDOFF_GUNLINE);
  assert.equal(recipe.strikeMode, 'hold');
  const director = createSquadFrameDirector({ seed: 4 });
  const mk = (id, x, z) => ({
    id, alive: true, team: 2,
    pos: { x, z }, vel: { x: 0, z: 0 },
    radius: 12, hullFraction: 1,
    data: { ai: { squadRecipe: SQUAD_RECIPE_STANDOFF_GUNLINE } },
  });
  const members = [mk('a', 0, 0), mk('b', 30, 0), mk('c', 0, 30), mk('d', 30, 30)];
  const targetEntity = { id: 't', alive: true, pos: { x: 900, z: 0 }, vel: { x: -5, z: 0 } };
  const lookup = () => targetEntity;
  const squad = { id: 'sq1', recipeId: SQUAD_RECIPE_STANDOFF_GUNLINE, members, targetId: 't' };
  // Perfect-tracking members: park each hull on its published slot so no coast/disruption
  // aborts the morph (the real sim does this with thrusters; the director only sees pos).
  const track = () => {
    for (const m of members) {
      const plan = director.planFor(m.id);
      if (plan && plan.slot) {
        m.pos.x = plan.slot.x;
        m.pos.z = plan.slot.z;
      }
    }
  };
  const seenPhases = new Set();
  let firingDuringStrike = 0;
  let facedDuringStrike = 0;
  let strikeSamples = 0;
  for (let tick = 0; tick < 1200; tick++) {
    director.stepAll(tick, 1 / 60, [squad], lookup);
    track();
    const plans = members.map((m) => director.planFor(m.id)).filter(Boolean);
    for (const p of plans) seenPhases.add(p.phase);
    if (plans.length && plans[0].phase === 'strike') {
      // Plans are republished in place — read the strike-window flags on the strike tick.
      strikeSamples += 1;
      firingDuringStrike = Math.max(firingDuringStrike,
        plans.filter((p) => p.fireAuthorized === true).length);
      facedDuringStrike = Math.max(facedDuringStrike,
        plans.filter((p) => p.faceTarget === true).length);
    }
  }
  assert.ok(seenPhases.has('telegraph'), 'frame passed through telegraph');
  assert.ok(seenPhases.has('strike'), 'frame reached the strike hold');
  assert.ok(strikeSamples > 0, 'strike plans were published');
  assert.ok(firingDuringStrike >= 3,
    `gunline volley authorizes the firing tokens, got ${firingDuringStrike}`);
  assert.ok(facedDuringStrike >= 3,
    'every live member faces the threat through the hold');
});

test('recipeIdFromEntity reads the auto/authored stamp', () => {
  assert.equal(recipeIdFromEntity({ data: { ai: { squadRecipe: 'pincer_sweep' } } }), 'pincer_sweep');
  assert.equal(recipeIdFromEntity({ data: { ai: {} } }), null);
});

// ── live-path representative encounter ──────────────────────────────────────
// Drives the real system composition — aiPorts sensor/roster + createTacticalAISystem +
// enemy mind + squad frames — over four engaged interceptors vs the player hull, and
// records the thruster-level requests crossing the maneuver port. This is the proof
// that the choreography + reflex layers produce visible helm behavior, not just unit
// results: formation slots instead of pile-ins, lateral strafe, brake discipline, and
// a reflexive dodge when a hull takes fire.

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

function liveShip(id, team, x, z, ai) {
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

function liveCombatAI(targetId, overrides = {}) {
  return {
    squadId: 'encounter_wing',
    doctrine: 'scavenger',
    preferredRole: 'striker',
    passive: false,
    motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn',
    combatDoctrineId: 'interceptor_flyby',
    roe: 'weapons_free',
    forcePlayerTarget: true,
    activity: normalizeActivity({
      kind: 'attack_run',
      reason: 'live_path_test',
      anchor: { x: 0, z: 0 },
      leashRadius: 2600,
      startedTick: 0,
    }),
    ...overrides,
  };
}

function liveEncounterHarness({ squadRecipe = null } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  state.combat.trace = { events: [] };
  const bus = createBus();
  const helpers = {};
  const ports = Object.create(aiPorts);
  ports.init({ state, bus, helpers, registry: { get() { return null; } } });

  const player = liveShip('player', 0, 0, 400, null);
  const attackers = [];
  for (let i = 0; i < 4; i++) {
    const ai = liveCombatAI('player', squadRecipe ? { squadRecipe } : {});
    const ship = liveShip(10 + i, 1, (i - 1.5) * 60, -300 + (i % 2) * 40, ai);
    ship.data.combat.targetId = 'player';
    attackers.push(ship);
  }
  state.playerId = player.id;
  state.player = player;
  const entities = [player, ...attackers];
  state.entities = new Map(entities.map((e) => [e.id, e]));
  state.entityList = entities.slice();
  state.spatialHash.rebuild(state.entityList);

  const requests = [];
  const recorder = {
    request(request) {
      requests.push({
        entityId: request.entityId,
        tick: request.tick,
        kind: request.kind,
        forward: request.forceLocal && request.forceLocal.forward,
        right: request.forceLocal && request.forceLocal.right,
        brake: request.brake === true,
        boost: request.boost === true,
        targetHeading: request.targetHeading,
      });
      return true;
    },
  };
  const tactical = createTacticalAISystem({
    seed: 47,
    config: {
      runtime: { decisionIntervalTicks: 1, memberBatchSize: 8 },
      enemyMind: { enabled: true },
      trace: { enabled: false },
    },
    maneuver: recorder,
  });
  tactical.init({ state, bus, helpers });
  return { state, tactical, attackers, player, requests, run(ticks, { onTick } = {}) {
    for (let i = 0; i < ticks; i++) {
      state.tick += 1;
      state.simTime = state.tick / 60;
      state.spatialHash.rebuild(state.entityList);
      tactical.update(1 / 60, state);
      if (onTick) onTick(state.tick);
    }
  } };
}

test('a four-ship engaged wing forms up and strafes on the production AI path', () => {
  const h = liveEncounterHarness();
  h.run(240);
  const requestsById = new Map();
  for (const r of h.requests) {
    if (!requestsById.has(r.entityId)) requestsById.set(r.entityId, []);
    requestsById.get(r.entityId).push(r);
  }
  for (const attacker of h.attackers) {
    assert.equal(attacker.data.ai.squadRecipe, 'interceptor_scissors',
      'auto-assignment must stamp the flight on the live path');
    assert.equal(attacker.data.ai.squadFrameId, 'encounter_wing#0');
    assert.ok((requestsById.get(attacker.id) || []).length > 0,
      `member ${attacker.id} must issue helm requests`);
  }
  const strafing = h.requests.filter((r) => Math.abs(r.right || 0) > 0.05).length;
  assert.ok(strafing > 0, 'choreographed members use the lateral (strafe) channel');
  // The wing must point at the threat: when the player sits on +z bearing ~pi/2 from
  // each attacker, resolved requests must carry a heading near that bearing at some point.
  const bearing = (r, attacker) => Math.atan2(
    h.player.pos.z - attacker.pos.z, h.player.pos.x - attacker.pos.x);
  for (const attacker of h.attackers) {
    const aimed = (requestsById.get(attacker.id) || []).some((r) => {
      const err = Math.abs(((r.targetHeading - bearing(r, attacker) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return err < 0.5;
    });
    assert.ok(aimed, `member ${attacker.id} never faced the threat`);
  }
});

test('a hull that takes fire dodges laterally on the live path', () => {
  const h = liveEncounterHarness();
  h.run(60);
  const victim = h.attackers[2];
  h.state.combat.trace.events.push({
    kind: 'damage.routed', tick: h.state.tick, targetId: victim.id, attackerId: 'player',
    hullDamage: 8, totalApplied: 8,
  });
  const before = h.requests.length;
  h.run(20);
  const after = h.requests.slice(before).filter((r) => r.entityId === victim.id);
  const lateral = Math.max(0, ...after.map((r) => Math.abs(r.right || 0)));
  assert.ok(lateral > 0.1,
    `hit weave must show up on the lateral thruster channel, got ${lateral}`);
});

// ── spec-table coverage: every trigger and stance is reachable ───────────────
// Each entry constructs the smallest scene that satisfies the spec's gates and
// asserts the trigger fires. The scene isolates the spec: anything sharing the
// gate set is ruled out by the temperament/state overrides in the same row.

const PILOT = (over = {}) => ({
  weave: 0.5, dash: 0.5, verve: 0.5, aim: 0.5, poise: 0.5, ...over,
});
const HOSTILE = (id, x, z, over = {}) => ({
  id, kind: 'ship', hostile: true, alive: true, team: 3,
  pos: { x, z }, vel: { x: 0, z: 0 }, radius: 12, ...over,
});
const ALLY = (id, x, z, over = {}) => ({
  id, kind: 'ship', hostile: false, alive: true, team: 2,
  pos: { x, z }, vel: { x: 0, z: 0 }, radius: 12, ...over,
});
const PROJ = (id, x, z, vx, vz) => ({
  id, kind: 'projectile', hostile: true, alive: true,
  pos: { x, z }, vel: { x: vx, z: vz }, radius: 2,
});
const HAZARD = (id, x, z) => ({
  id, kind: 'hazard', hostile: false, alive: true,
  pos: { x, z }, vel: { x: 0, z: 0 },
});
const TETHER_LINE = (id, x, z) => ({
  id, kind: 'tether', hostile: false, alive: true,
  pos: { x, z }, vel: { x: 0, z: 0 },
});
const HOLD_INTENT = { kind: ManeuverKind.HOLD };
const SCREEN_INTENT = { kind: ManeuverKind.SCREEN };

// Fires a scene across ticks so seeded-draw gates find a firing bucket; returns
// the first output of the requested kind, or null.
function fireSweep(ctxOver, kind, ticks = 1600) {
  const engine = createReflexEngine({ seed: 5 });
  const rs = emptyReflexState();
  const t0 = ctxOver.tick ?? 1000;
  for (let t = 0; t < ticks; t++) {
    const out = engine.evaluate(evalCtx({ ...ctxOver, tick: t0 + t, reflexState: rs }));
    if (out && out.kind === kind) return out;
  }
  return null;
}

test('the reflex table is complete, priority-ordered, and keyed to kinds', () => {
  assert.equal(REFLEX_SPECS.length, Object.keys(REFLEX_KIND).length,
    'every declared kind carries a spec');
  const seenPriorities = new Set();
  for (const spec of REFLEX_SPECS) {
    assert.equal(REFLEX_SPEC_BY_KIND[spec.kind], spec, `${spec.kind} lookup`);
    assert.ok(!seenPriorities.has(spec.priority), `duplicate priority ${spec.priority}`);
    seenPriorities.add(spec.priority);
    if (spec.stance !== true) {
      assert.ok(spec.windowTicks > 0, `${spec.kind} needs a window`);
    }
  }
});

test('damage-state arbiters, damage reactions, and channel shapes', () => {
  const engine = () => createReflexEngine({ seed: 5 });
  const kind = (over) => engine().evaluate(evalCtx(over));

  // A broken hull stops fencing — state beats every tactical trigger.
  let out = engine().evaluate(evalCtx({
    self: { disabled: true },
    contacts: [PROJ('p1', 60, 8, -140, 0)],
  }));
  assert.equal(out.kind, REFLEX_KIND.DISABLED_DRIFT, 'a disabled hull drifts through a volley');
  assert.equal(out.settle, true);
  assert.equal(out.brake, true, 'settle resolves to a brake');

  assert.equal(kind({ self: { tumbling: true } }).kind, REFLEX_KIND.TUMBLE_RIDE);
  assert.equal(kind({ self: { recovering: true } }).kind, REFLEX_KIND.RECOVER_WOBBLE);
  out = kind({ self: { tethered: true }, temperament: PILOT({ weave: 0.6 }) });
  assert.equal(out.kind, REFLEX_KIND.TETHER_SNAP);
  assert.ok(out.boost === true || Math.abs(out.lateral) > 40,
    'the tether snap is a violent yaw, not a drift');

  // Damage reactions: panic (jumpy pilot), aftermath (quiet sky), weave (in a fight).
  out = kind({ self: { hullFraction: 0.88 }, temperament: PILOT({ poise: 0.2 }) });
  assert.equal(out.kind, REFLEX_KIND.PANIC_SNAP, 'a panicky pilot snap-turns on the hit');
  out = kind({ self: { hullFraction: 0.88 }, temperament: PILOT({ poise: 0.6 }) });
  assert.equal(out.kind, REFLEX_KIND.AFTERMATH_DRIFT,
    'a calm sky turns a hit into dead-stick drift');
  assert.equal(out.settle, true);
  out = kind({
    self: { hullFraction: 0.88 },
    contacts: [HOSTILE('hx', 500, 0)],
    temperament: PILOT({ poise: 0.6 }),
  });
  assert.equal(out.kind, REFLEX_KIND.HIT_WEAVE,
    'under threat the same hit reads as a combat weave');

  // Crippled and painted: the ship limps off the firing lane.
  const rs = emptyReflexState();
  rs.lastHull = 0.3;
  out = engine().evaluate(evalCtx({
    reflexState: rs,
    self: { hullFraction: 0.3 },
    contacts: [HOSTILE('h1', 300, 0, { targetId: 'e7' })],
  }));
  assert.equal(out.kind, REFLEX_KIND.LOW_HULL_SLIP);
});

test('incoming fire, hazards, and pursuit geometry each have their own reflex', () => {
  const engine = createReflexEngine({ seed: 5 });
  const fire = (over) => engine.evaluate(evalCtx(over));

  let out = fire({ contacts: [PROJ('p1', 60, 8, -140, 0), PROJ('p2', 55, -10, -150, 0)] });
  assert.equal(out.kind, REFLEX_KIND.SALVO_DODGE, 'a two-round pass dodges harder');

  assert.equal(fire({ contacts: [HAZARD('m1', 180, 20)] }).kind, REFLEX_KIND.MINE_SWERVE);
  // A belt of rocks — the drift only reads as weaving through debris when there
  // is more than one close aboard.
  assert.equal(fire({ contacts: [HAZARD('d1', 150, 20), HAZARD('d2', -60, 170)] }).kind,
    REFLEX_KIND.DEBRIS_DRIFT);
  assert.equal(fire({ contacts: [TETHER_LINE('th1', 190, 10)] }).kind,
    REFLEX_KIND.TETHER_LINE_SIDESTEP);

  // A hostile parked in the rear hemisphere shakes the tail — brake and yaw.
  out = fire({ contacts: [HOSTILE('h1', -200, 0)] });
  assert.equal(out.kind, REFLEX_KIND.TAIL_SHAKE);
  assert.equal(out.brake, true);

  // A hot-running marker gets slipped, not fled.
  out = fire({
    contacts: [HOSTILE('h1', 300, 0, { targetId: 'e7', vel: { x: -100, z: 0 } })],
    target: HOSTILE('h1', 300, 0, { targetId: 'e7', vel: { x: -100, z: 0 } }),
  });
  assert.equal(out.kind, REFLEX_KIND.OVERSHOOT_SLIP);
  assert.equal(out.brake, true);
});

test('losing a wingmate splits pilots into breakers, avengers, and regroupers', () => {
  const engine = createReflexEngine({ seed: 5 });
  const rs = emptyReflexState();
  rs.lastHull = 0.4; // preseeded — the hull drop is old damage, not a fresh hit
  rs.seenAllies = new Map([['a1', true]]); // the wingmate was alive on earlier frames

  const ally = ALLY('a1', 150, 0);
  const downed = { ...ally, alive: false };

  // Damaged hull: break contact and run the egress bearing.
  let out = engine.evaluate(evalCtx({
    reflexState: rs,
    self: { hullFraction: 0.4 },
    temperament: PILOT({ verve: 0.3, poise: 0.3 }),
    contacts: [downed, HOSTILE('h1', 600, 0)],
  }));
  assert.equal(out.kind, REFLEX_KIND.COVER_BREAK);
  assert.ok(out.away > 0 && out.awayFrom, 'cover_break must produce a break-off blend');

  // Hot blood: press the attack at the killer.
  const rs2 = emptyReflexState();
  rs2.lastHull = 0.9;
  rs2.seenAllies = new Map([['a1', true]]);
  const engine2 = createReflexEngine({ seed: 6 });
  out = engine2.evaluate(evalCtx({
    reflexState: rs2,
    self: { hullFraction: 0.9 },
    temperament: PILOT({ verve: 0.75 }),
    contacts: [downed],
    target: HOSTILE('h1', 600, 0),
  }));
  assert.equal(out.kind, REFLEX_KIND.VENGEANCE_PRESS);
  assert.equal(out.boost, true);

  // Composed pilot: pull toward the survivor instead of scattering.
  const rs3 = emptyReflexState();
  rs3.lastHull = 0.9;
  rs3.seenAllies = new Map([['a1', true], ['a2', true]]);
  const engine3 = createReflexEngine({ seed: 7 });
  const a2 = ALLY('a2', 120, 50);
  out = engine3.evaluate(evalCtx({
    reflexState: rs3,
    self: { hullFraction: 0.9 },
    temperament: PILOT({ verve: 0.3, poise: 0.6 }),
    contacts: [downed, a2],
  }));
  assert.equal(out.kind, REFLEX_KIND.REGROUP_PULL);
  assert.ok(out.pullTo && Math.abs(out.pullTo.x - 120) < 1,
    'regroup must pull toward the living wingmate');

  // Everyone down, no composure left: scatter.
  const rs4 = emptyReflexState();
  rs4.lastHull = 0.9;
  rs4.seenAllies = new Map([['a1', true]]);
  const engine4 = createReflexEngine({ seed: 8 });
  out = engine4.evaluate(evalCtx({
    reflexState: rs4,
    self: { hullFraction: 0.9 },
    temperament: PILOT({ verve: 0.3, poise: 0.3 }),
    contacts: [downed],
  }));
  assert.equal(out.kind, REFLEX_KIND.SCATTER_LOSS);
  assert.ok(Math.abs(out.lateral) > 0);
});

test('a squadmate dying on the frame roster fires the loss reflexes without a hulk contact', () => {
  // The live path reports wingmate deaths through the frame roster (plan.squadMates):
  // a member's alive flag flips the tick it dies even when the wreck never becomes a
  // contact. The loss must register identically to the contact-based path.
  const engine = createReflexEngine({ seed: 5 });
  const rs = emptyReflexState();
  rs.lastHull = 0.9; // preseeded — old damage, not a fresh hit on the seeding frame
  const ctx = {
    self: { hullFraction: 0.9 },
    temperament: PILOT({ verve: 0.3, poise: 0.3 }),
    contacts: [],
    squadMembers: [
      { id: 'e7', alive: true }, // self — must be skipped
      { id: 'a1', alive: true },
    ],
    reflexState: rs,
  };
  engine.evaluate(evalCtx(ctx)); // registers a1 alive; no loss yet
  const out = engine.evaluate(evalCtx({
    ...ctx,
    tick: 1001,
    squadMembers: [{ id: 'e7', alive: true }, { id: 'a1', alive: false }],
  }));
  assert.equal(out && out.kind, REFLEX_KIND.SCATTER_LOSS,
    'a roster flip must read exactly like the wreck reaching contacts');

  // The grief is sticky, not a single tick: a survivor mid-burst when the roster
  // flips still answers the loss once the burst ends (scatter_loss waits out the
  // live mine_swerve — lower-numbered priorities arbitrate first).
  const engine2 = createReflexEngine({ seed: 5 });
  const rs2 = emptyReflexState();
  rs2.lastHull = 0.9;
  const mine = {
    id: 'm1', kind: 'hazard', hostile: true, alive: true,
    pos: { x: 120, z: 40 }, vel: { x: 0, z: 0 }, radius: 20,
  };
  const aliveRoster = [{ id: 'e7', alive: true }, { id: 'a1', alive: true }];
  const deadRoster = [{ id: 'e7', alive: true }, { id: 'a1', alive: false }];
  engine2.evaluate(evalCtx({ reflexState: rs2, squadMembers: aliveRoster, contacts: [mine] }));
  const mid = engine2.evaluate(evalCtx({ tick: 1001, reflexState: rs2, squadMembers: deadRoster }));
  assert.equal(mid && mid.kind, REFLEX_KIND.MINE_SWERVE,
    'a live burst keeps its lane — grief does not cut a dodge short');
  const after = engine2.evaluate(evalCtx({ tick: 1040, reflexState: rs2, squadMembers: deadRoster }));
  assert.equal(after && after.kind, REFLEX_KIND.SCATTER_LOSS,
    'once the dodge ends the pilot still answers the wingmate loss');

  // A roster is squad-complete: a mate that drops off it entirely (culled hull,
  // recycled id — no corpse ever listed, no alive:false flag) still counts.
  const engine3 = createReflexEngine({ seed: 5 });
  const rs3 = emptyReflexState();
  rs3.lastHull = 0.9;
  engine3.evaluate(evalCtx({ reflexState: rs3, squadMembers: aliveRoster }));
  const missing = engine3.evaluate(evalCtx({
    tick: 1001,
    reflexState: rs3,
    squadMembers: [{ id: 'e7', alive: true }],
  }));
  assert.equal(missing && missing.kind, REFLEX_KIND.SCATTER_LOSS,
    'a mate simply absent from the roster died — ids recycle before wrecks are seen');
});

test('choreographed members twitch on reflexes but never brake off the frame', () => {
  const choreoPlan = {
    squadId: 'sq1', recipeId: 'standoff_gunline', phase: 'strike',
    // A moving slot keeps the geometric formation brake out of the way so the only
    // brake source in the request is the reflex channel itself.
    slot: { x: 0, z: 0 }, slotVel: { x: 15, z: 0 }, bound: 170,
    speedFraction: 1, faceTarget: true, fireAuthorized: true,
    coast: false, breakFormation: false, targetId: 1,
    live: null, squadMates: [{ id: 2, alive: true }],
    reason: 'test',
  };
  const mkPlanner = (onFrame) => new ManeuverPlanner({
    seed: 7,
    config: {
      inputSlewPerTick: 1, emergencyInputSlewPerTick: 1,
      torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1,
      shipCollisionLookahead: 0,
      squadFrames: onFrame ? { planFor: () => choreoPlan } : false,
    },
  });
  const mine = {
    // Inside the reflex's hazard skirt but wide of the obstacle-avoidance lane,
    // so the dodge sweep never vetoes the trigger.
    id: 'm1', kind: 'hazard', hostile: true, alive: true,
    pos: { x: 120, z: 80 }, vel: { x: 0, z: 0 }, radius: 20, tags: [], confidence: 1,
  };
  const target = {
    id: 1, kind: 'ship', hostile: true, pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, tags: [], confidence: 1,
  };
  const perception = {
    tick: 1,
    self: {
      id: 2, team: 2, pos: { x: 0, z: 0 }, vel: { x: 15, z: 0 }, rot: 0,
      radius: 12, energyFraction: 1, heatFraction: 0.1,
      combatDoctrineId: 'interceptor_flyby', hullFraction: 0.9,
    },
    contacts: [mine, target],
  };
  const input = {
    entityId: 2, tick: 1, perception,
    behavior: { maneuver: { kind: ManeuverKind.INTERCEPT, targetId: 1, faceTarget: true } },
    directive: { squadId: 'sq1', formation: { slot: { x: 0, z: 0 }, bound: 170 } },
  };

  // Control: off a frame, the mine swerve carries its brake through.
  const freePlanner = mkPlanner(false);
  const free = freePlanner.plan(input);
  assert.equal(freePlanner.byEntity.get(2).lastReflex, REFLEX_KIND.MINE_SWERVE);
  assert.equal(free.brake, true, 'a lone ship must brake for the mine');

  // On the frame: same trigger, twitch rides through, locomotion does not.
  const boundPlanner = mkPlanner(true);
  const bound = boundPlanner.plan(input);
  assert.equal(boundPlanner.byEntity.get(2).lastReflex, REFLEX_KIND.MINE_SWERVE,
    'a framed ship must still feel the trigger');
  assert.equal(bound.brake, false, 'the frame owns locomotion — reflex brake is stripped');
  assert.ok(Math.abs(bound.forceLocal.right) > 0.05,
    'the lateral twitch must still ride the thruster request');
});

test('closing geometry, presence, and seeded-draw triggers all fire', () => {
  // Brake-check: closure too hot inside the band, drawn per tick-bucket. The draw
  // is per-pilot — this hull's pilot id sits in a lucky bucket range.
  let out = fireSweep({
    entityId: 'e11',
    self: { id: 'e11' },
    target: HOSTILE('h1', 300, 0, { vel: { x: -100, z: 0 } }),
    contacts: [HOSTILE('h1', 300, 0, { vel: { x: -100, z: 0 } })],
    temperament: PILOT({ dash: 0.8 }),
  }, REFLEX_KIND.BRAKE_CHECK);
  assert.ok(out && out.brake === true, 'brake_check must fire within its draw window');

  // Charge slam: even hotter closure reads as a gift to a brave pilot.
  out = fireSweep({
    target: HOSTILE('h1', 440, 0, { vel: { x: -160, z: 0 } }),
    contacts: [HOSTILE('h1', 440, 0, { vel: { x: -160, z: 0 } })],
    temperament: PILOT({ verve: 0.7 }),
  }, REFLEX_KIND.CHARGE_SLAM);
  assert.ok(out && out.boost === true, 'charge_slam slams the throttle');

  // Feint: a hot pilot with a bad gunner stalls the run mid-approach.
  out = fireSweep({
    target: HOSTILE('h1', 400, 0),
    contacts: [HOSTILE('h1', 400, 0)],
    temperament: PILOT({ verve: 0.7, aim: 0.4 }),
  }, REFLEX_KIND.FEINT_BRAKE);
  assert.ok(out && out.brake === true, 'feint_brake stalls the run');

  // Pounce on the fleeing; cripple-press on the disabled.
  out = fireSweep({
    target: HOSTILE('h1', 400, 0, { vel: { x: 30, z: 0 } }),
    contacts: [HOSTILE('h1', 400, 0, { vel: { x: 30, z: 0 } })],
    temperament: PILOT({ verve: 0.7 }),
  }, REFLEX_KIND.POUNCE);
  assert.ok(out && out.boost === true);
  out = fireSweep({
    target: HOSTILE('h1', 400, 0, { disabled: true }),
    contacts: [HOSTILE('h1', 400, 0, { disabled: true })],
    temperament: PILOT({ verve: 0.7 }),
  }, REFLEX_KIND.CRIPPLE_PRESS);
  assert.ok(out && out.boost === true);

  // Harass: a darting hull inside the close band jinks constantly.
  out = fireSweep({
    contacts: [HOSTILE('h1', 270, 0)],
    temperament: PILOT({ dash: 0.8 }),
  }, REFLEX_KIND.HARASS_JINK);
  assert.ok(out, 'harass_jink must draw inside its window');

  // Spiral-in: the attack run corkscrews instead of flying a rail.
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    target: HOSTILE('h1', 700, 0),
    contacts: [HOSTILE('h1', 700, 0)],
    temperament: PILOT({ dash: 0.7 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.SPIRAL_IN);

  // Ram authority + wake surf + ward screen + flank fade.
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({ self: { ramAuthorized: true } }));
  assert.equal(out.kind, REFLEX_KIND.RAM_RESOLVE);
  assert.equal(out.boost, true);

  const wakeEngine = createReflexEngine({ seed: 5 });
  const wakeRs = emptyReflexState();
  wakeEngine.evaluate(evalCtx({
    reflexState: wakeRs,
    contacts: [HOSTILE('h1', 300, 0, { targetId: 'e7' })],
  }));
  out = wakeEngine.evaluate(evalCtx({
    reflexState: wakeRs,
    tick: 1001,
    contacts: [HOSTILE('h1', -350, 0, { targetId: null })],
  }));
  assert.equal(out.kind, REFLEX_KIND.WAKE_SURF,
    'the marker dropping with a hostile behind rides the wake');

  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    self: { capabilities: ['screen'] },
    contacts: [ALLY('a1', 120, 0), HOSTILE('h1', 400, 0, { targetId: 'a1' })],
  }));
  assert.equal(out.kind, REFLEX_KIND.WARD_SCREEN);
  assert.ok(out.pullTo && Math.abs(out.pullTo.x - 120) < 1,
    'a screen hull pulls toward the threatened ward');

  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    contacts: [HOSTILE('h1', 300, 0, { targetId: 'e7' }), ALLY('a1', 200, -100)],
    temperament: PILOT({ weave: 0.8 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.FLANK_FADE,
    'an evasive hull folds toward the formation when painted');

  out = fireSweep({
    contacts: [ALLY('a1', 200, 0)],
    temperament: PILOT({ weave: 0.8 }),
  }, REFLEX_KIND.SPOOF_TURN, 1600);
  assert.ok(out, 'an unmarked hull takes a spoof turn within a few buckets');

  // Different pilot id — the seeded bucket draw is per-entity.
  out = fireSweep({
    entityId: 'e8',
    self: { id: 'e8', energyFraction: 0.2 },
    temperament: PILOT({ poise: 0.6 }),
  }, REFLEX_KIND.ENERGY_SAVE, 2400);
  assert.ok(out && out.speedScale < 1, 'low capacitor saves energy');
});

test('stances merge as sustained channels and read the whole world state', () => {
  const fire = (over) => createReflexEngine({ seed: 5 }).evaluate(evalCtx(over));

  // Composed, painted, and holding a bead: steady_press keeps the aim lane.
  let out = fire({
    contacts: [HOSTILE('h1', 300, 0, { targetId: 'e7' })],
    target: HOSTILE('h1', 300, 0, { targetId: 'e7' }),
    temperament: PILOT({ poise: 0.8, aim: 0.8, weave: 0.5 }),
  });
  assert.equal(out.kind, REFLEX_KIND.STEADY_PRESS);
  assert.equal(out.holdAim, true);

  // Orbiting an approach: a weave-prone hull circles the commit distance.
  out = fire({
    self: { energyFraction: 0.4 },
    target: HOSTILE('h1', 300, 0),
    contacts: [HOSTILE('h1', 300, 0)],
    temperament: PILOT({ weave: 0.7, poise: 0.4, aim: 0.4 }),
  });
  assert.equal(out.kind, REFLEX_KIND.ORBIT_HOLD);

  // Escort hulls jockey around a ward while anything is close.
  out = fire({
    self: { capabilities: ['screen'], energyFraction: 0.4 },
    contacts: [ALLY('a1', 140, 0), HOSTILE('h1', 400, 0)],
    temperament: PILOT({ weave: 0.5, poise: 0.4, aim: 0.4 }),
  });
  assert.equal(out.kind, REFLEX_KIND.ESCORT_JOCKEY);

  // Picket line, nobody aboard to jockey for.
  out = fire({
    self: { capabilities: ['screen'], energyFraction: 0.4 },
    intent: SCREEN_INTENT,
    contacts: [HOSTILE('h1', 500, 0)],
    temperament: PILOT({ weave: 0.5, poise: 0.4, aim: 0.4 }),
  });
  assert.equal(out.kind, REFLEX_KIND.PICKET_DRIFT);

  // Warm but disciplined.
  out = fire({ self: { heatFraction: 0.75 }, temperament: PILOT({ poise: 0.6 }) });
  assert.equal(out.kind, REFLEX_KIND.HOT_DISCIPLINE);
  assert.ok(out.speedScale < 1);

  // Passive pilot lets the marked fight come to it.
  out = fire({
    contacts: [HOSTILE('h1', 300, 0, { targetId: 'e7' })],
    target: HOSTILE('h1', 300, 0, { targetId: 'e7' }),
    temperament: PILOT({ verve: 0.2, weave: 0.2, aim: 0.4, poise: 0.4 }),
  });
  assert.equal(out.kind, REFLEX_KIND.BAIT_HOLD);
  assert.equal(out.settle, true);

  // Outnumbered and slippery: circle instead of closing.
  out = fire({
    self: { energyFraction: 0.4 },
    contacts: [HOSTILE('a', 400, 0), HOSTILE('b', 600, 0), HOSTILE('c', 700, 0)],
    temperament: PILOT({ weave: 0.7, poise: 0.4, aim: 0.4 }),
  });
  assert.equal(out.kind, REFLEX_KIND.OUTNUMBERED_CIRCLE);

  // The world moves without the player: patrol legs sway, parked hulls idle.
  out = fire({
    intent: HOLD_INTENT,
    self: { activity: { kind: 'patrol_route' } },
    temperament: PILOT({ poise: 0.4, aim: 0.4 }),
  });
  assert.equal(out.kind, REFLEX_KIND.LANE_WEAVE);
  out = fire({ intent: HOLD_INTENT, temperament: PILOT({ poise: 0.4, aim: 0.4 }) });
  assert.equal(out.kind, REFLEX_KIND.IDLE_DRIFT);
});

// ── choreography recipe coverage ─────────────────────────────────────────────

test('every squad recipe resolves with a full shape set and socket map', () => {
  const ids = Object.keys(SQUAD_RECIPES);
  assert.ok(ids.length >= 12, `recipe library should hold a dozen-plus plays, got ${ids.length}`);
  for (const [id, recipe] of Object.entries(SQUAD_RECIPES)) {
    assert.equal(recipe.id, id);
    assert.ok(getSquadRecipe(id), `${id} resolves`);
    for (const shapeId of Object.values(recipe.shapes)) {
      assert.ok(FORMATION_SHAPES[shapeId], `${id} references missing shape ${shapeId}`);
    }
    for (const [socket, spec] of Object.entries(recipe.sockets)) {
      assert.ok(spec.role && spec.tokens.length > 0, `${id}:${socket} needs role+tokens`);
    }
    assert.ok(Object.keys(recipe.tokens).length > 0, `${id} needs a token mix`);
  }
});

function runChoreography(recipeId, memberCount, ticks, collect) {
  const director = createSquadFrameDirector({ seed: 4 });
  const members = [];
  for (let i = 0; i < memberCount; i++) {
    members.push({
      id: 'm' + i, alive: true, team: 2,
      pos: { x: (i % 2) * 30, z: Math.floor(i / 2) * 30 },
      vel: { x: 0, z: 0 }, radius: 12, hullFraction: 1,
      data: { ai: { squadRecipe: recipeId } },
    });
  }
  const targetEntity = { id: 't', alive: true, pos: { x: 1400, z: 0 }, vel: { x: -2, z: 0 } };
  const lookup = () => targetEntity;
  const squad = { id: 'sq', recipeId, members, targetId: 't' };
  const track = () => {
    for (const m of members) {
      const plan = director.planFor(m.id);
      if (plan && plan.slot) { m.pos.x = plan.slot.x; m.pos.z = plan.slot.z; }
    }
  };
  for (let tick = 0; tick < ticks; tick++) {
    director.stepAll(tick, 1 / 60, [squad], lookup);
    track();
    const plans = members.map((m) => director.planFor(m.id)).filter(Boolean);
    if (plans.length) collect(tick, plans);
  }
}

test('hold recipes reach a firing hold and publish strikers on the frame', () => {
  for (const recipeId of [
    SQUAD_RECIPE_HARASSMENT_RING, SQUAD_RECIPE_PICKET_WALL,
    SQUAD_RECIPE_SIEGE_ORBIT, SQUAD_RECIPE_SHEPHERD_NET,
  ]) {
    const phases = new Set();
    let strikeFired = 0;
    let strikeFaced = 0;
    runChoreography(recipeId, 4, 1600, (tick, plans) => {
      for (const p of plans) phases.add(p.phase);
      if (plans[0].phase === 'strike') {
        strikeFired = Math.max(strikeFired, plans.filter((p) => p.fireAuthorized).length);
        strikeFaced = Math.max(strikeFaced, plans.filter((p) => p.faceTarget).length);
      }
    });
    assert.ok(phases.has('strike'), `${recipeId} must reach its strike hold`);
    assert.ok(strikeFired >= 1, `${recipeId} must authorize firing tokens in the hold`);
    assert.ok(strikeFaced >= 1, `${recipeId} members face the threat through the hold`);
  }
});

test('orbit recipes drift their slots instead of parking on rails', () => {
  for (const recipeId of [SQUAD_RECIPE_HARASSMENT_RING, SQUAD_RECIPE_SIEGE_ORBIT]) {
    const director = createSquadFrameDirector({ seed: 4 });
    const members = [];
    for (let i = 0; i < 4; i++) {
      members.push({
        id: 'm' + i, alive: true, team: 2,
        pos: { x: (i % 2) * 30, z: Math.floor(i / 2) * 30 },
        vel: { x: 0, z: 0 }, radius: 12, hullFraction: 1,
        data: { ai: { squadRecipe: recipeId } },
      });
    }
    const targetEntity = { id: 't', alive: true, pos: { x: 1400, z: 0 }, vel: { x: -2, z: 0 } };
    const squad = { id: 'sq', recipeId, members, targetId: 't' };
    const slotsByTick = new Map();
    for (let tick = 0; tick < 1600; tick++) {
      director.stepAll(tick, 1 / 60, [squad], () => targetEntity);
      for (const m of members) {
        const plan = director.planFor(m.id);
        if (plan && plan.slot) { m.pos.x = plan.slot.x; m.pos.z = plan.slot.z; }
      }
      const first = director.planFor('m0');
      if (first && first.phase === 'strike' && first.slot) {
        slotsByTick.set(tick, { x: first.slot.x, z: first.slot.z });
      }
    }
    const keys = [...slotsByTick.keys()];
    assert.ok(keys.length >= 2, `${recipeId} must publish strike slots`);
    const a = slotsByTick.get(keys[0]);
    const b = slotsByTick.get(keys[keys.length - 1]);
    const drift = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(drift > 40, `${recipeId} strike hold must carousel — got drift ${drift}`);
  }
});

test('pair and pass recipes run their own shapes', () => {
  const phases = new Set();
  runChoreography(SQUAD_RECIPE_HUNTER_PAIR, 2, 1200, (tick, plans) => {
    for (const p of plans) phases.add(p.phase);
  });
  assert.ok(phases.has('strike') || phases.has('extend') || phases.has('telegraph'),
    'a hunting pair must run its approach sequence');
  const passPhases = new Set();
  runChoreography(SQUAD_RECIPE_BURNING_PASS, 4, 1200, (tick, plans) => {
    for (const p of plans) passPhases.add(p.phase);
  });
  assert.ok(passPhases.size >= 3, 'a burning pass passes through more than one phase');
});

// ── covering retreat ─────────────────────────────────────────────────────────

test('a retreating squad keeps a screen element covering the egress', () => {
  const commander = new SquadCommander({ seed: 0x47a, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'retreat_wing', doctrine: 'balanced', faction: 'faction_test', formation: 'line',
    members: [
      { id: 'lead' },
      { id: 'escort', capabilities: ['screen'] },
      { id: 'wing' },
    ],
  });
  const mkPerception = (id) => ({
    self: {
      id, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
      hullFraction: 0.8, energyFraction: 1, heatFraction: 0,
      disabled: false, tethered: false,
      capabilities: id === 'escort' ? ['screen'] : [],
      activity: { kind: 'attack_run', reason: 'test', startedTick: 0 },
      roe: 'weapons_free',
    },
    contacts: [{
      id: 'h', kind: 'ship', team: 0, pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
      radius: 12, alive: true, valid: true, visible: true, confidence: 1,
      threat: 0.9, hostile: true, tethered: false, disabled: false, tags: [],
    }],
    events: [],
  });
  const perceptions = new Map(['lead', 'escort', 'wing'].map((id) => [id, mkPerception(id)]));
  const result = commander.update('retreat_wing', 10, perceptions, {
    command: { type: 'order_retreat' },
  });
  assert.equal(result.tactic, 'fighting_retreat');
  assert.equal(result.directives.get('escort').objective.kind, 'screen',
    'the screen element stays between the threat and the egress');
  assert.equal(result.directives.get('escort').objective.reason, 'covering_retreat');
  assert.equal(result.directives.get('wing').objective.kind, 'retreat',
    'the rest of the flight actually leaves');
});

// ── encounter authoring integrity ────────────────────────────────────────────

test('every authored encounter squadRecipe resolves to a real recipe', async () => {
  const { ENCOUNTER_MODULES } = await import('../src/data/encounters/index.generated.js');
  const stamped = [];
  for (const mod of ENCOUNTER_MODULES) {
    const squad = mod.default && mod.default.squad;
    const id = squad && squad.squadRecipe;
    if (id == null) continue;
    assert.ok(getSquadRecipe(id), `${mod.default.id}: squadRecipe '${id}' does not resolve`);
    stamped.push([mod.default.id, id]);
  }
  assert.ok(stamped.length >= 20, 'the stamp pass must cover a broad slice of the catalogue');
});

// ── the second wave: morale, command, execution, and aftermath triggers ──────

test('focus fire, pincers, and cover each have their own urgent reflex', () => {
  const engine = createReflexEngine({ seed: 5 });
  // Two guns tracking this hull at once — the crossfire weave outranks geometry.
  let out = engine.evaluate(evalCtx({
    contacts: [HOSTILE('h1', 400, 0, { targetId: 'e7' }), HOSTILE('h2', 420, 40, { targetId: 'e7' })],
    temperament: PILOT({ weave: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.CROSSFIRE_WEAVE);

  // Pincered: one close ahead, one behind — snap out of the bisector.
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    contacts: [HOSTILE('h1', 300, 0), HOSTILE('h2', -280, 0)],
    temperament: PILOT({ weave: 0.5 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.SANDWICH_SPLIT);

  // Rock + incoming damage: tuck toward cover and brake rather than fencing.
  const rs = emptyReflexState();
  rs.lastHull = 0.9;
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    reflexState: rs,
    self: { hullFraction: 0.87 },
    contacts: [HAZARD('r1', 280, 30), HOSTILE('h1', 600, 0)],
    temperament: PILOT({ poise: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.COVER_HUG);
  assert.ok(out.pullTo, 'the hug pulls toward the rock, not away from the fight');
});

test('a blown subsystem reads as a wound the pilot keeps favoring', () => {
  const subsystemEvent = [{ type: 'subsystem_disabled', sourceId: 'h9', magnitude: 1 }];
  // The flinch: off the lane, aim dropped.
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    events: subsystemEvent,
    contacts: [HOSTILE('h1', 500, 0)],
    temperament: PILOT({ weave: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.WEAPON_LOST_SCRAMBLE);
  assert.equal(out.dropAim, true);

  // Same loss on a hurt hull: the pilot limps instead of scrambling.
  const rs = emptyReflexState();
  rs.lastHull = 0.4;
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    reflexState: rs,
    events: subsystemEvent,
    self: { hullFraction: 0.4 },
    temperament: PILOT({ weave: 0.1 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.WOUNDED_LIMP);
  assert.equal(out.settle, true);

  // The wound sticks: the flag stays readable a hundred ticks after the event clears.
  // The scramble is on per-kind cooldown, so the sticky register surfaces through its sibling.
  const engine = createReflexEngine({ seed: 5 });
  const rs2 = emptyReflexState();
  rs2.lastHull = 0.4;
  engine.evaluate(evalCtx({ reflexState: rs2, events: subsystemEvent, self: { hullFraction: 0.4 } }));
  out = engine.evaluate(evalCtx({ reflexState: rs2, tick: 1100, self: { hullFraction: 0.4 }, contacts: [HOSTILE('h1', 500, 0)], temperament: PILOT({ weave: 0.6 }) }));
  assert.equal(out.kind, REFLEX_KIND.WOUNDED_LIMP, 'subsystem loss reads 100 ticks later');
});

test('cumulative losses shrink the wing’s nerve — matesLost gates accumulate', () => {
  const engine = createReflexEngine({ seed: 5 });
  const rs = emptyReflexState();
  rs.lastHull = 0.9;
  const roster = (a1, a2) => [{ id: 'a1', alive: a1 }, { id: 'a2', alive: a2 }];
  // Two deaths across two ticks — the counter keeps the full bill.
  engine.evaluate(evalCtx({ reflexState: rs, tick: 1000, squadMembers: roster(true, true), contacts: [ALLY('a1', 200, 0), ALLY('a2', 220, 10)] }));
  engine.evaluate(evalCtx({ reflexState: rs, tick: 1001, squadMembers: roster(false, true), contacts: [ALLY('a2', 220, 10)] }));
  engine.evaluate(evalCtx({ reflexState: rs, tick: 1002, squadMembers: roster(false, false), contacts: [] }));
  assert.equal(rs.matesLost, 2, 'two roster flips count two losses');
  const out = engine.evaluate(evalCtx({
    reflexState: rs, tick: 1050,
    contacts: [ALLY('a3', 200, 0), HOSTILE('h1', 500, 0)],
    temperament: PILOT({ verve: 0.4, poise: 0.3 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.WING_SHRINK, 'two wingmates gone pulls survivors together');
});

test('losing the frame leader splits pilots: heir, flounderer, avenger', () => {
  const base = { contacts: [HOSTILE('h1', 500, 0), ALLY('a1', 220, 10)], tick: 2000, leaderLostTick: 1970 };
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    ...base, commandId: 'e7', temperament: PILOT({ poise: 0.6, verve: 0.5 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.HEIR_STEP_UP, 'the named successor steps up');
  assert.equal(out.boost, true);

  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    ...base, commandId: 'a1', temperament: PILOT({ poise: 0.2, verve: 0.5 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.ADRIFT_FLOUNDER, 'a low-poise wing drifts leaderless');

  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    ...base, commandId: 'a1', temperament: PILOT({ poise: 0.6, verve: 0.8 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.VOW_PRESS, 'the hot wing answers with violence');
});

test('frame integrity collapse reads differently on brave and frightened pilots', () => {
  const base = { self: { energyFraction: 0.5 }, contacts: [HOSTILE('h1', 420, 0), ALLY('a1', 200, 0)], frameIntegrity: 0.3 };
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    ...base, temperament: PILOT({ verve: 0.7 }),
  }));
  // Brave pilots fight wide open — the stance fans them out.
  assert.equal(out.kind, REFLEX_KIND.LAST_STAND_FAN);
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    ...base,
    reflexState: Object.assign(emptyReflexState(), {
      cooldowns: new Map([[REFLEX_KIND.WING_BROKEN, 5000]]),
    }),
    temperament: PILOT({ verve: 0.3, poise: 0.4 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.ROUT_SWEEP);
  assert.ok(out.away > 0, 'a broken wing slides off the fight axis');
});

test('the last pilot standing picks a temperament-true answer', () => {
  const mk = (temp) => {
    const engine = createReflexEngine({ seed: 5 });
    const rs = emptyReflexState();
    const roster = (a) => [{ id: 'a1', alive: a }];
    engine.evaluate(evalCtx({ reflexState: rs, tick: 1000, squadMembers: roster(true), contacts: [ALLY('a1', 200, 0)] }));
    engine.evaluate(evalCtx({ reflexState: rs, tick: 1001, squadMembers: roster(false), contacts: [] }));
    return engine.evaluate(evalCtx({
      reflexState: rs, tick: 1200, contacts: [HOSTILE('h1', 600, 0)], temperament: temp,
    }));
  };
  assert.equal(mk(PILOT({ verve: 0.7 })).kind, REFLEX_KIND.LONE_FRENZY);
  assert.equal(mk(PILOT({ verve: 0.3, poise: 0.4 })).kind, REFLEX_KIND.LONE_FADE);
  assert.equal(mk(PILOT({ poise: 0.7, verve: 0.5 })).kind, REFLEX_KIND.LONE_GHOST);
});

test('wounded prey changes what a hunter does — the execution family', () => {
  const engine = createReflexEngine({ seed: 5 });
  let out = engine.evaluate(evalCtx({
    target: HOSTILE('t1', 320, 0, { hullFraction: 0.2 }),
    contacts: [HOSTILE('t1', 320, 0, { hullFraction: 0.2 })],
    temperament: PILOT({ verve: 0.7, weave: 0.3 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.KILL_PRESS, 'the aggressive pilot drives for the finish');
  assert.equal(out.boost, true);

  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    target: HOSTILE('t1', 180, 0, { hullFraction: 0.2 }),
    contacts: [HOSTILE('t1', 180, 0, { hullFraction: 0.2 })],
    temperament: PILOT({ verve: 0.3, weave: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.COUP_CIRCLE, 'the technical pilot orbits close for the coup');

  // And the stance layer keeps pressing: execution_lust holds the aim on a dying target.
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    target: HOSTILE('t1', 600, 0, { hullFraction: 0.15, targetId: 'e7' }),
    contacts: [HOSTILE('t1', 600, 0, { hullFraction: 0.15, targetId: 'e7' })],
    temperament: PILOT({ verve: 0.7, weave: 0.1 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.EXECUTION_LUST);
  assert.equal(out.holdAim, true);
});

test('a lone opponent gets the duel treatment — strafe dance and joust return', () => {
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    target: HOSTILE('t1', 300, 0, { targetId: 'e7' }),
    contacts: [HOSTILE('t1', 300, 0, { targetId: 'e7' })],
    temperament: PILOT({ weave: 0.7 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.DUEL_STRAFE, 'one-on-one at band range dances');

  // The joust: flying away from the only opponent — brake and come back.
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    self: { vel: { x: 60, z: 0 } },
    target: HOSTILE('t1', -400, 0),
    contacts: [HOSTILE('t1', -400, 0)],
    temperament: PILOT({ verve: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.JOUST_TURN);
  assert.equal(out.brake, true);
});

test('screen roles interpose; nervous escorts huddle; crowding gets a shoulder check', () => {
  // Frame-assigned escorts: the ward under fire gets a body between it and the guns.
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    squadRole: 'support',
    contacts: [ALLY('a1', 200, 0), HOSTILE('h1', 500, 0, { targetId: 'a1' })],
    temperament: PILOT({ poise: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.BODY_BLOCK);
  assert.equal(out.holdAim, true, 'the block keeps its guns on the threat');

  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    contacts: [ALLY('a1', 180, 0), HOSTILE('h1', 500, 0, { targetId: 'a1' })],
    temperament: PILOT({ poise: 0.2 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.HERD_PUSH, 'a nervous escort crowds the ward');

  out = fireSweep({
    contacts: [ALLY('a1', 45, 8)],
    temperament: PILOT({ poise: 0.6, weave: 0.9 }),
  }, REFLEX_KIND.SHOULDER_CHECK);
  assert.ok(out, 'a wingmate in the intake gets a polite drift off');
});

test('reactor and capacitor temperament: cold surge spends, dry tanks coast', () => {
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    self: { energyFraction: 0.9, heatFraction: 0.1 },
    contacts: [HOSTILE('h1', 480, 0)],
    temperament: PILOT({ verve: 0.7 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.COLD_SURGE);
  assert.equal(out.boost, true);

  out = fireSweep({
    self: { energyFraction: 0.1 },
    contacts: [HOSTILE('h1', 500, 0)],
    temperament: PILOT({ poise: 0.4 }),
  }, REFLEX_KIND.DRY_LIMP);
  assert.ok(out && out.settle, 'dry tanks coast on momentum');
});

test('aftermath tells: breathing wounded, rolling victors, strutting unscanned', () => {
  // calm + hurt, no fresh hit — the drift owns the first beats, then the breath.
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    reflexState: Object.assign(emptyReflexState(), { lastHull: 0.4 }),
    self: { hullFraction: 0.4 },
  }));
  assert.equal(out.kind, REFLEX_KIND.CATCH_BREATH);
  assert.equal(out.settle, true);

  out = fireSweep({
    temperament: PILOT({ verve: 0.85 }),
  }, REFLEX_KIND.VICTORY_ROLL);
  assert.ok(out, 'a hot pilot rolls the quiet sky');

  out = fireSweep({
    temperament: PILOT({ verve: 0.9, weave: 0.4 }),
  }, REFLEX_KIND.STRUT);
  assert.ok(out, 'an untargeted showboat flourishes the transit');
});

test('stalking and relief are visible: hunter stalk crawls, shake_off sheds the lock', () => {
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    target: HOSTILE('t1', 900, 0),
    contacts: [HOSTILE('t1', 900, 0)],
    temperament: PILOT({ verve: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.HUNTER_STALK);
  assert.ok(out.speedScale < 1, 'the stalk throttles down');
  assert.equal(out.holdAim, true);

  // marked → unmarked transition: a relief roll sheds the adrenaline.
  const engine = createReflexEngine({ seed: 5 });
  const rs = emptyReflexState();
  engine.evaluate(evalCtx({
    reflexState: rs, tick: 1000,
    contacts: [HOSTILE('h1', 400, 0, { targetId: 'e7' })],
  }));
  out = engine.evaluate(evalCtx({
    reflexState: rs, tick: 1040,
    contacts: [HOSTILE('h1', 1200, 0)],
    temperament: PILOT({ weave: 0.6 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.SHAKE_OFF, 'the lock dropping reads as a roll');
});

test('the second stance wave merges: duel circle, vanguard, focus fear, venting', () => {
  // Dance circle — the sustained 1v1 register under any burst-free tick (unmarked and
  // past orbit range, so the duel burst and orbit hold both stand down).
  let out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    self: { energyFraction: 0.4 },
    target: HOSTILE('t1', 500, 0),
    contacts: [HOSTILE('t1', 500, 0)],
    temperament: PILOT({ weave: 0.7, verve: 0.2, poise: 0.4 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.DANCE_CIRCLE);

  // The named leader leans the line forward (marked, so the stalk burst stands down).
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    commandId: 'e7',
    target: HOSTILE('t1', 800, 0, { targetId: 'e7' }),
    contacts: [HOSTILE('t1', 800, 0, { targetId: 'e7' })],
    temperament: PILOT({ poise: 0.6, weave: 0.1 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.VANGUARD_EDGE);
  assert.ok(out.speedScale > 1);

  // Three guns locked: overwatched slide — slower and aim dropped.
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    contacts: [
      HOSTILE('h1', 400, 0, { targetId: 'e7' }),
      HOSTILE('h2', 500, 60, { targetId: 'e7' }),
      HOSTILE('h3', 460, -80, { targetId: 'e7' }),
    ],
    temperament: PILOT({ weave: 0.4, verve: 0.4 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.CROSSFIRE_WEAVE, 'the burst still beats the stance');
  const rs = emptyReflexState();
  rs.cooldowns = new Map([[REFLEX_KIND.CROSSFIRE_WEAVE, 5000]]);
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    reflexState: rs,
    contacts: [
      HOSTILE('h1', 400, 0, { targetId: 'e7' }),
      HOSTILE('h2', 500, 60, { targetId: 'e7' }),
    ],
    temperament: PILOT({ weave: 0.4, verve: 0.4 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.OVERWATCHED, 'cooling the burst leaves the slide');

  // Hot plates on a jumpy pilot sway.
  out = createReflexEngine({ seed: 5 }).evaluate(evalCtx({
    self: { heatFraction: 0.8 },
    contacts: [HOSTILE('h1', 500, 0)],
    temperament: PILOT({ poise: 0.3, verve: 0.2 }),
  }));
  assert.equal(out.kind, REFLEX_KIND.VENT_SWAY);
});
