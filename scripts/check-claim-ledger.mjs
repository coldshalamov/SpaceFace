#!/usr/bin/env node
// T8f backend gate: Claim Ledger.
//
// Proves claimed bodies are durable ledger records, not transient UI affordances:
// claim receipts, module build receipts, teleport linkage, serialization, next-id recovery, and
// base-screen readout wiring all remain connected to the shipped claims system.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BODY_MODULE_BY_ID, BODY_SLOTS_BY_SIZE, CLAIM_COST } from '../src/data/claimableBodies.js';
import { claims as claimsBase } from '../src/systems/claims.js';

const BASE_SOURCE = readFileSync(new URL('../src/ui/screens/base.js', import.meta.url), 'utf8');

assert.equal(typeof window, 'undefined', 'this check must run headless');

testClaimCreatesDurableLedgerRecord();
testBuildModuleWritesModuleReceipt();
testTeleporterLinksAndRequestsTravel();
testSerializeDeserializePreservesLedgerAndNextId();
testBaseScreenReadsClaimLedger();

console.log('PASS  check:claim-ledger');

function testClaimCreatesDurableLedgerRecord() {
  const h = makeHarness();
  const poi = makePoi({ id: 'poi_arden', name: 'Arden Moon', size: 'M', pos: { x: 12, z: -8 } });
  assert.equal(h.sys.claim(poi), true, 'claiming a valid body succeeds');
  assert.equal(h.state.player.credits, 100000, 'claims never debit credits directly');

  const body = h.state.claims.bodies[0];
  assert.ok(body, 'claim creates a body ledger row');
  assert.equal(body.id, 'claim_1');
  assert.equal(body.sectorId, 'sector_helios_prime');
  assert.equal(body.poiId, 'poi_arden');
  assert.equal(body.name, 'Arden Moon');
  assert.equal(body.size, 'M');
  assert.equal(body.slots, BODY_SLOTS_BY_SIZE.M);
  assert.deepEqual(body.modules, [], 'new claim starts with an empty module ledger');
  assert.equal(body.x, 12);
  assert.equal(body.z, -8);
  assert.equal(body.claimedAt, 123);
  assert.equal(h.sys.isClaimed('poi_arden'), true, 'isClaimed resolves against the ledger');
  assert.equal(h.sys.list(), h.state.claims.bodies, 'public list returns the live claim ledger');

  assert.deepEqual(chargeEvents(h.events), [{ amount: CLAIM_COST, reason: 'claim_body' }],
    'claim charge routes through the economy writer with the claim reason');
  assert.equal(h.events.some((e) => e.event === 'claim:claimed' && e.payload.body === body), true,
    'claim emits the durable body receipt');
  assert.equal(h.events.some((e) => e.event === 'audio:cue' && e.payload.id === 'confirm'), true,
    'claim confirms through the shipped audio cue');

  assert.equal(h.sys.claim(poi), false, 'duplicate claim is rejected');
  assert.equal(h.state.claims.bodies.length, 1, 'duplicate claim does not add another ledger row');
}

function testBuildModuleWritesModuleReceipt() {
  const h = makeHarness({
    researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
  });
  h.sys.claim(makePoi({ id: 'poi_foundry', name: 'Foundry Moon', size: 'M' }));
  const body = h.state.claims.bodies[0];
  const depot = BODY_MODULE_BY_ID.get('mod_depot');
  assert.ok(depot, 'fixture module exists');

  const chargeCountBefore = chargeEvents(h.events).length;
  assert.equal(h.sys.buildModule(body.id, 'mod_depot'), true, 'available module builds');
  assert.deepEqual(body.modules, ['mod_depot'], 'module id is appended to the body ledger');
  assert.equal(h.state.player.credits, 100000, 'module build never debits credits directly');
  assert.deepEqual(chargeEvents(h.events).slice(chargeCountBefore), [{ amount: depot.cost, reason: 'build_module' }],
    'module build charge routes through the economy writer with the build reason');
  assert.equal(h.events.some((e) => e.event === 'claim:moduleBuilt' && e.payload.bodyId === body.id && e.payload.modId === 'mod_depot'), true,
    'module build emits a receipt with body id and module id');

  assert.equal(h.sys.buildModule(body.id, 'mod_depot'), false, 'duplicate module build is rejected');
  assert.deepEqual(body.modules, ['mod_depot'], 'duplicate build does not duplicate the module ledger');
}

function testTeleporterLinksAndRequestsTravel() {
  const h = makeHarness({ researchedNodes: ['tech_graviton_drives'] });
  h.sys.claim(makePoi({ id: 'poi_lane', name: 'Lane Moon', size: 'L', pos: { x: 10, z: 0 } }));
  const body = h.state.claims.bodies[0];
  const teleporter = BODY_MODULE_BY_ID.get('mod_teleporter');
  assert.ok(teleporter, 'teleporter module exists');

  assert.equal(h.sys.buildModule(body.id, 'mod_teleporter'), true, 'teleporter builds with tech and slots');
  assert.equal(body.linkedStationId, 'station_near', 'teleporter links to the nearest station ledger id');
  assert.equal(h.events.some((e) => e.event === 'claim:moduleBuilt' && e.payload.modId === 'mod_teleporter'), true,
    'teleporter build emits a module receipt');

  assert.equal(h.sys.teleportFrom(body.id), true, 'linked teleporter requests travel');
  assert.equal(h.events.some((e) =>
    e.event === 'claim:teleportRequest' &&
    e.payload.bodyId === body.id &&
    e.payload.targetStationId === 'station_near'), true,
  'teleport request carries the body and linked station ids');
}

