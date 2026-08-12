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

// Layered filament plasma: a sparse web of glowing liquid filaments over black, not a solid fog
// wedge. Ridged (abs-folded) FBM carves webbed energy tendrils; a slow domain warp makes the whole
// web flow downstream as one liquid body. Per-layer spatial frequency separation (coarse core →
// fine sheath) stops additive layers stacking into one white needle.
const LIQUID_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vPathUv;
  uniform float uTime;
  uniform float uFlowRate;
  uniform float uTurbulence;
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
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.13 + vec2(19.1, 7.3);
      a *= 0.52;
    }
    return v;
  }
  // Ridged FBM: folds each octave so noise crests become bright filaments with dark veins.
  // Axis-decoupled lacunarity: the flow (x) coordinate grows slowly per octave while the cross
  // (y) coordinate grows fast — octaves refine strand TEXTURE without re-introducing
  // cross-running crests that read as chevron arcs chained along the wake.
  float ridged(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 4; i++) {
      float n = vnoise(p);
      n = 1.0 - abs(2.0 * n - 1.0);
      n = n * n;
      v += a * n;
      p = p * vec2(1.85, 2.35) + vec2(11.3, 5.7);
      a *= 0.5;
    }
    return v; // ~0..1.1
  }

  void main() {
    float pathT = clamp(vPathUv.x, 0.0, 1.0);
    float side = vPathUv.y * 2.0 - 1.0;

    // Downstream flow: filaments stream nozzle→tip; boost speeds the stream.
    float flow = pathT * 6.0 - uTime * uFlowRate;
    // Slow coherent domain warp — the whole web meanders like liquid, not twinkling noise.
    float wx = fbm(vec2(flow * 0.32 + 3.1, side * 0.75)) - 0.5;
    float wy = fbm(vec2(flow * 0.27 - 1.7, side * 0.62 + 5.2)) - 0.5;
    vec2 dom = vec2(flow + wx * 1.1, side * 1.5 + wy * 1.15);

    // Filament webs STRETCHED ALONG THE FLOW (low axial frequency, high cross frequency) so
    // strands run with the stream like real streamlines. Isotropic ridged noise printed as a
    // chain of chevron arcs in the curved wake — repetition across the path, not flow with it.
    float web = ridged(dom * vec2(0.30, 1.9));
    float web2 = ridged(dom * vec2(0.85, 3.6) + vec2(7.7, 2.9));

    // Layer frequency separation: coarse hot core / mid body / fine fast sheath.
    float fil = 0.0;
    if (uLayerRole < 0.5) {
      fil = web;
    } else if (uLayerRole < 1.5) {
      fil = web * 0.62 + web2 * 0.55;
    } else {
      float web3 = ridged(dom * vec2(1.7, 6.4) + vec2(3.3, 9.1) + vec2(-uTime * 0.6, 0.0));
      fil = web2 * 0.35 + web3 * 0.85;
    }

    // Noise-carved limb: torn, organic silhouette rather than a crisp quad rim.
    float edgeN = fbm(vec2(flow * 1.25 + 9.0, side * 2.3));
    float softEdge = 1.0 - smoothstep(0.30 + edgeN * 0.35, 0.95 + edgeN * 0.20, abs(side));

    // Longitudinal envelopes: tight hot nozzle → burning body → long dissipating tail.
    float head = (1.0 - smoothstep(0.0, 0.13, pathT)) * smoothstep(0.0, 0.02, pathT);
    float bodyWin = 1.0 - smoothstep(0.05, 0.82, pathT);
    // Boost keeps the tail lit further downstream — visible wake lengthens, not just brightness.
    float tailFade = 1.0 - smoothstep(0.62 + uBoost * 0.12, 1.0, pathT);
    // Downstream fray: erode filaments INDIVIDUALLY by raising the web threshold with pathT
    // (boost frays earlier — more energetic disruption). Multiplying aggregate density by a
    // noise term printed full-width dark arcs chained along the wake (chevron banding).
    float frayT = smoothstep(0.34, 0.95, pathT) * (0.55 + uTurbulence * 0.45);

    // Density = filament web, contrast-shaped but widened so the bright body of each filament is
    // fat enough to survive minification at the chase camera (thin peaks vanish at 6 px/WU).
    // The nozzle head is modulated BY the web so the root is a bright bundle of threads,
    // never a flat saturated teardrop.
    float webDense = fil * fil;
    float webFil = smoothstep(0.16 + frayT * 0.34, 0.78 + frayT * 0.5, webDense) * 1.05
      + smoothstep(0.62 + frayT * 0.3, 1.05 + frayT * 0.45, webDense) * 0.35;
    float headStruct = head * (0.55 + 0.65 * web);
    float dens;
    if (uLayerRole < 0.5) {
      // Core: tight filament bundle around centerline, hot nozzle head.
      float coreBundle = exp(-side * side * 2.9);
      dens = softEdge * coreBundle * (headStruct * 0.85 + bodyWin * (0.14 + webFil * 1.6));
    } else if (uLayerRole < 1.5) {
      // Body: the main filament sheet, slightly broader.
      float sheet = exp(-side * side * 1.7);
      dens = softEdge * sheet * (headStruct * 0.45 + (0.26 + webFil * 1.7) * bodyWin);
    } else {
      // Sheath: broad fine haze of tiny filaments + faint deep glow — no solid fill.
      float broad = exp(-side * side * 0.62);
      dens = softEdge * broad * (webFil * 1.5 * bodyWin + 0.18 * bodyWin);
    }
    dens *= tailFade;

    float alpha = clamp(uOpacity * dens, 0.0, 1.0);
    if (alpha < 0.012) discard;

    // Temperature ramp: white-hot nozzle → electric cyan filaments → deep blue dissipation.
    float midWin = 1.0 - smoothstep(0.04, 0.5, pathT);
    float hot = clamp(headStruct * 0.7 + webFil * 0.65 * midWin + uBoost * 0.15 * head, 0.0, 1.0);
    vec3 whiteHot = vec3(1.0, 0.99, 0.97);
    vec3 cyan = mix(uColor, vec3(0.38, 0.88, 1.0), 0.62);
    vec3 deep = mix(uColor, vec3(0.07, 0.18, 0.68), 0.5);
    vec3 col = mix(deep, cyan, clamp(webFil * 0.95 + bodyWin * 0.28, 0.0, 1.0));
    col = mix(col, whiteHot, hot);

    // Radiance: filaments bloom, background stays dark. Slight boost lift, capped (no chalk slab).
    float rad = uRadiance * (0.38 + webFil * 1.25 + head * (0.4 + 0.35 * web))
      * mix(1.0, 0.5 + 0.32 * web, smoothstep(0.06, 0.5, pathT));
    col *= min(rad, 2.0);

    gl_FragColor = vec4(col, alpha);
  }
