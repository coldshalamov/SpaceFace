// Plan 31 physics rule: "All debris above a size threshold is real: collision, mass, vacuum-immune
// (it's not loot), and it can chain-kill." and "Debris budget: pooled, capped per frame; oldest
// small debris evaporates first."
//
// The Heavy tier already shed six real chunks. Below it every light and medium death produced pure
// presentation, so debris passed straight through hulls. This route proves the chunks are actual
// bodies in the world, not that a receipt mentions them.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DEATH_DEBRIS, createDeathDebrisPool } from '../src/combat/cookOff.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { weapons } from '../src/systems/weapons.js';

function body({ x, z, mass = 44, hull = 400, radius = 10, team = 1 }) {
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
    data: {},
    physicsBody: {
      dynamic: true,
      ccd: true,
      radius,
      mass,
      inertiaY: 0.5 * mass * radius * radius,
      material: 'ship',
      shape: 'ball',
    },
  };
}

async function liveSim(t, seed) {
  const systems = [physics, collisionConsequences, actions, flightV3, weapons, combat];
  const updateOrder = [actions, flightV3, weapons, physics, collisionConsequences, combat];
  const sim = createSimulation({ seed, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  // SG-02 dynamic authority comes up asynchronously. Without this the membrane rejects every write
  // and the route passes its receipt assertions while nothing physical happens at all.
  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  return sim;
}

function debrisIn(state) {
  return [...state.entities.values()]
    .filter((entity) => entity && entity.alive !== false && entity.data?.kind === DEATH_DEBRIS.kind);
}

test('a medium death sheds a real, physical, vacuum-immune section', async (t) => {
  const sim = await liveSim(t, 0xd3b21a);
  const { state } = sim;
  const combatSystem = sim.registry.get('combat');

  const victim = sim.spawn(body({ x: 0, z: 0, radius: 20, mass: 60, hull: 90 }));
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);

  combatSystem.kill(victim, null, {});
  const provenance = debrisIn(state).map((chunk) => readRecentImpulseProvenance(chunk, state.tick));
  for (let tick = 0; tick < 4; tick++) sim.step(SIM_DT);

  const chunks = debrisIn(state);
  assert.equal(chunks.length, DEATH_DEBRIS.sectionCount,
    'a medium hull sheds the authored tumbling section');
  for (const chunk of chunks) {
    // Real: it is a body with mass that the solver can hit, not a particle.
    assert.equal(chunk.collides, true, 'debris must collide');
    assert.ok(chunk.mass > 0, 'debris must have mass');
    assert.equal(chunk.physicsBody?.dynamic, true, 'debris must be a dynamic body');
    assert.ok(chunk.radius >= DEATH_DEBRIS.chunkRadiusThresholdWu,
      'debris must be at or above the authored physical size threshold');
    // Vacuum-immune: it is salvage-shaped scenery, not loot. Type and flag both say so, and the
    // universal pickup vacuum only ever collects `pickup` entities.
    assert.equal(chunk.type, 'wreck', 'debris is not a pickup type');
    assert.equal(chunk.data.vacuumImmune, true);
    assert.equal(chunk.data.majorDebris, true);
    // It is really moving, so it can reach something and chain.
    assert.ok(Math.hypot(chunk.vel.x, chunk.vel.z) > 0, 'debris is thrown, not parked');
    // It goes away on its own rather than accumulating as permanent litter.
    assert.ok(Number.isFinite(chunk.ttl) && chunk.ttl > 0, 'sub-Heavy debris is transient');
  }
  assert.ok(provenance.every(Boolean),
    'each chunk carries the killer as causal actor so a chain kill can be attributed');
});

test('a hull below the size threshold sheds nothing physical', async (t) => {
  const sim = await liveSim(t, 0xd3b21b);
  const { state } = sim;
  const combatSystem = sim.registry.get('combat');

  // The threshold is the rule, not an accident: a body this small would be solver cost with no read.
  const tiny = sim.spawn(body({
    x: 0, z: 0, radius: DEATH_DEBRIS.minSourceRadiusWu - 3, mass: 12, hull: 40,
  }));
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);
  combatSystem.kill(tiny, null, {});
  for (let tick = 0; tick < 4; tick++) sim.step(SIM_DT);

  assert.equal(debrisIn(state).length, 0,
    'below the authored threshold the death stays presentation-only');
});

