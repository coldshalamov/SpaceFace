// CR-BERTH-1 — The Consignment Line: a faction berth with an address and a memory.
//
// Pins the public seams, not the paint:
// 1. The berth data is one frozen row bound to station_forge / sector_vesta_forge, every
//    placeId it cites is packaged art, and the apron stands clear of the ladle, the shear
//    jaws' hazard radius, the other station anchors, and the radiation floor.
// 2. world._spawnFactionBerths: the crib props spawn unconditionally as dressing rows; the
//    consigned hulk appears only when state.factionPresence.serviceReceipts[receiptKey]
//    exists, and it is a durable ropeable wreck with a stable worldRecordId — not a prop.
// 3. factionPresence._onServiceCompleted: a redeem_rights completion at the berth station
//    writes/accumulates the keyed receipt; any other service or station writes nothing.
// 4. The desk contract: presenceServiceForStation('station_forge') offers yard + fence, and
//    reputation below zero closes it.
// 5. The Forge bar lead names the strip-line so the address exists as knowledge.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FACTION_BERTHS, factionBerthForStation } from '../src/data/factionBerths.js';
import { AUTHORED_DOCK_RUMORS } from '../src/data/frontierRumors.js';
import { presenceServiceForStation } from '../src/data/factionPresence.js';
import { SECTORS } from '../src/data/sectors.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { VESTA_SHEAR_JAWS } from '../src/data/environmentalMachinery.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { world } from '../src/systems/world.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { stableRecordId, RECORD_KIND, ensureWorldRecords } from '../src/world/worldRecords.js';

const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

