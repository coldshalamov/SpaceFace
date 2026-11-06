import assert from 'node:assert/strict';
import test from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { flightV3, resolveAutopilotTarget } from '../src/systems/flightV3.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

test('captured Belt Outpost contact with a committed avoidance side reaches the authored berth', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const previousBus = flightV3.bus;
  flightV3.bus = null;
  const station = {
    id: 175, type: 'station', alive: true, collides: true,
    pos: { x: -11508, z: 7252 }, rot: 0, radius: 26, mass: 1e6,
    data: { stationId: 'station_beltout', stationTypeId: 'mining', dockRadius: 60,
      placeScale: 60 / 14, collisionProxy: 'station_ring_hub',
      corridorBearingDeg: Math.atan2(940, -780) * 180 / Math.PI },
  };
  const player = {
    ...makeShipEntitySpec('ship_hornet', {
      isPlayer: true,
      fittings: ['wpn_concussion_cannon_m', 'wpn_gravity_marker_s', 'wpn_momentum_sink_s'],
      pos: { x: -11538.044006347656, z: 7210.407470703125 }, rot: .7631909522464587,
    }),
    id: 1, alive: true, collides: true, flags: {},
    vel: { x: .6959731578826904, z: -.30259382724761963 },
    angVel: -.000018466113033355214,
  };
  const autopilot = { active: true, targetEntityId: 175, arrivalRadius: 90,
    label: 'Belt Outpost', target: { ...station.pos },
    // This is already the same bound course. Omitting this context resets the captured
    // +1 commitment and accidentally tests the opposite side, which already arrives.
    _avoidanceSide: 1, _avoidanceTargetEntityId: '175' };
  const state = { mode: 'flight', playerId: 1, player,
    entities: new Map([[1, player], [175, station]]), entityList: [player, station],
    entityIndex: { stations: [station] }, input: {}, ui: {}, nav: { autopilot }, tick: 0, simTime: 0 };
  dockingCorridor.init({ bus: null });
  owner.syncFromEntities([station, player]);
  const stages = [];
  try {
    const initial = resolveAutopilotTarget(state, autopilot);
    assert.ok(Math.abs(initial.approachPoint.x - -11443.73837943641) < 1e-6);
    assert.ok(Math.abs(initial.approachPoint.z - 7202.690324250294) < 1e-6);
    assert.equal(initial.arrivalRadius, 20, 'the authored physical berth gate is unchanged');
    for (let tick = 0; tick < 7200; tick++) {
      state.tick = tick;
      state.simTime = tick / 60;
      Object.assign(state.input, { moveX: 0, moveZ: 0, turnIntent: 0, brake: false, boost: false });
      flightV3._stepCraft(player, state.input, 1 / 60, state, true);
      dockingCorridor.update(1 / 60, state);
      owner.step(1 / 60);
      const stage = resolveAutopilotTarget(state, autopilot)?.dockingStage;
      if (stage !== stages.at(-1)) stages.push(stage);
      if (!autopilot.active) break;
    }
    assert.equal(autopilot.active, false,
      `captured contact must escape instead of holding ${autopilot.distance.toFixed(3)} wu from the mouth`);
    assert.equal(autopilot.status, 'arrived');
    assert.equal(state.dockingCorridor?.phase, 'berthed');
    assert.ok(stages.includes('berth'), 'the real flight and docking owners complete the final lane');
  } finally {
    flightV3.bus = previousBus;
    owner.dispose();
  }
});
