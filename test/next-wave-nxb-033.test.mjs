// NXB-033: a refinery stays a working place through a full-output or starved-input
// interruption. A blocked site freezes its partial work meter instead of banking
// idle time into free batches; hauling output or delivering ore resumes the same
// conversion at the authored rate — 2u ore -> 1u refined, no duplicated goods, no
// invented costs. Drives the shipped claims system headlessly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claims as claimsBase, SPEC_UPKEEP_EVERY_S } from '../src/systems/claims.js';
import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { addCargo } from '../src/systems/cargo.js';

const LAWFUL = 'sector_helios_prime';
const ORE = 'cmdty_ore_iron';
const REFINED = 'cmdty_refined_metals';
const RATIO = 2; // the authored recipe: 2u of one ore -> 1u refined (REFINE_RATIO)
const FULL_LINE = 'Output store full — collect refined goods';
const STARVED_LINE = 'Awaiting ore — next batch consumes 2u of one refinable ore';

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function boot({ seed = 33 } = {}) {
  const state = {
    simTime: 1000,
    meta: { seed },
    playerId: 'player',
    mode: 'flight',
    player: {
      credits: 200000,
      heat: 0,
      droneTierCap: 1,
      stats: {},
      researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 4000, capMass: 4000 },
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

function upkeepCharges(h) {
  return h.bus.emitLog.filter((e) => e.evt === 'economy:chargeCredits' && e.payload.reason === 'claim_upkeep');
}

test('a packed output store freezes partial work; collecting resumes the authored rate', () => {
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');
  const h = boot();
  const body = commission(h, 'spec_refinery');
  addCargo(h.state, ORE, 40);
  assert.equal(h.sys.deliverToClaim(body.id, ORE, 40), 40);

  // real partial batch parked: three seconds of work, short of one conversion
  runSim(h, 3, 1);
  const parkedAcc = body.spec.acc;
  assert.ok(parkedAcc > 0 && parkedAcc < RATIO, 'mid-batch work is parked, not yet goods');

  // the output store packs solid — the recoverable stall the player must clear
  body.spec.store.output[REFINED] = spec.outputCapU;
  assert.equal(h.sys.ledger(body.id).status, FULL_LINE);

  // a long absence in long ticks must not compound into queued batches
  runSim(h, 600, 30);
  assert.equal(body.spec.acc, parkedAcc, 'a full output store does not bank idle batches');
  assert.equal(body.spec.store.input[ORE], 40, 'no ore is consumed while the site cannot ship');
  assert.equal(h.sys.ledger(body.id).stores.outputU, spec.outputCapU);

  // hauling out resumes the SAME work — the parked partial completes first
  const moved = h.sys.collectFromClaim(body.id);
  assert.equal(moved, spec.outputCapU, 'collect ships the whole packed store');
  assert.equal(body.spec.acc, parkedAcc, 'collecting preserves the in-flight batch');
  runSim(h, 1, 1);
  assert.equal(body.spec.store.output[REFINED], 1, 'only the real partial batch resumes');
  assert.equal(body.spec.store.input[ORE], 40 - RATIO, 'the batch consumes the 2:1 recipe');
  assert.equal(body.spec.acc, 0);

  // then it keeps producing at the authored rate — one batch per RATIO/rate seconds
  runSim(h, 8, 1);
  assert.equal(body.spec.store.output[REFINED], 3);
  assert.equal(body.spec.store.input[ORE], 40 - 3 * RATIO, 'every unit out cost exactly 2u in');

  // a second collection cannot duplicate what already shipped
  const held = h.state.player.cargo.items[REFINED] || 0;
  assert.equal(h.sys.collectFromClaim(body.id), 3);
  assert.equal(h.sys.collectFromClaim(body.id), 0, 'collecting an empty store grants nothing');
  assert.equal(h.state.player.cargo.items[REFINED], held + 3);
});

test('starved input freezes partial work and says so; delivering ore resumes the authored rate', () => {
  const h = boot();
  const body = commission(h, 'spec_refinery');
  addCargo(h.state, ORE, 6);
  assert.equal(h.sys.deliverToClaim(body.id, ORE, 6), 6);
  runSim(h, 3, 1); // 1.5u of one batch parked, nothing converted yet
  const parkedAcc = body.spec.acc;
  assert.ok(parkedAcc > 0 && parkedAcc < RATIO);

  // pull the ore back out — parked work with no material is the starved stall
  assert.equal(h.sys.withdrawFromClaim(body.id, ORE, 6), 6);
  const starved = h.sys.ledger(body.id);
  assert.equal(starved.status, STARVED_LINE, 'the ledger names the recoverable cause');
  assert.equal(starved.throughput.nextBatch.inputU, RATIO, 'the next real conversion takes 2u in');
  assert.equal(starved.throughput.nextBatch.outputU, 1, 'and yields 1u out — never advertised 1:1');
  assert.equal(starved.throughput.nextBatch.goodId, null, 'no ore can currently cover a batch');

  // idle seconds must not bank queued batches; upkeep still runs while staffed
  const creditsBefore = h.state.player.credits;
  runSim(h, SPEC_UPKEEP_EVERY_S * 3 + 1, 30);
  assert.equal(body.spec.acc, parkedAcc, 'starved input does not bank idle batches');
  assert.ok(upkeepCharges(h).length >= 3, 'a staffed starved site still pays its crews');
  assert.ok(h.state.player.credits < creditsBefore, 'upkeep drains through the economy writer');

  // delivering ore resumes the SAME work — the parked partial completes first
  addCargo(h.state, ORE, 6);
  assert.equal(h.sys.deliverToClaim(body.id, ORE, 6), 6);
  const working = h.sys.ledger(body.id);
  assert.equal(working.status, 'active');
  assert.equal(working.throughput.nextBatch.goodId, ORE, 'the ledger names the ore the batch draws');
  runSim(h, 1, 1);
  assert.equal(body.spec.store.output[REFINED], 1, 'the parked batch completes first');
  assert.equal(body.spec.store.input[ORE], 6 - RATIO);
  assert.equal(body.spec.acc, 0);
  runSim(h, 12, 1);
  assert.equal(body.spec.store.output[REFINED], 3, 'production continues at the authored rate');
  assert.equal(body.spec.store.input[ORE] || 0, 0, 'every output consumed exactly 2u of ore');
});

test('a coarse tick that runs out of capacity discards the unspent accrual — resume starts from zero', () => {
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');

  // starved end: one parked partial plus exactly one batch of ore. A coarse tick
  // may convert that batch, but accrual arriving after the stall is not work —
  // whether the remainder spans whole batches (dt 30) or only a fraction (dt 6).
  for (const span of [6, 30]) {
    const h = boot({ seed: 4242 });
    const body = commission(h, 'spec_refinery');
    addCargo(h.state, ORE, RATIO);
    h.sys.deliverToClaim(body.id, ORE, RATIO);
    runSim(h, 1, 1); // 0.5 of a batch parked
    assert.equal(body.spec.acc, 0.5);
    runSim(h, span, span);
    assert.equal(body.spec.store.output[REFINED], 1, `the one permitted batch ran (dt ${span})`);
    assert.equal(body.spec.store.input[ORE] || 0, 0);
    assert.equal(body.spec.acc, 0, `post-conversion accrual is discarded, not banked (dt ${span})`);

    // the resumed meter starts from zero — the next batch takes a full interval
    addCargo(h.state, ORE, RATIO);
    h.sys.deliverToClaim(body.id, ORE, RATIO);
    runSim(h, 3, 1);
    assert.equal(body.spec.store.output[REFINED], 1, `no leftover idle work becomes goods (dt ${span})`);
    runSim(h, 1, 1);
    assert.equal(body.spec.store.output[REFINED], 2, `the batch lands on real time only (dt ${span})`);
  }

  // packed-output end: same coarse tick with one unit of room left in the store
  for (const span of [6, 30]) {
    const h = boot({ seed: 4242 });
    const body = commission(h, 'spec_refinery');
    addCargo(h.state, ORE, RATIO);
    h.sys.deliverToClaim(body.id, ORE, RATIO);
    runSim(h, 1, 1);
    assert.equal(body.spec.acc, 0.5);
    body.spec.store.output[REFINED] = spec.outputCapU - 1; // one unit of room
    runSim(h, span, span);
    assert.equal(body.spec.store.output[REFINED], spec.outputCapU, `the room-taking batch ran (dt ${span})`);
    assert.equal(body.spec.store.input[ORE] || 0, 0);
    assert.equal(body.spec.acc, 0, `work accrued past the packed store is discarded (dt ${span})`);
    assert.equal(h.sys.ledger(body.id).status, FULL_LINE);

    // hauling out and restocking resumes the meter from zero, not from banked time
    h.sys.collectFromClaim(body.id);
    addCargo(h.state, ORE, RATIO);
    h.sys.deliverToClaim(body.id, ORE, RATIO);
    runSim(h, 3, 1);
    assert.equal(body.spec.store.output[REFINED] || 0, 0, `no free partial batch survived the stall (dt ${span})`);
    runSim(h, 1, 1);
    assert.equal(body.spec.store.output[REFINED], 1, `the resumed batch lands on real time (dt ${span})`);
  }
});

test('a refused delivery and a refused re-commission leave every unit where it was', () => {
  const h = boot();
  const body = commission(h, 'spec_refinery');
  addCargo(h.state, 'cmdty_fuel_cells', 5);
  addCargo(h.state, ORE, 3);

  // a non-refinable good is refused before anything leaves the hold
  assert.equal(h.sys.deliverToClaim(body.id, 'cmdty_fuel_cells', 5), 0);
  assert.equal(h.state.player.cargo.items.cmdty_fuel_cells, 5, 'rejected freight stays aboard');
  assert.deepEqual(body.spec.store.input, {}, 'nothing enters the site store');

  // a partial input accepted, then a re-commission attempt is refused — stores stay put
  assert.equal(h.sys.deliverToClaim(body.id, ORE, 3), 3);
  assert.equal(h.sys.specialize(body.id, 'spec_relay'), false, 'switching with freight aboard is refused');
  assert.equal(body.spec.id, 'spec_refinery', 'the old identity keeps running');
  assert.equal(body.spec.store.input[ORE], 3, 'accepted input survives the refusal');

  // neighboring success: emptying the store frees the same switch
  assert.equal(h.sys.buildModule(body.id, 'mod_depot'), true);
  assert.equal(h.sys.withdrawFromClaim(body.id, ORE, 3), 3);
  assert.equal(h.sys.specialize(body.id, 'spec_relay'), true, 'the switch works once the site is empty');
});

test('save/load resumes the same conversion and upkeep cadence — nothing duplicated, nothing reset', () => {
  const h = boot();
  const body = commission(h, 'spec_refinery');
  addCargo(h.state, ORE, 30);
  h.sys.deliverToClaim(body.id, ORE, 30);
  runSim(h, 3, 1); // parked partial batch + a live upkeep accumulator
  const snap = JSON.parse(JSON.stringify(h.sys.serialize()));

  const h2 = boot();
  h2.sys.deserialize(snap);
  const restored = h2.state.claims.bodies[0];
  assert.equal(restored.spec.acc, body.spec.acc, 'partial work round-trips');
  assert.deepEqual(restored.spec.store, body.spec.store, 'stores round-trip exactly');
  assert.equal(restored.spec.totals.refinedTotalU, body.spec.totals.refinedTotalU);

  // the loaded site finishes the SAME parked batch — no replay, no loss, no free work
  h2.state.simTime = h.state.simTime;
  runSim(h2, 1, 1);
  assert.equal(restored.spec.store.output[REFINED], 1, 'the saved batch completes once');
  assert.equal(restored.spec.store.input[ORE], 30 - RATIO);

  // the continuation is identical to a run that never saved
  const hRef = boot();
  const refBody = commission(hRef, 'spec_refinery');
  addCargo(hRef.state, ORE, 30);
  hRef.sys.deliverToClaim(refBody.id, ORE, 30);
  runSim(hRef, 4, 1); // the same 3s parked + 1s continuation, uninterrupted
  h2.state.simTime = hRef.state.simTime;
  h2.state.player.credits = hRef.state.player.credits;
  runSim(h2, 120, 1);
  runSim(hRef, 120, 1);
  assert.deepEqual(restored.spec.store, refBody.spec.store, 'reload does not fork production');
  assert.equal(restored.spec.acc, refBody.spec.acc);
  assert.equal(Math.round(restored.spec.upkeepDebt), Math.round(refBody.spec.upkeepDebt),
    'upkeep keeps accruing on the same meter, not a fresh clock');
});
