// SF-QUIET The Quiet Smuggler — bespoke faction ship (spec §8.6, Phase 3 §20).
//
// §8.6 reading: "deniable, low-signature, modified." The Quiet are smugglers — ships read as stealthy,
// baffled, compartmented. Masked/baffled emitters, low-reflectance surfaces with subtle repair
// variation, hidden compartments visible through construction (not magic), narrow light apertures,
// restrained identifiers, asymmetry around sensors and cargo access. Not flashy (pirate) nor branded
// (corporate): this ship wants NOT to be seen.
//
// Host: the corsair_raider (a covert raider hull).
import * as THREE from 'three';
import { attachLodState } from '../lod.js';

const COLOR = Object.freeze({
  hull: '#3a3550',          // dark low-reflectance violet-grey (absorbs light, low signature)
  hullDark: '#28243a',
  baffle: '#1a1828',        // emitter baffles (masked, §8.6)
  graphite: '#100e18',
  panel: '#4a4360',         // subtle repair variation (close to hull, not contrasting)
  slit: '#7a5fb0',          // narrow light aperture (restrained, The Quiet's faction violet)
  drive: '#5544aa',         // baffled low-signature drive (dim, not hot)
  driveCore: '#8877cc',
});

function stdMat(c, r, m) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: r, metalness: m }); }
function lightMat(c, i = 1.6) { return new THREE.MeshStandardMaterial({ color: new THREE.Color('#000'), emissive: new THREE.Color(c), emissiveIntensity: i }); }
function glowMat(c, o = 0.35) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }

export function buildQuietRaider(entity) {
  const DESIGN_RADIUS = 16;
  const radius = (entity && Number.isFinite(entity.radius)) ? entity.radius : DESIGN_RADIUS;
  const scale = radius / DESIGN_RADIUS;

  const mat = {
    hull: stdMat(COLOR.hull, 0.92, 0.08),       // very low metalness + high roughness = low reflectance (§8.6)
    hullDark: stdMat(COLOR.hullDark, 0.94, 0.1),
    baffle: stdMat(COLOR.baffle, 0.96, 0.05),
    graphite: stdMat(COLOR.graphite, 0.7, 0.6),
    panel: stdMat(COLOR.panel, 0.9, 0.1),       // subtle repair panel (close to hull color)
    slit: lightMat(COLOR.slit, 1.4),            // dim narrow aperture (restrained, §8.6)
    drive: lightMat(COLOR.drive, 1.8),          // dim baffled drive (low-signature)
    driveCore: lightMat(COLOR.driveCore, 2.4),
    driveGlow: glowMat(COLOR.drive, 0.32),      // very low opacity — masked emission
  };
  for (const [n, m] of Object.entries(mat)) m.name = `Quiet_${n}`;

  const hull = new THREE.Group(); hull.name = 'Quiet_Raider_Hull';
  const addBox = (m, name, [sx, sy, sz], [x, y, z]) => { const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); g.name = name; g.position.set(x, y, z); hull.add(g); return g; };
  const addCylX = (m, name, r, h, [x, y, z]) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); g.name = name; g.position.set(x, y, z); g.rotation.z = Math.PI / 2; hull.add(g); return g; };

  // ---- low-slung dark hull: a flat, blade-like planform (minimizes cross-section = low signature) ----
  addBox(mat.hull, 'Quiet_Fuselage', [18.0, 2.2, 4.5], [0, 0, 0]);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.8, 6.0, 6), mat.hull); nose.name = 'Quiet_Nose';
  nose.position.set(12.0, 0, 0); nose.rotation.z = -Math.PI / 2; hull.add(nose);
  addBox(mat.hullDark, 'Quiet_Tail', [4.0, 1.8, 3.8], [-10.0, 0, 0]);

  // ---- subtle repair panel (close to hull color — variation, not contrast, §8.6) ----
  addBox(mat.panel, 'Quiet_Repair_Panel', [5.0, 1.8, 0.2], [1.0, 0.9, 2.2]);

  // ---- hidden compartment: a visible seam/hatch line that implies a concealed bay ----
  // (§8.6: "hidden compartments visible through construction, not magic"). A ventral seam panel.
  addBox(mat.graphite, 'Quiet_Hidden_Compartment_Seam', [8.0, 0.1, 2.5], [-1.0, -1.1, 0]);

  // ---- masked/baffled emitters (§8.6): recessed, dark-shrouded sensor + drive housings ----
  // The sensor cluster is shrouded in a baffle collar so its emission is directional, not broadcast.
  addBox(mat.baffle, 'Quiet_Sensor_Baffle', [2.0, 1.4, 2.0], [9.0, 0.4, 0]);
  addBox(mat.graphite, 'Quiet_Sensor_Core', [0.8, 0.6, 0.6], [10.0, 0.4, 0]);

  // ---- narrow light apertures (§8.6): thin slits, not flood lamps — restrained identifiers ----
  for (const x of [6.0, -2.0]) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), mat.slit);
    slit.name = `Quiet_Slit_${x}`; slit.position.set(x, 0.9, 2.18); hull.add(slit);
    const slit2 = slit.clone(); slit2.position.z = -2.18; slit2.name = `Quiet_Slit_${x}_2`; hull.add(slit2);
  }

  // ---- asymmetry around sensors/cargo (§8.6): one offset cargo hatch on the port quarter ----
  addBox(mat.graphite, 'Quiet_Cargo_Hatch_Port', [3.0, 0.15, 1.8], [-4.0, 0.6, -2.0]);

  // ---- baffled low-signature drive: dim, shrouded, low-opacity glow (masked emission, §8.6) ----
  const driveGlow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), mat.driveGlow);
  driveGlow.name = 'Quiet_Drive_Glow'; driveGlow.position.set(-12.2, 0, 0); driveGlow.rotation.y = -Math.PI / 2; hull.add(driveGlow);
  // baffle collar around the nozzle (masks the drive signature off-axis)
  addCylX(mat.baffle, 'Quiet_Drive_Baffle', 1.8, 1.2, [-11.5, 0, 0]);
  addCylX(mat.driveCore, 'Quiet_Drive_Core', 0.7, 0.3, [-12.0, 0, 0]);

  // ---- sockets ----
  const addSocket = (name, pos, role) => { const s = new THREE.Object3D(); s.name = name; s.position.set(pos[0], pos[1], pos[2]); s.userData.spacefaceSocket = true; s.userData.role = role; hull.add(s); };
  addSocket('SOCKET_Weapon_Front', [12.0, 0.3, 0], 'weapon');
  addSocket('SOCKET_Engine_Main', [-12.2, 0, 0], 'engine', [-1, 0, 0]);
  addSocket('SOCKET_Trail_Main', [-12.5, 0, 0], 'vfx', [-1, 0, 0]);
  addSocket('SOCKET_Cargo_Ventral', [-4.0, -1.1, 0], 'cargo', [0, -1, 0]);
  addSocket('SOCKET_Camera_Focus', [0, 0.4, 0], 'camera');

  const outer = new THREE.Group(); outer.name = 'Quiet_Raider';
  outer.add(hull); outer.userData.hull = hull; outer.scale.setScalar(scale);
  outer.userData.assetId = 'SF_QUIET_RAIDER';
  outer.userData.renderContract = { coordinateSystem: '+X forward, +Y up, +Z starboard', authoredMetres: true, nominalDimensions: [30, 4, 10], sockets: 5, drawCallTarget: '<= 16 before post-processing', factionGrammar: '§8.6 smuggler — low-signature, baffled, hidden compartments, restrained', version: 1 };
  attachLodState(outer);
  return outer;
}
