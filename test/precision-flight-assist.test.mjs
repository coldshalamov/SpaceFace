import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { flightV3 } from '../src/systems/flightV3.js';

const DT = 1 / 60;
const profile = PROPULSION_PROFILES.drive_reaction_m;
const body = (x = 20, z = 0) => ({
  pos: { x: 0, z: 0 }, vel: { x, z }, rot: 0, angVel: 0, mass: 24, inertia: 90,
});

function command(b, input = {}, extra = {}) {
  return stepPropulsion({ dt: DT, body: b, profile,
    input: { assistMode: 'assisted', precisionAssist: true, ...input }, ...extra });
}

function coast(speed, precisionAssist, seconds = 3, dt = DT) {
  const b = body(speed);
  let runtime = createPropulsionRuntime(profile);
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const result = command(b, { precisionAssist }, { dt, runtime });
    runtime = result.runtime;
    b.vel.x += result.force.x / b.mass * dt;
    b.pos.x += b.vel.x * dt;
    assert.ok(b.vel.x >= -1e-12, 'released motion must never reverse or chatter');
  }
  return b;
}

test('a short low-speed correction settles near the object instead of drifting past it', () => {
  const before = coast(20, false);
  const after = coast(20, true);
  assert.ok(after.vel.x < 0.1, `speed after 3 s: ${after.vel.x}`);
  assert.ok(after.pos.x < 11, `released travel: ${after.pos.x}`);
  assert.ok(after.pos.x < before.pos.x * 0.25, 'precision reduces overshoot by at least 75%');
  assert.ok(before.vel.x > 10, 'fixture reproduces the original low-speed drift');
  assert.ok(coast(0.12, true).vel.x < 0.001, 'sub-deadband creep also settles');
});

test('counter-thrust is stable across fixed-step sizes and does not edit the input body', () => {
  const b = body(20, 15);
  const original = structuredClone(b);
  command(b);
  assert.deepEqual(b, original);
  const fine = coast(20, true, 3, 1 / 120);
  const coarse = coast(20, true, 3, 1 / 30);
  assert.ok(Math.abs(fine.vel.x - coarse.vel.x) < 1e-9, 'exact exponential decay is step-stable');
  assert.ok(Math.abs(fine.pos.x - coarse.pos.x) < 0.3, 'integrated stopping distance stays close');
});

test('released axes settle while a held translation axis retains its thrust', () => {
  const b = body(0, 20);
  const precision = command(b, { throttle: 1 });
  const original = command(b, { throttle: 1, precisionAssist: false });
  assert.equal(precision.force.x, original.force.x);
  assert.ok(precision.force.z < original.force.z * 5, 'lateral drift is actively arrested');
  const turning = command(body(), { turn: 1 });
  assert.ok(turning.force.x < -24 * 30, 'yaw alone must not release precision stationkeeping');
  const strafe = command(body(0, 0), { strafe: 1 });
  const plainStrafe = command(body(0, 0), { strafe: 1, precisionAssist: false });
  assert.deepEqual(strafe.force, plainStrafe.force);
});

test('precision blends continuously and releases completely at cruise speed', () => {
  for (const boundary of [profile.combatSpeed * 0.18, profile.combatSpeed * 0.42]) {
    const left = command(body(boundary - 0.001)).force.x;
    const right = command(body(boundary + 0.001)).force.x;
    assert.ok(Math.abs(left - right) < 0.1, `no force step at ${boundary}`);
  }
  assert.deepEqual(command(body(90)), command(body(90), { precisionAssist: false }),
    'the first tick above the band is unchanged; later deceleration may enter precision');
  for (const speed of [120, 195, 320, 600]) {
    assert.deepEqual(coast(speed, true), coast(speed, false), `original coast preserved at ${speed}`);
  }
});

test('braking, boost, earned momentum, travel, Drift and Newtonian remain independent', () => {
  for (const input of [
    { brake: true }, { boost: true }, { physicsEarnedMomentum: true },
    { travelDrive: { state: 'spooling' } }, { travelDrive: { state: 'engaged' } },
    { assistMode: 'drift' }, { assistMode: 'newtonian' },
  ]) {
    const b = body(20, 10);
    assert.deepEqual(command(b, input), command(b, { ...input, precisionAssist: false }), JSON.stringify(input));
  }
});

