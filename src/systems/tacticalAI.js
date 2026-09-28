import { createEnemyMindPort } from '../ai/enemyMind/port.js';
import { enemyMindAllowsFire, SPECIALIST_DOCTRINES } from '../ai/enemyMind/adapter.js';
import { shapeNemesisManeuverRequest, nemesisFireAllowed } from '../ai/nemesisTactics.js';
import {
  guardCapitalBossActionPort,
  shapeCapitalBossManeuverRequest,
  applyCapitalBossFireGate,
  capitalScoreControls,
  capitalBossOrder,
} from '../ai/capitalBossOrders.js';
import { AIInspectionEndpoint } from '../ai/inspection.js';
import { createSG03ActionPort } from '../ai/sg03ActionPort.js';
import { TacticalAIStack } from '../ai/stack.js';
import {
  ManeuverKind,
  NORMALIZED_THRUSTER_REQUEST_FLAG,
  hashUnit,
  wrapAngle,
} from '../ai/contracts.js';
import {
  SQUAD_RECIPE_BURNING_PASS,
  SQUAD_RECIPE_FUNERAL_ORBIT,
  SQUAD_RECIPE_GHOST_RELAY,
  SQUAD_RECIPE_HAMMER_ANVIL,
  SQUAD_RECIPE_HARASSMENT_RING,
  SQUAD_RECIPE_HUNTER_PAIR,
  SQUAD_RECIPE_INTERCEPTOR_SCISSORS,
  SQUAD_RECIPE_KNIFE_DANCE,
  SQUAD_RECIPE_LEAPFROG_BOUNDS,
  SQUAD_RECIPE_OVERWATCH_LADDER,
  SQUAD_RECIPE_PICKET_WALL,
  SQUAD_RECIPE_PINCER_SWEEP,
  SQUAD_RECIPE_RECON_SHADOW,
  SQUAD_RECIPE_SHEPHERD_NET,
  SQUAD_RECIPE_SIEGE_ORBIT,
  SQUAD_RECIPE_STANDOFF_GUNLINE,
  SQUAD_RECIPE_SWARM_BURST,
  SQUAD_RECIPE_WOLFPACK_QUARTER,
  SQUAD_SOCKET,
  getSquadRecipe,
} from '../data/squadChoreography.js';
import { applyAIFiringIntent, clearAIFiringIntent } from './aiFireIntent.js';
import {
  maintainFirstSessionAttackerOwnership,
  refreshFirstSessionAttackerOwnership,
  resetFirstSessionAttackerOwnership,
} from '../ai/engagementAuthority.js';
import { hullIdFromEntity } from '../data/flightFeelEnvelopes.js';
import { SHIPS } from '../data/ships.js';
import { recipeIdFromEntity } from '../ai/squadFrame.js';
import {
  cohortRecipeFromEntity,
  createFodderCohortDirector,
} from '../ai/fodderCohort.js';
import { ensureActivityClassified, entityNeedsAiThink } from '../world/activityRuntime.js';
import { indexedShipLikeScan, entityIndexVersion } from '../world/livingWorldViews.js';
import { applySpecialistCounterplay } from '../ai/specialistCounterplay.js';
import { specialistPlanByEnemyId } from '../ai/specialistPlans.js';
import { applyMineLayerVerb } from '../ai/mineLayerVerb.js';
import { applyNpcBombMirror } from '../ai/npcBombMirror.js';
import {
  ENEMY_DOCTRINE_OVERRIDES,
  MISSION_TAG_BOSS_DOCTRINE,
} from '../data/combatDefs.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { CombatDoctrineId, normalizeCombatDoctrineId } from '../ai/combatDoctrine.js';
import { applyNpcFieldDeploy } from '../ai/npcFieldDeploy.js';
import { stepEgressExits } from '../ai/egressExit.js';
import { getCombatKernel } from '../combat/kernel.js';

const OWNERSHIP_REFRESH_TICKS = 3;
const HEAVY_MASS_THRESHOLD = 150;
// Stock doctrine id stamped by the enemy def (makeEnemySpawnSpec) for each roster id. The
// identity stamp only upgrades a hull still carrying its stock id, so an encounter script,
// ACE loadout, or any other author who assigns a doctrine always outranks the identity table.
const ENEMY_BASE_DOCTRINE_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, normalizeCombatDoctrineId(row.combatDoctrineId)]));
const HEAVY_TURN_MANEUVERS = new Set([
  ManeuverKind.INTERCEPT,
  ManeuverKind.ORBIT,
  ManeuverKind.APPROACH_SOCKET,
  ManeuverKind.CUT_TETHER,
]);
const DEFAULT_HEAVY_MOTION = Object.freeze({
  minTurnSpeed: 18,
  turnStartAngle: 0.68,
  turnCarryForward: 0.12,
});
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));

/**
 * Production Enemy Mind configuration (packet 05 overlay). Applied at both production construction
 * sites (browser registry selectAISystem and the Node production-fidelity factory table) so every
 * client runs the same pilot mind. The doctrine→profile mapping is the packet's example: motives
 * are authored independently of combat strength, unmapped doctrines fall back to 'crew', and the
 * specialist doctrines (tether/anchor/capital/screen/mine/shield-breaker) are reserved by the
 * adapter regardless of this table. Passing `{ enabled: false }` at a construction site is the
 * exact no-new-RNG-draw rollback switch.
 */
export const PRODUCTION_ENEMY_MIND_CONFIG = Object.freeze({
  enabled: true,
  profile: 'crew',
  profilesByDoctrine: Object.freeze({
    interceptor_flyby: 'raider',
    brawler_commit: 'rookie',
    ranged_disengager: 'veteran',
    swarm_pack: 'raider',
    pack_pursuit: 'crew',
  }),
  tuning: Object.freeze({ maxThinksPerUpdate: 8, telegraph: 0.45 }),
});

/**
 * Keep a moving heavy's momentum while it slews onto a new line. The maneuver planner already
 * derives hull-relative yaw/acceleration envelopes; this small policy prevents the planner's
 * turn-before-burn gate from making a heavy hull stop dead and rotate like a turret. It only
 * shapes a normalized request, never an entity transform or physics state.
 */
export function shapeHeavyManeuverRequest(request, state) {
  if (!request || !HEAVY_TURN_MANEUVERS.has(request.kind) || request.brake) return request;
  const entity = entityForManeuver(state, request.entityId);
  const motion = heavyMotionForEntity(entity);
  if (!motion || !request.forceLocal) return request;
  const speed = Math.hypot(
    finite(entity && entity.vel && entity.vel.x),
    finite(entity && entity.vel && entity.vel.z),
  );
  if (speed < motion.minTurnSpeed) return request;
  const heading = finite(request.targetHeading, finite(entity && entity.rot));
  const turnError = Math.abs(wrapAngle(heading - finite(entity && entity.rot)));
  if (turnError < motion.turnStartAngle) return request;
  if (finite(request.forceLocal.forward) >= motion.turnCarryForward) return request;

  const nextForward = motion.turnCarryForward;
  if (!Object.isFrozen(request) && !Object.isFrozen(request.forceLocal)) {
    request.forceLocal.forward = nextForward;
    return request;
  }

  const nextForce = { ...request.forceLocal, forward: nextForward };
  if (Object.isFrozen(request.forceLocal) || Object.isFrozen(request)) Object.freeze(nextForce);
  const next = { ...request, forceLocal: nextForce };
  if (request[NORMALIZED_THRUSTER_REQUEST_FLAG] === true) {
    Object.defineProperty(next, NORMALIZED_THRUSTER_REQUEST_FLAG, { value: true });
  }
  if (Object.isFrozen(request)) Object.freeze(next);
  return next;
}

