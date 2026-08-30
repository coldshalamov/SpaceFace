import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_LAB_SETUP_SCHEMA,
  validateCombatLabSetup,
  normalizeCombatLabSetup,
  combatLabSetupDigestInput,
} from '../src/contracts/combatLabSetupSchema.js';
import {
  COMBAT_LAB_STARTER_PACKAGES,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_ARENAS,
} from '../src/data/combatLabSetups.js';
import {
  buildSandboxLaunchConfig,
  applySandboxSetup,
  installSandboxGameStartedHook,
  requestSandboxGame,
  spawnBudgetedLabPackage,
} from '../src/ui/sandbox/sandboxSetup.js';

function toolkitSetup(overrides = {}) {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((pkg) => pkg.id === 'physics_toolkit');
  return {
    schema: COMBAT_LAB_SETUP_SCHEMA,
    hullId: starter.hullId,
    loadout: starter.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })),
    enemyPackageId: COMBAT_LAB_ENEMY_PACKAGES.find((pkg) => pkg.id === 'wasp_flight').id,
    arenaId: COMBAT_LAB_ARENAS[0].id,
    seed: 1864401122,
    wave: 2,
    ...overrides,
  };
}

function makeLabSpawnCtx({ cap = 24, rng = () => 0.87, bindResult = true } = {}) {
  const requests = [];
  const binds = [];
  const spawnCalls = [];
  const releases = [];
  let nextId = 1;
  const reservations = new Map();
  let used = 0;

  function ownerKey(owner) {
    return owner == null ? '_anon' : String(owner);
  }

  const budget = {
    request(n, owner) {
      requests.push({ n, owner });
      const grant = Math.max(0, Math.min(n, cap - used));
      if (grant <= 0) return 0;
      const key = ownerKey(owner);
      let rec = reservations.get(key);
      if (!rec) {
        rec = { count: 0, ids: new Set() };
        reservations.set(key, rec);
      }
      rec.count += grant;
      used += grant;
      return grant;
    },
    bindEntity(id, owner) {
      binds.push({ id, owner });
      const allowed = typeof bindResult === 'function' ? !!bindResult(id, owner) : !!bindResult;
      if (!allowed) return false;
      const key = ownerKey(owner);
      const rec = reservations.get(key);
      if (!rec || rec.ids.size >= rec.count) return false;
      rec.ids.add(String(id));
      return true;
    },
    releaseSome(owner, n) {
      const key = ownerKey(owner);
      const rec = reservations.get(key);
      if (!rec) {
        releases.push({ owner, n, freed: 0 });
        return 0;
      }
      const want = Math.floor(Number(n));
      const freed = Number.isFinite(want) ? Math.max(0, Math.min(want, rec.count)) : 0;
      const unbound = Math.max(0, rec.count - rec.ids.size);
      const boundToDetach = Math.max(0, freed - unbound);
      if (boundToDetach > 0) {
        let detached = 0;
        for (const entityKey of rec.ids) {
          rec.ids.delete(entityKey);
          if (++detached >= boundToDetach) break;
        }
      }
      rec.count -= freed;
      used = Math.max(0, used - freed);
      if (rec.count <= 0) reservations.delete(key);
      releases.push({ owner, n, freed });
      return freed;
    },
    current() {
      return used;
    },
    outstanding(owner) {
      const rec = reservations.get(ownerKey(owner));
      return rec ? rec.count : 0;
    },
    unbound(owner) {
      const rec = reservations.get(ownerKey(owner));
      return rec ? Math.max(0, rec.count - rec.ids.size) : 0;
    },
  };
  const helpers = {
    spawnEntity(spec) {
      spawnCalls.push(spec);
      const id = nextId++;
      return id;
    },
  };
  const ctx = {
    state: {
      playerId: 'player',
      entities: new Map([['player', { id: 'player', pos: { x: 10, z: -20 } }]]),
      rng,
    },
    registry: {
      get(name) {
        return name === 'spawnBudget' ? budget : null;
      },
    },
    helpers,
  };
  return { ctx, requests, binds, spawnCalls, releases, budget };
}

function waspPackageSpec(seed) {
  const pkg = COMBAT_LAB_ENEMY_PACKAGES.find((entry) => entry.id === 'wasp_flight');
  return {
    id: pkg.id,
    entries: pkg.entries.map((entry) => ({ ...entry })),
    maxConcurrent: pkg.maxConcurrent,
    spawnDistance: pkg.spawnDistance,
    seed,
  };
}

test('same build and seed normalize to equal values and digest inputs', () => {
  const build = toolkitSetup();
  const a = normalizeCombatLabSetup(build);
  const b = normalizeCombatLabSetup({ ...build });
  assert.deepEqual(a, b);
  assert.deepEqual(combatLabSetupDigestInput(build), combatLabSetupDigestInput({ ...build }));
});

