import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { defaultLivingHull, livingHullWithScar } from '../src/core/livingHull.js';
import { cargo } from '../src/systems/cargo.js';
import { leftoverMechanicLine } from '../src/story/mechanicVoice.js';
import { buildDockArrival } from '../src/ui/dockArrival.js';

const SEED = 4242;
const STATION_ID = 'station_helios';
const FOOD = 'cmdty_food';
const SPILL_SENTENCE = 'Provisions spilled on the way in, 2 units.';
const SCAR_SENTENCE = 'Heavy scar on the bow. Do not call it weather.';

function makeHarness(vel) {
  const state = createGameState(SEED);
  const bus = createBus();
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, collides: true,
    pos: { x: 100, z: 50 }, vel: { x: vel.x, z: vel.z }, rot: 0,
    radius: 8, combatSpeed: 100, hull: 100, hullMax: 100,
    factionId: 'player', flags: {}, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const system = Object.create(cargo);
  system.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const entity = {
          ...spec,
          id: state.nextEntityId++,
          alive: true,
          pos: { ...(spec.pos || { x: 0, z: 0 }) },
          vel: { ...(spec.vel || { x: 0, z: 0 }) },
          data: spec.data ? { ...spec.data } : {},
          flags: spec.flags ? { ...spec.flags } : {},
        };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
      removeEntity(id) {
        const entity = state.entities.get(id);
        if (entity) entity.alive = false;
        state.entities.delete(id);
      },
    },
  });
  system.addCargo(FOOD, 4);
  return { state, bus, system, player };
}

function plantHeavyBow(state) {
  state.player.activeShipIndex = 0;
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: [],
    livingHull: livingHullWithScar(defaultLivingHull(0), {
      cause: 'weapon',
      surface: 'weapon',
      band: 'heavy',
      facing: 'bow',
      atT: 12,
      tick: 12,
      id: 'weapon:12:bow',
    }, 12),
  }];
}

function dockLine(state) {
  const view = buildDockArrival(state, { id: STATION_ID, name: 'Helios Station' });
  return view.mechanicLine || '';
}

test('seed 4242 names the commodity spilled on a hot dock', () => {
  const harness = makeHarness({ x: 25, z: 0 });
  try {
    plantHeavyBow(harness.state);
    assert.equal(leftoverMechanicLine(harness.state), SCAR_SENTENCE);

    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.deepEqual(harness.state.player.cargo.dockSpill, { commodityId: FOOD, count: 2 });
    const line = dockLine(harness.state);
    assert.equal(line.includes(SPILL_SENTENCE), true, line);
    assert.equal(line.indexOf(SPILL_SENTENCE), line.lastIndexOf(SPILL_SENTENCE));
    assert.equal(line.includes(SCAR_SENTENCE), true, line);
    assert.match(line, /Provisions/);

    harness.state.tick = 1;
    harness.player.vel.x = 10;
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    const quiet = dockLine(harness.state);
    assert.equal(harness.state.player.cargo.dockSpill, undefined);
    assert.equal(quiet.includes('spilled on the way in'), false, quiet);
    assert.equal(quiet.includes(SCAR_SENTENCE), true, quiet);

    harness.state.tick = 2;
    harness.player.vel.x = 25;
    harness.system.addCargo(FOOD, 2);
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    const again = dockLine(harness.state);
    assert.equal(again.includes(SPILL_SENTENCE), true, again);
    assert.equal(again.indexOf(SPILL_SENTENCE), again.lastIndexOf(SPILL_SENTENCE));
  } finally {
    harness.system.destroy();
  }
});

test('a dock with no spill does not invent a spilled commodity', () => {
  const harness = makeHarness({ x: 20, z: 0 });
  try {
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.state.player.cargo.dockSpill, undefined);
    const line = dockLine(harness.state);
    assert.equal(line.includes('Provisions'), false, line);
    assert.equal(line.includes('spilled on the way in'), false, line);
  } finally {
    harness.system.destroy();
  }
});
