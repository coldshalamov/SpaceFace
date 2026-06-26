// Shared construction kit for bespoke ship builders (the gold standard set by kestrelHero.js).
//
// Before this module, every bespoke faction ship (concordPatrol, reaverPirate, meridianTrader,
// driftBarge, quietRaider, vaelSniper) redefined its own inline stdMat/addBox/addCylX closures and
// built flat colored boxes with bare MeshStandardMaterial — no normal maps, no bevels, no greeble,
// no drive motion, no LOD, no damage. The Kestrel hero had a real procedural toolkit
// (loftXGeometry, extrudeXZGeometry, mergeStaticByMaterial, ...) but it was module-private. This
// module lifts that toolkit into a shared sibling so the faction ships can compose at the same
// craft level instead of duplicating primitives 6×.
//
// Contract honored by every helper: +X forward, +Y up, +Z starboard, metres (matches the renderer,
// which sets mesh.rotation.y = -entity.rot so +X points forward). Build never throws from geometry.
// Materials from pbrHullMaterial() use the already-shared canvasTextures.js generators (so texture
// caching is global and deterministic per seed) and are noDispose()'d so the renderer's per-entity
// disposer can't free buffers still referenced by other live ships.
import * as THREE from 'three';
import { attachLodState } from '../lod.js';
import {
  makeHullPanelTexture, makeHullNormalMap, makeNoiseTexture,
  makeGreebleDetailTexture, makeGrimeTexture, makeDecalSheet, makeNoseArtTexture,
} from '../canvasTextures.js';
import { attachDamageStateDriver } from './shipDamage.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Stable hash → small int, for deterministic per-ship texture seeds (so the same hull color always
// bakes the same panel layout). Mirrors visualFactory.hashId.
// ---------------------------------------------------------------------------------------------
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

// ---------------------------------------------------------------------------------------------
// GEOMETRY — the hull loft + profile extrude (lifted verbatim from kestrelHero.js where they were
// module-private). These are the single biggest craft levers: a lofted hull reads as a real
// pressure shell with curvature, not a crate.
// ---------------------------------------------------------------------------------------------

