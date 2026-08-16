// Plan 14 heavy-family presentation.
//
// These are designed-procedural runtime bodies for four combat identities whose gameplay recipes
// deliberately reuse existing player hull definitions. Form is carried by opaque manufactured
// geometry and by the same destructible heavyPart entities that own subsystem health. Live tells
// consume semantic events through vfx.js; this module never reads or writes simulation authority.

import * as THREE from 'three';

export const HEAVY_PRESENTATION_SILHOUETTES = Object.freeze({
  heavy_gunship: 'heavy_gunship_world_identity',
  heavy_ramscoop: 'heavy_ramscoop_world_identity',
  heavy_carrier_lite: 'heavy_carrier_lite_world_identity',
  heavy_foundry: 'heavy_foundry_world_identity',
});

const HEAVY_CHANNELS = Object.freeze(['burn', 'launch', 'oreRelease', 'cutterHeat']);

export function heavyPresentationIdFor(entity) {
  const data = entity && entity.data;
  const id = String(data && (data.lootTableId || data.enemyTypeId || data.typeId) || '');
  return HEAVY_PRESENTATION_SILHOUETTES[id] ? id : null;
}

export function buildHeavyPresentationHull(ctx, stableId) {
  switch (stableId) {
    case 'heavy_gunship': return buildGunship(ctx);
    case 'heavy_ramscoop': return buildRamscoop(ctx);
    case 'heavy_carrier_lite': return buildCarrierLite(ctx);
    case 'heavy_foundry': return buildFoundry(ctx);
    default: return null;
  }
}

export function buildHeavyPartPresentation(entity) {
  const partId = String(entity && entity.data && entity.data.partId || '');
  if (!partId.startsWith('heavy_')) return null;
  if (partId.includes('turret_ring') || partId.includes('_pd_ring') || partId.includes('_laser_ring')) {
    return buildTurretPart(entity, partId);
  }
  if (partId.includes('armored_prow')) return buildRamscoopProwPart(entity);
  if (partId.includes('bay_port') || partId.includes('bay_starboard')) return buildCarrierBayPart(entity, partId);
  if (partId.includes('cutter_port') || partId.includes('cutter_starboard')) return buildFoundryCutterPart(entity, partId);
  if (partId.includes('ore_mine_rack')) return buildFoundryRackPart(entity);
  if (partId.includes('drive_cluster')) return buildDrivePart(entity, partId);
  if (partId.includes('missile_rack')) return buildMissileRackPart(entity);
  return null;
}

export function buildChargedOrePresentation(entity) {
  if (entity && entity.data && entity.data.kind !== 'charged_ore_mine') return null;
  const R = Math.max(1, Number(entity && entity.radius) || 4.2);
  const root = new THREE.Group();
  root.name = 'FoundryChargedOrePhysicalBody';
  const ore = material('FoundryOreIron', 0x40372f, 0.88, 0.28);
  const slag = material('FoundryOreSlag', 0x261f1b, 0.96, 0.08);
  const hazard = material('FoundryOreHazardBand', 0xd8a62e, 0.57, 0.46);
  const charge = signalMaterial('FoundryOreChargeRecess', 0x6a2d08, 0xffa52a, 1.25);
  const body = mesh(root, 'ChargedOreAngularBody', new THREE.DodecahedronGeometry(0.62, 0), ore);
  body.scale.set(1.12, 0.78, 0.94);
  body.rotation.set(0.18, 0.27, -0.12);
  for (const side of [-1, 1]) {
    const clamp = mesh(root, 'ChargedOreClamp', new THREE.TorusGeometry(0.53, 0.055, 5, 10), hazard);
    clamp.rotation.y = Math.PI / 2;
    clamp.position.x = side * 0.3;
    const shield = mesh(root, 'ChargedOreSlagShield', new THREE.BoxGeometry(0.18, 0.34, 0.68), slag);
    shield.position.set(side * 0.48, -0.04, 0);
    shield.rotation.z = side * 0.18;
  }
  for (let i = 0; i < 3; i++) {
    const seam = mesh(root, 'ChargedOreRecessedChargeSeam', new THREE.BoxGeometry(0.055, 0.08, 0.72), charge, true);
    seam.position.set(-0.22 + i * 0.22, 0.45 - i * 0.07, 0);
    seam.rotation.x = i * 0.48;
  }
  root.scale.setScalar(R);
  root.userData.kind = 'payload';
  root.userData.interactionKind = 'charged_ore_mine';
  root.userData.visualLanguage = 'opaque-caged-ore-with-recessed-industrial-charge-seams';
  root.userData.worldIdentity = 'foundry-charged-ore';
  return root;
}

