import test from 'node:test';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { world } from '../src/systems/world.js';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { fields } from '../src/systems/fields.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ANVIL_ORCHARD, createOrchardRecord, orchardPhase } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY } from '../src/data/anvilOrchardBody.js';
import { ANVIL_ORCHARD_GUST_PROFILE, anvilOrchardGustGeometry } from '../src/data/environmentalMachinery.js';
import { applyFrameOrigin, snapFrameOrigin } from '../src/core/coordinates.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createAttachmentService, effectiveTetherPolicy } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; },
  upsertWorldRecord: world.upsertWorldRecord };
const SOCKET = 1;

function worldPodSocket(frame) {
  const slot = ORCHARD_GEOMETRY.pods[SOCKET];
  const c = Math.cos(frame.rot), s = Math.sin(frame.rot);
  return {
    x: frame.pos.x + c * slot.pos.x - s * slot.pos.z,
    z: frame.pos.z + s * slot.pos.x + c * slot.pos.z,
  };
}

function rotateFromAxis(axis, angle) {
  return {
    x: Math.cos(angle) * axis.x - Math.sin(angle) * axis.z,
    z: Math.sin(angle) * axis.x + Math.cos(angle) * axis.z,
  };
}

function angleToDirection(point, center, direction) {
  const dx = point.x - center.x, dz = point.z - center.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 1e-9) return 0;
  const dot = (dx * direction.x + dz * direction.z) / distance;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

