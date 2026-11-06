// inf-storm-discharge — the storm lattice's authored discharge fires for real.
//
// The wave plan promises the beat in furnace_active ("the lattice is live; a discharge will
// walk the current graph"), the kill vocabulary was already authored for it (ZAPPED /
// SHORTED / CIRCUITED), the pure walker and its lineage budget existed, and the data-level
// proof (arenaModuleLibrary.proveRelay) showed the intended shape: a hostile bridged into
// the graph is reached and bitten. What was missing was the live wiring. These checks pin:
//
//   * the origin law — the walk starts on the room's own wiring, never on a hull;
//   * the bite collector — radius, nearest-first, cap, one bite per body per walk;
//   * the live room — a furnace_active storm wave walks the graph on its own clock and the
//     hop destination bites the hull standing on it through the kernel;
//   * the wiring carries the cause — a bite through a relay the pilot is holding reads as
//     the pilot's kill, the room's own pylons bite as the room's;
//   * the phase gate — a room whose wave never authors furnace_active never walks;
//   * the moment speaks — the juice announcer says GRID LIVE through its own one-voice lane.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { stampOccupantGeneration } from '../src/core/entity.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import {
  STORM_ARENA_ID,
  STORM_DISCHARGE_DAMAGE,
  STORM_DISCHARGE_FIRST_S,
  STORM_DISCHARGE_MAX_TARGETS,
  STORM_DISCHARGE_PERIOD_S,
  STORM_DISCHARGE_RADIUS,
  buildConductivityGraph,
  conductAlongGraph,
  createStormLineage,
  dischargeBiteTargets,
  placeStormRelays,
  selectDischargeOrigin,
  stormGraphNodes,
  stormPylons,
} from '../src/systems/stormLatticeArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { mines } from '../src/systems/mines.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';

const ORIGIN = { x: 0, z: 0 };

function makeFakeFields() {
  const live = new Map();
  const calls = [];
  return {
    name: 'fields',
    live,
    calls,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id, tag: 'environmental', durationS: Infinity };
      live.set(id, record);
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(String(id)); },
    updateExternal(id, patch) {
      calls.push({ call: 'updateExternal', id, patch });
      const record = live.get(String(id));
      if (!record || !patch) return null;
      Object.assign(record, patch);
      return record;
    },
    hasExternal(id) { return live.has(String(id)); },
    readAcceptedFieldAcceleration() { return null; },
  };
}

function boot({ anchor = { x: 3000, z: 400 } } = {}) {
  const state = createGameState(7);
  state.mode = 'flight';
  state.simTime = 0;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload: structuredClone(payload) });
      raw.emit(event, payload);
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        hull: spec.hull ?? 100, hullMax: spec.hullMax ?? 100,
        shield: spec.shield ?? 0, shieldMax: spec.shieldMax ?? 0,
      };
      stampOccupantGeneration(state, entity);
      state.entities.set(id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id, type: entity.type, entity });
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++,
    alive: true,
    type: 'ship',
    team: 0,
    pos: { ...anchor },
    vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100,
  };
  stampOccupantGeneration(state, player);
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  bus.emit('entity:spawned', { id: player.id, type: 'ship', entity: player });
  const fakeFields = makeFakeFields();
  helpers.combatPhysics = { createAttachment: () => ({ id: 'line' }), cutAttachment: () => true };
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  bus.on('survivalArena:stormWarning', (p) => bus.emit('survivalArena:stormPresented', {
    wave: p.wave, roomGeneration: p.roomGeneration, serial: p.serial,
  }));
  getCombatKernel(ctx);
  mines.init(ctx);
  swarmJuice.init(ctx);
  survivalArena.init(ctx);
  return { state, bus, emitted, fakeFields, player, helpers, ctx };
}

function installRun(harness, { wave = 5, ruleset = 'swarm' } = {}) {
  const run = createRunState({ kind: 'survival', ruleset, seed: 7 });
  run.arenaId = STORM_ARENA_ID;
  run.phase = 'wave_intro';
  run.wave = wave;
  harness.state.run = run;
  return run;
}

function emitPlanned(harness, { wave = 5 } = {}) {
  installRun(harness, { wave });
  const plan = planWave({ seed: 7, arenaId: STORM_ARENA_ID, wave });
  assert.notEqual(plan.ok, false, `storm wave ${wave} must plan`);
  harness.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  harness.state.run.phase = 'active';
  noteSwarmPilotAction(harness.state);
  return plan;
}