function entityForManeuver(state, entityId) {
  const entities = state && state.entities;
  return entities && typeof entities.get === 'function' ? entities.get(entityId) : null;
}

function heavyMotionForEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const hull = SHIP_BY_ID.get(hullIdFromEntity(entity));
  const authored = hull && hull.heavyMotion;
  const derived = entity.data && entity.data.derived;
  const mass = finite(
    entity.physicsBody && entity.physicsBody.mass,
    finite(entity.mass, finite(derived && (derived.operationalMass ?? derived.mass), hull && hull.mass)),
  );
  if (mass < HEAVY_MASS_THRESHOLD) return null;
  return authored || DEFAULT_HEAVY_MOTION;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * SG-06 simulation-system factory.
 *
 * Default SG-06 tactical AI system. Ports are lazy-bound on first update so registry init order can
 * install helpers.aiManeuver/helpers.aiSensors after this system's init. SG-03 is adapted directly
 * and remains the sole action executor. Missing ports throw before gameplay updates; no intent.fire
 * or velocity fallback exists.
 */
/** Bench A/B: production default ON. Skip tacticalAI.update when no non-player needs AI think. */
let TACTICAL_AI_QUIET_LATCH = true;
export function setTacticalAiQuietLatchForBench(enabled) {
  TACTICAL_AI_QUIET_LATCH = enabled !== false;
}
export function getTacticalAiQuietLatchForBench() {
  return TACTICAL_AI_QUIET_LATCH !== false;
}

function anyNonPlayerNeedsAiThink(state, shipLikeList) {
  const list = shipLikeList || indexedShipLikeScan(state);
  if (!list || !list.length) return false;
  const pid = state && state.playerId;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || entity.id === pid) continue;
    if (entityNeedsAiThink(entity, state)) return true;
  }
  return false;
}

function publishTacticalAiQuiet(state, latched) {
  const rt = state.tacticalAiRuntime || (state.tacticalAiRuntime = {});
  rt.quietLatched = !!latched;
}

