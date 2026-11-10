// test/gravedigger-expansion.test.mjs — the memorial ledger expansion on
// GRAVEDIGGER / UG-4 (W-SHIFT row 506). Proves the new player-facing book end
// to end on the real system and the real events:
//   · the named dead: every burial files a memorial name — deterministic on
//     the grave serial; authored hulls keep theirs; pre-expansion beds are
//     named on read
//   · claim rings: the race is a stake — held inside its ring the ground
//     yields; hauled or stripped it files grave robbery, a fine, a grudge
//     clock, and a real report through the law seam
//   · kin vigils: the named dead draw mourners — posted → inbound → holding →
//     leaving → kept/missed; witnessed company pays once; slain kin is the
//     coldest grudge; broken beds re-plant and remember
//   · keeper standing: composted offerings feed the tier and scale every fee;
//     the full plot pays its keeper a portion once ever
//   · save-safe + once-only: JSON round-trips keep stamps; replayed wires,
//     recycled ids, re-entry, and repeated init never pay or bill twice
//
// Run: node --test test/gravedigger-expansion.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAVEDIGGER } from '../src/data/gravedigger.js';
import {
  createGravedigger, gravediggerGardenSpec, gravediggerDeadName,
  ensureGravediggerLedger, gravediggerStanding, gravediggerLedger,
  GRAVEDIGGER_CLAIMS, GRAVEDIGGER_VIGILS, GRAVEDIGGER_JUSTICE,
} from '../src/systems/gravedigger.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';

let nextId = 1000;
function fixture({ sector = 'sector_eunomia_gulf', runKind = 'adventure', registry = null } = {}) {
  const bus = createBus();
  const popups = [];
  const grants = [];
  const charges = [];
  const reps = [];
  const ev = {};
  for (const name of [
    'gravedigger:claimPosted', 'gravedigger:claimClosed', 'gravedigger:claimLapsed',
    'gravedigger:claimYielded', 'gravedigger:claimRobbed', 'gravedigger:grudged',
    'gravedigger:forgiven', 'gravedigger:pitRefused', 'gravedigger:offering',
    'gravedigger:standing', 'gravedigger:graveNamed', 'gravedigger:vigilPosted',
    'gravedigger:vigilInbound', 'gravedigger:vigilBegun', 'gravedigger:vigilDeparting',
    'gravedigger:vigilKept', 'gravedigger:vigilMissed', 'gravedigger:kinSlain',
    'gravedigger:graveDesecrated', 'gravedigger:portionPaid', 'gravedigger:verdictFiled',
  ]) {
    ev[name] = [];
    bus.on(name, (p) => ev[name].push(p));
  }
  bus.on('comms:popup', (p) => popups.push(p));
  const player = {
    id: 7, alive: true, isPlayer: true, credits: 10000,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  bus.on('economy:grantCredits', (p) => {
    if (!p) return;
    player.credits = Math.round(player.credits + Math.round(p.amount || 0));
    grants.push(p);
  });
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    player.credits = Math.max(0, Math.round(player.credits - Math.round(p.amount || 0)));
    charges.push(p);
  });
  bus.on('faction:repDelta', (p) => reps.push(p));
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    tick: 60,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) {
      const e = { id: nextId += 1, alive: true, occupantGeneration: nextId, ...spec };
      state.entityList.push(e); state.entities.set(e.id, e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createGravedigger();
  sys.init({ state, bus, helpers, registry });
  return { state, bus, helpers, popups, grants, charges, reps, ev, sys, player };
}
const addWreck = (state, pos, extra = {}) => {
  const e = {
    id: nextId += 1, alive: true, occupantGeneration: nextId, type: 'wreck',
    pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 18, mass: 120, data: {},
    ...extra,
  };
  state.entityList.push(e); state.entities.set(e.id, e); return e;
};
const robot = (state) => state.entityList.find((e) => e.alive && e.data?.gravedigger);
const gardens = (state) => state.entityList.filter((e) => e.alive && e.data?.gravediggerGarden);
const flags = (state) => state.story.flags;
const g = (state) => ensureGravediggerLedger(state);
const granted = (grants, prefix) => grants.filter((x) => String(x.reason || '').startsWith(prefix));
const charged = (charges, prefix) => charges.filter((x) => String(x.reason || '').startsWith(prefix));
const repTotal = (reps, prefix) => reps.filter((r) => String(r.reason || '').startsWith(prefix))
  .reduce((a, r) => a + r.delta, 0);
const claims = (state) => g(state).claims;
const vigils = (state) => g(state).vigils;
const openClaim = (state) => claims(state).find((c) => c.state === 'open');
const step = (f, n = 1, dt = 0.5, advanceTime = true) => {
  for (let i = 0; i < n; i += 1) {
    if (advanceTime) f.state.simTime += dt;
    f.sys.update(dt, f.state);
  }
};
// Which grave serials draw kin is a deterministic roll — the test predicts it
// from the same exported hash the system rolls, never from a re-implementation.
const kinRoll = (serial) => (hash32('kin-come', serial, gravediggerDeadName(serial)) >>> 0) / 4294967296;
const kinSerial = () => {
  for (let s = 1; s <= 40; s += 1) if (kinRoll(s) < GRAVEDIGGER_VIGILS.kinChance) return s;
  return null;
};
/** Bury one hull at pos and return the memorial row it filed. */
const bury = (f, pos, extra = {}) => {
  const w = addWreck(f.state, pos, extra);
  step(f, 1);
  assert.equal(w.alive, false, 'the hull went in the ground');
  return w;
};

// ── The named dead ───────────────────────────────────────────────────────────

test('the memorial roll names the dead — serial draws the same name on every read', () => {
  const f = fixture();
  const w = bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  const roll = gravediggerLedger(f.state).graves;
  assert.equal(roll.length, 1);
  assert.equal(roll[0].serial, 1);
  assert.equal(roll[0].name, gravediggerDeadName(1), 'the name is the serial draw');
  assert.equal(roll[0].buriedBy, 'field', 'the machine dug this one');
  assert.equal(f.ev['gravedigger:graveNamed'].length, 1);
  assert.equal(f.ev['gravedigger:graveNamed'][0].wreckId, w.id);
  // The bed on the grave speaks the name.
  const bed = gardens(f.state)[0];
  assert.equal(bed.data.graveName, roll[0].name);
  assert.equal(bed.data.callsign, `GRAVE OF ${roll[0].name}`);
  // A second fixture reads the same serial the same way — the roll is not a die.
  const f2 = fixture();
  bury(f2, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  assert.equal(gravediggerLedger(f2.state).graves[0].name, roll[0].name);
});

test('an authored hull keeps its own name in the ground', () => {
  const f = fixture();
  bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z },
    { data: { callsign: 'MULE-7' } });
  const roll = gravediggerLedger(f.state).graves;
  assert.equal(roll[0].name, 'MULE-7', 'the authored callsign is the memorial name');
  assert.equal(gardens(f.state)[0].data.callsign, 'GRAVE OF MULE-7');
});

