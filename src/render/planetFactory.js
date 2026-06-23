import * as THREE from 'three';

// Seeded RNG + hash — same pattern as canvasTextures / world.js
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

// ---- planet type palette per sector tier --------------------------------------------------------
const PLANET_TYPES_BY_TIER = {
  0: ['terran', 'oceanic', 'gas_giant'],
  1: ['terran', 'arid', 'gas_giant', 'ice'],
  2: ['rocky', 'arid', 'ice', 'gas_giant'],
  3: ['rocky', 'lava', 'dead', 'ice'],
  4: ['lava', 'dead', 'scorched', 'rocky'],
  5: ['lava', 'scorched', 'dead'],
};

const PLANET_COLORS = {
  // Cyberpunk-noir retuned palettes. Habitable worlds lean slightly desaturated + keep neon city
  // lights (uCity) on their night side so they read as populated, contested worlds. Hostile worlds
  // (dead/scorched) push toward sickly, noir desaturation. Atmosphere rims shifted toward neon
  // cyan/magenta so every planet catches the moody backdrop lighting.
  terran:    { c1: [0.13, 0.46, 0.20], c2: [0.10, 0.22, 0.62], cloud: [0.90, 0.93, 0.98], atm: [0.30, 0.70, 1.00], city: [1.00, 0.75, 0.35] },
  oceanic:   { c1: [0.06, 0.26, 0.70], c2: [0.04, 0.13, 0.50], cloud: [0.93, 0.95, 1.00], atm: [0.20, 0.60, 1.00], city: [0.40, 0.95, 1.00] },
  gas_giant: { c1: [0.78, 0.55, 0.30], c2: [0.62, 0.38, 0.18], cloud: [0.88, 0.70, 0.45], atm: [1.00, 0.55, 0.20], city: [0.0, 0.0, 0.0] },
  arid:      { c1: [0.72, 0.55, 0.30], c2: [0.52, 0.36, 0.16], cloud: [0.82, 0.78, 0.72], atm: [1.00, 0.55, 0.25], city: [0.0, 0.0, 0.0] },
  rocky:     { c1: [0.42, 0.38, 0.35], c2: [0.26, 0.24, 0.22], cloud: [0.68, 0.65, 0.62], atm: [0.50, 0.55, 0.60], city: [0.0, 0.0, 0.0] },
  ice:       { c1: [0.85, 0.91, 0.98], c2: [0.60, 0.72, 0.88], cloud: [0.97, 0.97, 1.00], atm: [0.55, 0.85, 1.00], city: [0.0, 0.0, 0.0] },
  lava:      { c1: [0.90, 0.18, 0.04], c2: [0.16, 0.05, 0.03], cloud: [0.45, 0.22, 0.10], atm: [1.00, 0.25, 0.05], city: [0.0, 0.0, 0.0] },
  dead:      { c1: [0.34, 0.36, 0.40], c2: [0.18, 0.20, 0.24], cloud: [0.32, 0.34, 0.38], atm: [0.30, 0.40, 0.55], city: [0.0, 0.0, 0.0] },  // noir desaturated grey-blue
  scorched:  { c1: [0.55, 0.22, 0.06], c2: [0.28, 0.10, 0.03], cloud: [0.40, 0.18, 0.08], atm: [0.90, 0.25, 0.08], city: [0.0, 0.0, 0.0] },  // scorched rust
};

const SUN_PALETTE = [
  { sun: [1.00, 0.95, 0.75], corona: [1.00, 0.75, 0.35] },
  { sun: [1.00, 0.82, 0.62], corona: [1.00, 0.60, 0.25] },
  { sun: [0.95, 1.00, 1.00], corona: [0.70, 0.85, 1.00] },
  { sun: [1.00, 0.65, 0.45], corona: [1.00, 0.40, 0.20] },
];

// ---- shared geometry (created once, reused) -----------------------------------------------------
let _geoDetail4 = null;
let _geoDetail3 = null;
function getPlanetGeo() { return _geoDetail4 || (_geoDetail4 = new THREE.IcosahedronGeometry(1, 4)); }
function getSunGeo()    { return _geoDetail3 || (_geoDetail3 = new THREE.IcosahedronGeometry(1, 3)); }

