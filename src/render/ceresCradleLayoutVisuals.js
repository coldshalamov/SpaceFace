// Presentation-only keeper mask. Native physics selects the accepted layout; no
// entity/save field is evidence that a nine- or eleven-proxy body was accepted.
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';

export const CERES_CRADLE_KEEPER_HOOK = 'HOOK_CERES_DEPTH_KEEPER';
const KEEPER_NODE = /^(?:Place_)?(LOD([012])_HOOK_CERES_DEPTH_KEEPER_(Armor|BrushedMetal|Warning))$/;
const KEEPER_ANCHOR = /^Place_(LOD[012]_HOOK_CERES_DEPTH_KEEPER_(?:Armor|BrushedMetal|Warning))_Anchor$/;
const pooled = node => node?.isInstancedMesh === true || node?.isBatchedMesh === true
  || !!node?.userData?.spacefaceInstanceProxy || node?.userData?.spacefaceInstancePoolKey != null
  || node?.userData?.spacefaceInstancePoolSlot != null || node?.userData?.spacefaceInstancePoolChunk != null;
function keeperAnchorMatches(anchor, mesh, canonicalName) {
  return anchor?.isObject3D === true && !anchor.isMesh && !pooled(anchor)
    && anchor.name === `Place_${canonicalName}_Anchor`
    && anchor.children.length === 1 && anchor.children[0] === mesh
    && mesh?.isMesh === true && mesh.name === `Place_${canonicalName}`;
}
const LODS = ['lod0', 'lod1', 'lod2'];

/** @param {'open-v1'|'keepers-v2'|null} acceptedLayout */
export function ceresCradleKeeperVisible(acceptedLayout, nodeLod, activeLod) {
  return acceptedLayout === 'keepers-v2' && LODS.includes(activeLod) && nodeLod === activeLod;
}

// Bind exactly the sealed, unpooled mesh bank once. Materials and geometries stay
// untouched: one legacy instance must never hide a current sibling's hardware.
export function createCeresCradleKeeperMask(root, entity) {
  if (!root || ceresWorkfleetRoleForEntity(entity) !== 'cradle') return null;
  const meshes = [], names = new Set();
  let valid = true;
  root.traverse(node => {
    if (!String(node.name || '').includes(CERES_CRADLE_KEEPER_HOOK)) return;
    // The direct-source composer gives dedicated meshes a Place_ label and one
    // transform anchor. Package instances retain their exact source names. Only
    // that sanctioned wrapper is ignored; arbitrary keeper-named groups fail.
    const anchor = KEEPER_ANCHOR.exec(node.name);
    if (anchor && keeperAnchorMatches(node, node.children[0], anchor[1])) return;
    const match = KEEPER_NODE.exec(node.name), tags = node.userData?.spacefaceTags;
    const canonicalName = match?.[1], sourceWrapped = node.name.startsWith('Place_');
    if (!match || !node.isMesh || tags?.instance !== false || pooled(node)
      || names.has(canonicalName) || tags.lod !== `lod${match[2]}`
      || (sourceWrapped && (node.userData.keepSeparate !== true
        || !keeperAnchorMatches(node.parent, node, canonicalName)))) valid = false;
    names.add(canonicalName);
    meshes.push({ node, lod: match ? `lod${match[2]}` : null });
    node.visible = false;
  });
  valid = valid && meshes.length === 9 && names.size === 9;
  let disposed = false;
  return {
    valid,
    apply(acceptedLayout, activeLod = root.userData.authoredLod || 'lod0') {
      const ready = !disposed && valid && (acceptedLayout === 'open-v1' || acceptedLayout === 'keepers-v2')
        && LODS.includes(activeLod);
      for (const {node, lod} of meshes) node.visible = ready
        && ceresCradleKeeperVisible(acceptedLayout, lod, activeLod);
      return ready;
    },
    dispose() {
      disposed = true;
      for (const {node} of meshes) node.visible = false;
    },
  };
}

