/**
 * Unified plasma thruster stream — soft particles along a shared path sampler.
 * One medium for wide hot root + thinner history wake (not solid ribbon + cone cards).
 */
import * as THREE from 'three';
import { createPathSampler } from './pathSampler.js';
import {
  PLAYER_PLASMA_STREAM_RECIPE,
  samplePlasmaEnvelope,
} from '../recipes/plasmaStreamRecipe.js';

const VERT = /* glsl */`
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aStretch;
  attribute float aAxis;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vStretch;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vStretch = aStretch;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = aSize * (uScale / max(-mv.z, 1.0));
    // Mild stretch along thruster axis in screen-ish size (full filament stretch is CPU size).
    gl_PointSize = clamp(size * (1.0 + aStretch * 0.35), 1.0, 96.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vStretch;
  uniform sampler2D uMap;
  void main() {
    vec2 uv = gl_PointCoord;
    // Soft radial plasma body; stretch squeezes the cross-section slightly.
    vec2 c = uv - vec2(0.5);
    c.x *= 1.0 + vStretch * 0.65;
    float r = length(c) * 2.0;
    float soft = exp(-r * r * 2.8);
    float filament = exp(-abs(c.y) * 6.5) * exp(-c.x * c.x * 3.5) * 0.55;
    float mask = max(soft, filament * vStretch);
    if (mask < 0.02) discard;
    float a = vAlpha * mask;
    gl_FragColor = vec4(vColor * (0.75 + mask * 0.55), a);
  }
`;

function makeSoftPlasmaTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r2 = dx * dx + dy * dy;
      const soft = Math.exp(-r2 * 3.2);
      const ring = Math.exp(-Math.abs(Math.sqrt(Math.max(r2, 1e-6)) - 0.35) * 8.0) * 0.25;
      const v = Math.min(1, soft + ring);
      const i = (y * size + x) * 4;
      const b = Math.round(v * 255);
      data[i] = b;
      data[i + 1] = b;
      data[i + 2] = b;
      data[i + 3] = b;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.name = 'sf-plasma-soft-v1';
  return tex;
}

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {typeof THREE} THREE_NS
 * @param {object} [recipe]
 * @param {{ capacity?: number }} [opts]
 */
export class PlasmaStreamSystem {
  constructor(THREE_NS, recipe = PLAYER_PLASMA_STREAM_RECIPE, opts = {}) {
    this.THREE = THREE_NS || THREE;
    this.recipe = recipe || PLAYER_PLASMA_STREAM_RECIPE;
    const pathCfg = this.recipe.path || {};
    this.sampler = createPathSampler(pathCfg.capacity || 36);
    const capTier = this.recipe.capacity || {};
    this.capacity = Math.max(64, opts.capacity || capTier.high || 520);

    this._px = new Float32Array(this.capacity);
    this._pz = new Float32Array(this.capacity);
    this._py = new Float32Array(this.capacity);
    this._vx = new Float32Array(this.capacity);
    this._vz = new Float32Array(this.capacity);
    this._vy = new Float32Array(this.capacity);
    this._age = new Float32Array(this.capacity);
    this._life = new Float32Array(this.capacity);
    this._size0 = new Float32Array(this.capacity);
    this._size1 = new Float32Array(this.capacity);
    this._alpha0 = new Float32Array(this.capacity);
    this._cr = new Float32Array(this.capacity);
    this._cg = new Float32Array(this.capacity);
    this._cb = new Float32Array(this.capacity);
    this._cr1 = new Float32Array(this.capacity);
    this._cg1 = new Float32Array(this.capacity);
    this._cb1 = new Float32Array(this.capacity);
    this._stretch = new Float32Array(this.capacity);
    this._axis = new Float32Array(this.capacity);
    this._alive = new Uint8Array(this.capacity);
    this._head = 0;
    this._live = 0;
    this._seed = 1;

    this._pathX = new Float32Array(pathCfg.capacity || 36);
    this._pathZ = new Float32Array(pathCfg.capacity || 36);
    this._pathS = new Float32Array(pathCfg.capacity || 36);
    this._env = {
      s: 0, width: 0, density: 0, heat: 0, filament: 0,
      rootWindow: 0, jetWindow: 0, wakeWindow: 0,
    };
    this._spawnAcc = { core: 0, body: 0, filament: 0 };

    this._gPos = new Float32Array(this.capacity * 3);
    this._gCol = new Float32Array(this.capacity * 3);
    this._gSize = new Float32Array(this.capacity);
    this._gAlpha = new Float32Array(this.capacity);
    this._gStretch = new Float32Array(this.capacity);
    this._gAxis = new Float32Array(this.capacity);

    this.group = null;
    this._points = null;
    this._mat = null;
    this._tex = null;
    this._geo = null;
    this._disposed = false;
    this._active = false;
  }

