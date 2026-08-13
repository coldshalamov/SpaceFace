// W1-4: Travel Burn, held boost and dash use the player's single drive-energy pool.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  FLIGHT_V3_TRAVEL_TUNING,
  flightV3,
  travelBurnCost,
} from '../src/systems/flightV3.js';
import { input } from '../src/systems/input.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';

const DT = 1 / 60;

function withTravelBurn(fn, enabled = true) {
  const previous = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.travelBurn = enabled;
  try { return fn(); } finally { TRAVEL_FLAGS.travelBurn = previous; }
}

function makeRig(energy = 100) {
  const spec = makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    fittings: NEW_GAME.fittedModules || [],
    pos: { x: 0, z: 0 },
  });
  const entity = {
    ...spec,
    id: 1,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    flags: { boosting: false },
  };
  entity.boost.energy = energy;
  entity.boost.max = 100;
  entity.boost.drainRate = 30;
  entity.boost.regenRate = 20;
  entity.boost.dashImpulse = 0;
  entity.boost.dashCd = 3;
  entity.boost.dashCdT = 0;

  const state = {
    playerId: 1,
    simTime: 0,
    tick: 0,
    input: { travelDrive: { state: 'engaged', cap: 0 } },
    player: {},
    entities: new Map([[1, entity]]),
    nav: {},
    settings: { controls: { flightMode: 'assisted' }, gameplay: {} },
    ui: { screenStack: [] },
    flight: { mode: 'manual' },
    world: {},
  };
  const host = Object.create(flightV3);
  Object.assign(host, {
    state,
    bus: { emit() {} },
    _prevBoost: false,
    _suppressBoostUntilRelease: false,
    _masslineSlingUntil: 0,
    _dashEarnedUntil: 0,
  });
  return { host, state, entity };
}

function stepPlayer(rig, dt = DT, raw = { moveZ: 1, boost: false }) {
  flightV3._stepCraft.call(rig.host, rig.entity, raw, dt, rig.state, true);
  rig.state.simTime += dt;
  rig.state.tick += 1;
  // The real input system carries the kernel-published cap into the next tick.
  if (Number.isFinite(rig.entity._flightFrame && rig.entity._flightFrame.travelCap)) {
    rig.state.input.travelDrive.cap = rig.entity._flightFrame.travelCap;
  }
}

function makeInputOwner() {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = null;
  host.touch = null;
  host._travel = {
    state: 'engaged', cap: 0, rampMult: 1, spoolT: 0, cooldownT: 0, engagedT: 0, breakReason: null,
  };
  return host;
}

function makeInputOwnerState() {
  const player = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0 };
  return {
    mode: 'flight', playerId: 1, simTime: 0, tick: 0,
    ui: { screenStack: [] }, settings: {}, nav: {}, player: {
      travelDrive: { disruptRequest: true, disruptReason: 'energy' },
    },
    entities: { get: (id) => (id === 1 ? player : null) },
    input: {
      actions: {}, aimWorld: { x: 0, z: 0 }, mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false }, autoFire: false,
      travelDrive: { state: 'engaged', cap: 0 },
    },
  };
}

test('W1-4: engaged burn drains the same p.boost pool and leaves generic energy untouched', () => {
  withTravelBurn(() => {
    const rig = makeRig(10);
    stepPlayer(rig);
    assert.equal(rig.entity.boost.energy, 10 - travelBurnCost(rig.entity.boost, DT));
    assert.equal(rig.entity.energy, undefined, 'Travel Burn must not create or debit entity.energy');
    assert.equal(rig.state.player.travelDrive?.disruptRequest, undefined);
  });
});

test('W1-4: zero-at-start suppresses the kernel burn and requests input-owned cooldown', () => {
  withTravelBurn(() => {
    const rig = makeRig(0);
    stepPlayer(rig);
    assert.equal(rig.entity.boost.energy, 0);
    assert.equal(rig.state.player.travelDrive.disruptRequest, true);
    assert.equal(rig.state.player.travelDrive.disruptReason, 'energy');
    assert.equal(rig.entity._flightFrame.travelDrive, 'cooldown', 'no free burn tick at zero energy');
  });
});

