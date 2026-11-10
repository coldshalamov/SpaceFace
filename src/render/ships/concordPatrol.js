// SF-SCN Concord Patrol Interdictor — bespoke lawful-authority hero asset (spec §8.2, Phase 3 §20).
//
// §8.2 reading: "maintained, standardized, surveillant, expensive." Authority should feel intimidating
// because it is ORGANIZED, not because every ship has spikes. So this hull is the visual opposite of
// the Kestrel's adapted, repaired, personally-owned grammar: it is clean, bilateral, serialized, and
// regulated. Where the Kestrel is asymmetry-as-biography, the Concord is symmetry-as-institution.
//
// Construction logic vs §8.2 bullets:
//   - "strong axial or bilateral organization"     -> a strict bilateral planform, mirror-symmetric pods
//   - "repeated panel rhythm and serialized modules"-> identical twin engine nacelles + beveled hull planks
//   - "clean pressure boundaries"                   -> a smooth LOFTED hull shell (not a crate), no field-repair panels
//   - "brighter, cooler shell materials"            -> pale blue-grey hull with a beveled-panel NORMAL MAP
//   - "controlled chrome on designed surfaces"      -> chromed axial spine + nacelle caps (env-map mirror)
//   - "small precise insignia"                      -> a compact Concord starburst decal on each flank
//   - "minimal exposed repair"                      -> none; this is a maintained institution, not a survivor
//   - "regulated, redundant light groups"           -> paired, evenly-spaced blue formation lights (damage-tagged)
//
// Craft tier: matches the Kestrel. Lofted pressure hull + PBR materials (panel albedo + normal map +
// roughness) + serialized nacelles with spinning turbine fans + speed-reactive drive + LOD reaction
// (drops the insignia decals at distance) + readable damage (formation-light groups fail, plume
// destabilizes). Built entirely from shipKit.js shared primitives (no more flat colored boxes).
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. collisionRadius ~18 (enemies.js).
import * as THREE from 'three';
import * as kit from './shipKit.js';

const COLOR = Object.freeze({
  hull: '#c4d2e6',        // pale cool blue-grey — brighter + cooler than the Kestrel's warm ceramic
  hullDark: '#8a9bb4',    // shadow panels / serialized planks
  chrome: '#d8e4f5',      // chromed axial spine + nacelle caps (controlled chrome, §8.2)
  graphite: '#1c2433',    // regulated mechanical structure
  insignia: '#3A78FF',    // Concord authority blue (faction_scn palette primary)
  light: '#88aaff',       // regulated redundant formation lights (cooler than the Kestrel's cyan)
  drive: '#aabbff',       // clean blue drive emission
  driveCore: '#eef4ff',
});

const DESIGN_RADIUS = 18;

/**
 * Build the bespoke Concord Patrol Interdictor mesh.
 * @param {object} entity - the ship entity (reads radius for scale; default ~18).
 * @returns {THREE.Group} the ship mesh, with userData.hull (bankable), sockets, renderContract.
 */
