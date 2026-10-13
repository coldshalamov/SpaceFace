import fs from 'node:fs';
import { SHIPS } from '../../../src/data/ships.js';
import { ENEMY_TYPES } from '../../../src/data/enemies.js';
import {
  modelTruthPlanarRadius,
  modelTruthRow,
  modelTruthRowForEntity,
} from '../../../src/data/modelTruth.js';
import {
  authoredPayloadFileForEntity,
  requiresProductionWholeShipForEntity,
  resolve19305CensusAEntityPackagedFile,
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../../../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../../../src/render/renderPackageManifest.js';
import { WHOLE_SHIP_LOD_RUNTIME_DEMOTION } from '../../../src/render/wholeShipLodPolicy.js';
import { repoPath } from './root.mjs';
import { liveShieldGeometryRadius } from './shieldShell.mjs';

export { liveShieldGeometryRadius };

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));

const RENDER_ORDER = Object.freeze({
  station: 10,
  asteroid: 12,
  wreck: 14,
  prop: 16,
  payload: 18,
  ship: 22,
});

// Lane freighters are closed-form visuals with collides:false (travelLanes.js).
// fx radii are presentation volumes; projectile/pickup contacts are sensors.
const NEVER_SOLID = new Set(['freighter', 'fx', 'projectile', 'pickup']);
const ALWAYS_SOLID = new Set(['ship', 'asteroid', 'station', 'payload']);

function finiteBounds(bounds) {
  if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) return false;
  const nums = [...bounds.min, ...bounds.max];
  return nums.length >= 6 && nums.every((n) => Number.isFinite(n));
}

