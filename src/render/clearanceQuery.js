// Neighborhood roof for wide structural meshes. The chase camera reads a 3×3 column
// window; this module answers that window from a MeshBVH instead of walking every
// triangle into a dense grid. The stamp is the same one the old raster used: a
// triangle paints its XZ bounding box with its max vertex Y.
//
// The tree lives on geometry.userData, never on geometry.boundsTree, so installing
// three-mesh-bvh's accelerated raycast or frustum helpers cannot start using it.
// indirect + setBoundingBox:false leaves the rendered index and bounding box alone.
import * as THREE from 'three';
import { CONTAINED, INTERSECTED, MeshBVH, NOT_INTERSECTED } from 'three-mesh-bvh';

export const CLEARANCE_GRID_CELL_WU = 24;
export const CLEARANCE_GRID_MAX_CELLS = 128;

const _inv = new THREE.Matrix4();
const _corner = new THREE.Vector3();
const _localBox = new THREE.Box3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _windowHeights = new Float32Array(9);
const _sample = { gx: 0, gz: 0 };

let ensureOverride = null;

/** Test seam: replace the tree builder. Pass null to restore the real one. */
export function setClearanceEnsureOverrideForTest(fn) {
  ensureOverride = typeof fn === 'function' ? fn : null;
}

export function acceptClearanceMesh(object) {
  if (!object || !object.isMesh || object.visible === false || object.isInstancedMesh) return false;
  const data = object.userData;
  if (data && (data.worldSitePresentationOwned || data.clearanceExempt)) return false;
  const mats = Array.isArray(object.material) ? object.material : [object.material];
  if (mats.some((m) => m && (m.transparent || m.blending === THREE.AdditiveBlending || m.depthWrite === false))) {
    return false;
  }
  const pos = object.geometry && object.geometry.attributes && object.geometry.attributes.position;
  return !!(pos && pos.count);
}

export function clearanceLayoutFromBox(box) {
  const spanX = box.maxX - box.minX;
  const spanZ = box.maxZ - box.minZ;
  const nx = Math.min(CLEARANCE_GRID_MAX_CELLS, Math.max(1, Math.ceil(spanX / CLEARANCE_GRID_CELL_WU)));
  const nz = Math.min(CLEARANCE_GRID_MAX_CELLS, Math.max(1, Math.ceil(spanZ / CLEARANCE_GRID_CELL_WU)));
  return {
    minX: box.minX,
    minZ: box.minZ,
    nx,
    nz,
    cw: spanX / nx,
    cd: spanZ / nz,
  };
}

/** Writes gx/gz onto `target` (default: a reused scratch). Copy the fields before the next call. */
export function clearanceSampleCell(layout, camX, camZ, target) {
  const out = target || _sample;
  out.gx = Math.floor((camX - layout.minX) / layout.cw);
  out.gz = Math.floor((camZ - layout.minZ) / layout.cd);
  return out;
}

// Same rejection as the old grid reader: one cell past the far edge is still in the
// 3×3, two cells past is not. `gx > nx`, not `gx >= nx`.
export function clearanceCellInRange(layout, gx, gz) {
  return !(gx < -1 || gz < -1 || gx > layout.nx || gz > layout.nz);
}

export function clearanceGridRawAt(grid, camX, camZ) {
  if (!grid) return -Infinity;
  const gx = Math.floor((camX - grid.minX) / grid.cw);
  const gz = Math.floor((camZ - grid.minZ) / grid.cd);
  if (gx < -1 || gz < -1 || gx > grid.nx || gz > grid.nz) return -Infinity;
  let raw = -Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    const z = gz + dz;
    if (z < 0 || z >= grid.nz) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx;
      if (x < 0 || x >= grid.nx) continue;
      const h = grid.heights[z * grid.nx + x];
      if (h > raw) raw = h;
    }
  }
  return raw;
}

