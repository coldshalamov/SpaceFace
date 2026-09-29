// Hull-burst overhaul, slice A, packet 2: a tumbling hull is out of control.
//
// Owner, 2026-09-29: "I'd want a satisfying effect and the ship tumbling out of control off into
// another direction ... which means not being acted on by its own propulsion." Before this, the
// active tumble wrote a full yaw-brake counter-torque from its first tick, so a hull given a 6 rad/s
// entry spin was back to ~0 within 0.2 s (feel.fling_scene: 0.59 turns over a 2.8 s stun). With
// `combat.tumbleFling` the tumble commands no torque; the real thrusters that damp the spin are the
// recovery beat's. Flag off (the frozen 47-A profile) keeps the old counter-torque byte-for-byte.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_FLAGS, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { isRecovering, readTumbleStatus } from '../src/combat/tumbleStatus.js';

function harness() {
  const base = {
    alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 10, hull: 500, hullMax: 500, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, armorFlat: 0,
    cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
  };
  const player = { ...base, id: 1, team: 0, isPlayer: true, mass: 18, data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship' } };
  const victim = {
    ...base, id: 2, team: 1, mass: 16, pos: { x: -400, z: 0 },
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
  };
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const state = {
    tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    entities: new Map([[player.id, player], [victim.id, victim]]),
    entityList: [player, victim],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const system = Object.create(tumbleStates);
  system.init({ state, bus, helpers, registry: { get: (name) => (name === 'combat' ? { kernel } : null) } });
  return { player, victim, bus, state, kernel, system };
}

function tick(h, dt = 1 / 60) {
  h.state.tick += 1;
  h.state.simTime += dt;
  h.kernel.prePhysics(dt);
  h.system.update(dt, h.state);
}

function withFlags(flags, fn) {
  const previous = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences, tumbleFling: COMBAT_FLAGS.tumbleFling };
  Object.assign(COMBAT_FLAGS, flags);
  try { return fn(); } finally { Object.assign(COMBAT_FLAGS, previous); }
}

/** Blast the victim, spinning it, then read the commanded torque on each tumble tick. */
function torqueThroughTumble(h, spin = 5) {
  h.bus.emit(HITSTUN_IMPULSE_EVENT, {
    source: 'gun', victimId: h.victim.id, attackerId: h.player.id, attackerMass: 18, victimMass: h.victim.mass,
    deltaV: 250, dirX: -1, dirZ: 0, hitSide: 1, tick: h.state.tick,
  });
  consumePhysicsCommand(h.victim); // drop the entry-tick command; the loop below reads the steady state
  const active = [];
  const recovering = [];
  for (let i = 0; i < 400; i++) {
    h.victim.angVel = spin;
    tick(h);
    const command = consumePhysicsCommand(h.victim);
    const control = command && command.control;
    if (!control) continue;
    const row = { mode: control.mode, source: control.source, torqueY: control.torque.y, forceMag: Math.hypot(control.force.x, control.force.z) };
    if (readTumbleStatus(h.state, h.victim)) active.push(row);
    else if (isRecovering(h.state, h.victim)) recovering.push(row);
  }
  return { active, recovering };
}

test('with tumbleFling on, an active tumble commands no torque and no force', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness();
    const { active } = torqueThroughTumble(h);
    assert.ok(active.length > 60, `the hull must actually tumble for a while (${active.length} ticks)`);
    for (const row of active) {
      assert.equal(row.mode, 'tumbling');
      assert.equal(row.torqueY, 0, 'a tumbling hull is not acted on by its own propulsion: no counter-torque');
      assert.equal(row.forceMag, 0, 'and no thrust');
      assert.match(row.source, /_free$/, 'the control names itself as the free tumble');
    }
  });
});

test('with tumbleFling on, the recovery beat still damps the spin with real thruster torque', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness();
    const { recovering } = torqueThroughTumble(h, 4);
    assert.ok(recovering.length > 10, `a recovery beat follows the tumble (${recovering.length} ticks)`);
    // The fixture pins the spin at +4 rad/s every tick, so EVERY recovery row must command opposing
    // torque: a zero or positive row would mean the recovery beat is not damping the spin.
    for (const row of recovering) {
      assert.equal(row.mode, 'tumbling');
      assert.ok(row.torqueY < -0.1, `recovery torque opposes the +4 rad/s spin with real magnitude (got ${row.torqueY})`);
      assert.equal(row.source, 'hitstun', 'the recovery beat is the ordinary recovery control, not the free tumble');
    }
  });
});

test('with tumbleFling off (the frozen 47-A profile) the tumble keeps its full counter-torque and control source', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: false }, () => {
    const h = harness();
    const { active } = torqueThroughTumble(h, 5);
    assert.ok(active.length > 60);
    assert.ok(active.every((row) => row.torqueY < 0), 'flag off: full counter-torque opposing +5 rad/s spin');
    assert.ok(active.every((row) => row.source === 'hitstun'), 'flag off: the old control source');
  });
});

test('a rope-thrown hull (massline tumble kind) also spins free, under its own control source', () => {
  const previousMassline = { enabled: MASSLINE2_FLAGS.enabled, tumble: MASSLINE2_FLAGS.tumble };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, tumble: true });
  try { withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness();
    h.bus.emit('massline:throw', { payloadId: h.victim.id, payloadSpeed: 250 });
    consumePhysicsCommand(h.victim);
    let sawTumble = 0;
    for (let i = 0; i < 120; i++) {
      h.victim.angVel = 3;
      tick(h);
      const command = consumePhysicsCommand(h.victim);
      if (!command || !command.control || !readTumbleStatus(h.state, h.victim)) continue;
      sawTumble++;
      assert.equal(command.control.torque.y, 0, 'a thrown hull is out of control too: no counter-torque');
      assert.equal(command.control.source, 'massline_tumble_free');
    }
    assert.ok(sawTumble > 30, `the throw must tumble the hull for a while (${sawTumble} ticks)`);
  }); } finally { Object.assign(MASSLINE2_FLAGS, previousMassline); }
});
