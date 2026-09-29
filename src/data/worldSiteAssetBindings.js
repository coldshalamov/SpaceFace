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

// Alien Ecology program (design/alien-ecology-program doc 09): the DMC service barge bound for
// the Cinder Nursery site. Socket names are the GLB's own semantic nodes — bridge, container
// row, drive plume, emissive mast — so components sit on real geometry.
const conveyorBargeSockets = Object.freeze({
  SOCKET_Structure_Core: socket('structure_core', [33.8525, 3.0125, 0]),
  SOCKET_Barge_Bridge: socket('bridge_zone', [44, 5.5, 0]),
  SOCKET_Container_Fore: socket('container_row', [12, 5, 0]),
  SOCKET_Container_Mid: socket('container_row', [22, 5, 0]),
  SOCKET_Container_Aft: socket('container_row', [32, 5, 0]),
  SOCKET_Emissive: socket('emissive', [26, 6.2, 0]),
  SOCKET_Drive_Plume: socket('drive_plume', [-2.5, 2.2, 0]),
  SOCKET_Status_Port: socket('status_light', [44, 0, -7.5]),
  SOCKET_Status_Starboard: socket('status_light', [44, 0, 7.5]),
});

export const WORLD_SITE_ASSET_BINDINGS = Object.freeze({
  place_conveyor_barge: binding({
    partId: 'place_conveyor_barge', assetId: 'SF_PLACE_CONVEYOR_BARGE',
    sourceSha256: '12154e7fd39296e695940627d7055e734ab2d43ab885e5cb2717845e7f8b2ca0',
    releaseSha256: '3b8ba39b7fd761864b9d8ee19fb0289b67bb7f7c733778208392007ffdf0ebc8',
    sourceBytes: 12970876, releaseBytes: 4988480,
    rootName: 'place_conveyor_barge', visualCenterXZ: { x: 33.8525, z: 0 },
    socketBindings: conveyorBargeSockets,
  }),
  place_claim_outpost_base: binding({
    partId: 'place_claim_outpost_base', assetId: 'SF_PLACE_CLAIM_OUTPOST_BASE',
    sourceSha256: '257e01e830bbe713ce07ca278669e91ace59a15eede65a56b3ff25182f5bee9f',
    releaseSha256: 'd08e4d868caf74b52bcb25c3a599c8ad8e6b17470e649dfd6e759d21816fdb35',
    sourceBytes: 6835996, releaseBytes: 7113500,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_BASE_ROOT', visualCenterXZ: { x: 4.2387, z: 0 }, emissiveZ: -8.125,
  }),
  place_claim_outpost_refinery: binding({
    partId: 'place_claim_outpost_refinery', assetId: 'SF_PLACE_CLAIM_OUTPOST_REFINERY',
    sourceSha256: '6ad7a62d82f2377bbdc3b0fbf98b4839a1110344afda9593f9b88f35f88b0618',
    releaseSha256: '19dae3e573ba4b17b8cfc27195c25b21aaccaea30b46f62d45b951dbacc5c23f',
    sourceBytes: 12409824, releaseBytes: 8180096,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_REFINERY_ROOT', visualCenterXZ: { x: 2.3174, z: -1.9213 }, emissiveZ: -20.10449981689453,
  }),
  // PQ-022.heist-receivers-promote: the Tethys heist receivers wear their own KEEP re-authored
  // bodies (open-mouth impound fork / asymmetric shielded-handoff receiver). The shared
  // place_claim_outpost_base and _refinery bodies above stay bound to the World Site stages; these
  // entries reuse those sockets/center (+X approach unchanged) under separate place ids.
  place_claim_outpost_catcher: binding({
    partId: 'place_claim_outpost_catcher', assetId: 'SF_PLACE_CLAIM_OUTPOST_CATCHER',
    sourceSha256: '4b26d27ad2329ea067bf5b71903cda422f8536715db4ed760c720d6c6cb916e3',
    releaseSha256: '48e4f76d137f32ad0e707a4ca71176e352cac14e96afd7561408e59220501dea',
    sourceBytes: 6489508, releaseBytes: 1575284,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_CATCHER_ROOT', visualCenterXZ: { x: 4.2387, z: 0 }, emissiveZ: -8.125,
  }),
  place_claim_outpost_fence: binding({
    partId: 'place_claim_outpost_fence', assetId: 'SF_PLACE_CLAIM_OUTPOST_FENCE',
    sourceSha256: '9b33f18117f6b49aff16c3d5ecf5236d98728faf02196d1ec220e8b034cdb2a1',
    releaseSha256: 'ee11627b75fe57eaffcd4c90059b3948b61fd59fa27bb2944f55c330de122cb0',
    sourceBytes: 5940360, releaseBytes: 1462832,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_FENCE_ROOT', visualCenterXZ: { x: 2.3174, z: -1.9213 }, emissiveZ: -20.10449981689453,
  }),
  place_claim_outpost_relay: binding({
    partId: 'place_claim_outpost_relay', assetId: 'SF_PLACE_CLAIM_OUTPOST_RELAY',
    sourceSha256: '699e477da813da803f832ac488f435da415bf1eec23399e7d7a62a7ce767987c',
    releaseSha256: '657d2c829567f2ca5350b4fb23e725be7755b9a1a2b99a97d91dd50b0fd560e2',
    sourceBytes: 13424080, releaseBytes: 3338680,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT', visualCenterXZ: { x: 3.3318, z: 0 }, emissiveZ: -24.472501754760742,
  }),
  place_landmark_wreck_cathedral: binding({
    partId: 'place_landmark_wreck_cathedral',
    assetId: 'SF_LANDMARK_PLACE_LANDMARK_WRECK_CATHEDRAL',
    sourceSha256: 'da8f79004a261bcf9907b46d025528b031a1612ea1d945d2e9c501e14146f23c',
    releaseSha256: '6de8743a60209ce6ce62c12d93832956e85351b1e2fb2025aa474bff7b9e6313',
    sourceBytes: 18890564,
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