test('pre-expansion beds join the memorial roll on read — the scan speaks the name', () => {
  const f = fixture();
  flags(f.state).gravedigger_gardens = [{ x: 10, z: 20, serial: 7 }, { x: 12, z: 22, serial: 9 }];
  f.state.world.currentSectorId = 'sector_io_reach';
  f.bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  f.state.world.currentSectorId = GRAVEDIGGER.sectorId;
  f.bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  f.sys.update(0.5, f.state);
  const roll = gravediggerLedger(f.state).graves;
  assert.equal(roll.length, 2, 'both old beds took names on the roll');
  assert.equal(roll.find((r) => r.serial === 7).name, gravediggerDeadName(7));
  const beds = gardens(f.state);
  assert.equal(beds.length, 2);
  assert.equal(beds.find((b) => b.data.gravediggerGardenSerial === 9).data.callsign,
    `GRAVE OF ${gravediggerDeadName(9)}`);
});

// ── Claim rings: the stake, the yield, the robbery ──────────────────────────

test('the race is a stake — the run-down wreck carries an open claim with id + generation', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  assert.ok(claim, 'the machine staked its target');
  assert.equal(claim.wreckId, w.id);
  assert.equal(claim.wreckGen, w.occupantGeneration, 'the stake binds the generation');
  assert.equal(w.data.gravediggerClaimId, claim.id, 'the hull wears the mark');
  assert.deepEqual(claim.pos, { x: w.pos.x, z: w.pos.z }, 'the ring rides the spot');
  assert.equal(f.ev['gravedigger:claimPosted'].length, 1);
});

test('the machine\'s own burial closes its stake — a take is never a robbery', () => {
  const f = fixture();
  bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  const claim = claims(f.state)[0];
  assert.equal(claim.state, 'buried');
  const closed = f.ev['gravedigger:claimClosed'];
  assert.equal(closed.length, 1);
  assert.equal(closed[0].outcome, 'buried');
  assert.equal(f.ev['gravedigger:claimRobbed'].length, 0, 'the ground robs nobody');
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 0);
  assert.equal(repTotal(f.reps, 'gravedigger_claim_robbed'), 0);
});

test('hold the stake inside its ring and the ground yields the grave forever', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  assert.ok(claim);
  f.state.player.tether = { active: true, targetId: w.id };
  step(f, Math.ceil(GRAVEDIGGER_CLAIMS.contestHoldS / 0.5) + 2);
  assert.equal(claim.state, 'yielded', 'the held hand won the stake');
  assert.equal(w.data.gravediggerYielded, true);
  assert.equal(w.data.gravediggerClaimId, null, 'the mark released');
  assert.equal(repTotal(f.reps, 'gravedigger_claim_yielded'), GRAVEDIGGER_CLAIMS.yieldRep);
  assert.equal(f.ev['gravedigger:claimYielded'].length, 1);
  // The yielded hull is the client's prize forever: released, it is never
  // chased, never staked, never buried.
  f.state.player.tether = null;
  step(f, 6);
  assert.equal(w.alive, true);
  assert.equal(claims(f.state).filter((c) => c.wreckId === w.id).length, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_claim_yielded'), GRAVEDIGGER_CLAIMS.yieldRep,
    'the yield paid once');
});

test('haul the staked hull out of the ring and the ledger files grave robbery', () => {
  const lawCalls = [];
  const registry = {
    get: (name) => (name === 'lawSecurity'
      ? { reportIncident: (req) => { lawCalls.push(req); return { accepted: true }; } }
      : null),
  };
  const f = fixture({ registry });
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  assert.ok(claim);
  // The client's hands take the hull out of the ring — not toward the pit.
  w.data.lastThrowerId = f.state.playerId;
  w.pos = { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z + 600 };
  step(f, 1);
  assert.equal(claim.state, 'robbed');
  assert.equal(claim.how, 'hauled');
  const robbed = f.ev['gravedigger:claimRobbed'];
  assert.equal(robbed.length, 1);
  assert.equal(robbed[0].how, 'hauled');
  assert.equal(robbed[0].robbed, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_claim_robbed'), GRAVEDIGGER_CLAIMS.robRep);
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 1);
  assert.equal(charged(f.charges, 'gravedigger_fine:')[0].amount, GRAVEDIGGER_CLAIMS.robFineCr);
  assert.equal(f.player.credits, 10000 - GRAVEDIGGER_CLAIMS.robFineCr);
  assert.ok(g(f.state).grudgeUntil > f.state.simTime, 'the pit holds the grudge');
  const verdict = g(f.state).verdicts.find((v) => v.kind === 'claim_robbed');
  assert.ok(verdict, 'the ground filed the verdict');
  assert.equal(f.ev['gravedigger:grudged'].length, 1);
  // The law is told through the real report seam — once, keyed on the claim.
  assert.equal(lawCalls.length, 1);
  assert.equal(lawCalls[0].reportId, `graverob:${claim.id}`);
  assert.equal(lawCalls[0].kind, 'payload_theft');
  assert.equal(lawCalls[0].offenderStableId, 'player');
});

test('a staked wreck killed under the player\'s hand is a jumped grave — the wire only bills once', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  assert.ok(claim);
  w.alive = false;
  f.bus.emit('entity:killed', { id: w.id, killerId: f.state.playerId });
  assert.equal(claim.state, 'robbed');
  assert.equal(claim.how, 'slain');
  assert.equal(repTotal(f.reps, 'gravedigger_claim_robbed'), GRAVEDIGGER_CLAIMS.robRep);
  // The doubled wire cannot bill twice — the tag cleared, the row closed.
  f.bus.emit('entity:killed', { id: w.id, killerId: f.state.playerId });
  assert.equal(f.ev['gravedigger:claimRobbed'].length, 1);
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 1);
  // A stranger's kill is not a robbery — the claim just lapses.
  const f2 = fixture();
  const w2 = addWreck(f2.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f2, 1);
  const claim2 = openClaim(f2.state);
  w2.alive = false;
  f2.bus.emit('entity:killed', { id: w2.id, killerId: 'npc_raider_1' });
  assert.equal(claim2.state, 'lapsed');
  assert.equal(repTotal(f2.reps, 'gravedigger_claim_robbed'), 0);
});

