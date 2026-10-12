// CR-BERTH-2 — The Afterwake Slip: the second faction berth, a different memory.
//
// The Pitborn berth cuts what you sell; the Understory slip feeds it to the growth. Pins:
// 1. The berth data is one frozen row bound to station_expanse / sector_charon_expanse; the
//    organic crib placeIds are known alien_growth_* modules (procedural kit, admitted by
//    prefix in partsLibrary's place branch), and the hulk is packaged aftermath art.
// 2. The apron stands in the same authored radiation disc its host station sits in — the
//    berth pin asserts the real geometry (inside radiation, clear of the dense-asteroid
//    disc, the field rims, gates, and POIs), not a copy of the Vesta conventions.
// 3. The desk writes the feed order: understory_wreck_buy appraising a proved loss writes
//    the keyed berthFeed receipt; an empty-ledger appraisal buys nothing physical.
// 4. world._spawnFactionBerths: the crib always stands; the fed hulk materializes only on
//    the receipt, as a durable ropeable body with a stable worldRecordId.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FACTION_BERTHS, factionBerthForStation, factionBerthById } from '../src/data/factionBerths.js';
import { presenceServiceForStation } from '../src/data/factionPresence.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { world } from '../src/systems/world.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { wreckClassById } from '../src/data/wreckClasses.js';
import { stableRecordId, RECORD_KIND, ensureWorldRecords } from '../src/world/worldRecords.js';

const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

const CHARON = SECTORS.find((s) => s.id === 'sector_charon_expanse');
const EXPANSE = CHARON.stations.find((s) => s.id === 'station_expanse');
const BERTH = factionBerthForStation('station_expanse');

// The procedural organic kit admits these placeIds by prefix — assert only modules the
// growth builder actually authors. (The builder's default branch renders generic blades
// for unknown ids rather than an empty group, so a typo is wrong geometry, not invisible —
// this list is the pin that keeps authored names honest.)
const KNOWN_GROWTH_MODULES = new Set([
  'filament_sheet', 'membrane_patch', 'node_bulb_small', 'node_bulb_large', 'cyst_cluster',
  'calcified_collar', 'tendril_cluster', 'nerve_bundle', 'vent_lung', 'lung_bladder',
  'spore_chimney', 'nerve_lace', 'false_cable', 'red_core', 'memory_knot',
  'mirror_membrane', 'dead_crown', 'silt_root', 'sensory_fan', 'mineral_root',
]);

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function berthPieceLocals(berth) {
  const apron = { x: EXPANSE.pos.x + berth.offsetLocal.x, z: EXPANSE.pos.z + berth.offsetLocal.z };
  const out = (berth.crib || []).map((p) => ({ placeId: p.placeId, x: apron.x + p.dx, z: apron.z + p.dz }));
  if (berth.hulk) out.push({ placeId: berth.hulk.placeId, x: apron.x + berth.hulk.dx, z: apron.z + berth.hulk.dz });
  return { apron, pieces: out };
}

function bootBerthHarness() {
  const spawned = [];
  let nextId = 9001;
  const entities = new Map();
  const entityList = [];
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const ent = {
        id: nextId++,
        alive: true,
        type: spec.type,
        pos: { ...spec.pos },
        rot: spec.rot,
        angVel: spec.angVel,
        radius: spec.radius,
        mass: spec.mass,
        collides: spec.collides,
        physicsBody: spec.physicsBody && { ...spec.physicsBody },
        flags: spec.flags && { ...spec.flags },
        data: { ...spec.data },
      };
      spawned.push(ent);
      entities.set(ent.id, ent);
      entityList.push(ent);
      return ent;
    },
  };
  system.state = {
    entities,
    entityList,
    meta: { seed: 47 },
    factionPresence: { serviceReceipts: {} },
  };
  const dressingRows = () => (system.state.world && system.state.world.dressing
    ? system.state.world.dressing.rows : []);
  return { system, spawned, dressingRows, entities };
}

