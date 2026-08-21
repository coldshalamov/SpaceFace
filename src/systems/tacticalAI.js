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
import { ensureActivityClassified, entityNeedsAiThink } from '../world/activityRuntime.js';

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
    inspection = new AIInspectionEndpoint(stack);
    return stack;
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
    for (const request of lastManeuverRequests) {
      const id = request && request.entityId;
      const entity = entities && id != null && typeof entities.get === 'function'
        ? entities.get(id)
        : null;
      if (entity && entityNeedsAiThink(entity) === false) continue;
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
      if (tick - lastDecisionTick < decisionIntervalTicks) {
        maintainFirstSessionAttackerOwnership(state);
        if (lastManeuverRequests.length) replayLastManeuvers(liveStack, tick, state);
        revalidateCachedAIFiringIntents(liveStack, state);
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
        applyAIFiringIntent(decision, state);
      }
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
    if (entity && entityNeedsAiThink(entity) === false) continue;
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