function buildGunship({ g, R }) {
  const hull = material('GunshipRolledHull', 0x504148, 0.68, 0.72);
  const armor = material('GunshipBroadsideArmor', 0x352c32, 0.58, 0.82);
  const mount = material('GunshipTurretMountSteel', 0x72636a, 0.46, 0.86);
  loft(g, 'GunshipWidePressureHull', hull, [
    [-0.94, 0.34, 0.24, -0.02], [-0.64, 0.78, 0.34, 0],
    [0.24, 0.96, 0.37, 0.02], [0.68, 0.82, 0.29, 0], [0.96, 0.42, 0.19, -0.02],
  ], R);
  for (const side of [-1, 1]) {
    loft(g, 'GunshipBroadsideSponson', armor, [
      [-0.58, 0.22, 0.18, side * 0.7], [0.05, 0.31, 0.22, side * 0.78],
      [0.58, 0.27, 0.17, side * 0.72],
    ], R);
    const socket = cylinder(g, 'GunshipVisibleTurretSocket', mount, 0.25 * R, 0.14 * R,
      0.48 * R, 0.23 * R, side * 0.79 * R, 12);
    socket.rotation.x = 0;
  }
  box(g, 'GunshipRecessedCommandDeck', mount, 0.42 * R, 0.18 * R, 0.42 * R,
    -0.08 * R, 0.31 * R, 0);
  for (const side of [-1, 1]) {
    box(g, 'GunshipBroadsideKeel', armor, 1.2 * R, 0.12 * R, 0.11 * R,
      -0.05 * R, -0.22 * R, side * 0.65 * R);
  }
  return finishHeavyHull(g, 'heavy_gunship',
    'wide-rolled-turret-boat-with-physical-broadside-ring-sockets');
}

function buildRamscoop({ g, R }) {
  const hull = material('RamscoopLoadHull', 0x493b3d, 0.7, 0.76);
  const plate = material('RamscoopReinforcedWedge', 0x6b5550, 0.52, 0.88);
  const throat = signalMaterial('RamscoopDriveThroat', 0x4b1d0e, 0xff5a1f, 0.55);
  loft(g, 'RamscoopTaperedLoadHull', hull, [
    [-0.98, 0.52, 0.3, 0], [-0.55, 0.72, 0.35, 0],
    [0.32, 0.58, 0.31, 0], [0.78, 0.36, 0.25, 0], [1.02, 0.1, 0.13, 0],
  ], R);
  for (const side of [-1, 1]) {
    loft(g, 'RamscoopWedgeCheek', plate, [
      [0.12, 0.26, 0.19, side * 0.43], [0.62, 0.34, 0.24, side * 0.32],
      [1.06, 0.08, 0.11, side * 0.08],
    ], R);
    box(g, 'RamscoopWedgeLoadRib', plate, 0.72 * R, 0.12 * R, 0.09 * R,
      0.46 * R, 0.25 * R, side * 0.35 * R);
  }
  const driveWell = cylinder(g, 'RamscoopOversizedDriveWell', hull, 0.46 * R, 0.26 * R,
    -0.88 * R, 0, 0, 14);
  driveWell.rotation.z = Math.PI / 2;
  const recess = cylinder(g, 'RamscoopHotDriveRecess', throat, 0.32 * R, 0.05 * R,
    -1.03 * R, 0, 0, 14, true);
  recess.rotation.z = Math.PI / 2;
  const outer = finishHeavyHull(g, 'heavy_ramscoop',
    'reinforced-load-path-wedge-and-single-oversized-drive-well');
  installHeavyController(outer, (state) => {
    throat.emissiveIntensity = 0.55 + state.burn * 2.25;
  });
  return outer;
}

