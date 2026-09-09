import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
  makeShipEntitySpec,
  ships,
} from '../src/systems/ships.js';
import { weapons as weaponSystem } from '../src/systems/weapons.js';

const BASE_RADAR_RANGE = 4000;
const RANGER = 'ship_ranger';
const SURVEY = 'mod_survey_suite';
const DEEPSURVEY = 'unique_deepsurvey_suite';
const SENSOR = 'mod_sensor_array_l';

function rangerFittings(moduleIds = []) {
  return fittingsFromDefaultModules(RANGER, moduleIds);
}

function radarShape(derived) {
  return {
    radarRangePct: derived.radarRangePct,
    radarRangeMult: derived.radarRangeMult,
    radarRange: derived.radarRange,
  };
}

function makeShipRuntime() {
  const state = createGameState(501);
  state.mode = 'flight';
  const rangerFit = rangerFittings([SURVEY]);
  state.player.ownedShips = [
    { defId: RANGER, fittings: rangerFit },
    { defId: 'ship_kestrel', fittings: fittingsFromDefaultModules('ship_kestrel') },
  ];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [{ instanceId: 'inventory_sensor', defId: SENSOR }];
  const player = makeEntity(makeShipEntitySpec(RANGER, {
    isPlayer: true,
    player: state.player,
    fittings: rangerFit,
  }));
  player.id = 1;
  state.playerId = player.id;
  state.entities = new Map([[player.id, player]]);
  const runtime = Object.create(ships);
  runtime.init({
    state,
    bus: createBus(),
    helpers: { getEntity: (id) => state.entities.get(id) || null },
  });
  return { state, player, runtime, rangerFit };
}

function fireCountAt(distance) {
  const state = createGameState(502);
  state.mode = 'flight';
  state.ui.radarRange = getDerivedStats(RANGER, rangerFittings([SENSOR])).radarRange;
  const player = makeEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    fittings: fittingsFromDefaultModules('ship_kestrel', ['wpn_pulse_laser_s']),
  }));
  const npc = makeEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: false,
    fittings: fittingsFromDefaultModules('ship_kestrel', ['wpn_pulse_laser_s']),
  }));
  player.id = 1;
  npc.id = 2;
  player.pos.set(0, 0, 0);
  npc.pos.set(distance, 0, 0);
  npc.data.combat.targetId = player.id;
  state.playerId = player.id;
  state.entities = new Map([[player.id, player], [npc.id, npc]]);
  const spawned = [];
  const runtime = Object.create(weaponSystem);
  runtime.init({
    state,
    bus: createBus(),
    helpers: {
      getEntity: (id) => state.entities.get(id) || null,
      spawnEntity: (spec) => { spawned.push(spec); return spec; },
      hash32: () => 1,
      mulberry32: () => () => 0.5,
    },
  });
  runtime._serviceShip(npc, true, false, 1 / 60, state, Math.PI, player);
  return { radarRange: state.ui.radarRange, spawned };
}

test('radar fittings derive a safe strongest compatible range without stacking', () => {
  const bare = getDerivedStats(RANGER, rangerFittings());
  const survey = getDerivedStats(RANGER, rangerFittings([SURVEY]));
  const deepsurvey = getDerivedStats(RANGER, rangerFittings([DEEPSURVEY]));
  const sensor = getDerivedStats(RANGER, rangerFittings([SENSOR]));
  const combined = getDerivedStats(RANGER, rangerFittings([SURVEY, DEEPSURVEY, SENSOR, SENSOR]));
  const incompatible = getDerivedStats('ship_kestrel', [SENSOR]);

  assert.deepEqual(radarShape(bare), { radarRangePct: 0, radarRangeMult: 1, radarRange: BASE_RADAR_RANGE });
  assert.deepEqual(radarShape(survey), { radarRangePct: 0.35, radarRangeMult: 1.35, radarRange: 5400 });
  assert.deepEqual(radarShape(deepsurvey), { radarRangePct: 0.35, radarRangeMult: 1.35, radarRange: 5400 });
  assert.deepEqual(radarShape(sensor), { radarRangePct: 0.60, radarRangeMult: 1.60, radarRange: 6400 });
  assert.deepEqual(
    radarShape(combined),
    { radarRangePct: 0.60, radarRangeMult: 1.60, radarRange: 6400 },
    'radar coverage is a max-wins capability, including duplicate compatible arrays',
  );
  assert.deepEqual(
    radarShape(incompatible),
    { radarRangePct: 0, radarRangeMult: 1, radarRange: BASE_RADAR_RANGE },
    'a manual module in an incompatible slot remains inert',
  );
});