test('the threshold sits above the light tier, and that is load-bearing', async (t) => {
  // Plan 31's ladder gives a LIGHT hull "debris chunks + 2 tumbling plates" (dressing) and a MEDIUM
  // hull "a tumbling SECTION (engine block, wing)". Only the section is a real body. That reading is
  // not a convenience: making light hulls shed real bodies too is measurable in the pacing route,
  // where a permanent litter of small colliding rocks cost a full completed wing per three seeds.
  const sim = await liveSim(t, 0xd3b21c);
  const { state } = sim;
  const combatSystem = sim.registry.get('combat');

  // A light swarmer-class hull, the tier the pacing route is built from.
  const light = sim.spawn(body({ x: 0, z: 0, radius: 12, mass: 30, hull: 50 }));
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);
  combatSystem.kill(light, null, {});
  for (let tick = 0; tick < 4; tick++) sim.step(SIM_DT);

  assert.equal(debrisIn(state).length, 0, 'a light hull sheds plates, which are presentation');
  assert.ok(DEATH_DEBRIS.minSourceRadiusWu > 13,
    'the threshold must stay above the light tier the size ladder classifies as small');
});

test('the pool is capped and the oldest chunk evaporates first', () => {
  // A pure-pool route: enough deaths to overrun the cap, asserting the eviction ORDER rather than
  // only the ceiling. A pool that dropped the newest would also stay under the cap.
  const entities = new Map();
  let nextId = 1;
  const state = { tick: 0, entities };
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: `chunk_${nextId++}`, alive: true, ...spec };
      entities.set(entity.id, entity);
      return entity;
    },
  };
  const pool = createDeathDebrisPool({ state, helpers });

  const spawnOrder = [];
  const deaths = Math.ceil(DEATH_DEBRIS.maxLiveDebris / DEATH_DEBRIS.sectionCount) + 3;
  for (let index = 0; index < deaths; index++) {
    const spawned = pool.spawn({
      sourceId: `victim_${index}`,
      sourceRadius: DEATH_DEBRIS.minSourceRadiusWu + 6,
      sourceRot: 0,
      position: { x: index * 50, z: 0 },
      velocity: { x: 0, z: 0 },
      actorId: 'player',
      weaponId: 'wpn_pulse_laser_s',
    });
    for (const row of spawned) spawnOrder.push(row.entityId);
  }

  const live = spawnOrder.filter((id) => entities.get(id).alive !== false);
  assert.equal(live.length, DEATH_DEBRIS.maxLiveDebris, 'the pool holds at its authored ceiling');
  assert.ok(spawnOrder.length > DEATH_DEBRIS.maxLiveDebris, 'the route really overran the cap');

  // Oldest first: the survivors must be exactly the tail of the spawn order.
  const expectedSurvivors = spawnOrder.slice(-DEATH_DEBRIS.maxLiveDebris);
  assert.deepEqual(live, expectedSurvivors,
    'the pool must evaporate the OLDEST chunk, not an arbitrary one');
  for (const id of spawnOrder.slice(0, spawnOrder.length - DEATH_DEBRIS.maxLiveDebris)) {
    assert.equal(entities.get(id).alive, false, 'evicted chunks are actually retired');
  }
  assert.equal(pool.inspect().live, DEATH_DEBRIS.maxLiveDebris);

  pool.reset();
  assert.equal(pool.inspect().live, 0, 'a new run starts with an empty pool');
});

test('debris spawning never claims a bystander body', async (t) => {
  // The defect this guards is already recorded once: stamping impulse provenance on bodies near a
  // death silently reassigns chain-kill credit, because collisionConsequences resolves collision
  // ownership from the latest record. Chunks are brand-new bodies nobody owns, so stamping THEM is
  // safe; the neighbour must keep whatever it already had.
  const sim = await liveSim(t, 0xd3b21d);
  const { state } = sim;
  const combatSystem = sim.registry.get('combat');

  const victim = sim.spawn(body({ x: 0, z: 0, radius: 20, mass: 60, hull: 90 }));
  const bystander = sim.spawn(body({ x: 0, z: 26, mass: 44 }));
  for (let tick = 0; tick < 3; tick++) sim.step(SIM_DT);

  combatSystem.kill(victim, null, {});
  const bystanderRecord = readRecentImpulseProvenance(bystander, state.tick);
  for (const chunk of debrisIn(state)) {
    const record = readRecentImpulseProvenance(chunk, state.tick);
    assert.equal(record.tag, DEATH_DEBRIS.provenance, 'the chunk owns its own throw');
  }
  // The blast may legitimately claim an unowned neighbour; what it must never do is claim it under
  // the DEBRIS tag, which would read as "a chunk hit you" before any chunk had moved.
  if (bystanderRecord) {
    assert.notEqual(bystanderRecord.tag, DEATH_DEBRIS.provenance,
      'a bystander must never be attributed to debris that has not touched it');
  }
});
