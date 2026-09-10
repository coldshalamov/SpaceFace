import * as THREE from 'three';
import { WEB_DEF_ID, WEB_LIMITS } from '../../combat/tetherWebs.js';

const SEGMENTS = 10;
const UP = new THREE.Vector3(0, 1, 0);

/** Actual Snarl constraints rendered as braided, tension-shaped cables. No inferred links. */
export class TetherWebFx {
  constructor(scene, toLocalXZ) {
    this.localize = toLocalXZ;
    this.geometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1, false);
    this.material = new THREE.MeshStandardMaterial({ color: 0x9bebe4, emissive: 0x227d86,
      emissiveIntensity: 2.2, metalness: 0.7, roughness: 0.28 });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, WEB_LIMITS.activeLinks * SEGMENTS * 2);
    this.mesh.name = 'SF_SnarlBraidedCables';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.userData.spacefaceTetherWeb = true;
    this.pose = new THREE.Object3D();
    this.axis = new THREE.Vector3();
    this.a = { x: 0, z: 0 };
    this.b = { x: 0, z: 0 };
    scene.add(this.mesh);
  }

  update(state) {
    let count = 0;
    const attachments = state.combat?.attachments?.byId;
    const cap = WEB_LIMITS.activeLinks * SEGMENTS * 2;
    for (const id in attachments) {
      const link = attachments[id];
      if (link.defId !== WEB_DEF_ID || link.state !== 'active' || count >= cap) continue;
      const a = state.entities.get(link.ownerId);
      const b = state.entities.get(link.targetId);
      if (!a?.alive || !b?.alive) continue;
      this.localize(a.pos.x, a.pos.z, this.a);
      this.localize(b.pos.x, b.pos.z, this.b);
      const dx = this.b.x - this.a.x, dz = this.b.z - this.a.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1) continue;
      const slack = Math.max(0, Math.min(12, (Number(link.restLength) || distance) - distance));
      const nx = -dz / distance, nz = dx / distance;
      // The two physical-looking strands twist around a shared load curve. Increased
      // extension straightens the curve; no blinking or screen-space glow blanket.
      for (let strand = 0; strand < 2; strand++) {
        let px = this.a.x, pz = this.a.z, py = 1.4;
        for (let i = 1; i <= SEGMENTS; i++) {
          const t = i / SEGMENTS;
          const envelope = Math.sin(Math.PI * t);
          const braid = Math.sin(t * Math.PI * 6 + strand * Math.PI) * 0.9 * envelope;
          const bend = slack * envelope + braid;
          const x = this.a.x + dx * t + nx * bend;
          const z = this.a.z + dz * t + nz * bend;
          const y = 1.4 + Math.cos(t * Math.PI * 6 + strand * Math.PI) * 0.6 * envelope;
          this.axis.set(x - px, y - py, z - pz);
          const length = this.axis.length();
          this.pose.position.set((x + px) * 0.5, (y + py) * 0.5, (z + pz) * 0.5);
          this.pose.quaternion.setFromUnitVectors(UP, this.axis.multiplyScalar(1 / Math.max(length, 0.001)));
          this.pose.scale.set(0.48, length, 0.48);
          this.pose.updateMatrix();
          this.mesh.setMatrixAt(count++, this.pose.matrix);
          px = x; pz = z; py = y;
        }
      }
    }
    if (count || this.mesh.count) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = count;
    this.mesh.visible = count > 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
