// SF-REACH Reaver Pirate — bespoke pirate-conversion hero asset (spec §8.5, Phase 3 §20).
//
// §8.5 reading: "predatory reuse." A pirate ship is a STOLEN base hull with altered posture — not a
// designed warship. So this is the visual opposite of the Concord's institutional symmetry: it is
// asymmetric, weapon-studded, tagged, and neglected. The important question (§8.5) is what they
// MAINTAIN because they need it to survive — so the guns and drive are functional, while cargo/service
// surfaces are cannibalized.
//
// Construction logic vs §8.5 bullets:
//   - "stolen base hull with altered posture"        -> a LOFTED civilian drifter hull pitched nose-up + banked
//   - "weapons mounted where cargo/service was"      -> a bolted-on Reaver_HeavyCannon replacing the cargo bay
//   - "strong local damage and replacement"          -> a Reaver_Repair_Panel (mismatched-color quadrant)
//   - "broken symmetry around function"              -> one oversized off-center cannon, one vestigial cargo door
//   - "overpaint, tags, and kill marks"              -> a crimson Reaver_Decal_Tag (punk spray + kill tallies)
//   - "neglected thermal and access surfaces"        -> scorched, bent Reaver_Radiator_* fins (exactly 2)
//   - "hot, unstable emission"                       -> oversaturated red-orange flickering drive
//
// Craft tier: matches the Kestrel. Lofted stolen-civilian hull + PBR hull material (panel albedo +
// normal map + roughness, extra grime) + bolted cannon + speed-reactive flickering drive + LOD
// reaction (drops the tag decal at distance) + readable damage (nav strobe fails, plume destabilizes,
// the vestigial cargo door sheds at critical). Built from shipKit.js shared primitives.
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. collisionRadius ~16-18 (enemies.js).
import * as THREE from 'three';
import * as kit from './shipKit.js';

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

const DESIGN_RADIUS = 16;

/**
 * Build the bespoke Reaver Pirate mesh (a converted stolen civilian hull, §8.5).
 * @param {object} entity - the ship entity (reads radius for scale; default ~16).
 * @returns {THREE.Group} the ship mesh, with userData.hull (bankable), sockets, renderContract.
 */
