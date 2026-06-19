// SF-REACH Reaver Pirate — bespoke pirate-conversion hero asset (spec §8.5, Phase 3 §20).
//
// §8.5 reading: "predatory reuse." A pirate ship is a STOLEN base hull with altered posture — not a
// designed warship. So this is the visual opposite of the Concord's institutional symmetry: it is
// asymmetric, weapon-studded, tagged, and neglected. The important question (§8.5) is what they
// MAINTAIN because they need it to survive — so the guns and drive are functional, while cargo/service
// surfaces are cannibalized.
//
// Construction logic vs §8.5 bullets:
//   - "stolen base hull with altered posture"        -> a civilian drifter hull pitched nose-up + banked
//   - "weapons mounted where cargo/service was"      -> bolted-on gun pods replacing the cargo bay
//   - "strong local damage and replacement"          -> a patched hull quadrant (mismatched color panel)
//   - "broken symmetry around function"              -> one oversized off-center cannon, one missing pod
//   - "overpaint, tags, and kill marks"              -> canvas-generated crimson tag + tally marks
//   - "neglected thermal and access surfaces"        -> scorched, ungroomed radiator fins
//   - "hot, unstable emission"                       -> oversaturated red-orange drive, flickering
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. collisionRadius ~16 (enemies.js drifter).
import * as THREE from 'three';
import { attachLodState } from '../lod.js';

const TAU = Math.PI * 2;
const COLOR = Object.freeze({
  hull: '#5a4a44',          // dirty brown-grey base — a sun-bleached stolen civilian hull
  patch: '#7a6a5a',         // the mismatched repair panel (replaced quadrant, different paint)
  rust: '#6b3f2b',          // neglected thermal/access surfaces (§8.5)
  graphite: '#15100e',      // scorched mechanical structure
  gunmetal: '#2a2520',
  tag: '#D8334A',           // Crimson Reach overpaint (faction_reach crimson)
  drive: '#ff5522',         // hot unstable emission (§8.5) — oversaturated red-orange
  driveCore: '#ffcc66',
  warning: '#c28b35',
});

function stdMat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
}
function lightMat(color, intensity = 2.4) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color('#000000'), emissive: new THREE.Color(color), emissiveIntensity: intensity });
}
function driveGlowMat(color, opacity = 0.6) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

// A canvas-generated crimson faction tag + kill tallies (§8.5 overpaint/tags/kill marks).
function makeTagTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  // base weathering
  x.fillStyle = '#3a2a24'; x.fillRect(0, 0, 256, 128);
  // crude sprayed crimson tag — a jagged Reach sigil (not a clean logo: pirates don't have brand control)
  x.fillStyle = '#D8334A';
  x.font = 'bold 70px sans-serif'; x.textAlign = 'center';
  x.globalAlpha = 0.85; x.fillText('R', 60, 80);
  x.globalAlpha = 0.6; x.fillText('H', 128, 80);
  x.globalAlpha = 0.75; x.fillText('!', 196, 80);
  // kill tallies — four strokes (§8.5 kill marks with hierarchy)
  x.globalAlpha = 0.9; x.strokeStyle = '#e8d0a0'; x.lineWidth = 4;
  for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(20 + i * 12, 110); x.lineTo(28 + i * 12, 118); x.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build the bespoke Reaver Pirate mesh (a converted stolen civilian hull, §8.5).
 */
