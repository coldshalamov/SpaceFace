// Pure checks shared by the bank CLI and adversarial fixtures. Passing these
// proves a structural contract, never visual quality or runtime performance.
const vector = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite);
const norm = value => Math.hypot(...value);
const near = (a, b, epsilon = 2e-4) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= epsilon);
const unit = value => value.map(v => v / norm(value));
const fact = (ok, message) => { if (!ok) throw new Error(message); };
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

export function validateAssetContract(row, context = 'asset manifest') {
  const check = (ok, message) => fact(ok, `${context}: ${message}`);
  check(row && typeof row === 'object' && !Array.isArray(row), 'invalid manifest');
  check(typeof row.assetId === 'string' && /^[a-z0-9_-]+$/.test(row.assetId), 'invalid asset identity');
  check(row.unit === 'metre', 'units must be explicit metres');
  check(typeof row.description === 'string' && row.description.trim().length > 0, 'missing usage description');
  check(vector(row.bounds?.min, 3) && vector(row.bounds?.max, 3), 'invalid bounds');
  check(row.bounds.min.every((v, i) => v <= row.bounds.max[i]), 'reversed bounds');
  check(Array.isArray(row.sockets), 'missing socket contract');
  for (const socket of row.sockets) {
    check(socket && typeof socket.name === 'string' && socket.name.trim().length > 0, 'invalid socket name');
    check(vector(socket.position, 3) && vector(socket.forward, 3) && vector(socket.up, 3), 'invalid socket vectors');
    check(Math.abs(norm(socket.forward) - 1) < 1e-5 && Math.abs(norm(socket.up) - 1) < 1e-5, 'socket basis must be normalized');
    check(Math.abs(socket.forward.reduce((sum, v, i) => sum + v * socket.up[i], 0)) < 1e-5, 'socket basis is degenerate');
  }
  check(new Set(row.sockets.map(socket => socket.name)).size === row.sockets.length, 'duplicate socket names');
  if (row.motionContracts != null) {
    check(Array.isArray(row.motionContracts) && Array.isArray(row.motionGroups), 'invalid motion contract list');
    const ids = new Set();
    for (const motion of row.motionContracts) {
      check(motion && typeof motion.id === 'string' && motion.id.length > 0 && !ids.has(motion.id), 'invalid or duplicate motion identity');
      ids.add(motion.id);
      check(vector(motion.pivot, 3) && vector(motion.axis, 3) && Math.abs(norm(motion.axis) - 1) < 1e-5, 'invalid motion frame');
      check(['rotate', 'translate'].includes(motion.kind) && motion.unit === (motion.kind === 'rotate' ? 'degrees' : 'metres'), 'invalid motion kind or unit');
      check(vector(motion.range, 2) && motion.range[0] <= motion.range[1], 'invalid motion range');
      const groups = row.motionGroups.filter(group => group?.id === motion.id);
      check(groups.length === 1 && vector(groups[0].pivot, 3) && near(groups[0].pivot, motion.pivot), 'motion contract disagrees with rigid pivot');
    }
  }
  check(['none', 'compound-boxes'].includes(row.collision?.type), 'unknown collision proxy contract');
  check(Array.isArray(row.collision.solids), 'missing collision solids');
  check(row.collision.type === 'none' ? row.collision.solids.length === 0 : row.collision.solids.length > 0,
    'collision type disagrees with solids');
  for (const box of row.collision.solids) {
    check(box && box.type === 'box' && vector(box.center, 3) && vector(box.size, 3), 'invalid collision box');
    check(box.size.every(v => v > 0), 'nonpositive collision extent');
    check(vector(box.rotation, 4) && Math.abs(norm(box.rotation) - 1) < 1e-5, 'invalid collision orientation');
  }
  check(Array.isArray(row.lods) && row.lods.length === 3 && row.lods.every((lod, i) => lod?.level === i), 'expected ordered LOD0/1/2');
  for (const lod of row.lods) {
    // Reject both platform separators: a manifest must remain safe when moved
    // between an authoring workstation and a Linux build agent.
    check(typeof lod.file === 'string' && /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.glb$/.test(lod.file), 'unsafe LOD path');
    check(positiveInteger(lod.bytes) && positiveInteger(lod.triangles) && positiveInteger(lod.draws), 'invalid LOD cost receipt');
    check(typeof lod.sha256 === 'string' && /^[a-f0-9]{64}$/.test(lod.sha256), 'invalid LOD hash receipt');
  }
  check(new Set(row.lods.map(lod => lod.file)).size === row.lods.length, 'duplicate LOD file');
  return row;
}

