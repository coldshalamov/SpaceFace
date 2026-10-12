import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_EXTERNAL_RESPONSE } from '../src/core/physicalResponse.js';
import { DEFAULT_MASSLINE_DEF } from '../src/core/constraints/masslineController.js';
import { ENVIRONMENT_MATERIALS } from '../src/data/environmentMaterials.js';
import {
  REACTIVE_BUDGETS,
  REACTIVE_FAMILIES,
  REACTIVE_MARKERS,
  REACTIVE_MODELS,
  REACTIVE_STEP_ORDER,
  MARKER_MIN_LEGIBLE_RADIUS,
  familyRecord,
  reactiveFamilyHint,
} from '../src/data/reactiveMatter/index.js';
import { REACTIVE_MATTER_INVENTORY } from '../src/matter/reactive/inventory.js';
import {
  addHitch,
  addMachine,
  createReactiveWorld,
  spawnReactiveBody,
  stepReactiveMatter,
} from '../src/matter/reactive/index.js';
import { runLiveBodies } from '../src/matter/reactive/liveSession.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createGameState } from '../src/core/gameState.js';
import { installReactiveEntity, reactiveMatter } from '../src/systems/reactiveMatter.js';
import { createBus } from '../src/core/eventBus.js';

function world(seed = 7) {
  return createReactiveWorld({ seed });
}

test('family record switch is exhaustive and hints reuse commodity classes', () => {
  assert.equal(familyRecord('ferromagnetic').id, 'ferromagnetic');
  assert.equal(familyRecord('volatile').heatThreshold, ENVIRONMENT_MATERIALS.volatile.ignitionHeat);
  assert.equal(familyRecord('brittle').heatThreshold, ENVIRONMENT_MATERIALS.crystal.fractureHeat);
  assert.equal(familyRecord('elastic').maxStored, REACTIVE_BUDGETS.elasticMaxStored);
  assert.throws(() => familyRecord('plasma'));
  assert.equal(reactiveFamilyHint('cmdty_fuel_cells'), 'volatile');
  assert.equal(reactiveFamilyHint('cmdty_ice_water'), 'brittle');
  assert.equal(reactiveFamilyHint('cmdty_ore_goldium'), 'ferromagnetic');
  assert.equal(reactiveFamilyHint('cmdty_volatiles'), null);
  assert.equal(reactiveFamilyHint('cmdty_ore_iron'), null);
});

test('models stay frozen and the step order is the documented one', () => {
  const before = JSON.stringify(REACTIVE_MODELS);
  assert.throws(() => { REACTIVE_MODELS.ferro_crate.mass = 1; });
  assert.equal(JSON.stringify(REACTIVE_MODELS), before);
  assert.deepEqual(REACTIVE_STEP_ORDER, REACTIVE_MATTER_INVENTORY.stepOrder);
  assert.equal(REACTIVE_FAMILIES.volatile.impulseCap, 720);
});

test('step does not integrate position', () => {
  const sim = world();
  addMachine(sim, { id: 'crane', x: 20, z: 0, strength: 900, fieldRadius: 30, polarity: 1, anchored: true });
  const crate = spawnReactiveBody(sim, { id: 'crate', modelId: 'ferro_crate', x: 0, z: 0 });
  stepReactiveMatter(sim, { dt: 1 / 60, contacts: [] });
  assert.equal(crate.x, 0);
  assert.equal(crate.z, 0);
  assert.equal(crate.y, 0);
});

test('ferromagnetic cargo is pulled toward an anchored crane through the impulse queue', async () => {
  async function pull(polarity) {
    const run = await runLiveBodies({
      ticks: 90,
      dt: 1 / 60,
      seed: 7,
      bodies: [{ id: 'crate', modelId: 'ferro_crate', x: 0, z: 0 }],
      machines: [{ id: 'crane', x: 0, z: 30, strength: 900, fieldRadius: 30, polarity, anchored: true }],
      fields: [],
      hitches: [],
      tape: [],
    });
    return run.snapshot.bodies.find((body) => body.id === 'crate');
  }
  const toward = await pull(1);
  const away = await pull(-1);
  assert.ok(toward.z > 1, toward.z);
  assert.equal(toward.y, 0);
  assert.ok(away.z < -1, away.z);
});

