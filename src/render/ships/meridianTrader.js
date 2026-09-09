// SF-MTS Meridian Trader — bespoke corporate hauler hero asset (spec §8.3, Phase 3 §20).
//
// §8.3 reading: "brand-controlled efficiency." A Meridian ship is a corporate product, not a survivor
// or an institution. Where the Concord is intimidating-organized and the Kestrel is adapted-personal,
// the Meridian is legible-merchandise: modular replaceable blocks, a disciplined neutral field with
// warm gold/cream accents, and big legible brand marks at infrastructure scale.
//
// Construction logic vs §8.3 bullets:
//   - "modular replaceable blocks"               -> a clean corporate hull + standardized CONTAINER GRID (replaceable cargo)
//   - "strict alignment and service grids"        -> a gridded radiator/venting layout, perfectly aligned
//   - "standardized containers and radiators"     -> 6 identical emissive-capped container modules on the back
//   - "warm gold/cream accents in neutral fields" -> cream hull + gold chevron brand marks + gold trim
//   - "large legible corporate marks at infra scale"-> a big gold Meridian chevron-decal on each flank
//   - "low grime, throughput wear at cargo/dock"   -> a faint docking-wear band at the container interface (no combat scarring)
//
// Craft tier: matches the Kestrel. Lofted corporate hull + PBR materials (panel albedo + normal map +
// low-grime) + standardized container grid + speed-reactive twin warm drives + LOD reaction (drops the
// brand-chevron decals at distance) + readable damage (the docking bay nav-lights fail, plume
// destabilizes, a container module sheds at critical). Built from shipKit.js shared primitives.
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. collisionRadius ~18-20 (enemies.js).
import * as THREE from 'three';
import * as kit from './shipKit.js';

const COLOR = Object.freeze({
  hull: '#e8dcb8',          // cream neutral field (corporate, §8.3)
  hullDark: '#b8a878',      // shadow panels / service-grid vents
  gold: '#F2B233',          // Meridian brand gold (faction_mts primary)
  goldTrim: '#FFE09A',      // brighter accent trim (faction_mts accent)
  graphite: '#2a2418',      // mechanical structure
  container: '#d8c890',     // standardized cargo modules
  drive: '#FFCC66',         // warm corporate drive (faction_mts thruster)
  driveCore: '#fff2c0',
});

const DESIGN_RADIUS = 20;

/**
 * Build the bespoke Meridian Trader mesh (a brand-controlled corporate hauler, §8.3).
 * @param {object} entity - the ship entity (reads radius for scale; default ~20).
 * @returns {THREE.Group} the ship mesh, with userData.hull (bankable), sockets, renderContract.
 */
