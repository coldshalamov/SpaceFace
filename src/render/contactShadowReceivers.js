// Contact ink needs a real, visible surface. Builders may declare clone-safe footprints in
// root.userData.contactShadowReceivers: [{ nodeName, outerRadius, innerRadius?, centerX?,
// centerZ?, y }]. Dimensions are in the named mesh's coordinates, inside bevels/edges.
// Replace the declaration array when the geometry changes. No bounding-box or dock-radius guess.
export const CONTACT_SHADOW_SURFACE_OFFSET = 0.025;
const MIN_SHADOW_RADIUS = 0.5;

// Exact authored apron contract from forge/ships/place_station_trade_hub.py. These are the
// actual dedicated apron nodes, not the market wheel's open centre or docking envelope.
const TRADE_HUB_RECEIVERS = Object.freeze([0, 1, 2].map(lod => Object.freeze({
  nodeName: `LOD${lod}_Hull_apron`, centerX: 3, centerZ: 0, y: 9.6,
  innerRadius: 16.2, outerRadius: 40.8,
})));

export function createContactShadowSelection() {
  return { records: [], recordPool: [], receivers: [], roots: new WeakMap() };
}

function visibleScene(object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return null;
    if (node.isScene) return node;
  }
  return null;
}

function receiverVisible(node, root) {
  if (!node?.isMesh || !node.geometry) return false;
  const material = node.material;
  if (Array.isArray(material)) {
    for (const part of material) if (!part || part.visible === false || part.opacity === 0) return false;
  } else if (!material || material.visible === false || material.opacity === 0) return false;
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === root) return true;
  }
  return false;
}

function receiverDeclarations(root) {
  const data = root.userData;
  if (Array.isArray(data?.contactShadowReceivers)) return data.contactShadowReceivers;
  return data?.placeId === 'place_station_trade_hub' ? TRADE_HUB_RECEIVERS : null;
}

function cachedReceivers(selection, root, declarations) {
  const epoch = root.userData?.admissionEpoch;
  const state = root.userData?.authoredAssetState;
  let cached = selection.roots.get(root);
  if (cached?.declarations === declarations && cached.epoch === epoch && cached.state === state) return cached.rows;
  cached = { declarations, epoch, state, rows: [] };
  // One node lookup per declared surface at build/admission changes, including negative results.
  // Missing or retired nodes never trigger a fresh hierarchy scan on every presented frame.
  for (const spec of declarations) {
    if (!spec || typeof spec.nodeName !== 'string' || !Number.isFinite(spec.y)
      || !(spec.outerRadius > 0) || !Number.isFinite(spec.outerRadius)) continue;
    const inner = spec.innerRadius ?? 0;
    const cx = spec.centerX ?? 0, cz = spec.centerZ ?? 0;
    if (!Number.isFinite(inner) || inner < 0 || inner >= spec.outerRadius
      || !Number.isFinite(cx) || !Number.isFinite(cz)) continue;
    const node = root.getObjectByName?.(spec.nodeName);
    if (node) cached.rows.push({ node, root, spec, inner, cx, cz });
  }
  selection.roots.set(root, cached);
  return cached.rows;
}

function updateReceiver(row, scene) {
  if (!receiverVisible(row.node, row.root)) return false;
  row.node.updateWorldMatrix(true, false);
  const m = row.node.matrixWorld.elements;
  // The pool draws horizontal circles. A tilted or degenerate deck needs another representation.
  const a = m[0], b = m[8], c = m[2], d = m[10], det = a * d - b * c;
  const aa = a * a + c * c, bb = b * b + d * d, ab = a * b + c * d;
  const minScale = Math.sqrt(Math.max(0, (aa + bb - Math.hypot(aa - bb, 2 * ab)) / 2));
  if (!(minScale > 1e-8) || !Number.isFinite(minScale) || !(m[5] > 0)
    || Math.abs(m[1]) > 1e-6 || Math.abs(m[9]) > 1e-6
    || Math.abs(m[4]) > 1e-6 || Math.abs(m[6]) > 1e-6) return false;
  row.x = m[12] + a * row.cx + b * row.cz;
  row.z = m[14] + c * row.cx + d * row.cz;
  row.y = m[13] + m[5] * row.spec.y;
  if (!Number.isFinite(row.x) || !Number.isFinite(row.z) || !Number.isFinite(row.y)) return false;
  row.invA = d / det; row.invB = -b / det; row.invC = -c / det; row.invD = a / det;
  row.minScale = minScale; row.scene = scene;
  return true;
}

/** Return retained pool-owned records. The shared render classification frame stays untouched. */
export function selectContactShadowsOnReceivers(selection, frameOrRecords, meshes) {
  const source = Array.isArray(frameOrRecords?.records) ? frameOrRecords.records
    : Array.isArray(frameOrRecords) ? frameOrRecords : [];
  const casters = Array.isArray(frameOrRecords?.contactShadows) ? frameOrRecords.contactShadows : source;
  const receivers = selection.receivers, output = selection.records;
  receivers.length = 0; output.length = 0;
  for (const item of source) {
    const entity = item?.entity || item;
    if (entity?.type !== 'station' || entity.alive === false || entity.data?.isGate || entity.data?.isWormhole) continue;
    const root = item?.mesh || meshes?.get(entity.id);
    if (!root) continue;
    const scene = visibleScene(root), declarations = receiverDeclarations(root);
    if (!scene || !declarations) continue;
    for (const row of cachedReceivers(selection, root, declarations)) {
      if (updateReceiver(row, scene)) receivers.push(row);
    }
  }
  for (const item of casters) {
    const entity = item?.entity || item;
    if (entity?.type !== 'ship' || entity.alive === false || entity._noShadow) continue;
    const mesh = item?.mesh || meshes?.get(entity.id);
    if (!mesh?.userData?.hasContactShadow) continue;
    const scene = visibleScene(mesh);
    if (!scene) continue;
    mesh.updateWorldMatrix(true, false);
    const m = mesh.matrixWorld.elements, x = m[12], y = m[13], z = m[14];
    const declaredRadius = Number(mesh.userData.contactShadowRadius);
    const requestedRadius = declaredRadius > 0 ? declaredRadius : Math.max(16, (entity.radius || 28) * 1.4);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(requestedRadius)) continue;
    let best = null, radius = 0;
    for (const receiver of receivers) {
      const height = y - receiver.y;
      if (receiver.scene !== scene || height < CONTACT_SHADOW_SURFACE_OFFSET || height > requestedRadius * 2) continue;
      const dx = x - receiver.x, dz = z - receiver.z;
      const distance = Math.hypot(receiver.invA * dx + receiver.invB * dz,
        receiver.invC * dx + receiver.invD * dz);
      let clearance = receiver.spec.outerRadius - distance;
      if (receiver.inner > 0) clearance = Math.min(clearance, distance - receiver.inner);
      // A world circle of this radius fits even under nonuniform scale and yaw. The smaller
      // singular scale makes the local clearance conservative without geometry/raycast work.
      const fit = Math.min(requestedRadius, clearance * receiver.minScale);
      if (fit < MIN_SHADOW_RADIUS || best && receiver.y <= best.y) continue;
      best = receiver; radius = fit;
    }
    if (!best) continue;
    const index = output.length;
    const record = selection.recordPool[index] || (selection.recordPool[index] = {});
    record.entity = entity; record.mesh = mesh;
    record.shadowX = x; record.shadowZ = z;
    record.shadowY = best.y + CONTACT_SHADOW_SURFACE_OFFSET;
    record.shadowRadius = radius;
    output.push(record);
  }
  return output;
}
