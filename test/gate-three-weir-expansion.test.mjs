// EXP-25: the Gate 3 bureau — weigh-slip book, inspection holds, weir runs, the desk
// counter (contests + Transit Bonds), standing courtesies, recalibration windows, and
// the lane census. Every seam is deterministic: hash32 lottery, simTime clocks,
// economy intents for money, faction:repDelta for standing, queuePhysicsImpulse for
// the pulled-aside haulers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateThreeWeir, ensureGateThreeWeir } from '../src/systems/gateThreeWeir.js';
import { GATE_THREE_WEIR } from '../src/data/gateThree.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

const W = GATE_THREE_WEIR;
const POST = W.post;
const OUTSIDE = { x: POST.x + W.weirRadius + 500, z: POST.z };
// Inside the cordon but outside the counter ring — the desk cannot hear you here.
const INSIDE_FAR = { x: POST.x + W.counterRadius + 40, z: POST.z };
const CAPTURED = [
  'comms:popup', 'economy:chargeCredits', 'economy:grantCredits', 'faction:repDelta',
  'gateThree:weighed', 'gateThree:logged', 'gateThree:inspection', 'gateThree:evaded',
  'gateThree:contested', 'gateThree:bonded', 'gateThree:bondLapsed',
  'gateThree:maintenance', 'gateThree:laneWeighed',
];

function fixture({ sector = W.sectorId, kind = 'adventure' } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind },
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
    player: { credits: 0 },
  };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  const player = helpers.spawnEntity({
    type: 'ship', pos: { ...OUTSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true,
  });
  state.playerId = player.id;
  for (const t of CAPTURED) bus.on(t, (p) => events.push([t, p]));
  const system = createGateThreeWeir();
  system.init({ state, bus, helpers });
  const rec = () => state.story.gateThreeWeir;
  const step = (n = 1, dt = 0.5) => {
    for (let i = 0; i < n; i++) { state.tick++; state.simTime += dt; system.update(dt, state); }
  };
  // Crossings: place the hull, then one census. `at` defaults to the counter post —
  // tests that must NOT transact park at INSIDE_FAR.
  const enterAt = (p = POST) => { player.pos.x = p.x; player.pos.z = p.z; step(); };
  const leave = () => { player.pos.x = OUTSIDE.x; player.pos.z = OUTSIDE.z; step(2); };
  const addPod = (over = {}) => helpers.spawnEntity({
    type: 'pickup', pos: { x: player.pos.x + 5, z: player.pos.z }, vel: { x: 0, z: 0 },
    radius: 6, mass: 30, hull: 1, hullMax: 1, data: { kind: 'cargo' }, ...over,
  });
  const addShip = (over = {}) => helpers.spawnEntity({
    type: 'ship', pos: { x: POST.x, z: POST.z + 600 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 10, hullMax: 10, data: {}, ...over,
  });
  const of = (t) => events.filter(([e]) => e === t).map(([, p]) => p);
  const impulses = (e) => {
    const cmds = consumePhysicsCommand(e);
    return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
  };
  // A faithful stub of the economy exact-charge contract (NXB-009): the sole writer
  // validates the balance, runs the caller's commit, moves the money, and reports.
  const wireTill = () => bus.on('economy:chargeCredits', (p) => {
    if (!p || p.requireFull !== true || p.result === true) return;
    p.result = false;
    const live = state.player.credits;
    if (live !== p.expectedCredits || live < p.amount || typeof p.commit !== 'function') return;
    if (p.commit() === true) { state.player.credits -= p.amount; p.result = true; }
  });
  return { bus, state, helpers, system, events, player, rec, step, enterAt, leave, addPod, addShip, of, impulses, wireTill };
}

// ── THE BOOK ─────────────────────────────────────────────────────────────────────
test('every crossing writes a weigh-slip row — the book is the visible record', () => {
  const f = fixture();
  f.step(2);
  f.enterAt(INSIDE_FAR);
  assert.equal(f.rec().crossings, 1);
  assert.equal(f.rec().log.length, 1);
  const row = f.rec().log[0];
  assert.equal(row.outcome, 'clean');
  assert.equal(row.manifestMassT, 20);
  const logged = f.of('gateThree:logged');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].row.seq, row.seq, 'the emit carries the same slip the book filed');
  f.leave();
  f.enterAt(INSIDE_FAR);
  assert.equal(f.rec().log.length, 2, 'one slip per submission');
  assert.equal(f.rec().seq >= 2, true);
});

