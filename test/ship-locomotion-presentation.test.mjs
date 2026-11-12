import assert from 'node:assert/strict';
import test from 'node:test';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';

// ---------------------------------------------------------------------------
// Mocks: duck-typed scene graph (plain objects; the tracker never needs THREE).
// ---------------------------------------------------------------------------

function createMockBus() {
  return {
    emitted: [],
    handlers: new Map(),
    on(evt, fn) {
      if (!this.handlers.has(evt)) this.handlers.set(evt, []);
      this.handlers.get(evt).push(fn);
      return () => {};
    },
    // Payloads are reused tracker objects: snapshot numbers at emit time.
    emit(evt, p) {
      const snap = p ? { ...p } : null;
      if (snap && snap.position) snap.position = { ...snap.position };
      this.emitted.push({ evt, p: snap });
    },
    count(evt) {
      return this.emitted.filter((e) => e.evt === evt).length;
    },
    payloads(evt) {
      return this.emitted.filter((e) => e.evt === evt).map((e) => e.p);
    },
  };
}

function createBellNode(name) {
  return {
    name,
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 },
    children: [],
  };
}

function createMockShipMesh() {
  const bell = createBellNode('Drive_Nozzle_Main');
  const plume = createBellNode('Drive_Plume_Mesh');
  const nozzle = {
    name: 'greeble_rcs_port',
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    children: [],
  };
  const hull = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    children: [bell, plume, nozzle],
  };
  return {
    rotation: { x: 0, y: 0, z: 0 },
    visible: true,
    children: [],
    userData: { hull, bell, plume, nozzle },
  };
}

function createShipEntity(id, actuators) {
  return {
    id,
    type: 'ship',
    pos: { x: 100, z: 200 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    bank: 0,
    radius: 8,
    flags: {},
    data: {},
    _flightFrame: { actuators: { ...actuators } },
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

// ---------------------------------------------------------------------------
// 1. RCS nozzle selection: Newton-correct corners from signed actuator demand.
// ---------------------------------------------------------------------------

test('locomotion RCS: yaw demand resolves a diagonal couple (bow-port + stern-starboard)', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockShipMesh();
  const entity = createShipEntity(11, { lateral: 0, yaw: 10, reverse: 0, main: 0 });

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);

  const firings = tracker.getRecord(11).rcsFirings;
  assert.equal(firings.length, 2, 'a pure yaw couple fires exactly two corner nozzles');
  const stations = firings.map((f) => `${f.station}:${f.side}`).sort();
  assert.deepEqual(stations, ['bow:-1', 'stern:1'], `diagonal couple, got ${stations}`);
  for (const f of firings) {
    assert.equal(f.dirX, -f.pushX, 'exhaust opposes the push (x)');
    assert.equal(f.dirZ, -f.pushZ, 'exhaust opposes the push (z)');
    assert.ok(f.intensity > 0.2, `meaningful intensity, got ${f.intensity}`);
  }
});

test('locomotion RCS: lateral demand resolves a same-side translation pair', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockShipMesh();
  const entity = createShipEntity(12, { lateral: 10, yaw: 0, reverse: 0, main: 0 });

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);

  const firings = tracker.getRecord(12).rcsFirings;
  assert.equal(firings.length, 2, 'pure strafe fires bow + stern on one side');
  for (const f of firings) {
    assert.equal(f.side, -1, 'starboard push lights port nozzles');
  }
  const stations = firings.map((f) => f.station).sort();
  assert.deepEqual(stations, ['bow', 'stern']);
});

test('locomotion RCS: reverse demand resolves the symmetric retro twin pair', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockShipMesh();
  const entity = createShipEntity(13, { lateral: 0, yaw: 0, reverse: 10, main: 0 });

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);

  const firings = tracker.getRecord(13).rcsFirings;
  assert.equal(firings.length, 2, 'reverse fires the retro pair');
  const roles = firings.map((f) => f.role).sort();
  assert.deepEqual(roles, ['reverse-left', 'reverse-right']);
});

