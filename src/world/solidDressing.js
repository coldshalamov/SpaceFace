// Solid dressing: measured-truth solidity for the ambient world.
//
// Dressing-table rows and presentation fx are deliberately not entities (the PQ-020 census
// contract keeps ambient props out of entityList), so they never had physics bodies — ships
// flew straight through dead hulks, barges, billboard frames, and landmark structures. This
// module decides, per authored place, whether the thing the player sees is a physical object,
// and sizes its collider from the model-truth census (scripts/model-truth-census.mjs →
// modelTruthCensus.json) so the collider matches the drawn model exactly: renderer draw scale
// and measured-skin scale are both `entity.radius / census.entityRadius` (mountDrawScale vs
// scaleProxyPrimitives), so a solid row's collider silhouette equals its drawn silhouette at
// any authored radius.
//
// Rows flagged solid here are plain data on the dressing row (collides + authored fixed-body
// spec + data.collisionProxy = 'skin:<row>'). The physics system folds collidable rows into
// its SG-02 static layer and projectile broadphase via dressingStaticLayerFor — without
// entityList membership, index churn, or save-schema changes.

import { modelTruthRow } from '../data/modelTruth.js';
import { ensureDressingTable } from './dressingTable.js';

// Below this the drawn object is smaller than the smallest craft hull — colliding it would
// put an invisible keep-out wall around a light pin a pilot can barely see.
const MIN_SOLID_SILHOUETTE_WU = 4;

/**
 * Census-driven solidity plan for an authored place, or null when the place stays a ghost.
 * `radius` is the row/entity radius the renderer will draw at; `placeTargetRadius` (POI
 * draws) pins the drawn size to an explicit diameter instead, so the plan derives the
 * effective draw scale from the census-authored X extent for those.
 *
 * Returns { collisionProxy, radius, silhouetteWu, drawScale } where `radius` is the body
 * radius that makes the measured skin's world scale reproduce the drawn scale exactly.
 */
export function solidDressingPlanFor(placeId, { radius = 0, placeTargetRadius = 0 } = {}) {
  if (typeof placeId !== 'string' || !placeId) return null;
  const row = modelTruthRow(placeId);
  const skin = row && row.proposedSkin;
  if (!skin || skin.adopted !== true || !Array.isArray(skin.primitives) || !skin.primitives.length) {
    return null;
  }
  const gameplay = row.gameplay || {};
  const reference = Number(gameplay.entityRadius) || 0;
  const silhouette = Number(row.shell && row.shell.silhouetteRadius) || 0;
  if (!(reference > 0) || !(silhouette > 0)) return null;
  let drawScale;
  const target = Number(placeTargetRadius) || 0;
  if (target > 0) {
    // POI draw path (resolvePlaceDrawScale poi branch): the model is fitted to
    // placeTargetRadius against its authored extent, not to radius/entityRadius.
    const extentX = Array.isArray(row.bounds && row.bounds.size) ? Number(row.bounds.size[0]) || 0 : 0;
    if (!(extentX > 0)) return null;
    drawScale = (target * 2) / extentX;
  } else {
    const live = Number(radius) || 0;
    if (!(live > 0)) return null;
    drawScale = live / reference;
  }
  const silhouetteWu = silhouette * drawScale;
  if (!(silhouetteWu >= MIN_SOLID_SILHOUETTE_WU)) return null;
  return {
    collisionProxy: `skin:${placeId}`,
    radius: reference * drawScale,
    silhouetteWu,
    drawScale,
  };
}

/**
 * Stamp a solid plan onto a dressing/spec data object. Returns the plan, or null when the
 * place stays non-physical (no census row, unadopted skin, or sub-floor silhouette).
 */
export function stampSolidDressing(data, options = {}) {
  if (!data || typeof data !== 'object') return null;
  const plan = solidDressingPlanFor(data.placeId, options);
  if (plan) data.collisionProxy = plan.collisionProxy;
  return plan;
}

// Folded static-layer version: any dressing change or entity-static change forces one
// reconcile. Entity static versions count plain layer touches per session; dressing versions
// count row inserts/drops/pose writes — both stay far below the span in practice.
const DRESSING_VERSION_SPAN = 0x2000000; // 2^25

const LAYER_CACHE = new WeakMap(); // dressing table -> { dressingVersion, baseVersion, statics, staticVersion }

export function dressingStaticVersion(state, baseVersion = 0) {
  const table = ensureDressingTable(state);
  return table.version * DRESSING_VERSION_SPAN + Math.max(0, baseVersion | 0);
}

/**
 * The SG-02/projectile static layer: the entity statics plus every collidable dressing row,
 * cached until either membership version changes. Returns the cached array (do not mutate)
 * and its folded static version for the owner's reconcile gate.
 */
export function dressingStaticLayerFor(state, baseStatics = [], baseVersion = 0) {
  const table = ensureDressingTable(state);
  const base = Math.max(0, baseVersion | 0);
  let cache = LAYER_CACHE.get(table);
  if (!cache || cache.dressingVersion !== table.version || cache.baseVersion !== base) {
    const statics = Array.isArray(baseStatics) ? baseStatics.slice() : [];
    for (const row of table.rows) {
      if (row && row.alive !== false && row.collides === true && row.physicsBody !== false) {
        statics.push(row);
      }
    }
    cache = {
      dressingVersion: table.version,
      baseVersion: base,
      statics,
      staticVersion: table.version * DRESSING_VERSION_SPAN + base,
    };
    LAYER_CACHE.set(table, cache);
  }
  return cache;
}
