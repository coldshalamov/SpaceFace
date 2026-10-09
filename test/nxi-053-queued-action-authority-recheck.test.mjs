import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeActivity, ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { createSG03ActionPort } from '../src/ai/sg03ActionPort.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { aiPorts } from '../src/systems/aiPorts.js';

// NXI-053: advisory SG-03 authorization happens when the request is queued. A compliance change
// landing before the queue commits must stop the shot — the kernel re-runs engagement authority
// on live state at the final execution gate.

const STRIKE_REASON = 'combat_doctrine:interceptor_flyby:strike';

function makeState({ helios = false } = {}) {
  // Outside the Helios starter-protection radius the baseline is clean; inside it the lawful
  // station's jurisdiction shields the target.
  const playerX = helios ? 1410 : 1400;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: playerX, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100, cap: 100, capMax: 100,
    data: { ai: {}, intent: {} },
  };
  const enemy = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: playerX - 160, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100, cap: 100, capMax: 100,
    data: {
      ai: {
        passive: false,
        hostileTeams: [0],
        motive: 'cargo_extortion',
        engagementTrigger: 'explicit_refusal',
        zoneId: 'zone_ceres_ambush',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 1,
        combatDoctrineId: 'interceptor_flyby',
        activity: normalizeActivity({
          kind: ActivityKind.ATTACK_RUN,
          reason: 'pirate_toll:refused',
          anchor: { x: 1200, z: 0 },
          leashRadius: 2200,
          startedTick: 100,
        }),
        roe: RulesOfEngagement.WEAPONS_FREE,
      },
      intent: {},
    },
  };
  const entities = new Map([[1, player], [2, enemy]]);
  if (helios) {
    entities.set(3, {
      id: 3, type: 'station', alive: true, factionId: 'faction_scn',
      pos: { x: 0, z: 0 }, radius: 42,
      data: { stationId: 'station_helios', dockRadius: 72 },
    });
  }
  return {
    tick: 160,
    playerId: 1,
    player: { heat: 0 },
    world: { currentSectorId: helios ? 'sector_helios_prime' : 'sector_ceres_belt' },
    entities,
    entityList: [...entities.values()],
  };
}

function makeStack(state) {
  const ctx = { state, bus: null, helpers: {} };
  aiPorts.init(ctx);
  const kernel = getCombatKernel(ctx);
  const port = createSG03ActionPort(ctx);
  return { ctx, kernel, port };
}

function advance(kernel, state, ticks) {
  for (let i = 0; i < ticks; i++) { kernel.prePhysics(1 / 60); state.tick++; }
}

function traceKinds(state, requestId) {
  return state.combat.trace.events.filter((e) => e.requestId === requestId).map((e) => e.kind);
}

function rejectionReason(state, requestId) {
  const event = state.combat.trace.events.find((e) => e.requestId === requestId && e.kind === 'action.rejected');
  return event && event.reason;
}

function queueDeferredBurst(port, state) {
  const requestId = port.start(2, 'action_burst', {
    targetId: 1, tick: state.tick + 10, objective: 'focus', objectiveReason: STRIKE_REASON,
  });
  assert.ok(requestId, 'advisory authorization should queue the deferred burst');
  return requestId;
}

test('queued burst is refused when hold-fire lands between decision and commit', () => {
  const state = makeState();
  const { kernel, port } = makeStack(state);
  const requestId = queueDeferredBurst(port, state);
  advance(kernel, state, 5);
  state.entities.get(2).data.ai.roe = RulesOfEngagement.HOLD_FIRE;
  advance(kernel, state, 6); // crosses the deferred commit tick
  const kinds = traceKinds(state, requestId);
  assert.ok(!kinds.includes('action.started'), 'stale authority must not commit a shot');
  assert.equal(rejectionReason(state, requestId), 'engagement:hold_fire',
    'the queue must reject the request, not silently drop it');
});

test('a legitimate neighboring queued shot still commits', () => {
  const state = makeState();
  const { kernel, port } = makeStack(state);
  const requestId = queueDeferredBurst(port, state);
  advance(kernel, state, 12);
  assert.ok(traceKinds(state, requestId).includes('action.started'),
    'unchanged compliance keeps the shot valid');
});

test('jurisdiction check re-evaluates at commit when the target enters protection', () => {
  const state = makeState({ helios: true });
  const { kernel, port } = makeStack(state);
  const requestId = queueDeferredBurst(port, state);
  advance(kernel, state, 5);
  state.entities.get(1).pos.x = 900; // drifts inside Helios starter protection
  advance(kernel, state, 6);
  const kinds = traceKinds(state, requestId);
  assert.ok(!kinds.includes('action.started'));
  assert.equal(rejectionReason(state, requestId), 'engagement:station_protection');
});

test('response window still gates a raw queued request committed too early', () => {
  const state = makeState();
  state.tick = 120; // before the armed tick (startedTick 100 + 1 s window = 160)
  const { kernel } = makeStack(state);
  const result = kernel.actions.requestAction({
    actorId: 2,
    actionId: 'action_burst',
    source: { kind: 'ai', controllerId: 'sg06' },
    targetId: 1,
    notBeforeTick: 150,
    metadata: { objectiveReason: STRIKE_REASON },
  });
  assert.ok(result.ok);
  advance(kernel, state, 31); // commit attempt at tick 150, window arms at 160
  const kinds = traceKinds(state, result.requestId);
  assert.ok(!kinds.includes('action.started'), 'commit before the armed window must stay denied');
  assert.equal(rejectionReason(state, result.requestId), 'engagement:response_window');
});
