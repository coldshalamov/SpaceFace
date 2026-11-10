import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAYER_EXTERNAL_RESPONSE } from '../src/core/physicalResponse.js';
import { DEFAULT_MASSLINE_DEF } from '../src/core/constraints/masslineController.js';
import { REACTIVE_BUDGETS, REACTIVE_MODELS } from '../src/data/reactiveMatter/index.js';
import {
  addMachine,
  claimReactiveSalvage,
  createReactiveWorld,
  clearReactiveLaws,
  destroyReactiveWorld,
  loadReactiveWorld,
  reapReactiveWorld,
  saveReactiveWorld,
  spawnReactiveBody,
  stepReactiveMatter,
} from '../src/matter/reactive/index.js';
import { runLiveBodies } from '../src/matter/reactive/liveSession.js';
import { REEL_SPEED } from '../src/systems/reactiveMatter.js';

function heatWorld(seed = 9) {
  const sim = createReactiveWorld({ seed });
  spawnReactiveBody(sim, { id: 'can', modelId: 'volatile_canister', x: 0, z: 0 });
  sim.fields = [{ id: 'kiln', kind: 'thermal', x: 0, z: 0, radius: 12, heatPerSec: 30 }];
  return sim;
}

test('half-step and full-step ferromagnetic motion stay in the same place', async () => {
  async function run(dt, ticks) {
    const result = await runLiveBodies({
      ticks,
      dt,
      seed: 3,
      bodies: [{ id: 'crate', modelId: 'ferro_crate', x: 0, z: 0 }],
      machines: [{ id: 'crane', x: 24, z: 0, strength: 700, fieldRadius: 28, polarity: 1, anchored: true }],
      fields: [],
      hitches: [],
      tape: [],
    });
    return result.snapshot.bodies.find((body) => body.id === 'crate').x;
  }
  const full = await run(1 / 60, 60);
  const half = await run(1 / 120, 120);
  assert.ok(full > 2 && half > 2, `full ${full} half ${half}`);
  assert.ok(Math.abs(full - half) / full < 0.15, `full ${full} half ${half}`);
});

test('save reload continues a cook and a tampered intact phase stays spent', () => {
  const sim = heatWorld(12);
  for (let i = 0; i < 20; i++) stepReactiveMatter(sim, { contacts: [] });
  const saved = saveReactiveWorld(sim);
  assert.ok(JSON.stringify(saved).length < 48000, JSON.stringify(saved).length);
  const loaded = loadReactiveWorld(saved);
  const fresh = heatWorld(12);
  for (let i = 0; i < 20; i++) stepReactiveMatter(fresh, { contacts: [] });
  assert.deepEqual(saveReactiveWorld(loaded), saved);
  for (let i = 0; i < 80; i++) {
    stepReactiveMatter(loaded, { contacts: [] });
    stepReactiveMatter(fresh, { contacts: [] });
  }
  assert.equal(loaded.bodies.get('can').phase, 'spent');
  assert.deepEqual(saveReactiveWorld(loaded).bodies, saveReactiveWorld(fresh).bodies);

  const tampered = saveReactiveWorld(loaded);
  const row = tampered.bodies.find((body) => body.id === 'can');
  row.phase = 'intact';
  row.heat = 0;
  const revived = loadReactiveWorld(tampered);
  assert.equal(revived.bodies.get('can').phase, 'spent');
  const before = revived.chemicalInjected;
  stepReactiveMatter(revived, {
    contacts: [{ aId: 'can', bId: 'ram', nx: 1, nz: 0, closingSpeed: 400 }],
  });
  assert.equal(revived.chemicalInjected, before);
});

test('lost ids, duplicate salvage, and a hostile credit field grant nothing', () => {
  const sim = createReactiveWorld({ seed: 1 });
  spawnReactiveBody(sim, { id: 'can', modelId: 'no-such-model', x: 0, z: 0 });
  assert.ok(sim.lostIds.includes('can'));
  spawnReactiveBody(sim, { id: 'pod', modelId: 'elastic_pod', x: 0, z: 0 });
  const first = spawnReactiveBody(sim, { id: 'pod', modelId: 'elastic_pod', x: 5, z: 0 });
  assert.equal(first, null);
  stepReactiveMatter(sim, {
    contacts: [{ aId: 'missing', bId: 'also-missing', nx: 1, nz: 0, closingSpeed: 10 }],
  });
  const debris = spawnReactiveBody(sim, {
    id: 'bit',
    modelId: 'reactive_debris',
    x: 1,
    z: 1,
    mass: 1,
    radius: 1,
    runtime: true,
  });
  sim.salvage.set('bit:salvage', { id: 'bit:salvage', bodyId: debris.id, claimed: false, credits: 0 });
  const claim = claimReactiveSalvage(sim, 'bit:salvage');
  assert.equal(claim.ok, true);
  assert.equal(claim.credits, 0);
  assert.equal(claim.intent, null);
  const again = claimReactiveSalvage(sim, 'bit:salvage');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'duplicate');
  const saved = saveReactiveWorld(sim);
  saved.creditsGranted = 9999;
  saved.salvage.push({ id: 'bit:salvage', bodyId: 'bit', claimed: false });
  const loaded = loadReactiveWorld(saved);
  assert.equal(loaded.creditsGranted, 0);
  assert.equal(claimReactiveSalvage(loaded, 'bit:salvage').reason, 'duplicate');
  const ghost = saveReactiveWorld(loaded);
  ghost.bodies.push({ id: 'ghost', modelId: 'not-a-model', x: 0, z: 0, phase: 'intact' });
  ghost.hitches.push({ id: 'lost-line', ownerId: 'pod', targetId: 'nobody', rest: 10, lugLocalX: 0, lugLocalZ: 0, alive: true });
  const repaired = loadReactiveWorld(ghost);
  assert.equal(repaired.bodies.has('ghost'), false);
  assert.ok(repaired.lostIds.includes('ghost'));
  const hitch = repaired.hitches.get('lost-line');
  assert.ok(!hitch || hitch.alive === false);
});