test('CR-BERTH-2: the slip record is a second frozen row pinned to Expanse Refinery', () => {
  assert.ok(FACTION_BERTHS.length >= 2, 'the line and the slip are authored berths');
  assert.equal(FACTION_BERTHS[1].id, 'berth_understory_afterwake_slip', 'the slip stays the second row');
  assert.ok(Object.isFrozen(FACTION_BERTHS));
  assert.ok(BERTH && BERTH.id === 'berth_understory_afterwake_slip',
    'factionBerthForStation resolves the slip at the refinery');
  assert.ok(Object.isFrozen(BERTH));
  assert.equal(BERTH.factionId, 'faction_understory');
  assert.equal(BERTH.sectorId, 'sector_charon_expanse');
  assert.equal(BERTH.stationId, 'station_expanse');
  assert.deepEqual(BERTH.anchor, { type: 'station', id: 'station_expanse' });
  assert.equal(BERTH.receiptKey, 'berthFeed:berth_understory_afterwake_slip');
  assert.equal(factionBerthById(BERTH.id), BERTH, 'the id-keyed lookup resolves it too');
  assert.equal(factionBerthForStation('station_forge').factionId, 'faction_pitborn',
    'the consignment line still owns its own station');
  assert.ok(BERTH.crib.length >= 4, 'the slip is a worksite, not a single prop');
  assert.ok(BERTH.hulk && BERTH.hulk.mass > 0 && BERTH.hulk.radius > 0,
    'the fed hulk is a physical body spec, not a dressing row');

  for (const piece of BERTH.crib) {
    assert.ok(piece.placeId.startsWith('alien_growth_'),
      `${piece.placeId} is an organic-kit module — the slip is grown, not industrial`);
    assert.ok(KNOWN_GROWTH_MODULES.has(piece.placeId.replace(/^alien_growth_/, '')),
      `${piece.placeId} names a module the growth builder authors`);
  }
  assert.ok(existsSync(`${PLACES_DIR}${BERTH.hulk.placeId}.glb`),
    'the fed hulk is packaged art, not a new asset ask');
});

test('CR-BERTH-2: the apron stands in the station’s weather, clear of the anchors', () => {
  const { apron, pieces } = berthPieceLocals(BERTH);

  // The refinery itself sits inside the authored radiation disc — the slip inherits the
  // station's weather (the Understory feed hulls in its shadow), so the honest pin is the
  // real geometry, not a copy of the Vesta apron's outside-everything convention.
  const stationDist = dist(apron, EXPANSE.pos);
  assert.ok(stationDist > 300 && stationDist < 900,
    `apron ${Math.round(stationDist)} WU off the refinery reads adjacent, not overlapping`);
  const radiation = CHARON.hazards.find((h) => h.type === 'radiation');
  assert.ok(dist(apron, radiation.center) < radiation.radius,
    'the slip shares the refinery’s radiation shadow — authored, not a placement error');
  assert.ok(dist(EXPANSE.pos, radiation.center) < radiation.radius,
    'sanity: the host station sits in the same disc');
  const dense = CHARON.hazards.find((h) => h.type === 'dense_asteroid');
  assert.ok(dist(apron, dense.center) > dense.radius,
    'the slip stands outside the dense-asteroid disc');

  for (const piece of pieces) {
    assert.ok(dist(piece, EXPANSE.pos) > 300,
      `${piece.placeId} must stand clear of the refinery hull`);
    for (const gate of CHARON.gates || []) {
      assert.ok(dist(piece, gate.pos) > 300, `${piece.placeId} must stand clear of gate traffic`);
    }
  }
  // The Lung Marker beacon is the slip's nearest authored neighbor — a crib piece may read
  // close (the growth keeps markers), but no piece sits on top of it.
  const lung = { x: 480, z: -1100 };
  for (const piece of pieces) {
    assert.ok(dist(piece, lung) > 100, `${piece.placeId} must not overlap the Lung Marker`);
  }
  assert.ok(dist(apron, { x: 0, z: 0 }) < CHARON.worldRadius, 'apron lives inside the sector');
});

