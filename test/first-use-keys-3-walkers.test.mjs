import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  combatTickEntitySource,
  combatTickEntitySourceKind,
  createCombatKernel,
} from '../src/combat/kernel.js';
import {
  JETTISONED_CARGO_PAYLOAD_TYPE,
  OUTLAW_CATCH_NET_TYPE,
  lootShards,
} from '../src/systems/lootShards.js';
import {
  GHOST_CONTACT_CADENCE_TICKS,
  markEntityGhost,
  scanner,
} from '../src/systems/scanner.js';
import {
  SURRENDER_READOPT_CADENCE_TICKS,
  surrenderRecovery,
} from '../src/systems/surrenderRecovery.js';

function fatBelt() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 140,
    hull: 200, hullMax: 200, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    cap: 80, capMax: 80, flags: {}, data: { ai: {}, derived: { damageReductionMult: 1 } },
  };
  const hostile = {
    id: 2, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, mass: 80,
    hull: 40, hullMax: 100, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    cap: 40, capMax: 40, flags: {},
    data: {
      name: 'Reach Cutter',
      bountyCr: 200,
      ai: { fsm: 'surrender', passive: true, roe: 'hold_fire', archetype: 'pirate_raider' },
      intent: { fire: false },
    },
  };
  const station = {
    id: 3, type: 'station', alive: true, team: 2,
    pos: { x: -80, z: 0 }, radius: 90, flags: {},
    data: { stationId: 'station_belt', factionId: 'faction_scn', sectorId: 'sector_quiet' },
  };
  const net = {
    id: 4, type: 'payload', alive: true,
    pos: { x: 200, z: 0 }, radius: 8, flags: {},
    data: { payloadType: OUTLAW_CATCH_NET_TYPE, outlawCatchNet: true },
  };
  const pod = {
    id: 5, type: 'payload', alive: true,
    pos: { x: 202, z: 0 }, radius: 3, flags: {},
    data: { payloadType: JETTISONED_CARGO_PAYLOAD_TYPE },
  };
  const rock = {
    id: 6, type: 'asteroid', alive: true, pos: { x: 8, z: 0 }, radius: 16,
    data: { oreHP: 20, isGhost: true, ghost: true, ai: { fsm: 'surrender', passive: true } },
    flags: {},
  };
  const fx = {
    id: 7, type: 'fx', alive: true, pos: { x: 9, z: 0 },
    data: { isGhost: true, ghost: true }, flags: {},
  };
  const wreck = {
    id: 8, type: 'wreck', alive: true, pos: { x: 16, z: 0 }, data: {}, flags: {},
  };
  const list = [player, hostile, station, net, pod, rock, fx, wreck];
  return {
    tick: SURRENDER_READOPT_CADENCE_TICKS,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    entities: new Map(list.map((entity) => [entity.id, entity])),
    entityList: list,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      version: 1,
      ready: true,
      shipLike: [player, hostile],
      stations: [station],
      wrecks: [wreck],
      payloads: [net, pod],
      pickups: [],
      asteroids: [rock],
    },
    world: { currentSectorId: 'sector_quiet' },
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 31 },
    player, hostile, station, net, pod, rock, fx, wreck,
  };
}

function trapMasterList(state) {
  const hits = [];
  const inner = state.entityList;
  state.entityList = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === Symbol.iterator) {
        hits.push('iterate');
        const iter = target[Symbol.iterator];
        return typeof iter === 'function' ? iter.bind(target) : iter;
      }
      if (typeof prop === 'string' && /^\d+$/.test(prop)) hits.push(`at:${prop}`);
      return Reflect.get(target, prop, receiver);
    },
  });
  return hits;
}

test('combat tick source uses the living-world index and never yields rocks or FX', () => {
  const state = fatBelt();
  assert.equal(combatTickEntitySourceKind(state), 'index');
  const types = combatTickEntitySource(state).map((entity) => entity.type).sort();
  assert.deepEqual(types, ['ship', 'ship', 'station', 'wreck']);
  assert.ok(!types.includes('asteroid'));
  assert.ok(!types.includes('fx'));
  assert.ok(!types.includes('payload'));

  delete state.entityIndex;
  assert.equal(combatTickEntitySourceKind(state), 'filter');
  const filtered = combatTickEntitySource(state).map((entity) => entity.type);
  assert.ok(!filtered.includes('asteroid'));
  assert.ok(!filtered.includes('fx'));
});

