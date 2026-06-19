// SF-SCN Concord Patrol Interdictor — bespoke lawful-authority hero asset (spec §8.2, Phase 3 §20).
//
// §8.2 reading: "maintained, standardized, surveillant, expensive." Authority should feel intimidating
// because it is ORGANIZED, not because every ship has spikes. So this hull is the visual opposite of
// the Kestrel's adapted, repaired, personally-owned grammar: it is clean, bilateral, serialized, and
// regulated. Where the Kestrel is asymmetry-as-biography, the Concord is symmetry-as-institution.
//
// Construction logic vs §8.2 bullets:
//   - "strong axial or bilateral organization"     -> a strict bilateral planform, mirror-symmetric pods
//   - "repeated panel rhythm and serialized modules"-> identical twin engine nacelles + repeated hull plating
//   - "clean pressure boundaries"                   -> smooth unblemished hull shells, no field-repair panels
//   - "brighter, cooler shell materials"            -> pale blue-grey hull (high-value, low-warmth)
//   - "controlled chrome on designed surfaces"      -> chromed axial spine + nacelle caps (high metalness)
//   - "small precise insignia"                      -> a compact Concord starburst on each flank
//   - "minimal exposed repair"                      -> none; this is a maintained institution, not a survivor
//   - "regulated, redundant light groups"           -> paired, evenly-spaced blue formation lights
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. Designed to read at the same gameplay
// camera scale as the Kestrel (collisionRadius ~18 from enemies.js).
import * as THREE from 'three';
import { attachLodState } from '../lod.js';

const TAU = Math.PI * 2;

const COLOR = Object.freeze({
  hull: '#c4d2e6',        // pale cool blue-grey — brighter + cooler than the Kestrel's warm ceramic
  hullDark: '#8a9bb4',    // shadow panels
  chrome: '#d8e4f5',      // chromed axial spine + nacelle caps (controlled chrome, §8.2)
  graphite: '#1c2433',    // regulated mechanical structure
  insignia: '#3A78FF',    // Concord authority blue (faction_scn palette primary)
  light: '#88aaff',       // regulated redundant formation lights (cooler than the Kestrel's cyan)
  drive: '#aabbff',       // clean blue drive emission
  driveCore: '#eef4ff',
});

function stdMat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
}
// proper emissive (MeshStandardMaterial with emissive) so it lights under PBR
function lightMat(color, intensity = 2.4) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color('#000000'), emissive: new THREE.Color(color), emissiveIntensity: intensity });
}
function driveGlowMat(color, opacity = 0.6) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

// A serialized hull plank: the repeated panel rhythm (§8.2). Used in a row to read as manufactured.
function addPlank(parent, mat, name, len, z) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.5), mat);
  g.name = name; g.position.set(0, 0.95, z); parent.add(g); return g;
}

// Small precise Concord starburst insignia (§8.2) — a compact 8-point marker on each flank.
function addInsignia(parent, name, x, z, side) {
  const grp = new THREE.Group(); grp.name = name;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.30, 16), lightMat(COLOR.insignia, 1.6));
  ring.position.set(x, 0.7, z * side); ring.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
  grp.add(ring); parent.add(grp);
}

/**
 * Build the bespoke Concord Patrol Interdictor mesh.
 * @param {object} entity - the ship entity (reads radius for scale; default ~18).
 * @returns {THREE.Group} the ship mesh, with userData.hull (bankable), sockets, renderContract.
 */
