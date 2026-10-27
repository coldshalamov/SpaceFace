// Single-side opaque materials whose geometry is watertight.
//
// Three decisions stack up to make a body pay twice for nothing:
//   * an author exports every material `doubleSided` because "double-sided is safe";
//   * the geometry underneath is a closed shell, so a back face is never visible;
//   * three.js then rasterises every triangle twice and compiles a separate DOUBLESIDED program.
//
// The 2026-10-27 asset sweep found this is not rare. 79 of 414 render packages have *every*
// material double-sided, covering 11.6% of all packaged triangles; the Wreck Cathedral - the single
// most expensive drawn body in the game at 166,944 LOD0 triangles - is 8-for-8 double-sided while
// `Material_Mechanical_Exposed` (80,516 tris), `Material_Armor_Scorched` (48,232) and
// `Material_Hull_ConcordGray` (29,924) are watertight shells with zero boundary edges. The Helios
// trade hub, which reads correctly, ships the same convention the other way round: every opaque
// material single-sided, only the canopy double-sided.
//
// The rule is a proof, not a guess: flip a material to single-sided only when every primitive using
// it is opaque and *closed* - every mesh edge shared by exactly two triangles. A plate, decal,
// blade of grass, or open hull section has boundary edges and is left exactly as authored, which is
// why this is safe to run over the whole tree instead of a hand-maintained allowlist.
//
// Boundary edges are counted on positions welded to 1e-4, so an exporter that split vertices for
// normals or UVs cannot fake an open surface.
const WELD_DECIMALS = 4;

function weldKey(x, y, z) {
  return `${x.toFixed(WELD_DECIMALS)},${y.toFixed(WELD_DECIMALS)},${z.toFixed(WELD_DECIMALS)}`;
}

/** Boundary edge count for one primitive, with coincident vertices welded. */
export function primitiveBoundaryEdges(primitive) {
  const indices = primitive.getIndices();
  const position = primitive.getAttribute('POSITION');
  if (!position) return Number.POSITIVE_INFINITY;
  const vertexCount = position.getCount();
  if (vertexCount < 3) return 0;

  const remap = new Map();
  const welded = new Int32Array(vertexCount);
  const element = [0, 0, 0];
  for (let i = 0; i < vertexCount; i += 1) {
    position.getElement(i, element);
    const key = weldKey(element[0], element[1], element[2]);
    let id = remap.get(key);
    if (id === undefined) {
      id = remap.size;
      remap.set(key, id);
    }
    welded[i] = id;
  }

  const edges = new Map();
  const bump = (a, b) => {
    if (a === b) return; // degenerate triangle edge: not a surface boundary
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  };

  const array = indices ? indices.getArray() : null;
  const triangleCount = array ? array.length : vertexCount;
  for (let t = 0; t + 2 < triangleCount; t += 3) {
    const a = welded[array ? array[t] : t];
    const b = welded[array ? array[t + 1] : t + 1];
    const c = welded[array ? array[t + 2] : t + 2];
    bump(a, b);
    bump(b, c);
    bump(c, a);
  }

  let boundary = 0;
  for (const count of edges.values()) if (count === 1) boundary += 1;
  return boundary;
}

const NON_OPAQUE_NAME = /glass|canopy|windscreen|window|visor|lens|hologram|decal|flag|pennant|bunting|blade|frond|leaf|foliage|smoke|plume|flame|trail|ribbon/i;

/**
 * glTF-Transform transform: set `doubleSided = false` on opaque materials whose geometry is a
 * closed shell. Returns a report so a build can print what it changed.
 */
export function singleSideWatertightOpaque(options = {}) {
  const { dryRun = false } = options;
  return (document) => {
    const root = document.getRoot();
    const perMaterial = new Map();

    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const material = primitive.getMaterial();
        if (!material) continue;
        const record = perMaterial.get(material) || { closed: true, triangles: 0, primitives: 0 };
        record.primitives += 1;
        const indices = primitive.getIndices();
        const position = primitive.getAttribute('POSITION');
        record.triangles += indices
          ? Math.round(indices.getCount() / 3)
          : Math.round((position ? position.getCount() : 0) / 3);
        if (record.closed && primitiveBoundaryEdges(primitive) > 0) record.closed = false;
        perMaterial.set(material, record);
      }
    }

    const flipped = [];
    const skipped = [];
    for (const [material, record] of perMaterial) {
      if (!material.getDoubleSided()) continue;
      const name = material.getName() || '(unnamed)';
      if (material.getAlphaMode() !== 'OPAQUE') {
        skipped.push({ name, reason: `alphaMode=${material.getAlphaMode()}`, triangles: record.triangles });
        continue;
      }
      if (NON_OPAQUE_NAME.test(name)) {
        skipped.push({ name, reason: 'name reads as a thin surface', triangles: record.triangles });
        continue;
      }
      if (!record.closed) {
        skipped.push({ name, reason: 'open shell', triangles: record.triangles });
        continue;
      }
      if (!dryRun) {
        material.setDoubleSided(false);
      }
      flipped.push({ name, triangles: record.triangles, primitives: record.primitives });
    }

    return {
      flipped,
      skipped,
      flippedTriangles: flipped.reduce((sum, row) => sum + row.triangles, 0),
      skippedTriangles: skipped.reduce((sum, row) => sum + row.triangles, 0),
    };
  };
}

export const SINGLE_SIDE_REPORT_SCHEMA = 'spaceface.singleSideWatertightOpaque.v1';
