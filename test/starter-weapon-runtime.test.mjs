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

function starterHarness(options = {}) {
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
  let npc = null;
  if (options.withNpc) {
    npc = helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
      isPlayer: false,
      pos: { x: 200, z: 0 },
      rot: Math.PI,
      fittings,
    }));
    npc.data.intent = { fire: true, aimAngle: Math.PI };
  }
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

  function tick(count = 1) {
    for (let i = 0; i < count; i++) {
      rebuildIndex(state);
      weaponSystem.update(DT, state);
      combatSystem.update(DT, state);
      state.tick += 1;
      state.simTime += DT;
    }
  }

  return { state, player, npc, fireTimes, vents, tick };
}

function deterministicStarterCycle() {
  const h = starterHarness();
  const mount = h.player.data.weapons[0];
  let maxHeat = 0;
  let minCap = h.player.cap;
  while (!h.vents.some((event) => event.phase === 'start') && h.state.simTime < 12) {
    h.tick();
    maxHeat = Math.max(maxHeat, mount._heat || 0);
    minCap = Math.min(minCap, h.player.cap);
  }
  const start = h.vents.find((event) => event.phase === 'start');
  const shotsAtVent = h.fireTimes.length;
  while (!h.vents.some((event) => event.phase === 'end') && h.state.simTime < 15) h.tick();
  const end = h.vents.find((event) => event.phase === 'end');
  const shotsAtEnd = h.fireTimes.length;
  const endTime = h.state.simTime;
  while (h.fireTimes.length === shotsAtEnd && h.state.simTime < endTime + 1) h.tick();
  return {
    shotsAtVent,
    shotsDuringVent: h.fireTimes.filter((time) => time > start.startedAt && time < end.endedAt).length,
    ventStart: Number((start?.startedAt ?? NaN).toFixed(6)),
    ventEnd: Number((end?.endedAt ?? NaN).toFixed(6)),
    resumedAfter: Number((h.fireTimes.at(-1) - (end?.endedAt ?? NaN)).toFixed(6)),
    maxHeat: Number(maxHeat.toFixed(6)),
    heatAfterVent: Number((mount._heat || 0).toFixed(6)),
    minCap: Number(minCap.toFixed(6)),
    startWeaponId: start?.weaponId ?? null,
  };
}

test('starter Pulse Laser S has a long deterministic burst and a clearly bounded vent/recovery cycle', () => {
  const a = deterministicStarterCycle();
  const b = deterministicStarterCycle();
  assert.deepEqual(b, a, 'starter thermal cycle is deterministic across identical runs');
  assert.ok(a.shotsAtVent >= 32, `starter must fire at least 32 shots before vent, got ${a.shotsAtVent}`);
  assert.ok(a.shotsAtVent <= 55, `starter must retain meaningful heat management, got ${a.shotsAtVent} shots`);
  assert.ok(a.ventStart >= 6 && a.ventStart <= 10,
    `starter vent should begin after a useful 6-10s burst, got ${a.ventStart}s`);
  assert.equal(a.shotsDuringVent, 0, 'vent lockout never leaks a projectile');
  assert.ok(a.ventEnd - a.ventStart >= 1.5 && a.ventEnd - a.ventStart <= 2,
    `vent duration must be readable and bounded, got ${a.ventEnd - a.ventStart}s`);
  assert.ok(a.resumedAfter >= 0 && a.resumedAfter <= 0.35,
    `held trigger must resume within one firing interval after vent, got ${a.resumedAfter}s`);
  assert.equal(a.maxHeat, 100, 'the final accepted shot visibly pegs heat before venting');
  assert.equal(a.startWeaponId, 'wpn_pulse_laser_s', 'vent receipt identifies the locking weapon');
  assert.ok(a.minCap >= 2, `starter capacitor must not starve before thermal vent, minimum ${a.minCap}`);
});

test('releasing the starter trigger produces predictable cooling and reliable refire', () => {
  const h = starterHarness();
  const mount = h.player.data.weapons[0];
  h.tick(60 * 3);
  const heatAtRelease = mount._heat || 0;
  const shotsAtRelease = h.fireTimes.length;
  h.state.input.fire = false;
  h.tick(60 * 2);
  const heatAfterCooling = mount._heat || 0;
  assert.ok(heatAtRelease >= 25 && heatAtRelease <= 60,
    `three-second burst should build readable partial heat, got ${heatAtRelease}`);
  assert.ok(heatAtRelease - heatAfterCooling >= 20,
    `two-second release should shed at least 20 heat, shed ${heatAtRelease - heatAfterCooling}`);
  assert.equal(h.fireTimes.length, shotsAtRelease, 'release never emits a stray shot');
  assert.deepEqual(h.vents, [], 'ordinary burst discipline avoids forced vent');

  h.state.input.fire = true;
  const refireStart = h.state.simTime;
  while (h.fireTimes.length === shotsAtRelease && h.state.simTime < refireStart + 1) h.tick();
  assert.ok(h.fireTimes.at(-1) - refireStart <= 0.35,
    `re-press should fire within one interval, got ${h.fireTimes.at(-1) - refireStart}s`);
});

test('live NPC starter pulse obeys the same thermal lockout without claiming player presentation', () => {
  const h = starterHarness({ withNpc: true });
  while (!h.vents.some((event) => event.phase === 'start') && h.state.simTime < 12) h.tick();
  assert.ok(h.npc.data.weaponVentUntil > h.state.simTime,
    'NPC pulse enters the same live thermal lockout as the player');
  assert.equal(h.vents.filter((event) => event.ownerId === h.npc.id).length, 0,
    'NPC thermal timer does not emit player HUD/audio vent receipts');
});
