// SF-QUIET Quiet Raider — bespoke smuggler hero asset (spec §8.6, Phase 3 §20).
//
// §8.6 reading: "deniable, low-signature, modified." A Quiet ship is a smuggling craft — everything
// is about not being seen. Where the Concord advertises authority and the Meridian advertises brand,
// the Quiet hides: baffled emitters, low-reflectance surfaces, hidden compartments, narrow light
// apertures, restrained identifiers, and asymmetry around sensors and cargo access.
//
// Construction logic vs §8.6 bullets:
//   - "masked or baffled emitters"              -> a recessed masked drive nozzle tucked under a baffle shroud
//   - "low-reflectance surfaces, subtle repair" -> a high-roughness / low-metalness matte hull (no specular catch)
//   - "hidden compartments visible through construction, not magic" -> a ventral seam line splitting the belly
//   - "narrow light apertures"                  -> thin slit lights, not floods
//   - "restrained identifiers"                  -> a small dim registration decal, not a brand mark
//   - "asymmetry around sensors and cargo"      -> an off-center sensor mast + asymmetric ventral bay
//
// Craft tier: matches the Kestrel. A LOW-SLUNG BLADE loft (minimal radar cross-section) + matte PBR
// hull (roughness cranked up, metalness near zero so it doesn't glint) + baffled masked drive +
// speed-reactive dim drive + LOD reaction (drops the registration decal at distance) + readable damage
// (the narrow sensor slits go intermittent at critical, the hidden bay panel sheds). Built from
// shipKit.js shared primitives.
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. collisionRadius ~16-18 (enemies.js).
import * as THREE from 'three';
import * as kit from './shipKit.js';

const COLOR = Object.freeze({
  hull: '#3a3442',          // dark matte grey-violet (low-reflectance, §8.6)
  hullDark: '#2a2630',      // shadow panels / baffling
  matte: '#1c1820',         // radar-absorbent patches
  graphite: '#0e0c12',      // bare structure
  violet: '#7A5FB0',        // The Quiet accent (faction_quiet primary) — used sparingly
  sensor: '#9070D0',        // narrow sensor slit glow (faction_quiet emissive)
  drive: '#604080',         // dim baffled drive (deliberately not bright)
  driveCore: '#a080c8',
});

const DESIGN_RADIUS = 16;

/**
 * Build the bespoke Quiet Raider mesh (a deniable low-signature smuggling craft, §8.6).
 * @param {object} entity - the ship entity (reads radius for scale; default ~16).
 * @returns {THREE.Group} the ship mesh, with userData.hull (bankable), sockets, renderContract.
 */
