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
  // P03: exact source/release socket snapshots. Source metres ×2; retain authoring origin.
  place_ceres_second_measure: binding({
    partId: 'place_ceres_second_measure', assetId: 'SF_PLACE_CERES_SECOND_MEASURE',
    sourceSha256: 'b01f8132f1bea8aa58b984a5f3d373b282293aedd91ebadb196fb63e934657f8',
    releaseSha256: '009c76381c60544613b95f0deb3276cb9a377eee86507e8e800b4c9e09cd31f9',
    sourceBytes: 8031740, releaseBytes: 2894544,
    rootName: 'SF_PLACE_CERES_SECOND_MEASURE_ROOT', visualCenterXZ: { x: 0, z: 0 },
    socketBindings: Object.freeze({
      SOCKET_Section_Crossbeam: socket('attachment', [40,0,0]),
      SOCKET_Section_Keel: socket('attachment', [0,0,35]),
      SOCKET_Section_LongPlate: socket('attachment', [-40,0,0]),
      SOCKET_Structure_Core: socket('attachment', [0,0,0]),
      SOCKET_Support_A: socket('attachment', [-59,0,-27.5]),
      SOCKET_Support_B: socket('attachment', [59,0,-27.5]),
      SOCKET_Support_C: socket('attachment', [20.25,0,47.5]),
    }),
  }),
  place_ceres_second_measure_long_plate: binding({
    partId: 'place_ceres_second_measure_long_plate', assetId: 'SF_PLACE_CERES_SECOND_MEASURE_LONG_PLATE',
    sourceSha256: '05aebdd9b8d70127a4476d0df32115ec859aa60949b5a7098faf29113529bf66',
    releaseSha256: '29625dac9588d3d9e44f8b88c46cd2fb679d0e3cb492ddafd4d3199562ebc61b',
    sourceBytes: 1006192, releaseBytes: 366992,
    rootName: 'SF_PLACE_CERES_SECOND_MEASURE_LONG_PLATE_ROOT', visualCenterXZ: { x: 0, z: 0 },
    socketBindings: Object.freeze({
      SOCKET_Cut_A: socket('attachment', [0,0,-27.5]),
      SOCKET_Cut_B: socket('attachment', [0,0,27.5]),
      SOCKET_Recovery: socket('attachment', [0,0,0]),
      SOCKET_Tow: socket('attachment', [0,2.5,0]),
    }),
  }),
  place_ceres_second_measure_crossbeam: binding({
    partId: 'place_ceres_second_measure_crossbeam', assetId: 'SF_PLACE_CERES_SECOND_MEASURE_CROSSBEAM',
    sourceSha256: '7eab2b2e81cfdc023c3d60c3dd31309c88a0d0f1f36f6f1a4d6ff665c0e214c2',
    releaseSha256: '985bac61950a8ec8c1754ad444627e8aa7ffa8a083cee3dedb4cf0a5fbc24187',
    sourceBytes: 887356, releaseBytes: 337436,
    rootName: 'SF_PLACE_CERES_SECOND_MEASURE_CROSSBEAM_ROOT', visualCenterXZ: { x: 0, z: 0 },
    socketBindings: Object.freeze({
      SOCKET_Cut_A: socket('attachment', [0,0,-27.5]),
      SOCKET_Cut_B: socket('attachment', [0,0,27.5]),
      SOCKET_Recovery: socket('attachment', [0,0,0]),
      SOCKET_Tow: socket('attachment', [0,3,0]),
    }),
  }),
  place_ceres_second_measure_keel: binding({
    partId: 'place_ceres_second_measure_keel', assetId: 'SF_PLACE_CERES_SECOND_MEASURE_KEEL',
    sourceSha256: '027ca81e41c1f106fcc87fb723090ad968a0a2f12d8ed5d2ba8e9503712aeef2',
    releaseSha256: 'b8b0cdd789cd4de83f5766554c7ec3f72c03ea31f26d641a2c625411161b2c33',
    sourceBytes: 500848, releaseBytes: 229808,
    rootName: 'SF_PLACE_CERES_SECOND_MEASURE_KEEL_ROOT', visualCenterXZ: { x: 0, z: 0 },
    socketBindings: Object.freeze({
      SOCKET_Cut_A: socket('attachment', [-17.5,0,0]),
      SOCKET_Cut_B: socket('attachment', [17.5,0,0]),
      SOCKET_Recovery: socket('attachment', [0,0,0]),
      SOCKET_Tow: socket('attachment', [0,3,0]),
    }),
  }),
  place_conveyor_barge: binding({
    partId: 'place_conveyor_barge', assetId: 'SF_PLACE_CONVEYOR_BARGE',
    sourceSha256: '777b899e007341f0bfb72f11b73d40d07f526c095a37a252b8179faee811b582',
    releaseSha256: '3665d4d8b4d443d6b9b6e883394c6ffb9fa365f206dd58acab894eea1b472e0d',
    sourceBytes: 1015148, releaseBytes: 559352,
    rootName: 'place_conveyor_barge', visualCenterXZ: { x: 33.8525, z: 0 },
    socketBindings: conveyorBargeSockets,
  }),
  place_claim_outpost_base: binding({
    partId: 'place_claim_outpost_base', assetId: 'SF_PLACE_CLAIM_OUTPOST_BASE',
    sourceSha256: '47f9ed4c7283eeca1b104a9f2a8714feea078664cf8945baac96d8d6d85ae3c6',
    releaseSha256: '39949e590427a67e4156d2e9f01acb0b1f3ef2051e7b7f8d0e2e434264a529eb',
    sourceBytes: 2634400, releaseBytes: 833552,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_BASE_ROOT', visualCenterXZ: { x: 4.2387, z: 0 }, emissiveZ: -8.125,
  }),
  place_claim_outpost_refinery: binding({
    partId: 'place_claim_outpost_refinery', assetId: 'SF_PLACE_CLAIM_OUTPOST_REFINERY',
    sourceSha256: '208eb07d2af1dac691c4548eca2a9991f365d76e363a8f2984eec449d311b270',
    releaseSha256: '986c1991d136d05b4dce1dea7eeefda93bbce0c698822a40bb7acc233d8a62d9',
    sourceBytes: 3736864, releaseBytes: 1142984,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_REFINERY_ROOT', visualCenterXZ: { x: 2.3174, z: -1.9213 }, emissiveZ: -20.10449981689453,
  }),
  // PQ-022.heist-receivers-promote: the Tethys heist receivers wear their own KEEP re-authored
  // bodies (open-mouth impound fork / asymmetric shielded-handoff receiver). The shared
  // place_claim_outpost_base and _refinery bodies above stay bound to the World Site stages; these
  // entries reuse those sockets/center (+X approach unchanged) under separate place ids.
  place_claim_outpost_catcher: binding({
    partId: 'place_claim_outpost_catcher', assetId: 'SF_PLACE_CLAIM_OUTPOST_CATCHER',
    sourceSha256: 'bb98193733b91009c9be2ad26945d2e91bd2fadc94563942e5edb85dd98a21af',
    releaseSha256: '62b0b8f49e877c2b49ed7397fe5cc32cd0e561d4c2167a0171626353a2c77e97',
    sourceBytes: 3549220, releaseBytes: 1094540,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_CATCHER_ROOT', visualCenterXZ: { x: 4.2387, z: 0 }, emissiveZ: -8.125,
  }),
  place_claim_outpost_fence: binding({
    partId: 'place_claim_outpost_fence', assetId: 'SF_PLACE_CLAIM_OUTPOST_FENCE',
    sourceSha256: '5ca570eb29ea10c5594ca7abe6c2ae6ff1c7426235a7739ae3553cab6ad8d414',
    releaseSha256: '9cf8ee23dea1a2e75dda5221799f5a50de9762fa905ec114ef778dae075e1c68',
    sourceBytes: 3637652, releaseBytes: 1120196,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_FENCE_ROOT', visualCenterXZ: { x: 2.3174, z: -1.9213 }, emissiveZ: -20.10449981689453,
  }),
  place_claim_outpost_relay: binding({
    partId: 'place_claim_outpost_relay', assetId: 'SF_PLACE_CLAIM_OUTPOST_RELAY',
    sourceSha256: '945d66a35df8d0c2c4b553cb8b5e5653c30fbae07a21cb17563f29f83cd7e005',
    releaseSha256: 'b9d6bca8703a33ada88f78fd4770949a82906e6ad40fe04b5c1336b1a5302ff0',
    sourceBytes: 3189868, releaseBytes: 1004408,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT', visualCenterXZ: { x: 3.3318, z: 0 }, emissiveZ: -24.472501754760742,
  }),
  place_landmark_wreck_cathedral: binding({
    partId: 'place_landmark_wreck_cathedral',
    assetId: 'SF_LANDMARK_PLACE_LANDMARK_WRECK_CATHEDRAL',
    sourceSha256: 'da8f79004a261bcf9907b46d025528b031a1612ea1d945d2e9c501e14146f23c',
    releaseSha256: '6de8743a60209ce6ce62c12d93832956e85351b1e2fb2025aa474bff7b9e6313',
    sourceBytes: 18890564,
    releaseBytes: 7563264,
    rootName: 'SF_PLACE_LANDMARK_WRECK_CATHEDRAL_ROOT',
    visualCenterXZ: { x: 16.00636548, z: -12.99468677 },
    socketBindings: cathedralSockets,
  }),
  // PQ-195.00: the Third Shift SP-07 flywheel assembly — the moving industrial load.
  // XZ-symmetric about +X; circumradius 15.02 WU fills (not overfills) its 16 WU body.
  place_breakaway_sp07: binding({
    partId: 'place_breakaway_sp07', assetId: 'SF_PLACE_BREAKAWAY_SP07',
    sourceSha256: '220955d866d318956720858b97880b0927ad708885dbf8d1b0ad4b146499de6f',
    releaseSha256: '74808d3568c43a8820eccac64d7763e3afe98c0c4e5d3c6d7fb034f931e13663',
    sourceBytes: 861372, releaseBytes: 543700,
    rootName: 'SF_PLACE_BREAKAWAY_SP07_ROOT', visualCenterXZ: { x: 0, z: 0 },
    socketBindings: spindleSockets,
  }),
  // PQ-195.00: the capture fork receiver extension ahead of the Concord Lawful Catcher
  // head. Origin is the mouth plane, inward +X; the mouth socket is the placement
  // authority, so the visual center is the mouth itself.
  place_breakaway_fork: binding({
    partId: 'place_breakaway_fork', assetId: 'SF_PLACE_BREAKAWAY_FORK',
    sourceSha256: '45a72f3d578576159aa7b9e2c7cde8adce155e5a58b0d80eaa6ab9df979a14c3',
    releaseSha256: '304774edaa0515f6a2ad000ea14b21591d1942f6a2130efb62ee4e486409b4f7',
    sourceBytes: 1216060, releaseBytes: 614420,
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