function testSerializeDeserializePreservesLedgerAndNextId() {
  const h = makeHarness({ researchedNodes: ['tech_outpost_charter'] });
  h.sys.claim(makePoi({ id: 'poi_save', name: 'Save Moon', size: 'S' }));
  const body = h.state.claims.bodies[0];
  h.sys.buildModule(body.id, 'mod_depot');

  const snap = h.sys.serialize();
  assert.deepEqual(snap.bodies[0].modules, ['mod_depot'], 'serialize captures built modules');
  snap.bodies[0].modules.push('mod_defense');
  assert.deepEqual(body.modules, ['mod_depot'], 'serialize returns a module copy, not a live array');

  const restored = makeHarness({
    initialBodies: [{
      id: 'claim_7',
      sectorId: 'sector_ceres_belt',
      poiId: 'poi_old',
      name: 'Old Moon',
      size: 'M',
      slots: 3,
      modules: ['mod_depot'],
      linkedStationId: null,
      x: 1,
      z: 2,
      claimedAt: 99,
    }],
  });
  assert.equal(restored.sys.claim(makePoi({ id: 'poi_next', name: 'Next Moon', size: 'S' })), true,
    'claiming after deserialize succeeds');
  assert.equal(restored.state.claims.bodies.at(-1).id, 'claim_8',
    'deserialize re-derives next claim id past restored rows');
}

function testBaseScreenReadsClaimLedger() {
  const checks = [
    [/claims\.list\(\)\.find\(\(b\) => b\.id === this\._bodyId\)/, 'base screen resolves body from claims.list'],
    [/body\.size \+ '-class body[\s\S]*usedSlots \+ '\/' \+ body\.slots \+ ' module slots[\s\S]*body\.sectorId/, 'base screen shows size slots and sector'],
    [/for \(let i = 0; i < body\.slots; i\+\+\) \{[\s\S]*const modId = body\.modules\[i\];/, 'base screen renders installed modules by slot'],
    [/slot\.className = 'base-slot empty';[\s\S]*empty slot/, 'base screen shows empty ledger slots'],
    [/state\.ui\.pendingClaimBodyId = null;/, 'base screen consumes pending claim handoff'],
    [/claims\.buildModule\(body\.id, mod\.id\)\) this\._render\(\);/, 'base screen rebuilds from the ledger after a module build'],
    [/body\.modules\.includes\('mod_teleporter'\)/, 'base screen exposes teleporter state from built modules'],
    [/claims\.teleportFrom\(body\.id\);/, 'base screen routes teleport through claims system'],
  ];
  for (const [pattern, label] of checks) {
    if (!pattern.test(BASE_SOURCE)) throw new Error(`base claim-ledger source contract failed: ${label}`);
  }
}

function makeHarness({
  credits = 100000,
  researchedNodes = [],
  initialBodies = [],
} = {}) {
  const events = [];
  const stationNear = {
    id: 'stationNear',
    alive: true,
    type: 'station',
    pos: { x: 40, z: 0 },
    data: { stationId: 'station_near', name: 'Near Station' },
  };
  const stationFar = {
    id: 'stationFar',
    alive: true,
    type: 'station',
    pos: { x: 400, z: 0 },
    data: { stationId: 'station_far', name: 'Far Station' },
  };
  const state = {
    simTime: 123,
    world: { currentSectorId: 'sector_helios_prime' },
    player: { credits, researchedNodes, cargo: { items: {} } },
    claims: { bodies: [] },
    entityList: [stationNear, stationFar],
    entityIndex: {
      stations: [stationNear, stationFar],
      dockStations: [stationNear, stationFar],
      byStationId: new Map([
        ['station_near', stationNear],
        ['station_far', stationFar],
      ]),
    },
  };
  const bus = { emit: (event, payload) => events.push({ event, payload }) };
  const sys = { ...claimsBase };
  sys.init({ state, bus, ctx: {} });
  sys.deserialize({ bodies: initialBodies.map((body) => ({ ...body, modules: (body.modules || []).slice() })) });
  return { state, bus, events, sys };
}

function makePoi({
  id = 'poi_body',
  name = 'Claim Moon',
  size = 'M',
  pos = { x: 10, z: 0 },
} = {}) {
  return { id, name, size, pos };
}

function chargeEvents(events) {
  return events
    .filter((e) => e.event === 'economy:chargeCredits')
    .map((e) => ({ amount: e.payload.amount, reason: e.payload.reason }));
}
