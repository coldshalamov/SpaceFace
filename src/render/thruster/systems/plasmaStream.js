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

// Soft liquid plasma: packed longitudinal flow-ropes + soft volume fill.
// No longChop/axisOpen holes (those printed segment plates). No accordion warp.
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
  // Soft longitudinal liquid rope at lateral offset (flow-warped)
  float rope(float side, float center, float tight, float flow) {
    float c = center + 0.08 * sin(flow * 1.7 + center * 4.0)
      + 0.05 * sin(flow * 3.1 - center * 2.5);
    float d = (side - c) * tight;
    return exp(-d * d);
  }

  void main() {
    float pathT = clamp(vPathUv.x, 0.0, 1.0);
    float side = vPathUv.y * 2.0 - 1.0;

    float flow = pathT * 10.0 - uScroll * 4.2 - uTime * 1.05;
    // Mild organic domain warp (low amp — high amp printed contour bands)
    float w1 = fbm(vec2(flow * 0.75, side * 1.5)) - 0.5;
    float w2 = fbm(vec2(flow * 1.5 + 2.0, side * 2.2 + 1.0)) - 0.5;
    float sideW = side + w1 * 0.22 + w2 * 0.12;
    float absSide = abs(sideW);
    float fx = flow + w1 * 1.1 + w2 * 0.45;
    float fy = sideW * 2.1 + w1 * 0.55;

    float n  = fbm(vec2(fx * 0.95, fy));
    float n2 = fbm(vec2(fx * 2.1 + 2.0, fy * 1.5 + 1.0));
    float n3 = fbm(vec2(fx * 4.2 + 7.0, fy * 2.2 + uTime * 0.28));
    float n4 = vnoise(vec2(fx * 9.0, fy * 4.2 + uTime * 0.65));

    // Soft torn limb — wide soft falloff so mesh quad rims do not print plates
    float edgeStart = 0.12 + n * 0.22 + n2 * 0.1;
    float edgeEnd = 1.15 + n3 * 0.12;
    float softEdge = 1.0 - smoothstep(edgeStart, edgeEnd, absSide);
    softEdge *= 0.72 + n * 0.18 + n2 * 0.12;
    softEdge = max(softEdge, 0.0);

    // Packed multi-rope liquid braid (REF anatomy) — many phase-offset longitudinal streams
    float r0 = rope(sideW, 0.00, 9.5, flow);
    float r1 = rope(sideW, 0.18, 8.5, flow + 1.3);
    float r2 = rope(sideW, -0.16, 8.8, flow + 2.1);
    float r3 = rope(sideW, 0.32, 7.2, flow + 0.7);
    float r4 = rope(sideW, -0.30, 7.0, flow + 3.4);
    float r5 = rope(sideW, 0.08, 11.0, flow * 1.15 + 4.0);
    float r6 = rope(sideW, -0.08, 10.5, flow * 0.9 + 5.2);
    float r7 = rope(sideW, 0.42, 6.0, flow + 1.9);
    float r8 = rope(sideW, -0.40, 6.2, flow + 2.8);
    float r9 = rope(sideW, 0.24 * (n2 - 0.5), 9.0, flow + n * 2.0);
    float ropes = r0 * 1.15 + r1 + r2 + r3 * 0.95 + r4 * 0.95
      + r5 * 1.05 + r6 * 1.05 + r7 * 0.75 + r8 * 0.75 + r9 * 0.9;
    // High-freq micro-filaments packing gaps between major ropes
    float micro = smoothstep(0.35, 0.75, n3) * smoothstep(0.3, 0.7, n4)
      * exp(-absSide * absSide * 1.8);
    float rootPack = 1.0 - smoothstep(0.05, 0.55, pathT);
    float streamers = (ropes * 0.55 + micro * 1.4)
      * (0.85 + rootPack * 0.55)
      * (1.0 - smoothstep(0.55, 1.0, pathT) * 0.45);
    // Soft mid-opacity plasma soup between ropes (shrinks black voids without chalk white)
    float packFill = (0.62 + n * 0.28 + n2 * 0.35)
      * exp(-absSide * absSide * 1.15)
      * (0.75 + rootPack * 0.35);
    streamers = min(streamers + packFill * 1.15, 4.2);

    float tipFray = smoothstep(0.22, 0.78, pathT);
    float tipFade = 1.0 - smoothstep(0.42, 0.98, pathT);
    float lace = smoothstep(0.32, 0.9, n3) * smoothstep(0.28, 0.88, n4)
      * (0.55 + n4 * 0.55);

    // Soft volume body — continuous, no longitudinal chops (chops = segment plates)
    // body/sheath BEFORE along (GLSL requires declare-before-use)
    float body = exp(-absSide * absSide * 1.9)
      * (0.5 + n * 0.25 + streamers * 0.55 + packFill * 0.4);
    float sheath = exp(-absSide * absSide * 0.7)
      * (0.35 + n2 * 0.4 + n3 * 0.25 + streamers * 0.2);

    float head = (1.0 - smoothstep(0.0, 0.16, pathT)) * smoothstep(0.0, 0.02, pathT);
    float mid = 1.0 - smoothstep(0.04, 0.6, pathT);
    float belly = exp(-((pathT - 0.14) * (pathT - 0.14)) / 0.028);
    float breakup = mix(1.0, 0.12 + n3 * 0.95 + lace * 0.9 + n4 * 0.35, tipFray);
    float along = (head * 1.4 + mid * 0.85 + belly * 0.35 + tipFray * sheath * 0.8)
      * breakup * tipFade * (0.82 + uDrive * 0.28 + uBoost * 0.12);

    // Core is multi-rope hot near root, soft streamers mid (not single laser gaussian)
    float core = streamers * (0.55 + head * 0.9 + (1.0 - smoothstep(0.0, 0.22, pathT)) * 0.45)
      * exp(-absSide * absSide * 2.8);

    float dens;
    if (uLayerRole < 0.5) {
      dens = softEdge * (0.45 + core * 1.15 + streamers * 0.85 + packFill * 0.35);
    } else if (uLayerRole < 1.5) {
      // No body-cross plane: body dens must carry full soft volume alone
      dens = softEdge * (0.62 + body * 1.15 + streamers * 1.2 + sheath * 0.45 + packFill * 0.65);
    } else {
      dens = softEdge * (0.4 + sheath * 1.25 + body * 0.35 + streamers * 0.55 + packFill * 0.3);
    }

    float alpha = clamp(uOpacity * dens * along, 0.0, 1.0);
    // Soft edge-only dither — never high-freq pathT ring that reprints plates
    alpha *= 0.88 + 0.12 * fbm(vec2(sideW * 3.0 + flow * 0.15, n2));
    // Tip electric lace dissolve (irregular, not hard cut)
    alpha *= 1.0 - tipFray * (0.4 + n3 * 0.4 + n4 * 0.3);
    alpha *= mix(1.0, 0.18 + lace * 1.1, tipFray);
    // Extra edge tear at tip so end is not a flat mesh cut
    alpha *= mix(1.0, softEdge * (0.4 + lace), tipFray * 0.85);
    if (alpha < 0.01) discard;

    vec3 whiteHot = vec3(1.0, 0.99, 0.96);
    vec3 midCyan = mix(uColor, vec3(0.38, 0.88, 1.0), 0.6);
    vec3 deep = mix(uColor, vec3(0.04, 0.1, 0.5), 0.5);
    // White-hot only in root multi-filament head — not solid chalk slab mid-body
    float headWin = 1.0 - smoothstep(0.0, 0.12, pathT);
    float ropeHot = clamp(streamers * 0.4 + r0 * 0.45 + r5 * 0.3 + r1 * 0.2, 0.0, 1.0);
    float hot = clamp(head * 0.95 + ropeHot * 0.65 * headWin + uBoost * 0.06, 0.0, 1.0) * headWin;

    vec3 col = mix(deep, midCyan, clamp(body * 0.7 + sheath * 0.4 + streamers * 0.6 + n * 0.25, 0.0, 1.0));
    // Bright cyan-white ropes near root; mid stays electric cyan filaments (ban white mid bar)
    col = mix(col, mix(midCyan, whiteHot, 0.8), hot * ropeHot);
    col = mix(col, midCyan, (1.0 - headWin) * 0.72);
    // Distinct filament highlights mid-body (cyan ropes, not chalk wash)
    col = mix(col, vec3(0.55, 0.92, 1.0), clamp((r0 + r1 + r2 + r5 + r6) * 0.12 * (0.4 + headWin * 0.6), 0.0, 0.5));
    col = mix(col, vec3(0.75, 0.96, 1.0), clamp(streamers * 0.18 * headWin, 0.0, 0.45));

    float glow = uRadiance * (0.32 + streamers * 0.24 + head * 0.4 + body * 0.1 + packFill * 0.08);
    // Fall mid radiance so continuous white laser bar does not rebuild
    glow *= mix(1.2, 0.62 + 0.2 * n2, smoothstep(0.08, 0.45, pathT));
    col *= min(glow, mix(1.5, 1.05, smoothstep(0.08, 0.4, pathT)));

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
    this._latX = new Float32Array(this.nSeg);
    this._latY = new Float32Array(this.nSeg);
    this._latZ = new Float32Array(this.nSeg);
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
          // Soft volume fill so single-plane never goes edge-on invisible; keep dim
          widthScale: (layer.widthScale != null ? layer.widthScale : 1) * 0.85,
          baseOpacity: (layer.opacity != null ? layer.opacity : 0.7) * 0.28,
          baseRadiance: (layer.radiance != null ? layer.radiance : 1.6) * 0.6,
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
      // Mild sway only — strong sway folded billboards into visible plate edges
      const sway = Math.sin(swaySeed + u * 3.2) * 0.045 * u
        + Math.sin(swaySeed * 1.7 + u * 6.5) * 0.02 * u;
      const pxp = -dirZ;
      const pzp = dirX;
      this._cx[count] = nx + dirX * dist + pxp * sway;
      this._cy[count] = ny + dirY * dist + Math.sin(swaySeed * 0.9 + u * 4.0) * 0.015 * u;
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
      // Smooth centerline so consecutive billboard quads share nearly coplanar faces
      const sx = new Float32Array(count);
      const sy = new Float32Array(count);
      const sz = new Float32Array(count);
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < count; i++) {
          const i0 = Math.max(0, i - 1);
          const i1 = Math.min(count - 1, i + 1);
          const i2 = Math.max(0, i - 2);
          const i3 = Math.min(count - 1, i + 2);
          sx[i] = this._cx[i] * 0.4 + this._cx[i0] * 0.22 + this._cx[i1] * 0.22
            + this._cx[i2] * 0.08 + this._cx[i3] * 0.08;
          sy[i] = this._cy[i] * 0.4 + this._cy[i0] * 0.22 + this._cy[i1] * 0.22
            + this._cy[i2] * 0.08 + this._cy[i3] * 0.08;
          sz[i] = this._cz[i] * 0.4 + this._cz[i0] * 0.22 + this._cz[i1] * 0.22
            + this._cz[i2] * 0.08 + this._cz[i3] * 0.08;
        }
        // Keep nozzle root pinned so root heat stays at bell
        sx[0] = this._cx[0]; sy[0] = this._cy[0]; sz[0] = this._cz[0];
        for (let i = 0; i < count; i++) {
          this._cx[i] = sx[i];
          this._cy[i] = sy[i];
          this._cz[i] = sz[i];
        }
      }
      // Recompute tangents from smoothed path
      for (let i = 0; i < count; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(count - 1, i + 1);
        let tx = this._cx[i0] - this._cx[i1];
        let ty = this._cy[i0] - this._cy[i1];
        let tz = this._cz[i0] - this._cz[i1];
        const tl = Math.hypot(tx, ty, tz) || 1;
        this._ax[i] = tx / tl;
        this._ay[i] = ty / tl;
        this._az[i] = tz / tl;
      }
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
      // Pass 1: raw laterals for every path sample
      for (let i = 0; i < count; i++) {
        let ax = this._ax[i];
        let ay = this._ay[i];
        let az = this._az[i];
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al; ay /= al; az /= al;
        const lat = this._lateralFor(
          this._cx[i], this._cy[i], this._cz[i], ax, ay, az, L.plane,
        );
        this._latX[i] = lat.x;
        this._latY[i] = lat.y;
        this._latZ[i] = lat.z;
      }
      // Pass 2: smooth laterals so billboard orientation does not jump plate-to-plate
      for (let pass = 0; pass < 2; pass++) {
        const tx = this._latX.slice(0, count);
        const ty = this._latY.slice(0, count);
        const tz = this._latZ.slice(0, count);
        for (let i = 0; i < count; i++) {
          const i0 = Math.max(0, i - 1);
          const i1 = Math.min(count - 1, i + 1);
          const i2 = Math.max(0, i - 2);
          const i3 = Math.min(count - 1, i + 2);
          let lx = tx[i] * 0.4 + tx[i0] * 0.25 + tx[i1] * 0.25 + tx[i2] * 0.05 + tx[i3] * 0.05;
          let ly = ty[i] * 0.4 + ty[i0] * 0.25 + ty[i1] * 0.25 + ty[i2] * 0.05 + ty[i3] * 0.05;
          let lz = tz[i] * 0.4 + tz[i0] * 0.25 + tz[i1] * 0.25 + tz[i2] * 0.05 + tz[i3] * 0.05;
          // Flip if neighbor smoothed into opposite hemisphere (prevents fold-over)
          if (lx * tx[i] + ly * ty[i] + lz * tz[i] < 0) {
            lx = -lx; ly = -ly; lz = -lz;
          }
          const ll = Math.hypot(lx, ly, lz) || 1;
          this._latX[i] = lx / ll;
          this._latY[i] = ly / ll;
          this._latZ[i] = lz / ll;
        }
      }
      // Pass 3: heavy width smooth + write verts
      for (let i = 0; i < count; i++) {
        const px = this._cx[i];
        const py = this._cy[i];
        const pz = this._cz[i];
        let w0 = this._widths[i];
        if (i > 0) w0 = w0 * 0.45 + this._widths[i - 1] * 0.55;
        if (i + 1 < count) w0 = w0 * 0.5 + this._widths[i + 1] * 0.5;
        if (i > 1) w0 = w0 * 0.8 + this._widths[i - 2] * 0.2;
        if (i + 2 < count) w0 = w0 * 0.8 + this._widths[i + 2] * 0.2;
        if (i > 2) w0 = w0 * 0.9 + this._widths[i - 3] * 0.1;
        if (i + 3 < count) w0 = w0 * 0.9 + this._widths[i + 3] * 0.1;
        // Tiny continuous limb variation only (no staircase hash)
        w0 *= 0.98 + 0.04 * hash2(i, 11);
        const half = w0 * L.widthScale * 0.5;
        const s = count <= 1 ? 0 : i / (count - 1);
        const lx = this._latX[i];
        const ly = this._latY[i];
        const lz = this._latZ[i];
        const i0 = i * 2;
        const i1 = i0 + 1;
        pos[i0 * 3] = px + lx * half;
        pos[i0 * 3 + 1] = py + ly * half;
        pos[i0 * 3 + 2] = pz + lz * half;
        pos[i1 * 3] = px - lx * half;
        pos[i1 * 3 + 1] = py - ly * half;
        pos[i1 * 3 + 2] = pz - lz * half;
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
