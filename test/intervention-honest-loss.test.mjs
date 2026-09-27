import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { intervention } from '../src/systems/intervention.js';

function boot() {
  const state = createGameState(77);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 100;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_a';
  state.world.sectors = {
    sector_a: { id: 'sector_a', name: 'Sector A', security: 0.8 },
    sector_b: { id: 'sector_b', name: 'Sector B', security: 0.2 },
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const id = nextId++;
      const entity = {
        id,
        alive: true,
        type: spec.type || 'ship',
        team: spec.team ?? 0,
        factionId: spec.factionId || null,
        pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
        vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
        rot: 0,
        radius: spec.radius || 6,
        mass: spec.mass || 1,
        hull: spec.hull ?? 10,
        hullMax: spec.hullMax ?? 10,
        data: spec.data || {},
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      state.entities.delete(id);
    },
  };
  const system = Object.create(intervention);
  system.init({ state, bus, helpers });
  return { state, bus, system, player, helpers };
}

function teardown(system, bus) {
  bus.clear();
}

function wreckOf(state, rec) {
  return state.entities.get(rec.wreckEntityId);
}

test('a mechanical loss in safe space leaves a full mixed hold and no guard', () => {
  const { state, bus, system } = boot();
  try {
    const available = [];
    bus.on('intervention:available', (p) => available.push(p));
    bus.emit('automation:assetLost', { kind: 'trader', id: 't-1', value: 560, sectorId: 'sector_a' });
    assert.equal(available.length, 1);
    const rec = available[0];
    assert.equal(rec.cause, 'mechanical');
    assert.equal(rec.guardId, null);
    const wreck = wreckOf(state, rec);
    assert.ok(wreck);
    assert.equal(wreck.data.interventionCause, 'mechanical');
    assert.equal(wreck.data.interventionId, rec.id);
    // 50% of 560 = 280 value → 10 units split iron/silicate + scrap.
    assert.equal(wreck.data.salvagePool.cmdty_ore_iron, 6);
    assert.equal(wreck.data.salvagePool.cmdty_silicate, 4);
    assert.ok(wreck.data.salvagePool.cmdty_scrap_metal >= 1);
    assert.ok(rec.jumper && rec.jumper.entityId != null);
    const jumper = state.entities.get(rec.jumper.entityId);
    assert.equal(jumper.team, 2);
    assert.equal(jumper.data.ai.archetype, 'fleeing_trader');
  } finally {
    teardown(system, bus);
  }
});

test('an explicitly raided loss leaves a picked wreck with a raider circling it', () => {
  const { state, bus, system } = boot();
  try {
    const available = [];
    bus.on('intervention:available', (p) => available.push(p));
    bus.emit('automation:assetLost', {
      kind: 'trader', id: 't-2', value: 560, sectorId: 'sector_a', cause: 'pirate ambush',
    });
    assert.equal(available.length, 1);
    const rec = available[0];
    assert.equal(rec.cause, 'raided');
    const wreck = wreckOf(state, rec);
    // 15% of 560 = 84 value → 3 token iron + scrap.
    assert.equal(wreck.data.salvagePool.cmdty_ore_iron, 3);
    assert.equal(wreck.data.salvagePool.cmdty_silicate, undefined);
    const guard = state.entities.get(rec.guardId);
    assert.ok(guard);
    assert.equal(guard.team, 1);
    assert.equal(guard.data.ai.archetype, 'pirate');
    assert.equal(guard.factionId, 'faction_reach');
    const gap = Math.hypot(guard.pos.x - wreck.pos.x, guard.pos.z - wreck.pos.z);
    assert.ok(gap >= 300 && gap <= 520, `guard ring ${gap}`);
  } finally {
    teardown(system, bus);
  }
});

test('a loss in dangerous space reads as a raid even without an explicit cause', () => {
  const { state, bus, system } = boot();
  try {
    state.world.currentSectorId = 'sector_b';
    const available = [];
    bus.on('intervention:available', (p) => available.push(p));
    bus.emit('automation:assetLost', { kind: 'fleet', id: 'f-1', value: 300, sectorId: 'sector_b' });
    assert.equal(available.length, 1);
    assert.equal(available[0].cause, 'raided');
    assert.ok(available[0].guardId);
  } finally {
    teardown(system, bus);
  }
});

test('a mechanical loss keeps half of what was actually aboard', () => {
  const { state, bus, system } = boot();
  try {
    const available = [];
    bus.on('intervention:available', (p) => available.push(p));
    bus.emit('automation:assetLost', {
      kind: 'trader', id: 't-3', value: 900, sectorId: 'sector_a', cause: 'fuel fault',
      cargo: { cmdty_medical: 6, cmdty_food: 3, junk: 99 },
    });
    assert.equal(available.length, 1);
    const wreck = wreckOf(state, available[0]);
    assert.equal(wreck.data.salvagePool.cmdty_medical, 3);
    assert.equal(wreck.data.salvagePool.cmdty_food, 1);
    assert.equal(wreck.data.salvagePool.junk, undefined);
    assert.equal(wreck.data.salvagePool.cmdty_ore_iron, undefined);
  } finally {
    teardown(system, bus);
  }
});

