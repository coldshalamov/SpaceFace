// PQ-017 immutable asset/socket snapshot. These values are verified against both canonical source
// and release GLBs by test/world-site-assets.test.mjs; simulation never parses renderer assets.

const tf = (translation = [0, 0, 0]) => Object.freeze({
  translation: Object.freeze(translation),
  rotation: Object.freeze([0, 0, 0, 1]),
  scale: Object.freeze([1, 1, 1]),
});

const socket = (role, translation) => Object.freeze({ role, transform: tf(translation) });

function sockets(emissiveZ) {
  return Object.freeze({
    SOCKET_Dock_Approach: socket('dock_approach', [48, 0, -2]),
    SOCKET_Emissive: socket('emissive', [0, 0, emissiveZ]),
    SOCKET_Module_Defense: socket('module_defense', [20, -20, -1]),
    SOCKET_Module_Depot: socket('module_depot', [-20, -20, -1]),
    SOCKET_Module_Refinery: socket('module_refinery', [-20, 20, -1]),
    SOCKET_Module_Teleporter: socket('module_teleporter', [20, 20, -1]),
    SOCKET_Structure_Core: socket('structure_core', [0, 0, 0]),
  });
}

const cathedralSockets = Object.freeze({
  INTERACTION_HangarCavity: socket('future_world_site_cavity', [0, 5, 0]),
  SALVAGE_ConduitBank: socket('future_salvage_node', [99.37923431396484, 24.087305068969727, -68.28560638427734]),
  SALVAGE_EngineMachinery: socket('future_salvage_node', [-226.73182678222656, 12.388017654418945, 5.248732566833496]),
  SALVAGE_ServiceRack: socket('future_salvage_node', [-125.59925842285156, -2.267620801925659, -50.781742095947266]),
  SOCKET_Flythrough_Entry: socket('flythrough_entry', [-278.13482666015625, 0.10397624969482422, -31.204429626464844]),
  SOCKET_Flythrough_Exit: socket('flythrough_exit', [303.7676086425781, 23.767391204833984, -45.19260787963867]),
  SOCKET_TheMarker: socket('the_marker', [140.27813720703125, 141.1614532470703, -18.738412857055664]),
  ZONE_Bridge: socket('bridge_zone', [187.67970275878906, 89.22998046875, -27.353229522705078]),
  ZONE_BrokenKeel: socket('broken_keel_zone', [0, -58, 0]),
  ZONE_Propulsion: socket('propulsion_zone', [-240.85142517089844, -1.089632511138916, -23.957263946533203]),
  ZONE_Service_Port: socket('service_zone', [-124.28954315185547, 6.782212257385254, 48.83946228027344]),
  ZONE_Service_Starboard: socket('service_zone', [110.7385025024414, 28.541553497314453, -73.49394989013672]),
});

// PQ-195.00: the Third Shift SP-07 spindle is XZ-symmetric about its long axis; the tow
// sockets at +-14 X are the visible tow points, the +Y service socket the lug side.
const spindleSockets = Object.freeze({
  socket_tow_front: socket('tow_front', [14, 0, 0]),
  socket_tow_aft: socket('tow_aft', [-14, 0, 0]),
  socket_service: socket('service', [3, 11, 0]),
});

// PQ-195.00: the capture fork's origin IS the mouth plane (inward +X), so the mouth
// socket is the placement authority and the visual center is the mouth itself.
const forkSockets = Object.freeze({
  socket_mouth: socket('fork_mouth', [0, 0, 0]),
  socket_seat: socket('fork_seat', [44, 0, 0]),
  socket_service: socket('service', [77, 5.5, 0]),
});

