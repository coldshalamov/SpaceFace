// Deterministic inputs for the shipping weapon and shield owners. No lab-only shaders/recipes.
import * as THREE from 'three';
import { WEAPONS } from '../../src/data/weapons.js';
import { modelTruthBoltRadius, modelTruthMineSensorRadius } from '../../src/data/modelTruth.js';
import { WeaponVfxPresenter } from '../../src/render/weapons/presenter.js';
import { resolveWeaponRecipe, WEAPON_SOCKET_NAME } from '../../src/render/weapons/recipes.js';
import { createShipAuxPool, syncShipAuxPools } from '../../src/render/renderer.js';
import { createShieldBubble } from '../../src/render/ships/shipKit.js';
import { hasShieldContact, readShieldContacts } from '../../src/render/weapons/shieldContacts.js';
import { setShieldShellClock } from '../../src/render/weapons/shieldShell.js';
import { resolveVfxAccessibilityProfile } from '../../src/render/vfxAccessibility.js';
import { unregisterDynamicBufferOwner } from '../../src/render/dynamicBufferRanges.js';
import { createVisualFactory, factoryPresentationNow, setFactoryPresentationNow } from '../../src/render/visualFactory.js';
import { PersistentCombatBeamPool } from '../../src/render/combat/persistentBeams.js';
import { vfx } from '../../src/render/vfx.js';
import { resolveMuzzleProfile } from '../../src/render/vfxProfiles.js';
import { worldSizeForPixels } from '../../src/render/weapons/index.js';
import { ActionVfx } from '../../src/render/actionVfx.js';

export const GAMEPLAY_WEAPON_SCENARIOS = Object.freeze({
  pulse: 5.2, 'thermal-bolt': 6.5, 'siege-lance': 7, railgun: 4.6, 'shield-impact': 2.2,
  autocannon: 6.5, 'emp-disruptor': 6.5, concussion: 6.5, missile: 8.5,
  'vector-mine': 5, 'combat-beam': 5.5, flak:5, torpedo:9,
});
const WEAPON_IDS = Object.freeze({
  pulse: 'wpn_pulse_laser_s', 'thermal-bolt': 'wpn_plasma_cannon_m',
  'siege-lance': 'wpn_siege_lance_l', railgun: 'wpn_railgun_m', 'shield-impact': 'wpn_pulse_laser_s',
  autocannon: 'wpn_autocannon_s', 'emp-disruptor': 'wpn_emp_disruptor_m',
  concussion: 'wpn_concussion_cannon_m', missile: 'wpn_missile_rack_m',
  'vector-mine': 'wpn_vector_mine_m', 'combat-beam': 'wpn_beam_laser_m',
  flak:'wpn_flak_turret_s',torpedo:'wpn_torpedo_l',
});
const STEP = 1 / 60;
const LAUNCH_AT = 12 * STEP;
const PARTICLE_SYSTEMS = ['impactSpall', 'shieldShards', 'muzzleSparks', 'casingEjection',
  'retroVenting', 'miningEjecta', 'collisionSpall', 'damageVenting', 'shrapnel', 'iceSpall', 'cargoDebris'];
const countSlots = pool => pool?.slots?.reduce((n, slot) => n + Number(!!slot.alive), 0) || 0;
const frameTime = time => Math.round(time / STEP) * STEP;
const NOOP = () => {};
const MINE_UNRELATED_CONSTRUCTORS = ['_ensureOverflowJets', '_initRibbonTrails', '_initMiningBeam',
  '_initTetherCable', '_initArcPreview', '_initMasslineReleaseArc', '_initMasslineSwingTrace',
  '_initMonofilamentBlade', '_initDockingCradle', '_initApexFlare', '_initTargetContour',
  '_initSeamMarkers', '_initCombatBeams', '_initArcadeStructural', '_initFieldGeometry', '_initWeaponPresenter'];

