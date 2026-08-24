import { AIInspectionEndpoint } from '../ai/inspection.js';
import { createSG03ActionPort } from '../ai/sg03ActionPort.js';
import { TacticalAIStack } from '../ai/stack.js';
import { NORMALIZED_THRUSTER_REQUEST_FLAG } from '../ai/contracts.js';
import { applyAIFiringIntent } from './aiFireIntent.js';
import {
  maintainFirstSessionAttackerOwnership,
  refreshFirstSessionAttackerOwnership,
  resetFirstSessionAttackerOwnership,
} from '../ai/engagementAuthority.js';
import { hullIdFromEntity } from '../data/flightFeelEnvelopes.js';
import { recipeIdFromEntity } from '../ai/squadFrame.js';
import { ensureActivityClassified, entityNeedsAiThink } from '../world/activityRuntime.js';
import { ManeuverKind } from '../ai/contracts.js';

const OWNERSHIP_REFRESH_TICKS = 3;

/**
 * SG-06 simulation-system factory.
 *
 * Default SG-06 tactical AI system. Ports are lazy-bound on first update so registry init order can
 * install helpers.aiManeuver/helpers.aiSensors after this system's init. SG-03 is adapted directly
 * and remains the sole action executor. Missing ports throw before gameplay updates; no intent.fire
 * or velocity fallback exists.
 */
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
  const decisionIntervalTicks = runtimeDecisionInterval(runtimeConfig);

  function ensureStack(state) {
    if (stack) return stack;
    if (!ctxRef) throw new Error('tacticalAI used before init');
    const helpers = ctxRef.helpers || (ctxRef.helpers = {});
    const ports = {
      sensors: sensors || helpers.aiSensors,
      roster: roster || helpers.aiRoster,
      maneuver: maneuver || helpers.aiManeuver,
      encounter: encounter || helpers.aiEncounter || null,
      actions: actionPortFactory(ctxRef),
    };
    stack = new TacticalAIStack({
      seed: seed == null ? (state && state.meta && state.meta.seed) || 1 : seed,
      ports,
      config: runtimeConfig,
    });
    bindHullResolver(stack);
    inspection = new AIInspectionEndpoint(stack);
    return stack;
  }

  const hullHint = { hullId: null, flightClass: null };
  function bindHullResolver(liveStack) {
    if (!liveStack || !liveStack.maneuver) return;
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
    resetFirstSessionAttackerOwnership(ctxRef && ctxRef.state);
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
      ctxRef = ctx;
      const helpers = ctx.helpers || (ctx.helpers = {});
      helpers.inspectAI = (request = {}) => handleInspection({ method: 'ai.inspect', params: request });
      helpers.traceAI = (request = {}) => handleInspection({ method: 'ai.trace', params: request });
      helpers.inspectAIContract = () => handleInspection({ method: 'ai.contract' });
      if (ctx.bus && typeof ctx.bus.on === 'function') {
        ctx.bus.on('game:started', resetRuntime);
        ctx.bus.on('save:loaded', resetRuntime);
      }
    },

    update(_dt, state) {
      ensureActivityClassified(state);
      const liveStack = ensureStack(state);
      const tick = Number.isInteger(state && state.tick) ? state.tick : liveStack.lastTick + 1;
      const dt = Number.isFinite(_dt) && _dt > 0 ? _dt : 1 / 60;
      stepSquadFrames(liveStack, state, tick, dt);
      if (tick - lastDecisionTick < decisionIntervalTicks) {
        maintainFirstSessionAttackerOwnership(state);
        if (lastManeuverRequests.length) replayLastManeuvers(liveStack, tick, state);
        driveChoreographyMembers(liveStack, state, tick, null);
        revalidateCachedAIFiringIntents(liveStack, state);
        applySquadTokenFireGate(liveStack, state);
        return;
      }
      const authored = typeof authoredEncounter === 'function'
        ? authoredEncounter(tick, state, ctxRef)
        : (authoredEncounter || {});
      const result = liveStack.update(tick, authored);
      if (tick - lastOwnershipRefreshTick >= OWNERSHIP_REFRESH_TICKS) {
        refreshFirstSessionAttackerOwnership(state, result.decisions || []);
        lastOwnershipRefreshTick = tick;
      } else {
        maintainFirstSessionAttackerOwnership(state);
      }
      lastDecisionTick = tick;
      lastManeuverRequests.length = 0;
      for (const decision of result.decisions || []) {
        if (decision && decision.maneuver) lastManeuverRequests.push(decision.maneuver);
        const doctrine = decision && decision.combatDoctrine;
        if (doctrine && doctrine.telegraphStarted && ctxRef.bus && typeof ctxRef.bus.emit === 'function') {
          ctxRef.bus.emit('ai:telegraph', {
            entityId: decision.entityId,
            targetId: doctrine.targetId,
            doctrineId: doctrine.doctrineId,
            phase: doctrine.phase,
            kind: doctrine.telegraph.kind,
            durationTicks: doctrine.telegraph.durationTicks,
            tick,
          });
        }
        if (doctrine && doctrine.phaseChanged && ctxRef.bus && typeof ctxRef.bus.emit === 'function') {
          ctxRef.bus.emit('ai:doctrinePhase', {
            entityId: decision.entityId,
            targetId: doctrine.targetId,
            doctrineId: doctrine.doctrineId,
            flightProfile: doctrine.flightProfile,
            phase: doctrine.phase,
            fireWindow: doctrine.fireWindow,
            maneuverKind: doctrine.maneuverKind,
            tick,
          });
        }
        applyChoreographyFireWindow(liveStack, decision);
        applyAIFiringIntent(decision, state);
      }
      driveChoreographyMembers(liveStack, state, tick, result.decisions || []);
      applySquadTokenFireGate(liveStack, state);
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
export function revalidateCachedAIFiringIntents(liveStack, state) {
  const decisions = liveStack && liveStack.lastResult && liveStack.lastResult.decisions;
  if (!Array.isArray(decisions)) return 0;
  for (const decision of decisions) {
    const id = decision && decision.entityId;
    const entity = state && state.entities && id != null && typeof state.entities.get === 'function'
      ? state.entities.get(id)
      : null;
    if (entity && entityNeedsAiThink(entity, state) === false) continue;
    applyAIFiringIntent(decision, state);
  }
  return decisions.length;
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

function stepSquadFrames(liveStack, state, tick, dt) {
  const director = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
  if (!director || typeof director.stepAll !== 'function') return;
  const squads = gatherRecipeSquads(state);
  if (!squads.length) return;
  const entities = state && state.entities;
  director.stepAll(tick, dt, squads, (id) => (
    entities && typeof entities.get === 'function' ? entities.get(id) : null
  ));
}

function gatherRecipeSquads(state) {
  const list = state && state.entityList;
  if (!list || !list.length) return [];
  const byId = new Map();
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    const recipeId = recipeIdFromEntity(entity);
    if (!recipeId) continue;
    const ai = entity.data && entity.data.ai;
    const squadId = String(ai.squadId || ai.wingId || recipeId);
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
  return [...byId.values()];
}

function driveChoreographyMembers(liveStack, state, tick, decisions) {
  const director = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
  if (!director || director.activeSquadCount() === 0) return;
  const planned = new Set();
  if (Array.isArray(decisions)) {
    for (const decision of decisions) {
      if (decision && decision.entityId != null) planned.add(decision.entityId);
    }
  }
  const maneuverPort = liveStack.ports && liveStack.ports.maneuver;
  const list = state && state.entityList;
  if (!list) return;
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
    doctrine.fireWindow = !!plan.fireAuthorized;
    return;
  }
  decision.combatDoctrine = { ...doctrine, fireWindow: !!plan.fireAuthorized };
}

function applySquadTokenFireGate(liveStack, state) {
  const director = liveStack && liveStack.maneuver && liveStack.maneuver.squadFrames;
  if (!director || director.activeSquadCount() === 0) return;
  const list = state && state.entityList;
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!recipeIdFromEntity(entity)) continue;
    const plan = director.planFor(entity.id);
    const intent = entity.data && entity.data.intent;
    if (!intent) continue;
    stampChoreography(entity, plan, director);
    if (plan && plan.fireAuthorized === false && intent.fire) {
      intent.fire = false;
      intent.fireBlockReason = 'squad_token';
    }
  }
}
