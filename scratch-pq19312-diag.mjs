import * as THREE from 'three';
import {
  buildAuthoredStationArchetype,
  resolvePlaceFileForEntity,
  upgradeAuthoredPlaceBoundaryForProbe,
} from './src/render/partsLibrary.js';

const entity = {
  id: 'success_place_station_trade_hub',
  type: 'station',
  alive: true,
  radius: 34,
  pos: { x: 0, z: 0 },
  data: { archetypeGlb: 'place_station_trade_hub', placeId: 'place_station_trade_hub', dockRadius: 72, placeScale: 72 / 14 },
};

const visual = buildAuthoredStationArchetype(entity, { releaseMode: true });
const scene = new THREE.Scene();
scene.add(visual);
const detailed = visual.children.find((c) => c.name === 'HLOD_Detailed');
const boundary = /AuthoredAssetBoundary/.test(visual.name || '') ? visual : detailed && detailed.children[0];
const fallback = boundary.children.find((c) => /Fallback/.test(c.name || ''));
console.log('boundary:', boundary.name, 'fallback:', fallback.name, 'visible:', fallback.visible);

const geoms = new Set();
fallback.traverse((o) => { if (o.geometry) geoms.add(o.geometry); });
for (const g of geoms) {
  console.log('geom', g.type, 'sharedFlag:', g.userData && g.userData.spacefaceSharedFallback);
  g.addEventListener('dispose', () => {
    console.log('DISPOSED geometry:', g.type, 'uuid:', g.uuid);
    console.log(new Error('dispose trace').stack);
  });
}
const mats = new Set();
fallback.traverse((o) => {
  const list = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  for (const m of list) mats.add(m);
});
for (const m of mats) {
  m.addEventListener('dispose', () => console.log('DISPOSED material:', m.type));
}

const record = {
  url: 'assets/ships/release/parts/places/place_station_trade_hub.glb',
  assetId: 'place_station_trade_hub',
  slot: 'place',
  primitives: [],
  markers: [],
  bounds: { min: [-1, -1, -1], max: [1, 1, 1], size: [2, 2, 2], center: [0, 0, 0] },
  visibleBounds: { min: [-1, -1, -1], max: [1, 1, 1], size: [2, 2, 2], center: [0, 0, 0] },
};
// primitives empty -> buildPlacePropRoot may fail; give one simple primitive
record.primitives = [{
  key: 'x:0', name: 'p0',
  geometry: new THREE.BoxGeometry(1, 1, 1),
  material: new THREE.MeshStandardMaterial({ color: 0x8899aa }),
  matrix: new THREE.Matrix4(),
  tags: {},
}];

const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
  boundary, fallback, entity,
  resolvePlaceFileForEntity(entity),
  {}, scene,
  { releaseMode: true, loadAuthoredPart: async () => record },
);
console.log('swapped:', swapped, 'state:', boundary.userData.authoredAssetState);
