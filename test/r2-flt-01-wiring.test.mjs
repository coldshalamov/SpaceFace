import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList } from '../src/systems/ships.js';
import { REACTION_TOKENS } from '../src/systems/alphabet.js';

function rangerWithDroneBay() {
  const hull = SHIPS.find((def) => def.id === 'ship_ranger');
  const slots = buildSlotList(hull);
  const fittings = new Array(slots.length).fill(null);
  const bay = slots.findIndex((slot) => slot.type === 'utility' && slot.size === 'L');
  if (bay >= 0) fittings[bay] = 'mod_drone_bay_l';
  return { defId: 'ship_ranger', fittings };
}

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    },
    off() {},
    emit(event, payload) {
      emitted.push({ event, payload });
      for (const fn of (handlers.get(event) || []).slice()) fn(payload);
    },
  };
}

function boot(seed = 4242, machineProtocol = 'observed') {
  const player = {
    id: 1,
    alive: true,
    type: 'player',
    pos: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
  };
  const station = {
    id: 10,
    alive: true,
    type: 'station',
    name: 'Helios Depot',
    pos: { x: -300, z: 0 },
    radius: 50,
    data: { stationId: 'station_helios_depot', dockRadius: 50, name: 'Helios Depot' },
  };
  const rock = {
    id: 20,
    alive: true,
    type: 'asteroid',
    pos: { x: 200, z: 0 },
    radius: 10,
    data: { oreHP: 200, oreHPMax: 200 },
  };
  const droneEnt = {
    id: 30,
    alive: true,
    type: 'drone',
    pos: { x: 190, z: 0 },
    rot: 0,
    radius: 5,
    data: { groupId: 'drone_g1', kind: 'mining_drone' },
  };

  const entities = new Map([
    [1, player],
    [10, station],
    [20, rock],
    [30, droneEnt],
  ]);
  const entityList = [player, station, rock, droneEnt];

  const state = {
    simTime: 120,
    tick: 1,
    meta: { seed },
    playerId: 1,
    mode: 'flight',
    player: {
      credits: 100_000,
      droneTierCap: 1,
      researchedNodes: ['tech_drone_control'],
      activeShipIndex: 0,
      stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200 },
      ownedShips: [rangerWithDroneBay()],
    },
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: null,
      alienEcology: {
        machineProtocol,
      },
    },
    entities,
    entityList,
    automation: null,
  };

  const bus = makeBus();
  const inst = Object.create(automation);
  inst.init({ state, bus, helpers: { getEntity: (id) => state.entities.get(id) }, registry: null });
  inst.newGame();

  const group = {
    id: 'drone_g1',
    defId: 'drone_mk1',
    count: 1,
    sectorId: 'sector_helios_prime',
    oreType: 'cmdty_ore_iron',
    buffer: 0,
    bufferCap: 40,
    fuel: 240,
    fuelMax: 240,
    durability: 40,
    status: 'mining',
    entityIds: [30],
    originPos: { x: 200, z: 0 },
  };
  state.automation.drones.push(group);

  return { state, inst, bus, group, droneEnt, station, rock };
}