export function createTacticalAISystem({
  seed = null,
  config = {},
  authoredEncounter = null,
  sensors = null,
  roster = null,
  maneuver = null,
  encounter = null,
  actionPortFactory = createSG03ActionPort,
} = {}) {
  const runtime = config.runtime && typeof config.runtime === 'object' ? config.runtime : {};
  // The production stack replays its last physical maneuver on skipped decision ticks, while its
  // per-member perception batches already spread work over three ticks. Running the full squad /
  // doctrine / selector stack at 30 Hz therefore preserves 60 Hz thruster authority and halves the
  // heaviest fixed-step decision cost. Injected-port fixtures retain their historical every-tick
  // cadence unless they explicitly opt into another interval.
  const productionPortDefaults = sensors == null && roster == null && maneuver == null;
  const defaultRuntime = ('memberBatchSize' in runtime || 'memberBatchTargetTicks' in runtime || 'memberBatchSpreadTicks' in runtime)
    ? {}
    : { memberBatchSize: 3, memberBatchSpreadTicks: 3 };
  const runtimeConfig = {
    ...config,
    runtime: {
      ...defaultRuntime,
      decisionIntervalTicks: productionPortDefaults ? 2 : 1,
      ...runtime,
    },
    trace: config.trace === undefined ? defaultTraceConfig() : config.trace,
    freezeResults: config.freezeResults === undefined ? false : config.freezeResults,
  };
  let stack = null;
  let inspection = null;
  let ctxRef = null;
  let lastDecisionTick = -Infinity;
  let lastOwnershipRefreshTick = -Infinity;
  let lastManeuverRequests = [];
  const lastDecisionEntityRefs = new Map();
  const lifecycleUnsubscribes = [];
  const decisionIntervalTicks = runtimeDecisionInterval(runtimeConfig);
  let quietLatch = null;

  function ensureStack(state) {
    if (stack) return stack;
    if (!ctxRef) throw new Error('tacticalAI used before init');
    const helpers = ctxRef.helpers || (ctxRef.helpers = {});
    const baseManeuver = maneuver || helpers.aiManeuver;
    const ports = {
      sensors: sensors || helpers.aiSensors,
      roster: roster || helpers.aiRoster,
      maneuver: heavyAwareManeuverPort(baseManeuver, () => ctxRef && ctxRef.state),
      encounter: encounter || helpers.aiEncounter || null,
      actions: guardCapitalBossActionPort(actionPortFactory(ctxRef), () => ctxRef.state),
    };
    // Injected-port fixtures keep their legacy behavior unless explicitly enabled. Production
    // opts in; config.enemyMind.enabled=false is an exact no-RNG-draw rollback switch.
    const mindConfig = { enabled: productionPortDefaults, ...(config.enemyMind || {}) };
    if (mindConfig.enabled) ports.enemyMind = createEnemyMindPort({
      stateProvider: () => ctxRef && ctxRef.state,
      emit: (event, payload) => ctxRef && ctxRef.bus && ctxRef.bus.emit(event, payload),
      config: mindConfig,
    });
    stack = new TacticalAIStack({
      seed: seed == null ? (state && state.meta && state.meta.seed) || 1 : seed,
      ports,
      config: runtimeConfig,
    });
    bindHullResolver(stack);
    inspection = new AIInspectionEndpoint(stack);
    return stack;
  }

  function heavyAwareManeuverPort(basePort, stateProvider) {
    if (!basePort || typeof basePort.request !== 'function') return basePort;
    return {
      request(request) {
        const state = typeof stateProvider === 'function' ? stateProvider() : null;
        // Nemesis counter maneuver: a pure, denial-free shaping stage over the tagged active
        // rival wing only. It runs BEFORE heavy-ship shaping, never touches other hulls, keeps
        // forces/torques in [-1, 1], and always yields to brake / tether-escape / deadlock kinds.
        const actor = entityForManeuver(state, request && request.entityId);
        const actorIsNemesis = actor && actor.data && actor.data.nemesis;
        const sensorPort = sensors || (ctxRef && ctxRef.helpers && ctxRef.helpers.aiSensors);
        const frame = actorIsNemesis && sensorPort && typeof sensorPort.frameFor === 'function'
          ? sensorPort.frameFor(request.entityId, state.tick) : null;
        return basePort.request(shapeCapitalBossManeuverRequest(shapeHeavyManeuverRequest(
          actorIsNemesis ? shapeNemesisManeuverRequest(request, state, frame) : request, state,
        ), state));
      },
    };
  }

  const hullHint = { hullId: null, flightClass: null };
  function bindHullResolver(liveStack) {
    if (!liveStack || !liveStack.maneuver) return;
    if (!liveStack.fodderCohorts) {
      liveStack.fodderCohorts = createFodderCohortDirector({ seed: liveStack.seed || 1 });
    }
    const frames = liveStack.maneuver.squadFrames;
    if (frames && typeof frames.attachCohorts === 'function') {
      frames.attachCohorts(liveStack.fodderCohorts);
    }
    liveStack.maneuver.resolveHull = (entityId) => {
      const state = ctxRef && ctxRef.state;
      const entities = state && state.entities;
      const entity = entities && typeof entities.get === 'function' ? entities.get(entityId) : null;
      hullHint.hullId = hullIdFromEntity(entity);
      hullHint.flightClass = (entity && entity.flightClass)
        || (entity && entity.data && entity.data.shipClass)
        || null;
      return hullHint;
    };
  }

  function handleInspection(request = {}) {
    const liveStack = ensureStack(ctxRef && ctxRef.state);
    if (!inspection || !liveStack) return Object.freeze({ version: 1, ok: false, error: { code: 'AI_NOT_INITIALIZED' } });
    return inspection.handle(request);
  }

  function resetRuntime() {
    stack = null;
    inspection = null;
    lastDecisionTick = -Infinity;
    lastOwnershipRefreshTick = -Infinity;
    lastManeuverRequests = [];
    lastDecisionEntityRefs.clear();
    quietLatch = null;
    resetFirstSessionAttackerOwnership(ctxRef && ctxRef.state);
  }

  function detachLifecycleListeners() {
    for (const unsubscribe of lifecycleUnsubscribes.splice(0)) {
      try { unsubscribe(); } catch (_) { /* teardown is best effort */ }
    }
  }

  function listenLifecycle(bus, event, handler) {
    if (!bus || typeof bus.on !== 'function') return;
    const unsubscribe = bus.on(event, handler);
    if (typeof unsubscribe === 'function') lifecycleUnsubscribes.push(unsubscribe);
    else if (typeof bus.off === 'function') lifecycleUnsubscribes.push(() => bus.off(event, handler));
  }

  function invalidateEntity(entityId) {
    if (entityId == null) return;
    if (stack && typeof stack.forgetEntity === 'function') stack.forgetEntity(entityId);
    lastManeuverRequests = lastManeuverRequests.filter((request) => request && request.entityId !== entityId);
  }

  function lifecycleEntityId(payload) {
    return payload && typeof payload === 'object'
      ? (payload.id ?? payload.entityId)
      : payload;
  }

  function invalidateLifecycleEntity(payload) {
    invalidateEntity(lifecycleEntityId(payload));
  }

  function invalidateDestroyedLifecycleEntity(payload) {
    const entityId = lifecycleEntityId(payload);
    if (entityId == null) return;
    const state = ctxRef && ctxRef.state;
    const live = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(entityId)
      : null;
    if (live && live.alive !== false) return;
    invalidateEntity(entityId);
  }

  function replayLastManeuvers(liveStack, tick, state) {
    const maneuverPort = liveStack && liveStack.ports && liveStack.ports.maneuver;
    if (!maneuverPort || typeof maneuverPort.request !== 'function') return;
    const entities = state && state.entities;
    const frames = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
    for (const request of lastManeuverRequests) {
      const id = request && request.entityId;
      if (frames && frames.has(id)) continue;
      const entity = entities && id != null && typeof entities.get === 'function'
        ? entities.get(id)
        : null;
      if (entity && entityNeedsAiThink(entity, state) === false) continue;
      maneuverPort.request(retickManeuverRequest(request, tick));
    }
  }

  return {
    name: 'tacticalAI',

    init(ctx) {
      detachLifecycleListeners();
      resetRuntime();
      ctxRef = ctx;
      const helpers = ctx.helpers || (ctx.helpers = {});
      helpers.inspectAI = (request = {}) => handleInspection({ method: 'ai.inspect', params: request });
      helpers.traceAI = (request = {}) => handleInspection({ method: 'ai.trace', params: request });
      helpers.inspectAIContract = () => handleInspection({ method: 'ai.contract' });
      if (ctx.bus && typeof ctx.bus.on === 'function') {
        listenLifecycle(ctx.bus, 'game:started', () => {
          if (ctxRef && ctxRef.state) delete ctxRef.state.enemyMind;
          resetRuntime();
        });
        listenLifecycle(ctx.bus, 'save:loaded', resetRuntime);
        listenLifecycle(ctx.bus, 'entity:spawned', invalidateLifecycleEntity);
        listenLifecycle(ctx.bus, 'entity:destroyed', invalidateDestroyedLifecycleEntity);
      }
    },

    destroy() {
      detachLifecycleListeners();
      resetRuntime();
      ctxRef = null;
    },

    update(_dt, state) {
      ensureActivityClassified(state);
      // Quiet latch: no non-player needs AI think → skip cohort stamp, squad/fodder steps, stack
      // update, and maneuver replay. Probe think interest every tick (nextEventAtT / pins can flip
      // without membership). Injected-port fixtures keep every-tick cadence; production quiet
      // Ceres is the latch target. Different angle from held preStep-all-sleeping.
      // One classified scan per tick: every helper below walks the same shipLike view, so the list
      // is fetched once here and threaded through instead of re-scanning (and re-classifying each
      // entity) four to six times per fixed step.
      const shipLikeList = indexedShipLikeScan(state);
      // Egress exit bound runs ahead of the quiet latch: a latched-quiet world still owes its
      // fleeing hulls the 960 WU exit, and the pass is cadence-gated and cheap.
      stepEgressExits(state, shipLikeList, ctxRef && ctxRef.bus);
      if (TACTICAL_AI_QUIET_LATCH !== false && productionPortDefaults) {
        if (!anyNonPlayerNeedsAiThink(state, shipLikeList)) {
          quietLatch = {
            armed: true,
            armedTick: Number.isInteger(state && state.tick) ? state.tick : 0,
            membership: entityIndexVersion(state),
          };
          lastManeuverRequests.length = 0;
          lastDecisionEntityRefs.clear();
          publishTacticalAiQuiet(state, true);
          return;
        }
        quietLatch = null;
        publishTacticalAiQuiet(state, false);
      } else if (state && state.tacticalAiRuntime) {
        state.tacticalAiRuntime.quietLatched = false;
      }
      markCheapCohortMembers(state, shipLikeList);
      stampManeuverIdentities(state, shipLikeList);
      const liveStack = ensureStack(state);
      bindHullResolver(liveStack);
      const tick = Number.isInteger(state && state.tick) ? state.tick : liveStack.lastTick + 1;
      const dt = Number.isFinite(_dt) && _dt > 0 ? _dt : 1 / 60;
      assignAutoSquadRecipes(state, shipLikeList, liveStack.seed);
      stepSquadFrames(liveStack, state, tick, dt, shipLikeList);
      stepFodderCohorts(liveStack, state, tick, dt, shipLikeList);
      if (tick - lastDecisionTick < decisionIntervalTicks) {
        maintainFirstSessionAttackerOwnership(state);
        if (lastManeuverRequests.length) replayLastManeuvers(liveStack, tick, state);
        driveChoreographyMembers(liveStack, state, tick, null, shipLikeList);
        driveCohortMembers(liveStack, state, tick, shipLikeList);
        revalidateCachedAIFiringIntents(liveStack, state, lastDecisionEntityRefs);
        applySquadTokenFireGate(liveStack, state, shipLikeList);
        applyCapitalBossFireGate(state, shipLikeList, clearAIFiringIntent);
        return;
      }
      const authored = typeof authoredEncounter === 'function'
        ? authoredEncounter(tick, state, ctxRef)
        : (authoredEncounter || {});
      const result = liveStack.update(tick, authored);
      lastDecisionEntityRefs.clear();
      if (tick - lastOwnershipRefreshTick >= OWNERSHIP_REFRESH_TICKS) {
        refreshFirstSessionAttackerOwnership(state, result.decisions || []);
        lastOwnershipRefreshTick = tick;
      } else {
        maintainFirstSessionAttackerOwnership(state);
      }
      lastDecisionTick = tick;
      lastManeuverRequests.length = 0;
      for (const decision of result.decisions || []) {
        const entity = state && state.entities && decision && decision.entityId != null
          && typeof state.entities.get === 'function'
          ? state.entities.get(decision.entityId)
          : null;
        if (entity) lastDecisionEntityRefs.set(decision.entityId, entity);
        if (decision && decision.maneuver) lastManeuverRequests.push(decision.maneuver);
        const doctrine = decision && decision.combatDoctrine;
        // Authored capital scores own their presentation; stock boss telegraphs would double-report.
        if (!capitalScoreControls(state, decision.entityId) && doctrine && doctrine.telegraphStarted && ctxRef.bus && typeof ctxRef.bus.emit === 'function') {
          ctxRef.bus.emit('ai:telegraph', {
            entityId: decision.entityId,
            targetId: doctrine.targetId,
            doctrineId: doctrine.doctrineId,
            phase: doctrine.phase,
            kind: doctrine.telegraph.kind,
            durationTicks: doctrine.telegraph.durationTicks,
            attackLine: doctrine.attackLine || null,
            tick,
          });
        }
        if (!capitalScoreControls(state, decision.entityId) && doctrine && doctrine.phaseChanged && ctxRef.bus && typeof ctxRef.bus.emit === 'function') {
          ctxRef.bus.emit('ai:doctrinePhase', {
            entityId: decision.entityId,
            targetId: doctrine.targetId,
            doctrineId: doctrine.doctrineId,
            flightProfile: doctrine.flightProfile,
            phase: doctrine.phase,
            fireWindow: doctrine.fireWindow,
            maneuverKind: doctrine.maneuverKind,
            attackLine: doctrine.attackLine || null,
            tick,
          });
        }
        applyChoreographyFireWindow(liveStack, decision);
        applyEngagementPosture(entity, decision.combatDoctrine || null, state);
        applyMindAwareFiringIntent(decision, state);
        applyNemesisFireGate(entity, state);
        const enemyId = entity && entity.data && (entity.data.lootTableId || entity.data.enemyTypeId);
        const fieldsSys = ctxRef && ctxRef.registry && typeof ctxRef.registry.get === 'function'
          ? ctxRef.registry.get('fields')
          : null;
        if (entity && !capitalBossOrder(state, entity.id)?.suppressStockFire && nemesisFireAllowed(entity, state) && specialistPlanByEnemyId(enemyId) && ctxRef) {
          const kernel = getCombatKernel(ctxRef);
          applySpecialistCounterplay({
            state,
            specialist: entity,
            enemyId,
            doctrinePhase: doctrine && doctrine.phase,
            tick,
            attachments: kernel && kernel.attachments,
            fields: fieldsSys,
          });
        }
        // The mine-layer's area-denial verb: the doctrine telegraphed `wake_mines` and is flying
        // its drop line; this port releases real mines behind the hull through the mines system.
        // PQ-205.02: the same telegraphed pass also calls bombs.drop / commandDetonate so the
        // pirate in front of the player lays a shootable drift bomb.
        if (entity && !capitalBossOrder(state, entity.id)?.suppressStockFire && nemesisFireAllowed(entity, state) && doctrine && doctrine.doctrineId === CombatDoctrineId.MINE_LAYER_WAKE) {
          applyMineLayerVerb({
            state,
            entity,
            doctrinePhase: doctrine.phase,
            tick,
            placeMine: ctxRef.helpers && ctxRef.helpers.placeMine,
          });
          const bombsSys = ctxRef.registry && typeof ctxRef.registry.get === 'function'
            ? ctxRef.registry.get('bombs')
            : null;
          applyNpcBombMirror({
            state,
            entity,
            doctrinePhase: doctrine.phase,
            bombs: bombsSys,
          });
        }
        if (entity && fieldsSys && !capitalBossOrder(state, entity.id)?.suppressStockFire && nemesisFireAllowed(entity, state)) applyNpcFieldDeploy(entity, state, fieldsSys);
      }
      driveChoreographyMembers(liveStack, state, tick, result.decisions || [], shipLikeList);
      driveCohortMembers(liveStack, state, tick, shipLikeList);
      applySquadTokenFireGate(liveStack, state, shipLikeList);
      // Runs after the mind veto and the Nemesis denial gate: those vetoes still close fire, and a
      // score-owned capital/wing must not double-fire its authored attacks through stock intent.
      applyCapitalBossFireGate(state, shipLikeList, clearAIFiringIntent);
    },

    inspect(query = {}) {
      if (!stack) return null;
      return stack.inspect(query);
    },

    handleAgentRequest(request = {}) {
      if (!ctxRef) return Object.freeze({ version: 1, ok: false, error: { code: 'AI_NOT_INITIALIZED' } });
      return handleInspection(request);
    },

    get stack() { return stack; },
    get decisionIntervalTicks() { return decisionIntervalTicks; },
  };
}

