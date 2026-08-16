import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';
import { CERES_SHIFT_RING } from '../src/data/timeTrialCourses.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { save } from '../src/save/saveSystem.js';
import { economy } from '../src/systems/economy.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import {
  decodeTimeTrialInputFrame,
  referenceTimeTrialInput,
  timeTrials,
} from '../src/systems/timeTrials.js';
import { world } from '../src/systems/world.js';

const COURSE = CERES_SHIFT_RING;
const DT = SIM_DT;

async function boot(t, seed = 5050) {
  const featureSnapshot = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  t.after(() => restoreFeatureMaps(featureSnapshot));
  const sim = createSimulation({
    seed,
    systems: [physics, flightV3, economy, world, timeTrials, save],
    updateOrder: [flightV3, physics, economy, world, timeTrials],
  });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  sim.registry.get('world').enterSector(COURSE.sectorId, {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  const staging = sectorLocalToGlobalForSector(COURSE.staging, COURSE.sectorId);
  const first = sectorLocalToGlobalForSector(COURSE.gates[0].center, COURSE.sectorId);
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    fittings: fittingsFromDefaultModules('ship_kestrel'),
    pos: { ...staging },
    rot: Math.atan2(first.z - staging.z, first.x - staging.x),
  }));
  state.playerId = player.id;
  state.player.credits = 0;
  const events = [];
  for (const name of [
    'timeTrial:courseAvailable', 'timeTrial:postingRead', 'timeTrial:started',
    'timeTrial:gatePassed', 'timeTrial:invalidated', 'timeTrial:completed',
    'economy:grantCredits', 'credits:changed', 'physics:impact', 'toast',
  ]) bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  return { sim, state, bus, player, events, runtime: sim.registry.get('timeTrials') };
}

function setInput(state, input) {
  state.input.moveX = input.moveX || 0;
  state.input.moveZ = input.moveZ || 0;
  state.input.turnIntent = input.turnIntent || 0;
  state.input.boost = !!input.boost;
  state.input.brake = !!input.brake;
  state.input.actions.brake = !!input.brake;
}

function eventOf(route, name) {
  return route.events.find((event) => event.name === name) || null;
}

function eventsOf(route, name) {
  return route.events.filter((event) => event.name === name);
}

function currentExpectedGate(route) {
  return route.runtime.getRuntimeState().run?.expectedGateIndex ?? 0;
}

function steerToward(player, target) {
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const desired = Math.atan2(dz, dx);
  let error = desired - player.rot;
  while (error > Math.PI) error -= Math.PI * 2;
  while (error < -Math.PI) error += Math.PI * 2;
  return {
    moveX: Math.max(-0.25, Math.min(0.25, Math.sin(error) * 0.2)),
    moveZ: Math.abs(error) < 0.9 ? 1 : 0.25,
    turnIntent: Math.max(-1, Math.min(1, error / 0.55)),
    boost: false,
    brake: Math.abs(error) > 1.25,
  };
}

async function flyReferenceRun(route, maxTicks = COURSE.medals.bronzeTicks + 300) {
  for (let index = 0; index < maxTicks; index++) {
    setInput(route.state, referenceTimeTrialInput(COURSE, route.player, currentExpectedGate(route)));
    route.sim.step(DT);
    const completed = eventOf(route, 'timeTrial:completed');
    if (completed) return completed.payload;
    const invalidated = eventOf(route, 'timeTrial:invalidated');
    if (invalidated) throw new Error(`reference run invalidated: ${JSON.stringify({
      ...invalidated.payload,
      expectedGateIndex: currentExpectedGate(route),
      playerPos: { x: route.player.pos.x, z: route.player.pos.z },
    })}`);
  }
  throw new Error(`reference run did not finish after ${maxTicks} production ticks`);
}

