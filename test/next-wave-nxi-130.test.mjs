// NXI-130: a refinery whose output store is full says why it stopped, and says
// active again after a withdrawal that actually makes room. Drives the shipped
// claims system. The operating word stays 'active' so the site keeps working.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claims as claimsBase, SPEC_UPKEEP_EVERY_S } from '../src/systems/claims.js';
import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { addCargo } from '../src/systems/cargo.js';

const LAWFUL = 'sector_helios_prime';
const FULL_LINE = 'Output store full — collect refined goods';

function makeBus() {
  const handlers = new Map();
  return {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function boot() {
  const state = {
    simTime: 1000,
    meta: { seed: 130 },
    playerId: 'player',
    mode: 'flight',
    player: {
      credits: 200000,
      heat: 0,
      droneTierCap: 1,
      stats: {},
      researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 },
      ownedShips: [],
    },
    factions: Object.freeze({}),
    world: { currentSectorId: LAWFUL, activeSector: null },
    entities: new Map(),
    entityList: [],
    claims: null,
  };
  const bus = makeBus();
  bus.on('economy:chargeCredits', (p) => {
    const amt = Math.max(0, Math.round(p.amount || 0));
    state.player.credits = Math.max(0, (state.player.credits || 0) - amt);
  });
  bus.on('economy:grantCredits', (p) => {
    const amt = Math.max(0, Math.round(p.amount || 0));
    state.player.credits = (state.player.credits || 0) + amt;
  });
  const sys = { ...claimsBase };
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  if (!state.claims) state.claims = { bodies: [] };
  return { state, bus, sys };
}

function runSim(h, seconds, dt = 1) {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) {
    h.state.simTime += dt;
    h.sys.update(dt, h.state);
  }
}

function commission(h, specId) {
  assert.equal(h.sys.claim({
    id: 'poi_' + specId,
    name: specId + ' yard',
    size: 'M',
    pos: { x: 40, z: 10 },
  }), true);
  const body = h.state.claims.bodies.at(-1);
  const def = BODY_SPECIALIZATION_BY_ID.get(specId);
  assert.equal(h.sys.buildModule(body.id, def.requiresModule), true);
  assert.equal(h.sys.specialize(body.id, specId), true);
  return body;
}

function volPerUnit(goodId) {
  const def = COMMODITIES.find((row) => row.id === goodId);
  assert.ok(def && def.volPerU > 0, 'shipped commodity volume: ' + goodId);
  return def.volPerU;
}

test('a full refinery says the store is full and returns to active after a real withdrawal', () => {
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');
  assert.ok(spec.outputCapU > 0 && spec.refineRatePerS > 0 && spec.inputCapU > 0);
  const h = boot();
  const body = commission(h, 'spec_refinery');

  addCargo(h.state, 'cmdty_ore_iron', spec.inputCapU);
  assert.equal(h.sys.deliverToClaim(body.id, 'cmdty_ore_iron', spec.inputCapU), spec.inputCapU);

  const limit = Math.ceil(spec.inputCapU / spec.refineRatePerS) + 2;
  let steps = 0;
  while ((h.sys.ledger(body.id).stores.outputU || 0) < spec.outputCapU && steps < limit) {
    runSim(h, 1, 1);
    steps += 1;
  }
  const full = h.sys.ledger(body.id);
  assert.ok(full.stores.outputU >= spec.outputCapU, 'refining fills the published output cap');
  assert.equal(full.status, FULL_LINE);
  assert.equal(body.spec.status, 'active', 'the site stays commissioned and working');
  const receipt = body.spec.receipts.find((row) => row.kind === 'output_full');
  assert.ok(receipt, 'the tick still records the full-store receipt');
  assert.equal(receipt.text, full.status);

  const parked = full.stores.outputU;
  runSim(h, 1, 1);
  assert.equal(h.sys.ledger(body.id).stores.outputU, parked, 'a full store does not keep accepting goods');
  assert.equal(h.sys.ledger(body.id).status, FULL_LINE);

  h.state.player.credits = 0;
  runSim(h, SPEC_UPKEEP_EVERY_S * 2 + 1, 1);
  assert.equal(body.spec.status, 'cold');
  assert.equal(h.sys.ledger(body.id).status, 'cold', 'a cold site keeps that word while the store is full');
  h.state.player.credits = 100000;
  runSim(h, SPEC_UPKEEP_EVERY_S + 1, 1);
  assert.equal(body.spec.status, 'active');
  assert.equal(h.sys.ledger(body.id).status, FULL_LINE, 'paying the crew brings the full-store reason back');

  const goodId = Object.keys(body.spec.store.output)[0];
  const vol = volPerUnit(goodId);
  const holdUnits = 4;
  body.spec.store.output[goodId] += holdUnits;
  h.state.player.cargo.capVolume = h.state.player.cargo.usedVolume + vol * holdUnits;
  const partial = h.sys.collectFromClaim(body.id);
  assert.equal(partial, holdUnits);
  const stillFull = h.sys.ledger(body.id);
  assert.ok(stillFull.stores.outputU >= spec.outputCapU);
  assert.equal(stillFull.status, FULL_LINE, 'a pickup that leaves the store full does not clear the reason');
  assert.equal(body.spec.status, 'active');
  assert.equal(body.spec.outputFull, false, 'the sticky flag is not what the readout trusts');

  const remaining = stillFull.stores.outputU;
  h.state.player.cargo.capVolume = h.state.player.cargo.usedVolume + vol * remaining;
  const cleared = h.sys.collectFromClaim(body.id);
  assert.ok(cleared > 0);
  const open = h.sys.ledger(body.id);
  assert.ok(open.stores.outputU < spec.outputCapU);
  assert.equal(open.status, 'active');
  assert.equal(body.spec.status, 'active');

  h.state.player.cargo.capVolume = h.state.player.cargo.usedVolume + 400;
  addCargo(h.state, 'cmdty_ore_iron', spec.inputCapU);
  assert.ok(h.sys.deliverToClaim(body.id, 'cmdty_ore_iron', spec.inputCapU) > 0, 'ore reaches a store that has room');
  const before = h.sys.ledger(body.id).stores.outputU;
  let grew = 0;
  while ((h.sys.ledger(body.id).stores.outputU || 0) <= before && grew < limit) {
    runSim(h, 1, 1);
    grew += 1;
  }
  const working = h.sys.ledger(body.id);
  assert.ok(working.stores.outputU > before, 'a store with room still refines');
  assert.ok(working.stores.outputU < spec.outputCapU);
  assert.equal(working.status, 'active');
});

test('a relay and a refinery with room do not wear the full-store reason', () => {
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');
  const h = boot();
  const refinery = commission(h, 'spec_refinery');
  const room = h.sys.ledger(refinery.id);
  assert.equal(room.status, 'active');
  assert.ok(room.stores.outputU < spec.outputCapU);

  const relay = commission(h, 'spec_relay');
  const read = h.sys.ledger(relay.id);
  assert.equal(read.status, 'active');
  assert.notEqual(read.status, FULL_LINE);
});