function stormDamage(emitted) {
  return emitted.filter((e) => e.event === 'combat:damage'
    && e.payload && e.payload.origin && e.payload.origin.kind === 'storm_discharge');
}

test('the discharge origin is always the room wiring, never a hull', () => {
  const pylons = stormPylons(ORIGIN);
  const relays = placeStormRelays(ORIGIN, 0);
  const wasp = { id: 31, kind: 'hull', conductive: true, score: 9, pos: { x: 96, z: 0 } };
  const graph = buildConductivityGraph(stormGraphNodes(ORIGIN, 0, [wasp]), { at: ORIGIN });
  const origin = selectDischargeOrigin(graph);
  assert.ok(origin, 'a live graph names an origin');
  assert.notEqual(String(origin.id), String(wasp.id), 'a bridged hull never starts the walk');
  assert.match(String(origin.id), /^(pylon|relay)_/, 'the walk starts on the room wiring');
});

test('origin ties break by distance then id, never iteration order', () => {
  const nodes = [
    { id: 'pylon_0', kind: 'pylon', conductive: true, score: 2, pos: { x: 40, z: 0 } },
    { id: 'pylon_1', kind: 'pylon', conductive: true, score: 2, pos: { x: 12, z: 0 } },
    { id: 'pylon_2', kind: 'pylon', conductive: true, score: 2, pos: { x: 12, z: 0 } },
  ];
  const graph = buildConductivityGraph(nodes, { at: ORIGIN });
  assert.equal(selectDischargeOrigin(graph).id, 'pylon_1', 'nearest of the tied score wins');
});

test('the bite collector: radius, nearest first, cap, one bite per body', () => {
  const nodePos = { x: 0, z: 0 };
  const bodies = [
    { id: 1, alive: true, pos: { x: 10, z: 0 } },
    { id: 2, alive: true, pos: { x: 4, z: 0 } },
    { id: 3, alive: true, pos: { x: STORM_DISCHARGE_RADIUS + 6, z: 0 } },
    { id: 4, alive: false, pos: { x: 1, z: 0 } },
    { id: 5, alive: true, pos: { x: 6, z: 0 } },
  ];
  const hits = dischargeBiteTargets(nodePos, bodies, {});
  assert.deepEqual(hits.map((b) => b.id), [2, 5, 1], 'nearest first, radius and dead filters');
  const capped = dischargeBiteTargets(nodePos, bodies, { max: 1 });
  assert.deepEqual(capped.map((b) => b.id), [2], 'the cap holds');
  const excluded = dischargeBiteTargets(nodePos, bodies, { excludeIds: new Set([2, 5]) });
  assert.deepEqual(excluded.map((b) => b.id), [1], 'a body bitten this walk is not bitten again');
});

test('a furnace_active storm wave walks the grid and the arc bites the hull standing on it', () => {
  const harness = boot();
  const plan = emitPlanned(harness, { wave: 5 });
  assert.equal(plan.arenaPhase, 'furnace_active', 'the authored wave goes live');
  const at = survivalArena._stormAt;
  assert.ok(at, 'the storm room is anchored');

  const relayBody = survivalArena._roomSolids.get('relay_0');
  assert.ok(relayBody && relayBody.alive !== false, 'the relay is a real room body');
  const drone = harness.helpers.spawnEntity({
    type: 'drone',
    team: 1,
    alive: true,
    pos: { x: relayBody.pos.x + 18, z: relayBody.pos.z },
  });

  // The pilot is holding the relay: the wiring they drag is the cause their bite carries.
  const attached = getCombatKernel(harness.ctx).attachments.create({ defId: 'tether_standard',
    ownerId: harness.player.id, targetId: relayBody.id });
  assert.equal(attached.ok, true, attached.reason);
  survivalArena.update(1 / 60, harness.state);
  harness.state.simTime = STORM_DISCHARGE_FIRST_S;
  survivalArena.update(1 / 60, harness.state);
  harness.state.simTime += 1.3;
  survivalArena.update(1 / 60, harness.state);

  const bites = stormDamage(harness.emitted);
  assert.ok(bites.length >= 1, 'the walk bit the hull standing on the node');
  const droneBites = bites.filter((e) => e.payload.targetId === drone.id);
  assert.ok(droneBites.length >= 1, 'the bridged drone is a bite destination');
  assert.equal(droneBites[0].payload.attackerId, harness.player.id,
    'a bite through a held relay is the pilot\'s cause');
  assert.ok(droneBites[0].payload.applied > 0, 'the bite applied damage');

  // The receipt and the one-voice moment both fired.
  assert.ok(harness.emitted.some((e) => e.event === 'swarm:stormDischarge'),
    'the room published its discharge receipt');
  const announce = harness.emitted.find((e) => e.event === 'swarm:announce'
    && e.payload && e.payload.kind === 'discharge');
  assert.ok(announce, 'the juice announcer says the grid went live');
  assert.equal(announce.payload.text, 'GRID LIVE');

  // The pilot standing inside the insulated island is off the grid: no edges reach there.
  assert.ok(!bites.some((e) => e.payload.targetId === harness.player.id),
    'the island is the safe post — the arcs cannot reach its centre');
});

