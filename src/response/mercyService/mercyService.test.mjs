import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { LOOP_FIXED_DT } from '../../core/simulationRunner.js';
import { MERCY_LIVE_PLACE_IDS } from './live.js';
import { settleDelivery } from './settlement.js';
import {
  MERCY_DT, MERCY_MODELS, MODEL_IDS, PHASES, acceptContract, beginIncident,
  boardIncidents, canonicalSuccessTrace, commandFor, createMercyRuntime,
  createMercyFixtureSystem, createMercyServiceSystem, damagePlayer, destroyMercyRuntime, destroyRescueBody,
  incidentById, noteImpact, report, restoreMercy, runIncident, seedSector,
  shelveMercy, snapshotMercy, stepMercy, syncFocus, unshelveMercy, validateCatalog,
  worldDigest, worldParts,
} from './index.js';

const SEED = 80611;

test('payout listeners observe a terminal incident and cannot re-enter settlement', () => {
  let rt;
  const events = [];
  const bus = { emit(type) {
    events.push(type);
    if (type === 'economy:grantCredits') {
      const inc = rt.focus;
      assert.equal(inc.latches.settled, true);
      const body = inc.bodyList.find((row) => row.localId === 'capsule');
      settleDelivery(rt, inc, body, false);
    }
  } };
  rt = createMercyRuntime({ seed: SEED, bus });
  assert.equal(beginIncident(rt, 'ms_pod_traffic').ok, true);
  const inc = rt.focus;
  const body = inc.bodyList.find((row) => row.localId === 'capsule');
  const receipt = settleDelivery(rt, inc, body, true);
  assert.equal(receipt.beaconOk, true, 'reentry must not replace the original lawful outcome');
  assert.deepEqual(events, ['economy:grantCredits', 'distress:rescued']);
});

function incidentOf(rt, id) {
  return Object.values(rt.incidents).find((inc) => inc.defId === id);
}

function holdSouth(rt, localId) {
  const body = rt.focus.bodyList.find((row) => row.localId === localId);
  const point = { x: body.pos.x, z: body.pos.z - 14 };
  const dx = point.x - rt.player.pos.x;
  const dz = point.z - rt.player.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  return {
    thrustX: Math.max(-1, Math.min(1, ((dx / dist) * 28 - rt.player.vel.x) / 10)),
    thrustZ: Math.max(-1, Math.min(1, ((dz / dist) * 28 - rt.player.vel.z) / 10)),
    tether: { targetLocal: localId, reel: -1 },
  };
}

test('catalog is twelve emergencies in four families with two orders and four chains', () => {
  const errors = validateCatalog();
  assert.deepEqual(errors, []);
  const board = boardIncidents();
  assert.equal(board.length, 12);
  const families = {};
  let chains = 0;
  for (const def of board) {
    families[def.family] = (families[def.family] || 0) + 1;
    assert.ok(Object.keys(def.orders).length >= 2, def.id);
    assert.ok(def.rights.length >= 1);
    assert.ok(def.failure.pathway.length > 10);
    if (def.failure.spawn) chains += 1;
  }
  assert.equal(Object.keys(families).length, 4);
  for (const count of Object.values(families)) assert.equal(count, 3);
  assert.ok(chains >= 4);
  assert.ok(MODEL_IDS.length >= 6);
  assert.equal(MERCY_DT, LOOP_FIXED_DT);
  assert.deepEqual(canonicalSuccessTrace(), PHASES);
});