// Loft a tube along +X from a series of elliptical cross-sections. sections = [{x, halfY, halfZ, y?}]
// where x is the station along the hull axis, halfY/halfZ are the half-extents of the ellipse at
// that station, and optional y offsets the centerline (for a dorsal hump or ventral keel). The belly
// is flattened slightly (sy < -0.25) so it reads as a working hull, not a perfect aircraft ellipse.
// Both ends are capped. radialSegments controls tube smoothness (6 = faceted/crystalline, 12 = smooth).
export function loftXGeometry(sections, radialSegments = 12) {
  const positions = [];
  const indices = [];
  for (const section of sections) {
    const { x, halfY, halfZ, y = 0 } = section;
    for (let i = 0; i < radialSegments; i++) {
      const a = TAU * i / radialSegments;
      const sy = Math.sin(a);
      const belly = sy < -0.25 ? (Math.abs(sy) - 0.25) * halfY * 0.12 : 0;
      positions.push(x, y + sy * halfY + belly, Math.cos(a) * halfZ);
    }
  }
  for (let s = 0; s < sections.length - 1; s++) {
    const a = s * radialSegments;
    const b = (s + 1) * radialSegments;
    for (let i = 0; i < radialSegments; i++) {
      const j = (i + 1) % radialSegments;
      indices.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
  }
  const aftCenter = positions.length / 3;
  positions.push(sections[0].x, sections[0].y || 0, 0);
  const foreCenter = positions.length / 3;
  const last = sections[sections.length - 1];
  positions.push(last.x, last.y || 0, 0);
  for (let i = 0; i < radialSegments; i++) {
    const j = (i + 1) % radialSegments;
    indices.push(aftCenter, j, i);
    const off = (sections.length - 1) * radialSegments;
    indices.push(foreCenter, off + i, off + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Extrude an XZ outline (array of [x,z] points) along Y by `thickness`, centered at yCenter. Used
// for shoulder pods, radiator fins, wing planforms — any flat-ish extruded profile. Caps both faces.
export function extrudeXZGeometry(points, thickness = 0.3, yCenter = 0) {
  const positions = [];
  const indices = [];
  const n = points.length;
  const y0 = yCenter - thickness * 0.5;
  const y1 = yCenter + thickness * 0.5;
  for (const [x, z] of points) positions.push(x, y0, z);
  for (const [x, z] of points) positions.push(x, y1, z);
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j, i, n + j, n + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Mirror an XZ outline across the centerline (Z→-Z), reversing winding so the result is a valid
// closed outline when concatenated. Pairs with extrudeXZGeometry for symmetric pods/fins.
export function mirroredXZ(points) {
  return points.map(([x, z]) => [x, -z]).reverse();
}

// ---------------------------------------------------------------------------------------------
// MATERIALS — Kestrel-grade PBR. standardMaterial/emissiveMaterial/glowMaterial match the Kestrel's
// signatures exactly; pbrHullMaterial composes the shared canvas-texture generators so faction
// hulls get real beveled-panel normal maps + albedo variation (the thing they were entirely missing).
// ---------------------------------------------------------------------------------------------
export function standardMaterial(color, roughness = 0.55, metalness = 0.45, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
}

export function emissiveMaterial(color, intensity = 1.5, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.22,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

export function glowMaterial(color, opacity = 0.55) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Dark dielectric "machinery" material for internal/exposed structure (gun breeches, drive housings,
// keel beams). Reads as bare metal against the painted hull, carrying the material hierarchy.
export function machineryMaterial(color = '#10161b', roughness = 0.42, metalness = 0.78) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// Module-level texture cache shared across ALL ships (canvas generation is the costly part; textures
// are pure given a seed so caching is safe). Keyed by the full arg signature. noDispose stops the
// renderer's per-entity disposer from freeing buffers still used by other live ships.
const _shipTextures = new Map();
function noDispose(obj) { obj.dispose = () => {}; return obj; }
function shipTexture(key, build) {
  let t = _shipTextures.get(key);
  if (!t) { t = build(); _shipTextures.set(key, t); }
  return t;
}

// The headline material upgrade: a painted pressure-shell PBR material with a paneled albedo, a
// tangent-space normal map of beveled panel seams, and a value-noise roughness map. This is what
// makes a hull surface catch the key/rim/fill lights instead of reading as a flat colored box.
// Per the graphics spec (§4.5/§11.1) the hull is primarily dielectric (low metalness) so it reads
// as paint, not bare metal — the contrast with exposed hardware (high metalness) carries hierarchy.
export function pbrHullMaterial({ hull, accent, seed, panelCount = 12, metalness = 0.16, roughness = 0.62, emissive }) {
  const key = `shipKitHull:${hull}:${accent}:${panelCount}:${seed}`;
  return shipTexture(key, () => {
    // GR-3: hull-defining textures at 1024² so procedural ships match the authored GLB resolution.
    // Panel seams, bevels and the roughness variation all read sharply under the key/rim/fill lights.
    const albedo = makeHullPanelTexture({ size: 1024, seed, hull, accent, panelCount, wear: 0.5 });
    const normal = makeHullNormalMap({ size: 1024, seed: seed + 1, panelCount, bevel: 0.55 });
    const rough = makeNoiseTexture({ size: 1024, seed: 99, octaves: 4, baseCells: 5, contrast: 1.1, brightness: 0.1 });
    // aoMap is intentionally omitted: procedural geometries have only uv0, so AO would be silently ignored.
    const mat = new THREE.MeshStandardMaterial({
      map: albedo,
      roughnessMap: rough,
      normalMap: normal,
      color: 0xffffff,
      roughness,
      metalness,
      normalScale: new THREE.Vector2(0.7, 0.7),
      emissive: new THREE.Color(emissive || accent),
      emissiveIntensity: 0.04,
    });
    return noDispose(mat);
  });
}

// Transparent overlay material for greeble-detail / livery decal sheets (faction stripes, warning
// chevrons, vent micro-detail). Used on a slightly-larger shell mesh floating above the hull.
export function decalMaterial({ hull, accent, seed, kind = 'greeble' }) {
  const key = `shipKitDecal:${hull}:${accent}:${kind}:${seed}`;
  return shipTexture(key, () => {
    const tex = kind === 'greeble'
      ? makeGreebleDetailTexture({ size: 256, seed, density: 1.0, accent })
      : makeDecalSheet({ size: 256, seed: seed + 3, accent, stripe: true, chevron: true, warning: true });
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false,
      color: 0xffffff, roughness: 0.7, metalness: 0.2,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.04,
    });
    return noDispose(mat);
  });
}

// Transparent grime overlay (oil/rust/soot/dust). intensity 0..1 = how filthy. The core of the
// dirty-outlaw vs clean-authority contrast per the faction paint profiles.
export function grimeMaterial({ hull, seed, intensity = 0.5 }) {
  const key = `shipKitGrime:${hull}:${Math.round(intensity * 20)}:${seed}`;
  return shipTexture(key, () => {
    const tex = makeGrimeTexture({ size: 256, seed, intensity });
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false,
      color: 0xffffff, roughness: 0.9, metalness: 0.0,
    });
    return noDispose(mat);
  });
}

// Build a faction nose-art / crest decal texture (bomber shark-mouth, punk spray tag, or crisp
// insignia crest) and return a transparent material for a flank decal plane.
export function noseArtMaterial({ style, accent, seed, motto, mascot, tally }) {
  const key = `shipKitNose:${style}:${accent}:${seed}:${motto || ''}`;
  return shipTexture(key, () => {
    const tex = makeNoseArtTexture({ size: 256, seed, style, accent, motto, mascot, tally });
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false,
      color: 0xffffff, roughness: 0.6, metalness: 0.1,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.05,
      side: THREE.DoubleSide,
    });
    return noDispose(mat);
  });
}

// Chrome foil shell for authority/corporate hulls that should mirror the nebula. envMap injected by
// the renderer (setEnvMapForShips); if null it falls back to a shiny-matte read, still clean.
export function chromeFoilMaterial(envMap, intensity = 0.7) {
  const key = `shipKitChrome:${Math.round(intensity * 20)}:${envMap ? 'env' : 'noenv'}`;
  return shipTexture(key, () => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 1.0, roughness: 0.12 - intensity * 0.06,
      envMap, envMapIntensity: intensity,
      transparent: true, opacity: 0.45 + intensity * 0.35, depthWrite: false,
    });
    return noDispose(mat);
  });
}

