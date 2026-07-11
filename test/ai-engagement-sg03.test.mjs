import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeActivity, ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { createSG03ActionPort } from '../src/ai/sg03ActionPort.js';

function makeState(overrides = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: overrides.protected ? 900 : 1400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100, cap: 100, capMax: 100,
    data: { ai: {}, intent: {} },
  };
  const enemy = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 1200, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100, cap: 100, capMax: 100,
    data: {
      ai: {
        passive: false,
        hostileTeams: [0],
        motive: overrides.anonymous ? null : 'cargo_extortion',
        engagementTrigger: 'explicit_refusal',
        zoneId: 'zone_ceres_ambush',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 0.5,
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
  const station = {
    id: 3, type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 0, z: 0 }, radius: 42,
    data: { stationId: 'station_helios', dockRadius: 72 },
  };
  const entities = new Map([[1, player], [2, enemy], [3, station]]);
  return {
    tick: 130,
    playerId: 1,
    player: { heat: 0 },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [...entities.values()],
  };
}

function request(port, state) {
  return port.canStart(2, 'action_burst', {
    targetId: 1,
    tick: state.tick,
    objective: 'focus',
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  });
}

test('production SG-03 rejects anonymous damage action', () => {
  const state = makeState({ anonymous: true });
  const port = createSG03ActionPort({ state, bus: null, helpers: {} });
  assert.deepEqual(request(port, state), { ok: false, reason: 'engagement:motive' });
});

test('production SG-03 rejects criminal damage action inside Helios protection', () => {
  const state = makeState({ protected: true });
  const port = createSG03ActionPort({ state, bus: null, helpers: {} });
  assert.deepEqual(request(port, state), { ok: false, reason: 'engagement:station_protection' });
});
