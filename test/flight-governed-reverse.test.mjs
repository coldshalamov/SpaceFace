import test from 'node:test';
import assert from 'node:assert/strict';
import { input as inputSystem, projectPilotFlightControls, transitionFlightKeyState } from '../src/systems/input.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { createBus } from '../src/core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { consumePhysicsCommand, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES, resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

const DT = 1 / 60;
const profile = PROPULSION_PROFILES.drive_reaction_s;
const body = (vx = 0) => ({ pos: { x: 0, z: 0 }, vel: { x: vx, z: 0 }, rot: 0,
  angVel: 0, mass: 24, inertia: 48, radius: 6 });
const command = (throttle, extras = {}) => ({ throttle, assistMode: 'assisted', manualReverse: true, ...extras });
const kernel = (input, vx = 0, p = profile) => stepPropulsion({ dt: DT, body: body(vx),
  profile: p, runtime: createPropulsionRuntime(p), input });

test('public reverse and dedicated stop are distinct; opposite release preserves last-input-wins', () => {
  assert.deepEqual(projectPilotFlightControls({ reverse: true }), {
    moveX: 0, moveZ: -1, turnIntent: 0, lineOrbit: 0, boost: false, brake: false,
  });
  assert.equal(projectPilotFlightControls({ reverse: true, brakeHeld: true }).brake, true);
  const state = { settings: { controls: { scheme: 'pilot' } }, entities: new Map(), playerId: 1 };
  let keys = transitionFlightKeyState(state, {}, { code: 'KeyW', pressed: true });
  keys = transitionFlightKeyState(state, keys, { code: 'KeyS', pressed: true });
  assert.equal(keys.KeyW, false);
  assert.equal(keys.KeyS, true);
  keys = transitionFlightKeyState(state, keys, { code: 'KeyW', pressed: false });
  assert.equal(keys.KeyS, true, 'release of the old direction must not erase held reverse');
  keys = transitionFlightKeyState(state, keys, { code: 'KeyS', pressed: false });
  assert.equal(keys.KeyS, false);
  keys = transitionFlightKeyState(state, keys, { code: 'ArrowDown', pressed: true });
  assert.equal(keys.ArrowDown, true);
  keys = transitionFlightKeyState(state, keys, { code: 'KeyW', pressed: true });
  keys = transitionFlightKeyState(state, keys, { code: 'ArrowDown', pressed: false });
  assert.equal(keys.KeyW, true, 'release of reverse must not erase the newer forward command');
  assert.equal(projectPilotFlightControls({ forward: true, reverse: true }).moveZ, 0);
  assert.equal(projectPilotFlightControls({ forward: true, reverse: true }).brake, false);
});

test('signed manual governor bounds reverse but permits counterthrust through forward overspeed', () => {
  const cap = profile.combatSpeed * 0.35;
  const cold = kernel(command(-1));
  assert.ok(cold.force.x < 0);
  assert.equal(cold.maxSpeed, cap);
  const counter = kernel(command(-1), profile.combatSpeed * 2);
  assert.ok(counter.force.x < 0, 'forward overspeed cannot suppress commanded reverse counterthrust');
  const overspeed = kernel(command(-1), -cap * 3);
  assert.ok(overspeed.force.x >= -1e-9, 'holding reverse above its cap must not add backward speed');
  assert.ok(overspeed.force.x <= 1e-9, 'the governor must coast rather than confiscate native overspeed');
  const forward = kernel(command(1), -profile.combatSpeed * 2);
  assert.ok(forward.force.x > 0, 'W must counter backward overspeed instead of deadlocking');
  assert.equal(kernel(command(-1, { brake: true })).force.x, 0, 'stop wins at rest');
});

test('reverse normalization scratch does not cap NPC/automatic or neutral packets; release keeps flight style', () => {
  const governed = kernel(command(-1));
  assert.ok(Number.isFinite(governed.maxSpeed));
  const automatic = kernel({ throttle: -1, assistMode: 'assisted' });
  assert.equal(automatic.maxSpeed, Infinity, 'manual classification cannot leak to the next kernel call');
  assert.equal(kernel(command(0, { assistMode: 'newtonian' }), -20).force.x, 0);
  assert.ok(kernel(command(0), -20).force.x > 0, 'assisted release retains existing counterthrust');
  assert.equal(kernel(command(-1, { assistMode: 'newtonian' })).maxSpeed, profile.combatSpeed * 0.35);
});

test('all drive families keep a finite manual reverse envelope without rewriting the body', () => {
  for (const p of Object.values(PROPULSION_PROFILES)) {
    const b = body();
    const before = structuredClone(b);
    const result = stepPropulsion({ dt: DT, body: b, profile: p,
      runtime: createPropulsionRuntime(p), input: command(-1) });
    assert.ok(Number.isFinite(result.maxSpeed) && result.maxSpeed > 0, p.id);
    assert.ok(result.force.x < 0, `${p.id}: reverse must spend actual retro/trim authority`);
    assert.deepEqual(b, before, `${p.id}: the kernel may publish forces, not write velocity`);
    const stopped = kernel(command(-1, { brake: true }), 0, p);
    assert.ok(Math.abs(stopped.force.x) < 1e-9, `${p.id}: dedicated stop wins over reverse at rest`);
    const stopForward = kernel(command(1, { brake: true }), 0, p);
    assert.ok(Math.abs(stopForward.force.x) < 1e-9, `${p.id}: dedicated stop wins over forward at rest`);
  }
});

function craft(id = 1, vx = 0) {
  return { id, type: 'ship', alive: true, isPlayer: id === 1, radius: 6, mass: 24,
    pos: { x: 0, z: 0 }, vel: { x: vx, z: 0 }, rot: 0, angVel: 0, hull: 100,
    physicsBody: { schemaVersion: 1, radius: 6, mass: 24, inertiaY: 48,
      dynamic: true, ccd: true, revision: 0 }, data: { defId: 'ship_kestrel' } };
}

async function nativeFlight(vx, run, extras = []) {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  const ship = craft(1, vx);
  const entities = [ship, ...extras];
  const state = { mode: 'flight', tick: 1, simTime: 0, timeScale: 1, playerId: 1,
    player: { alive: true }, input: {}, entities: new Map(entities.map(e => [e.id, e])),
    entityList: entities, settings: { gameplay: { physicsBackend: 'rapier-dynamic' } },
    flags: { physicsBackend: 'rapier-dynamic' }, ui: { screenStack: [] } };
  const flight = Object.create(flightV3);
  flight.init({ state, bus: createBus() });
  owner.syncFromEntities(entities);
  const step = (raw, ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      state.input = raw; state.tick++; state.simTime += DT;
      flight._stepCraft(ship, raw, DT, state, true);
      owner.step(DT);
      owner.drainContactImpacts();
    }
    return ship.vel.x;
  };
  try { await run({ owner, ship, state, flight, step }); }
  finally { owner.dispose(); }
}