test('W1-4: a partial final tick pays remaining energy without an engaged kernel tick', () => {
  withTravelBurn(() => {
    const rig = makeRig(0.25);
    stepPlayer(rig);
    assert.equal(rig.entity.boost.energy, 0);
    assert.equal(rig.state.player.travelDrive.disruptRequest, true);
    assert.equal(rig.entity._flightFrame.travelDrive, 'cooldown', 'exhaustion suppresses the kernel burn immediately');
  });
});

test('W1-4: held boost and an accepted tap-dash debit the same drive pool as burn', () => {
  withTravelBurn(() => {
    const rig = makeRig(100);
    rig.entity.boost.dashImpulse = 5;
    rig.entity.boost.dashCost = 10;

    // Held boost spends its fitted drain and Travel Burn spends the same amount again.
    stepPlayer(rig, DT, { moveZ: 1, boost: true });
    assert.equal(rig.entity.flags.boosting, true);
    assert.equal(rig.entity.boost.energy, 100 - 2 * rig.entity.boost.drainRate * DT);

    // Release within the tap window: the dash cost and the burn debit both land on p.boost.
    stepPlayer(rig, DT, { moveZ: 1, boost: false });
    assert.equal(rig.entity.boost.energy,
      100 - 2 * rig.entity.boost.drainRate * DT - rig.entity.boost.dashCost
        - rig.entity.boost.drainRate * DT);
    assert.equal(rig.entity.energy, undefined, 'dash/boost/burn must not create generic energy');
  });
});

test('W1-4: input owns depletion transition and consumes the one-shot energy marker', () => {
  withTravelBurn(() => {
    const host = makeInputOwner();
    const state = makeInputOwnerState();
    host.update(DT, state);
    assert.equal(state.input.travelDrive.state, 'cooldown');
    assert.equal(state.input.travelDrive.breakReason, 'energy');
    assert.equal(state.player.travelDrive.disruptRequest, false);
    assert.equal(state.player.travelDrive.disruptReason, null);
  });
});

test('W1-4: flag-off preserves the pre-Travel-Burn shape and leaves the pool untouched', () => {
  withTravelBurn(() => {
    const rig = makeRig(10);
    delete rig.state.input.travelDrive;
    stepPlayer(rig);
    assert.equal(rig.entity.boost.energy, 10 + rig.entity.boost.regenRate * DT,
      'flag-off keeps the existing deterministic boost regen path');
    assert.equal(rig.state.player.travelDrive, undefined);
    assert.equal(Object.hasOwn(rig.entity._flightFrame, 'travelDrive'), false);
    assert.equal(Object.hasOwn(rig.entity._flightFrame, 'travelCap'), false);
  }, false);
});

test('W1-4: burn regen is deterministic and frame-rate equivalent', () => {
  withTravelBurn(() => {
    const run = (dt, ticks) => {
      const rig = makeRig(0);
      // Start above zero so the latch remains engaged for the whole one-second comparison.
      rig.entity.boost.energy = 100;
      for (let i = 0; i < ticks; i += 1) stepPlayer(rig, dt);
      return rig.entity.boost.energy;
    };
    const sixtyHz = run(1 / 60, 60);
    const thirtyHz = run(1 / 30, 30);
    assert.equal(sixtyHz, 70);
    assert.equal(thirtyHz, 70);
  });
});

test('W1-4: NPC flight and HUD remain readers, not writers of the player drive pool', () => {
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.doesNotMatch(hud, /boost\.energy\s*=/, 'HUD must not write the drive pool');
  withTravelBurn(() => {
    const playerRig = makeRig(10);
    const npc = { ...playerRig.entity, id: 2, isPlayer: false, data: { ...playerRig.entity.data }, boost: { ...playerRig.entity.boost } };
    npc.data.intent = { moveZ: 1, moveX: 0, turnIntent: 0, boost: false };
    const before = npc.boost.energy;
    flightV3._stepCraft.call(playerRig.host, npc, npc.data.intent, DT, playerRig.state, false);
    assert.equal(npc.boost.energy, before, 'NPC flight must not debit the player drive pool');
    assert.equal(playerRig.entity.boost.energy, 10, 'NPC flight must not touch the player pool');
  });
});

test('W1-4 tuning keeps the shared pool rate explicit', () => {
  assert.equal(FLIGHT_V3_TRAVEL_TUNING.TRAVEL_BURN_DRAIN_MULT, 1);
  assert.equal(travelBurnCost({ drainRate: 30 }, 1 / 30), 1);
  assert.equal(travelBurnCost({ drainRate: 30 }, 1 / 60), 0.5);
});