function buildCarrierLite({ g, R }) {
  const hull = material('CarrierLiteKeelSteel', 0x46505b, 0.6, 0.76);
  const deck = material('CarrierLiteFlightDeck', 0x2d343d, 0.76, 0.62);
  const frame = material('CarrierLiteHangarTruss', 0x747d82, 0.44, 0.82);
  const marker = material('CarrierLiteDeckMarker', 0xc8a045, 0.62, 0.42);
  loft(g, 'CarrierLiteCentralKeel', hull, [
    [-1, 0.32, 0.3, 0], [-0.58, 0.46, 0.34, 0],
    [0.5, 0.42, 0.31, 0], [0.94, 0.24, 0.2, 0],
  ], R);
  for (const side of [-1, 1]) {
    loft(g, 'CarrierLiteSeparatedFlightDeck', deck, [
      [-0.72, 0.2, 0.11, side * 0.7], [-0.18, 0.3, 0.12, side * 0.78],
      [0.52, 0.34, 0.12, side * 0.76], [0.82, 0.18, 0.1, side * 0.65],
    ], R);
    for (const x of [-0.52, 0.22, 0.62]) {
      box(g, 'CarrierLiteDeckBridgeTruss', frame, 0.08 * R, 0.14 * R, 0.48 * R,
        x * R, 0.12 * R, side * 0.52 * R);
    }
    box(g, 'CarrierLiteHazardLandingStripe', marker, 0.58 * R, 0.025 * R, 0.035 * R,
      0.1 * R, 0.24 * R, side * 0.8 * R);
  }
  box(g, 'CarrierLiteRaisedCommandIsland', frame, 0.38 * R, 0.22 * R, 0.26 * R,
    -0.08 * R, 0.34 * R, 0.18 * R);
  return finishHeavyHull(g, 'heavy_carrier_lite',
    'split-flight-decks-and-paired-physical-hangar-mouths');
}

function buildFoundry({ g, R }) {
  const hull = material('FoundryIndustrialHull', 0x454643, 0.78, 0.68);
  const yellow = material('FoundryIndustrialYellow', 0xc18f22, 0.64, 0.48);
  const spine = material('FoundryCargoSpine', 0x6f6252, 0.72, 0.74);
  const cutter = signalMaterial('FoundryCutterHeatBus', 0x6c2e10, 0xff7d21, 0.28);
  loft(g, 'FoundryAsymmetricWorkHull', hull, [
    [-0.96, 0.48, 0.3, -0.08], [-0.5, 0.7, 0.34, -0.02],
    [0.32, 0.6, 0.3, 0.08], [0.76, 0.38, 0.24, 0.04], [0.96, 0.18, 0.16, 0],
  ], R);
  box(g, 'FoundryCargoSpine', spine, 1.5 * R, 0.18 * R, 0.24 * R,
    -0.08 * R, 0.34 * R, -0.1 * R);
  for (const x of [-0.58, -0.2, 0.18, 0.54]) {
    box(g, 'FoundryCargoSpineClamp', yellow, 0.08 * R, 0.34 * R, 0.54 * R,
      x * R, 0.2 * R, -0.1 * R);
  }
  const drill = new THREE.Group();
  drill.name = 'FoundryPhysicalDrillHead';
  drill.position.x = 0.93 * R;
  drill.userData.animated = true;
  g.add(drill);
  const drillCore = cylinder(drill, 'FoundryDrillShaft', spine, 0.15 * R, 0.6 * R,
    0.05 * R, 0, 0, 10, true);
  drillCore.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const tooth = mesh(drill, 'FoundryDrillCuttingTooth', new THREE.ConeGeometry(0.13 * R, 0.46 * R, 5), yellow, true);
    tooth.rotation.z = -Math.PI / 2;
    tooth.rotation.x = i * Math.PI / 2;
    tooth.position.set(0.3 * R, Math.cos(i * Math.PI / 2) * 0.16 * R, Math.sin(i * Math.PI / 2) * 0.16 * R);
  }
  box(g, 'FoundryCutterBusRecess', cutter, 0.72 * R, 0.035 * R, 0.08 * R,
    0.34 * R, 0.34 * R, 0.36 * R, true);
  const outer = finishHeavyHull(g, 'heavy_foundry',
    'industrial-yellow-cargo-spine-fluted-drill-and-physical-cutter-rack');
  installHeavyController(outer, (state, _entity, t) => {
    drill.rotation.x = t * (0.18 + state.cutterHeat * 1.8);
    cutter.emissiveIntensity = 0.28 + state.cutterHeat * 1.65 + state.oreRelease * 0.65;
  });
  return outer;
}

