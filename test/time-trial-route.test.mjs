import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';
import { PLANET_FLAGS } from '../src/data/planets.js';
import {
  CERES_SHIFT_RING,
  PALLAS_MASSLINE_SLINGSHOT,
  TETHYS_ANVIL_SKIM,
  VESTA_FOUNDRY_SLALOM,
} from '../src/data/timeTrialCourses.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { save } from '../src/save/saveSystem.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { fields } from '../src/systems/fields.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import {
  decodeTimeTrialInputFrame,
  referenceTimeTrialInput,
  resolveTimeTrialPoint,
  timeTrials,
} from '../src/systems/timeTrials.js';
import { world } from '../src/systems/world.js';

const COURSE = CERES_SHIFT_RING;
const DT = SIM_DT;

async function boot(t, seed = 5050, course = COURSE) {
  const featureSnapshot = snapshotFeatureMaps();
  const planetFlag = PLANET_FLAGS.enabled;
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  PLANET_FLAGS.enabled = course.kind === 'skim';
  t.after(() => {
    PLANET_FLAGS.enabled = planetFlag;
    restoreFeatureMaps(featureSnapshot);
  });
  const systems = course.kind === 'slingshot'
    ? [physics, flightV3, combat, tetherGameplay, masslineTelemetry, economy, world, timeTrials, save]
    : course.kind === 'skim'
      ? [fields, planetRuntime, physics, flightV3, economy, world, timeTrials, save]
      : [physics, flightV3, economy, world, timeTrials, save];
  const updateOrder = course.kind === 'slingshot'
    ? [flightV3, physics, combat, tetherGameplay, masslineTelemetry, economy, world, timeTrials]
    : course.kind === 'skim'
      ? [fields, planetRuntime, flightV3, physics, economy, world, timeTrials]
      : [flightV3, physics, economy, world, timeTrials];
  const sim = createSimulation({
    seed,
    systems,
    updateOrder,
  });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.controls.flightMode = course.kind === 'slingshot' ? 'newtonian' : 'assisted';
  state.input.actions = {};
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  sim.registry.get('world').enterSector(course.sectorId, {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  if (course.kind === 'skim') sim.registry.get('planetRuntime').update(0, state);
  const staging = resolveTimeTrialPoint(course, course.staging, state);
  const first = resolveTimeTrialPoint(course, course.gates[0].center, state);
  assert.ok(staging && first, `${course.id} resolves its live staging and first gate`);
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
    'timeTrial:slingshotQualified', 'tether:latched', 'tether:cut',
    'tether:latchDenied', 'tether:broke', 'tether:released', 'tether:releaseRated',
    'planet:plungeStage',
    'economy:grantCredits', 'credits:changed', 'physics:impact', 'toast',
  ]) bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  return { sim, state, bus, player, events, runtime: sim.registry.get('timeTrials'), course };
}

