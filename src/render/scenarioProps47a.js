import * as THREE from 'three';

export const SCENARIO_47A_PROP_ASSET_IDS = Object.freeze({
  'asset.slice.47a_spindle': 'SF_47A_EVIDENCE_SPINDLE',
  'asset.slice.bourse_carrier_wreck': 'SF_47A_BOURSE_CARRIER_WRECK',
  'asset.slice.civilian_pod': 'SF_47A_CIVILIAN_POD',
  'asset.slice.kessler_handoff_beacon': 'SF_47A_KESSLER_HANDOFF_BEACON',
});

export function build47aScenarioProp(entity) {
  const ref = scenarioAssetRef(entity);
  switch (ref) {
    case 'asset.slice.47a_spindle': return buildEvidenceSpindle(entity);
    case 'asset.slice.bourse_carrier_wreck': return buildBourseCarrierWreck(entity);
    case 'asset.slice.civilian_pod': return buildCivilianPod(entity);
    case 'asset.slice.kessler_handoff_beacon': return buildKesslerHandoffBeacon(entity);
    default: return null;
  }
}

function scenarioAssetRef(entity) {
  return entity && entity.data && typeof entity.data.assetRef === 'string'
    ? entity.data.assetRef
    : '';
}

function rootFor(entity, name, assetId, kind, contract) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.kind = kind || 'scenario-prop';
  root.userData.assetId = assetId;
  root.userData.scenarioAssetRef = scenarioAssetRef(entity);
  root.userData.renderContract = {
    coordinateSystem: '+X forward, +Y up, +Z starboard',
    authoredMetres: true,
    slice: '47-A',
    ...contract,
  };
  return root;
}

function standard(name, color, roughness = 0.65, metalness = 0.3, options = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
  mat.name = name;
  return mat;
}

function glow(name, color, intensity = 1.8, opacity = 1) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.28,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  mat.name = name;
  return mat;
}

function addBox(parent, mat, name, size, pos, rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinderX(parent, mat, name, radius, length, pos, segments = 16) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, segments).rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addTorusX(parent, mat, name, radius, tube, pos, radial = 12, tubular = 32) {
  const geo = new THREE.TorusGeometry(radius, tube, radial, tubular).rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addSocket(parent, name, pos, role, forward = [1, 0, 0]) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.set(pos[0], pos[1], pos[2]);
  socket.userData = { spacefaceSocket: true, role, forward };
  parent.add(socket);
  return socket;
}

function attachPulse(mesh, base = 1, amp = 0.35, hz = 1.4) {
  if (!mesh || !mesh.material) return;
  mesh.onBeforeRender = () => {
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() * 0.001 : Date.now() * 0.001;
    mesh.material.emissiveIntensity = base + Math.sin(now * Math.PI * 2 * hz) * amp;
  };
}

function buildEvidenceSpindle(entity) {
  const R = Math.max(6, entity && entity.radius || 10);
  const root = rootFor(entity, 'Evidence_Spindle_47A', SCENARIO_47A_PROP_ASSET_IDS['asset.slice.47a_spindle'], 'payload', {
    nominalDimensions: [R * 3.0, R * 1.2, R * 1.2],
    sockets: ['SOCKET_Tether_Massline', 'SOCKET_Camera_Focus'],
    grammar: 'sealed evidence object, false-mass bands, unstable signal core',
  });

  const hull = standard('Spindle_Sealed_Hull', '#566170', 0.58, 0.45);
  const dark = standard('Spindle_Black_Clamp', '#151922', 0.7, 0.5);
  const brass = standard('Spindle_Ledger_Brass', '#b58a45', 0.42, 0.62);
  const signal = glow('Spindle_Signal_Pulse', '#62e6ff', 2.4, 0.88);

  const body = addCylinderX(root, hull, 'Spindle_FalseMass_Cylinder', R * 0.42, R * 2.4, [0, 0, 0], 24);
  body.userData.keepSeparate = true;
  addCylinderX(root, signal, 'Spindle_Locked_Core_Glow', R * 0.24, R * 2.48, [0, 0, 0], 18);
  for (const x of [-0.95, -0.35, 0.35, 0.95]) {
    addTorusX(root, dark, `Spindle_Clamp_${Math.round((x + 1) * 100)}`, R * 0.48, R * 0.035, [x * R, 0, 0], 8, 20);
  }
  for (const z of [-1, 1]) {
    addBox(root, brass, `Spindle_Seal_Tag_${z < 0 ? 'Port' : 'Starboard'}`, [R * 0.36, R * 0.05, R * 0.12], [R * 0.28, R * 0.44, z * R * 0.32], [0, 0, z * 0.14]);
  }
  const ping = addTorusX(root, signal, 'Spindle_Signal_Ring', R * 0.68, R * 0.018, [0, 0, 0], 10, 36);
  ping.material = ping.material.clone();
  attachPulse(ping, 1.8, 0.55, 1.1);

  addSocket(root, 'SOCKET_Tether_Massline', [0, 0, 0], 'tether', [1, 0, 0]);
  addSocket(root, 'SOCKET_Camera_Focus', [0, R * 0.25, 0], 'camera');
  return root;
}

