// D191 micro-bench: price intra-body (same rigid body) collider pairs in rapier3d-compat 0.19.3.
//
// A fixed body with K mutually-AABB-overlapping colliders is exactly what Ceres dressing
// solids are (measured-skin compounds: ~20-24 primitives each). The production census showed
// 8898 tracked narrow-phase pairs, ~8.5k of them same-body. This bench answers:
//   1. Do same-body pairs enter the contact graph at all? (contactPairsWith count)
//   2. What does each cost per world.step()?
//   3. Do the admitted pair filters (collision groups / ActiveCollisionTypes) even apply
//      to same-body pairs?
//   4. Do the pairs carry real manifolds (world.contactPair non-zero contacts)?
import { performance } from 'node:perf_hooks';
import { loadRapierCompatRuntime } from '../src/core/rapierCompatRuntime.js';

const RAPIER = await loadRapierCompatRuntime();

function buildWorld({ perBody, bodies, overlap = true, groups = null, actTypes = null }) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.integrationParameters.numSolverIterations = 12;
  for (let b = 0; b < bodies; b += 1) {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(b * 5000, 0, 0);
    const body = world.createRigidBody(desc);
    for (let i = 0; i < perBody; i += 1) {
      // Prism-like cuboids 10x50x10 tiled along X within ~50 WU — same AABB footprint
      // relation as a measured-skin primitive row.
      const cd = RAPIER.ColliderDesc.cuboid(10, 50, 10)
        .setTranslation(overlap ? (i * 4) - perBody * 2 : i * 100, 0, 0);
      if (groups != null) cd.setCollisionGroups(groups);
      if (actTypes != null) cd.setActiveCollisionTypes(actTypes);
      world.createCollider(cd, body);
    }
  }
  // One dynamic mover so the step does real work besides pair bookkeeping.
  const mover = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 900000),
  );
  world.createCollider(RAPIER.ColliderDesc.ball(5), mover);
  return world;
}

function countPairs(world) {
  const pairs = new Set();
  world.forEachCollider((collider) => {
    world.contactPairsWith(collider, (other) => {
      const a = collider.handle; const b = other.handle;
      pairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    });
  });
  return pairs.size;
}

function bench(world, ticks = 240) {
  for (let i = 0; i < 30; i += 1) world.step();
  const t0 = performance.now();
  for (let i = 0; i < ticks; i += 1) world.step();
  return (performance.now() - t0) / ticks;
}

const scenarios = [];
for (const perBody of [1, 4, 8, 16, 24]) {
  scenarios.push({ name: `fixed x8, ${perBody} overlapping colliders`, opts: { perBody, bodies: 8 } });
}
scenarios.push({ name: 'fixed x8, 24 NON-overlapping colliders', opts: { perBody: 24, bodies: 8, overlap: false } });
scenarios.push({ name: 'fixed x8, 24 overlapping, groups=0', opts: { perBody: 24, bodies: 8, groups: 0 } });
scenarios.push({ name: 'fixed x8, 24 overlapping, actTypes=0', opts: { perBody: 24, bodies: 8, actTypes: 0 } });

for (const s of scenarios) {
  const world = buildWorld(s.opts);
  const ms = bench(world);
  const pairs = countPairs(world);
  // Probe one same-body pair for a real manifold.
  let firstPairContacts = null;
  let seen = null;
  world.forEachCollider((collider) => {
    if (seen != null) return;
    world.contactPairsWith(collider, (other) => {
      if (seen != null) return;
      seen = [collider, other];
    });
  });
  if (seen) {
    world.contactPair(seen[0], seen[1], (manifold) => {
      firstPairContacts = manifold.numContacts();
    });
  }
  console.log(`${s.name}: step=${ms.toFixed(3)}ms trackedPairs=${pairs} firstPairContacts=${firstPairContacts}`);
  world.free();
}
