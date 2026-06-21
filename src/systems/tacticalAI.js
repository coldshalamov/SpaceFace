import { AIInspectionEndpoint } from '../ai/inspection.js';
import { createSG03ActionPort } from '../ai/sg03ActionPort.js';
import { TacticalAIStack } from '../ai/stack.js';

/**
 * SG-06 simulation-system factory.
 *
 * Register this in the legacy AI slot only after SG-02 installs helpers.aiManeuver and the sensor/
 * roster owners install helpers.aiSensors/helpers.aiRoster. SG-03 is adapted directly and remains
 * the sole action executor. Missing ports throw during init; no intent.fire or velocity fallback exists.
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
  let stack = null;
  let inspection = null;
  let ctxRef = null;

  return {
    name: 'tacticalAI',

    init(ctx) {
      ctxRef = ctx;
      const helpers = ctx.helpers || (ctx.helpers = {});
      const ports = {
        sensors: sensors || helpers.aiSensors,
        roster: roster || helpers.aiRoster,
        maneuver: maneuver || helpers.aiManeuver,
        encounter: encounter || helpers.aiEncounter || null,
        actions: actionPortFactory(ctx),
      };
      stack = new TacticalAIStack({
        seed: seed == null ? (ctx.state.meta && ctx.state.meta.seed) || 1 : seed,
        ports,
        config,
      });
      inspection = new AIInspectionEndpoint(stack);
      helpers.inspectAI = (request = {}) => inspection.handle({ method: 'ai.inspect', params: request });
      helpers.traceAI = (request = {}) => inspection.handle({ method: 'ai.trace', params: request });
      helpers.inspectAIContract = () => inspection.handle({ method: 'ai.contract' });
    },

    update(_dt, state) {
      if (!stack) throw new Error('tacticalAI.update called before init');
      const tick = Number.isInteger(state && state.tick) ? state.tick : stack.lastTick + 1;
      const authored = typeof authoredEncounter === 'function'
        ? authoredEncounter(tick, state, ctxRef)
        : (authoredEncounter || {});
      stack.update(tick, authored);
    },

    inspect(query = {}) {
      if (!stack) return null;
      return stack.inspect(query);
    },

    handleAgentRequest(request = {}) {
      if (!inspection) return Object.freeze({ version: 1, ok: false, error: { code: 'AI_NOT_INITIALIZED' } });
      return inspection.handle(request);
    },

    get stack() { return stack; },
  };
}