/**
 * Full tactical decisions may run below the 60 Hz fixed step, but weapon authorization may not.
 * Re-apply only the final firing adapter on skipped decision ticks so live target, hostility, ROE,
 * engagement, and friendly-fire state can revoke a cached fire request before weapons consumes it.
 */
/** A veto only: the ordinary intent writer still owns action admission, ROE and friendly lanes. */
export function applyMindAwareFiringIntent(decision, state) {
  if (!enemyMindAllowsFire(decision, state && state.simTime)) {
    const entity = state && state.entities && state.entities.get(decision && decision.entityId);
    if (!entity || entity.id === state.playerId || !entity.data) return;
    let intent = entity.data.intent;
    if (intent && Object.isFrozen(intent)) intent = entity.data.intent = { ...intent };
    if (intent) clearAIFiringIntent(intent, 'enemy_mind_hold');
    return;
  }
  applyAIFiringIntent(decision, state);
}

export function revalidateCachedAIFiringIntents(liveStack, state, entityRefs = null) {
  const decisions = liveStack && liveStack.lastResult && liveStack.lastResult.decisions;
  if (!Array.isArray(decisions)) return 0;
  for (const decision of decisions) {
    const id = decision && decision.entityId;
    const entity = state && state.entities && id != null && typeof state.entities.get === 'function'
      ? state.entities.get(id)
      : null;
    const expectedEntity = entityRefs && typeof entityRefs.get === 'function' ? entityRefs.get(id) : null;
    if (expectedEntity && entity !== expectedEntity) continue;
    if (entity && entityNeedsAiThink(entity, state) === false) continue;
    applyMindAwareFiringIntent(decision, state);
    applyNemesisFireGate(entity, state);
  }
  return decisions.length;
}

/**
 * Doctrine egress/lull phases during which a weapons-free combatant's live activity reads as
 * REPOSITION instead of the authored ATTACK_RUN. This is what consumes the reposition cell of the
 * activity/ROE vocabulary mid-fight: the enemy is factually breaking off, so the behavior gate
 * layer (fire doctrine, movement classification, telemetry) sees the break, not a stale attack run.
 * Egress ends through the ordinary reform→recommit cycle, which restores the authored activity.
 */
