// SF-DMC Drift Miners Barge — bespoke faction ship (spec §8.4, Phase 3 §20).
//
// §8.4 reading: "honest load, repair, and abrasion." Drift Miners are blue-collar industrial — ships
// read as working machinery: broad load paths, external braces/scoops/clamps/service platforms, safety
// color near moving/hot systems, dust/abrasion stronger than combat scarring, replaceable tools with
// unmistakable mount geometry, work lights rather than decorative glow. Not clean (corporate) nor
// predatory (pirate): this is a WORK VEHICLE that earns its keep.
//
// Host: the bruiser_brawler (a mining-barge-derived heavy combatant).
import * as THREE from 'three';
import { attachLodState } from '../lod.js';

const COLOR = Object.freeze({
  hull: '#a08050',          // dusty industrial ochre — abraded working paint
  hullDark: '#705038',
  safety: '#ffaa22',        // safety color near moving/hot systems (§8.4)
  rust: '#8a5028',          // abrasion/dust stronger than combat scarring
  graphite: '#1f1810',
  ore: '#5a4030',           // raw ore staining (mining residue)
  drive: '#ff8844',         // work-drive (warm industrial)
  driveCore: '#ffcc88',
  workLight: '#fff0a0',     // work lights, not decorative glow (§8.4)
});

function stdMat(c, r, m) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: r, metalness: m }); }
function lightMat(c, i = 2.4) { return new THREE.MeshStandardMaterial({ color: new THREE.Color('#000'), emissive: new THREE.Color(c), emissiveIntensity: i }); }
function glowMat(c, o = 0.6) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }

export function buildDriftBarge(entity) {
  const DESIGN_RADIUS = 19;
  const radius = (entity && Number.isFinite(entity.radius)) ? entity.radius : DESIGN_RADIUS;
  const scale = radius / DESIGN_RADIUS;

  const mat = {
    hull: stdMat(COLOR.hull, 0.85, 0.25),       // dusty, rough — abraded working paint
    hullDark: stdMat(COLOR.hullDark, 0.88, 0.3),
    safety: stdMat(COLOR.safety, 0.5, 0.2),     // safety color (functional, not decorative)
    rust: stdMat(COLOR.rust, 0.95, 0.05),       // heavy abrasion (stronger than combat scarring, §8.4)
    graphite: stdMat(COLOR.graphite, 0.65, 0.72),
    ore: stdMat(COLOR.ore, 0.98, 0.02),         // ore staining (mining residue)
    drive: lightMat(COLOR.drive, 2.8),
    driveCore: lightMat(COLOR.driveCore, 3.8),
    driveGlow: glowMat(COLOR.drive, 0.6),
    workLight: lightMat(COLOR.workLight, 2.2),
  };
  for (const [n, m] of Object.entries(mat)) m.name = `Drift_${n}`;

  const hull = new THREE.Group(); hull.name = 'Drift_Barge_Hull';
  const addBox = (m, name, [sx, sy, sz], [x, y, z], rot) => { const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); g.name = name; g.position.set(x, y, z); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); hull.add(g); return g; };
  const addCylX = (m, name, r, h, [x, y, z]) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); g.name = name; g.position.set(x, y, z); g.rotation.z = Math.PI / 2; hull.add(g); return g; };

  // ---- broad load-path hull: a wide, squat industrial barge (honest load, §8.4) ----
  addBox(mat.hull, 'Drift_Fuselage', [18.0, 4.5, 8.0], [0, 0, 0]);
  addBox(mat.hullDark, 'Drift_Bow_Dozer', [5.0, 3.0, 7.0], [11.0, -0.5, 0]); // a dozer/plow bow for clearing rock

  // ---- external braces + clamps (load-bearing external structure, §8.4) ----
  for (const side of [-1, 1]) {
    addBox(mat.graphite, `Drift_Brace_${side < 0 ? 'Port' : 'Starboard'}`, [10.0, 0.6, 0.8], [0, 2.2, side * 4.0]);
    addBox(mat.safety, `Drift_Clamp_${side < 0 ? 'Port' : 'Starboard'}`, [1.5, 1.2, 1.5], [4.0, 2.6, side * 3.8]); // safety-colored tool clamp
  }

  // ---- ore-stained dorsal deck (mining residue, abrasion, §8.4) ----
  addBox(mat.ore, 'Drift_Ore_Deck', [12.0, 0.4, 6.0], [-2.0, 2.05, 0]);
  addBox(mat.rust, 'Drift_Abrasion_Band', [2.0, 4.4, 7.8], [2.0, 0, 0]); // abrasion band across the hull

  // ---- replaceable mining tool: a big scoop/crusher with unmistakable mount geometry (§8.4) ----
  const scoop = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 4.0, 8), mat.graphite);
  scoop.name = 'Drift_Mining_Scoop'; scoop.position.set(12.5, 1.0, 0); scoop.rotation.z = Math.PI / 2; hull.add(scoop);
  // safety-color hazard stripes on the moving crusher (§8.4: safety color near moving systems)
  addBox(mat.safety, 'Drift_Scoop_Hazard', [0.4, 4.4, 4.4], [12.5, 1.0, 0]);

  // ---- work lights (not decorative glow, §8.4): bright flood lamps over the work deck ----
  for (const x of [6.0, -2.0, -8.0]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat.workLight);
    l.name = `Drift_WorkLight_${x}`; l.position.set(x, 2.6, 2.5); hull.add(l);
    const l2 = l.clone(); l2.position.z = -2.5; l2.name = `Drift_WorkLight_${x}_2`; hull.add(l2);
  }

  // ---- heavy industrial drive: a single big crude nozzle (work-drive) ----
  const driveGlow = new THREE.Mesh(new THREE.CircleGeometry(2.8, 22), mat.driveGlow);
  driveGlow.name = 'Drift_Drive_Glow'; driveGlow.position.set(-15.5, 0, 0); driveGlow.rotation.y = -Math.PI / 2; hull.add(driveGlow);
  addCylX(mat.driveCore, 'Drift_Drive_Core', 1.4, 0.5, [-15.3, 0, 0]);

  // ---- sockets ----
  const addSocket = (name, pos, role) => { const s = new THREE.Object3D(); s.name = name; s.position.set(pos[0], pos[1], pos[2]); s.userData.spacefaceSocket = true; s.userData.role = role; hull.add(s); };
  addSocket('SOCKET_Weapon_Front', [14.5, 1.0, 0], 'weapon');
  addSocket('SOCKET_Mining_Front', [14.5, 1.0, 0], 'mining'); // the scoop doubles as mining emitter
  addSocket('SOCKET_Engine_Main', [-15.5, 0, 0], 'engine', [-1, 0, 0]);
  addSocket('SOCKET_Trail_Main', [-15.8, 0, 0], 'vfx', [-1, 0, 0]);
  addSocket('SOCKET_Cargo_Ventral', [-2.0, -2.2, 0], 'cargo', [0, -1, 0]);
  addSocket('SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');

  const outer = new THREE.Group(); outer.name = 'Drift_Barge';
  outer.add(hull); outer.userData.hull = hull; outer.scale.setScalar(scale);
  outer.userData.assetId = 'SF_DMC_DRIFT_BARGE';
  outer.userData.renderContract = { coordinateSystem: '+X forward, +Y up, +Z starboard', authoredMetres: true, nominalDimensions: [34, 6, 17], sockets: 6, drawCallTarget: '<= 18 before post-processing', factionGrammar: '§8.4 blue-collar industrial — honest load, braces, abrasion, work lights', version: 1 };
  attachLodState(outer);
  return outer;
}