function buildTurretPart(entity, partId) {
  const R = Math.max(1, Number(entity.radius) || 4);
  const root = partRoot(partId, 'physical-360-degree-turret-bearing');
  const bearing = material('HeavyTurretBearing', 0x2e3034, 0.42, 0.9);
  const armor = material('HeavyTurretArmor', 0x65545a, 0.58, 0.82);
  const bore = material('HeavyTurretBore', 0x121316, 0.9, 0.4);
  const base = cylinder(root, 'HeavyTurretPhysicalBearing', bearing, 0.6 * R, 0.28 * R, 0, 0, 0, 14, true);
  base.rotation.x = 0;
  const head = new THREE.Group();
  head.name = 'HeavyTurretRotatingHead';
  head.position.y = 0.24 * R;
  head.userData.animated = true;
  root.add(head);
  const ring = mesh(head, 'HeavyTurretVisibleRing', new THREE.TorusGeometry(0.48 * R, 0.1 * R, 6, 18), armor, true);
  ring.rotation.x = Math.PI / 2;
  const small = partId.includes('_pd_ring');
  const laser = partId.includes('_laser_ring');
  const barrelCount = small ? 3 : laser ? 2 : 2;
  for (let i = 0; i < barrelCount; i++) {
    const z = (i - (barrelCount - 1) / 2) * (small ? 0.18 : 0.24) * R;
    box(head, 'HeavyTurretRootedBarrel', armor, (small ? 0.56 : 0.82) * R, 0.13 * R, 0.12 * R,
      0.4 * R, 0.18 * R, z, true);
    const muzzle = cylinder(head, 'HeavyTurretBore', bore, 0.1 * R, 0.08 * R,
      (small ? 0.73 : 1.0) * R, 0.18 * R, z, 8, true);
    muzzle.rotation.z = Math.PI / 2;
  }
  root.userData.updateRuntimeState = (part, now) => {
    const mounted = part && part.data && part.data.heavyPartState === 'mounted';
    if (mounted) head.rotation.y = (Number(now) || 0) * 0.42 + (partId.includes('starboard') ? Math.PI : 0);
  };
  return root;
}

function buildRamscoopProwPart(entity) {
  const R = Math.max(1, Number(entity.radius) || 6);
  const root = partRoot('heavy_ramscoop_armored_prow', 'replaceable-laminated-collision-wedge');
  const plate = material('RamscoopProwLaminatedPlate', 0x76605a, 0.54, 0.88);
  const scar = material('RamscoopProwSacrificialEdge', 0x29262a, 0.82, 0.76);
  loft(root, 'RamscoopPhysicalProwPlate', plate, [
    [-0.58, 0.72, 0.38, 0], [0.18, 0.48, 0.29, 0], [0.82, 0.06, 0.13, 0],
  ], R);
  for (const side of [-1, 1]) {
    box(root, 'RamscoopProwLoadStrake', scar, 0.92 * R, 0.1 * R, 0.1 * R,
      0.02 * R, 0.22 * R, side * 0.42 * R);
  }
  return root;
}

function buildCarrierBayPart(entity, partId) {
  const R = Math.max(1, Number(entity.radius) || 5);
  const side = partId.includes('starboard') ? -1 : 1;
  const root = partRoot(partId, 'open-framed-physical-launch-bay');
  const frame = material('CarrierBayPressureFrame', 0x78828b, 0.45, 0.84);
  const cavity = material('CarrierBayDarkInterior', 0x0d1218, 0.96, 0.16);
  const door = material('CarrierBaySplitDoor', 0x3c4752, 0.66, 0.72);
  const signal = signalMaterial('CarrierBayLaunchRecess', 0x254e60, 0x56d9ff, 0.18);
  const mouth = new THREE.Group();
  mouth.name = 'CarrierPhysicalHangarMouth';
  mouth.rotation.y = side * Math.PI / 2;
  mouth.userData.animated = true;
  root.add(mouth);
  box(mouth, 'CarrierBayCavity', cavity, 0.96 * R, 0.42 * R, 0.12 * R, 0, 0, -0.08 * R, true);
  for (const y of [-1, 1]) box(mouth, 'CarrierBayFrameRail', frame, 1.15 * R, 0.12 * R, 0.18 * R,
    0, y * 0.48 * R, 0, true);
  for (const x of [-1, 1]) box(mouth, 'CarrierBayFramePost', frame, 0.12 * R, 0.48 * R, 0.18 * R,
    x * 0.58 * R, 0, 0, true);
  const shutters = [];
  for (const x of [-1, 1]) {
    shutters.push(box(mouth, 'CarrierBayRetractingDoor', door, 0.52 * R, 0.37 * R, 0.08 * R,
      x * 0.27 * R, 0, 0.08 * R, true));
  }
  const launchRails = [];
  for (const y of [-0.25, 0.25]) {
    launchRails.push(box(mouth, 'CarrierBayRecessedLaunchRail', signal, 0.78 * R, 0.045 * R, 0.035 * R,
      0, y * R, 0.15 * R, true));
  }
  installHeavyController(root, (state) => {
    const open = state.launch;
    shutters[0].position.x = (-0.27 - open * 0.32) * R;
    shutters[1].position.x = (0.27 + open * 0.32) * R;
    signal.emissiveIntensity = 0.18 + open * (state.flashReduced ? 0.75 : 2.8);
    for (let i = 0; i < launchRails.length; i++) launchRails[i].scale.x = 1 + open * 0.24;
  });
  return root;
}

