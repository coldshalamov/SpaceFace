// FB-022 — arena props are bodies the Massline can move.
//
// The Storm Lattice's two relays and the Cryo Drift's coolant tank / heat manifold are real
// dynamic bodies the room owns (the mines path's room-solid owner), tetherable and shootable.
// The law follows the body: a dragged relay moves its occupancy marker and rewrites the
// conductivity graph's arcs; a coolant tank thrown into a hot quadrant cools a window of it.
// A free relay out of its band gets a bounded re-anchor servo through the SG-02 membrane;
// a held relay is the player's and is left alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createRunState } from '../src/core/runState.js';
import {
  CRYO_ARENA_ID,
  CRYO_PROP_VENT_TICKS,
  cryoZoneAt,
} from '../src/systems/cryoDriftArena.js';
import { mines } from '../src/systems/mines.js';
import {
  STORM_ARENA_ID,
  STORM_RELAY_BAND,
  STORM_RELAY_COUNT,
  STORM_RELAY_MASS,
  buildConductivityGraph,
  placeStormRelays,
  stormGraphNodes,
} from '../src/systems/stormLatticeArena.js';
import {
  ARENA_FIELD_SLOT_IDS,
  survivalArena,
} from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 4242;
const ANCHOR = { x: 400, z: -120 };
const DT = 1 / 60;

function makeFakeFields() {
  const live = new Map();
  return {
    live,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id };
      live.set(id, record);
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(String(id)); },
    updateExternal(id, patch) {
      const record = live.get(String(id));
      if (record && patch) Object.assign(record, patch);
      return record || null;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function boot({ seed = SEED, anchor = ANCHOR } = {}) {
  const state = createGameState(seed);
  state.simTime = 0;
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { ...spec.vel } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
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
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  mines.init(ctx);
  survivalArena.init(ctx);
  return { state, bus, helpers, fakeFields, player };
}

function installWave(harness, { wave = 1, arenaId }) {
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed: SEED });
  run.arenaId = arenaId;
  run.phase = 'wave_intro';
  run.wave = wave;
  harness.state.run = run;
  const plan = planWave({ seed: SEED, arenaId, wave });
  assert.notEqual(plan.ok, false, `${arenaId} wave ${wave} must plan`);
  harness.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return plan;
}

function propBodies(state, role) {
  return state.entityList.filter((e) => e.data && e.data.propRole === role);
}

function tick(harness, n = 1) {
  for (let i = 0; i < n; i++) survivalArena.update(DT, harness.state);
}

function edgeSet(at, simTime, liveRelays = null) {
  const nodes = stormGraphNodes(at, simTime, [], liveRelays);
  const graph = buildConductivityGraph(nodes, { at });
  return graph.edges.map((e) => e.key).sort();
}

test('storm relays and cryo props materialize as real dynamic arena-owned bodies', () => {
  const h = boot();
  installWave(h, { arenaId: STORM_ARENA_ID });
  const relays = propBodies(h.state, 'relay');
  assert.equal(relays.length, STORM_RELAY_COUNT, 'both relays are bodies');
  for (const relay of relays) {
    assert.equal(relay.physicsBody.dynamic, true);
    assert.equal(relay.mass, STORM_RELAY_MASS);
    assert.equal(relay.collides, true, 'shootable/collidable');
    assert.equal(relay.type, 'station', 'a bridle endpoint the Massline can latch');
    assert.equal(relay.data.roomOwner, 'survival-arena');
  }

  const h2 = boot();
  installWave(h2, { arenaId: CRYO_ARENA_ID });
  const coolant = propBodies(h2.state, 'coolant');
  const heat = propBodies(h2.state, 'heat');
  assert.equal(coolant.length, 1);
  assert.equal(heat.length, 1);
  assert.equal(coolant[0].physicsBody.dynamic, true);
  assert.equal(coolant[0].collides, true);
  assert.ok(coolant[0].mass > 0 && coolant[0].mass < 500, 'a throwable tank, not terrain');
});