test('FLT-01 wiring: real automation tick interrupts on hostile, steers to depot, emits line once, resumes when clear', () => {
  const { state, inst, bus, group, droneEnt } = boot(4242, 'observed');

  // Assign program with default reaction (no explicit reaction specified)
  inst.assignProgram('drone_g1', 'mine_to_depot');
  assert.ok(group.program, 'program assigned');
  assert.equal(group.program.templateId, 'mine_to_depot');

  // 1. Tick without hostile: normal execution, no interrupt
  inst.update(1 / 60, state);
  assert.equal(group.programState.interrupt, null, 'no interrupt when clear');

  // 2. Introduce hostile hull inside threat radius (< 600m from drone at x:190, z:0)
  const hostile = {
    id: 99,
    alive: true,
    type: 'ship',
    factionId: 'pirate',
    isHostile: true,
    pos: { x: 300, z: 0 }, // 110m away from drone
  };
  state.entities.set(99, hostile);
  state.entityList.push(hostile);

  // Tick with hostile near
  inst.update(1 / 60, state);

  // Group must be interrupted and steering to depot
  assert.ok(group.programState.interrupt, 'interrupt triggered on real automation tick');
  assert.equal(group.programState.interrupt.step.target, 'depot', 'interrupt step targets depot');
  assert.ok(droneEnt.data?.intent, 'drone entity has steering intent');

  // Check alert line emitted ONCE
  const toasts = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('falls back to'));
  assert.equal(toasts.length, 1, 'emitted fallback toast exactly once');
  assert.match(toasts[0].payload.text, /Drone group falls back to Helios Depot/);
  // Verify no raw identifiers leaked into player sentence
  assert.doesNotMatch(toasts[0].payload.text, /station_helios_depot/);
  assert.doesNotMatch(toasts[0].payload.text, /drone_g1/);

  // Tick again while hostile is still near: verify no duplicate toast while latched
  inst.update(1 / 60, state);
  const toastsAfterSecondTick = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('falls back to'));
  assert.equal(toastsAfterSecondTick.length, 1, 'toast did not duplicate while latched');

  // 3. Move hostile far away (> 600m)
  hostile.pos.x = 5000;
  hostile.pos.z = 5000;

  // Tick again: reaction clears and program resumes
  inst.update(1 / 60, state);
  assert.equal(group.programState.interrupt, null, 'interrupt cleared after hostile left');
  assert.equal(group.programState.pc, 0, 'resumed program loop at saved pc');

  // Check resume event was emitted
  const resumedEvents = bus.emitted.filter((e) => e.event === 'automation:programInterrupted' && e.payload?.action === 'resume');
  assert.equal(resumedEvents.length, 1, 'programInterrupted resume event emitted');
});

test('FLT-01 wiring: negative case — machine protocol unknown means no reaction slot fires on real tick', () => {
  const { state, inst, bus, group } = boot(4242, 'unknown');

  inst.assignProgram('drone_g1', 'mine_to_depot');

  // Introduce hostile inside threat radius
  const hostile = {
    id: 99,
    alive: true,
    type: 'ship',
    factionId: 'pirate',
    isHostile: true,
    pos: { x: 250, z: 0 },
  };
  state.entities.set(99, hostile);
  state.entityList.push(hostile);

  inst.update(1 / 60, state);

  assert.equal(group.programState.interrupt, null, 'unknown protocol prevents reaction interrupt');
  const toasts = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('falls back'));
  assert.equal(toasts.length, 0, 'no toast emitted');
});

test('FLT-01 wiring: explicit assignReaction overrides default reaction token', () => {
  const { state, inst, bus, group } = boot(4242, 'observed');
  inst.assignProgram('drone_g1', 'mine_to_depot');

  // Explicitly assign evacuate_on_threat (exit mode)
  inst.assignReaction('drone_g1', 'evacuate_on_threat');
  assert.equal(group.program.reaction.id, 'evacuate_on_threat');
  assert.equal(group.program.reaction.mode, 'exit');

  // Hostile appears
  const hostile = {
    id: 99,
    alive: true,
    type: 'ship',
    factionId: 'pirate',
    isHostile: true,
    pos: { x: 250, z: 0 },
  };
  state.entities.set(99, hostile);
  state.entityList.push(hostile);

  inst.update(1 / 60, state);
  assert.ok(group.programState.interrupt, 'evacuate interrupt active');
  const toasts = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('evacuates'));
  assert.equal(toasts.length, 1, 'evacuate toast emitted');
  assert.match(toasts[0].payload.text, /Drone group evacuates to Helios Depot — program aborted/);
});

test('FLT-01 wiring: drop_beacon_and_hail_on_cargo_full emits a drone beacon (not the player beacon event) and comms hail on real tick', () => {
  const { state, inst, bus, group } = boot(4242, 'observed');
  inst.assignProgram('drone_g1', 'mine_to_depot');
  inst.assignReaction('drone_g1', 'drop_beacon_and_hail_on_cargo_full');

  // Fill group buffer to capacity
  group.buffer = 40;

  inst.update(1 / 60, state);

  const beaconEvents = bus.emitted.filter((e) => e.event === 'automation:droneBeacon');
  assert.ok(beaconEvents.length >= 1, 'drone beacon emitted on full cargo reaction');
  assert.equal(beaconEvents[0].payload.source, 'drone');

  const hailToasts = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('hails'));
  assert.ok(hailToasts.length >= 1, 'hail toast emitted');
  assert.match(hailToasts[0].payload.text, /Drone group hails Helios Depot/);
  assert.doesNotMatch(hailToasts[0].payload.text, /station_helios_depot/);
});