/**
 * Mount once; select(id,{seed,time}) after placing the authored meshes. select resets and arms
 * one shot at +0.2 s. Advance caller state.simTime, then update(dt). Equal-time calls are inert.
 * reset({seed,time}) leaves the owner idle; fire(id) arms a fresh shot without changing that clock.
 * inspect().samples reports frame-aligned times relative to the selected run, including the real
 * flight interval at the selected context distance. Only private entity copies are mutated.
 */
export function createGameplayWeapons({ scene, state, camera = state?.render?.camera,
  shipMesh, targetMesh, shipEntity = null, targetEntity = null, viewportHeight = 720 }) {
  if (!scene || !state || !camera || !shipMesh || !targetMesh) {
    throw new Error('Weapons lab needs scene, state, camera and both authored meshes');
  }
  const root = new THREE.Group(); root.name = 'ProductionWeaponVfx'; scene.add(root);
  const actions = new ActionVfx(root);
  const entities = new Map(), meshes = new Map(), auxMeshes = new Map();
  const privateState = { ...state, mode: 'flight', entities, entityList: [], entityIndex: null,
    fields: { active: [] }, render: { ...state.render, scene: root, camera, meshes },
  };
  // This transform carrier never draws. It supplies the native renderer's pooled shield source
  // without writing shieldBubble/userData onto the caller's authored ship.
  const shieldCarrier = new THREE.Group();
  const shieldBubble = createShieldBubble('#5fd0ff', 1);
  shieldCarrier.add(shieldBubble); shieldCarrier.userData.shieldBubble = shieldBubble;
  const shieldPool = createShipAuxPool(root);
  const contactData = new Float32Array(16);
  const socketPosition = new THREE.Vector3();
  const factory = createVisualFactory();
  let presenter = null, ship = null, target = null, shot = null;
  let shotMesh = null, combatBeams = null, mineOwner = null;
  let shieldContext=null;
  let scenario = 'idle', seed = 17, randomState = 17, clock = 0, born = 0, disposed = false;
  let socketMode = 'radius fallback', launchCount = 0, impactCount = 0;
  const events = [];
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  function seeded(call) {
    // Legacy cosmetic Quarks generators use ambient randomness. Scope it to a synchronous owner
    // call and restore before returning; simulation RNG and other presenters are never consumed.
    const ambient = Math.random;
    try { Math.random = random; return call(); } finally { Math.random = ambient; }
  }
  function copyEntity(entity, mesh, fallbackId, type) {
    return { ...(entity || {}), id: entity?.id ?? fallbackId, type: entity?.type || type,
      alive: true, pos: { x: entity?.pos?.x ?? mesh.position.x, z: entity?.pos?.z ?? mesh.position.z },
      vel: { x: 0, z: 0 }, radius: entity?.radius || (type === 'ship' ? 8 : 11),
      data: { ...(entity?.data || {}) } };
  }
  function socketWorldPose(ownerId) {
    if (!shot || ownerId !== shot.source.id || !shot.muzzle) return null;
    return { x: shot.start.x, y: shot.start.y, z: shot.start.z,
      forwardX: shot.axis.x, forwardY: 0, forwardZ: shot.axis.z };
  }
  function syncContext() {
    privateState.settings = state.settings || { video: {}, accessibility: {} };
    privateState.simTime = clock;
    const profile = resolveVfxAccessibilityProfile(privateState.settings);
    shieldCarrier.position.copy(shipMesh.position);
    shieldCarrier.quaternion.copy(shipMesh.quaternion);
    shieldCarrier.scale.copy(shipMesh.scale);
    shieldCarrier.updateMatrixWorld(true);
    setShieldShellClock(shieldPool.shield.material, clock,
      profile.id === 'reduced-motion' || profile.id === 'reduced-motion-and-flash');
    return profile;
  }
  function publish(dt) {
    const profile = syncContext();
    actions.update(privateState);
    presenter.update(dt, { state: privateState, camera, viewportHeight, interpolationAlpha: 1 });
    if(shieldContext)ship.shield=shieldContext==='collapse'&&clock-born>=.2?0:100;
    syncShipAuxPools(shieldPool, scenario === 'shield-impact'||shieldContext ? [ship] : [], auxMeshes);
    const cameraDistance = camera.position.length();
    combatBeams?.update(clock, null, profile,
      worldSizeForPixels(cameraDistance, 8, camera.fov, viewportHeight), entry => socketWorldPose(entry.ownerId));
    if (shotMesh && shot?.projectile?.alive) {
      shotMesh.position.set(shot.projectile.pos.x, 0.32, shot.projectile.pos.z);
      shotMesh.rotation.y = -shot.projectile.rot;
      shotMesh.userData.updateRuntimeState?.(shot.projectile, profile.id.includes('motion') ? 0 : clock);
    }
    if (mineOwner) {
      mineOwner._t = clock;
      mineOwner._integrateParticles(dt); mineOwner._integrateSprites(dt);
      mineOwner._integrateTrailStreaks(dt); mineOwner._decayEventLights(dt);
      mineOwner._gas?.setAccessibility(profile); mineOwner._gas?.update(clock, camera);
    }
  }
  function clearExtraOwners() {
    combatBeams?.dispose(); combatBeams = null;
    mineOwner?.destroy(); mineOwner = null;
    // Factory projectile/mine resources are shared by the game. These cases create no cloned
    // torpedo materials, so remove their object roots without disposing shared geometry/materials.
    shotMesh?.removeFromParent(); shotMesh = null;
  }
  function createMineOwner() {
    mineOwner = Object.create(vfx);
    for (const name of MINE_UNRELATED_CONSTRUCTORS) mineOwner[name] = NOOP;
    mineOwner.init({ state: privateState, bus: { on: () => NOOP, off: NOOP, emit: NOOP },
      helpers: { player: () => ship } });
  }
  function reset(options = {}) {
    if (disposed) throw new Error('Weapons adapter is disposed');
    seed = Number.isFinite(options.seed) ? options.seed >>> 0 : seed;
    clock = born = Number.isFinite(options.time) ? options.time : (Number(state.simTime) || 0);
    randomState = seed; shieldContext=null; scenario = 'idle'; shot = null; events.length = 0;
    actions.clear(); actions.serial = seed; actions.update({ ...privateState, simTime: clock });
    launchCount = impactCount = 0; socketMode = 'radius fallback';
    clearExtraOwners();
    presenter?.dispose();
    ship = copyEntity(shipEntity || state.entities?.get(state.playerId ?? 1), shipMesh, 1, 'ship');
    target = copyEntity(targetEntity || state.entities?.get(2), targetMesh, 2, 'asteroid');
    if (ship.id === target.id) throw new Error('Weapon demonstration needs distinct entities');
    ship.shield = Number(ship.shield) > 0 ? ship.shield : 100;
    privateState.playerId = ship.id; entities.clear(); meshes.clear(); auxMeshes.clear();
    entities.set(ship.id, ship); entities.set(target.id, target);
    meshes.set(ship.id, shipMesh); meshes.set(target.id, targetMesh); auxMeshes.set(ship.id, shieldCarrier);
    privateState.entityList = [ship, target];
    shieldBubble.scale.setScalar(ship.radius);
    shieldBubble.material.uniforms.uFlash.value = 0;
    shieldPool.shield.material.uniforms.uShellTime.value = 0;
    privateState.simTime = clock;
    seeded(() => {
      presenter = new WeaponVfxPresenter({ scene: root, state: privateState, helpers: { socketWorldPose } });
      presenter.discharges.sequence = seed;
      presenter.quarks._flowSequence = seed;
      publish(0);
    });
    return inspect();
  }
  function fire(id = scenario) {
    if (disposed) throw new Error('Weapons adapter is disposed');
    if (!GAMEPLAY_WEAPON_SCENARIOS[id]) throw new Error(`Unknown weapon scenario ${id}`);
    if (shot) throw new Error('Reset or select before arming another weapon shot');
    scenario = id;
    const weaponId = WEAPON_IDS[id], weapon = WEAPONS.find(entry => entry.id === weaponId);
    const beam = weapon?.continuous === true, mine = weapon?.tracking === 'deploy';
    if (!beam && !mine && (!(weapon?.projSpeed > 0) || !Number.isFinite(weapon.projSpeed))) {
      throw new Error(`Weapon lab requires a finite production projectile speed: ${weaponId}`);
    }
    const shield = id === 'shield-impact', source = shield ? target : ship, victim = shield ? ship : target;
    const dx = victim.pos.x - source.pos.x, dz = victim.pos.z - source.pos.z;
    const distance = Math.hypot(dx, dz);
    if (!(distance > source.radius + victim.radius)) throw new Error('Weapon lab bodies must have room between them');
    const axis = { x: dx / distance, z: dz / distance };
    const start = { x: source.pos.x + axis.x * source.radius, y: 0.4,
      z: source.pos.z + axis.z * source.radius };
    const socket = !shield && !mine && shipMesh.getObjectByName(WEAPON_SOCKET_NAME);
    if (socket) {
      socket.updateWorldMatrix(true, false); socket.getWorldPosition(socketPosition);
      start.x = socketPosition.x; start.y = socketPosition.y; start.z = socketPosition.z;
      socketMode = 'authored weapon socket';
    } else socketMode = shield ? 'incoming shot at context edge' : 'radius fallback';
    if (mine) {
      const rear = (ship.rot || 0) + Math.PI, standoff = ship.radius + 6;
      start.x = ship.pos.x + Math.cos(rear) * standoff;
      start.z = ship.pos.z + Math.sin(rear) * standoff;
      socketMode = 'production rear deployment standoff';
    }
    const aimedDistance = Math.hypot(victim.pos.x - start.x, victim.pos.z - start.z);
    if (!(aimedDistance > victim.radius)) throw new Error('Weapon socket must sit outside its target');
    axis.x = (victim.pos.x - start.x) / aimedDistance;
    axis.z = (victim.pos.z - start.z) / aimedDistance;
    const end = mine ? { x: start.x, z: start.z }
      : { x: victim.pos.x - axis.x * victim.radius, z: victim.pos.z - axis.z * victim.radius };
    const travel = beam || mine ? 0 : Math.hypot(end.x - start.x, end.z - start.z) / weapon.projSpeed;
    // One birth frame is retained even for a contact closer than a fixed step. Projectile speed
    // stays the shipped value; only collision publication is quantized to the lab's 60 Hz clock.
    const flightFrames = beam || mine ? 0 : Math.max(1, Math.ceil(travel / STEP - 1e-8));
    const launchAt = clock - born + LAUNCH_AT;
    const armedAt = mine ? launchAt + (weapon.mineArmS ?? 1.4) : null;
    const hitAt = mine ? armedAt + 0.35 : launchAt + flightFrames * STEP;
    const releaseAt = beam ? launchAt + 1.2 : hitAt;
    const recipe = resolveWeaponRecipe(weaponId, weapon);
    shot = { source, victim, weaponId, weapon, recipe, shield, beam, mine, muzzle: !shield && !mine, axis, start, end,
      launchAt, hitAt, releaseAt, armedAt, flightFrames, travel, launched: false, hit: false,
      stopped: false, nextContactAt: launchAt, projectile: null };
    if (beam) {
      combatBeams = new PersistentCombatBeamPool(THREE, { scene: root, maxBeams: 16, timeoutS: 0.14 });
      root.add(combatBeams.group);
      shot.beamReceipt = { beamKey: `${source.id}:0`, ownerId: source.id, weaponId, hardpointIdx: 0,
        from: start, to: end, continuous: true, phase: 'begin' };
      shot.beamProfile = resolveMuzzleProfile(weaponId);
    }
    if (mine) seeded(createMineOwner);
    return inspect();
  }
  function launch() {
    shot.launched = true; launchCount++;
    if (shot.beam) {
      combatBeams.upsert(shot.beamReceipt, clock, shot.beamProfile);
      presenter.handleFire({ ...shot.weapon, weaponId: shot.weaponId, ownerId: shot.source.id },
        shot.start, Math.atan2(shot.axis.z, shot.axis.x));
      events.push({ event: 'beam-start', at: frameTime(clock - born), weaponId: shot.weaponId });
      return;
    }
    const projectile = { id: 1000000 + (seed % 100000) * 10 + Object.keys(WEAPON_IDS).indexOf(scenario),
      type: shot.mine ? 'vectormine' : 'projectile', alive: true, ownerId: shot.source.id, team: shot.shield ? 1 : 0,
      pos: { x: shot.start.x, z: shot.start.z }, prevPos: { x: shot.start.x, z: shot.start.z },
      vel: { x: shot.mine ? 0 : shot.axis.x * shot.weapon.projSpeed, z: shot.mine ? 0 : shot.axis.z * shot.weapon.projSpeed },
      rot: shot.mine ? (ship.rot || 0) + Math.PI : Math.atan2(shot.axis.z, shot.axis.x),
      radius: shot.mine ? modelTruthMineSensorRadius(ship) : modelTruthBoltRadius(shot.source),
      data: { ...shot.weapon, weaponId: shot.weaponId },
    };
    if (shot.mine) Object.assign(projectile.data, { kind: 'vector_mine', ownerId: ship.id, armed: false,
      spawnedAt: clock, armAt: born + shot.armedAt, blastRadius: shot.weapon.mineBlastRadius });
    shot.projectile = projectile; entities.set(projectile.id, projectile); privateState.entityList.push(projectile);
    if (shot.recipe.family === 'missile' || shot.mine) {
      shotMesh = factory.build(projectile); root.add(shotMesh); meshes.set(projectile.id, shotMesh);
      shotMesh.traverse(node => {
        if (!node.material?.uniforms?.uTime) return;
        const nativeBeforeRender = node.onBeforeRender;
        node.onBeforeRender = function (...args) {
          // The lab does not run renderer.prepareFrame. Supply its sim-clock membrane only
          // around the native factory callback; no shared clock leaks into another scene.
          const previous = factoryPresentationNow();
          try {
            setFactoryPresentationNow(state.settings?.video?.motionReduce ? 0 : clock);
            nativeBeforeRender.apply(this, args);
          } finally { setFactoryPresentationNow(previous); }
        };
      });
    }
    if (shot.muzzle) presenter.handleFire({ ...shot.weapon, weaponId: shot.weaponId, ownerId: shot.source.id },
      shot.start, Math.atan2(shot.axis.z, shot.axis.x));
    events.push({ event: shot.mine ? 'deploy' : 'launch', at: frameTime(clock - born), weaponId: shot.weaponId });
  }
  function impact() {
    shot.hit = true; impactCount++;
    if (shot.projectile) {
      shot.projectile.alive = false; entities.delete(shot.projectile.id); meshes.delete(shot.projectile.id);
      privateState.entityList = [ship, target];
      if (shotMesh) shotMesh.visible = false;
    }
    if (shot.mine) {
      actions.emit('weapons:mineDetonated', { mineId: shot.projectile.id, ownerId: ship.id,
        pos: shot.end, blastRadius: shot.weapon.mineBlastRadius }, privateState);
      // The actual deployment owner emits this normalized cue after resolving the mine. This
      // visual fixture supplies that receipt, not a projectile hit or invented hull damage.
      mineOwner._onPresentationCue({ id: 'combat.vectorMine.detonate', lane: 'combat', particles: 30,
        lights: 1, magnitude: Math.max(0.6, shot.weapon.mineBlastRadius / 150), position: shot.end,
        material: 'impulse', sourceId: ship.id, targetId: null, flashReduced: false });
      events.push({ event: 'mine-detonate', at: frameTime(clock - born) });
      return;
    }
    presenter.handleHit({ ...shot.weapon, weaponId: shot.weaponId, ownerId: shot.source.id,
      targetId: shot.victim.id, pos: shot.end, normal: { x: -shot.axis.x, z: -shot.axis.z },
      approach: shot.axis }, shot.shield);
    if (shot.shield) shieldBubble.material.uniforms.uFlash.value = 0.8;
    events.push({ event: shot.beam ? 'beam-contact' : shot.shield ? 'shield-impact' : 'hull-impact', at: frameTime(clock - born) });
  }
  function step(dt) {
    clock += dt; privateState.simTime = clock;
    const age = clock - born;
    shieldBubble.material.uniforms.uFlash.value *= Math.pow(0.05, dt);
    if (shot && !shot.launched && age + 1e-8 >= shot.launchAt) launch();
    if (shot?.launched && shot.beam && !shot.stopped) {
      if (age + 1e-8 >= shot.releaseAt) {
        combatBeams.stop(shot.beamReceipt); shot.stopped = true;
        events.push({ event: 'beam-stop', at: frameTime(age) });
      } else {
        shot.beamReceipt.phase = 'update';
        combatBeams.upsert(shot.beamReceipt, clock, shot.beamProfile);
        // Match the production beam damage cue's 0.08s coalescing rather than restarting
        // source ignition every simulation tick or fabricating a travelling projectile.
        if (age + 1e-8 >= shot.nextContactAt) { impact(); shot.nextContactAt = age + 0.08; }
      }
    } else if (shot?.launched && shot.mine && !shot.hit) {
      if (!shot.projectile.data.armed && age + 1e-8 >= shot.armedAt) {
        shot.projectile.data.armed = true;
        actions.emit('weapons:mineArmed', { mineId: shot.projectile.id, ownerId: ship.id,
          pos: shot.projectile.pos }, privateState);
        events.push({ event: 'mine-armed', at: frameTime(age) });
      }
      if (age + 1e-8 >= shot.hitAt) impact();
    } else if (shot?.launched && !shot.hit) {
      const p = shot.projectile; p.prevPos.x = p.pos.x; p.prevPos.z = p.pos.z;
      const travelAge = Math.max(0, age - shot.launchAt);
      const progress = Math.min(1, travelAge / shot.travel);
      p.pos.x = shot.start.x + (shot.end.x - shot.start.x) * progress;
      p.pos.z = shot.start.z + (shot.end.z - shot.start.z) * progress;
      if (age + 1e-8 >= shot.hitAt) impact();
    }
    publish(dt);
  }
  function update(dt) {
    if (disposed) return;
    const next = Number.isFinite(state.simTime) ? state.simTime : clock + Math.max(0, Number(dt) || 0);
    if (next < clock - 1e-8) { reset({ seed, time: next }); return; }
    let remaining = next - clock;
    if (!(remaining > 1e-8)) return;
    seeded(() => {
      while (remaining > 1e-8) { const amount = Math.min(STEP, remaining); step(amount); remaining -= amount; }
    });
    clock = next;
  }
  function select(id, options = {}) { reset(options); return fire(id); }
  function inspect() {
    const particles = PARTICLE_SYSTEMS.reduce((n, name) => n + (presenter?.quarks?.[name]?.particleNum || 0), 0);
    const live = { projectiles: !shot?.mine && shot?.projectile?.alive ? 1 : 0,
      mines: shot?.mine && shot.projectile?.alive ? 1 : 0, beams: combatBeams?.activeCount || 0,
      solidBodies: shotMesh?.visible && shot?.projectile?.alive ? 1 : 0, bolts: presenter?.bolts.live || 0,
      ribbons: presenter?.ribbons.live || 0, discharges: countSlots(presenter?.discharges),
      scorches: presenter?.scorches.live || 0, distortion: countSlots(presenter?.distortion),
      lights: countSlots(presenter?.lights), particles, shield: shieldPool.shield.mesh.count,
      transport: presenter?.quarks?.flow.live || 0,
      mineParticles: mineOwner?._liveCount || 0, mineSprites: mineOwner?._liveSpriteCount || 0,
      mineLights: mineOwner?._activeLightCount || 0,
      actionSurfaces: actions.batch.count, actionParticles: actions.particles.live,
      contacts: ship && hasShieldContact(ship.id) ? 1 : 0 };
    const hitAt = shot?.hitAt || 0;
    const samples = shot ? { birth: shot.launchAt,
      flight: shot.beam || shot.mine ? null
        : shot.launchAt + Math.min(shot.flightFrames - 1, Math.floor(shot.flightFrames / 2)) * STEP,
      impact: hitAt, spread: hitAt + 6 * STEP, cooling: hitAt + 0.6,
      dead: GAMEPLAY_WEAPON_SCENARIOS[scenario] } : {};
    if (shot?.beam) Object.assign(samples, { working: shot.launchAt + 0.6, release: shot.releaseAt,
      spread: shot.releaseAt + 6 * STEP, cooling: shot.releaseAt + 0.6 });
    if (shot?.mine) Object.assign(samples, { armed: shot.armedAt, working: shot.armedAt + 0.15,
      detonation: shot.hitAt });
    return { owner: shot?.beam ? 'PersistentCombatBeamPool + WeaponVfxPresenter'
      : shot?.mine ? 'visualFactory vectormine + vfx._onPresentationCue'
        : 'WeaponVfxPresenter + visualFactory + renderer.syncShipAuxPools', scenario, seed, time: clock - born,
      weaponId: shot?.weaponId || null, family: shot?.recipe.family || null, variant: shot?.recipe.variant || null,
      projectileSpeed: shot?.beam || shot?.mine ? 0 : shot?.weapon.projSpeed || 0, socketMode, launchCount, impactCount,
      stage: !shot ? 'idle' : !shot.launched ? 'ready'
        : shot.beam && !shot.stopped ? 'working' : shot.mine && !shot.hit ? (shot.projectile.data.armed ? 'armed' : 'arming')
        : !shot.hit ? 'flight'
        : Object.values(live).some(Boolean) ? 'afterglow' : 'dead',
      samples, timeline: shot ? { launchAt: shot.launchAt, hitAt, flightFrames: shot.flightFrames,
        armedAt: shot.armedAt, releaseAt: shot.releaseAt,
        physicalTravelSeconds: shot.travel } : null, events: events.slice(), live,
      contacts: ship ? Array.from(readShieldContacts(ship.id, contactData) || contactData) : [],
      // The lab uses the normal bloom path. Haze is owned and aged here, but needs the optional
      // production render graph to composite; it is never replaced by a lab-only distortion pass.
      distortionComposited: false,
    };
  }
  function dispose() {
    if (disposed) return;
    clearExtraOwners();
    presenter?.dispose();
    actions.dispose();
    for (const branch of [shieldPool.shield, shieldPool.nav]) {
      if (branch.dynamicBufferOwner) unregisterDynamicBufferOwner(branch.dynamicBufferOwner);
      branch.mesh?.removeFromParent(); branch.mesh?.dispose?.();
      // Nav geometry is shared by the live renderer; only the shield pool clones its geometry.
      if (branch === shieldPool.shield) branch.mesh?.geometry.dispose();
      branch.material?.dispose();
    }
    shieldBubble.material.dispose(); shieldCarrier.clear(); root.removeFromParent();
    entities.clear(); meshes.clear(); auxMeshes.clear(); disposed = true;
  }
  reset({ seed, time: Number(state.simTime) || 0 });
  return { root, reset, select, fire, update, inspect, dispose, setShieldContext(mode){shieldContext=mode;}, get presenter() { return presenter; } };
}