// Bounded acceptance: pre-established maximum tow, not acquisition/reel-out or a
// browser/player-feel test. Native setup opens/connects a finite pod. Every measured
// motion thereafter uses raw throttle input and the ordinary simulation owner order.
for (const scenario of [
  { name: 'outward side-clear escape remains outside heat bands through a complete gust', angle: 0.65, safe: true },
  { name: 'tangential side-clear escape is hazardous despite a cold distant hull', angle: 1.5, safe: false },
]) test(`authored maximum-spool Leviathan: ${scenario.name}`, async () => {
  const wasEnabled = FIELD_FLAGS.enabled, wasPlanetEnabled = PLANET_FLAGS.enabled;
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({
    seed: 20261012,
    systems: [worldRecords, asteroidSites, input, flightV3, fields, planetRuntime, physics, environmentalMachinery],
  });
  let native = null;
  try {
    const state = sim.state;
    state.mode = 'flight';
    state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    state.sites.anvilOrchard = createOrchardRecord(0);
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';

    const worker = sim.spawn({
      type: 'ship', isPlayer: false, pos: { x: 14000, z: 9000 }, radius: 8, mass: 24, hull: 100,
      data: {
        defId: 'ship_kestrel', fittings: [], anvilSlingWitness: true,
        itinerary: { kind: 'anvil_work', role: 'collector', phase: 'collect' },
      },
    });
    const planet = sim.registry.get('planetRuntime');
    planet.update(SIM_DT, state);
    const frame = state.entities.get(state.planet.orchardFrameId);
    assert.ok(frame, 'ordinary planet adapter authors the frame');
    assert.ok(Math.abs(Math.hypot(frame.pos.x-state.planet.center.x, frame.pos.z-state.planet.center.z)
      - (PLANET_SITE.bands.skim + PLANET_SITE.bands.sling)/2) < 1e-8);
    applyFrameOrigin(state, snapFrameOrigin(worker.pos, {}));

    const leviathan = SHIPS.find(def => def.id === 'ship_leviathan');
    const capitalSpool = MODULES.find(def => def.id === 'mod_massline_spool_l');
    const standardTether = ATTACHMENT_DEFS.find(def => def.id === 'tether_standard');
    assert.ok(leviathan && capitalSpool && standardTether);
    assert.equal(leviathan.collisionRadius, 45, 'use the catalog Leviathan hull');
    const fittings = fittingsFromDefaultModules(leviathan.id, [capitalSpool.id]);
    const spoolLength = standardTether.maxLength * capitalSpool.mods.tetherSpoolMult;
    assert.equal(spoolLength, 2340, 'derive the capital spool ceiling from the catalog');

    const geometry = anvilOrchardGustGeometry(frame);
    const escapeAngle = scenario.angle;
    const escapeDir = rotateFromAxis(geometry.dir, escapeAngle);
    const podSocket = worldPodSocket(frame);
    const tug = sim.spawn(makeShipEntitySpec(leviathan.id, {
      isPlayer: true,
      fittings,
      pos: { x: podSocket.x + escapeDir.x * spoolLength, z: podSocket.z + escapeDir.z * spoolLength },
      // The test flies a normal forward-thrust escape, so the capital torch points along it.
      rot: Math.atan2(escapeDir.z, escapeDir.x),
    }));
    state.playerId = tug.id;
    const propulsionProfile = resolvePropulsionProfile(tug, state);
    assert.ok(propulsionProfile.mainAccel > 0, 'the fitted Leviathan publishes a usable drive ceiling');

    const physicsFacade = sim.registry.get('physics');
    assert.equal(await physicsFacade.prepareBackend(state), true);
    if (physicsFacade._sg02Init) await physicsFacade._sg02Init;
    native = physicsFacade._sg02;
    assert.ok(native);
    // Setup the pre-established maximum tow before handing motion to ordinary sim.step.
    native.syncFromEntities(state.entityList);
    assert.ok(native.records.has(frame.id) && native.records.has(worker.id) && native.records.has(tug.id));
    assert.equal(native.records.get(tug.id).spec.radius, leviathan.collisionRadius);

    const machine = sim.registry.get('environmentalMachinery');
    const fieldSystem = sim.registry.get('fields');
    const planetWell = fieldSystem.kernelList().find(field => field.id === state.planet.fieldId);
    assert.ok(planetWell, 'canonical planet field is registered');
    for (const key of ['radius','strength','falloff','innerRadius','innerSoft'])
      assert.equal(planetWell[key], PLANET_SITE.field[key], `unchanged canonical ${key}`);
    assert.deepEqual(planetWell.center, state.planet.center);
    const platform = ORCHARD_GEOMETRY.parts.find(part => part.id === 'safe-platform');
    assert.ok(platform);
    for (const [x,z] of platform.points) {
      const px = frame.pos.x + Math.cos(frame.rot)*x - Math.sin(frame.rot)*z;
      const pz = frame.pos.z + Math.sin(frame.rot)*x + Math.cos(frame.rot)*z;
      assert.ok(Math.hypot(px-state.planet.center.x,pz-state.planet.center.z) > PLANET_SITE.bands.skim,
        'authored service slab itself is outside the heating band');
    }
    assert.equal(machine.acceptOrchardNewPod(worker, {
      frame, socket: SOCKET, qty: ANVIL_ORCHARD.unitsPerPod, commodityId: ANVIL_ORCHARD.commodityId,
    }), ANVIL_ORCHARD.unitsPerPod);
    const lotId = state.sites.anvilOrchard.sockets[SOCKET].lotId;
    const pod = [...state.entities.values()].find(entity => entity?.data?.orchardKind === 'pod'
      && entity.data.worldRecordId === lotId);
    assert.ok(pod && native.records.has(pod.id));
    assert.equal(machine.requestOrchardRelease(frame, SOCKET), true);

    const towSpeed = 50;
    let maxObservedDriveAcceleration = 0;
    const keys = sim.registry.get('input');
    function ordinaryTick(tick) {
      const forwardSpeed = tug.vel.x * escapeDir.x + tug.vel.z * escapeDir.z;
      applyFlightKeyEvent(keys, { code: 'KeyW', pressed: forwardSpeed < towSpeed });
      sim.step();
      assert.equal(state.tick, tick);
      const drive = readPhysicsTelemetry(tug);
      assert.ok(drive && drive.tick === tick, 'ordinary native owner publishes current flight control');
      const acceleration = Math.hypot(drive.force.x, drive.force.z) / drive.mass;
      maxObservedDriveAcceleration = Math.max(maxObservedDriveAcceleration,acceleration);
      assert.ok(acceleration <= propulsionProfile.mainAccel + 1e-4, 'raw flight respects fitted acceleration ceiling');
    }

    for (let tick = 1; tick <= ANVIL_ORCHARD.openingSteps; tick += 1) {
      state.tick = tick; state.simTime = tick / 60;
      machine.update(SIM_DT, state); native.step(SIM_DT, tick);
      native.publishCompletedOrchardContacts(native.completedOrchardTail(), () => native.drainContactImpacts());
    }
    const fixedOpen = state.sites.anvilOrchard.sockets[SOCKET];
    assert.equal(fixedOpen.operation, 'open');
    assert.equal(fixedOpen.handoff, 'fixed');
    assert.equal(native.records.get(pod.id).body.isFixed(), true);

    const handoff = native.prepareOrchardPodHandoff(frame, pod, SOCKET, state);
    assert.ok(handoff && handoff.preflight());
    assert.equal(handoff.commit(), true);
    const released = state.sites.anvilOrchard.sockets[SOCKET];
    assert.equal(released.status, 'drifting');
    assert.equal(released.handoff, 'ready');
    assert.equal(pod.data.masslineTetherable, true);
    assert.equal(native.records.get(pod.id).body.isDynamic(), true);
    assert.ok(physicsFacade.readOrchardPodReady(pod, state));
    const initialPull = sampleFieldAcceleration(pod.pos,pod.vel,[planetWell],state.simTime,
      fieldSystem._profileFor(pod,state),{ax:0,az:0});
    assert.ok(Math.hypot(initialPull.ax,initialPull.az)>1, 'released pod is exposed to real canonical pull');

    ensureCombatState(state);
    const attachments = createAttachmentService({
      state, bus: sim.bus, catalog: createCombatCatalog(), helpers: sim.helpers,
    });
    const created = attachments.create({
      defId: standardTether.id, ownerId: tug.id, targetId: pod.id,
      sourceWorld: { x: tug.pos.x, z: tug.pos.z }, targetWorld: { x: pod.pos.x, z: pod.pos.z },
    });
    assert.equal(created.ok, true, `normal attachment service rejected the released pod: ${created.reason}`);
    const line = created.attachment;
    const policy = effectiveTetherPolicy(standardTether, tug);
    assert.equal(policy.maxLength, spoolLength);
    assert.equal(line.restLength, spoolLength, 'the deployed native line is at its catalogued maximum spool');
    assert.equal(native.attachments.has(line.id), true, 'the constraint is resident in the actual native owner');

    const anchorTick = state.sites.anvilOrchard.phaseAnchorTick;
    const firstGustTick = anchorTick + ANVIL_ORCHARD.calmTicks + ANVIL_ORCHARD.forecastTicks;
    assert.equal(firstGustTick, 720);
    const firstForecastTick = firstGustTick - 1;
    const initialTug = { x: tug.pos.x, z: tug.pos.z };
    const initialPod = { x: pod.pos.x, z: pod.pos.z };
    let tugAtFirstGust = null;
    let minAngularMargin = Infinity;
    let maxNativeTowDistance = 0;
    let minPodRadius = Infinity, minHullRadius = Infinity;
    let sampledSafeAcceleration = 0;
    const gustEndTick = firstGustTick + ANVIL_ORCHARD.gustTicks;

    function sampleActualGust(entity) {
      const liveField = fieldSystem.kernelList().find(field => field.id === ANVIL_ORCHARD_GUST_PROFILE.id);
      assert.ok(liveField, 'the saved phase registered the actual local gust before the native solve');
      return sampleFieldAcceleration(entity.pos, entity.vel, [liveField], state.simTime,
        fieldSystem._profileFor(entity, state), { ax: 0, az: 0 });
    }

    for (let tick = state.tick + 1; tick < gustEndTick; tick += 1) {
      ordinaryTick(tick);
      const center = state.planet.center;
      minPodRadius = Math.min(minPodRadius, Math.hypot(pod.pos.x-center.x, pod.pos.z-center.z)-pod.radius);
      minHullRadius = Math.min(minHullRadius, Math.hypot(tug.pos.x-center.x, tug.pos.z-center.z)-tug.radius);
      if (tick === ANVIL_ORCHARD.openingSteps + 1) {
        assert.ok(fieldSystem._affectedIds.has(pod.id), 'ordinary field owner admits the released pod');
        assert.ok(state.fields.telemetry.appliedAccelSum > 0, 'canonical well delivers real impulses');
      }
      if (!scenario.safe && minPodRadius < PLANET_SITE.bands.danger) {
        assert.equal(state.planet.player.heat,0,'distant hull staying cold does not protect its pod');
        assert.ok(state.planet.ships[pod.id]?.heat > 0,
          'the same ordinary planetary owner heats the exposed pod independently of the cold tug');
        assert.ok(line.state === 'active');
        console.log('HAZARDOUS_TOW', JSON.stringify({tick,minPodRadius,minHullRadius,podHeat:state.planet.ships[pod.id].heat,tugHeat:state.planet.player.heat}));
        return;
      }
      if (tick === firstForecastTick) {
        assert.deepEqual(orchardPhase(state.sites.anvilOrchard, tick), { phase: 'forecast', remainingTicks: 1 });
        assert.equal(fieldSystem.hasExternal(ANVIL_ORCHARD_GUST_PROFILE.id), false);
      }
      if (tick < firstGustTick) continue;

      if (tick === firstGustTick) {
        assert.deepEqual(orchardPhase(state.sites.anvilOrchard, tick), { phase: 'gust', remainingTicks: ANVIL_ORCHARD.gustTicks });
        assert.equal(fieldSystem.hasExternal(ANVIL_ORCHARD_GUST_PROFILE.id), true,
          'environmental machinery registers before fields samples the first gust tick');
        tugAtFirstGust = { x: tug.pos.x, z: tug.pos.z };
      }

      const currentGeometry = anvilOrchardGustGeometry(frame);
      const outsideConeLimit = ANVIL_ORCHARD_GUST_PROFILE.halfAngleRad + ANVIL_ORCHARD_GUST_PROFILE.edgeSoftRad;
      const tugAngle = angleToDirection(tug.pos, currentGeometry.center, currentGeometry.dir);
      const podAngle = angleToDirection(pod.pos, currentGeometry.center, currentGeometry.dir);
      minAngularMargin = Math.min(minAngularMargin, tugAngle - outsideConeLimit, podAngle - outsideConeLimit);
      assert.ok(tugAngle > outsideConeLimit && podAngle > outsideConeLimit,
        `both native endpoints stay outside the cone on tick ${tick}: ${tugAngle}, ${podAngle}`);

      const tugAcceleration = sampleActualGust(tug);
      const podAcceleration = sampleActualGust(pod);
      sampledSafeAcceleration = Math.max(sampledSafeAcceleration,
        Math.hypot(tugAcceleration.ax, tugAcceleration.az), Math.hypot(podAcceleration.ax, podAcceleration.az));
      assert.equal(Math.hypot(tugAcceleration.ax, tugAcceleration.az), 0,
        `the registered kernel predicts no local gust at the Leviathan on tick ${tick}`);
      assert.equal(Math.hypot(podAcceleration.ax, podAcceleration.az), 0,
        `the registered kernel predicts no local gust at the released pod on tick ${tick}`);

      const telemetry = native.getAttachmentTelemetry({ attachmentId: line.id, tick });
      assert.ok(telemetry, `the native max-spool tow remains resident on tick ${tick}`);
      assert.equal(telemetry.restLength, spoolLength);
      maxNativeTowDistance = Math.max(maxNativeTowDistance, telemetry.distance);
      assert.ok(telemetry.distance <= spoolLength * standardTether.spring.maxStretchRatio + 1,
        `native line remains within its authored stretch envelope on tick ${tick}`);
    }

    assert.ok(scenario.safe, 'tangential control must demonstrate entry into the dangerous band');
    assert.equal(state.tick, gustEndTick - 1, 'the proof spans the complete 300-tick active gust');
    assert.equal(orchardPhase(state.sites.anvilOrchard, state.tick).remainingTicks, 1);
    const tugDisplacement = Math.hypot(tug.pos.x - initialTug.x, tug.pos.z - initialTug.z);
    const podDisplacement = Math.hypot(pod.pos.x - initialPod.x, pod.pos.z - initialPod.z);
    const activeEscapeProgress = (tug.pos.x - tugAtFirstGust.x) * escapeDir.x
      + (tug.pos.z - tugAtFirstGust.z) * escapeDir.z;
    assert.ok(tugDisplacement > 400, `native hull escape motion was observed (${tugDisplacement.toFixed(1)} WU)`);
    assert.ok(podDisplacement > 5, `native tow moved the released pod (${podDisplacement.toFixed(1)} WU)`);
    assert.ok(activeEscapeProgress > 75, `the hull continues escaping during gust (${activeEscapeProgress.toFixed(1)} WU)`);
    assert.ok(minAngularMargin > 0.1, `minimum endpoint clearance from the gust wedge: ${minAngularMargin}`);
    assert.equal(sampledSafeAcceleration, 0);
    assert.ok(maxNativeTowDistance > spoolLength, 'the native line carries real stretch under load');

    assert.ok(maxObservedDriveAcceleration > 0);
    assert.equal(line.state, 'active');
    assert.ok(native.records.get(tug.id).body.isDynamic() && native.records.get(pod.id).body.isDynamic());
    console.log('AUTHORED_TOW', JSON.stringify({minPodRadius, minHullRadius, heat:state.planet.player.heat, podPos:pod.pos}));
    assert.ok(minPodRadius > PLANET_SITE.bands.skim, 'whole pod remains outside the heating band');
    assert.ok(minHullRadius > PLANET_SITE.bands.skim, 'whole hull remains outside the heating band');
    assert.equal(state.planet.player.heat, 0);
    assert.equal(state.planet.ships[pod.id]?.heat ?? 0, 0, 'unexposed pod stays cold; untouched cold pods need no thermal record');
    assert.equal(pod.orchardThermalExposure?.heat ?? 0, 0, 'no persistent thermal exposure is invented outside the heating band');
  } finally {
    sim.dispose();
    native?.dispose?.();
    FIELD_FLAGS.enabled = wasEnabled; PLANET_FLAGS.enabled = wasPlanetEnabled;
  }
});
