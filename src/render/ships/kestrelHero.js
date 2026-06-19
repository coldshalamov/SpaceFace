// SF-K0 Kestrel / "BORROWED TIME"
// Bespoke player-starter ship for SpaceFace. Authoring space follows the project contract:
// +X forward, +Y up, +Z starboard, metres. The finished hull is 28 m long, ~14 m wide, ~6 m tall.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const DESIGN_RADIUS = 14;

const COLOR = Object.freeze({
  shell: '#817b70',          // old warm-gray ceramic alloy; visual rest
  shellDark: '#4e5050',      // replacement armor / shadow planes
  graphite: '#10161b',       // thermal, mechanical, and load-bearing structure
  gunmetal: '#252b30',
  frontier: '#4ecbe0',       // canonical Free Frontier cyan
  frontierPale: '#a0eef8',
  driveCore: '#e6fdff',
  practical: '#e9a34a',      // human-scale warm cabin/service light
  warning: '#c28b35',
  repair: '#53665a',         // one mismatched field-repair chapter
  rust: '#6b3f2b',
  canopy: '#061a22',
});

function standardMaterial(color, roughness = 0.55, metalness = 0.45, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
}

function emissiveMaterial(color, intensity = 1.5, opacity = 1) {
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

function glowMaterial(color, opacity = 0.55) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function loftXGeometry(sections, radialSegments = 10) {
  const positions = [];
  const indices = [];
  for (const section of sections) {
    const { x, halfY, halfZ, y = 0 } = section;
    for (let i = 0; i < radialSegments; i++) {
      const a = TAU * i / radialSegments;
      const sy = Math.sin(a);
      // Flatten the belly slightly: a working hull, not a perfect aircraft ellipse.
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

function extrudeXZGeometry(points, thickness = 0.3, yCenter = 0) {
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

function mirroredXZ(points) {
  return points.map(([x, z]) => [x, -z]).reverse();
}

function addMesh(parent, geometry, material, name, position = null, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(mesh);
  return mesh;
}

function addBox(parent, material, name, size, position, rotation = null) {
  return addMesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material, name, position, rotation);
}

function addCylinderX(parent, material, name, radius, length, position, segments = 12) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  geometry.rotateZ(Math.PI / 2);
  return addMesh(parent, geometry, material, name, position);
}

function addTorusX(parent, material, name, major, tube, position, radial = 6, tubular = 18) {
  const geometry = new THREE.TorusGeometry(major, tube, radial, tubular);
  geometry.rotateY(Math.PI / 2);
  return addMesh(parent, geometry, material, name, position);
}

function addSocket(parent, name, position, role, forward = [1, 0, 0]) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.set(position[0], position[1], position[2]);
  socket.userData = { spacefaceSocket: true, role, forward };
  parent.add(socket);
  return socket;
}

let borrowedTimeTexture = null;
let sharkTeethTexture = null;

function canvasTexture(width, height, draw) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function addBorrowedTimeDecal(parent) {
  const texture = borrowedTimeTexture || canvasTexture(512, 192, (ctx, w, h) => {
    ctx.save();
    ctx.translate(16, 8);
    ctx.rotate(-0.035);
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = '#d8e5dc';
    ctx.font = '700 54px sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('BORROWED', 6, 68);
    ctx.fillStyle = '#4ecbe0';
    ctx.font = '800 62px sans-serif';
    ctx.fillText('TIME', 184, 130);
    // A restrained ghost: a service stencil, not a cartoon mascot.
    ctx.strokeStyle = '#d8e5dc';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(70, 132, 28, Math.PI, 0);
    ctx.lineTo(98, 166);
    ctx.lineTo(84, 154);
    ctx.lineTo(70, 168);
    ctx.lineTo(56, 154);
    ctx.lineTo(42, 166);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#061a22';
    ctx.fillRect(57, 124, 7, 10);
    ctx.fillRect(77, 124, 7, 10);
    // Thirteen old tallies, grouped so they read as history rather than decoration.
    ctx.strokeStyle = '#c28b35';
    ctx.lineWidth = 4;
    for (let i = 0; i < 13; i++) {
      const group = Math.floor(i / 5);
      const local = i % 5;
      const x = 338 + group * 66 + local * 10;
      ctx.beginPath();
      ctx.moveTo(x, 30);
      ctx.lineTo(x - 3, 70);
      ctx.stroke();
    }
    ctx.restore();
  });
  if (!texture) return;
  borrowedTimeTexture = texture;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    roughness: 0.72,
    metalness: 0.08,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const decal = addMesh(parent, new THREE.PlaneGeometry(5.8, 2.1), material, 'Kestrel_Decal_Borrowed_Time', [-1.0, 0.35, -2.73], [0, Math.PI, 0]);
  decal.userData.keepSeparate = true;
  decal.renderOrder = 3;
}

function addFadedSharkTeeth(parent) {
  const texture = sharkTeethTexture || canvasTexture(384, 112, (ctx, w, h) => {
    ctx.globalAlpha = 0.48;
    ctx.strokeStyle = '#d8e5dc';
    ctx.fillStyle = '#d8e5dc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(10, h * 0.55);
    ctx.quadraticCurveTo(w * 0.48, h * 0.1, w - 10, h * 0.55);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const x = 22 + i * 29;
      const top = h * 0.47 - Math.sin(i / 11 * Math.PI) * 15;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 12, top + 33);
      ctx.lineTo(x + 23, top + 1);
      ctx.closePath();
      ctx.fill();
    }
  });
  if (!texture) return;
  sharkTeethTexture = texture;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.03,
    depthWrite: false,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  for (const z of [-1.72, 1.72]) {
    const decal = addMesh(parent, new THREE.PlaneGeometry(4.8, 1.4), material, `Kestrel_Decal_Shark_${z < 0 ? 'Port' : 'Starboard'}`, [8.4, -0.12, z], [0, z < 0 ? Math.PI : 0, 0]);
    decal.userData.keepSeparate = true;
    decal.renderOrder = 3;
  }
}


