// PB-MIS-B (SF-137 + SF-144 + SF-148): the route-choice trio, proven on the live
// director. Each test drives the self-registered runtime through the public seam
// (requestAuthoredEncounter → encounter:choose / scan:pulse / entity:killed) and
// asserts authoritative sim state — doctrine activities, spawned cargo pods,
// resolved outcomes and rep/grant events — never emitted text alone.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { manifestTrustForScan } from '../src/data/scanReveal.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';

const SECTOR = 'sector_test_route_choice';
const ANCHOR = { x: 0, z: 0 };

function makeHarness(opts = {}) {
  const sim = createSimulation({
    seed: opts.seed ?? 41,
    systems: [spawnBudget, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: opts.playerPos || { x: ANCHOR.x - 900, z: ANCHOR.z - 40 },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('encounter:choiceOffered', (p) => events.push({ name: 'offer', payload: p }));
  bus.on('encounter:voice', (p) => events.push({ name: 'voice', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  bus.on('toast', (p) => events.push({ name: 'toast', payload: p }));
  return { sim, state, bus, player, events };
}

function fireShape(sim, shapeId, extra = {}) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId,
    encounterId: `test_${shapeId}_${extra.tag || '1'}`,
    sectorId: SECTOR,
    anchor: extra.anchor || ANCHOR,
    zoneType: extra.zoneType || 'trade_lane',
    zoneRadius: extra.zoneRadius || 700,
    force: true,
  });
}

function liveOf(state, shapeId) {
  return Object.values(state.encounterDirector.live).find((l) => l.shapeId === shapeId);
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role && e.alive !== false);
}

function kill(state, bus, ent) {
  bus.emit('entity:killed', { id: ent.id, killerId: state.playerId, pos: { ...ent.pos } });
  ent.alive = false;
}

// ─── SF-137 · liner_toll_run ───────────────────────────────────────────────────

test('SF-137: liner_toll_run self-registers with the three gate choices', () => {
  const enc = ENCOUNTERS.liner_toll_run;
  assert.ok(enc, 'shape in the shipped catalog');
  assert.equal(enc.script, 'selfRegistered');
  assert.deepEqual(enc.choices.map((c) => c.id), ['request_crossing', 'run_the_gap', 'wait']);
});

test('SF-137: fire lays out a real gate — held liner, posted picket, two pylons', () => {
  const { sim, state, events } = makeHarness();
  const res = fireShape(sim, 'liner_toll_run', { tag: 'layout' });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = liveOf(state, 'liner_toll_run');
  const run = live.data.tollrun;
  const liner = castOf(state, live, 'liner')[0];
  const cutters = castOf(state, live, 'cutter');
  assert.ok(liner && cutters.length === 2, 'liner plus two-ship picket');

  // The liner holds on the approach side of the post — its own anchor, not the gate.
  const ords = ((pos) => {
    const dx = pos.x - run.post.x, dz = pos.z - run.post.z;
    return { along: dx * run.u.x + dz * run.u.z, lateral: dx * run.n.x + dz * run.n.z };
  })(liner.pos);
  assert.ok(ords.along < -300, `liner holds short of the line (along=${ords.along})`);
  assert.equal(liner.data.ai.activity?.kind, 'loiter');
  assert.ok(Math.abs(liner.data.ai.activity.anchor.x - liner.pos.x) < 1e-6,
    'the hold anchor is the liner’s own waiting spot');
  for (const cutter of cutters) {
    assert.equal(cutter.data.ai.activity?.kind, 'loiter', 'picket holds the post');
    assert.equal(cutter.data.ai.roe, 'hold_fire');
  }
  assert.equal(live.data.pylonIds.length, 2, 'two pylons draw the authorized corridor');
  for (const id of live.data.pylonIds) {
    const pylon = state.entities.get(id);
    assert.ok(pylon && pylon.type === 'beacon', 'a physical pylon stands the line');
    const d = (pylon.pos.x - run.post.x) * run.n.x + (pylon.pos.z - run.post.z) * run.n.z;
    assert.ok(Math.abs(Math.abs(d) - 150) < 1, 'pylons bracket the gate corridor');
  }
  const offer = events.find((e) => e.name === 'offer');
  assert.ok(offer, 'the decision is offered while the liner waits');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['request_crossing', 'run_the_gap', 'wait']);
});

test('SF-137: request_crossing waves the liner through the gate for the escort pay', () => {
  const { sim, state, bus, events } = makeHarness();
  const res = fireShape(sim, 'liner_toll_run', { tag: 'escort' });
  const live = liveOf(state, 'liner_toll_run');
  const run = live.data.tollrun;
  bus.emit('encounter:choose', { encounterId: res.encounterId, choiceId: 'request_crossing' });
  sim.runTicks(70);
  assert.equal(run.released, 'gate');
  const liner = castOf(state, live, 'liner')[0];
  assert.equal(liner.data.ai.activity?.kind, 'transit', 'the liner runs the cleared lane');
  // The transit anchor is the far side of the authorized corridor.
  const a = liner.data.ai.activity.anchor;
  const aAlong = (a.x - run.post.x) * run.u.x + (a.z - run.post.z) * run.u.z;
  const aLat = (a.x - run.post.x) * run.n.x + (a.z - run.post.z) * run.n.z;
  assert.ok(aAlong > 800 && Math.abs(aLat) < 1e-6, 'she exits through the gate, not the gap');

  // Through the authorized corridor: the physical crossing decides.
  liner.pos.x = run.post.x + run.u.x * 400;
  liner.pos.z = run.post.z + run.u.z * 400;
  sim.runTicks(70);
  assert.equal(live.outcome, 'escorted');
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'liner:tollrun'));
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_mts'));
  for (const id of live.data.pylonIds) {
    assert.ok(state.entities.get(id).data.despawnAt != null, 'pylons stand down with the run');
  }
});