test('CR-BERTH-2: the crib always stands; the fed hulk only appears on the feed receipt', async () => {
  const { resolvePlaceFileForEntity } = await import('../src/render/partsLibrary.js');
  const { system, spawned, dressingRows } = bootBerthHarness();
  const active = { pois: [], stations: [], gates: [], dressing: [] };

  system._spawnWorldOneOffs(CHARON, active);
  const crib = dressingRows().filter((row) => row.data.berthId === BERTH.id);
  assert.equal(crib.length, BERTH.crib.length, 'every crib prop lands as a dressing row');
  for (const row of crib) {
    assert.equal(row.data.name, BERTH.name, 'crib props carry the slip name');
    assert.equal(row.data.worldDressing, true);
    // Organic modules have no GLB — resolution goes through the procedural place branch.
    // The pin is that a human-authored module name exists, covered in the record test.
    assert.ok(row.data.placeId.startsWith('alien_growth_'));
  }
  assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 0,
    'no fed hulk without a feed receipt');

  // The receipt exists (as factionPresence's serviceAction writes it) — a fresh materialize
  // lays the wreck into the cradle as a real body.
  system.state.factionPresence.serviceReceipts[BERTH.receiptKey] = { kind: 'berthFeed', count: 1, t: 10 };
  const active2 = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(CHARON, active2);
  const hulks = spawned.filter((e) => e.data && e.data.berthConsign);
  assert.equal(hulks.length, 1, 'exactly one fed hulk lies on the slip');
  const hulk = hulks[0];
  assert.equal(hulk.type, 'wreck');
  assert.equal(hulk.collides, true);
  assert.equal(hulk.data.masslineTetherable, true, 'the fed hull is ropeable — steal it back');
  assert.equal(hulk.data.berthConsign.berthId, BERTH.id);
  assert.equal(hulk.data.berthConsign.stationId, 'station_expanse');
  assert.equal(hulk.mass, BERTH.hulk.mass);
  assert.ok(resolvePlaceFileForEntity(hulk), 'the fed hulk resolves its authored wreck file');

  const expectedId = stableRecordId(47, CHARON.id, RECORD_KIND.WRECK, `factionBerth:${BERTH.id}`);
  assert.equal(hulk.data.worldRecordId, expectedId);

  const expectedGlobal = sectorLocalToGlobalForSector({
    x: EXPANSE.pos.x + BERTH.offsetLocal.x + BERTH.hulk.dx,
    z: EXPANSE.pos.z + BERTH.offsetLocal.z + BERTH.hulk.dz,
  }, CHARON.id);
  assert.equal(hulk.pos.x, expectedGlobal.x);
  assert.equal(hulk.pos.z, expectedGlobal.z);

  const active3 = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(CHARON, active3);
  assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 1,
    'a second materialize finds the live body instead of laying a twin');
});

test('CR-BERTH-2: tombstone and far-actor guards never re-mint the fed hulk', () => {
  const recordId = stableRecordId(47, CHARON.id, RECORD_KIND.WRECK, `factionBerth:${BERTH.id}`);

  {
    const { system, spawned } = bootBerthHarness();
    system._spawnWorldOneOffs(CHARON, { pois: [], stations: [], gates: [], dressing: [] });
    ensureWorldRecords(system.state.world).byId[recordId] = {
      recordId, kind: RECORD_KIND.WRECK, sectorId: CHARON.id,
      pos: { x: 0, z: 0 }, type: 'wreck',
      outcome: 'destroyed', alive: false,
    };
    system.state.factionPresence.serviceReceipts[BERTH.receiptKey] = { kind: 'berthFeed', count: 1, t: 10 };
    system._spawnWorldOneOffs(CHARON, { pois: [], stations: [], gates: [], dressing: [] });
    assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 0,
      'a destroyed tombstone must not re-mint the fed hulk — the slip keeps the memory');
  }

  {
    const { system, spawned } = bootBerthHarness();
    system._spawnWorldOneOffs(CHARON, { pois: [], stations: [], gates: [], dressing: [] });
    system.state.world.farActors = { rows: [{ alive: true, data: { worldRecordId: recordId } }] };
    system.state.factionPresence.serviceReceipts[BERTH.receiptKey] = { kind: 'berthFeed', count: 1, t: 10 };
    system._spawnWorldOneOffs(CHARON, { pois: [], stations: [], gates: [], dressing: [] });
    assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 0,
      'a far actor holding the record must not mint a local twin');
  }
});

