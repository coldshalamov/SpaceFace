import { ORCHARD_GEOMETRY as G } from '../data/anvilOrchardBody.js';
import { isOrchardFrame, ORCHARD_FRAME_FILE } from '../data/anvilOrchardIdentity.js';
import { readOrchardNativePose } from '../core/physics.js';

const visualOwners = new WeakMap();

function sourceMatches(source) {
  return source?.assetId === G.assetId && source.file === `assets/ships/release/parts/${ORCHARD_FRAME_FILE}`
    && source.sourceSha === G.sourceSha && source.sourceGlbSha256 === G.sourceGlbSha256;
}

export function recordOrchardAuthoredSource(root, entity, record) {
  const bank = record?.motionBank?.bank;
  if (!isOrchardFrame(entity) || record?.assetId !== G.assetId
    || record.metadata?.authoringSourceSha256 !== G.sourceSha
    || bank?.sourceAssetId !== G.assetId || bank.sourceGlbSha256 !== G.sourceGlbSha256) return false;
  const source = { assetId: record.assetId, file: record.url, sourceSha: G.sourceSha, sourceGlbSha256: bank.sourceGlbSha256 };
  if (!sourceMatches(source)) return false;
  root.userData.orchardAuthoredSource = Object.freeze(source);
  return true;
}

function inside(node, ancestor, requireVisible = true) {
  for (let n = node; n; n = n.parent) {
    if (requireVisible && n.visible === false) return false;
    if (n === ancestor) return true;
  }
  return false;
}

// Only the current native reader supplies authority. Tick fields describe that
// receipt; they are never compared with a render clock or used to advance a pose.
function supportedNativePose(pose) {
  if (!Object.isFrozen(pose) || pose?.sourceSha !== G.sourceSha
    || !Number.isSafeInteger(pose.bindingRevision) || pose.bindingRevision < 1
    || !Array.isArray(pose.progress) || !Object.isFrozen(pose.progress) || pose.progress.length !== 3
    || pose.progress.some(value => !Number.isInteger(value) || value < 0 || value > 30)) return false;
  if (pose.kind === 'pose-only') return pose.completedNativeTick === null;
  return pose.kind === 'completed-step' && pose.provenance === 'native-tail'
    && Number.isSafeInteger(pose.poseRevision) && pose.poseRevision > 0
    && Number.isSafeInteger(pose.completedNativeTick) && pose.completedNativeTick > 0
    && Number.isSafeInteger(pose.canonicalTick) && pose.canonicalTick >= 0;
}

// The bank contains rest transforms only. This runs after its update and presents
// the exact current native pose, with no interpolation or release-ready claim.
export function createOrchardVisualDriver(root, entity) {
  if (!isOrchardFrame(entity) || !Number.isSafeInteger(entity.occupantGeneration) || entity.occupantGeneration < 1
    || !sourceMatches(root?.userData?.orchardAuthoredSource)) return null;
  const nodes = new Map();
  root.traverse(node => {
    if (!G.rigs.some(rig => rig.node === node.name)) return;
    if (nodes.has(node.name)) throw new Error(`Duplicate Orchard source pivot ${node.name}`);
    nodes.set(node.name, node);
  });
  const rigs = G.rigs.map(rig => {
    const node = nodes.get(rig.node);
    if (!node || node.position.toArray().some((v, i) => Math.abs(v - rig.pivotGltf[i]) > 1e-6)
      || node.scale.toArray().some(v => v !== 1)) throw new Error(`Invalid Orchard source pivot ${rig.node}`);
    return { rig, node };
  });
  // A same-root replacement retires the previous driver before sampling rest.
  // Its suspended native read is fenced from all successor pose writes/cleanup.
  visualOwners.get(root)?.dispose();
  for (const entry of rigs) { entry.rest = entry.node.quaternion.clone(); entry.visible = entry.node.visible; }
  const id = entity.id, life = entity.occupantGeneration;
  let retired = false;
  const lease = {}, owns = () => visualOwners.get(root) === lease;
  const withdraw = () => {
    if (!owns()) return;
    for (const { node, rest } of rigs) { node.quaternion.copy(rest); node.visible = false; node.updateMatrix(); }
    delete root.userData.orchardNativePose;
  };
  const dispose = () => {
    if (retired) return;
    retired = true;
    if (!owns()) return;
    for (const { node, rest, visible } of rigs) { node.quaternion.copy(rest); node.visible = visible; node.updateMatrix(); }
    delete root.userData.orchardNativePose;
    visualOwners.delete(root);
  };
  lease.dispose = dispose;
  visualOwners.set(root, lease);
  withdraw();
  return {
    motionPadSpec: [{ nodes: rigs.map(r => r.node), chordFactor: Math.SQRT2, tMax: 0 }],
    // Only the renderer's successful explicit bind may transfer a retained
    // authored graph. Ordinary updates must keep rejecting replacement lives.
    rebind(live, state) {
      const mesh = live?.mesh, scene = state?.render?.scene, stamp = mesh?.userData;
      if (retired || !owns() || !isOrchardFrame(live)
        || !Number.isSafeInteger(live.occupantGeneration) || live.occupantGeneration < 1
        || state?.entities?.get(live.id) !== live || !sourceMatches(root.userData.orchardAuthoredSource)
        || stamp?.presentationEntityId !== live.id || stamp.presentationEntityType !== live.type
        || stamp.presentationOccupantGeneration !== live.occupantGeneration
        || !scene || !inside(root, mesh, false) || !inside(root, scene, false)) return null;
      if (live.id === id && live.occupantGeneration === life) return this;
      // Replacement retires this lease before reading rest transforms. Any
      // suspended predecessor read then cannot hide or erase the successor.
      return createOrchardVisualDriver(root, live);
    },
    update(live, now, a11y, state) {
      if (retired) return;
      const render = state?.render, scene = render?.scene, mesh = live?.mesh;
      const entities = state?.entities, source = root.userData.orchardAuthoredSource;
      const current = () => !retired && owns() && live?.id === id && live.occupantGeneration === life
        && state?.entities === entities && entities?.get(id) === live && isOrchardFrame(live)
        && root.userData.orchardAuthoredSource === source && sourceMatches(source)
        && state.render === render && render?.scene === scene && live.mesh === mesh
        && !!scene && inside(root, mesh) && inside(root, scene);
      const pose = current() ? readOrchardNativePose(state, live) : null;
      // Native access can re-enter lifecycle code. Never write a current-world
      // receipt into a scene or occupant that stopped owning this draw meanwhile.
      if (!current() || !supportedNativePose(pose)) { withdraw(); return; }
      for (const { node, rest, visible, rig } of rigs) {
        node.quaternion.copy(rest);
        node.rotateY(rig.yawSign * pose.progress[rig.socket] * Math.PI / 60);
        node.visible = visible;
        node.updateMatrix();
      }
      root.userData.orchardNativePose = pose;
    },
    dispose,
  };
}
