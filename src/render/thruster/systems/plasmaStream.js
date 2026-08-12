/**
 * Continuous liquid plasma thruster — soft camera-facing multi-layer strips.
 * Hot wide root + continuous thinner wake. Organic liquid filaments.
 * Soft torn edges via shader falloff (no hard tube mesh facets).
 * Not beads, not cards, not solid cone/cylinder primitive.
 */
import * as THREE from 'three';
import { createPathSampler } from './pathSampler.js';
import {
  PLAYER_PLASMA_STREAM_RECIPE,
  samplePlasmaEnvelope,
} from '../recipes/plasmaStreamRecipe.js';

const LIQUID_VERT = /* glsl */`
  varying vec2 vPathUv;
  void main() {
    vPathUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Soft liquid plasma strip: soft radial falloff kills hard silhouette;
// domain-warped noise filaments = organic weave, not regular lanes.
const LIQUID_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vPathUv;
  uniform float uTime;
  uniform float uScroll;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadiance;
  uniform float uLayerRole;
  uniform float uDrive;
  uniform float uBoost;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 74.13);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.13 + vec2(19.1, 7.3);
      a *= 0.52;
    }
    return v;
  }

  void main() {
    float pathT = clamp(vPathUv.x, 0.0, 1.0);
    float side = vPathUv.y * 2.0 - 1.0; // -1..1 across soft strip

    float flow = pathT * 8.5 - uScroll * 3.5 - uTime * 0.85;
    // Domain warp for organic liquid (not regular stripes)
    float w1 = fbm(vec2(flow * 0.9, side * 1.8)) - 0.5;
    float w2 = fbm(vec2(flow * 1.8 + 2.0, side * 2.6 + 1.0)) - 0.5;
    float fx = flow + w1 * 1.6 + w2 * 0.7;
    float fy = side * 2.4 + w1 * 0.9;

    float n  = fbm(vec2(fx * 1.05, fy));
    float n2 = fbm(vec2(fx * 2.4 + 2.0, fy * 1.6 + 1.0));
    float n3 = fbm(vec2(fx * 5.0 + 7.0, fy * 2.5 + uTime * 0.35));
    float n4 = vnoise(vec2(fx * 11.0, fy * 5.0 + uTime * 0.8));

    // Soft torn edge (not hard cylinder rim)
    float sideW = side + w1 * 0.35 + w2 * 0.18;
    float absSide = abs(sideW);
    float edgeStart = 0.28 + n * 0.28 + n2 * 0.12;
    float edgeEnd = 1.05 + n3 * 0.18;
    float softEdge = 1.0 - smoothstep(edgeStart, edgeEnd, absSide);
    softEdge *= 0.55 + n * 0.3 + n2 * 0.2 + n4 * 0.15;
    softEdge = max(softEdge, 0.0);

    // Organic liquid filaments
    float filA = smoothstep(0.38, 0.78, n2) * smoothstep(0.32, 0.75, n);
    float filB = smoothstep(0.45, 0.85, n3) * exp(-absSide * 1.8);
    float filC = pow(max(0.0, n4 - 0.42), 1.35) * exp(-absSide * 1.2);
    float streamers = (filA * 1.2 + filB * 0.9 + filC * 0.7)
      * (1.0 - smoothstep(0.3, 0.95, pathT) * 0.5);
    streamers = min(streamers * 1.75, 2.6);

    float core = exp(-absSide * absSide * 10.0) * (0.3 + streamers * 0.75);
    float body = exp(-absSide * absSide * 2.4) * (0.32 + n * 0.4 + streamers * 0.5);
    float sheath = exp(-absSide * absSide * 0.85) * (0.28 + n2 * 0.5 + n3 * 0.3);

    float head = (1.0 - smoothstep(0.0, 0.14, pathT)) * smoothstep(0.0, 0.025, pathT);
    float mid = 1.0 - smoothstep(0.05, 0.55, pathT);
    float tipFray = smoothstep(0.28, 0.88, pathT);
    float tipFade = 1.0 - smoothstep(0.58, 1.0, pathT);
    float breakup = mix(1.0, 0.25 + n3 * 0.8 + n2 * 0.4 + n4 * 0.3, tipFray);
    float belly = exp(-((pathT - 0.16) * (pathT - 0.16)) / 0.03);
    float along = (head * 1.25 + mid * 1.0 + belly * 0.32 + tipFray * sheath * 1.3)
      * breakup * tipFade * (0.8 + uDrive * 0.3 + uBoost * 0.12);

    // Core keeps mass so rear view is not a laser needle
    float dens;
    if (uLayerRole < 0.5) {
      dens = softEdge * (0.35 + streamers * 1.2 + core * 0.95 + body * 0.45);
    } else if (uLayerRole < 1.5) {
      dens = softEdge * (0.4 + body * 0.95 + streamers * 0.9 + core * 0.3 + sheath * 0.3);
    } else {
      dens = softEdge * (0.32 + sheath * 1.2 + body * 0.35 + streamers * 0.35 + n3 * 0.35);
    }

    float alpha = clamp(uOpacity * dens * along, 0.0, 1.0);
    if (alpha < 0.014) discard;

    vec3 whiteHot = vec3(1.0, 0.99, 0.96);
    vec3 midCyan = mix(uColor, vec3(0.42, 0.86, 1.0), 0.55);
    vec3 deep = mix(uColor, vec3(0.04, 0.12, 0.55), 0.55);
    float hot = clamp(
      streamers * 0.3 * (1.0 - pathT * 0.78)
      + head * 0.4
      + core * 0.2 * (1.0 - pathT * 0.5)
      + uBoost * 0.08,
      0.0, 1.0
    );
    vec3 col = mix(deep, midCyan, clamp(body + sheath * 0.5 + n * 0.3 + streamers * 0.25, 0.0, 1.0));
    col = mix(col, whiteHot, hot * (0.5 + (1.0 - step(0.5, uLayerRole)) * 0.4));
    col = mix(col, mix(midCyan, whiteHot, 0.78), min(streamers, 1.8) * 0.52 * (1.0 - pathT * 0.28));
    float glow = uRadiance * (0.38 + streamers * 0.28 + head * 0.16 + body * 0.07 + core * 0.1);
    col *= min(glow, 1.55);

    gl_FragColor = vec4(col, alpha);
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
    depthTest: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    toneMapped: false,
  });
}

function makeStripMesh(T, nSeg, layer, nameSuffix) {
  const verts = nSeg * 2;
  const pos = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const geo = new T.BufferGeometry();
  const posAttr = new T.BufferAttribute(pos, 3);
  posAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  const uvAttr = new T.BufferAttribute(uvs, 2);
  uvAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('uv', uvAttr);
  const idx = [];
  for (let i = 0; i < nSeg - 1; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mat = createLayerMaterial(layer, T);
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12 + (layer.role === 'sheath' ? 0 : layer.role === 'body' ? 1 : 2);
  mesh.name = `sf-liquid-plasma-${layer.role || 'body'}${nameSuffix || ''}`;
  mesh.visible = false;
  return { mesh, geo, pos, uvs, posAttr, uvAttr, mat };
}

function hash2(i, j) {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class PlasmaStreamSystem {
  constructor(THREE_NS, recipe = PLAYER_PLASMA_STREAM_RECIPE) {
    this.THREE = THREE_NS || THREE;
    this.recipe = recipe || PLAYER_PLASMA_STREAM_RECIPE;
    const pathCfg = this.recipe.path || {};
    this.nSeg = Math.max(16, pathCfg.capacity || 56);
    this.sampler = createPathSampler(this.nSeg);
    this._pathX = new Float32Array(this.nSeg);
    this._pathZ = new Float32Array(this.nSeg);
    this._pathS = new Float32Array(this.nSeg);
    this._cx = new Float32Array(this.nSeg);
    this._cy = new Float32Array(this.nSeg);
    this._cz = new Float32Array(this.nSeg);
    this._ax = new Float32Array(this.nSeg);
    this._ay = new Float32Array(this.nSeg);
    this._az = new Float32Array(this.nSeg);
    this._widths = new Float32Array(this.nSeg);
    this._env = {
      s: 0, width: 1, heat: 1, opacity: 1, density: 1,
      filament: 0, root: 0, jet: 0, wake: 0, rootWindow: 0, jetWindow: 0, wakeWindow: 0,
    };
    this._cam = { x: 0, y: 8, z: 12 };
    this.group = null;
    this._layers = [];
    this._time = 0;
    this._disposed = false;
    this._active = false;
    this._lastDrive = 0;
    this._lastBoost = 0;
    this._pointCount = 0;
  }

  setCamera(camera) {
    if (!camera || !camera.position) return;
    this._cam.x = camera.position.x;
    this._cam.y = camera.position.y;
    this._cam.z = camera.position.z;
  }

  setCameraPosition(x, y, z) {
    this._cam.x = x;
    this._cam.y = y;
    this._cam.z = z;
  }

  attach(scene) {
    if (this._disposed || !scene || this.group) return this.group;
    const T = this.THREE;
    this.group = new T.Group();
    this.group.name = 'sf-liquid-plasma-root';
    const layers = this.recipe.layers || [];
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const primary = makeStripMesh(T, this.nSeg, layer, '');
      this.group.add(primary.mesh);
      this._layers.push({
        role: layer.role || 'body',
        widthScale: layer.widthScale != null ? layer.widthScale : 1,
        baseOpacity: layer.opacity != null ? layer.opacity : 0.7,
        baseRadiance: layer.radiance != null ? layer.radiance : 1.6,
        plane: 'primary',
        ...primary,
      });
      // Soft cross body — low opacity volume fill (avoid hard dual cards)
      if (layer.cross) {
        const cross = makeStripMesh(T, this.nSeg, layer, '-cross');
        cross.mesh.renderOrder = primary.mesh.renderOrder - 1;
        this.group.add(cross.mesh);
        this._layers.push({
          role: layer.role || 'body',
          widthScale: (layer.widthScale != null ? layer.widthScale : 1) * 0.8,
          baseOpacity: (layer.opacity != null ? layer.opacity : 0.7) * 0.42,
          baseRadiance: (layer.radiance != null ? layer.radiance : 1.6) * 0.7,
          plane: 'cross',
          ...cross,
        });
      }
    }
    scene.add(this.group);
    return this.group;
  }

  reset() {
    this.sampler.clear();
    this._active = false;
    this._pointCount = 0;
    for (let i = 0; i < this._layers.length; i++) {
      this._layers[i].mesh.visible = false;
      this._layers[i].geo.setDrawRange(0, 0);
    }
    if (this.group) this.group.visible = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    for (let i = 0; i < this._layers.length; i++) {
      this._layers[i].geo.dispose();
      this._layers[i].mat.dispose();
    }
    this._layers.length = 0;
    this.group = null;
  }

  _buildCenterline(nx, ny, nz, dirX, dirY, dirZ, pathN, activeDrive, boost, rootMul, boostW) {
    const nearLen = (this.recipe.path?.nearJetLengthWU != null)
      ? this.recipe.path.nearJetLengthWU
      : 15;
    const nearN = Math.min(56, Math.floor(this.nSeg * 0.58));
    const histBudget = this.nSeg - nearN;
    const histUse = Math.min(Math.max(0, pathN - 1), histBudget);
    let count = 0;
    const swaySeed = this._time * 0.7;

    for (let j = 0; j < nearN && count < this.nSeg; j++) {
      const u = j / Math.max(1, nearN - 1);
      const dist = u * nearLen * (0.88 + activeDrive * 0.22 + boost * 0.18);
      const s = u * 0.48;
      samplePlasmaEnvelope(s, activeDrive, boost, this._env);
      const sway = Math.sin(swaySeed + u * 4.2) * 0.12 * u
        + Math.sin(swaySeed * 1.7 + u * 9.0) * 0.05 * u;
      const pxp = -dirZ;
      const pzp = dirX;
      this._cx[count] = nx + dirX * dist + pxp * sway;
      this._cy[count] = ny + dirY * dist + Math.sin(swaySeed * 0.9 + u * 5.5) * 0.04 * u;
      this._cz[count] = nz + dirZ * dist + pzp * sway;
      this._ax[count] = dirX;
      this._ay[count] = dirY;
      this._az[count] = dirZ;
      let w = this._env.width * rootMul * boostW;
      if (j === 0) w *= 0.88;
      else if (j < 4) w *= 1.1;
      w *= 0.92 + 0.14 * hash2(j, Math.floor(swaySeed * 10));
      this._widths[count] = w;
      count++;
    }

    for (let h = 1; h <= histUse && count < this.nSeg; h++) {
      const sHist = 0.48 + (h / Math.max(1, histUse)) * 0.52;
      samplePlasmaEnvelope(sHist, activeDrive, boost, this._env);
      this._cx[count] = this._pathX[h];
      this._cy[count] = ny;
      this._cz[count] = this._pathZ[h];
      const px = this._cx[count - 1];
      const py = this._cy[count - 1];
      const pz = this._cz[count - 1];
      let tx = px - this._cx[count];
      let ty = py - this._cy[count];
      let tz = pz - this._cz[count];
      const tl = Math.hypot(tx, ty, tz) || 1;
      this._ax[count] = tx / tl;
      this._ay[count] = ty / tl;
      this._az[count] = tz / tl;
      this._widths[count] = this._env.width * rootMul * boostW * (0.9 + 0.15 * hash2(h, 5));
      count++;
    }

    if (count > 2) {
      const tmp = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const a = this._widths[Math.max(0, i - 1)];
        const b = this._widths[i];
        const c = this._widths[Math.min(count - 1, i + 1)];
        tmp[i] = a * 0.25 + b * 0.5 + c * 0.25;
      }
      for (let i = 0; i < count; i++) this._widths[i] = tmp[i];
    }

    this._pointCount = count;
    return count;
  }

  _lateralFor(px, py, pz, ax, ay, az, plane) {
    const camX = this._cam.x;
    const camY = this._cam.y;
    const camZ = this._cam.z;
    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (Math.abs(ay) > 0.92) { ux = 1; uy = 0; uz = 0; }
    let s0x = ay * uz - az * uy;
    let s0y = az * ux - ax * uz;
    let s0z = ax * uy - ay * ux;
    let s0l = Math.hypot(s0x, s0y, s0z) || 1;
    s0x /= s0l; s0y /= s0l; s0z /= s0l;

    let tx = camX - px;
    let ty = camY - py;
    let tz = camZ - pz;
    const ad = tx * ax + ty * ay + tz * az;
    tx -= ax * ad; ty -= ay * ad; tz -= az * ad;
    let sl = Math.hypot(tx, ty, tz);
    let sx;
    let sy;
    let sz;
    if (sl > 0.08) {
      tx /= sl; ty /= sl; tz /= sl;
      if (s0x * tx + s0y * ty + s0z * tz < 0) { s0x = -s0x; s0y = -s0y; s0z = -s0z; }
      const blend = Math.min(1, sl * 2.5);
      sx = s0x * (1 - blend) + tx * blend;
      sy = s0y * (1 - blend) + ty * blend;
      sz = s0z * (1 - blend) + tz * blend;
      const bl = Math.hypot(sx, sy, sz) || 1;
      sx /= bl; sy /= bl; sz /= bl;
    } else {
      sx = s0x; sy = s0y; sz = s0z;
    }

    if (plane === 'cross') {
      let cx = ay * sz - az * sy;
      let cy = az * sx - ax * sz;
      let cz = ax * sy - ay * sx;
      const cl = Math.hypot(cx, cy, cz) || 1;
      return { x: cx / cl, y: cy / cl, z: cz / cl };
    }
    return { x: sx, y: sy, z: sz };
  }

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
    const primary = list ? list[0] : { x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 };
    let dirX = Number.isFinite(primary.ax) ? primary.ax : -1;
    let dirY = Number.isFinite(primary.ay) ? primary.ay : 0;
    let dirZ = Number.isFinite(primary.az) ? primary.az : 0;
    const dLen = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= dLen; dirY /= dLen; dirZ /= dLen;
    const nx = primary.x || 0;
    const ny = primary.y || 0;
    const nz = primary.z || 0;

    const pathCfg = this.recipe.path || {};
    const spacing = pathCfg.sampleSpacingWU || 0.5;
    const disc = Math.min(
      pathCfg.discontinuityMaxWU || 640,
      Math.max(pathCfg.discontinuityFloorWU || 160, speed * 0.08 + 80),
    );
    const period = 1 / Math.max(12, pathCfg.sampleHz || 40);
    this.sampler.follow(
      nx, nz, Math.atan2(dirZ, dirX), dt, owner || primary, spacing, disc, period,
    );
    const pathN = this.sampler.sampleInto(this._pathX, this._pathZ, this._pathS, this.nSeg);

    const nSock = list ? Math.min(list.length, 4) : 1;
    const rootMul = 1 + Math.min(0.4, (nSock - 1) * 0.1);
    const driveCfg = this.recipe.drive || {};
    const boostW = 1 + (driveCfg.boostWidthMul != null ? driveCfg.boostWidthMul - 1 : 0.35) * boost;
    const boostR = 1 + (driveCfg.boostRadianceMul != null ? driveCfg.boostRadianceMul - 1 : 0.4) * boost;
    const flashScale = a11y && a11y.reducedFlash ? 0.72 : 1;
    const motionScroll = a11y && a11y.reducedMotion ? 0.12 : 1;

    const count = this._buildCenterline(
      nx, ny, nz, dirX, dirY, dirZ, pathN, activeDrive, boost, rootMul, boostW,
    );
    if (count < 2) {
      for (let i = 0; i < this._layers.length; i++) {
        this._layers[i].mesh.visible = false;
        this._layers[i].geo.setDrawRange(0, 0);
      }
      this._active = false;
      return { live: 0, pathPoints: pathN, continuous: true };
    }

    const scroll = (this._time * 0.7 * motionScroll) % 1;
    this.group.visible = true;
    this._active = true;

    for (let li = 0; li < this._layers.length; li++) {
      const L = this._layers[li];
      const pos = L.pos;
      const uvs = L.uvs;
      for (let i = 0; i < count; i++) {
        const px = this._cx[i];
        const py = this._cy[i];
        const pz = this._cz[i];
        let ax = this._ax[i];
        let ay = this._ay[i];
        let az = this._az[i];
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al; ay /= al; az /= al;
        const lat = this._lateralFor(px, py, pz, ax, ay, az, L.plane);
        let w0 = this._widths[i];
        if (i > 0) w0 = w0 * 0.65 + this._widths[i - 1] * 0.35;
        if (i + 1 < count) w0 = w0 * 0.75 + this._widths[i + 1] * 0.25;
        const half = w0 * L.widthScale * 0.5;
        const s = count <= 1 ? 0 : i / (count - 1);
        const i0 = i * 2;
        const i1 = i0 + 1;
        pos[i0 * 3] = px + lat.x * half;
        pos[i0 * 3 + 1] = py + lat.y * half;
        pos[i0 * 3 + 2] = pz + lat.z * half;
        pos[i1 * 3] = px - lat.x * half;
        pos[i1 * 3 + 1] = py - lat.y * half;
        pos[i1 * 3 + 2] = pz - lat.z * half;
        uvs[i0 * 2] = s;
        uvs[i0 * 2 + 1] = 0;
        uvs[i1 * 2] = s;
        uvs[i1 * 2 + 1] = 1;
      }
      L.posAttr.needsUpdate = true;
      L.uvAttr.needsUpdate = true;
      L.geo.setDrawRange(0, Math.max(0, (count - 1) * 6));
      L.mesh.visible = count >= 2;
      const u = L.mat.uniforms;
      u.uTime.value = this._time;
      u.uScroll.value = scroll;
      u.uDrive.value = activeDrive;
      u.uBoost.value = boost;
      u.uOpacity.value = Math.min(1.05, L.baseOpacity * flashScale * (0.95 + activeDrive * 0.25));
      u.uRadiance.value = L.baseRadiance * boostR * flashScale * (0.95 + activeDrive * 0.25);
    }

    return {
      live: count,
      pathPoints: pathN,
      continuous: true,
      medium: 'liquid-billboard-layers',
      pointCount: count,
      construction: 'soft-camera-facing-strips',
    };
  }

  inspect() {
    return {
      live: this._active ? this._pointCount : 0,
      continuous: true,
      medium: 'liquid-billboard-layers',
      capacity: this.nSeg,
      active: this._active,
      path: this.sampler.inspect(),
      recipeId: this.recipe && this.recipe.id,
      layers: this._layers.map((L) => `${L.role}:${L.plane}`),
      drive: this._lastDrive,
      boost: this._lastBoost,
      pointCount: this._pointCount,
      construction: 'soft-camera-facing-strips',
    };
  }
}

export default PlasmaStreamSystem;
