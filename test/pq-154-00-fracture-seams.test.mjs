// PQ-154.00 — wrecking-ball slam on a medium hull splits along an authored seam.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import {
  FRACTURE_THRESHOLD_WU,
  hullClassForMass,
  seamFor,
} from '../src/data/hullFractureSeams.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import {
  fractureThresholdWU,
  resetPendingSlams,
} from '../src/systems/hullFracture.js';
import { mining } from '../src/systems/mining.js';

const SEED = 15400;
const CLOSING = 32;
const MEDIUM_MASS = 45;

function shipSpec(extra = {}) {
  return {
    type: 'ship',
    team: extra.team != null ? extra.team : 0,
    pos: extra.pos || { x: 0, z: 0 },
    vel: extra.vel || { x: 0, z: 0 },
    rot: 0,
    angVel: extra.angVel != null ? extra.angVel : 0.4,
    radius: extra.radius || 12,
    mass: extra.mass || 18,
    hull: extra.hull != null ? extra.hull : 80,
    hullMax: extra.hullMax != null ? extra.hullMax : extra.hull || 80,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    collides: true,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: extra.radius || 12,
      mass: extra.mass || 18,
      inertiaY: 40,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: {
      defId: extra.defId || 'ship_wasp',
      shipClass: extra.shipClass || 'fighter',
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

function wreckingBallSpec() {
  return {
    type: 'payload',
    pos: { x: -20, z: 0 },
    vel: { x: 40, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 10,
    mass: 400,
    hull: 200,
    hullMax: 200,
    collides: true,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass: 400,
      inertiaY: 200,
      dynamic: true,
      ccd: true,
      material: 'payload',
      revision: 0,
    },
    data: { payloadType: 'wrecking_ball', label: 'Wrecking Ball' },
  };
}

function boot(seed) {
  resetPendingSlams();
  const sim = createSimulation({ seed, bus: createBus(), systems: [collisionConsequences, combat, mining] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn(shipSpec({
    defId: 'ship_kestrel',
    mass: 18,
    hull: 140,
    hullMax: 140,
    pos: { x: -80, z: 0 },
  }));
  state.playerId = player.id;
  const medium = sim.spawn(shipSpec({
    team: 1,
    defId: 'ship_hauler',
    shipClass: 'hauler',
    mass: MEDIUM_MASS,
    hull: 1,
    hullMax: 12,
    radius: 14,
    pos: { x: 0, z: 0 },
    vel: { x: -8, z: 2 },
    angVel: 0.35,
  }));
  const ball = sim.spawn(wreckingBallSpec());
  return { sim, state, player, medium, ball };
}

function slam(t, closingSpeed) {
  const fractures = [];
  t.sim.bus.on('hull:fractured', (payload) => fractures.push(payload));
  t.sim.bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    tick: t.state.tick,
    aId: t.ball.id,
    bId: t.medium.id,
    causalActorId: t.player.id,
    impulse: 5000,
    dp: 5000,
    preSolveClosingSpeed: closingSpeed,
    pos: { x: t.medium.pos.x, z: t.medium.pos.z },
    normal: { x: 1, z: 0 },
  });
  return fractures;
}

function liveWrecks(state) {
  return (state.entityList || []).filter((entity) => (
    entity && entity.alive !== false && entity.type === 'wreck'
  ));
}

test('agy catalog classifies medium mass and picks a deterministic seam', () => {
  assert.equal(fractureThresholdWU, 30);
  assert.equal(FRACTURE_THRESHOLD_WU, 30);
  assert.equal(hullClassForMass(MEDIUM_MASS), 'medium');
  assert.equal(seamFor('medium', 0).id, 'medium_forward_prow');
});

test('a wrecking-ball slam on a medium at closing ≥ 30 produces ≥ 2 pieces; same seed same seam', () => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;

  try {
    assert.equal(hullClassForMass(MEDIUM_MASS), 'medium');
    assert.ok(CLOSING >= fractureThresholdWU);

    const first = boot(SEED);
    const fracturesA = slam(first, CLOSING);
    const wrecksA = liveWrecks(first.state);
    const seamA = fracturesA[0] && fracturesA[0].seamId;
    const pieceCount = wrecksA.length;

    console.log(
      `PQ-154.00 slam pieces=${pieceCount} seam=${seamA} closing=${CLOSING} `
      + `class=${hullClassForMass(MEDIUM_MASS)} threshold=${fractureThresholdWU}`,
    );

    assert.equal(first.medium.alive, false, 'the medium must die on the slam');
    assert.equal(fracturesA.length, 1, 'one authored-seam fracture receipt');
    assert.ok(pieceCount >= 2, `piece count ${pieceCount} must be ≥ 2`);
    assert.equal(fracturesA[0].pieceCount, pieceCount);
    assert.ok(seamA, 'slam must publish a seam id');
    assert.match(String(seamA), /^medium_/);

    const inherited = wrecksA.every((wreck) => (
      wreck.vel.x === first.medium.vel.x && wreck.vel.z === first.medium.vel.z
      && wreck.angVel === 0.35
    ));
    assert.equal(inherited, true, 'pieces inherit victim vel/angVel at spawn');

    for (const wreck of wrecksA) {
      const command = consumePhysicsCommand(wreck);
      assert.ok(command && command.impulses && command.impulses.length >= 1,
        'split impulse must go through queuePhysicsImpulse');
    }

    first.sim.dispose();

    const second = boot(SEED);
    const fracturesB = slam(second, CLOSING);
    const wrecksB = liveWrecks(second.state);
    assert.equal(wrecksB.length, pieceCount);
    assert.equal(fracturesB[0] && fracturesB[0].seamId, seamA, 'same seed must pick the same seam');
    second.sim.dispose();
  } finally {
    resetPendingSlams();
    COMBAT_FLAGS.weaponImpulseConsequences = previous;
  }
});

test('a sub-threshold slam still swaps to one wreck', () => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;

  try {
    const t = boot(SEED + 1);
    const fractures = slam(t, fractureThresholdWU - 1);
    const wrecks = liveWrecks(t.state);
    assert.equal(t.medium.alive, false, 'the medium can still die below the fracture gate');
    assert.equal(fractures.length, 0, 'closing < 30 must not split');
    assert.equal(wrecks.length, 1, 'the ordinary wreck path remains one piece');
    t.sim.dispose();
  } finally {
    resetPendingSlams();
    COMBAT_FLAGS.weaponImpulseConsequences = previous;
  }
});
