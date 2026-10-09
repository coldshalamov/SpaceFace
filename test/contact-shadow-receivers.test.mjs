import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createContactShadowSelection, selectContactShadowsOnReceivers,
  CONTACT_SHADOW_SURFACE_OFFSET } from '../src/render/contactShadowReceivers.js';

function fixture() {
  const scene = new THREE.Scene(), station = new THREE.Group(), ship = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 1, 32), new THREE.MeshBasicMaterial());
  deck.name = 'Deck'; deck.position.y = -1.5; station.add(deck);
  station.userData.contactShadowReceivers = [{ nodeName: 'Deck', outerRadius: 39.5, y: .5 }];
  ship.userData.hasContactShadow = true; ship.userData.contactShadowRadius = 12;
  station.userData.hasContactShadow = true;
  scene.add(station, ship);
  const stationRecord = { entity: { id: 1, alive: true, type: 'station', data: {} }, mesh: station };
  const shipRecord = { entity: { id: 2, alive: true, type: 'ship', radius: 10 }, mesh: ship };
  const frame = { records: [stationRecord, shipRecord], contactShadows: [stationRecord, shipRecord] };
  const selection = createContactShadowSelection();
  return { scene, station, ship, deck, stationRecord, shipRecord, frame, selection,
    select: () => selectContactShadowsOnReceivers(selection, frame) };
}

test('only a supported ship gets contact ink, at the real deck height without changing the frame', () => {
  const h = fixture();
  Object.freeze(h.frame.records); Object.freeze(h.frame.contactShadows);
  Object.freeze(h.stationRecord); Object.freeze(h.shipRecord); Object.freeze(h.frame);
  const rows = h.select();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entity, h.shipRecord.entity, 'stations never make giant free-space blobs');
  assert.equal(rows[0].shadowY, -1 + CONTACT_SHADOW_SURFACE_OFFSET);
  assert.equal(rows[0].shadowRadius, 12);
  assert.equal(h.frame.contactShadows.length, 2);
  const first = rows[0];
  assert.equal(h.select(), rows, 'the output array is retained');
  assert.equal(h.select()[0], first, 'steady frames reuse records');
  h.ship.position.x = 36;
  assert.equal(h.select()[0].shadowRadius, 3.5, 'the complete ink disc fits within the deck edge');
  h.ship.position.x = 40;
  assert.equal(h.select().length, 0, 'open space receives no ink');
});

test('missing, hidden, detached and unrelated receivers cannot stand in for a deck', () => {
  const h = fixture();
  h.stationRecord.entity.data.dockRadius = 10000;
  delete h.station.userData.contactShadowReceivers;
  assert.equal(h.select().length, 0, 'dock radius alone is not a surface');
  h.station.userData.contactShadowReceivers = [{ nodeName: 'Deck', outerRadius: 39.5, y: .5 }];
  for (const node of [h.station, h.deck, h.ship]) {
    node.visible = false; assert.equal(h.select().length, 0); node.visible = true;
  }
  h.deck.material.visible = false; assert.equal(h.select().length, 0); h.deck.material.visible = true;
  h.station.remove(h.deck); assert.equal(h.select().length, 0, 'a cached retired mesh is not a receiver');
  h.station.add(h.deck);
  h.scene.remove(h.station); assert.equal(h.select().length, 0, 'an unmounted station is not drawn at the origin');
  h.scene.add(h.station);
  const otherScene = new THREE.Scene(); otherScene.add(h.ship);
  assert.equal(h.select().length, 0, 'a receiver in another scene cannot catch this shadow');
  h.scene.add(h.ship);
  h.stationRecord.entity.data.isGate = true; assert.equal(h.select().length, 0);
  h.stationRecord.entity.data.isGate = false;
  h.stationRecord.entity.alive = false; assert.equal(h.select().length, 0);
});

test('surface transforms, floating origin and clone-safe declarations remain physical', () => {
  const h = fixture();
  h.station.scale.set(2, 3, 1);
  h.station.position.set(1000, 0, -2000);
  h.station.rotation.y = Math.PI / 2;
  h.ship.position.set(1000, 0, -2072);
  let row = h.select()[0];
  assert.ok(row);
  assert.equal(row.shadowY, -3 + CONTACT_SHADOW_SURFACE_OFFSET);
  assert.ok(Math.abs(row.shadowRadius - 3.5) < 1e-10, 'nonuniform scales conservatively fit the whole circle');
  h.station.position.x -= 1000; h.ship.position.x -= 1000;
  h.station.position.z += 2000; h.ship.position.z += 2000;
  row = h.select()[0];
  assert.equal(row.shadowX, 0); assert.equal(row.shadowZ, -72);
  assert.equal(row.shadowY, -3 + CONTACT_SHADOW_SURFACE_OFFSET);
  const replacement = h.station.clone();
  h.scene.remove(h.station); h.scene.add(replacement); h.stationRecord.mesh = replacement;
  assert.ok(h.select()[0], 'a cloned declared receiver resolves its own cloned deck');
  replacement.rotation.x = .15;
  assert.equal(h.select().length, 0, 'the horizontal pool must not fake a tilted plane');
  replacement.rotation.x = 0; replacement.scale.x = 0;
  assert.equal(h.select().length, 0, 'zero-area geometry cannot support ink');
});

