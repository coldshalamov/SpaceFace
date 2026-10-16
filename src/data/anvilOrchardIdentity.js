// Simulation-safe authored identity shared by normal admission and exact render-basis selection.
// This identifies source geometry; it grants no native motor or release authority.
import { ORCHARD_GEOMETRY as G, ORCHARD_FRAME_BODY_ID, ORCHARD_POD_BODY_ID, orchardFrameBodySpec, orchardPodBodySpec } from './anvilOrchardBody.js';

export const ORCHARD_FRAME_FILE = 'places/place_anvil_storm_orchard.glb';
export const ORCHARD_POD_FILE = 'places/place_anvil_condensate_pod.glb';
const frame = orchardFrameBodySpec(), pod = orchardPodBodySpec();
const transform = Object.freeze({ scale: 1, y: 0 });
function same(a,b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length && keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
}
function sourceBody(entity, canonical) {
  const b=entity?.physicsBody;
  return b && entity.radius===canonical.radius && b.radius===canonical.radius
    && b.mass===canonical.mass && b.inertiaY===canonical.inertiaY && b.shape==='compound'
    && b.useMeasuredSkin===false && b.material===canonical.material
    && Number.isSafeInteger(b.revision) && b.revision>=1
    && same(b.collisionProxyManifest,canonical.collisionProxyManifest);
}
export function isOrchardFrame(entity) {
  const d=entity?.data;
  return entity?.type==='wreck' && entity.alive!==false && d?.orchardId==='anvil_storm_orchard'
    && d.orchardKind==='frame' && d.worldRecordId===G.worldRecordId
    && d.placeId==='place_anvil_storm_orchard' && d.authoredAssetId===G.assetId
    && d.authoredPayloadAssetId===G.assetId && d.masslineTetherable===false
    && entity.physicsBody?.dynamic===false && sourceBody(entity,frame);
}
export function isOrchardPod(entity) {
  const d=entity?.data;
  return entity?.type==='payload' && entity.alive!==false && d?.orchardId==='anvil_storm_orchard'
    && d.orchardKind==='pod' && d.authoredAssetId===G.pod.assetId
    && d.authoredPayloadAssetId===G.pod.assetId
    && /^anvil_storm_orchard:[0-2]:[1-4]$/.test(d.worldRecordId||'')
    && d.identityKey===d.worldRecordId && typeof entity.physicsBody?.dynamic==='boolean'
    && sourceBody(entity,pod);
}
export function orchardPlaceTransform(entity) {
  return isOrchardFrame(entity) ? transform : null;
}

export function orchardCatalogRows(isPublished = () => false) {
  return [
    [G, ORCHARD_FRAME_FILE, ORCHARD_FRAME_BODY_ID, 'closed-rest'],
    [G.pod, ORCHARD_POD_FILE, ORCHARD_POD_BODY_ID, 'pod-rest'],
  ].map(([source, file, colliderId, referenceState]) => ({
    id: file.replace(/^places\//, '').replace(/\.glb$/, ''),
    assetId: source.assetId, family: 'anvil-orchard', file,
    fit: 'authored-origin', placeScale: 1, entityRadius: source.radius,
    colliderKind: 'compound', colliderId, referenceState,
    convexPartsWU: source.parts.map(({ id, points, minY, maxY }) => ({ id, points, minY, maxY })),
    sourceSha: G.sourceSha, sourceGlbPath: source.sourceGlbPath,
    sourceGlbSha256: source.sourceGlbSha256,
    solid: true, packagedLive: isPublished(file),
  }));
}