import { readCeresCradleLayout, canPublishCeresCradleLayout } from '../core/ceresWorkfleetLayoutAdmission.js';
import { recordCeresCradleAuthoredLayout } from '../core/machineryPresentation.js';

// This root-local closure uses the existing boundary lifetime. There is no ID
// lookup, scene registry, per-frame traversal, or renderer-owned gameplay fact.
export function installCeresCradleLayoutGuard(root, entity, boundary) {
  const mask = createCeresCradleKeeperMask(root, entity);
  if (!mask) return null;
  if (!mask.valid) {
    mask.dispose();
    root.userData.detachAuthoredMotion?.();
    throw new Error('Ceres cradle is missing its sealed nine-mesh keeper bank');
  }
  let owner = entity, life = entity.occupantGeneration, state;
  let published = false, disposed = false;
  const id = entity.id, worldRecordId = entity.data.worldRecordId;
  const priorLod = root.userData.updateLod, priorDetach = root.userData.detachAuthoredMotion;
  const currentOwner = (liveEntity, liveState) => !disposed && liveEntity === owner
    && Number.isSafeInteger(life) && life === liveEntity?.occupantGeneration
    && liveEntity.alive !== false && liveEntity.id === id
    && liveEntity.data?.worldRecordId === worldRecordId
    && ceresWorkfleetRoleForEntity(liveEntity) === 'cradle'
    && (!liveState || liveState.entities?.get(id) === liveEntity);
  const selected = (liveEntity, liveState) => currentOwner(liveEntity, liveState)
    && canPublishCeresCradleLayout(liveEntity, liveState)
    ? readCeresCradleLayout(liveEntity, liveState) : null;
  const prepare = (liveEntity = owner, liveState = state) => {
    const layout = selected(liveEntity, liveState);
    if (!mask.apply(layout)) { root.visible = false; return false; }
    return true;
  };
  const refresh = (liveEntity = owner, liveState = state) => {
    state = liveState;
    const ready = prepare(liveEntity, liveState);
    root.visible = published && ready && liveState?.render?.contextRecovery?.pending !== true;
    if (root.visible) recordCeresCradleAuthoredLayout(boundary, liveEntity, liveState,
      readCeresCradleLayout(liveEntity, liveState));
    return ready;
  };
  const publish = (liveEntity = owner, liveState = state) => {
    if (!prepare(liveEntity, liveState) || liveState?.render?.contextRecovery?.pending === true) return false;
    if (!recordCeresCradleAuthoredLayout(boundary, liveEntity, liveState,
      readCeresCradleLayout(liveEntity, liveState))) return false;
    published = true; state = liveState; root.visible = true; return true;
  };
  const rebind = (liveEntity, liveState) => {
    // Only a successful renderer bind may transfer a retained root to a new life.
    // An arbitrary same-ID callback cannot borrow its predecessor's selected layout.
    let inside = false;
    for (let n = root; n; n = n.parent) if (n === boundary) { inside = true; break; }
    if (disposed || !inside || liveState?.entities?.get(id) !== liveEntity
      || liveEntity?.mesh !== boundary || liveEntity.id !== id
      || liveEntity.data?.worldRecordId !== worldRecordId
      || !Number.isSafeInteger(liveEntity.occupantGeneration)
      || ceresWorkfleetRoleForEntity(liveEntity) !== 'cradle') {
      mask.apply(null); root.visible = false; return false;
    }
    owner = liveEntity; life = liveEntity.occupantGeneration; state = liveState;
    return refresh(liveEntity, liveState);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true; published = false; mask.dispose(); root.visible = false;
    priorDetach?.();
  };
  root.userData.updateLod = level => { priorLod?.(level); refresh(); };
  root.userData.detachAuthoredMotion = dispose;
  root.userData.ceresCradleLayoutGuard = {prepare, publish, refresh, rebind, dispose};
  root.visible = false;
  prepare();
  return root.userData.ceresCradleLayoutGuard;
}