test('both orders of every board rescue settle with a real delivery', () => {
  const orders = [];
  for (const def of boardIncidents()) orders.push(...Object.keys(def.orders).map((policy) => [def.id, policy]));
  assert.equal(orders.length, 24);
  for (const [id, policy] of orders) {
    const out = runIncident({ seed: SEED, id, policy, ticks: 3200 });
    const inc = incidentOf(out.rt, id);
    assert.equal(inc.phase, 'aftermath', `${id} ${policy} ${inc.phase} t=${out.rt.simTime.toFixed(2)}`);
    assert.equal(inc.resolvedOrder, policy, `${id} resolved ${inc.resolvedOrder}`);
    assert.ok(inc.deliveredTo, id);
    assert.ok(!['lost', 'leave', 'unlawful'].includes(inc.outcome), `${id} ${inc.outcome}`);
    assert.ok(inc.peakTension > 0 || inc.toolsSeen.includes('clamp') || inc.toolsSeen.includes('stabilizer'), id);
    assert.ok(out.rt.stats.maxBodiesThisTick <= 48);
    const grants = out.report.intents.filter((row) => row.type === 'economy:grantCredits');
    assert.equal(grants.length, 1, id);
    assert.ok(grants[0].amount > 0);
  }
});

test('stage trace follows physics latches and a life rescue pays through the credit intent', () => {
  const out = runIncident({ seed: SEED, id: 'ms_pod_traffic', policy: 'tether-berth' });
  const inc = incidentOf(out.rt, 'ms_pod_traffic');
  assert.deepEqual(inc.trace, PHASES);
  const grant = out.report.intents.find((row) => row.type === 'economy:grantCredits');
  assert.equal(grant.amount, 3 * 450);
  assert.ok(out.report.intents.some((row) => row.type === 'distress:rescued'));
  assert.equal(inc.resolvedOrder, 'tether-berth');
  const other = runIncident({ seed: SEED, id: 'ms_pod_traffic', policy: 'tether-barge' });
  const barge = incidentOf(other.rt, 'ms_pod_traffic');
  assert.equal(barge.resolvedOrder, 'tether-barge');
  assert.notEqual(barge.deliveredTo, inc.deliveredTo);
  assert.ok(inc.toolsSeen.includes('tether'));
  assert.equal(out.rt.equipment.starterTether.limited, false);
  assert.equal(out.rt.equipment.starterTether.charges, null);
});

test('ore and engine orders pay different custody, and a dead beacon makes cargo unlawful', () => {
  const ore = runIncident({ seed: SEED, id: 'ms_ore_cut', policy: 'ore-first' });
  const engine = runIncident({ seed: SEED, id: 'ms_ore_cut', policy: 'engine-first' });
  assert.equal(incidentOf(ore.rt, 'ms_ore_cut').outcome, 'mixed');
  assert.equal(incidentOf(engine.rt, 'ms_ore_cut').outcome, 'lives');
  const orePay = ore.report.intents.find((row) => row.type === 'economy:grantCredits').amount;
  const enginePay = engine.report.intents.find((row) => row.type === 'economy:grantCredits').amount;
  assert.notEqual(orePay, enginePay);

  const rt = createMercyRuntime({ seed: 3 });
  beginIncident(rt, 'ms_ore_cut');
  for (let i = 0; i < 90; i++) stepMercy(rt, MERCY_DT, commandFor(rt, 'ore-first'));
  const beacon = rt.focus.bodyList.find((body) => body.role === 'beacon');
  noteImpact(beacon, 16);
  assert.equal(beacon.modelState, 'damaged');
  assert.equal(beacon.emits, false);
  assert.ok(worldParts(beacon).length < worldParts({ ...beacon, modelState: 'intact', model: beacon.model, rot: 0, pos: beacon.pos }).length);
  noteImpact(beacon, 999);
  assert.equal(beacon.alive, false);
  for (let i = 0; i < 2000; i++) {
    syncFocus(rt);
    if (!rt.focus || rt.focus.latches.settled || rt.focus.failedForward) break;
    stepMercy(rt, MERCY_DT, commandFor(rt, 'ore-first'));
  }
  const card = report(rt);
  assert.equal(card.outcome, 'unlawful');
  assert.ok(card.intents.some((row) => row.type === 'economy:chargeCredits' && row.amount === 400));
  assert.ok(card.intents.some((row) => row.type === 'faction:repDelta' && row.amount === -8));
  assert.ok(card.intents.some((row) => row.type === 'mercyService:lawFact' && row.fact === 'custody_without_beacon'));
  assert.equal(card.intents.some((row) => row.type === 'economy:grantCredits'), false);
  assert.equal(card.intents.some((row) => row.type === 'distress:rescued'), false);
});