test('seed 4242: a dragged relay moves its occupancy marker and rewrites the lattice', () => {
  const h = boot();
  installWave(h, { arenaId: STORM_ARENA_ID });
  const relay0 = h.state.entityList.find((e) => e.data && e.data.roomToyId === 'relay_0');
  const relay1 = h.state.entityList.find((e) => e.data && e.data.roomToyId === 'relay_1');
  assert.ok(relay0 && relay1, 'relays materialized');
  const at = survivalArena._stormAt;

  // Baseline: field slot 0 rides the relay body, which starts at its orbit pose.
  tick(h, 1);
  const slot0 = h.fakeFields.live.get(ARENA_FIELD_SLOT_IDS[0]);
  assert.ok(Math.abs(slot0.center.x - relay0.pos.x) < 1e-9);
  assert.ok(Math.abs(slot0.center.z - relay0.pos.z) < 1e-9);

  // The Massline hauls relay_0 at least 40 WU: a recorded active attachment marks it held,
  // and the drag moves the real body.
  const spawn = { x: relay0.pos.x, z: relay0.pos.z };
  const dragged = { x: spawn.x + 60, z: spawn.z };
  h.state.combat = h.state.combat || {};
  h.state.combat.attachments = {
    byId: { m1: { id: 'm1', state: 'active', ownerId: h.player.id, targetId: relay0.id } },
  };
  relay0.pos.x = dragged.x;
  relay0.pos.z = dragged.z;
  tick(h, 1);

  const dragDistance = Math.hypot(relay0.pos.x - spawn.x, relay0.pos.z - spawn.z);
  assert.ok(dragDistance >= 40, `the relay body moved ${dragDistance.toFixed(1)} WU (need >= 40)`);
  assert.ok(Math.abs(relay0.pos.x - dragged.x) < 1e-9, 'the tether moved the body, not the pose');

  // The marker follows the body, and a held relay is the player's — zero re-anchor force.
  assert.ok(Math.abs(slot0.center.x - relay0.pos.x) < 1e-9, 'marker sits on the dragged body');
  const heldCommand = consumePhysicsCommand(relay0);
  assert.equal(heldCommand.control.mode, 'relay_held');
  assert.equal(Math.hypot(heldCommand.control.force.x, heldCommand.control.force.z), 0);

  // The conductivity graph over the live bodies closes different edges than the orbit poses.
  const baseline = edgeSet(at, h.state.simTime);
  const live = edgeSet(at, h.state.simTime, [
    { id: 'relay_0', pos: { x: relay0.pos.x, z: relay0.pos.z } },
    { id: 'relay_1', pos: { x: relay1.pos.x, z: relay1.pos.z } },
  ]);
  assert.notDeepEqual(live, baseline, 'a dragged relay changes which cells arc');
});

test('a free relay outside its band gets the bounded re-anchor pull; in band it just rides', () => {
  const h = boot();
  installWave(h, { arenaId: STORM_ARENA_ID });
  const relay0 = h.state.entityList.find((e) => e.data && e.data.roomToyId === 'relay_0');
  const at = survivalArena._stormAt;
  const pose = placeStormRelays(at, h.state.simTime)[0].pos;

  // Still free but parked far off-pose: the room writes a bounded seek back at it.
  relay0.pos.x = pose.x + 150;
  relay0.pos.z = pose.z;
  tick(h, 1);
  const seek = consumePhysicsCommand(relay0);
  assert.equal(seek.control.mode, 'relay_reanchor');
  const toPose = { x: pose.x - relay0.pos.x, z: pose.z - relay0.pos.z };
  const dot = seek.control.force.x * toPose.x + seek.control.force.z * toPose.z;
  assert.ok(dot > 0, 'the servo pulls toward the pose');
  assert.ok(Math.hypot(seek.control.force.x, seek.control.force.z) <= 16000 + 1e-9, 'bounded');
  assert.equal(seek.control.maxSpeed, 60, 'a glide back, not a snap');

  // Parked on the pose at rest: orbit mode, ~zero corrective force.
  relay0.pos.x = pose.x;
  relay0.pos.z = pose.z;
  relay0.vel.x = 0;
  relay0.vel.z = 0;
  tick(h, 1);
  const ride = consumePhysicsCommand(relay0);
  assert.equal(ride.control.mode, 'relay_orbit');
  const drift = Math.hypot(relay0.pos.x - pose.x, relay0.pos.z - pose.z);
  assert.ok(drift <= STORM_RELAY_BAND);
});

