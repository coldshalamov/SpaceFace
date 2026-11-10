// SF-DMC Drift Barge — bespoke industrial hauler hero asset (spec §8.4, Phase 3 §20).
//
// §8.4 reading: "honest load, repair, and abrasion." A Drift Miners ship is a working machine, not a
// warship or a product. Where the Meridian is brand-merchandise and the Concord is institutional, the
// Drift is honest labor: broad load paths, external braces and clamps, safety color near moving parts,
// dust and abrasion (NOT combat scarring), and work lights instead of decorative glow.
//
// Construction logic vs §8.4 bullets:
//   - "broad load paths"                     -> a wide squat barge loft with a flat reinforced deck
//   - "external braces, scoops, clamps, platforms"-> visible structural cross-braces + cargo clamps on the deck
//   - "safety color near moving or hot systems"-> hazard-yellow clamps + the moving crusher scoop
//   - "dust and abrasion stronger than combat scarring"-> a heavy ore-stain grime band on the deck + bow
//   - "replaceable tools with unmistakable mount geometry"-> a bolted crusher scoop with a clear mounting collar
//   - "work lights rather than decorative glow"-> warm flood lights (white-ish, not colored show-lights)
//
// Craft tier: matches the Kestrel. Lofted industrial barge hull + PBR materials (panel albedo + normal
// map + heavy ore-grime) + bolted crusher scoop + external braces + speed-reactive crude drive + LOD
// reaction (drops the hazard chevrons at distance) + readable damage (work-light groups fail, the
// crusher scoop sheds at critical). Built from shipKit.js shared primitives.
//
// Coordinate contract: +X forward, +Y up, +Z starboard, metres. collisionRadius ~19-20 (enemies.js).
import * as THREE from 'three';
import * as kit from './shipKit.js';

const COLOR = Object.freeze({
  hull: '#a08050',          // honest industrial tan (faction_dmc hull)
  hullDark: '#6a5238',      // shadow panels / structural members
  rust: '#7a4010',          // faction_dmc secondary — oxidized structural steel
  graphite: '#1a140e',      // bare mechanical structure
  hazard: '#e8a030',        // safety color near moving/hot systems (§8.4)
  warning: '#d8c030',       // hazard chevron yellow
  workLight: '#ffeac0',     // warm work flood-light (not decorative glow, §8.4)
  drive: '#FF8844',         // crude industrial drive (faction_dmc thruster)
  driveCore: '#ffcc88',
});

const DESIGN_RADIUS = 19;

/**
 * Build the bespoke Drift Barge mesh (an honest industrial working machine, §8.4).
 * @param {object} entity - the ship entity (reads radius for scale; default ~19).
 * @returns {THREE.Group} the ship mesh, with userData.hull (bankable), sockets, renderContract.
 */