test('four failures become a second incident that can still be recovered', () => {
  const chains = [
    ['ms_drift_lane', 'ms_drift_lane_container'],
    ['ms_tank_vent', 'ms_tank_spread'],
    ['ms_gantry_swing', 'ms_gantry_crew'],
    ['ms_pod_rival', 'ms_pod_rival_second'],
  ];
  for (const [id, childId] of chains) {
    const rt = createMercyRuntime({ seed: SEED });
    beginIncident(rt, id);
    for (let i = 0; i < 2800; i++) {
      syncFocus(rt);
      if (!rt.focus || rt.focus.defId !== id) break;
      if (rt.focus.latches.settled || rt.focus.failedForward) break;
      stepMercy(rt, MERCY_DT, commandFor(rt, 'neglect'));
    }
    const parent = incidentOf(rt, id);
    assert.equal(parent.failedForward, true, id);
    assert.equal(parent.childDefId, childId);
    assert.equal(parent.outcome, null);
    assert.equal(rt.intentLog.some((row) => row.type === 'economy:grantCredits' && row.incidentId === id), false);
    for (let i = 0; i < 2400; i++) {
      syncFocus(rt);
      if (!rt.focus || rt.focus.latches.settled) break;
      stepMercy(rt, MERCY_DT, commandFor(rt, rt.focus.def.defaultOrder));
    }
    const card = report(rt);
    assert.equal(card.id, childId, id);
    assert.equal(card.phase, 'aftermath');
    assert.ok(card.intents.some((row) => row.type === 'economy:grantCredits' && row.amount > 0));
  }
});

test('chain depth refuses a third incident', () => {
  const rt = createMercyRuntime({ seed: SEED });
  beginIncident(rt, 'ms_drift_lane');
  for (let i = 0; i < 2000; i++) {
    syncFocus(rt);
    if (!rt.focus || rt.focus.defId !== 'ms_drift_lane') break;
    stepMercy(rt, MERCY_DT, commandFor(rt, 'neglect'));
  }
  const child = rt.focus;
  assert.equal(child.defId, 'ms_drift_lane_container');
  assert.equal(child.depth, 1);
  const box = child.bodyList.find((body) => body.localId === 'container');
  const shear = child.bodyList.find((body) => body.localId === 'shear');
  box.pos.x = shear.pos.x;
  box.pos.z = shear.pos.z;
  box.prev.x = shear.pos.x;
  box.prev.z = shear.pos.z;
  stepMercy(rt, MERCY_DT, commandFor(rt, 'neglect'));
  const ids = Object.values(rt.incidents).map((inc) => inc.defId);
  assert.deepEqual(ids, ['ms_drift_lane', 'ms_drift_lane_container']);
  assert.equal(incidentOf(rt, 'ms_drift_lane_container').outcome, 'lost');
});

