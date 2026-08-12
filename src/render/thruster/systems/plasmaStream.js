/**
 * Continuous liquid plasma thruster — one medium for hot wide root + thinner long wake.
 *
 * Continuous soft strip layers (NOT point-sprite balls, NOT solid laser tube).
 * Path sampler owns history; multi-layer meshes share one liquid plasma shader family.
 */
import * as THREE from 'three';
import { createPathSampler } from './pathSampler.js';
import {
  PLAYER_PLASMA_STREAM_RECIPE,
  samplePlasmaEnvelope,
} from '../recipes/plasmaStreamRecipe.js';

const LIQUID_VERT = /* glsl */`
  attribute vec2 aPathUv; // x = path age 0..1 (nozzle→wake), y = side 0..1
  varying vec2 vPathUv;
  void main() {
    vPathUv = aPathUv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Continuous liquid plasma: soft body, hot core near nozzle, torn edges, flow structure.
// Designed against reference stills — continuous substance, not beads or hard tubes.
const LIQUID_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vPathUv;
  uniform float uTime;
  uniform float uScroll;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadiance;
  uniform float uLayerRole; // 0 core, 1 body, 2 sheath
  uniform float uDrive;
  uniform float uBoost;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    float pathT = clamp(vPathUv.x, 0.0, 1.0);
    float side = vPathUv.y * 2.0 - 1.0;
    float flow = pathT * 4.2 - uScroll * 2.1 + uTime * 0.15;
    // Domain warp: liquid advection, not scrolling TV static.
    vec2 wp = vec2(flow * 0.9, side * 1.4 + uTime * 0.08);
    float w1 = vnoise(wp) - 0.5;
    float w2 = vnoise(wp * 1.7 + vec2(2.3, -1.1)) - 0.5;
    float sideW = side + w1 * 0.22 + w2 * 0.10;
    float along = flow + w1 * 0.35;

    // Soft continuous cross-section (never a hard rectangle).
    float core = exp(-sideW * sideW * mix(28.0, 14.0, uLayerRole * 0.35));
    float body = exp(-sideW * sideW * mix(7.5, 3.8, uLayerRole * 0.4));
    float sheath = exp(-sideW * sideW * mix(2.8, 1.6, uLayerRole * 0.5));
    // Filament threads inside the volume (reference plasma veins).
    float thread = vnoise(vec2(along * 3.4, sideW * 2.2 + 1.7));
    float thread2 = vnoise(vec2(along * 7.1 - uTime * 0.4, sideW * 3.5));
    float filaments = smoothstep(0.42, 0.78, thread) * exp(-abs(sideW) * 2.2)
      + smoothstep(0.55, 0.88, thread2) * exp(-abs(sideW) * 3.4) * 0.55;
    // Edge tear: irregular silhouette, not cylinder.
    float edgeTear = 0.75 + 0.35 * vnoise(vec2(along * 2.2, 3.1))
      + 0.2 * vnoise(vec2(along * 5.5, sideW * 1.2));
    float softEdge = 1.0 - smoothstep(0.55 * edgeTear, 1.05 * edgeTear, abs(sideW));
    softEdge = pow(max(softEdge, 0.0), mix(1.1, 0.75, uLayerRole * 0.4));

    // Along-path envelopes: hot wide root, continuous fade into thinner wake.
    float head = 1.0 - smoothstep(0.0, 0.16, pathT);
    float mid = 1.0 - smoothstep(0.1, 0.7, pathT);
    float tail = 1.0 - smoothstep(0.45, 1.0, pathT);
    float alongBody = head * 1.15 + mid * 0.85 + tail * 0.35;
    alongBody *= (0.65 + uDrive * 0.45 + uBoost * 0.2);

    float roleCore = 1.0 - step(0.5, uLayerRole);
    float roleBody = 1.0 - abs(uLayerRole - 1.0);
    float roleSheath = step(1.5, uLayerRole);

    float structure =
      core * (0.55 + roleCore * 0.9)
      + body * (0.4 + roleBody * 0.55)
      + sheath * (0.18 + roleSheath * 0.45)
      + filaments * (0.35 + roleBody * 0.25 + roleSheath * 0.15);

    float alpha = uOpacity * softEdge * alongBody * structure;
    alpha *= (0.75 + head * 0.45);
    // Kill hard tube fill: require structure, not flat sheath slab.
    alpha *= (0.35 + core * 0.75 + body * 0.55 + filaments * 0.4);
    if (alpha < 0.012) discard;

    vec3 whiteHot = vec3(1.0, 0.985, 0.95);
    vec3 midBlue = mix(uColor, vec3(0.45, 0.88, 1.0), 0.35);
    vec3 deepBlue = mix(uColor, vec3(0.12, 0.28, 0.75), 0.4);
    float hotAmt = clamp(core * 0.85 + head * 0.55 + filaments * 0.2 + uBoost * 0.12, 0.0, 1.0);
    vec3 col = mix(deepBlue, midBlue, body);
    col = mix(col, whiteHot, hotAmt * (0.55 + roleCore * 0.55));
    col *= uRadiance * (0.7 + core * 0.7 + head * 0.45 + filaments * 0.25 + uDrive * 0.2);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

function createLayerMaterial(layer, THREE_NS) {
  const T = THREE_NS || THREE;
  const c = layer.color || [0.4, 0.8, 1];
  return new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uColor: { value: new T.Color(c[0], c[1], c[2]) },
      uOpacity: { value: layer.opacity != null ? layer.opacity : 0.7 },
      uRadiance: { value: layer.radiance != null ? layer.radiance : 1.6 },
      uLayerRole: {
        value: layer.role === 'core' ? 0 : layer.role === 'sheath' ? 2 : 1,
      },
      uDrive: { value: 0 },
      uBoost: { value: 0 },
    },
    vertexShader: LIQUID_VERT,
    fragmentShader: LIQUID_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
  });
}

/**
 * @param {typeof THREE} THREE_NS
 * @param {object} [recipe]
 */
export class PlasmaStreamSystem {
  constructor(THREE_NS, recipe = PLAYER_PLASMA_STREAM_RECIPE) {
    this.THREE = THREE_NS || THREE;
    this.recipe = recipe || PLAYER_PLASMA_STREAM_RECIPE;
    const pathCfg = this.recipe.path || {};
    this.nSeg = Math.max(8, pathCfg.capacity || 48);
    this.sampler = createPathSampler(this.nSeg);
    this._pathX = new Float32Array(this.nSeg);
    this._pathZ = new Float32Array(this.nSeg);
    this._pathS = new Float32Array(this.nSeg);
    this._centers = new Float32Array(this.nSeg * 3); // x, z, rot
    this._env = {
      s: 0, width: 1, heat: 1, opacity: 1, density: 1,
      filament: 0, root: 0, jet: 0, wake: 0, rootWindow: 0, jetWindow: 0, wakeWindow: 0,
    };
    this._widths = new Float32Array(this.nSeg);
    this.group = null;
    this._layers = [];
    this._time = 0;
    this._disposed = false;
    this._active = false;
    this._lastDrive = 0;
    this._lastBoost = 0;
  }

  attach(scene) {
    if (this._disposed || !scene || this.group) return this.group;
    const T = this.THREE;
    this.group = new T.Group();
    this.group.name = 'sf-liquid-plasma-root';
    const layers = this.recipe.layers || [];
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const verts = this.nSeg * 2;
      const pos = new Float32Array(verts * 3);
      const uvs = new Float32Array(verts * 2);
      const geo = new T.BufferGeometry();
      const posAttr = new T.BufferAttribute(pos, 3);
      posAttr.setUsage(T.DynamicDrawUsage);
      geo.setAttribute('position', posAttr);
      const uvAttr = new T.BufferAttribute(uvs, 2);
      uvAttr.setUsage(T.DynamicDrawUsage);
      geo.setAttribute('aPathUv', uvAttr);
      const idx = [];
      for (let i = 0; i < this.nSeg - 1; i++) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
      geo.setIndex(idx);
      geo.setDrawRange(0, 0);
      const mat = createLayerMaterial(layer, T);
      const mesh = new T.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 12 + li;
      mesh.name = `sf-liquid-plasma-${layer.role || li}`;
      mesh.visible = false;
      this.group.add(mesh);
      this._layers.push({
        role: layer.role || 'body',
        widthScale: layer.widthScale != null ? layer.widthScale : 1,
        baseOpacity: layer.opacity != null ? layer.opacity : 0.7,
        baseRadiance: layer.radiance != null ? layer.radiance : 1.6,
        mesh,
        geo,
        pos,
        uvs,
        posAttr,
        uvAttr,
        mat,
      });
    }
    scene.add(this.group);
    return this.group;
  }

  reset() {
    this.sampler.clear();
    this._active = false;
    for (let i = 0; i < this._layers.length; i++) {
      const L = this._layers[i];
      L.mesh.visible = false;
      L.geo.setDrawRange(0, 0);
    }
    if (this.group) this.group.visible = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    for (let i = 0; i < this._layers.length; i++) {
      const L = this._layers[i];
      L.geo.dispose();
      L.mat.dispose();
    }
    this._layers.length = 0;
    this.group = null;
  }

  /**
   * @param {number} dt
   * @param {{x:number,z:number,ax?:number,az?:number}[]} sockets frame-local
   * @param {{drive:number,throttle:number,boost:number,speed?:number}} driveInfo
   * @param {{reducedMotion?:boolean,reducedFlash?:boolean,lowQuality?:boolean}|null} a11y
   * @param {object|null} owner
   */
  update(dt, sockets, driveInfo, a11y = null, owner = null) {
    if (this._disposed || !this.group) return { live: 0, pathPoints: 0, continuous: true };
    const drive = Math.max(0, driveInfo && driveInfo.drive || 0);
    const throttle = Math.max(0, driveInfo && driveInfo.throttle || 0);
    const boost = Math.max(0, driveInfo && driveInfo.boost || 0);
    const speed = Math.max(0, driveInfo && driveInfo.speed || 0);
    const activeDrive = Math.max(drive, throttle, boost > 0 ? 0.55 : 0);
    this._time += Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    this._lastDrive = activeDrive;
    this._lastBoost = boost;

    const idleFloor = this.recipe.drive?.idleFloor ?? 0.04;
    if (activeDrive < idleFloor && speed < 5) {
      this.reset();
      return { live: 0, pathPoints: 0, continuous: true };
    }

    const list = sockets && sockets.length ? sockets : null;
    const primary = list ? list[0] : { x: 0, z: 0, ax: -1, az: 0 };
    let dirX = Number.isFinite(primary.ax) ? primary.ax : -1;
    let dirZ = Number.isFinite(primary.az) ? primary.az : 0;
    const dLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dLen;
    dirZ /= dLen;

    const pathCfg = this.recipe.path || {};
    const spacing = pathCfg.sampleSpacingWU || 1.35;
    const disc = Math.min(
      pathCfg.discontinuityMaxWU || 640,
      Math.max(pathCfg.discontinuityFloorWU || 160, speed * 0.08 + 80),
    );
    const period = 1 / Math.max(12, pathCfg.sampleHz || 40);
    this.sampler.follow(
      primary.x,
      primary.z,
      Math.atan2(dirZ, dirX),
      dt,
      owner || primary,
      spacing,
      disc,
      period,
    );

    const pathN = this.sampler.sampleInto(this._pathX, this._pathZ, this._pathS, this.nSeg);
    // Need at least two path samples to build a continuous strip. Do NOT clear the sampler here
    // or history can never accumulate (each frame would re-seed and wipe).
    if (pathN < 2) {
      for (let i = 0; i < this._layers.length; i++) {
        this._layers[i].mesh.visible = false;
        this._layers[i].geo.setDrawRange(0, 0);
      }
      this._active = false;
      return { live: 0, pathPoints: pathN, continuous: true };
    }

    // Multi-socket root: bias first samples wider when several bells exist.
    const nSock = list ? Math.min(list.length, 4) : 1;
    const rootMul = 1 + Math.min(0.45, (nSock - 1) * 0.12);
    const driveCfg = this.recipe.drive || {};
    const boostW = 1 + (driveCfg.boostWidthMul != null ? driveCfg.boostWidthMul - 1 : 0.28) * boost;
    const boostR = 1 + (driveCfg.boostRadianceMul != null ? driveCfg.boostRadianceMul - 1 : 0.35) * boost;
    const flashScale = a11y && a11y.reducedFlash ? 0.72 : 1;
    const motionScroll = a11y && a11y.reducedMotion ? 0.12 : 1;

    // Build centerline + per-sample width (continuous envelope).
    for (let i = 0; i < pathN; i++) {
      const s = this._pathS[i];
      samplePlasmaEnvelope(s, activeDrive, boost, this._env);
      this._centers[i * 3] = this._pathX[i];
      this._centers[i * 3 + 1] = this._pathZ[i];
      // Orientation: along path toward next sample (exhaust direction).
      let tx;
      let tz;
      if (i < pathN - 1) {
        tx = this._pathX[i] - this._pathX[i + 1];
        tz = this._pathZ[i] - this._pathZ[i + 1];
      } else {
        tx = this._pathX[i - 1] - this._pathX[i];
        tz = this._pathZ[i - 1] - this._pathZ[i];
      }
      const tl = Math.hypot(tx, tz) || 1;
      this._centers[i * 3 + 2] = Math.atan2(tz / tl, tx / tl);
      let w = this._env.width * rootMul * boostW;
      if (i === 0) w *= 1.15; // hot root flare at nozzle
      this._widths[i] = w;
    }

    // Multi-nozzle: if extra sockets exist, pull first center slightly and widen root only.
    // (Full multi-stream later; keeps continuous single-body hero coherent.)

    const scroll = (this._time * 0.55 * motionScroll) % 1;
    this.group.visible = true;
    this._active = true;
    let any = false;

    for (let li = 0; li < this._layers.length; li++) {
      const L = this._layers[li];
      const pos = L.pos;
      const uvs = L.uvs;
      for (let i = 0; i < pathN; i++) {
        const cx = this._centers[i * 3];
        const cz = this._centers[i * 3 + 1];
        const rot = this._centers[i * 3 + 2];
        // Lateral axis in XZ
        const lx = -Math.sin(rot);
        const lz = Math.cos(rot);
        const half = this._widths[i] * L.widthScale * 0.5;
        const s = pathN <= 1 ? 0 : i / (pathN - 1);
        const i0 = i * 2;
        const i1 = i0 + 1;
        pos[i0 * 3] = cx + lx * half;
        pos[i0 * 3 + 1] = 0;
        pos[i0 * 3 + 2] = cz + lz * half;
        pos[i1 * 3] = cx - lx * half;
        pos[i1 * 3 + 1] = 0;
        pos[i1 * 3 + 2] = cz - lz * half;
        uvs[i0 * 2] = s;
        uvs[i0 * 2 + 1] = 0;
        uvs[i1 * 2] = s;
        uvs[i1 * 2 + 1] = 1;
      }
      L.posAttr.needsUpdate = true;
      L.uvAttr.needsUpdate = true;
      L.geo.setDrawRange(0, Math.max(0, (pathN - 1) * 6));
      L.mesh.visible = pathN >= 2;
      const u = L.mat.uniforms;
      u.uTime.value = this._time;
      u.uScroll.value = scroll;
      u.uDrive.value = activeDrive;
      u.uBoost.value = boost;
      u.uOpacity.value = L.baseOpacity * flashScale * (0.75 + activeDrive * 0.35);
      u.uRadiance.value = L.baseRadiance * boostR * flashScale * (0.8 + activeDrive * 0.35);
      any = any || L.mesh.visible;
    }

    return {
      live: any ? pathN : 0,
      pathPoints: pathN,
      continuous: true,
      medium: 'liquid-strip-layers',
    };
  }

  inspect() {
    return {
      live: this._active ? 1 : 0,
      continuous: true,
      medium: 'liquid-strip-layers',
      capacity: this.nSeg,
      active: this._active,
      path: this.sampler.inspect(),
      recipeId: this.recipe && this.recipe.id,
      layers: this._layers.map((L) => L.role),
      drive: this._lastDrive,
      boost: this._lastBoost,
    };
  }
}

export default PlasmaStreamSystem;