test('a filed fine writes its REF receipt on the slip before the charge is heard', () => {
  const f = fixture();
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  const pod = f.addPod({ mass: 10 });
  pod.pos.x = INSIDE_FAR.x + 5; pod.pos.z = INSIDE_FAR.z;
  // The charge listener is synchronous: when it runs, the slip must already exist.
  let seenRowAtCharge = null;
  f.bus.on('economy:chargeCredits', () => {
    seenRowAtCharge = f.rec().log[f.rec().log.length - 1];
  });
  f.enterAt(INSIDE_FAR);
  assert.ok(seenRowAtCharge, 'the charge fired');
  assert.equal(seenRowAtCharge.outcome, 'fined');
  assert.ok(/^44-C\d+$/.test(seenRowAtCharge.receipt), 'the slip carries its REF number');
});

// ── INSPECTIONS ──────────────────────────────────────────────────────────────────
test('a held crossing resolves at the walk\'s end — the verdict lands late, intact', () => {
  const f = fixture();
  f.step(2);
  // The sixth-ever crossing is the deterministic hold (hash roll 4 < 20): file five
  // clean crossings first, then submit the sixth.
  for (let i = 0; i < 5; i++) { f.enterAt(INSIDE_FAR); f.leave(); }
  f.enterAt(INSIDE_FAR);
  const holds = f.of('gateThree:inspection');
  assert.equal(holds.length, 1, 'the desk holds the seeded crossing');
  assert.equal(f.of('gateThree:weighed').length, 5, 'no verdict while Dree walks the hull');
  assert.equal(f.state.story.flags[W.inspectFlag], 1);
  assert.ok(f.events.some(([t, p]) => t === 'comms:popup' && p.id.startsWith('gate3_hold_')));
  f.step(13); // the walk is 6 s — park inside and it closes itself
  const v = f.of('gateThree:weighed');
  assert.equal(v.length, 6);
  assert.equal(v[5].held, true, 'the late verdict wears the walk it waited for');
  assert.equal(f.rec().inspection, null);
  assert.equal(f.rec().log[f.rec().log.length - 1].inspected, true);
});

test('the first transit is the baseline read — it is never held', () => {
  const f = fixture();
  f.step(2);
  f.enterAt(INSIDE_FAR);
  assert.equal(f.of('gateThree:inspection').length, 0);
  assert.equal(f.of('gateThree:weighed').length, 1);
});

test('bolting mid-hold files the weir run — surcharge, rep hit, the mark', () => {
  const f = fixture();
  f.step(2);
  f.rec().flaggedUntil = f.state.simTime + W.flaggedS; // every crossing is held
  f.enterAt(INSIDE_FAR);
  assert.ok(f.rec().inspection, 'the hold is open');
  f.player.pos.x = OUTSIDE.x; f.player.pos.z = OUTSIDE.z;
  f.step();
  const evaded = f.of('gateThree:evaded');
  assert.equal(evaded.length, 1);
  assert.equal(evaded[0].fine, W.evasionFeeCr, 'clean hull — the run alone is the surcharge');
  const charges = f.of('economy:chargeCredits');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].reason, 'fine:gate3-weir-run');
  const reps = f.of('faction:repDelta');
  assert.equal(reps.length, 1);
  assert.equal(reps[0].factionId, W.factionId);
  assert.equal(reps[0].delta, W.evasionRepHit);
  assert.equal(f.rec().runners, 1);
  assert.equal(f.state.story.flags[W.runFlag], 1);
  assert.equal(f.rec().log[f.rec().log.length - 1].outcome, 'evaded');
  assert.equal(f.rec().inspection, null);
});