test('heavy, spinning, and volatile bodies reject the starter line alone', () => {
  const heavy = createMercyRuntime({ seed: SEED });
  beginIncident(heavy, 'ms_drift_lane');
  for (let i = 0; i < 480; i++) {
    syncFocus(heavy);
    if (!heavy.focus || heavy.focus.defId !== 'ms_drift_lane') break;
    stepMercy(heavy, MERCY_DT, holdSouth(heavy, 'tug'));
  }
  assert.equal(incidentOf(heavy, 'ms_drift_lane').latches.secured, false);
  assert.equal(incidentOf(heavy, 'ms_drift_lane').latches.settled, false);
  assert.ok(incidentOf(heavy, 'ms_drift_lane').arrest > 18);

  const spin = createMercyRuntime({ seed: SEED });
  beginIncident(spin, 'ms_drift_well');
  for (let i = 0; i < 360; i++) {
    syncFocus(spin);
    if (!spin.focus || spin.focus.defId !== 'ms_drift_well') break;
    stepMercy(spin, MERCY_DT, holdSouth(spin, 'hull'));
  }
  assert.ok(incidentOf(spin, 'ms_drift_well').snapCount > 0);
  assert.equal(incidentOf(spin, 'ms_drift_well').latches.stabilized, false);

  const tank = createMercyRuntime({ seed: SEED });
  beginIncident(tank, 'ms_tank_vent');
  for (let i = 0; i < 1200; i++) {
    syncFocus(tank);
    if (!tank.focus || tank.focus.defId !== 'ms_tank_vent') break;
    stepMercy(tank, MERCY_DT, holdSouth(tank, 'tank'));
  }
  assert.equal(incidentOf(tank, 'ms_tank_vent').failedForward, true);
  assert.equal(incidentOf(tank, 'ms_tank_vent').childDefId, 'ms_tank_spread');
  assert.equal(tank.intentLog.some((row) => row.type === 'economy:grantCredits'), false);
});

test('a stuffed latch, a map teleport, and a bad step do not settle', () => {
  const rt = createMercyRuntime({ seed: SEED });
  beginIncident(rt, 'ms_pod_traffic');
  rt.focus.latches.approached = true;
  rt.focus.latches.settled = true;
  rt.focus.reading = { hull: 1, survivors: 9, volatile: false, cargoCr: 0, evidence: 0 };
  const before = rt.simTime;
  const refused = stepMercy(rt, 0.25, {});
  assert.equal(refused.ok, false);
  assert.equal(rt.simTime, before);
  stepMercy(rt, MERCY_DT, { thrustX: 0, thrustZ: 0 });
  const opened = incidentOf(rt, 'ms_pod_traffic');
  assert.equal(opened.latches.approached, false);
  assert.equal(opened.latches.settled, false);
  assert.equal(opened.reading, null);
  const capsule = opened.bodyList.find((body) => body.localId === 'capsule');
  const berth = opened.bodyList.find((body) => body.localId === 'berth');
  capsule.prev.x = capsule.pos.x;
  capsule.prev.z = capsule.pos.z;
  capsule.pos.x = berth.pos.x;
  capsule.pos.z = berth.pos.z;
  capsule.vel.x = 0;
  capsule.vel.z = 0;
  stepMercy(rt, MERCY_DT, { thrustX: 0, thrustZ: 0 });
  assert.equal(incidentOf(rt, 'ms_pod_traffic').latches.extracted, false);
  assert.equal(rt.intentLog.length, 0);
});

