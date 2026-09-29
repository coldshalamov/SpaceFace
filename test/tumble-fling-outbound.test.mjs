// Hull-burst overhaul, slice A, packet 3: a blast that takes a hull's helm sends it OUT.
//
// Owner, 2026-09-29: "if I blast an enemy ship I don't want him flying against the impact and staying
// roughly still like a fly buzzing against the wind." Nothing pushes back during a stun, so the buzz
// is momentum arithmetic: a hostile closing on you at 0.6 of its cruise, hit straight back by a
// 0.55-of-cruise concussion slug, ends at (deltaV - closing) = -9.5 WU/s: still coming. Under
// `combat.tumbleFling` a SHOVE-class hit that tumbles the hull first cancels the hull's inbound
// velocity along the push, so the hit's delta-V lands on a hull that starts from rest along it
// (measured, feel.fling_scene head-on: outbound at stun end -9.5 / +24.2 / +5.8 -> 57.5 WU/s).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createBus } from '../src/core/eventBus.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';

function harness({ vel = { x: 0, z: 0 } } = {}) {
  const base = {
    alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 10,
    hull: 500, hullMax: 500, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, armorFlat: 0,
    cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
  };
  const player = { ...base, id: 1, team: 0, isPlayer: true, mass: 18, data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship' } };
  const victim = {
    ...base, id: 2, team: 1, mass: 16, pos: { x: -400, z: 0 }, vel: { ...vel },
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
  };
  const applied = [];
  const helpers = { combatPhysics: { applyImpulse: (input) => { applied.push(input); return true; } } };
  const bus = createBus();
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
  return { player, victim, bus, state, kernel, applied };
}

function withFlags(flags, fn) {
  const previous = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences, tumbleFling: COMBAT_FLAGS.tumbleFling };
  Object.assign(COMBAT_FLAGS, flags);
  try { return fn(); } finally { Object.assign(COMBAT_FLAGS, previous); }
}

/** Blast the victim along `dir` with `source` and `deltaV`, returning the floor impulses applied. */
function blast(h, { source = 'gun', deltaV = 250, dirX = -1, dirZ = 0, victimId = 2 } = {}) {
  h.bus.emit(HITSTUN_IMPULSE_EVENT, {
    source, victimId, attackerId: 1, attackerMass: 18, victimMass: 16, deltaV, dirX, dirZ, hitSide: 1, tick: h.state.tick,
    provenance: { actorId: 1, weaponId: 'wpn_concussion_cannon_m', tag: 'concussion_slug', appliedTick: h.state.tick },
  });
  h.state.tick += 1; h.state.simTime += 1 / 60; h.kernel.prePhysics(1 / 60);
  return h.applied.filter((call) => call.reason === 'hitstun_outbound_floor');
}

test('a hull closing on the shooter has its inbound velocity cancelled, so the hit lands on a hull at rest along the push', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness({ vel: { x: 67, z: 0 } }); // 67 WU/s toward +x: the shot pushes it toward -x
    const floors = blast(h);
    assert.ok(readTumbleStatus(h.state, h.victim), 'the hit took the helm');
    assert.equal(floors.length, 1, 'exactly one floor impulse');
    const impulse = floors[0].impulse;
    assert.ok(Math.abs(impulse.x + 67 * 16) < 1e-6, `cancels 67 WU/s x mass 16 along the -x push (got ${impulse.x})`);
    assert.equal(impulse.z, 0);
    assert.equal(floors[0].provenance.actorId, 1, 'it carries the hit\'s own provenance: the extra push is the shooter\'s');
  });
});

test('a hull already moving with the push, or across it, is untouched', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    assert.equal(blast(harness({ vel: { x: -50, z: 0 } })).length, 0, 'moving with the push: nothing to cancel');
    assert.equal(blast(harness({ vel: { x: 0, z: 80 } })).length, 0, 'moving across the push: nothing to cancel');
    assert.equal(blast(harness({ vel: { x: 0, z: 0 } })).length, 0, 'at rest: nothing to cancel');
  });
});

test('only shove-class sources cancel inbound velocity; throws, wells, collisions and tether shares keep their own economies', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    for (const source of ['collision', 'well', 'tether_share']) {
      assert.equal(blast(harness({ vel: { x: 67, z: 0 } }), { source }).length, 0, `${source}: untouched`);
    }
    for (const source of ['gun', 'weapon', 'bomb', 'impulse_charge']) {
      assert.equal(blast(harness({ vel: { x: 67, z: 0 } }), { source }).length, 1, `${source}: shove class`);
    }
  });
});

test('a hit that does not take the helm changes nothing, and neither does the player, nor flag off', () => {
  withFlags({ weaponImpulseConsequences: true, tumbleFling: true }, () => {
    const h = harness({ vel: { x: 67, z: 0 } });
    assert.equal(blast(h, { deltaV: 5 }).length, 0, 'a plink under the stun floor never cancels anything');
    assert.equal(readTumbleStatus(h.state, h.victim), null);
    const p = harness({ vel: { x: 67, z: 0 } });
    p.player.vel = { x: 67, z: 0 };
    assert.equal(blast(p, { victimId: 1 }).length, 0, 'the player never tumbles (slice B changes that) and is never floored');
  });
  withFlags({ weaponImpulseConsequences: true, tumbleFling: false }, () => {
    assert.equal(blast(harness({ vel: { x: 67, z: 0 } })).length, 0, 'flag off (the frozen 47-A profile): byte-identical');
  });
});