export function buildReaverPirate(entity) {
  const DESIGN_RADIUS = 16;
  const radius = (entity && Number.isFinite(entity.radius)) ? entity.radius : DESIGN_RADIUS;
  const scale = radius / DESIGN_RADIUS;

  const mat = {
    hull: stdMat(COLOR.hull, 0.78, 0.18),       // dirty, low-metal — sun-bleached civilian paint
    patch: stdMat(COLOR.patch, 0.82, 0.14),     // mismatched repair panel (different paint batch)
    rust: stdMat(COLOR.rust, 0.92, 0.06),       // neglected thermal surface, dielectric + rough
    graphite: stdMat(COLOR.graphite, 0.6, 0.66),
    gunmetal: stdMat(COLOR.gunmetal, 0.5, 0.72),
    tag: lightMat(COLOR.tag, 1.6),
    drive: lightMat(COLOR.drive, 3.4),           // hot unstable red-orange emission, §8.5
    driveCore: lightMat(COLOR.driveCore, 4.2),
    driveGlow: driveGlowMat(COLOR.drive, 0.62),
  };
  for (const [n, m] of Object.entries(mat)) m.name = `Reaver_${n}`;

  const hull = new THREE.Group(); hull.name = 'Reaver_Pirate_Hull';
  const addBox = (m, name, [sx, sy, sz], [x, y, z], rot) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); g.name = name;
    g.position.set(x, y, z); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); hull.add(g); return g;
  };
  const addCylX = (m, name, r, h, [x, y, z]) => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); g.name = name;
    g.position.set(x, y, z); g.rotation.z = Math.PI / 2; hull.add(g); return g;
  };

  // ---- stolen civilian drifter hull: a multirole fuselage, but PITCHED (altered posture, §8.5) ----
  // The base hull is symmetric, but we tilt the whole assembly nose-up to read as "repurposed."
  const baseGroup = new THREE.Group(); baseGroup.name = 'Reaver_BaseHull'; baseGroup.rotation.z = 0.06; hull.add(baseGroup);
  addBox(mat.hull, 'Reaver_Fuselage', [15.0, 3.0, 4.6], [0, 0, 0]);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6.0, 6), mat.hull); nose.name = 'Reaver_Nose';
  nose.position.set(10.5, 0.5, 0); nose.rotation.z = -Math.PI / 2 + 0.06; hull.add(nose);

  // ---- mismatched repair panel (strong local damage + replacement, §8.5) ----
  // One quadrant of the hull is a visibly different-color replacement panel — reads as battle damage
  // repaired with whatever was available, not an institutional refit.
  addBox(mat.patch, 'Reaver_Repair_Panel', [5.0, 2.6, 1.8], [2.0, 0.4, 2.4]);

  // ---- broken symmetry: ONE oversized off-center cannon (weapons where cargo was, §8.5) ----
  // The cargo bay on the starboard side is gone — replaced by a bolted-on heavy gun pod. The port
  // side keeps a vestigial cargo door. This asymmetry-around-function is the core pirate read.
  const cannon = new THREE.Group(); cannon.name = 'Reaver_HeavyCannon';
  const barrel = addCylX(mat.gunmetal, 'Reaver_Cannon_Barrel', 0.6, 7.0, [13.0, 0.8, 2.6]);
  hull.remove(barrel); cannon.add(barrel); barrel.position.set(3.0, 0.8, 0);
  const mount = addBox(mat.graphite, 'Reaver_Cannon_Mount', [2.0, 1.4, 1.8], [9.0, 0.6, 2.6]);
  hull.remove(mount); cannon.add(mount); mount.position.set(-1.0, 0.6, 0);
  hull.add(cannon);
  // vestigial port cargo door (the other side wasn't weaponized)
  addBox(mat.patch, 'Reaver_CargoDoor_Port', [3.0, 2.0, 0.3], [1.0, 0.2, -2.4]);

  // ---- neglected/scorched radiator fins (neglected thermal surfaces, §8.5) ----
  for (const side of [-1, 1]) {
    const fin = addBox(mat.rust, `Reaver_Radiator_${side < 0 ? 'Port' : 'Starboard'}`, [4.0, 0.2, 2.4], [-3.0, 0.6, side * 3.6]);
    fin.rotation.x = side * 0.18; // bent — not groomed
  }

  // ---- overpaint tag + kill marks (canvas decal, §8.5) ----
  const tagTex = makeTagTexture();
  if (tagTex) {
    const tagMat = new THREE.MeshStandardMaterial({ map: tagTex, transparent: true, opacity: 0.9, roughness: 0.8 });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.5), tagMat);
    tag.name = 'Reaver_Decal_Tag'; tag.position.set(1.0, 1.4, 2.31); tag.userData.keepSeparate = true; hull.add(tag);
  }

  // ---- hot unstable drive: a single oversized crude nozzle (hot emission, §8.5) ----
  const driveGlow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 22), mat.driveGlow);
  driveGlow.name = 'Reaver_Drive_Glow'; driveGlow.position.set(-8.0, 0.3, 0); driveGlow.rotation.y = -Math.PI / 2; hull.add(driveGlow);
  const driveCore = addCylX(mat.driveCore, 'Reaver_Drive_Core', 1.0, 0.4, [-7.8, 0.3, 0]);
  driveCore.userData.damageRole = 'driveCore';
  driveGlow.userData.damageRole = 'plume';

  // ---- sockets ----
  const addSocket = (name, pos, role) => {
    const s = new THREE.Object3D(); s.name = name; s.position.set(pos[0], pos[1], pos[2]);
    s.userData.spacefaceSocket = true; s.userData.role = role; hull.add(s);
  };
  addSocket('SOCKET_Weapon_Front', [13.0, 0.8, 2.6], 'weapon'); // the off-center cannon muzzle
  addSocket('SOCKET_Engine_Main', [-8.0, 0.3, 0], 'engine', [-1, 0, 0]);
  addSocket('SOCKET_Trail_Main', [-8.3, 0.3, 0], 'vfx', [-1, 0, 0]);
  addSocket('SOCKET_Camera_Focus', [0, 0.4, 0], 'camera');

  const outer = new THREE.Group(); outer.name = 'Reaver_Pirate';
  outer.add(hull); outer.userData.hull = hull;
  outer.scale.setScalar(scale);

  outer.userData.assetId = 'SF_REACH_REAVER_PIRATE';
  outer.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [26, 5, 13],
    sockets: 4,
    drawCallTarget: '<= 16 before post-processing',
    factionGrammar: '§8.5 pirate — stolen hull, altered posture, broken symmetry, hot emission',
    version: 1,
  };
  attachLodState(outer);
  return outer;
}
