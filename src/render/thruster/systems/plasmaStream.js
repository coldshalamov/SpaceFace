/**
 * Continuous liquid plasma thruster — multi-layer soft body with optional crossed ribbons.
 * Hot wide root at nozzle + continuous thinner wake along history (one substance).
 * Atlas-aligned: continuous core/body/sheath, soft edges, flow structure — not beads/cards/cone.
 *
 * Critical: AdditiveBlending uses src.rgb * src.a — alpha must stay high across most of the
 * strip width or the plume collapses to a needle core (iter-00..07 failure mode).
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

// Soft volumetric liquid plasma: body fills most of strip; core is white-hot center;
// filaments and soft torn edges read as continuous fluid, not a laser tube / solid cone.
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
  float headSoft(float pathT) {
    return 1.0 - smoothstep(0.0, 0.2, pathT);
  }
  float tipSoft(float pathT) {
    return smoothstep(0.35, 0.95, pathT);
  }

  void main() {
    float pathT = clamp(vPathUv.x, 0.0, 1.0);
    float side = vPathUv.y * 2.0 - 1.0;

    // Flow coordinate (scrolls along exhaust)
    float flow = pathT * 8.5 - uScroll * 3.6 - uTime * 0.85;
    float n  = fbm(vec2(flow * 0.95, side * 1.4));
    float n2 = fbm(vec2(flow * 2.2 + 2.7, side * 2.0 + 0.8));
    float n3 = fbm(vec2(flow * 4.8 + 7.0, side * 3.5 + uTime * 0.35));
    float n4 = vnoise(vec2(flow * 10.0, side * 6.5 + uTime * 0.8));

    // Domain-warp edge for liquid lace silhouette (stronger tear vs smooth cone)
    float edgeWarp = (n - 0.5) * 0.55 + (n2 - 0.5) * 0.34 + (n3 - 0.5) * 0.18 + (n4 - 0.5) * 0.08;
    float sideW = side + edgeWarp;
    float absSide = abs(sideW);

    // ---- PRIMARY STRUCTURE: parallel liquid stream filaments (ref anatomy) ----
    // Pack aperture with longitudinal bright ropes that braid along flow.
    float streamers = 0.0;
    for (int k = 0; k < 11; k++) {
      float fk = float(k);
      float lane = (fk - 5.0) / 5.4; // denser pack across aperture
      // Lanes wobble and braid along the path
      float wob = (vnoise(vec2(flow * 0.55 + fk * 1.91, fk * 3.7)) - 0.5) * 0.26;
      wob += (vnoise(vec2(flow * 1.4 + fk * 0.7, pathT * 3.0 + fk)) - 0.5) * 0.14;
      float d = abs(sideW - (lane + wob));
      float brightness = 0.4 + 0.6 * vnoise(vec2(flow * 2.8 + fk * 2.3, fk * 5.1));
      // Bright ropes: thicker near nozzle (packed aperture), thinner mid, fray at tip
      float ropeW = 36.0 - headSoft(pathT) * 12.0 + tipSoft(pathT) * 28.0;
      float laneFade = 1.0 - abs(lane) * tipSoft(pathT) * 0.85;
      streamers += exp(-d * d * ropeW) * brightness * max(laneFade, 0.12);
    }
    streamers = min(streamers, 2.8);

    // Soft mass fill between ropes (plasma volume, not empty laser between lines)
    float core = exp(-absSide * absSide * 8.5) * (0.35 + streamers * 0.4);
    float body = exp(-absSide * absSide * 1.7) * (0.28 + n * 0.5 + streamers * 0.35);
    float sheath = exp(-absSide * absSide * 0.65) * (0.2 + n2 * 0.55 + n3 * 0.25);

    // Irregular soft edge — lace/fray, not clean cone (keep floor so mass never needles)
    float edgeStart = 0.35 + n * 0.28 + n2 * 0.12;
    float edgeEnd = 0.95 + n3 * 0.2;
    float softEdge = 1.0 - smoothstep(edgeStart, edgeEnd, absSide);
    // Mild density variation (not full holes that collapse the plume)
    float holes = 0.7 + n * 0.25 + n2 * 0.15 - n3 * 0.12;
    softEdge *= clamp(holes, 0.45, 1.2);
    softEdge = max(softEdge, 0.0);

    float fil = streamers * exp(-absSide * 0.9);

    // Along-path: hot root, continuous body, tip breakup into wisps (not laser taper)
    float nozzleSoft = smoothstep(0.0, 0.035, pathT);
    float head = (1.0 - smoothstep(0.0, 0.18, pathT)) * nozzleSoft;
    float mid = 1.0 - smoothstep(0.08, 0.55, pathT);
    // Tip: fray early + force soft alpha collapse so mesh end never hard-cuts
    float tipFray = smoothstep(0.28, 0.85, pathT);
    float tipFade = 1.0 - smoothstep(0.68, 1.0, pathT);
    float breakup = mix(1.0, 0.28 + n3 * 0.8 + n2 * 0.4, tipFray);
    // Mid-field: slightly fatten density (teardrop belly)
    float belly = exp(-((pathT - 0.18) * (pathT - 0.18)) / 0.03);
    float along = (head * 1.2 + mid * 1.0 + belly * 0.25 + (1.0 - tipFray) * 0.3 + tipFray * sheath * 1.4)
      * breakup * tipFade * (0.8 + uDrive * 0.3 + uBoost * 0.12);

    // Volume fill is the base (anti-needle); streamers ride on top for liquid structure.
    float dens;
    if (uLayerRole < 0.5) {
      dens = softEdge * (0.22 + streamers * 1.15 + core * 0.7 + body * 0.35);
    } else if (uLayerRole < 1.5) {
      dens = softEdge * (0.4 + body * 0.9 + streamers * 0.85 + core * 0.25 + sheath * 0.35);
    } else {
      dens = softEdge * (0.28 + sheath * 1.15 + body * 0.35 + streamers * 0.3 + n3 * 0.25);
    }

    float alpha = clamp(uOpacity * dens * along, 0.0, 1.0);
    // Soften first slice of strip (hard geometric end-cap fix)
    alpha *= mix(0.55, 1.0, smoothstep(0.0, 0.05, pathT));
    if (alpha < 0.016) discard;

    vec3 whiteHot = vec3(1.0, 0.99, 0.96);
    vec3 midCyan = mix(uColor, vec3(0.45, 0.88, 1.0), 0.55);
    vec3 deep = mix(uColor, vec3(0.05, 0.15, 0.6), 0.55);
    // Keep more cyan liquid mid-body; white only on packed root streamers
    float hot = clamp(
      streamers * 0.28 * (1.0 - pathT * 0.75)
      + head * 0.35
      + core * 0.2 * (1.0 - pathT * 0.5)
      + uBoost * 0.08,
      0.0, 1.0
    );
    vec3 col = mix(deep, midCyan, clamp(body + sheath * 0.55 + n * 0.35 + streamers * 0.15, 0.0, 1.0));
    col = mix(col, whiteHot, hot * (0.55 + (1.0 - step(0.5, uLayerRole)) * 0.4));
    // Distinct streamer highlights (readable under bloom-off)
    col = mix(col, mix(midCyan, whiteHot, 0.75), min(streamers, 1.6) * 0.48 * (1.0 - pathT * 0.3));
    float glow = uRadiance * (0.4 + streamers * 0.24 + head * 0.18 + body * 0.1 + core * 0.1);
    col *= min(glow, 1.9);

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
      // Primary camera-facing strip
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
      // Optional crossed strip for volume (body + sheath) — reads as filled teardrop, not flat ribbon
      if (layer.cross) {
        const cross = makeStripMesh(T, this.nSeg, layer, '-cross');
        cross.mesh.renderOrder = primary.mesh.renderOrder - 1;
        this.group.add(cross.mesh);
        this._layers.push({
          role: layer.role || 'body',
          // Soft cross fill for volume; low opacity to avoid hard plate print
          widthScale: (layer.widthScale != null ? layer.widthScale : 1) * 0.75,
          baseOpacity: (layer.opacity != null ? layer.opacity : 0.7) * 0.48,
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
      this._layers[i].geo.dispose();
      this._layers[i].mat.dispose();
    }
    this._layers.length = 0;
    this.group = null;
  }

  /**
   * Build centerline: near-jet samples along exhaust (reference teardrop body)
   * then history wake samples (thinner long continuous path).
   */
  _buildCenterline(nx, ny, nz, dirX, dirY, dirZ, pathN, activeDrive, boost, rootMul, boostW) {
    const nearLen = (this.recipe.path?.nearJetLengthWU != null)
      ? this.recipe.path.nearJetLengthWU
      : 16;
    const nearN = Math.min(44, Math.floor(this.nSeg * 0.6));
    const histBudget = this.nSeg - nearN;
    const histUse = Math.min(Math.max(0, pathN - 1), histBudget);
    let count = 0;

    // Organic lateral sway for liquid body (deterministic from sim time + index)
    const swaySeed = this._time * 0.7;
    for (let j = 0; j < nearN && count < this.nSeg; j++) {
      const u = j / Math.max(1, nearN - 1);
      const dist = u * nearLen * (0.88 + activeDrive * 0.22 + boost * 0.18);
      const s = u * 0.48;
      samplePlasmaEnvelope(s, activeDrive, boost, this._env);
      // Gentle lateral undulation grows with distance (liquid stream, not rigid axis)
      const sway = Math.sin(swaySeed + u * 4.2) * 0.12 * u
        + Math.sin(swaySeed * 1.7 + u * 9.1) * 0.05 * u;
      // Perp in XZ to exhaust dir
      const pxp = -dirZ;
      const pzp = dirX;
      this._cx[count] = nx + dirX * dist + pxp * sway;
      this._cy[count] = ny + dirY * dist + Math.sin(swaySeed * 0.9 + u * 5.5) * 0.04 * u;
      this._cz[count] = nz + dirZ * dist + pzp * sway;
      this._ax[count] = dirX;
      this._ay[count] = dirY;
      this._az[count] = dirZ;
      let w = this._env.width * rootMul * boostW;
      // Soft root: start slightly narrower then belly (avoids hard end-cap plate)
      if (j === 0) w *= 0.85;
      else if (j === 1) w *= 1.12;
      else if (j < 5) w *= 1.08;
      // Stronger width noise for torn silhouette / liquid edge
      w *= 0.88 + 0.24 * (0.5 + 0.5 * Math.sin(swaySeed * 2.1 + u * 11.0))
        + 0.08 * Math.sin(swaySeed * 3.7 + u * 23.0);
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
      this._widths[count] = this._env.width * rootMul * boostW * 0.95;
      count++;
    }

    this._pointCount = count;
    return count;
  }

  _lateralFor(i, px, py, pz, ax, ay, az, plane) {
    const camX = this._cam.x;
    const camY = this._cam.y;
    const camZ = this._cam.z;
    // Stable basis from world up
    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (Math.abs(ay) > 0.92) { ux = 1; uy = 0; uz = 0; }
    let s0x = ay * uz - az * uy;
    let s0y = az * ux - ax * uz;
    let s0z = ax * uy - ay * ux;
    let s0l = Math.hypot(s0x, s0y, s0z) || 1;
    s0x /= s0l; s0y /= s0l; s0z /= s0l;

    // Camera-facing candidate (project view vector off axis)
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
      // Second plane: axis × primary lateral → fills volume when primary is edge-on
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
    const spacing = pathCfg.sampleSpacingWU || 1.0;
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

    const scroll = (this._time * 0.68 * motionScroll) % 1;
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
        const lat = this._lateralFor(i, px, py, pz, ax, ay, az, L.plane);
        // Smooth width along path (neighbor blend) to reduce card-segment banding
        let w0 = this._widths[i];
        if (i > 0) w0 = w0 * 0.55 + this._widths[i - 1] * 0.45;
        if (i + 1 < count) w0 = w0 * 0.7 + this._widths[i + 1] * 0.3;
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
      layers: this._layers.map((L) => `${L.role}:${L.plane}`),
      drive: this._lastDrive,
      boost: this._lastBoost,
      pointCount: this._pointCount,
    };
  }
}

export default PlasmaStreamSystem;
