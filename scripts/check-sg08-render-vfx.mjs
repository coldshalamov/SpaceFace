import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

function makeBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
      return () => {
        const current = listeners.get(type) || [];
        listeners.set(type, current.filter((item) => item !== fn));
      };
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}

function assertClose(actual, expected, message, epsilon = 1e-5) {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, got ${actual}`);
}

function assertQuaternionClose(actual, expected, message, epsilon = 1e-5) {
  const dot = Math.abs(actual.dot(expected));
  assert(1 - dot <= epsilon, `${message}: expected quaternion ${expected.toArray().join(',')}, got ${actual.toArray().join(',')}`);
}

function assertVectorClose(actual, expected, message, epsilon = 1e-5) {
  assertClose(actual.x, expected.x, `${message} x`, epsilon);
  assertClose(actual.y, expected.y, `${message} y`, epsilon);
  assertClose(actual.z, expected.z, `${message} z`, epsilon);
}

function makeHarness(overrides = {}) {
  const scene = new THREE.Scene();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12 };
  const target = { id: 2, type: 'ship', alive: true, pos: { x: 40, z: -12 }, vel: { x: 0, z: 0 }, rot: 0, radius: 14, factionId: 'concord' };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce: false,
        ...(overrides.video || {}),
      },
      accessibility: {
        flashReduce: false,
        ...(overrides.accessibility || {}),
      },
    },
    render: { scene },
    content: {},
  };
  const bus = makeBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  return { scene, state, bus, system };
}

{
  const { state, system } = makeHarness({ video: { energyMaterials: true } });
  const player = state.entities.get(state.playerId);
  player._flightFrame = { throttle: 1 };
  player.rot = 0;

  const root = new THREE.Group();
  root.position.set(12, 0, -8);
  root.rotation.set(0.22, -Math.PI / 2, -0.18);
  const socket = new THREE.Object3D();
  socket.name = 'SOCKET_Trail_Main';
  socket.position.set(-4, 1.25, 2);
  socket.userData = { spacefaceSocket: true, forward: [-1, 0, 0] };
  root.add(socket);
  const portSocket = new THREE.Object3D();
  portSocket.name = 'SOCKET_Trail_Port';
  portSocket.position.set(-4, 1.25, -2);
  portSocket.userData = { spacefaceSocket: true, forward: [-1, 0, 0] };
  root.add(portSocket);
  root.updateMatrixWorld(true);
  player.view = { root };

  system.update(1 / 60);
  const plume = system._energy && system._energy.plume;
  assert(plume && plume.visible, 'energy plume should be visible under throttle');
  const portPlume = system._energy && system._energy.plumes && system._energy.plumes[1];
  assert(portPlume && portPlume.visible, 'energy plume should spawn for each trail socket');
  socket.updateWorldMatrix(true, false);
  const expected = new THREE.Vector3();
  const expectedQuat = new THREE.Quaternion();
  const expectedScale = new THREE.Vector3();
  socket.matrixWorld.decompose(expected, expectedQuat, expectedScale);
  const expectedForward = new THREE.Vector3(-1, 0, 0).applyQuaternion(expectedQuat).normalize();
  assertClose(plume.position.x, expected.x, 'energy plume should share trail socket x');
  assertClose(plume.position.y, expected.y, 'energy plume should share trail socket y');
  assertClose(plume.position.z, expected.z, 'energy plume should share trail socket z');
  assertQuaternionClose(plume.quaternion, expectedQuat, 'energy plume should inherit the full trail socket orientation');
  const plumeForward = new THREE.Vector3(-1, 0, 0).applyQuaternion(plume.quaternion).normalize();
  assertVectorClose(plumeForward, expectedForward, 'energy plume should align to trail socket direction');
  assert(Math.abs(plume.rotation.y - player.rot) > 0.25, 'energy plume should not use entity rot when a socket pose exists');
  portSocket.updateWorldMatrix(true, false);
  const portExpected = new THREE.Vector3();
  const portExpectedQuat = new THREE.Quaternion();
  portSocket.matrixWorld.decompose(portExpected, portExpectedQuat, expectedScale);
  assertClose(portPlume.position.x, portExpected.x, 'port energy plume should share its socket x');
  assertClose(portPlume.position.y, portExpected.y, 'port energy plume should share its socket y');
  assertClose(portPlume.position.z, portExpected.z, 'port energy plume should share its socket z');
  assertQuaternionClose(portPlume.quaternion, portExpectedQuat, 'port energy plume should inherit its socket orientation');
}

{
  const { bus, system } = makeHarness();
  bus.emit('presentation:vfxCue', {
    id: 'shield.collapse',
    lane: 'vfx.shield_collapse',
    particles: 80,
    lights: 1,
    targetId: 2,
    material: 'shield',
    magnitude: 2,
  });
  const inspect = system.inspect();
  assert.equal(inspect.schema, 'spaceface.vfxInspect.v1', 'VFX inspect schema should be versioned');
  assert.equal(inspect.presentation.applied, 1, 'renderer VFX should consume the SG-08 cue');
  assert.equal(inspect.presentation.last.id, 'shield.collapse', 'renderer VFX should remember the last semantic cue id');
  assert.equal(inspect.presentation.last.particlesRequested, 80, 'renderer VFX should see the normalized particle budget');
  assert.equal(inspect.presentation.last.particlesSpawned, 80, 'high-quality renderer VFX should spend the cue particle budget');
  assert.equal(inspect.liveParticles, 80, 'semantic cue particles should enter the renderer particle pool');
  assert(inspect.liveSprites >= 2, 'shield semantic cue should add renderer sprite punctuation');
  assert.equal(inspect.activeLights, 1, 'semantic cue light budget should activate a renderer event light');
  assert.equal(inspect.presentation.last.lightsActivated, 1, 'renderer VFX should account activated semantic lights');
}

{
  const { bus, system } = makeHarness({ accessibility: { flashReduce: true } });
  bus.emit('presentation:vfxCue', {
    id: 'tether.break',
    lane: 'vfx.tether_break',
    particles: 48,
    lights: 0,
    flashReduced: true,
    position: { x: 24, z: 8 },
    direction: { x: 1, z: 0 },
    material: 'massline',
    magnitude: 4,
  });
  const inspect = system.inspect();
  assert.equal(inspect.presentation.applied, 1, 'reduced-flash cue should still be visually represented');
  assert.equal(inspect.presentation.last.flashReduced, true, 'renderer VFX should preserve reduced-flash evidence');
  assert.equal(inspect.presentation.last.particlesRequested, 48, 'renderer VFX should consume the adapter-halved particle budget');
  assert.equal(inspect.presentation.last.particlesSpawned, 48, 'renderer VFX should not exceed the reduced particle budget');
  assert.equal(inspect.activeLights, 0, 'reduced-flash semantic cue should not activate event lights');
  assert(inspect.liveSprites >= 1, 'reduced-flash cue should keep a non-color visual marker');
}

{
  const { bus, system } = makeHarness({ video: { motionReduce: true } });
  bus.emit('presentation:vfxCue', {
    id: 'shield.collapse',
    lane: 'vfx.shield_collapse',
    particles: 16,
    lights: 1,
    targetId: 2,
    material: 'shield',
    magnitude: 1,
  });
  const inspect = system.inspect();
  assert.equal(inspect.presentation.applied, 1, 'motion-reduced renderer should still consume cues');
  assert.equal(inspect.presentation.last.lightsRequested, 1, 'motion-reduced renderer should record requested lights');
  assert.equal(inspect.presentation.last.lightsActivated, 0, 'motion-reduced renderer should suppress dynamic event lights');
  assert.equal(inspect.activeLights, 0, 'motion-reduced renderer should keep light pool inactive');
}

{
  const { state, system } = makeHarness();
  state.player = { targetId: 2 };
  state.ui = { radarRange: 4000 };
  const player = state.entities.get(state.playerId);
  player.team = 1;
  player._flightFrame = { throttle: 1 };
  const target = state.entities.get(2);
  target.team = 3;
  target._flightFrame = { throttle: 1 };
  const farNpc = {
    id: 99,
    type: 'ship',
    alive: true,
    pos: { x: 9000, z: 9000 },
    vel: { x: 50, z: 0 },
    rot: 0,
    radius: 12,
    team: 3,
    data: { ai: { archetype: 'pirate_raider', spawnContext: 'ambient' } },
    _flightFrame: { throttle: 1 },
  };
  state.entities.set(farNpc.id, farNpc);
  state.entityList.push(farNpc);
  system._markEntityCacheDirty();
  system.update(1 / 60);
  const inspect = system.inspect();
  assert.equal(inspect.trails.trailEmittersFull, 2, 'player and selected target should keep full trail quality');
  assert(inspect.trails.trailEmittersSkipped >= 1, 'far off-radar NPC should skip trail emission');
  assert(inspect.trails.trailParticlesSpawned > 0, 'near actors should still spawn trail particles');
}

{
  const { state, system } = makeHarness();
  const player = state.entities.get(state.playerId);
  player._flightFrame = { throttle: 1 };
  player.rot = 0;
  player.radius = 28;
  player.vel = { x: 50, z: 0 };
  system._markEntityCacheDirty();
  for (let f = 0; f < 6; f++) system.update(1 / 60);
  assert.equal(system._particleMat.type, 'ShaderMaterial', 'trail particles must use ShaderMaterial');
  assert(system._particleMat.fragmentShader.includes('trailSampleProcedural'),
    'particle fragment must procedurally sample trail streaks');
  assert(system._particleMat.uniforms.uTrailTime, 'particle shader must animate warp via uTrailTime');
  assert(system._trailStreakPool && system._trailStreakPool.length > 0, 'trail streak pool must be initialized');
  const streak = system._trailStreakPool.find((m) => m.visible);
  assert(streak, 'thrusting ship should show procedural streak mesh');
  assert.equal(streak.material.type, 'ShaderMaterial', 'streak must be ShaderMaterial not SpriteMaterial');
  assert(streak.material.fragmentShader.includes('trailSampleProcedural'),
    'streak fragment must use live procedural sampler');
  assert(streak.material.uniforms.uTrailTime, 'streak must animate warp via uTrailTime');
  const inspect = system.inspect();
  assert(inspect.trails.trailStreaksSpawned >= 2, 'thrusting ship should spawn multiple procedural streak meshes per trail tick');
  assert(system._liveTrailStreakCount > 0, 'dedicated streak pool should retain live meshes after thrust frames');
  assert(inspect.trails.trailParticlesSpawned > 0, 'thrusting ship should spawn axis-aligned trail particles');
  let ribbonProcedural = false;
  for (const [, trail] of system._ribbonTrails || []) {
    const mat = trail.getMaterial();
    assert.equal(mat.type, 'ShaderMaterial', 'ribbon trail must use ShaderMaterial not MeshBasicMaterial');
    assert(mat.fragmentShader.includes('trailSampleProcedural'), 'ribbon must procedurally sample trail');
    ribbonProcedural = true;
    break;
  }
  console.log('SG-08 trail texture binding OK', JSON.stringify({
    particleShader: system._particleMat.type,
    particleProcedural: system._particleMat.fragmentShader.includes('trailSampleProcedural'),
    particleTrailTime: !!system._particleMat.uniforms.uTrailTime,
    streakPoolCap: system._trailStreakPool.length,
    liveTrailStreakMeshes: system._liveTrailStreakCount,
    streakShader: streak.material.type,
    streakProcedural: streak.material.fragmentShader.includes('trailSampleProcedural'),
    streakTrailTime: !!streak.material.uniforms.uTrailTime,
    ribbonProcedural,
    trailStreaksSpawned: inspect.trails.trailStreaksSpawned,
    trailParticlesSpawned: inspect.trails.trailParticlesSpawned,
  }));
}

console.log('SG-08 renderer VFX consumer checks OK');