const POSTURE_EGRESS_PHASES = new Set([
  'extend', 'breakaway', 'escape', 'recover', 'retreat', 'regroup', 'reform', 'reset', 'broadside_shift',
  'disengage', 'peel',
]);
const POSTURE_REASON_PREFIX = 'combat_doctrine:';

/**
 * Nemesis fire gate (packet: Counterexample). Denial only — it can never open the enemy-mind
 * veto, ROE, hostility, action admission, friendly-fire or token gates. Runs AFTER the fresh
 * firing decision AND on cached decisions (revalidateCachedAIFiringIntents) so a skipped
 * decision frame cannot keep firing through a cease-fire/telegraph window. Previously launched
 * ordnance is not erased.
 */
function applyNemesisFireGate(entity, state) {
  const intent = entity && entity.data && entity.data.intent;
  if (intent && !nemesisFireAllowed(entity, state)) {
    clearAIFiringIntent(intent, 'nemesis_telegraph_or_retreat');
  }
}

export function applyEngagementPosture(entity, doctrine, state) {
  if (!entity || !entity.data) return;
  const ai = entity.data.ai;
  if (!ai || ai.passive === true || ai.roe !== 'weapons_free') return;
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  const current = ai.activity && typeof ai.activity === 'object' ? ai.activity : null;
  if (!doctrine || !POSTURE_EGRESS_PHASES.has(doctrine.phase)) {
    // Re-commit (or doctrine dropped): hand the authored activity back exactly once.
    const base = ai.postureBaseActivity;
    if (base && current && String(current.reason || '').startsWith(POSTURE_REASON_PREFIX)) {
      ai.activity = base;
    }
    ai.postureBaseActivity = null;
    return;
  }
  // Survival orders (morale flee / fsm flee) and already-postured activity outrank the break.
  if (!current || current.kind === 'flee' || current.kind === 'disengage') return;
  // A CONTROL-dispatched enforcement run does not break off on doctrine cadence: the incident's
  // own stand-down ends the response, so the egress/lull rewrite must not park a pursuer in a
  // stand-off orbit while the offender is still the live assignment (measured on the witness
  // route: reserves held 645-724 WU under reform/reposition for the whole capture window instead
  // of closing to hail range).
  if (current.kind === 'attack_run' && current.targetId != null
    && (String(current.reason || '').startsWith('security_response:')
      || String(current.reason || '').startsWith('wanted_warrant:'))) return;
  if (String(current.reason || '').startsWith(POSTURE_REASON_PREFIX)) return;
  // A break is already in flight but another writer replaced the activity with a non-posture
  // reason: do not stash the interloper — re-commit must hand back the ORIGINAL authored
  // activity, so leave the stash and the live activity alone this tick.
  if (ai.postureBaseActivity) return;
  const preferred = Number.isFinite(doctrine.preferredRange) && doctrine.preferredRange > 0
    ? doctrine.preferredRange
    : (Number.isFinite(current.preferredRange) && current.preferredRange > 0 ? current.preferredRange : 620);
  ai.postureBaseActivity = current;
  ai.activity = {
    ...current,
    kind: 'reposition',
    reason: `${POSTURE_REASON_PREFIX}${doctrine.doctrineId}:${doctrine.phase}`,
    preferredRange: preferred,
    startedTick: tick,
  };
}

function runtimeDecisionInterval(config = {}) {
  const runtime = config.runtime && typeof config.runtime === 'object' ? config.runtime : {};
  const value = runtime.decisionIntervalTicks ?? config.decisionIntervalTicks ?? 1;
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(12, Math.floor(value)));
}

function retickManeuverRequest(request, tick) {
  if (!request || request.tick === tick) return request;
  if (!Object.isFrozen(request)) {
    request.tick = tick;
    return request;
  }
  const next = { ...request, tick };
  if (request[NORMALIZED_THRUSTER_REQUEST_FLAG] === true) {
    Object.defineProperty(next, NORMALIZED_THRUSTER_REQUEST_FLAG, { value: true });
  }
  return next;
}

function defaultTraceConfig() {
  const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
  return isNode
    ? { enabled: true, layers: ['behavior'], capacity: 512 }
    : { enabled: false };
}

function stepSquadFrames(liveStack, state, tick, dt, shipLikeList = indexedShipLikeScan(state)) {
  const director = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
  if (!director || typeof director.stepAll !== 'function') return;
  const squads = gatherRecipeSquads(state, shipLikeList);
  if (!squads.length) return;
  const entities = state && state.entities;
  director.stepAll(tick, dt, squads, (id) => (
    entities && typeof entities.get === 'function' ? entities.get(id) : null
  ));
}

export function markCheapCohortMembers(state, shipLikeList = indexedShipLikeScan(state)) {
  const list = shipLikeList;
  if (!list || !list.length) return;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    const ai = entity.data && entity.data.ai;
    if (!ai) continue;
    // Idempotent stamp: entities already marked cheap re-write the same two fields, so the
    // recipe lookup is only paid for members that still need marking.
    if (ai.passive === true && ai.allowPassiveManeuver === false) continue;
    if (!cohortRecipeFromEntity(entity)) continue;
    ai.passive = true;
    ai.allowPassiveManeuver = false;
  }
}

/**
 * Per-archetype fight identity (combat-variety vertical). Resolves the ENEMY_DOCTRINE_OVERRIDES
 * / boss-choreography doctrine for each armed hull and stamps it onto data.ai.combatDoctrineId
 * — the one channel the tactical stack reads. Authority rules:
 *   - a hull whose doctrine was set by anyone OTHER than the stock enemy def (encounter script,
 *     ACE loadout, spawn option) keeps its assignment; only a stock stamp is upgraded;
 *   - `ai.identityStock === true` opts the hull out entirely (spawn-level authoring control;
 *     the duel audit's A/B arm uses it to reproduce the pre-identity baseline);
 *   - a CAPITAL_BOSSES mission tag (data.missionTag) outranks the archetype override, so the
 *     bruiser-brawler hulk of `capital_boss` still choreographs as a capital.
 * Idempotent per tick and deterministic: the same entity data always resolves the same doctrine.
 */
export function stampManeuverIdentities(state, shipLikeList = indexedShipLikeScan(state)) {
  const list = shipLikeList;
  if (!list || !list.length) return 0;
  let stamped = 0;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    const data = entity.data;
    const ai = data && data.ai;
    if (!ai || ai.passive === true || ai.identityStock === true) continue;
    const enemyId = data.lootTableId || data.enemyTypeId || null;
    if (enemyId == null && data.missionTag == null) continue;
    let wanted = null;
    if (data.missionTag && MISSION_TAG_BOSS_DOCTRINE[data.missionTag]) {
      wanted = MISSION_TAG_BOSS_DOCTRINE[data.missionTag];
    } else if (enemyId && ENEMY_DOCTRINE_OVERRIDES[enemyId]) {
      wanted = ENEMY_DOCTRINE_OVERRIDES[enemyId];
    }
    if (!wanted) continue;
    const baseId = enemyId ? ENEMY_BASE_DOCTRINE_BY_ID.get(enemyId) : null;
    if (baseId && ai.combatDoctrineId && ai.combatDoctrineId !== baseId) continue;
    if (ai.combatDoctrineId === wanted) continue;
    ai.combatDoctrineId = wanted;
    stamped += 1;
  }
  return stamped;
}

