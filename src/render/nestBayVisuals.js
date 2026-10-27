import * as THREE from 'three';

// Two bounded world-space targeting brackets, not a hole, collider or replacement model.
// They stay with the carrier when a physical bay plug is torn away.
export function attachNestBayIndicators(boundary, entity) {
  if (!boundary || entity?.type !== 'ship' || entity.data?.nestCarrier !== true
      || entity.data?.nestSlot !== 'carrier' || typeof entity.data?.nestEncounterId !== 'string'
      || !entity.data.nestEncounterId || boundary.userData.nestBayIndicators) return boundary;
  const owner = entity.data.nestEncounterId;
  const root = new THREE.Group();
  root.name = 'Nest_Bay_Target_Brackets';
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const bays = [];
  for (let i = 0; i < 2; i++) {
    const group = new THREE.Group();
    group.name = `Nest_Bay_${i}_Indicator`;
    const material = new THREE.MeshBasicMaterial({ color: 0xe5a541, toneMapped: false });
    const addBar = (x, z, length, angle, parent = group) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 0, z);
      mesh.scale.set(length, 0.6, 0.7);
      mesh.rotation.y = angle;
      parent.add(mesh);
      return mesh;
    };
    for (const x of [-8, 8]) for (const z of [-3, 3]) {
      addBar(x - Math.sign(x) * 1.5, z, 3, 0);
      addBar(x, z - Math.sign(z), 2, Math.PI / 2);
    }
    const sealed = new THREE.Group();
    sealed.name = 'Sealed_Cross';
    addBar(0, 0, 5, Math.PI / 4, sealed);
    addBar(0, 0, 5, -Math.PI / 4, sealed);
    group.add(sealed);
    const open = new THREE.Group();
    open.name = 'Open_Inward_Chevrons';
    for (const side of [-1, 1]) {
      addBar(side * 4, -1, 3, side * Math.PI / 4, open);
      addBar(side * 4, 1, 3, -side * Math.PI / 4, open);
    }
    group.add(open);
    root.add(group);
    bays.push({ group, sealed, open, material, lastOpen: null });
  }
  boundary.add(root);
  boundary.userData.nestBayIndicators = root;
  const previous = boundary.userData.updateRuntimeState;
  let hullBounds = boundary.userData.visualBounds;
  const bounds = { center: [0, 0, 0], size: [0, 0, 0] };
  let extentX = 9, extentZ = 13;
  const syncBounds = () => {
    for (let axis = 0; axis < 3; axis++) {
      const half = axis === 0 ? extentX : axis === 2 ? extentZ : 15;
      const center = Number(hullBounds?.center?.[axis]) || 0;
      const hullHalf = Math.max(0, Number(hullBounds?.size?.[axis]) || 0) / 2;
      const lo = Math.min(-half, center - hullHalf), hi = Math.max(half, center + hullHalf);
      bounds.center[axis] = (lo + hi) / 2;
      bounds.size[axis] = hi - lo;
    }
  };
  Object.defineProperty(boundary.userData, 'visualBounds', {
    configurable: true, enumerable: true, get: () => bounds,
    set: value => { if (value !== bounds) { hullBounds = value; syncBounds(); } },
  });
  boundary.userData.updateRuntimeState = (liveEntity, now) => {
    if (typeof previous === 'function') previous(liveEntity, now);
    const data = liveEntity?.data;
    root.visible = liveEntity?.alive !== false && data?.nestCarrier === true
      && data?.nestSlot === 'carrier' && data?.nestEncounterId === owner;
    if (!root.visible) return;
    extentX = 9; extentZ = 4;
    bays.forEach((bay, i) => {
      const off = data.nestBayOffsets?.[i];
      const valid = Number.isFinite(off?.dx) && Number.isFinite(off?.dz)
        && Math.abs(off.dx) <= 200 && Math.abs(off.dz) <= 200;
      bay.group.visible = valid;
      if (!valid) return;
      // An elevated target glyph stays readable above the released hull; it is not hardware.
      bay.group.position.set(off.dx, 14, off.dz);
      bay.group.updateMatrix();
      extentX = Math.max(extentX, Math.abs(off.dx) + 9);
      extentZ = Math.max(extentZ, Math.abs(off.dz) + 4);
      const open = data.nestBayStates?.[i] === true;
      if (bay.lastOpen !== open) {
        bay.sealed.visible = !open; bay.open.visible = open;
        bay.material.color.setHex(open ? 0xf4f5df : 0xe5a541);
        bay.group.userData.bayOpen = open;
        bay.lastOpen = open;
      }
    });
    syncBounds();
  };
  boundary.userData.updateRuntimeState(entity, 0);
  return boundary;
}