function paint(heights, layout, vA, vB, vC, window) {
  const triMinX = Math.min(vA.x, vB.x, vC.x);
  const triMaxX = Math.max(vA.x, vB.x, vC.x);
  const triMinZ = Math.min(vA.z, vB.z, vC.z);
  const triMaxZ = Math.max(vA.z, vB.z, vC.z);
  const top = Math.max(vA.y, vB.y, vC.y);
  let gx0 = Math.floor((triMinX - layout.minX) / layout.cw);
  let gx1 = Math.floor((triMaxX - layout.minX) / layout.cw);
  let gz0 = Math.floor((triMinZ - layout.minZ) / layout.cd);
  let gz1 = Math.floor((triMaxZ - layout.minZ) / layout.cd);
  gx0 = Math.max(0, gx0);
  gz0 = Math.max(0, gz0);
  gx1 = Math.min(layout.nx - 1, gx1);
  gz1 = Math.min(layout.nz - 1, gz1);
  if (window) {
    gx0 = Math.max(gx0, window.gx0);
    gx1 = Math.min(gx1, window.gx1);
    gz0 = Math.max(gz0, window.gz0);
    gz1 = Math.min(gz1, window.gz1);
  }
  if (gx0 > gx1 || gz0 > gz1) return;
  for (let gz = gz0; gz <= gz1; gz++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const i = window
        ? (gz - window.originZ) * 3 + (gx - window.originX)
        : gz * layout.nx + gx;
      if (top > heights[i]) heights[i] = top;
    }
  }
}

function rasterObject(object, heights, layout, window) {
  const pos = object.geometry.attributes.position;
  const index = object.geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const world = object.matrixWorld;
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    _vA.fromBufferAttribute(pos, a).applyMatrix4(world);
    _vB.fromBufferAttribute(pos, b).applyMatrix4(world);
    _vC.fromBufferAttribute(pos, c).applyMatrix4(world);
    paint(heights, layout, _vA, _vB, _vC, window);
  }
}

/** Full-footprint raster. Fallback when a BVH cannot be built. Null when nothing opaque remains. */
export function rasterClearanceGrid(mesh, box) {
  const layout = clearanceLayoutFromBox(box);
  const heights = new Float32Array(layout.nx * layout.nz);
  heights.fill(-Infinity);
  mesh.updateMatrixWorld(true);
  mesh.traverse((object) => {
    if (!acceptClearanceMesh(object)) return;
    rasterObject(object, heights, layout, null);
  });
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] !== -Infinity) {
      return {
        minX: layout.minX,
        minZ: layout.minZ,
        cw: layout.cw,
        cd: layout.cd,
        nx: layout.nx,
        nz: layout.nz,
        heights,
      };
    }
  }
  return null;
}

function geometryRevision(geometry) {
  const pos = geometry.attributes && geometry.attributes.position;
  const index = geometry.index;
  const groups = geometry.groups ? geometry.groups.length : 0;
  const draw = geometry.drawRange || { start: 0, count: Infinity };
  return [
    pos ? pos.version : -1,
    pos ? pos.count : 0,
    index ? index.version : -1,
    index ? index.count : 0,
    groups,
    draw.start,
    draw.count,
  ].join('|');
}

// Groups on the rendered geometry would drop triangles the old walk still painted.
// A missing index would make MeshBVH write one onto the drawn geometry. Both cases
// use a query-only geometry that shares the position attribute. Never dispose it:
// disposing would free that shared attribute.
function queryGeometryFor(geometry) {
  const pos = geometry.attributes.position;
  const grouped = geometry.groups && geometry.groups.length > 0;
  if (geometry.index && !grouped) return geometry;
  const data = geometry.userData || (geometry.userData = {});
  const rev = geometryRevision(geometry);
  const cached = data.clearanceQueryGeometry;
  if (cached && cached.userData.clearanceSrcRev === rev) return cached;
  const query = new THREE.BufferGeometry();
  query.setAttribute('position', pos);
  if (geometry.index) {
    query.setIndex(geometry.index);
  } else {
    const count = pos.count;
    const IndexArray = count > 65535 ? Uint32Array : Uint16Array;
    const index = new IndexArray(count);
    for (let i = 0; i < count; i++) index[i] = i;
    query.setIndex(new THREE.BufferAttribute(index, 1));
  }
  query.userData.clearanceSrcRev = rev;
  data.clearanceQueryGeometry = query;
  return query;
}

export function ensureClearanceBoundsTree(geometry) {
  if (!geometry || !geometry.isBufferGeometry) return null;
  const data = geometry.userData || (geometry.userData = {});
  if (data.clearanceBvhFailed) return null;
  const pos = geometry.attributes && geometry.attributes.position;
  if (!pos || pos.count < 3) {
    data.clearanceBvhFailed = true;
    data.clearanceBoundsTree = null;
    return null;
  }
  const rev = geometryRevision(geometry);
  if (data.clearanceBoundsTree && data.clearanceBvhRev === rev) return data.clearanceBoundsTree;
  try {
    const query = queryGeometryFor(geometry);
    const tree = new MeshBVH(query, { indirect: true, setBoundingBox: false });
    if (geometry.boundsTree) delete geometry.boundsTree;
    if (query !== geometry && query.boundsTree) delete query.boundsTree;
    data.clearanceBoundsTree = tree;
    data.clearanceBvhRev = rev;
    data.clearanceBvhFailed = false;
    return tree;
  } catch {
    data.clearanceBvhFailed = true;
    data.clearanceBoundsTree = null;
    return null;
  }
}

