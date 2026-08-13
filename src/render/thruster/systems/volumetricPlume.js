// SpaceFace — volumetric plume system.
//
// Owns one oriented proxy box per live nozzle and drives the raymarch shader that fills it. The
// system is deliberately pose-only: it knows nothing about ships, flight, or the game state. It is
// handed nozzle poses and a drive strength, and it renders exhaust. That is what lets the same
// system serve the main drive and the bow retro jets without a second shader.
//
// Cost control lives here rather than in the shader, and none of it lowers quality at the framing
// the player actually sees:
//   - the proxy is sized to the plume, so the raymarch touches roughly the pixels the plume covers
//     and not a pixel more;
//   - step count scales with the plume's apparent size, so a distant ship marches coarsely and a
//     close one marches finely;
//   - multiple nozzles share a step budget, because overlapping proxies multiply fill cost in
//     exactly the region where their plumes have already merged into one bright cloud.

import * as THREE from 'three';
import {
  createVolumetricPlumeMaterial,
  VOLUMETRIC_PLUME_MAX_STEPS,
} from '../materials/volumetricPlumeMaterial.js';
import { acquirePlumeNoiseVolume, releasePlumeNoiseVolume } from '../volume/plumeNoiseVolume.js';

const X_AXIS = Object.freeze({ x: 1, y: 0, z: 0 });

// Headroom between the widest point of the modelled plume and the proxy wall. The outer fringe is
// faint but it is what makes the silhouette ragged, so it must not be clipped by the box.
//
// This is tuned against the shader's own radial cutoff rather than picked for comfort: the march
// stops sampling at 1.3 cone radii, so margin and cutoff multiply to exactly the box wall. Any more
// margin than this rasterizes fragments whose rays the shader will immediately reject, and fragment
// count is the dominant cost when the plume is large on screen.
const PROXY_MARGIN = 1.3;

const DEFAULTS = Object.freeze({
  maxNozzles: 4,
  minSteps: 12,
  maxSteps: 56,
  stepBias: 14,
  stepGain: 118,
  renderOrder: 14,
});

// Fraction of the frame the proxy covers, times steps per ray. This is the quantity that actually
// costs GPU time — a raymarch is priced in samples, and samples are pixels times steps — so it is
// the quantity that gets a budget. Measured on an Intel Xe iGPU at 1080p, 8.5 buys about 2 ms,
// which is the plume's share of the 7 ms render phase.
const SAMPLE_BUDGET = 5.0;
// Screen solid angle for a ~55 degree vertical FOV: (2*tan(fov/2))^2. Coverage estimates only need
// to be right to within a factor of two, since they feed a clamp.
const SCREEN_SOLID_ANGLE = 1.08;

export class VolumetricPlumeSystem {
  constructor(THREE_NS, opts = {}) {
    this.THREE = THREE_NS || THREE;
    this.maxNozzles = Math.max(1, Math.min(8, opts.maxNozzles || DEFAULTS.maxNozzles));
    this.name = opts.name || 'sf-volumetric-plume';
    this.renderOrder = opts.renderOrder != null ? opts.renderOrder : DEFAULTS.renderOrder;
    this.minSteps = opts.minSteps != null ? opts.minSteps : DEFAULTS.minSteps;
    this.maxSteps = Math.min(
      VOLUMETRIC_PLUME_MAX_STEPS,
      opts.maxSteps != null ? opts.maxSteps : DEFAULTS.maxSteps,
    );
    this.colors = {
      core: opts.coreColor || [1.0, 0.99, 0.96],
      mid: opts.midColor || [0.34, 0.82, 1.0],
      edge: opts.edgeColor || [0.06, 0.26, 0.92],
    };

    this.group = null;
    this._meshes = [];
    this._geo = null;
    this._volume = null;
    this._camObj = null;
    this._lastNx = 0;
    this._lastNy = 0;
    this._lastNz = 0;
    this._cam = { x: 0, y: 8, z: 12 };
    this._time = 0;
    this._disposed = false;
    this._liveCount = 0;
    this._lastSteps = 0;

    // Per-frame scratch. update() runs every frame on the render hot path and must not allocate.
    this._q = new this.THREE.Quaternion();
    this._from = new this.THREE.Vector3(X_AXIS.x, X_AXIS.y, X_AXIS.z);
    this._to = new this.THREE.Vector3();
    this._camWorld = new this.THREE.Vector3();
    this._camLocal = new this.THREE.Vector3();
  }

  setCamera(camera) {
    if (!camera) return;
    this._camObj = camera;
    if (camera.position) {
      this._cam.x = camera.position.x;
      this._cam.y = camera.position.y;
      this._cam.z = camera.position.z;
    }
  }

  setCameraPosition(x, y, z) {
    this._cam.x = x;
    this._cam.y = y;
    this._cam.z = z;
    this._camObj = null;
  }