// ---------------------------------------------------------------------------------------------
// PLACEMENT HELPERS — add a named, positioned mesh to a parent. Match the Kestrel's addBox/
// addCylinderX/addTorusX signatures so builders read identically across files.
// ---------------------------------------------------------------------------------------------
export function addMesh(parent, geometry, material, name, position = null, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(mesh);
  return mesh;
}

export function addBox(parent, material, name, size, position, rotation = null) {
  return addMesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material, name, position, rotation);
}

export function addCylinderX(parent, material, name, radius, length, position, segments = 12) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  geometry.rotateZ(Math.PI / 2);
  return addMesh(parent, geometry, material, name, position);
}

export function addTorusX(parent, material, name, major, tube, position, radial = 6, tubular = 18) {
  const geometry = new THREE.TorusGeometry(major, tube, radial, tubular);
  geometry.rotateY(Math.PI / 2);
  return addMesh(parent, geometry, material, name, position);
}

// A weapon/engine/cargo/sensor hardpoint marker the VFX + combat systems look up by name.
export function addSocket(parent, name, position, role, forward = [1, 0, 0]) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.set(position[0], position[1], position[2]);
  socket.userData = { spacefaceSocket: true, role, forward };
  parent.add(socket);
  return socket;
}

// GR-5: persistent 3D shield bubble. Shared geometry + per-instance shader material so each ship
// carries its own fresnel flash state. The renderer toggles visibility from e.shield and punches
// uFlash on combat:damage.
const SHIELD_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHIELD_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform vec3  uColor;
  uniform float uFlash;
  uniform float uBase;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    float alpha = clamp(uBase * fres + uFlash, 0.0, 1.0);
    vec3 col = mix(uColor, vec3(1.0), uFlash * 0.7);
    gl_FragColor = vec4(col, alpha * (0.45 + 0.55 * fres));
  }