export function buildConcordPatrol(entity) {
  const DESIGN_RADIUS = 18;
  const radius = (entity && Number.isFinite(entity.radius)) ? entity.radius : DESIGN_RADIUS;
  const scale = radius / DESIGN_RADIUS;

  const mat = {
    hull: stdMat(COLOR.hull, 0.32, 0.35),       // clean coated shell — brighter/cooler, §8.2
    hullDark: stdMat(COLOR.hullDark, 0.40, 0.45),
    chrome: stdMat(COLOR.chrome, 0.14, 0.92),   // controlled chrome on the designed axial spine, §8.2
    graphite: stdMat(COLOR.graphite, 0.55, 0.70),
    insigniaMark: lightMat(COLOR.insignia, 1.8),
    light: lightMat(COLOR.light, 2.6),          // regulated redundant formation lights, §8.2
    drive: lightMat(COLOR.drive, 3.2),
    driveCore: lightMat(COLOR.driveCore, 4.6),
    driveGlow: driveGlowMat(COLOR.drive, 0.58),
  };
  for (const [n, m] of Object.entries(mat)) m.name = `Concord_${n}`;

  const hull = new THREE.Group(); hull.name = 'Concord_Patrol_Hull';
  const addBox = (m, name, [sx, sy, sz], [x, y, z], rot) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); g.name = name;
    g.position.set(x, y, z); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); hull.add(g); return g;
  };
  const addCylX = (m, name, rTop, rBot, h, [x, y, z], seg = 12) => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m); g.name = name;
    g.position.set(x, y, z); g.rotation.z = Math.PI / 2; hull.add(g); return g;
  };

  // ---- main hull: a clean bilateral lozenge (strong axial organization, §8.2) ----
  // Nose cone -> mid hull -> tapered tail, all mirror-symmetric across the centerline.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7.0, 6), mat.hull); nose.name = 'Concord_Nose';
  nose.position.set(13.5, 0, 0); nose.rotation.z = -Math.PI / 2; hull.add(nose);
  addBox(mat.hull, 'Concord_Fuselage', [16.0, 3.2, 5.2], [3.0, 0, 0]);
  addBox(mat.hullDark, 'Concord_Tail', [6.0, 2.6, 4.0], [-9.0, 0, 0]);

  // ---- chromed axial spine (controlled chrome on a designed surface, §8.2) ----
  addBox(mat.chrome, 'Concord_Axial_Spine', [20.0, 0.5, 0.8], [2.0, 1.55, 0]);
  // The spine runs the full top centerline — a single chromed ridge that reads as institutional.

  // ---- repeated panel rhythm (serialized modules, §8.2): identical dorsal planks ----
  for (let i = 0; i < 5; i++) addPlank(hull, mat.hullDark, `Concord_Plank_${i}`, 3.0, 0);

  // ---- bilateral twin engine nacelles (serialized modules, mirror-symmetric) ----
  // Two identical nacelles, one per side — the clearest "this is manufactured, not adapted" read.
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Port' : 'Starboard';
    const n = new THREE.Group(); n.name = `Concord_Nacelle_${label}`;
    n.position.z = side * 4.2; hull.add(n);
    const body = new THREE.Mesh(new THREE.BoxGeometry(9.0, 1.8, 1.8), mat.hull);
    body.name = `Concord_Nacelle_Body_${label}`; body.position.set(-3.0, -0.3, 0); n.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 12), mat.chrome);
    cap.name = `Concord_Nacelle_Cap_${label}`; cap.position.set(-8.0, -0.3, 0); cap.rotation.z = Math.PI / 2; n.add(cap);
  }

  // ---- clean regulated light groups (redundant, evenly-spaced formation lights, §8.2) ----
  // Paired lights at identical positions on each flank — reads as a maintained institution, not a
  // single survivor's navigation cue. Four pairs along the hull.
  for (const side of [-1, 1]) {
    for (const x of [11.0, 5.0, -2.0, -7.0]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.14), mat.light);
      l.name = `Concord_FormLight_${x}_${side}`; l.position.set(x, 1.45, side * 2.5); hull.add(l);
    }
  }

  // ---- small precise Concord insignia (§8.2): one compact starburst per flank ----
  addInsignia(hull, 'Concord_Insignia_Port', 6.0, 2.7, -1);
  addInsignia(hull, 'Concord_Insignia_Starboard', 6.0, 2.7, 1);

  // ---- twin drive cores (one per nacelle) + drive glow ----
  for (const side of [-1, 1]) {
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20), mat.driveGlow);
    core.name = `Concord_Drive_Glow_${side}`; core.position.set(-8.7, -0.3, side * 4.2);
    core.rotation.y = -Math.PI / 2; hull.add(core);
    const disc = addCylX(mat.driveCore, `Concord_Drive_Core_${side}`, 0.5, 0.5, 0.3, [-8.55, -0.3, side * 4.2], 14);
    disc.userData.damageRole = side < 0 ? 'driveCore' : 'driveCore';
  }

  // ---- regulated sensor array: a single clean scanning bar on the nose (surveillant, §8.2) ----
  const sensor = addBox(mat.light, 'Concord_Sensor_Bar', [1.2, 0.12, 3.4], [11.0, 0.6, 0]);

  // ---- sockets: weapon mounts (bilateral), engine, camera (matches the Kestrel's socket contract) ----
  const addSocket = (name, pos, role) => {
    const s = new THREE.Object3D(); s.name = name; s.position.set(pos[0], pos[1], pos[2]);
    s.userData.spacefaceSocket = true; s.userData.role = role; hull.add(s);
  };
  // Bilateral weapon hardpoints — a patrol interdictor presents paired guns, not a single offset one.
  addSocket('SOCKET_Weapon_Front', [13.5, 0.0, 0], 'weapon');
  addSocket('SOCKET_Engine_Main', [-8.7, -0.3, 0], 'engine', [-1, 0, 0]);
  addSocket('SOCKET_Trail_Main', [-9.0, -0.3, 0], 'vfx', [-1, 0, 0]);
  addSocket('SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');

  // ---- assemble: bankable hull inside an outer group (matches Kestrel's two-layer structure) ----
  const outer = new THREE.Group(); outer.name = 'Concord_Patrol';
  outer.add(hull); outer.userData.hull = hull;
  outer.scale.setScalar(scale);

  outer.userData.assetId = 'SF_SCN_CONCORD_INTERDICTOR';
  outer.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [30, 4, 12],
    sockets: 4,
    drawCallTarget: '<= 16 before post-processing',
    factionGrammar: '§8.2 lawful authority — bilateral, serialized, chrome, regulated',
    version: 1,
  };
  attachLodState(outer);
  return outer;
}