function buildBourseCarrierWreck(entity) {
  const R = Math.max(48, entity && entity.radius || 92);
  const root = rootFor(entity, 'Bourse_Carrier_Wreck_47A', SCENARIO_47A_PROP_ASSET_IDS['asset.slice.bourse_carrier_wreck'], 'wreck', {
    nominalDimensions: [R * 1.9, R * 0.45, R * 1.05],
    sockets: ['SOCKET_Camera_Focus', 'SOCKET_Hazard_Core'],
    grammar: 'fractured carrier landmark, cover debris, unstable mass-lit ribs',
  });

  const char = standard('Bourse_Charred_Plate', '#29251f', 0.95, 0.22);
  const rib = standard('Bourse_Exposed_Rib', '#5d5448', 0.8, 0.48);
  const ember = glow('Bourse_Fracture_Ember', '#ff7a35', 1.35, 0.8);
  const signal = glow('Bourse_Mass_Echo', '#62e6ff', 1.2, 0.7);

  addBox(root, char, 'Bourse_Carrier_Spine', [R * 1.25, R * 0.14, R * 0.16], [-R * 0.05, 0, 0], [0.04, -0.12, 0.02]);
  addBox(root, char, 'Bourse_Broken_FlightDeck', [R * 0.92, R * 0.08, R * 0.42], [R * 0.05, R * 0.08, R * 0.26], [0.08, -0.18, 0.18]);
  addBox(root, char, 'Bourse_Cargo_Bay_Shell', [R * 0.76, R * 0.11, R * 0.34], [-R * 0.28, -R * 0.05, -R * 0.34], [-0.05, 0.1, -0.22]);
  for (let i = 0; i < 6; i++) {
    const x = -R * 0.55 + i * R * 0.19;
    const side = i % 2 === 0 ? -1 : 1;
    addBox(root, rib, `Bourse_Rib_${i}`, [R * 0.035, R * 0.32, R * 0.82], [x, R * 0.04, side * R * 0.08], [0.25, 0.04 * side, 0.55 * side]);
  }
  for (let i = 0; i < 4; i++) {
    const x = -R * 0.42 + i * R * 0.3;
    const z = (i % 2 === 0 ? 1 : -1) * R * 0.42;
    const chunk = addBox(root, char, `Bourse_Debris_Cover_${i}`, [R * 0.22, R * 0.1, R * 0.18], [x, -R * 0.04, z], [0.2 * i, 0.5 - i * 0.2, 0.34]);
    chunk.userData.coverDebris = true;
  }
  addTorusX(root, ember, 'Bourse_Fracture_Arc', R * 0.36, R * 0.012, [-R * 0.08, R * 0.02, 0], 8, 32);
  const echo = addTorusX(root, signal, 'Bourse_Mass_Echo_Ring', R * 0.55, R * 0.01, [R * 0.18, R * 0.03, 0], 8, 40);
  attachPulse(echo, 0.9, 0.25, 0.7);

  addSocket(root, 'SOCKET_Hazard_Core', [0, 0, 0], 'hazard');
  addSocket(root, 'SOCKET_Camera_Focus', [0, R * 0.18, 0], 'camera');
  return root;
}

