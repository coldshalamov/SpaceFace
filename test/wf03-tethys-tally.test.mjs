// WF-03 — The Tally: the toll/count plaza on Tethys' inbound Helios approach.
// The pocket must exist, spawn at its authored positions, name its verb on the HUD
// (zoneAt reads "The Tally" inside the scan gate), sit ON the arrival chord a player
// from Helios actually flies, and hand off to the Customs Gate scan face. The disputed
// keg is the pocket's one ropeable body. Seed 4242 drives the spawn pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector, zoneAt, zoneThreat } from '../src/data/sectorZones.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { world as worldProto } from '../src/systems/world.js';
import { mulberry32 } from '../src/core/rng.js';

const SECTOR_ID = 'sector_tethys_junction';
const ZONE_ID = 'zone_tethys_tally';
const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

const TALLY_POI_IDS = [
  'poi_tethys_tally_queue_head',
  'poi_tethys_tally_queue_inner',
  'poi_tethys_tally_gate_red',
  'poi_tethys_tally_gate_green',
  'poi_tethys_tally_post',
  'poi_tethys_tally_rack',
  'poi_tethys_tally_pod',
  'poi_tethys_tally_light',
];

const HELIOS_GATE = { x: -2729, z: -1819 };
const MERIDIAN = { x: 1050, z: 380 };
const CUSTOMS = { x: -640, z: -1180 };

function sector() {
  const found = SECTORS.find((s) => s.id === SECTOR_ID);
  assert.ok(found, `${SECTOR_ID} exists after anchor merge`);
  return found;
}

function tallyPois(sec = sector()) {
  return TALLY_POI_IDS.map((id) => {
    const poi = sec.pois.find((p) => p.id === id);
    assert.ok(poi, `${id} present in ${SECTOR_ID} pois`);
    assert.ok(Number.isFinite(poi.pos?.x) && Number.isFinite(poi.pos?.z), `${id} carries an inline sector-local pos`);
    return poi;
  });
}

function poiById(id) {
  const poi = sector().pois.find((p) => p.id === id);
  assert.ok(poi, `${id} present`);
  return poi;
}

function signedChordOffset(p) {
  // Signed WU distance from the Helios-gate -> Meridian arrival chord (positive = north side).
  const dx = MERIDIAN.x - HELIOS_GATE.x;
  const dz = MERIDIAN.z - HELIOS_GATE.z;
  const len = Math.hypot(dx, dz);
  return ((p.x - HELIOS_GATE.x) * dz - (p.z - HELIOS_GATE.z) * dx) / len;
}

function chordProgress(p) {
  // 0 at the Helios gate, 1 at Meridian: how far along the arrival chord the point sits.
  const dx = MERIDIAN.x - HELIOS_GATE.x;
  const dz = MERIDIAN.z - HELIOS_GATE.z;
  const len2 = dx * dx + dz * dz;
  return ((p.x - HELIOS_GATE.x) * dx + (p.z - HELIOS_GATE.z) * dz) / len2;
}

function spawnSectorPois(seed = 4242) {
  const spawned = [];
  const state = { world: {}, entities: new Map(), nextEntityId: 1 };
  const system = Object.assign({}, worldProto, {
    helpers: {
      spawnEntity(spec) {
        const entity = { id: state.nextEntityId++, alive: true, ...spec, pos: { ...spec.pos } };
        spawned.push(entity);
        return entity;
      },
    },
    _toGlobal: (point) => ({ ...point }),
    _stampHomeSector: () => {},
    state,
  });
  const active = { id: SECTOR_ID, pois: [] };
  system._spawnPOIs(sector(), active, { pois: {} }, mulberry32(seed));
  return { spawned, active, state };
}

function tallyOneOff() {
  const oneOff = WORLD_ONE_OFFS.find((o) => o.id === 'oneoff_tethys_tally_keg');
  assert.ok(oneOff, 'oneoff_tethys_tally_keg authored in WORLD_ONE_OFFS');
  return oneOff;
}

