import * as THREE from 'three';
import { BAY_SLOTS, stationBayPose, stationLifeElapsed } from '../data/stationLife.js';

/** Two apron transfer craft borrow the already admitted Forge blueprint and its GPU resources. */
export function createStationBayTraffic(record, makeGroup, place) {
  if (!record) return null;
  const poses = BAY_SLOTS.map(() => ({}));
  const roots = BAY_SLOTS.map(slot => {
    const root = new THREE.Group();
    root.name = `StationBay_${slot.id}`;
    const hull = makeGroup(record, `${root.name}_hull`);
    place(hull, { fit: slot.fit, at: [0, 0, 0], sit: 'centre' });
    hull.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; } });
    root.add(hull);
    root.visible = false;
    return root;
  });
  return {
    roots,
    update(clock, nowMs, motion = true) {
      const seconds = stationLifeElapsed(clock, nowMs);
      for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        if (!clock) { root.visible = false; continue; }
        // Reduced-motion keeps the port populated without travel across the picture.
        const pose = stationBayPose(motion ? seconds : BAY_SLOTS[i].offset + 16, BAY_SLOTS[i], poses[i]);
        root.visible = pose.visible;
        root.position.set(pose.x, pose.y, pose.z);
        root.rotation.y = pose.yaw;
      }
    },
  };
}