test('locomotion RCS: observed-motion fallback justifies attitude without actuators', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockShipMesh();
  const entity = createShipEntity(14, { lateral: 0, yaw: 0, reverse: 0, main: 0 });
  delete entity._flightFrame; // drones / legacy craft publish no actuator block
  entity.angVel = 0;

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  assert.equal(tracker.getRecord(14).rcsFirings.length, 0, 'steady flight fires nothing');

  entity.angVel = 2.0; // spin change demands torque
  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  const firings = tracker.getRecord(14).rcsFirings;
  assert.equal(firings.length, 2, 'spin-up resolves a yaw couple from observed motion');
});

// ---------------------------------------------------------------------------
// 2. RCS puff emission: throttled, culled-aware, silent at rest.
// ---------------------------------------------------------------------------

test('locomotion RCS: maneuvering emits throttled cold-gas puffs; rest and cull stay silent', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createMockBus();
  tracker.bindEvents(bus);
  const mesh = createMockShipMesh();
  const entity = createShipEntity(21, { lateral: 0, yaw: 10, reverse: 0, main: 0 });

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  assert.equal(bus.count('ship:rcsPulse'), 2, 'first maneuver frame puffs both couple nozzles');
  const puff = bus.payloads('ship:rcsPulse')[0];
  assert.ok(Number.isFinite(puff.x) && Number.isFinite(puff.z), 'puff carries world position');
  assert.ok(Math.hypot(puff.dirX, puff.dirZ) > 0.99, 'puff carries an exhaust direction');
  assert.ok(puff.intensity > 0.2, 'puff carries intensity');
  assert.equal(puff.runaway, false, 'helmed flight is not runaway');

  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  assert.equal(bus.count('ship:rcsPulse'), 2, 'cooldown suppresses the very next frame');

  for (let i = 0; i < 10; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.032 + i * 0.016, 0.016);
  }
  assert.ok(bus.count('ship:rcsPulse') > 2, 'sustained maneuver puffs again after cooldown');

  // Rest: zero demand emits nothing more.
  const before = bus.count('ship:rcsPulse');
  entity._flightFrame.actuators.yaw = 0;
  for (let i = 0; i < 12; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 2.0 + i * 0.016, 0.016);
  }
  assert.equal(bus.count('ship:rcsPulse'), before, 'rest fires no puffs');

  // Cull: a maneuvering but invisible mesh stays silent.
  entity._flightFrame.actuators.yaw = 10;
  mesh.visible = false;
  for (let i = 0; i < 12; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 3.0 + i * 0.016, 0.016);
  }
  assert.equal(bus.count('ship:rcsPulse'), before, 'culled meshes emit no puffs');
});

// ---------------------------------------------------------------------------
// 3. Engine gimbal: bells aim the stern-local thrust vector, then recenter.
// ---------------------------------------------------------------------------

test('locomotion gimbal: bells deflect toward thrust demand and recenter at rest', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockShipMesh();
  const entity = createShipEntity(31, { lateral: 10, yaw: 0, reverse: 0, main: 30 });

  for (let i = 0; i < 30; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.0 + i * 0.016, 0.016);
  }
  const bell = mesh.userData.bell;
  assert.ok(bell.rotation.y < -0.04, `bell steers exhaust to port for a starboard push: ${bell.rotation.y}`);
  assert.ok(bell.rotation.z < -0.01, `bell nods under main-drive power: ${bell.rotation.z}`);

  entity._flightFrame.actuators.lateral = 0;
  entity._flightFrame.actuators.main = 0;
  for (let i = 0; i < 90; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 2.0 + i * 0.016, 0.016);
  }
  assert.ok(Math.abs(bell.rotation.y) < 0.01, `bell recenters at rest: ${bell.rotation.y}`);
  assert.ok(Math.abs(bell.rotation.z) < 0.01, `bell nod recenters at rest: ${bell.rotation.z}`);
});

test('locomotion gimbal: a rebuilt mesh rescans its bell pivots', () => {
  const tracker = createShipMicroMotionTracker();
  const meshA = createMockShipMesh();
  const meshB = createMockShipMesh();
  const entity = createShipEntity(32, { lateral: 10, yaw: 0, reverse: 0, main: 0 });

  tracker.updateCraftMicroMotion(entity, meshA, 1.0, 0.016);
  assert.ok(meshA.userData.bell.rotation.y !== 0, 'first mesh gimbals');

  // Shipyard rebuild swaps the mesh object; the same craft must steer the new bells.
  for (let i = 0; i < 10; i++) {
    tracker.updateCraftMicroMotion(entity, meshB, 1.016 + i * 0.016, 0.016);
  }
  assert.ok(meshB.userData.bell.rotation.y < -0.01, 'rebuilt mesh gimbals its own bells');
});