test('buildSandboxLaunchConfig and requestSandboxGame forward the same seed twice', () => {
  const setup = toolkitSetup();
  const first = buildSandboxLaunchConfig({ scenarioId: 'combat-lab' }, { combatLabSetup: setup });
  const second = buildSandboxLaunchConfig({ scenarioId: 'combat-lab' }, { combatLabSetup: setup });
  assert.deepEqual(first, second);
  assert.deepEqual(first.combatLabSetup, normalizeCombatLabSetup(setup));
  assert.equal(first.seed, setup.seed);
  assert.equal(first.shipId, setup.hullId);
  assert.equal(first.sectorId, COMBAT_LAB_ARENAS[0].sectorId);
  assert.deepEqual(first.spawnPos, COMBAT_LAB_ARENAS[0].spawnPos);

  const payloads = [];
  const bus = { emit(type, payload) { payloads.push({ type, payload }); } };
  requestSandboxGame(bus, first);
  requestSandboxGame(bus, second);
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0].payload, { seed: setup.seed });
  assert.deepEqual(payloads[1].payload, { seed: setup.seed });
  assert.deepEqual(payloads[0].payload, payloads[1].payload);
});

test('Lagrange Combat Lab launch config targets its authored arena center', () => {
  const arena = COMBAT_LAB_ARENAS.find((entry) => entry.id === 'lagrange_crucible');
  assert.ok(arena, 'Lagrange Crucible must remain a Combat Lab arena');
  const config = buildSandboxLaunchConfig({ scenarioId: 'combat-lab' }, {
    combatLabSetup: toolkitSetup({ arenaId: arena.id }),
  });
  assert.equal(config.sectorId, 'sector_helios_prime');
  assert.deepEqual(config.spawnPos, { x: -500, z: 800 });
  assert.equal(config.combatLabSetup.arenaId, arena.id);
});

test('validated Combat Lab seed is present on the game:new payload', () => {
  const setup = toolkitSetup({ seed: 1 });
  const validated = validateCombatLabSetup(setup);
  assert.equal(validated.ok, true);
  assert.equal(validated.value.seed, 1);
  const config = buildSandboxLaunchConfig({ scenarioId: 'combat-lab' }, { combatLabSetup: validated.value });
  const payloads = [];
  const bus = { emit(type, payload) { payloads.push({ type, payload }); } };
  requestSandboxGame(bus, config);
  const gameNew = payloads.find((row) => row.type === 'game:new');
  assert.ok(gameNew, 'game:new was emitted');
  assert.equal(Object.hasOwn(gameNew.payload, 'seed'), true);
  assert.equal(gameNew.payload.seed, setup.seed);
});

test('Combat Lab unlocks through owners, begins its ephemeral run before arena entry, and fits the live toolkit', () => {
  const setup = toolkitSetup({ arenaId: 'lagrange_crucible', wave: 1 });
  const config = buildSandboxLaunchConfig({ scenarioId: 'combat-lab' }, { combatLabSetup: setup });
  const order = [];
  const expectedTech = new Map([
    ['wpn_concussion_cannon_m', 'tech_kinetic_drivers'],
    ['wpn_gravity_marker_s', 'tech_graviton_drives'],
    ['wpn_momentum_sink_s', 'tech_graviton_drives'],
  ]);
  const playerEntity = { id: 'player', pos: { x: 0, z: 0 } };
  const player = {
    credits: 5000,
    researchPoints: 0,
    activeShipIndex: 0,
    ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
    moduleInventory: [],
    researchedNodes: [],
  };
  let nextInstanceId = 1;
  let nextEntityId = 100;
  const bus = {
    emit(event, payload) {
      order.push(event);
      if (event === 'run:beginRequested') {
        state.run = { kind: payload.kind, seed: payload.seed, arenaId: payload.arenaId };
      }
    },
  };
  const ships = {
    buyShip({ defId }) {
      player.ownedShips = [{ defId, fittings: [] }];
      player.activeShipIndex = 0;
      return true;
    },
    researchable() { return true; },
    unlockTech(nodeId) {
      if (player.researchedNodes.includes(nodeId)) return false;
      order.push('ships.unlockTech');
      player.researchedNodes.push(nodeId);
      return true;
    },
    grantModule({ defId }) {
      player.moduleInventory.push({ instanceId: nextInstanceId++, defId });
      return true;
    },
    fitModule({ slotIndex, instanceId }) {
      const index = player.moduleInventory.findIndex((entry) => entry.instanceId === instanceId);
      if (index < 0) return false;
      const item = player.moduleInventory[index];
      if (!player.researchedNodes.includes(expectedTech.get(item.defId))) return false;
      player.moduleInventory.splice(index, 1);
      player.ownedShips[0].fittings[slotIndex] = item.defId;
      return true;
    },
  };
  const state = {
    playerId: 'player',
    player,
    entities: new Map([['player', playerEntity]]),
    render: { cameraCtrl: { snapToPlayer() {} } },
  };
  const ctx = {
    state,
    bus,
    registry: {
      get(name) {
        if (name === 'ships') return ships;
        if (name === 'economy') {
          return {
            grantCredits(amount) { player.credits += amount; },
          };
        }
        if (name === 'world') {
          return {
            enterSector() { order.push('world.enterSector'); },
            relocatePlayerInSector() { return true; },
          };
        }
        if (name === 'spawnBudget') {
          return {
            request(amount) { return amount; },
            bindEntity() { return true; },
            releaseSome() { return 0; },
          };
        }
        return null;
      },
    },
    helpers: { spawnEntity() { return nextEntityId++; } },
  };

  applySandboxSetup(ctx, config);

  assert.deepEqual(player.ownedShips[0].fittings.slice(0, 3), setup.loadout.map((entry) => entry.defId));
  const beginIndex = order.indexOf('run:beginRequested');
  assert.ok(beginIndex >= 0, 'Lab run began');
  assert.ok(order.indexOf('ships.unlockTech') < beginIndex, 'tech possibility was prepared before the Lab run began');
  assert.ok(beginIndex < order.indexOf('world.enterSector'), 'Lab run began before arena sector entry');
});

