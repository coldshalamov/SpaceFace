import * as THREE from 'three';
import { WEB_DEF_ID, WEB_LIMITS } from '../../combat/tetherWebs.js';
import { resolveMasslineWebStrandProfile } from '../masslinePresentation.js';

const SEGMENTS = 10;
const STRANDS = 2;
const INSTANCES_PER_LINK = SEGMENTS * STRANDS;
const UP = new THREE.Vector3(0, 1, 0);
const FORMATION_SECONDS = 0.5;
const MAX_SLACK_WU = 12;
const STRAND_Y = 1.4;

/** One take-up accent from the attachment's 60 Hz creation tick; no render clock. */
export function tetherWebFormationAccent(link, simTime, motionReduce = false) {
  if (motionReduce || link?.defId !== WEB_DEF_ID || link.state !== 'active'
    || !Number.isInteger(link.createdTick) || link.createdTick < 0
    || !Number.isFinite(simTime) || simTime < 0) return 0;
  const age = Math.max(0, Math.min(1, (simTime - link.createdTick / 60) / FORMATION_SECONDS));
  // Smoothly settle once, including a flat landing at the steady cable width.
  return 1 - age * age * (3 - 2 * age);
}

/** Hull half-extent used to seat a strand on the SURFACE rather than inside the body. */
function webVisualRadius(entity) {
  const radius = Number(entity && entity.radius);
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

/** Actual Snarl constraints rendered as braided, tension-shaped cables. No inferred links. */
export class TetherWebFx {
  constructor(scene, toLocalXZ) {
    this.localize = toLocalXZ;
    this.geometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1, false);
    // Flat shading: five real facets per strand instead of a soft smooth tube, so the lay reads as
    // laid cord at gameplay distance rather than as a glowing noodle.
    this.material = new THREE.MeshStandardMaterial({ color: 0x9bebe4, emissive: 0x227d86,
      emissiveIntensity: 2.2, metalness: 0.7, roughness: 0.28, flatShading: true });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material,
      WEB_LIMITS.activeLinks * INSTANCES_PER_LINK);
    this.mesh.name = 'SF_SnarlBraidedCables';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.userData.spacefaceTetherWeb = true;
    this.pose = new THREE.Object3D();
    this.axis = new THREE.Vector3();
    // Resident basis scratch. A strand's cross-section is oriented from the LINK's own constant
    // lateral normal, not from each segment's minimal-arc rotation, so neighbouring facets stay
    // aligned and the prism cannot appear to twist as the braid wobbles.
    this.basisX = new THREE.Vector3();
    this.basisY = new THREE.Vector3();
    this.basisZ = new THREE.Vector3();
    this.basis = new THREE.Matrix4();
    this.lay = resolveMasslineWebStrandProfile({ slack: 0, maxSlack: MAX_SLACK_WU });
    this.a = { x: 0, z: 0 };
    this.b = { x: 0, z: 0 };
    // Match the sibling ArcadeStructuralFx contract: vfx.js is constructed against stub scenes in
    // several harnesses, and an unguarded add() there aborts the whole VFX init.
    // (Pre-existing since d588e4888; teardown already tolerates it via mesh.removeFromParent().)
    if (scene && typeof scene.add === 'function') scene.add(this.mesh);
  }

  update(state) {
    let count = 0;
    const attachments = state.combat?.attachments?.byId;
    const cap = WEB_LIMITS.activeLinks * INSTANCES_PER_LINK;
    const motionReduce = !!state.settings?.video?.motionReduce;
    for (const id in attachments) {
      const link = attachments[id];
      // Bound BEFORE the strand loops: a partially written link would leave the tail of the batch
      // reading past its own instance buffer.
      if (link.defId !== WEB_DEF_ID || link.state !== 'active'
        || count + INSTANCES_PER_LINK > cap) continue;
      const a = state.entities.get(link.ownerId);
      const b = state.entities.get(link.targetId);
      if (!a?.alive || !b?.alive) continue;
      this.localize(a.pos.x, a.pos.z, this.a);
      this.localize(b.pos.x, b.pos.z, this.b);
      const cdx = this.b.x - this.a.x, cdz = this.b.z - this.a.z;
      const distance = Math.hypot(cdx, cdz);
      if (distance < 1) continue;
      // Slack is the PHYSICAL quantity the attachment carries: rest length against the body-to-body
      // gap. The drawn span is separately seated on the two hull surfaces, so the strand bites the
      // hulls instead of vanishing into their centres.
      const slack = Math.max(0, Math.min(MAX_SLACK_WU,
        (Number(link.restLength) || distance) - distance));
      const ux = cdx / distance, uz = cdz / distance;
      const insetA = Math.min(webVisualRadius(a) * 0.88, distance * 0.35);
      const insetB = Math.min(webVisualRadius(b) * 0.88, distance * 0.35);
      const startX = this.a.x + ux * insetA, startZ = this.a.z + uz * insetA;
      const dx = cdx - ux * (insetA + insetB), dz = cdz - uz * (insetA + insetB);
      const span = Math.hypot(dx, dz);
      if (span < 0.5) continue;
      const nx = -dz / span, nz = dx / span;
      // A fresh catch briefly gains substance without moving the physical load curve.
      const width = 0.48 * (1 + 0.3 * tetherWebFormationAccent(link, state.simTime, motionReduce));
      // Tension shapes the LAY, not the colour and not the gauge. A rope's turn count is fixed by
      // how it was laid; what a pull changes is how far the strands stand off the axis. So the two
      // physical strands collapse toward one taut line as the line is worked and bloom back out as
      // it goes slack — a load read you can see with the colour removed entirely.
      const lay = resolveMasslineWebStrandProfile({ slack, maxSlack: MAX_SLACK_WU }, this.lay);
      const turn = Math.PI * 2 * lay.braidTurns;
      for (let strand = 0; strand < STRANDS; strand++) {
        const phase = strand * Math.PI;
        let px = startX, pz = startZ, py = STRAND_Y;
        for (let i = 1; i <= SEGMENTS; i++) {
          const t = i / SEGMENTS;
          const envelope = Math.sin(Math.PI * t);
          const braid = Math.sin(t * turn + phase) * lay.braidAmplitude * envelope;
          const bend = slack * envelope + braid;
          const x = startX + dx * t + nx * bend;
          const z = startZ + dz * t + nz * bend;
          const y = STRAND_Y + Math.cos(t * turn + phase) * lay.liftAmplitude * envelope;
          this.axis.set(x - px, y - py, z - pz);
          const length = this.axis.length();
          this.pose.position.set((x + px) * 0.5, (y + py) * 0.5, (z + pz) * 0.5);
          this.basisY.copy(this.axis).multiplyScalar(1 / Math.max(length, 1e-6));
          // Gram-Schmidt the link's constant lateral normal against this segment's axis.
          this.basisX.set(nx, 0, nz).addScaledVector(this.basisY, -(nx * this.basisY.x + nz * this.basisY.z));
          if (this.basisX.lengthSq() < 1e-8) {
            this.basisX.crossVectors(UP, this.basisY);
            if (this.basisX.lengthSq() < 1e-8) this.basisX.set(1, 0, 0);
          }
          this.basisX.normalize();
          this.basisZ.crossVectors(this.basisX, this.basisY);
          this.basis.makeBasis(this.basisX, this.basisY, this.basisZ);
          this.pose.quaternion.setFromRotationMatrix(this.basis);
          this.pose.scale.set(width, length, width);
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