/** Inspect instantiated bind-pose geometry in the selected glTF scene. */
export function inspectAssetDocument(doc, row, level) {
  const check = (ok, message) => fact(ok, `${row.assetId}: LOD${level} ${message}`);
  const root = doc.getRoot(), scenes = root.listScenes();
  const scene = root.getDefaultScene() || (scenes.length === 1 ? scenes[0] : null);
  check(scene, 'missing or ambiguous active scene');
  const nodes = [], seen = new Set();
  const visit = node => {
    check(!seen.has(node), 'repeated or cyclic scene node');
    seen.add(node); nodes.push(node);
    for (const child of node.listChildren()) visit(child);
  };
  for (const node of scene.listChildren()) visit(node);
  let triangles = 0, draws = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    check(matrix.length === 16 && matrix.every(Number.isFinite), 'nonfinite mesh transform');
    for (const primitive of mesh.listPrimitives()) {
      check(primitive.getMode() === 4, 'only triangle primitives supported');
      const positions = primitive.getAttribute('POSITION');
      check(positions && positions.getType() === 'VEC3' && positions.getCount() > 0, 'empty or invalid POSITION geometry');
      const values = positions.getArray();
      check(values && values.length === positions.getCount() * 3, 'invalid vertex buffer');
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : positions.getCount();
      check(count > 0 && count % 3 === 0, 'incomplete triangle');
      if (indices) {
        check(indices.getType() === 'SCALAR', 'invalid index accessor');
        const values = indices.getArray();
        check(values && values.length === count, 'invalid index buffer');
        for (const index of values) check(Number.isSafeInteger(index) && index >= 0 && index < positions.getCount(), 'index outside vertex buffer');
      }
      check(primitive.getMaterial(), 'unassigned material');
      // Count each mesh occurrence, not just each reusable mesh definition.
      triangles += count / 3; draws++;
      for (let offset = 0; offset < values.length; offset += 3) {
        const x = values[offset], y = values[offset + 1], z = values[offset + 2];
        check(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), 'nonfinite vertex');
        for (let axis = 0; axis < 3; axis++) {
          const value = matrix[axis] * x + matrix[axis + 4] * y + matrix[axis + 8] * z + matrix[axis + 12];
          check(Number.isFinite(value), 'nonfinite transformed vertex');
          min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
        }
      }
    }
  }
  check(triangles > 0, 'no reachable triangle geometry');
  for (let axis = 0; axis < 3; axis++) {
    // Export/float tolerance, not a silhouette budget. Coarser LODs may shrink;
    // none may escape the declared bind-pose envelope used for placement/culling.
    const epsilon = 2e-4 + 2e-6 * Math.max(1, Math.abs(row.bounds.min[axis]), Math.abs(row.bounds.max[axis]));
    check(min[axis] >= row.bounds.min[axis] - epsilon && max[axis] <= row.bounds.max[axis] + epsilon,
      `geometry escapes declared bounds on axis ${axis}`);
  }
  for (const socket of row.sockets) {
    const matches = nodes.filter(node => node.getName() === socket.name);
    check(matches.length === 1, `socket ${socket.name} absent or duplicated in active scene`);
    const matrix = matches[0].getWorldMatrix();
    check(matrix.length === 16 && matrix.every(Number.isFinite), `socket ${socket.name} invalid transform`);
    check(near(matrix.slice(12, 15), socket.position), `socket ${socket.name} position disagrees with export`);
    check(near(unit(matrix.slice(0, 3)), socket.forward), `socket ${socket.name} orientation disagrees with export`);
    check(near(unit(matrix.slice(4, 7)), socket.up), `socket ${socket.name} up orientation disagrees with export`);
  }
  for (const motion of row.motionContracts || []) {
    const matches = nodes.filter(node => node.getName() === `MOTION_${motion.id.toUpperCase()}`);
    check(matches.length === 1, `motion ${motion.id} absent or duplicated in active scene`);
    const matrix = matches[0].getWorldMatrix();
    check(matrix.length === 16 && matrix.every(Number.isFinite) && near(matrix.slice(12, 15), motion.pivot),
      `motion ${motion.id} pivot disagrees with export`);
  }
  return { triangles, draws, bounds: { min, max } };
}