test('spawnBudgetedLabPackage admits through spawnBudget and reports rejected surplus', () => {
  const { ctx, requests, binds, spawnCalls } = makeLabSpawnCtx({ cap: 2 });
  const spec = {
    id: 'wasp_flight',
    entries: [{ enemyId: 'wasp_swarmer', count: 5, level: 1 }],
    maxConcurrent: 24,
    spawnDistance: 260,
    seed: 47,
  };
  const result = spawnBudgetedLabPackage(ctx, spec);
  assert.equal(result.requested, 5);
  assert.equal(result.admitted, 2);
  assert.equal(result.spawnedIds.length, 2);
  assert.equal(result.admitted, result.spawnedIds.length);
  assert.equal(result.requested, result.admitted + result.rejected);
  assert.equal(result.rejected, 3);
  assert.equal(spawnCalls.length, 2);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].n, 5);
  assert.equal(requests[0].owner, 'combat-lab:wasp_flight');
  assert.deepEqual(binds.map((row) => row.id), result.spawnedIds);
  for (const bind of binds) assert.equal(bind.owner, 'combat-lab:wasp_flight');
});

test('spawnBudgetedLabPackage spawns nothing when the budget admits zero', () => {
  const { ctx, spawnCalls, binds } = makeLabSpawnCtx({ cap: 0 });
  const result = spawnBudgetedLabPackage(ctx, {
    id: 'wasp_flight',
    entries: [{ enemyId: 'wasp_swarmer', count: 4, level: 1 }],
    maxConcurrent: 6,
    spawnDistance: 260,
    seed: 47,
  });
  assert.equal(result.requested, 4);
  assert.equal(result.admitted, 0);
  assert.deepEqual(result.spawnedIds, []);
  assert.equal(result.rejected, 4);
  assert.equal(spawnCalls.length, 0);
  assert.equal(binds.length, 0);
});

test('spawnBudgetedLabPackage fails closed when spawnBudget is missing', () => {
  const spawnCalls = [];
  const ctx = {
    state: { playerId: 'player', entities: new Map([['player', { pos: { x: 0, z: 0 } }]]), rng: () => 0.5 },
    registry: { get() { return null; } },
    helpers: { spawnEntity(spec) { spawnCalls.push(spec); return 1; } },
  };
  const result = spawnBudgetedLabPackage(ctx, {
    id: 'wasp_flight',
    entries: [{ enemyId: 'wasp_swarmer', count: 3, level: 1 }],
    maxConcurrent: 6,
    spawnDistance: 260,
    seed: 9,
  });
  assert.equal(result.admitted, 0);
  assert.equal(result.rejected, 3);
  assert.equal(spawnCalls.length, 0);
});

test('same package and seed produce the same ordered ids and positions', () => {
  const spec = waspPackageSpec(1864401122);
  const first = makeLabSpawnCtx({ cap: 24, rng: () => 0.11 });
  const second = makeLabSpawnCtx({ cap: 24, rng: () => 0.93 });
  const a = spawnBudgetedLabPackage(first.ctx, spec);
  const b = spawnBudgetedLabPackage(second.ctx, spec);
  assert.deepEqual(a.spawnedIds, b.spawnedIds);
  assert.equal(a.spawnedIds.length, spec.entries[0].count);
  const posA = first.spawnCalls.map((call) => ({ x: call.pos.x, z: call.pos.z }));
  const posB = second.spawnCalls.map((call) => ({ x: call.pos.x, z: call.pos.z }));
  assert.deepEqual(posA, posB);
  for (const call of first.spawnCalls) {
    assert.equal(call.data.ai.spawnContext, 'encounter');
  }
});