// ---- planet shader ------------------------------------------------------------------------------
const PLANET_VERT = /* glsl */`
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal   = normalize(mat3(modelMatrix) * normal);
  vObjPos   = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANET_FRAG = /* glsl */`
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uCloudColor;
uniform vec3  uAtmColor;
uniform vec3  uCity;      // night-side city-light color (0 if the world is uninhabited)
uniform vec3  uSunDir;
uniform float uCloudAmt;
uniform float uSeed;
uniform float uTime;      // GR-4: drives slow cloud-band drift (weather motion)

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;

// ---- value noise ----------------------------------------------------------------
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.31);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i + vec2(0,0));
  float b = hash(i + vec2(1,0));
  float c = hash(i + vec2(0,1));
  float d = hash(i + vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p  = p * 2.03 + vec2(1.7, 3.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 n = normalize(vObjPos);

  // spherical UV from object-space normal
  vec2 uv = vec2(
    atan(n.z, n.x) / 6.28318 + 0.5,
    acos(clamp(n.y, -1.0, 1.0)) / 3.14159
  );

  // domain-warped fbm for continent shapes
  vec2 seed2 = vec2(uSeed * 0.0001, uSeed * 0.00013);
  vec2 warp  = vec2(fbm(uv * 3.0 + seed2), fbm(uv * 3.0 + seed2 + vec2(5.2, 1.3)));
  float land = fbm(uv * 4.0 + warp * 0.8 + seed2 * 0.5);
  vec3 surface = mix(uColor2, uColor1, smoothstep(0.38, 0.62, land));

  // cloud octave — GR-4: drift the cloud longitude slowly with uTime so weather bands slide across
  // the disk (planetary rotation read). Speed is a fraction of a full longitude wrap per second; the
  // small amplitude keeps it subliminal unless you watch for a few seconds.
  float cloudDrift = uTime * 0.008;
  float cloud = fbm(uv * 5.5 + seed2 + vec2(2.1 + cloudDrift, 4.7));
  cloud = smoothstep(0.52, 0.70, cloud) * uCloudAmt;
  surface = mix(surface, uCloudColor, cloud);

  // day/night terminator
  float daylight = dot(N, normalize(uSunDir));
  float lit = smoothstep(-0.12, 0.18, daylight);
  surface *= (0.12 + 0.88 * lit);

  // NEON CITY-LIGHTS on the night side of inhabited worlds. A second high-frequency fbm clusters
  // city glows along coastlines (the land/water threshold) so civilization reads where it'd really
  // be — then masks them to the dark side. uCity=0 for barren worlds skips this entirely.
  if (dot(uCity, uCity) > 0.001) {
    float night = 1.0 - lit;                                   // strong on the dark side
    // coastline mask: brightest where land meets water (cities cluster on coasts)
    float coast = 1.0 - abs(land - 0.5) * 2.0;
    coast = smoothstep(0.2, 0.8, coast);
    float cities = fbm(uv * 18.0 + seed2 * 7.0 + vec2(9.1, 2.3));
    cities = smoothstep(0.55, 0.72, cities) * coast;
    surface += uCity * cities * night * 1.4;
  }

  // fresnel atmosphere rim — pushed slightly hotter for a neon read against the moody backdrop
  float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.5);
  float rimLit  = smoothstep(-0.3, 0.6, daylight) * 0.7 + 0.3;
  vec3  atm     = uAtmColor * fresnel * 0.9 * rimLit;

  gl_FragColor = vec4(surface + atm, 1.0);
}
`;

// ---- atmosphere shell shader (GR-4) -------------------------------------------------------------
// A transparent, slightly-larger sphere rendered additively OUTSIDE the planet disk. Unlike the
// in-shader fresnel rim (which only brightens the limb), this shell extends beyond the silhouette —
// so a planet against the black of space gets a real glowing halo, and the limb reads as a real
// atmosphere seen edge-on. Backface-only rendering (FrontSide cull) keeps the far hemisphere visible
// as a ring around the disk while the near hemisphere is skipped (it would just tint the surface).
const ATMSHELL_FRAG = /* glsl */`
precision highp float;
varying vec3 vNormal;
varying vec3 vWorldPos;
uniform vec3  uAtmColor;
uniform vec3  uSunDir;
uniform float uIntensity;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  // Limb glow: strongest where the surface grazes the view (fresnel), falling to nothing face-on.
  float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
  // Day/night modulation: the atmosphere only glows on the sunlit side, so the shell respects the
  // same terminator as the surface (no glow on the night limb).
  float daylight = dot(N, normalize(uSunDir));
  float lit = smoothstep(-0.15, 0.35, daylight);
  vec3 col = uAtmColor * fresnel * lit * uIntensity;
  gl_FragColor = vec4(col, fresnel * lit * uIntensity);
}
`;

// ---- sun shader ---------------------------------------------------------------------------------
const SUN_VERT = /* glsl */`
varying vec3 vObjPos;
void main() {
  vObjPos = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SUN_FRAG = /* glsl */`
uniform vec3  uSunColor;
uniform vec3  uCoronaColor;
uniform float uSeed;

varying vec3 vObjPos;

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.31);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.1 + vec2(1.3, 2.7); a *= 0.5; }
  return v;
}

void main() {
  vec3 n = normalize(vObjPos);
  vec2 uv = vec2(atan(n.z, n.x) / 6.28318 + 0.5, acos(clamp(n.y, -1.0, 1.0)) / 3.14159);
  vec2 seed2 = vec2(uSeed * 0.0001, uSeed * 0.00013);

  float corona = fbm(uv * 3.0 + seed2);
  corona = 0.75 + 0.25 * corona;

  vec3 col = mix(uSunColor, uCoronaColor, smoothstep(0.5, 0.9, corona));
  col *= (1.0 + 0.3 * fbm(uv * 7.0 + seed2 + vec2(3.1, 1.7)));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---- factory ------------------------------------------------------------------------------------
export function createPlanetFactory() {
  // SunDir used in planet shaders — key light direction kept in sync with renderer.js lights.
  // The key DirectionalLight is at (60, 140, 40); normalize gives approximately this vector.
  const SUN_DIR = new THREE.Vector3(60, 140, 40).normalize();

  function buildPlanetMesh(type, radius, seed) {
    const pal = PLANET_COLORS[type] || PLANET_COLORS.rocky;
    const cloudAmt = (type === 'dead' || type === 'scorched') ? 0.05 : (type === 'lava' ? 0.10 : 0.45);
    const mat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: {
        uColor1:     { value: new THREE.Vector3(...pal.c1) },
        uColor2:     { value: new THREE.Vector3(...pal.c2) },
        uCloudColor: { value: new THREE.Vector3(...pal.cloud) },
        uAtmColor:   { value: new THREE.Vector3(...pal.atm) },
        uCity:       { value: new THREE.Vector3(...(pal.city || [0, 0, 0])) },
        uSunDir:     { value: SUN_DIR },
        uCloudAmt:   { value: cloudAmt },
        uSeed:       { value: seed % 99999 },
        uTime:       { value: 0 },   // GR-4: cloud drift; advanced by the renderer each frame
      },
      fog: false,
    });
    const mesh = new THREE.Mesh(getPlanetGeo(), mat);
    mesh.scale.setScalar(radius);
    mesh.frustumCulled = false;

    // GR-4: atmosphere shell — a transparent additive sphere ~6% larger than the disk, rendered
    // backface-only so it forms a glowing ring around the planet rather than tinting its surface.
    // Dead/scorched worlds (thin/no atmosphere) get a near-invisible shell; the rest get a vivid halo.
    const atmIntensity = (type === 'dead' || type === 'scorched') ? 0.25 : 1.0;
    const atmMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: ATMSHELL_FRAG,
      uniforms: {
        uAtmColor:  { value: new THREE.Vector3(...pal.atm) },
        uSunDir:    { value: SUN_DIR },
        uIntensity: { value: atmIntensity },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,   // render the far hemisphere so the ring extends past the silhouette
      fog: false,
    });
    const shell = new THREE.Mesh(getPlanetGeo(), atmMat);
    shell.scale.setScalar(radius * 1.06);
    shell.frustumCulled = false;
    mesh.add(shell);
    mesh.userData.atmShellMat = atmMat;
    return mesh;
  }

  function buildSunMesh(radius, seed, palIdx) {
    const pal = SUN_PALETTE[palIdx % SUN_PALETTE.length];
    const mat = new THREE.ShaderMaterial({
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      uniforms: {
        uSunColor:    { value: new THREE.Vector3(...pal.sun) },
        uCoronaColor: { value: new THREE.Vector3(...pal.corona) },
        uSeed:        { value: seed % 99999 },
      },
      fog: false,
    });
    const mesh = new THREE.Mesh(getSunGeo(), mat);
    mesh.scale.setScalar(radius);
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Build all planet/sun meshes for a sector. Returns an array of
   * { mesh, basePos: THREE.Vector3, parallax: number, isSun: boolean }
   */
  function buildSectorBodies(sector) {
    if (!sector) return [];

    const seed = hash32((sector.id || 'default') + '_v1');
    const rng  = mulberry32(seed);

    const tier = typeof sector.tier === 'number' ? sector.tier : 0;
    const bodies = [];

    // Sun — always present, always in the forward visible arc (positive Z)
    const sunSeed   = hash32((sector.id || 'default') + '_sun');
    const sunPalIdx = sunSeed % SUN_PALETTE.length;
    const sunRadius = 280 + rng() * 180;            // 280–460
    const sunAngle  = (rng() - 0.5) * Math.PI * 0.9; // ±81° around forward axis
    const sunDist   = 4000 + rng() * 2000;           // 4000–6000 from origin
    const sunX = Math.sin(sunAngle) * sunDist;
    const sunY = -(1500 + rng() * 1000);             // push below horizon
    const sunZ = Math.cos(sunAngle) * sunDist;
    const sunMesh = buildSunMesh(sunRadius, sunSeed, sunPalIdx);
    bodies.push({
      mesh: sunMesh,
      basePos: new THREE.Vector3(sunX, sunY, sunZ),
      parallax: 0.10,
      isSun: true,
    });

    // Planets — 1-3 based on tier
    const planetTypes = PLANET_TYPES_BY_TIER[Math.min(tier, 5)] || PLANET_TYPES_BY_TIER[0];
    const count = 1 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const typeIdx = Math.floor(rng() * planetTypes.length);
      const type = planetTypes[typeIdx];
      const pSeed = hash32((sector.id || 'default') + '_p' + i);
      const radius = 200 + rng() * 450;              // 200–650

      // place at large +Z (horizon) and varying X, pushed down in Y
      const angle = (rng() - 0.5) * Math.PI * 0.8;  // ±72° in XZ
      const dist  = 2800 + rng() * 2200;             // 2800–5000
      const px = Math.sin(angle) * dist;
      const py = -(1200 + rng() * 1600);             // -1200 to -2800
      const pz = Math.cos(angle) * dist;

      const par = 0.12 + rng() * 0.08;               // 0.12–0.20
      const mesh = buildPlanetMesh(type, radius, pSeed);
      bodies.push({ mesh, basePos: new THREE.Vector3(px, py, pz), parallax: par, isSun: false });
    }

    return bodies;
  }

  function disposeBodies(bodies) {
    for (const b of bodies) {
      if (b.mesh.material) b.mesh.material.dispose();
      // GR-4: dispose the atmosphere shell material (a child of the planet mesh) so sector changes
      // don't leak the shell ShaderMaterial.
      if (b.mesh.userData && b.mesh.userData.atmShellMat) b.mesh.userData.atmShellMat.dispose();
    }
  }

  return { buildSectorBodies, disposeBodies, buildPlanetMesh, buildSunMesh };
}
