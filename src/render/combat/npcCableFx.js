import * as THREE from 'three';
import { presentedAnchorXZ, presentedAnchorRot } from '../presentedAnchor.js';
import { resolveMasslineCableProfile } from '../masslinePresentation.js';
import {
  createMasslineCenterline, createMasslineRibbonSurface, createMasslineCollarSurface,
  writeMasslineCenterline, writeMasslineRibbonSurface, writeMasslineCollarSurface,
} from '../masslineCableSurface.js';
import { createMasslineRibbonMaterial, updateEnergyMaterial } from '../energy/energyMaterials.js';

const CAPACITY = 6;

/** Standard kernel lines outside the player path. All meshes and frame scratch are resident. */
export class NpcCableFx {
  constructor(scene, toLocalXZ, accessibilityPolicy) {
    this.localize = toLocalXZ;
    this.accessibilityPolicy = accessibilityPolicy;
    this.group = new THREE.Group();
    this.group.name = 'SF_NpcMasslineCables';
    this.cables = [];
    this.selected = new Array(CAPACITY).fill(null);
    this.distances = new Float64Array(CAPACITY);
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.point = new THREE.Vector3();
    this.a = { x: 0, z: 0 };
    this.b = { x: 0, z: 0 };
    this.cool = new THREE.Color('#39d0ff');
    this.warm = new THREE.Color('#ffb35c');
    this.hot = new THREE.Color('#ff5c5c');
    this.color = new THREE.Color();
    this.profileInput = { chord: 0, load: 0, taut: false, bowMagnitude: 0,
      shiverAmplitude: 0, shiverCycles: 47.3 / (2 * Math.PI) };
    this.profile = {};
    this.curve = { ax: 0, az: 0, dx: 0, dz: 0, px: 0, pz: 0,
      segments: 6, slackBow: 0, shiverAmplitude: 0, shiverPhase: 0, shiverPhaseFast: 0 };
    this.frame = { color: this.color, time: 0, tension: 0, strain: 0,
      intensity: 0, opacity: 0, pulseSpeed: 0, overload: false };
    for (let i = 0; i < CAPACITY; i++) {
      const group = new THREE.Group();
      group.visible = false;
      group.userData.attachmentId = null;
      const core = createMasslineRibbonSurface();
      const sheath = createMasslineRibbonSurface();
      const collars = createMasslineCollarSurface();
      const surfaces = [core, sheath, collars];
      for (let j = 0; j < surfaces.length; j++) {
        const mesh = new THREE.Mesh(surfaces[j].geometry, createMasslineRibbonMaterial({
          name: 'sf-npc-tether', sheath: j === 0 ? 0 : j === 1 ? 1 : 0.6,
        }));
        mesh.frustumCulled = false;
        mesh.renderOrder = j === 0 ? 10 : j === 1 ? 9 : 11;
        group.add(mesh);
      }
      this.cables.push({ group, core, sheath, collars, centerline: createMasslineCenterline() });
      this.group.add(group);
    }
    if (scene && typeof scene.add === 'function') scene.add(this.group);
  }

