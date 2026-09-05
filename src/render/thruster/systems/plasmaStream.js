/**
 * Player thruster — a raymarched exhaust volume plus a stylistic history thread.
 *
 *   volume  The exhaust itself. A raymarched 3D density field inside an oriented proxy box at each
 *           nozzle: curl-warped ridged noise, integrated front-to-back, so filaments genuinely
 *           overlap and occlude and the silhouette is where density runs out rather than where a
 *           proxy's edge is. See `../materials/volumetricPlumeMaterial.js` for why this replaced
 *           the previous camera-facing sheets, which could only ever produce stripes on a cone.
 *   throat  Small billboarded discs at each bell, for the searing over-range hot spot the volume
 *           integral alone cannot reach.
 *   snake   Thin history filament through a world-space meander field, tracing where the ship has
 *           been. This one is a deliberate stylistic choice, not a physical claim.
 *
 * Volume noise advects in world units at exhaust speed, so structure is BORN at the throat and
 * streams out of it. Nothing here is a texture sliding along a static mesh.
 */
import * as THREE from 'three';
import { createPathSampler } from './pathSampler.js';
import { PlasmaRibbonPlume } from '../ribbon/plasmaRibbons.js';
import { ContrailTrail } from '../ribbon/contrailTrail.js';
import { DriveForge } from '../ribbon/driveForge.js';
import {
  EMIT_FLOOR,
  createDriveEnvelope,
  integrateDriveEnvelope,
  resolvePlumeShape,
} from '../ribbon/driveEnvelope.js';
import { PLAYER_PLASMA_STREAM_RECIPE } from '../recipes/plasmaStreamRecipe.js';

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
  uniform vec2 uFreq;

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

    // Advected material coordinate. Filaments travel aft with the gas instead of scrolling.
    float f = vFlow - uTime * uFlowSpeed;

    // Age of this station, 0 at the nozzle. Drives eddy growth. The CPU owns the length fade for
    // the thread, so age is simply the inverse of it.
    float axGrow = clamp(1.0 - vFade, 0.0, 1.0);

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
    float fil = web * 0.7 + web2 * 0.4;

    // Noise-carved limb: torn, organic silhouette rather than a crisp quad rim.
    float edgeN = fbm(vec2(f * uFreq.x * 1.3 + 9.0, side * 2.3));
    float softEdge = 1.0 - smoothstep(0.30 + edgeN * 0.35, 0.95 + edgeN * 0.20, abs(side));

    // Length fade is owned by the CPU (age and post-cutoff erosion) and arrives in aFade.
    float lit = clamp(vFade, 0.0, 1.0);

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
    float xsec = exp(-side * side * 3.4);
    float dens = softEdge * xsec * lit * (0.55 + webFil * 0.62);

    float alpha = clamp(uOpacity * dens, 0.0, 1.0);
    if (alpha < 0.012) discard;

    // Temperature ramp: electric cyan filaments through deep blue dissipation. The thread is gas
    // the ship already left behind, so it never carries the white-hot throat tone.
    vec3 cyan = mix(uColor, vec3(0.38, 0.88, 1.0), 0.62);
    vec3 deep = mix(uColor, vec3(0.07, 0.18, 0.68), 0.5);
    vec3 col = mix(deep, cyan, clamp(webFil * 0.95 + lit * 0.3, 0.0, 1.0));

    // Radiance: filaments bloom, background stays dark.
    float rad = uRadiance * (0.36 + webFil * 1.2 + lit * 0.45);
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
      uFreq: { value: new T.Vector2(freq[0], freq[1]) },
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

    this.snakeCap = Math.max(16, pathCfg.capacity || 240);
    // The history filament is the only strip element; the exhaust itself is the raymarched volume.
    this.nSeg = this.snakeCap;

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
    this._latX = new Float32Array(this.nSeg);
    this._latY = new Float32Array(this.nSeg);
    this._latZ = new Float32Array(this.nSeg);
    this._latSX = new Float32Array(this.nSeg);
    this._latSY = new Float32Array(this.nSeg);
    this._latSZ = new Float32Array(this.nSeg);

    // Scratch for the billboard frame — _lateralFor must not allocate per vertex per layer.
    this._lo = { x: 0, y: 0, z: 0 };

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
    this._snakeCount = 0;
    this._odometer = 0;
    this._snakeErase = 0;
    this._hasNozzle = false;
    this._prevNx = 0;
    this._prevNy = 0;
    this._prevNz = 0;
    this._owner = null;
    // Stable default pose and owner token for socketless callers; never allocate this in update().
    this._fallbackNozzle = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };

    // Two independent elements, because a jet and a flight history are not the same object.
    //
    //   _ribbons  the PLUME: nozzle-local, ~2 hull lengths, hot, gas flowing through it
    //   _trails   leftover thruster light: one ghost per bell, on the positions that bell occupied
    //
    // They were previously one thing, which forced the plume to be two seconds long — hundreds of
    // world units at cruise — so it read as a tail welded to the hull and dragged around.
    this._ribbons = new PlasmaRibbonPlume(this.THREE, {});
    this._trails = [];
    this._trailNozzles = [];
    // One forge per line: the mouth each line is drawn out of. Paired with the trail rather than
    // with the bell, because it has to follow the line's heading, not the hull's.
    this._forges = [];
    this._forgeAim = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 4; i++) {
      this._trails.push(new ContrailTrail(this.THREE, {}));
      this._trailNozzles.push({ x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 });
      this._forges.push(new DriveForge(this.THREE, {}));
    }
    this._contrail = this._trails[0];
    this._forge = this._forges[0];
    this._env = createDriveEnvelope();
    this._ribbonShape = {};
    this._ribbonNozzle = { x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 };
    const rib = this.recipe.ribbon || {};
    const jet = this.recipe.jet || {};
    this._ribbonBase = {
      jetLength: rib.jetLength != null ? rib.jetLength : (jet.lengthWU != null ? jet.lengthWU : 17),
      throatRadius: rib.throatRadius != null ? rib.throatRadius : 1.32,
      spread: rib.spread != null ? rib.spread : 2.6,
      radiance: rib.radiance != null ? rib.radiance : 1.12,
      opacity: rib.opacity != null ? rib.opacity : 0.055,
    };
  }

  setCamera(camera) {
    if (!camera || !camera.position) return;
    this._cam.x = camera.position.x;
    this._cam.y = camera.position.y;
    this._cam.z = camera.position.z;
    this._camObj = camera;
    if (this._ribbons) this._ribbons.setCamera(camera);
    this._setTrailCameras(camera);
  }

  setCameraPosition(x, y, z) {
    this._cam.x = x;
    this._cam.y = y;
    this._cam.z = z;
    this._camObj = null;
    if (this._ribbons) this._ribbons.material.uniforms.uCamPos.value.set(x, y, z);
    if (this._trails) {
      for (let i = 0; i < this._trails.length; i++) {
        this._trails[i].material.uniforms.uCamPos.value.set(x, y, z);
      }
    }
  }

  _setTrailCameras(camera) {
    if (!this._trails) return;
    for (let i = 0; i < this._trails.length; i++) this._trails[i].setCamera(camera);
  }

  _trailLiveCount() {
    let n = 0;
    if (!this._trails) return 0;
    for (let i = 0; i < this._trails.length; i++) {
      const live = this._trails[i].liveSampleCount();
      if (live > n) n = live;
    }
    return n;
  }

  attach(scene) {
    if (this._disposed || !scene || this.group) return this.group;
    const T = this.THREE;
    this.group = new T.Group();
    this.group.name = 'sf-liquid-plasma-root';

    // Contrails first, then the plume over them, then the throat quads. Traversals that take the last
    // matching mesh therefore keep landing where they used to.
    for (let i = 0; i < this._trails.length; i++) this._trails[i].attach(this.group);
    for (let i = 0; i < this._forges.length; i++) this._forges[i].attach(this.group);
    this._ribbons.attach(this.group);
    if (this._camObj) {
      this._setTrailCameras(this._camObj);
      this._ribbons.setCamera(this._camObj);
    }

    // Nozzle throat glows next so group traversals that take the last strip mesh (unit tests,
    // look-dev gates) keep measuring the wake strips, not these quads.
    const throatCfg = this.recipe.throat || {};
    const throatColor = throatCfg.color || [0.5, 0.9, 1];
    for (let ti = 0; ti < 4; ti++) {
      const throat = createThroatMesh(T, throatColor);
      throat.name = `sf-plasma-throat-${ti}`;
      this.group.add(throat);
      this._throats.push(throat);
    }

    // History filament is the only strip element left. The jet core/body/sheath sheets and the
    // ejected-parcel cloud that used to live here were the tiger stripes and the 45-degree specks;
    // the raymarched volume above renders all of that exhaust now.
    const snakeCfg = this.recipe.snake || {};
    this._addLayer('snake', this.snakeCap, {
      role: 'snake',
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
    this._snakeCount = 0;
    this._snakeErase = 0;
    this._ignition = 0;
    this._hasNozzle = false;
    for (let i = 0; i < this._layers.length; i++) {
      this._layers[i].mesh.visible = false;
      this._layers[i].geo.setDrawRange(0, 0);
    }
    for (let i = 0; i < this._throats.length; i++) this._throats[i].visible = false;
    if (this._ribbons) this._ribbons.reset();
    if (this._trails) {
      for (let i = 0; i < this._trails.length; i++) this._trails[i].reset();
    }
    if (this._env) {
      this._env.spool = 0; this._env.boost = 0; this._env.dash = 0; this._env.dashAge = -1;
    }
    if (this.group) this.group.visible = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    if (this._ribbons) { this._ribbons.dispose(); this._ribbons = null; }
    if (this._trails) {
      for (let i = 0; i < this._trails.length; i++) this._trails[i].dispose();
      this._trails.length = 0;
    }
    if (this._forges) {
      for (let i = 0; i < this._forges.length; i++) this._forges[i].dispose();
      this._forges.length = 0;
    }
    this._contrail = null;
    this._forge = null;
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
      // Front-loaded decay. A curve that holds most of its opacity until the very end draws a hard
      // line all the way to wherever the buffer happens to stop, and the eye reads a ruled line to
      // the horizon rather than something dissipating. Most of the brightness has to be spent in
      // the first third so the thread is visibly gone before it runs out of samples.
      this._fade[i] = drain * Math.pow(1 - s, 1.8);
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
    // Everything the plume shows is driven off the smoothed envelope, including the throat glow. The
    // previous raw `Math.max` of live inputs is what made pressing forward a one-frame jump from
    // idle to full — the "clips from small to big instantly" this construction exists to fix.
    integrateDriveEnvelope(this._env, {
      throttle: Math.max(throttle, drive),
      speedNorm: Math.max(0, Math.min(1, driveInfo && driveInfo.speedDrive || 0)),
      boosting: boost > 0.5,
      dashFired: !!(driveInfo && driveInfo.dashFired),
      alive: true,
    }, frameDt);
    const activeDrive = this._env.spool;
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

    // One authority for "is the drive actually firing". The recipe used to carry its own idleFloor of
    // 0.04, below the envelope's idle glow of 0.06, so a parked ship read as emitting forever.
    const emitting = activeDrive >= EMIT_FLOOR;

    const list = sockets && sockets.length ? sockets : null;
    // Production sockets (ContinuousPlume convention): ax points opposite exhaust;
    // jet extends along -ax. Default ax=+1 (ship +X) ⇒ exhaust -X.
    const primary = list ? list[0] : this._fallbackNozzle;
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

    // Owner change or a teleport-scale jump invalidates the pose we are extrapolating from.
    const ownerId = owner != null ? owner : primary;
    const jumped = this._hasNozzle
      && Math.hypot(nx - this._prevNx, nz - this._prevNz) > disc;
    if (this._owner !== ownerId || jumped) {
      this._owner = ownerId;
      this._hasNozzle = false;
    }

    const frameTravel = this._hasNozzle ? Math.hypot(nx - this._prevNx, nz - this._prevNz) : 0;
    this._odometer += frameTravel;

    // Nothing commanded, nothing left over: go fully cold. This tests the raw COMMAND, not the smoothed
    // envelope, because `reset()` zeroes the envelope — gating on the envelope meant a drive spooling up
    // from cold got reset every frame before it could cross the firing threshold, and never lit at all.
    const commanded = Math.max(throttle, drive, boost) > 0.001;
    if (!commanded && !emitting && !this.sampler.hasLive && this._trailLiveCount() < 2) {
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
    // The exhaust is swept ribbon sheets. Two earlier constructions were rejected here — camera-facing
    // sheets, which cannot self-occlude, and an isotropic raymarched volume, which can only ever
    // produce soft shoulders and so always read as smoke (VFX standard, bans B3 and B12).
    const nz2 = this._ribbonNozzle;
    nz2.x = nx; nz2.y = ny; nz2.z = nz;
    nz2.aftX = ex; nz2.aftZ = ez;
    resolvePlumeShape(this._env, this._ribbonBase, this._ribbonShape);

    // How hard the engine is drawing its line back in. Keyed on what the PILOT asked for, not on the
    // drive envelope: the envelope holds a lit floor that rises with speed (so a fast ship still
    // glows with the throttle shut), which means a cold-drive test never fires at exactly the moment
    // the player let go — the moment they expect the line to come home. Braking or reversing pulls it
    // in hardest; simply releasing thrust still pulls it in, because a line the engine is no longer
    // making is a line it is taking back.
    const commandedThrottle = Math.max(0, Math.min(1, Math.max(throttle, driveInfo && driveInfo.cruise ? 1 : 0)));
    const hauling = !!(driveInfo && (driveInfo.brake || driveInfo.reverse || driveInfo.retroOnly));
    this._ribbonShape.reel = hauling ? 1 : 1 - commandedThrottle;
    // The hull's spin, for the contrail's corkscrew (PQ-139.04). Zero at rest: nothing changes.
    this._ribbonShape.spin = owner && Number.isFinite(owner.angVel) ? owner.angVel : 0;

    // The jet, standing off the bell. Short by construction.
    this._ribbons.setCamera(this._camObj);
    this._ribbons.update(frameDt, nz2, this._ribbonShape);

    // Leftover thruster light, one ghost per live bell, on the flown line only. Never advects along
    // the exhaust, so it cannot put a vertex anywhere that bell has not been.
    const nTrail = list ? Math.min(list.length, this._trails.length) : 1;
    let trailLive = 0;
    for (let ti = 0; ti < this._trails.length; ti++) {
      const trail = this._trails[ti];
      const forge = this._forges[ti];
      if (ti >= nTrail) {
        trail.update(frameDt, null, this._ribbonShape);
        forge.update(null, null, this._ribbonShape, 1);
        continue;
      }
      const sock = list ? list[ti] : this._fallbackNozzle;
      let sx = Number.isFinite(sock.ax) ? sock.ax : 1;
      let sz = Number.isFinite(sock.az) ? sock.az : 0;
      const sl = Math.hypot(sx, sz) || 1;
      const nz = this._trailNozzles[ti];
      nz.x = sock.x || 0;
      nz.y = sock.y || 0;
      nz.z = sock.z || 0;
      nz.aftX = -sx / sl;
      nz.aftZ = -sz / sl;
      trail.setCamera(this._camObj);
      trail.update(frameDt, nz, this._ribbonShape);
      const live = trail.liveSampleCount();
      if (live > trailLive) trailLive = live;

      // The mouth rides the line's own heading and fires on the line's own pulse, so the flash at
      // the bell and the band leaving it are one event rather than two effects near each other.
      forge.setCamera(this._camObj);
      if (trail.headAftDirection(this._forgeAim)) {
        forge.update(nz, this._forgeAim, this._ribbonShape, trail.bandFlash(this._ribbonShape.drive));
      } else {
        // No line yet — aim the mouth down the bell so a standing start still lights it.
        this._forgeAim.x = nz.aftX; this._forgeAim.y = 0; this._forgeAim.z = nz.aftZ;
        forge.update(nz, this._forgeAim, this._ribbonShape, trail.bandFlash(this._ribbonShape.drive));
      }
    }
    this._snakeCount = 0;
    this._hideElement('snake');

    this._active = emitting || trailLive >= 2;

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

    const ribbonInfo = this._ribbons.inspect();
    this._pointCount = trailLive;
    return {
      live: this._pointCount,
      pathPoints: pathN,
      continuous: true,
      medium: 'ribbon-sheets',
      pointCount: this._pointCount,
      construction: 'swept-ribbon-sheets',
      jetLengthWU: jetLen,
      ribbons: ribbonInfo.ribbons,
      ribbonStations: ribbonInfo.stations,
      plumeSeconds: ribbonInfo.plumeSeconds,
      spool: this._env.spool,
      dash: this._env.dash,
      ignition,
    };
  }

  inspect() {
    return {
      live: this._active ? this._pointCount : 0,
      continuous: true,
      medium: 'ribbon-sheets',
      capacity: this.nSeg,
      active: this._active,
      path: this.sampler.inspect(),
      recipeId: this.recipe && this.recipe.id,
      layers: this._layers.map((L) => `${L.element}:${L.role}:${L.plane}`),
      drive: this._lastDrive,
      boost: this._lastBoost,
      ignition: this._ignition,
      pointCount: this._pointCount,
      snakePoints: this._snakeCount,
      ribbon: this._ribbons ? this._ribbons.inspect() : null,
      contrail: this._contrail ? this._contrail.inspect() : null,
      forge: this._forge ? this._forge.inspect() : null,
      envelope: { spool: this._env.spool, boost: this._env.boost, dash: this._env.dash },
      construction: 'swept-ribbon-sheets',
    };
  }
}

export default PlasmaStreamSystem;