// ---------------------------------------------------------------------------
// 4. Boost ignition: edge-triggered punch + plume flare, never a held retrigger.
// ---------------------------------------------------------------------------

test('locomotion boost: the rising edge punches the hull and flares the plume once', () => {
  const tracker = createShipMicroMotionTracker();
  const mesh = createMockShipMesh();
  const entity = createShipEntity(41, { lateral: 0, yaw: 0, reverse: 0, main: 30 });
  entity.vel = { x: 60, z: 0 };

  tracker.updateCraftMicroMotion(entity, mesh, 1.0, 0.016);
  assert.equal(tracker.getRecord(41).boostFlashT, 0, 'no flare before boost');

  entity.flags.boosting = true;
  tracker.updateCraftMicroMotion(entity, mesh, 1.016, 0.016);
  const flashAtEdge = tracker.getRecord(41).boostFlashT;
  assert.ok(flashAtEdge > 0.3, `ignition opens the flare window: ${flashAtEdge}`);
  assert.ok(mesh.userData.plume.scale.x > 1.5, `plume flares at light-off: ${mesh.userData.plume.scale.x}`);

  tracker.updateCraftMicroMotion(entity, mesh, 1.032, 0.016);
  tracker.updateCraftMicroMotion(entity, mesh, 1.048, 0.016);
  assert.ok(mesh.userData.hull.position.x < -0.02, `hull punched backward: ${mesh.userData.hull.position.x}`);

  // Holding boost must not retrigger the edge.
  const flashLater = tracker.getRecord(41).boostFlashT;
  assert.ok(flashLater < flashAtEdge, 'held boost decays the flare instead of retriggering');

  // Releasing boost returns the plume to exactly its base scale (no compounding).
  entity.flags.boosting = false;
  for (let i = 0; i < 40; i++) {
    tracker.updateCraftMicroMotion(entity, mesh, 1.05 + i * 0.016, 0.016);
  }
  assert.ok(Math.abs(mesh.userData.plume.scale.x - 1) < 0.01, `plume scale restored: ${mesh.userData.plume.scale.x}`);
});

// ---------------------------------------------------------------------------
// 5. Death spiral: spin, runaway RCS, seam pops, single core flash, cold wrecks rest.
// ---------------------------------------------------------------------------

function seedKill(tracker, bus, kill) {
  const ship = createShipEntity(kill.id, { lateral: 0, yaw: 0, reverse: 0, main: 0 });
  tracker.updateCraftMicroMotion(ship, createMockShipMesh(), kill.t, 0.016);
  tracker.onKilled({ id: kill.id, type: 'ship', pos: { x: kill.x, z: kill.z }, radius: 8 });
  bus.emitted.length = 0; // drop the kill-frame breach pop; the spiral is under test
}

function createWreck(id, x, z) {
  return {
    id,
    type: 'wreck',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0.5,
    radius: 8,
    data: { parentType: 'ship' },
  };
}

test('locomotion death: fresh wreck spirals with runaway RCS, pops, and one core flash', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createMockBus();
  tracker.bindEvents(bus);
  seedKill(tracker, bus, { id: 7, x: 100, z: 200, t: 100.0 });

  const wreck = createWreck(9, 102, 201);
  const mesh = { rotation: { x: 0, y: 0, z: 0 }, children: [] };

  assert.equal(tracker.updateDeathSpiral(wreck, mesh, 100.1, 0.016, {}), true, 'fresh wreck spirals');
  assert.ok(mesh.rotation.y !== 0, 'spiral yaws the hulk immediately');

  let flashTime = -1;
  let t = 100.1;
  for (let i = 0; i < 130; i++) {
    t += 0.016;
    tracker.updateDeathSpiral(wreck, mesh, t, 0.016, {});
    if (flashTime < 0 && bus.count('ship:deathFlash') > 0) flashTime = t;
  }

  const runaway = bus.payloads('ship:rcsPulse');
  assert.ok(runaway.length >= 3, `runaway RCS fires through the spiral: ${runaway.length}`);
  assert.ok(runaway.every((p) => p.runaway === true), 'spiral puffs are flagged runaway');
  assert.ok(bus.count('ship:deathPop') >= 2, `secondary seam pops fire: ${bus.count('ship:deathPop')}`);
  assert.equal(bus.count('ship:deathFlash'), 1, 'core detonates exactly once');
  assert.ok(flashTime - 100.1 >= 0.84 && flashTime - 100.1 < 0.95, `flash lands at ~0.85s of spiral age (got ${flashTime - 100.1})`);
  assert.equal(bus.count('camera:shake'), 1, 'flash kicks the camera once');
  const shake = bus.payloads('camera:shake')[0];
  assert.ok(shake.position && Number.isFinite(shake.position.x), 'shake carries world position for falloff');
  assert.equal(bus.count('audio:cue'), 1, 'flash plays one delayed detonation');
  assert.equal(bus.payloads('audio:cue')[0].id, 'sfx_explosion_small');
  assert.equal(tracker.getRecord(9).spiralState, 2, 'spiral settles to the holding state');
});

