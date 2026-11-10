import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, makeShipEntitySpec } from '../src/systems/ships.js';
import { createSimulation } from '../src/core/sim.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { beacons } from '../src/systems/beacons.js';
import { checkThreatNear } from '../src/systems/alphabet.js';
import { addToShipment } from '../src/systems/cargoCustody.js';

function rangerWithDroneBay() {
  const hull = SHIPS.find((def) => def.id === 'ship_ranger');
  const slots = buildSlotList(hull);
  const fittings = new Array(slots.length).fill(null);
  const bay = slots.findIndex((slot) => slot.type === 'utility' && slot.size === 'L');
  if (bay >= 0) fittings[bay] = 'mod_drone_bay_l';
  return { defId: 'ship_ranger', fittings };
}

function boot(seed = 4242, machineProtocol = 'observed') {
  const sim = createSimulation({ seed, systems: [automation, beacons] });
  const { state, bus } = sim;
  bus.emitted = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { bus.emitted.push({ event, payload }); emit(event, payload); };
  state.mode = 'flight';
  state.simTime = 120;
  state.world.currentSectorId = 'sector_helios_prime';
  state.world.alienEcology = { machineProtocol };
  Object.assign(state.player, {
    credits: 100_000, droneTierCap: 1, researchedNodes: ['tech_drone_control'],
    activeShipIndex: 0, ownedShips: [rangerWithDroneBay()],
  });
  const player = sim.spawn(makeShipEntitySpec('ship_ranger', {
    isPlayer: true, player: state.player, fittings: state.player.ownedShips[0].fittings,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const station = sim.spawn({
    type: 'station', name: 'Helios Depot', pos: { x: -300, z: 0 }, radius: 50,
    data: { stationId: 'station_helios_depot', dockRadius: 50, name: 'Helios Depot' },
  });
  const rock = sim.spawn({
    type: 'asteroid', pos: { x: 200, z: 0 }, radius: 10,
    data: { oreHP: 200, oreHPMax: 200 },
  });
  const inst = sim.registry.get('automation');
  assert.equal(inst.buyDrone('drone_mk1'), true, 'real purchase spawns the group and its drone');
  const group = state.automation.drones[0];
  const droneEnt = state.entities.get(group.entityIds[0]);
  return { state, inst, bus, group, droneEnt, station, rock, sim };
}

test('FLT-01 wiring: real automation tick interrupts on hostile, steers to depot, emits line once, resumes when clear', () => {
  const { state, inst, bus, group, droneEnt, sim } = boot(4242, 'observed');

  // Assign program with default reaction (no explicit reaction specified)
  inst.assignProgram(group.id, 'mine_to_depot');
  assert.ok(group.program, 'program assigned');
  assert.equal(group.program.templateId, 'mine_to_depot');

  // 1. Tick without hostile: normal execution, no interrupt
  inst.update(1 / 60, state);
  assert.equal(group.programState.interrupt, null, 'no interrupt when clear');

  // 2. Introduce a production Reaver inside the live drone threat radius.
  const hostile = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 250, z: 0 }));
  assert.equal(isHostileForAI(state, state.entities.get(state.playerId), hostile), true);

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
  assert.ok(!toasts[0].payload.text.includes(group.id), 'the live group id is not player copy');

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
  const { state, inst, bus, group, sim } = boot(4242, 'unknown');

  inst.assignProgram(group.id, 'mine_to_depot');

  // Introduce hostile inside threat radius
  const hostile = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 250, z: 0 }));
  assert.equal(isHostileForAI(state, state.entities.get(state.playerId), hostile), true);

  inst.update(1 / 60, state);

  assert.equal(group.programState.interrupt, null, 'unknown protocol prevents reaction interrupt');
  const toasts = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('falls back'));
  assert.equal(toasts.length, 0, 'no toast emitted');
});

test('FLT-01 wiring: explicit assignReaction overrides default reaction token', () => {
  const { state, inst, bus, group, sim } = boot(4242, 'observed');
  inst.assignProgram(group.id, 'mine_to_depot');

  // Explicitly assign evacuate_on_threat (exit mode)
  inst.assignReaction(group.id, 'evacuate_on_threat');
  assert.equal(group.program.reaction.id, 'evacuate_on_threat');
  assert.equal(group.program.reaction.mode, 'exit');

  // Hostile appears
  const hostile = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 250, z: 0 }));
  assert.equal(isHostileForAI(state, state.entities.get(state.playerId), hostile), true);

  inst.update(1 / 60, state);
  assert.ok(group.programState.interrupt, 'evacuate interrupt active');
  const toasts = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('evacuates'));
  assert.equal(toasts.length, 1, 'evacuate toast emitted');
  assert.match(toasts[0].payload.text, /Drone group evacuates to Helios Depot — program aborted/);
});

