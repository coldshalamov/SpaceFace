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

function binding({ partId, assetId, sourceSha256, releaseSha256, sourceBytes, releaseBytes, rootName, visualCenterXZ, emissiveZ }) {
  return Object.freeze({
    contractVersion: 1,
    partId,
    assetId,
    source: Object.freeze({ path: `assets/ships/parts/places/${partId}.glb`, sha256: sourceSha256, bytes: sourceBytes }),
    release: Object.freeze({ path: `assets/ships/release/parts/places/${partId}.glb`, sha256: releaseSha256, bytes: releaseBytes }),
    root: Object.freeze({ name: rootName, transform: tf() }),
    visualCenterXZ: Object.freeze(visualCenterXZ),
    sockets: sockets(emissiveZ),
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
