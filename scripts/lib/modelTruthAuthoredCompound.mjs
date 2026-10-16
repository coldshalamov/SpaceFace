// Opt-in measurement for authored-origin bodies whose native compound is the
// authority. Legacy catalog rows deliberately retain their existing fit/skin path.
export function authoredCompoundMeasurement(row) {
  if (row.fit !== 'authored-origin') return null;
  if (row.convexPartsWU !== undefined) return authoredConvexMeasurement(row);
  if (row.colliderKind !== 'compound' || !(row.placeScale > 0) || !Number.isFinite(row.placeScale)
    || !row.colliderId || !row.referenceState || !Array.isArray(row.compoundBoxesWU) || !row.compoundBoxesWU.length) {
    throw new Error(`${row.id}: authored-origin measurement requires an explicit scale and native compound reference state`);
  }
  const ids = new Set();
  for (const box of row.compoundBoxesWU) {
    if (!box.id || ids.has(box.id) || !['x', 'y', 'z'].every(axis => Number.isFinite(box.center?.[axis])
      && Number.isFinite(box.size?.[axis]) && box.size[axis] > 0)) {
      throw new Error(`${row.id}: invalid native compound box ${box.id}`);
    }
    ids.add(box.id);
  }
  return {
    assetId: row.assetId || null,
    fit: { scale: row.placeScale, offset: [0, 0, 0] },
    collider: {
      kind: 'compound',
      id: row.colliderId,
      primitives: row.compoundBoxesWU.map(box => ({
        id: box.id, kind: 'obb', x: box.center.x, z: box.center.z,
        hx: box.size.x / 2, hz: box.size.z / 2, rot: 0,
      })),
    },
    referenceState: row.referenceState,
    compoundBoxesWU: row.compoundBoxesWU,
  };
}

export function isAuthoredNonRenderHelper(node) {
  const extras = node.getExtras();
  return extras.nonRender === true || extras.spaceface?.nonRender === true;
}

export function authoredCompoundCoverage(points, measurement, certificate) {
  if (measurement.convexPartsWU) return authoredConvexCoverage(points, measurement, certificate);
  if (certificate?.schema === 'spaceface.authoredCompound.v1' && certificate.assetId !== measurement.assetId) {
    throw new Error('Authored compound certificate asset identity mismatch');
  }
  const sourceBoxes = certificate?.collision?.boxes;
  if (!Array.isArray(sourceBoxes) || sourceBoxes.length !== measurement.compoundBoxesWU.length) {
    throw new Error('Native compound disagrees with the hash-bound authored source');
  }
  for (const box of measurement.compoundBoxesWU) {
    const source = sourceBoxes.find(source => source.name === box.id);
    if (!source || !['x', 'y', 'z'].every((axis, i) => box.center[axis] === source.centerWU[i]
      && box.size[axis] === source.sizeWU[i])) {
      throw new Error(`Native compound ${box.id} disagrees with the hash-bound authored source`);
    }
    // These apertures are source-certified clear through every Y. Even an
    // inflated proxy that contains all visible vertices must never fill one.
    for (const clear of certificate.strictClearVolumes?.[measurement.referenceState] || []) {
      if (['x', 'z'].every(axis => box.center[axis] + box.size[axis] / 2 > clear[axis][0] + 1e-5
        && box.center[axis] - box.size[axis] / 2 < clear[axis][1] - 1e-5)) {
        throw new Error(`Native compound ${box.id} fills an authored clear volume`);
      }
    }
  }
  let coverage = 0;
  for (const point of points) {
    const distance = Math.min(...measurement.compoundBoxesWU.map(box => Math.hypot(
      Math.max(0, Math.abs(point.x - box.center.x) - box.size.x / 2),
      Math.max(0, Math.abs(point.z - box.center.z) - box.size.z / 2),
    )));
    coverage = Math.max(coverage, distance);
  }
  return {
    coverageWu: coverage,
    // No radial interpolation through the empty well, and no claim that a
    // vertex-to-solid test measures the reverse surface distance.
    stickWu: null,
    gapWu: coverage,
    overTolerance: coverage > .05,
    coverageMetric: 'all-visible-vertices-to-native-XZ-compound',
    sourceCompoundParity: true,
    authoredClearVolumesPreserved: true,
  };
}

// This branch deliberately keeps each convex part. Its AABB, or a hull spanning
// neighboring parts, is not the native solid and would close real pod sockets.
function authoredConvexMeasurement(row) {
  if (row.colliderKind !== 'compound' || row.placeScale !== 1 || !row.colliderId
    || !row.referenceState || !row.assetId || !row.sourceGlbPath
    || !/^[a-f0-9]{64}$/.test(row.sourceGlbSha256 || '')
    || !/^[a-f0-9]{64}$/.test(row.sourceSha || '')
    || !Array.isArray(row.convexPartsWU) || !row.convexPartsWU.length
    || row.convexPartsWU.length > 32 || row.compoundBoxesWU !== undefined) {
    throw new Error(`${row.id}: authored convex measurement requires a sealed source and explicit native parts at scale one`);
  }
  const ids = new Set();
  for (const part of row.convexPartsWU) {
    if (!part.id || ids.has(part.id) || !Number.isFinite(part.minY) || !Number.isFinite(part.maxY)
      || part.minY >= part.maxY || !Array.isArray(part.points) || part.points.length < 3
      || part.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
      || part.points.some((a, i, points) => cross(a, points[(i + 1) % points.length], points[(i + 2) % points.length]) <= 0)) {
      throw new Error(`${row.id}: invalid native convex part ${part.id}`);
    }
    ids.add(part.id);
  }
  return {
    assetId: row.assetId, fit: { scale: 1, offset: [0, 0, 0] },
    // Radial-outline sampling is not an exact measurement of an open compound.
    // Coverage below measures actual polygons instead of fabricated primitives.
    collider: { kind: 'compound', id: row.colliderId, primitives: [] },
    referenceState: row.referenceState, convexPartsWU: row.convexPartsWU,
    sourceGlbPath: row.sourceGlbPath, sourceGlbSha256: row.sourceGlbSha256,
    sourceSha: row.sourceSha,
  };
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function hull(points) {
  const sorted = [...new Map(points.map(p => [p.join(','), p])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = values => {
    const out = [];
    for (const p of values) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 1e-8) out.pop();
      out.push(p);
    }
    return out;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.slice().reverse()).slice(0, -1)];
}