test('volatile impact spends once, conserves debris mass, and caps chemical impulse', () => {
  const sim = world(11);
  const can = spawnReactiveBody(sim, { id: 'can', modelId: 'volatile_canister', x: 0, z: 0, vx: 10, vz: 0 });
  const parentMass = can.mass;
  const parentVx = can.vx;
  spawnReactiveBody(sim, { id: 'ram', modelId: 'hauler', x: -6, z: 0, vx: 80 });
  const result = stepReactiveMatter(sim, {
    contacts: [{ aId: 'ram', bId: 'can', nx: 1, nz: 0, closingSpeed: 90 }],
  });
  assert.equal(can.phase, 'spent');
  assert.equal(sim.terminal.get('can'), 'spent');
  const debris = [...sim.bodies.values()].filter((body) => body.parentId === 'can');
  assert.equal(debris.length, 3);
  const mass = can.mass + debris.reduce((sum, body) => sum + body.mass, 0);
  assert.ok(Math.abs(mass - parentMass) < 1e-9, mass);
  let rel = 0;
  for (const body of debris) rel += body.mass * (body.vx - parentVx);
  assert.ok(Math.abs(rel) < 1e-6, rel);
  assert.ok(result.chemicalInjected > 0);
  assert.ok(result.chemicalInjected <= REACTIVE_BUDGETS.volatileImpulseCap);
  const again = stepReactiveMatter(sim, {
    contacts: [{ aId: 'ram', bId: 'can', nx: 1, nz: 0, closingSpeed: 200 }],
  });
  assert.equal(again.reactions.length, 0);
  assert.equal(sim.reactionCount, 1);
});

test('a volatile chain stops at depth and never recooks', () => {
  const sim = world(19);
  for (let i = 0; i < 6; i++) {
    spawnReactiveBody(sim, { id: `c${i}`, modelId: 'volatile_canister', x: i * 20, z: 0 });
  }
  stepReactiveMatter(sim, {
    contacts: [{ aId: 'c0', bId: 'c0', nx: 1, nz: 0, closingSpeed: 80 }],
  });
  for (let i = 0; i < 10; i++) stepReactiveMatter(sim, { contacts: [] });
  const spent = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'].filter((id) => sim.bodies.get(id).phase === 'spent');
  assert.deepEqual(spent, ['c0', 'c1', 'c2']);
  const before = sim.reactionCount;
  for (let i = 0; i < 30; i++) stepReactiveMatter(sim, { contacts: [] });
  assert.equal(sim.reactionCount, before);
  assert.equal(sim.creditsGranted, 0);
});

test('brittle fracture changes geometry and retargets the hitch that still holds a lug', () => {
  const sim = world(4);
  const spar = spawnReactiveBody(sim, { id: 'spar', modelId: 'cryo_spar', x: 0, z: 0, vx: 3, vz: -2 });
  spawnReactiveBody(sim, { id: 'tug', modelId: 'hauler', x: -30, z: 0 });
  addHitch(sim, { id: 'line', ownerId: 'tug', targetId: 'spar', rest: 30, lugLocalX: 4, lugLocalZ: 0 });
  const parentP = spar.mass * spar.vx;
  const result = stepReactiveMatter(sim, {
    contacts: [{ aId: 'tug', bId: 'spar', nx: 1, nz: 0, closingSpeed: 100 }],
  });
  assert.equal(spar.phase, 'fractured');
  assert.equal(spar.radius, 0);
  assert.equal(spar.mass, 0);
  const shards = [...sim.bodies.values()].filter((body) => body.parentId === 'spar');
  assert.equal(shards.length, 2);
  const shardP = shards.reduce((sum, body) => sum + body.mass * body.vx, 0);
  assert.ok(Math.abs(shardP - parentP) < 1e-6, shardP);
  const hitch = sim.hitches.get('line');
  assert.ok(hitch.targetId.startsWith('spar:shard'), hitch.targetId);
  const shard = sim.bodies.get(hitch.targetId);
  const lugX = shard.x + hitch.lugLocalX;
  const lugZ = shard.z + hitch.lugLocalZ;
  assert.ok(Math.hypot(lugX - shard.x, lugZ - shard.z) <= shard.radius);
  assert.ok(Math.abs(lugX - 4) < 1e-6 && Math.abs(lugZ) < 1e-6);
  assert.equal(result.retargets[0].toId, hitch.targetId);
  for (const shard of shards) {
    assert.ok(Math.hypot(shard.x, shard.z) > shard.radius);
  }
  const second = stepReactiveMatter(sim, {
    contacts: [{ aId: 'tug', bId: 'spar', nx: 1, nz: 0, closingSpeed: 200 }],
  });
  assert.equal(second.reactions.length, 0);
  assert.equal([...sim.bodies.values()].filter((body) => body.parentId === 'spar').length, 2);
});