function stepFodderCohorts(liveStack, state, tick, dt, shipLikeList = indexedShipLikeScan(state)) {
  const director = liveStack && liveStack.fodderCohorts;
  if (!director || typeof director.stepAll !== 'function') return;
  const groups = gatherCohorts(state, shipLikeList);
  if (!groups.length) return;
  const entities = state && state.entities;
  director.stepAll(
    tick,
    dt,
    groups,
    (id) => (entities && typeof entities.get === 'function' ? entities.get(id) : null),
    state,
  );
}

const EMPTY_GROUPS = Object.freeze([]);
const cohortGatherById = new Map();
const cohortGatherOut = [];
const squadGatherById = new Map();
const squadGatherOut = [];

// ── Auto squad choreography (§21A) ───────────────────────────────────────────
// A weapons-free, engaged squad — one encounter squadId, wingId, or reinforcement
// encounterId — flies a frame recipe even when no author wrote one. The recipe reads the
// squad's doctrine mix: a marksman anchor produces a standoff gunline, all-fast wings
// alternate scissors/pincer by squad seed, anything else sweeps a pincer. Authored
// squadRecipe wins; specialist/capital doctrines and fodder cohorts keep their own stacks;
// fewer than AUTO_SQUAD_MIN_SIZE survivors releases the stamp so the frame dissolves.
const AUTO_SQUAD_MIN_SIZE = 2;
const AUTO_SQUAD_FLIGHT_SIZE = 4;
const AUTO_SQUAD_FAST_DOCTRINES = new Set([
  CombatDoctrineId.INTERCEPTOR_FLYBY,
  CombatDoctrineId.SWARM_PACK,
  CombatDoctrineId.PACK_PURSUIT,
]);

function autoSquadKeyFor(ai) {
  return ai.squadId || ai.wingId || ai.encounterId || null;
}

function autoSquadEligible(entity, state) {
  if (!entity || entity.alive === false || entity.id === (state && state.playerId)) return false;
  const ai = entity.data && entity.data.ai;
  if (!ai || ai.passive === true) return false;
  if (ai.squadRecipe && ai.autoSquadRecipe !== true) return false;
  if (ai.cohortRecipe) return false;
  if (ai.roe !== 'weapons_free') return false;
  const activity = ai.activity;
  if (!activity || (activity.kind !== 'attack_run' && activity.kind !== 'engage')) return false;
  const combat = entity.data.combat;
  if (!combat || combat.targetId == null) return false;
  const doctrineId = normalizeCombatDoctrineId(ai.combatDoctrineId);
  if (doctrineId && SPECIALIST_DOCTRINES.has(doctrineId)) return false;
  return autoSquadKeyFor(ai) != null;
}

// The auto-choreography table: a squad's doctrine mix picks a family, then a seeded draw
// picks the recipe inside it. Marksman-anchored squads hold walls and orbit; all-fast wings
// run the passing games; mixed wings quarter, sweep, or herd. Deterministic per squad key.
function autoRecipeForSquad(members, squadKey, seed) {
  let ranged = 0;
  let fast = 0;
  for (const member of members) {
    const d = normalizeCombatDoctrineId(member.data && member.data.ai && member.data.ai.combatDoctrineId);
    if (d === CombatDoctrineId.RANGED_DISENGAGER) ranged += 1;
    else if (AUTO_SQUAD_FAST_DOCTRINES.has(d)) fast += 1;
  }
  const mix = hashUnit(seed, squadKey, 'squad_recipe');
  // Marksman wings anchor everyone behind a firing line — deep benches circle for a
  // siege or lay down bounding overwatch, shallower mixes form the gunline, hold the
  // picket wall, wheel a vigil, or shadow the target from extreme range.
  if (ranged > 0) {
    if (ranged >= 2) {
      return mix < 0.34 ? SQUAD_RECIPE_SIEGE_ORBIT
        : mix < 0.56 ? SQUAD_RECIPE_PICKET_WALL
        : mix < 0.78 ? SQUAD_RECIPE_OVERWATCH_LADDER
        : SQUAD_RECIPE_LEAPFROG_BOUNDS;
    }
    return mix < 0.4 ? SQUAD_RECIPE_STANDOFF_GUNLINE
      : mix < 0.62 ? SQUAD_RECIPE_PICKET_WALL
      : mix < 0.82 ? SQUAD_RECIPE_FUNERAL_ORBIT
      : SQUAD_RECIPE_RECON_SHADOW;
  }
  if (fast === members.length) {
    // Two fast hulls read as a hunting pair, not a flight.
    if (members.length <= 2) {
      return mix < 0.7 ? SQUAD_RECIPE_HUNTER_PAIR : SQUAD_RECIPE_INTERCEPTOR_SCISSORS;
    }
    return mix < 0.22 ? SQUAD_RECIPE_INTERCEPTOR_SCISSORS
      : mix < 0.42 ? SQUAD_RECIPE_PINCER_SWEEP
      : mix < 0.58 ? SQUAD_RECIPE_HARASSMENT_RING
      : mix < 0.72 ? SQUAD_RECIPE_KNIFE_DANCE
      : mix < 0.85 ? SQUAD_RECIPE_SWARM_BURST
      : SQUAD_RECIPE_BURNING_PASS;
  }
  return mix < 0.24 ? SQUAD_RECIPE_PINCER_SWEEP
    : mix < 0.42 ? SQUAD_RECIPE_WOLFPACK_QUARTER
    : mix < 0.58 ? SQUAD_RECIPE_SHEPHERD_NET
    : mix < 0.72 ? SQUAD_RECIPE_HAMMER_ANVIL
    : mix < 0.86 ? SQUAD_RECIPE_GHOST_RELAY
    : SQUAD_RECIPE_INTERCEPTOR_SCISSORS;
}