test('leave and ship loss pay nothing; settlement does not repeat', () => {
  const left = runIncident({ seed: 1, id: 'ms_pod_traffic', policy: 'leave', ticks: 1200 });
  assert.equal(left.report.outcome, 'leave');
  assert.equal(left.report.phase, 'aftermath');
  assert.equal(left.report.intents.length, 0);

  const dead = createMercyRuntime({ seed: 1 });
  beginIncident(dead, 'ms_drift_crusher');
  damagePlayer(dead, 500);
  assert.equal(dead.player.alive, false);
  const heldStep = stepMercy(dead, MERCY_DT, commandFor(dead, 'neglect'));
  assert.equal(heldStep.ok, true);
  assert.equal(heldStep.held, 'ship-loss');
  for (let i = 0; i < 1199; i++) {
    syncFocus(dead);
    if (!dead.focus || dead.focus.latches.settled) break;
    const stepped = stepMercy(dead, MERCY_DT, commandFor(dead, 'neglect'));
    assert.equal(stepped.held, 'ship-loss');
  }
  const held = incidentOf(dead, 'ms_drift_crusher');
  assert.equal(held.latches.settled, false);
  assert.equal(held.outcome, null);
  assert.equal(dead.focus && dead.focus.uid, held.uid);
  assert.equal(dead.intentLog.some((row) => row.type === 'economy:grantCredits'), false);

  let emitted = 0;
  const bus = { emit(type) { if (type === 'economy:grantCredits') emitted += 1; } };
  const paid = createMercyRuntime({ seed: SEED, bus });
  assert.equal(beginIncident(paid, 'ms_pod_traffic').ok, true);
  const done = runIncident({ runtime: paid, policy: 'tether-berth' });
  const grantRows = done.rt.intentLog.filter((row) => row.type === 'economy:grantCredits');
  assert.equal(grantRows.length, 1);
  assert.equal(emitted, 1);
  assert.equal(done.rt.appliedGrants[grantRows[0].key], true);
  const applied = Object.keys(done.rt.appliedGrants).length;
  const snap = JSON.parse(JSON.stringify(snapshotMercy(done.rt)));
  const copy = createMercyRuntime({ seed: SEED, bus });
  assert.equal(restoreMercy(copy, snap).ok, true);
  assert.equal(Object.keys(copy.appliedGrants).length, applied);
  assert.equal(copy.appliedGrants[grantRows[0].key], true);
  for (let i = 0; i < 30; i++) stepMercy(copy, MERCY_DT, commandFor(copy, 'neglect'));
  assert.equal(Object.keys(copy.appliedGrants).length, applied);
  assert.equal(copy.intentLog.filter((row) => row.type === 'economy:grantCredits').length, 1);
  assert.equal(emitted, 1);
  // Receipt keys short-circuit before appliedGrants. Drop the paid key and the
  // settled latch so the next step asks to pay the same grant again.
  const restored = incidentOf(copy, 'ms_pod_traffic');
  restored.latches.settled = false;
  delete restored.settlementReceipt.keys[grantRows[0].key];
  stepMercy(copy, MERCY_DT, commandFor(copy, 'neglect'));
  assert.equal(Object.keys(copy.appliedGrants).length, applied);
  assert.equal(copy.intentLog.filter((row) => row.type === 'economy:grantCredits').length, 1);
  assert.equal(emitted, 1);
});

