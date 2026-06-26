import { AIInspectionEndpoint } from '../ai/inspection.js';
import { createSG03ActionPort } from '../ai/sg03ActionPort.js';
import { TacticalAIStack } from '../ai/stack.js';
import { NORMALIZED_THRUSTER_REQUEST_FLAG } from '../ai/contracts.js';

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
  const defaultRuntime = ('memberBatchSize' in runtime || 'memberBatchTargetTicks' in runtime)
    ? {}
    : { memberBatchSize: 3 };
  const runtimeConfig = {
    ...config,
    runtime: { ...defaultRuntime, ...runtime },
    trace: config.trace === undefined ? defaultTraceConfig() : config.trace,
    freezeResults: config.freezeResults === undefined ? false : config.freezeResults,
  };
  let stack = null;
  let inspection = null;
  let ctxRef = null;
  let lastDecisionTick = -Infinity;
  let lastManeuverRequests = [];
  const decisionIntervalTicks = runtimeDecisionInterval(config);

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
    lastManeuverRequests = [];
  }

  function replayLastManeuvers(liveStack, tick) {
    const maneuverPort = liveStack && liveStack.ports && liveStack.ports.maneuver;
    if (!maneuverPort || typeof maneuverPort.request !== 'function') return;
    for (const request of lastManeuverRequests) {
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
      const liveStack = ensureStack(state);
      const tick = Number.isInteger(state && state.tick) ? state.tick : liveStack.lastTick + 1;
      if (tick - lastDecisionTick < decisionIntervalTicks && lastManeuverRequests.length) {
        replayLastManeuvers(liveStack, tick);
        return;
      }
      const authored = typeof authoredEncounter === 'function'
        ? authoredEncounter(tick, state, ctxRef)
        : (authoredEncounter || {});
      const result = liveStack.update(tick, authored);
      lastDecisionTick = tick;
      lastManeuverRequests.length = 0;
      for (const decision of result.decisions || []) {
        if (decision && decision.maneuver) lastManeuverRequests.push(decision.maneuver);
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
  };
}

function runtimeDecisionInterval(config = {}) {
  const runtime = config.runtime && typeof config.runtime === 'object' ? config.runtime : {};
  const value = runtime.decisionIntervalTicks ?? config.decisionIntervalTicks ?? 3;
  if (!Number.isFinite(value)) return 3;
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
