// One instanced draw per credit-chip part instead of one draw per chip mesh.
//
// Every Swarm kill drops a credit chip: four mesh parts (a three-cylinder body merged into one
// geometry, a rim ring, a stamp and the mint bar). Fourteen chips on the field is 56
// submissions, and nothing removes them until they are scooped or the round-clear sweep runs, so
// the pile grows all round while the chips carry almost no triangles. Geometry and materials are
// already shared, which is why this is purely a draw-call problem.
//
// The shape is the asteroid pool's, without its adoption machinery: the live chip entity keeps
// its own three.js group, and every pose writer (pickupMotionPresentation's tumble, bob, vortex
// scale and intake alignment, then the renderer's fence pose) keeps writing that group exactly as
// before. This pool reads the solved world matrices of the four part leaves once per presented
// frame and writes them into one InstancedMesh per part — 4 calls for any number of chips, same
// geometry, same materials, same scale, spin and bob.
//
// Two rules keep the picture honest:
//   * a chip submits only when its root and every part leaf are drawable this frame, and its
//     leaves are hidden in the same pass that copies them — so the instanced copy never paints a
//     body the direct path would have skipped, and a chip leaving the pool (scooped, swept,
//     despawned) is restored to a direct draw before the frame is handed to the GPU;
//   * the hidden leaves keep their would-draw state on the pooled-leaf contract
//     (`asteroidInstanceAdopted` + `poolLeafVisible`), the flag pair worldObjectPicking.js,
//     objectHoverFeedback.js and hlod.js already read for exactly this, so a chip stays pickable
//     and hover-highlighted while the instance is what draws it.

import * as THREE from 'three';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';

export const CREDIT_CHIP_PART_NAMES = Object.freeze([
  'CreditChipBody',
  'CreditChipRim',
  'CreditChipStamp',
  'CreditChipMintBar',
]);

const PART_COUNT = CREDIT_CHIP_PART_NAMES.length;
// Chips pile up for a whole round with no mid-round cap, but a Swarm field realistically holds a
// few dozen; size the buffers for that and grow by doubling if a round ever runs past it.
const INITIAL_CAPACITY = 64;
const GROWTH_FACTOR = 2;

function nextCapacity(value) {
  let result = Math.max(INITIAL_CAPACITY, 1);
  while (result < value) result *= GROWTH_FACTOR;
  return result;
}

/**
 * The four part leaves of a built credit chip, in `CREDIT_CHIP_PART_NAMES` order, or null when
 * this root is not a chip. `out` is reused so the hot path allocates nothing.
 */
export function creditChipPartLeaves(root, out = null) {
  const parts = out || new Array(PART_COUNT);
  parts.fill(null);
  if (!root || typeof root.traverse !== 'function') return null;
  root.traverse((object) => {
    if (!object || object.isMesh !== true || object.isInstancedMesh === true) return;
    const index = CREDIT_CHIP_PART_NAMES.indexOf(object.name);
    if (index >= 0 && parts[index] === null) parts[index] = object;
  });
  for (let i = 0; i < PART_COUNT; i++) if (!parts[i]) return null;
  return parts;
}

/** Would this leaf draw as part of `root`'s subtree right now? */
function leafDrawsUnder(root, leaf) {
  for (let node = leaf; node; node = node.parent) {
    if (node.visible === false) return false;
    if (node === root) return true;
  }
  return false;
}

function hideAsPooled(pool, leaf) {
  const ud = leaf.userData || (leaf.userData = {});
  ud.asteroidInstanceAdopted = true;
  ud.poolLeafVisible = true;
  leaf.visible = false;
  pool.hidden.push(leaf);
}

function showDirect(leaf) {
  if (!leaf) return;
  const ud = leaf.userData;
  if (ud) {
    delete ud.asteroidInstanceAdopted;
    delete ud.poolLeafVisible;
  }
  leaf.visible = true;
}

/**
 * Create the chip pool for a scene.
 *
 * `options.onMeshCreated` mirrors the asteroid pool's admission hook: a fresh InstancedMesh
 * carries a never-linked instanced program, so the renderer routes it through the same pipeline
 * admission latch instead of linking it inside a presented pass.
 */
