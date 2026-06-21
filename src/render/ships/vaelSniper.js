// SF-VAEL Vael Sniper — bespoke non-human hero asset (spec §8.7, Phase 3 §20).
//
// §8.7 reading: "purpose without human hospitality." A Vael ship is alien — the directive is to break
// ONE foundational human assumption at a time. So this hull deliberately violates several human design
// instincts: structure and signal share a surface (glowing veins ARE the hull), repetition occurs at a
// non-human scale, light doesn't sit in fixtures, the front is ambiguous until motion, material
// transitions continuously (no bolted panels), and cavities are more important than shells.
//
// Construction logic vs §8.7 bullets:
//   - "structure and signal may share a surface"   -> emissive TEAL VEINS built into the hull facets (no fixtures)
//   - "repetition at a non-human scale"             -> a faceted crystalline hex-lattice, not human panelling
//   - "light may not sit in fixtures"               -> glow comes from the hull surface itself, not lamps
//   - "front may remain ambiguous until motion"     -> tapered BOTH ends (symmetric fore/aft)
//   - "material may transition continuously"        -> a single faceted shell, no bolted seams or planks
//   - "cavities may be more important than shells"  -> a deep ventral VOID recessed into the hull
//
// Craft tier: matches the Kestrel. A FACETED CRYSTALLINE hex-prism loft (low radialSegments = flat
// facets, not smooth) + a continuous hull material that IS the signal (emissive veins) + deep ventral
// cavity + ambiguous front + speed-reactive resonant drive + LOD reaction (drops the facet-glow at
// distance, keeps silhouette) + readable damage (the signal-veins flicker, a facet-plate sheds). Built
// from shipKit.js shared primitives.
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. collisionRadius ~14-17 (enemies.js).
import * as THREE from 'three';
import * as kit from './shipKit.js';

const COLOR = Object.freeze({
  shell: '#204840',          // deep teal-black crystalline shell (faction_vael hull)
  shellDark: '#103830',      // facet shadow faces
  void: '#020807',           // the deep ventral cavity — blacker than the hull (cavities > shells, §8.7)
  teal: '#2FCFA0',           // Vael signal teal (faction_vael primary)
  glow: '#40FFB8',           // vein/emissive glow (faction_vael thruster)
  drive: '#2FCFA0',          // resonant alien drive (no nozzle)
  driveCore: '#80EED0',
});

const DESIGN_RADIUS = 17;

/**
 * Build the bespoke Vael Sniper mesh (a non-human crystalline craft, §8.7).
 * @param {object} entity - the ship entity (reads radius for scale; default ~17).
 * @returns {THREE.Group} the ship mesh, with userData.hull (bankable), sockets, renderContract.
 */
