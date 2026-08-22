import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { FLEET_MAX_SHIPS } from '../src/render/thruster/systems/familyFleet.js';

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

function isParentedTo(object, ancestor) {
  for (let node = object; node; node = node.parent) {
    if (node === ancestor) return true;
  }
  return false;
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
  // This block used to assert the player's two authored trail sockets were bound into the
  // card-plume pool: socketCount === 2, pool slots carrying those exact world poses, visible
  // multi-segment plume geometry under throttle. Commit 401e0ebf (2026-08-11) moved the
  // player's hero exhaust to energy.plasmaStream and writes zero card-plume sockets on
  // purpose. The check went stale; the game did not regress. It now asserts plasma-stream
  // ownership, that both authored poses still land in _productionPlumeSocketView, and that
  // the stream spools to a drawing ribbon.
  const { state, system } = makeHarness({ video: { energyMaterials: true } });
  const player = state.entities.get(state.playerId);
  player.data = { defId: 'ship_kestrel' };
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

  // Prove the LIVE update path did the binding rather than doing it here: a check that calls the
  // writer itself would repair _productionPlumeSocketView and then pass its own pose assertions
  // against the repaired data, so deleting the live call would not be caught.
  //
  // _productionPlumeSocketView is shared scratch reused by every ship in one update, so the port
  // ship's write would overwrite the player's before the assertions run. Snapshot the view AT the
  // player's call instead of killing the second ship — that keeps the multi-ship scenario the old
  // block covered while still reading the player's own live binding.
  const writeProductionPlumeSockets = system._writeProductionPlumeSockets;
  const socketWriteCalls = [];
  system._writeProductionPlumeSockets = function wrappedWriteProductionPlumeSockets(...args) {
    const result = writeProductionPlumeSockets.apply(this, args);
    const view = system._productionPlumeSocketView;
    socketWriteCalls.push({
      entity: args[0],
      result,
      viewLength: view ? view.length : -1,
      snapshot: (view || []).map((s) => ({ x: s.x, y: s.y, z: s.z, ax: s.ax, ay: s.ay, az: s.az })),
    });
    return result;
  };

  system.update(1 / 60);
  const fleet = system._energy && system._energy.fleet;
  assert(fleet, 'production family fleet must own the live thruster path');
  // Exact ownership: player always reserved; harness target may also join when near.
  assert.ok(fleet.activeShipCount >= 1 && fleet.activeShipCount <= fleet.maxShips,
    `fleet ownership must be bounded 1..${fleet.maxShips} (got ${fleet.activeShipCount})`);
  const playerShip = fleet.findShip(player.id) || fleet.ships.find((s) => s.alive && s.isPlayer);
  assert.ok(playerShip && playerShip.isPlayer, 'player must occupy a fleet slot');
  assert.equal(playerShip.profileId, 'engine_ion_small');
  const plasmaStream = system._energy && system._energy.plasmaStream;
  assert(plasmaStream, 'player must bind a plasma stream as the declared hero-exhaust owner');
  // 0 sockets is the deliberate plasma-stream ownership from 401e0ebf (2026-08-11).
  // A non-zero value here would mean the card plume had silently taken the player's jet back.
  assert.equal(playerShip.socketCount, 0, 'player card-plume socketCount must stay 0; a non-zero value means the card plume took the jet back');
  const playerSocketWrites = socketWriteCalls.filter((call) => call.entity === player);
  assert.ok(playerSocketWrites.length >= 1, 'live update must call the socket writer with the player entity');
  const playerWrite = playerSocketWrites[playerSocketWrites.length - 1];
  assert.equal(playerWrite.result, 2, 'live writer must bind both authored trail sockets');
  assert.equal(playerWrite.viewLength, 2, 'production socket view must carry both authored trail sockets');
  system._writeProductionPlumeSockets = writeProductionPlumeSockets;
  const socketView = playerWrite.snapshot;
  socket.updateWorldMatrix(true, false);
  const expected = new THREE.Vector3();
  const expectedQuat = new THREE.Quaternion();
  const expectedScale = new THREE.Vector3();
  socket.matrixWorld.decompose(expected, expectedQuat, expectedScale);
  const expectedForward = new THREE.Vector3(-1, 0, 0).applyQuaternion(expectedQuat).normalize();
  const first = socketView[0];
  assertClose(first.x, expected.x, 'energy plume should share trail socket x');
  assertClose(first.y, expected.y, 'energy plume should share trail socket y');
  assertClose(first.z, expected.z, 'energy plume should share trail socket z');
  assertClose(first.ax, -expectedForward.x, 'energy plume axis should oppose exhaust x');
  assertClose(first.ay, -expectedForward.y, 'energy plume axis should oppose exhaust y');
  assertClose(first.az, -expectedForward.z, 'energy plume axis should oppose exhaust z');
  portSocket.updateWorldMatrix(true, false);
  const portExpected = new THREE.Vector3();
  const portExpectedQuat = new THREE.Quaternion();
  portSocket.matrixWorld.decompose(portExpected, portExpectedQuat, expectedScale);
  const port = socketView[1];
  assertClose(port.x, portExpected.x, 'port energy plume should share its socket x');
  assertClose(port.y, portExpected.y, 'port energy plume should share its socket y');
  assertClose(port.z, portExpected.z, 'port energy plume should share its socket z');
  assert.equal(system._liveCount, 0, 'production Kestrel plume must not add bead particles');
  const maxSpoolFrames = 60;
  let spoolFrames = 1;
  let plasmaInspect = plasmaStream.inspect();
  while (!plasmaInspect.active && spoolFrames < maxSpoolFrames) {
    system.update(1 / 60);
    spoolFrames += 1;
    plasmaInspect = plasmaStream.inspect();
  }
  assert.ok(plasmaInspect.active,
    `plasma stream must become active under throttle (drive=${plasmaInspect.drive} after ${spoolFrames} frames)`);
  assert.ok(plasmaInspect.drive > 0.08,
    `plasma stream drive must rise above idle (drive=${plasmaInspect.drive} after ${spoolFrames} frames)`);
  assert.equal(plasmaStream.group.visible, true, 'plasma stream group should be visible under throttle');
  const ribbon = plasmaInspect.ribbon;
  assert.ok(ribbon && ribbon.visible, 'plasma ribbon should be visible under throttle');
  assert.ok(ribbon.jetLength > 0, 'plasma ribbon must have a positive jetLength');
  assert.ok(ribbon.stations > 1, 'plasma ribbon geometry must be multi-station');
  let ribbonMesh = null;
  plasmaStream.group.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    // buildRibbonGeometry in plasmaRibbons.js tags the indexed sheet mesh with aStation.
    if (!obj.geometry.getAttribute('aStation')) return;
    ribbonMesh = obj;
  });
  assert.ok(ribbonMesh, 'plasma stream group must contain the ribbon mesh from the live object graph');
  assert.equal(ribbonMesh.visible, true, 'plasma ribbon mesh must be visible under throttle');
  assert.ok(isParentedTo(ribbonMesh, state.render.scene), 'plasma ribbon mesh must be parented up to the harness scene');
  // plasmaRibbons.js buildRibbonGeometry draws through geo.setIndex(...); it never sets drawRange.
  const indexedCount = ribbonMesh.geometry.index && ribbonMesh.geometry.index.count;
  assert.ok(indexedCount > 0, `plasma ribbon indexed draw count must be positive (got ${indexedCount})`);
  assert.equal(system._liveTrailStreakCount, 0, 'production Kestrel plume must not add detached streak cards');
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
  // Player + near target ride production; far NPC is culled from trails.
  assert(inspect.trails.trailEmittersSkipped >= 1, 'far off-radar NPC should skip trail emission');
  assert.equal(inspect.trails.trailParticlesSpawned, 0,
    'engine trails must not reintroduce moving point-particle bead chains');
  const fleet = system._energy && system._energy.fleet;
  assert(fleet && fleet.activeShipCount >= 1, 'production fleet must reserve the player');
  const plume = system._energy && system._energy.plumeSystem;
  assert(plume && plume.group.visible, 'player production plume remains the primary engine cue');
}