test('SF-137: silence is the honest wait — the gate opens on schedule', () => {
  const { sim, state } = makeHarness();
  fireShape(sim, 'liner_toll_run', { tag: 'wait' });
  const live = liveOf(state, 'liner_toll_run');
  const run = live.data.tollrun;
  assert.equal(run.released, null, 'the liner waits while the scan runs');
  sim.runTicks(76 * 60);   // past the legitimate hold
  assert.equal(run.released, 'schedule', 'the picket waves her through on schedule');
  const liner = castOf(state, live, 'liner')[0];
  assert.equal(liner.data.ai.activity?.kind, 'transit');
  liner.pos.x = run.post.x + run.u.x * 400;
  liner.pos.z = run.post.z + run.u.z * 400;
  sim.runTicks(70);
  assert.equal(live.outcome, 'delayed');
});

test('SF-137: run_the_gap commits through the bypass corridor and the picket answers', () => {
  const { sim, state, bus, events } = makeHarness();
  const res = fireShape(sim, 'liner_toll_run', { tag: 'gap' });
  const live = liveOf(state, 'liner_toll_run');
  const run = live.data.tollrun;
  bus.emit('encounter:choose', { encounterId: res.encounterId, choiceId: 'run_the_gap' });
  sim.runTicks(70);
  assert.equal(run.released, 'gap');
  const liner = castOf(state, live, 'liner')[0];
  const a = liner.data.ai.activity.anchor;
  const aLat = (a.x - run.post.x) * run.n.x + (a.z - run.post.z) * run.n.z;
  assert.ok(Math.abs(aLat - 430 * run.gapSide) < 1, 'the exit is the bypass corridor');

  // Committed inside the gap band: the picket declares the run while she is
  // still inside the corridor — weapons free on the run's author.
  liner.pos.x = run.post.x + run.u.x * 80 + run.n.x * 430 * run.gapSide;
  liner.pos.z = run.post.z + run.u.z * 80 + run.n.z * 430 * run.gapSide;
  sim.runTicks(70);
  assert.equal(run.picketHot, true);
  for (const c of castOf(state, live, 'cutter')) {
    assert.equal(c.data.ai.passive, false);
    assert.equal(c.data.ai.roe, 'weapons_free');
  }
  // The crossing completes under fire — past the line in the gap band.
  liner.pos.x = run.post.x + run.u.x * 400 + run.n.x * 430 * run.gapSide;
  liner.pos.z = run.post.z + run.u.z * 400 + run.n.z * 430 * run.gapSide;
  sim.runTicks(70);
  assert.equal(live.outcome, 'bypassed');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.delta < 0),
    'the picket faction keeps a negative receipt');
});

test('SF-137: breaking the picket resolves ran, and the flag keeps the receipt', () => {
  const { sim, state, bus, events } = makeHarness();
  fireShape(sim, 'liner_toll_run', { tag: 'broke' });
  const live = liveOf(state, 'liner_toll_run');
  for (const c of castOf(state, live, 'cutter')) kill(state, bus, c);
  sim.runTicks(70);
  assert.equal(live.outcome, 'ran');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.delta < 0),
    'breaking the gate still costs with the flag that held it');
});