test('precision spends actual drive authority and respects cloak coast scaling', () => {
  const b = body(20, 20);
  const disabled = command(b, {}, { authority: { forward: 0, reverse: 0, strafe: 0, yaw: 1 } });
  assert.deepEqual(disabled.force, { x: 0, y: 0, z: 0 });
  const damaged = command(b, {}, { authority: { forward: 0.1, reverse: 0.1, strafe: 0.1, yaw: 1 } });
  assert.ok(Math.abs(damaged.force.x) <= profile.reverseAccel * 0.1 * b.mass + 1e-9);
  assert.ok(Math.abs(damaged.force.z) <= profile.strafeAccel * 0.1 * b.mass + 1e-9);
  const normal = command(b);
  const cloaked = command(b, { coastAssistScale: 0.28 });
  assert.ok(Math.abs(cloaked.force.x - normal.force.x * 0.28) < 1e-9);
});

function flightRig({ tether = false, path = false, step = true } = {}) {
  const make = (id) => ({ id, type: 'ship', alive: true, ...body(), radius: 6, bank: 0,
    driveId: profile.id, flags: {}, data: { intent: { moveZ: 0, moveX: 0, turnIntent: 0 } } });
  const player = make(1), npc = make(2);
  const state = { mode: 'flight', tick: 1, simTime: 1, playerId: 1,
    entities: new Map([[1, player], [2, npc]]), entityList: [player, npc],
    input: { moveZ: 0, moveX: 0, turnIntent: 0,
      autoTargetPath: path ? { active: true } : null },
    settings: { gameplay: { physicsBackend: 'rapier-dynamic' } },
    player: { tether: { active: tether } }, ui: { screenStack: [] } };
  const system = Object.create(flightV3);
  const bus = createBus();
  system.init({ state, bus });
  if (!step) return { system, state, player, npc, bus };
  system.update(DT, state);
  return { player: consumePhysicsCommand(player), npc: consumePhysicsCommand(npc) };
}

test('the default production adapter enables precision for the player without leaking it to NPCs', () => {
  const { player, npc } = flightRig();
  assert.ok(player.control.force.x < -24 * 30, 'default player receives the new low-speed law');
  assert.ok(npc.control.force.x > -24 * 3, 'reused input scratch does not hand precision to the NPC');
  for (const options of [{ tether: true }, { path: true }]) {
    const excluded = flightRig(options).player;
    assert.ok(excluded.control.force.x > -24 * 4, 'trajectory controllers keep their own authority');
  }
});

test('matching a moving pursuit slot does not also engage world-relative precision braking', () => {
  const { system, state, player, npc } = flightRig({ step: false });
  state.settings.gameplay.pursuitSlotAssist = true;
  state.player.targetId = npc.id;
  npc.pos.x = 240;
  system.update(DT, state);
  assert.equal(player._pursuitSlot?.active, true, 'fixture must reach the live slot controller');
  const packet = consumePhysicsCommand(player);
  assert.ok(packet.control.force.x > -24 * 4,
    'the slot owns co-moving translation instead of fighting a second precision controller');
  assert.ok(packet.impulses.every(impulse => Math.hypot(impulse.x, impulse.z) < 1e-8),
    'a correctly matched slot should require no relative correction');
});

test('automatic precision counter-thrust reaches the existing player thrust cue', () => {
  const { system, state, bus } = flightRig({ step: false });
  const cues = [];
  bus.on('ship:thrust', cue => cues.push(structuredClone(cue)));
  system.update(DT, state);
  assert.equal(cues.length, 1);
  assert.ok(cues[0].reverse > 0, 'counter-thrust must be presented as engine effort');
  assert.equal(cues[0].throttle, 0, 'released controls must not invent a manual burn');
});

test('the native physics route applies precision counter-thrust and keeps a fast earned coast', async t => {
  for (const speed of [20, 320]) {
    const { system, state, player } = flightRig({ step: false });
    player.vel.x = speed;
    player.physicsBody = { schemaVersion: 1, mass: 24, radius: 6, inertiaY: 90,
      dynamic: true, ccd: true, revision: 0, shape: 'capsule' };
    state.entities.delete(2);
    state.entityList = [player];
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    try {
      owner.syncFromEntities([player]);
      for (let tick = 0; tick < 180; tick++) {
        state.tick = tick;
        state.simTime = tick * DT;
        system.update(DT, state);
        owner.step(DT);
      }
      t.diagnostic(JSON.stringify({ initialSpeed: speed, finalSpeed: player.vel.x, distance: player.pos.x }));
      if (speed === 20) {
        assert.ok(player.vel.x >= 0 && player.vel.x < 0.1);
        assert.ok(player.pos.x > 9 && player.pos.x < 12);
      } else {
        assert.ok(Math.abs(player.vel.x - speed) < 0.01, 'earned overspeed still coasts through Rapier');
        assert.ok(Math.abs(player.pos.x - speed * 3) < 0.1);
      }
    } finally { owner.dispose(); }
  }
});