export function buildDriftBarge(entity) {
  const root = new THREE.Group();
  root.name = 'Drift_Barge';
  root.userData.kind = 'ship';
  root.userData.assetId = 'SF_DMC_DRIFT_BARGE';

  const hull = new THREE.Group(); hull.name = 'Drift_Barge_Hull';
  root.add(hull); root.userData.hull = hull;

  const seed = kit.hashSeed(COLOR.hull + COLOR.hazard);
  const hullMat = kit.pbrHullMaterial({ hull: COLOR.hull, accent: COLOR.hazard, seed, panelCount: 10, metalness: 0.40, roughness: 0.72 });
  hullMat.name = 'Drift_Hull';
  const hullDarkMat = kit.pbrHullMaterial({ hull: COLOR.hullDark, accent: COLOR.hazard, seed: seed + 2, panelCount: 8, metalness: 0.45, roughness: 0.78 });
  hullDarkMat.name = 'Drift_HullDark';
  const rustMat = kit.standardMaterial(COLOR.rust, 0.88, 0.20); rustMat.name = 'Drift_Rust';
  const graphiteMat = kit.machineryMaterial(COLOR.graphite, 0.55, 0.75); graphiteMat.name = 'Drift_Graphite';
  const hazardMat = kit.emissiveMaterial(COLOR.hazard, 1.4); hazardMat.name = 'Drift_Hazard';
  const workLightMat = kit.emissiveMaterial(COLOR.workLight, 2.2); workLightMat.name = 'Drift_WorkLight';

  // ---- industrial barge hull: a WIDE SQUAT lofted shell with a flat reinforced deck (§8.4) ----
  // Broader than it is tall — a working barge, not a sleek hull. The flat top is the cargo/ore deck.
  const pressureHull = kit.addMesh(hull, kit.loftXGeometry([
    { x: -8.5, halfY: 1.6, halfZ: 3.2 },
    { x: -2.0, halfY: 1.8, halfZ: 3.5 },
    { x: 5.0,  halfY: 1.7, halfZ: 3.3 },
    { x: 10.0, halfY: 1.3, halfZ: 2.6 },
    { x: 13.5, halfY: 0.5, halfZ: 1.0 },
  ], 10), hullMat, 'Drift_Pressure_Hull');
  pressureHull.castShadow = true;

  // reinforced flat deck plate on top (broad load path, §8.4)
  kit.addBox(hull, hullDarkMat, 'Drift_Deck_Plate', [16.0, 0.4, 6.4], [-0.5, 1.7, 0]);

  // ---- external structural cross-braces (external braces, §8.4) ----
  // Visible truss-like members spanning the hull — honest load-bearing structure, not hidden inside.
  for (let i = 0; i < 4; i++) {
    const x = -5.0 + i * 3.5;
    kit.addBox(hull, rustMat, `Drift_Brace_${i}`, [0.5, 1.8, 6.0], [x, 0.5, 0]).castShadow = true;
  }

  // ---- crusher scoop with unmistakable mount geometry (replaceable tool, §8.4) ----
  // A bolted bucket on the nose with a clear mounting collar — reads as a detachable mining tool.
  const scoop = new THREE.Group(); scoop.name = 'Drift_Crusher_Scoop';
  scoop.userData.keepSeparate = true; // group survives merge (shed at critical)
  kit.addBox(scoop, rustMat, 'Drift_Scoop_Bucket', [2.8, 2.8, 4.4], [0, 0, 0]).castShadow = true;
  // the mounting collar (unmistakable mount geometry)
  kit.addCylinderX(scoop, graphiteMat, 'Drift_Scoop_Collar', 1.2, 1.4, [-1.6, 0, 0], 12);
  // hazard-yellow jaw teeth (safety color near moving systems, §8.4)
  for (const side of [-1, 1]) {
    for (let t = 0; t < 3; t++) {
      kit.addBox(scoop, hazardMat, `Drift_Scoop_Tooth_${side < 0 ? 'P' : 'S'}${t}`, [0.3, 0.6, 0.4], [1.2, 0.9 - t * 0.7, side * (1.2 + t * 0.4)]);
    }
  }
  hull.add(scoop);
  scoop.position.set(12.0, -0.2, 0);

  // ---- cargo clamps on the deck (external clamps, §8.4) — hazard-yellow, pairs ----
  const clamps = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const c = kit.addBox(hull, hazardMat, `Drift_Clamp_${i}_${side < 0 ? 'P' : 'S'}`, [0.8, 1.0, 0.8], [-3.0 + i * 2.5, 2.2, side * 2.0]);
      c.castShadow = true;
      clamps.push(c);
    }
  }

  // ---- dust + abrasion: a heavy ore-stain grime band on the deck (§8.4 — not combat scarring) ----
  // Higher grime intensity than corporate/authority, concentrated on the dorsal deck where ore is
  // loaded. This is wear-from-work, not battle damage.
  const oreGrimeMat = kit.grimeMaterial({ hull: COLOR.hull, seed: seed + 17, intensity: 0.65 });
  kit.addDecal(hull, oreGrimeMat, 'Drift_Ore_Stain', [14.0, 5.0], [-1.0, 1.72, 0], [-Math.PI / 2, 0, 0]);

  // ---- hazard chevron decals on the bow (safety color, §8.4) — dropped at LOD1+ ----
  const chevronDecalMat = kit.decalMaterial({ hull: COLOR.hull, accent: COLOR.warning, seed: seed + 21, kind: 'decal' });
  const chevronDecals = [];
  for (const side of [-1, 1]) {
    const d = kit.addDecal(hull, chevronDecalMat, `Drift_Chevron_${side < 0 ? 'Port' : 'Starboard'}`, [4.0, 2.0], [8.0, 0.5, side * 3.21], [0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
    chevronDecals.push(d);
  }

  // ---- crude industrial drive: a single big rough nozzle (workhorse, not showy) ----
  const drive = kit.buildDrive(hull, {
    name: 'Drift_Drive', position: [-9.0, 0.6, 0], radius: 1.25, length: 1.6,
    materials: { dark: graphiteMat, accent: hazardMat },
    driveColor: COLOR.drive, coreColor: COLOR.driveCore, driveGlowOpacity: 0.48, flicker: true,
  });

  // ---- work flood-lights (not decorative glow, §8.4) ----
  // Warm white-ish floods illuminating the deck for night ops. Tagged as the navLight damage group.
  const navLights = [];
  for (const x of [3.0, -3.0]) {
    const l = kit.addBox(hull, workLightMat, `Drift_WorkLight_${x}`, [0.5, 0.4, 0.5], [x, 2.5, 0]);
    l.userData.damageRole = 'navLight'; l.userData.keepSeparate = true;
    navLights.push(l);
  }
  const navLightBase = navLights.map((m) => m.material.emissiveIntensity);

  // ---- greeble: honest industrial detail (external pipes, vents — denser than corporate) ----
  kit.scatterGreeble(hull, {
    R: DESIGN_RADIUS, length: 1.8, halfWidth: 0.16, height: 0.14, density: 0.45, seed: seed + 7,
    materials: { primary: hullDarkMat, dark: graphiteMat, glow: hazardMat }, xMin: -0.30, xMax: 0.20,
  });

  // ---- sockets ----
  kit.addSocket(hull, 'SOCKET_Weapon_Front', [14.5, 0, 0], 'weapon'); // the crusher scoop
  kit.addSocket(hull, 'SOCKET_Mining_Front', [14.5, -0.2, 0], 'mining'); // dual-purpose scoop
  kit.addSocket(hull, 'SOCKET_Engine_Main', [-9.3, 0.6, 0], 'engine', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Trail_Main', [-9.6, 0.6, 0], 'vfx', [-1, 0, 0]);
  kit.addSocket(hull, 'SOCKET_Camera_Focus', [0, 0.5, 0], 'camera');
  kit.addSocket(hull, 'SOCKET_Cargo_Ventral', [-2.0, -1.8, 0], 'cargo');

  // ---- finalize ----
  kit.mergeStaticByMaterial(hull, new Set([scoop, ...chevronDecals, ...navLights, ...clamps, drive.fan, drive.driveCore, drive.plume]));

  kit.finalizeShip({
    root, hull, entity, designRadius: DESIGN_RADIUS,
    decals: chevronDecals,
    driveParts: drive,
    damageParts: { navLights, navLightBase, driveCore: drive.driveCore, plume: drive.plume, secondary: [scoop], armor: [] },
  });

  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    nominalDimensions: [26, 6, 13],
    sockets: 6,
    drawCallTarget: '<= 18 before post-processing',
    factionGrammar: '§8.4 industrial — broad load paths, external braces, ore abrasion, work lights',
    damageStates: ['operational', 'stressed', 'damaged', 'critical', 'destruction'],
    version: 2,
  };
  return root;
}