test('receiver visibility and admission changes update cached node bindings without repeated scans', () => {
  const h = fixture();
  let lookups = 0;
  const lookup = h.station.getObjectByName.bind(h.station);
  h.station.getObjectByName = name => { lookups++; return lookup(name); };
  assert.equal(h.select().length, 1); assert.equal(lookups, 1);
  h.select(); h.select(); assert.equal(lookups, 1);
  h.station.remove(h.deck);
  h.select(); h.select(); assert.equal(lookups, 1, 'retired roots do not rescan every frame');
  const next = h.deck.clone(); h.station.add(next);
  assert.equal(h.select().length, 0, 'replacement must publish a new admission');
  h.station.userData.admissionEpoch = 2;
  assert.equal(h.select().length, 1); assert.equal(lookups, 2);
  next.visible = false; assert.equal(h.select().length, 0); next.visible = true;
  assert.equal(h.select().length, 1); assert.equal(lookups, 2);
  h.station.userData.contactShadowReceivers = [{ nodeName: 'Absent', outerRadius: 10, y: 0 }];
  h.select(); h.select(); assert.equal(lookups, 3, 'negative lookups are cached too');
});

test('trade-hub annulus follows the visible authored LOD and preserves its open centre', () => {
  const h = fixture();
  h.station.clear(); delete h.station.userData.contactShadowReceivers;
  h.station.userData.placeId = 'place_station_trade_hub';
  h.station.userData.authoredAssetState = 'authored';
  const decks = [0, 1, 2].map(lod => {
    const geometry = new THREE.RingGeometry(16, 41, 80).rotateX(-Math.PI / 2).translate(3, 9.6, 0);
    const deck = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    deck.name = `LOD${lod}_Hull_apron`; deck.position.y = -12; deck.visible = lod === 0;
    h.station.add(deck); return deck;
  });
  h.ship.position.x = 30;
  assert.ok(Math.abs(h.select()[0].shadowY - (-2.4 + CONTACT_SHADOW_SURFACE_OFFSET)) < 1e-10);
  assert.ok(Math.abs(h.select()[0].shadowRadius - 10.8) < 1e-10);
  h.ship.position.x = 3; assert.equal(h.select().length, 0, 'the courtyard hole is not a deck');
  h.ship.position.x = 30; decks[0].visible = false;
  assert.equal(h.select().length, 0);
  decks[2].visible = true; assert.equal(h.select().length, 1, 'the active LOD supplies the receiver');
  decks[2].position.y = 0;
  assert.equal(h.select().length, 0, 'ships below the authored apron never get ink above their hull');
});

test('distant or elevated surfaces are not contact and array callers obey the same support contract', () => {
  const h = fixture();
  h.deck.position.y = 1;
  assert.equal(h.select().length, 0);
  h.deck.position.y = -100;
  assert.equal(h.select().length, 0, 'distant receivers are left to directional shadows');
  h.deck.position.y = -1.5;
  const meshes = new Map([[1, h.station], [2, h.ship]]);
  assert.equal(selectContactShadowsOnReceivers(h.selection,
    [h.stationRecord.entity, h.shipRecord.entity], meshes).length, 1);
  h.shipRecord.entity._noShadow = true;
  assert.equal(h.select().length, 0);
});

test('the real procedural station keeps its declared deck through static merging and LOD', async () => {
  const { createVisualFactory, invalidateVisualFactoryCaches } = await import('../src/render/visualFactory.js');
  const previousDocument = globalThis.document, previousThrow = globalThis.__SF_VISUAL_FACTORY_THROW__;
  const context = {
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData() {}, measureText: () => ({ width: 10 }),
  };
  globalThis.document = { createElement: () => ({ width: 256, height: 256, style: {},
    getContext: () => context, addEventListener() {} }) };
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  try {
    const h = fixture();
    const station = createVisualFactory().build({ id: 108, type: 'station', radius: 40, data: {} });
    const deck = station.getObjectByName('Station_ContactDeck');
    assert.ok(deck?.isMesh, 'static merging must retain the actual receiving surface');
    assert.equal(deck.receiveShadow, true, 'directional shadows remain enabled');
    assert.ok(station.userData.contactShadowReceivers.some(spec => spec.nodeName === deck.name));
    h.scene.remove(h.station); h.scene.add(station); h.stationRecord.mesh = station;
    h.ship.position.x = 24;
    assert.ok(h.select()[0]);
    assert.ok(Math.abs(h.select()[0].shadowY - (-12 + CONTACT_SHADOW_SURFACE_OFFSET)) < 1e-8);
    station.userData.updateLod('lod2');
    assert.ok(h.select()[0], 'the supporting deck remains visible at the distant LOD');
    deck.visible = false;
    assert.equal(h.select().length, 0, 'the declaration cannot keep a hidden receiver alive');
  } finally {
    invalidateVisualFactoryCaches();
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousThrow === undefined) delete globalThis.__SF_VISUAL_FACTORY_THROW__; else globalThis.__SF_VISUAL_FACTORY_THROW__ = previousThrow;
  }
});