test('a missed lug drops the tow instead of inventing a target', () => {
  const sim = world(4);
  spawnReactiveBody(sim, { id: 'spar', modelId: 'cryo_spar', x: 0, z: 0 });
  spawnReactiveBody(sim, { id: 'tug', modelId: 'hauler', x: 0, z: -40 });
  addHitch(sim, { id: 'line', ownerId: 'tug', targetId: 'spar', rest: 40, lugLocalX: 0, lugLocalZ: 12 });
  stepReactiveMatter(sim, {
    contacts: [{ aId: 'tug', bId: 'spar', nx: 1, nz: 0, closingSpeed: 90 }],
  });
  const hitch = sim.hitches.get('line');
  assert.equal(hitch.alive, false);
  assert.equal(hitch.broken, 'fracture');
});

test('elastic cargo stores a bounded impulse and the physics owner returns it', async () => {
  const run = await runLiveBodies({
    ticks: 40,
    dt: 1 / 60,
    seed: 8,
    bodies: [
      { id: 'pod', modelId: 'elastic_pod', x: 0, z: 0 },
      { id: 'puck', modelId: 'inert_puck', x: 4, z: 0, vx: -30 },
    ],
    machines: [],
    fields: [],
    hitches: [],
    tape: [],
  });
  const pod = run.snapshot.bodies.find((body) => body.id === 'pod');
  const puck = run.snapshot.bodies.find((body) => body.id === 'puck');
  assert.ok(Number.isFinite(pod.x));
  assert.ok(run.peakStored.pod > 5, run.peakStored.pod);
  assert.ok(run.peakStored.pod <= REACTIVE_BUDGETS.elasticMaxStored + 1e-6);
  assert.ok(run.cues.some((cue) => cue.kind === 'elastic-release'));
  assert.ok(puck.vx > -30, puck.vx);
});

test('player and npc volatile strikes plan the same impulse; only the player is clamped', async () => {
  async function strike(isPlayer) {
    const state = createGameState(21);
    state.seed = 21;
    state.combat.attachments = { byId: {} };
    state.fieldsKernel = { list() { return []; } };
    installReactiveEntity(state, { id: 'can', modelId: 'volatile_canister', x: 0, z: 0 });
    installReactiveEntity(state, { id: 'hull', modelId: 'hauler', x: -30, z: 0, isPlayer });
    const system = Object.create(reactiveMatter);
    system.init({ state, bus: createBus() });
    system.pending.push({ aId: 'hull', bId: 'can', nx: 1, nz: 0, closingSpeed: 80 });
    const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, publishTelemetry: false });
    state.physicsOwner = owner;
    owner.syncFromEntities(state.entityList);
    const before = Math.hypot(state.entities.get('hull').vel.x, state.entities.get('hull').vel.z);
    const result = system.update(1 / 60, state);
    const raw = result.impulses.find((impulse) => impulse.bodyId === 'hull');
    owner.syncFromEntities(state.entityList);
    owner.step(1 / 60);
    const hull = state.entities.get('hull');
    const after = Math.hypot(hull.vel.x, hull.vel.z);
    system.destroy();
    owner.dispose();
    return { raw: Math.hypot(raw.jx, raw.jz), dv: after - before, chemical: result.chemicalInjected };
  }
  const player = await strike(true);
  const npc = await strike(false);
  assert.ok(Math.abs(player.raw - npc.raw) < 1e-6, `${player.raw} vs ${npc.raw}`);
  assert.ok(Math.abs(player.chemical - npc.chemical) < 1e-6);
  assert.ok(player.dv <= npc.dv * PLAYER_EXTERNAL_RESPONSE.scale + 1e-6);
  assert.ok(player.dv <= PLAYER_EXTERNAL_RESPONSE.impulseBudget + 1e-6);
  assert.equal(typeof queuePhysicsImpulse, 'function');
});