test('combat prePhysics visits living actors only and still cools a ship', () => {
  const state = fatBelt();
  state.hostile.cap = 10;
  const hits = trapMasterList(state);
  const kernel = createCombatKernel({
    state,
    bus: createBus(),
    helpers: {},
    registry: { get: () => null },
  });
  assert.deepEqual(hits, []);
  assert.ok(state.combat.entities[String(state.hostile.id)], 'hostile ship is a combatant');
  assert.equal(state.combat.entities[String(state.rock.id)], undefined, 'rocks never enter combat runtime');
  assert.equal(state.combat.entities[String(state.fx.id)], undefined);

  const runtime = state.combat.entities[String(state.hostile.id)];
  runtime.heat = 12;
  state.tick += 1;
  kernel.prePhysics(1 / 60);
  assert.ok(runtime.heat < 12, 'weapon-cadence status/heat still advances every tick');
  assert.deepEqual(hits, []);
  kernel.dispose();
});

test('surrender re-adopt walks living ships, not the quiet belt', () => {
  const state = fatBelt();
  const hits = trapMasterList(state);
  const bus = createBus();
  surrenderRecovery.init({ state, bus, helpers: {} });
  surrenderRecovery.update(1 / 60, state);
  assert.deepEqual(hits, []);
  const record = state.surrenderRecovery && state.surrenderRecovery.records
    && state.surrenderRecovery.records['surrender:2'];
  assert.ok(record, 'surrendering ship is still adopted from the living-actor view');
  assert.equal(record.recoveryKind, 'surrendered');
  assert.equal(state.rock.data.surrenderRecovery, undefined, 'a rock never becomes a recovery target');
  surrenderRecovery.destroy();
});

test('loot nets collect from job interactables and skip rocks; empty payload bucket early-outs', () => {
  const state = fatBelt();
  const hits = trapMasterList(state);
  lootShards.init({ state, bus: createBus(), helpers: {} });
  lootShards.update(1 / 60, state);
  assert.equal(state.pod.data.caughtByNet, true, 'a pod still snags in a net');
  assert.equal(state.pod.data.caughtByNetId, state.net.id);
  assert.deepEqual(hits, []);

  const quiet = fatBelt();
  quiet.entityIndex.payloads = [];
  quiet.pod.data.caughtByNet = false;
  const quietHits = trapMasterList(quiet);
  lootShards.update(1 / 60, quiet);
  assert.equal(quiet.pod.data.caughtByNet, false, 'no payload bucket means no net scan');
  assert.deepEqual(quietHits, []);
  lootShards.destroy();
});

test('scanner ghosts tick living ships on cadence and never walk rocks or FX', () => {
  const state = fatBelt();
  markEntityGhost(state.hostile, { spawnedAt: 0, escapeRange: 10, escapeHoldS: 0 });
  state.hostile.pos = { x: 4000, z: 0 };
  const escaped = [];
  const bus = createBus();
  bus.on('scanner:ghostEscaped', (payload) => escaped.push(payload));
  const hits = trapMasterList(state);
  scanner.init({ state, bus, helpers: {} });

  state.tick = 1;
  scanner.update(1 / 60, state);
  assert.equal(state.hostile.alive, true, 'off-cadence tick does not scan ghosts');
  assert.deepEqual(hits, []);

  state.tick = GHOST_CONTACT_CADENCE_TICKS;
  state.simTime = 2;
  scanner.update(1 / 60, state);
  assert.equal(state.hostile.alive, false, 'ghost beyond hold still escapes');
  assert.equal(escaped.length, 1);
  assert.equal(escaped[0].entityId, state.hostile.id);
  assert.equal(state.rock.alive, true, 'a rock flagged as ghost is never visited');
  assert.deepEqual(hits, []);
});