const VESTA = SECTORS.find((s) => s.id === 'sector_vesta_forge');
const FORGE = VESTA.stations.find((s) => s.id === 'station_forge');
const BERTH = factionBerthForStation('station_forge');

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Sector-local position of every berth piece (crib prop or hulk): apron centre is
// station-local + offsetLocal; pieces ride dx/dz off that centre.
function berthPieceLocals(berth) {
  const apron = { x: FORGE.pos.x + berth.offsetLocal.x, z: FORGE.pos.z + berth.offsetLocal.z };
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

test('CR-BERTH-1: the berth record is one frozen row pinned to Forge Foundry', () => {
  assert.equal(FACTION_BERTHS.length, 1, 'exactly one faction berth is authored');
  assert.ok(Object.isFrozen(FACTION_BERTHS), 'the berth list is frozen');
  const berth = FACTION_BERTHS[0];
  assert.ok(Object.isFrozen(berth));
  assert.equal(berth.sectorId, 'sector_vesta_forge');
  assert.equal(berth.stationId, 'station_forge');
  assert.equal(berth.factionId, 'faction_pitborn');
  assert.deepEqual(berth.anchor, { type: 'station', id: 'station_forge' });
  assert.equal(typeof berth.receiptKey, 'string');
  assert.ok(berth.receiptKey.length > 0, 'the receipt key the desk writes is authored');
  assert.ok(BERTH && BERTH.id === berth.id, 'factionBerthForStation resolves the row');
  assert.equal(factionBerthForStation('station_ceres'), null, 'no other station resolves a berth');
  assert.ok(berth.crib.length >= 4, 'the crib is a worksite, not a single prop');
  assert.ok(berth.hulk && berth.hulk.mass > 0 && berth.hulk.radius > 0,
    'the consigned hulk is a physical body spec, not a dressing row');
  for (const piece of [...berth.crib, berth.hulk]) {
    assert.ok(existsSync(`${PLACES_DIR}${piece.placeId}.glb`),
      `${piece.placeId}.glb is packaged art, not a new asset ask`);
  }
});

test('CR-BERTH-1: the apron stands clear of the ladle, the shear jaws, and the anchors', () => {
  const { apron, pieces } = berthPieceLocals(BERTH);

  // On the pad, off the dock: close enough to read as the foundry's rented apron,
  // well outside the station hull and its own dressing furniture.
  const stationDist = dist(apron, FORGE.pos);
  assert.ok(stationDist > 400 && stationDist < 900,
    `apron ${Math.round(stationDist)} WU off the foundry reads adjacent, not overlapping`);
  for (const station of VESTA.stations) {
    for (const piece of pieces) {
      assert.ok(dist(piece, station.pos) > 300,
        `${piece.placeId} must stand clear of ${station.id}`);
    }
  }

  // The Runaway Ladle is authored off the same station anchor — compare in the same
  // sector-local frame the anchors live in.
  const ladle = WORLD_ONE_OFFS.find((o) => o.id === 'oneoff_runaway_ladle');
  const ladlePos = { x: FORGE.pos.x + ladle.offsetLocal.x, z: FORGE.pos.z + ladle.offsetLocal.z };
  for (const piece of pieces) {
    assert.ok(dist(piece, ladlePos) > 800,
      `${piece.placeId} must stand clear of the Runaway Ladle`);
  }

  // The shear jaws hazard disc rides the machine's localPos.
  for (const piece of pieces) {
    assert.ok(dist(piece, VESTA_SHEAR_JAWS.localPos) > VESTA_SHEAR_JAWS.hazardRadius + 100,
      `${piece.placeId} must stand outside the shear jaws' hazard radius`);
  }

  // The sector's authored hazards and gates keep their margin too, and the whole apron
  // sits inside the world radius.
  for (const hazard of VESTA.hazards || []) {
    assert.ok(dist(apron, hazard.center) > hazard.radius,
      `apron must stand outside the ${hazard.type} hazard`);
  }
  for (const gate of VESTA.gates || []) {
    assert.ok(dist(apron, gate.pos) > 300, 'apron must stand clear of gate traffic');
  }
  assert.ok(dist(apron, { x: 0, z: 0 }) < VESTA.worldRadius, 'apron lives inside the sector');
});

test('CR-BERTH-1: the crib always stands; the hulk only appears on the receipt', async () => {
  const { resolvePlaceFileForEntity } = await import('../src/render/partsLibrary.js');
  const { system, spawned, dressingRows } = bootBerthHarness();
  const active = { pois: [], stations: [], gates: [], dressing: [] };

  // No receipt: the apron furniture is all the strip-line shows.
  system._spawnWorldOneOffs(VESTA, active);
  const crib = dressingRows().filter((row) => row.data.berthId === BERTH.id);
  assert.equal(crib.length, BERTH.crib.length, 'every crib prop lands as a dressing row');
  for (const row of crib) {
    assert.equal(row.data.name, BERTH.name, 'crib props carry the berth name');
    assert.equal(row.data.worldDressing, true);
    assert.ok(resolvePlaceFileForEntity({ type: 'fx', data: row.data }),
      `${row.data.placeId} must resolve a place file — a named berth prop never goes invisible`);
  }
  assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 0,
    'no consigned hulk without a desk receipt');

  // The receipt exists (as factionPresence's handler writes it) — a fresh materialize parks
  // the wreck on the line as a real body.
  system.state.factionPresence.serviceReceipts[BERTH.receiptKey] = { count: 1, t: 10 };
  const active2 = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(VESTA, active2);
  const hulks = spawned.filter((e) => e.data && e.data.berthConsign);
  assert.equal(hulks.length, 1, 'exactly one consigned hulk parks on the line');
  const hulk = hulks[0];
  assert.equal(hulk.type, 'wreck');
  assert.equal(hulk.collides, true);
  assert.equal(hulk.data.masslineTetherable, true, 'the wreck you sold is ropeable');
  assert.equal(hulk.data.berthConsign.berthId, BERTH.id);
  assert.equal(hulk.data.berthConsign.stationId, 'station_forge');
  assert.equal(hulk.mass, BERTH.hulk.mass);
  assert.ok(resolvePlaceFileForEntity(hulk), 'the parked hulk resolves its authored wreck file');

  // Stable world-record identity: the same seed + sector + berth key always resolves the
  // same record id, so the body survives residency instead of duplicating.
  const expectedId = stableRecordId(47, VESTA.id, RECORD_KIND.WRECK, `factionBerth:${BERTH.id}`);
  assert.equal(hulk.data.worldRecordId, expectedId);

  // Its authored spot is the apron converted into global space, like every other spawner.
  const expectedGlobal = sectorLocalToGlobalForSector({
    x: FORGE.pos.x + BERTH.offsetLocal.x + BERTH.hulk.dx,
    z: FORGE.pos.z + BERTH.offsetLocal.z + BERTH.hulk.dz,
  }, VESTA.id);
  assert.equal(hulk.pos.x, expectedGlobal.x);
  assert.equal(hulk.pos.z, expectedGlobal.z);

  // Re-materializing the same bag dedups on the record id rather than minting a twin.
  const active3 = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(VESTA, active3);
  assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 1,
    'a second materialize finds the live body instead of parking a twin');
});

test('CR-BERTH-1: tombstone and far-actor guards never re-mint the hulk', () => {
  const recordId = stableRecordId(47, VESTA.id, RECORD_KIND.WRECK, `factionBerth:${BERTH.id}`);

  // Destroyed tombstone: the receipt exists but the record says the hulk is gone — the
  // berth's memory is the tombstone, not a fresh copy on every visit.
  {
    const { system, spawned } = bootBerthHarness();
    system._spawnWorldOneOffs(VESTA, { pois: [], stations: [], gates: [], dressing: [] });
    ensureWorldRecords(system.state.world).byId[recordId] = {
      recordId, kind: RECORD_KIND.WRECK, sectorId: VESTA.id,
      pos: { x: 0, z: 0 }, type: 'wreck',
      outcome: 'destroyed', alive: false,
    };
    system.state.factionPresence.serviceReceipts[BERTH.receiptKey] = { count: 1, t: 10 };
    system._spawnWorldOneOffs(VESTA, { pois: [], stations: [], gates: [], dressing: [] });
    assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 0,
      'a destroyed tombstone must not re-mint the consigned hulk');
  }

  // Far-actor custody: the hulk rode off with a far actor — the row, not a twin, owns it.
  {
    const { system, spawned } = bootBerthHarness();
    system._spawnWorldOneOffs(VESTA, { pois: [], stations: [], gates: [], dressing: [] });
    system.state.world.farActors = { rows: [{ alive: true, data: { worldRecordId: recordId } }] };
    system.state.factionPresence.serviceReceipts[BERTH.receiptKey] = { count: 1, t: 10 };
    system._spawnWorldOneOffs(VESTA, { pois: [], stations: [], gates: [], dressing: [] });
    assert.equal(spawned.filter((e) => e.data && e.data.berthConsign).length, 0,
      'a far actor holding the record must not mint a local twin');
  }
});