`;
let _shieldGeo = null;
export function shieldBubbleGeometry() {
  if (!_shieldGeo) _shieldGeo = noDispose(new THREE.IcosahedronGeometry(1, 2));
  return _shieldGeo;
}
export function createShieldBubble(color = '#5fd0ff', radius = 12) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SHIELD_VERT,
    fragmentShader: SHIELD_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uFlash: { value: 0 },
      uBase:  { value: 0.22 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
  });
  const bubble = new THREE.Mesh(shieldBubbleGeometry(), mat);
  bubble.name = 'Ship_Shield_Bubble';
  bubble.scale.setScalar(radius * 1.5);
  bubble.frustumCulled = false;
  bubble.visible = false;
  bubble.renderOrder = 2;
  bubble.userData.sharedShieldGeo = true;
  bubble.userData.spacefaceTags = { vfxRole: 'shieldBubble' };
  return bubble;
}

// A canvas decal plane on a hull face. Returns the mesh (kept out of static batching so the LOD
// reaction can hide it at distance, matching the Kestrel's decal handling).
export function addDecal(parent, material, name, size, position, rotation) {
  const decal = addMesh(parent, new THREE.PlaneGeometry(size[0], size[1]), material, name, position, rotation);
  decal.userData.keepSeparate = true;
  decal.renderOrder = 3;
  return decal;
}

// ---------------------------------------------------------------------------------------------
// GREEBLE SCATTER — distilled from visualFactory's private surfaceDetail(). Scatters vents,
// access hatches, frame ribs, pipe runs and RCS thruster quads across a hull deck on a jittered
// grid, plus optional coolant fins and armored scallop plates. Density 0..1 controls sparseness.
// materials = { primary, dark, glow } — the builder passes its own material set so greeble tints
// match the hull faction palette. Reads as real machinery surface, not decorative noise.
// ---------------------------------------------------------------------------------------------
export function scatterGreeble(parent, opts) {
  const {
    R, length, halfWidth, height, density = 0.5, seed = 1, armored = false,
    materials, xMin = -0.40, xMax = 0.30,
  } = opts;
  if (!materials) return;
  const L = length, W = halfWidth, H = height;
  const rnd = mulberryLite(seed ^ 0x9e37);
  const span = xMax - xMin;
  const cellsX = Math.max(3, Math.round(span * 6));
  const cellsZ = Math.max(2, Math.round(W * 2 * 6));
  const deckY = H * 0.5 * R;

  const ventGeo = smallGeo('skg:vent', () => new THREE.BoxGeometry(0.12, 0.03, 0.06));
  const hatchGeo = smallGeo('skg:hatch', () => new THREE.BoxGeometry(0.1, 0.025, 0.1));
  const ribGeo = smallGeo('skg:rib', () => new THREE.BoxGeometry(0.05, 0.05, 0.32));
  const pipeGeo = smallGeo('skg:pipe', () => new THREE.CylinderGeometry(0.018, 0.018, 0.4, 5).rotateZ(Math.PI / 2));
  const rcsGeo = smallGeo('skg:rcs', () => new THREE.CylinderGeometry(0.035, 0.05, 0.06, 6));
  const finGeo = smallGeo('skg:fin', () => new THREE.BoxGeometry(0.04, 0.12, 0.08));

  for (let ix = 0; ix < cellsX; ix++) {
    for (let iz = 0; iz < cellsZ; iz++) {
      if (rnd() > density * 0.55) continue;
      const fx = xMin + (ix + 0.5) / cellsX * span;
      const fz = (iz + 0.5) / cellsZ - 0.5;
      const z = fz * 2 * W;
      const edgeFade = 1 - Math.min(1, Math.abs(fz) * 1.4);
      if (rnd() > edgeFade + 0.15) continue;
      const px = fx * R, py = deckY, pz = z * R;
      const roll = rnd();
      if (roll < 0.34) {
        const v = new THREE.Mesh(ventGeo, materials.dark); v.position.set(px, py, pz); v.scale.setScalar(R); parent.add(v);
        const v2 = v.clone(); v2.position.z = pz + 0.08 * R; parent.add(v2);
      } else if (roll < 0.55) {
        const h = new THREE.Mesh(hatchGeo, materials.primary); h.position.set(px, py, pz); h.scale.setScalar(R); parent.add(h);
      } else if (roll < 0.72) {
        const r = new THREE.Mesh(ribGeo, materials.primary); r.position.set(px, py, pz); r.scale.setScalar(R); parent.add(r);
      } else if (roll < 0.85) {
        const p = new THREE.Mesh(pipeGeo, materials.dark); p.position.set(px, py, pz); p.scale.setScalar(R); parent.add(p);
      } else {
        const t = new THREE.Mesh(rcsGeo, materials.glow); t.position.set(px, py, pz); t.scale.setScalar(R); parent.add(t);
      }
    }
  }
  if (density > 0.55) {
    const finCount = Math.round(density * 5);
    for (let i = 0; i < finCount; i++) {
      for (const sgn of [1, -1]) {
        const f = new THREE.Mesh(finGeo, materials.primary);
        f.position.set((xMin + 0.1 + i * 0.12) * R, H * 0.35 * R, sgn * W * 0.95 * R);
        f.rotation.y = sgn * 0.3; f.scale.setScalar(R); parent.add(f);
      }
    }
  }
  if (armored) {
    const plateGeo = smallGeo('skg:plate', () => new THREE.BoxGeometry(0.16, 0.04, 0.5));
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(plateGeo, materials.primary);
      p.position.set((xMin + 0.15 + i * 0.14) * R, H * 0.52 * R, 0);
      p.scale.setScalar(R); parent.add(p);
    }
  }
}

// tiny seeded RNG (mulberry32) — local copy so scatterGreeble is self-contained
function mulberryLite(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// cached small greeble geometry (bounded set of keys; noDispose so the per-entity disposer is safe)
const _smallGeo = new Map();
function smallGeo(key, build) {
  let g = _smallGeo.get(key);
  if (!g) { g = noDispose(build()); _smallGeo.set(key, g); }
  return g;
}

// ---------------------------------------------------------------------------------------------
// STATIC BATCH MERGE — lifted from kestrelHero.js. Groups a parent's opaque child meshes by
// material and merges each group into one draw call (cloning + transforming + concatenating
// positions/normals). Meshes in `keepSeparate` or with userData.keepSeparate survive the merge
// (animated drive parts, alpha-tested decals, damage-modulated parts).
// ---------------------------------------------------------------------------------------------
export function mergeStaticByMaterial(parent, keepSeparate) {
  const keep = keepSeparate instanceof Set ? keepSeparate : new Set(keepSeparate || []);
  const groups = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || keep.has(child) || child.userData.keepSeparate) continue;
    const key = child.material && child.material.uuid;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(child);
  }
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const positions = [];
    const normals = [];
    for (const mesh of meshes) {
      mesh.updateMatrix();
      let geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);
      if (geometry.index) geometry = geometry.toNonIndexed();
      const p = geometry.getAttribute('position');
      const n = geometry.getAttribute('normal');
      for (let i = 0; i < p.array.length; i++) positions.push(p.array[i]);
      if (n) for (let i = 0; i < n.array.length; i++) normals.push(n.array[i]);
      geometry.dispose();
    }
    const mergedGeometry = new THREE.BufferGeometry();
    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length === positions.length) mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    else mergedGeometry.computeVertexNormals();
    mergedGeometry.computeBoundingSphere();
    const merged = new THREE.Mesh(mergedGeometry, meshes[0].material);
    merged.name = `${parent.name || 'Ship'}_Static_${(meshes[0].material.name || meshes[0].material.uuid.slice(0, 8))}`;
    for (const mesh of meshes) {
      parent.remove(mesh);
      mesh.geometry.dispose();
    }
    parent.add(merged);
  }
}

// ---------------------------------------------------------------------------------------------
// DRIVE — a reusable engine assembly: housing + bright nozzle ring + spinning turbine fan +
// hot core + additive plume + soft halo. The fan/core/plume get an onBeforeRender micro-motion
// driver (speed-reactive) wired by finalizeShip. driveColor drives nozzle+plume tint.
// ---------------------------------------------------------------------------------------------
export function buildDrive(parent, opts) {
  const {
    name = 'Drive', position, radius, length, materials,
    driveColor, coreColor, driveGlowOpacity = 0.55, flicker = false,
  } = opts;
  const driveMat = emissiveMaterial(driveColor, 3.2);
  const coreMat = emissiveMaterial(coreColor, 5.0);
  const plumeMat = glowMaterial(driveColor, driveGlowOpacity);
  driveMat.name = `${name}_Drive`; coreMat.name = `${name}_Core`; plumeMat.name = `${name}_Plume`;

  addCylinderX(parent, materials.dark, `${name}_Housing`, radius * 1.0, length, [position[0] + length * 0.5, position[1], position[2]], 16);
  addTorusX(parent, materials.accent, `${name}_Nozzle_Ring`, radius * 0.92, radius * 0.10, [position[0], position[1], position[2]]);
  const fan = addCylinderX(parent, driveMat, `${name}_Fan`, radius * 0.72, radius * 0.09, [position[0] + radius * 0.1, position[1], position[2]], 12);
  const driveCore = addCylinderX(parent, coreMat, `${name}_Core_Mesh`, radius * 0.46, radius * 0.12, [position[0] - radius * 0.05, position[1], position[2]], 14);
  const plume = addMesh(parent, new THREE.CircleGeometry(radius * 1.25, 24), plumeMat, `${name}_Plume_Mesh`, [position[0] - radius * 0.15, position[1], position[2]], [0, -Math.PI / 2, 0]);
  fan.userData.keepSeparate = true;
  driveCore.userData.keepSeparate = true;
  plume.userData.keepSeparate = true;
  plume.userData.damageRole = 'plume';
  driveCore.userData.damageRole = 'driveCore';
  plume.renderOrder = 2;

  return { fan, driveCore, plume, plumeMat, basePlumeOpacity: driveGlowOpacity, flicker };
}

// ---------------------------------------------------------------------------------------------
// FINALIZE — the glue that gives every ship the Kestrel's three "alive" behaviors: LOD reaction,
// drive micro-motion, and readable damage. Call ONCE at the end of a builder, after all geometry is
// placed but BEFORE returning. options:
//   root, hull          — the two-layer group (outer + bankable hull), matches the Kestrel
//   decals              — array of decal meshes to drop at LOD1+ (the expensive per-ship detail)
//   driveParts          — { fan, driveCore, plume, plumeMat, basePlumeOpacity, flicker } from buildDrive
//   damageParts         — { navLights[], driveCore, plume, secondary[], armor?, sensorSlits? }
//   navLightBase        — snapshot of nav-light emissive intensities (for damage restore)
//   entity              — the ship entity (reads radius for scale, vel for drive speed)
//   designRadius        — the authored radius the hull geometry was built at
// ---------------------------------------------------------------------------------------------
export function finalizeShip(options) {
  const {
    root, hull, decals = [], driveParts = null, damageParts = null, navLightBase = null,
    entity, designRadius,
  } = options;

  // ---- scale to the entity's collision radius ----
  if (hull && designRadius && entity && Number.isFinite(entity.radius)) {
    hull.scale.setScalar(entity.radius / designRadius);
  }

  // ---- LOD reaction: drop decals at LOD1+ (they're illegible <300px and cost a texture each).
  //      Silhouette, sockets, drive, damage state are all preserved — only flourishes drop.
  let lastLod = 'lod0';
  root.userData.updateLod = function updateLod(level) {
    if (level === lastLod) return;
    lastLod = level;
    const showDecals = level === 'lod0';
    for (const d of decals) {
      if (d) d.visible = showDecals;
    }
  };
  attachLodState(root);

  // ---- drive micro-motion: fan spins + core pulses + plume scales with speed. Restrained and
  //      state-linked — the drive responds to actual speed, no ornamental animation.
  if (driveParts) {
    const { fan, driveCore, plume, plumeMat, basePlumeOpacity, flicker } = driveParts;
    if (fan) {
      fan.frustumCulled = false;
      fan.onBeforeRender = () => {
        const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
        const vx = entity && entity.vel && Number.isFinite(entity.vel.x) ? entity.vel.x : 0;
        const vz = entity && entity.vel && Number.isFinite(entity.vel.z) ? entity.vel.z : 0;
        const speed = Math.hypot(vx, vz);
        const drive = Math.min(1, speed / 135);
        fan.rotation.x = now * (1.5 + drive * 8.0);
        const pulse = 1 + Math.sin(now * 9.0) * (0.025 + drive * 0.025);
        if (driveCore) driveCore.scale.setScalar(pulse * (0.92 + drive * 0.16));
        if (plume) {
          const flick = flicker ? (0.85 + Math.sin(now * 17.3) * 0.1 + Math.sin(now * 31.7) * 0.05) : 1;
          plume.scale.setScalar((0.88 + drive * 0.40 + Math.sin(now * 7.0) * 0.025) * flick);
        }
        if (plumeMat) plumeMat.opacity = (0.30 + drive * 0.35) * (flicker ? (0.8 + Math.sin(now * 13.0) * 0.15) : 1);
      };
    }
  }

  // ---- readable damage (spec §9.11): a per-frame driver modulates nav-light groups, destabilizes
  //      the drive plume, and sheds named secondary parts so damage reads without the HUD hull bar.
  if (damageParts) {
    attachDamageStateDriver(root, hull, {
      navLights: damageParts.navLights || [],
      navLightBase: navLightBase || (damageParts.navLights || []).map((m) => m.material.emissiveIntensity),
      driveCore: damageParts.driveCore || (driveParts && driveParts.driveCore) || null,
      plume: damageParts.plume || (driveParts && driveParts.plume) || null,
      plumeBaseOpacity: driveParts ? driveParts.basePlumeOpacity : 0.30,
      secondary: damageParts.secondary || [],
      armor: damageParts.armor || [],
      sensorSlits: damageParts.sensorSlits || [],
    });
  }

  return root;
}