test('a delegated dead ship holds ship-loss and a living one grants once', () => {
  const extractHold = incidentById('ms_pod_traffic').extractHold;
  assert.equal(extractHold, 0.3);
  const crossHold = extractHold - MERCY_DT;
  assert.equal(crossHold, 0.2833333333333333);

  function boot(mutate) {
    const player = { id: 1, alive: true, pos: { x: 400, z: 400 }, vel: { x: 0, z: 0 } };
    const state = {
      meta: { seed: 1 }, simTime: 0, playerId: player.id, input: {},
      entities: new Map([[player.id, player]]),
    };
    const bus = { events: [], emit(type, payload) { this.events.push({ type, payload }); } };
    const system = createMercyFixtureSystem();
    system.init({ state, bus });
    assert.equal(beginIncident(system.rt, 'ms_pod_traffic').ok, true);
    const inc = system.rt.focus;
    const capsule = inc.bodyList.find((body) => body.localId === 'capsule');
    const berthBody = inc.bodyList.find((body) => body.localId === 'berth');
    const gap = berthBody.radius + capsule.radius + 1;
    capsule.pos.x = berthBody.pos.x + gap;
    capsule.pos.z = berthBody.pos.z;
    capsule.prev.x = capsule.pos.x;
    capsule.prev.z = capsule.pos.z;
    capsule.vel.x = 0;
    capsule.vel.z = 0;
    capsule.wasOutside = true;
    capsule.crossHold = crossHold;
    capsule.crossMax = crossHold;
    inc.latches = {
      distress: true, approached: true, assessed: true, stabilized: true,
      secured: true, extracted: false, settled: false,
    };
    inc.meters.approach = inc.def.approachHold;
    inc.meters.approachMax = inc.def.approachHold;
    inc.meters.assess = inc.def.assessHold;
    inc.meters.assessMax = inc.def.assessHold;
    inc.meters.stable = inc.def.stableHold;
    inc.meters.stableMax = inc.def.stableHold;
    inc.meters.secure = inc.def.secureHold;
    inc.meters.secureMax = inc.def.secureHold;
    inc.arrest = inc.def.minArrest;
    inc.reading = { hull: capsule.hull, survivors: capsule.survivors, volatile: false, cargoCr: 0, evidence: 0 };
    inc.stabilizedId = capsule.id;
    inc.securedId = capsule.id;
    inc.intentOrder = 'tether-berth';
    system.rt.player.alive = true;
    if (typeof mutate === 'function') mutate(player, state);
    return { system, state, bus, inc };
  }

  function assertShipLoss(label, row) {
    assert.equal(row.system.rt.player.alive, true, label);
    const held = row.system.update(MERCY_DT, row.state);
    assert.equal(held.held, 'ship-loss', label);
    assert.equal(row.system.rt.player.alive, false, label);
    assert.equal(row.inc.latches.settled, false, label);
    assert.equal(row.inc.outcome, null, label);
    assert.equal(row.bus.events.some((event) => event.type === 'economy:grantCredits'), false, label);
  }

  assertShipLoss('dead with a pose', boot((player) => { player.alive = false; }));
  assertShipLoss('missing pos', boot((player) => { player.alive = false; delete player.pos; }));
  assertShipLoss('null pos', boot((player) => { player.alive = false; player.pos = null; }));
  assertShipLoss('removed entity', boot((player, state) => {
    player.alive = false;
    state.entities.delete(player.id);
  }));

  const live = boot(() => {});
  const paid = live.system.update(MERCY_DT, live.state);
  assert.equal(paid.ok, true);
  assert.equal(paid.held, undefined);
  assert.equal(live.inc.latches.settled, true);
  assert.equal(live.inc.latches.extracted, true);
  assert.equal(live.inc.outcome, 'lives');
  const grants = live.bus.events.filter((row) => row.type === 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].payload.amount, 1350);
  live.system.update(MERCY_DT, live.state);
  assert.equal(live.bus.events.filter((row) => row.type === 'economy:grantCredits').length, 1);
});

test('save/load reproduces the witness and cleanup drops bodies', () => {
  const live = createMercyRuntime({ seed: 5 });
  beginIncident(live, 'ms_drift_crusher');
  for (let i = 0; i < 180; i++) stepMercy(live, MERCY_DT, commandFor(live, 'tether-berth'));
  const snap = JSON.parse(JSON.stringify(snapshotMercy(live)));
  const mid = worldDigest(live);
  for (let i = 0; i < 240; i++) stepMercy(live, MERCY_DT, commandFor(live, 'tether-berth'));
  const later = worldDigest(live);
  const restored = createMercyRuntime({ seed: 5 });
  assert.equal(restoreMercy(restored, snap).ok, true);
  assert.equal(worldDigest(restored), mid);
  for (let i = 0; i < 240; i++) stepMercy(restored, MERCY_DT, commandFor(restored, 'tether-berth'));
  assert.equal(worldDigest(restored), later);

  const finished = runIncident({ seed: SEED, id: 'ms_coupling_jam', policy: 'tether-berth' });
  assert.ok(Object.keys(finished.rt.bodies).length > 0);
  for (let i = 0; i < 50; i++) stepMercy(finished.rt, MERCY_DT, { thrustX: 0, thrustZ: 0 });
  assert.equal(Object.keys(finished.rt.bodies).length, 0);
  assert.ok(finished.rt.intentLog.length > 0);
});

