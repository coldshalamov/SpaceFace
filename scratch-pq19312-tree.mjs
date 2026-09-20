import * as THREE from 'three';
import { buildAuthoredStationArchetype } from './src/render/partsLibrary.js';

const entity = {
  id: 's', type: 'station', alive: true, radius: 34, pos: { x: 0, z: 0 },
  data: { archetypeGlb: 'place_station_trade_hub', placeId: 'place_station_trade_hub', dockRadius: 72, placeScale: 72 / 14 },
};
const visual = buildAuthoredStationArchetype(entity, { releaseMode: true });
function dump(root, d = 0) {
  const g = root.geometry ? ` geom=${root.geometry.type} shared=${!!(root.geometry.userData && root.geometry.userData.spacefaceSharedFallback)}` : '';
  console.log('  '.repeat(d) + `${root.name || root.type} vis=${root.visible}${g}`);
  for (const c of root.children) dump(c, d + 1);
}
dump(visual);