test('a beam-strip receipt that is not the ground\'s own take is a jumped claim', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  f.bus.emit('salvage:completed', { wreckId: w.id, source: 'beam', pos: { ...w.pos } });
  assert.equal(claim.state, 'robbed');
  assert.equal(claim.how, 'stripped');
  // The same wire replayed — no second bill.
  f.bus.emit('salvage:completed', { wreckId: w.id, source: 'beam', pos: { ...w.pos } });
  assert.equal(f.ev['gravedigger:claimRobbed'].length, 1);
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 1);
});

test('a recycled entity id is never the staked wreck — the claim lapses lost, never robbed', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  // The allocator handed the id to a fresh hull: same id, different generation,
  // no claim mark — the memory of the stake must not transfer.
  const impostor = {
    id: w.id, alive: true, occupantGeneration: w.occupantGeneration + 40,
    type: 'wreck', pos: { x: 900, z: 900 }, vel: { x: 0, z: 0 }, radius: 18, mass: 120, data: {},
  };
  f.state.entities.set(w.id, impostor);
  f.state.entityList[f.state.entityList.indexOf(w)] = impostor;
  impostor.alive = false;
  f.bus.emit('entity:killed', { id: w.id, killerId: f.state.playerId });
  assert.equal(claim.state, 'open', 'the kill wire read a different hull');
  f.bus.emit('salvage:completed', { wreckId: w.id, source: 'beam', pos: { x: 900, z: 900 } });
  assert.equal(claim.state, 'open', 'the strip wire read a different hull');
  step(f, 1);
  assert.equal(claim.state, 'lapsed');
  assert.equal(claim.lapseCause, 'lost');
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 0);
  assert.equal(repTotal(f.reps, 'gravedigger_claim_robbed'), 0);
});

test('the pit settles a staked offering — the claim closes offered, never robbed', () => {
  const f = fixture();
  flags(f.state).gravedigger_taught = true;
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  assert.ok(claim);
  // The client delivers the staked hull into the pit, released and settled —
  // the legitimate way to take a find: the ground pays and plants it.
  w.pos = { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z };
  w.vel = { x: 0, z: 0 };
  step(f, 1);
  assert.equal(w.alive, false);
  assert.equal(claim.state, 'offered');
  const closed = f.ev['gravedigger:claimClosed'];
  assert.equal(closed[closed.length - 1].outcome, 'offered');
  assert.equal(granted(f.grants, 'gravedigger:compost').length, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_claim_robbed'), 0);
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 0);
});

test('a staked hull parked beside the pit cannot hold the one open stake forever', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  assert.ok(claim);
  // The hull ends up beside the pit but never settles into an offering —
  // outside the stake's ring, untouched by the client's hands. The stake
  // still runs out on its own clock; a parked hull holding it open forever
  // would silently end the race.
  w.vel = { x: 0, z: 0 };
  w.pos = { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z };
  f.state.simTime += GRAVEDIGGER_CLAIMS.ttlS + 1;
  step(f, 1);
  assert.equal(claim.state, 'lapsed');
  assert.equal(claim.lapseCause, 'expired');
  assert.equal(w.data.gravediggerClaimId, null, 'the mark released');
  assert.ok(w.data.gravediggerPassedUntil > f.state.simTime, 'the quiet spell lands');
  // And the race can stake a new hull once the spell runs out — the parked
  // hull is carried off, so a fresh target is the next grave.
  w.pos = { x: GRAVEDIGGER.post.x + 5000, z: GRAVEDIGGER.post.z };
  f.state.simTime += GRAVEDIGGER_CLAIMS.repostCooldownS + 1;
  const w2 = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim2 = openClaim(f.state);
  assert.ok(claim2 && claim2.id !== claim.id, 'the machine staked again');
  assert.equal(claim2.wreckId, w2.id);
});

// ── Keeper standing, scaling fees, the once-only portion ─────────────────────

test('the keeper\'s standing scales every fee the ground pays — each tier announced once', () => {
  const f = fixture();
  flags(f.state).gravedigger_taught = true;
  // Three offerings cross into 'known' (fed >= 2): the third fee prices 1.25×.
  for (let i = 0; i < 3; i += 1) {
    addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
    step(f, 1);
  }
  const compost = granted(f.grants, 'gravedigger:compost');
  assert.equal(compost.length, 3);
  assert.equal(compost[0].amount, GRAVEDIGGER.compostFee);
  assert.equal(compost[1].amount, GRAVEDIGGER.compostFee);
  assert.equal(compost[2].amount, Math.round(GRAVEDIGGER.compostFee * 1.25));
  const standing = gravediggerStanding(f.state);
  assert.equal(standing.fed, 3);
  assert.equal(standing.id, 'known');
  assert.equal(f.ev['gravedigger:offering'].length, 3);
  const tiers = f.ev['gravedigger:standing'];
  assert.equal(tiers.length, 1, 'the crossing announced once');
  assert.equal(tiers[0].id, 'known');
  // Standing is durable state — the ledger reads it back normalized.
  assert.equal(repTotal(f.reps, 'gravedigger_offering'), 3 * GRAVEDIGGER_JUSTICE.offeringRep);
});