test('locomotion death: cold, foreign, and non-ship wrecks never spiral', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createMockBus();
  tracker.bindEvents(bus);
  seedKill(tracker, bus, { id: 7, x: 100, z: 200, t: 100.0 });

  // Far from any fresh kill.
  const far = createWreck(20, 500, 500);
  assert.equal(tracker.updateDeathSpiral(far, { rotation: { x: 0, y: 0, z: 0 } }, 100.2, 0.016, {}), false);

  // Near the kill but not a ship wreck (scenario dressing / cold salvage).
  const cold = createWreck(21, 101, 201);
  cold.data = {};
  assert.equal(tracker.updateDeathSpiral(cold, { rotation: { x: 0, y: 0, z: 0 } }, 100.2, 0.016, {}), false);

  // Non-ship kills never arm the spiral.
  tracker.onKilled({ id: 5, type: 'asteroid', pos: { x: 300, z: 300 }, radius: 10 });
  const rockWreck = createWreck(22, 300, 301);
  assert.equal(tracker.updateDeathSpiral(rockWreck, { rotation: { x: 0, y: 0, z: 0 } }, 100.2, 0.016, {}), false);

  // Stale kills read as cold salvage.
  const stale = createWreck(23, 101, 201);
  assert.equal(tracker.updateDeathSpiral(stale, { rotation: { x: 0, y: 0, z: 0 } }, 104.5, 0.016, {}), false);

  assert.equal(bus.count('ship:deathFlash'), 0, 'no spiral, no flash');
  assert.equal(bus.count('ship:rcsPulse'), 0, 'no spiral, no runaway puffs');
});

test('locomotion death: the kill frame itself leaves one armor-seam breach pop', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createMockBus();
  tracker.bindEvents(bus);
  const ship = createShipEntity(51, { lateral: 0, yaw: 0, reverse: 0, main: 0 });
  tracker.updateCraftMicroMotion(ship, createMockShipMesh(), 50.0, 0.016);
  tracker.onKilled({ id: 51, type: 'ship', pos: { x: 10, z: 20 }, radius: 8 });
  assert.equal(bus.count('ship:deathPop'), 1, 'kill emits one immediate seam pop');
  const pop = bus.payloads('ship:deathPop')[0];
  assert.equal(pop.x, 10);
  assert.equal(pop.z, 20);
});

// ---------------------------------------------------------------------------
// 6. Contract: presentation never writes sim state.
// ---------------------------------------------------------------------------

test('locomotion contract: updates never mutate the entity (frozen sim state survives)', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createMockBus();
  tracker.bindEvents(bus);
  const entity = deepFreeze(createShipEntity(61, { lateral: 6, yaw: 8, reverse: 2, main: 25 }));
  const mesh = createMockShipMesh();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 5; i++) {
      tracker.updateCraftMicroMotion(entity, mesh, 1.0 + i * 0.016, 0.016);
    }
  }, 'craft update writes no entity field');

  const wreck = deepFreeze(createWreck(62, 100, 200));
  const wmesh = { rotation: { x: 0, y: 0, z: 0 }, children: [] };
  assert.doesNotThrow(() => {
    tracker.updateDeathSpiral(wreck, wmesh, 1.0, 0.016, {});
  }, 'spiral update writes no entity field');
});
