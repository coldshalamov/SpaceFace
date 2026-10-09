// RUBRIC / HM-11: the marker's authored body and the paint marks it leaves on hulls. The same
// meshes and choreography are used by visualFactory and the playable bench. Nothing here decides
// whether a mark took: the sim publishes `data.rubricPose` / `data.rubricMark`, this file draws it.
//
// The marker: a squat red-lead paint tank (barrel) on hover jets, a glass dome that shows how much
// red lead is left, a cream dial FACE whose eyes are a stencil wheel read through a window, and
// three jointed arms: SPRAY (nozzle), CLAMP (rubber jaws that steady a hull) and STENCIL (a card
// laid on the hull before the nozzle works through it). Working arms are solved with two-bone IK
// toward the hull; resting arms fold along the barrel.
//
// The marks: a hull wearing the desk's FILED tag (chalk plate, green pass chevrons) gets a hot
// strike drawn through it and a bolted truth plate beside it. Any other hull gets the truth plate
// and a cause line under it. Cause is a SHAPE, never colour alone: one line, two lines (the hand
// is known) or a broken line (cause unlogged). Colour only reinforces it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { requestRubricSkins, rubricSkinRow } from '../rubricSkinLibrary.js';

const TAU = Math.PI * 2;
const sat = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const WHEEL_SECTORS = 5;
// Drum calibration: with the strip's cell k centred on u = (k + .5) / 5, rotating the drum by
// ZERO + SIGN * k * 72 degrees brings cell k to the top, under the visor window.
const WHEEL_SIGN = -1;
const WHEEL_ZERO = Math.PI * 0.8;

const ARM_UPPER = 5.0;
const ARM_FORE = 6.0;
const SHOULDER_Y = 3.4;
const BARREL_R = 5.4;
const RIG_LIFT = 4.2;
const MOUNTS = Object.freeze({ spray: 1.0, clamp: -1.0, stencil: 0 });
const DRUM_R = 2.6;
const DRUM_LEN = 4.6;
const VISOR = Object.freeze({ w: 6.0, d: 4.8, r: 1.2 });
const WINDOW = Object.freeze({ x: 0, halfX: 1.0, halfZ: 1.9 });
/** Height of the painted surface above the wreck's centre plane; shared by the marks and the arms. */
export const markHeight = R => R * 0.3 + 1.4;
/** Marks never grow past this layout radius, so a big hull's strike stays inside the arms' telescoping reach. */
export const markScale = R => Math.min(R, 9);
const MAX_STRETCH = 2.3;
const NOZZLE_LEN = 3.4;

function materials() {
  const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  const m = {
    skin: std(0xb8442a, 0.15, 0.6),
    paint: std(0xb8442a, 0.15, 0.55),
    graphite: std(0x3b414b, 0.55, 0.45),
    steel: std(0xa7afba, 0.8, 0.32),
    cream: std(0xd2c8ae, 0.05, 0.78),
    chalk: std(0xece6d2, 0.05, 0.7),
    rubber: std(0x1b1d22, 0.1, 0.9),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfe9ff, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.3, depthWrite: false }),
    lead: new THREE.MeshStandardMaterial({ color: 0xff5a36, emissive: 0xff3a1c, emissiveIntensity: 1.0, roughness: 0.35, metalness: 0.1 }),
    jet: new THREE.MeshBasicMaterial({ color: 0x4fe8d8 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    wheel: new THREE.MeshBasicMaterial({ color: 0x15181d }),
    faceGlyph: new THREE.MeshBasicMaterial({ color: 0xa6f5ff }),
    cap: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    hot: new THREE.MeshBasicMaterial({ color: 0xff4a2e }),
  };
  for (const [k, v] of Object.entries(m)) v.name = `RUBRIC_${k}`;
  return m;
}

function add(parent, geometry, material, name, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geometry, material);
  o.name = name; o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
}

/** A rounded-rectangle plate with a rectangular window, extruded flat on XZ. */
function visorPlate(w, d, r, win, depth, bevel = 0.1) {
  const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2, shape = new THREE.Shape();
  shape.moveTo(x0 + r, y0); shape.lineTo(x1 - r, y0); shape.quadraticCurveTo(x1, y0, x1, y0 + r); shape.lineTo(x1, y1 - r);
  shape.quadraticCurveTo(x1, y1, x1 - r, y1); shape.lineTo(x0 + r, y1); shape.quadraticCurveTo(x0, y1, x0, y1 - r); shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  const hole = new THREE.Path(); const { x: cx, halfX: hw, halfZ: hh } = win;
  hole.moveTo(cx - hw, hh); hole.lineTo(cx + hw, hh); hole.lineTo(cx + hw, -hh); hole.lineTo(cx - hw, -hh); hole.closePath();
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 }).rotateX(-Math.PI / 2);
}

/** Bake the static meshes directly under `group` into one mesh per (material, shadow flag). Anything that
 * animates (scaled, recoloured per-mesh, toggled) is passed in `keep` and stays a separate mesh. */
