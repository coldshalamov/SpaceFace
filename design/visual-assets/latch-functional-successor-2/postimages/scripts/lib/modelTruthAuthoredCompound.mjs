// Opt-in measurement for authored-origin bodies whose native compound is the
// authority. Legacy catalog rows deliberately retain their existing fit/skin path.
export function authoredCompoundMeasurement(row) {
  if (row.fit !== 'authored-origin') return null;
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
  if(certificate?.schema==='spaceface.authoredCompound.v1' && certificate.assetId!==measurement.assetId)throw new Error('Authored compound certificate asset identity mismatch');
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