export function buildReaverPirate(entity) {
  const root = new THREE.Group();
  root.name = 'Reaver_Pirate';
  root.userData.kind = 'ship';
  root.userData.assetId = 'SF_REACH_REAVER_PIRATE';

  const hull = new THREE.Group(); hull.name = 'Reaver_Pirate_Hull';
  root.add(hull); root.userData.hull = hull;

  const seed = kit.hashSeed(COLOR.hull + COLOR.tag);
  const hullMat = kit.pbrHullMaterial({ hull: COLOR.hull, accent: COLOR.tag, seed, panelCount: 10, metalness: 0.18, roughness: 0.78 });
  hullMat.name = 'Reaver_Hull';
  const patchMat = kit.pbrHullMaterial({ hull: COLOR.patch, accent: COLOR.tag, seed: seed + 2, panelCount: 6, metalness: 0.14, roughness: 0.82 });
  patchMat.name = 'Reaver_Patch';
  const rustMat = kit.standardMaterial(COLOR.rust, 0.92, 0.06); rustMat.name = 'Reaver_Rust';
  const graphiteMat = kit.machineryMaterial(COLOR.graphite, 0.6, 0.66); graphiteMat.name = 'Reaver_Graphite';
  const gunmetalMat = kit.machineryMaterial(COLOR.gunmetal, 0.5, 0.72); gunmetalMat.name = 'Reaver_Gunmetal';
  const tagGlowMat = kit.emissiveMaterial(COLOR.tag, 1.6); tagGlowMat.name = 'Reaver_TagGlow';

  // ---- stolen civilian drifter hull: a LOFTED multirole fuselage, PITCHED (altered posture, §8.5) ----
  // The base hull is symmetric, but we tilt the whole assembly nose-up + a slight roll to read as
  // "repurposed." A lofted shell reads as a real stolen civilian hull, not a crate of boxes.
  const baseGroup = new THREE.Group(); baseGroup.name = 'Reaver_BaseHull'; baseGroup.rotation.z = 0.06; hull.add(baseGroup);
  const pressureHull = kit.addMesh(baseGroup, kit.loftXGeometry([
    { x: -8.5,  halfY: 0.9,  halfZ: 1.8 },
    { x: -3.0,  halfY: 1.5,  halfZ: 2.3 },
    { x: 3.0,   halfY: 1.55, halfZ: 2.4 },
    { x: 8.0,   halfY: 1.2,  halfZ: 1.9 },
    { x: 12.5,  halfY: 0.3,  halfZ: 0.4 },
  ], 10), hullMat, 'Reaver_Pressure_Hull');
  pressureHull.castShadow = true;

  // ---- mismatched repair panel (strong local damage + replacement, §8.5) ----
  // One quadrant of the hull is a visibly different-color replacement panel — reads as battle damage
  // repaired with whatever was available. Kept separate so its name survives the merge.
  const repairPanel = kit.addBox(baseGroup, patchMat, 'Reaver_Repair_Panel', [5.0, 2.6, 0.2], [2.0, 0.4, 2.4]);
  repairPanel.castShadow = true;
  repairPanel.userData.keepSeparate = true;

  // ---- broken symmetry: ONE oversized off-center cannon (weapons where cargo was, §8.5) ----
  // The cargo bay on the starboard side is gone — replaced by a bolted-on heavy gun pod. The port
  // side keeps a vestigial cargo door. This asymmetry-around-function is the core pirate read.
  const cannon = new THREE.Group(); cannon.name = 'Reaver_HeavyCannon';
  cannon.userData.keepSeparate = true; // group survives the merge (checked by name)
  const barrel = kit.addCylinderX(cannon, gunmetalMat, 'Reaver_Cannon_Barrel', 0.6, 7.0, [3.0, 0.8, 0], 12);
  barrel.castShadow = true;
  kit.addBox(cannon, graphiteMat, 'Reaver_Cannon_Mount', [2.0, 1.4, 1.8], [-1.0, 0.6, 0]);
  // muzzle brake + cooling rings on the cannon (reads as a real heavy gun)
  kit.addTorusX(cannon, gunmetalMat, 'Reaver_Cannon_Muzzle', 0.62, 0.08, [6.2, 0.8, 0], 8, 12);
  kit.addTorusX(cannon, gunmetalMat, 'Reaver_Cannon_Ring1', 0.66, 0.05, [4.2, 0.8, 0], 8, 10);
  hull.add(cannon);
  cannon.position.set(0, 0, 2.6); // off-center on the starboard quarter

  // vestigial port cargo door (the other side wasn't weaponized) — a named secondary part shed at critical
  const cargoDoor = kit.addBox(baseGroup, patchMat, 'Reaver_CargoDoor_Port', [3.0, 2.0, 0.3], [1.0, 0.2, -2.4]);
  cargoDoor.castShadow = true;
  cargoDoor.userData.keepSeparate = true;
  cargoDoor.userData.damageRole = 'secondary';

  // ---- neglected/scorched radiator fins (neglected thermal surfaces, §8.5) — EXACTLY 2 ----
  // Bent, not groomed. Kept separate so both Reaver_Radiator_* names survive the merge.
  const radiators = [];
  for (const side of [-1, 1]) {
    const fin = kit.addBox(hull, rustMat, `Reaver_Radiator_${side < 0 ? 'Port' : 'Starboard'}`, [4.0, 0.2, 2.4], [-3.0, 0.6, side * 3.6]);
    fin.rotation.x = side * 0.18; // bent — not groomed
    fin.castShadow = true;
    fin.userData.keepSeparate = true;
    radiators.push(fin);
  }

  // ---- overpaint tag + kill marks (punk decal, §8.5) ----
  // Crimson spray tag + kill tallies (style 'punk'). Kept separate so the LOD reaction drops it at
  // distance and so its Reaver_Decal_Tag name survives the merge.
  const tagDecalMat = kit.noseArtMaterial({ style: 'punk', accent: COLOR.tag, seed: seed + 11, tally: 7 });
  const tagDecal = kit.addDecal(hull, tagDecalMat, 'Reaver_Decal_Tag', [5.0, 2.5], [1.0, 1.4, 2.31], [0, Math.PI, 0]);

  // ---- hot unstable drive: a single oversized crude nozzle (hot emission, §8.5) ----
  // Oversaturated red-orange, flickering (the flicker flag destabilizes the plume + fan cadence).
  const drive = kit.buildDrive(hull, {
    name: 'Reaver_Drive', position: [-8.6, 0.3, 0], radius: 1.15, length: 1.6,
    materials: { dark: graphiteMat, accent: tagGlowMat },
    driveColor: COLOR.drive, coreColor: COLOR.driveCore, driveGlowOpacity: 0.62, flicker: true,
  });

  // ---- a dim red nav strobe on the spine (the one maintained light — they need it to dock) ----
  const navLight = kit.addBox(hull, tagGlowMat, 'Reaver_Nav_Strobe', [0.3, 0.14, 0.14], [0.5, 1.8, 0]);
  navLight.userData.damageRole = 'navLight';
  navLight.userData.keepSeparate = true;
  const navLightBase = [navLight.material.emissiveIntensity];

  // ---- greeble: cannibalized surface detail (denser + grimier than a maintained hull) ----
  kit.scatterGreeble(hull, {
    R: DESIGN_RADIUS, length: 1.8, halfWidth: 0.15, height: 0.12, density: 0.55, seed: seed + 7,
    materials: { primary: patchMat, dark: graphiteMat, glow: tagGlowMat }, xMin: -0.30, xMax: 0.20,
  });

  // ---- sockets ----
  kit.addSocket(hull, 'SOCKET_Weapon_Front', [13.0, 0.8, 2.6], 'weapon'); // the off-center cannon muzzle
  kit.addSocket(hull, 'SOCKET_Engine_Main', [-8.6, 0.3, 0], 'engine', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Trail_Main', [-8.9, 0.3, 0], 'vfx', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Camera_Focus', [0, 0.4, 0], 'camera');

  // ---- finalize: merge static plates, wire LOD (drop tag decal at distance), hot flickering drive,
  //      and readable damage (nav strobe fails, vestigial cargo door sheds at critical). ----
  kit.mergeStaticByMaterial(hull, new Set([repairPanel, cargoDoor, cannon, tagDecal, ...radiators, navLight, drive.fan, drive.driveCore, drive.plume]));

  kit.finalizeShip({
    root, hull, entity, designRadius: DESIGN_RADIUS,
    decals: [tagDecal],
    driveParts: drive,
    damageParts: { navLights: [navLight], navLightBase, driveCore: drive.driveCore, plume: drive.plume, secondary: [cargoDoor], armor: [] },
  });

  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [26, 5, 13],
    sockets: 4,
    drawCallTarget: '<= 16 before post-processing',
    factionGrammar: '§8.5 pirate — stolen hull, altered posture, broken symmetry, hot emission',
    damageStates: ['operational', 'stressed', 'damaged', 'critical', 'destruction'],
    version: 2,
  };
  return root;
}