test('FLT-01 wiring: full cargo plants a real drone-owned buoy and hails without player deployment effects', () => {
  const { state, inst, bus, group, sim } = boot(4242, 'observed');
  inst.assignProgram(group.id, 'mine_to_depot');
  inst.assignReaction(group.id, 'drop_beacon_and_hail_on_cargo_full');

  // Fill the programmed miner's real custody store through its owner.
  assert.equal(addToShipment(group, group.oreType, group.bufferCap, group.bufferCap), group.bufferCap);

  inst.update(1 / 60, state);

  assert.equal(state.beacons.length, 1, 'the real beacon owner plants a record');
  const rec = state.beacons[0];
  const drone = state.entities.get(group.entityIds[0]);
  const buoy = state.entities.get(rec.entityId);
  assert.equal(rec.source, 'drone');
  assert.equal(rec.ownerId, drone.id);
  assert.equal(rec.groupId, group.id);
  assert.ok(buoy?.alive, 'the real spawn helper creates a live buoy');
  assert.equal(buoy.type, 'beacon');
  assert.equal(buoy.data.claimBeaconId, rec.id);
  assert.equal(buoy.data.masslineTetherable, true);
  assert.equal(buoy.data.source, 'drone');
  assert.equal(buoy.data.ownerId, drone.id);
  assert.equal(buoy.data.groupId, group.id);
  assert.equal(buoy.pos.x, rec.x);
  assert.equal(buoy.pos.z, rec.z);
  assert.equal(rec.x, drone.pos.x - Math.cos(drone.rot) * (drone.radius + 18));
  assert.equal(rec.z, drone.pos.z - Math.sin(drone.rot) * (drone.radius + 18));
  assert.equal(bus.emitted.filter(e => e.event === 'beacon:deployed').length, 0,
    'the event that triggers the player hint, VFX and micro-motion never fires');
  assert.equal(bus.emitted.filter(e => e.event === 'automation:droneBeacon').length, 0,
    'the dead event is removed');
  assert.equal(bus.emitted.filter(e => e.event === 'economy:chargeCredits' && e.payload.reason === 'claim_beacon').length, 0);
  inst.update(1 / 60, state);
  assert.equal(state.beacons.length, 1, 'a latched full hold does not plant twice');

  const hailToasts = bus.emitted.filter((e) => e.event === 'toast' && e.payload?.text?.includes('hails'));
  assert.ok(hailToasts.length >= 1, 'hail toast emitted');
  assert.match(hailToasts[0].payload.text, /Drone group hails Helios Depot/);
  assert.doesNotMatch(hailToasts[0].payload.text, /station_helios_depot/);
  state.simTime = rec.expireAt + 0.1;
  sim.registry.get('beacons').update(1 / 60, state);
  assert.equal(state.beacons.length, 0, 'the beacon owner expires its record');
  sim.step(); // Core removes the dead buoy at the normal end-of-step sweep.
  assert.equal(state.entities.has(buoy.id), false, 'the beacon owner removes its buoy');
});

test('FLT-01 wiring: both scans leave a clean lawful patrol alone at the live drone position', () => {
  const { state, inst, group, droneEnt, sim } = boot();
  inst.assignProgram(group.id, 'mine_to_depot');
  droneEnt.pos.x = 1500;
  const patrol = sim.spawn(makeEnemySpawnSpec('patrol_lawman', 1, { x: 1550, z: 0 }));
  assert.equal(isHostileForAI(state, droneEnt, patrol), false);
  assert.equal(inst._isDroneThreatNear(group), false);
  assert.equal(checkThreatNear(group, { state }), false);
  const pirate = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 1550, z: 0 }));
  assert.equal(isHostileForAI(state, droneEnt, pirate), true);
  assert.equal(inst._isDroneThreatNear(group), true);
  assert.equal(checkThreatNear(group, { state }), true, 'the drone position outranks the stored origin');
});