test('sector shelve freezes the rescue and a queued contract waits for a slot', () => {
  const rt = createMercyRuntime({ seed: 2 });
  beginIncident(rt, 'ms_pod_rival');
  for (let i = 0; i < 20; i++) stepMercy(rt, MERCY_DT, commandFor(rt, 'tether-berth'));
  const digest = worldDigest(rt);
  const time = rt.simTime;
  shelveMercy(rt);
  for (let i = 0; i < 40; i++) stepMercy(rt, MERCY_DT, commandFor(rt, 'tether-berth'));
  assert.equal(rt.simTime, time);
  assert.equal(worldDigest(rt), digest);
  unshelveMercy(rt);
  for (let i = 0; i < 1800; i++) {
    syncFocus(rt);
    if (!rt.focus || rt.focus.latches.settled) break;
    stepMercy(rt, MERCY_DT, commandFor(rt, 'tether-berth'));
  }
  assert.equal(incidentOf(rt, 'ms_pod_rival').phase, 'aftermath');

  const board = createMercyRuntime({ seed: 2 });
  const ids = boardIncidents().map((def) => def.id);
  const results = ids.slice(0, 4).map((id) => acceptContract(board, id));
  assert.equal(results.filter((row) => row.queued).length, 2);
  assert.equal(results.filter((row) => row.ok && !row.queued).length, 2);
  assert.equal(acceptContract(board, ids[0]).reason, 'duplicate');
});

test('a dormant beacon is discoverable and the body budget defers overflow', () => {
  const rt = createMercyRuntime({ seed: 4 });
  const marks = seedSector(rt, 'sector_mercy_test');
  assert.equal(marks.length, 12);
  rt.player.pos.x = marks[0].x;
  rt.player.pos.z = marks[0].z + 10;
  stepMercy(rt, MERCY_DT, {});
  assert.deepEqual(rt.known, [marks[0].id]);
  for (let i = 0; i < 60; i++) {
    rt.bodies[`dust-${i}`] = {
      id: `dust-${i}`, localId: `dust-${i}`, incidentUid: 'dust', alive: true, kinematic: true,
      pos: { x: i, z: -200 }, prev: { x: i, z: -200 }, vel: { x: 0, z: 0 },
      rot: 0, angVel: 0, mass: 1, radius: 0.4, toolR: 0.4, hull: 1, hullMax: 1,
      model: 'SF_MERCY_BEACON', modelState: 'intact',
    };
  }
  stepMercy(rt, MERCY_DT, {});
  assert.equal(rt.stats.lastBodies, 48);
  assert.ok(rt.stats.deferredBodies > 0);
});

test('contact does not write the player hull, and destroying the subject pays nothing', () => {
  const hit = createMercyRuntime({ seed: 1 });
  beginIncident(hit, 'ms_pod_traffic');
  hit.player.vel.x = 3;
  hit.player.vel.z = -2;
  const calm = createMercyRuntime({ seed: 1 });
  beginIncident(calm, 'ms_pod_traffic');
  calm.player.vel.x = 3;
  calm.player.vel.z = -2;
  hit.bodies.dummy = {
    id: 'dummy', localId: 'dummy', incidentUid: 'x', alive: true, kinematic: false,
    pos: { x: 0, z: 0 }, prev: { x: 0, z: 0 }, vel: { x: -30, z: 12 },
    mass: 80, radius: 4, toolR: 4, rot: 0, angVel: 0,
    model: 'SF_MERCY_CAPSULE', modelState: 'intact', hull: 20, hullMax: 20, damagePerS: 0,
  };
  stepMercy(hit, MERCY_DT, { thrustX: 0, thrustZ: 0 });
  stepMercy(calm, MERCY_DT, { thrustX: 0, thrustZ: 0 });
  assert.equal(hit.player.vel.x, calm.player.vel.x);
  assert.equal(hit.player.vel.z, calm.player.vel.z);
  assert.equal(hit.player.pos.x, calm.player.pos.x);
  assert.equal(hit.player.pos.z, calm.player.pos.z);

  const lost = createMercyRuntime({ seed: 1 });
  beginIncident(lost, 'ms_pod_traffic');
  const capsule = lost.focus.bodyList.find((body) => body.localId === 'capsule');
  assert.equal(destroyRescueBody(lost, capsule.id).ok, true);
  stepMercy(lost, MERCY_DT, { thrustX: 0, thrustZ: 0 });
  assert.equal(incidentOf(lost, 'ms_pod_traffic').outcome, 'lost');
  assert.equal(lost.intentLog.some((row) => row.type === 'economy:grantCredits'), false);
});

