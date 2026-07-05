// 96×96 orthographic silhouette raster + IoU alignment (Kestrel gate pattern).
// Used by check-place-concept-resemblance.mjs and promote-place-archetype.mjs.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

export const SILHOUETTE_SIZE = 96;

let _io = null;
async function getIo() {
  if (_io) return _io;
  await MeshoptDecoder.ready;
  _io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
  });
  return _io;
}

function identityMat4() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function multiplyMat4(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0]
        + a[1 * 4 + r] * b[c * 4 + 1]
        + a[2 * 4 + r] * b[c * 4 + 2]
        + a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function transformPoint(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return {
    x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    z: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  };
}

function traverseSceneNodes(doc, visit) {
  const scenes = doc.getRoot().listScenes();
  const startNodes = scenes.length
    ? scenes.flatMap((scene) => scene.listChildren())
    : doc.getRoot().listNodes().filter((node) => node.listParents().length === 0);

  function walk(node, parentWorld) {
    const local = node.getMatrix();
    const world = parentWorld ? multiplyMat4(parentWorld, local) : local;
    visit(node, world);
    for (const child of node.listChildren()) walk(child, world);
  }

  for (const node of startNodes) walk(node, null);
}

function collectProjectedTriangles(doc, projectFn) {
  const tris = [];
  traverseSceneNodes(doc, (node, world) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      const indices = prim.getIndices();
      const pushTri = (ia, ib, ic) => {
        const a = transformPoint(world, arr[ia * 3], arr[ia * 3 + 1], arr[ia * 3 + 2]);
        const b = transformPoint(world, arr[ib * 3], arr[ib * 3 + 1], arr[ib * 3 + 2]);
        const c = transformPoint(world, arr[ic * 3], arr[ic * 3 + 1], arr[ic * 3 + 2]);
        tris.push([
          projectFn(a.x, a.y, a.z),
          projectFn(b.x, b.y, b.z),
          projectFn(c.x, c.y, c.z),
        ]);
      };
      if (indices) {
        const idx = indices.getArray();
        for (let i = 0; i < idx.length; i += 3) pushTri(idx[i], idx[i + 1], idx[i + 2]);
      } else {
        for (let i = 0; i + 2 < arr.length / 3; i += 3) pushTri(i, i + 1, i + 2);
      }
    }
  });
  return tris;
}

function rasterizeTriangles(tris, size = SILHOUETTE_SIZE) {
  const grid = new Uint8Array(size * size);
  if (!tris.length) return { grid, fillRatio: 0, bounds: null };

  const pts = tris.flat();
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const lenX = Math.max(maxX - minX, 1e-6);
  const lenY = Math.max(maxY - minY, 1e-6);
  const sx = size / lenX;
  const sy = size / lenY;

  for (const [[ax, ay], [bx, by], [cx, cy]] of tris) {
    const gax = (ax - minX) * sx; const gay = (ay - minY) * sy;
    const gbx = (bx - minX) * sx; const gby = (by - minY) * sy;
    const gcx = (cx - minX) * sx; const gcy = (cy - minY) * sy;
    const xlo = Math.max(0, Math.floor(Math.min(gax, gbx, gcx)));
    const xhi = Math.min(size - 1, Math.ceil(Math.max(gax, gbx, gcx)));
    const ylo = Math.max(0, Math.floor(Math.min(gay, gby, gcy)));
    const yhi = Math.min(size - 1, Math.ceil(Math.max(gay, gby, gcy)));
    const denom = (gby - gcy) * (gax - gcx) + (gcy - gay) * (gbx - gcx) || 1e-9;
    for (let gy = ylo; gy <= yhi; gy++) {
      for (let gx = xlo; gx <= xhi; gx++) {
        const px = gx + 0.5; const py = gy + 0.5;
        const l1 = ((gby - gcy) * (px - gcx) + (gcy - gay) * (py - gcy)) / denom;
        const l2 = ((gcy - gay) * (px - gcx) + (gax - gcx) * (py - gcy)) / denom;
        const l3 = 1 - l1 - l2;
        if (l1 >= 0 && l2 >= 0 && l3 >= 0) grid[gy * size + gx] = 1;
      }
    }
  }

  let filled = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) filled++;
  return {
    grid,
    fillRatio: filled / (size * size),
    bounds: { minX, maxX, minY, maxY, lenX, lenY },
  };
}

