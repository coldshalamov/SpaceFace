/**
 * Player thruster — three elements, three physical timescales.
 *
 *   jet    Rigid nozzle-locked plume. Straight out of the bell, physical length in WU, free-expansion
 *          cone, standing shock train. Does NOT follow path history: a plume's size and shape come
 *          from the engine, not from where the hull has been or how fast it is going.
 *   wake   Gas that has already left the nozzle. World-space parcels carrying their own aft momentum
 *          that expand and cool in place. This is what bends on a turn and detaches on throttle cut.
 *   snake  Thin stylistic history filament through a world-space meander field.
 *
 * Filament noise advects in world units at exhaust speed, so features are BORN at the throat and
 * stream out of it. Parcel noise is frozen at emission, so a puff carries its own texture through
 * the world. Neither is a texture sliding along a static mesh.
 */
import * as THREE from 'three';
import { createPathSampler } from './pathSampler.js';
import {
  PLAYER_PLASMA_STREAM_RECIPE,
  samplePlasmaEnvelope,
  sampleJetHalfWidth,
  shockPhase,
} from '../recipes/plasmaStreamRecipe.js';

const ROLE_CORE = 0;
const ROLE_BODY = 1;
const ROLE_SHEATH = 2;
const ROLE_WAKE = 3;
const ROLE_SNAKE = 4;

// Material-coordinate advance per ejected parcel. Small against the wake's axial noise frequency so
// neighbouring parcels stay correlated instead of banding.
const WAKE_SEED_STEP = 0.55;