function mergeStatic(group, keep = []) {
  const buckets = new Map(), stay = new Set(keep), gone = [];
  for (const child of [...group.children]) {
    if (!child.isMesh || stay.has(child) || child.isInstancedMesh) continue;
    child.updateMatrix();
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    g.applyMatrix4(child.matrix); g.clearGroups();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = `${child.material.uuid}|${child.castShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { material: child.material, shadow: child.castShadow, parts: [] });
    buckets.get(key).parts.push(g); gone.push(child);
  }
  for (const child of gone) { group.remove(child); child.geometry.dispose(); }
  for (const { material, shadow, parts } of buckets.values()) {
    const merged = mergeGeometries(parts, false);
    parts.forEach(g => g.dispose());
    if (!merged) throw new Error('RUBRIC static merge: attribute mismatch');
    const mesh = new THREE.Mesh(merged, material); mesh.name = `${material.name}_static`; mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh);
  }
}

function sprayMaterial() {
  return new THREE.ShaderMaterial({ name: 'RUBRIC_spray', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: 'varying float vAlong; varying float vAng; void main(){ vAlong = position.x; vAng = atan(position.z, position.y); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying float vAlong; varying float vAng; uniform float uTime, uOpacity;
      void main(){ float stripe = .5 + .5*sin(vAlong*40. - uTime*26. + vAng*3.);
        float fade = smoothstep(0., .12, vAlong) * (1. - smoothstep(.72, 1., vAlong));
        gl_FragColor = vec4(vec3(1., .3, .14) * (.55 + stripe*.9), fade * (.18 + stripe*.22) * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}

// ---------- arms ---------------------------------------------------------------------------
/** A jointed arm: a red upper link on a steel axle, a graphite forelink, a tool at the wrist. */
function buildArm(parent, kind, m) {
  const shoulder = new THREE.Group(); shoulder.name = `ANIM_arm_${kind}`;
  const phi = MOUNTS[kind];
  shoulder.position.set(Math.cos(phi) * (BARREL_R - 0.1), SHOULDER_Y, Math.sin(phi) * (BARREL_R - 0.1));
  parent.add(shoulder);
  const axle = (p, r, name) => { const g = new THREE.Group(); p.add(g);
    add(g, new THREE.CylinderGeometry(r, r, 1.7, 16).rotateX(Math.PI / 2), m.steel, `${name}_axle`);
    add(g, new THREE.CylinderGeometry(r * 0.5, r * 0.5, 1.95, 12).rotateX(Math.PI / 2), m.cap, `${name}_cap`).castShadow = false; return g; };
  axle(shoulder, 1.15, 'shoulder');
  const upper = new THREE.Group(); upper.name = 'upper'; shoulder.add(upper);
  add(upper, new THREE.BoxGeometry(ARM_UPPER, 1.05, 1.25), m.paint, 'upper_link', ARM_UPPER / 2, 0, 0);
  add(upper, new THREE.BoxGeometry(ARM_UPPER * 0.5, 0.14, 0.55), m.chalk, 'upper_stripe', ARM_UPPER * 0.5, 0.58, 0);
  add(upper, new THREE.CylinderGeometry(0.22, 0.22, ARM_UPPER * 0.8, 8).rotateZ(Math.PI / 2), m.steel, 'piston', ARM_UPPER * 0.5, -0.2, 0.78);
  const elbow = new THREE.Group(); elbow.name = 'fore'; elbow.position.set(ARM_UPPER, 0, 0); upper.add(elbow);
  axle(elbow, 0.95, 'elbow');
  const foreLink = add(elbow, new THREE.BoxGeometry(ARM_FORE, 0.82, 0.9), m.graphite, 'fore_link', ARM_FORE / 2, 0, 0);
  const foreStripe = add(elbow, new THREE.BoxGeometry(ARM_FORE * 0.45, 0.12, 0.4), m.chalk, 'fore_stripe', ARM_FORE * 0.55, 0.46, 0);
  const tip = new THREE.Group(); tip.name = 'tip'; tip.position.set(ARM_FORE, 0, 0); elbow.add(tip);
  const parts = { shoulder, upper, elbow, tip, kind, foreLink, foreStripe, stretch: 1 };
  for (const g of [shoulder, upper]) mergeStatic(g, []);
  for (const g of shoulder.children) if (g.isGroup && g !== upper) mergeStatic(g, []);
  for (const g of elbow.children) if (g.isGroup && g !== tip) mergeStatic(g, []);
  if (kind === 'spray') {
    add(tip, new THREE.CylinderGeometry(0.85, 0.7, 2.0, 14).rotateZ(Math.PI / 2), m.steel, 'nozzle_barrel', 1.0, 0, 0);
    add(tip, new THREE.CylinderGeometry(0.3, 0.7, 1.1, 14).rotateZ(Math.PI / 2), m.hot, 'nozzle_tip', 2.5, 0, 0);
    add(tip, new THREE.BoxGeometry(1.1, 0.5, 0.7), m.lead, 'nozzle_lead_feed', 0.4, 0.8, 0);
    const cone = new THREE.CylinderGeometry(1, 0, 1, 14, 1, true).translate(0, 0.5, 0).rotateZ(-Math.PI / 2);
    parts.sprayMat = sprayMaterial();
    const sprayCone = new THREE.Mesh(cone, parts.sprayMat); sprayCone.name = 'spray_cone'; sprayCone.position.x = 3.0;
    sprayCone.frustumCulled = false; sprayCone.visible = false; tip.add(sprayCone); parts.sprayCone = sprayCone;
    // Droplets are small world-space solids, never camera-facing points.
    const N = 26;
    const dm = new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), dm, N);
    drops.name = 'spray_droplets'; drops.frustumCulled = false; drops.position.x = 3.0; drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    drops.visible = false; tip.add(drops);
    parts.drops = drops; parts.dropCount = N; parts.dropDummy = new THREE.Object3D();
    mergeStatic(tip, [sprayCone]);
  } else if (kind === 'clamp') {
    parts.jaws = [];
    for (const sign of [-1, 1]) {
      const jaw = new THREE.Group(); jaw.name = `ANIM_jaw_${sign}`; jaw.position.set(0.6, 0, sign * 0.6); tip.add(jaw);
      add(jaw, new THREE.BoxGeometry(2.6, 0.8, 0.55), m.graphite, 'jaw_bar', 1.3, 0, 0);
      add(jaw, new THREE.BoxGeometry(1.7, 0.9, 0.4), m.rubber, 'jaw_pad', 2.2, 0, -sign * 0.38);
      mergeStatic(jaw, []);
      parts.jaws.push({ jaw, sign });
    }
  } else {
    // Stencil card: a chalk plate cut with slots, folded against the wrist until it is laid on.
    const card = new THREE.Group(); card.name = 'ANIM_stencil_card'; card.position.set(1.0, 0, 0); tip.add(card);
    const plate = new THREE.Shape(); plate.moveTo(-1.9, -1.5); plate.lineTo(1.9, -1.5); plate.lineTo(1.9, 1.5); plate.lineTo(-1.9, 1.5); plate.closePath();
    for (const [x, z, w] of [[-0.8, -0.7, 1.2], [0.7, -0.1, 1.6], [-0.1, 0.8, 2.2]]) {
      const h = new THREE.Path();
      h.moveTo(x - w / 2, z - 0.15); h.lineTo(x + w / 2, z - 0.15); h.lineTo(x + w / 2, z + 0.15); h.lineTo(x - w / 2, z + 0.15); h.closePath(); plate.holes.push(h);
    }
    add(card, new THREE.ExtrudeGeometry(plate, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2), m.chalk, 'stencil_plate', 1.9, 0, 0);
    add(card, new THREE.CylinderGeometry(0.4, 0.4, 1.7, 8).rotateX(Math.PI / 2), m.steel, 'card_hinge', 0, 0, 0);
    mergeStatic(card, []);
    parts.card = card;
  }
  return parts;
}

/** Two-bone IK toward (tx,ty,tz) in rig space: yaw to the target, elbow up. When the target is past the
 * fixed reach the forearm telescopes (up to MAX_STRETCH) like a maintenance boom. Returns joint angles. */
function ikAngles(arm, tx, ty, tz) {
  const sp = arm.shoulder.position;
  const vx = tx - sp.x, vy = ty - sp.y, vz = tz - sp.z;
  const dh = Math.hypot(vx, vz), raw = Math.hypot(dh, vy);
  const stretch = raw > ARM_UPPER + ARM_FORE - 0.05 ? Math.max(1, Math.min(MAX_STRETCH, (raw - ARM_UPPER + 0.05) / ARM_FORE)) : 1;
  const L2 = ARM_FORE * stretch;
  const d = Math.max(Math.abs(ARM_UPPER - L2) + 0.35, Math.min(ARM_UPPER + L2 - 0.05, raw));
  const gamma = Math.acos(Math.max(-1, Math.min(1, (ARM_UPPER * ARM_UPPER + L2 * L2 - d * d) / (2 * ARM_UPPER * L2))));
  const beta = Math.acos(Math.max(-1, Math.min(1, (ARM_UPPER * ARM_UPPER + d * d - L2 * L2) / (2 * ARM_UPPER * d))));
  return { yaw: Math.atan2(-vz, vx), pitch: Math.atan2(vy, dh) + beta, bend: -(Math.PI - gamma), stretch };
}

/** Rest postures: the angles are authored, not solved, so the arms fold cleanly along the tank. */
function postureAngles(kind, posture) {
  const phi = MOUNTS[kind];
  const out = kind === 'clamp' ? -1 : 1; // which way round the barrel the arm stows
  const tangent = Math.atan2(-Math.cos(phi) * out, -Math.sin(phi) * out);
  if (kind === 'stencil' && (posture === 'rest' || posture === 'dark')) return { yaw: -phi, pitch: -1.42, bend: 2.9, stretch: 1 };
  if (posture === 'alarm') return { yaw: -phi, pitch: 1.15, bend: 0.25, stretch: 1 };
  if (posture === 'offer') return { yaw: -phi + (kind === 'clamp' ? -0.5 : kind === 'spray' ? 0.5 : 0), pitch: -0.95, bend: -0.35, stretch: 1 };
  if (posture === 'dark') return { yaw: tangent, pitch: -0.1, bend: -2.85, stretch: 1 };
  return { yaw: tangent, pitch: 0.05, bend: -2.75, stretch: 1 };
}

function applyArm(arm, a, snap, dt) {
  const k = snap ? 1 : 1 - Math.exp(-dt * 8);
  arm.shoulder.rotation.y += wrapPi(a.yaw - arm.shoulder.rotation.y) * k;
  arm.upper.rotation.z = lerp(arm.upper.rotation.z, a.pitch, k);
  arm.elbow.rotation.z = lerp(arm.elbow.rotation.z, a.bend, k);
  arm.stretch = lerp(arm.stretch, a.stretch ?? 1, k);
  arm.foreLink.scale.x = arm.stretch; arm.foreLink.position.x = ARM_FORE * arm.stretch / 2;
  arm.foreStripe.scale.x = arm.stretch; arm.foreStripe.position.x = ARM_FORE * arm.stretch * 0.55;
  arm.tip.position.x = ARM_FORE * arm.stretch;
}

// ---------- body ---------------------------------------------------------------------------
function buildBody(e) {
  const root = new THREE.Group(); root.name = 'RUBRIC_hm11';
  const rig = new THREE.Group(); rig.name = 'ANIM_rig'; root.add(rig);
  const m = materials();
  add(rig, new THREE.CylinderGeometry(BARREL_R, BARREL_R, 4.6, 48, 1, true), m.skin, 'paint_tank_shell', 0, 3.5, 0);
  add(rig, new THREE.CylinderGeometry(5.05, 5.45, 0.7, 48), m.graphite, 'top_deck', 0, 6.15, 0);
  add(rig, new THREE.CylinderGeometry(4.5, 5.0, 0.9, 48), m.graphite, 'skirt', 0, 0.85, 0);
  add(rig, new THREE.CylinderGeometry(4.85, 4.85, 0.14, 48), m.paint, 'deck_paint', 0, 6.52, 0);
  add(rig, new THREE.TorusGeometry(5.38, 0.22, 8, 56), m.steel, 'rim_top', 0, 5.85, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 16; i++) { const a = i * TAU / 16; add(rig, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 6), m.steel, 'deck_rivet', Math.cos(a) * 4.5, 6.62, Math.sin(a) * 4.5).castShadow = false; }
  const hoverRing = add(rig, new THREE.TorusGeometry(4.15, 0.3, 8, 56), m.jet, 'hover_ring', 0, 0.3, 0); hoverRing.rotation.x = Math.PI / 2; hoverRing.castShadow = false;
  for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + Math.PI / 4; add(rig, new THREE.CylinderGeometry(0.6, 0.85, 0.8, 10), m.steel, 'hover_nozzle', Math.cos(a) * 3.6, 0.4, Math.sin(a) * 3.6); }
  // The unit's number in chalk bars on the rear deck, readable from the gameplay camera.
  const id = new THREE.Group(); id.name = 'deck_identity'; id.position.set(-1.4, 6.64, -2.9); rig.add(id);
  for (let i = 0; i < 5; i++) add(id, new THREE.BoxGeometry(0.4, 0.05, i === 2 ? 0.5 : 1.7), m.chalk, 'deck_stencil_bar', (i - 2) * 0.85, 0, 0).castShadow = false;
  // Dome (paint level), set back from the face.
  const domeX = -2.7;
  add(rig, new THREE.SphereGeometry(2.35, 24, 12, 0, TAU, 0, Math.PI / 2), m.glass, 'lead_dome', domeX, 6.6, 0).castShadow = false;
  const liquid = add(rig, new THREE.CylinderGeometry(2.1, 2.1, 2.0, 24), m.lead, 'lead_level', domeX, 7.5, 0); liquid.castShadow = false;
  add(rig, new THREE.TorusGeometry(2.38, 0.2, 8, 28), m.steel, 'dome_collar', domeX, 6.64, 0).rotation.x = Math.PI / 2;
  // Hose from the dome to the spray arm.
  const hose = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1.0, 6.9, 1.7), new THREE.Vector3(1.0, 7.5, 3.4), new THREE.Vector3(3.7, 4.9, 3.9)]), 16, 0.22, 6, false);
  add(rig, hose, m.lead, 'lead_hose');
  for (const t of [0.3, 0.62]) { const p = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.0, 6.9, 1.7), new THREE.Vector3(1.0, 7.5, 3.4), new THREE.Vector3(3.7, 4.9, 3.9)]).getPoint(t);
    add(rig, new THREE.TorusGeometry(0.34, 0.09, 6, 12), m.steel, 'hose_clamp', p.x, p.y, p.z); }
  // Antenna and its lamp.
  add(rig, new THREE.CylinderGeometry(0.14, 0.18, 4, 6), m.steel, 'antenna', -4.1, 8.4, 2.4);
  const lamp = add(rig, new THREE.SphereGeometry(0.6, 10, 8), m.lamp, 'marker_lamp', -4.1, 10.5, 2.4); lamp.castShadow = false;
  // Head: a turntable carrying a low visor. A stencil drum turns inside it, one cartridge at the window.
  const head = new THREE.Group(); head.name = 'ANIM_head'; head.position.set(2.7, 6.6, 0); rig.add(head);
  add(head, new THREE.CylinderGeometry(1.1, 1.5, 0.9, 16), m.graphite, 'neck', 0, 0.45, 0);
  const visor = new THREE.Group(); visor.name = 'ANIM_visor'; visor.position.set(0, 1.4, 0); visor.rotation.z = -0.2; head.add(visor);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R, DRUM_R, DRUM_LEN, 56, 1, true).rotateX(Math.PI / 2), m.wheel);
  wheel.name = 'ANIM_stencil_drum'; wheel.position.set(WINDOW.x, 0.04 - DRUM_R, 0); visor.add(wheel);
  add(visor, visorPlate(VISOR.w, VISOR.d, VISOR.r, WINDOW, 0.42), m.cream, 'visor_plate', 0, 0.04, 0);
  add(visor, new THREE.BoxGeometry(VISOR.w - 0.6, 0.9, VISOR.d - 0.6), m.graphite, 'visor_skirt', 0, -0.5, 0);
  add(visor, new THREE.BoxGeometry(0.5, 0.34, VISOR.d - 1.2), m.chalk, 'visor_brow', VISOR.w / 2 - 0.3, 0.55, 0);
  for (const sz of [-1, 1]) add(visor, new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10), m.cap, 'visor_side_lamp', -VISOR.w / 2 + 0.7, 0.5, sz * (VISOR.d / 2 - 0.55)).castShadow = false;
  // Window frame: a graphite lip so the face reads as a lit screen set in the plate.
  for (const [x, z, w, d] of [[WINDOW.x + WINDOW.halfX + 0.1, 0, 0.2, WINDOW.halfZ * 2 + 0.5], [WINDOW.x - WINDOW.halfX - 0.1, 0, 0.2, WINDOW.halfZ * 2 + 0.5],
    [WINDOW.x, WINDOW.halfZ + 0.1, WINDOW.halfX * 2, 0.2], [WINDOW.x, -WINDOW.halfZ - 0.1, WINDOW.halfX * 2, 0.2]]) add(visor, new THREE.BoxGeometry(w, 0.32, d), m.graphite, 'window_lip', x, 0.5, z).castShadow = false;
  const fallback = new THREE.Group(); fallback.name = 'face_fallback'; fallback.position.set(WINDOW.x, 0.1, 0); visor.add(fallback);
  const eyeL = add(fallback, new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2), m.faceGlyph, 'fallback_eye_l', 0, 0, -0.95);
  const eyeR = add(fallback, new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2), m.faceGlyph, 'fallback_eye_r', 0, 0, 0.95);
  eyeL.castShadow = eyeR.castShadow = false;
  const arms = { spray: buildArm(rig, 'spray', m), clamp: buildArm(rig, 'clamp', m), stencil: buildArm(rig, 'stencil', m) };
  mergeStatic(visor, [wheel]);
  mergeStatic(head, []);
  for (const g of rig.children) if (g.isGroup && g.name === 'deck_identity') mergeStatic(g, []);
  mergeStatic(rig, [liquid, lamp, hoverRing]);
  root.userData.rubricParts = { rig, head, visor, wheel, liquid, lamp, hoverRing, arms, fallback };

  // Skins arrive asynchronously; the marker is complete and correct without them.
  let skins = null, row = -1, atlasMap = null;
  const owned = [];
  const stopWaiting = requestRubricSkins((s) => {
    skins = s;
    atlasMap = s.atlas.clone(); atlasMap.needsUpdate = true; owned.push(atlasMap);
    atlasMap.wrapS = THREE.RepeatWrapping; atlasMap.repeat.set(1, 0.25);
    m.skin.map = atlasMap; m.skin.color.set(0xffffff); m.skin.needsUpdate = true;
    m.wheel.map = s.wheel; m.wheel.color.set(0xffffff); m.wheel.needsUpdate = true;
    fallback.visible = false; row = -1;
  });
  root.userData.disposeSkins = () => { stopWaiting(); for (const t of owned) t.dispose(); owned.length = 0; };

  let lastT = null, wheelAngle = 0, wheelVel = 0, lookYaw = 0, lastVx = 0, lastVz = 0, slosh = 0;
  const clampOpen = { v: 1 }, stencilOut = { v: 0 }, armTarget = new THREE.Vector3(), localAim = new THREE.Vector3();
  const GLYPH = [0xa6f5ff, 0xffb347, 0xff3b2f, 0xff4a2e, 0x3a4350];
  root.userData.updateAuthoredMotion = (entity, time, a11y = {}) => {
    const p = entity?.data?.rubricPose || {};
    const t = Number.isFinite(p.simTime) ? p.simTime : time || 0;
    const first = lastT === null;
    const dt = first ? 1 : Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
    const reduce = !!a11y.reducedMotion, calmFlash = !!a11y.reducedFlash;
    const snap = reduce || first;
    const mode = p.mode || 'idle', rot = entity?.rot || 0;
    const working = mode === 'work' && !!p.aim?.live, dark = mode === 'dark' || !!p.memorial, flee = mode === 'flee', offer = mode === 'offer';
    if (skins && atlasMap) {
      const want = rubricSkinRow(p);
      if (want !== row) { row = want; atlasMap.offset.set(0, 1 - (want + 1) * 0.25); }
    }
    // Hover bob, roll with acceleration.
    const bob = reduce || dark ? 0 : Math.sin(t * 1.7) * 0.32;
    rig.position.y = lerp(rig.position.y, RIG_LIFT + bob, snap ? 1 : 1 - Math.exp(-dt * 6));
    const vx = entity?.vel?.x || 0, vz = entity?.vel?.z || 0;
    const ax = dt > 0 && !first ? (vx - lastVx) / dt : 0, az = dt > 0 && !first ? (vz - lastVz) / dt : 0; lastVx = vx; lastVz = vz;
    slosh = lerp(slosh, Math.max(-0.3, Math.min(0.3, (ax * Math.cos(rot) + az * Math.sin(rot)) * 0.02)), snap ? 0 : 1 - Math.exp(-dt * 5));
    rig.rotation.z = reduce ? 0 : slosh * 0.5 + Math.sin(t * 1.1) * 0.015;
    rig.rotation.x = reduce ? 0 : Math.sin(t * 0.9 + 1) * 0.012;
    // The face turns toward the player (world angle -> rig angle); at work it keeps its eyes on the job.
    const look = Number.isFinite(p.look) ? p.look : 0;
    const aimYaw = working ? -Math.atan2(p.aim.z, p.aim.x) + rot : -look + rot;
    const wantYaw = dark ? 0 : aimYaw;
    lookYaw += wrapPi(wantYaw - lookYaw) * (snap ? 1 : 1 - Math.exp(-dt * 5));
    head.rotation.y = lookYaw;
    // Stencil wheel indexes to the active cartridge with a small overshoot.
    const sector = Number.isFinite(p.wheel) ? p.wheel : 0;
    const wantWheel = WHEEL_ZERO + WHEEL_SIGN * sector * (TAU / WHEEL_SECTORS);
    const wd = wrapPi(wantWheel - wheelAngle);
    if (snap) { wheelAngle = wantWheel; wheelVel = 0; } else { wheelVel += (wd * 140 - wheelVel * 13) * dt; wheelAngle += wheelVel * dt; }
    wheel.rotation.z = wheelAngle;
    m.faceGlyph.color.setHex(GLYPH[sector] ?? GLYPH[0]);
    // Paint level in the dome.
    const level = Math.max(0.04, Math.min(1, p.paint ?? 1));
    liquid.scale.y = lerp(liquid.scale.y, level, snap ? 1 : 1 - Math.exp(-dt * 3));
    liquid.position.y = 6.62 + 1.0 * liquid.scale.y;
    m.lead.emissiveIntensity = dark ? 0.08 : calmFlash ? 0.8 : 1.0 + (working ? 0.4 : 0) + (flee ? 0.4 : 0);
    // Lamps, jets.
    const blink = reduce || calmFlash ? 1 : (Math.sin(t * (flee ? 14 : 4.5)) > 0 ? 1 : 0.35);
    m.lamp.color.setHex(dark ? 0xdcd8cc : flee ? 0xff3b2f : working ? 0x4fe8d8 : offer ? 0xffffff : 0xffb347);
    m.lamp.color.multiplyScalar(dark ? 0.35 : blink);
    m.jet.color.setHex(dark ? 0x30343a : flee ? 0xff6a4a : working ? 0xffb347 : 0x4fe8d8);
    hoverRing.scale.setScalar(dark ? 0.9 : 1 + (reduce ? 0 : Math.sin(t * 5) * 0.015));
    // Arms: IK toward the hull at work, authored postures otherwise.
    const ca = Math.cos(rot), sa = Math.sin(rot);
    if (working) localAim.set(p.aim.x * ca + p.aim.z * sa, 0, -p.aim.x * sa + p.aim.z * ca);
    const aimR = Math.max(3, p.aimRadius || 9), sweep = (-0.6 + 1.2 * sat(p.progress || 0)) * markScale(aimR);
    const hullYaw = (p.aimRot || 0) - rot; // hull-local +X, in rig space, is (cos, sin) of this
    const hx = Math.cos(hullYaw), hz = Math.sin(hullYaw);
    const top = markHeight(aimR) + 0.4 - RIG_LIFT;
    const posture = flee ? 'alarm' : offer ? 'offer' : dark ? 'dark' : 'rest';
    const drive = (arm, dx, dy, dz, toolLen = 0) => {
      let a;
      if (working) {
        armTarget.set(localAim.x + dx, top + dy, localAim.z + dz);
        if (toolLen > 0) { // the nozzle's END meets the strike, so the wrist stops short of it
          const sp = arm.shoulder.position, vx = armTarget.x - sp.x, vy = armTarget.y - sp.y, vz = armTarget.z - sp.z, n = Math.hypot(vx, vy, vz) || 1, k = Math.max(0, n - toolLen) / n;
          armTarget.set(sp.x + vx * k, sp.y + vy * k, sp.z + vz * k);
        }
        a = ikAngles(arm, armTarget.x, armTarget.y, armTarget.z);
      } else a = postureAngles(arm.kind, posture);
      applyArm(arm, a, snap, dt);
    };
    drive(arms.spray, hx * sweep, 0.2, hz * sweep, NOZZLE_LEN);
    drive(arms.clamp, -hz * (aimR * 0.85), 0, hx * (aimR * 0.85));
    drive(arms.stencil, hz * (aimR * 0.55) - hx * aimR * 0.15, 0.15, -hx * (aimR * 0.55) - hz * aimR * 0.15);
    clampOpen.v = lerp(clampOpen.v, working ? 0 : 1, snap ? 1 : 1 - Math.exp(-dt * 7));
    for (const { jaw, sign } of arms.clamp.jaws) jaw.rotation.y = sign * (0.08 + 0.55 * clampOpen.v);
    stencilOut.v = lerp(stencilOut.v, working && (p.progress || 0) < 0.97 ? 1 : 0, snap ? 1 : 1 - Math.exp(-dt * 4));
    arms.stencil.card.rotation.z = lerp(-1.5, 0, stencilOut.v);
    // Spray cone and droplets follow the nozzle.
    const sp = arms.spray, spraying = working && p.spray > 0 && !dark;
    const aimDist = Math.min(22, Math.max(4, Math.hypot(localAim.x - sp.shoulder.position.x, localAim.z - sp.shoulder.position.z) - 8));
    sp.sprayCone.visible = spraying && !reduce;
    sp.sprayCone.scale.set(Math.max(2, aimDist * 0.55), 0.9, 0.9);
    sp.sprayMat.uniforms.uTime.value = t; sp.sprayMat.uniforms.uOpacity.value = calmFlash ? 0.45 : 1;
    const dm = sp.drops.material; dm.opacity = spraying ? (calmFlash ? 0.35 : 0.9) : 0; sp.drops.visible = spraying;
    if (spraying) {
      const len = Math.max(2, aimDist * 0.55), dummy = sp.dropDummy;
      for (let i = 0; i < sp.dropCount; i++) {
        const u = ((i / sp.dropCount) + (reduce ? 0 : t * 1.4)) % 1, j = (i * 2654435761 >>> 0) / 4294967296;
        dummy.position.set(u * len, (j - 0.5) * u * 1.6, (((i * 40503) % 997) / 997 - 0.5) * u * 1.6);
        dummy.scale.setScalar(0.6 + 0.8 * j * (1 - u * 0.5)); dummy.updateMatrix(); sp.drops.setMatrixAt(i, dummy.matrix);
      }
      sp.drops.instanceMatrix.needsUpdate = true;
    }
  };
  return finish(root, e, 'drone', 'rubric-hull-marker');
}

// ---------- marks --------------------------------------------------------------------------
const MARK_COLOR = Object.freeze({ p: 0xff3b24, y: 0xff3b24, o: 0xffa628, l: 0xece6d2, u: 0x8ab4d8 });
// Layout in hull radii: both plates are the same width and sit side by side across the hull.
const PLATE_W = 1.3;

function buildMark(e) {
  const R = Math.max(5, e.radius || 9);
  const root = new THREE.Group(); root.name = 'RUBRIC_mark';
  const mk = e.data?.rubricMark || {};
  const layer = new THREE.Group(); layer.scale.setScalar(markScale(R)); layer.position.y = markHeight(R); root.add(layer);
  const chalk = new THREE.MeshBasicMaterial({ color: 0xece6d2 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x0c0e11 });
  const green = new THREE.MeshBasicMaterial({ color: 0x37d985 });
  const cause = new THREE.MeshBasicMaterial({ color: MARK_COLOR[mk.cause] || MARK_COLOR.u, transparent: true });
  // Over the chalk filing the strike must be hot whatever the cause, or white-on-white says nothing.
  const strike = mk.filed ? new THREE.MeshBasicMaterial({ color: 0xff3b24, transparent: true }) : cause;
  const halo = new THREE.MeshBasicMaterial({ color: 0x0c0e11, transparent: true, opacity: 0.8 });
  const box = (w, d, material, x, z, name, y = 0, h = 0.03) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); o.name = name; o.position.set(x, y, z); layer.add(o); return o; };
  const parts = { lines: [], bars: [], ghosts: [] };
  const filedZ = -0.36, plateZ = mk.filed ? 0.32 : 0.05, plateD = 0.52;
  // The desk's filing: chalk plate, three green pass chevrons, two stencil text bars.
  if (mk.filed) {
    box(PLATE_W + 0.1, 0.5, dark, 0, filedZ, 'filed_tag_back', -0.005, 0.02);
    box(PLATE_W, 0.42, chalk, 0, filedZ, 'filed_tag', 0.01, 0.03);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 3).rotateX(Math.PI / 2).rotateY(Math.PI / 2), green);
      c.name = 'filed_chevron'; c.position.set(-0.46 + i * 0.16, 0.035, filedZ); layer.add(c);
    }
    box(0.4, 0.07, dark, 0.3, filedZ - 0.09, 'filed_text_bar'); box(0.5, 0.07, dark, 0.26, filedZ + 0.08, 'filed_text_bar');
  }
  // The truth plate: dark, hot-edged, with text lines that extend as it is written.
  box(PLATE_W + 0.1, plateD + 0.1, halo, 0, plateZ, 'truth_plate_halo', -0.01, 0.02);
  box(PLATE_W, plateD, dark, 0, plateZ, 'truth_plate', 0.01, 0.03);
  for (const [x, z, w, h] of [[0, -plateD / 2, PLATE_W, 0.035], [0, plateD / 2, PLATE_W, 0.035], [-PLATE_W / 2, 0, 0.035, plateD], [PLATE_W / 2, 0, 0.035, plateD]]) box(w, h, cause, x, plateZ + z, 'truth_plate_edge', 0.03, 0.02);
  [0.95, 0.8, 1.0, 0.55].forEach((w, i) => {
    const bar = box(w, 0.06, chalk, -PLATE_W / 2 + 0.1 + w / 2, plateZ - 0.18 + i * 0.12, 'truth_text_line', 0.035, 0.025);
    bar.userData.full = w; bar.userData.base = -PLATE_W / 2 + 0.1; parts.lines.push(bar);
  });
  // The cause line: single / double / broken. Struck through the filing, otherwise under the plate.
  const barZ = mk.filed ? filedZ : plateZ + plateD / 2 + 0.16;
  const addBar = (zOff, dashed, target) => {
    const g = new THREE.Group(); g.position.set(0, 0.06, barZ + zOff); g.rotation.y = mk.filed ? -0.2 : 0; layer.add(g);
    const pieces = dashed ? 6 : 1; const entries = [];
    for (let i = 0; i < pieces; i++) {
      const total = PLATE_W + 0.2, w = dashed ? total / 6 - 0.04 : total;
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.02, 0.14), halo); const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, mk.filed ? 0.1 : 0.08), strike);
      const x0 = -total / 2 + (dashed ? i * (total / 6) : 0);
      back.position.set(x0 + w / 2, -0.005, 0); bar.position.set(x0 + w / 2, 0.01, 0); g.add(back); g.add(bar); entries.push({ bar, back, x0, w });
    }
    target.push({ g, entries, dashed });
  };
  if (mk.style === 3) addBar(0, true, parts.bars);
  else for (let i = 0; i < (mk.style === 2 ? 2 : 1); i++) addBar((i - ((mk.style === 2 ? 2 : 1) - 1) / 2) * 0.17, false, parts.bars);
  // Smear: a second, wandering copy of the strike that shows the hull moved while the paint was wet.
  if (mk.style === 3) addBar(0.1, true, parts.ghosts); else addBar(0.09, false, parts.ghosts);
  for (const gh of parts.ghosts) for (const en of gh.entries) { en.bar.material = strike.clone(); en.bar.material.opacity = 0; en.back.visible = false; }
  root.userData.updateAuthoredMotion = (entity, time, a11y = {}) => {
    const d = entity?.data?.rubricMark || {};
    const t = Number.isFinite(d.simTime) ? d.simTime : time || 0;
    const prog = sat(d.progress ?? 0), calm = !!a11y.reducedFlash || !!a11y.reducedMotion;
    for (const b of parts.bars) {
      const n = b.entries.length;
      b.entries.forEach((en, i) => {
        const shown = b.dashed ? sat(prog * n - i) : prog;
        en.bar.visible = en.back.visible = shown > 0.001;
        if (!b.dashed) { en.bar.scale.x = en.back.scale.x = Math.max(0.001, shown); en.bar.position.x = en.back.position.x = en.x0 + (en.w * en.bar.scale.x) / 2; }
      });
    }
    parts.lines.forEach((bar, i) => {
      const shown = sat((prog - 0.18 - i * 0.12) / 0.3);
      bar.visible = shown > 0.001; bar.scale.x = Math.max(0.001, shown);
      bar.position.x = bar.userData.base + (bar.userData.full * bar.scale.x) / 2;
    });
    strike.opacity = cause.opacity = prog > 0 && prog < 1 && !calm ? 0.78 + 0.22 * Math.sin(t * 11) : 1;
    const smear = sat(d.smear || 0);
    for (const gh of parts.ghosts) {
      gh.g.rotation.y = (mk.filed ? -0.2 : 0) + smear * 0.12; gh.g.position.x = smear * 0.1;
      for (const en of gh.entries) {
        en.bar.material.opacity = smear * 0.65; en.bar.visible = smear > 0.02;
        if (!gh.dashed) { en.bar.scale.x = Math.max(0.01, prog); en.bar.position.x = en.x0 + (en.w * en.bar.scale.x) / 2; }
      }
    }
  };
  return finish(root, e, 'fx', 'rubric-hull-mark');
}

// ---------- shared -------------------------------------------------------------------------
export function buildRubricVisual(e = { data: { rubricPart: 'body', rubricPose: {} } }) {
  return e.data?.rubricPart === 'mark' ? buildMark(e) : buildBody(e);
}

function finish(root, e, kind, language) {
  root.userData.kind = kind; root.userData.animated = true; root.userData.rubric = true;
  root.userData.visualLanguage = language; root.userData.authoredAssetState = 'authored'; root.userData.authoredVisualRoot = 'authored-root';
  root.userData.disposeRubric = () => disposeRubricVisual(root);
  root.userData.updateAuthoredMotion(e, 0, {});
  return root;
}

export function disposeRubricVisual(root) {
  if (!root || root.userData.rubricDisposed) return;
  root.userData.rubricDisposed = true;
  root.userData.disposeSkins?.();
  const gs = new Set(), ms = new Set();
  root.traverse(o => {
    if (o.geometry) gs.add(o.geometry);
    if (o.material) for (const mat of Array.isArray(o.material) ? o.material : [o.material]) ms.add(mat);
  });
  gs.forEach(g => g.dispose());
  ms.forEach(mat => mat.dispose());
  root.removeFromParent();
}