test('CR-BERTH-2: the wreck-buyer desk writes the feed order off a proved hull', () => {
  const handlers = [];
  const bus = {
    on: (event, fn) => { handlers.push({ event, fn }); return () => {}; },
    emit: () => {},
  };
  const state = {
    simTime: 42,
    meta: { seed: 47 },
    factions: { faction_understory: { rep: 0 } },
    world: { currentSectorId: 'sector_charon_expanse' },
    lossLedger: {
      bySector: {
        sector_charon_expanse: [{ lossId: 'loss_abc', shipDefId: 'ship_mule', t: 12 }],
      },
    },
    factionPresence: {
      servicesByStation: {
        station_expanse: { factionId: 'faction_understory', services: ['wreck_buy'], available: true },
      },
    },
  };
  const presence = Object.create(factionPresence);
  presence.init({ state, bus, helpers: {} });
  const onAction = handlers.filter((h) => h.event === 'ui:factionPresenceService').map((h) => h.fn);
  assert.equal(onAction.length, 1, 'one desk-action listener owns the appraisal + feed write');

  // An appraisal that names a proved hull feeds the slip — the keyed row lands.
  onAction[0]({ stationId: 'station_expanse', serviceId: 'understory_wreck_buy' });
  const feed = state.factionPresence.serviceReceipts[BERTH.receiptKey];
  assert.ok(feed, 'the keyed feed receipt exists after a proved appraisal');
  assert.equal(feed.kind, 'berthFeed');
  assert.equal(feed.berthId, BERTH.id);
  assert.equal(feed.stationId, 'station_expanse');
  assert.equal(feed.factionId, 'faction_understory');
  assert.equal(feed.lastLossId, 'loss_abc');
  assert.equal(feed.count, 1);
  assert.deepEqual(feed.fedLossIds, ['loss_abc'], 'the slip remembers which hulls it ate');

  // Re-appraising the same recorded loss is one feed, not two — count tracks distinct
  // hulls, not desk clicks.
  state.simTime = 90;
  onAction[0]({ stationId: 'station_expanse', serviceId: 'understory_wreck_buy' });
  assert.equal(state.factionPresence.serviceReceipts[BERTH.receiptKey].count, 1,
    'a second click on the same loss does not mint a second feed');

  // A second, distinct proved hull does advance the count.
  state.lossLedger.bySector.sector_charon_expanse.unshift(
    { lossId: 'loss_def', shipDefId: 'ship_kestrel', t: 91 });
  onAction[0]({ stationId: 'station_expanse', serviceId: 'understory_wreck_buy' });
  const fed2 = state.factionPresence.serviceReceipts[BERTH.receiptKey];
  assert.equal(fed2.count, 2, 'a distinct hull is a second feed');
  assert.equal(fed2.lastLossId, 'loss_def', 'the receipt names the newest fed hull');
  assert.deepEqual(fed2.fedLossIds, ['loss_abc', 'loss_def']);

  // A ledger entry with a lossId but no named hull (outpost raid, unrecognized def) is
  // the desk's own denial case — it must not feed the slip while the popup says so.
  state.lossLedger.bySector.sector_charon_expanse.unshift(
    { lossId: 'loss_raid', shipDefId: null, t: 92 });
  onAction[0]({ stationId: 'station_expanse', serviceId: 'understory_wreck_buy' });
  const fed3 = state.factionPresence.serviceReceipts[BERTH.receiptKey];
  assert.equal(fed3.count, 2, 'a hull-less ledger entry feeds nothing');
  assert.equal(fed3.lastLossId, 'loss_def', 'and never rewrites which hull the slip ate');
  assert.deepEqual(fed3.fedLossIds, ['loss_abc', 'loss_def']);

  // An empty-ledger appraisal ("bring back a loss") buys nothing physical.
  state.lossLedger.bySector.sector_charon_expanse = [];
  const fresh = Object.create(factionPresence);
  const state2 = {
    simTime: 5, meta: { seed: 47 }, factions: {},
    world: { currentSectorId: 'sector_charon_expanse' },
    lossLedger: { bySector: {} },
    factionPresence: {
      servicesByStation: {
        station_expanse: { factionId: 'faction_understory', services: ['wreck_buy'], available: true },
      },
    },
  };
  const handlers2 = [];
  fresh.init({ state: state2, bus: { on: (e, f) => { handlers2.push({ event: e, fn: f }); return () => {}; }, emit: () => {} }, helpers: {} });
  handlers2.filter((h) => h.event === 'ui:factionPresenceService')[0]
    .fn({ stationId: 'station_expanse', serviceId: 'understory_wreck_buy' });
  assert.equal(state2.factionPresence.serviceReceipts[BERTH.receiptKey], undefined,
    'an empty-ledger appraisal mints no feed — the slip eats proved hulls only');

  // A foreign payout type must not mint the slip's memory: redeem_rights is the Pitborn
  // consignment contract, so a stray completion at the refinery writes nothing at this key.
  const onCompleted = handlers.filter((h) => h.event === 'service:completed').map((h) => h.fn);
  onCompleted[0]({ type: 'redeem_rights', stationId: 'station_expanse', rights: 3, atT: 100 });
  assert.equal(state.factionPresence.serviceReceipts[BERTH.receiptKey].kind, 'berthFeed',
    'a redeem_rights event at the refinery cannot overwrite the feed row');
  assert.equal(state.factionPresence.serviceReceipts[BERTH.receiptKey].count, 2,
    'nor inflate its count');

  // The feed receipt survives the save round-trip like every other keyed desk row.
  const saved = JSON.parse(JSON.stringify(presence.serialize()));
  const restoredState = { simTime: 0, factions: {} };
  const restored = Object.create(factionPresence);
  restored.state = restoredState;
  restored._unsub = [];
  restored.deserialize(saved);
  const restoredFeed = restoredState.factionPresence.serviceReceipts[BERTH.receiptKey];
  assert.ok(restoredFeed, 'the feed order survives the save envelope');
  assert.equal(restoredFeed.count, 2);
  assert.equal(restoredFeed.kind, 'berthFeed');
});