test('SF-137: liner down resolves lost', () => {
  const { sim, state, bus } = makeHarness();
  fireShape(sim, 'liner_toll_run', { tag: 'lost' });
  const live = liveOf(state, 'liner_toll_run');
  const liner = castOf(state, live, 'liner')[0];
  kill(state, bus, liner);
  sim.runTicks(70);
  assert.equal(live.outcome, 'lost');
});

// ─── SF-144 · wrong_convoy ────────────────────────────────────────────────────

test('SF-144: two identical columns spawn — the mark’s facts are fixed at spawn', () => {
  const { sim, state } = makeHarness();
  const res = fireShape(sim, 'wrong_convoy', { tag: 'spawn' });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = liveOf(state, 'wrong_convoy');
  const marks = castOf(state, live, 'mark');
  const cleans = castOf(state, live, 'clean');
  assert.ok(marks.length >= 1 && cleans.length >= 1, 'both columns exist');
  // Same hull class on the same lane — the confusion is real.
  assert.equal(new Set([...marks, ...cleans].map((e) => e.data?.lootTableId)).size, 1);

  for (const m of marks) {
    assert.equal(m.data.cargoManifest.lines[0].commodityId, 'cmdty_silicate', 'declared bulk freight');
    assert.ok(m.data.falseManifest, 'the mark is a false-manifest candidate');
    assert.equal(m.data.hiddenCargo.cmdty_classified_salvage > 0, true, 'the real hold is restricted');
    assert.equal(manifestTrustForScan(m, 150, null), 'false', 'a shallow read flags the mark');
    assert.equal(manifestTrustForScan(m, 80, { manifestTrust: 'false' }), 'suspect',
      'a resolving read contradicts the bill');
  }
  for (const c of cleans) {
    assert.equal(manifestTrustForScan(c, 80, { manifestTrust: 'trusted' }), 'trusted',
      'the honest column reads clean at any depth');
    assert.equal(c.data.cargoManifest.lines[0].commodityId, 'cmdty_ore_iron');
    assert.equal(c.data.cargo.items.cmdty_ore_iron, 6, 'the manifest matches the bay');
  }
});

test('SF-144: observation convicts — the mark sheds a stamped pod at the dodge', () => {
  const { sim, state } = makeHarness();
  fireShape(sim, 'wrong_convoy', { tag: 'watch' });
  const live = liveOf(state, 'wrong_convoy');
  const lane = live.data.wrongConvoy;
  const lead = castOf(state, live, 'mark')[0];
  lead.pos.x = lane.markJog.x - 2;
  lead.pos.z = lane.markJog.z - 2;
  sim.runTicks(70);
  assert.equal(lane.markPodDropped, true);
  const pods = lane.markPodIds.map((id) => state.entities.get(id)).filter(Boolean);
  assert.equal(pods.length, 1, 'one nervous pod on the field');
  assert.equal(pods[0].data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE);
  assert.equal(pods[0].data.commodityId, 'cmdty_classified_salvage', 'the tell is the real hold');
  assert.ok(/AGRI-RUN/.test(pods[0].data.ownerName || pods[0].data.jettisoned?.ownerName || ''),
    'the pod carries her own misdeclared ownership');
  // …and the column bends back toward the exit, still running its lie.
  assert.equal(lead.data.ai.activity?.anchor.x !== undefined, true);
});

test('SF-144: a covering pulse confirms the mark once, plainly', () => {
  const { sim, state, bus, events } = makeHarness();
  fireShape(sim, 'wrong_convoy', { tag: 'scan' });
  const live = liveOf(state, 'wrong_convoy');
  const lead = castOf(state, live, 'mark')[0];
  bus.emit('scan:pulse', {
    pos: { x: lead.pos.x, z: lead.pos.z }, radius: 500,
    source: 'player-scanner', scannerId: state.playerId, seq: 1, simTime: state.simTime,
  });
  assert.equal(live.data.wrongConvoy.scanConfirmed, true);
  bus.emit('scan:pulse', {
    pos: { x: lead.pos.x, z: lead.pos.z }, radius: 500,
    source: 'player-scanner', scannerId: state.playerId, seq: 2, simTime: state.simTime,
  });
  const confirms = events.filter((e) => e.name === 'voice' && /manifest mismatch/.test(e.payload.text || ''));
  assert.ok(confirms.length <= 1, 'the confirmation is a single beat, not a drip');
});