function buildFoundryCutterPart(entity, partId) {
  const R = Math.max(1, Number(entity.radius) || 5);
  const side = partId.includes('starboard') ? -1 : 1;
  const root = partRoot(partId, 'rooted-industrial-cutter-boom');
  const boom = material('FoundryCutterBoom', 0x4b4841, 0.74, 0.76);
  const yellow = material('FoundryCutterHazard', 0xc69828, 0.62, 0.48);
  const heat = signalMaterial('FoundryCutterHotThroat', 0x71330f, 0xff7a21, 0.25);
  box(root, 'FoundryCutterLoadBoom', boom, 1.18 * R, 0.22 * R, 0.26 * R,
    0.32 * R, 0, 0, true);
  for (const x of [-0.1, 0.45]) {
    const collar = mesh(root, 'FoundryCutterServiceCollar', new THREE.TorusGeometry(0.3 * R, 0.07 * R, 5, 12), yellow, true);
    collar.rotation.y = Math.PI / 2;
    collar.position.x = x * R;
  }
  const throat = cylinder(root, 'FoundryCutterRefractoryThroat', heat, 0.21 * R, 0.1 * R,
    0.93 * R, 0, 0, 10, true);
  throat.rotation.z = Math.PI / 2;
  box(root, 'FoundryCutterRootGusset', yellow, 0.34 * R, 0.35 * R, 0.16 * R,
    -0.42 * R, -0.04 * R, side * 0.1 * R, true);
  installHeavyController(root, (state) => {
    heat.emissiveIntensity = 0.25 + state.cutterHeat * (state.flashReduced ? 0.8 : 2.4);
  });
  return root;
}

function buildFoundryRackPart(entity) {
  const R = Math.max(1, Number(entity.radius) || 5);
  const root = partRoot('heavy_foundry_ore_mine_rack', 'caged-three-charge-ore-rack');
  const frame = material('FoundryOreRackFrame', 0x504c44, 0.76, 0.72);
  const yellow = material('FoundryOreRackHazard', 0xc18f22, 0.62, 0.5);
  const oreMat = material('FoundryRackOre', 0x3b3129, 0.9, 0.22);
  const charge = signalMaterial('FoundryRackChargeSockets', 0x63300f, 0xff9b23, 0.2);
  for (const z of [-0.52, 0.52]) box(root, 'FoundryRackLongeron', frame, 1.2 * R, 0.11 * R, 0.11 * R,
    0, -0.18 * R, z * R, true);
  for (const x of [-0.55, 0, 0.55]) box(root, 'FoundryRackCrossClamp', yellow, 0.1 * R, 0.42 * R, 1.1 * R,
    x * R, 0, 0, true);
  const oreLoads = [];
  for (let i = 0; i < 3; i++) {
    const load = new THREE.Group();
    load.name = 'FoundryRackPhysicalOreLoad';
    load.position.x = (i - 1) * 0.5 * R;
    load.userData.animated = true;
    root.add(load);
    mesh(load, 'FoundryRackOreBody', new THREE.DodecahedronGeometry(0.25 * R, 0), oreMat, true);
    const socket = mesh(load, 'FoundryRackRecessedChargeSocket', new THREE.TorusGeometry(0.2 * R, 0.035 * R, 5, 10), charge, true);
    socket.rotation.x = Math.PI / 2;
    socket.position.y = 0.18 * R;
    oreLoads.push(load);
  }
  const state = installHeavyController(root, (presentation) => {
    charge.emissiveIntensity = 0.2 + presentation.oreRelease * (presentation.flashReduced ? 0.65 : 2.1);
  });
  const baseSetter = root.userData.setHeavyPresentationState;
  root.userData.setHeavyPresentationState = (channel, value, options) => {
    const accepted = baseSetter(channel, value, options);
    if (channel === 'oreRelease' && options && Number.isFinite(options.uses)) {
      state.uses = Math.max(0, Math.min(3, Math.trunc(options.uses)));
      for (let i = 0; i < oreLoads.length; i++) oreLoads[i].visible = i >= state.uses;
    }
    return accepted;
  };
  return root;
}

