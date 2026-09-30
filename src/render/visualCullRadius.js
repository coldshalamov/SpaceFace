// Drawn-envelope cull radius — hoisted out of renderer.js so the partsLibrary readable-glass
// mirror shares the same measurement as the renderer's own glass/cull decisions (the
// renderer→partsLibrary import direction forbids reaching back for it). Presence, not
// collision: a station's drawn envelope reaches data.dockRadius while entity.radius is only
// the small collision proxy, so a hull centred just off-screen still culls as the size it
// actually draws at.
import * as THREE from 'three';
import { entityPresenceRadius } from '../world/activityClassification.js';

const _drawnCullBox = new THREE.Box3();

/**
 * True drawn reach for an authored root that carries no authored visualBounds: measure the
 * real envelope once and cache it on userData. station_helios draws 549x420 WU half-extents
 * against a 90 WU dock radius, so collision-proxied radii hide limbs that are still on the
 * glass. The stamp mirrors cameraClearanceBoxForMesh — field equality, never a per-call
 * string. A pending substrate (authoredAssetState not yet 'authored*') must not define the
 * size, so callers only reach this once the authored body has landed.
 */
function drawnCullRadiusForMesh(mesh) {
  const data = mesh && mesh.userData;
  if (!data || mesh.isObject3D !== true || !_drawnCullBox) return 0;
  const assetState = data.authoredAssetState || '';
  const compositionId = data.authoredCompositionId || '';
  const lodLevel = data.wholeShipLodActiveLevel || '';
  const childCount = mesh.children ? mesh.children.length : 0;
  const cached = data.drawnCullRadius;
  if (cached && cached.assetState === assetState && cached.compositionId === compositionId
    && cached.lodLevel === lodLevel && cached.childCount === childCount) {
    return cached.radius;
  }
  _drawnCullBox.setFromObject(mesh);
  let radius = 0;
  if (!_drawnCullBox.isEmpty()) {
    const b = _drawnCullBox;
    const px = mesh.position ? mesh.position.x : 0;
    const pz = mesh.position ? mesh.position.z : 0;
    // Farthest XZ corner from the root's own position — the body may sit off-centre.
    radius = Math.max(
      Math.hypot(b.min.x - px, b.min.z - pz),
      Math.hypot(b.min.x - px, b.max.z - pz),
      Math.hypot(b.max.x - px, b.min.z - pz),
      Math.hypot(b.max.x - px, b.max.z - pz),
    );
  }
  const rec = cached || (data.drawnCullRadius = {});
  rec.assetState = assetState;
  rec.compositionId = compositionId;
  rec.lodLevel = lodLevel;
  rec.childCount = childCount;
  rec.radius = radius;
  return radius;
}

/** Use authored XZ bounds for view culling without changing gameplay/collision radius. */
export function entityVisualCullRadius(entity, mesh = null) {
  const presence = entityPresenceRadius(entity);
  const data = mesh && mesh.userData;
  const hull = data && data.hull;
  const bounds = hull && hull.userData && hull.userData.visualBounds
    || data && data.visualBounds;
  const size = bounds && bounds.size;
  if (Array.isArray(size)) {
    const x = Math.max(0, Number(size[0]) || 0);
    const z = Math.max(0, Number(size[2]) || 0);
    return Math.max(presence, Math.hypot(x, z) * 0.5);
  }
  if (data && String(data.authoredAssetState || '').startsWith('authored')) {
    return Math.max(presence, drawnCullRadiusForMesh(mesh));
  }
  return presence;
}
