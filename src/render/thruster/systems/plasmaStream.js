/**
 * Continuous liquid plasma thruster — soft path TUBE (not flat strip cards).
 * Hot wide root + continuous thinner wake. Dense stream filaments in shader.
 * Atlas: continuous body, soft edges, liquid stream structure — not beads/cards/cone.
 */
import * as THREE from 'three';
import { createPathSampler } from './pathSampler.js';
import {
  PLAYER_PLASMA_STREAM_RECIPE,
  samplePlasmaEnvelope,
} from '../recipes/plasmaStreamRecipe.js';

// Radial segments around exhaust axis — soft tube, not dual flat cards
// 18 sides keeps silhouette smooth without looking low-poly faceted.
const RADIAL = 18;

const LIQUID_VERT = /* glsl */`
  varying vec2 vPathUv; // x=path age, y=radial 0..1
  void main() {
    vPathUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

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
      p = p * 2.11 + vec2(17.3, 5.7);
      a *= 0.52;
    }
    return v;
  }

  void main() {
    float pathT = clamp(vPathUv.x, 0.0, 1.0);
    // Angle around tube 0..1 (vertices sit on soft shell; layers give radial depth)
    float ang01 = clamp(vPathUv.y, 0.0, 1.0);
    float ang = ang01 * 6.28318;

    float flow = pathT * 9.0 - uScroll * 3.8 - uTime * 0.9;
    float n  = fbm(vec2(flow * 1.0, ang01 * 3.0));
    float n2 = fbm(vec2(flow * 2.4 + 2.0, ang01 * 4.0 + 1.0));
    float n3 = fbm(vec2(flow * 5.0 + 7.0, ang * 0.8 + uTime * 0.3));
    float n4 = vnoise(vec2(flow * 12.0, ang * 1.5 + uTime));

    // ---- Packed stream filaments as angular bright ropes along flow ----
    float streamers = 0.0;
    for (int k = 0; k < 12; k++) {
      float fk = float(k);
      float laneAng = fk * 0.5236;
      float wob = (vnoise(vec2(flow * 0.6 + fk, fk * 2.1)) - 0.5) * 0.5;
      float dAng = abs(mod(ang - laneAng - wob + 3.14159, 6.28318) - 3.14159);
      float brightness = 0.4 + 0.6 * vnoise(vec2(flow * 2.5 + fk, fk * 4.0));
      float tipFade = 1.0 - smoothstep(0.35, 0.95, pathT) * 0.65;
      streamers += exp(-dAng * dAng * 12.0) * brightness * tipFade;
    }
    streamers = min(streamers, 2.8);

    // Shell surface density: continuous soft plasma skin (no rectangular cards)
    float shell = 0.55 + n * 0.35 + n2 * 0.25;
    shell *= 0.75 + n4 * 0.35; // holes / liquid variation
    float core = (0.35 + streamers * 0.7) * shell;
    float body = (0.45 + streamers * 0.45 + n * 0.3) * shell;
    float sheath = (0.4 + n2 * 0.5 + n3 * 0.25) * shell;

    float head = (1.0 - smoothstep(0.0, 0.15, pathT)) * smoothstep(0.0, 0.03, pathT);
    float mid = 1.0 - smoothstep(0.06, 0.55, pathT);
    float tipFray = smoothstep(0.28, 0.9, pathT);
    float tipFade = 1.0 - smoothstep(0.65, 1.0, pathT);
    float breakup = mix(1.0, 0.3 + n3 * 0.7 + n2 * 0.35, tipFray);
    float belly = exp(-((pathT - 0.18) * (pathT - 0.18)) / 0.03);
    float along = (head * 1.25 + mid * 1.0 + belly * 0.3 + tipFray * sheath * 1.15)
      * breakup * tipFade * (0.8 + uDrive * 0.3 + uBoost * 0.12);

    float dens;
    if (uLayerRole < 0.5) {
      dens = 0.2 + streamers * 1.35 + core * 0.7;
    } else if (uLayerRole < 1.5) {
      dens = 0.35 + body * 0.95 + streamers * 0.8 + core * 0.2;
    } else {
      dens = 0.3 + sheath * 1.1 + body * 0.3 + streamers * 0.25 + n3 * 0.25;
    }

    float alpha = clamp(uOpacity * dens * along, 0.0, 1.0);
    if (alpha < 0.014) discard;

    vec3 whiteHot = vec3(1.0, 0.99, 0.96);
    vec3 midCyan = mix(uColor, vec3(0.45, 0.88, 1.0), 0.5);
    vec3 deep = mix(uColor, vec3(0.05, 0.14, 0.58), 0.55);
    float hot = clamp(
      streamers * 0.32 * (1.0 - pathT * 0.75)
      + head * 0.4
      + core * 0.2 * (1.0 - pathT * 0.5)
      + uBoost * 0.08,
      0.0, 1.0
    );
    vec3 col = mix(deep, midCyan, clamp(body + sheath * 0.5 + n * 0.3 + streamers * 0.2, 0.0, 1.0));
    col = mix(col, whiteHot, hot * (0.55 + (1.0 - step(0.5, uLayerRole)) * 0.4));
    col = mix(col, mix(midCyan, whiteHot, 0.75), min(streamers, 1.6) * 0.48 * (1.0 - pathT * 0.3));
    float glow = uRadiance * (0.4 + streamers * 0.25 + head * 0.18 + body * 0.08 + core * 0.12);
    col *= min(glow, 1.8);

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

function makeTubeMesh(T, nSeg, radial, layer) {
  // (nSeg) rings × (radial) verts per ring
  const nR = radial;
  const verts = nSeg * nR;
  const pos = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const geo = new T.BufferGeometry();
  const posAttr = new T.BufferAttribute(pos, 3);
  posAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  const uvAttr = new T.BufferAttribute(uvs, 2);
  uvAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('uv', uvAttr);
  // Quads between rings
  const idx = [];
  for (let i = 0; i < nSeg - 1; i++) {
    for (let r = 0; r < nR; r++) {
      const r1 = (r + 1) % nR;
      const a = i * nR + r;
      const b = i * nR + r1;
      const c = (i + 1) * nR + r;
      const d = (i + 1) * nR + r1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mat = createLayerMaterial(layer, T);
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12 + (layer.role === 'sheath' ? 0 : layer.role === 'body' ? 1 : 2);
  mesh.name = `sf-liquid-plasma-tube-${layer.role || 'body'}`;
  mesh.visible = false;
  return { mesh, geo, pos, uvs, posAttr, uvAttr, mat, radial: nR };
}

export class PlasmaStreamSystem {
  constructor(THREE_NS, recipe = PLAYER_PLASMA_STREAM_RECIPE) {
    this.THREE = THREE_NS || THREE;
    this.recipe = recipe || PLAYER_PLASMA_STREAM_RECIPE;
    const pathCfg = this.recipe.path || {};
    this.nSeg = Math.max(16, pathCfg.capacity || 56);
    this.radial = RADIAL;
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
      const tube = makeTubeMesh(T, this.nSeg, this.radial, layer);
      this.group.add(tube.mesh);
      this._layers.push({
        role: layer.role || 'body',
        widthScale: layer.widthScale != null ? layer.widthScale : 1,
        baseOpacity: layer.opacity != null ? layer.opacity : 0.7,
        baseRadiance: layer.radiance != null ? layer.radiance : 1.6,
        ...tube,
      });
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
    const nearN = Math.min(58, Math.floor(this.nSeg * 0.58));
    const histBudget = this.nSeg - nearN;
    const histUse = Math.min(Math.max(0, pathN - 1), histBudget);
    let count = 0;
    const swaySeed = this._time * 0.7;

    for (let j = 0; j < nearN && count < this.nSeg; j++) {
      const u = j / Math.max(1, nearN - 1);
      const dist = u * nearLen * (0.88 + activeDrive * 0.22 + boost * 0.18);
      const s = u * 0.48;
      samplePlasmaEnvelope(s, activeDrive, boost, this._env);
      const sway = Math.sin(swaySeed + u * 4.2) * 0.1 * u
        + Math.sin(swaySeed * 1.7 + u * 9.0) * 0.04 * u;
      const pxp = -dirZ;
      const pzp = dirX;
      this._cx[count] = nx + dirX * dist + pxp * sway;
      this._cy[count] = ny + dirY * dist + Math.sin(swaySeed * 0.9 + u * 5.5) * 0.03 * u;
      this._cz[count] = nz + dirZ * dist + pzp * sway;
      this._ax[count] = dirX;
      this._ay[count] = dirY;
      this._az[count] = dirZ;
      let w = this._env.width * rootMul * boostW;
      if (j === 0) w *= 0.9;
      else if (j < 4) w *= 1.08;
      w *= 0.94 + 0.12 * (0.5 + 0.5 * Math.sin(swaySeed * 2.0 + u * 10.0));
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
      this._widths[count] = this._env.width * rootMul * boostW * 0.94;
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

  /** Build orthonormal frame (tangent, normal, binormal) for tube rings. */
  _frame(ax, ay, az, prevN) {
    // Prefer continuity with previous normal
    let nx = prevN.x;
    let ny = prevN.y;
    let nz = prevN.z;
    // Project previous normal off axis
    const d = nx * ax + ny * ay + nz * az;
    nx -= ax * d; ny -= ay * d; nz -= az * d;
    let nl = Math.hypot(nx, ny, nz);
    if (nl < 0.08) {
      // Pick stable up
      let ux = 0; let uy = 1; let uz = 0;
      if (Math.abs(ay) > 0.9) { ux = 1; uy = 0; uz = 0; }
      nx = ay * uz - az * uy;
      ny = az * ux - ax * uz;
      nz = ax * uy - ay * ux;
      nl = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= nl; ny /= nl; nz /= nl;
    // Binormal = axis × normal
    let bx = ay * nz - az * ny;
    let by = az * nx - ax * nz;
    let bz = ax * ny - ay * nx;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    return { nx, ny, nz, bx, by, bz };
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
    const nR = this.radial;

    for (let li = 0; li < this._layers.length; li++) {
      const L = this._layers[li];
      const pos = L.pos;
      const uvs = L.uvs;
      let prevN = { x: 0, y: 1, z: 0 };
      for (let i = 0; i < count; i++) {
        const px = this._cx[i];
        const py = this._cy[i];
        const pz = this._cz[i];
        let ax = this._ax[i];
        let ay = this._ay[i];
        let az = this._az[i];
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al; ay /= al; az /= al;
        const fr = this._frame(ax, ay, az, prevN);
        prevN = { x: fr.nx, y: fr.ny, z: fr.nz };
        let w0 = this._widths[i];
        if (i > 0) w0 = w0 * 0.65 + this._widths[i - 1] * 0.35;
        if (i + 1 < count) w0 = w0 * 0.75 + this._widths[i + 1] * 0.25;
        const radius = w0 * L.widthScale * 0.5;
        const s = count <= 1 ? 0 : i / (count - 1);
        for (let r = 0; r < nR; r++) {
          const theta = (r / nR) * Math.PI * 2;
          const ct = Math.cos(theta);
          const st = Math.sin(theta);
          // Position on ring: center + radius * (n*cos + b*sin)
          const ox = fr.nx * ct + fr.bx * st;
          const oy = fr.ny * ct + fr.by * st;
          const oz = fr.nz * ct + fr.bz * st;
          const vi = (i * nR + r) * 3;
          pos[vi] = px + ox * radius;
          pos[vi + 1] = py + oy * radius;
          pos[vi + 2] = pz + oz * radius;
          const ui = (i * nR + r) * 2;
          uvs[ui] = s;
          // radial UV 0..1 for soft cylinder falloff (distance from axis = full radius)
          uvs[ui + 1] = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(theta * 3.0 + s * 8.0)); // vary slightly
          // Actually use constant outer shell UV so softEdge does radial falloff in shader:
          // We put vertices AT the radius shell; radial falloff is in shader via vPathUv.y.
          // Map y to represent "surface radial coord" ~ 0.65-1.0 for shell, and rely on
          // density profiles. Better: store angle in y for filament lanes.
          uvs[ui + 1] = r / nR; // 0..1 around ring → ang in shader
        }
      }
      L.posAttr.needsUpdate = true;
      L.uvAttr.needsUpdate = true;
      // Full tube draw: (count-1) rings of nR quads × 6 indices
      L.geo.setDrawRange(0, Math.max(0, (count - 1) * nR * 6));
      L.mesh.visible = count >= 2;
      const u = L.mat.uniforms;
      u.uTime.value = this._time;
      u.uScroll.value = scroll;
      u.uDrive.value = activeDrive;
      u.uBoost.value = boost;
      u.uOpacity.value = Math.min(1.05, L.baseOpacity * flashScale * (0.95 + activeDrive * 0.25));
      u.uRadiance.value = L.baseRadiance * boostR * flashScale * (0.95 + activeDrive * 0.28);
    }

    return {
      live: count,
      pathPoints: pathN,
      continuous: true,
      medium: 'liquid-billboard-layers',
      pointCount: count,
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
      layers: this._layers.map((L) => L.role),
      drive: this._lastDrive,
      boost: this._lastBoost,
      pointCount: this._pointCount,
      construction: 'soft-path-tube',
    };
  }
}

export default PlasmaStreamSystem;