function resolveEnsure(options) {
  if (options && typeof options.ensureBoundsTree === 'function') return options.ensureBoundsTree;
  if (ensureOverride) return ensureOverride;
  return ensureClearanceBoundsTree;
}

function writeLocalQueryBox(mesh, minX, maxX, minZ, maxZ, target) {
  const det = mesh.matrixWorld.determinant();
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return false;
  _inv.copy(mesh.matrixWorld).invert();
  target.makeEmpty();
  for (let xi = 0; xi < 2; xi++) {
    const x = xi === 0 ? minX : maxX;
    for (let zi = 0; zi < 2; zi++) {
      const z = zi === 0 ? minZ : maxZ;
      _corner.set(x, -1e6, z).applyMatrix4(_inv);
      target.expandByPoint(_corner);
      _corner.set(x, 1e6, z).applyMatrix4(_inv);
      target.expandByPoint(_corner);
    }
  }
  target.min.x -= 1e-3;
  target.min.y -= 1e-3;
  target.min.z -= 1e-3;
  target.max.x += 1e-3;
  target.max.y += 1e-3;
  target.max.z += 1e-3;
  return true;
}

/**
 * Max vertex-Y inside the camera's 3×3 window. `visited` counts triangles the BVH
 * actually reported. `failed` means the caller should keep the legacy full raster.
 * `empty` means no opaque triangle mass, so the caller keeps the coarse box.
 */
export function clearanceNeighborhoodRaw(root, box, camX, camZ, options) {
  const layout = clearanceLayoutFromBox(box);
  const sample = clearanceSampleCell(layout, camX, camZ, _sample);
  const gx = sample.gx;
  const gz = sample.gz;
  if (!clearanceCellInRange(layout, gx, gz)) {
    return { raw: -Infinity, visited: 0, failed: false, empty: false };
  }
  const ensure = resolveEnsure(options);
  _windowHeights.fill(-Infinity);
  const originX = gx - 1;
  const originZ = gz - 1;
  const window = {
    gx0: Math.max(0, originX),
    gx1: Math.min(layout.nx - 1, gx + 1),
    gz0: Math.max(0, originZ),
    gz1: Math.min(layout.nz - 1, gz + 1),
    originX,
    originZ,
  };
  // One extra cell around the 3×3 so a tight bounds test cannot drop a triangle
  // whose XZ box still paints a window cell.
  const qMinX = layout.minX + (gx - 2) * layout.cw;
  const qMaxX = layout.minX + (gx + 3) * layout.cw;
  const qMinZ = layout.minZ + (gz - 2) * layout.cd;
  const qMaxZ = layout.minZ + (gz + 3) * layout.cd;
  let visited = 0;
  let accepted = 0;
  let failed = false;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (failed || !acceptClearanceMesh(object)) return;
    accepted += 1;
    let tree = null;
    try {
      tree = ensure(object.geometry);
    } catch (err) {
      failed = true;
      throw err;
    }
    if (!tree) {
      failed = true;
      return;
    }
    if (!writeLocalQueryBox(object, qMinX, qMaxX, qMinZ, qMaxZ, _localBox)) {
      failed = true;
      return;
    }
    const world = object.matrixWorld;
    object.geometry.userData = object.geometry.userData || {};
    try {
      tree.shapecast({
        intersectsBounds: (bounds) => {
          if (!bounds.intersectsBox(_localBox)) return NOT_INTERSECTED;
          return _localBox.containsBox(bounds) ? CONTAINED : INTERSECTED;
        },
        intersectsTriangle: (tri) => {
          visited += 1;
          _vA.copy(tri.a).applyMatrix4(world);
          _vB.copy(tri.b).applyMatrix4(world);
          _vC.copy(tri.c).applyMatrix4(world);
          paint(_windowHeights, layout, _vA, _vB, _vC, window);
          return false;
        },
      });
    } catch (err) {
      object.geometry.userData.clearanceBvhFailed = true;
      object.geometry.userData.clearanceBoundsTree = null;
      throw err;
    }
  });
  if (failed) return { raw: -Infinity, visited, failed: true, empty: false };
  if (accepted === 0) return { raw: -Infinity, visited: 0, failed: false, empty: true };
  let raw = -Infinity;
  for (let i = 0; i < 9; i++) if (_windowHeights[i] > raw) raw = _windowHeights[i];
  return { raw, visited, failed: false, empty: false };
}