test('the full plot pays its keeper a portion — once ever, never twice', () => {
  const f = fixture();
  flags(f.state).gravedigger_taught = true;
  // Two beds short of full; the keeper already fed one (feed the book first so
  // the completing burial has a keeper to pay).
  flags(f.state).gravedigger_gardens = Array.from(
    { length: GRAVEDIGGER.gardenMax - 2 }, (_, i) => ({ x: i, z: i, serial: i + 1 }));
  flags(f.state).gravedigger_serial = GRAVEDIGGER.gardenMax - 2;
  g(f.state).fed = 1;
  // Fill the plot: two offerings — the second completes it and pays the portion.
  for (let i = 0; i < 2; i += 1) {
    addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
    step(f, 1);
  }
  assert.equal(flags(f.state).gravedigger_gardens.length, GRAVEDIGGER.gardenMax);
  const portions = granted(f.grants, 'gravedigger:portion');
  assert.equal(portions.length, 1, 'the portion paid exactly once');
  assert.equal(portions[0].amount, GRAVEDIGGER_JUSTICE.portionCr);
  assert.equal(f.ev['gravedigger:portionPaid'].length, 1);
  // More offerings into the full plot pay the fee — never the portion again.
  for (let i = 0; i < 2; i += 1) {
    addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
    step(f, 1);
  }
  assert.equal(granted(f.grants, 'gravedigger:portion').length, 1);
  assert.equal(f.ev['gravedigger:portionPaid'].length, 1);
  // A keeperless plot never pays a portion at all.
  const f2 = fixture();
  flags(f2.state).gravedigger_taught = true;
  flags(f2.state).gravedigger_gardens = Array.from(
    { length: GRAVEDIGGER.gardenMax - 1 }, (_, i) => ({ x: i, z: i, serial: i + 1 }));
  flags(f2.state).gravedigger_serial = GRAVEDIGGER.gardenMax - 1;
  addWreck(f2.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  step(f2, 1);
  assert.equal(granted(f2.grants, 'gravedigger:portion').length, 0);
});

// ── The grudge: the pit closes to the robber's hands ─────────────────────────

test('the grudge closes the pit to the robber\'s hands — the ground still takes the hull', () => {
  const f = fixture();
  flags(f.state).gravedigger_taught = true;
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  w.data.lastThrowerId = f.state.playerId;
  w.pos = { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z + 600 };
  step(f, 1);
  assert.equal(claim.state, 'robbed');
  // The robber's offering in the pit: the fee is refused, the take is not.
  const offering = addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  step(f, 2);
  assert.equal(f.ev['gravedigger:pitRefused'].length, 1);
  assert.equal(granted(f.grants, 'gravedigger:compost').length, 0, 'the pit pays no grudged hand');
  assert.equal(offering.alive, false, 'the ground takes it back anyway — as tribute');
  // The grudge runs out on its own clock and the ground says so, once.
  f.state.simTime = g(f.state).grudgeUntil + 1;
  step(f, 1);
  assert.equal(f.ev['gravedigger:forgiven'].length, 1);
  const paid = addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  step(f, 2);
  assert.equal(paid.alive, false);
  assert.equal(granted(f.grants, 'gravedigger:compost').length, 1, 'the pit reopens');
});

test('a fresh grudge before the tick drains the last one still barks its refusal', () => {
  const f = fixture();
  flags(f.state).gravedigger_taught = true;
  // Grudge 1: a jumped claim, then a refused offering — the cold line said.
  const w1 = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const c1 = openClaim(f.state);
  w1.data.lastThrowerId = f.state.playerId;
  w1.pos = { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z + 600 };
  step(f, 1);
  assert.equal(c1.state, 'robbed');
  addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  step(f, 1);
  assert.equal(f.ev['gravedigger:pitRefused'].length, 1);
  // A second stake forms while grudge 1 still runs.
  const w2 = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const c2 = openClaim(f.state);
  assert.ok(c2 && c2.id !== c1.id);
  // The old grudge ran out on the clock — but this kill wire lands BEFORE the
  // grudge tick could drain it (the wire's simTime is already past the mark).
  // The fresh grudge must earn its own cold line, not inherit the spent bark.
  g(f.state).grudgeUntil = f.state.simTime - 0.5;
  w2.alive = false;
  f.bus.emit('entity:killed', { id: w2.id, killerId: f.state.playerId });
  assert.equal(c2.state, 'robbed');
  // A fresh hull parked at the pit under grudge 2: refused — and said so.
  addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  step(f, 1);
  assert.equal(f.ev['gravedigger:pitRefused'].length, 2,
    'grudge 2 refuses with its own cold line');
});

// ── Kin vigils: the named dead still have people ─────────────────────────────

/** Drive a vigil from posted to holding and return { vigil, mourner }. The
 *  grave goes down within arm's reach of the robot — the fixture queues
 *  impulses, it does not integrate a chase. */
const vigilToHolding = (f) => {
  const serial = kinSerial();
  assert.ok(serial != null, 'a kin serial exists in range');
  flags(f.state).gravedigger_serial = serial - 1;
  bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  assert.equal(f.ev['gravedigger:vigilPosted'].length, 1, 'the kin took the notice');
  const v = vigils(f.state).find((x) => x.state === 'posted');
  assert.ok(v, 'a vigil row posted');
  f.state.simTime += GRAVEDIGGER_VIGILS.delayS + GRAVEDIGGER_VIGILS.delayJitterS + 1;
  step(f, 1);
  assert.equal(v.state, 'inbound', 'the kin dropped in');
  const m = f.state.entities.get(v.mournerId);
  assert.ok(m && m.data.gravediggerMourner === true, 'a mourner hull wears the vigil mark');
  assert.equal(m.data.gravediggerVigilId, v.id);
  assert.equal(v.mournerGen, m.occupantGeneration);
  assert.match(m.data.callsign, /^KIN OF /);
  m.pos = { x: v.pos.x, z: v.pos.z };
  step(f, 1);
  assert.equal(v.state, 'holding', 'the kin took station on the grave');
  return { vigil: v, mourner: m };
};

test('kin come for the named dead — witnessed company is paid once ever', () => {
  const f = fixture();
  const { vigil: v, mourner: m } = vigilToHolding(f);
  // The client keeps company inside the witness ring through the watch.
  f.player.pos = { x: v.pos.x + 20, z: v.pos.z };
  step(f, Math.ceil(GRAVEDIGGER_VIGILS.witnessS / 0.5) + 6);
  f.state.simTime = v.holdUntil + 1;
  step(f, 1);
  assert.equal(v.state, 'leaving');
  assert.equal(f.ev['gravedigger:vigilDeparting'].length, 1);
  m.pos = { x: v.pos.x + GRAVEDIGGER_VIGILS.departR + 100, z: v.pos.z };
  step(f, 1);
  assert.equal(v.state, 'kept');
  assert.equal(m.alive, false, 'the kin slipped out');
  assert.equal(f.ev['gravedigger:vigilKept'].length, 1);
  const pays = granted(f.grants, 'gravedigger_vigil:');
  assert.equal(pays.length, 1, 'the respect fee paid once');
  assert.equal(pays[0].amount, Math.round(GRAVEDIGGER_VIGILS.payCr * 1));
  assert.equal(repTotal(f.reps, 'gravedigger_vigil_kept'), GRAVEDIGGER_VIGILS.rep);
  assert.ok(g(f.state).verdicts.some((x) => x.kind === 'vigil_kept'));
  step(f, 4);
  assert.equal(granted(f.grants, 'gravedigger_vigil:').length, 1, 'still once');
});

test('nobody waits with the dead — the kin keep the grave alone and pay nothing', () => {
  const f = fixture();
  const { vigil: v, mourner: m } = vigilToHolding(f);
  f.player.pos = { x: 9000, z: 9000 };
  step(f, 2);
  f.state.simTime = v.holdUntil + 1;
  step(f, 1);
  assert.equal(v.state, 'leaving');
  m.pos = { x: v.pos.x + GRAVEDIGGER_VIGILS.departR + 100, z: v.pos.z };
  step(f, 1);
  assert.equal(v.state, 'missed');
  assert.equal(f.ev['gravedigger:vigilMissed'].length, 1);
  assert.equal(granted(f.grants, 'gravedigger_vigil:').length, 0, 'no witness, no fee');
  assert.equal(repTotal(f.reps, 'gravedigger_vigil_kept'), 0);
  assert.ok(g(f.state).verdicts.some((x) => x.kind === 'vigil_missed'));
});

test('a mourner in the ground is the pit\'s coldest grudge — and bills once', () => {
  const f = fixture();
  const { vigil: v, mourner: m } = vigilToHolding(f);
  m.alive = false;
  f.bus.emit('entity:killed', { id: m.id, killerId: f.state.playerId });
  assert.equal(v.state, 'lapsed', 'the watch ended in the ground');
  assert.equal(f.ev['gravedigger:kinSlain'].length, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_kin_slain'), GRAVEDIGGER_JUSTICE.kinSlainRep);
  assert.ok(g(f.state).verdicts.some((x) => x.kind === 'kin_slain'));
  const until = g(f.state).grudgeUntil;
  assert.ok(until >= f.state.simTime + GRAVEDIGGER_JUSTICE.kinSlainGrudgeS - 1);
  // The doubled kill wire cannot bill the same vigil twice.
  f.bus.emit('entity:killed', { id: m.id, killerId: f.state.playerId });
  assert.equal(repTotal(f.reps, 'gravedigger_kin_slain'), GRAVEDIGGER_JUSTICE.kinSlainRep);
  assert.equal(f.ev['gravedigger:kinSlain'].length, 1);
});

test('a broken bed is re-planted and remembered — once per grave', () => {
  const f = fixture();
  bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  const bed = gardens(f.state)[0];
  const serial = bed.data.gravediggerGardenSerial;
  bed.alive = false;
  f.bus.emit('entity:killed', { id: bed.id, killerId: f.state.playerId });
  assert.equal(f.ev['gravedigger:graveDesecrated'].length, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_grave_desecrated'), GRAVEDIGGER_JUSTICE.desecrateRep);
  assert.ok(g(f.state).verdicts.some((x) => x.kind === 'grave_desecrated'));
  // The ground re-plants the grave on the next pass — same serial.
  step(f, 1);
  const replanted = gardens(f.state).find((b) => b.data.gravediggerGardenSerial === serial);
  assert.ok(replanted, 'the bed came back on the same grave');
  // A doubled wire for the same grave files nothing twice.
  f.bus.emit('entity:killed', { id: bed.id, killerId: f.state.playerId });
  assert.equal(repTotal(f.reps, 'gravedigger_grave_desecrated'), GRAVEDIGGER_JUSTICE.desecrateRep);
});

// ── Save-safe, once-only, re-entry, bounds ───────────────────────────────────

test('save/restore: the round-tripped ledger keeps stamps — nothing pays or bills twice', () => {
  const f = fixture();
  flags(f.state).gravedigger_taught = true;
  // One offering (fed=1, stamped work) plus one robbery (fine + grudge stamp).
  addWreck(f.state, { x: GRAVEDIGGER.post.x, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  w.data.lastThrowerId = f.state.playerId;
  w.pos = { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z + 600 };
  step(f, 1);
  assert.equal(granted(f.grants, 'gravedigger:compost').length, 1);
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 1);

  // Adapter-level round-trip of the durable slice: the ledger rides the save
  // inside the flags bag (gravedigger_ledger) — no side channel. A stale
  // session slice left at state.gravedigger must be replaced by the flag's
  // restored book, never mirrored back over it.
  const savedFlags = JSON.parse(JSON.stringify(flags(f.state)));
  assert.ok(savedFlags.gravedigger_ledger, 'the ledger mirrored into the flags bag');
  assert.equal(savedFlags.gravedigger_ledger.fed, 1);
  const restored = fixture({ sector: 'sector_io_reach' });
  restored.state.story.flags = savedFlags;
  restored.state.gravedigger = { claims: [], vigils: [], verdicts: [], graves: [],
    paid: {}, seq: 0, fed: 0, robbed: 0, keeper: 0, grudgeUntil: 0 };
  restored.bus.emit('save:loaded');
  restored.state.world.currentSectorId = GRAVEDIGGER.sectorId;
  restored.bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  step(restored, 2);
  // The restored book stands: fed, robbed, the grudge clock, and every
  // once-only stamp intact — the flag's ledger won over the stale slice.
  assert.equal(g(restored.state).fed, g(f.state).fed);
  assert.equal(g(restored.state).robbed, g(f.state).robbed);
  assert.ok(g(restored.state).grudgeUntil > restored.state.simTime,
    'the grudge survived the restore');
  assert.equal(granted(restored.grants, 'gravedigger:').length, 0, 'no free progress on restore');
  assert.equal(charged(restored.charges, 'gravedigger_fine:').length, 0);
  // Beds re-materialized with their memorial names.
  const roll = gravediggerLedger(restored.state).graves;
  assert.ok(roll.length >= 1);
  assert.ok(gardens(restored.state).every(
    (b) => typeof b.data.graveName === 'string' && b.data.graveName.length > 0));
});

test('re-entry replays no stakes and refunds no watch — open work parks clean', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const claim = openClaim(f.state);
  assert.ok(claim);
  const { vigil: v } = vigilToHolding(f);
  assert.equal(v.state, 'holding');
  // Leave the gulf: the owned hulls go, the open stake lapses on the record,
  // the holding watch re-arms to posted — nothing settles out here.
  f.state.world.currentSectorId = 'sector_io_reach';
  f.bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(claim.state, 'lapsed');
  assert.equal(claim.lapseCause, 'field_left');
  assert.equal(w.data.gravediggerClaimId, null, 'the mark released');
  assert.equal(v.state, 'posted');
  assert.ok(v.mournerId == null);
  assert.equal(f.ev['gravedigger:vigilKept'].length + f.ev['gravedigger:vigilMissed'].length, 0);
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 0);
  // Back in the gulf the same ledger rolls on — the watch runs again.
  f.state.world.currentSectorId = GRAVEDIGGER.sectorId;
  f.bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  f.state.simTime = v.arrivesAt + 1;
  step(f, 1);
  const m2 = f.state.entities.get(v.mournerId);
  assert.ok(m2 && m2.data.gravediggerVigilId === v.id, 'the kin dropped in again');
  assert.equal(v.state, 'inbound');
});

test('malformed ledger slices normalize on read and the rolls stay bounded', () => {
  const f = fixture();
  // Garbage in every slot — the read repairs rather than throws. The hostile
  // bag arrives through the real durable seam (the flags slice), the same way
  // a tampered save would.
  flags(f.state).gravedigger_ledger = 'junk';
  const norm = g(f.state);
  assert.deepEqual(norm.claims, []);
  flags(f.state).gravedigger_ledger = {
    claims: [null, 42, { id: 'ok', wreckId: 5, state: 'open' }],
    vigils: [{ nope: true }],
    verdicts: [{ id: 'v', kind: 'x' }, 'trash'],
    graves: [{ serial: 'NaN' }],
    paid: 'not-a-bag',
    fed: 'NaN', robbed: -3, keeper: 'x',
  };
  const n2 = g(f.state);
  assert.equal(n2.claims.length, 1);
  assert.equal(n2.claims[0].id, 'ok');
  assert.equal(n2.vigils.length, 0);
  assert.equal(n2.verdicts.length, 1);
  assert.equal(n2.graves.length, 0);
  assert.equal(typeof n2.paid, 'object');
  assert.equal(gravediggerStanding(f.state).id, 'stranger');
  // A hostile slice is re-capped on read, newest kept — no storm of fabricated
  // rows costs the tick or the entity budget.
  const junk = (n, fill) => Array.from({ length: n }, (_, i) => ({ ...fill, id: `r${i}` }));
  flags(f.state).gravedigger_ledger = {
    claims: junk(500, { wreckId: 999999, state: 'open' }),
    vigils: junk(300, { serial: 1, state: 'posted' }),
    verdicts: junk(200, { kind: 'x' }),
    graves: junk(100, { serial: 1 }),
    paid: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, 1])),
    seq: 0, fed: 0, robbed: 0, keeper: 0, grudgeUntil: 0,
  };
  const n3 = g(f.state);
  assert.ok(n3.claims.length <= GRAVEDIGGER_CLAIMS.closedKeep * 2 + 4);
  assert.ok(n3.vigils.length <= GRAVEDIGGER_VIGILS.maxOpen * 4 + GRAVEDIGGER_VIGILS.keepClosed);
  assert.ok(n3.verdicts.length <= GRAVEDIGGER_JUSTICE.verdictCap);
  assert.ok(n3.graves.length <= GRAVEDIGGER_JUSTICE.graveKeep);
  assert.ok(Object.keys(n3.paid).length <= GRAVEDIGGER_JUSTICE.paidCap);
  // The rolls stay bounded under a storm of jumped claims.
  for (let i = 0; i < 30; i += 1) {
    const wr = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
    step(f, 1);
    const claim = openClaim(f.state);
    assert.ok(claim, `stake ${i} posted`);
    wr.data.lastThrowerId = f.state.playerId;
    wr.pos = { x: wr.pos.x, z: wr.pos.z + 600 };
    step(f, 1);
    assert.equal(claim.state, 'robbed');
  }
  assert.ok(claims(f.state).length <= GRAVEDIGGER_CLAIMS.closedKeep + 1,
    `closed stakes capped (${claims(f.state).length})`);
  assert.ok(g(f.state).verdicts.length <= GRAVEDIGGER_JUSTICE.verdictCap);
  assert.ok(Object.keys(g(f.state).paid).length <= GRAVEDIGGER_JUSTICE.paidCap);
  // Every row still serializes clean — the ledger is plain JSON end to end.
  JSON.parse(JSON.stringify(g(f.state)));
  // Thirty robberies against no feeds: the kin stop coming.
  assert.ok(g(f.state).robbed >= GRAVEDIGGER_JUSTICE.shunAt);
  assert.equal(g(f.state).fed, 0);
  const serial = kinSerial();
  flags(f.state).gravedigger_serial = serial - 1;
  const posted = f.ev['gravedigger:vigilPosted'].length;
  bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  assert.equal(f.ev['gravedigger:vigilPosted'].length, posted,
    'a shunned keeper draws no kin');
});