test('SF-144: interdicting the mark pays — killing the honest column is the wrong mark', () => {
  const { sim, state, bus, events } = makeHarness();
  fireShape(sim, 'wrong_convoy', { tag: 'interdict' });
  const live = liveOf(state, 'wrong_convoy');
  for (const m of castOf(state, live, 'mark')) kill(state, bus, m);
  sim.runTicks(70);
  assert.equal(live.outcome, 'mark_down');
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'wire:manifest_recovery'));
  // The spilled hold is the restricted cargo under her misdeclared name.
  const pods = [...state.entities.values()].filter((e) => e?.data?.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
  assert.ok(pods.some((p) => p.data.commodityId === 'cmdty_classified_salvage'), 'the real load spills');
});

test('SF-144: the wrong mark — honest freight spills and the receipt is negative', () => {
  const { sim, state, bus, events } = makeHarness();
  fireShape(sim, 'wrong_convoy', { tag: 'wrong' });
  const live = liveOf(state, 'wrong_convoy');
  for (const c of castOf(state, live, 'clean')) kill(state, bus, c);
  sim.runTicks(70);
  assert.equal(live.outcome, 'wrong_mark');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.delta < 0));
  const pods = [...state.entities.values()].filter((e) => e?.data?.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
  assert.ok(pods.some((p) => p.data.commodityId === 'cmdty_ore_iron'), 'honest freight spills, not loot');
});

// ─── SF-148 · short_line ──────────────────────────────────────────────────────

function spawnSlotWall(sim) {
  // Two stones, surface clearance inside the slot band.
  sim.spawn({ type: 'asteroid', pos: { x: -60, z: 0 }, radius: 40, mass: 900, hull: 400, hullMax: 400 });
  sim.spawn({ type: 'asteroid', pos: { x: 60, z: 0 }, radius: 42, mass: 900, hull: 400, hullMax: 400 });
}

test('SF-148: the slot is real pinch geometry the sender visibly can’t use', () => {
  const { sim, state } = makeHarness({ playerPos: { x: 0, z: -800 } });
  spawnSlotWall(sim);
  const res = fireShape(sim, 'short_line', { tag: 'slot', zoneType: 'mining_belt' });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = liveOf(state, 'short_line');
  const slot = live.data.slot;
  assert.ok(slot.clearanceWu >= 26 && slot.clearanceWu <= 52,
    `a light-hull pinch, measured surface to surface (${slot.clearanceWu})`);
  const sender = castOf(state, live, 'sender')[0];
  const receiver = castOf(state, live, 'receiver')[0];
  const courier = castOf(state, live, 'courier')[0];
  assert.ok(sender && receiver && courier, 'sender, receiver, and the working runner');
  // The sender's own hull reads too wide for the pinch she refuses.
  assert.ok(slot.clearanceWu < (sender.radius || 18) * 2 + 20,
    'the gap is meaningfully tighter than the sender’s beam');
  // Sender holds short on the player's side; receiver waits past the pinch.
  const along = (e) => (e.pos.x - slot.mid.x) * slot.corridor.x + (e.pos.z - slot.mid.z) * slot.corridor.z;
  assert.ok(along(sender) < -200, 'sender short of the pinch');
  assert.ok(along(receiver) > 200, 'receiver past the pinch');
  // The runner's first transit anchor is through the slot on the far side —
  // the fit class demonstrated by a hull that threads it.
  assert.equal(courier.data.ai.activity?.kind, 'transit');
  const cAlong = (courier.data.ai.activity.anchor.x - slot.mid.x) * slot.corridor.x
    + (courier.data.ai.activity.anchor.z - slot.mid.z) * slot.corridor.z;
  assert.ok(Math.sign(cAlong) === Math.sign(along(sender)), 'the courier threads to the sender’s side');
});

test('SF-148: no slot in the field means the situation honestly does not exist', () => {
  const { sim, state } = makeHarness();
  const res = fireShape(sim, 'short_line', { tag: 'noslot', zoneType: 'mining_belt' });
  assert.notEqual(res.ok, true, 'empty field aborts, it never fakes a wall');
  assert.equal(liveOf(state, 'short_line'), undefined);
});

