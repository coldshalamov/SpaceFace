import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  applyProjectedDetailLod,
  attachPlaceHlod,
  attachStationHlod,
  isFarDetailSurface,
} from '../src/render/hlod.js';

function mesh(name, tags = {}) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  object.name = name;
  object.userData.spacefaceTags = tags;
  return object;
}

test('station HLOD keeps identity and hides far greebles at lod2', () => {
  const root = new THREE.Group();
  const hull = mesh('Hull');
  const greeble = mesh('Greeble_A', { greeble: true });
  const decal = mesh('Decal_Warn', { decal: true });
  root.add(hull, greeble, decal);
  const station = attachStationHlod(root, {
    type: 'station',
    radius: 80,
    data: { stationId: 'station_probe', dockRadius: 80 },
  });
  station.userData.updateLod('lod2');
  assert.equal(station.uuid, root.uuid);
  assert.equal(hull.visible, true);
  assert.equal(greeble.visible, false);
  assert.equal(decal.visible, false);
  assert.ok(station.userData.hlod.farDetailHidden >= 2);
  station.userData.updateLod('lod0');
  assert.equal(greeble.visible, true);
  assert.equal(decal.visible, true);
});

test('place HLOD uses the same projected-detail helper', () => {
  const root = new THREE.Group();
  const antenna = mesh('Antenna_Array');
  root.add(mesh('PlaceHull'), antenna);
  assert.equal(isFarDetailSurface(antenna), true);
  attachPlaceHlod(root, { type: 'fx', radius: 40, data: { placeId: 'place_probe' } });
  assert.equal(applyProjectedDetailLod(root, 'lod2'), 1);
  assert.equal(antenna.visible, false);
});