export function createCreditChipBatch(scene, options = {}) {
  const buckets = new Array(PART_COUNT).fill(null);
  const pool = {
    scene: scene || null,
    buckets,
    capacity: 0,
    // Leaves hidden by the last sync; restored at the head of the next one.
    hidden: [],
    stats: {
      chips: 0,
      instances: 0,
      drawCalls: 0,
      skipped: 0,
      capacity: 0,
    },
    disposed: false,
  };
  const partsScratch = new Array(PART_COUNT);
  // Flat `count * PART_COUNT` list of the leaves accepted this pass, so a chip's array is never
  // retained and the hot path allocates nothing.
  const accepted = [];

  function disposeBucket(bucket) {
    if (!bucket) return;
    const mesh = bucket.mesh;
    bucket.mesh = null;
    bucket.capacity = 0;
    if (!mesh) return;
    mesh.count = 0;
    mesh.visible = false;
    const target = pool.scene;
    if (target && mesh.parent === target) {
      target.remove(mesh);
      const notes = target.userData && target.userData.shadowMeshNotes;
      if (notes && typeof notes.removed === 'function') notes.removed(mesh);
    }
    // Borrowed geometry/material belong to the factory's shared cache; only the instance buffer
    // and the mesh's own GPU handle are ours.
    if (mesh.instanceMatrix && typeof mesh.instanceMatrix.dispose === 'function') mesh.instanceMatrix.dispose();
    if (typeof mesh.dispose === 'function') mesh.dispose();
    mesh.instanceMatrix = null;
    mesh.geometry = null;
    mesh.material = null;
    if (mesh.userData) mesh.userData = {};
  }

  function ensureBucket(index, leaf, capacity) {
    let bucket = buckets[index];
    if (bucket && bucket.mesh && bucket.capacity >= capacity
        && bucket.geometry === leaf.geometry && bucket.material === leaf.material) return bucket;
    if (!bucket) {
      bucket = { index, geometry: null, material: null, mesh: null, capacity: 0 };
      buckets[index] = bucket;
    }
    disposeBucket(bucket);
    bucket.geometry = leaf.geometry;
    bucket.material = leaf.material;
    bucket.capacity = capacity;
    const mesh = new THREE.InstancedMesh(leaf.geometry, leaf.material, capacity);
    mesh.name = `SF_CreditChipInstances_${CREDIT_CHIP_PART_NAMES[index]}`;
    mesh.count = 0;
    mesh.visible = false;
    // The instances are per-chip world poses; a batch-level bound would need a rebuild every
    // frame. Off-camera chips submit no instance at all (the renderer culls them per entity), so
    // skipping the second cull here never overdraws.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.creditChipInstances = true;
    mesh.userData.borrowedGeometryMaterial = true;
    stampOpeningSubmissionPackage(mesh, {
      schema: 'spaceface.creditChipInstances.v1',
      producer: 'credit-chip-instances',
      part: CREDIT_CHIP_PART_NAMES[index],
      geometry: { type: leaf.geometry && leaf.geometry.type || 'BufferGeometry' },
      material: {
        type: leaf.material && leaf.material.type || 'Material',
        transparent: leaf.material && leaf.material.transparent === true,
      },
      instanceAbi: ['instanceMatrix'],
    }, {
      assetId: `credit-chip-instances-${index}`,
      producer: 'credit-chip-instances',
    });
    bucket.mesh = mesh;
    if (pool.scene) {
      pool.scene.add(mesh);
      const notes = pool.scene.userData && pool.scene.userData.shadowMeshNotes;
      if (notes && typeof notes.added === 'function') notes.added(mesh);
    }
    if (typeof options.onMeshCreated === 'function') {
      try { options.onMeshCreated(mesh); } catch { /* admission must never break the sync pass */ }
    }
    return bucket;
  }

  function clearBuckets() {
    for (let i = 0; i < PART_COUNT; i++) {
      const bucket = buckets[i];
      if (!bucket || !bucket.mesh) continue;
      bucket.mesh.count = 0;
      bucket.mesh.visible = false;
    }
  }

  /**
   * Create the four part batches for a built chip so their instanced programs link behind the
   * loading shell instead of on the first live kill. Buffers start empty; `sync` fills them.
   */
  pool.warm = (root) => {
    if (pool.disposed) return false;
    const leaves = creditChipPartLeaves(root, partsScratch);
    if (!leaves) return false;
    const capacity = nextCapacity(pool.capacity || INITIAL_CAPACITY);
    for (let i = 0; i < PART_COUNT; i++) ensureBucket(i, leaves[i], capacity);
    pool.capacity = capacity;
    return true;
  };

  /**
   * Submit this frame's live chips.
   *
   * `chipRoots` is a dense array of chip entity roots the renderer classified as submitting this
   * frame. It is scanned, never retained. Chips that stop arriving are un-hidden at the head of
   * the pass, so they draw directly again the same frame.
   */
  pool.sync = (chipRoots) => {
    const stats = pool.stats;
    if (pool.disposed) return stats;
    stats.chips = 0;
    stats.instances = 0;
    stats.drawCalls = 0;
    stats.skipped = 0;
    stats.capacity = pool.capacity;
    // Restore first: visibility below is read from the direct-draw state, so a leaf still hidden
    // by the previous frame would otherwise keep reading as "not drawable" forever.
    for (let i = 0; i < pool.hidden.length; i++) showDirect(pool.hidden[i]);
    pool.hidden.length = 0;
    accepted.length = 0;

    const count = Array.isArray(chipRoots) ? chipRoots.length : 0;
    if (count === 0) {
      clearBuckets();
      return stats;
    }
    // Pass 1 — measure only. A chip is accepted when the whole token draws and every part can
    // share the batch that already exists for its geometry+material.
    for (let i = 0; i < count; i++) {
      const root = chipRoots[i];
      if (!root) continue;
      const leaves = creditChipPartLeaves(root, partsScratch);
      if (!leaves) { stats.skipped += 1; continue; }
      let drawable = true;
      for (let p = 0; p < PART_COUNT; p++) {
        if (!leafDrawsUnder(root, leaves[p])) { drawable = false; break; }
      }
      if (!drawable) { stats.skipped += 1; continue; }
      for (let p = 0; p < PART_COUNT; p++) accepted.push(leaves[p]);
    }
    const submitted = accepted.length / PART_COUNT;
    if (submitted === 0) {
      clearBuckets();
      return stats;
    }
    const capacity = pool.capacity >= submitted ? pool.capacity : nextCapacity(submitted);
    for (let p = 0; p < PART_COUNT; p++) {
      const bucket = ensureBucket(p, accepted[p], capacity);
      if (!bucket || !bucket.mesh) {
        // No batch for this part family — leave every chip on its own direct draw rather than
        // drawing three parts of a four-part token.
        clearBuckets();
        stats.skipped += submitted;
        return stats;
      }
    }
    pool.capacity = capacity;

    // Pass 2 — write. A chip whose leaves no longer match the batch's bound resources (a
    // geometry/material swap under a live chip) is dropped back to a direct draw.
    let written = 0;
    for (let c = 0; c < submitted; c++) {
      const base = c * PART_COUNT;
      // One ancestor refresh covers the whole chip; each leaf then composes itself against the
      // parent matrix that refresh just wrote.
      accepted[base].updateWorldMatrix(true, false);
      for (let p = 1; p < PART_COUNT; p++) accepted[base + p].updateWorldMatrix(false, false);
      let matches = true;
      for (let p = 0; p < PART_COUNT; p++) {
        const bucket = buckets[p];
        const leaf = accepted[base + p];
        if (bucket.geometry !== leaf.geometry || bucket.material !== leaf.material) { matches = false; break; }
      }
      if (!matches) {
        stats.skipped += 1;
        for (let p = 0; p < PART_COUNT; p++) accepted[base + p] = null;
        continue;
      }
      for (let p = 0; p < PART_COUNT; p++) {
        buckets[p].mesh.setMatrixAt(written, accepted[base + p].matrixWorld);
      }
      written += 1;
    }
    for (let p = 0; p < PART_COUNT; p++) {
      const mesh = buckets[p].mesh;
      const countChanged = mesh.count !== written;
      mesh.count = written;
      mesh.visible = written > 0;
      if (written > 0) mesh.instanceMatrix.needsUpdate = true;
      if (countChanged) mesh.userData.instanceCountChanged = true;
    }
    // Hide exactly the leaves the batches now draw.
    for (let c = 0; c < submitted; c++) {
      for (let p = 0; p < PART_COUNT; p++) {
        const leaf = accepted[c * PART_COUNT + p];
        if (leaf) hideAsPooled(pool, leaf);
      }
    }
    stats.chips = written;
    stats.instances = written * PART_COUNT;
    stats.drawCalls = written > 0 ? PART_COUNT : 0;
    stats.capacity = pool.capacity;
    return stats;
  };

  pool.dispose = () => {
    if (pool.disposed) return;
    pool.disposed = true;
    for (let i = 0; i < pool.hidden.length; i++) showDirect(pool.hidden[i]);
    pool.hidden.length = 0;
    accepted.length = 0;
    for (let i = 0; i < PART_COUNT; i++) {
      disposeBucket(buckets[i]);
      buckets[i] = null;
    }
    pool.capacity = 0;
    pool.scene = null;
  };

  return pool;
}
