// Read-only projection of the same manifest/socket owners consumed by worldSiteKernel
// and worldSiteRuntime. No replacement hull and no simulation state is created here.
import { CERES_SHIPBREAK_MANIFEST } from './ceresShipbreak.js';
import { worldSiteAssetBinding } from './worldSiteAssetBindings.js';

export function ceresShipbreakCollisionAuthority(placeId, manifest = CERES_SHIPBREAK_MANIFEST) {
  const rootId = CERES_SHIPBREAK_MANIFEST.visualRoot.placeId;
  const known = placeId === rootId || CERES_SHIPBREAK_MANIFEST.payloads.some(p => p.structural?.placeId === placeId);
  if (!known) return null;
  if (!manifest || manifest.id !== CERES_SHIPBREAK_MANIFEST.id
    || manifest.worldObjectId !== CERES_SHIPBREAK_MANIFEST.worldObjectId || manifest.visualRoot?.placeId !== rootId) {
    throw new Error(`${placeId}: missing or wrong world-site collision owner`);
  }
  const shell = placeId === rootId;
  const payload = shell ? null : manifest.payloads?.find(p => p.structural?.placeId === placeId);
  const stage = manifest.stages?.find(s => s.placeId === rootId);
  const binding = worldSiteAssetBinding(rootId);
  const scale = shell ? stage?.scale : payload?.structural?.placeScale;
  if (scale !== 2 || !binding || binding.visualCenterXZ.x !== 0 || binding.visualCenterXZ.z !== 0
    || !shell && payload.worldObjectId !== `${manifest.worldObjectId}/payload/${payload.id}`) {
    throw new Error(`${placeId}: missing or wrong authored origin/scale/body owner`);
  }
  const box = (id, x, z, hx, hz) => ({ id, kind: 'obb', x, z, hx, hz, rot: 0 });
  let bodies;
  if (shell) {
    if (!manifest.collisionProxies?.length) throw new Error(`${placeId}: missing native shell bodies`);
    bodies = manifest.collisionProxies.map(proxy => {
      const t = binding.sockets[proxy.anchorId]?.transform.translation;
      if (proxy.shape !== 'box' || proxy.bodyType !== 'solid' || !t) throw new Error(`${placeId}: unsupported native shell owner`);
      const worldRecordId = `${manifest.worldObjectId}/collision/${proxy.id}`;
      return { worldRecordId, colliderId: `world-site-proxy:${worldRecordId}`, dynamic: false,
        primitives: [box('shell', (t[0] + proxy.offset.x) * scale, (t[2] + proxy.offset.z) * scale,
          proxy.halfExtents.x * scale, proxy.halfExtents.z * scale)] };
    });
  } else {
    const s = payload.structural;
    bodies = [{ worldRecordId: payload.worldObjectId, colliderId: `world-site-structure:${payload.worldObjectId}`,
      dynamic: true, primitives: (s.boxes || [{ x: 0, z: 0, halfX: s.halfX, halfZ: s.halfZ }])
        .map((b, i) => box(`matched-section-${i}`, b.x, b.z, b.halfX, b.halfZ)) }];
  }
  if (new Set(bodies.map(b => b.worldRecordId)).size !== bodies.length || bodies.some(b => !b.primitives.length
    || b.primitives.some(p => ![p.x, p.z, p.hx, p.hz].every(Number.isFinite) || p.hx <= 0 || p.hz <= 0))) {
    throw new Error(`${placeId}: invalid native body geometry`);
  }
  return { manifestId: manifest.id, placeId, scale, origin: [0, 0, 0],
    geometrySpace: 'asset-local-XZ-WU', certificatePart: shell ? 'shell' : payload.id,
    referenceState: shell ? 'stripped-shell' : 'released',
    stateScope: shell ? 'five separate fixed collision bodies; visual root has no collider'
      : 'one independently owned section; mounted/supported is fixed, released unsupported is dynamic; local geometry unchanged',
    bodies };
}