test('a stale kill wire for a recycled id cannot settle the live occupant\'s open work', () => {
  const f = fixture();
  const w1 = addWreck(f.state, { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z });
  step(f, 1);
  const c1 = openClaim(f.state);
  assert.ok(c1);
  // The client torches the staked hull — the first wire files the robbery.
  w1.alive = false;
  f.bus.emit('entity:killed', { id: w1.id, killerId: f.state.playerId });
  assert.equal(c1.state, 'robbed');
  // The id is dealt to a fresh hull the machine stakes in turn.
  const w2 = {
    id: w1.id, alive: true, occupantGeneration: w1.occupantGeneration + 40,
    type: 'wreck', pos: { x: GRAVEDIGGER.post.x + 500, z: GRAVEDIGGER.post.z },
    vel: { x: 0, z: 0 }, radius: 18, mass: 120, data: {},
  };
  f.state.entities.set(w2.id, w2);
  f.state.entityList[f.state.entityList.indexOf(w1)] = w2;
  step(f, 1);
  const c2 = openClaim(f.state);
  assert.ok(c2 && c2.id !== c1.id, 'the recycled id took a fresh stake');
  // The first wire replayed now names a LIVE hull: the entity:killed contract
  // (the victim is dead at emit) says this receipt is stale — its tags must
  // not rob the new body's open claim, nor bill a mourner or a bed it wears.
  f.bus.emit('entity:killed', { id: w1.id, killerId: f.state.playerId });
  assert.equal(c2.state, 'open', 'the live hull\'s stake stands');
  assert.equal(f.ev['gravedigger:claimRobbed'].length, 1);
  assert.equal(charged(f.charges, 'gravedigger_fine:').length, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_kin_slain'), 0);
  assert.equal(repTotal(f.reps, 'gravedigger_grave_desecrated'), 0);
  // And the live hull still settles by its own truth, not the stale wire's:
  // a real kill of THIS occupant files the robbery once.
  w2.alive = false;
  f.bus.emit('entity:killed', { id: w2.id, killerId: f.state.playerId });
  assert.equal(c2.state, 'robbed');
  assert.equal(f.ev['gravedigger:claimRobbed'].length, 2);
});

test('a tampered beds flag is re-bounded to the plot — the owed pass plants no storm', () => {
  const f = fixture();
  flags(f.state).gravedigger_gardens = Array.from(
    { length: GRAVEDIGGER.gardenMax * 8 },
    (_, i) => ({ x: i * 100, z: i * 50, serial: i + 1 }));
  step(f, 1);
  assert.equal(flags(f.state).gravedigger_gardens.length, GRAVEDIGGER.gardenMax,
    'the read keeps only the beds the plot holds');
  assert.equal(gardens(f.state).length, GRAVEDIGGER.gardenMax,
    'housekeep materializes the plot, not the fill');
});

test('hostile scalars heal to the book\'s bounds on read', () => {
  const f = fixture();
  flags(f.state).gravedigger_ledger = {
    claims: [], vigils: [], verdicts: [], graves: [], paid: {},
    seq: -9, fed: -3, robbed: -2, keeper: 99, grudgeUntil: 1e18,
  };
  const n = g(f.state);
  assert.equal(n.seq, 0);
  assert.equal(n.fed, 0);
  assert.equal(n.robbed, 0);
  // A keeper above the tier fed could have earned silences crossings the
  // book still owes — it heals to what fed supports.
  assert.equal(n.keeper, 0);
  // Nothing legit can set a grudge further out than the coldest offense's
  // span — a tampered clock cannot close the pit past it.
  assert.ok(n.grudgeUntil <= f.state.simTime + GRAVEDIGGER_JUSTICE.kinSlainGrudgeS);
  assert.equal(gravediggerStanding(f.state).id, 'stranger');
  flags(f.state).gravedigger_ledger = {
    claims: [], vigils: [], verdicts: [], graves: [], paid: {},
    seq: 0, fed: 6, robbed: 0, keeper: 99, grudgeUntil: 0,
  };
  const n2 = g(f.state);
  assert.equal(n2.keeper, 2, 'a high keeper heals to the tier fed supports');
  assert.equal(gravediggerStanding(f.state).id, 'sexton');
});

test('destroy + re-init leaves the book, the providers, and every owned hull clean', () => {
  const f = fixture();
  const { mourner: m } = vigilToHolding(f);
  assert.ok(m.alive);
  f.sys.destroy();
  assert.equal(f.helpers.sectorCookProviders.length, 0);
  assert.equal(f.state.entityList.filter((e) => e.alive && (
    e.data?.gravedigger || e.data?.gravediggerGarden || e.data?.gravediggerMourner
  )).length, 0, 'robot, beds, and kin all stood down');
  f.sys.init({ state: f.state, bus: createBus(), helpers: f.helpers });
  assert.equal(f.helpers.sectorCookProviders.length, 1);
  assert.ok(robot(f.state));
  // Re-init created no free progress on the ledger.
  assert.equal(granted(f.grants, 'gravedigger:').length, 0);
});

test('a stale kill wire for a re-armed watch cannot lapse it or bill the book', () => {
  const f = fixture();
  const { vigil: v, mourner: m } = vigilToHolding(f);
  assert.equal(v.mournerId, m.id);
  // Leave the gulf: the watch re-arms to posted and the mourner hull stands
  // down — but its corpse still wears the vigil's tag, and 'posted' is open.
  f.state.world.currentSectorId = 'sector_io_reach';
  f.bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(v.state, 'posted');
  assert.equal(v.mournerId, null);
  assert.equal(m.alive, false, 'the mourner hull stood down on the way out');
  // Back in the gulf, a stale or replayed kill wire names that corpse: it is
  // not the kin of this watch — no lapse, no bill, no grudge.
  f.state.world.currentSectorId = GRAVEDIGGER.sectorId;
  f.bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  const grudgeBefore = g(f.state).grudgeUntil;
  f.bus.emit('entity:killed', { id: m.id, killerId: f.state.playerId });
  assert.equal(v.state, 'posted', 'the re-armed watch survived the stale wire');
  assert.equal(f.ev['gravedigger:kinSlain'].length, 0, 'nothing was billed');
  assert.equal(repTotal(f.reps, 'gravedigger_kin_slain'), 0);
  assert.equal(g(f.state).grudgeUntil, grudgeBefore, 'no grudge for a stood-down hull');
  assert.ok(!g(f.state).verdicts.some((x) => x.kind === 'kin_slain'));
  // And the wire still answers honestly when the victim IS the live mourner:
  // re-armed, the kin drops in again and that hull's death is the real slay.
  f.state.simTime = v.arrivesAt + 1;
  step(f, 1);
  const m2 = f.state.entities.get(v.mournerId);
  assert.ok(m2 && m2.data.gravediggerVigilId === v.id);
  m2.alive = false;
  f.bus.emit('entity:killed', { id: m2.id, killerId: f.state.playerId });
  assert.equal(v.state, 'lapsed');
  assert.equal(f.ev['gravedigger:kinSlain'].length, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_kin_slain'), GRAVEDIGGER_JUSTICE.kinSlainRep);
  // A wire for a corpse whose watch already closed bills nothing at all.
  f.bus.emit('entity:killed', { id: m2.id, killerId: f.state.playerId });
  assert.equal(f.ev['gravedigger:kinSlain'].length, 1);
  assert.equal(repTotal(f.reps, 'gravedigger_kin_slain'), GRAVEDIGGER_JUSTICE.kinSlainRep);
});

test('a stale kill wire for a stood-down robot corpse cannot plant the gone flag', () => {
  const f = fixture();
  const r = robot(f.state);
  assert.ok(r);
  // Leave the gulf: the machine stands down — a removal, never a kill wire.
  f.state.world.currentSectorId = 'sector_io_reach';
  f.bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(r.alive, false);
  assert.notEqual(flags(f.state)[GRAVEDIGGER.goneFlag], true);
  // Back in the gulf the machine stands again — a replayed wire for the old
  // corpse must not plant the gone flag while UG-4 still walks.
  f.state.world.currentSectorId = GRAVEDIGGER.sectorId;
  f.bus.emit('sector:enter', { sectorId: GRAVEDIGGER.sectorId });
  assert.ok(robot(f.state));
  f.bus.emit('entity:killed', { id: r.id, killerId: f.state.playerId });
  assert.notEqual(flags(f.state)[GRAVEDIGGER.goneFlag], true,
    'a live machine cannot be declared dead by a stale receipt');
  // But the honest kill of the walking machine still plants the flag.
  const live = robot(f.state);
  live.alive = false;
  f.bus.emit('entity:killed', { id: live.id, killerId: f.state.playerId });
  assert.equal(flags(f.state)[GRAVEDIGGER.goneFlag], true);
});

test('a watch that can never conclude cannot hold a live slot forever', () => {
  const f = fixture();
  const serial = kinSerial();
  assert.ok(serial != null);
  flags(f.state).gravedigger_serial = serial - 1;
  bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z });
  const v = vigils(f.state).find((x) => x.state === 'posted');
  assert.ok(v);
  f.state.simTime += GRAVEDIGGER_VIGILS.delayS + GRAVEDIGGER_VIGILS.delayJitterS + 1;
  step(f, 1);
  assert.equal(v.state, 'inbound');
  assert.ok(v.deadline > 0, 'the travel clock was stamped');
  const m = f.state.entities.get(v.mournerId);
  // The mourner never arrives — a hull pinned by the field. The travel budget
  // runs out and the watch re-arms rather than parking the slot forever.
  f.state.simTime = v.deadline + 1;
  step(f, 1);
  assert.equal(v.state, 'posted', 'the lost kin re-arms the watch');
  assert.equal(m.alive, false, 'the stuck mourner was recalled');
  assert.equal(v.mournerId, null);
  // A departing kin that can never slip out settles by the company it saw.
  f.state.simTime = v.arrivesAt + 1;
  step(f, 1);
  const m2 = f.state.entities.get(v.mournerId);
  assert.ok(m2 && m2.data.gravediggerVigilId === v.id);
  m2.pos = { x: v.pos.x, z: v.pos.z };
  step(f, 1);
  assert.equal(v.state, 'holding');
  f.state.simTime = v.holdUntil + 1;
  step(f, 1);
  assert.equal(v.state, 'leaving');
  assert.ok(v.deadline > 0, 'the slip-out clock was stamped');
  f.state.simTime = v.deadline + 1;
  step(f, 1);
  assert.ok(v.state === 'kept' || v.state === 'missed', `the watch settled (${v.state})`);
  assert.equal(m2.alive, false, 'the departed hull stood down');
});

