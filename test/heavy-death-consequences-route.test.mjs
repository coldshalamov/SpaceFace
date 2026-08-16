import assert from 'node:assert/strict';
import test from 'node:test';

import { actions } from '../src/systems/actions.js';
import { HEAVY_COOK_OFF } from '../src/combat/cookOff.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { mining } from '../src/systems/mining.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { weapons } from '../src/systems/weapons.js';

const DT = SIM_DT;
const PLAYER_WEAPON_ID = 'wpn_siege_lance_l';

test('a real siege-lance Heavy kill walks a bounded cook-off, shoves through SG-02, and chain-kills with player debris provenance', async (t) => {
  const previousImpulseFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousImpulseFlag; });

  const systems = [physics, collisionConsequences, actions, flightV3, weapons, combat, aftermathWrecks, mining];
  const updateOrder = [actions, flightV3, weapons, physics, collisionConsequences, combat, aftermathWrecks, mining];
  const sim = createSimulation({ seed: 0xac3101, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;

  const player = sim.spawn(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: -220, z: 0 },
    rot: 0,
    fittings: fittingsFromDefaultModules('ship_bastion', Array(4).fill(PLAYER_WEAPON_ID)),
  }));
  state.playerId = player.id;
  const heavy = sim.spawn(makeEnemySpawnSpec('heavy_gunship', 12, { x: 0, z: 0 }));
  heavy.rot = 0;
  heavy.data.encounter = true;

  const shoveWitness = sim.spawn(physicalWitness({
    x: 0, z: 82, mass: 44, hull: 160, label: 'cook-off shove witness', team: 0,
  }));
  // Chunk zero leaves along the dead hull's authored +X facing. This craft starts outside the blast
  // radius, so only a real moving debris contact can kill it.
  const chainVictim = sim.spawn(physicalWitness({
    x: 154, z: 0, mass: 7, hull: 5, label: 'cook-off chain victim', team: 1,
  }));

  const phases = [];
  const deaths = [];
  const impacts = [];
  const grants = [];
  bus.on('combat:heavyCookOffPhase', (payload) => phases.push(structuredClone(payload)));
  bus.on('entity:killed', (payload) => deaths.push(structuredClone(payload)));
  bus.on('physics:impact', (payload) => impacts.push(structuredClone(payload)));
  bus.on('economy:grantCredits', (payload) => grants.push(structuredClone(payload)));

  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  assert.equal(state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');

  state.player.targetId = heavy.id;
  state.input.autoAim = { targetId: heavy.id };
  for (let guard = 0; guard < 420 && heavy.alive !== false; guard++) {
    state.input.aimAngle = Math.atan2(heavy.pos.z - player.pos.z, heavy.pos.x - player.pos.x);
    state.input.fire = true;
    state.input.fireGroup = 1;
    sim.step(DT);
  }
  state.input.fire = false;
  state.input.fireGroup = null;
  state.input.autoAim = null;

  assert.equal(heavy.alive, false, 'the catalog weapon crosses Rapier and Combat to kill the Heavy');
  const heavyDeaths = deaths.filter((payload) => payload.id === heavy.id);
  assert.equal(heavyDeaths.length, 1, 'the canonical Combat edge publishes exactly one Heavy death');
  assert.equal(heavyDeaths[0].killerId, player.id);
  const grantsAtLethalEdge = grants.length;

  let maxWitnessSpeed = 0;
  for (let guard = 0; guard < 480 && chainVictim.alive !== false; guard++) {
    sim.step(DT);
    maxWitnessSpeed = Math.max(maxWitnessSpeed, Math.hypot(shoveWitness.vel.x, shoveWitness.vel.z));
  }

  const secondaries = phases.filter((payload) => payload.phase === 'secondary');
  const main = phases.find((payload) => payload.phase === 'main');
  assert.equal(secondaries.length, HEAVY_COOK_OFF.secondaryAtS.length);
  assert.deepEqual(secondaries.map((payload) => payload.secondaryIndex), [0, 1, 2, 3]);
  assert.ok(new Set(secondaries.map((payload) => `${payload.position.x}:${payload.position.z}`)).size === 4,
    'secondary pressure receipts walk four distinct hull points');
  assert.ok(main, 'the staggered cook-off resolves into one main physical burst');
  assert.ok(main.affected.some((entry) => entry.entityId === shoveWitness.id));
  assert.ok(maxWitnessSpeed > 1, 'the nearby live craft is physically accelerated by Rapier');

  assert.equal(main.debris.length, HEAVY_COOK_OFF.debrisCount);
  const debris = main.debris.map((row) => state.entities.get(row.entityId)).filter(Boolean);
  assert.equal(debris.length, HEAVY_COOK_OFF.debrisCount);
  for (const chunk of debris) {
    assert.equal(chunk.type, 'wreck');
    assert.equal(chunk.data.kind, 'heavy_cook_off_debris');
    assert.equal(chunk.data.vacuumImmune, true);
    assert.equal(chunk.ttl, Infinity);
    assert.ok(chunk.radius > HEAVY_COOK_OFF.debrisRadiusThresholdWu);
    assert.equal(chunk.physicsBody.dynamic, true);
    assert.equal(chunk.physicsBody.material, 'debris');
    assert.ok(state.entityIndex.physicsDynamics.includes(chunk), 'Rapier indexes every major chunk');
  }

  const chunkZero = debris.find((chunk) => chunk.data.debrisIndex === 0);
  assert.ok(impacts.some((payload) => (
    (payload.aId === chunkZero.id && payload.bId === chainVictim.id)
      || (payload.aId === chainVictim.id && payload.bId === chunkZero.id)
  )), 'the chain outcome begins with a real Rapier debris contact');
  const chainDeath = deaths.find((payload) => payload.id === chainVictim.id);
  assert.ok(chainDeath, 'the mass-bearing chunk can finish another physical craft');
  assert.equal(chainDeath.killerId, player.id, 'the original lethal actor owns the debris chain kill');
  const provenance = readRecentImpulseProvenance(chunkZero, state.tick, 240);
  assert.equal(provenance?.tag, 'heavy_cook_off_debris');
  assert.equal(provenance?.actorId, player.id);

  assert.equal(deaths.filter((payload) => payload.id === heavy.id).length, 1);
  assert.equal(grants.length, grantsAtLethalEdge,
    'cook-off phases and physical debris never reopen the dead Heavy reward edge');
  assert.ok(state.entityList.some((entity) => (
    entity.alive !== false && entity.type === 'wreck'
      && entity.data?.markerId && entity.data?.provenance?.markerId === entity.data.markerId
  )), 'the existing durable aftermath owner still binds the Heavy persistent salvage wreck');
});

function physicalWitness({ x, z, mass, hull, label, team }) {
  const radius = 10;
  return {
    type: 'ship',
    team,
    factionId: team === 0 ? 'faction_free' : 'faction_reach',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius,
    mass,
    hull,
    hullMax: hull,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 0,
    capMax: 0,
    drag: 0,
    collides: true,
    physicsBody: {
      dynamic: true,
      ccd: true,
      radius,
      mass,
      inertiaY: 0.5 * mass * radius * radius,
      material: 'ship',
      shape: 'ball',
    },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      scanLabel: label,
      bountyCr: 0,
      loot: null,
      shipClass: 'fighter',
    },
  };
}