test('cryo: a tank thrown into a hot quadrant cools a window of it, then is spent', () => {
  const h = boot();
  installWave(h, { arenaId: CRYO_ARENA_ID });
  const tank = h.state.entityList.find((e) => e.data && e.data.roomToyId === 'coolant_tank');
  const room = survivalArena._cryoRoom;
  assert.ok(tank && room);
  const home = { x: tank.pos.x, z: tank.pos.z };
  assert.equal(cryoZoneAt(room, home), 'cold', 'the docked tank is the authored cold pocket');

  // Throw it into the hot east: the pocket rides the body; a point beside it still bakes.
  tank.pos.x = room.at.x + 200;
  tank.pos.z = room.at.z;
  tick(h, 1);
  assert.equal(cryoZoneAt(room, tank.pos), 'cold', 'the pocket followed the thrown tank');
  const beside = { x: tank.pos.x + 100, z: tank.pos.z };
  assert.equal(cryoZoneAt(room, beside), 'hot', 'outside the pocket the quadrant still vents');
  const marker = h.fakeFields.live.get(ARENA_FIELD_SLOT_IDS[0]);
  assert.ok(Math.abs(marker.center.x - tank.pos.x) < 1e-9, 'the occupancy marker rides too');

  // The window is bounded: after the vent charge drains the pocket is spent debris.
  tick(h, CRYO_PROP_VENT_TICKS);
  assert.equal(cryoZoneAt(room, tank.pos), 'hot', 'a spent tank stops cooling the quadrant');
  assert.deepEqual(room.props.coolant, [], 'the room no longer lists a live coolant pocket');

  // Re-docking the body restores the authored pocket (replumbed at home).
  tank.pos.x = home.x;
  tank.pos.z = home.z;
  tick(h, 1);
  assert.equal(cryoZoneAt(room, home), 'cold', 'a re-docked tank is the authored pocket again');
});

test('cryo: a dead prop body takes its pocket with it', () => {
  const h = boot();
  installWave(h, { arenaId: CRYO_ARENA_ID });
  const tank = h.state.entityList.find((e) => e.data && e.data.roomToyId === 'coolant_tank');
  const room = survivalArena._cryoRoom;
  // Displace the tank into the hot east, where only its pocket makes the spot cold.
  tank.pos.x = room.at.x + 200;
  tank.pos.z = room.at.z;
  tick(h, 1);
  assert.equal(cryoZoneAt(room, tank.pos), 'cold', 'the thrown tank cools its landing');
  // Shoot it dead: the pocket dies with the body — the wreck cools nothing.
  tank.alive = false;
  tick(h, 1);
  assert.deepEqual(room.props.coolant, [], 'a dead tank leaves no pocket');
  assert.equal(cryoZoneAt(room, tank.pos), 'hot', 'the wreck is just debris in the heat');
});

test('release: the room still owns teardown and relay/prop bodies die with the room', () => {
  const h = boot();
  installWave(h, { arenaId: STORM_ARENA_ID });
  const relays = propBodies(h.state, 'relay');
  assert.equal(relays.length, STORM_RELAY_COUNT);
  h.bus.emit('run:waveCleared', { wave: 1 });
  for (const relay of relays) assert.equal(relay.alive, false, 'room release kills the props');
});