function buildCivilianPod(entity) {
  const R = Math.max(5, entity && entity.radius || 8);
  const root = rootFor(entity, 'Civilian_Pod_47A', SCENARIO_47A_PROP_ASSET_IDS['asset.slice.civilian_pod'], 'payload', {
    nominalDimensions: [R * 2.1, R * 1.0, R * 1.0],
    sockets: ['SOCKET_Tether_Massline', 'SOCKET_Camera_Focus'],
    grammar: 'fragile rescue pod, pressure warning, human priority signal',
  });

  const hull = standard('CivilianPod_White_Ceramic', '#d8dedc', 0.5, 0.18);
  const scorch = standard('CivilianPod_Scorch', '#3c3734', 0.88, 0.08);
  const stripe = glow('CivilianPod_Distress_Red', '#ff405c', 1.9, 0.9);
  const glass = glow('CivilianPod_Port_Glass', '#88eaff', 1.3, 0.72);

  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.42, R * 1.1, 6, 16).rotateZ(Math.PI / 2), hull);
  capsule.name = 'CivilianPod_Pressure_Capsule';
  capsule.castShadow = true;
  root.add(capsule);
  addCylinderX(root, scorch, 'CivilianPod_Aft_Scorch_Band', R * 0.43, R * 0.16, [-R * 0.78, 0, 0], 16);
  addTorusX(root, stripe, 'CivilianPod_Distress_Band', R * 0.46, R * 0.025, [R * 0.26, 0, 0], 8, 24);
  const beacon = addTorusX(root, stripe, 'CivilianPod_Distress_Beacon', R * 0.62, R * 0.018, [R * 0.15, R * 0.18, 0], 8, 32);
  attachPulse(beacon, 1.4, 0.5, 1.7);
  for (const z of [-1, 1]) {
    addBox(root, glass, `CivilianPod_Port_${z < 0 ? 'Port' : 'Starboard'}`, [R * 0.12, R * 0.2, R * 0.03], [R * 0.26, R * 0.12, z * R * 0.43], [0, 0, 0]);
  }

  addSocket(root, 'SOCKET_Tether_Massline', [0, 0, 0], 'tether');
  addSocket(root, 'SOCKET_Camera_Focus', [0, R * 0.18, 0], 'camera');
  return root;
}

function buildKesslerHandoffBeacon(entity) {
  const zoneR = Math.max(36, entity && entity.radius || 80);
  const R = Math.min(28, zoneR * 0.32);
  const root = rootFor(entity, 'Kessler_Handoff_Beacon_47A', SCENARIO_47A_PROP_ASSET_IDS['asset.slice.kessler_handoff_beacon'], 'beacon', {
    nominalDimensions: [R * 2.2, R * 2.0, R * 2.2],
    sockets: ['SOCKET_Handoff_Core', 'SOCKET_Camera_Focus'],
    grammar: 'covert handoff zone, narrow-band beacon, spatial objective ring',
  });

  const mast = standard('HandoffBeacon_Dark_Mast', '#171a24', 0.7, 0.55);
  const quiet = glow('HandoffBeacon_Quiet_Violet', '#8d66ff', 1.7, 0.85);
  const cyan = glow('HandoffBeacon_Encrypted_Cyan', '#63e6ff', 1.1, 0.72);
  const zone = new THREE.Mesh(
    new THREE.CircleGeometry(zoneR, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x8d66ff, transparent: true, opacity: 0.08, depthWrite: false }),
  );
  zone.name = 'HandoffBeacon_Zone_Disc';
  zone.renderOrder = -1;
  root.add(zone);

  addCylinderX(root, mast, 'HandoffBeacon_Crossbar', R * 0.08, R * 1.2, [0, R * 0.55, 0], 10);
  addBox(root, mast, 'HandoffBeacon_Spine', [R * 0.16, R * 1.25, R * 0.16], [0, R * 0.45, 0]);
  const ring = addTorusX(root, quiet, 'HandoffBeacon_Covert_Ring', R * 0.72, R * 0.035, [0, R * 0.58, 0], 10, 40);
  ring.rotation.z = Math.PI / 2;
  attachPulse(ring, 1.2, 0.3, 0.9);
  addTorusX(root, cyan, 'HandoffBeacon_Inner_Cipher', R * 0.36, R * 0.02, [0, R * 0.58, 0], 8, 32).rotation.x = 0.5;
  addBox(root, quiet, 'HandoffBeacon_KeySlot', [R * 0.18, R * 0.18, R * 0.52], [0, R * 0.58, 0]);

  addSocket(root, 'SOCKET_Handoff_Core', [0, R * 0.58, 0], 'objective');
  addSocket(root, 'SOCKET_Camera_Focus', [0, R * 0.6, 0], 'camera');
  return root;
}