test('spawnBudgetedLabPackage releases leftover reservation when spawnEntity throws', () => {
  const { ctx, budget, spawnCalls } = makeLabSpawnCtx({ cap: 24 });
  let calls = 0;
  ctx.helpers.spawnEntity = (spec) => {
    spawnCalls.push(spec);
    calls += 1;
    if (calls === 2) throw new Error('spawnEntity failed');
    return calls;
  };
  const ownerId = 'combat-lab:wasp_flight';
  const spec = {
    id: 'wasp_flight',
    entries: [{ enemyId: 'wasp_swarmer', count: 2, level: 1 }],
    maxConcurrent: 2,
    spawnDistance: 260,
    seed: 47,
  };
  assert.throws(() => spawnBudgetedLabPackage(ctx, spec), /spawnEntity failed/);
  assert.equal(budget.unbound(ownerId), 0, 'unused reservation fully released');
  assert.equal(budget.outstanding(ownerId), 0, 'throwing spawn rolls the owner ledger back to zero');
  assert.equal(budget.current(), 0);
});

test('spawnBudgetedLabPackage does not admit an entity when bindEntity returns false', () => {
  const { ctx, budget, spawnCalls, binds } = makeLabSpawnCtx({ cap: 24, bindResult: false });
  const ownerId = 'combat-lab:wasp_flight';
  const result = spawnBudgetedLabPackage(ctx, {
    id: 'wasp_flight',
    entries: [{ enemyId: 'wasp_swarmer', count: 3, level: 1 }],
    maxConcurrent: 3,
    spawnDistance: 260,
    seed: 47,
  });
  assert.equal(spawnCalls.length, 3);
  assert.equal(binds.length, 3);
  assert.equal(result.admitted, 0);
  assert.deepEqual(result.spawnedIds, []);
  assert.equal(result.rejected, 3);
  assert.equal(result.requested, result.admitted + result.rejected);
  assert.equal(budget.current(), 0);
  assert.equal(budget.outstanding(ownerId), 0);
  assert.equal(budget.unbound(ownerId), 0);
});

test('requestSandboxGame with an invalid Combat Lab setup does not spawn or relocate', () => {
  const relocations = [];
  const spawned = [];
  const toasts = [];
  const listeners = Object.create(null);
  const bus = {
    on(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    emit(type, payload) {
      if (type === 'toast') toasts.push(payload);
      for (const fn of listeners[type] || []) fn(payload);
    },
  };
  const player = { id: 'player', pos: { x: 10, z: -20 } };
  const ctx = {
    state: {
      playerId: 'player',
      player: {
        credits: 0,
        activeShipIndex: 0,
        ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
        moduleInventory: [],
        researchedNodes: [],
      },
      entities: new Map([['player', player]]),
      rng: () => 0,
      render: { cameraCtrl: { setZoom() {}, snapToPlayer() {} } },
    },
    registry: {
      get(name) {
        if (name === 'spawnBudget') {
          return {
            request() { throw new Error('spawn budget should not run'); },
            bindEntity() { return false; },
            releaseSome() { return 0; },
          };
        }
        if (name === 'ships') {
          return {
            buyShip() { throw new Error('hull should not swap'); },
            grantModule() { return false; },
            fitModule() { return false; },
          };
        }
        if (name === 'world') {
          return {
            enterSector() { throw new Error('should not enter sector from Combat Lab'); },
            relocatePlayerInSector(pose, meta) {
              relocations.push({ pose, meta });
              return true;
            },
          };
        }
        return null;
      },
    },
    helpers: {
      spawnEntity(spec) {
        spawned.push(spec);
        return { id: 'should-not-spawn', ...spec };
      },
    },
    bus,
  };

  installSandboxGameStartedHook(bus, ctx);
  const enemy = COMBAT_LAB_ENEMY_PACKAGES.find((pkg) => pkg.id === 'wasp_flight');
  const arena = COMBAT_LAB_ARENAS[0];
  requestSandboxGame(bus, {
    combatLabSetup: {
      schema: 'spaceface.combatLabSetup.v0',
      hullId: 'ship_does_not_exist',
      loadout: [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }],
      enemyPackageId: enemy.id,
      arenaId: arena.id,
      seed: 47,
      wave: 1,
    },
  });
  bus.emit('game:started', {});

  assert.equal(spawned.length, 0);
  assert.equal(relocations.length, 0);
  assert.equal(player.pos.x, 10);
  assert.equal(player.pos.z, -20);
  assert.ok(toasts.some((row) => row && row.kind === 'error'));
});