test('SF-148: take the lot — the pod is real custody and delivery pays', () => {
  const { sim, state, bus, player, events } = makeHarness({ playerPos: { x: 0, z: -800 } });
  spawnSlotWall(sim);
  const res = fireShape(sim, 'short_line', { tag: 'take', zoneType: 'mining_belt' });
  const live = liveOf(state, 'short_line');
  const offer = events.find((e) => e.name === 'offer');
  assert.ok(offer && offer.payload.options.some((o) => o.id === 'take'), 'the lot is offered');

  bus.emit('encounter:choose', { encounterId: res.encounterId, choiceId: 'take' });
  sim.runTicks(70);
  const slot = live.data.slot;
  assert.equal(slot.lotState, 'taken');
  const pod = state.entities.get(slot.lotPodId);
  assert.ok(pod && pod.type === 'pickup' && pod.data.freightCustodyPod,
    'the lot materialized as real custody freight');
  assert.equal(pod.data.commodityId, 'cmdty_ore_iron');

  // Delivered on its own wheels: the pod inside the receiver's ring counts.
  const receiver = castOf(state, live, 'receiver')[0];
  pod.pos.x = receiver.pos.x + 20;
  pod.pos.z = receiver.pos.z + 20;
  sim.runTicks(70);
  assert.equal(live.outcome, 'lot_delivered');
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'short_line:delivered'));
});

test('SF-148: pass — the sender flies the long line around the wall herself', () => {
  const { sim, state, bus } = makeHarness({ playerPos: { x: 0, z: -800 } });
  spawnSlotWall(sim);
  const res = fireShape(sim, 'short_line', { tag: 'pass', zoneType: 'mining_belt' });
  const live = liveOf(state, 'short_line');
  const slot = live.data.slot;
  bus.emit('encounter:choose', { encounterId: res.encounterId, choiceId: 'pass' });
  sim.runTicks(70);
  assert.equal(slot.senderEnRoute, true);
  const sender = castOf(state, live, 'sender')[0];
  assert.equal(sender.data.ai.activity?.kind, 'transit', 'she takes her own hull around');
  assert.ok(slot.senderWaypoints.length >= 1, 'the detour is real waypoints, not a fade');
  // The long line bends AWAY from the pinch — her first waypoint is not the slot.
  const wp = slot.senderWaypoints[0];
  const wpToMid = Math.hypot(wp.x - slot.mid.x, wp.z - slot.mid.z);
  assert.ok(wpToMid > 200, 'the first waypoint clears the pinch laterally');
  // Run her down the waypoints: waypoint-to-waypoint, the lot arrives.
  const guard = 8;
  for (let i = 0; i < guard && slot.senderWaypoints.length; i++) {
    const target = slot.senderWaypoints[0];
    sender.pos.x = target.x - 4; sender.pos.z = target.z - 4;
    sim.runTicks(70);
  }
  sim.runTicks(70);
  assert.equal(live.outcome, 'self_hauled');
});

test('SF-148: silence at the offer deadline also sends her the long way', () => {
  const { sim, state } = makeHarness({ playerPos: { x: 0, z: -800 } });
  spawnSlotWall(sim);
  fireShape(sim, 'short_line', { tag: 'timeout', zoneType: 'mining_belt' });
  const live = liveOf(state, 'short_line');
  sim.runTicks(42 * 60);   // past OFFER_S
  assert.equal(live.data.slot.senderEnRoute, true, 'she files the long line without an answer');
});

test('SF-148: losing the pod loses the lot — the wall keeps its shortcuts', () => {
  const { sim, state, bus, player } = makeHarness({ playerPos: { x: 0, z: -800 } });
  spawnSlotWall(sim);
  const res = fireShape(sim, 'short_line', { tag: 'lost', zoneType: 'mining_belt' });
  const live = liveOf(state, 'short_line');
  const slot = live.data.slot;
  bus.emit('encounter:choose', { encounterId: res.encounterId, choiceId: 'take' });
  sim.runTicks(70);
  const pod = state.entities.get(slot.lotPodId);
  // The pod dies far from the player — she never had it.
  pod.pos.x += 3000;
  pod.alive = false;
  state.entities.delete(pod.id);
  player.pos.x = 0; player.pos.z = -800;   // nowhere near the pod's last spot
  sim.runTicks(70);
  assert.equal(slot.lotState, 'lost');
  assert.equal(live.outcome, 'lot_lost');
});