function buildDrivePart(entity, partId) {
  const R = Math.max(1, Number(entity.radius) || 5);
  const ramscoop = partId.includes('ramscoop');
  const root = partRoot(partId, ramscoop ? 'oversized-caged-burn-drive' : 'clustered-heavy-drive-bells');
  const shell = material('HeavyDriveBellShell', 0x34363a, 0.46, 0.9);
  const hot = signalMaterial('HeavyDriveRefractoryThroat', 0x48190b, ramscoop ? 0xff5720 : 0x6fc9ff, 0.35);
  const nozzles = ramscoop ? [0] : [-0.36, 0, 0.36];
  for (let i = 0; i < nozzles.length; i++) {
    const z = nozzles[i] * R;
    const bell = cylinder(root, 'HeavyDriveFacetedBell', shell,
      (ramscoop ? 0.58 : 0.28) * R, (ramscoop ? 0.54 : 0.38) * R,
      0, 0, z, ramscoop ? 14 : 10, true);
    bell.rotation.z = Math.PI / 2;
    const throat = cylinder(root, 'HeavyDriveRecessedThroat', hot,
      (ramscoop ? 0.36 : 0.17) * R, 0.06 * R,
      -0.3 * R, 0, z, ramscoop ? 14 : 10, true);
    throat.rotation.z = Math.PI / 2;
  }
  if (!ramscoop) {
    return root;
  }
  const sheets = [];
  // One large drive, one unmistakable burn: the three sheets overlap into an asymmetric plume
  // whose physical length is comparable to the wedge hull instead of reading as another nozzle
  // glow. Their distinct cut lengths prevent a soft-card silhouette at grazing camera angles.
  const lengths = [6.6, 8.1, 5.8];
  for (let i = 0; i < lengths.length; i++) {
    const materialInstance = plasmaSheetMaterial(i);
    const sheet = mesh(root, 'RamscoopAdvectedPlasmaSheet', plasmaSheetGeometry(lengths[i], 0.82 + i * 0.17, i), materialInstance, true);
    sheet.position.set(-0.42 * R, (i - 1) * 0.16 * R, (i - 1) * 0.13 * R);
    sheet.scale.setScalar(R);
    sheets.push({ mesh: sheet, material: materialInstance, baseLength: lengths[i] });
  }
  installHeavyController(root, (state, _part, t) => {
    const heat = 0.08 + state.burn * 0.92;
    hot.emissiveIntensity = 0.35 + state.burn * (state.flashReduced ? 1.15 : 2.9);
    for (let i = 0; i < sheets.length; i++) {
      const record = sheets[i];
      record.material.uniforms.uTime.value = t;
      record.material.uniforms.uHeat.value = heat;
      record.material.uniforms.uFlashCap.value = state.flashReduced ? 0.58 : 1;
      record.mesh.scale.x = R * (0.46 + state.burn * 0.74);
      record.mesh.visible = heat > 0.035;
    }
  });
  return root;
}

function buildMissileRackPart(entity) {
  const R = Math.max(1, Number(entity.radius) || 4);
  const root = partRoot('heavy_ramscoop_missile_rack', 'armored-four-cell-missile-rack');
  const shell = material('HeavyMissileRackShell', 0x4b4142, 0.65, 0.78);
  const bore = material('HeavyMissileRackBore', 0x111215, 0.94, 0.26);
  for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
    const tube = cylinder(root, 'HeavyMissileRootedTube', shell, 0.22 * R, 0.85 * R,
      0, (y - 0.5) * 0.46 * R, (z - 0.5) * 0.5 * R, 8, true);
    tube.rotation.z = Math.PI / 2;
    const aperture = cylinder(root, 'HeavyMissileDarkAperture', bore, 0.14 * R, 0.05 * R,
      0.44 * R, (y - 0.5) * 0.46 * R, (z - 0.5) * 0.5 * R, 8, true);
    aperture.rotation.z = Math.PI / 2;
  }
  return root;
}