test('a marked runner is held every time until the mark cools', () => {
  const f = fixture();
  f.step(2);
  f.rec().flaggedUntil = f.state.simTime + 30;
  f.enterAt(INSIDE_FAR);
  assert.ok(f.rec().inspection, 'marked hulls are held, not lottery-held');
  f.step(13); // walk closes
  f.leave();
  f.enterAt(INSIDE_FAR);
  assert.equal(f.of('gateThree:inspection').length, 2, 'the mark still holds the next return');
});

test('jumping sectors mid-hold files the run on the way out', () => {
  const f = fixture();
  f.step(2);
  f.rec().flaggedUntil = f.state.simTime + W.flaggedS;
  f.enterAt(INSIDE_FAR);
  assert.ok(f.rec().inspection);
  f.state.world.currentSectorId = 'sector_helios';
  f.bus.emit('sector:enter', { sectorId: 'sector_helios' });
  assert.equal(f.of('gateThree:evaded').length, 1, 'the jump-out is a weir run');
  assert.equal(f.rec().inspection, null);
  assert.equal(f.rec().runners, 1);
});

test('repeat runners pay a rising surcharge', () => {
  const f = fixture();
  f.step(2);
  f.rec().runners = 2; // two priors on the book
  f.rec().flaggedUntil = f.state.simTime + W.flaggedS;
  f.enterAt(INSIDE_FAR);
  f.player.pos.x = OUTSIDE.x; f.player.pos.z = OUTSIDE.z;
  f.step();
  const evaded = f.of('gateThree:evaded');
  assert.equal(evaded[0].fine, W.evasionFeeCr + 2 * W.evasionStepCr, 'runners 3 pays the third step');
});

