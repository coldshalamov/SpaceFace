import assert from 'node:assert/strict';
import { test } from 'node:test';

// weapons.js intentionally enables the player-facing vent path only when window exists. Define it
// before the dynamic import so this headless test exercises the same weapon gate as Browser/Electron.
globalThis.window = {};

const [{ createBus }, { createGameState }, { NEW_GAME }, shipsModule, { combat }, { weapons }] = await Promise.all([
  import('../src/core/eventBus.js'),
  import('../src/core/gameState.js'),
  import('../src/data/newGameDefaults.js'),
  import('../src/systems/ships.js'),
  import('../src/systems/combat.js'),
  import('../src/systems/weapons.js'),
]);

const { fittingsFromDefaultModules, makeShipEntitySpec } = shipsModule;
const DT = 1 / 60;

function rebuildIndex(state) {
  state.entityList = [...state.entities.values()];
  state.entityIndex = {
    ships: state.entityList.filter((entity) => entity.type === 'ship'),
    weaponShips: state.entityList.filter((entity) => entity.type === 'ship' && entity.data?.weapons),
  };
}

function helpersFor(state) {
  return {
    getEntity: (id) => state.entities.get(id),
    spawnEntity: (spec) => {
      const entity = {
        id: state.nextEntityId++,
        alive: true,
        flags: {},
        collides: true,
        vel: { x: 0, z: 0 },
        ...spec,
      };
      entity.pos ||= { x: 0, z: 0 };
      entity.data ||= {};
      state.entities.set(entity.id, entity);
      rebuildIndex(state);
      return entity;
    },
    despawnEntity: (id) => {
      state.entities.delete(id);
      rebuildIndex(state);
    },
    mulberry32: () => () => 0.5,
    hash32: () => 1,
  };
}

test('starter Pulse Laser S fires continuously for eight seconds without heat, vent, or cap starvation', () => {
  const state = createGameState(47);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;
  const bus = createBus();
  const helpers = helpersFor(state);
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const player = helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings,
  }));
  state.playerId = player.id;
  state.input.fire = true;
  state.input.aimAngle = 0;

  const weaponSystem = { ...weapons };
  const combatSystem = { ...combat };
  weaponSystem.init({ state, bus, helpers });
  combatSystem.init({ state, bus, helpers });

  const fireTimes = [];
  const vents = [];
  bus.on('combat:fire', (payload) => {
    if (payload?.ownerId === player.id && payload.weaponId === 'wpn_pulse_laser_s') {
      fireTimes.push(state.simTime);
    }
  });
  bus.on('weapons:vent', (payload) => vents.push(payload));

  let minCap = player.cap;
  let maxHeat = 0;
  for (let tick = 0; tick < 8 / DT; tick++) {
    rebuildIndex(state);
    weaponSystem.update(DT, state);
    combatSystem.update(DT, state);
    minCap = Math.min(minCap, player.cap);
    maxHeat = Math.max(maxHeat, player.data.weapons[0]._heat || 0);
    state.tick += 1;
    state.simTime += DT;
  }

  const gaps = fireTimes.slice(1).map((time, index) => time - fireTimes[index]);
  assert.ok(fireTimes.length >= 32, `expected at least 32 shots in 8s, got ${fireTimes.length}`);
  assert.ok(Math.max(...gaps) <= 0.35, `starter firing gap must stay <=350ms, got ${Math.max(...gaps)}s`);
  assert.equal(maxHeat, 0, 'starter pulse is a forgiving no-heat weapon');
  assert.deepEqual(vents, [], 'starter pulse never enters forced vent');
  assert.ok(minCap >= 2, `starter capacitor must not starve the gun, minimum was ${minCap}`);
});