function finishHeavyHull(g, stableId, visualLanguage) {
  const outer = g.parent;
  outer.name = `${stableId}_DesignedProceduralRoot`;
  outer.userData.enemySilhouette = HEAVY_PRESENTATION_SILHOUETTES[stableId];
  outer.userData.heavyPresentationId = stableId;
  outer.userData.visualLanguage = visualLanguage;
  outer.userData.genericShipOverlaysSuppressed = true;
  outer.userData.presentationScope = 'plan14-heavy-family-component';
  return outer;
}

function partRoot(partId, visualLanguage) {
  const root = new THREE.Group();
  root.name = `${partId}_PhysicalPresentation`;
  root.userData.kind = 'heavyPart';
  root.userData.heavyPartId = partId;
  root.userData.heavyPartVisual = true;
  root.userData.visualLanguage = visualLanguage;
  return root;
}

function installHeavyController(root, apply) {
  const state = {
    lastT: 0,
    burn: 0, burnTarget: 0,
    launch: 0, launchTarget: 0,
    oreRelease: 0, oreReleaseTarget: 0,
    cutterHeat: 0, cutterHeatTarget: 0,
    launchImpulseAt: -1e9,
    oreImpulseAt: -1e9,
    cutterImpulseAt: -1e9,
    flashReduced: false,
    uses: 0,
  };
  root.userData.heavyPresentationState = state;
  root.userData.setHeavyPresentationState = (channel, value = true, options = null) => {
    if (!HEAVY_CHANNELS.includes(channel)) return false;
    const target = value === true ? 1 : value === false ? 0 : Math.max(0, Math.min(1, Number(value) || 0));
    state[`${channel}Target`] = target;
    if (options && options.reduced === true) state.flashReduced = true;
    else if (options && options.reduced === false) state.flashReduced = false;
    if (channel === 'launch' && target > 0) state.launchImpulseAt = state.lastT;
    if (channel === 'oreRelease' && target > 0) state.oreImpulseAt = state.lastT;
    if (channel === 'cutterHeat' && target > 0) state.cutterImpulseAt = state.lastT;
    return true;
  };
  root.userData.updateRuntimeState = (entity, now) => {
    const t = Number.isFinite(now) ? now : state.lastT;
    const dt = state.lastT > 0 ? Math.max(0, Math.min(0.1, t - state.lastT)) : 1 / 60;
    state.lastT = t;
    if (t - state.launchImpulseAt > 0.24) state.launchTarget = 0;
    if (t - state.oreImpulseAt > 0.34) state.oreReleaseTarget = 0;
    if (t - state.cutterImpulseAt > 0.12) state.cutterHeatTarget = 0;
    for (let i = 0; i < HEAVY_CHANNELS.length; i++) {
      const channel = HEAVY_CHANNELS[i];
      const current = state[channel];
      const target = state[`${channel}Target`];
      const attack = channel === 'burn' ? 3.8 : 11;
      const release = channel === 'burn' ? 1.35 : 3.1;
      const rate = target > current ? attack : release;
      state[channel] = current + (target - current) * (1 - Math.exp(-dt * rate));
    }
    apply(state, entity, t);
  };
  root.userData.updateRuntimeState(null, 0);
  return state;
}

function material(name, color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
}

function signalMaterial(name, color, emissive, intensity) {
  return new THREE.MeshStandardMaterial({
    name, color, emissive, emissiveIntensity: intensity, roughness: 0.38, metalness: 0.54,
  });
}

function mesh(parent, name, geometry, mat, animated = false) {
  const result = new THREE.Mesh(geometry, mat);
  result.name = name;
  // Heavy-family forms are a rare encounter identity and several children are semantic event
  // targets. Keep their authored hierarchy intact instead of letting the generic ship optimizer
  // discard source geometry after a one-off merge; the bounded per-heavy draw cost buys stable
  // physical sockets and allocation-free runtime animation.
  result.userData.animated = true;
  if (animated) result.userData.semanticAnimated = true;
  parent.add(result);
  return result;
}

