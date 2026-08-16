import assert from 'node:assert/strict';
import test from 'node:test';

import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createSimulation } from '../src/core/sim.js';
import { EMBER_COOK_OFF } from '../src/data/swarmerFamily.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat } from '../src/systems/combat.js';

function shipSpec(id, x, z, partial = {}) {
  return {
    id,
    type: 'ship',
    team: partial.team ?? 1,
    factionId: partial.factionId || 'faction_reach',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: partial.radius ?? 6,
    mass: partial.mass ?? 10,
    hull: partial.hull ?? 40,
    hullMax: partial.hull ?? 40,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1, ramDamageDealtMult: 0 },
      ...(partial.data || {}),
    },
  };
}

function lethalWeapon() {
  return {
    origin: { kind: 'weapon', id: 'wpn_railgun_m', weaponId: 'wpn_railgun_m' },
    packet: { source: { kind: 'weapon', weaponId: 'wpn_railgun_m' } },
  };
}

test('Ember death applies a deterministic, capped, damage-free radial impulse through combat physics', () => {
  const applied = [];
  const helpers = {
    combatPhysics: {
      applyImpulse(input) {
        applied.push(structuredClone(input));
        return true;
      },
    },
  };
  const sim = createSimulation({ seed: 0xac12, helpers, systems: [combat] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';

  const player = sim.spawn(shipSpec('player', -300, 0, { team: 0, factionId: 'faction_free' }));
  state.playerId = player.id;
  const ember = sim.spawn(shipSpec('ember', 0, 0, {
    mass: 15,
    data: {
      deathCookOff: { ...EMBER_COOK_OFF, cueId: 'swarmer_ember_cook_off' },
      shipClass: 'fighter',
    },
  }));
  const bodies = [];
  for (let index = 0; index < 14; index++) {
    bodies.push(sim.spawn(shipSpec(`body-${String(index).padStart(2, '0')}`, 10 + index * 5, 0)));
  }
  const far = sim.spawn(shipSpec('far', EMBER_COOK_OFF.radiusWu + 10, 0));
  const pickup = sim.spawn({
    id: 'pickup-near', type: 'pickup', pos: { x: 4, z: 0 }, vel: { x: 0, z: 0 },
    radius: 2, alive: true, data: {},
  });

  const receipts = [];
  const vfx = [];
  const audio = [];
  const damage = [];
  bus.on('combat:emberCookOff', (payload) => receipts.push(payload));
  bus.on('presentation:vfxCue', (payload) => vfx.push(payload));
  bus.on('audio:cue', (payload) => audio.push(payload));
  bus.on('combat:damage', (payload) => damage.push(payload));

  registry.get('combat').kill(ember, player.id, lethalWeapon());

  assert.equal(ember.alive, false);
  assert.equal(applied.length, EMBER_COOK_OFF.maxAffected, 'one death cannot move more than twelve bodies');
  assert.deepEqual(applied.map((entry) => entry.entityId), bodies.slice(0, 12).map((body) => body.id),
    'closest bodies win the bounded budget in stable order');
  assert.equal(applied.some((entry) => entry.entityId === far.id || entry.entityId === pickup.id), false);
  assert.equal(damage.length, 0, 'the cook-off never opens a direct damage route');
  assert.ok(bodies.every((body) => body.hull === 40), 'nearby hull values are unchanged');

  const first = applied[0];
  const last = applied.at(-1);
  assert.equal(first.reason, EMBER_COOK_OFF.provenance);
  assert.equal(first.provenance.actorId, player.id);
  assert.equal(first.provenance.weaponId, 'wpn_railgun_m');
  assert.ok(first.impulse.x > last.impulse.x && first.impulse.x > 0 && first.impulse.z === 0,
    'linear radial falloff gives the nearer body the stronger outward kick');
  assert.equal(readRecentImpulseProvenance(bodies[0], state.tick)?.actorId, player.id);
  assert.equal(readRecentImpulseProvenance(bodies[0], state.tick)?.tag, EMBER_COOK_OFF.provenance);

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].affected.length, EMBER_COOK_OFF.maxAffected);
  assert.equal(Object.isFrozen(receipts[0]), true);
  assert.equal(vfx.at(-1)?.id, 'swarmer_ember_cook_off');
  assert.equal(audio.at(-1)?.id, 'sfx_vector_mine');
  sim.dispose();
});

test('an Ember-thrown hull carries its lethal actor through a real two-contact chain kill', (t) => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });

  const applied = [];
  const helpers = {
    combatPhysics: {
      applyImpulse(input) {
        applied.push(structuredClone(input));
        return true;
      },
    },
  };
  const sim = createSimulation({ seed: 0xac12c, helpers, systems: [combat, collisionConsequences] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  const player = sim.spawn(shipSpec('player', -250, 0, { team: 0, factionId: 'faction_free' }));
  state.playerId = player.id;
  const ember = sim.spawn(shipSpec('ember', 0, 0, {
    mass: 15,
    data: { deathCookOff: { ...EMBER_COOK_OFF }, shipClass: 'fighter' },
  }));
  const projectileHull = sim.spawn(shipSpec('thrown-hull', 20, 0, { mass: 10, hull: 1000 }));
  const rock = sim.spawn({
    id: 'rock', type: 'asteroid', pos: { x: 28, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 400, alive: true, data: {},
  });
  const victim = sim.spawn(shipSpec('chain-victim', 42, 0, { mass: 10, hull: 1 }));
  const kills = [];
  bus.on('entity:killed', (payload) => kills.push(payload));

  registry.get('combat').kill(ember, player.id, lethalWeapon());
  assert.equal(applied.some((entry) => entry.entityId === projectileHull.id), true);
  assert.equal(readRecentImpulseProvenance(projectileHull, state.tick)?.actorId, player.id);

  bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    backend: 'route-test',
    tick: state.tick,
    aId: projectileHull.id,
    bId: rock.id,
    impulse: 5000,
    pos: { x: 24, z: 0 },
    normal: { x: 1, z: 0 },
  });

  assert.equal(projectileHull.alive, true, 'the first rock impact tumbles but does not retire the projectile hull');
  bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    backend: 'route-test',
    tick: state.tick,
    aId: projectileHull.id,
    bId: victim.id,
    impulse: 5000,
    pos: { x: 34, z: 0 },
    normal: { x: 1, z: 0 },
  });

  const chained = kills.find((receipt) => receipt.id === victim.id);
  assert.ok(chained, 'the real collision consequence route kills the one-hull craft target');
  assert.equal(chained.killerId, player.id, 'the Ember killer remains the collision lethal actor');
  assert.equal(chained.presentation.playerCaused, true);
  assert.deepEqual(chained.presentation.style, {
    version: 1,
    id: 'chain',
    multiplier: 1.5,
    chainDepth: 1,
  });
  sim.dispose();
});
