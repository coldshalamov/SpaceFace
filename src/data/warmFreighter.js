import { SHIPS } from './ships.js';
import { modelTruthProxyManifest, modelTruthRow, modelTruthSkinHull } from './modelTruth.js';

const mule = SHIPS.find(ship => ship.id === 'ship_mule');
// Shipped Mule package bounds, asset space; visualFactory.fitPackagedGroup recenters
// this box and fits its longest side to twice the actual wreck radius.
export const WARM_FREIGHTER_HOST = Object.freeze({
  siteId: 'warm_freighter', sectorId: 'sector_charon_expanse',
  markerId: 'aft_site_warm_freighter', center: Object.freeze({ x: -2200, z: 900 }),
  defId: mule.id, radius: mule.collisionRadius, mass: mule.mass, rot: 0,
  assetId: 'SF_MULE_PRODUCTION_V1', file: 'wholeships/mule_production_v1.glb',
  releaseHash: '39d4e8f04e22cdaa94b1f7ceaeb365438620c9b183dac234478835df940c9b62',
  assetCenter: Object.freeze({ x: -0.045011043548583984, y: 0.6131212214198348, z: 0 }),
  assetSize: Object.freeze({ x: 16.15002155303955, y: 3.325398513654635, z: 6.924716646249931 }),
});

export function warmFreighterWorldScale(radius = WARM_FREIGHTER_HOST.radius) {
  return Number.isFinite(radius) && radius > 0 ? radius * 2 / WARM_FREIGHTER_HOST.assetSize.x : null;
}

export function warmFreighterAssetToLocal(point, radius = WARM_FREIGHTER_HOST.radius) {
  const scale = warmFreighterWorldScale(radius), center = WARM_FREIGHTER_HOST.assetCenter;
  if (scale == null || ![point?.x, point?.y, point?.z].every(Number.isFinite)) return null;
  return { x: (point.x - center.x) * scale, y: (point.y - center.y) * scale, z: (point.z - center.z) * scale };
}

// The census hull is in the live ship's radius frame. Recenter and fit that same
// measured outline to the packaged wreck's 2R render fit, as the shipbreaking
// yard does for its packaged bodies. This is one body, never a second wreck owner.
let fittedMuleCollision = null;
export function warmFreighterCollisionModel() {
  if (fittedMuleCollision) return fittedMuleCollision;
  const row = modelTruthRow(WARM_FREIGHTER_HOST.defId);
  const measured = modelTruthProxyManifest({ type: 'ship', radius: WARM_FREIGHTER_HOST.radius,
    data: { defId: WARM_FREIGHTER_HOST.defId } });
  const hull = row && modelTruthSkinHull(row);
  if (!row || !measured || !Array.isArray(hull) || hull.length < 3) {
    throw new Error('Warm Freighter requires the measured Mule collision hull');
  }
  const reference = row.gameplay?.entityRadius || row.shell?.silhouetteRadius || 1;
  const dimensions = row.worldSize || row.bounds?.size;
  const envelope = Math.max(...(dimensions || [reference * 2]));
  const scale = reference * 2 / Math.max(envelope, .001);
  const center = row.bounds?.center || [0, 0, 0];
  const drawScale = Number.isFinite(row.drawScale) ? row.drawScale : 1;
  const offsetX = center[0] * drawScale / reference, offsetZ = center[2] * drawScale / reference;
  const point = p => ({ x: (p.x - offsetX) * scale, z: (p.z - offsetZ) * scale });
  const primitives = measured.primitives.map(p => {
    if (p.kind === 'capsule') return { ...p, ax: (p.ax - offsetX) * scale,
      az: (p.az - offsetZ) * scale, bx: (p.bx - offsetX) * scale,
      bz: (p.bz - offsetZ) * scale, r: p.r * scale };
    return { ...p, ...point(p), ...(p.kind === 'circle' ? { r: p.r * scale }
      : { hx: p.hx * scale, hz: p.hz * scale }) };
  });
  const compactHull = hull.map(point);
  // Same uniform-area polar moment used by the measured ship hull policy,
  // about the body's existing origin; radius converts normalized points to WU.
  let twiceArea = 0, polarMomentTimes12 = 0;
  for (let i = 0; i < compactHull.length; i++) {
    const a = compactHull[i], b = compactHull[(i + 1) % compactHull.length];
    const cross = a.x * b.z - b.x * a.z;
    twiceArea += cross;
    polarMomentTimes12 += cross * (a.x * a.x + a.x * b.x + b.x * b.x
      + a.z * a.z + a.z * b.z + b.z * b.z);
  }
  const inertiaPerMassRadiusSquared = polarMomentTimes12 / (6 * twiceArea);
  if (!(inertiaPerMassRadiusSquared > 0) || !Number.isFinite(inertiaPerMassRadiusSquared)) {
    throw new Error('Warm Freighter measured hull has invalid inertia');
  }
  fittedMuleCollision = {
    manifest: { ...measured, id: 'warm-freighter:mule:packaged-fit-v1',
      referenceRadius: 'radius', primitives, compactHull },
    inertiaPerMassRadiusSquared,
  };
  return fittedMuleCollision;
}