function box(parent, name, mat, sx, sy, sz, x, y, z, animated = false) {
  const result = mesh(parent, name, new THREE.BoxGeometry(1, 1, 1), mat, animated);
  result.scale.set(sx, sy, sz);
  result.position.set(x, y, z);
  return result;
}

function cylinder(parent, name, mat, radius, length, x, y, z, segments = 10, animated = false) {
  const result = mesh(parent, name, new THREE.CylinderGeometry(radius, radius * 0.82, length, segments), mat, animated);
  result.position.set(x, y, z);
  return result;
}

function loft(parent, name, mat, stations, scale) {
  const result = mesh(parent, name, loftGeometry(stations), mat, true);
  result.scale.setScalar(scale);
  return result;
}

function loftGeometry(stations) {
  const section = [
    [0.14, 1], [0.78, 0.66], [1, 0.12], [0.66, -0.7],
    [-0.2, -1], [-0.72, -0.62], [-0.86, 0.05], [-0.52, 0.72],
  ];
  const vertices = [];
  const indices = [];
  for (let stationIndex = 0; stationIndex < stations.length; stationIndex++) {
    const [x, halfWidth, halfHeight, zBias = 0] = stations[stationIndex];
    for (let pointIndex = 0; pointIndex < section.length; pointIndex++) {
      const [yUnit, zUnit] = section[pointIndex];
      vertices.push(x, yUnit * halfHeight, zBias + zUnit * halfWidth);
    }
  }
  const ring = section.length;
  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex++) {
    const a = stationIndex * ring;
    const b = a + ring;
    for (let pointIndex = 0; pointIndex < ring; pointIndex++) {
      const next = (pointIndex + 1) % ring;
      indices.push(a + pointIndex, b + pointIndex, b + next);
      indices.push(a + pointIndex, b + next, a + next);
    }
  }
  for (let pointIndex = 1; pointIndex < ring - 1; pointIndex++) {
    indices.push(0, pointIndex, pointIndex + 1);
    const last = (stations.length - 1) * ring;
    indices.push(last, last + pointIndex + 1, last + pointIndex);
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function plasmaSheetGeometry(length, width, phase) {
  const stations = 7;
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const x = -length * t;
    const bend = Math.sin(t * Math.PI * 1.6 + phase * 1.3) * width * 0.18;
    const halfWidth = width * (0.4 + t * 0.6);
    for (const side of [-1, 1]) {
      vertices.push(x, bend + side * halfWidth * 0.22, side * halfWidth);
      uvs.push(t, side < 0 ? 0 : 1);
    }
    if (i < stations - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function plasmaSheetMaterial(index) {
  return new THREE.ShaderMaterial({
    name: `RamscoopPlasmaSheet_${index}`,
    uniforms: {
      uTime: { value: 0 },
      uHeat: { value: 0.08 },
      uFlashCap: { value: 1 },
      uCut: { value: [0.74, 0.9, 0.68][index] || 0.8 },
      uColorHot: { value: new THREE.Color(index === 1 ? 0xfff1c2 : 0xffb04a) },
      uColorBody: { value: new THREE.Color(index === 2 ? 0xb84415 : 0xff5a1f) },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vWorldNormal;
      varying vec2 vUvSheet;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vUvSheet = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uHeat;
      uniform float uFlashCap;
      uniform float uCut;
      uniform vec3 uColorHot;
      uniform vec3 uColorBody;
      varying vec3 vWorld;
      varying vec3 vWorldNormal;
      varying vec2 vUvSheet;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float grazing = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDir)), 0.62);
        float travelling = 0.82 + 0.18 * sin(vUvSheet.x * 25.0 - uTime * 10.0 + sin(vUvSheet.x * 9.0 - uTime * 2.4));
        float raggedCut = uCut + 0.045 * sin(vUvSheet.y * 11.0 + uTime * 1.7);
        float materialLeft = 1.0 - smoothstep(raggedCut - 0.16, raggedCut, vUvSheet.x);
        float fold = 0.46 + grazing * 1.64;
        float radiance = uHeat * fold * travelling * materialLeft * uFlashCap;
        vec3 color = mix(uColorBody, uColorHot, clamp(grazing * 0.8 + (1.0 - vUvSheet.x) * 0.35, 0.0, 1.0));
        gl_FragColor = vec4(color * radiance * 4.2, clamp(radiance * 1.3, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
