import * as THREE from 'three';
import { loadAuthoredPart } from './assetLoader.js';
import { getAssetResidency } from './assetResidency.js';
import { isReleaseAssetMode } from './releaseMode.js';
import { createAsyncAdmission } from './asyncAdmission.js';
import { readLineVisualProfile } from './lineVisualProfile.js';

// Existing authored cable drum and bolted repair plates. No stand-in geometry or second ship builder.
export const LINE_HARDWARE_PARTS = Object.freeze([
  'works/place_works_massline_core.glb', 'pods/pod_repair_patch.glb',
]);
const PAD_POSITIONS = Object.freeze([
  [-.24, .13, -.34], [-.24, .13, .34], [.12, .14, -.31], [.12, .14, .31], [-.48, .16, 0],
]);

export function lineHardwarePart(record, name, materials) {
  const root = new THREE.Group(); root.name = name;
  for (const primitive of record?.primitives || []) {
    if (/^LOD[1-9]/i.test(primitive.name || '')) continue;
    const source = Array.isArray(primitive.material) ? primitive.material : [primitive.material];
    const owned = source.map(material => {
      const clone = material.clone(); materials.push(clone); return clone;
    });
    const mesh = new THREE.Mesh(primitive.geometry, Array.isArray(primitive.material) ? owned : owned[0]);
    mesh.name = primitive.name || name;
    primitive.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = false; mesh.receiveShadow = true;
    root.add(mesh);
  }
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root), size = new THREE.Vector3(), center = new THREE.Vector3();
  bounds.getSize(size); bounds.getCenter(center);
  const span = Math.max(size.x, size.y, size.z) || 1;
  for (const mesh of root.children) mesh.position.sub(center);
  root.scale.setScalar(1 / span);
  return root;
}

/** A single player-owned visual rig. Leases and pending admissions die with this owner. */
export function createLineHardware(state, options = {}) {
  const admission = createAsyncAdmission({ label: 'line-class-hardware', timeoutMs: 120000 });
  const renderer = state?.render?.renderer;
  const owner = Object.freeze({ type: 'line-hardware' });
  const materials = [], scratch = {}, hot = new THREE.Color(0xff521c), classColor = new THREE.Color();
  let disposed = false, parent = null, attached = false, lastClass = 0, lastHeadKey = null;
  const root = new THREE.Group(); root.name = 'LineClassHardware'; root.visible = false;
  const headMount = new THREE.Group(); headMount.position.set(-.18, .20, 0); root.add(headMount);
  const padMounts = PAD_POSITIONS.map((position, i) => {
    const group = new THREE.Group(); group.name = `LineAnchorPad_${i}`; group.position.fromArray(position); root.add(group); return group;
  });
  const load = options.loadPart || (file => loadAuthoredPart(
    `${isReleaseAssetMode() ? 'assets/ships/release/parts/' : 'assets/ships/parts/'}${file}`,
    { renderer, optional: true, residencyOwner: owner, isResidencyOwnerActive: () => !disposed, signal: admission.signal }));
  const ready = (async () => {
    try {
      const records = await admission.wait(Promise.all(LINE_HARDWARE_PARTS.map(load)));
      admission.assertActive();
      if (!records[0] || !records[1]) return false;
      headMount.add(lineHardwarePart(records[0], 'LineWinchHead', materials));
      for (const mount of padMounts) mount.add(lineHardwarePart(records[1], mount.name + '_plate', materials));
      // The real renderer's residency and compile lanes own admission before this rig is revealed.
      if (typeof state?.render?.prepareAuthoredGpuResidency === 'function') {
        await admission.wait(state.render.prepareAuthoredGpuResidency(root));
      }
      if (typeof state?.render?.compileObjectPipelines === 'function') {
        await admission.wait(state.render.compileObjectPipelines(root, { debugBy: 'line-class-hardware', signal: admission.signal }));
      }
      admission.assertActive(); attached = true; return true;
    } catch (error) {
      if (!disposed) console.warn('[lineHardware] authored hardware admission failed', error?.message || error);
      return false;
    } finally { admission.finish(); }
  })();
  return {
    root, ready,
    update(player) {
      if (disposed) return false;
      const shipRoot = player?.alive !== false && (player?.view?.root || player?.mesh);
      // ShipKit keeps the pose boundary unscaled; its canonical hull child owns radius,
      // banking and pitch. Mount in that normalized hull space with the authored fittings.
      const target = shipRoot && (shipRoot.userData?.hull || shipRoot);
      if (!target || !attached) { root.visible = false; return false; }
      if (parent !== target) { root.removeFromParent(); target.add(root); parent = target; }
      readLineVisualProfile(state, scratch);
      root.visible = true;
      headMount.scale.setScalar(scratch.headScale);
      for (let i = 0; i < padMounts.length; i++) {
        padMounts[i].visible = i < scratch.padCount;
        padMounts[i].scale.setScalar(scratch.padScale);
      }
      const headKey = scratch.headId ? `${scratch.headId}:${scratch.headMark || ''}` : '';
      if (lastClass !== scratch.classIndex || lastHeadKey !== headKey) {
        root.userData.lineClass = scratch.label;
        headMount.userData.winch = scratch.hardware.winch;
        // Row 500 — the rim mark shows on the hull part: a fitted §7.1 head tints the
        // head hardware's rim emissive by its provenance mark, falling back to the
        // head's authored colour, then the class colour.
        classColor.set(scratch.markColor ?? scratch.headColor ?? scratch.color);
        lastClass = scratch.classIndex; lastHeadKey = headKey;
      }
      // Only private cloned materials change; cached hull/part materials retain their authored finish.
      for (const material of materials) {
        if (!material.emissive) continue;
        material.emissive.copy(classColor).lerp(hot, scratch.heat);
        material.emissiveIntensity = .12 + scratch.heat * 1.1;
      }
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true; admission.abort('line hardware disposed'); admission.finish();
      root.removeFromParent(); root.clear();
      for (const material of materials) material.dispose(); materials.length = 0;
      getAssetResidency(renderer)?.releaseOwner(owner, 'line-hardware-disposed');
    },
  };
}