test('radar modifiers fail closed and preserve a prior usable maximum on overflow', () => {
  const sensor = MODULES.find((module) => module.id === SENSOR);
  assert.ok(sensor, 'Sensor Array L exists in the module catalog');
  const originalMods = { ...sensor.mods };
  const catalogBefore = JSON.stringify(MODULES.filter((module) => (
    module.id === SURVEY || module.id === DEEPSURVEY || module.id === SENSOR
  )));
  try {
    for (const value of [Infinity, -0.60, 0, '0.60', NaN]) {
      sensor.mods.radarRangePct = value;
      assert.deepEqual(
        radarShape(getDerivedStats(RANGER, rangerFittings([SENSOR]))),
        { radarRangePct: 0, radarRangeMult: 1, radarRange: BASE_RADAR_RANGE },
      );
    }

    sensor.mods.radarRangePct = Number.MAX_VALUE;
    assert.deepEqual(
      radarShape(getDerivedStats(RANGER, rangerFittings([SURVEY, SENSOR]))),
      { radarRangePct: 0.35, radarRangeMult: 1.35, radarRange: 5400 },
      'a finite-but-overflowing maximum cannot erase a prior valid coverage bonus',
    );
  } finally {
    Object.assign(sensor.mods, originalMods);
  }
  assert.equal(
    JSON.stringify(MODULES.filter((module) => (
      module.id === SURVEY || module.id === DEEPSURVEY || module.id === SENSOR
    ))),
    catalogBefore,
    'derivation never mutates the module catalog',
  );
});

test('active player recompute applies radar range while inventory, unfit, hull switch, and NPC paths stay scoped', () => {
  const { state, player, runtime, rangerFit } = makeShipRuntime();
  const surveySlot = rangerFit.indexOf(SURVEY);
  assert.ok(surveySlot >= 0, 'Survey Suite occupies a compatible Ranger slot');

  state.ui.radarRange = 1;
  runtime.recomputeActiveShip();
  assert.equal(state.ui.radarRange, 5400, 'active-player recompute refreshes stale save/UI state');

  assert.equal(runtime.setActiveShip(1), true);
  assert.equal(state.ui.radarRange, BASE_RADAR_RANGE, 'bare hull switches reset the shared player radar');
  assert.equal(runtime.setActiveShip(0), true);
  assert.equal(state.ui.radarRange, 5400, 'returning to the fitted hull restores its range');

  assert.equal(runtime.unfitModule({ slotIndex: surveySlot }), true);
  assert.equal(state.ui.radarRange, BASE_RADAR_RANGE, 'unfitting the active suite resets the radar');
  assert.ok(
    state.player.moduleInventory.some((item) => item.defId === SENSOR)
      && state.player.moduleInventory.some((item) => item.defId === SURVEY),
    'inventory-only modules do not grant a radar effect',
  );

  const npcFit = rangerFittings([SENSOR]);
  const npc = makeEntity(makeShipEntitySpec(RANGER, { isPlayer: false, fittings: npcFit }));
  npc.id = 2;
  state.entities.set(npc.id, npc);
  state.ui.radarRange = 5199;
  const npcDerived = runtime.recomputeEntity(npc.id, npcFit);
  assert.equal(npcDerived.radarRange, 6400);
  assert.equal(state.ui.radarRange, 5199, 'NPC derivation cannot mutate shared player UI state');
  runtime.recomputeIfActive(1, npcFit);
  assert.equal(state.ui.radarRange, 5199, 'inactive owned-hull work cannot mutate shared player UI state');
  assert.equal(player.data.derived.radarRange, BASE_RADAR_RANGE, 'unfit active player remains bare');
});

test('upgraded player radar does not extend the hostile early-flight fire cutoff', () => {
  const distant = fireCountAt(5000);
  const close = fireCountAt(3900);

  assert.equal(distant.radarRange, 6400, 'the player radar is genuinely upgraded for the scenario');
  assert.equal(distant.spawned.length, 0, 'a hostile targeting the player remains gated outside 4000');
  assert.equal(close.spawned.length, 1, 'the same hostile may fire inside the fixed safety cutoff');
});
