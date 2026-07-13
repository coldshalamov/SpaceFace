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