export function buildMeridianTrader(entity) {
  const root = new THREE.Group();
  root.name = 'Meridian_Trader';
  root.userData.kind = 'ship';
  root.userData.assetId = 'SF_MTS_MERIDIAN_HAULER';

  const hull = new THREE.Group(); hull.name = 'Meridian_Trader_Hull';
  root.add(hull); root.userData.hull = hull;

  const seed = kit.hashSeed(COLOR.hull + COLOR.gold);
  const hullMat = kit.pbrHullMaterial({ hull: COLOR.hull, accent: COLOR.gold, seed, panelCount: 12, metalness: 0.28, roughness: 0.38 });
  hullMat.name = 'Meridian_Hull';
  const hullDarkMat = kit.pbrHullMaterial({ hull: COLOR.hullDark, accent: COLOR.gold, seed: seed + 2, panelCount: 8, metalness: 0.30, roughness: 0.42 });
  hullDarkMat.name = 'Meridian_HullDark';
  const graphiteMat = kit.machineryMaterial(COLOR.graphite, 0.52, 0.72); graphiteMat.name = 'Meridian_Graphite';
  const containerMat = kit.pbrHullMaterial({ hull: COLOR.container, accent: COLOR.goldTrim, seed: seed + 4, panelCount: 6, metalness: 0.20, roughness: 0.55 });
  containerMat.name = 'Meridian_Container';
  const goldMat = kit.emissiveMaterial(COLOR.gold, 1.2); goldMat.name = 'Meridian_Gold';
  const driveMat = kit.emissiveMaterial(COLOR.drive, 2.4); driveMat.name = 'Meridian_DriveGlow';

  // ---- corporate hull: a clean LOFTED modular freighter fuselage (brand-controlled, §8.3) ----
  // Broader and boxier than the Concord's lozenge — a hauler, not an interdictor — but still a lofted
  // shell so it reads as a real hull catching light, not a crate. The wide flat back is the cargo face.
  const pressureHull = kit.addMesh(hull, kit.loftXGeometry([
    { x: -9.0, halfY: 2.0,  halfZ: 2.6 },
    { x: -3.0, halfY: 2.3,  halfZ: 3.0 },
    { x: 4.0,  halfY: 2.2,  halfZ: 2.9 },
    { x: 9.0,  halfY: 1.4,  halfZ: 2.2 },
    { x: 12.5, halfY: 0.4,  halfZ: 0.6 },
  ], 12), hullMat, 'Meridian_Pressure_Hull');
  pressureHull.castShadow = true;

  // standardized service-grid vent strip (strict alignment, §8.3) — a gridded dorsal panel
  kit.addBox(hull, hullDarkMat, 'Meridian_Service_Grid', [12.0, 0.3, 3.8], [-1.5, 2.0, 0]);

  // ---- standardized container grid: 2 rows × 3 cols of identical modular cargo blocks (§8.3) ----
  // Replaceable corporate merchandise stacked on the aft deck. The center container is a named
  // secondary part (shed at critical damage) — one cargo module breaks loose as damage reads.
  const containers = [];
  for (const row of [-1, 1]) {
    for (let col = 0; col < 3; col++) {
      const cx = -7.0 + col * 3.0;
      const cz = row * 2.4;
      const c = kit.addBox(hull, containerMat, `Meridian_Container_${row < 0 ? 'P' : 'S'}${col}`, [2.6, 2.0, 2.0], [cx, 3.1, cz]);
      c.castShadow = true;
      // emissive-capped module ends (reads as powered corporate cargo)
      kit.addBox(hull, goldMat, `Meridian_Container_Cap_${row < 0 ? 'P' : 'S'}${col}`, [0.2, 1.6, 1.6], [cx + 1.32, 3.1, cz]);
      containers.push(c);
    }
  }
  // mark the center container as the critical-shed secondary part
  const shedContainer = containers[1]; // Meridian_Container_P1
  shedContainer.userData.damageRole = 'secondary';
  shedContainer.userData.keepSeparate = true;

  // ---- standardized radiator fins (aligned service grid, §8.3) ----
  for (const side of [-1, 1]) {
    const fin = kit.addBox(hull, hullDarkMat, `Meridian_Radiator_${side < 0 ? 'Port' : 'Starboard'}`, [8.0, 0.25, 2.0], [-2.5, 1.2, side * 3.4]);
    fin.castShadow = true;
  }

  // ---- large legible corporate marks (gold chevron brand decal on each flank, §8.3) ----
  // The Meridian chevron at infrastructure scale — a crisp insignia-style decal so it reads as a
  // corporate logo, not graffiti. Kept separate so the LOD reaction drops it at distance.
  const brandDecalMat = kit.noseArtMaterial({ style: 'insignia', accent: COLOR.gold, seed: seed + 9 });
  const brandDecals = [];
  for (const side of [-1, 1]) {
    const d = kit.addDecal(hull, brandDecalMat, `Meridian_Brand_${side < 0 ? 'Port' : 'Starboard'}`, [4.5, 2.8], [4.0, 0.4, side * 3.01], [0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
    brandDecals.push(d);
  }

  // ---- faint docking-interface wear band (throughput wear at cargo/dock, §8.3 — low grime) ----
  // A subtle grime overlay concentrated at the aft container interface (where it docks), not battle
  // scarring. Low intensity = the ship is clean but used.
  const wearMat = kit.grimeMaterial({ hull: COLOR.hull, seed: seed + 13, intensity: 0.18 });
  kit.addDecal(hull, wearMat, 'Meridian_Dock_Wear', [10.0, 3.0], [-4.0, 0.4, 3.01], [0, Math.PI / 2, 0]);

  // ---- twin warm corporate drives (standardized, efficient, §8.3) ----
  // Two identical nozzles flanking the centerline — standardized corporate propulsion.
  const driveFans = [];
  for (const side of [-1, 1]) {
    const d = kit.buildDrive(hull, {
      name: `Meridian_Drive_${side < 0 ? 'Port' : 'Starboard'}`, position: [-9.2, 0.8, side * 1.6], radius: 0.85, length: 1.2,
      materials: { dark: graphiteMat, accent: goldMat },
      driveColor: COLOR.drive, coreColor: COLOR.driveCore, driveGlowOpacity: 0.50,
    });
    driveFans.push(d.fan);
  }

  // ---- docking-bay nav lights (the maintained light group; fails on damage, §9.11) ----
  const navLights = [];
  for (const side of [-1, 1]) {
    const l = kit.addBox(hull, goldMat, `Meridian_NavLight_${side < 0 ? 'Port' : 'Starboard'}`, [0.4, 0.14, 0.14], [10.5, 1.4, side * 2.6]);
    l.userData.damageRole = 'navLight'; l.userData.keepSeparate = true;
    navLights.push(l);
  }
  const navLightBase = navLights.map((m) => m.material.emissiveIntensity);

  // ---- greeble: disciplined service-grid detail (low density — corporate ships are clean) ----
  kit.scatterGreeble(hull, {
    R: DESIGN_RADIUS, length: 2.0, halfWidth: 0.14, height: 0.10, density: 0.30, seed: seed + 5,
    materials: { primary: hullDarkMat, dark: graphiteMat, glow: goldMat }, xMin: -0.30, xMax: 0.20,
  });

  // ---- sockets ----
  kit.addSocket(hull, 'SOCKET_Weapon_Front', [12.5, 0, 0], 'weapon'); // defensive turret mount
  kit.addSocket(hull, 'SOCKET_Engine_Main', [-9.8, 0.8, 0], 'engine', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Trail_Main', [-10.1, 0.8, 0], 'vfx', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');
  kit.addSocket(hull, 'SOCKET_Cargo_Ventral', [-3.0, -2.3, 0], 'cargo');

  // ---- finalize ----
  const primaryDrive = { fan: driveFans[0], driveCore: null, plume: null, plumeMat: null, basePlumeOpacity: 0.30 };
  hull.traverse((o) => {
    if (o.name === 'Meridian_Drive_Port_Plume_Mesh' && !primaryDrive.plume) primaryDrive.plume = o;
    if (o.name === 'Meridian_Drive_Port_Core_Mesh' && !primaryDrive.driveCore) primaryDrive.driveCore = o;
  });

  kit.mergeStaticByMaterial(hull, new Set([...navLights, ...brandDecals, shedContainer, ...driveFans]));

  kit.finalizeShip({
    root, hull, entity, designRadius: DESIGN_RADIUS,
    decals: brandDecals,
    driveParts: primaryDrive,
    damageParts: { navLights, navLightBase, driveCore: primaryDrive.driveCore, plume: primaryDrive.plume, secondary: [shedContainer], armor: [] },
  });

  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [24, 7, 12],
    sockets: 5,
    drawCallTarget: '<= 16 before post-processing',
    factionGrammar: '§8.3 corporate — modular, brand-controlled, gold/cream, throughput wear',
    damageStates: ['operational', 'stressed', 'damaged', 'critical', 'destruction'],
    version: 2,
  };
  return root;
}