export function buildVaelSniper(entity) {
  const root = new THREE.Group();
  root.name = 'Vael_Sniper';
  root.userData.kind = 'ship';
  root.userData.assetId = 'SF_VAEL_SNIPER';

  const hull = new THREE.Group(); hull.name = 'Vael_Sniper_Hull';
  root.add(hull); root.userData.hull = hull;

  const seed = kit.hashSeed(COLOR.shell + COLOR.teal);
  // The shell IS the signal (§8.7): a single continuous faceted material with emissive teal veins baked
  // into the panel albedo. No bolted seams. We still use a normal map so the facets catch the key light
  // as real bevels, but the material reads as one continuous alien substance.
  const shellMat = kit.pbrHullMaterial({ hull: COLOR.shell, accent: COLOR.teal, seed, panelCount: 8, metalness: 0.25, roughness: 0.35, emissive: COLOR.teal });
  shellMat.name = 'Vael_Shell';
  const shellDarkMat = kit.pbrHullMaterial({ hull: COLOR.shellDark, accent: COLOR.teal, seed: seed + 2, panelCount: 6, metalness: 0.30, roughness: 0.40, emissive: COLOR.teal });
  shellDarkMat.name = 'Vael_ShellDark';
  const voidMat = kit.standardMaterial(COLOR.void, 1.0, 0.0); voidMat.name = 'Vael_Void'; // pure black cavity
  const veinMat = kit.emissiveMaterial(COLOR.glow, 2.8); veinMat.name = 'Vael_Vein';
  const coreMat = kit.emissiveMaterial(COLOR.driveCore, 4.0); coreMat.name = 'Vael_Core';

  // ---- faceted crystalline hull: a LOW-RADIAL hex-prism loft (§8.7) ----
  // radialSegments=6 produces flat hex facets — the read is "crystalline/mineral," not "machined."
  // Tapered BOTH ends (ambiguous front, §8.7) — you can't tell nose from tail until it moves.
  const pressureHull = kit.addMesh(hull, kit.loftXGeometry([
    { x: -8.5, halfY: 0.6,  halfZ: 1.6 },
    { x: -3.0, halfY: 1.4,  halfZ: 2.2 },
    { x: 3.0,  halfY: 1.4,  halfZ: 2.2 },
    { x: 8.5,  halfY: 0.6,  halfZ: 1.6 },
    { x: 11.5, halfY: 0.2,  halfZ: 0.5 },
    { x: -11.5, halfY: 0.2, halfZ: 0.5 },
  ], 6), shellMat, 'Vael_Pressure_Hull');
  pressureHull.castShadow = true;

  // ---- emissive signal veins built into the facets (structure = signal, §8.7) ----
  // Thin emissive teal ridges running along the facet edges — the light comes FROM the hull surface,
  // not from lamps. These double as the damage-fail group (flicker at critical).
  const veins = [];
  for (let i = 0; i < 5; i++) {
    const x = -7.0 + i * 3.5;
    // a ridge along each of the 6 facet edges at this station — reads as an energy lattice
    const ridge = kit.addBox(hull, veinMat, `Vael_Vein_${i}`, [0.18, 0.08, 4.0], [x, 1.2, 0]);
    ridge.rotation.y = (i * Math.PI) / 6; // slight twist per station (non-human repetition, §8.7)
    ridge.userData.damageRole = 'navLight'; ridge.userData.keepSeparate = true;
    veins.push(ridge);
    // mirror ridge below
    const ridge2 = kit.addBox(hull, veinMat, `Vael_Vein_${i}_V`, [0.18, 0.08, 4.0], [x, -1.2, 0]);
    ridge2.rotation.y = (i * Math.PI) / 6; ridge2.userData.damageRole = 'navLight'; ridge2.userData.keepSeparate = true;
    veins.push(ridge2);
  }
  const navLightBase = veins.map((m) => m.material.emissiveIntensity);

  // ---- deep ventral cavity (cavities > shells, §8.7) ----
  // A large black void recessed into the belly — blacker than the hull, reading as depth rather than
  // surface. This is the alien inversion of a human hull (which is all shell).
  const cavity = kit.addBox(hull, voidMat, 'Vael_Ventral_Cavity', [8.0, 0.6, 3.0], [0, -0.8, 0]);
  cavity.userData.keepSeparate = true;

  // ---- a facet plate that can shed at critical (§9.11 asymmetric debris) ----
  const facetPlate = kit.addBox(hull, shellDarkMat, 'Vael_Facet_Plate', [2.5, 0.15, 2.0], [4.0, 1.35, 0]);
  facetPlate.rotation.y = 0.4;
  facetPlate.userData.damageRole = 'secondary';
  facetPlate.userData.keepSeparate = true;

  // ---- resonant alien drive: NO NOZZLE, just a glowing facet (§8.7 ambiguous) ----
  // No housing, no turbine fan, no metal nozzle — the drive is a pure resonant glow on the aft facet.
  // This deliberately breaks the human assumption that a drive is a recognizable machine part.
  const driveCore = kit.addMesh(hull, new THREE.CircleGeometry(1.4, 6), coreMat, 'Vael_Drive_Resonator', [-10.5, 0, 0], [0, -Math.PI / 2, 0]);
  driveCore.userData.keepSeparate = true; driveCore.userData.damageRole = 'driveCore';
  const drivePlume = kit.addMesh(hull, new THREE.CircleGeometry(2.0, 6), kit.glowMaterial(COLOR.drive, 0.4), 'Vael_Drive_Plume', [-10.8, 0, 0], [0, -Math.PI / 2, 0]);
  drivePlume.userData.keepSeparate = true; drivePlume.userData.damageRole = 'plume'; drivePlume.renderOrder = 2;
  // a fake "fan" stub so finalizeShip's drive micro-motion path has a spinner to drive (here: a slow
  // resonant pulse rather than a spin, since there's no turbine)
  const resonator = kit.addMesh(hull, new THREE.CircleGeometry(0.9, 6), veinMat, 'Vael_Drive_Pulse', [-10.2, 0, 0], [0, -Math.PI / 2, 0]);
  resonator.userData.keepSeparate = true;

  const driveParts = {
    fan: resonator, driveCore, plume: drivePlume,
    plumeMat: drivePlume.material, basePlumeOpacity: 0.40, flicker: false,
  };

  // ---- greeble: NONE. Alien hulls transition continuously (§8.7) — no human vent/hatch detail. ----
  // (Deliberately omitted. Adding greeble would make it read as human-machined.)

  // ---- sockets (front ambiguous, but the combat system still needs a forward reference) ----
  kit.addSocket(hull, 'SOCKET_Weapon_Front', [11.5, 0, 0], 'weapon');
  kit.addSocket(hull, 'SOCKET_Engine_Main', [-10.5, 0, 0], 'engine', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Trail_Main', [-10.8, 0, 0], 'vfx', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');

  // ---- finalize ----
  kit.mergeStaticByMaterial(hull, new Set([cavity, facetPlate, driveCore, drivePlume, resonator, ...veins]));

  kit.finalizeShip({
    root, hull, entity, designRadius: DESIGN_RADIUS,
    decals: [], // no human-style decals on an alien hull
    driveParts,
    damageParts: { navLights: veins, navLightBase, driveCore, plume: drivePlume, secondary: [facetPlate], armor: [] },
  });

  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [24, 4, 7],
    sockets: 4,
    drawCallTarget: '<= 14 before post-processing',
    factionGrammar: '§8.7 non-human — crystalline facets, signal-surface, deep cavity, ambiguous front',
    damageStates: ['operational', 'stressed', 'damaged', 'critical', 'destruction'],
    version: 2,
  };
  return root;
}
