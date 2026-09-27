// Production presentation owners with small deterministic demonstration inputs; no copied recipes.
import * as THREE from 'three';
import { vfx } from '../../src/render/vfx.js';
import { QuarksVfxSystem } from '../../src/render/vfx/quarksSystem.js';
import { PlasmaStreamSystem } from '../../src/render/thruster/systems/plasmaStream.js';
import { resolveVfxAccessibilityProfile } from '../../src/render/vfxAccessibility.js';

export const GAMEPLAY_TOOL_SCENARIOS = Object.freeze({
  'tool-extract': 4.2, 'tool-cut': 4.2, 'tool-repair': 4.2, 'tool-transfer': 4.2,
  'massline-loaded': 4.8, 'massline-snap': 4.8, 'massline-release': 4.8,
  'massline-release-arc': 4.8, 'massline-swing': 4.8, 'massline-monofilament': 4.8,
  'massline-apex': 4.8, 'massline-snarl': 5.2,
  propulsion: 6.2, 'propulsion-reverse': 4.4, 'propulsion-lateral': 4.4,
  'propulsion-yaw-brake': 4.4, 'propulsion-dash': 3.6,
});
const NOOP = () => {};
const STEP = 1 / 60;
const MASSLINE_TETHER_SCENARIOS = new Set([
  'massline-loaded', 'massline-snap', 'massline-release', 'massline-release-arc',
  'massline-swing', 'massline-monofilament', 'massline-apex', 'massline-snarl',
]);
const MASSLINE_RELEASE_ARC_SCENARIOS = new Set(['massline-release-arc', 'massline-apex']);
const MASSLINE_SWING_SCENARIOS = new Set(['massline-swing', 'massline-monofilament', 'massline-apex']);
const NATIVE_PROPULSION_SCENARIOS = new Set([
  'propulsion-reverse', 'propulsion-lateral', 'propulsion-yaw-brake', 'propulsion-dash',
]);

/** Mount once; reset({scenario,seed,time,targetId}) after placing the authored context meshes.
 * Advance the caller's state.simTime, then update(dt). Inputs live in private entity copies.
 * Propulsion moves shipMesh and clean release moves targetMesh; reset restores the caller's poses.
 * getShipBlueprint supplies authored engine marker transforms; otherwise the shipping radius
 * fallback is used and explicitly reported by inspect(). Do not call full vfx.update as well.
 */