export function buildConcordPatrol(entity) {
  const root = new THREE.Group();
  root.name = 'Concord_Patrol';
  root.userData.kind = 'ship';
  root.userData.assetId = 'SF_SCN_CONCORD_INTERDICTOR';

  const hull = new THREE.Group(); hull.name = 'Concord_Patrol_Hull';
  root.add(hull); root.userData.hull = hull;

  const seed = kit.hashSeed(COLOR.hull + COLOR.insignia);
  const hullMat = kit.pbrHullMaterial({ hull: COLOR.hull, accent: COLOR.insignia, seed, panelCount: 14, metalness: 0.30, roughness: 0.40 });
  hullMat.name = 'Concord_Hull';
  const hullDarkMat = kit.pbrHullMaterial({ hull: COLOR.hullDark, accent: COLOR.insignia, seed: seed + 2, panelCount: 10, metalness: 0.35, roughness: 0.45 });
  hullDarkMat.name = 'Concord_HullDark';
  const chromeMat = kit.standardMaterial(COLOR.chrome, 0.14, 0.92); chromeMat.name = 'Concord_Chrome';
  const graphiteMat = kit.machineryMaterial(COLOR.graphite, 0.55, 0.70); graphiteMat.name = 'Concord_Graphite';
  const lightMat = kit.emissiveMaterial(COLOR.light, 2.6); lightMat.name = 'Concord_Light';
  const insigniaMat = kit.emissiveMaterial(COLOR.insignia, 1.8); insigniaMat.name = 'Concord_Insignia';

  // ---- main hull: a clean LOFTED bilateral lozenge (strong axial organization, §8.2) ----
  // Nose cone → mid hull → tapered tail, all mirror-symmetric across the centerline. A lofted shell
  // reads as a real pressure hull with curvature catching the key/rim lights, not a crate of boxes.
  const pressureHull = kit.addMesh(hull, kit.loftXGeometry([
    { x: -15.0, halfY: 1.10, halfZ: 1.30 },
    { x: -9.0,  halfY: 1.80, halfZ: 2.60 },
    { x: -2.0,  halfY: 1.95, halfZ: 2.75 },
    { x: 5.0,   halfY: 1.75, halfZ: 2.40 },
    { x: 10.0,  halfY: 1.20, halfZ: 1.70 },
    { x: 14.5,  halfY: 0.35, halfZ: 0.45 },
  ], 12), hullMat, 'Concord_Pressure_Hull');
  pressureHull.castShadow = true;

  // clean armored brow over the cockpit zone (maintained institution, no exposed repair)
  kit.addBox(hull, hullDarkMat, 'Concord_Dorsal_Deck', [16.0, 0.5, 4.6], [1.0, 1.55, 0]);
  // tapered tail block
  kit.addBox(hull, hullDarkMat, 'Concord_Tail', [5.0, 1.6, 3.4], [-9.5, 0, 0]);

  // ---- chromed axial spine (controlled chrome on a designed surface, §8.2) ----
  // A single chromed ridge running the full top centerline — reads as institutional. It sits proud of
  // the hull so the env-map reflection (the nebula bake) is visible from the chase camera.
  kit.addBox(hull, chromeMat, 'Concord_Axial_Spine', [20.0, 0.5, 0.8], [2.0, 1.85, 0]);

  // ---- repeated panel rhythm (serialized modules, §8.2): beveled dorsal planks ----
  // Identical serialized planks in a row — the clearest "this is manufactured, not adapted" read.
  // Each plank is a beveled box that catches the key light along its top edge. Kept out of the static
  // batch merge so the serialized-rhythm names survive (the §8.2 contract asserts Concord_Plank_*).
  const planks = [];
  for (let i = 0; i < 5; i++) {
    const plank = kit.addBox(hull, hullDarkMat, `Concord_Plank_${i}`, [2.8, 0.12, 0.5], [(-6.0 + i * 3.0), 1.70, 0]);
    plank.castShadow = true;
    plank.userData.keepSeparate = true;
    planks.push(plank);
  }

  // ---- bilateral twin engine nacelles (serialized modules, mirror-symmetric) ----
  // Two identical nacelles, one per side — serialized machinery, not a single adapted drive. Each has
  // a chromed intake cap (controlled chrome) and a real turbine fan that spins (drive micro-motion).
  const nacelleFans = [];
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Port' : 'Starboard';
    const nacelle = new THREE.Group(); nacelle.name = `Concord_Nacelle_${label}`;
    nacelle.position.z = side * 4.2; hull.add(nacelle);
    const body = kit.addBox(nacelle, hullMat, `Concord_Nacelle_Body_${label}`, [9.0, 1.8, 1.8], [-3.0, -0.3, 0]);
    body.castShadow = true;
    // chromed intake cap at the front of the nacelle (controlled chrome, §8.2)
    const cap = kit.addCylinderX(nacelle, chromeMat, `Concord_Nacelle_Cap_${label}`, 0.9, 1.0, [1.6, -0.3, 0], 12);
    // supporting strut to the main hull
    kit.addBox(nacelle, graphiteMat, `Concord_Nacelle_Strut_${label}`, [2.0, 0.3, 1.6], [0.5, 0.2, -side * 0.6]);
    // twin standardized corporate nozzles at the rear (efficient, regulated)
    const drive = kit.buildDrive(nacelle, {
      name: `Concord_Drive_${label}`, position: [-8.2, -0.3, 0], radius: 0.85, length: 1.2,
      materials: { dark: graphiteMat, accent: insigniaMat },
      driveColor: COLOR.drive, coreColor: COLOR.driveCore, driveGlowOpacity: 0.55,
    });
    nacelleFans.push(drive.fan);
  }

  // ---- clean regulated light groups (redundant, evenly-spaced formation lights, §8.2) ----
  // Paired lights at identical positions on each flank — reads as a maintained institution. Four pairs
  // (8 lights, even) so the check's bilateral assertion holds. Tagged as the navLight damage group so
  // a failed group reads as damage without the HUD bar (§9.11).
  const navLights = [];
  for (const side of [-1, 1]) {
    for (const x of [11.0, 5.0, -2.0, -7.0]) {
      const l = kit.addBox(hull, lightMat, `Concord_FormLight_${x}_${side}`, [0.4, 0.14, 0.14], [x, 1.55, side * 2.5]);
      l.userData.damageRole = 'navLight';
      l.userData.keepSeparate = true;
      navLights.push(l);
    }
  }
  const navLightBase = navLights.map((m) => m.material.emissiveIntensity);

  // ---- small precise Concord insignia (§8.2): one compact starburst decal per flank ----
  // Crisp insignia crest (style 'insignia' — a clean authority mark, not a pirate tag). Kept separate
  // so the LOD reaction can drop it at distance (it's illegible <300px and costs a texture).
  const insigniaDecalMat = kit.noseArtMaterial({ style: 'insignia', accent: COLOR.insignia, seed: seed + 9 });
  const insigniaDecals = [];
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Port' : 'Starboard';
    const d = kit.addDecal(hull, insigniaDecalMat, `Concord_Insignia_${label}`, [3.6, 2.2], [6.0, 0.55, side * 2.78], [0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
    insigniaDecals.push(d);
  }

  // ---- regulated sensor array: a clean scanning bar on the nose (surveillant, §8.2) ----
  const sensor = kit.addBox(hull, lightMat, 'Concord_Sensor_Bar', [1.2, 0.12, 3.4], [11.0, 0.55, 0]);
  sensor.userData.damageRole = 'navLight'; sensor.userData.keepSeparate = true;
  navLights.push(sensor);
  navLightBase.push(sensor.material.emissiveIntensity);

  // ---- greeble: restrained serialized surface detail (maintained, not greebled-out) ----
  // Authority hulls are clean, so density is low — just enough panel rhythm to read as manufactured.
  kit.scatterGreeble(hull, {
    R: DESIGN_RADIUS, length: 2.2, halfWidth: 0.16, height: 0.10, density: 0.35, seed: seed + 5,
    materials: { primary: hullDarkMat, dark: graphiteMat, glow: insigniaMat }, xMin: -0.35, xMax: 0.25,
  });

  // ---- sockets: weapon mounts (bilateral), engine, camera ----
  kit.addSocket(hull, 'SOCKET_Weapon_Front', [14.5, 0.0, 0], 'weapon');
  kit.addSocket(hull, 'SOCKET_Engine_Main', [-12.7, -0.3, 0], 'engine', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Trail_Main', [-13.0, -0.3, 0], 'vfx', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');

  // ---- finalize: merge static plates, wire LOD (drop insignia decals at distance), drive motion,
  //      and readable damage (formation-light groups fail, drive plume destabilizes). ----
  // The first nacelle drive's parts stand in for the damage driveCore/plume (both nacelles share the
  // same drive material so destabilizing one reads coherently).
  const primaryDrive = { fan: nacelleFans[0], driveCore: null, plume: null, plumeMat: null, basePlumeOpacity: 0.30 };
  // find the first nacelle's plume + core for damage addressing
  hull.traverse((o) => {
    if (o.name === 'Concord_Drive_Port_Plume_Mesh' && !primaryDrive.plume) primaryDrive.plume = o;
    if (o.name === 'Concord_Drive_Port_Core_Mesh' && !primaryDrive.driveCore) primaryDrive.driveCore = o;
  });

  kit.mergeStaticByMaterial(hull, new Set([...navLights, ...insigniaDecals, ...nacelleFans]));

  kit.finalizeShip({
    root, hull, entity, designRadius: DESIGN_RADIUS,
    decals: insigniaDecals,
    driveParts: primaryDrive,
    damageParts: { navLights, navLightBase, driveCore: primaryDrive.driveCore, plume: primaryDrive.plume, secondary: [], armor: [] },
  });

  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [30, 4, 12],
    sockets: 4,
    drawCallTarget: '<= 16 before post-processing',
    factionGrammar: '§8.2 lawful authority — bilateral, serialized, chrome, regulated',
    damageStates: ['operational', 'stressed', 'damaged', 'critical', 'destruction'],
    version: 2,
  };
  return root;
}