test('actual native player force decelerates forward overspeed, crosses zero, reverses and stops', async () => {
  await nativeFlight(140, async ({ ship, step }) => {
    const reverse = projectPilotFlightControls({ reverse: true });
    const first = step(reverse);
    assert.ok(first > 100 && first < 140, 'one force tick must decelerate, never snap velocity to the reverse cap');
    step(reverse, 359);
    const cap = resolvePropulsionProfile(ship, { playerId: 1, player: {} }).combatSpeed * 0.35;
    assert.ok(ship.vel.x < -5, 'held S must cross zero into genuine native reverse');
    assert.ok(ship.vel.x >= -cap - 0.1, 'continuous thrust must remain governed');
    const backwards = ship.vel.x;
    step(projectPilotFlightControls({}), 1);
    assert.ok(ship.vel.x < 0 && ship.vel.x > backwards, 'release coasts/assists without stale reverse');
    step(reverse, 30);
    step(projectPilotFlightControls({ reverse: true, brakeHeld: true }), 240);
    assert.ok(Math.abs(ship.vel.x) < 0.5, 'S+0 must genuinely stop the native body');
    step(reverse, 30);
    assert.ok(ship.vel.x < -1, 'repress after stopping must restore reverse authority');
  });
});

test('analog negative intent reaches native reverse; native impulse overspeed is not clipped', async () => {
  await nativeFlight(0, async ({ owner, ship, step }) => {
    const raw = { moveZ: -0.8, moveX: 0, brake: false };
    step(raw, 180);
    assert.ok(ship.vel.x < -5, 'negative gamepad/touch-shaped axis must be translation, not full brake');
    queuePhysicsImpulse(ship, { x: -ship.mass * 100, y: 0, z: 0 });
    step(raw);
    assert.ok(ship.vel.x < -90, 'external impulse must survive the thrust-only cap');
    const before = ship.vel.x;
    step(raw);
    assert.ok(Math.abs(ship.vel.x - before) < 0.1, 'held reverse must coast above its cap');
    step({ moveZ: 1, moveX: 0, brake: false }, 180);
    assert.ok(ship.vel.x > 0, 'opposite forward input must escape backward overspeed');
  });
});

