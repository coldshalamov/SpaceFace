// Reusable render-only entity classification frame.
//
// The renderer's existing entity->mesh traversal populates this object after pose/LOD sync. Downstream
// render pools consume the compact category arrays instead of rescanning state.entityList. Records and
// arrays are retained across frames; no simulation state or Three.js objects are owned here.

export function createRenderEntityFrame() {
  return {
    frameId: 0,
    traversals: 0,
    entitiesVisited: 0,
    byId: new Map(),
    records: [],
    contactShadows: [],
    shipAux: [],
    authored: [],
    asteroids: [],
  };
}

export function beginRenderEntityFrame(frame) {
  if (!frame) return null;
  frame.frameId = (frame.frameId + 1) >>> 0;
  if (frame.frameId === 0) frame.frameId = 1;
  frame.traversals = 1;
  frame.entitiesVisited = 0;
  frame.records.length = 0;
  frame.contactShadows.length = 0;
  frame.shipAux.length = 0;
  frame.authored.length = 0;
  frame.asteroids.length = 0;
  return frame;
}

export function classifyRenderEntity(frame, entity, mesh, options = false) {
  if (!frame || !entity || !mesh || entity.alive === false) return null;
  const viewCulled = typeof options === 'boolean' ? options : !!(options && options.viewCulled);
  let record = frame.byId.get(entity.id);
  if (!record) {
    record = createRecord(entity.id);
    frame.byId.set(entity.id, record);
  }

  const position = mesh.position || ZERO_VECTOR;
  const rotation = mesh.rotation || ZERO_VECTOR;
  const scale = mesh.scale || UNIT_VECTOR;
  const visible = mesh.visible !== false;
  const nextViewCulled = viewCulled;
  const userData = mesh.userData || EMPTY_OBJECT;
  const lodLevel = userData.lod && userData.lod.level || null;
  const transformDirty = !record.initialized
    || record.x !== position.x || record.y !== position.y || record.z !== position.z
    || record.rx !== rotation.x || record.ry !== rotation.y || record.rz !== rotation.z
    || record.sx !== scale.x || record.sy !== scale.y || record.sz !== scale.z;
  const visibilityDirty = !record.initialized
    || record.visible !== visible
    || record.viewCulled !== nextViewCulled;
  const detailDirty = !record.initialized || record.lodLevel !== lodLevel;

  record.entity = entity;
  record.mesh = mesh;
  record.seenFrame = frame.frameId;
  record.viewCulled = nextViewCulled;
  record.visible = visible;
  record.transformDirty = transformDirty;
  record.visibilityDirty = visibilityDirty;
  record.detailDirty = detailDirty;
  record.renderDirty = transformDirty || visibilityDirty || detailDirty;
  record.lodLevel = lodLevel;
  record.x = position.x; record.y = position.y; record.z = position.z;
  record.rx = rotation.x; record.ry = rotation.y; record.rz = rotation.z;
  record.sx = scale.x; record.sy = scale.y; record.sz = scale.z;
  record.initialized = true;

  record.contactShadow = visible
    && (entity.type === 'ship' || entity.type === 'station')
    && entity._noShadow !== true
    && userData.hasContactShadow === true;
  record.shipAuxiliary = visible && entity.type === 'ship';
  record.authored = visible && (
    userData.authoredAssetState != null
    || userData.authoredRenderContract != null
    || userData.renderContract != null
    || typeof userData.requestAuthoredUpgrade === 'function'
  );
  record.asteroidInstance = entity.type === 'asteroid' && !!userData.asteroidInstanceBody;

  frame.entitiesVisited++;
  frame.records.push(record);
  if (record.contactShadow) frame.contactShadows.push(record);
  if (record.shipAuxiliary) frame.shipAux.push(record);
  if (record.authored) frame.authored.push(record);
  if (record.asteroidInstance) frame.asteroids.push(record);
  return record;
}

/**
 * Project this frame's classified records into a dense presentation snapshot.
 *
 * This is the seam between the existing per-entity classification and the batched path: the frame
 * has already visited every entity and cached its pose, so the projection is a linear pass over
 * `frame.records` rather than a second traversal of `state.entityList`. Nothing here reads sim state
 * or touches a Three.js object — it copies numbers the frame already holds.
 *
 * Rotations are stored as Euler XYZ in the record and as a quaternion in the snapshot, so the
 * conversion happens here, written inline so no Quaternion or Euler is allocated per entity per
 * frame. Allocating one would hand back the cost the dense snapshot exists to remove.
 *
 * `archetypeOf` maps a record to the batch it belongs in; entities sharing geometry and material
 * share an archetype, which is what lets the batcher collapse them into one draw.
 */
export function projectRenderEntityFrame(frame, snapshot, archetypeOf, visibleFlag = 1) {
  if (!frame || !snapshot) return 0;
  const records = frame.records;
  snapshot.beginFrame(records.length);
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    // Euler XYZ -> quaternion. Culled entities still occupy a slot so indices stay stable across
    // frames; visibility is carried in the flag, which is what the batcher filters on.
    const hx = record.rx * 0.5, hy = record.ry * 0.5, hz = record.rz * 0.5;
    const cx = Math.cos(hx), sx = Math.sin(hx);
    const cy = Math.cos(hy), sy = Math.sin(hy);
    const cz = Math.cos(hz), sz = Math.sin(hz);
    const qx = sx * cy * cz + cx * sy * sz;
    const qy = cx * sy * cz - sx * cy * sz;
    const qz = cx * cy * sz + sx * sy * cz;
    const qw = cx * cy * cz - sx * sy * sz;
    const visible = record.visible && !record.viewCulled;
    snapshot.write(
      record.id >>> 0,
      archetypeOf ? archetypeOf(record) >>> 0 : 0,
      record.x, record.y, record.z,
      qx, qy, qz, qw,
      record.sx, record.sy, record.sz,
      visible ? visibleFlag : 0,
    );
  }
  return records.length;
}

export function endRenderEntityFrame(frame) {
  if (!frame) return null;
  for (const [id, record] of frame.byId) {
    if (record.seenFrame !== frame.frameId) frame.byId.delete(id);
  }
  return frame;
}

function createRecord(id) {
  return {
    id,
    entity: null,
    mesh: null,
    seenFrame: 0,
    initialized: false,
    visible: false,
    viewCulled: false,
    transformDirty: true,
    visibilityDirty: true,
    detailDirty: true,
    renderDirty: true,
    lodLevel: null,
    contactShadow: false,
    shipAuxiliary: false,
    authored: false,
    asteroidInstance: false,
    x: 0, y: 0, z: 0,
    rx: 0, ry: 0, rz: 0,
    sx: 1, sy: 1, sz: 1,
  };
}

const EMPTY_OBJECT = Object.freeze({});
const ZERO_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });
const UNIT_VECTOR = Object.freeze({ x: 1, y: 1, z: 1 });