function binding({
  partId,
  assetId,
  sourceSha256,
  releaseSha256,
  sourceBytes,
  releaseBytes,
  rootName,
  visualCenterXZ,
  emissiveZ,
  socketBindings = null,
}) {
  return Object.freeze({
    contractVersion: 1,
    partId,
    assetId,
    source: Object.freeze({ path: `assets/ships/parts/places/${partId}.glb`, sha256: sourceSha256, bytes: sourceBytes }),
    release: Object.freeze({ path: `assets/ships/release/parts/places/${partId}.glb`, sha256: releaseSha256, bytes: releaseBytes }),
    root: Object.freeze({ name: rootName, transform: tf() }),
    visualCenterXZ: Object.freeze(visualCenterXZ),
    sockets: socketBindings || sockets(emissiveZ),
  });
}

export const WORLD_SITE_ASSET_BINDINGS = Object.freeze({
  place_claim_outpost_base: binding({
    partId: 'place_claim_outpost_base', assetId: 'SF_PLACE_CLAIM_OUTPOST_BASE',
    sourceSha256: 'f3a2ac6441c9eddf75a7b6def338d7203394aaa178bac0de2385f7765e8f6f30',
    releaseSha256: '6dab7e40086ddd6c0041977fac879069875d99a1aed52f2cb37962352658b4f0',
    sourceBytes: 6835992, releaseBytes: 7113496,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_BASE_ROOT', visualCenterXZ: { x: 4.2387, z: 0 }, emissiveZ: -8.125,
  }),
  place_claim_outpost_refinery: binding({
    partId: 'place_claim_outpost_refinery', assetId: 'SF_PLACE_CLAIM_OUTPOST_REFINERY',
    sourceSha256: '00ea8e50883d3121298f53f7fcab0092b4d170e8c6e1e19696aef1c32b7e12ef',
    releaseSha256: '63802aa4f426a9031139e939e16f47d0e1e9fc37ea4c1f6c86bb914ec9cf82c7',
    sourceBytes: 12409820, releaseBytes: 8180092,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_REFINERY_ROOT', visualCenterXZ: { x: 2.3174, z: -1.9213 }, emissiveZ: -20.10449981689453,
  }),
  // PQ-022.heist-receivers-promote: the Tethys heist receivers wear their own KEEP re-authored
  // bodies (open-mouth impound fork / asymmetric shielded-handoff receiver). The shared
  // place_claim_outpost_base and _refinery bodies above stay bound to the World Site stages; these
  // entries reuse those sockets/center (+X approach unchanged) under separate place ids.
  place_claim_outpost_catcher: binding({
    partId: 'place_claim_outpost_catcher', assetId: 'SF_PLACE_CLAIM_OUTPOST_CATCHER',
    sourceSha256: '705c277e3dc7e74fd803041a9c3e4502046bd9a6f473cbcb713c3ada8fc17d4b',
    releaseSha256: 'e2943d275bdc9ed02b3340295b72c705e8176082342c22d36828840055f932eb',
    sourceBytes: 6489504, releaseBytes: 1575280,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_CATCHER_ROOT', visualCenterXZ: { x: 4.2387, z: 0 }, emissiveZ: -8.125,
  }),
  place_claim_outpost_fence: binding({
    partId: 'place_claim_outpost_fence', assetId: 'SF_PLACE_CLAIM_OUTPOST_FENCE',
    sourceSha256: 'defefcb65fa80948c7a0d933136986076bc32f807eb448863ffa58e19ad84e65',
    releaseSha256: '8768850defcb8761cb79d4fa7981992b26c12b163f878d4e7b6089860e9ffd1a',
    sourceBytes: 5940356, releaseBytes: 1462828,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_FENCE_ROOT', visualCenterXZ: { x: 2.3174, z: -1.9213 }, emissiveZ: -20.10449981689453,
  }),
  place_claim_outpost_relay: binding({
    partId: 'place_claim_outpost_relay', assetId: 'SF_PLACE_CLAIM_OUTPOST_RELAY',
    sourceSha256: '57f6e1a42d0f1b259aada019e1960d1cbb4f81cbe0aaabfe66ed0248a8e206c9',
    releaseSha256: '85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8',
    sourceBytes: 13424076, releaseBytes: 3338672,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT', visualCenterXZ: { x: 3.3318, z: 0 }, emissiveZ: -24.472501754760742,
  }),
  place_landmark_wreck_cathedral: binding({
    partId: 'place_landmark_wreck_cathedral',
    assetId: 'SF_LANDMARK_PLACE_LANDMARK_WRECK_CATHEDRAL',
    sourceSha256: '7c2f3fcd82235b8a44463320b83d3ee18d377049fe63995d8ebf7b896733ee0e',
    releaseSha256: '32094bcd6df7671e9e2d93ae491a6aab33aa1ca9bd2a32cc3548cb7532eedcca',
    sourceBytes: 18890576,
    releaseBytes: 7563260,
    rootName: 'SF_PLACE_LANDMARK_WRECK_CATHEDRAL_ROOT',
    visualCenterXZ: { x: 16.00636548, z: -12.99468677 },
    socketBindings: cathedralSockets,
  }),
  // PQ-195.00: the Third Shift SP-07 flywheel assembly — the moving industrial load.
  // XZ-symmetric about +X; circumradius 15.02 WU fills (not overfills) its 16 WU body.
  place_breakaway_sp07: binding({
    partId: 'place_breakaway_sp07', assetId: 'SF_PLACE_BREAKAWAY_SP07',
    sourceSha256: '874d8cb389df67422d936c60cf855d65fdc63ffed3d4a68b44a1edffc7d845b5',
    releaseSha256: '67d91f27d4f5380596527242c50f62748465965a1cb942f01fe5ceae41940b73',
    sourceBytes: 76664, releaseBytes: 22212,
    rootName: 'SF_PLACE_BREAKAWAY_SP07_ROOT', visualCenterXZ: { x: 0, z: 0 },
    socketBindings: spindleSockets,
  }),
  // PQ-195.00: the capture fork receiver extension ahead of the Concord Lawful Catcher
  // head. Origin is the mouth plane, inward +X; the mouth socket is the placement
  // authority, so the visual center is the mouth itself.
  place_breakaway_fork: binding({
    partId: 'place_breakaway_fork', assetId: 'SF_PLACE_BREAKAWAY_FORK',
    sourceSha256: '79dfbc9f36be695b11446301e4a20990fdabd8c773e9df7ea36a3879fe161767',
    releaseSha256: '063fe04ea2dd6e49b0fed63b1e7badd19813883f32ac08e46b90629aa7162912',
    sourceBytes: 15712, releaseBytes: 10868,
    rootName: 'SF_PLACE_BREAKAWAY_FORK_ROOT', visualCenterXZ: { x: 0, z: 0 },
    socketBindings: forkSockets,
  }),
});

export function worldSiteAssetBinding(placeId) {
  return WORLD_SITE_ASSET_BINDINGS[placeId] || null;
}

export function worldSiteSocketTransform(placeId, socketName) {
  const bindingValue = worldSiteAssetBinding(placeId);
  return bindingValue && bindingValue.sockets[socketName]
    ? bindingValue.sockets[socketName].transform
    : null;
}

export function validateWorldSiteAssetBinding(value) {
  if (!value || value.contractVersion !== 1 || !value.source || !value.release
    || !value.root || !value.sockets || !finiteXZ(value.visualCenterXZ)) return false;
  if (!validTransform(value.root.transform)) return false;
  return Object.values(value.sockets).every((entry) => entry && typeof entry.role === 'string'
    && entry.role.length > 0 && validTransform(entry.transform));
}

function validTransform(value) {
  return !!value
    && finiteArray(value.translation, 3)
    && finiteArray(value.rotation, 4)
    && finiteArray(value.scale, 3);
}

function finiteArray(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function finiteXZ(value) {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.z);
}

export default WORLD_SITE_ASSET_BINDINGS;
