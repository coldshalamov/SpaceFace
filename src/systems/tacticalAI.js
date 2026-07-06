import { AIInspectionEndpoint } from '../ai/inspection.js';
import { createSG03ActionPort } from '../ai/sg03ActionPort.js';
import { TacticalAIStack } from '../ai/stack.js';
import { NORMALIZED_THRUSTER_REQUEST_FLAG, ObjectiveKind } from '../ai/contracts.js';

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
        applyFiringIntentFromDecision(decision, state);
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

/**
 * Bridge the SG-06 tactical decision into the weapons system's firing intent.
 *
 * The live tactical stack produces maneuver requests (physics force/torque) plus per-decision metadata
 * (squad-assigned objective + behavior target), but never writes `e.data.intent.fire`. Weapons (the
 * `weapons` system) gates NPC firing on that exact field (`weapons.js` reads `e.data.intent.fire` and
 * `e.data.intent.aimAngle`). Without this bridge, NPCs never fire and `action_burst` (the SG-03 hitscan
 * path) was the only thing landing damage — invisibly, with no projectile, no muzzle flash, no tracer.
 *
 * This runs on the AI's decision cadence (decisionIntervalTicks, default 3). Weapons' own cooldown / heat
 * / capacitor gates self-rate the actual fire frequency, so holding `fire=true` while attacking is correct
 * — no per-tick release is needed. When the objective is not an attack (or the target is gone), `fire` is
 * explicitly cleared so the previous tick's intent does not latch.
 *
 * Determinism: driven entirely by positions, velocities, and the squad's deterministic objective — no
 * Math.random. Combat outcomes will differ from the prior (no-NPC-fire) golden, so the sim golden is a
 * deliberate re-record batch, not an edit to force a pass.
 */
function applyFiringIntentFromDecision(decision, state) {
  if (!decision || !state || !state.entities || typeof state.entities.get !== 'function') return;
  const entityId = decision.entityId;
  if (entityId == null || entityId === state.playerId) return;
  const objective = decision.directive && decision.directive.objective;
  const targetId = objective && objective.targetId;
  const attack = objective && (objective.kind === ObjectiveKind.FOCUS || objective.kind === ObjectiveKind.ENGAGE);
  const e = state.entities.get(entityId);
  if (!e || e.type !== 'ship' || !e.alive) return;
  // Lazily init the intent block; preserve any non-firing fields other systems wrote.
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = {});
  if (!attack || targetId == null) {
    intent.fire = false;
    return;
  }
  const tgt = state.entities.get(targetId);
  if (!tgt || !tgt.alive) {
    intent.fire = false;
    return;
  }
  intent.fire = true;
  intent.aimAngle = leadAngleFor(e, tgt, data.weapons);
  // Keep combat.targetId in sync so turret/missile NPCs resolve a target (weapons.js _resolveTarget /
  // _tickLock read this). For NPCs targeting the player, the radar gate in weapons.js still silences
  // off-radar snipers — that is intended behavior.
  const combat = data.combat || (data.combat = {});
  combat.targetId = targetId;
}

/**
 * Iterative lead/intercept (2 passes), mirroring weapons.js `_leadAngle`. Falls back to aim-direct if
 * the projectile cannot catch the target's relative velocity. projSpeed is taken from the NPC's fastest
 * weapon so multi-weapon ships still get a sensible lead; defaults to 300 if the ship has no resolvable
 * weapon speed.
 */
function leadAngleFor(shooter, tgt, weapons) {
  const px = tgt.pos.x - shooter.pos.x;
  const pz = tgt.pos.z - shooter.pos.z;
  const rvx = (tgt.vel.x || 0) - (shooter.vel.x || 0);
  const rvz = (tgt.vel.z || 0) - (shooter.vel.z || 0);
  const projSpeed = bestProjSpeed(weapons);
  let t = 0;
  for (let i = 0; i < 2; i++) {
    const aimx = px + rvx * t;
    const aimz = pz + rvz * t;
    const dist = Math.hypot(aimx, aimz);
    t = dist / Math.max(1, projSpeed);
  }
  const aimx = px + rvx * t;
  const aimz = pz + rvz * t;
  return Math.atan2(aimz, aimx);
}

function bestProjSpeed(weapons) {
  if (!weapons || !weapons.length) return 300;
  let best = 0;
  for (const w of weapons) {
    const s = w && w.projSpeed;
    if (Number.isFinite(s) && s > best) best = s;
  }
  return best > 0 ? best : 300;
}