function incumbentAutoRecipe(members, squadKey) {
  // Hysteresis: a flight that already carries an auto stamp keeps it while members
  // stay engaged, so one member's doctrine reassignment (e.g. enemy mind promoting a
  // striker to shield_breaker) can't re-derive the recipe and reset everyone's frame
  // mid-fight. Majority wins; lowest recipe id breaks ties deterministically.
  const counts = new Map();
  for (const member of members) {
    const ai = member.data && member.data.ai;
    if (!ai || ai.autoSquadRecipe !== true) continue;
    if (typeof ai.squadRecipe !== 'string' || !getSquadRecipe(ai.squadRecipe)) continue;
    if (typeof ai.squadFrameId !== 'string' || !ai.squadFrameId.startsWith(`${squadKey}#`)) continue;
    counts.set(ai.squadRecipe, (counts.get(ai.squadRecipe) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [recipeId, count] of counts) {
    if (count > bestCount || (count === bestCount && best != null && recipeId < best)) {
      best = recipeId;
      bestCount = count;
    }
  }
  return best;
}

function autoSocketsFor(members) {
  const sorted = members.slice().sort((a, b) => {
    const ai = String(a.id);
    const bi = String(b.id);
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
  const free = new Set([SQUAD_SOCKET.LEAD, SQUAD_SOCKET.LEFT, SQUAD_SOCKET.RIGHT, SQUAD_SOCKET.REAR]);
  const out = new Map();
  const take = (entity, want) => {
    if (out.has(entity.id)) return;
    if (want && free.has(want)) {
      free.delete(want);
      out.set(entity.id, want);
    }
  };
  // Marksman doctrines ride the rear socket so the firing line keeps its support wing.
  for (const m of sorted) {
    const d = normalizeCombatDoctrineId(m.data && m.data.ai && m.data.ai.combatDoctrineId);
    if (d === CombatDoctrineId.RANGED_DISENGAGER) take(m, SQUAD_SOCKET.REAR);
  }
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (out.has(m.id)) continue;
    const want = i === 0 ? SQUAD_SOCKET.LEAD
      : (i % 2 === 1 ? SQUAD_SOCKET.LEFT : SQUAD_SOCKET.RIGHT);
    take(m, want);
    if (!out.has(m.id)) {
      const first = free.values().next();
      if (!first.done) {
        free.delete(first.value);
        out.set(m.id, first.value);
      }
    }
  }
  return out;
}

const autoSquadGroupsScratch = new Map();

export function assignAutoSquadRecipes(state, shipLikeList = indexedShipLikeScan(state), seed = 1) {
  const list = shipLikeList;
  if (!list || !list.length) return 0;
  const byKey = autoSquadGroupsScratch;
  byKey.clear();
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!autoSquadEligible(entity, state)) continue;
    const ai = entity.data.ai;
    const key = autoSquadKeyFor(ai);
    let group = byKey.get(key);
    if (!group) {
      group = [];
      byKey.set(key, group);
    }
    group.push(entity);
  }
  let stamped = 0;
  for (const [key, members] of byKey) {
    if (members.length < AUTO_SQUAD_MIN_SIZE) continue;
    const recipeId = incumbentAutoRecipe(members, String(key))
      || autoRecipeForSquad(members, String(key), seed);
    const sorted = members.slice().sort((a, b) => {
      const ai = String(a.id);
      const bi = String(b.id);
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
    // Large spawns split into flights so each frame stays a readable formation instead
    // of eight hulls fighting over four sockets.
    for (let start = 0; start < sorted.length; start += AUTO_SQUAD_FLIGHT_SIZE) {
      const flight = sorted.slice(start, start + AUTO_SQUAD_FLIGHT_SIZE);
      if (flight.length < AUTO_SQUAD_MIN_SIZE) continue;
      const flightId = `${key}#${Math.floor(start / AUTO_SQUAD_FLIGHT_SIZE)}`;
      const sockets = autoSocketsFor(flight);
      for (const entity of flight) {
        const ai = entity.data.ai;
        // A live recipe re-stamps nothing; a recipe change (squad attrition shifting the
        // mix across the line) moves the whole flight at once.
        if (ai.squadRecipe === recipeId && ai.squadFrameId === flightId) continue;
        ai.squadRecipe = recipeId;
        ai.autoSquadRecipe = true;
        ai.squadFrameId = flightId;
        const socket = sockets.get(entity.id);
        if (socket && !ai.squadSocket) {
          ai.squadSocket = socket;
          ai.autoSquadSocket = true;
        }
        stamped += 1;
      }
    }
  }
  // Release: a member that disengaged, went passive, or watched its flight fall under
  // the size floor drops back to solo doctrine flying.
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    const ai = entity && entity.data && entity.data.ai;
    if (!ai || ai.autoSquadRecipe !== true) continue;
    const flightId = ai.squadFrameId;
    const group = autoSquadKeyFor(ai) != null ? byKey.get(autoSquadKeyFor(ai)) : null;
    const stillAssigned = autoSquadEligible(entity, state)
      && group != null
      && group.length >= AUTO_SQUAD_MIN_SIZE
      && group.some((m) => {
        const gai = m.data && m.data.ai;
        return gai && gai.squadFrameId === flightId;
      });
    if (stillAssigned) continue;
    delete ai.squadRecipe;
    delete ai.autoSquadRecipe;
    delete ai.squadFrameId;
    if (ai.autoSquadSocket === true) {
      delete ai.squadSocket;
      delete ai.autoSquadSocket;
    }
  }
  return stamped;
}

export function gatherCohorts(state, shipLikeList = indexedShipLikeScan(state)) {
  const list = shipLikeList;
  if (!list || !list.length) return EMPTY_GROUPS;
  const byId = cohortGatherById;
  byId.clear();
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    const recipeId = cohortRecipeFromEntity(entity);
    if (!recipeId) continue;
    const ai = entity.data && entity.data.ai;
    const cohortId = String(ai.squadId || ai.cohortId || recipeId);
    let group = byId.get(cohortId);
    if (!group) {
      group = {
        id: cohortId,
        recipeId,
        members: [],
        targetId: ai.forcePlayerTarget && state.playerId != null ? state.playerId : null,
      };
      byId.set(cohortId, group);
    }
    group.members.push(entity);
    if (group.targetId == null) {
      const combat = entity.data && entity.data.combat;
      if (combat && combat.targetId != null) group.targetId = combat.targetId;
    }
  }
  if (byId.size === 0) return EMPTY_GROUPS;
  cohortGatherOut.length = 0;
  for (const group of byId.values()) cohortGatherOut.push(group);
  return cohortGatherOut;
}

function driveCohortMembers(liveStack, state, tick, shipLikeList = indexedShipLikeScan(state)) {
  const director = liveStack && liveStack.fodderCohorts;
  if (!director || director.activeCohortCount() === 0) return;
  const maneuverPort = liveStack.ports && liveStack.ports.maneuver;
  const list = shipLikeList;
  if (!list || !list.length) return;
  // Cohort stepAll has already published immutable-for-this-tick plans. Reuse the read-only
  // inspection snapshot for every member, while each member keeps its original maneuver lookup
  // and submission on every fixed tick.
  const inspectionByCohortId = cohortInspectionCache(liveStack, tick);
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    if (!cohortRecipeFromEntity(entity)) continue;
    const choreographyPlan = director.planFor(entity.id);
    const cohortId = choreographyPlan && choreographyPlan.squadId;
    let inspection = null;
    if (cohortId != null) {
      if (!inspectionByCohortId.has(cohortId)) inspectionByCohortId.set(cohortId, director.inspect(cohortId));
      inspection = inspectionByCohortId.get(cohortId);
    }
    stampFodder(entity, choreographyPlan, inspection);
    if (entityNeedsAiThink(entity, state) === false) continue;
    const request = planChoreographyManeuver(liveStack, state, entity, tick);
    if (request && maneuverPort && typeof maneuverPort.request === 'function') {
      maneuverPort.request(request);
    }
  }
}

function cohortInspectionCache(liveStack, tick) {
  let cache = liveStack.cohortInspectionCache;
  if (!cache) {
    cache = { tick: null, byCohortId: new Map() };
    liveStack.cohortInspectionCache = cache;
  }
  if (cache.tick !== tick) {
    cache.tick = tick;
    cache.byCohortId.clear();
  }
  return cache.byCohortId;
}