function setInput(state, input) {
  state.input.moveX = input.moveX || 0;
  state.input.moveZ = input.moveZ || 0;
  state.input.turnIntent = input.turnIntent || 0;
  state.input.boost = !!input.boost;
  state.input.brake = !!input.brake;
  state.input.aimWorld = input.aimWorld || null;
  state.input.aimIntentActive = input.aimIntentActive === true;
  state.input.actions = {
    brake: !!input.brake,
    tetherFire: !!input.actions?.tetherFire,
    tetherCut: !!input.actions?.tetherCut,
    reelDelta: input.actions?.reelDelta || 0,
    massline: input.actions?.massline ? { ...input.actions.massline } : null,
  };
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

async function flyReferenceRun(route, maxTicks = route.course.medals.bronzeTicks + 300) {
  for (let index = 0; index < maxTicks; index++) {
    setInput(route.state, referenceTimeTrialInput(
      route.course,
      route.player,
      currentExpectedGate(route),
      route.state,
      route.runtime.getRuntimeState(),
    ));
    route.sim.step(DT);
    const completed = eventOf(route, 'timeTrial:completed');
    if (completed) return completed.payload;
    const invalidated = eventOf(route, 'timeTrial:invalidated');
    if (invalidated) throw new Error(`reference run invalidated: ${JSON.stringify({
      ...invalidated.payload,
      runtimeExpectedGateIndex: currentExpectedGate(route),
      playerPos: { x: route.player.pos.x, z: route.player.pos.z },
      tether: route.state.player.tether,
      lastLatchDenied: eventsOf(route, 'tether:latchDenied').at(-1)?.payload || null,
      lastTetherBroke: eventsOf(route, 'tether:broke').at(-1)?.payload || null,
      lastTetherCut: eventsOf(route, 'tether:cut').at(-1)?.payload || null,
      slingshotCutCheck: route.runtime.getRuntimeState().slingshotCutCheck,
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

async function assertCourseReplayRoundTrip(t, route, result, reloadSeed) {
  const record = route.state.player.timeTrials.courses[route.course.id];
  assert.equal(record.bestTicks, result.elapsedTicks);
  const replayBytes = JSON.stringify(record.bestReplay);
  assert.equal(record.bestReplay.poses.length, record.bestReplay.frames.length,
    'the input+seed tape carries an additive render pose for each production tick');
  const preparedGhost = route.runtime.prepareGhostReplay(route.course.id);
  assert.equal(JSON.stringify(preparedGhost.replay), replayBytes);
  const envelope = route.sim.registry.get('save').serialize(`time-trial:${route.course.id}`);
  const continued = await boot(t, reloadSeed, route.course);
  assert.equal(continued.sim.registry.get('save').loadEnvelope(envelope, `time-trial:${route.course.id}`), true);
  assert.equal(JSON.stringify(continued.state.player.timeTrials.courses[route.course.id].bestReplay), replayBytes);
  assert.equal(JSON.stringify(continued.runtime.prepareGhostReplay(route.course.id).replay), replayBytes);
  continued.bus.emit('timeTrial:selectGhost', { courseId: route.course.id, enabled: true });
  const ghostId = continued.runtime.getRuntimeState().ghostEntityId;
  const liveGhost = continued.state.entities.get(ghostId);
  assert.equal(liveGhost?.type, 'fx');
  assert.equal(liveGhost?.collides, false);
  assert.equal(liveGhost?.data?.timeTrialGhost, true);
  continued.state.world.currentSectorId = 'sector_ceres_belt';
  continued.bus.emit('sector:exit', { sectorId: route.course.sectorId });
  assert.equal(continued.runtime.getRuntimeState().ghostEntityId, null);
  assert.equal(continued.state.entities.get(ghostId)?.alive, false,
    'the local ghost is retired from the render world with its selected course sector');
}

test('Plan 50: Vesta Foundry Teeth is a silver-completable physical slalom and rock contact only voids time', async (t) => {
  const route = await boot(t, 5053, VESTA_FOUNDRY_SLALOM);
  route.bus.emit('dock:docked', { stationId: route.course.postingStationId });
  assert.match(eventOf(route, 'timeTrial:postingRead')?.payload?.text || '', /rock contact/i);
  const physical = route.runtime.getRuntimeState();
  assert.equal(physical.obstacleIds.length, route.course.obstacles.length);
  assert.ok(physical.obstacleIds.every((id) => route.state.entities.get(id)?.physicsBody?.dynamic === false));
  const result = await flyReferenceRun(route);
  assert.ok(result.medal === 'gold' || result.medal === 'silver', `slalom reference medal was ${result.medal}`);
  await assertCourseReplayRoundTrip(t, route, result, 9053);

  const contact = await boot(t, 5054, VESTA_FOUNDRY_SLALOM);
  while (!eventOf(contact, 'timeTrial:started')) {
    setInput(contact.state, referenceTimeTrialInput(contact.course, contact.player, 0, contact.state, contact.runtime.getRuntimeState()));
    contact.sim.step(DT);
  }
  while (currentExpectedGate(contact) < 3 && !eventOf(contact, 'timeTrial:invalidated')) {
    setInput(contact.state, referenceTimeTrialInput(
      contact.course, contact.player, currentExpectedGate(contact), contact.state, contact.runtime.getRuntimeState(),
    ));
    contact.sim.step(DT);
  }
  assert.equal(eventOf(contact, 'timeTrial:invalidated'), null);
  const rock = contact.state.entities.get(contact.runtime.getRuntimeState().obstacleIds[4]);
  const gateBehind = resolveTimeTrialPoint(contact.course, contact.course.gates[2].center, contact.state);
  while (Math.hypot(contact.player.pos.x - gateBehind.x, contact.player.pos.z - gateBehind.z) < 190
    && !eventOf(contact, 'timeTrial:invalidated')) {
    setInput(contact.state, referenceTimeTrialInput(
      contact.course, contact.player, currentExpectedGate(contact), contact.state, contact.runtime.getRuntimeState(),
    ));
    contact.sim.step(DT);
  }
  assert.equal(eventOf(contact, 'timeTrial:invalidated'), null);
  let healthBeforeImpact = null;
  let healthAtImpact = null;
  contact.bus.on('physics:impact', (payload) => {
    if ((payload.aId === contact.player.id && payload.bId === rock.id)
      || (payload.bId === contact.player.id && payload.aId === rock.id)) {
      healthAtImpact = { hull: contact.player.hull, armor: contact.player.armor, shield: contact.player.shield };
    }
  });
  for (let tick = 0; tick < 2400 && !eventOf(contact, 'timeTrial:invalidated'); tick++) {
    healthBeforeImpact = { hull: contact.player.hull, armor: contact.player.armor, shield: contact.player.shield };
    setInput(contact.state, steerToward(contact.player, rock.pos));
    contact.sim.step(DT);
  }
  assert.ok(eventsOf(contact, 'physics:impact').some(({ payload }) => (
    (payload.aId === contact.player.id && payload.bId === rock.id)
    || (payload.bId === contact.player.id && payload.aId === rock.id)
  )), `the slalom void comes from a real Rapier rock contact; invalidation=${JSON.stringify(eventOf(contact, 'timeTrial:invalidated')?.payload || null)} player=${JSON.stringify(contact.player.pos)} rock=${JSON.stringify(rock?.pos)}`);
  assert.equal(eventOf(contact, 'timeTrial:invalidated')?.payload?.reason, 'touched_obstacle');
  assert.deepEqual(healthAtImpact, healthBeforeImpact,
    'the exact Rapier course-rock contact leaves hull, armor, and shield byte-identical');
  setInput(contact.state, { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: true });
  contact.sim.step(DT);
  assert.deepEqual(
    { hull: contact.player.hull, armor: contact.player.armor, shield: contact.player.shield },
    healthBeforeImpact,
    'one complete post-impact production tick still leaves hull, armor, and shield byte-identical',
  );
});

test('Plan 50: Pallas Longline requires the live course anchor cut and finishes at physical sling speed', async (t) => {
  const route = await boot(t, 5055, PALLAS_MASSLINE_SLINGSHOT);
  while (!eventOf(route, 'timeTrial:started')) {
    setInput(route.state, referenceTimeTrialInput(route.course, route.player, 0, route.state, route.runtime.getRuntimeState()));
    route.sim.step(DT);
  }
  const anchorId = route.runtime.getRuntimeState().anchorId;
  const anchor = route.state.entities.get(anchorId);
  assert.equal(anchor?.type, 'asteroid');
  assert.equal(anchor?.physicsBody?.dynamic, false);
  route.bus.emit('tether:cut', { targetId: anchorId, speed: 999, slingshot: true, velocity: { x: 999, z: 0 } });
  assert.equal(route.runtime.getRuntimeState().run.slingshotRelease, null,
    'a bus-only cut without the live attachment cannot qualify');
  const result = await flyReferenceRun(route);
  const cut = eventsOf(route, 'tether:cut').find(({ payload }) => payload.targetId === anchorId && payload.slingshot === true);
  assert.ok(eventsOf(route, 'tether:latched').some(({ payload }) => payload.targetId === anchorId));
  assert.ok(cut, 'production tetherGameplay emits the exact qualifying course-anchor cut');
  assert.ok(cut.payload.speed >= route.player.maxSpeed * 1.4);
  assert.equal(eventsOf(route, 'timeTrial:slingshotQualified').length, 1);
  assert.ok(result.medal === 'gold' || result.medal === 'silver', `slingshot reference medal was ${result.medal}`);
  const replay = route.state.player.timeTrials.courses[route.course.id].bestReplay;
  assert.ok(replay.frames.some((frame) => frame.length > 5 && (frame[5] === 1 || frame[6] === 1)),
    'the ghost tape carries the real Massline latch/cut commands additively');
  await assertCourseReplayRoundTrip(t, route, result, 9055);
});

test('Plan 50: Anvil Rim is a live-planet silver skim and real storm depth voids the run', async (t) => {
  const route = await boot(t, 5056, TETHYS_ANVIL_SKIM);
  assert.equal(route.state.planet.active, true);
  assert.equal(route.state.planet.siteId, route.course.planetSiteId);
  const result = await flyReferenceRun(route);
  assert.ok(result.medal === 'gold' || result.medal === 'silver', `skim reference medal was ${result.medal}`);
  assert.equal(eventsOf(route, 'timeTrial:gatePassed').length, route.course.gates.length);
  await assertCourseReplayRoundTrip(t, route, result, 9056);

  const unsafe = await boot(t, 5057, TETHYS_ANVIL_SKIM);
  while (!eventOf(unsafe, 'timeTrial:started')) {
    setInput(unsafe.state, referenceTimeTrialInput(unsafe.course, unsafe.player, 0, unsafe.state, unsafe.runtime.getRuntimeState()));
    unsafe.sim.step(DT);
  }
  const center = unsafe.state.planet.center;
  for (let tick = 0; tick < 1800 && !eventOf(unsafe, 'timeTrial:invalidated'); tick++) {
    setInput(unsafe.state, steerToward(unsafe.player, center));
    unsafe.sim.step(DT);
  }
  assert.equal(eventOf(unsafe, 'timeTrial:invalidated')?.payload?.reason, 'unsafe_depth');
  assert.ok(['danger', 'reentry'].includes(eventOf(unsafe, 'timeTrial:invalidated')?.payload?.region)
    || eventOf(unsafe, 'timeTrial:invalidated')?.payload?.radius < unsafe.course.safety.minRadiusWU);
});