  // The kernel stores the actual body-local socket points, including explicitly placed latches.
  // Rotate those points at the same presented moment as the hull, then rebase once for the GPU.
  _endpoints(state, link, alpha) {
    const owner = state.entities.get(link.ownerId), target = state.entities.get(link.targetId);
    if (!owner?.alive || !target?.alive || !owner.pos || !target.pos) return false;
    presentedAnchorXZ(owner, alpha, this.a);
    presentedAnchorXZ(target, alpha, this.b);
    const sourceAnchor = link.sourceAnchorLocal, targetAnchor = link.targetAnchorLocal;
    if (sourceAnchor) {
      const rot = presentedAnchorRot(owner, alpha), cos = Math.cos(rot), sin = Math.sin(rot);
      this.a.x += sourceAnchor.x * cos - sourceAnchor.z * sin;
      this.a.z += sourceAnchor.x * sin + sourceAnchor.z * cos;
    }
    if (targetAnchor) {
      const rot = presentedAnchorRot(target, alpha), cos = Math.cos(rot), sin = Math.sin(rot);
      this.b.x += targetAnchor.x * cos - targetAnchor.z * sin;
      this.b.z += targetAnchor.x * sin + targetAnchor.z * cos;
    }
    this.localize(this.a.x, this.a.z, this.a);
    this.localize(this.b.x, this.b.z, this.b);
    return Number.isFinite(this.a.x) && Number.isFinite(this.a.z)
      && Number.isFinite(this.b.x) && Number.isFinite(this.b.z)
      && Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z) > 1e-6;
  }

  update(state) {
    let count = 0;
    const attachments = state.combat?.attachments?.byId;
    const camera = state.render?.camera;
    const hasCamera = !!(camera?.projectionMatrix && camera?.matrixWorldInverse);
    const alpha = Number.isFinite(state.render?.interpolationAlpha) ? state.render.interpolationAlpha : 1;
    if (hasCamera) {
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
    }
    for (const id in attachments) {
      const link = attachments[id];
      if (!link || link.defId !== 'tether_standard' || link.state !== 'active'
        || link.ownerId === state.playerId || link.targetId === state.playerId
        || link.controllerId === state.playerId
        || !this._endpoints(state, link, alpha)) continue;
      if (hasCamera && !this.frustum.containsPoint(this.point.set(this.a.x, 1.5, this.a.z))
        && !this.frustum.containsPoint(this.point.set(this.b.x, 1.5, this.b.z))) continue;
      const dx = (this.a.x + this.b.x) * 0.5 - (hasCamera ? camera.position.x : 0);
      const dz = (this.a.z + this.b.z) * 0.5 - (hasCamera ? camera.position.z : 0);
      const distance = dx * dx + dz * dz;
      let slot = count;
      while (slot > 0 && distance < this.distances[slot - 1]) slot--;
      if (slot >= CAPACITY) continue;
      for (let i = Math.min(count, CAPACITY - 1); i > slot; i--) {
        this.selected[i] = this.selected[i - 1];
        this.distances[i] = this.distances[i - 1];
      }
      this.selected[slot] = link;
      this.distances[slot] = distance;
      count = Math.min(CAPACITY, count + 1);
    }
    const accessibility = count > 0 ? this.accessibilityPolicy(state.settings) : null;
    for (let i = 0; i < CAPACITY; i++) {
      const cable = this.cables[i];
      const link = i < count ? this.selected[i] : null;
      cable.group.visible = !!link;
      cable.group.userData.attachmentId = link ? link.id : null;
      if (link) this._draw(cable, link, state, alpha, accessibility);
      this.selected[i] = null;
    }
  }

  _draw(cable, link, state, alpha, accessibility) {
    this._endpoints(state, link, alpha);
    const dx = this.b.x - this.a.x, dz = this.b.z - this.a.z;
    const chord = Math.hypot(dx, dz);
    const telemetry = link.masslineTelemetry;
    const ceiling = link.tetherPolicy?.break?.maxTension;
    const fraction = Number.isFinite(telemetry?.tensionFraction) ? telemetry.tensionFraction
      : ceiling > 0 ? link.lastTension / ceiling : 0;
    const load = Math.max(0, Math.min(1, Number.isFinite(link.load) ? link.load : fraction || 0));
    const taut = load > 0.5;
    const slack = Number.isFinite(telemetry?.slack) ? telemetry.slack : Math.max(0, link.restLength - chord);
    const bow = Math.min(24, slack * 0.42) * Math.max(0.15, 1 - load);
    const time = Number.isFinite(state.simTime) ? state.simTime : 0;
    const shiver = load * load * 0.52 * Math.min(1, chord / 40) * accessibility.motionAmplitudeScale;
    const input = this.profileInput;
    input.chord = chord; input.load = load; input.taut = taut;
    input.bowMagnitude = bow; input.shiverAmplitude = shiver;
    const profile = resolveMasslineCableProfile(input, this.profile);
    const curve = this.curve;
    curve.ax = this.a.x; curve.az = this.a.z; curve.dx = dx; curve.dz = dz;
    curve.px = -dz / chord; curve.pz = dx / chord; curve.segments = profile.segments;
    curve.slackBow = bow; curve.shiverAmplitude = shiver;
    curve.shiverPhase = accessibility.animateMotion ? time * 41 : 0;
    curve.shiverPhaseFast = accessibility.animateMotion ? time * 97 : 0;
    writeMasslineCenterline(cable.centerline, curve);
    writeMasslineRibbonSurface(cable.core, cable.centerline, profile.coreHalfWidth, 1.5);
    writeMasslineRibbonSurface(cable.sheath, cable.centerline, profile.sheathHalfWidth, 1.4);
    writeMasslineCollarSurface(cable.collars, cable.centerline, profile, 1.55);
    if (load < 0.55) this.color.lerpColors(this.cool, this.warm, load / 0.55);
    else this.color.lerpColors(this.warm, this.hot, (load - 0.55) / 0.45);
    const frame = this.frame;
    frame.time = accessibility.animatePulse ? time : 0;
    frame.tension = load;
    frame.strain = Math.max(0, (load - 0.35) / 0.65) * accessibility.pulseScale;
    frame.overload = (telemetry?.overloadRatio > 1 || load > 0.88) && accessibility.pulseScale > 0;
    frame.pulseSpeed = accessibility.animatePulse ? 2.8 + load * 1.4 : 0;
    const radiance = 1.4 * accessibility.radianceScale;
    frame.intensity = (2.2 + load * 1.7) * radiance;
    frame.opacity = (taut ? 0.74 : 0.62) * accessibility.opacityScale;
    updateEnergyMaterial(cable.group.children[0].material, frame);
    frame.intensity = (1.5 + load * 1.5) * radiance;
    frame.opacity = (0.24 + 0.2 * load) * accessibility.opacityScale;
    updateEnergyMaterial(cable.group.children[1].material, frame);
    frame.intensity = (1.1 + load * 1.2) * radiance;
    frame.opacity = (0.2 + 0.42 * load) * accessibility.opacityScale;
    updateEnergyMaterial(cable.group.children[2].material, frame);
  }

  dispose() {
    this.group.removeFromParent();
    for (let i = 0; i < this.cables.length; i++) {
      const children = this.cables[i].group.children;
      for (let j = 0; j < children.length; j++) {
        children[j].geometry.dispose();
        children[j].material.dispose();
      }
    }
  }
}