function mergeStaticByMaterial(parent, keepSeparate) {
  const groups = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh || keepSeparate.has(child) || child.userData.keepSeparate) continue;
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
    merged.name = `Kestrel_Static_${meshes[0].material.name || meshes[0].material.uuid.slice(0, 8)}`;
    for (const mesh of meshes) {
      parent.remove(mesh);
      mesh.geometry.dispose();
    }
    parent.add(merged);
  }
}

function buildMaterials() {
  const materials = {
    shell: standardMaterial(COLOR.shell, 0.58, 0.18),
    shellDark: standardMaterial(COLOR.shellDark, 0.62, 0.28),
    graphite: standardMaterial(COLOR.graphite, 0.42, 0.78),
    gunmetal: standardMaterial(COLOR.gunmetal, 0.29, 0.88),
    frontier: standardMaterial(COLOR.frontier, 0.52, 0.08),
    warning: standardMaterial(COLOR.warning, 0.66, 0.06),
    repair: standardMaterial(COLOR.repair, 0.72, 0.22),
    rust: standardMaterial(COLOR.rust, 0.86, 0.02),
    canopy: new THREE.MeshStandardMaterial({
      color: COLOR.canopy,
      emissive: new THREE.Color('#0a3040'),
      emissiveIntensity: 0.35,
      roughness: 0.14,
      metalness: 0.08,
      transparent: true,
      opacity: 0.92,
    }),
    sensor: emissiveMaterial(COLOR.frontierPale, 2.4),
    practical: emissiveMaterial(COLOR.practical, 1.35),
    drive: emissiveMaterial(COLOR.frontier, 2.75),
    driveCore: emissiveMaterial(COLOR.driveCore, 4.2),
    driveGlow: glowMaterial(COLOR.frontier, 0.46),
  };
  for (const [name, material] of Object.entries(materials)) material.name = `Kestrel_${name}`;
  return materials;
}