test('off-integer garden serials heal — the beds dedupe and the roll does not churn', () => {
  const f = fixture();
  // Float serials can never match the roll's int-healed rows — before the heal
  // every read pushed a fresh unmatchable name and cycled the named dead out.
  flags(f.state).gravedigger_gardens = [
    { x: 1, z: 2, serial: 7.5 }, { x: 3, z: 4, serial: 7.9 }, { x: 5, z: 6, serial: 9.2 },
  ];
  step(f, 1);
  const serials = flags(f.state).gravedigger_gardens.map((b) => b.serial).sort((a, b) => a - b);
  assert.deepEqual(serials, [7, 9], 'the rows healed to whole deduped serials');
  assert.equal(g(f.state).graves.length, 2, 'each live bed took a name');
  assert.equal(gardens(f.state).length, 2);
  step(f, 4);
  assert.equal(g(f.state).graves.length, 2, 'the roll is stable — no churn');
  assert.equal(g(f.state).graves[0].name, gravediggerDeadName(7));
});

test('a tampered serial counter cannot mint a serial the roll already owns', () => {
  const f = fixture();
  flags(f.state).gravedigger_taught = true;
  bury(f, { x: GRAVEDIGGER.post.x + 30, z: GRAVEDIGGER.post.z }); // serial 1
  flags(f.state).gravedigger_serial = 'forged';
  bury(f, { x: GRAVEDIGGER.post.x + 40, z: GRAVEDIGGER.post.z });
  const bedSerials = flags(f.state).gravedigger_gardens.map((b) => b.serial);
  assert.equal(bedSerials.length, 2, 'the second bed was not dropped by its own serial');
  assert.equal(new Set(bedSerials).size, 2, 'every bed owns a distinct serial');
  const rollSerials = g(f.state).graves.map((r) => r.serial);
  assert.equal(new Set(rollSerials).size, rollSerials.length, 'every grave owns a distinct serial');
  assert.equal(Math.max(...rollSerials), 2, 'the counter lifted above the live roll');
});