test('a cross-sector loss logs a site that materializes on arrival, not at the feet', () => {
  const { state, bus, system } = boot();
  try {
    const logged = [];
    const available = [];
    const toasts = [];
    bus.on('intervention:logged', (p) => logged.push(p));
    bus.on('intervention:available', (p) => available.push(p));
    bus.on('toast', (p) => toasts.push(p));
    bus.emit('automation:assetLost', { kind: 'trader', id: 't-4', value: 560, sectorId: 'sector_b' });
    assert.equal(logged.length, 1);
    assert.equal(available.length, 0);
    assert.equal(state.entityList.length, 1);
    assert.equal(system.pending().length, 1);
    // Arriving elsewhere changes nothing.
    state.world.currentSectorId = 'sector_a';
    bus.emit('sector:enter', { sectorId: 'sector_a' });
    assert.equal(available.length, 0);
    // Arriving in the loss sector builds the site with arrival copy.
    state.world.currentSectorId = 'sector_b';
    bus.emit('sector:enter', { sectorId: 'sector_b' });
    assert.equal(available.length, 1);
    assert.equal(system.pending().length, 0);
    assert.ok(toasts.some((t) => /Recovery site/.test(t.text)));
    const wreck = wreckOf(state, available[0]);
    assert.ok(wreck);
    assert.equal(wreck.data.interventionId, available[0].id);
  } finally {
    teardown(system, bus);
  }
});

test('the pending log is bounded and empty losses stay silent', () => {
  const { state, bus, system } = boot();
  try {
    for (let i = 0; i < 9; i++) {
      bus.emit('automation:assetLost', { kind: 'drone', id: `d-${i}`, value: 120, sectorId: 'sector_b' });
    }
    assert.equal(system.pending().length, 6);
    const before = system.pending().length;
    bus.emit('automation:assetLost', { kind: 'drone', id: 'd-empty', value: 0, sectorId: 'sector_a' });
    assert.equal(state.entityList.length, 1);
    assert.equal(system.pending().length, before);
  } finally {
    teardown(system, bus);
  }
});

test('the claim-jumper burns in, announces, and strips the pool over time', () => {
  const { state, bus, system } = boot();
  try {
    const toasts = [];
    bus.on('toast', (p) => toasts.push(p));
    bus.emit('automation:assetLost', { kind: 'trader', id: 't-5', value: 560, sectorId: 'sector_a' });
    const rec = system.active()[0];
    const jumper = state.entities.get(rec.jumper.entityId);
    const wreck = wreckOf(state, rec);
    system.update(1 / 60, state);
    assert.equal(rec.jumper.phase, 'inbound');
    assert.equal(jumper.data.intent.mode, 'intervention_jumper_inbound');
    // Jump the jumper alongside the wreck and let it work.
    jumper.pos.x = wreck.pos.x + 50;
    jumper.pos.z = wreck.pos.z;
    system.update(1 / 60, state);
    assert.equal(rec.jumper.phase, 'stripping');
    assert.ok(toasts.some((t) => /claim-jumper is stripping/.test(t.text)));
    const before = Object.values(wreck.data.salvagePool).reduce((s, n) => s + n, 0);
    for (let i = 0; i < 4; i++) {
      state.simTime += 3;
      system.update(1 / 60, state);
    }
    assert.equal(rec.jumper.stolen, 4);
    const after = Object.values(wreck.data.salvagePool).reduce((s, n) => s + n, 0);
    assert.equal(after, before - 4);
  } finally {
    teardown(system, bus);
  }
});

test('a spooked jumper drops part of its take and runs', () => {
  const { state, bus, system, player } = boot();
  try {
    bus.emit('automation:assetLost', { kind: 'trader', id: 't-6', value: 560, sectorId: 'sector_a' });
    const rec = system.active()[0];
    const jumper = state.entities.get(rec.jumper.entityId);
    const wreck = wreckOf(state, rec);
    jumper.pos.x = wreck.pos.x + 50;
    jumper.pos.z = wreck.pos.z;
    system.update(1 / 60, state);
    state.simTime += 3;
    system.update(1 / 60, state);
    state.simTime += 3;
    system.update(1 / 60, state);
    assert.ok(rec.jumper.stolen >= 2);
    // The player closes to spooking range.
    player.pos.x = jumper.pos.x + 100;
    player.pos.z = jumper.pos.z;
    system.update(1 / 60, state);
    assert.equal(rec.jumper.phase, 'fled');
    const pods = state.entityList.filter((e) => e.type === 'pickup');
    assert.equal(pods.length, 1);
    assert.equal(pods[0].data.kind, 'cargo');
    assert.ok(pods[0].data.amount >= 1 && pods[0].data.amount <= 3);
    assert.equal(pods[0].data.jumperDrop, rec.id);
    assert.equal(jumper.data.intent.mode, 'intervention_jumper_flee');
  } finally {
    teardown(system, bus);
  }
});

test('a stripped-clean site closes with the jumper take on the receipt', () => {
  const { state, bus, system } = boot();
  try {
    const closed = [];
    bus.on('intervention:closed', (p) => closed.push(p));
    bus.emit('automation:assetLost', { kind: 'drone', id: 'd-9', value: 120, sectorId: 'sector_a' });
    const rec = system.active()[0];
    const wreck = wreckOf(state, rec);
    wreck.data.salvagePool = { cmdty_scrap_metal: 1 };
    const jumper = state.entities.get(rec.jumper.entityId);
    jumper.pos.x = wreck.pos.x + 50;
    jumper.pos.z = wreck.pos.z;
    system.update(1 / 60, state);
    state.simTime += 3;
    system.update(1 / 60, state);
    assert.equal(rec.jumper.stolen, 1);
    // The player salvages the (empty) wreck: the site closes with the take noted.
    wreck.alive = false;
    wreck.data._salvaged = true;
    system.update(1 / 60, state);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].id, rec.id);
    assert.equal(closed[0].recovered, true);
    assert.equal(closed[0].strippedByJumper, 1);
    assert.equal(system.active().length, 0);
  } finally {
    teardown(system, bus);
  }
});
