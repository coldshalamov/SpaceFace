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
  place_claim_outpost_relay: binding({
    partId: 'place_claim_outpost_relay', assetId: 'SF_PLACE_CLAIM_OUTPOST_RELAY',
    sourceSha256: 'a93c7b4d8fd23fa925fb99c025a544dacf13716e374261b8c487399c2196fda8',
    releaseSha256: 'dc07ebef0ea61a45e778ecbb8a9ac4dfda4e71e4970433337e0ead084fffdcc2',
    sourceBytes: 13230948, releaseBytes: 8303864,
    rootName: 'SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT', visualCenterXZ: { x: 3.3318, z: 0 }, emissiveZ: -24.472501754760742,
  }),
  place_landmark_wreck_cathedral: binding({
    partId: 'place_landmark_wreck_cathedral',
    assetId: 'SF_LANDMARK_PLACE_LANDMARK_WRECK_CATHEDRAL',
    sourceSha256: 'f335935f9658bad0e721aceb5d66bb4c2f0457fe411442819b4a3455a00af704',
    releaseSha256: 'ca01a624d65fc43eab5d77528ab228195f813e59e7e84dff0a6e69c37757138c',
    sourceBytes: 11155156,
    releaseBytes: 6160076,
    rootName: 'SF_PLACE_LANDMARK_WRECK_CATHEDRAL_ROOT',
    visualCenterXZ: { x: 16.00636548, z: -12.99468677 },
    socketBindings: cathedralSockets,
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