function polygonDistance(point, polygon) {
  let inside = true, distance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (cross(a, b, point) < 0) inside = false;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
  }
  return inside ? 0 : distance;
}

// Read the actual canonical source accessor vertices, including parent pivots.
// Release quantization remains a separate visual coverage measurement; it must
// not silently redefine the source-native collision contract.
export function extractAuthoredConvexSource(document, sourceGlbSha256) {
  const root = document.getRoot(), metadata = root.getAsset().extras?.spacefaceAsset;
  const parts = [];
  for (const node of root.listNodes()) {
    const extras = node.getExtras(), name = node.getName();
    if (!name.startsWith('COLLISION_') && extras.collision !== true) continue;
    if (!name.startsWith('COLLISION_') || extras.collision !== true || extras.nonRender !== true
      || name !== `COLLISION_${extras.orchardPartId}` || !node.getMesh()) {
      throw new Error(`Invalid authored collision source node ${name}`);
    }
    const vertices = [], matrix = node.getWorldMatrix();
    for (const primitive of node.getMesh().listPrimitives()) {
      const position = primitive.getAttribute('POSITION'), array = position?.getArray();
      if (!array || position.getElementSize() !== 3) throw new Error(`Missing collision POSITION accessor: ${name}`);
      for (let i = 0; i < array.length; i += 3) {
        const x = array[i], y = array[i + 1], z = array[i + 2];
        const p = [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
        if (!p.every(Number.isFinite)) throw new Error(`Nonfinite collision accessor: ${name}`);
        vertices.push(p);
      }
    }
    if (vertices.length < 6) throw new Error(`Empty collision prism: ${name}`);
    const minY = Math.min(...vertices.map(p => p[1])), maxY = Math.max(...vertices.map(p => p[1]));
    const tolerance = Math.max(1, ...vertices.flat().map(Math.abs)) * 2 ** -21;
    if (!(maxY > minY) || vertices.some(p => Math.min(Math.abs(p[1] - minY), Math.abs(p[1] - maxY)) > tolerance)) {
      throw new Error(`Collision source is not a native Y prism: ${name}`);
    }
    const bottom = hull(vertices.filter(p => Math.abs(p[1] - minY) <= tolerance).map(p => [p[0], p[2]]));
    const top = hull(vertices.filter(p => Math.abs(p[1] - maxY) <= tolerance).map(p => [p[0], p[2]]));
    if (bottom.length < 3 || top.length < 3 || !polygonsMatch(bottom, top, tolerance)) {
      throw new Error(`Collision source is not an extruded native polygon: ${name}`);
    }
    parts.push({ id: extras.orchardPartId, points: bottom, minY, maxY });
  }
  if (new Set(parts.map(p => p.id)).size !== parts.length) throw new Error('Duplicate authored collision source part');
  return { assetId: metadata?.assetId, sourceSha: metadata?.authoringSourceSha256, sourceGlbSha256, convexPartsWU: parts };
}

function polygonsMatch(a, b, tolerance) {
  return a.every(p => polygonDistance(p, b) <= tolerance) && b.every(p => polygonDistance(p, a) <= tolerance);
}

function authoredConvexCoverage(points, measurement, source) {
  if (source?.assetId !== measurement.assetId || source?.sourceSha !== measurement.sourceSha
    || source?.sourceGlbSha256 !== measurement.sourceGlbSha256) {
    throw new Error('Authored convex source identity or hash mismatch');
  }
  if (!Array.isArray(source.convexPartsWU) || source.convexPartsWU.length !== measurement.convexPartsWU.length) {
    throw new Error('Native convex compound disagrees with the hash-bound authored source');
  }
  for (const part of measurement.convexPartsWU) {
    const original = source.convexPartsWU.find(p => p.id === part.id);
    // Only absorb decimal export and float32 accessor roundoff, never a gameplay clearance.
    const tolerance = Math.max(1, Math.abs(part.minY), Math.abs(part.maxY), ...part.points.flat().map(Math.abs)) * 2 ** -21;
    if (!original || Math.abs(original.minY - part.minY) > tolerance || Math.abs(original.maxY - part.maxY) > tolerance
      || !polygonsMatch(original.points, part.points, tolerance)) {
      throw new Error(`Native convex part ${part.id} disagrees with the hash-bound authored source`);
    }
  }
  let coverage = 0;
  for (const point of points) coverage = Math.max(coverage, Math.min(...measurement.convexPartsWU
    .map(part => polygonDistance([point.x, point.z], part.points))));
  return {
    coverageWu: coverage, stickWu: null, gapWu: coverage, overTolerance: coverage > .05,
    coverageMetric: 'all-visible-vertices-to-native-XZ-convex-parts',
    sourceCompoundParity: true, sourceDecompositionPreserved: true,
  };
}