export function createGameplayTools({ scene, camera, state, shipMesh, targetMesh, renderer = null,
  getShipBlueprint = null, viewportHeight = 720 }) {
  if (!scene || !camera || !state || !shipMesh || !targetMesh) throw new Error('Tools lab needs scene, state, camera and authored meshes');
  const root = new THREE.Group(); root.name = 'ProductionToolVfx'; scene.add(root);
  const entities = new Map();
  const privateState = { ...state, mode: 'flight', simTime: 0, entities,
    settings: state.settings || { video: {}, accessibility: {} },
    player: { ...(state.player || {}), tether: { active: false }, remoteMassline: null },
    combat: { ...(state.combat || {}), attachments: { ...(state.combat?.attachments || {}), byId: {} } },
    massline2: { ...(state.massline2 || {}), throw: { ...(state.massline2?.throw || {}) } },
    runtime: { ...(state.runtime || {}), features: {
      ...(state.runtime?.features || {}),
      massline2: {
        ...(state.runtime?.features?.massline2 || {}),
        enabled: true,
        masslineHeadMonofilamentSweep: true,
      },
    } },
    render: { ...state.render, scene: root, camera, renderer, interpolationAlpha: 1,
      viewport: { height: viewportHeight } },
  };
  const owner = Object.create(vfx);
  // Keep real tool/cable and common transient pools. Unrelated live game systems are not mounted.
  for (const name of ['_ensureOverflowJets', '_initRibbonTrails', '_initArcPreview',
    '_initDockingCradle', '_initTargetContour', '_initSeamMarkers',
    '_initCombatBeams', '_initFieldGeometry']) owner[name] = NOOP;
  const quarks = new QuarksVfxSystem(); quarks.attach(root);
  owner._initWeaponPresenter = function initToolDebris() {
    this._weaponPresenter = { quarks, dispose: () => quarks.dispose() };
  };
  owner.init({ state: privateState, bus: { on: () => NOOP, off: NOOP, emit: NOOP },
    helpers: { player: () => entities.get(privateState.playerId) || null } });
  const propulsion = new PlasmaStreamSystem(THREE); propulsion.attach(root); propulsion.setCamera(camera);
  const sockets = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }));
  const liveSockets = [];
  const socketPoint = new THREE.Vector3();
  const drive = { drive: 0, throttle: 0, boost: 0, speed: 0, speedDrive: 0 };
  const a11y = { reducedMotion: false, reducedFlash: false };
  const shipBase = new THREE.Vector3(), targetBase = new THREE.Vector3();
  let ship, target, snarlLink = null, markers = [], scenario = 'idle', seed = 17, randomState = seed;
  let born = 0, clock = 0, accumulated = 0, contactAt = 0, released = false, dashFired = false, disposed = false;
  let stage = 'idle';
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  function seeded(call) {
    const ambient = Math.random;
    try { Math.random = random; return call(); } finally { Math.random = ambient; }
  }
  function sync() {
    privateState.settings = state.settings || privateState.settings;
    privateState.world = state.world;
    const profile = resolveVfxAccessibilityProfile(privateState.settings);
    a11y.reducedMotion = !!privateState.settings.video?.motionReduce || profile.id.includes('motion');
    a11y.reducedFlash = profile.flashOpacityScale < 1;
    owner._gas.setAccessibility(profile);
    return profile;
  }
  function publish(dt) {
    owner._integrateParticles(dt); owner._integrateSprites(dt); owner._integrateTrailStreaks(dt);
    owner._decayEventLights(dt); owner._gas.update(clock, camera);
    // These presentation owners normally run from vfx.update(). The lab advances the
    // production mining/rope paths directly so it can keep its deterministic fixture small;
    // explicitly step the companion owners here as well so each scenario exercises the same
    // native lifecycle and mesh publication as shipping gameplay.
    if (scenario.startsWith('massline-')) {
      owner._updateMasslineSwingTrace?.(dt);
      owner._updateMonofilamentBlade?.();
      owner._updateApexFlare?.(dt);
      if (owner._masslineReleaseArcActive?.()) owner._updateMasslineReleaseArc?.(dt);
      owner._tetherWebFx?.update(privateState);
      if (scenario === 'massline-snarl' && !released) {
        for (const key of ['mesh', 'glow', 'band', 'anchorCore']) {
          if (owner._tetherCable[key]) owner._tetherCable[key].visible = false;
        }
      }
    }
    if (NATIVE_PROPULSION_SCENARIOS.has(scenario)) owner._updateEnergy?.(dt);
    quarks.update(dt, sync());
  }
  function copyEntity(entity, fallbackId, mesh, type) {
    return { ...(entity || {}), id: entity?.id ?? fallbackId, type: entity?.type || type, alive: true,
      pos: { x: entity?.pos?.x ?? mesh.position.x, z: entity?.pos?.z ?? mesh.position.z },
      vel: { x: 0, z: 0 }, rot: entity?.rot || 0, radius: entity?.radius || (type === 'ship' ? 8 : 11),
      data: { ...(entity?.data || {}) }, prevPos: null, prevRot: undefined,
    };
  }
  function place(mesh, entity, y) {
    mesh.position.set(entity.pos.x, y, entity.pos.z);
    if (mesh === shipMesh) mesh.rotation.y = -entity.rot;
    mesh.updateMatrixWorld(true);
  }
  function reset(options = {}) {
    if (disposed) return;
    scenario = options.scenario || 'idle';
    if (scenario !== 'idle' && !GAMEPLAY_TOOL_SCENARIOS[scenario]) throw new Error(`Unknown tool scenario ${scenario}`);
    seed = Number.isFinite(options.seed) ? options.seed >>> 0 : seed; randomState = seed;
    born = clock = Number.isFinite(options.time) ? options.time : 0; accumulated = 0;
    dashFired = false;
    privateState.input = { moveZ: 0, moveX: 0, turnIntent: 0 };
    privateState.simTime = clock; privateState.tick = 0; owner._t = clock;
    released = false; contactAt = 0.18; stage = scenario === 'idle' ? 'idle' : 'build';
    owner._admissionSerial = seed; quarks._flowSequence = seed;
    while (owner._liveCount) owner._retireParticle(owner._activeParticles[owner._liveCount - 1]);
    while (owner._liveSpriteCount) owner._retireSprite(owner._activeSprites[owner._liveSpriteCount - 1]);
    owner._clearTrailStreaks(); for (const light of owner._lights) owner._retireEventLightSlot(light);
    owner._gas.clear(); quarks.reset(); propulsion.reset();
    propulsion._time = 0; propulsion._boostBlend = 0; propulsion._lastDrive = 0; propulsion._lastBoost = 0;
    owner._hideEnergyPlumes?.();
    owner._plumeDashPending = false;
    // Shipping reset keeps a monotonic history clock. A laboratory replay starts a new clock;
    // otherwise float birth-time rounding can retire one different sample on the second replay.
    for (const trail of propulsion._trails) { trail._now = 0; trail.material.uniforms.uNow.value = 0; }
    const beam = owner._miningBeam; beam.active = false; beam.release = 0; beam.attack = 0; beam.time = 0;
    beam.mesh.visible = beam.glow.visible = false; beam.shaderShared.power.value = 0; beam.shaderShared.time.value = 0;
    const cable = owner._tetherCable;
    Object.assign(cable, { wasActive: false, lastSourceId: null, lastTargetId: null, lastAttachmentId: null,
      fade: 0, latchAge: 999, snapAge: 999, loadSmooth: 0, strainSmooth: 0, reelGlow: 0, sparkAcc: 0,
      stressFlashAt: -1, stressFlashEnd: false });
    for (const key of ['mesh', 'glow', 'band', 'anchorCore']) if (cable[key]) cable[key].visible = false;
    owner._resetMasslineReleaseToken();
    owner._resetMasslineReleaseArc?.();
    owner._resetMasslineSwingTrace?.();
    owner._resetMonofilamentBlade?.();
    owner._resetApexFlare?.();
    Object.assign(owner._lastMasslineReleaseVfx, { stage: 'idle', targetId: null, endpointCount: 0,
      classification: null, releaseScore: 0, velocityAxisX: 0, velocityAxisZ: 0, cameraTargetRequested: false });
    privateState.combat.attachments.byId = {};
    snarlLink = null;
    owner._tetherWebFx?.update(privateState);
    const throwState = privateState.massline2.throw;
    Object.assign(throwState, {
      armed: false, releaseTarget: null,
      solution: { valid: false, onSolution: false, predicted: null, timeToSolution: 0 },
    });
    const shipId = state.playerId ?? 1, targetId = options.targetId ?? 2;
    ship = copyEntity(state.entities?.get(shipId), shipId, shipMesh, 'ship');
    target = copyEntity(state.entities?.get(targetId), targetId, targetMesh, 'asteroid');
    if (ship.id === target.id) throw new Error('Tool demonstration needs distinct source and target entities');
    privateState.playerId = ship.id; entities.clear(); entities.set(ship.id, ship); entities.set(target.id, target);
    privateState.entityList = [ship, target];
    shipBase.set(ship.pos.x, shipMesh.position.y, ship.pos.z);
    targetBase.set(target.pos.x, targetMesh.position.y, target.pos.z);
    place(shipMesh, ship, shipBase.y); place(targetMesh, target, targetBase.y);
    const blueprint = typeof getShipBlueprint === 'function' ? getShipBlueprint() : null;
    markers = (blueprint?.markers || []).filter(marker => (marker.tags?.socket || /^SOCKET_/i.test(marker.name || ''))
      && /engine|thruster|exhaust|drive/i.test(`${marker.name} ${marker.tags?.socketRole || ''}`)
      && !/rcs|retro|reverse|lateral/i.test(marker.name || '')).slice(0, 4);
    sync();
    seeded(() => {
      if (scenario.startsWith('tool-')) owner._onMiningStart({ targetId: target.id, verb: scenario.slice(5) });
      const tetherScenario = MASSLINE_TETHER_SCENARIOS.has(scenario);
      const releaseArcScenario = MASSLINE_RELEASE_ARC_SCENARIOS.has(scenario);
      privateState.player.tether = { active: tetherScenario, targetId: target.id,
        attachmentId: scenario === 'massline-snarl' ? `lab-snarl-${seed}` : `lab-line-${seed}`,
        restLength: Math.hypot(target.pos.x - ship.pos.x, target.pos.z - ship.pos.z) + 6,
        load: 0.12, strain: 0, phase: 'slack', reeling: false,
        headId: scenario === 'massline-monofilament' ? 'monofilament_sweep' : null };
      if (releaseArcScenario) {
        throwState.armed = true;
        throwState.releaseTarget = {
          kind: 'entity', source: 'lab-release-predictor', targetId: target.id,
          pos: { ...target.pos }, radius: target.radius,
        };
        throwState.solution = {
          valid: true, onSolution: true, predicted: { x: target.pos.x + 3, z: target.pos.z - 2 },
          timeToSolution: 0.42, proximity: 0.82,
        };
      }
      if (tetherScenario) {
        owner._updateTetherCable(0); owner._onTetherLatch({ targetId: target.id });
      }
      if (scenario.startsWith('propulsion')) { ship.pos.z += 18; place(shipMesh, ship, shipBase.y); }
      if (scenario === 'massline-snarl') {
        snarlLink = {
          id: `lab-snarl-${seed}`, defId: 'attachment_snarl', state: 'active',
          ownerId: ship.id, controllerId: ship.id, targetId: target.id,
          restLength: Math.hypot(target.pos.x - ship.pos.x, target.pos.z - ship.pos.z) + 4,
          createdTick: 0,
        };
        privateState.combat.attachments.byId[snarlLink.id] = snarlLink;
      }
      publish(0);
    });
  }
  function stepTool(dt, age) {
    if (!released && age >= 2.4) { owner._onMiningStop(); released = true; }
    owner._updateMiningBeam(dt);
    if (!released && scenario === 'tool-extract' && age >= contactAt) {
      contactAt += 0.24;
      const end = owner._miningBeam.shaderShared.end.value;
      const origin = privateState.world?.frameOrigin;
      owner._onMiningTick({ pos: { x: end.x + (origin?.x || 0), z: end.z + (origin?.z || 0) },
        oreType: target.data.typeId || 'iron', sourceEntityId: ship.id });
    }
    stage = released ? (owner._miningBeam.mesh.visible ? 'release' : 'dead') : age < 0.15 ? 'build' : 'working';
  }
  function stepMassline(dt, age) {
    if (scenario === 'massline-snarl') {
      const tether = privateState.player.tether;
      if (snarlLink) {
        // createdTick is the native formation clock. Keep the receipt's original tick so the
        // braid has one real take-up and then settles instead of being re-formed every frame.
        if (!released) {
          const distance = Math.hypot(target.pos.x - ship.pos.x, target.pos.z - ship.pos.z);
          snarlLink.restLength = distance + 4 + Math.sin(age * 2.4) * 2;
          tether.load = Math.min(0.92, 0.16 + age * 0.24);
          tether.strain = Math.min(0.88, Math.max(0, (tether.load - 0.4) * 1.45));
          tether.phase = age < 0.5 ? 'capture' : 'loaded';
          if (age >= 3.6) {
            // The lab has no attachment service/bus, so publish the same native break identity to
            // the production owner before retaining the record as broken history. This gives the
            // web its real terminal state and lets the owner hold the cable recoil through its
            // normal fade instead of leaving an active braid at the end of the clip.
            const receipt = { sourceId: ship.id, ownerId: ship.id, targetId: target.id,
              attachmentId: snarlLink.id, reason: 'engineered_break' };
            owner._onTetherSnap(receipt);
            snarlLink.state = 'broken';
            snarlLink.brokenTick = privateState.tick;
            snarlLink.breakReason = receipt.reason;
            tether.active = false;
            released = true;
            target.vel.x = 12;
            target.vel.z = -5;
          }
        }
      }
      if (released) {
        target.pos.x += target.vel.x * dt; target.pos.z += target.vel.z * dt;
        target.prevPos = { x: target.pos.x - target.vel.x * dt, z: target.pos.z - target.vel.z * dt };
        place(targetMesh, target, targetBase.y);
      }
      owner._updateTetherCable(dt);
      // Snarl's braided web is the active presentation. The ordinary cable owner is retained as
      // the break tail only, preventing two unrelated live lines from competing during tension.
      if (!released) {
        for (const key of ['mesh', 'glow', 'band', 'anchorCore']) {
          if (owner._tetherCable[key]) owner._tetherCable[key].visible = false;
        }
      }
      stage = released ? (owner._tetherCable.fade > 0 ? 'release' : 'dead')
        : age < 0.5 ? 'formation' : 'tension';
      return;
    }
    const tether = privateState.player.tether;
    if (!released) {
      tether.load = Math.min(0.86, 0.12 + age * 0.54);
      tether.phase = age < 0.3 ? 'capture' : 'loaded';
      if (MASSLINE_SWING_SCENARIOS.has(scenario)) {
        const previousX = target.pos.x, previousZ = target.pos.z;
        const orbitRadius = Math.max(30, Math.hypot(targetBase.x - shipBase.x, targetBase.z - shipBase.z) * 0.72);
        const angularSpeed = 1.65;
        const angle = 0.2 + age * angularSpeed;
        target.pos.x = ship.pos.x + Math.cos(angle) * orbitRadius;
        target.pos.z = ship.pos.z + Math.sin(angle) * orbitRadius;
        target.vel.x = (target.pos.x - previousX) / Math.max(dt, STEP);
        target.vel.z = (target.pos.z - previousZ) / Math.max(dt, STEP);
        target.prevPos = { x: previousX, z: previousZ };
        place(targetMesh, target, targetBase.y);
      } else {
        target.vel.x = 0;
        target.vel.z = 0;
      }
      tether.restLength = Math.hypot(target.pos.x - ship.pos.x, target.pos.z - ship.pos.z) + Math.max(0, 6 - age * 7);
      const releaseAt = (scenario === 'massline-loaded' || scenario === 'massline-swing'
        || scenario === 'massline-monofilament') ? 3.6 : 2.2;
      if (age >= releaseAt) {
        const receipt = { sourceId: ship.id, targetId: target.id, attachmentId: tether.attachmentId };
        tether.active = false; released = true;
        if (scenario === 'massline-snap') owner._onTetherSnap({ ...receipt, reason: 'engineered_break' });
        else {
          target.vel.x = 24; target.vel.z = -9;
          owner._onTetherRelease(receipt);
          owner._onTetherReleaseRated({ ...receipt, classification: 'clean', releaseScore: 0.8,
            releasedAtApex: scenario === 'massline-apex' });
        }
      }
    }
    if (released && scenario !== 'massline-snap') {
      target.pos.x += target.vel.x * dt; target.pos.z += target.vel.z * dt;
      place(targetMesh, target, targetBase.y);
    }
    owner._updateTetherCable(dt);
    stage = released ? (owner._tetherCable.fade > 0 ? 'release' : 'dead') : age < 0.3 ? 'latch' : 'loaded';
  }
  function stepPropulsion(dt, age) {
    const run = Math.max(0, Math.min(0.9, age - 0.25));
    const turn = Math.max(0, Math.min(1.05, age - 1.15));
    const stop = Math.max(0, Math.min(0.55, age - 2.2));
    const angle = turn * 1.1, finalAngle = 1.05 * 1.1;
    const coast = 25 * (stop - stop * stop / 1.1);
    ship.pos.x = shipBase.x + run * 32 + Math.sin(angle) * 22 + Math.cos(finalAngle) * coast;
    ship.pos.z = shipBase.z + 18 + (1 - Math.cos(angle)) * 22 + Math.sin(finalAngle) * coast;
    ship.rot = angle;
    place(shipMesh, ship, shipBase.y);
    drive.speed = age < 0.25 ? 0 : age < 1.15 ? 32 : age < 2.2 ? 24.2 : Math.max(0, 25 * (1 - stop / 0.55));
    drive.drive = drive.throttle = age < 2.2 ? 1 : 0; drive.boost = age > 0.3 && age < 1.9 ? 1 : 0;
    drive.speedDrive = drive.speed / 40;
    ship.vel.x = Math.cos(angle) * drive.speed; ship.vel.z = Math.sin(angle) * drive.speed;
    const native = NATIVE_PROPULSION_SCENARIOS.has(scenario);
    if (native) {
      const reverse = scenario === 'propulsion-reverse' ? 18 : 0;
      const lateral = scenario === 'propulsion-lateral'
        ? 14 * Math.sin(Math.min(1, age * 1.4) * Math.PI * 0.5) : 0;
      const yaw = scenario === 'propulsion-yaw-brake'
        ? (age < 1.8 ? 9.5 : age < 3.2 ? -13.5 : 0) : 0;
      const main = scenario === 'propulsion-dash' ? (age > 0.18 && age < 2.2 ? 34 : 0) : 0;
      const pilotBrake = scenario === 'propulsion-reverse'
        || (scenario === 'propulsion-yaw-brake' && age >= 1.8);
      ship._flightFrame = {
        ...(ship._flightFrame || {}), driveId: 'drive_reaction_m', maxSpeed: 120,
        forwardSpeed: drive.speed, throttle: main > 0 ? 0.86 : 0,
        acceleration: { x: 0, z: 0 }, angularAcceleration: yaw,
        actuators: { main, reverse, lateral, yaw, pilotBrake },
      };
      privateState.input.moveZ = scenario === 'propulsion-dash' && age < 2.2 ? 1 : 0;
      privateState.input.turnIntent = Math.abs(yaw) > 0 ? 0.72 : 0;
      ship.flags = { ...(ship.flags || {}), boosting: scenario === 'propulsion-dash' && age > 0.28 && age < 1.9 };
      if (scenario === 'propulsion-dash' && age >= 0.28 && !dashFired) {
        owner._onDash({ shipId: ship.id });
        dashFired = true;
      }
      stage = age < 0.28 ? 'charge' : scenario === 'propulsion-yaw-brake' && age >= 1.8
        ? 'yaw-brake' : age < 2.2 ? 'active' : 'cooldown';
      return;
    }
    liveSockets.length = 0;
    const count = markers.length || 1;
    for (let i = 0; i < count; i++) {
      if (markers.length) socketPoint.setFromMatrixPosition(markers[i].matrix).applyMatrix4(shipMesh.matrixWorld);
      else socketPoint.set(ship.pos.x - Math.cos(angle) * ship.radius * 0.88, shipBase.y,
        ship.pos.z - Math.sin(angle) * ship.radius * 0.88);
      Object.assign(sockets[i], { x: socketPoint.x, y: socketPoint.y, z: socketPoint.z, ax: Math.cos(angle), ay: 0, az: Math.sin(angle) });
      liveSockets.push(sockets[i]);
    }
    propulsion.setCamera(camera); propulsion.update(dt, liveSockets, drive, a11y, ship.id);
    stage = age < 0.3 ? 'ignition' : age < 1.15 ? 'boost' : age < 2.2 ? 'turn' : propulsion._active ? 'stop' : 'dead';
  }
  function update(dt) {
    if (disposed) return;
    const nextTime = Number.isFinite(state.simTime) ? state.simTime : clock + Math.max(0, dt || 0);
    if (nextTime < clock - 1e-8) { reset({ scenario, seed, time: nextTime, targetId: target?.id }); return; }
    accumulated = Math.max(0, nextTime - clock);
    sync();
    seeded(() => {
      while (accumulated >= STEP - 1e-8) {
        clock += STEP; accumulated -= STEP; privateState.simTime = clock; privateState.tick++;
        owner._t = clock; const age = clock - born;
        if (scenario.startsWith('tool-')) stepTool(STEP, age);
        else if (scenario.startsWith('massline-')) stepMassline(STEP, age);
        else if (scenario.startsWith('propulsion')) stepPropulsion(STEP, age);
        publish(STEP);
      }
    });
  }
  function inspect() {
    return { scenario, seed, stage, time: clock, duration: GAMEPLAY_TOOL_SCENARIOS[scenario] || 0,
      tool: { active: owner._miningBeam.active, visible: owner._miningBeam.mesh.visible,
        verb: owner._miningBeam.verb, power: owner._miningBeam.shaderShared.power.value },
      massline: { visible: owner._tetherCable.mesh.visible, load: owner._tetherCable.loadSmooth,
        fade: owner._tetherCable.fade, snapAge: owner._tetherCable.snapAge,
        release: { ...owner._lastMasslineReleaseVfx } },
      masslineCompanions: {
        releaseArc: {
          visible: !!owner._masslineReleaseArc?.mesh?.visible,
          fade: owner._masslineReleaseArc?.fade || 0,
          ratingAge: owner._masslineReleaseArc?.ratingAge ?? null,
        },
        swingTrace: {
          visible: !!owner._masslineSwingTrace?.mesh?.visible,
          samples: owner._masslineSwingTrace?.trace?.count || 0,
        },
        monofilament: {
          visible: !!owner._monofilamentBlade?.mesh?.visible,
          present: !!owner._monofilamentBlade?.present,
        },
        apex: {
          active: !!owner._apexFlare?.active,
          age: owner._apexFlare?.age || 0,
        },
        snarl: {
          visible: !!owner._tetherWebFx?.mesh?.visible,
          instances: owner._tetherWebFx?.mesh?.count || 0,
          state: snarlLink?.state || null,
          brokenTick: Number.isInteger(snarlLink?.brokenTick) ? snarlLink.brokenTick : null,
          breakReason: snarlLink?.breakReason || null,
        },
      },
      propulsion: propulsion.inspect(),
      nativePropulsion: NATIVE_PROPULSION_SCENARIOS.has(scenario) ? {
        energyInitialized: !!owner._energy,
        plumeDrive: owner._energy?.plumeDrive || 0,
        retroLiveCount: owner._energy?.retroVolume?._liveCount || 0,
        rcsImpulseCount: owner._energy?.rcsSystem?.pool?.activeImpulseCount || 0,
        rcsSlotCount: owner._energy?.rcsSystem?.pool?.activeSlotCount || 0,
        dashFired,
      } : null,
      nozzleSource: markers.length ? 'authored engine markers' : 'shipping radius fallback',
      sprites: owner._liveSpriteCount, particles: owner._liveCount, streaks: owner._liveTrailStreakCount,
    };
  }
  function dispose() {
    if (disposed) return;
    reset(); propulsion.dispose(); owner.destroy(); root.removeFromParent(); disposed = true;
  }
  reset();
  return { root, reset, update, inspect, dispose, scenarios: GAMEPLAY_TOOL_SCENARIOS };
}