test('hostile live-row clocks heal to the phase law — nothing parks forever', () => {
  const f = fixture();
  const w = addWreck(f.state, { x: 0, z: 0 });
  w.data.gravediggerClaimId = 'c1';
  flags(f.state).gravedigger_ledger = {
    claims: [{
      id: 'c1', wreckId: w.id, state: 'open',
      postedAt: 100, expiresAt: 1e18, contestT: 1e9,
      pos: { x: 0, z: 0 },
    }],
    vigils: [{
      id: 'v1', serial: 1, state: 'posted',
      postedAt: 0, arrivesAt: 1e18, presenceS: 1e9,
    }],
    verdicts: [], graves: [], paid: {},
    seq: 0, fed: 0, robbed: 0, keeper: 0, grudgeUntil: 0,
  };
  const n = g(f.state);
  assert.ok(n.claims[0].expiresAt <= n.claims[0].postedAt + GRAVEDIGGER_CLAIMS.ttlS,
    'the stake cannot outlive its own clock');
  assert.ok(n.claims[0].contestT <= GRAVEDIGGER_CLAIMS.contestHoldS,
    'a contest never starts pre-held');
  assert.ok(n.vigils[0].arrivesAt
    <= n.vigils[0].postedAt + GRAVEDIGGER_VIGILS.delayS + GRAVEDIGGER_VIGILS.delayJitterS,
    'the watch cannot wait past its own arrival law');
  assert.ok(n.vigils[0].presenceS <= GRAVEDIGGER_VIGILS.holdS,
    'the company counter never starts pre-filled');
  // The healed stake expires on its own clock — the one open slot frees.
  const c1 = n.claims[0];
  f.state.simTime = c1.expiresAt + 1;
  step(f, 1);
  assert.equal(c1.state, 'lapsed');
  assert.equal(c1.lapseCause, 'expired');
});