const LIQUID_VERT = /* glsl */`
  attribute float aFlow;
  attribute float aFade;
  varying vec2 vPathUv;
  varying float vFlow;
  varying float vFade;
  void main() {
    vPathUv = uv;
    vFlow = aFlow;
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Layered filament plasma: a sparse web of glowing liquid filaments over black, not a solid fog
// wedge. Ridged (abs-folded) FBM carves webbed energy tendrils; a slow domain warp makes the whole
// web flow downstream as one liquid body. Per-layer spatial frequency separation (coarse core →
// fine sheath) stops additive layers stacking into one white needle.
//
// aFlow is the MATERIAL coordinate, in world units:
//   jet   → axial distance from the throat, advected aft by uTime * uFlowSpeed
//   wake  → the ship odometer frozen at the instant that parcel was ejected (uFlowSpeed 0)
//   snake → absolute path odometer at that station (uFlowSpeed 0)
// Keying the noise to world units rather than a normalized path UV is what stops the whole field
// stretching when the plume lengthens and stops it sliding when the mesh is rebuilt.
const LIQUID_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vPathUv;
  varying float vFlow;
  varying float vFade;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uTurbulence;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadiance;
  uniform float uLayerRole;
  uniform float uDrive;
  uniform float uBoost;
  uniform vec2 uFreq;
  uniform float uAxialLen;
  uniform float uShock;
  uniform float uShockPitch;
  uniform float uShockDecay;

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
    float side = vPathUv.y * 2.0 - 1.0;
    bool isJet = uLayerRole < 2.5;

    // Advected material coordinate. Filaments travel aft with the gas instead of scrolling.
    float f = vFlow - uTime * uFlowSpeed;

    // How far downstream this station is, 0 at the throat. Drives eddy growth.
    float axGrow = isJet
      ? clamp(max(vFlow, 0.0) / max(uAxialLen, 0.5), 0.0, 1.0)
      : clamp(1.0 - vFade, 0.0, 1.0);

    // Slow coherent domain warp — the whole web meanders like liquid, not twinkling noise.
    float wx = fbm(vec2(f * uFreq.x * 0.34 + 3.1, side * 0.75)) - 0.5;
    float wy = fbm(vec2(f * uFreq.x * 0.29 - 1.7, side * 0.62 + 5.2)) - 0.5;
    // Cross frequency falls off downstream so neighbouring strands merge into fewer, fatter
    // features — a shear layer's eddies grow with distance. Held constant it read as combed hair
    // running the whole length of the plume. Only the cross axis is scaled: touching the flow axis
    // would make the advected field stretch instead of translate.
    float crossFreq = uFreq.y * mix(1.0, 0.48, axGrow);
    vec2 dom = vec2(f * uFreq.x + wx * 1.1, side * crossFreq + wy * 1.15);

    float web = ridged(dom);
    float web2 = ridged(dom * vec2(2.3, 1.85) + vec2(7.7, 2.9));
    float fil;
    if (uLayerRole < 0.5) {
      fil = web;
    } else if (uLayerRole < 1.5) {
      fil = web * 0.62 + web2 * 0.55;
    } else if (uLayerRole < 2.5) {
      float web3 = ridged(dom * vec2(1.7, 3.2) + vec2(3.3, 9.1));
      fil = web2 * 0.35 + web3 * 0.85;
    } else {
      fil = web * 0.7 + web2 * 0.4;
    }

    // Noise-carved limb: torn, organic silhouette rather than a crisp quad rim.
    float edgeN = fbm(vec2(f * uFreq.x * 1.3 + 9.0, side * 2.3));
    float softEdge = 1.0 - smoothstep(0.30 + edgeN * 0.35, 0.95 + edgeN * 0.20, abs(side));

    // Longitudinal light output. For the jet this is physical distance from the throat, so plume
    // luminance collapses within a couple of exit diameters no matter how long the jet is. For
    // ejected parcels and the history thread the CPU owns the fade (age / erosion) in aFade.
    float lit;
    float exitGlow = 0.0;
    float shockNode = 0.0;
    if (isJet) {
      float axial = max(vFlow, 0.0);
      float axN = clamp(axial / max(uAxialLen, 0.5), 0.0, 1.0);
      exitGlow = exp(-axN * axN * 11.0);
      float bodyGlow = exp(-axN * 2.6);
      float tailCut = 1.0 - smoothstep(0.70, 1.0, axN);
      // aFade carries samplePlasmaEnvelope's longitudinal opacity so that curve lives in one
      // testable place on the CPU instead of being restated here. Normalized to peak at 1: an
      // unnormalized product saturated every additive layer into one white slab at the throat.
      lit = (exitGlow * 0.62 + bodyGlow * 0.38) * tailCut * clamp(vFade, 0.0, 1.0);
      // Standing shock train — a pressure structure fixed in the nozzle frame, so it must NOT
      // advect with the filaments. Node spacing shrinks downstream as the train damps out. Held
      // tight to the axis: spread across the full width it reads as a rung ladder, not diamonds.
      float ph = pow(axial / max(uShockPitch, 0.05), 1.4286);
      float node = pow(0.5 + 0.5 * cos(ph * 6.2831853), 8.0);
      shockNode = node * uShock * exp(-axial / max(uShockDecay, 0.5)) * exp(-side * side * 9.0);
    } else {
      lit = clamp(vFade, 0.0, 1.0);
    }

    // Downstream fray: erode filaments INDIVIDUALLY by raising the web threshold. Multiplying
    // aggregate density by a noise term printed full-width dark arcs chained along the wake. Boost
    // only nudges this — a hard boost coupling thinned the whole plume into separated hairs, which
    // reads as a sparkler; more thrust should make the plume denser, not sparser.
    // Onset is pulled forward (pow < 1) so strands visibly dissolve before the geometry ends,
    // instead of staying coherent right up to a cut edge.
    float frayT = pow(axGrow, 0.75) * (0.72 + uTurbulence * 0.20);
    float webDense = fil * fil;
    float webFil = smoothstep(0.16 + frayT * 0.34, 0.78 + frayT * 0.5, webDense) * 1.05
      + smoothstep(0.62 + frayT * 0.3, 1.05 + frayT * 0.45, webDense) * 0.35;

    // Density comes mostly from the filament web so the gaps between strands stay black. A large
    // constant term multiplied by lit is what turns any of these layers into a solid fog wedge.
    float xsec;
    float dens;
    if (uLayerRole < 0.5) {
      // Core: tight collimated filament bundle, searing throat.
      xsec = exp(-side * side * 3.1);
      dens = softEdge * xsec * (lit * (0.12 + 0.34 * web) + webFil * 1.05 * lit + shockNode * 0.9);
    } else if (uLayerRole < 1.5) {
      // Body: the main filament sheet.
      xsec = exp(-side * side * 1.75);
      dens = softEdge * xsec * (lit * (0.07 + 0.20 * web) + webFil * 1.25 * lit + shockNode * 0.35);
    } else if (uLayerRole < 2.5) {
      // Sheath: broad fine haze of the mixed shear layer — no solid fill.
      xsec = exp(-side * side * 0.60);
      dens = softEdge * xsec * lit * (0.06 + webFil * 1.35);
    } else if (uLayerRole < 3.5) {
      // Ejected parcel cloud: cool, broad, structurally soft.
      xsec = exp(-side * side * 0.85);
      dens = softEdge * xsec * lit * (0.22 + webFil * 1.25);
    } else {
      // History filament: thin thread, gentle filament modulation, CPU owns the length fade.
      xsec = exp(-side * side * 3.4);
      dens = softEdge * xsec * lit * (0.55 + webFil * 0.62);
    }

    float alpha = clamp(uOpacity * dens, 0.0, 1.0);
    if (alpha < 0.012) discard;

    // Temperature ramp: white-hot throat → electric cyan filaments → deep blue dissipation.
    float hot = isJet
      ? clamp(exitGlow * (0.55 + 0.5 * web) + shockNode * 1.3 + uBoost * 0.22 * exitGlow, 0.0, 1.0)
      : 0.0;
    vec3 cyan = mix(uColor, vec3(0.38, 0.88, 1.0), 0.62);
    vec3 deep = mix(uColor, vec3(0.07, 0.18, 0.68), 0.5);
    vec3 col = mix(deep, cyan, clamp(webFil * 0.95 + lit * 0.3, 0.0, 1.0));
    col = mix(col, vec3(1.0, 0.99, 0.97), hot);

    // Radiance: filaments and shock nodes bloom, background stays dark.
    float rad = uRadiance * (0.36 + webFil * 1.2 + shockNode * 1.8 + lit * 0.45);
    col *= min(rad, 1.9);

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
    // Concentric structure: searing core, bell-lip ring, breathing halo. Faded rather than clipped
    // at the disc edge — a saturated interior against a hard r=1 cut renders as a white ball with
    // a drawn-on rim instead of a glow inside a bell.
    float core = exp(-r * r * 7.5);
    // Bell-lip ring kept faint. At the strength it used to have it drew a distinct annulus, which
    // with a saturated middle read as a hard grey-blue ball stuck on the back of the hull.
    float ring = exp(-pow(abs(r - 0.68) * 5.5, 2.0)) * 0.14;
    float halo = exp(-r * 2.6) * 0.3;
    float rim = 1.0 - smoothstep(0.72, 1.0, r);
    // Micro-flicker kept small (no strobe). Energy is normalized well below 1: the throat is a lamp
    // inside the bell, not the brightest object in the frame.
    float fl = 0.94 + 0.04 * sin(uTime * 37.0) + 0.03 * sin(uTime * 91.0 + 1.7);
    float energy = 0.22 + uDrive * 0.28 + uBoost * 0.18;
    float i = (core * 0.8 + ring + halo) * energy * fl * rim;
    vec3 col = mix(uColor, vec3(1.0, 0.99, 0.97), clamp(core * 1.35, 0.0, 1.0));
    col *= min(i * uRadiance, 1.3);
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

function createLayerMaterial(T, spec) {
  const c = spec.color || [0.4, 0.8, 1];
  const freq = spec.freq || [0.3, 2.4];
  return new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlowSpeed: { value: 0 },
      uTurbulence: { value: 0 },
      uColor: { value: new T.Color(c[0], c[1], c[2]) },
      uOpacity: { value: spec.opacity != null ? spec.opacity : 0.7 },
      uRadiance: { value: spec.radiance != null ? spec.radiance : 1.6 },
      uLayerRole: { value: spec.roleId },
      uDrive: { value: 0 },
      uBoost: { value: 0 },
      uFreq: { value: new T.Vector2(freq[0], freq[1]) },
      uAxialLen: { value: 12 },
      uShock: { value: 0 },
      uShockPitch: { value: 2 },
      uShockDecay: { value: 8 },
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

function makeStripMesh(T, nSeg, spec, nameSuffix) {
  const verts = nSeg * 2;
  const pos = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const flow = new Float32Array(verts);
  const fade = new Float32Array(verts);
  const geo = new T.BufferGeometry();
  const posAttr = new T.BufferAttribute(pos, 3);
  posAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  const uvAttr = new T.BufferAttribute(uvs, 2);
  uvAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('uv', uvAttr);
  const flowAttr = new T.BufferAttribute(flow, 1);
  flowAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('aFlow', flowAttr);
  const fadeAttr = new T.BufferAttribute(fade, 1);
  fadeAttr.usage = T.DynamicDrawUsage;
  geo.setAttribute('aFade', fadeAttr);
  const idx = [];
  for (let i = 0; i < nSeg - 1; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mat = createLayerMaterial(T, spec);
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = spec.renderOrder;
  mesh.name = `sf-liquid-plasma-${spec.role}${nameSuffix || ''}`;
  mesh.visible = false;
  return { mesh, geo, pos, uvs, flow, fade, posAttr, uvAttr, flowAttr, fadeAttr, mat };
}

function hash2(i, j) {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth world-space value noise. Frozen in space, so a thread drawn through it never slides. */
function worldNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export class PlasmaStreamSystem {
  constructor(THREE_NS, recipe = PLAYER_PLASMA_STREAM_RECIPE) {
    this.THREE = THREE_NS || THREE;
    this.recipe = recipe || PLAYER_PLASMA_STREAM_RECIPE;
    const pathCfg = this.recipe.path || {};
    const jetCfg = this.recipe.jet || {};
    const wakeCfg = this.recipe.wake || {};

    this.jetSeg = Math.max(16, jetCfg.segments || 64);
    this.snakeCap = Math.max(16, pathCfg.capacity || 240);
    this.wakeCap = Math.max(12, wakeCfg.capacity || 96);
    // Shared scratch: only one element is built at a time.
    this.nSeg = Math.max(this.jetSeg, this.snakeCap, this.wakeCap + 2);

    this.sampler = createPathSampler(this.snakeCap);
    this._pathX = new Float32Array(this.snakeCap);
    this._pathZ = new Float32Array(this.snakeCap);
    this._pathS = new Float32Array(this.snakeCap);

    this._cx = new Float32Array(this.nSeg);
    this._cy = new Float32Array(this.nSeg);
    this._cz = new Float32Array(this.nSeg);
    this._ax = new Float32Array(this.nSeg);
    this._ay = new Float32Array(this.nSeg);
    this._az = new Float32Array(this.nSeg);
    this._u = new Float32Array(this.nSeg);
    this._flow = new Float32Array(this.nSeg);
    this._fade = new Float32Array(this.nSeg);
    this._half = new Float32Array(this.nSeg);
    this._pinch = new Float32Array(this.nSeg);
    this._latX = new Float32Array(this.nSeg);
    this._latY = new Float32Array(this.nSeg);
    this._latZ = new Float32Array(this.nSeg);
    this._latSX = new Float32Array(this.nSeg);
    this._latSY = new Float32Array(this.nSeg);
    this._latSZ = new Float32Array(this.nSeg);

    // Ejected parcels: world position, birth exhaust direction, age, birth radius, birth odometer.
    this._px = new Float32Array(this.wakeCap);
    this._py = new Float32Array(this.wakeCap);
    this._pz = new Float32Array(this.wakeCap);
    this._pdx = new Float32Array(this.wakeCap);
    this._pdz = new Float32Array(this.wakeCap);
    this._pAge = new Float32Array(this.wakeCap);
    this._pRad = new Float32Array(this.wakeCap);
    this._pSeed = new Float32Array(this.wakeCap);
    this._pHead = -1;
    this._pCount = 0;
    this._emitAccum = 0;
    this._emitSeq = 0;
    // Scratch for the billboard frame — _lateralFor must not allocate per vertex per layer.
    this._lo = { x: 0, y: 0, z: 0 };

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
    this._ignition = 0;
    this._pointCount = 0;
    this._jetCount = 0;
    this._wakeCount = 0;
    this._snakeCount = 0;
    this._odometer = 0;
    this._snakeErase = 0;
    this._hasNozzle = false;
    this._prevNx = 0;
    this._prevNy = 0;
    this._prevNz = 0;
    this._owner = null;
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

    const roleIds = { core: ROLE_CORE, body: ROLE_BODY, sheath: ROLE_SHEATH };
    const layers = this.recipe.layers || [];
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const role = layer.role || 'body';
      const roleId = roleIds[role] != null ? roleIds[role] : ROLE_BODY;
      const base = {
        role,
        roleId,
        color: layer.color,
        freq: layer.freq,
        opacity: layer.opacity,
        radiance: layer.radiance,
        renderOrder: 12 + (role === 'sheath' ? 0 : role === 'body' ? 1 : 2),
      };
      this._addLayer('jet', this.jetSeg, base, layer, '');
      if (layer.cross) {
        this._addLayer('jet', this.jetSeg, {
          ...base,
          opacity: (layer.opacity != null ? layer.opacity : 0.7) * 0.3,
          radiance: (layer.radiance != null ? layer.radiance : 1.6) * 0.62,
          renderOrder: base.renderOrder - 1,
        }, layer, '-cross', 'cross');
      }
    }

    // Ejected parcel cloud sits under the jet: it is the cooled gas the jet is punching through.
    const wakeCfg = this.recipe.wake || {};
    const wakeBase = {
      role: 'wake',
      roleId: ROLE_WAKE,
      color: wakeCfg.color,
      freq: wakeCfg.freq,
      opacity: wakeCfg.opacity,
      radiance: wakeCfg.radiance,
      renderOrder: 10,
    };
    this._addLayer('wake', this.wakeCap + 2, wakeBase, wakeCfg, '');
    if (wakeCfg.cross) {
      this._addLayer('wake', this.wakeCap + 2, {
        ...wakeBase,
        opacity: (wakeCfg.opacity != null ? wakeCfg.opacity : 0.3) * 0.34,
        radiance: (wakeCfg.radiance != null ? wakeCfg.radiance : 0.7) * 0.62,
        renderOrder: 9,
      }, wakeCfg, '-cross', 'cross');
    }

    // History filament LAST: traversal-based gates measure the longest element.
    const snakeCfg = this.recipe.snake || {};
    this._addLayer('snake', this.snakeCap, {
      role: 'snake',
      roleId: ROLE_SNAKE,
      color: snakeCfg.color,
      freq: snakeCfg.freq,
      opacity: snakeCfg.opacity,
      radiance: snakeCfg.radiance,
      renderOrder: 8,
    }, snakeCfg, '');

    scene.add(this.group);
    return this.group;
  }

  _addLayer(element, segments, spec, cfg, nameSuffix, plane = 'primary') {
    const built = makeStripMesh(this.THREE, segments, spec, nameSuffix);
    this.group.add(built.mesh);
    this._layers.push({
      element,
      role: spec.role,
      roleId: spec.roleId,
      plane,
      widthScale: cfg.widthScale != null ? cfg.widthScale : 1,
      spread: cfg.spread != null ? cfg.spread : 1,
      lengthScale: cfg.lengthScale != null ? cfg.lengthScale : 1,
      shockScale: cfg.shock != null ? cfg.shock : 0,
      baseOpacity: spec.opacity != null ? spec.opacity : 0.7,
      baseRadiance: spec.radiance != null ? spec.radiance : 1.6,
      segments,
      ...built,
    });
  }

  reset() {
    this.sampler.clear();
    this._active = false;
    this._pointCount = 0;
    this._jetCount = 0;
    this._wakeCount = 0;
    this._snakeCount = 0;
    this._pHead = -1;
    this._pCount = 0;
    this._emitAccum = 0;
    this._snakeErase = 0;
    this._ignition = 0;
    this._hasNozzle = false;
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
   * Rigid nozzle-locked plume centerline: straight along the exhaust axis, physical length in WU.
   *
   * Axis convention matches ContinuousPlume / production sockets: jet extends along **-ax**
   * (vfx writes ax = -exhaustForward, so -ax is the exhaust direction).
   */
  _buildJet(nx, ny, nz, ex, ey, ez, jetLen, shockCfg, shockAmp, drive, boost) {
    const count = this.jetSeg;
    const pitch = shockCfg.pitchWU != null ? shockCfg.pitchWU : 2;
    const decay = shockCfg.decayWU != null ? shockCfg.decayWU : 8;
    const pinchAmt = (shockCfg.pinch != null ? shockCfg.pinch : 0) * shockAmp;
    for (let i = 0; i < count; i++) {
      const u = count <= 1 ? 0 : i / (count - 1);
      const axial = u * jetLen;
      this._cx[i] = nx + ex * axial;
      this._cy[i] = ny + ey * axial;
      this._cz[i] = nz + ez * axial;
      this._ax[i] = ex;
      this._ay[i] = ey;
      this._az[i] = ez;
      this._u[i] = u;
      this._flow[i] = axial;
      samplePlasmaEnvelope(u, drive, boost, this._env);
      this._fade[i] = this._env.opacity;
      // Barrel-shock pinch: the limb is pulled in at each node and bulges between them. Done on
      // the CPU so the silhouette actually necks instead of only the shading implying it.
      const node = Math.pow(0.5 + 0.5 * Math.cos(shockPhase(axial, pitch) * Math.PI * 2), 8)
        * Math.exp(-axial / Math.max(0.5, decay));
      this._pinch[i] = 1 - pinchAmt * node + pinchAmt * 0.45 * (1 - node);
    }
    this._jetCount = count;
    return count;
  }

  /**
   * Ejected parcels. Each puff is emitted once at the nozzle and then owns its own motion: it
   * coasts aft along the exhaust direction it was BORN with, expands as it cools, and fades out.
   * Nothing re-anchors it to the ship, which is what produces a real kink on a hard turn and a
   * detached puff when the throttle is cut.
   */
  _emitWake(nx, ny, nz, ex, ey, ez, dt, rate, birthRadius, drive) {
    if (!(rate > 0) || !(dt > 0)) return;
    this._emitAccum += dt * rate;
    let budget = 8;
    const px = this._prevNx;
    const py = this._prevNy;
    const pz = this._prevNz;
    const hadPrev = this._hasNozzle;
    while (this._emitAccum >= 1 && budget-- > 0) {
      this._emitAccum -= 1;
      // Sub-frame placement: spread this frame's parcels along the nozzle's actual travel so the
      // root never chunks into visible steps at speed.
      const f = Math.max(0, Math.min(1, 1 - this._emitAccum / Math.max(1e-3, dt * rate)));
      const ox = hadPrev ? px + (nx - px) * f : nx;
      const oy = hadPrev ? py + (ny - py) * f : ny;
      const oz = hadPrev ? pz + (nz - pz) * f : nz;
      // Write cursor always advances, so walking back from the head is strict newest→oldest even
      // after the tail has been aged off.
      const slot = (this._pHead + 1) % this.wakeCap;
      this._emitSeq += 1;
      this._px[slot] = ox;
      this._py[slot] = oy;
      this._pz[slot] = oz;
      this._pdx[slot] = ex;
      this._pdz[slot] = ez;
      this._pAge[slot] = dt * (1 - f);
      this._pRad[slot] = birthRadius * (0.82 + 0.3 * drive) * (0.88 + 0.24 * hash2(slot, 5));
      // Texture seed frozen at ejection: the filaments ride the parcel through the world instead
      // of sliding over a rebuilt mesh. Sequence-based so hovering parcels still differ. The step
      // must be small against the wake's axial frequency or neighbouring parcels decorrelate and
      // print a rung ladder of full-width bands across the cloud.
      this._pSeed[slot] = this._emitSeq * WAKE_SEED_STEP;
      this._pHead = slot;
      if (this._pCount < this.wakeCap) this._pCount++;
    }
  }

  _advanceWake(dt, drift, life) {
    if (this._pCount <= 0) return;
    const step = drift * dt;
    const cap = this.wakeCap;
    for (let i = 0; i < this._pCount; i++) {
      const slot = ((this._pHead - i) % cap + cap) % cap;
      this._px[slot] += this._pdx[slot] * step;
      this._pz[slot] += this._pdz[slot] * step;
      this._pAge[slot] += dt;
    }
    // Ring order is newest→oldest walking back from head; drop the tail once it ages out.
    while (this._pCount > 0) {
      const tail = ((this._pHead - (this._pCount - 1)) % cap + cap) % cap;
      if (this._pAge[tail] < life) break;
      this._pCount--;
    }
  }

  _buildWake(nx, ny, nz, life, expandPerS, emitting) {
    let count = 0;
    if (emitting) {
      // Only pin to the bell while gas is actually being produced.
      this._cx[0] = nx;
      this._cy[0] = ny;
      this._cz[0] = nz;
      this._u[0] = 0;
      this._flow[0] = (this._emitSeq + 1) * WAKE_SEED_STEP;
      this._fade[0] = 0.25;
      this._half[0] = 0.35;
      count = 1;
    }
    for (let i = 0; i < this._pCount && count < this.wakeCap + 2; i++) {
      const slot = ((this._pHead - i) % this.wakeCap + this.wakeCap) % this.wakeCap;
      const age = this._pAge[slot];
      const ageN = Math.max(0, Math.min(1, age / life));
      this._cx[count] = this._px[slot];
      this._cy[count] = this._py[slot];
      this._cz[count] = this._pz[slot];
      this._u[count] = ageN;
      this._flow[count] = this._pSeed[slot];
      // Cooling: emission falls off faster than the cloud expands, so it dissolves rather than
      // ballooning into a visible bag.
      this._fade[count] = Math.pow(1 - ageN, 1.6);
      this._half[count] = this._pRad[slot] * (1 + age * expandPerS) * 0.5;
      count++;
    }
    this._wakeCount = count;
    return count;
  }

  /**
   * History filament through the stored ship path, displaced by a world-space meander field so a
   * ship flying dead straight still leaves a drifting thread instead of a ruled line.
   */
  _buildSnake(pathN, cfg, ny, erase) {
    if (pathN < 3) {
      this._snakeCount = 0;
      return 0;
    }
    const headW = cfg.widthHeadWU != null ? cfg.widthHeadWU : 0.6;
    const tailW = cfg.widthTailWU != null ? cfg.widthTailWU : 0.16;
    const meander = cfg.meanderWU != null ? cfg.meanderWU : 0;
    const mScale = cfg.meanderScaleWU != null ? cfg.meanderScaleWU : 0.02;
    const onset = cfg.meanderOnsetS != null ? cfg.meanderOnsetS : 0.05;
    const spacing = (this.recipe.path && this.recipe.path.sampleSpacingWU) || 0.5;
    const count = Math.min(pathN, this.snakeCap);
    for (let i = 0; i < count; i++) {
      const s = count <= 1 ? 0 : i / (count - 1);
      // Never re-anchor the head to the live nozzle: after cutoff the thread must stay where it
      // was laid down, which is what makes it read as something the ship left behind.
      const rawX = this._pathX[i];
      const rawZ = this._pathZ[i];
      // Tangent from neighbours in path order (live head → oldest).
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(count - 1, i + 1);
      let tx = this._pathX[i1] - this._pathX[i0];
      let tz = this._pathZ[i1] - this._pathZ[i0];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      // Perpendicular offset sampled at the station's own world position: the field is fixed in
      // space, so the wobble appears to have been left behind rather than sliding along the thread.
      const amp = meander * Math.min(1, Math.max(0, (s - onset) / 0.45));
      const n1 = worldNoise(rawX * mScale, rawZ * mScale) - 0.5;
      const n2 = worldNoise(rawX * mScale * 2.7 + 31.7, rawZ * mScale * 2.7 - 12.3) - 0.5;
      const off = (n1 * 1.6 + n2 * 0.7) * amp;
      this._cx[i] = rawX - tz * off;
      this._cy[i] = ny;
      this._cz[i] = rawZ + tx * off;
      this._u[i] = s;
      // Absolute odometer at this station: frozen in world space, so the filament texture stays
      // put while the ship flies out of it.
      this._flow[i] = this._odometer - i * spacing;
      // Head erosion after thrust stops — the thread drains from the nozzle end instead of
      // blinking out all at once.
      const drain = erase > 0 ? Math.min(1, Math.max(0, (s - erase) / 0.12)) : 1;
      this._fade[i] = drain * (1 - Math.pow(s, 2.4));
      this._half[i] = (headW + (tailW - headW) * s) * 0.5;
    }
    // Tangents for the billboard frame, taken from the meandered centerline.
    for (let i = 0; i < count; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(count - 1, i + 1);
      let tx = this._cx[i1] - this._cx[i0];
      let ty = this._cy[i1] - this._cy[i0];
      let tz = this._cz[i1] - this._cz[i0];
      const tl = Math.hypot(tx, ty, tz) || 1;
      this._ax[i] = tx / tl;
      this._ay[i] = ty / tl;
      this._az[i] = tz / tl;
    }
    this._snakeCount = count;
    return count;
  }

  /** Tangents for an arbitrary built centerline (jet writes its own; wake needs this). */
  _buildTangents(count, ex, ey, ez) {
    for (let i = 0; i < count; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(count - 1, i + 1);
      let tx = this._cx[i1] - this._cx[i0];
      let ty = this._cy[i1] - this._cy[i0];
      let tz = this._cz[i1] - this._cz[i0];
      const tl = Math.hypot(tx, ty, tz);
      if (tl < 1e-6) {
        this._ax[i] = ex;
        this._ay[i] = ey;
        this._az[i] = ez;
      } else {
        this._ax[i] = tx / tl;
        this._ay[i] = ty / tl;
        this._az[i] = tz / tl;
      }
    }
  }

  /** Writes the camera-facing side vector into this._lo. Allocation-free: called per vertex. */
  _lateralFor(px, py, pz, ax, ay, az, plane) {
    const out = this._lo;
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
        out.x = cxs / cl; out.y = cys / cl; out.z = czs / cl;
        return out;
      }
      out.x = lx; out.y = ly; out.z = lz;
      return out;
    }
    if (plane === 'cross') {
      const cxs = ay * fz - az * fy;
      const cys = az * fx - ax * fz;
      const czs = ax * fy - ay * fx;
      const cl = Math.hypot(cxs, cys, czs) || 1;
      out.x = cxs / cl; out.y = cys / cl; out.z = czs / cl;
      return out;
    }
    out.x = fx; out.y = fy; out.z = fz;
    return out;
  }

  /** Writes one strip. Base half widths must already be in this._half. */
  _writeStrip(L, count, widthMul = 1) {
    const pos = L.pos;
    const uvs = L.uvs;
    const flow = L.flow;
    const fade = L.fade;
    const cap = Math.min(count, L.segments);
    // Pass 1: raw laterals for every station.
    for (let i = 0; i < cap; i++) {
      const lat = this._lateralFor(
        this._cx[i], this._cy[i], this._cz[i],
        this._ax[i], this._ay[i], this._az[i], L.plane,
      );
      this._latX[i] = lat.x;
      this._latY[i] = lat.y;
      this._latZ[i] = lat.z;
    }
    // Pass 2: smooth laterals so billboard orientation does not jump plate-to-plate.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < cap; i++) {
        this._latSX[i] = this._latX[i];
        this._latSY[i] = this._latY[i];
        this._latSZ[i] = this._latZ[i];
      }
      const tx = this._latSX;
      const ty = this._latSY;
      const tz = this._latSZ;
      for (let i = 0; i < cap; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(cap - 1, i + 1);
        const i2 = Math.max(0, i - 2);
        const i3 = Math.min(cap - 1, i + 2);
        let lx = tx[i] * 0.4 + tx[i0] * 0.25 + tx[i1] * 0.25 + tx[i2] * 0.05 + tx[i3] * 0.05;
        let ly = ty[i] * 0.4 + ty[i0] * 0.25 + ty[i1] * 0.25 + ty[i2] * 0.05 + ty[i3] * 0.05;
        let lz = tz[i] * 0.4 + tz[i0] * 0.25 + tz[i1] * 0.25 + tz[i2] * 0.05 + tz[i3] * 0.05;
        if (lx * tx[i] + ly * ty[i] + lz * tz[i] < 0) {
          lx = -lx; ly = -ly; lz = -lz;
        }
        const ll = Math.hypot(lx, ly, lz) || 1;
        this._latX[i] = lx / ll;
        this._latY[i] = ly / ll;
        this._latZ[i] = lz / ll;
      }
    }
    // Pass 3: write vertex pairs.
    for (let i = 0; i < cap; i++) {
      const half = this._half[i] * widthMul;
      const s = cap <= 1 ? 0 : i / (cap - 1);
      const px = this._cx[i];
      const py = this._cy[i];
      const pz = this._cz[i];
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
      flow[i0] = this._flow[i];
      flow[i1] = this._flow[i];
      fade[i0] = this._fade[i];
      fade[i1] = this._fade[i];
    }
    // Collapse the unused tail of the buffer onto the last live station. Leaving it untouched
    // parks stale vertices at the world origin, which is invisible on screen (drawRange excludes
    // them) but poisons anything that reads the whole attribute — bounds, gates, tooling.
    if (cap >= 1 && cap < L.segments) {
      const last = (cap - 1) * 2;
      const lx = pos[last * 3];
      const ly = pos[last * 3 + 1];
      const lz = pos[last * 3 + 2];
      const lx2 = pos[(last + 1) * 3];
      const ly2 = pos[(last + 1) * 3 + 1];
      const lz2 = pos[(last + 1) * 3 + 2];
      const lf = flow[last];
      for (let i = cap; i < L.segments; i++) {
        const i0 = i * 2;
        const i1 = i0 + 1;
        pos[i0 * 3] = lx; pos[i0 * 3 + 1] = ly; pos[i0 * 3 + 2] = lz;
        pos[i1 * 3] = lx2; pos[i1 * 3 + 1] = ly2; pos[i1 * 3 + 2] = lz2;
        uvs[i0 * 2] = 1; uvs[i0 * 2 + 1] = 0;
        uvs[i1 * 2] = 1; uvs[i1 * 2 + 1] = 1;
        flow[i0] = lf; flow[i1] = lf;
        fade[i0] = 0; fade[i1] = 0;
      }
    }
    L.posAttr.needsUpdate = true;
    L.uvAttr.needsUpdate = true;
    L.flowAttr.needsUpdate = true;
    L.fadeAttr.needsUpdate = true;
    L.geo.setDrawRange(0, Math.max(0, (cap - 1) * 6));
    L.mesh.visible = cap >= 2;
    return cap;
  }

  _hideElement(element) {
    for (let li = 0; li < this._layers.length; li++) {
      const L = this._layers[li];
      if (L.element !== element) continue;
      L.mesh.visible = false;
      L.geo.setDrawRange(0, 0);
    }
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

    // Boost easing: fast attack (~90 ms) reads as a kick, slower release (~300 ms) as spool-down.
    const boostTarget = Math.max(0, Math.min(1, boost));
    const prevBoost = this._boostBlend;
    const boostTau = boostTarget > this._boostBlend ? 0.09 : 0.3;
    this._boostBlend += (boostTarget - this._boostBlend)
      * (1 - Math.exp(-frameDt / Math.max(1e-3, boostTau)));
    const boostSm = this._boostBlend;
    this._lastBoost = boostSm;

    const jetCfg = this.recipe.jet || {};
    const ignCfg = jetCfg.ignition || {};
    // One-shot ignition transient: boost light-up is an EVENT (overpressure flare, shock train
    // snapping in) that then settles, not a linear ramp of the same shape.
    if (boostSm - prevBoost > 0.06) {
      this._ignition = Math.min(1, this._ignition + (boostSm - prevBoost) * 4.5);
    }
    this._ignition = Math.max(0, this._ignition
      - frameDt * (ignCfg.decayPerS != null ? ignCfg.decayPerS : 3.6));
    const ignition = this._ignition;

    const idleFloor = this.recipe.drive?.idleFloor ?? 0.04;
    const emitting = activeDrive >= idleFloor;

    const list = sockets && sockets.length ? sockets : null;
    // Production sockets (ContinuousPlume convention): ax points opposite exhaust;
    // jet extends along -ax. Default ax=+1 (ship +X) ⇒ exhaust -X.
    const primary = list ? list[0] : { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    let dirX = Number.isFinite(primary.ax) ? primary.ax : 1;
    let dirY = Number.isFinite(primary.ay) ? primary.ay : 0;
    let dirZ = Number.isFinite(primary.az) ? primary.az : 0;
    const dLen = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= dLen; dirY /= dLen; dirZ /= dLen;
    const ex = -dirX;
    const ey = -dirY;
    const ez = -dirZ;
    const nx = primary.x || 0;
    const ny = primary.y || 0;
    const nz = primary.z || 0;

    const pathCfg = this.recipe.path || {};
    const spacing = pathCfg.sampleSpacingWU || 0.5;
    const disc = Math.min(
      pathCfg.discontinuityMaxWU || 640,
      Math.max(pathCfg.discontinuityFloorWU || 160, speed * 0.08 + 80),
    );

    // Owner change or a teleport-scale jump invalidates every parcel we are holding.
    const ownerId = owner != null ? owner : primary;
    const jumped = this._hasNozzle
      && Math.hypot(nx - this._prevNx, nz - this._prevNz) > disc;
    if (this._owner !== ownerId || jumped) {
      this._owner = ownerId;
      this._pHead = -1;
      this._pCount = 0;
      this._emitAccum = 0;
      this._hasNozzle = false;
    }

    const frameTravel = this._hasNozzle ? Math.hypot(nx - this._prevNx, nz - this._prevNz) : 0;
    this._odometer += frameTravel;

    // Nothing left to draw and nothing being produced: go fully cold.
    if (!emitting && this._pCount === 0 && !this.sampler.hasLive) {
      this.reset();
      return { live: 0, pathPoints: 0, continuous: true };
    }

    const period = 1 / Math.max(12, pathCfg.sampleHz || 40);
    if (emitting) {
      this.sampler.follow(
        nx, nz, Math.atan2(dirZ, dirX), dt, ownerId, spacing, disc, period,
      );
    }
    const pathN = this.sampler.hasLive
      ? this.sampler.sampleInto(this._pathX, this._pathZ, this._pathS, this.snakeCap)
      : 0;

    const nSock = list ? Math.min(list.length, 4) : 1;
    const rootMul = 1 + Math.min(0.4, (nSock - 1) * 0.1);
    const driveCfg = this.recipe.drive || {};
    const flashScale = a11y && a11y.reducedFlash ? 0.72 : 1;
    const motionScroll = a11y && a11y.reducedMotion ? 0.12 : 1;

    // Boost is LENGTH and HEAT, not width. Width barely moves, so a boost reads as the plume
    // spearing out and going white rather than the whole cone inflating in place.
    const boostLenMul = 1 + ((driveCfg.boostLengthMul != null ? driveCfg.boostLengthMul : 1.85) - 1)
      * boostSm;
    const boostW = 1 + ((driveCfg.boostWidthMul != null ? driveCfg.boostWidthMul : 1.08) - 1)
      * boostSm;
    const boostR = 1 + ((driveCfg.boostRadianceMul != null ? driveCfg.boostRadianceMul : 1.5) - 1)
      * boostSm;

    const lengthFloor = jetCfg.driveLengthFloor != null ? jetCfg.driveLengthFloor : 0.45;
    const baseLen = jetCfg.lengthWU != null ? jetCfg.lengthWU : 14;
    const driveLen = lengthFloor + (1 - lengthFloor) * Math.min(1.15, activeDrive);
    const jetLen = Math.max(1.5, baseLen * driveLen * boostLenMul
      * (1 + ignition * (ignCfg.lengthOvershoot != null ? ignCfg.lengthOvershoot : 0.24)));
    const exitR = (jetCfg.exitRadiusWU != null ? jetCfg.exitRadiusWU : 1.32) * rootMul * boostW;
    const collimate = jetCfg.boostCollimate != null ? jetCfg.boostCollimate : 0.28;

    const shockCfg = jetCfg.shock || {};
    const shockAmp = ((shockCfg.amplitude != null ? shockCfg.amplitude : 0.55)
      + (shockCfg.boostGain != null ? shockCfg.boostGain : 0.55) * boostSm
      + (ignCfg.shockGain != null ? ignCfg.shockGain : 0.8) * ignition)
      * Math.min(1, activeDrive / 0.35);

    // Ejected parcels: produce while thrusting, then let physics finish the job.
    const wakeCfg = this.recipe.wake || {};
    const wakeLife = wakeCfg.lifeS != null ? wakeCfg.lifeS : 1.15;
    const wakeDrift = wakeCfg.driftWU != null ? wakeCfg.driftWU : 44;
    const wakeExpand = wakeCfg.expandPerS != null ? wakeCfg.expandPerS : 3.4;
    this._advanceWake(frameDt, wakeDrift, wakeLife);
    if (emitting) {
      const emitRate = (wakeCfg.emitHz != null ? wakeCfg.emitHz : 52)
        * (1 + ((wakeCfg.boostEmitMul != null ? wakeCfg.boostEmitMul : 1.45) - 1) * boostSm);
      this._emitWake(
        nx, ny, nz, ex, ey, ez, frameDt, emitRate,
        (wakeCfg.birthRadiusWU != null ? wakeCfg.birthRadiusWU : 1.55) * rootMul,
        Math.min(1, activeDrive),
      );
    }

    // History filament erosion: while thrusting the head is pinned at the nozzle; after cutoff it
    // drains forward and the sampler is released once the whole thread is gone.
    const snakeCfg = this.recipe.snake || {};
    const eraseS = snakeCfg.eraseS != null ? snakeCfg.eraseS : 1.5;
    if (emitting) {
      this._snakeErase = 0;
    } else {
      this._snakeErase += frameDt / Math.max(0.05, eraseS);
      if (this._snakeErase >= 1.15) this.sampler.clear();
    }

    this._prevNx = nx;
    this._prevNy = ny;
    this._prevNz = nz;
    this._hasNozzle = true;

    const camD = Math.hypot(this._cam.x - nx, this._cam.y - ny, this._cam.z - nz);
    // Minification compensation: additive filaments average toward black at the far chase camera.
    const distRad = Math.max(1, Math.min(2.0, camD / 85));
    const distOpa = Math.max(1, Math.min(1.45, camD / 110));
    this.group.visible = true;

    // ---- Element builds ----------------------------------------------------------------------
    let jetCount = 0;
    if (emitting) {
      jetCount = this._buildJet(
        nx, ny, nz, ex, ey, ez, jetLen, shockCfg, shockAmp, activeDrive, boostSm,
      );
    } else {
      this._jetCount = 0;
      this._hideElement('jet');
    }

    const exhaustFlow = (jetCfg.exhaustSpeedWU != null ? jetCfg.exhaustSpeedWU : 30)
      * (1 + ((jetCfg.boostSpeedMul != null ? jetCfg.boostSpeedMul : 1.6) - 1) * boostSm)
      * motionScroll;
    const turbulence = boostSm;
    const shockPitch = shockCfg.pitchWU != null ? shockCfg.pitchWU : 2;
    const shockDecay = shockCfg.decayWU != null ? shockCfg.decayWU : 8;

    if (jetCount >= 2) {
      for (let li = 0; li < this._layers.length; li++) {
        const L = this._layers[li];
        if (L.element !== 'jet') continue;
        const layerExit = exitR * L.widthScale;
        for (let i = 0; i < jetCount; i++) {
          this._half[i] = sampleJetHalfWidth(this._u[i], layerExit, L.spread, boostSm, collimate)
            * (1 + (this._pinch[i] - 1) * L.shockScale);
        }
        this._writeStrip(L, jetCount);
        const u = L.mat.uniforms;
        u.uTime.value = this._time;
        u.uFlowSpeed.value = exhaustFlow;
        u.uTurbulence.value = turbulence;
        u.uDrive.value = activeDrive;
        u.uBoost.value = boostSm;
        u.uAxialLen.value = jetLen * L.lengthScale;
        u.uShock.value = shockAmp * L.shockScale;
        u.uShockPitch.value = shockPitch;
        u.uShockDecay.value = shockDecay;
        u.uOpacity.value = Math.min(1.05,
          L.baseOpacity * flashScale * (0.62 + activeDrive * 0.5) * distOpa);
        u.uRadiance.value = L.baseRadiance * boostR * flashScale
          * (0.9 + activeDrive * 0.3 + ignition * (ignCfg.radianceOvershoot ?? 0.7)) * distRad;
      }
    }

    const wakeCount = this._buildWake(nx, ny, nz, wakeLife, wakeExpand, emitting);
    if (wakeCount >= 2) {
      this._buildTangents(wakeCount, ex, ey, ez);
      for (let li = 0; li < this._layers.length; li++) {
        const L = this._layers[li];
        if (L.element !== 'wake') continue;
        this._writeStrip(L, wakeCount, L.widthScale);
        const u = L.mat.uniforms;
        u.uTime.value = this._time;
        u.uFlowSpeed.value = 0;
        u.uTurbulence.value = turbulence;
        u.uDrive.value = activeDrive;
        u.uBoost.value = boostSm;
        u.uOpacity.value = Math.min(1.0, L.baseOpacity * flashScale * distOpa);
        u.uRadiance.value = L.baseRadiance * flashScale * (0.9 + boostSm * 0.3) * distRad;
      }
    } else {
      this._wakeCount = 0;
      this._hideElement('wake');
    }

    const snakeCount = this._buildSnake(pathN, snakeCfg, ny, this._snakeErase);
    if (snakeCount >= 2) {
      for (let li = 0; li < this._layers.length; li++) {
        const L = this._layers[li];
        if (L.element !== 'snake') continue;
        this._writeStrip(L, snakeCount, L.widthScale);
        const u = L.mat.uniforms;
        u.uTime.value = this._time;
        u.uFlowSpeed.value = 0;
        u.uTurbulence.value = turbulence * 0.4;
        u.uDrive.value = activeDrive;
        u.uBoost.value = boostSm;
        u.uOpacity.value = Math.min(1.0, L.baseOpacity * flashScale * distOpa);
        u.uRadiance.value = L.baseRadiance * flashScale * (0.85 + boostSm * 0.35) * distRad;
      }
    } else {
      this._snakeCount = 0;
      this._hideElement('snake');
    }
    // A released history filament remains a live visual after its jet and wake have ended.
    // Keep inspection truth aligned with the strip that is still being drawn; this does not
    // participate in rendering or lifetime decisions.
    this._active = emitting || this._pCount > 0 || snakeCount >= 2;

    // Nozzle throat glows — one per live socket, camera-billboarded, depth-tested against hull.
    const throatCfg = this.recipe.throat || {};
    // A real throat does not grow when you open the taps — it gets hotter. Radius barely moves.
    const throatRadius = (throatCfg.radiusWU != null ? throatCfg.radiusWU : 1.45)
      * (0.82 + activeDrive * 0.14 + boostSm * 0.08 + ignition * 0.12);
    const throatOpacity = (throatCfg.opacity != null ? throatCfg.opacity : 0.9) * flashScale;
    const throatRadiance = (throatCfg.radiance != null ? throatCfg.radiance : 2.4)
      * (1 + boostSm * 0.35 + ignition * 0.55) * flashScale;
    for (let ti = 0; ti < this._throats.length; ti++) {
      const throat = this._throats[ti];
      const sock = emitting && list && ti < nSock ? list[ti] : null;
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

    this._pointCount = Math.max(jetCount, wakeCount, snakeCount);
    return {
      live: this._pointCount,
      pathPoints: pathN,
      continuous: true,
      medium: 'liquid-billboard-layers',
      pointCount: this._pointCount,
      construction: 'soft-camera-facing-strips',
      jetLengthWU: jetLen,
      jetPoints: jetCount,
      wakeParcels: this._pCount,
      snakePoints: snakeCount,
      ignition,
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
      layers: this._layers.map((L) => `${L.element}:${L.role}:${L.plane}`),
      drive: this._lastDrive,
      boost: this._lastBoost,
      ignition: this._ignition,
      pointCount: this._pointCount,
      jetPoints: this._jetCount,
      wakeParcels: this._pCount,
      snakePoints: this._snakeCount,
      construction: 'soft-camera-facing-strips',
    };
  }
}

export default PlasmaStreamSystem;