`;

// Nozzle-interior glow: the hot throat INSIDE the bell (reference: engine cores are lit from
// within). One camera-facing disc per socket, depth-tested so the hull occludes it from the bow;
// additive, tight HDR core + bell-lip ring + soft halo. Not a trail billboard — the nozzle lamp.
const THROAT_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const THROAT_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uDrive;
  uniform float uBoost;
  uniform float uOpacity;
  uniform float uRadiance;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    // Concentric structure: searing core, bell-lip ring, breathing halo.
    float core = exp(-r * r * 7.5);
    float ring = exp(-pow(abs(r - 0.68) * 5.5, 2.0)) * 0.42;
    float halo = exp(-r * 2.6) * 0.3;
    // Micro-flicker kept small (no strobe); boost raises both brightness and size on CPU.
    float fl = 0.94 + 0.04 * sin(uTime * 37.0) + 0.03 * sin(uTime * 91.0 + 1.7);
    float energy = 0.32 + uDrive * 0.68 + uBoost * 0.85;
    float i = (core * 1.6 + ring + halo) * energy * fl;
    vec3 col = mix(uColor, vec3(1.0, 0.99, 0.97), clamp(core * 1.35, 0.0, 1.0));
    col *= i * uRadiance;
    float alpha = clamp(i * uOpacity, 0.0, 1.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

function createThroatMesh(T, color) {
  const geo = new T.PlaneGeometry(2, 2);
  const mat = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new T.Color(color[0], color[1], color[2]) },
      uDrive: { value: 0 },
      uBoost: { value: 0 },
      uOpacity: { value: 0.9 },
      uRadiance: { value: 2.4 },
    },
    vertexShader: THROAT_VERT,
    fragmentShader: THROAT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    toneMapped: false,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.renderOrder = 11;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

function createLayerMaterial(layer, THREE_NS) {
  const T = THREE_NS || THREE;
  const c = layer.color || [0.4, 0.8, 1];
  return new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlowRate: { value: 1.55 },
      uTurbulence: { value: 0 },
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
    this._widthS = new Float32Array(this.nSeg);
    this._latX = new Float32Array(this.nSeg);
    this._latY = new Float32Array(this.nSeg);
    this._latZ = new Float32Array(this.nSeg);
    this._latSX = new Float32Array(this.nSeg);
    this._latSY = new Float32Array(this.nSeg);
    this._latSZ = new Float32Array(this.nSeg);
    this._env = {
      s: 0, width: 1, heat: 1, opacity: 1, density: 1,
      filament: 0, root: 0, jet: 0, wake: 0, rootWindow: 0, jetWindow: 0, wakeWindow: 0,
    };
    this._cam = { x: 0, y: 8, z: 12 };
    this._camObj = null;
    this.group = null;
    this._layers = [];
    this._throats = [];
    this._time = 0;
    this._disposed = false;
    this._active = false;
    this._lastDrive = 0;
    this._lastBoost = 0;
    this._boostBlend = 0;
    this._pointCount = 0;
  }

  setCamera(camera) {
    if (!camera || !camera.position) return;
    this._cam.x = camera.position.x;
    this._cam.y = camera.position.y;
    this._cam.z = camera.position.z;
    this._camObj = camera;
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
    this.group = new T.Group();
    this.group.name = 'sf-liquid-plasma-root';
    // Nozzle throat glows FIRST so group traversals that take the last strip mesh (unit tests,
    // look-dev gates) keep measuring the wake strips, not these quads.
    const throatCfg = this.recipe.throat || {};
    const throatColor = throatCfg.color || (this.recipe.layers && this.recipe.layers[0]
      && this.recipe.layers[0].color) || [0.5, 0.9, 1];
    for (let ti = 0; ti < 4; ti++) {
      const throat = createThroatMesh(T, throatColor);
      throat.name = `sf-plasma-throat-${ti}`;
      this.group.add(throat);
      this._throats.push(throat);
    }
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
    for (let i = 0; i < this._throats.length; i++) this._throats[i].visible = false;
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
    for (let i = 0; i < this._throats.length; i++) {
      this._throats[i].geometry.dispose();
      this._throats[i].material.dispose();
    }
    this._throats.length = 0;
    this._layers.length = 0;
    this.group = null;
  }

  /**
   * Build continuous centerline: path history is the wake (live nozzle → oldest).
   * When history is thin (hover/start), pad a short synthetic near-jet along exhaust.
   * Never append history after a long synthetic jet — that folded the trail back on itself.
   *
   * Axis convention matches ContinuousPlume / production sockets:
   * jet extends along **-ax** (vfx writes ax = -exhaust so -ax = exhaust).
   */
  _buildCenterline(nx, ny, nz, dirX, dirY, dirZ, pathN, activeDrive, boost, rootMul, boostW, speed = 0) {
    // Exhaust direction (matches ContinuousPlume: world = nozzle - axis * along)
    const ex = -dirX;
    const ey = -dirY;
    const ez = -dirZ;
    const nearLen = (this.recipe.path?.nearJetLengthWU != null)
      ? this.recipe.path.nearJetLengthWU
      : 12;
    let count = 0;

    // Prefer real path history as the continuous trail (live head = nozzle).
    const useHistory = pathN >= 3;
    if (useHistory) {
      // Densify path samples into strip segments (preserve order live→oldest).
      const target = Math.min(this.nSeg, Math.max(pathN, Math.floor(this.nSeg * 0.85)));
      for (let i = 0; i < target && count < this.nSeg; i++) {
        const t = target <= 1 ? 0 : i / (target - 1);
        const src = t * (pathN - 1);
        const i0 = Math.min(pathN - 2, Math.floor(src));
        const i1 = i0 + 1;
        const f = src - i0;
        const px = this._pathX[i0] * (1 - f) + this._pathX[i1] * f;
        const pz = this._pathZ[i0] * (1 - f) + this._pathZ[i1] * f;
        // First sample is live nozzle — pin to exact socket so root stays in the bell.
        this._cx[count] = i === 0 ? nx : px;
        this._cy[count] = ny;
        this._cz[count] = i === 0 ? nz : pz;
        const s = t;
        samplePlasmaEnvelope(s, activeDrive, boost, this._env);
        let w = this._env.width * rootMul * boostW;
        if (i === 0) w *= 0.9;
        else if (i < 3) w *= 1.08;
        // Static per-index variation (time-varying width hash strobed under thrust).
        w *= 0.96 + 0.08 * hash2(i, 7);
        this._widths[count] = w;
        count++;
      }
    } else {
      // Hover / cold-start: synthetic near-jet straight along the exhaust (no lateral sway —
      // sideways wobble printed as an integer-station snake). Speed-stretched so the jet does not
      // collapse into the nozzle when thrust starts before history accumulates.
      const nearN = Math.min(this.nSeg, 56);
      const speedStretch = 1 + Math.min(1.6, (Number.isFinite(speed) ? speed : 0) / 140);
      for (let j = 0; j < nearN && count < this.nSeg; j++) {
        const u = j / Math.max(1, nearN - 1);
        const dist = u * nearLen * (0.55 + activeDrive * 0.35 + boost * 0.4) * speedStretch;
        const s = u * 0.62;
        samplePlasmaEnvelope(s, activeDrive, boost, this._env);
        this._cx[count] = nx + ex * dist;
        this._cy[count] = ny + ey * dist;
        this._cz[count] = nz + ez * dist;
        this._widths[count] = this._env.width * rootMul * boostW
          * (0.96 + 0.08 * hash2(j, 3));
        count++;
      }
    }

    if (count > 2) {
      // Width smooth only — do NOT average positions (that collapsed the wake length).
      const tmp = this._widthS;
      for (let i = 0; i < count; i++) {
        const a = this._widths[Math.max(0, i - 1)];
        const b = this._widths[i];
        const c = this._widths[Math.min(count - 1, i + 1)];
        tmp[i] = a * 0.25 + b * 0.5 + c * 0.25;
      }
      this._widths.set(tmp.subarray(0, count));

      // Tangents along path (live→oldest). Lateral uses this for billboard frame.
      for (let i = 0; i < count; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(count - 1, i + 1);
        // Point tangent toward older wake (from nozzle toward tip)
        let tx = this._cx[i1] - this._cx[i0];
        let ty = this._cy[i1] - this._cy[i0];
        let tz = this._cz[i1] - this._cz[i0];
        const tl = Math.hypot(tx, ty, tz) || 1;
        this._ax[i] = tx / tl;
        this._ay[i] = ty / tl;
        this._az[i] = tz / tl;
      }
      // Root tangent = exhaust when path is degenerate
      if (count >= 1 && Math.hypot(this._ax[0], this._ay[0], this._az[0]) < 1e-6) {
        this._ax[0] = ex; this._ay[0] = ey; this._az[0] = ez;
      }
    }

    this._pointCount = count;
    return count;
  }

  _lateralFor(px, py, pz, ax, ay, az, plane) {
    // Camera-facing ribbon side vector: side = axis × toCam puts the strip PLANE facing the
    // camera (maximum projected width). The old blend pointed the WIDTH at the camera, which
    // left the strip edge-on — the whole plume foreshortened to a line at the chase camera.
    const vx = this._cam.x - px;
    const vy = this._cam.y - py;
    const vz = this._cam.z - pz;
    const vLen = Math.hypot(vx, vy, vz) || 1;
    let sx = ay * vz - az * vy;
    let sy = az * vx - ax * vz;
    let sz = ax * vy - ay * vx;
    const sLen = Math.hypot(sx, sy, sz);
    // Stable fallback when the camera sits near the wake axis (sin ≈ 0): up-cross frame.
    let fx = -az;
    let fy = 0;
    let fz = ax;
    if (Math.abs(ay) > 0.92) { fx = 0; fy = az; fz = -ay; }
    const fLen = Math.hypot(fx, fy, fz) || 1;
    fx /= fLen; fy /= fLen; fz /= fLen;
    if (sLen > 1e-5) {
      sx /= sLen; sy /= sLen; sz /= sLen;
      if (sx * fx + sy * fy + sz * fz < 0) { sx = -sx; sy = -sy; sz = -sz; }
      // Blend in the stable frame only while degenerate (camera near the wake line).
      const sinT = Math.min(1, sLen / vLen);
      const k = sinT < 0.24 ? (sinT < 0.06 ? 0 : (sinT - 0.06) / 0.18) : 1;
      let lx = fx * (1 - k) + sx * k;
      let ly = fy * (1 - k) + sy * k;
      let lz = fz * (1 - k) + sz * k;
      const lLen = Math.hypot(lx, ly, lz) || 1;
      lx /= lLen; ly /= lLen; lz /= lLen;
      if (plane === 'cross') {
        // Second plane: ~90° rolled around the axis for volumetric fill.
        const cxs = ay * lz - az * ly;
        const cys = az * lx - ax * lz;
        const czs = ax * ly - ay * lx;
        const cl = Math.hypot(cxs, cys, czs) || 1;
        return { x: cxs / cl, y: cys / cl, z: czs / cl };
      }
      return { x: lx, y: ly, z: lz };
    }
    if (plane === 'cross') {
      const cxs = ay * fz - az * fy;
      const cys = az * fx - ax * fz;
      const czs = ax * fy - ay * fx;
      const cl = Math.hypot(cxs, cys, czs) || 1;
      return { x: cxs / cl, y: cys / cl, z: czs / cl };
    }
    return { x: fx, y: fy, z: fz };
  }

  update(dt, sockets, driveInfo, a11y = null, owner = null) {
    if (this._disposed || !this.group) return { live: 0, pathPoints: 0, continuous: true };
    const frameDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const drive = Math.max(0, driveInfo && driveInfo.drive || 0);
    const throttle = Math.max(0, driveInfo && driveInfo.throttle || 0);
    const boost = Math.max(0, driveInfo && driveInfo.boost || 0);
    const speed = Math.max(0, driveInfo && driveInfo.speed || 0);
    const activeDrive = Math.max(drive, throttle, boost > 0 ? 0.55 : 0);
    this._time += frameDt;
    this._lastDrive = activeDrive;
    // Boost is a binary flag in driveInfo; ease it so ignition has an attack and a settle instead
    // of a pop. Fast attack (~90 ms) reads as a kick, slower release (~300 ms) as spool-down.
    const boostTarget = Math.max(0, Math.min(1, boost));
    const boostTau = boostTarget > this._boostBlend ? 0.09 : 0.3;
    this._boostBlend += (boostTarget - this._boostBlend)
      * (1 - Math.exp(-frameDt / Math.max(1e-3, boostTau)));
    const boostSm = this._boostBlend;
    this._lastBoost = boostSm;

    const idleFloor = this.recipe.drive?.idleFloor ?? 0.04;
    if (activeDrive < idleFloor && speed < 5) {
      this.reset();
      return { live: 0, pathPoints: 0, continuous: true };
    }

    const list = sockets && sockets.length ? sockets : null;
    // Production sockets (ContinuousPlume convention): ax points opposite exhaust;
    // jet extends along -ax. Default ax=+1 (ship +X) ⇒ exhaust -X.
    const primary = list ? list[0] : { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    let dirX = Number.isFinite(primary.ax) ? primary.ax : 1;
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
    const boostW = 1 + (driveCfg.boostWidthMul != null ? driveCfg.boostWidthMul - 1 : 0.5) * boostSm;
    const boostR = 1 + (driveCfg.boostRadianceMul != null ? driveCfg.boostRadianceMul - 1 : 0.4) * boostSm;
    const flashScale = a11y && a11y.reducedFlash ? 0.72 : 1;
    const motionScroll = a11y && a11y.reducedMotion ? 0.12 : 1;

    const count = this._buildCenterline(
      nx, ny, nz, dirX, dirY, dirZ, pathN, activeDrive, boostSm, rootMul, boostW, speed,
    );
    if (count < 2) {
      for (let i = 0; i < this._layers.length; i++) {
        this._layers[i].mesh.visible = false;
        this._layers[i].geo.setDrawRange(0, 0);
      }
      this._active = false;
      return { live: 0, pathPoints: pathN, continuous: true };
    }

    // Continuous downstream flow: drive + boost push the stream; no modulo wrap (the old uScroll
    // wrap teleported the noise field every cycle).
    const flowRate = (0.45 + activeDrive * 1.55 + boostSm * 2.3) * motionScroll;
    const turbulence = boostSm;
    // Minification compensation: additive filaments average toward black at the far chase
    // camera. Bounded LOD lift keeps the wake readable without touching close-range exposure.
    const camD = Math.hypot(this._cam.x - nx, this._cam.y - ny, this._cam.z - nz);
    const distRad = Math.max(1, Math.min(2.0, camD / 85));
    const distOpa = Math.max(1, Math.min(1.45, camD / 110));
    this.group.visible = true;
    this._active = true;

    // Nozzle throat glows — one per live socket, camera-billboarded, depth-tested against hull.
    const throatCfg = this.recipe.throat || {};
    const throatRadius = (throatCfg.radiusWU != null ? throatCfg.radiusWU : 1.45)
      * (0.72 + activeDrive * 0.22 + boostSm * 0.5);
    const throatOpacity = (throatCfg.opacity != null ? throatCfg.opacity : 0.9) * flashScale;
    const throatRadiance = (throatCfg.radiance != null ? throatCfg.radiance : 2.4)
      * (1 + boostSm * 0.35) * flashScale;
    for (let ti = 0; ti < this._throats.length; ti++) {
      const throat = this._throats[ti];
      const sock = list && ti < nSock ? list[ti] : null;
      if (!sock) { throat.visible = false; continue; }
      throat.visible = true;
      throat.position.set(sock.x || 0, sock.y || 0, sock.z || 0);
      throat.scale.setScalar(throatRadius);
      if (this._camObj && this._camObj.quaternion) {
        throat.quaternion.copy(this._camObj.quaternion);
      } else {
        throat.rotation.set(0, 0, 0);
      }
      const tu = throat.material.uniforms;
      tu.uTime.value = this._time;
      tu.uDrive.value = activeDrive;
      tu.uBoost.value = boostSm;
      tu.uOpacity.value = throatOpacity;
      tu.uRadiance.value = throatRadiance;
    }

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
      // (scratch buffers — no per-frame allocation)
      for (let pass = 0; pass < 2; pass++) {
        this._latSX.set(this._latX.subarray(0, count));
        this._latSY.set(this._latY.subarray(0, count));
        this._latSZ.set(this._latZ.subarray(0, count));
        const tx = this._latSX;
        const ty = this._latSY;
        const tz = this._latSZ;
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
      u.uFlowRate.value = flowRate;
      u.uTurbulence.value = turbulence;
      u.uDrive.value = activeDrive;
      u.uBoost.value = boostSm;
      u.uOpacity.value = Math.min(1.05, L.baseOpacity * flashScale * (0.92 + activeDrive * 0.28) * distOpa);
      u.uRadiance.value = L.baseRadiance * boostR * flashScale * (0.95 + activeDrive * 0.25) * distRad;
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
