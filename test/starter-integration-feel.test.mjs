// SR-04: the swing the hands asked for, and the meeting the camera should keep in frame.
// The first dash impulse stays the pinned tangent shove. What changes is the next forward
// command on a still-slack line, and the chase bias toward a solution the throw owner already named.
import assert from 'node:assert/strict';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { orbitHeadingThrustGate, stepAnchorRelativeOrbitAssist } from '../src/core/flight/orbitAssist.js';
import { STARTER_FIELD_ID, STARTER_FIELD_MACHINE, STARTER_FIELD_SECTOR_ID } from '../src/data/environmentalMachinery.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { zoneAt } from '../src/data/sectorZones.js';
import { chaseCompositionMotionScale, resolveChaseComposition } from '../src/render/camera.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { createBus } from '../src/core/eventBus.js';

const DT = 1 / 60;

function recordingBus() {
  const events = [];
  return {
    events,
    emit(type, payload) { events.push({ type, payload }); },
    on() { return () => {}; },
    off() {},
  };
}

function dashRig(swingDrive) {
  const bus = recordingBus();
  const anchor = { id: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, alive: true };
  const player = {
    id: 1,
    alive: true,
    rot: 0,
    pos: { x: 110, z: 0 },
    vel: { x: 0, z: 50 },
    mass: 100,
    flags: {},
    boost: { energy: 100, max: 100, regenRate: 18, drainRate: 40, dashImpulse: 120, dashCost: 28, dashCooldown: 3 },
    data: { derived: { swingDrive } },
  };
  const state = {
    simTime: 0,
    tick: 0,
    playerId: 1,
    mode: 'flight',
    player: { tether: { active: true, targetId: 2, phase: 'slack' } },
    entities: new Map([[1, player], [2, anchor]]),
    ui: null,
  };
  const system = Object.create(flightV3);
  system.bus = bus;
  system._swingCommit = null;
  return { system, player, anchor, state, bus };
}

function slackOrbit(commitDirection, flightIntent = { forward: 1, lateral: 0 }, phase = 'slack') {
  const host = { pos: { x: 110, z: 0 }, vel: { x: 0, z: 50 }, rot: 0, alive: true, mass: 100 };
  const anchor = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, alive: true, mass: 11000 };
  return stepAnchorRelativeOrbitAssist({
    dt: DT,
    host,
    anchor,
    tether: { active: true, targetId: 2, phase, restLength: 110 },
    flightIntent,
    commitDirection,
    input: { throttle: 1, strafe: 0, turn: 0, brake: false },
    profile: { maxYawRate: 2.5 },
    strength: 'standard',
  });
}

test('swing drive: the tangent dash is unchanged, then forward on a slack line keeps that tangent', () => {
  const { system, player, state, bus } = dashRig(true);
  const fired = system._triggerDash(player, player.boost, state);
  assert.equal(fired, true);
  const impulse = consumePhysicsCommand(player).impulses[0];
  assert.ok(Math.abs(impulse.x) < 1e-6, `no radial impulse (x=${impulse.x})`);
  assert.ok(impulse.z > 0, `impulse follows the +z tangent (z=${impulse.z})`);
  assert.ok(Math.abs(Math.hypot(impulse.x, impulse.z) - 100 * 120 * 1.35) < 1e-3);
  assert.ok(bus.events.some((event) => event.type === 'ship:swingDash'));
  assert.equal(system._swingCommit.direction, 1);
  assert.equal(system._swingCommit.targetId, 2);
  assert.ok(system._swingCommit.until - state.simTime > 1);

  const committed = slackOrbit(system._swingCommit.direction);
  assert.equal(committed.active, true);
  assert.equal(committed.telemetry.intentSource, 'swing-drive');
  assert.equal(committed.telemetry.reason, 'line-slack');
  assert.ok(committed.input.turn > 0.2, `nose yaws toward the +z tangent (turn=${committed.input.turn})`);
  assert.ok(Math.abs(committed.telemetry.headingError - Math.PI / 2) < 0.05);
  assert.equal(committed.input.throttle, 1, 'the helper does not add or spend thrust');
  const gate = orbitHeadingThrustGate(committed.telemetry);
  assert.ok(gate < 0.05, `radial thrust stays gated until the nose is on the tangent (gate=${gate})`);

  const bare = slackOrbit(0);
  assert.equal(bare.active, false);
  assert.equal(bare.telemetry.reason, 'line-slack');
  assert.equal(bare.input.turn, 0);
});

test('swing drive: a loaded line still carries with no commit, and a reversal or brake drops the window', () => {
  const carried = slackOrbit(0, { forward: 0, lateral: 0 }, 'loaded');
  assert.equal(carried.active, true);
  assert.equal(carried.telemetry.intentSource, 'swing-carry');

  const { system, player, state } = dashRig(true);
  system._triggerDash(player, player.boost, state);
  const reversed = system._liveSwingCommit(
    player, state, { moveZ: 1, turnIntent: -1 }, { brake: false },
  );
  assert.equal(reversed, null);
  assert.equal(system._swingCommit, null);

  system._armSwingCommit(state, state.player.tether, 1);
  state.simTime = 0.4;
  const held = system._liveSwingCommit(player, state, { moveZ: 0, turnIntent: 0 }, { brake: false });
  assert.equal(held.direction, 1, 'a pause in the throttle does not spend the window');
  const braked = system._liveSwingCommit(player, state, { moveZ: 1, turnIntent: 0 }, { brake: true });
  assert.equal(braked, null);

  system._armSwingCommit(state, state.player.tether, 1);
  state.simTime = system._swingCommit.until;
  assert.equal(system._liveSwingCommit(player, state, { moveZ: 1 }, { brake: false }), null);

  state.player.tether.active = false;
  system._armSwingCommit(state, { targetId: 2 }, 1);
  state.simTime = 0;
  assert.equal(system._liveSwingCommit(player, state, { moveZ: 1 }, { brake: false }), null);
});