test('CR-BERTH-1: the desk writes the keyed receipt off service:completed', () => {
  const handlers = [];
  const bus = {
    on: (event, fn) => { handlers.push({ event, fn }); return () => {}; },
    emit: () => {},
  };
  const state = { simTime: 42, factions: { faction_pitborn: { rep: 5 } } };
  const presence = Object.create(factionPresence);
  presence.init({ state, bus, helpers: {} });
  const onCompleted = handlers.filter((h) => h.event === 'service:completed').map((h) => h.fn);
  assert.equal(onCompleted.length, 1, 'one service:completed listener owns the receipt write');

  // A redeem_rights payout at the berth station writes the row the strip-line reads.
  onCompleted[0]({ type: 'redeem_rights', stationId: 'station_forge', rights: 2, atT: 41 });
  const receipt = state.factionPresence.serviceReceipts[BERTH.receiptKey];
  assert.ok(receipt, 'the keyed receipt exists after the payout');
  assert.equal(receipt.kind, 'berthConsign');
  assert.equal(receipt.berthId, BERTH.id);
  assert.equal(receipt.stationId, 'station_forge');
  assert.equal(receipt.factionId, 'faction_pitborn');
  assert.equal(receipt.count, 2);
  assert.equal(receipt.t, 42);

  // Repeat payouts accumulate on the same key rather than minting unstable rows.
  onCompleted[0]({ type: 'redeem_rights', stationId: 'station_forge', rights: 3, atT: 99 });
  const again = state.factionPresence.serviceReceipts[BERTH.receiptKey];
  assert.equal(again.count, 5, 'count accumulates across visits');
  assert.equal(Object.keys(state.factionPresence.serviceReceipts)
    .filter((k) => k.startsWith('berthConsign:')).length, 1, 'one keyed row per berth');

  // Other service types and other stations write nothing.
  onCompleted[0]({ type: 'repair', stationId: 'station_forge', rights: 1, atT: 100 });
  onCompleted[0]({ type: 'redeem_rights', stationId: 'station_ceres', rights: 4, atT: 101 });
  assert.equal(Object.keys(state.factionPresence.serviceReceipts)
    .filter((k) => k.startsWith('berthConsign:')).length, 1, 'foreign payouts mint no rows');

  // The receipt is durable memory: it survives the serialize → save-envelope → deserialize
  // hop a Continue takes, so the parked hulk still materializes after a reload.
  const saved = JSON.parse(JSON.stringify(presence.serialize()));
  const restoredState = { simTime: 0, factions: {} };
  const restored = Object.create(factionPresence);
  restored.state = restoredState;
  restored._unsub = [];
  restored.deserialize(saved);
  const restoredReceipt = restoredState.factionPresence.serviceReceipts[BERTH.receiptKey];
  assert.ok(restoredReceipt, 'the berth receipt survives the save round-trip');
  assert.equal(restoredReceipt.count, 5, 'the accumulated count round-trips intact');
  assert.equal(restoredReceipt.kind, 'berthConsign');
});

test('CR-BERTH-1: the Forge desk offers yard + fence, and negative rep closes it', () => {
  const open = presenceServiceForStation('station_forge', { faction_pitborn: 0 });
  assert.ok(open, 'the Pitborn desk exists at the foundry');
  assert.equal(open.factionId, 'faction_pitborn');
  assert.ok(open.services.includes('yard'), 'the yard desk is offered');
  assert.ok(open.services.includes('fence'), 'the fence desk is offered');
  assert.equal(open.available, true, 'neutral reputation docks at the desk');

  const burned = presenceServiceForStation('station_forge', { faction_pitborn: -1 });
  assert.equal(burned.available, false, 'reputation below zero closes the desk');
  assert.equal(burned.requiredRep, 0);
});

test('CR-BERTH-1: the Forge bar names the strip-line', () => {
  const lead = AUTHORED_DOCK_RUMORS.station_forge;
  assert.ok(typeof lead === 'string' && lead.length > 0, 'the foundry bar has a lead');
  assert.ok(lead.includes('Consignment Line'), 'the lead names the strip-line');
  assert.ok(/claim rights/i.test(lead), 'the lead points at the redeem-rights desk');
});
