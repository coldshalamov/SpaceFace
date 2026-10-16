import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { fields } from '../src/systems/fields.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ANVIL_ORCHARD, createOrchardRecord, orchardPhase } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY, orchardFrameBodySpec } from '../src/data/anvilOrchardBody.js';
import { ANVIL_ORCHARD_GUST_PROFILE, anvilOrchardGustGeometry } from '../src/data/environmentalMachinery.js';
import { applyFrameOrigin, snapFrameOrigin } from '../src/core/coordinates.js';
import { createOrchardMotorState } from '../src/core/anvilOrchardNative.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createAttachmentService, effectiveTetherPolicy } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

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

test('a released Orchard pod stays outside the gust through a native maximum-spool Leviathan escape', async () => {
  const wasEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({
    seed: 20261012,
    systems: [asteroidSites, fields, physics, environmentalMachinery],
    // This is the live production-relative service order for the owned path: environmental
    // scheduling -> field-kernel application -> SG-02 solve.
    updateOrder: [environmentalMachinery, fields, physics],
  });
  let native = null;
  try {
    const state = sim.state;
    state.mode = 'flight';
    state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    state.sites = { anvilOrchard: createOrchardRecord(0) };
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';

    const worker = sim.spawn({
      type: 'ship', isPlayer: false, pos: { x: 14000, z: 9000 }, radius: 8, mass: 24, hull: 100,
      data: {
        defId: 'ship_kestrel', fittings: [], anvilSlingWitness: true,
        itinerary: { kind: 'anvil_work', role: 'collector', phase: 'collect' },
      },
    });
    const frame = sim.spawn({
      type: 'wreck', pos: { x: 13200, z: 8300 }, rot: 0.713, radius: ORCHARD_GEOMETRY.radius,
      hull: 300, flags: { persistent: true }, physicsBody: orchardFrameBodySpec(),
      data: {
        orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame', worldRecordId: ORCHARD_GEOMETRY.worldRecordId,
        placeId: 'place_anvil_storm_orchard', authoredAssetId: ORCHARD_GEOMETRY.assetId,
        authoredPayloadAssetId: ORCHARD_GEOMETRY.assetId, masslineTetherable: false,
        orchardCollars: createOrchardMotorState(),
      },
    });
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
    const escapeAngle = 1.5; // a single side pocket, well outside the authored half-angle + soft edge
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
    let propulsionRuntime = createPropulsionRuntime(propulsionProfile);
    let maxObservedDriveAcceleration = 0;
    assert.ok(propulsionProfile.mainAccel > 0, 'the fitted Leviathan publishes a usable drive ceiling');

    const physicsFacade = sim.registry.get('physics');
    assert.equal(await physicsFacade.prepareBackend(state), true);
    if (physicsFacade._sg02Init) await physicsFacade._sg02Init;
    native = physicsFacade._sg02;
    assert.ok(native);
    // Seed the complete live roster through SG-02's ordinary entity reconciliation. The focused
    // harness has no sector activity broker; all subsequent motion comes only from native steps.
    native.syncFromEntities(state.entityList);
    assert.ok(native.records.has(frame.id) && native.records.has(worker.id) && native.records.has(tug.id));
    assert.equal(native.records.get(tug.id).spec.radius, leviathan.collisionRadius);

    const machine = sim.registry.get('environmentalMachinery');
    const fieldSystem = sim.registry.get('fields');
    assert.equal(machine.acceptOrchardNewPod(worker, {
      frame, socket: SOCKET, qty: ANVIL_ORCHARD.unitsPerPod, commodityId: ANVIL_ORCHARD.commodityId,
    }), ANVIL_ORCHARD.unitsPerPod);
    const lotId = state.sites.anvilOrchard.sockets[SOCKET].lotId;
    const pod = [...state.entities.values()].find(entity => entity?.data?.orchardKind === 'pod'
      && entity.data.worldRecordId === lotId);
    assert.ok(pod && native.records.has(pod.id));
    assert.equal(machine.requestOrchardRelease(frame, SOCKET), true);

    const towSpeed = 50;
    function nativeTick(tick) {
      state.tick = tick;
      state.simTime = tick / 60;
      machine.update(SIM_DT, state);
      fieldSystem.update(SIM_DT, state);
      const forwardSpeed = tug.vel.x * escapeDir.x + tug.vel.z * escapeDir.z;
      const driveStep = stepPropulsion({
        dt: SIM_DT,
        body: {
          pos: tug.pos, vel: tug.vel, rot: tug.rot, angVel: tug.angVel || 0,
          mass: tug.mass, inertia: Math.max(1, tug.inertia || tug.mass), radius: tug.radius,
        },
        input: { throttle: forwardSpeed < towSpeed ? 1 : 0, strafe: 0, turn: 0, assistMode: 'assisted' },
        profile: propulsionProfile,
        runtime: propulsionRuntime,
        environment: {},
      });
      propulsionRuntime = { ...driveStep.runtime };
      const driveAcceleration = Math.hypot(driveStep.force.x, driveStep.force.z) / tug.mass;
      maxObservedDriveAcceleration = Math.max(maxObservedDriveAcceleration, driveAcceleration);
      assert.ok(driveAcceleration <= propulsionProfile.mainAccel + 1e-4,
        `native tow control stays within the fitted Leviathan drive limit (${driveAcceleration} <= ${propulsionProfile.mainAccel})`);
      writePhysicsControl(tug, {
        source: 'orchard-safe-pocket-flight-kernel', mode: 'assisted',
        force: driveStep.force, torque: driveStep.torque, maxSpeed: driveStep.maxSpeed,
      });
      native.step(SIM_DT, tick);
      native.publishCompletedOrchardContacts(native.completedOrchardTail(), () => native.drainContactImpacts());
    }

    for (let tick = 1; tick <= ANVIL_ORCHARD.openingSteps; tick += 1) nativeTick(tick);
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
    let sampledSafeAcceleration = 0;
    const gustEndTick = firstGustTick + ANVIL_ORCHARD.gustTicks;

    function sampleActualGust(entity) {
      const liveField = fieldSystem.kernelList().find(field => field.id === ANVIL_ORCHARD_GUST_PROFILE.id);
      assert.ok(liveField, 'the saved phase registered the actual local gust before the native solve');
      return sampleFieldAcceleration(entity.pos, entity.vel, [liveField], state.simTime,
        fieldSystem._profileFor(entity, state), { ax: 0, az: 0 });
    }

    for (let tick = ANVIL_ORCHARD.openingSteps + 1; tick < gustEndTick; tick += 1) {
      nativeTick(tick);
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
    assert.ok(maxObservedDriveAcceleration > 0 && maxObservedDriveAcceleration <= propulsionProfile.mainAccel + 1e-4,
      'escape thrust was produced by the fitted flight kernel and bounded by its published acceleration');
    assert.equal(line.state, 'active');
    assert.ok(native.records.get(tug.id).body.isDynamic() && native.records.get(pod.id).body.isDynamic());
    // Scope is deliberately narrow: this is one side-offset escape orientation with no heat claim.
  } finally {
    sim.dispose();
    native?.dispose?.();
    FIELD_FLAGS.enabled = wasEnabled;
  }
});