test('CR-BERTH-2: a berth hulk keeps its authored wreck class through the tagger', () => {
  // The generic tagger re-rolls class for wrecks in a sector with a recorded loss; a
  // berth-consigned hulk is an authored placement and its data must win. This also makes
  // the consignment line's authored 'consigned_hulk' live (it resolves as a real class).
  assert.ok(wreckClassById('consigned_hulk'), 'the consignment class resolves as a real class');
  assert.ok(wreckClassById('fresh'), 'the slip’s fed-hull class resolves');

  const ledger = Object.create(lossLedger);
  ledger._state = {
    simTime: 50,
    world: { currentSectorId: 'sector_charon_expanse' },
    lossLedger: {
      seed: 47,
      bySector: {
        sector_charon_expanse: [{ lossId: 'loss_abc', shipDefId: 'ship_mule', kind: 'hull', t: 12 }],
      },
      entries: [],
    },
  };

  const fed = {
    type: 'wreck',
    data: {
      sectorId: 'sector_charon_expanse',
      berthConsign: { berthId: BERTH.id, stationId: 'station_expanse' },
      wreckClass: 'fresh',
    },
  };
  ledger._tagWreck({ id: 1, type: 'wreck', entity: fed });
  assert.equal(fed.data.wreckClass, 'fresh', 'the authored class survives the tagger');
  assert.equal(fed.data.scanLabel, wreckClassById('fresh').scanLabel,
    'labels come from the authored class, not the roll');
  assert.equal(fed.data.provenance.lossId, 'loss_abc',
    'provenance still names the sector’s recorded loss');

  // A consigned hulk on the Pitborn pattern keeps its authored class too.
  const consigned = {
    type: 'wreck',
    data: {
      sectorId: 'sector_charon_expanse',
      berthConsign: { berthId: 'berth_pitborn_consignment_line', stationId: 'station_forge' },
      wreckClass: 'consigned_hulk',
    },
  };
  ledger._tagWreck({ id: 2, type: 'wreck', entity: consigned });
  assert.equal(consigned.data.wreckClass, 'consigned_hulk');
  assert.equal(consigned.data.scanLabel, wreckClassById('consigned_hulk').scanLabel);

  // An ordinary wreck in the same sector still takes the seeded roll.
  const plain = { type: 'wreck', data: { sectorId: 'sector_charon_expanse' } };
  ledger._tagWreck({ id: 3, type: 'wreck', entity: plain });
  assert.ok(['fresh', 'battlefield', 'military', 'ancient'].includes(plain.data.wreckClass),
    'an unclaimed wreck keeps the provenance roll');
});

test('CR-BERTH-2: the Expanse desk still offers wreck_buy unconditionally', () => {
  const desk = presenceServiceForStation('station_expanse', {});
  assert.ok(desk, 'the Understory desk exists at the refinery');
  assert.equal(desk.factionId, 'faction_understory');
  assert.ok(desk.services.includes('wreck_buy'));
  assert.equal(desk.available, true, 'the buyer asks nothing of reputation');
});