/** Build the hero Kestrel. It is intentionally authored, not a random greeble field. */
export function buildKestrelHero(entity) {
  const root = new THREE.Group();
  root.name = 'SF_K0_Kestrel_Borrowed_Time';
  root.userData.kind = 'ship';
  root.userData.assetId = 'SF_K0_KESTREL_BORROWED_TIME';
  root.userData.designRole = 'starter_ship_hero';

  const hull = new THREE.Group();
  hull.name = 'Kestrel_Bankable_Hull';
  hull.scale.setScalar((entity.radius || DESIGN_RADIUS) / DESIGN_RADIUS);
  root.add(hull);
  root.userData.hull = hull;

  const mat = buildMaterials();

  // 1) Pressure hull: a guarded, low wedge. The side masses remain separate so negative space—not
  // random surface detail—makes the silhouette memorable at normal play distance.
  const pressureHull = addMesh(hull, loftXGeometry([
    { x: -13.35, halfY: 1.35, halfZ: 1.80, y: -0.05 },
    { x: -8.2, halfY: 2.05, halfZ: 2.55, y: 0.05 },
    { x: -2.0, halfY: 2.25, halfZ: 2.75, y: 0.12 },
    { x: 4.8, halfY: 1.90, halfZ: 2.35, y: 0.12 },
    { x: 9.4, halfY: 1.25, halfZ: 1.62, y: 0.06 },
    { x: 13.90, halfY: 0.20, halfZ: 0.22, y: -0.03 },
  ], 12), mat.shell, 'Kestrel_Pressure_Hull');
  pressureHull.castShadow = true;

  // Exposed mechanical keel and dorsal armor spine: readable layering, not decorative noise.
  addBox(hull, mat.graphite, 'Kestrel_Ventral_Keel', [17.8, 0.72, 1.18], [-1.4, -1.72, 0]);
  addBox(hull, mat.shellDark, 'Kestrel_Dorsal_Spine', [13.2, 0.48, 0.72], [-2.1, 2.0, 0]);
  addBox(hull, mat.frontier, 'Kestrel_Broken_Centerline_A', [5.4, 0.09, 0.22], [5.4, 2.03, 0]);
  addBox(hull, mat.frontier, 'Kestrel_Broken_Centerline_B', [3.5, 0.09, 0.22], [-2.3, 2.18, 0]);
  addBox(hull, mat.warning, 'Kestrel_Centerline_Service_Break', [1.0, 0.1, 0.28], [1.25, 2.18, 0]);

  // 2) Split shoulders and outboard radiator pods. They imply survivable redundancy while honoring
  // the ship recipe's single engine: these are heat exchangers / landing sponsons, not fake drives.
  const shoulderPort = [
    [-8.0, -2.45], [-2.0, -2.75], [6.7, -2.1], [8.2, -3.25],
    [1.8, -4.75], [-6.3, -4.45], [-9.6, -3.15],
  ];
  const shoulderStarboard = mirroredXZ(shoulderPort);
  addMesh(hull, extrudeXZGeometry(shoulderPort, 0.42, 0.15), mat.shell, 'Kestrel_Shoulder_Port');
  addMesh(hull, extrudeXZGeometry(shoulderStarboard, 0.42, 0.15), mat.shell, 'Kestrel_Shoulder_Starboard');

  const outerPort = [
    [-7.8, -5.05], [-1.8, -5.35], [3.2, -4.55], [1.8, -6.75],
    [-5.8, -6.8], [-9.4, -5.85],
  ];
  addMesh(hull, extrudeXZGeometry(outerPort, 0.54, 0.02), mat.shellDark, 'Kestrel_Radiator_Pod_Port');
  addMesh(hull, extrudeXZGeometry(mirroredXZ(outerPort), 0.54, 0.02), mat.shellDark, 'Kestrel_Radiator_Pod_Starboard');
  for (const z of [-5.0, 5.0]) {
    addBox(hull, mat.gunmetal, `Kestrel_Shoulder_Strut_Fore_${z < 0 ? 'Port' : 'Starboard'}`, [1.9, 0.28, 1.8], [2.2, 0.0, z], [0, z < 0 ? -0.28 : 0.28, 0]);
    addBox(hull, mat.gunmetal, `Kestrel_Shoulder_Strut_Aft_${z < 0 ? 'Port' : 'Starboard'}`, [1.9, 0.28, 1.8], [-5.2, 0.0, z], [0, z < 0 ? 0.22 : -0.22, 0]);
    // Causal radiator slats sit where the thermal path actually ends.
    for (let i = 0; i < 4; i++) {
      addBox(hull, mat.graphite, `Kestrel_Radiator_${z < 0 ? 'Port' : 'Starboard'}_${i + 1}`, [1.0, 0.16, 0.18], [-5.7 + i * 1.55, 0.42, z * 1.13]);
    }
  }

  // 3) Low, protected cockpit and the architectural "face". The paired apertures suggest eyes only
  // after the player first reads a ship—controlled pareidolia, never a cartoon face.
  addMesh(hull, loftXGeometry([
    { x: 1.6, halfY: 0.18, halfZ: 1.22, y: 1.88 },
    { x: 4.8, halfY: 0.62, halfZ: 1.08, y: 1.98 },
    { x: 7.1, halfY: 0.34, halfZ: 0.74, y: 1.72 },
  ], 10), mat.canopy, 'Kestrel_Recessed_Canopy');
  addBox(hull, mat.graphite, 'Kestrel_Armored_Brow', [4.7, 0.38, 2.45], [7.0, 1.75, 0]);
  for (const z of [-0.72, 0.72]) {
    addBox(hull, mat.sensor, `Kestrel_Sensor_Slit_${z < 0 ? 'Port' : 'Starboard'}`, [1.1, 0.16, 0.26], [10.55, 0.68, z], [0, z < 0 ? -0.10 : 0.10, 0]);
  }
  addBox(hull, mat.shellDark, 'Kestrel_Nose_Chin', [3.2, 0.48, 1.32], [10.5, -0.68, 0]);
  addBox(hull, mat.warning, 'Kestrel_Nose_Service_Mark', [1.45, 0.08, 0.24], [11.4, -0.42, 0]);

  // 4) One axial M drive. Rings expose load and heat paths; the glow begins inside the nozzle.
  addCylinderX(hull, mat.graphite, 'Kestrel_Axial_Drive_Housing', 2.05, 4.4, [-10.65, -0.05, 0], 16);
  addTorusX(hull, mat.gunmetal, 'Kestrel_Drive_Forward_Ring', 1.86, 0.20, [-8.45, -0.05, 0]);
  addTorusX(hull, mat.frontier, 'Kestrel_Drive_Aft_Ring', 1.87, 0.22, [-13.33, -0.05, 0]);
  const fan = addCylinderX(hull, mat.drive, 'Kestrel_Drive_Fan', 1.48, 0.18, [-13.53, -0.05, 0], 12);
  const driveCore = addCylinderX(hull, mat.driveCore, 'Kestrel_Drive_Core', 0.94, 0.24, [-13.66, -0.05, 0], 14);
  const plume = addMesh(hull, new THREE.CircleGeometry(2.55, 24), mat.driveGlow, 'Kestrel_Drive_Glow', [-13.82, -0.05, 0], [0, -Math.PI / 2, 0]);
  fan.userData.keepSeparate = true;
  driveCore.userData.keepSeparate = true;
  plume.userData.keepSeparate = true;
  plume.renderOrder = 2;

  // 5) Visible starter verbs. The player can shoot and mine immediately, so the model exposes both
  // tools rather than forcing gameplay to originate from an invisible point.
  addBox(hull, mat.gunmetal, 'Kestrel_Pulse_Mount', [2.1, 0.52, 0.84], [7.4, 0.82, 0]);
  addCylinderX(hull, mat.gunmetal, 'Kestrel_Pulse_Barrel', 0.18, 4.0, [9.8, 0.82, 0], 10);
  addTorusX(hull, mat.warning, 'Kestrel_Pulse_Service_Ring', 0.28, 0.07, [8.15, 0.82, 0], 5, 12);

  addCylinderX(hull, mat.graphite, 'Kestrel_Mining_Emitter_Body', 0.38, 1.4, [11.45, -0.98, 0], 10);
  addCylinderX(hull, mat.practical, 'Kestrel_Mining_Emitter_Lens', 0.27, 0.11, [12.20, -0.98, 0], 12);
  addBox(hull, mat.warning, 'Kestrel_Mining_Hazard_Band', [0.28, 0.64, 0.92], [10.94, -0.98, 0]);

  // 6) Biography through constrained asymmetry: one port repair, one starboard utility pod, one old
  // antenna. Primary flight mass remains balanced; secondary equipment tells the story.
  addBox(hull, mat.repair, 'Kestrel_Field_Repair_Port', [4.2, 0.18, 2.05], [-0.8, 0.53, -3.55], [0, -0.05, 0.03]);
  for (const x of [-2.45, 0.85]) {
    for (const z of [-4.25, -2.90]) {
      addCylinderX(hull, mat.warning, `Kestrel_Repair_Fastener_${x}_${z}`, 0.075, 0.15, [x, 0.66, z], 6);
    }
  }
  addBox(hull, mat.repair, 'Kestrel_Utility_Pod_Starboard', [3.25, 1.0, 1.65], [-1.4, 1.3, 3.75], [0, -0.08, 0]);
  addBox(hull, mat.warning, 'Kestrel_Utility_Pod_Band', [0.28, 1.08, 1.74], [-0.55, 1.3, 3.75]);
  const mast = addCylinderX(hull, mat.gunmetal, 'Kestrel_Antenna_Mast', 0.08, 1.85, [-3.1, 2.65, -1.28], 7);
  mast.rotation.z = Math.PI / 2; // convert the X-oriented helper into a vertical mast
  addTorusX(hull, mat.sensor, 'Kestrel_Antenna_Loop', 0.34, 0.055, [-3.1, 3.55, -1.28], 5, 14).rotation.y = 0;

  // Landing skids establish that Tier 0 spends most of its life close to rock and machinery.
  for (const z of [-2.65, 2.65]) {
    addBox(hull, mat.graphite, `Kestrel_Landing_Skid_${z < 0 ? 'Port' : 'Starboard'}`, [6.7, 0.34, 0.36], [-1.8, -2.38, z]);
    addBox(hull, mat.gunmetal, `Kestrel_Landing_Strut_Fore_${z < 0 ? 'Port' : 'Starboard'}`, [0.28, 1.5, 0.28], [1.2, -1.62, z]);
    addBox(hull, mat.gunmetal, `Kestrel_Landing_Strut_Aft_${z < 0 ? 'Port' : 'Starboard'}`, [0.28, 1.5, 0.28], [-4.4, -1.62, z]);
  }

  // Human-scale lights: warm cabin/service light; cyan navigation/sensing. Red remains reserved for
  // actual danger and damage elsewhere in the game.
  addBox(hull, mat.practical, 'Kestrel_Cabin_Practical', [0.22, 0.16, 1.3], [4.1, 2.39, 0]);
  addBox(hull, mat.sensor, 'Kestrel_Nav_Port', [0.38, 0.18, 0.16], [1.6, 0.45, -6.45]);
  addBox(hull, mat.sensor, 'Kestrel_Nav_Starboard', [0.38, 0.18, 0.16], [1.6, 0.45, 6.45]);

  addBorrowedTimeDecal(hull);
  addFadedSharkTeeth(hull);

  // Gameplay/art contract. These marker transforms intentionally use the same canonical authored
  // space as the committed GLB reference and are available to future VFX/module integration.
  addSocket(hull, 'SOCKET_Weapon_Front', [12.0, 0.82, 0], 'weapon');
  addSocket(hull, 'SOCKET_Mining_Front', [12.35, -0.98, 0], 'mining');
  addSocket(hull, 'SOCKET_Engine_Main', [-13.80, -0.05, 0], 'engine', [-1, 0, 0]);
  addSocket(hull, 'SOCKET_Utility_Dorsal', [-1.4, 1.95, 3.75], 'utility', [0, 1, 0]);
  addSocket(hull, 'SOCKET_Cargo_Ventral', [-0.8, -2.05, 0], 'cargo', [0, -1, 0]);
  addSocket(hull, 'SOCKET_Trail_Main', [-13.95, -0.05, 0], 'vfx', [-1, 0, 0]);
  addSocket(hull, 'SOCKET_Camera_Focus', [0, 0.3, 0], 'camera');

  // Micro-motion is restrained and state-linked. The drive responds to actual speed; no ornamental
  // animation runs merely to announce that the asset has animation.
  fan.frustumCulled = false;
  fan.onBeforeRender = () => {
    const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
    const vx = entity.vel && Number.isFinite(entity.vel.x) ? entity.vel.x : 0;
    const vz = entity.vel && Number.isFinite(entity.vel.z) ? entity.vel.z : 0;
    const speed = Math.hypot(vx, vz);
    const drive = Math.min(1, speed / 135);
    fan.rotation.x = now * (1.5 + drive * 8.0);
    const pulse = 1 + Math.sin(now * 9.0) * (0.025 + drive * 0.025);
    driveCore.scale.setScalar(pulse * (0.92 + drive * 0.16));
    plume.scale.setScalar(0.88 + drive * 0.40 + Math.sin(now * 7.0) * 0.025);
    mat.driveGlow.opacity = 0.30 + drive * 0.35;
  };

  mergeStaticByMaterial(hull, new Set([fan, driveCore, plume]));

  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [28, 6, 14],
    sockets: 7,
    drawCallTarget: '<= 18 before post-processing',
    version: 1,
  };
  return root;
}