/** Side-elevation orthographic (X horizontal, Y vertical) — matches station concept refs. */
export async function rasterizeGlbSilhouette(glbPath, size = SILHOUETTE_SIZE) {
  const io = await getIo();
  const doc = await io.read(glbPath);
  const tris = collectProjectedTriangles(doc, (x, y) => [x, y]);
  return rasterizeTriangles(tris, size);
}

function decodeImageBuffer(bytes) {
  const head = bytes.subarray(0, 4);
  if (head[0] === 0xff && head[1] === 0xd8) {
    const decoded = jpeg.decode(bytes, { useTArray: true });
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  if (head[0] === 0x89 && head[1] === 0x50) {
    const decoded = PNG.sync.read(bytes);
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  throw new Error('unsupported image format (expected JPG or PNG)');
}

function luminanceAt(data, width, x, y) {
  const i = (y * width + x) * 4;
  const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Threshold concept reference to foreground bitmask (bright structures on dark field). */
export function rasterizeConceptSilhouette(imagePath, size = SILHOUETTE_SIZE, options = {}) {
  const bytes = readFileSync(imagePath);
  const { width, height, data } = decodeImageBuffer(bytes);
  const threshold = options.threshold ?? 48;
  const chromaMin = options.chromaMin ?? 18;

  const raw = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      const lum = luminanceAt(data, width, x, y);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      raw[y * width + x] = (lum >= threshold || chroma >= chromaMin) ? 1 : 0;
    }
  }

  let minX = width; let maxX = -1; let minY = height; let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!raw[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    return { grid: new Uint8Array(size * size), fillRatio: 0, bounds: null };
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const grid = new Uint8Array(size * size);
  const sx = size / cropW;
  const sy = size / cropH;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!raw[y * width + x]) continue;
      const gx = Math.min(size - 1, Math.floor((x - minX) * sx));
      const gy = Math.min(size - 1, Math.floor((y - minY) * sy));
      grid[gy * size + gx] = 1;
    }
  }

  let filled = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) filled++;
  return {
    grid,
    fillRatio: filled / (size * size),
    bounds: { minX, maxX, minY, maxY, lenX: cropW, lenY: cropH },
  };
}

export function computeIoU(maskA, maskB, size = SILHOUETTE_SIZE) {
  let inter = 0; let union = 0;
  for (let i = 0; i < size * size; i++) {
    const a = maskA[i] > 0;
    const b = maskB[i] > 0;
    if (a || b) union++;
    if (a && b) inter++;
  }
  return union > 0 ? inter / union : 0;
}

export function shiftMask(grid, size, dx, dy) {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
      if (grid[sy * size + sx]) out[y * size + x] = 1;
    }
  }
  return out;
}

export function flipMaskH(grid, size) {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y * size + x]) out[y * size + (size - 1 - x)] = 1;
    }
  }
  return out;
}

/** Align concept + GLB masks with small translation / mirror sweep; return best IoU. */
export function bestAlignIoU(conceptGrid, glbGrid, size = SILHOUETTE_SIZE, options = {}) {
  const maxShift = options.maxShift ?? 6;
  let best = 0;
  let bestMeta = { dx: 0, dy: 0, flip: false };

  const conceptVariants = [
    { grid: conceptGrid, flip: false },
    { grid: flipMaskH(conceptGrid, size), flip: true },
  ];

  for (const variant of conceptVariants) {
    for (let dy = -maxShift; dy <= maxShift; dy++) {
      for (let dx = -maxShift; dx <= maxShift; dx++) {
        const shifted = shiftMask(variant.grid, size, dx, dy);
        const iou = computeIoU(shifted, glbGrid, size);
        if (iou > best) {
          best = iou;
          bestMeta = { dx, dy, flip: variant.flip };
        }
      }
    }
  }
  return { iou: best, ...bestMeta };
}

export async function measureConceptGlbResemblance(conceptPath, glbPath, options = {}) {
  const concept = rasterizeConceptSilhouette(conceptPath, SILHOUETTE_SIZE, options);
  const glb = await rasterizeGlbSilhouette(glbPath, SILHOUETTE_SIZE);
  const aligned = bestAlignIoU(concept.grid, glb.grid, SILHOUETTE_SIZE, options);
  return {
    iou: aligned.iou,
    align: { dx: aligned.dx, dy: aligned.dy, flip: aligned.flip },
    conceptFill: concept.fillRatio,
    glbFill: glb.fillRatio,
    conceptBounds: concept.bounds,
    glbBounds: glb.bounds,
  };
}