test('the Tally pocket is authored: zone, toll-line furniture, and the disputed keg', () => {
  const zone = zonesForSector(SECTOR_ID).find((z) => z.id === ZONE_ID);
  assert.ok(zone, `${ZONE_ID} authored for ${SECTOR_ID}`);
  assert.equal(zone.type, 'border_checkpoint');
  assert.equal(zoneThreat(zone), 0, 'customs procedure reads calm inside the checkpoint');

  tallyPois();
  tallyOneOff();
});

test('the pocket spawns at its authored positions (seed 4242) and the tally post is a live actor', () => {
  const { spawned, active, state } = spawnSectorPois(4242);
  const liveByPoiId = new Map(spawned.map((e) => [e.data?.poiId, e]));
  const dressing = state.world.dressing;
  assert.ok(dressing, 'dressing table created');
  const dressedByPoiId = new Map(dressing.rows.map((r) => [r.data?.poiId, r]));
  for (const poi of tallyPois()) {
    const carrier = liveByPoiId.get(poi.id) || dressedByPoiId.get(poi.id);
    assert.ok(carrier, `${poi.id} materialized (live actor or dressing row)`);
    assert.equal(carrier.pos.x, poi.pos.x);
    assert.equal(carrier.pos.z, poi.pos.z);
  }
  assert.ok(active.pois.some((p) => p.poiId === 'poi_tethys_tally_post'), 'tally post joined the active poi list');

  // The tally post carries its plate (the pocket's one readable document; the discovery plate
  // UI resolves it from the authored sector row) and stays a live actor; the furniture parks
  // as dressing rows at no live-entity cost.
  const post = liveByPoiId.get('poi_tethys_tally_post');
  assert.ok(post, 'tally post spawned live');
  const plate = poiById('poi_tethys_tally_post').discoveryPlate;
  assert.ok(plate, 'authored tally post row carries its discovery plate');
  assert.match(plate.title, /WT-TETH/);
  const dressedIds = new Set(dressing.rows.map((r) => r.data?.poiId));
  for (const id of TALLY_POI_IDS.filter((x) => x !== 'poi_tethys_tally_post')) {
    assert.ok(dressedIds.has(id), `${id} parked as a dressing row (no live-entity cost)`);
  }
});

test('the scan gate straddles the arrival chord and the pocket composes approach -> count -> scan face', () => {
  const red = signedChordOffset(poiById('poi_tethys_tally_gate_red').pos);
  const green = signedChordOffset(poiById('poi_tethys_tally_gate_green').pos);
  assert.ok(red * green < 0, `scan gate pins straddle the arrival chord (red ${red.toFixed(0)}, green ${green.toFixed(0)})`);
  assert.ok(Math.abs(red) < 120 && Math.abs(green) < 120, 'both pins stand in the corridor a player actually flies');

  // Funnel: the queue is wider than the gate, so the line narrows to the scan point.
  const q = poiById('poi_tethys_tally_queue_head').pos;
  const qi = poiById('poi_tethys_tally_queue_inner').pos;
  const gateGap = Math.hypot(
    poiById('poi_tethys_tally_gate_red').pos.x - poiById('poi_tethys_tally_gate_green').pos.x,
    poiById('poi_tethys_tally_gate_red').pos.z - poiById('poi_tethys_tally_gate_green').pos.z,
  );
  const queueGap = Math.hypot(q.x - qi.x, q.z - qi.z);
  assert.ok(queueGap > gateGap, `queue (${queueGap.toFixed(0)} WU) is wider than the gate (${gateGap.toFixed(0)} WU)`);

  // Ordered along the chord: queue head, queue inner, gate, then the count.
  const progress = [q, qi, poiById('poi_tethys_tally_gate_red').pos, poiById('poi_tethys_tally_post').pos]
    .map(chordProgress);
  for (let i = 1; i < progress.length; i++) {
    assert.ok(progress[i] > progress[i - 1], `approach step ${i} sits further along the arrival chord`);
  }

  // The count hands off to the Customs Gate scan face within one short leg.
  const post = poiById('poi_tethys_tally_post').pos;
  const toCustoms = Math.hypot(post.x - CUSTOMS.x, post.z - CUSTOMS.z);
  assert.ok(toCustoms < 400, `tally post is ${toCustoms.toFixed(0)} WU from the customs scan face`);
  // And Meridian — the place the freight is bound for — stays one leg past the pocket.
  const toHub = Math.hypot(post.x - MERIDIAN.x, post.z - MERIDIAN.z);
  assert.ok(toHub > toCustoms, 'the hub lies beyond the count, not inside it');
});