test('swing drive: without the module a dash stays on the nose and leaves no commit', () => {
  const { system, player, state, bus } = dashRig(false);
  system._triggerDash(player, player.boost, state);
  const impulse = consumePhysicsCommand(player).impulses[0];
  assert.ok(impulse.x > 0);
  assert.ok(Math.abs(impulse.z) < 1e-6);
  assert.equal(system._swingCommit, null);
  assert.equal(bus.events.some((event) => event.type === 'ship:swingDash'), false);
});

test('swing drive: death, respawn, and Continue drop a commit that the wreck no longer owns', () => {
  const bus = createBus();
  const { system, player, state } = dashRig(true);
  system.init({ state, bus });
  system._triggerDash(player, player.boost, state);
  assert.ok(system._swingCommit);
  bus.emit('player:death', { recoverable: true });
  assert.equal(system._swingCommit, null);

  system._armSwingCommit(state, state.player.tether, 1);
  bus.emit('player:respawn', {});
  assert.equal(system._swingCommit, null);

  system._armSwingCommit(state, state.player.tether, 1);
  bus.emit('save:loaded', {});
  assert.equal(system._swingCommit, null);
});

test('chase camera leans toward a valid release meeting and keeps that lean under reduced motion', () => {
  const player = { id: 1, pos: { x: 0, z: 0 }, alive: true, team: 0, hull: 100 };
  const entities = new Map([[1, player]]);
  const aimed = {
    entities,
    massline2: { throw: { solution: { valid: true, predicted: { x: 200, z: 0 } }, selfSolution: null } },
  };
  const composed = resolveChaseComposition(aimed, player, { x: 0, z: 0 });
  assert.equal(composed.hasReleaseFocus, true);
  assert.ok(Math.abs(composed.x - 80) < 1e-6, `40% of 200, capped under 140 (x=${composed.x})`);
  assert.ok(Math.abs(composed.z) < 1e-6);

  const far = {
    entities,
    massline2: { throw: { solution: { valid: true, predicted: { x: 1000, z: 0 } } } },
  };
  const capped = resolveChaseComposition(far, player, { x: 0, z: 0 });
  assert.ok(Math.abs(capped.x - 140) < 1e-6, 'a far meeting cannot pull the frame off the hull');

  const missed = {
    entities,
    massline2: { throw: { solution: { valid: false, predicted: { x: 200, z: 0 } } } },
  };
  const honest = resolveChaseComposition(missed, player, { x: 0, z: 0 });
  assert.equal(honest.hasReleaseFocus, false);
  assert.equal(honest.x, 0);

  const plain = resolveChaseComposition({ entities }, player, { x: 0, z: 0 });
  assert.equal(plain.hasReleaseFocus, false);
  assert.equal(plain.x, 0);

  assert.equal(chaseCompositionMotionScale({ hasReleaseFocus: true }, true), 1);
  assert.equal(chaseCompositionMotionScale({ hasActiveAttacker: true }, true), 1);
  assert.equal(chaseCompositionMotionScale({ hasTetherFocus: true }, true), 0.35);
  assert.equal(chaseCompositionMotionScale({ hasReleaseFocus: false }, false), 1);
});

test('Helios starter yard: the claim cracker sits in the starter rocks, a short hop from the station', () => {
  const anchors = SECTOR_ANCHORS[STARTER_FIELD_SECTOR_ID];
  const station = anchors.stations.find((row) => row.id === 'station_helios');
  const field = anchors.fields.find((row) => row.id === STARTER_FIELD_ID);
  const cracker = STARTER_FIELD_MACHINE;
  assert.equal(cracker.sectorId, STARTER_FIELD_SECTOR_ID);
  assert.equal(cracker.id, 'helios_claim_cracker');
  const inside = Math.hypot(cracker.localPos.x - field.center.x, cracker.localPos.z - field.center.z);
  assert.ok(inside < field.clusterRadius, `cracker is inside the starter field (${inside} vs ${field.clusterRadius})`);
  const hop = Math.hypot(cracker.localPos.x - station.pos.x, cracker.localPos.z - station.pos.z);
  assert.ok(hop < 800, `cracker is a short hop from Helios station (${hop} WU)`);
  assert.ok(cracker.anvil.mass >= 1000, 'the anvil is heavy enough to swing around');
  const zone = zoneAt(STARTER_FIELD_SECTOR_ID, cracker.localPos.x, cracker.localPos.z);
  assert.equal(zone && zone.id, 'zone_helios_claim');
});