test('reverse makes contact with a real 24t loose load instead of bypassing collision', async () => {
  const load = { id: 2, type: 'debris', alive: true, radius: 6, mass: 24,
    pos: { x: -36, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    physicsBody: { schemaVersion: 1, radius: 6, mass: 24, inertiaY: 48,
      dynamic: true, ccd: true, revision: 0 }, data: {} };
  await nativeFlight(0, async ({ ship, step }) => {
    step(projectPilotFlightControls({ reverse: true }), 150);
    assert.ok(load.pos.x < -37 && load.vel.x < 0, 'native collision must transfer real momentum to the load');
    assert.ok(Number.isFinite(ship.vel.x));
    assert.ok(ship.pos.x > load.pos.x, 'the ship must not tunnel through the body');
  }, [load]);
});

test('adapter leaves automatic ownership intact and emits no held reverse during hard pause', async () => {
  await nativeFlight(0, async ({ ship, state, flight, step }) => {
    step(projectPilotFlightControls({ reverse: true }), 30);
    state.nav = { autopilot: { active: true, target: { x: 400, z: 0 }, status: 'acquiring' } };
    state.input = {};
    flight._stepCraft(ship, state.input, DT, state, true);
    const automatic = consumePhysicsCommand(ship);
    assert.equal(state.nav.autopilot.active, true);
    assert.ok(automatic.control.force.x > 0, 'autopilot retains its own forward counterthrust');
    state.nav.autopilot.active = false;
    state.mode = 'paused';
    state.input = projectPilotFlightControls({ reverse: true });
    flight.update(DT, state);
    assert.equal(consumePhysicsCommand(ship)?.control ?? null, null, 'hard pause may not submit the held reverse');
    state.mode = 'flight';
    state.input = {};
    flight.update(DT, state);
    const released = consumePhysicsCommand(ship);
    assert.ok(released.control.force.x >= 0, 'resumed neutral input cannot inherit a stale reverse force');
  });
});

test('live device assembly keeps a negative gamepad axis distinct from its dedicated brake', () => {
  const ship = craft();
  const state = { mode: 'flight', tick: 1, simTime: 0, playerId: 1, player: { alive: true },
    entities: new Map([[1, ship]]), input: { blocked: false, actions: {}, aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 }, pointerScreen: { x: 0, y: 0, active: false } }, ui: { screenStack: [] },
    settings: { gameplay: { controlScheme: 'pilot' }, controls: {
      gamepad: { enabled: true, scheme: 'drive', curve: 'linear', sensitivityFly: 1 }, touch: { enabled: false },
    } } };
  const host = Object.create(inputSystem);
  host.init({ state, bus: createBus(), helpers: {} });
  const originalPad = host.gamepad;
  const originalTouch = host.touch;
  const pad = { axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    actions: { brake: { held: false } }, isConnected: () => true, tick() {}, lastActiveTick: 1, lastActiveSeq: 1 };
  host.gamepad = pad;
  host.touch = null;
  const tick = () => { state.tick++; pad.lastActiveTick = state.tick; pad.lastActiveSeq++; host.update(DT, state); };
  try {
    tick(); // Ordinary neutral sample clears the existing lifecycle fence.
    pad.axes.leftY = 0.8;
    tick();
    assert.ok(state.input.moveZ < -0.5, 'actual device assembly must keep the signed axis');
    assert.equal(state.input.brake, false, 'stick-down may not silently assert full stop');
    pad.actions.brake.held = true;
    tick();
    assert.equal(state.input.brake, true, 'the real pad brake still wins');
    pad.actions.brake.held = false;
    pad.axes.leftY = 0;
    tick();
    assert.equal(state.input.brake, false);
    assert.equal(state.input.moveZ, 0);
  } finally {
    host.gamepad = originalPad;
    host.touch = originalTouch;
    host.destroy();
  }
});
