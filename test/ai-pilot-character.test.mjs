import test from 'node:test';
import assert from 'node:assert/strict';

import { ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { temperamentFor, TEMPERAMENT_IDENTITY } from '../src/ai/temperament.js';
import {
  REFLEX_KIND,
  createReflexEngine,
  emptyReflexState,
} from '../src/ai/reflexes.js';
import { assignAutoSquadRecipes } from '../src/systems/tacticalAI.js';
import { createSquadFrameDirector, recipeIdFromEntity } from '../src/ai/squadFrame.js';
import {
  FORMATION_SHAPE_LINE_4,
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
    entityId: 'e7',
    tick: 1000,
    self: { ...BASE_SELF, ...(over.self || {}) },
    contacts: over.contacts || [],
    events: over.events || null,
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
  const out = engine.evaluate(evalCtx({
    reflexState: rs,
    self: { hullFraction: 0.9 },
  }));
  assert.equal(out.kind, REFLEX_KIND.HIT_WEAVE);
  const rs2 = { ...rs, burst: null };
  const quiet = engine.evaluate(evalCtx({ reflexState: rs2, self: { hullFraction: 0.89 } }));
  assert.ok(quiet == null || quiet.kind !== REFLEX_KIND.HIT_WEAVE,
    'the refractory window stops weaving on every scratch');
});

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
  assert.ok(Math.abs(request.forceLocal.right) > 0.15,
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
  // A marksman doctrine mix in a different squad produces the standoff gunline.
  const mixed = [
    mkShip(21, { squadId: 's2', doctrine: 'ranged_disengager' }),
    mkShip(22, { squadId: 's2' }), mkShip(23, { squadId: 's2' }),
  ];
  assignAutoSquadRecipes(state, [...ships, ...mixed], 7);
  assert.equal(mixed[0].data.ai.squadRecipe, SQUAD_RECIPE_STANDOFF_GUNLINE);
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
  assert.equal(ships[0].data.ai.squadRecipe, SQUAD_RECIPE_STANDOFF_GUNLINE);
  // The enemy mind promotes the marksman to a specialist role — it must leave the
  // formation, but the rest of the flight keeps its gunline instead of re-deriving
  // and resetting the choreography mid-fight.
  ships[0].data.ai.combatDoctrineId = 'shield_breaker';
  assignAutoSquadRecipes(state, ships, 7);
  assert.equal(ships[0].data.ai.squadRecipe, undefined, 'a specialist leaves the frame');
  for (const s of ships.slice(1)) {
    assert.equal(s.data.ai.squadRecipe, SQUAD_RECIPE_STANDOFF_GUNLINE,
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