test('bad initialization is refused and the unregistered system does not write credits', () => {
  assert.throws(() => createMercyRuntime({ seed: NaN }), TypeError);
  assert.throws(() => createMercyRuntime({ seed: '11' }), TypeError);
  const rt = createMercyRuntime({ seed: 1 });
  assert.equal(beginIncident(rt, 'no-such-rescue').reason, 'unknown');
  assert.equal(restoreMercy(rt, { schema: 0 }).ok, false);
  destroyMercyRuntime(rt);
  assert.equal(stepMercy(rt, MERCY_DT, {}).ok, false);
  assert.equal(incidentById('tow_recovery'), null);
  assert.equal(incidentById('rescue_under_fire'), null);

  const state = {
    meta: { seed: 9 },
    simTime: 0,
    rng: { getState() { return { seed0: 9, state: 9, draws: 0 }; } },
    entities: new Map(),
    playerId: 0,
    player: { credits: 40 },
    input: {},
  };
  let draws = 0;
  state.rng = () => { draws += 1; return 0.5; };
  state.rng.getState = () => ({ seed0: 9, state: 9, draws });
  const bus = { events: [], emit(type, payload) { this.events.push({ type, payload }); } };
  const system = createMercyServiceSystem();
  system.init({ state, bus });
  system.update(MERCY_DT, state);
  system.update(0.5, state);
  assert.equal(state.player.credits, 40);
  assert.equal(system.name, 'mercyService');
  assert.equal(system.rt, null, 'live registration has no hidden private-body simulation while idle');
});

test('same seed matches, another seed moves jittered ore, and sources stay free of Math.random', () => {
  const a = runIncident({ seed: 42, id: 'ms_ore_cut', policy: 'ore-first', ticks: 200 });
  const b = runIncident({ seed: 42, id: 'ms_ore_cut', policy: 'ore-first', ticks: 200 });
  assert.equal(worldDigest(a.rt), worldDigest(b.rt));
  const c = createMercyRuntime({ seed: 42 });
  const d = createMercyRuntime({ seed: 99 });
  beginIncident(c, 'ms_ore_cut');
  beginIncident(d, 'ms_ore_cut');
  const oreA = c.focus.bodyList.find((body) => body.localId === 'ore');
  const oreB = d.focus.bodyList.find((body) => body.localId === 'ore');
  assert.notEqual(oreA.pos.x, oreB.pos.x);

  const files = readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.js') || name === 'demo.mjs');
  for (const name of files) {
    const text = readFileSync(new URL(name, import.meta.url), 'utf8');
    const randomCall = 'Math.' + 'random(';
    assert.equal(text.includes(randomCall), false, name);
    assert.equal(text.includes('src/data/missions.js'), false, name);
    assert.equal(text.includes("from '../../systems/missions.js'"), false, name);
    assert.equal(text.includes('from \'three\''), false, name);
  }
  for (const [modelId, model] of Object.entries(MERCY_MODELS)) {
    const placeId = MERCY_LIVE_PLACE_IDS[modelId];
    assert.equal(model.publishedGlb, `assets/ships/release/parts/places/${placeId}.glb`);
    assert.equal(existsSync(new URL(`../../../${model.publishedGlb}`, import.meta.url)), true, model.publishedGlb);
    assert.notDeepEqual(model.states.intact.parts, model.states.damaged.parts);
  }
});