  attach(scene) {
    if (this._disposed || !scene || this.group) return this.group;
    const T = this.THREE;
    this._volume = acquirePlumeNoiseVolume(T);
    this.group = new T.Group();
    this.group.name = `${this.name}-root`;
    this.group.visible = false;

    // One unit box shared by every nozzle: the proxy differs only by transform, so there is no
    // reason to carry N copies of 24 vertices.
    const geo = new T.BoxGeometry(1, 1, 1);
    geo.translate(0.5, 0, 0);
    geo.name = `${this.name}-proxy`;
    // The raymarch works from object-space position alone. Dropping the unused attributes also
    // keeps the proxy out of strip-geometry gates, which select meshes by having a uv channel.
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    this._geo = geo;

    for (let i = 0; i < this.maxNozzles; i++) {
      const mat = createVolumetricPlumeMaterial(T, {
        name: `${this.name}-${i}`,
        volume: this._volume,
        coreColor: this.colors.core,
        midColor: this.colors.mid,
        edgeColor: this.colors.edge,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.name = `${this.name}-nozzle-${i}`;
      mesh.renderOrder = this.renderOrder;
      mesh.visible = false;
      // The proxy is exactly the plume's bounds, so three's own culling is both correct and a
      // genuine saving when the ship leaves frame.
      mesh.frustumCulled = true;
      this.group.add(mesh);
      this._meshes.push(mesh);
    }

    scene.add(this.group);
    return this.group;
  }

  reset() {
    this._liveCount = 0;
    for (let i = 0; i < this._meshes.length; i++) this._meshes[i].visible = false;
    if (this.group) this.group.visible = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    for (let i = 0; i < this._meshes.length; i++) this._meshes[i].material.dispose();
    this._meshes.length = 0;
    if (this._geo) { this._geo.dispose(); this._geo = null; }
    if (this._volume) { releasePlumeNoiseVolume(); this._volume = null; }
    this.group = null;
  }

  /**
   * Sample count for one nozzle, bounded by a fixed screen-space sample budget.
   *
   * Two forces pull opposite ways here and both are real. A plume covering a handful of pixels
   * cannot resolve 50 samples' worth of structure, so spending them is waste — that argues for more
   * steps as the plume grows. But cost is pixels times steps, and a plume filling the screen has
   * hundreds of times the pixels, so the same rule that keeps a distant plume cheap makes a close
   * one ruinous. Naive projected-size LOD gets the second case exactly backwards.
   *
   * So step count rises with apparent size until the total sample count hits its budget, then falls
   * to hold that budget. That is not a quality cut at close range: when the plume fills the frame
   * its filaments are tens of pixels across, so the field is heavily oversampled laterally and the
   * jittered march turns the coarser axial sampling into grain rather than banding.
   */
  _stepsFor(lengthWU, radiusWU, nozzleCount, quality) {
    const dx = this._cam.x - this._lastNx;
    const dy = this._cam.y - this._lastNy;
    const dz = this._cam.z - this._lastNz;
    const dist = Math.max(1, Math.hypot(dx, dy, dz));
    const apparent = (lengthWU + radiusWU * 2) / dist;
    const share = 1 + (Math.max(1, nozzleCount) - 1) * 0.35;
    const raw = (DEFAULTS.stepBias + apparent * DEFAULTS.stepGain) * (quality || 1) / share;

    // Projected footprint of the proxy as a fraction of the frame.
    const coverage = Math.min(1, (lengthWU * radiusWU * 2) / (dist * dist) / SCREEN_SOLID_ANGLE);
    const affordable = SAMPLE_BUDGET / Math.max(coverage, 1e-3) / share;
    return Math.max(this.minSteps, Math.min(this.maxSteps, Math.round(Math.min(raw, affordable))));
  }

  /**
   * @param {number} dt seconds
   * @param {Array|null} sockets nozzle poses; `ax/ay/az` points opposite the exhaust, matching the
   *   production socket convention, so the plume grows along `-a`.
   * @param {object} p plume parameters in world units — see the recipe's `volume` block.
   */
  update(dt, sockets, p) {
    if (this._disposed || !this.group) return { live: 0 };
    const frameDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    this._time += frameDt * (p && p.timeScale != null ? p.timeScale : 1);

    const count = sockets && sockets.length
      ? Math.min(sockets.length, this.maxNozzles)
      : 0;
    if (count <= 0 || !p || !(p.drive > 0)) {
      this.reset();
      return { live: 0 };
    }

    const lengthWU = Math.max(0.75, p.lengthWU || 12);
    const tailRadiusWU = Math.max(0.2, p.tailRadiusWU || 3);
    const exitRadiusWU = Math.max(0.05, Math.min(tailRadiusWU, p.exitRadiusWU || 0.9));
    const boxHalf = tailRadiusWU * PROXY_MARGIN;
    const boxWidth = boxHalf * 2;

    this.group.visible = true;
    this._liveCount = count;

    let steps = 0;
    for (let i = 0; i < this._meshes.length; i++) {
      const mesh = this._meshes[i];
      if (i >= count) { mesh.visible = false; continue; }
      const sock = sockets[i];

      let dirX = Number.isFinite(sock.ax) ? sock.ax : 1;
      let dirY = Number.isFinite(sock.ay) ? sock.ay : 0;
      let dirZ = Number.isFinite(sock.az) ? sock.az : 0;
      const len = Math.hypot(dirX, dirY, dirZ) || 1;
      dirX /= len; dirY /= len; dirZ /= len;

      const nx = sock.x || 0;
      const ny = sock.y || 0;
      const nz = sock.z || 0;
      if (i === 0) { this._lastNx = nx; this._lastNy = ny; this._lastNz = nz; }

      // Proxy +X runs down the exhaust, which is -a by the socket convention.
      this._to.set(-dirX, -dirY, -dirZ);
      this._q.setFromUnitVectors(this._from, this._to);

      mesh.visible = true;
      mesh.position.set(nx, ny, nz);
      mesh.quaternion.copy(this._q);
      mesh.scale.set(lengthWU, boxWidth, boxWidth);

      if (steps === 0) steps = this._stepsFor(lengthWU, tailRadiusWU, count, p.quality);

      const u = mesh.material.uniforms;
      u.uTime.value = this._time;
      u.uSteps.value = steps;
      u.uLenWU.value = lengthWU;
      u.uWidWU.value = boxWidth;
      u.uExitR.value = Math.min(0.85, exitRadiusWU / boxHalf);
      u.uConeMax.value = 1 / PROXY_MARGIN;
      u.uSpread.value = p.spread != null ? p.spread : 0.62;
      u.uFadeStart.value = p.fadeStart != null ? p.fadeStart : 0.52;
      u.uNoiseScale.value = p.noiseScale != null ? p.noiseScale : 0.34;
      u.uStretch.value = p.stretch != null ? p.stretch : 3.4;
      u.uWarpAmp.value = p.warpAmp != null ? p.warpAmp : 1.15;
      u.uWarpScale.value = p.warpScale != null ? p.warpScale : 0.26;
      u.uWarpGrowth.value = p.warpGrowth != null ? p.warpGrowth : 1.9;
      u.uFlowSpeed.value = p.flowSpeed != null ? p.flowSpeed : 9;
      u.uThreshold.value = p.threshold != null ? p.threshold : 0.36;
      u.uSigma.value = p.sigma != null ? p.sigma : 0.55;
      u.uRadiance.value = p.radiance != null ? p.radiance : 1;
      u.uVeil.value = p.veil != null ? p.veil : 0.28;
      u.uCoherence.value = p.coherence != null ? p.coherence : 0.17;
      u.uCoreDensity.value = p.coreDensity != null ? p.coreDensity : 0.62;
      u.uRadialTight.value = p.radialTight != null ? p.radialTight : 2.1;
      u.uDrive.value = p.drive;
      u.uBoost.value = p.boost || 0;
      u.uTurb.value = p.turbulence || 0;
      u.uShockAmp.value = p.shockAmp != null ? p.shockAmp : 0.5;
      u.uShockPitch.value = p.shockPitch != null ? p.shockPitch : 2.4;
      u.uShockDecay.value = p.shockDecay != null ? p.shockDecay : 9;
    }
    this._lastSteps = steps;

    // The raymarch needs the camera in each proxy's own space, and that space changes every frame
    // with the ship's pose, so the transforms must be current before the inverse is taken.
    this.group.updateMatrixWorld(true);
    if (this._camObj && typeof this._camObj.getWorldPosition === 'function') {
      this._camObj.getWorldPosition(this._camWorld);
    } else {
      this._camWorld.set(this._cam.x, this._cam.y, this._cam.z);
    }
    for (let i = 0; i < count; i++) {
      const mesh = this._meshes[i];
      this._camLocal.copy(this._camWorld);
      mesh.worldToLocal(this._camLocal);
      mesh.material.uniforms.uCamObj.value.copy(this._camLocal);
    }

    return { live: count, steps, lengthWU, tailRadiusWU };
  }

  /** Materials the shader precompile salvo must warm so first thrust does not pay a sync compile. */
  materials() {
    const out = [];
    for (let i = 0; i < this._meshes.length; i++) out.push(this._meshes[i].material);
    return out;
  }

  inspect() {
    return {
      construction: 'raymarched-volume',
      nozzles: this.maxNozzles,
      live: this._liveCount,
      steps: this._lastSteps,
      maxSteps: this.maxSteps,
      proxyMargin: PROXY_MARGIN,
    };
  }
}

export default VolumetricPlumeSystem;
