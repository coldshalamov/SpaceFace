import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { automation } from '../src/systems/automation.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { lossLedger, lossesFor } from '../src/systems/lossLedger.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

function runtime(seed = 0x47a) {
  const state = createGameState(seed);
  state.world.currentSectorId = 'sector_charon_expanse';
  state.world.sectors = {
    sector_charon_expanse: {
      id: 'sector_charon_expanse',
      name: 'Charon Expanse',
      owner: 'faction_dmc',
    },
  };
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = 100 + spawned.length;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const registry = { get() { return null; } };
  const ledger = Object.create(lossLedger);
  const presence = Object.create(factionPresence);
  const auto = Object.create(automation);
  ledger.init({ state, bus, helpers, registry });
  presence.init({ state, bus, helpers, registry });
  auto.init({ state, bus, helpers, registry });
  return { state, bus, spawned, ledger, presence, auto };
}

test('loss-ledger reads are non-mutating when the canonical owner has no state yet', () => {
  const state = {};
  assert.deepEqual(lossesFor(state, 'sector_charon_expanse'), []);
  assert.equal(Object.hasOwn(state, 'lossLedger'), false);
});

test('a real automation combat loss records its authored hull and wakes Understory in-sector', () => {
  const rt = runtime();
  rt.bus.emit('sector:enter', { sectorId: 'sector_charon_expanse' });
  assert.equal(rt.spawned.some((entity) => entity.factionId === 'faction_understory'), false);

  rt.state.automation.fleet.push({
    id: 'fleet_k1_runtime',
    shipDefId: 'ship_mule',
    defId: 'ship_mule',
    sectorId: 'sector_charon_expanse',
    hp: 0.1,
    hullPct: 0.1,
    status: 'escort',
  });
  rt.bus.emit('combat:hitAsset', {
    assetKind: 'fleet',
    assetId: 'fleet_k1_runtime',
    damage: 100,
  });

  const entry = rt.state.lossLedger.entries[0];
  assert.equal(entry.source, 'automation:assetLost');
  assert.equal(entry.sectorId, 'sector_charon_expanse');
  assert.equal(entry.shipDefId, 'ship_mule');
  assert.equal(
    rt.spawned.some((entity) => entity.factionId === 'faction_understory' && entity.data.defId === 'ship_mule'),
    true,
    'lossLedger:recorded must materialize Understory without another sector:enter',
  );
});

test('a real live-combat ship death records the lost hull and wakes Understory after the battle', () => {
  const rt = runtime();
  const victim = makeEntity(makeShipEntitySpec('ship_hornet', {
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 160, z: 0 },
  }));
  victim.id = 90;
  rt.state.entities.set(victim.id, victim);
  rt.state.entityList.push(victim);
  rt.state.playerId = 1;
  const kernel = createCombatKernel({ state: rt.state, bus: rt.bus, helpers: {} });
  const result = kernel.routeDamage({
    attackerId: rt.state.playerId,
    targetId: victim.id,
    packet: { channels: { kinetic: 10000 }, penetration: 1, shieldBypass: 1 },
    origin: { kind: 'test', id: 'live_afterbattle_loss' },
  });
  assert.equal(result.ok, true);
  const entry = rt.state.lossLedger.entries.find((row) => row.source === 'entity:killed');
  assert.ok(entry);
  assert.equal(entry.shipDefId, 'ship_hornet');
  assert.equal(entry.sectorId, 'sector_charon_expanse');
  assert.equal(rt.spawned.some((entity) => entity.factionId === 'faction_understory'
    && entity.data.defId === 'ship_hornet'), true);
});

test('Understory never fires first but a real player hit activates its sampled defensive doctrine', () => {
  const rt = runtime();
  const loss = {
    lossId: 'loss_understory_defense', sectorId: 'sector_charon_expanse', shipDefId: 'ship_mule',
    factionId: 'faction_dmc', kind: 'ship', source: 'entity:killed', t: 0,
  };
  rt.state.lossLedger.entries.push(loss);
  rt.state.lossLedger.bySector.sector_charon_expanse = [loss];
  const player = makeEntity(makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0, pos: { x: 0, z: 0 } }));
  player.id = 1;
  rt.state.playerId = player.id;
  rt.state.entities.set(player.id, player);
  rt.state.entityList.push(player);
  rt.bus.emit('sector:enter', { sectorId: 'sector_charon_expanse' });
  const understory = rt.spawned.find((entity) => entity.factionId === 'faction_understory');
  assert.ok(understory);
  assert.equal(understory.data.ai.passive, true);
  assert.equal(isHostileForAI(rt.state, understory, player), false);

  const kernel = createCombatKernel({ state: rt.state, bus: rt.bus, helpers: {} });
  const hit = kernel.routeDamage({
    attackerId: player.id,
    targetId: understory.id,
    packet: { channels: { kinetic: 1 }, penetration: 0, shieldBypass: 0 },
    origin: { kind: 'test', id: 'understory_player_provocation' },
  });
  assert.equal(hit.ok, true);
  assert.equal(understory.data.ai.passive, false);
  assert.equal(understory.team, 1);
  assert.equal(understory.data.ai.retaliationTargetId, player.id);
  assert.equal(isHostileForAI(rt.state, understory, player), true);
});

test('the production registry steps factionPresence before the tactical AI slot', () => {
  const state = createGameState(0x47a);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: null };
  const registry = createRegistry(ctx);
  ctx.registry = registry;
  registry.get('core').init(ctx);
  const names = registry.updateOrder.map((system) => system.name);
  const tacticalName = registry.get('ai').name;
  assert.ok(names.indexOf('factionPresence') >= 0, 'presence must be live in UPDATE_ORDER');
  assert.ok(names.indexOf('factionPresence') < names.indexOf(tacticalName),
    'route anchors and presence boarding settle before tactical AI samples the frame');

  const calls = [];
  const restorers = registry.updateOrder.map((system) => {
    const original = system.update;
    system.update = () => calls.push(system.name);
    return () => { system.update = original; };
  });
  try {
    registry.step(1 / 60);
  } finally {
    for (const restore of restorers.reverse()) restore();
  }
  assert.ok(calls.indexOf('factionPresence') < calls.indexOf(tacticalName),
    'the actual registry step executes presence before tactical AI');
});