function stampFodder(entity, plan, inspection = null) {
  if (!entity || !entity.data) return;
  const ai = entity.data.ai || (entity.data.ai = {});
  const stamp = ai.fodderCohort || (ai.fodderCohort = {});
  stamp.phase = plan ? plan.phase : null;
  stamp.shape = inspection ? inspection.shape : null;
  stamp.integrity = plan ? plan.integrity : null;
  stamp.slotError = plan ? plan.slotError : null;
  stamp.shapeError = plan && Number.isFinite(plan.shapeError) ? plan.shapeError : stamp.slotError;
  stamp.disrupted = !!(plan && plan.disrupted);
  stamp.coast = !!(plan && plan.coast);
  stamp.neighborCount = plan && Number.isFinite(plan.neighborCount) ? plan.neighborCount : 0;
  stamp.usedSpatialHash = !!(plan && plan.usedSpatialHash);
  stamp.queryMode = plan && plan.queryMode ? plan.queryMode : (stamp.usedSpatialHash ? 'spatial_hash' : 'cohort_radius');
  stamp.laneId = plan ? plan.laneId : null;
}

export function gatherRecipeSquads(state, shipLikeList = indexedShipLikeScan(state)) {
  const list = shipLikeList;
  if (!list || !list.length) return EMPTY_GROUPS;
  const byId = squadGatherById;
  byId.clear();
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    const recipeId = recipeIdFromEntity(entity);
    if (!recipeId) continue;
    const ai = entity.data && entity.data.ai;
    const squadId = String(ai.squadFrameId || ai.squadId || ai.wingId || recipeId);
    let squad = byId.get(squadId);
    if (!squad) {
      squad = {
        id: squadId,
        recipeId,
        members: [],
        targetId: ai.forcePlayerTarget && state.playerId != null ? state.playerId : null,
      };
      byId.set(squadId, squad);
    }
    squad.members.push(entity);
    if (squad.targetId == null) {
      const combat = entity.data && entity.data.combat;
      if (combat && combat.targetId != null) squad.targetId = combat.targetId;
    }
  }
  if (byId.size === 0) return EMPTY_GROUPS;
  squadGatherOut.length = 0;
  for (const squad of byId.values()) squadGatherOut.push(squad);
  return squadGatherOut;
}

const choreographyPlannedScratch = new Set();

function driveChoreographyMembers(liveStack, state, tick, decisions, shipLikeList = indexedShipLikeScan(state)) {
  const director = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
  if (!director || director.activeSquadCount() === 0) return;
  const planned = choreographyPlannedScratch;
  planned.clear();
  if (Array.isArray(decisions)) {
    for (const decision of decisions) {
      if (decision && decision.entityId != null) planned.add(decision.entityId);
    }
  }
  const maneuverPort = liveStack.ports && liveStack.ports.maneuver;
  const list = shipLikeList;
  if (!list || !list.length) return;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    if (!recipeIdFromEntity(entity)) continue;
    stampChoreography(entity, director.planFor(entity.id), director);
    if (planned.has(entity.id)) continue;
    if (entityNeedsAiThink(entity, state) === false) continue;
    const request = planChoreographyManeuver(liveStack, state, entity, tick);
    if (request && maneuverPort && typeof maneuverPort.request === 'function') {
      maneuverPort.request(request);
    }
  }
}

function planChoreographyManeuver(liveStack, state, entity, tick) {
  const planner = liveStack.maneuver;
  if (!planner || typeof planner.plan !== 'function') return null;
  const prior = liveStack.lastDecisionByEntity && liveStack.lastDecisionByEntity.get(entity.id);
  const perception = prior && prior.perception
    || (liveStack.perceptionCache && liveStack.perceptionCache.get(entity.id))
    || livePerceptionFromEntity(entity, tick);
  const directive = prior && prior.directive || fallbackDirective(entity);
  const behavior = prior && prior.action || { maneuver: directive && {
    kind: ManeuverKind.FORMATION,
    targetId: entity.data && entity.data.combat && entity.data.combat.targetId || null,
    formationSlot: directive.formation.slot,
    formationVelocity: directive.formation.velocity,
    formationBound: directive.formation.bound,
    breakFormation: false,
    reason: 'squad_frame',
  } };
  return planner.plan({
    tick,
    entityId: entity.id,
    perception,
    behavior,
    directive,
  });
}

function livePerceptionFromEntity(entity, tick) {
  const pos = entity.pos || { x: 0, z: 0 };
  const vel = entity.vel || { x: 0, z: 0 };
  return {
    tick,
    revision: tick,
    self: {
      id: entity.id,
      team: entity.team,
      pos: { x: pos.x || 0, z: pos.z || 0 },
      vel: { x: vel.x || 0, z: vel.z || 0 },
      rot: entity.rot || 0,
      radius: entity.radius || 8,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
    },
    contacts: [],
    events: [],
  };
}

function fallbackDirective(entity) {
  const pos = entity.pos || { x: 0, z: 0 };
  const slot = { x: pos.x || 0, z: pos.z || 0 };
  const vel = { x: 0, z: 0 };
  return {
    squadId: entity.data && entity.data.ai && entity.data.ai.squadId,
    formation: {
      slot,
      velocity: vel,
      bound: 140,
      breakFormation: false,
    },
    objective: { kind: 'focus', targetId: entity.data && entity.data.combat && entity.data.combat.targetId, reason: 'squad_frame' },
  };
}

function stampChoreography(entity, plan, director) {
  if (!entity || !entity.data) return;
  const ai = entity.data.ai || (entity.data.ai = {});
  const stamp = ai.squadFrame || (ai.squadFrame = {});
  const inspect = plan && plan.squadId && director && typeof director.inspect === 'function'
    ? director.inspect(plan.squadId)
    : null;
  stamp.phase = plan ? plan.phase : null;
  stamp.integrity = plan ? plan.integrity : null;
  stamp.token = plan ? plan.token : null;
  stamp.role = plan ? plan.role : null;
  stamp.socket = plan ? plan.socket : null;
  stamp.laneId = plan ? plan.laneId : null;
  stamp.slotError = plan ? plan.slotError : null;
  stamp.disrupted = !!(plan && plan.disrupted);
  stamp.coast = !!(plan && plan.coast);
  stamp.fireAuthorized = !!(plan && plan.fireAuthorized);
  stamp.morphAborted = !!(plan && plan.morphAborted);
  stamp.committedPeak = inspect ? inspect.committedPeak : 0;
  stamp.rejoinTick = plan && plan.rejoinTick != null ? plan.rejoinTick : null;
  stamp.cycle = inspect ? inspect.cycle : 0;
}

function applyChoreographyFireWindow(liveStack, decision) {
  const director = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
  if (!director || !decision) return;
  const plan = director.planFor(decision.entityId);
  if (!plan || !decision.combatDoctrine) return;
  const doctrine = decision.combatDoctrine;
  if (!Object.isFrozen(doctrine)) {
    doctrine.fireWindow = decision.enemyMind
      ? doctrine.fireWindow && !!plan.fireAuthorized : !!plan.fireAuthorized;
    return;
  }
  decision.combatDoctrine = { ...doctrine, fireWindow: decision.enemyMind
    ? doctrine.fireWindow && !!plan.fireAuthorized : !!plan.fireAuthorized };
}

function applySquadTokenFireGate(liveStack, state, shipLikeList = indexedShipLikeScan(state)) {
  const director = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
  if (!director || director.activeSquadCount() === 0) return;
  const list = shipLikeList;
  if (!list || !list.length) return;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!recipeIdFromEntity(entity)) continue;
    const plan = director.planFor(entity.id);
    const intent = entity.data && entity.data.intent;
    if (!intent) continue;
    stampChoreography(entity, plan, director);
    if (plan && plan.fireAuthorized === false && intent.fire) {
      clearAIFiringIntent(intent, 'squad_token');
    }
  }
}