test('extreme closing speed and a wild dt stay finite and capped', () => {
  const sim = world(2);
  const can = spawnReactiveBody(sim, { id: 'can', modelId: 'volatile_canister', x: 0, z: 0 });
  const result = stepReactiveMatter(sim, {
    dt: 1e9,
    contacts: [{ aId: 'can', bId: 'other', nx: 1, nz: 0, closingSpeed: 1e12 }],
  });
  assert.equal(result.dtClamped, true);
  assert.equal(can.phase, 'spent');
  assert.ok(can.heat <= REACTIVE_BUDGETS.heatCap);
  assert.ok(result.chemicalInjected <= REACTIVE_BUDGETS.volatileImpulseCap);
  for (const impulse of result.impulses) {
    assert.ok(Number.isFinite(impulse.jx) && Number.isFinite(impulse.jz));
  }
  const tiny = world(2);
  spawnReactiveBody(tiny, { id: 'crate', modelId: 'ferro_crate', x: 0, z: 0 });
  addMachine(tiny, { id: 'crane', x: 10, z: 0, strength: 400, fieldRadius: 20, polarity: 1, anchored: true });
  const slow = stepReactiveMatter(tiny, { dt: 1e-12, contacts: [] });
  assert.equal(slow.dt, REACTIVE_BUDGETS.dtMin);
  assert.ok(slow.impulses.every((impulse) => Number.isFinite(impulse.jx)));
});

test('marker families are distinct and legible at the top-down floor', () => {
  const families = ['ferro', 'volatile', 'brittle', 'elastic'];
  const signatures = new Set();
  const tints = new Set();
  for (const id of families) {
    const marker = REACTIVE_MARKERS[id];
    assert.ok(marker.minWorldRadius >= MARKER_MIN_LEGIBLE_RADIUS);
    signatures.add(marker.signature);
    tints.add(marker.tint);
    assert.ok(marker.layers.length >= 2);
  }
  assert.equal(signatures.size, 4);
  assert.equal(tints.size, 4);
});

test('reactive sources do not import three, Math.random, or wall time', () => {
  const roots = ['src/matter/reactive', 'src/data/reactiveMatter'];
  const files = [];
  for (const root of roots) {
    for (const name of readdirSync(root)) {
      const path = join(root, name);
      if (statSync(path).isFile() && (name.endsWith('.js') || name.endsWith('.md'))) files.push(path);
    }
  }
  assert.ok(files.length >= 8);
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    assert.equal(/\bfrom\s+['"]three['"]/.test(text), false, path);
    assert.equal(/Math\.random/.test(text), false, path);
    assert.equal(/Date\.now/.test(text), false, path);
    assert.equal(/\bnew Date\(/.test(text), false, path);
  }
  assert.equal(existsSync('src/matter/reactive/harness.js'), false);
  const system = readFileSync('src/systems/reactiveMatter.js', 'utf8');
  assert.equal(system.includes('queuePhysicsImpulse'), true);
  assert.equal(system.includes('attachment.targetId'), true);
  assert.equal(system.includes('integrateWitness'), false);
  const matter = readFileSync('src/matter/reactive/liveSession.js', 'utf8');
  assert.equal(matter.includes('integrateWitness'), false);
  assert.equal(matter.includes('separateSolids'), false);
  assert.equal(matter.includes('applyHitches'), false);
  const step = readFileSync('src/matter/reactive/step.js', 'utf8');
  assert.equal(step.includes('performance.now'), false);
  assert.equal(DEFAULT_MASSLINE_DEF.maxImpulse > 0, true);
});