test('catalog mass cannot be inflated through a save', () => {
  const sim = createReactiveWorld({ seed: 2 });
  spawnReactiveBody(sim, { id: 'crate', modelId: 'ferro_crate', x: 0, z: 0 });
  const saved = saveReactiveWorld(sim);
  saved.bodies[0].mass = 0.01;
  const loaded = loadReactiveWorld(saved);
  assert.ok(loaded.bodies.get('crate').mass >= 0.25);
  assert.ok(loaded.bodies.get('crate').mass <= REACTIVE_MODELS.ferro_crate.mass);
  saved.bodies[0].mass = 1000;
  const heavy = loadReactiveWorld(saved);
  assert.equal(heavy.bodies.get('crate').mass, REACTIVE_MODELS.ferro_crate.mass);
  const shard = spawnReactiveBody(sim, { id: 'chip', modelId: 'reactive_shard', x: 4, z: 0, mass: 0.1 });
  assert.equal(shard.mass, 0.1);
  const shardSave = saveReactiveWorld(sim);
  const chip = shardSave.bodies.find((body) => body.id === 'chip');
  chip.mass = 0.1;
  const restored = loadReactiveWorld(shardSave);
  assert.equal(restored.bodies.get('chip').mass, 0.1);
  chip.mass = 1000;
  assert.equal(loadReactiveWorld(shardSave).bodies.get('chip').mass, 80);
});

test('reaction budget defers a crowd and reap clears old debris', () => {
  const sim = createReactiveWorld({ seed: 6 });
  for (let i = 0; i < 10; i++) {
    spawnReactiveBody(sim, { id: `c${i}`, modelId: 'volatile_canister', x: i * 3, z: 0, heat: 100 });
  }
  const first = stepReactiveMatter(sim, { contacts: [] });
  assert.equal(first.reactions.length, REACTIVE_BUDGETS.maxReactionsPerTick);
  assert.ok(sim.deferred.length > 0);
  stepReactiveMatter(sim, { contacts: [] });
  assert.equal(sim.reactionCount, 10);
  const third = stepReactiveMatter(sim, { contacts: [] });
  assert.equal(third.reactions.length, 0);
  const debris = [...sim.bodies.values()].filter((body) => body.role === 'debris');
  assert.ok(debris.length > 0);
  for (const body of debris) body.age = REACTIVE_BUDGETS.reapAge;
  const removed = reapReactiveWorld(sim);
  assert.ok(removed.length > 0);
  assert.equal([...sim.bodies.values()].some((body) => body.role === 'debris'), false);
});

test('destroy rejects further spawns and the live reel uses the massline cap', () => {
  const sim = createReactiveWorld({ seed: 1 });
  destroyReactiveWorld(sim);
  assert.throws(() => spawnReactiveBody(sim, { id: 'a', modelId: 'ferro_crate', x: 0, z: 0 }));
  assert.throws(() => stepReactiveMatter(sim, {}));
  assert.equal(REEL_SPEED, DEFAULT_MASSLINE_DEF.reelInSpeed);
  assert.equal(PLAYER_EXTERNAL_RESPONSE.scale, 0.1);
  assert.equal(PLAYER_EXTERNAL_RESPONSE.impulseBudget, 5);
  assert.equal(PLAYER_EXTERNAL_RESPONSE.windowTicks, 30);
  assert.equal(PLAYER_EXTERNAL_RESPONSE.maxAcceleration, 8);
});

test('crowded ferromagnetic picture evaluates every pair; laws-off is the same crates', () => {
  function picture(live) {
    const sim = createReactiveWorld({ seed: 11 });
    for (let m = 0; m < 8; m++) {
      addMachine(sim, {
        id: `m${m}`, x: (m - 3.5) * 12, z: 0, strength: 400, fieldRadius: 18, polarity: 1, anchored: true,
      });
    }
    for (let i = 0; i < 48; i++) {
      const body = spawnReactiveBody(sim, {
        id: `b${i}`,
        modelId: 'ferro_crate',
        x: (i % 8 - 3.5) * 12,
        z: 8 + Math.floor(i / 8) * 6,
      });
      if (!live) clearReactiveLaws(body);
    }
    return sim;
  }
  const ticks = 60;
  const live = picture(true);
  const inert = picture(false);
  const liveIds = [...live.bodies.values()].map((body) => body.modelId).sort();
  const inertIds = [...inert.bodies.values()].map((body) => body.modelId).sort();
  assert.deepEqual(inertIds, liveIds);
  assert.ok(inertIds.every((id) => id === 'ferro_crate'));
  const t0 = performance.now();
  let liveEvals = 0;
  for (let i = 0; i < ticks; i++) liveEvals += stepReactiveMatter(live, { contacts: [] }).lawEvals;
  const liveMs = performance.now() - t0;
  const t1 = performance.now();
  let inertEvals = 0;
  for (let i = 0; i < ticks; i++) inertEvals += stepReactiveMatter(inert, { contacts: [] }).lawEvals;
  const inertMs = performance.now() - t1;
  assert.equal(liveEvals, 48 * 8 * ticks);
  assert.equal(inertEvals, 0);
  assert.ok(liveMs < 500, liveMs);
  assert.ok(inertMs < 500, inertMs);
});