export function resolvePackage(relativeFile) {
  if (!relativeFile) {
    return {
      key: null,
      assetId: null,
      runtimeAssetId: null,
      sourceUrl: null,
      metadataUrl: null,
      contentHash: null,
      sourceExists: false,
      metadataExists: false,
      relativeFile: null,
    };
  }
  const relative = String(relativeFile).replace(/^assets\/ships\/release\/parts\//, '');
  const sourceUrl = `assets/ships/release/parts/${relative}`;
  const pilot = renderPackagePilotForSourceUrl(sourceUrl);
  const sourceExists = fs.existsSync(repoPath(sourceUrl));
  const metadataUrl = pilot ? pilot.metadataUrl : null;
  const metadataExists = metadataUrl ? fs.existsSync(repoPath(metadataUrl)) : false;
  return {
    key: pilot ? pilot.key : null,
    assetId: pilot ? pilot.assetId : null,
    runtimeAssetId: pilot ? pilot.runtimeAssetId : null,
    sourceUrl,
    metadataUrl,
    contentHash: pilot ? pilot.expectedContentHash : null,
    sourceExists,
    metadataExists,
    relativeFile: relative,
  };
}

function placeFile(entity) {
  const data = entity.data || {};
  const token = data.placeFile || data.placeId || data.archetypeGlb || data.landmarkGlb;
  if (!token) return null;
  const text = String(token);
  if (text.endsWith('.glb')) return text;
  return `places/${text}.glb`;
}

function censusRowFor(entity) {
  const data = entity.data || {};
  return modelTruthRow(data.defId)
    || modelTruthRow(data.placeId)
    || modelTruthRow(data.archetypeGlb)
    || modelTruthRowForEntity(entity)
    || null;
}

/**
 * Presented shield disc. While `entity.shield` is above zero the disc is the
 * live shell (`entity.radius`) unless a recorded disc or bubble scale
 * disagrees. A shield of 0 emits nothing, even if those leftovers are set.
 * A ship def shield stat is not a disc.
 */
export function presentedShieldDiscRadius(entity) {
  if (!entity) return null;
  const now = Number(entity.shield);
  if (!(Number.isFinite(now) && now > 0)) return null;
  if (Object.prototype.hasOwnProperty.call(entity, 'presentedShieldRadius')) {
    const recorded = Number(entity.presentedShieldRadius);
    if (Number.isFinite(recorded) && recorded > 0) return recorded;
  }
  const scale = entity.shieldBubble && entity.shieldBubble.scale;
  const measured = scale && typeof scale === 'object' ? Number(scale.x) : Number(scale);
  if (Number.isFinite(measured) && measured > 0) return measured;
  return liveShieldGeometryRadius(entity);
}

/**
 * Join one sim or authored entity to the production visual selector and the
 * render-package pilot. Does not load a GLB and does not draw.
 */
export function bindEntity(entity) {
  const data = entity.data || {};
  let relativeFile = null;
  let lodLevel = 'lod0';
  let required = false;

  if (entity.type === 'ship') {
    const visual = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
    relativeFile = visual && visual.file ? visual.file : null;
    required = requiresProductionWholeShipForEntity(entity) || !!(visual && visual.required);
    if (!WHOLE_SHIP_LOD_RUNTIME_DEMOTION) lodLevel = 'lod0';
    const lodged = wholeShipLodFileForEntity(entity, lodLevel, { requiredWholeShip: true });
    if (lodged) relativeFile = lodged;
  } else if (entity.type === 'payload') {
    relativeFile = authoredPayloadFileForEntity(entity);
    required = !!relativeFile;
  } else if (entity.authored === true) {
    relativeFile = placeFile(entity);
    required = entity.required !== false && !!relativeFile;
  } else {
    relativeFile = resolve19305CensusAEntityPackagedFile(entity) || placeFile(entity);
    required = !!relativeFile;
  }
  const identityOmitted = !relativeFile && entity.type !== 'ship';

  const pack = resolvePackage(relativeFile);
  const placeholder = !!(relativeFile && (
    String(relativeFile).startsWith('hulls/')
    || String(relativeFile).includes('/hulls/')
    || data.proceduralFallback === true
  ));
  const row = censusRowFor(entity);
  const colliderRadius = Number(entity.radius);
  const expectedRadius = modelTruthPlanarRadius({
    ...entity,
    radius: Number.isFinite(colliderRadius) ? colliderRadius : 0,
    pos: entity.pos || { x: 0, z: 0 },
    rot: entity.rot || 0,
  });
  // A missing draw measurement stays unmeasured. A presentedRadius that repeats
  // the expected keep-out is a copy unless the caller marked it measured.
  const rawPresented = Number(entity.presentedRadius);
  const keepOutCopy = Number.isFinite(rawPresented)
    && Number.isFinite(expectedRadius)
    && expectedRadius > 0
    && Math.abs(rawPresented - expectedRadius) <= 1e-6
    && entity.presentationSource !== 'measured';
  const measuredPresentation = Number.isFinite(rawPresented) && !keepOutCopy;
  const presentedRadius = Number.isFinite(rawPresented) ? rawPresented : null;
  const hull = Number(entity.hull);
  const hullMax = Number(entity.hullMax);
  const shield = Number(entity.shield);
  const shieldGeometryRadius = liveShieldGeometryRadius(entity);
  const shieldDiscRadius = presentedShieldDiscRadius(entity);
  const effects = [];
  if (shieldDiscRadius != null) {
    effects.push({
      kind: 'shield',
      radius: shieldDiscRadius,
      baseCoverage: 0.22,
      occludesContacts: false,
    });
  }
  if (Number.isFinite(hull) && Number.isFinite(hullMax) && hullMax > 0 && hull / hullMax < 0.5) {
    effects.push({
      kind: 'damage',
      radius: (Number.isFinite(colliderRadius) ? colliderRadius : 1) * 0.85,
      baseCoverage: 0.15,
      occludesContacts: false,
    });
  }

  const alive = entity.alive !== false;
  return {
    objectId: entity.objectId || (entity.authored ? `prop:${entity.authoredId || data.placeId}` : `entity:${entity.id}`),
    entityId: entity.id ?? null,
    alias: data.scenarioAlias || entity.alias || null,
    type: entity.type || 'prop',
    role: data.scenarioRole || entity.role || null,
    defId: data.defId || null,
    labProfile: data.labProfile || null,
    isPlayer: entity.isPlayer === true,
    alive,
    visible: entity.visible != null ? entity.visible !== false : alive,
    collidable: entity.collidable != null
      ? entity.collidable === true
      : defaultCollidable(entity, colliderRadius, alive),
    identityOmitted,
    depthTest: entity.depthTest !== false,
    renderOrder: Number.isFinite(entity.renderOrder)
      ? entity.renderOrder
      : (RENDER_ORDER[entity.type] || 16),
    pos: {
      x: entity.pos ? Number(entity.pos.x) : 0,
      z: entity.pos ? Number(entity.pos.z) : 0,
    },
    y: Number.isFinite(entity.y) ? entity.y : 0,
    rot: Number(entity.rot) || 0,
    colliderRadius: Number.isFinite(colliderRadius) ? colliderRadius : 0,
    shield: Number.isFinite(shield) ? shield : null,
    shieldGeometryRadius,
    expectedRadius: Number.isFinite(expectedRadius) ? expectedRadius : 0,
    presentedRadius,
    presentationSource: measuredPresentation ? 'measured' : 'unmeasured',
    hull: Number.isFinite(hull) ? hull : null,
    hullMax: Number.isFinite(hullMax) ? hullMax : null,
    lodLevel,
    lodRuntimeDemotion: WHOLE_SHIP_LOD_RUNTIME_DEMOTION === true,
    required,
    placeholder,
    boundsFinite: row ? finiteBounds(row.bounds) : true,
    censusId: row ? row.id : null,
    censusLodOverTolerance: !!(row && row.lod && row.lod.overTolerance === true),
    expectedFile: relativeFile,
    package: pack,
    effects,
    firstDrawMs: Number.isFinite(entity.firstDrawMs) ? entity.firstDrawMs : null,
    authored: entity.authored === true,
  };
}

function defaultCollidable(entity, radius, alive) {
  if (!alive || !Number.isFinite(radius) || radius <= 0) return false;
  if (NEVER_SOLID.has(entity.type)) return false;
  if (ALWAYS_SOLID.has(entity.type)) return true;
  // Drone, wreck, and beacon solidity depends on spawn flags the checkpoint omits.
  return false;
}

export function enemyByProfile(profileId) {
  return ENEMY_BY_ID.get(profileId) || null;
}

export function shipById(defId) {
  return SHIP_BY_ID.get(defId) || null;
}