test('the HUD names the verb: crossing the gate reads The Tally, inside the checkpoint, stealing nothing', () => {
  const zone = zonesForSector(SECTOR_ID).find((z) => z.id === ZONE_ID);
  const checkpoint = zonesForSector(SECTOR_ID).find((z) => z.id === 'zone_tethys_checkpoint');
  assert.ok(zone && checkpoint, 'pocket and parent checkpoint zones exist');

  // Wholly inside the parent checkpoint: approach reads checkpoint, interior reads the Tally.
  const centerDist = Math.hypot(zone.center.x - checkpoint.center.x, zone.center.z - checkpoint.center.z);
  assert.ok(centerDist + zone.radius <= checkpoint.radius,
    `pocket (${centerDist.toFixed(0)} + ${zone.radius}) nests inside the checkpoint (${checkpoint.radius})`);

  const redPos = poiById('poi_tethys_tally_gate_red').pos;
  const greenPos = poiById('poi_tethys_tally_gate_green').pos;
  const gateMid = { x: (redPos.x + greenPos.x) / 2, z: (redPos.z + greenPos.z) / 2 };
  assert.equal(zoneAt(SECTOR_ID, gateMid.x, gateMid.z)?.id, ZONE_ID, 'the scan gate reads The Tally');
  assert.notEqual(zoneAt(SECTOR_ID, MERIDIAN.x, MERIDIAN.z)?.id, ZONE_ID, 'the hub does not read The Tally');

  // No disc theft: the pocket stays clear of every other authored Tethys zone.
  for (const other of zonesForSector(SECTOR_ID)) {
    if (other.id === ZONE_ID || other.id === 'zone_tethys_checkpoint') continue;
    const d = Math.hypot(other.center.x - zone.center.x, other.center.z - zone.center.z);
    assert.ok(d > other.radius + zone.radius,
      `${other.id} stays clear of the pocket (${d.toFixed(0)} WU vs ${(other.radius + zone.radius).toFixed(0)} sum)`);
  }
});

test('every prop is real: packaged GLBs on disk with declared camera sizes', () => {
  for (const poi of tallyPois()) {
    assert.ok(poi.landmarkGlb, `${poi.id} names its prop`);
    assert.ok(existsSync(`${PLACES_DIR}${poi.landmarkGlb}.glb`), `${poi.landmarkGlb}.glb is packaged`);
    assert.ok(Number.isFinite(poi.visualRadius) && poi.visualRadius > 0, `${poi.id} declares its camera size`);
  }
});

test('the disputed keg is the pocket\'s ropeable body beside the held-for-count pen', () => {
  const keg = tallyOneOff();
  assert.equal(keg.sectorId, SECTOR_ID, 'the keg lives in the Tally sector');
  assert.equal(keg.placeId, 'place_ore_bulk_container');
  assert.ok(existsSync(`${PLACES_DIR}${keg.placeId}.glb`), `${keg.placeId}.glb is packaged`);
  assert.ok(keg.physicalBody && keg.physicalBody.mass > 0, 'the keg carries real mass the Massline can feel');

  // Resolved world position lands inside the pocket, near the pen, off the queue line.
  const sec = sector();
  const anchorPos = worldProto._oneOffAnchorPos(sec, keg.anchor);
  assert.ok(anchorPos, 'keg anchor (station_customs) resolves');
  const pos = { x: anchorPos.x + keg.offsetLocal.x, z: anchorPos.z + keg.offsetLocal.z };
  const zone = zonesForSector(SECTOR_ID).find((z) => z.id === ZONE_ID);
  const fromZone = Math.hypot(pos.x - zone.center.x, pos.z - zone.center.z);
  assert.ok(fromZone < zone.radius, `keg sits ${fromZone.toFixed(0)} WU from the pocket centre, inside its disc`);

  const rack = poiById('poi_tethys_tally_rack').pos;
  const toRack = Math.hypot(pos.x - rack.x, pos.z - rack.z);
  assert.ok(toRack < 220, `keg waits beside the held-for-count rack (${toRack.toFixed(0)} WU)`);
});