test('Plan 50: ordinary Ceres posting leads to physical gate rings and a silver-or-better Flight V3/Rapier run', async (t) => {
  const route = await boot(t);
  route.bus.emit('dock:docked', { stationId: COURSE.postingStationId });
  assert.match(eventOf(route, 'toast')?.payload?.text || '', /SHIFT RING.*gold.*silver.*bronze/i);

  const runtime = route.runtime.getRuntimeState();
  assert.equal(runtime.courseId, COURSE.id);
  assert.equal(runtime.buoyIds.length, COURSE.gates.length * COURSE.ring.nodeCount);
  for (const id of runtime.buoyIds) {
    const buoy = route.state.entities.get(id);
    assert.equal(buoy.type, 'fx');
    assert.equal(buoy.data.placeId, 'place_nav_buoy');
    assert.equal(buoy.collides, true);
    assert.equal(buoy.physicsBody.dynamic, false);
  }

  const result = await flyReferenceRun(route);
  assert.ok(result.medal === 'gold' || result.medal === 'silver', `reference medal was ${result.medal}`);
  assert.equal(eventsOf(route, 'timeTrial:gatePassed').length, COURSE.gates.length);
  assert.equal(eventsOf(route, 'economy:grantCredits').length, 1);
  assert.equal(eventsOf(route, 'credits:changed').length, 1);
  assert.equal(route.state.player.credits, result.creditDelta);
  assert.equal(route.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');

  const record = route.state.player.timeTrials.courses[COURSE.id];
  assert.equal(record.bestTicks, result.elapsedTicks);
  assert.equal(record.bestReplay.frames.length, result.replayFrames);
  const ghost = route.runtime.prepareGhostReplay(COURSE.id);
  assert.equal(ghost.schema, 'spaceface.time-trial-ghost.v1');
  assert.deepEqual(route.runtime.readGhostInput(ghost),
    decodeTimeTrialInputFrame(record.bestReplay.frames[0], record.bestReplay.quantization));

  const replayBytesBefore = JSON.stringify(record.bestReplay);
  const envelope = route.sim.registry.get('save').serialize('time-trial-continue');
  const continued = await boot(t, 9991);
  assert.equal(continued.sim.registry.get('save').loadEnvelope(envelope, 'time-trial-continue'), true);
  const restored = continued.state.player.timeTrials.courses[COURSE.id];
  assert.equal(JSON.stringify(restored.bestReplay), replayBytesBefore,
    'Continue preserves the deterministic input tape byte-for-byte');
  assert.equal(continued.state.player.credits, route.state.player.credits,
    'Continue restores the economy-owned credit total without another grant');
  assert.equal(continued.runtime.prepareGhostReplay(COURSE.id).replay.frames.length, result.replayFrames);
});

test('Plan 50: real ordered flight invalidates a missed gate instead of granting coordinate-only completion', async (t) => {
  const route = await boot(t, 5051);
  while (!eventOf(route, 'timeTrial:started')) {
    setInput(route.state, referenceTimeTrialInput(COURSE, route.player, 0));
    route.sim.step(DT);
  }
  const gate0 = sectorLocalToGlobalForSector(COURSE.gates[0].center, COURSE.sectorId);
  const gate1 = sectorLocalToGlobalForSector(COURSE.gates[1].center, COURSE.sectorId);
  const gate2 = sectorLocalToGlobalForSector(COURSE.gates[2].center, COURSE.sectorId);
  const nx = (gate1.x - gate0.x) / Math.hypot(gate1.x - gate0.x, gate1.z - gate0.z);
  const nz = (gate1.z - gate0.z) / Math.hypot(gate1.x - gate0.x, gate1.z - gate0.z);
  const bypass = { x: gate1.x - nz * 250, z: gate1.z + nx * 250 };
  let bypassed = false;
  for (let index = 0; index < 2400 && !eventOf(route, 'timeTrial:invalidated'); index++) {
    const plane = (route.player.pos.x - gate1.x) * nx + (route.player.pos.z - gate1.z) * nz;
    if (plane > 35) bypassed = true;
    setInput(route.state, bypassed
      ? referenceTimeTrialInput(COURSE, route.player, 2)
      : steerToward(route.player, bypass));
    route.sim.step(DT);
  }
  assert.equal(bypassed, true, 'the real ship crossed the skipped gate plane outside its aperture');
  assert.equal(eventOf(route, 'timeTrial:invalidated')?.payload?.reason, 'missed_gate',
    JSON.stringify(eventOf(route, 'timeTrial:invalidated')?.payload || null));
  assert.equal(eventOf(route, 'timeTrial:completed'), null);
  assert.equal(eventsOf(route, 'economy:grantCredits').length, 0);
});

test('Plan 50: striking a live gate buoy produces a Rapier impact and voids the active run', async (t) => {
  const route = await boot(t, 5052);
  while (!eventOf(route, 'timeTrial:started')) {
    setInput(route.state, referenceTimeTrialInput(COURSE, route.player, 0));
    route.sim.step(DT);
  }
  const buoyId = route.runtime.getRuntimeState().buoyIds.find((id) => (
    route.state.entities.get(id)?.data?.timeTrialGateIndex === 1
  ));
  const buoy = route.state.entities.get(buoyId);
  assert.ok(buoy?.alive);
  for (let index = 0; index < 2400 && !eventOf(route, 'timeTrial:invalidated'); index++) {
    setInput(route.state, steerToward(route.player, buoy.pos));
    route.sim.step(DT);
  }
  const impact = eventsOf(route, 'physics:impact').find((event) => (
    event.payload.backend === 'rapier-dynamic'
      && (event.payload.aId === route.player.id || event.payload.bId === route.player.id)
      && route.runtime.getRuntimeState().buoyIds.includes(
        event.payload.aId === route.player.id ? event.payload.bId : event.payload.aId,
      )
  ));
  assert.ok(impact, `the player physically contacts the fixed buoy through Rapier; invalidation=${JSON.stringify(eventOf(route, 'timeTrial:invalidated')?.payload || null)}`);
  assert.equal(eventOf(route, 'timeTrial:invalidated')?.payload?.reason, 'touched_buoy');
  assert.equal(eventsOf(route, 'economy:grantCredits').length, 0);
});
