// Offline authored segment, never called by the live game or station presenter.
// Positions, rotations and velocities are assigned only in the initial ship spec.
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { killReplay } from '../src/systems/killReplay.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { RED_KITE, RED_KITE_GATES, redKiteClass } from '../src/data/redKite.js';
import { redKiteGateFrame, redKiteGateCrossing } from '../src/characters/redKiteRules.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';

const DT = 1 / 60;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = a => Math.max(-1, Math.min(1, a));
const gate = redKiteGateFrame(0);
const next = redKiteGateFrame(1);
const point = (n, distance) => ({ x: gate.pos.x + n.nx * distance, z: gate.pos.z + n.nz * distance });
const plane = (p, normal, distance) => (p.x - gate.pos.x) * normal.nx + (p.z - gate.pos.z) * normal.nz - distance;
const snapshot = ship => ({ x: ship.pos.x, z: ship.pos.z });

export async function recordCornerPass({ label, lateTurnDistance = 0 } = {}) {
  const sim = createSimulation({ seed: 27023, systems: [flightV3, physics, killReplay] });
  const state = sim.state;
  state.mode = 'flight'; state.ui.screenStack = []; state.ui.docked = false;
  state.world.currentSectorId = RED_KITE.sectorId;
  const spawn = point(gate, -360);
  const spec = makeShipEntitySpec('ship_hornet', { isPlayer: true, player: state.player, fittings: [], pos: spawn });
  Object.assign(spec, { rot: Math.atan2(gate.nz, gate.nx), vel: { x: gate.nx * 75, z: gate.nz * 75 } });
  const ship = sim.spawn(spec); state.playerId = ship.id;
  const inputs = []; let entranceTick = null, gateTick = null, exitTick = null, maxForce = 0, peakSpeed = 0;
  let previous = snapshot(ship), lastInput = null;
  try {
    if (!await sim.registry.get('physics').prepareBackend(state)) throw Error('native-backend-unavailable');
    for (let tick = 1; tick <= 1800; tick++) {
      const incomingDistance = plane(ship.pos, gate, 0);
      const turning = gateTick !== null && incomingDistance >= lateTurnDistance;
      const target = turning ? point(next, 520) : point(gate, 250);
      const angle = Math.atan2(target.z - ship.pos.z, target.x - ship.pos.x);
      const error = wrap(angle - ship.rot);
      const turn = clamp(error * 1.6 - ship.angVel * 0.32);
      const brake = turning && Math.abs(error) > 0.5;
      const throttle = brake ? 0 : Math.abs(error) > 0.8 ? 0.2 : 1;
      Object.assign(state.input, { moveX: 0, moveZ: throttle, turnIntent: turn, brake, boost: false });
      const input = [tick, throttle, turn, brake ? 1 : 0];
      // Preserve the actual controls supplied to flightV3, not a fitted path.
      if (!lastInput || input.slice(1).some((v, i) => v !== lastInput[i + 1])) { inputs.push(input); lastInput = input; }
      sim.step(DT);
      const telemetry = readPhysicsTelemetry(ship);
      if (!telemetry) throw Error('missing-native-solved-telemetry');
      maxForce = Math.max(maxForce, Math.hypot(telemetry.force.x, telemetry.force.z));
      peakSpeed = Math.max(peakSpeed, Math.hypot(ship.vel.x, ship.vel.z));
      const current = snapshot(ship);
      if (entranceTick === null && plane(previous, gate, -300) <= 0 && plane(current, gate, -300) > 0) entranceTick = state.tick;
      if (gateTick === null && redKiteGateCrossing(previous, current, 0, RED_KITE.gateRadius - ship.radius)) gateTick = state.tick;
      if (gateTick !== null && plane(previous, next, 350) <= 0 && plane(current, next, 350) > 0) exitTick = state.tick;
      previous = current;
      // Let the existing 10 Hz recorder include the section's first sample after exit.
      if (exitTick !== null && state.tick % 6 === 0) break;
    }
    const recording = state.replay.recording;
    const frames = recording.poseFrames.map(frame => ({ tick: frame.tick, poses: frame.poses.filter(p => p.id === String(ship.id)) }));
    return { label, completed: entranceTick !== null && gateTick !== null && exitTick !== null,
      hullId: 'ship_hornet', hullClass: redKiteClass(ship), radius: ship.radius,
      lateTurnDistance, entranceTick, gateTick, exitTick, elapsedTicks: exitTick === null ? null : exitTick - entranceTick,
      maxForce, peakSpeed, inputTicks: state.tick, inputs,
      tape: { tickRate: 60, ticks: recording.ticks, absoluteBaseTick: recording.absoluteBaseTick, poseFrames: frames } };
  } finally { sim.registry.get('physics')._disableSg02DynamicAuthority?.(); sim.dispose(); }
}

export async function recordKiteCornerProgram() {
  const wide = await recordCornerPass({ label: 'Left it late', lateTurnDistance: 200 });
  const clean = await recordCornerPass({ label: 'Make the handoff', lateTurnDistance: 0 });
  return { schema: 1, title: 'Kite’s Corner', episode: 'The falling corner',
    classification: 'Authored native-flight segment demonstration. Not a race record or rendered live footage.',
    seed: 27023, courseId: RED_KITE.courseId, courseVersion: RED_KITE.courseVersion,
    gate: RED_KITE_GATES[0], incoming: gate, outgoing: next,
    section: { entrancePlane: -300, exitPlane: 350, tickRate: 60 }, passes: [wide, clean] };
}

if (process.argv.includes('--record')) console.log(JSON.stringify(await recordKiteCornerProgram()));