// ── THE COUNTER ──────────────────────────────────────────────────────────────────
test('dwelling at the desk contests the freshest REF — Dree overturns desk-error fines', () => {
  const f = fixture();
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  const pod = f.addPod({ mass: 10 }); // 10 t over — inside contestMercyT
  pod.pos.x = POST.x + 5; pod.pos.z = POST.z;
  f.enterAt(); // parks at the post, inside the counter ring
  assert.equal(f.of('economy:chargeCredits').length, 1, 'the fine was charged');
  f.step(8); // 4 s at the desk
  const contested = f.of('gateThree:contested');
  assert.equal(contested.length, 1);
  assert.equal(contested[0].verdict, 'overturned');
  const grants = f.of('economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, contested[0].fine, 'the overturned fine returns in full');
  const reps = f.of('faction:repDelta');
  assert.equal(reps.length, 1);
  assert.equal(reps[0].delta, W.contestRepUp);
  assert.equal(f.state.story.flags[W.contestWonFlag], 1);
});

test('Hale upholds a real fine — the counter prices your time instead', () => {
  const f = fixture();
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  const pod = f.addPod({ mass: 60 }); // 60 t over — past desk error
  pod.pos.x = POST.x + 5; pod.pos.z = POST.z;
  f.enterAt();
  f.step(8);
  const contested = f.of('gateThree:contested');
  assert.equal(contested.length, 1);
  assert.equal(contested[0].verdict, 'upheld');
  const charges = f.of('economy:chargeCredits');
  assert.equal(charges.length, 2, 'the fine, then the counter fee');
  assert.equal(charges[1].amount, W.contestFeeCr);
  assert.equal(charges[1].reason, 'fee:gate3-contest');
  assert.equal(f.of('faction:repDelta')[0].delta, W.contestRepDown);
  assert.equal(f.of('economy:grantCredits').length, 0, 'an upheld REF refunds nothing');
});

test('the desk trades once per approach — leave the ring to re-arm it', () => {
  const f = fixture();
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  const pod = f.addPod({ mass: 10 });
  pod.pos.x = POST.x + 5; pod.pos.z = POST.z;
  f.enterAt();
  f.step(8);
  assert.equal(f.of('gateThree:contested').length, 1);
  f.step(6);
  assert.equal(f.of('gateThree:contested').length, 1, 'parked longer is not a second hearing');
  // Leave the counter ring, come back — the desk hears a fresh approach.
  f.player.pos.x = INSIDE_FAR.x; f.player.pos.z = INSIDE_FAR.z; f.step(2);
  f.player.pos.x = POST.x; f.player.pos.z = POST.z; f.step(8);
  assert.equal(f.of('gateThree:contested').length, 1, 'a struck REF is not contested twice');
  // The next action on a clean book is the bond counter — denied here (empty purse).
  assert.ok(f.events.some(([t, p]) => t === 'comms:popup' && p.id.startsWith('gate3_bonddenied_')),
    'with nothing to contest the desk tries to sell the bond');
});

test('a docked hull and a flyby never reach the counter', () => {
  const f = fixture();
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  const pod = f.addPod({ mass: 10 });
  pod.pos.x = POST.x + 5; pod.pos.z = POST.z;
  f.enterAt();
  f.state.ui.docked = true;
  f.step(10);
  assert.equal(f.of('gateThree:contested').length, 0, 'the docked ship is not at the desk');
  f.state.ui.docked = false;
  f.player.vel.x = 30; // faster than lane speed at the desk
  f.step(10);
  assert.equal(f.of('gateThree:contested').length, 0, 'a flyby is not a customer');
  f.player.vel.x = 0;
});

// ── TRANSIT BONDS ────────────────────────────────────────────────────────────────
test('the desk sells a Transit Bond through the exact-charge seam', () => {
  const f = fixture();
  f.wireTill();
  f.state.player.credits = 1000;
  f.step(2);
  f.enterAt(); // clean book — the desk sells
  f.step(8);
  const bonded = f.of('gateThree:bonded');
  assert.equal(bonded.length, 1);
  assert.equal(f.state.player.credits, 1000 - W.bondFeeCr, 'the fee moved through the sole writer');
  assert.equal(f.state.story.flags[W.bondCountFlag], 1);
  assert.ok(f.rec().bond.expiresAt > f.state.simTime);
  const payload = f.of('economy:chargeCredits')[0];
  assert.equal(payload.requireFull, true, 'the bond is an exact-payment request');
  assert.equal(payload.expectedCredits, 1000);
});

test('a short purse is refused before the charge is even attempted', () => {
  const f = fixture();
  f.wireTill();
  f.state.player.credits = 100;
  f.step(2);
  f.enterAt();
  f.step(8);
  assert.equal(f.of('gateThree:bonded').length, 0);
  assert.equal(f.rec().bond, null, 'no bond without its fee');
  assert.ok(f.events.some(([t, p]) => t === 'comms:popup' && p.id.startsWith('gate3_bonddenied_')));
});

test('a marked hull buys nothing at the desk', () => {
  const f = fixture();
  f.wireTill();
  f.state.player.credits = 1000;
  f.rec().flaggedUntil = f.state.simTime + W.flaggedS;
  f.step(2);
  f.player.pos.x = INSIDE_FAR.x; f.player.pos.z = INSIDE_FAR.z; f.step(); // marked entry = a hold
  f.step(13); // walk closes the clean hull
  f.player.pos.x = POST.x; f.player.pos.z = POST.z; f.step(8);
  assert.equal(f.of('gateThree:bonded').length, 0);
  assert.equal(f.of('economy:chargeCredits').length, 0, 'the marked desk never attempts the charge');
  assert.ok(f.events.some(([t, p]) => t === 'comms:popup' && p.id.startsWith('gate3_bondmarked_')));
});

test('a live bond reads half a filed fine; a clean window rebates home', () => {
  const f = fixture();
  f.wireTill();
  f.state.player.credits = 2000;
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  f.enterAt(); f.step(8); // buy the bond (clean book)
  assert.ok(f.rec().bond, 'bond live');
  // Now an over-mass transit — the tariff reads the bonded hull at half.
  const pod = f.addPod({ mass: 10 });
  f.player.pos.x = OUTSIDE.x; f.player.pos.z = OUTSIDE.z;
  pod.pos.x = INSIDE_FAR.x + 5; pod.pos.z = INSIDE_FAR.z; f.step();
  f.enterAt(INSIDE_FAR);
  const gross = Math.max(W.fineMinCr, Math.round(10 * W.finePerTCr));
  const charged = f.of('economy:chargeCredits').filter((p) => p.reason === 'fine:gate3-ref44c');
  assert.equal(charged.length, 1);
  assert.equal(charged[0].amount, Math.round(gross * (1 - W.bondDiscount)), 'bonded hulls read the cut fine');
  assert.equal(f.rec().bond.finesDuring, 1);
  // Close the window — a bond that filed a fine closes spent, no rebate.
  f.state.simTime = f.rec().bond.expiresAt + 1;
  f.step();
  const lapsed = f.of('gateThree:bondLapsed');
  assert.equal(lapsed.length, 1);
  assert.equal(lapsed[0].rebated, false);
  assert.equal(f.of('economy:grantCredits').length, 0, 'the spent bond keeps its rebate');
});

test('a clean bond window rebates and leaves a commendation', () => {
  const f = fixture();
  f.wireTill();
  f.state.player.credits = 2000;
  f.step(2);
  f.enterAt(); f.step(8);
  assert.ok(f.rec().bond);
  f.state.simTime = f.rec().bond.expiresAt + 1;
  f.step();
  const lapsed = f.of('gateThree:bondLapsed');
  assert.equal(lapsed[0].rebated, true);
  const grants = f.of('economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, W.bondRebateCr);
  assert.equal(grants[0].reason, 'bond:gate3-return');
  assert.equal(f.of('faction:repDelta')[0].delta, W.bondRep);
  // And the rebate latch survives a second census — it can never pay twice.
  f.step(3);
  assert.equal(f.of('economy:grantCredits').length, 1);
});

// ── STANDING ─────────────────────────────────────────────────────────────────────
test('Concord standing reads the courtesy discount on a filed fine', () => {
  const f = fixture();
  f.state.factions = { [W.factionId]: { rep: 200 } }; // rank step 2
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  const pod = f.addPod({ mass: 10 });
  pod.pos.x = INSIDE_FAR.x + 5; pod.pos.z = INSIDE_FAR.z;
  f.enterAt(INSIDE_FAR);
  const gross = Math.max(W.fineMinCr, Math.round(10 * W.finePerTCr));
  const charged = f.of('economy:chargeCredits');
  assert.equal(charged[0].amount, Math.round(gross * (1 - W.rankDiscount)));
});

test('standing halves the hold lottery — a crossing the desk would hold passes a Trusted hull', () => {
  // Crossing 6 rolls 4 (held at any standing); crossing 12 rolls 17 — held at 20%
  // odds, clean at the halved 10%. Each hold is resolved inside before the next
  // transit, or the bolt would file a weir run and flag the lane.
  const setup = (rep) => {
    const f = fixture();
    if (rep != null) f.state.factions = { [W.factionId]: { rep } };
    f.step(2);
    for (let i = 0; i < 12; i++) {
      f.enterAt(INSIDE_FAR);
      if (f.rec().inspection) f.step(13); // finish the walk inside
      f.leave();
    }
    return f;
  };
  assert.equal(setup(null).of('gateThree:inspection').length, 2, 'the desk holds crossings six and twelve');
  assert.equal(setup(200).of('gateThree:inspection').length, 1, 'a Trusted hull reads only the deep roll');
});

// ── RECALIBRATION ────────────────────────────────────────────────────────────────
test('the weir recalibrates on its seeded cadence — transits log unread inside the window', () => {
  const f = fixture();
  f.step(2);
  f.rec().nextMaintenanceAt = f.state.simTime; // the window is due this census
  f.step();
  assert.equal(f.of('gateThree:maintenance').length, 1, 'the blind window opens');
  assert.ok(f.state.simTime < f.rec().maintenanceUntil);
  assert.ok(f.events.some(([t, p]) => t === 'comms:popup' && p.id.startsWith('gate3_blind_')));
  // The beacon wears the blind label while the scale is down.
  const beacon = f.state.entityList.find((e) => e.alive && e.data?.gateThreeWeir === true);
  assert.equal(beacon.data.scanLabel, W.blindLabel);
  const pod = f.addPod({ mass: 60 }); // would be a fine on an honest pass
  pod.pos.x = INSIDE_FAR.x + 5; pod.pos.z = INSIDE_FAR.z;
  f.enterAt(INSIDE_FAR);
  const v = f.of('gateThree:weighed');
  assert.equal(v[0].outcome, 'blind');
  assert.equal(f.rec().log[f.rec().log.length - 1].outcome, 'blind');
  assert.equal(f.of('economy:chargeCredits').length, 0, 'a blind scale files nothing');
  f.state.simTime = f.rec().maintenanceUntil + 1;
  f.step();
  assert.equal(beacon.data.scanLabel, 'Gate 3 customs weir — Concord weigh cordon',
    'the label comes back when the window closes');
});

// ── THE LANE CENSUS ──────────────────────────────────────────────────────────────
test('every hull in the lane is censused on the same law — over-mass haulers get pulled aside', () => {
  const f = fixture();
  f.step(2);
  const npc = f.addShip({ occupantGeneration: 11, data: { callsign: 'HAULER 9' } });
  const pod = f.helpers.spawnEntity({
    type: 'pickup', pos: { x: POST.x, z: POST.z + 605 }, vel: { x: 0, z: 0 },
    radius: 6, mass: 90, hull: 1, hullMax: 1, data: { kind: 'cargo' },
  });
  f.step(); // baseline outside
  npc.pos.x = POST.x; npc.pos.z = POST.z + 150; // crosses in with freight riding
  pod.pos.x = POST.x; pod.pos.z = POST.z + 155;
  f.step();
  const lane = f.of('gateThree:laneWeighed');
  assert.equal(lane.length, 1);
  assert.equal(lane[0].outcome, 'flagged');
  assert.equal(lane[0].gen, 11, 'the verdict carries the hull generation');
  const row = f.rec().lane[f.rec().lane.length - 1];
  assert.equal(row.id, npc.id);
  assert.equal(row.gen, 11);
  assert.ok(f.events.some(([t, p]) => t === 'comms:popup' && p.id.startsWith('gate3_lane_')
    && p.text.includes('HAULER 9')), 'the desk names the pulled hauler');
  f.step(2); // the pull runs while flagged inside
  const imp = f.impulses(npc);
  assert.ok(imp.length >= 1, 'the walk aside is a queued impulse, not a vel write');
  const hold = { x: POST.x + W.holdOffset.x, z: POST.z + W.holdOffset.z };
  const dx = hold.x - npc.pos.x, dz = hold.z - npc.pos.z;
  assert.ok(imp[0].x * dx + imp[0].z * dz > 0, 'the impulse points at the hold point');
});

test('a clean hauler transits clean; exempt and frozen-template hulls never book', () => {
  const f = fixture();
  f.step(2);
  const npc = f.addShip({ occupantGeneration: 3 });
  f.step();
  npc.pos.x = POST.x; npc.pos.z = POST.z + 150; f.step();
  const lane = f.of('gateThree:laneWeighed');
  assert.equal(lane[0].outcome, 'clean');
  const exempt = f.addShip({ data: { gate3Exempt: true } });
  const frozen = f.addShip({ data: Object.freeze({ sealed: true }) });
  exempt.pos.x = POST.x; exempt.pos.z = POST.z - 150;
  frozen.pos.x = POST.x; frozen.pos.z = POST.z - 160;
  f.step(2);
  assert.equal(f.of('gateThree:laneWeighed').length, 1, 'set-piece hulls stay off the book');
});

test('the census caps verdicts per pass — a crowd waits its turn', () => {
  const f = fixture();
  f.step(2);
  const ships = [];
  for (let i = 0; i < W.laneVerdictsPerCensus + 2; i++) {
    ships.push(f.addShip({ pos: { x: POST.x + (i * 12), z: POST.z + 600 } }));
  }
  f.step();
  for (const s of ships) { s.pos.z = POST.z + 150; }
  f.step();
  assert.equal(f.of('gateThree:laneWeighed').length, W.laneVerdictsPerCensus,
    'the desk reads this many lane hulls per pass, tops');
  f.step();
  assert.equal(f.of('gateThree:laneWeighed').length, W.laneVerdictsPerCensus + 2,
    'the deferred hulls were not silently swallowed');
});

// ── PERSISTENCE + HOSTILITY ──────────────────────────────────────────────────────
test('the bureau record survives a save round-trip intact', () => {
  const f = fixture();
  f.step(2);
  f.enterAt(INSIDE_FAR);
  f.leave();
  f.rec().runners = 1; f.rec().flaggedUntil = f.state.simTime + 100;
  const saved = JSON.parse(JSON.stringify(f.state.story));
  f.state.story = saved;
  f.bus.emit('save:loaded', {});
  assert.equal(f.rec().runners, 1);
  assert.equal(f.rec().log.length, 1);
  assert.ok(f.rec().flaggedUntil > f.state.simTime, 'the mark survives the restore');
});

test('hostile restore: corrupt fields heal bounded and the census keeps working', () => {
  const f = fixture();
  f.state.story.gateThreeWeir = {
    schemaVersion: 1, seq: -99, crossings: NaN, runners: -5,
    flaggedUntil: Infinity, deskDwell: -100, deskLatched: 'yes',
    inspection: { kind: 'bogus', dueAt: -Infinity },
    bond: { receipt: 42, issuedAt: NaN, expiresAt: 1e30, fee: -5, finesDuring: -1 },
    rebates: 'nope',
    nextMaintenanceAt: 1e30, maintenanceUntil: Infinity, maintenanceSeq: -3,
    laneBarkAt: NaN,
    log: [{ outcome: 'fined', overT: 5, fine: 10, receipt: '44-C1' }, { outcome: 'nonsense' }, 7],
    lane: [{ id: 3, outcome: 'flagged', gen: 2, overT: NaN }, { id: 'x', outcome: 'clean' }],
  };
  f.bus.emit('save:loaded', {});
  const rec = f.rec();
  assert.equal(rec.seq, 0);
  assert.equal(rec.crossings, 0);
  assert.equal(rec.runners, 0);
  assert.ok(Number.isFinite(rec.flaggedUntil) && rec.flaggedUntil <= f.state.simTime + W.flaggedS);
  assert.equal(rec.inspection, null, 'an invalid kind cannot hold the hull');
  assert.equal(rec.bond, null, 'a non-string receipt is not a bond');
  assert.deepEqual(rec.rebates, []);
  assert.equal(rec.deskDwell, 0);
  assert.equal(rec.deskLatched, false);
  assert.ok(rec.nextMaintenanceAt <= f.state.simTime + W.maintenancePeriodS + W.maintenanceJitterS,
    'the cadence cannot be pushed past one honest gap');
  assert.ok(rec.maintenanceUntil <= f.state.simTime + W.maintenanceS, 'the window is bounded');
  assert.equal(rec.log.length, 1, 'invalid slips are struck');
  assert.equal(rec.log[0].receipt, '44-C1');
  assert.equal(rec.lane.length, 1, 'a bad lane row is struck');
  assert.equal(rec.lane[0].overT, 0, 'NaN reads heal finite');
  // And the post still weighs the next transit honestly.
  f.step(2); f.enterAt(INSIDE_FAR);
  assert.equal(f.of('gateThree:weighed').length, 1);
});

test('the book never grows past its cap — hostile or honest', () => {
  const f = fixture();
  const rows = [];
  for (let i = 0; i < W.logCap * 3; i++) rows.push({ seq: i, at: 0, outcome: 'clean' });
  f.state.story.gateThreeWeir = { schemaVersion: 1, log: rows };
  f.bus.emit('save:loaded', {});
  assert.equal(f.rec().log.length, W.logCap, 'a hostile book is trimmed to the cap');
  // Honest overflow trims the same way.
  for (let i = 0; i < W.logCap + 4; i++) { f.enterAt(INSIDE_FAR); f.leave(); }
  assert.ok(f.rec().log.length <= W.logCap, 'the lane\'s book stays bounded live');
});

test('a corrupt record shape regenerates fresh without losing the post', () => {
  const f = fixture();
  f.state.story.gateThreeWeir = 'corrupt-string';
  f.bus.emit('save:loaded', {});
  const rec = f.rec();
  assert.equal(rec.schemaVersion, 1);
  assert.equal(rec.crossings, 0);
  assert.equal(rec.log.length, 0);
  f.step(2); f.enterAt(INSIDE_FAR);
  assert.equal(f.of('gateThree:weighed').length, 1, 'the weir still reads after the heal');
});

// ── RE-ENTRANCY ──────────────────────────────────────────────────────────────────
test('a synchronous listener re-entering the census sees the verdict already filed', () => {
  const f = fixture();
  f.state.story.flags[W.waveFlag] = true;
  f.step(2);
  let rowsAtWeigh = null, calls = 0;
  f.bus.on('gateThree:weighed', () => {
    calls++;
    rowsAtWeigh = f.rec().log.length;
    if (calls === 1) f.system.update(0.5, f.state); // hostile re-entry mid-emit
  });
  const pod = f.addPod({ mass: 10 });
  pod.pos.x = INSIDE_FAR.x + 5; pod.pos.z = INSIDE_FAR.z;
  f.enterAt(INSIDE_FAR);
  assert.equal(calls, 1, 're-entry cannot double-file a crossing');
  assert.equal(rowsAtWeigh, f.rec().log.length, 'the slip was filed before the emit');
  assert.equal(f.of('economy:chargeCredits').length, 1, 'the fine charged once');
});

test('a listener that bolts the hull mid-emit cannot double-file the run', () => {
  const f = fixture();
  f.step(2);
  f.rec().flaggedUntil = f.state.simTime + W.flaggedS;
  let ran = 0;
  f.bus.on('gateThree:evaded', () => {
    ran++;
    f.player.pos.x = OUTSIDE.x; f.player.pos.z = OUTSIDE.z;
    f.system.update(0.5, f.state);
  });
  f.enterAt(INSIDE_FAR);
  f.player.pos.x = OUTSIDE.x; f.player.pos.z = OUTSIDE.z;
  f.step();
  assert.equal(ran, 1, 'one run, one filing');
  assert.equal(f.of('economy:chargeCredits').length, 1);
});

test('the counter cannot double-sell a bond when the charge listener re-enters', () => {
  const f = fixture();
  f.wireTill();
  f.state.player.credits = 2000;
  f.step(2);
  let reentered = false;
  f.bus.on('gateThree:bonded', () => { if (!reentered) { reentered = true; f.system.update(0.5, f.state); } });
  f.enterAt(); f.step(8);
  assert.equal(f.of('gateThree:bonded').length, 1);
  assert.equal(f.state.player.credits, 2000 - W.bondFeeCr, 'one fee, one bond');
});