export function buildQuietRaider(entity) {
  const root = new THREE.Group();
  root.name = 'Quiet_Raider';
  root.userData.kind = 'ship';
  root.userData.assetId = 'SF_QUIET_RAIDER';

  const hull = new THREE.Group(); hull.name = 'Quiet_Raider_Hull';
  root.add(hull); root.userData.hull = hull;

  const seed = kit.hashSeed(COLOR.hull + COLOR.sensor);
  // NOTE: deliberately high roughness + low metalness so the hull has almost no specular catch — it
  // shouldn't glint under the key light the way a Concord chrome spine does. That's the §8.6 read.
  const hullMat = kit.pbrHullMaterial({ hull: COLOR.hull, accent: COLOR.violet, seed, panelCount: 10, metalness: 0.06, roughness: 0.92 });
  hullMat.name = 'Quiet_Hull';
  const hullDarkMat = kit.pbrHullMaterial({ hull: COLOR.hullDark, accent: COLOR.violet, seed: seed + 2, panelCount: 8, metalness: 0.08, roughness: 0.95 });
  hullDarkMat.name = 'Quiet_HullDark';
  const matteMat = kit.standardMaterial(COLOR.matte, 0.98, 0.02); matteMat.name = 'Quiet_Matte'; // radar-absorbent
  const graphiteMat = kit.machineryMaterial(COLOR.graphite, 0.7, 0.5); graphiteMat.name = 'Quiet_Graphite';
  const sensorMat = kit.emissiveMaterial(COLOR.sensor, 1.8); sensorMat.name = 'Quiet_Sensor';

  // ---- low-slung BLADE hull: a thin lofted planform (minimal cross-section, §8.6) ----
  // Flatter and lower than the other hulls — a knife-edge profile. A lofted shell still gives real
  // curvature, but the silhouette is deliberately minimized so it reads as low-signature.
  const pressureHull = kit.addMesh(hull, kit.loftXGeometry([
    { x: -8.0, halfY: 0.5,  halfZ: 1.4 },
    { x: -3.0, halfY: 0.7,  halfZ: 1.7 },
    { x: 3.0,  halfY: 0.65, halfZ: 1.6 },
    { x: 8.0,  halfY: 0.45, halfZ: 1.2 },
    { x: 12.0, halfY: 0.15, halfZ: 0.3 },
  ], 10), hullMat, 'Quiet_Pressure_Hull');
  pressureHull.castShadow = true;

  // matte radar-absorbent top coat (low-reflectance surface, §8.6)
  kit.addBox(hull, matteMat, 'Quiet_Matte_Coat', [16.0, 0.12, 3.0], [0, 0.62, 0]);

  // ---- hidden compartment: a ventral seam line splitting the belly (§8.6, visible through construction) ----
  // A deliberate split in the belly plating with a dark gap underneath — the smuggler's bay. You can
  // see it's there from the construction, but it's flush, not advertised.
  const bayPanel = kit.addBox(hull, hullDarkMat, 'Quiet_Hidden_Bay', [7.0, 0.12, 2.4], [-1.0, -0.55, 0]);
  bayPanel.userData.damageRole = 'secondary';
  bayPanel.userData.keepSeparate = true;
  // the seam gap (a thin dark strip beside the panel, reads as a hatch line)
  kit.addBox(hull, graphiteMat, 'Quiet_Bay_Seam', [6.8, 0.1, 0.1], [-1.0, -0.55, 1.2]);

  // ---- asymmetric sensor mast (asymmetry around sensors, §8.6) ----
  // One off-center mast on the dorsal — not symmetric, because the smuggling sensors are on one side.
  const sensorMast = new THREE.Group(); sensorMast.name = 'Quiet_Sensor_Mast';
  sensorMast.position.set(2.0, 0.7, 0.8); hull.add(sensorMast);
  kit.addBox(sensorMast, graphiteMat, 'Quiet_Mast_Pole', [0.15, 1.2, 0.15], [0, 0.6, 0]);
  kit.addBox(sensorMast, matteMat, 'Quiet_Mast_Head', [0.5, 0.25, 0.4], [0, 1.25, 0]);
  sensorMast.userData.keepSeparate = true;

  // ---- narrow sensor slit lights (narrow apertures, §8.6) ----
  // Thin slit-shaped emissive strips, not floods — restrained illumination. These are the damage-fail
  // group: at critical they go intermittent (a flickering sensor read).
  const sensorSlits = [];
  for (const x of [4.0, 0.0, -4.0]) {
    const s = kit.addBox(hull, sensorMat, `Quiet_Sensor_Slit_${x}`, [0.8, 0.05, 0.05], [x, 0.66, 0]);
    s.userData.damageRole = 'navLight'; s.userData.keepSeparate = true;
    sensorSlits.push(s);
  }
  const navLightBase = sensorSlits.map((m) => m.material.emissiveIntensity);

  // ---- baffled masked drive: a recessed nozzle under a baffle shroud (§8.6) ----
  // Tucked up under a shroud so the plume isn't visible side-on. Deliberately DIM drive emission.
  const driveShroud = kit.addBox(hull, hullDarkMat, 'Quiet_Drive_Shroud', [2.4, 1.2, 2.6], [-7.6, 0.1, 0]);
  driveShroud.castShadow = true;
  const drive = kit.buildDrive(hull, {
    name: 'Quiet_Drive', position: [-8.2, 0.05, 0], radius: 0.7, length: 1.0,
    materials: { dark: graphiteMat, accent: sensorMat },
    driveColor: COLOR.drive, coreColor: COLOR.driveCore, driveGlowOpacity: 0.28, // deliberately dim
  });

  // ---- restrained identifier: a small dim registration decal (§8.6) — dropped at LOD1+ ----
  // Not a brand mark — just a faint registration stencil. Small + low-emissive so it doesn't catch
  // the eye. Kept separate so the LOD reaction drops it at distance.
  const regDecalMat = kit.decalMaterial({ hull: COLOR.hull, accent: COLOR.violet, seed: seed + 23, kind: 'decal' });
  const regDecals = [];
  for (const side of [-1, 1]) {
    const d = kit.addDecal(hull, regDecalMat, `Quiet_Registration_${side < 0 ? 'Port' : 'Starboard'}`, [2.4, 0.6], [4.0, 0.3, side * 1.71], [0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
    regDecals.push(d);
  }

  // ---- greeble: sparse baffled detail (low-signature ships aren't greebled-out) ----
  kit.scatterGreeble(hull, {
    R: DESIGN_RADIUS, length: 1.8, halfWidth: 0.12, height: 0.10, density: 0.25, seed: seed + 5,
    materials: { primary: hullDarkMat, dark: graphiteMat, glow: sensorMat }, xMin: -0.30, xMax: 0.20,
  });

  // ---- sockets ----
  kit.addSocket(hull, 'SOCKET_Weapon_Front', [12.0, 0, 0], 'weapon'); // concealed pop-out mount
  kit.addSocket(hull, 'SOCKET_Engine_Main', [-8.4, 0.05, 0], 'engine', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Trail_Main', [-8.7, 0.05, 0], 'vfx', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');

  // ---- finalize ----
  kit.mergeStaticByMaterial(hull, new Set([bayPanel, sensorMast, ...sensorSlits, ...regDecals, drive.fan, drive.driveCore, drive.plume]));

  kit.finalizeShip({
    root, hull, entity, designRadius: DESIGN_RADIUS,
    decals: regDecals,
    driveParts: drive,
    damageParts: { navLights: sensorSlits, navLightBase, driveCore: drive.driveCore, plume: drive.plume, secondary: [bayPanel], armor: [] },
  });

  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [22, 3, 8],
    sockets: 4,
    drawCallTarget: '<= 14 before post-processing',
    factionGrammar: '§8.6 smuggler — low-signature, baffled, matte, hidden compartments, narrow slits',
    damageStates: ['operational', 'stressed', 'damaged', 'critical', 'destruction'],
    version: 2,
  };
  return root;
}