test('the room\'s own pylons bite as the room, and the clock walks once per period', () => {
  const harness = boot();
  emitPlanned(harness, { wave: 5 });
  const at = survivalArena._stormAt;
  const relayBody = survivalArena._roomSolids.get('relay_1');
  const drone = harness.helpers.spawnEntity({
    type: 'drone',
    team: 1,
    alive: true,
    pos: { x: relayBody.pos.x, z: relayBody.pos.z + 20 },
  });

  survivalArena.update(1 / 60, harness.state);
  harness.state.simTime = STORM_DISCHARGE_FIRST_S;
  survivalArena.update(1 / 60, harness.state);
  harness.state.simTime += 1.3;
  survivalArena.update(1 / 60, harness.state);
  const first = stormDamage(harness.emitted).filter((e) => e.payload.targetId === drone.id);
  assert.ok(first.length >= 1, 'the first walk bites');
  assert.equal(first[0].payload.attackerId, STORM_ARENA_ID,
    'with nobody holding the wiring, the grid takes its own bite');

  // The same period does not walk twice; the next period does.
  survivalArena.update(1 / 60, harness.state);
  assert.equal(stormDamage(harness.emitted).filter((e) => e.payload.targetId === drone.id).length,
    first.length, 'one walk per period — no double bite on the same clock tick');
  harness.state.simTime += STORM_DISCHARGE_PERIOD_S;
  survivalArena.update(1 / 60, harness.state);
  harness.state.simTime += 1.3;
  survivalArena.update(1 / 60, harness.state);
  assert.ok(stormDamage(harness.emitted).length > first.length, 'the next period walks again');
  assert.ok(stormDamage(harness.emitted).every((e) => e.payload.applied > 0));
  assert.equal(typeof STORM_DISCHARGE_DAMAGE, 'number');
});

test('a room whose wave never authors furnace_active never walks', () => {
  const harness = boot();
  const plan = emitPlanned(harness, { wave: 1 });
  assert.notEqual(plan.arenaPhase, 'furnace_active', 'the gate is the authored phase, not the arena');
  harness.state.simTime = STORM_DISCHARGE_FIRST_S + STORM_DISCHARGE_PERIOD_S * 3;
  survivalArena.update(1 / 60, harness.state);
  survivalArena.update(1 / 60, harness.state);
  assert.equal(stormDamage(harness.emitted).length, 0,
    'an inert lattice never bites — the walk only exists where the plan promised it');
});

test('the discharge numbers stay honest to the authored constants', () => {
  const pylons = stormPylons(ORIGIN);
  const relays = placeStormRelays(ORIGIN, 0);
  const wasp = { id: 77, kind: 'hull', conductive: true, score: 4, pos: { x: -120, z: -120 } };
  const nodes = stormGraphNodes(ORIGIN, 0, [wasp]);
  const graph = buildConductivityGraph(nodes, { at: ORIGIN });
  const origin = selectDischargeOrigin(graph);
  const lineage = createStormLineage({ lineageProcBudget: 16, tick: 0 });
  const walk = conductAlongGraph(graph, origin.id, lineage, { tick: 0 });
  assert.ok(walk.hops.some((hop) => String(hop.toId) === String(wasp.id)),
    'the live-shaped walk still reaches a hull bridged onto the wiring');
  assert.ok(STORM_DISCHARGE_RADIUS > 0 && STORM_DISCHARGE_MAX_TARGETS >= 1);
});