{
  const { state, system } = makeHarness();
  const player = state.entities.get(state.playerId);
  player._flightFrame = { throttle: 1 };
  player.rot = 0;
  player.radius = 28;
  player.vel = { x: 50, z: 0 };
  player.data = { defId: 'ship_kestrel' };
  // Distinct near family + fleet fillers so streak substrate still binds for overflow ships.
  const npc = {
    id: 7,
    type: 'ship',
    alive: true,
    pos: { x: 30, z: 0 },
    vel: { x: 40, z: 0 },
    rot: 0,
    radius: 12,
    data: { defId: 'ship_wasp' },
    _flightFrame: { throttle: 1 },
  };
  state.entities.set(npc.id, npc);
  state.entityList.push(npc);
  // Fillers must actually exceed the fleet's sanity ceiling for overflow to exist. The
  // count is derived, not hard-coded, so raising the ceiling does not silently turn this
  // into a check that no longer exercises the legacy substrate (which is what a literal
  // 12 did once the fleet became a growable pool).
  for (let i = 0; i < FLEET_MAX_SHIPS + 2; i++) {
    const filler = {
      id: 200 + i,
      type: 'ship',
      alive: true,
      pos: { x: 15 + i * 4, z: 8 },
      vel: { x: 20, z: 0 },
      rot: 0,
      radius: 10,
      data: { defId: 'ship_mule' },
      _flightFrame: { throttle: 1 },
    };
    state.entities.set(filler.id, filler);
    state.entityList.push(filler);
  }
  system._markEntityCacheDirty();
  for (let f = 0; f < 6; f++) system.update(1 / 60);
  assert.equal(system._particleMat.type, 'ShaderMaterial', 'trail particles must use ShaderMaterial');
  assert(system._particleMat.fragmentShader.includes('trailSampleProcedural'),
    'particle fragment must procedurally sample trail streaks');
  assert(system._particleMat.uniforms.uTrailTime, 'particle shader must animate warp via uTrailTime');
  assert(system._trailStreakPool && system._trailStreakPool.capacity > 0, 'trail streak pool must be initialized');
  const fleet = system._energy && system._energy.fleet;
  assert(fleet, 'family production fleet required');
  const ion = fleet.familyPlume('engine_ion_small');
  const vector = fleet.familyPlume('engine_vector');
  assert(ion && ion.group.visible && ion.pool.activeCount > 0,
    'player production thruster must own the live engine cue');
  assert(vector && vector.group.visible && vector.pool.activeCount > 0,
    'near NPC vector family must be live simultaneously (stronger multi-ship assertion)');
  assert.ok(ion.getActiveGeometryStats().vertexCount > 4, 'production geometry must be segmented');
  const streak = system._trailStreakPool.mesh.count > 0 ? system._trailStreakPool.mesh : null;
  assert(streak, 'fleet overflow ships should show procedural streak mesh');
  assert(streak.isInstancedMesh, 'streak pool should submit one instanced draw');
  assert.equal(streak.material.type, 'ShaderMaterial', 'streak must be ShaderMaterial not SpriteMaterial');
  assert(streak.material.fragmentShader.includes('trailSampleProcedural'),
    'streak fragment must use live procedural sampler');
  assert(streak.material.uniforms.uTrailTime, 'streak must animate warp via uTrailTime');
  const inspect = system.inspect();
  assert(inspect.trails.trailStreaksSpawned >= 1, 'overflow ships should spawn a procedural streak layer');
  assert(system._liveTrailStreakCount > 0, 'dedicated streak pool should retain live meshes after thrust frames');
  assert.equal(inspect.trails.trailParticlesSpawned, 0,
    'thrusting ships should not spawn axis-aligned point-particle beads');
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
    streakPoolCap: system._trailStreakPool.capacity,
    liveTrailStreakMeshes: system._liveTrailStreakCount,
    productionPlume: true,
    productionFamilies: [ion.group.visible, vector.group.visible],
    engineProfileId: system._energy && system._energy.engineProfileId,
    streakShader: streak.material.type,
    streakProcedural: streak.material.fragmentShader.includes('trailSampleProcedural'),
    streakTrailTime: !!streak.material.uniforms.uTrailTime,
    ribbonProcedural,
    trailStreaksSpawned: inspect.trails.trailStreaksSpawned,
    trailParticlesSpawned: inspect.trails.trailParticlesSpawned,
    segmentedVerts: ion.getActiveGeometryStats().vertexCount,
  }));
}

console.log('SG-08 renderer VFX consumer checks OK');