  attach(scene) {
    if (this._disposed || !scene || this.group) return this.group;
    const T = this.THREE;
    this._tex = makeSoftPlasmaTexture();
    this._geo = new T.BufferGeometry();
    const pos = new T.BufferAttribute(this._gPos, 3);
    pos.setUsage(T.DynamicDrawUsage);
    const col = new T.BufferAttribute(this._gCol, 3);
    col.setUsage(T.DynamicDrawUsage);
    const size = new T.BufferAttribute(this._gSize, 1);
    size.setUsage(T.DynamicDrawUsage);
    const alpha = new T.BufferAttribute(this._gAlpha, 1);
    alpha.setUsage(T.DynamicDrawUsage);
    const stretch = new T.BufferAttribute(this._gStretch, 1);
    stretch.setUsage(T.DynamicDrawUsage);
    const axis = new T.BufferAttribute(this._gAxis, 1);
    axis.setUsage(T.DynamicDrawUsage);
    this._geo.setAttribute('position', pos);
    this._geo.setAttribute('aColor', col);
    this._geo.setAttribute('aSize', size);
    this._geo.setAttribute('aAlpha', alpha);
    this._geo.setAttribute('aStretch', stretch);
    this._geo.setAttribute('aAxis', axis);
    this._geo.setDrawRange(0, 0);

    this._mat = new T.ShaderMaterial({
      uniforms: {
        uScale: { value: 420 },
        uMap: { value: this._tex },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: T.AdditiveBlending,
    });
    this._points = new T.Points(this._geo, this._mat);
    this._points.frustumCulled = false;
    this._points.renderOrder = 11;
    this._points.name = 'sf-plasma-stream';
    this.group = new T.Group();
    this.group.name = 'sf-plasma-stream-root';
    this.group.add(this._points);
    scene.add(this.group);
    return this.group;
  }

  reset() {
    this.sampler.clear();
    for (let i = 0; i < this.capacity; i++) this._alive[i] = 0;
    this._live = 0;
    this._head = 0;
    this._spawnAcc.core = 0;
    this._spawnAcc.body = 0;
    this._spawnAcc.filament = 0;
    if (this._geo) this._geo.setDrawRange(0, 0);
    if (this.group) this.group.visible = false;
    this._active = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    if (this._geo) this._geo.dispose();
    if (this._mat) this._mat.dispose();
    if (this._tex) this._tex.dispose();
    this.group = null;
    this._points = null;
  }

  _alloc() {
    // Prefer free slot; else recycle oldest (round-robin head).
    for (let n = 0; n < this.capacity; n++) {
      const i = (this._head + n) % this.capacity;
      if (!this._alive[i]) {
        this._head = (i + 1) % this.capacity;
        this._alive[i] = 1;
        this._live++;
        return i;
      }
    }
    const i = this._head;
    this._head = (i + 1) % this.capacity;
    return i;
  }

  _spawnRole(roleKey, x, z, dirX, dirZ, env, drive, boost, a11yScale) {
    const roles = this.recipe.roles || {};
    const role = roles[roleKey];
    if (!role) return;
    const spawn = this.recipe.spawn || {};
    const i = this._alloc();
    const jitter = (spawn.lateralJitter || 1.2) * env.width * (0.35 + hash01(this._seed++) * 0.65);
    const side = hash01(this._seed++) * 2 - 1;
    // Perpendicular in XZ
    const px = -dirZ * side * jitter;
    const pz = dirX * side * jitter;
    const exhaust = (spawn.exhaustSpeed || 16) * (0.55 + drive * 0.7 + boost * 0.45);
    const spread = (hash01(this._seed++) - 0.5) * 0.35;
    const fx = dirX * Math.cos(spread) - dirZ * Math.sin(spread);
    const fz = dirX * Math.sin(spread) + dirZ * Math.cos(spread);
    this._px[i] = x + px * 0.25;
    this._pz[i] = z + pz * 0.25;
    this._py[i] = (hash01(this._seed++) - 0.5) * env.width * 0.35;
    this._vx[i] = fx * exhaust + px * 2.2;
    this._vz[i] = fz * exhaust + pz * 2.2;
    this._vy[i] = (hash01(this._seed++) - 0.5) * 2.5;
    const lifeMul = roleKey === 'core' ? 0.7 + env.rootWindow * 0.5 : 1;
    this._life[i] = (role.life || 0.2) * lifeMul * (0.75 + drive * 0.4);
    this._age[i] = 0;
    const sizeMul = (spawn.boostSizeMul && boost > 0
      ? 1 + (spawn.boostSizeMul - 1) * boost
      : 1) * env.width * (0.55 + env.heat * 0.5) * a11yScale;
    this._size0[i] = (role.size0 || 2) * sizeMul;
    this._size1[i] = (role.size1 || 0.5) * sizeMul * 0.85;
    this._alpha0[i] = Math.min(1, 0.35 + env.density * 0.4 + env.heat * 0.35);
    const c0 = role.color0 || [1, 1, 1];
    const c1 = role.color1 || [0.3, 0.6, 1];
    // Heat shifts body toward white-hot near root.
    const heat = Math.min(1, env.heat);
    this._cr[i] = c0[0] * (1 - heat * 0.15) + heat * 1.0;
    this._cg[i] = c0[1] * (1 - heat * 0.1) + heat * 0.98;
    this._cb[i] = c0[2] * (1 - heat * 0.05) + heat * 0.94;
    this._cr1[i] = c1[0];
    this._cg1[i] = c1[1];
    this._cb1[i] = c1[2];
    this._stretch[i] = roleKey === 'filament'
      ? (role.stretch || 2) * (0.7 + env.filament)
      : (role.stretch || 0.3) * (0.5 + env.jetWindow);
    this._axis[i] = Math.atan2(dirZ, dirX);
  }

  /**
   * @param {number} dt
   * @param {{x:number,z:number,ax?:number,az?:number}[]} sockets frame-local nozzle poses
   * @param {{drive:number,throttle:number,boost:number,speed?:number}} driveInfo
   * @param {{reducedMotion?:boolean,reducedFlash?:boolean,lowQuality?:boolean}} [a11y]
   * @param {object} [owner] identity for path reset
   */
  update(dt, sockets, driveInfo, a11y = null, owner = null) {
    if (this._disposed || !this.group) return { live: 0, pathPoints: 0 };
    const drive = Math.max(0, driveInfo && driveInfo.drive || 0);
    const throttle = Math.max(0, driveInfo && driveInfo.throttle || 0);
    const boost = Math.max(0, driveInfo && driveInfo.boost || 0);
    const speed = Math.max(0, driveInfo && driveInfo.speed || 0);
    const activeDrive = Math.max(drive, throttle, boost > 0 ? 0.5 : 0);

    if (activeDrive < 0.03 && speed < 6) {
      // Integrate residual particles briefly, then sleep.
      this._integrate(dt);
      this._commitGpu();
      if (this._live <= 0) {
        this.group.visible = false;
        this._active = false;
        this.sampler.clear();
      }
      return { live: this._live, pathPoints: 0 };
    }

    this.group.visible = true;
    this._active = true;
    const pathCfg = this.recipe.path || {};
    const spacing = pathCfg.sampleSpacingWU || 1.65;
    const disc = Math.min(
      pathCfg.discontinuityMaxWU || 640,
      Math.max(pathCfg.discontinuityFloorWU || 160, speed * 0.08 + 80),
    );
    const period = 1 / Math.max(12, pathCfg.sampleHz || 36);
    const list = sockets && sockets.length ? sockets : null;
    const nSock = list ? Math.min(list.length, 4) : 1;

    // One history path from the primary nozzle (multi-socket roots spawn at each bell).
    const primary = list ? list[0] : { x: 0, z: 0, ax: 1, az: 0 };
    let dirX = Number.isFinite(primary.ax) ? primary.ax : 1;
    let dirZ = Number.isFinite(primary.az) ? primary.az : 0;
    const dLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dLen;
    dirZ /= dLen;
    this.sampler.follow(
      primary.x, primary.z,
      Math.atan2(dirZ, dirX),
      dt,
      owner || primary,
      spacing,
      disc,
      period,
    );

    const pathN = this.sampler.sampleInto(this._pathX, this._pathZ, this._pathS, this._pathX.length);
    const spawn = this.recipe.spawn || {};
    let rateScale = 1;
    if (a11y && a11y.reducedMotion) rateScale *= this.recipe.a11y?.reducedMotionRateScale ?? 0.35;
    if (a11y && a11y.lowQuality) rateScale *= this.recipe.a11y?.lowQualityRateScale ?? 0.45;
    if (boost > 0) rateScale *= spawn.boostRateMul || 1.45;
    rateScale *= 0.45 + activeDrive * 0.7;

    const a11ySize = a11y && a11y.reducedFlash ? 0.85 : 1;
    const heatCap = a11y && a11y.reducedFlash
      ? (this.recipe.a11y?.reducedFlashHeatCap ?? 0.55)
      : 1.4;

    // Root burst at every nozzle socket (wide hot thrust at the bells).
    for (let s = 0; s < nSock; s++) {
      const sock = list ? list[s] : primary;
      let sx = Number.isFinite(sock.ax) ? sock.ax : dirX;
      let sz = Number.isFinite(sock.az) ? sock.az : dirZ;
      const sl = Math.hypot(sx, sz) || 1;
      sx /= sl;
      sz /= sl;
      const env = samplePlasmaEnvelope(0, activeDrive, boost, this._env);
      env.heat = Math.min(env.heat, heatCap);
      const rootWeight = 1.1 / nSock;
      this._spawnAcc.core += (spawn.rateCore || 50) * env.density * rateScale * rootWeight * dt * 1.6;
      this._spawnAcc.body += (spawn.rateBody || 80) * env.density * rateScale * rootWeight * dt * 1.25;
      this._spawnAcc.filament += (spawn.rateFilament || 40) * env.filament * rateScale * rootWeight * dt;
      while (this._spawnAcc.core >= 1) {
        this._spawnAcc.core -= 1;
        this._spawnRole('core', sock.x, sock.z, sx, sz, env, activeDrive, boost, a11ySize);
      }
      while (this._spawnAcc.body >= 1) {
        this._spawnAcc.body -= 1;
        this._spawnRole('body', sock.x, sock.z, sx, sz, env, activeDrive, boost, a11ySize);
      }
      while (this._spawnAcc.filament >= 1) {
        this._spawnAcc.filament -= 1;
        this._spawnRole('filament', sock.x, sock.z, sx, sz, env, activeDrive, boost, a11ySize);
      }
    }

    // History wake along the shared path (skip live head — already handled as root).
    for (let p = 1; p < pathN; p++) {
      const s = this._pathS[p];
      const env = samplePlasmaEnvelope(s, activeDrive, boost, this._env);
      env.heat = Math.min(env.heat, heatCap);
      const x = this._pathX[p];
      const z = this._pathZ[p];
      const sampleWeight = Math.max(0.12, 1 - s * 0.88) / Math.max(1, pathN * 0.4);

      this._spawnAcc.body += (spawn.rateBody || 80) * env.density * rateScale * sampleWeight * dt * 0.85;
      this._spawnAcc.filament += (spawn.rateFilament || 40) * env.filament
        * rateScale * sampleWeight * dt * 0.9;

      while (this._spawnAcc.body >= 1) {
        this._spawnAcc.body -= 1;
        this._spawnRole('body', x, z, dirX, dirZ, env, activeDrive, boost, a11ySize);
      }
      while (this._spawnAcc.filament >= 1) {
        this._spawnAcc.filament -= 1;
        this._spawnRole('filament', x, z, dirX, dirZ, env, activeDrive, boost, a11ySize);
      }
    }

    this._integrate(dt);
    this._commitGpu();
    return { live: this._live, pathPoints: pathN };
  }

  _integrate(dt) {
    if (!(dt > 0)) return;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this._alive[i]) continue;
      this._age[i] += dt;
      if (this._age[i] >= this._life[i]) {
        this._alive[i] = 0;
        continue;
      }
      const drag = Math.exp(-1.1 * dt);
      this._vx[i] *= drag;
      this._vz[i] *= drag;
      this._vy[i] *= drag;
      this._px[i] += this._vx[i] * dt;
      this._pz[i] += this._vz[i] * dt;
      this._py[i] += this._vy[i] * dt;
      live++;
    }
    this._live = live;
  }

  _commitGpu() {
    if (!this._geo) return;
    let w = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this._alive[i]) continue;
      const t = this._life[i] > 0 ? this._age[i] / this._life[i] : 1;
      const fade = 1 - t;
      const fadeSq = fade * fade;
      const size = this._size0[i] * (1 - t) + this._size1[i] * t;
      const o = w * 3;
      this._gPos[o] = this._px[i];
      this._gPos[o + 1] = this._py[i];
      this._gPos[o + 2] = this._pz[i];
      this._gCol[o] = this._cr[i] * (1 - t) + this._cr1[i] * t;
      this._gCol[o + 1] = this._cg[i] * (1 - t) + this._cg1[i] * t;
      this._gCol[o + 2] = this._cb[i] * (1 - t) + this._cb1[i] * t;
      this._gSize[w] = size;
      this._gAlpha[w] = this._alpha0[i] * fadeSq;
      this._gStretch[w] = this._stretch[i];
      this._gAxis[w] = this._axis[i];
      w++;
    }
    this._geo.attributes.position.needsUpdate = true;
    this._geo.attributes.aColor.needsUpdate = true;
    this._geo.attributes.aSize.needsUpdate = true;
    this._geo.attributes.aAlpha.needsUpdate = true;
    this._geo.attributes.aStretch.needsUpdate = true;
    this._geo.attributes.aAxis.needsUpdate = true;
    this._geo.setDrawRange(0, w);
    this._live = w;
  }

  inspect() {
    return {
      live: this._live,
      capacity: this.capacity,
      active: this._active,
      path: this.sampler.inspect(),
      recipeId: this.recipe && this.recipe.id,
    };
  }
}

export default PlasmaStreamSystem;
