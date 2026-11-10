// tallyho-expansion — the hunt layer under the Rhea Cinder scoreboard.
//
// Proves the whole call-and-collect loop on the real system and the real bus:
//   · spotting    the board calls TALLY-HO on hostile hulls inside the crowd ring
//   · the call    hunts carry a timer, a posted purse, and an ownership tag
//   · the verdict  player kills pay in-ring (paid) or halved out of it (downed);
//                  expiry or escape slips the call; anyone else's kill goes cold
//   · the bolt     hunted quarry learns to run and a far-enough run slips early
//   · rival guns   aged calls field a licensed Pitborn gun that chases and poaches
//   · the sheet    standing wants post on a clock and claim once on a matching kill
//   · called shots the pilot stakes a hunt; the ring doubles it or keeps it
//   · memory       marks that slipped go wary: shorter windows, earlier bolts,
//                  and a richer standing want
//   · ledger rules id+gen+tag guards, once-only payouts, JSON save round-trips
//
// Determinism: simTime clocks, hash32 draws over ledger seq. Money moves only
// through economy:grantCredits/chargeCredits; rail standing only through
// faction:repDelta; motion only through queuePhysicsImpulse.
//
// Run: node --test test/tallyho-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  tallyho,
  createTallyho,
  tallyhoSpec,
  ensureTallyhoState,
  tallyhoBoard,
  tallyhoStanding,
  tallyhoTierFor,
  tallyhoMarkOf,
  tallyhoSteer,
  tallyhoSteerAway,
  tallyhoOpenHunts,
  tallyhoOpenBounties,
  TALLYHO_HUNT,
  TALLYHO_BOUNTY,
  TALLYHO_RIVAL,
  TALLYHO_BET,
  TALLYHO_HUNTER_TIERS,
} from '../src/systems/tallyho.js';
import { TALLYHO } from '../src/data/tallyho.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

const SEED = 7717;
const tick = (s) => Math.ceil(s * 60);

function boot({ credits = 10000 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [tallyho] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -6000, z: -6000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const events = { grants: [], charges: [], reps: [], popups: [], heard: {} };
  bus.on('economy:grantCredits', (p) => {
    if (!p) return;
    state.player.credits = Math.round(state.player.credits + Math.round(p.amount || 0));
    events.grants.push(p);
  });
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    state.player.credits = Math.max(0, Math.round(state.player.credits - Math.round(p.amount || 0)));
    events.charges.push(p);
  });
  bus.on('faction:repDelta', (p) => events.reps.push(p));
  bus.on('comms:popup', (p) => events.popups.push(p));
  const on = (ev) => { const a = []; events.heard[ev] = a; bus.on(ev, (p) => a.push(p)); return a; };
  state.world.currentSectorId = TALLYHO.sectorId;
  bus.emit('sector:enter', { sectorId: TALLYHO.sectorId });
  const sys = sim.registry.get('tallyho');
  return { sim, state, bus, player, sys, events, on };
}

const granted = (events, reason) =>
  events.grants.filter((g) => g.reason === reason); // exact — hunt:1 never eats hunt:10
const repTotal = (events, prefix) =>
  events.reps.filter((r) => String(r.reason || '').startsWith(prefix))
    .reduce((a, r) => a + r.delta, 0);

const inRing = () => ({ x: TALLYHO.post.x + 60, z: TALLYHO.post.z + 20 }); // inside crowdRadius

const hostile = (sim, pos, data = {}) => sim.spawn({
  type: 'ship', team: 1, pos, radius: 14, mass: 36,
  hull: 120, hullMax: 120, collides: true,
  data: { name: 'Freebooter', ai: { pirate: true, hostile: true }, ...data },
});

const killBy = (bus, victim, killerId, extra = {}) => bus.emit('entity:killed', {
  id: victim.id, killerId, type: victim.type,
  pos: { x: victim.pos.x, z: victim.pos.z },
  factionId: victim.factionId ?? null,
  victimClass: victim.data?.shipClass || victim.type,
  targetHostileToPlayer: true,
  ...extra,
});

/** A live open hunt on a spawned hull — the board called it on a real sweep.
 *  Runs a scan beat: the board's eye blinks on a clock, not every tick. */
function callOn(sim, state, pos = inRing(), data = {}) {
  const q = hostile(sim, pos, data);
  sim.runTicks(tick(TALLYHO_HUNT.scanBeatS) + 2);
  const t = ensureTallyhoState(state);
  const hunt = t.hunts.find((h) => h.state === 'open' && h.quarryId === q.id);
  assert.ok(hunt, 'the board called the hull it saw');
  return { quarry: q, hunt };
}

// ── Exports and the board surface ────────────────────────────────────────────

test('exports: the old contract is intact and the hunt layer is additive', () => {
  assert.equal(tallyho.name, 'tallyho');
  assert.equal(typeof createTallyho, 'function');
  const s = tallyhoSpec();
  assert.equal(s.data.tallyho, true);
  assert.equal(typeof ensureTallyhoState, 'function');
  assert.equal(typeof tallyhoBoard, 'function');
  assert.equal(typeof tallyhoStanding, 'function');
  assert.equal(typeof tallyhoMarkOf, 'function');
  assert.equal(typeof tallyhoSteer, 'function');
  assert.equal(tallyhoTierFor(0).id, 'unrated');
  assert.equal(tallyhoTierFor(TALLYHO_HUNTER_TIERS[4].marks).id, 'apex');
  assert.ok(TALLYHO_HUNT.huntWindowS > TALLYHO_HUNT.waryWindowS, 'wary calls run shorter');
  assert.ok(TALLYHO_HUNT.escapeRadius > TALLYHO.crowdRadius, 'the ring is inside the escape line');
  assert.ok(TALLYHO_BOUNTY.maxOpen >= 1 && TALLYHO_RIVAL.rivalCap >= 1);
  assert.ok(TALLYHO_BET.stakeCr > 0 && TALLYHO_BET.payoutMult > 1);
});

test('tallyhoBoard gives a HUD-safe copy of the whole hunt board', () => {
  const { sim, state } = boot();
  try {
    const board = tallyhoBoard(state);
    assert.equal(board.standing.id, 'unrated');
    assert.equal(board.standing.marks, 0);
    for (const k of ['sightings', 'hunts', 'rivals', 'bounties', 'log']) {
      assert.ok(Array.isArray(board[k]), `board.${k}`);
    }
    board.hunts.push({ bogus: true });
    assert.equal(tallyhoBoard(state).hunts.length, 0, 'the snapshot is a copy, not the ledger');
    assert.equal(tallyhoOpenHunts(state).length, 0);
    assert.equal(tallyhoOpenBounties(state).length, 0);
  } finally {
    sim.dispose();
  }
});

// ── Spotting ─────────────────────────────────────────────────────────────────

test('spotting: a hostile hull in the ring gets called; the call rides the hull', () => {
  const { sim, state, events, on } = boot();
  try {
    on('tallyho:huntPosted');
    const q = hostile(sim, inRing(), { name: 'Rake' });
    sim.runTicks(tick(TALLYHO_HUNT.scanBeatS) + 2); // a full blink — the board's eye is on a clock
    const t = ensureTallyhoState(state);
    const hunt = t.hunts.find((h) => h.quarryId === q.id);
    assert.ok(hunt && hunt.state === 'open', 'the call is posted');
    assert.equal(hunt.mark, 'Rake', 'the quarry mark is the hull name');
    assert.equal(hunt.quarryGen, q.occupantGeneration, 'the row binds this occupant');
    assert.equal(q.data.tallyhoHuntId, hunt.id, 'the tag rides the hull');
    assert.ok(hunt.expiresAt > state.simTime, 'the call has a real timer');
    assert.ok(hunt.bountyCr >= TALLYHO_HUNT.bountyBaseCr, 'the purse is posted');
    assert.equal(events.heard['tallyho:huntPosted'].length, 1);
    const sight = t.sightings.find((s) => s.mark === 'Rake');
    assert.ok(sight && sight.seen >= 1, 'the board remembers the mark it saw');
    assert.ok(events.popups.some((p) => /TALLY-HO|MARK SEEN|IN THE RING/.test(p.text)),
      'the crowd hears the call');
  } finally {
    sim.dispose();
  }
});

test('spotting: friendlies, the rail, and out-of-sight hulls are never called', () => {
  const { sim, state } = boot();
  try {
    const calm = sim.spawn({ // a neutral hull in the ring — not quarry
      type: 'ship', team: 2, pos: inRing(), radius: 14, mass: 36,
      hull: 100, hullMax: 100, collides: true, data: { name: 'Hauler' },
    });
    const far = hostile(sim, { x: TALLYHO.post.x + TALLYHO.crowdRadius + 400, z: TALLYHO.post.z });
    sim.runTicks(tick(TALLYHO_HUNT.scanBeatS) + 4);
    const t = ensureTallyhoState(state);
    assert.equal(t.hunts.length, 0, 'no call posted');
    assert.equal(calm.data.tallyhoHuntId ?? null, null);
    assert.equal(far.data.tallyhoHuntId ?? null, null);
  } finally {
    sim.dispose();
  }
});

// ── Verdicts: paid / downed / slipped / cold ─────────────────────────────────

test('a player kill in the ring pays the posted purse, once, with rail standing', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:huntPaid'); on('tallyho:ledgerFiled');
    const { quarry, hunt } = callOn(sim, state);
    const before = state.player.credits;
    quarry.alive = false;
    killBy(bus, quarry, player.id);
    killBy(bus, quarry, player.id); // the doubled wire still pays once
    assert.equal(hunt.state, 'paid');
    const purse = granted(events, `tallyho_hunt:${hunt.id}`);
    assert.equal(purse.length, 1, 'the purse lands once');
    assert.equal(purse[0].amount, Math.round(hunt.bountyCr));
    assert.equal(state.player.credits, before + Math.round(hunt.bountyCr));
    assert.equal(repTotal(events, 'tallyho_hunt_paid'), TALLYHO_HUNT.huntRep);
    assert.equal(events.heard['tallyho:huntPaid'].length, 1);
    const t = ensureTallyhoState(state);
    assert.equal(t.huntsPaid, 1);
    const sight = t.sightings.find((s) => s.mark === hunt.mark);
    assert.equal(sight.killed, 1, 'the memory counts the bag');
    assert.ok(events.heard['tallyho:ledgerFiled'].some((l) => l.kind === 'hunt_paid'));
  } finally {
    sim.dispose();
  }
});

test('a called hull downed out of the ring pays half and files the honest verdict', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:huntDowned');
    const { quarry, hunt } = callOn(sim, state);
    quarry.pos.x = TALLYHO.post.x + TALLYHO.crowdRadius + 300; // dragged out of sight
    quarry.pos.z = TALLYHO.post.z;
    quarry.alive = false;
    killBy(bus, quarry, player.id);
    assert.equal(hunt.state, 'downed');
    const purse = granted(events, `tallyho_hunt:${hunt.id}`);
    assert.equal(purse.length, 1);
    assert.equal(purse[0].amount,
      Math.round(hunt.bountyCr * TALLYHO_HUNT.outOfSightPayFrac), 'out of sight halves the purse');
    assert.equal(repTotal(events, 'tallyho_hunt_downed'), TALLYHO_HUNT.downedRep);
    assert.equal(repTotal(events, 'tallyho_hunt_paid'), 0, 'the in-ring rate never files');
  } finally {
    sim.dispose();
  }
});

test('an unanswered call slips, the mark turns wary, and the next call runs shorter', () => {
  const { sim, state, events, on } = boot();
  try {
    on('tallyho:huntSlipped'); on('tallyho:huntPosted');
    const { hunt } = callOn(sim, state, inRing(), { name: 'Slipjaw' });
    hunt.expiresAt = state.simTime; // the window closes now
    sim.step();
    assert.equal(hunt.state, 'slipped');
    assert.equal(events.heard['tallyho:huntSlipped'].length, 1);
    const t = ensureTallyhoState(state);
    const sight = t.sightings.find((s) => s.mark === 'Slipjaw');
    assert.ok(sight.escaped >= 1 && sight.wary === true, 'the mark that ran is wary now');

    // Next hull of the same stripe gets a wary call: shorter window, sooner bolt.
    const q2 = hostile(sim, inRing(), { name: 'Slipjaw' });
    q2.data.tallyhoHuntedAt = -Infinity; // a fresh hull — no cooldown on it
    sim.runTicks(tick(TALLYHO_HUNT.scanBeatS) + 2);
    const hunt2 = t.hunts.find((h) => h.quarryId === q2.id && h.state === 'open');
    assert.ok(hunt2, 'the same mark is called again');
    assert.equal(hunt2.wary, true);
    assert.ok(hunt2.expiresAt - hunt2.postedAt <= TALLYHO_HUNT.waryWindowS,
      'the wary window is shorter');
    assert.ok(hunt2.fleeAt - hunt2.postedAt <= TALLYHO_HUNT.waryFleeAfterS,
      'wary quarry bolts almost at once');
    assert.ok(hunt2.bountyCr > hunt.bountyCr, 'a slipped mark carries a richer purse');
  } finally {
    sim.dispose();
  }
});

test('the bolt: a hunted hull runs after the delay and running the ring slips it', () => {
  const { sim, state, events, on } = boot();
  try {
    on('tallyho:quarryFleeing');
    const { quarry, hunt } = callOn(sim, state);
    hunt.fleeAt = state.simTime; // it bolts on this beat
    sim.step();
    assert.equal(hunt.fleeing, true);
    assert.equal(events.heard['tallyho:quarryFleeing'].length, 1, 'the bolt call sounds once');
    const bolt = quarry.data.tallyhoBolt;
    assert.ok(bolt && Math.hypot(bolt.x, bolt.z) > 0, 'the bolt vector is real');
    const away = Math.hypot(quarry.pos.x - TALLYHO.post.x, quarry.pos.z - TALLYHO.post.z);
    const dot = bolt.x * (quarry.pos.x - TALLYHO.post.x) + bolt.z * (quarry.pos.z - TALLYHO.post.z);
    assert.ok(dot > 0, 'the bolt points out of the ring');
    assert.ok(Math.abs(Math.hypot(bolt.x, bolt.z) - TALLYHO_HUNT.fleeSpeed) < 1e-6);
    assert.ok(away <= TALLYHO_HUNT.escapeRadius);
    // Across the escape line the call slips on the spot — no wait for the window.
    quarry.pos.x = TALLYHO.post.x + TALLYHO_HUNT.escapeRadius + 50;
    sim.step();
    assert.equal(hunt.state, 'slipped', 'running the ring ends the call');
  } finally {
    sim.dispose();
  }
});

test('a hull that outlives its call is not re-marked inside the cooldown', () => {
  const { sim, state } = boot();
  try {
    const { quarry, hunt } = callOn(sim, state);
    hunt.expiresAt = state.simTime;
    sim.step();
    assert.equal(hunt.state, 'slipped');
    assert.equal(quarry.data.tallyhoHuntId, null, 'the dead call leaves the hull');
    sim.runTicks(tick(TALLYHO_HUNT.scanBeatS) + 6);
    const t = ensureTallyhoState(state);
    assert.equal(t.hunts.some((h) => h.quarryId === quarry.id && h.state === 'open'), false,
      'the same hull is not instantly re-called');
  } finally {
    sim.dispose();
  }
});

test('a kill by anyone else goes cold — the purse belongs to the pilot or the rail', () => {
  const { sim, state, bus, events, on } = boot();
  try {
    on('tallyho:huntCold');
    const { quarry, hunt } = callOn(sim, state);
    const other = hostile(sim, inRing(), { name: 'Scav' });
    quarry.alive = false;
    killBy(bus, quarry, other.id);
    assert.equal(hunt.state, 'cold');
    assert.equal(events.heard['tallyho:huntCold'].length, 1);
    assert.equal(granted(events, `tallyho_hunt:${hunt.id}`).length, 0, 'no purse on a cold call');
    assert.equal(repTotal(events, 'tallyho_hunt'), 0);
  } finally {
    sim.dispose();
  }
});

// ── Rival guns ───────────────────────────────────────────────────────────────

test('a call left standing fields a licensed gun that poaches the kill', () => {
  const { sim, state, events, on } = boot();
  try {
    on('tallyho:rivalPosted'); on('tallyho:huntPoached');
    const { quarry, hunt } = callOn(sim, state);
    hunt.postedAt = state.simTime - TALLYHO_RIVAL.rivalDelayS; // aged call
    sim.step();
    const t = ensureTallyhoState(state);
    const row = t.rivals.find((r) => r.huntId === hunt.id);
    assert.ok(row && row.state === 'open', 'the rail fields a gun');
    const gun = state.entities.get(row.entityId);
    assert.ok(gun && gun.data.tallyhoRival === true && gun.data.tallyhoHuntId === hunt.id);
    assert.equal(row.gen, gun.occupantGeneration, 'the row binds this occupant');
    assert.equal(events.heard['tallyho:rivalPosted'].length, 1);
    assert.ok(t.rivalsFielded >= 1);

    // Chase: the gun reads the quarry across the ring.
    sim.step();
    assert.ok(gun.data.tallyhoChase, 'the gun chases its mark');

    // Contact held poaches the kill — the purse goes to the rail, not the pilot.
    gun.pos.x = quarry.pos.x + 20; gun.pos.z = quarry.pos.z;
    const before = state.player.credits;
    sim.runTicks(tick(TALLYHO_RIVAL.killS) + 6);
    assert.equal(hunt.state, 'poached');
    assert.equal(quarry.alive, false, 'the gun took the kill');
    assert.equal(events.heard['tallyho:huntPoached'].length, 1);
    assert.equal(events.heard['tallyho:huntPoached'][0].rivalId, row.id, 'the poach names the gun row');
    assert.equal(events.heard['tallyho:huntPoached'][0].entityId, row.entityId);
    assert.equal(granted(events, `tallyho_hunt:${hunt.id}`).length, 0, 'no purse on a poach');
    assert.equal(state.player.credits, before, 'the rail collected, not the pilot');
    const sight = t.sightings.find((s) => s.mark === hunt.mark);
    assert.equal(sight.poached, 1, 'the memory counts the steal');
    assert.equal(row.state, 'done');
  } finally {
    sim.dispose();
  }
});

test('cooling a licensed gun files against the pilot and frees the call', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:rivalDowned');
    const { quarry, hunt } = callOn(sim, state);
    hunt.postedAt = state.simTime - TALLYHO_RIVAL.rivalDelayS;
    sim.step();
    const t = ensureTallyhoState(state);
    const row = t.rivals.find((r) => r.huntId === hunt.id);
    const gun = state.entities.get(row.entityId);
    gun.alive = false;
    killBy(bus, gun, player.id, { pos: { x: gun.pos.x, z: gun.pos.z } });
    assert.equal(row.state, 'downed');
    assert.equal(events.heard['tallyho:rivalDowned'].length, 1);
    assert.equal(repTotal(events, 'tallyho_rival_downed'), TALLYHO_RIVAL.rivalKillRep,
      'the rail files the pilot for cooling its gun');
    assert.ok(t.hunts.find((h) => h.id === hunt.id).state === 'open',
      'the call itself still stands for the pilot');
    // The pilot can still finish the call the gun was running.
    quarry.alive = false;
    killBy(bus, quarry, player.id);
    assert.equal(hunt.state, 'paid');
  } finally {
    sim.dispose();
  }
});

// ── The want sheet ───────────────────────────────────────────────────────────

test('the sheet: wants post on the clock; a matching kill in the ring claims once', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:bountyPosted'); on('tallyho:bountyClaimed');
    const t = ensureTallyhoState(state);
    sim.step(); // a positive clock, then mark the sheet due — <=0 reschedules fresh
    t.nextBountyAt = state.simTime;
    sim.step();
    assert.equal(events.heard['tallyho:bountyPosted'].length, 1, 'a want posts on the beat');
    const want = t.bounties.find((b) => b.state === 'open');
    assert.ok(want && want.bountyCr > 0);

    // A kill the want names — open wants take any hostile hull in the ring.
    const q = hostile(sim, inRing(), { name: want.mark || 'Freebooter' });
    q.alive = false;
    killBy(bus, q, player.id);
    killBy(bus, q, player.id); // doubled wire — still once
    assert.equal(want.state, 'claimed');
    const claims = granted(events, `tallyho_bounty:${want.id}`);
    assert.equal(claims.length, 1, 'the want pays once');
    assert.equal(claims[0].amount, Math.round(want.bountyCr));
    assert.equal(repTotal(events, 'tallyho_bounty_claimed'), TALLYHO_BOUNTY.claimRep);
    assert.equal(events.heard['tallyho:bountyClaimed'].length, 1);
    assert.equal(t.bountiesClaimed, 1);
  } finally {
    sim.dispose();
  }
});

test('the sheet: a want on a slipped mark names it and pays the escalated price', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:bountyPosted');
    const t = ensureTallyhoState(state);
    // File the memory directly: 'Slipjaw' slipped twice on past calls — and keep
    // it the only remembered mark, so every marked draw the sheet makes names it.
    t.sightings.push({ mark: 'Slipjaw', seen: 2, escaped: 2, killed: 0, poached: 0, wary: true, lastAt: 0 });
    let named = null;
    sim.step(); // positive clock before forcing due — <=0 would reschedule fresh
    for (let i = 0; i < 40 && !named; i++) {
      t.nextBountyAt = state.simTime; // the sheet is due every beat we force
      sim.step();
      named = t.bounties.find((b) => b.state === 'open' && b.mark === 'Slipjaw');
      if (named) break;
      // An unnamed want landed instead — claim it in the ring so the sheet can
      // post again. The claim-kill reuses the same mark, so the draw stays pure.
      const open = t.bounties.find((b) => b.state === 'open');
      if (open) {
        const q = hostile(sim, inRing(), { name: 'Slipjaw' });
        q.alive = false;
        killBy(bus, q, player.id);
        assert.equal(open.state, 'claimed', 'the open want claimed to free the sheet');
      }
    }
    assert.ok(named, 'the sheet eventually names the mark that ran');
    assert.ok(named.bountyCr >= TALLYHO_BOUNTY.markBountyBaseCr
      + 2 * TALLYHO_BOUNTY.markBountyEscalationCr, 'escapes raise the want');

    // Kill the named stripe in the ring — the want claims at its own price.
    const q = hostile(sim, inRing(), { name: 'Slipjaw' });
    sim.step(); // let the call post on it too — the want still settles honestly
    q.alive = false;
    killBy(bus, q, player.id);
    assert.equal(named.state, 'claimed');
    const pay = granted(events, `tallyho_bounty:${named.id}`);
    assert.equal(pay.length, 1);
    assert.equal(pay[0].amount, Math.round(named.bountyCr));
  } finally {
    sim.dispose();
  }
});

test('the sheet: an ignored want goes cold on its own clock', () => {
  const { sim, state, events, on } = boot();
  try {
    on('tallyho:bountyCold');
    const t = ensureTallyhoState(state);
    sim.step();
    t.nextBountyAt = state.simTime;
    sim.step();
    const want = t.bounties.find((b) => b.state === 'open');
    want.expiresAt = state.simTime;
    sim.step();
    assert.equal(want.state, 'cold');
    assert.equal(events.heard['tallyho:bountyCold'].length, 1);
  } finally {
    sim.dispose();
  }
});

// ── Called shots ─────────────────────────────────────────────────────────────

test('a called shot stakes the hunt, doubles back on the in-ring kill, loses otherwise', () => {
  const { sim, state, bus, player, sys, events, on } = boot();
  try {
    on('tallyho:betPosted'); on('tallyho:betPaid'); on('tallyho:betLost');
    const { quarry, hunt } = callOn(sim, state);
    const before = state.player.credits;
    const stake = sys.callShot(state, hunt.id);
    assert.equal(stake, TALLYHO_BET.stakeCr, 'the marker rides the call');
    assert.equal(state.player.credits, before - TALLYHO_BET.stakeCr, 'the stake is charged');
    assert.equal(events.charges.filter((c) => c.reason === `tallyho_bet:${hunt.id}`).length, 1);
    assert.equal(events.heard['tallyho:betPosted'].length, 1);
    assert.equal(sys.callShot(state, hunt.id), 0, 'one marker per call');

    quarry.alive = false;
    killBy(bus, quarry, player.id);
    assert.equal(hunt.state, 'paid');
    const win = granted(events, `tallyho_bet_win:${hunt.id}`);
    assert.equal(win.length, 1, 'the called shot pays once');
    assert.equal(win[0].amount, TALLYHO_BET.stakeCr * TALLYHO_BET.payoutMult);
    assert.equal(events.heard['tallyho:betPaid'].length, 1);
  } finally {
    sim.dispose();
  }
});

test('a called shot on a slipping call is lost; a broke pilot gets no marker', () => {
  const { sim, state, sys, events, on } = boot();
  try {
    on('tallyho:betLost');
    const { hunt } = callOn(sim, state);
    assert.equal(sys.callShot(state, hunt.id), TALLYHO_BET.stakeCr);
    hunt.expiresAt = state.simTime;
    sim.step();
    assert.equal(hunt.state, 'slipped');
    assert.equal(events.heard['tallyho:betLost'].length, 1);
    assert.equal(granted(events, `tallyho_bet_win:${hunt.id}`).length, 0, 'no double-back on a slip');

    const { hunt: poor } = callOn(sim, state, { x: TALLYHO.post.x - 80, z: TALLYHO.post.z });
    state.player.credits = 10;
    assert.equal(sys.callShot(state, poor.id), 0,
      'a broke pilot gets a refusal, not a bill');
    assert.equal(state.player.credits, 10);
  } finally {
    sim.dispose();
  }
});

// ── Standing ─────────────────────────────────────────────────────────────────

test('hunter standing: bagged calls count deeds and the tier scales the next purse', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:standing');
    const t = ensureTallyhoState(state);
    for (let i = 0; i < TALLYHO_HUNTER_TIERS[1].marks; i++) {
      const { quarry, hunt } = callOn(sim, state,
        { x: TALLYHO.post.x + 40 + i * 20, z: TALLYHO.post.z + i * 10 }, { name: `Prey${i}` });
      quarry.alive = false;
      killBy(bus, quarry, player.id);
      assert.equal(hunt.state, 'paid');
    }
    const standing = tallyhoStanding(state);
    assert.equal(standing.tier, 1, 'the deeds climbed the tier');
    assert.ok(events.heard['tallyho:standing'].some((s) => s.tier === 1));
    assert.ok(standing.payMult > 1, 'the rail pays its favorite more');

    // The next posted purse carries the tier.
    const { hunt: next } = callOn(sim, state, inRing(), { name: 'Freshmark' });
    assert.ok(next.bountyCr > TALLYHO_HUNT.bountyBaseCr, 'the purse scales with standing');
  } finally {
    sim.dispose();
  }
});

// ── Consequences: the crowd itself is not free fire ──────────────────────────

test('shooting the audience files against the pilot — board or rail, the rail saw it', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:audienceDowned'); on('tallyho:boardDowned');
    // Park a spectator honestly: three rated kills put one on the rail.
    for (let i = 0; i < TALLYHO.ratedKillsPerSpectator; i++) {
      const q = hostile(sim, { x: TALLYHO.post.x + 30, z: TALLYHO.post.z }, { name: `Warmup${i}` });
      q.alive = false;
      killBy(bus, q, player.id);
      sim.step();
    }
    const spec = state.entityList.find((e) => e.data?.tallyhoSpectator === true);
    assert.ok(spec, 'a spectator parked for the show');
    spec.alive = false;
    killBy(bus, spec, player.id, { targetHostileToPlayer: false });
    killBy(bus, spec, player.id, { targetHostileToPlayer: false }); // doubled wire
    assert.equal(events.heard['tallyho:audienceDowned'].length, 1, 'the consequence files once');
    assert.equal(repTotal(events, 'tallyho_audience_downed'), -3, 'a hit on the rail costs name');

    const board = state.entityList.find((e) => e.data?.tallyho === true);
    board.alive = false;
    killBy(bus, board, player.id, { targetHostileToPlayer: false });
    assert.equal(events.heard['tallyho:boardDowned'].length, 1);
    assert.equal(repTotal(events, 'tallyho_board_downed'), -8, 'breaking the board costs name');

    // And the board is honest about silence: nothing new is called while it lies dead.
    hostile(sim, inRing(), { name: 'Unguarded' });
    sim.runTicks(tick(TALLYHO_HUNT.scanBeatS) + 6);
    const t = ensureTallyhoState(state);
    assert.equal(t.hunts.some((h) => h.state === 'open'), false,
      'a dead board calls nothing');
  } finally {
    sim.dispose();
  }
});

// ── Sector and save discipline ───────────────────────────────────────────────

test('leaving the sector lapses every open call cold — the quarry stays behind', () => {
  const { sim, state, bus, events, on } = boot();
  try {
    on('tallyho:huntCold');
    const { hunt } = callOn(sim, state);
    state.world.currentSectorId = 'sector_io_reach'; // the world moves before the wire
    bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
    assert.equal(hunt.state, 'cold', 'the call dies on the jump');
    assert.ok(events.heard['tallyho:huntCold'].length >= 1);
    const t = ensureTallyhoState(state);
    assert.equal(t.rivals.every((r) => r.state !== 'open'), true, 'the guns stand down');
  } finally {
    sim.dispose();
  }
});

test('the ledger survives a JSON round-trip: stamps hold, payout never re-fires', () => {
  const { sim, state, bus, player, events } = boot();
  try {
    const { quarry, hunt } = callOn(sim, state);
    quarry.alive = false;
    killBy(bus, quarry, player.id);
    assert.equal(hunt.state, 'paid');
    const grantsBefore = events.grants.length;

    state.tallyho = JSON.parse(JSON.stringify(state.tallyho));
    const t = ensureTallyhoState(state);
    assert.equal(t.huntsPaid, 1);
    assert.equal(t.hunts.find((h) => h.id === hunt.id).state, 'paid', 'the verdict holds');
    assert.ok(t.paid[`hunt:${hunt.id}`] != null, 'the stamp rode the save');

    // A replayed kill wire for the same call cannot re-pay.
    const ghost = hostile(sim, inRing(), { name: 'Echo' });
    bus.emit('entity:killed', { id: quarry.id, killerId: player.id, type: 'ship', pos: inRing() });
    sim.runTicks(tick(TALLYHO_HUNT.scanBeatS) + 2);
    assert.equal(events.grants.length, grantsBefore, 'no second purse across the restore');
    assert.ok(ghost.data.tallyhoHuntId != null || t.hunts.some((h) => h.quarryId === ghost.id),
      'the board still calls fresh quarry after a restore');
  } finally {
    sim.dispose();
  }
});

// ── Identity guards ──────────────────────────────────────────────────────────

test('a recycled entity id is not the quarry: generation and tag both bind', () => {
  const { sim, state } = boot();
  try {
    const { quarry, hunt } = callOn(sim, state);
    // The id recycles onto a different body: right id, wrong occupant.
    quarry.occupantGeneration = (quarry.occupantGeneration ?? 1) + 1000;
    sim.step();
    assert.equal(hunt.state, 'cold', 'a mismatched occupant is not the called hull');

    // Right occupant, missing tag: a bare body is not under call either.
    const { quarry: q2, hunt: h2 } = callOn(sim, state, inRing(), { name: 'Second' });
    q2.data.tallyhoHuntId = null;
    sim.step();
    assert.equal(h2.state, 'cold', 'an untagged body is not the quarry');
  } finally {
    sim.dispose();
  }
});

test('malformed ledger rows drop on ensure and the board stays plain JSON', () => {
  const { sim, state } = boot();
  try {
    state.tallyho = {
      sightings: [null, 'junk', { mark: 'Real', seen: 'x' }, { mark: 5 }],
      hunts: [{ nope: 1 }, { id: 'hunt:9', quarryId: 42, bountyCr: 'bad' }, 'x'],
      rivals: [{ id: 'r' }, { id: 'rival:2', entityId: 7, gen: 'g' }],
      bounties: [null, { id: 'bty:1' }],
      log: 'nope', paid: 3, seq: 'q', marks: 'many',
    };
    const t = ensureTallyhoState(state);
    assert.equal(t.sightings.length, 1, 'malformed sightings drop');
    assert.equal(t.sightings[0].seen, 0);
    assert.equal(t.hunts.length, 1);
    assert.equal(t.hunts[0].bountyCr, 0);
    assert.equal(t.rivals.length, 1);
    assert.equal(t.bounties.length, 1);
    assert.equal(t.seq, 0);
    assert.ok(Array.isArray(t.log) && t.log.length === 0);
    JSON.parse(JSON.stringify(t)); // the whole ledger serializes
    sim.step(); // a corrupt save must not sink the tick
    assert.ok(true);
  } finally {
    sim.dispose();
  }
});

// ── The event lane: the 2 Hz calendar tick is the steady beat, and the bus
// carries the hunt clock in the gaps — spawn and kill wires pump it for burst
// responsiveness. These tests never call sim.step — only the real spawn wire
// moves sim time forward.

test('the event lane: spawn wires carry the hunt where no tick drives it', () => {
  const { sim, state, events, on } = boot();
  try {
    on('tallyho:huntPosted'); on('tallyho:huntSlipped');
    const t = ensureTallyhoState(state);
    // Hand the clock forward and spawn — the registry never ticks in this test,
    // so only the entity:spawned wire can move the hunt. This is the burst
    // lane the pump exists for: beats land between the 2 Hz calendar ticks.
    state.simTime += 1;
    const q = hostile(sim, inRing(), { name: 'Wirebird' });
    const hunt = t.hunts.find((h) => h.quarryId === q.id);
    assert.ok(hunt && hunt.state === 'open', 'the spawn wire itself posted the call');
    assert.equal(q.data.tallyhoHuntId, hunt.id, 'the tag rode the hull on the wire');
    assert.equal(events.heard['tallyho:huntPosted'].length, 1);
    // The window runs out — the next spawn beat files the slip on the honest clock.
    state.simTime += TALLYHO_HUNT.huntWindowS + 1;
    sim.spawn({
      type: 'drone', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 4, mass: 4, hull: 5, hullMax: 5, data: {},
    });
    assert.equal(hunt.state, 'slipped', 'a late beat still lands the honest verdict');
    assert.equal(events.heard['tallyho:huntSlipped'].length, 1);
    const sight = t.sightings.find((s) => s.mark === 'Wirebird');
    assert.ok(sight && sight.escaped >= 1, 'the memory filed on the wire too');
  } finally {
    sim.dispose();
  }
});

test('the event lane: beats and ticks never double-drive the same call', () => {
  const { sim, state, events, on } = boot();
  try {
    on('tallyho:huntSlipped');
    const { hunt } = callOn(sim, state); // the tick lane posted this call
    // Advance past the window, then a spawn wire AND a tick both reach the call —
    // the latch files one verdict and one wire, whichever driver got there first.
    state.simTime += TALLYHO_HUNT.huntWindowS + 1;
    sim.spawn({
      type: 'drone', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 4, mass: 4, hull: 5, hullMax: 5, data: {},
    });
    assert.equal(hunt.state, 'slipped', 'the beat already filed the verdict');
    sim.step(); // the tick sees a settled row — nothing to re-resolve
    assert.equal(events.heard['tallyho:huntSlipped'].length, 1, 'one slip, one wire');
  } finally {
    sim.dispose();
  }
});

test('the event lane: a spawn beat fields the rival gun too — not just verdicts', () => {
  const { sim, state } = boot();
  try {
    const t = ensureTallyhoState(state);
    state.simTime += 1;
    const q = hostile(sim, inRing(), { name: 'Pacer' });
    const hunt = t.hunts.find((h) => h.quarryId === q.id);
    assert.ok(hunt && hunt.state === 'open');
    // Age the call past the gun delay, then beat once — the rail fields a gun
    // on the wire, no tick anywhere.
    hunt.postedAt = state.simTime - TALLYHO_RIVAL.rivalDelayS;
    state.simTime += 1;
    sim.spawn({
      type: 'drone', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 4, mass: 4, hull: 5, hullMax: 5, data: {},
    });
    const row = t.rivals.find((r) => r.huntId === hunt.id);
    assert.ok(row && row.state === 'open', 'the gun took the field on a spawn beat');
    assert.ok(state.entities.get(row.entityId), 'the gun hull is real');
  } finally {
    sim.dispose();
  }
});

test('the double drive: pump beats inside the tick gap never double-bill contact time', () => {
  const { sim, state, bus, sys } = boot();
  try {
    const { quarry, hunt } = callOn(sim, state);
    hunt.postedAt = state.simTime - TALLYHO_RIVAL.rivalDelayS;
    sim.step();
    const t = ensureTallyhoState(state);
    const row = t.rivals.find((r) => r.huntId === hunt.id);
    const gun = state.entities.get(row.entityId);
    // Park the gun on its quarry — contact is held for the whole pass.
    gun.pos.x = quarry.pos.x + 20; gun.pos.z = quarry.pos.z;
    gun.data.holdT = 0;
    let poachAt = null;
    bus.on('tallyho:huntPoached', () => { poachAt = state.simTime; });
    // The production cadence: the calendar tick fires ~every 0.5 s of sim time
    // and is handed the elapsed span since ITS last firing — while a spawn wire
    // can pump the SAME hunt clock inside the gap. A span the pump already
    // covered must never bill a second time, or the gun poaches early.
    const start = state.simTime;
    const beat = () => sim.spawn({
      type: 'drone', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 4, mass: 4, hull: 5, hullMax: 5, data: {},
    });
    for (let i = 0; i < 40 && poachAt == null; i++) {
      state.simTime += 0.25; beat();                 // the pump beat mid-gap
      state.simTime += 0.25; sys.update(0.5, state); // the calendar tick, elapsed dt
    }
    assert.equal(hunt.state, 'poached', 'the held contact still poaches');
    assert.ok(poachAt - start >= TALLYHO_RIVAL.killS - 1e-9,
      `poach at ${poachAt - start}s — the authored hold is ${TALLYHO_RIVAL.killS}s of contact`);
  } finally {
    sim.dispose();
  }
});

test('the sheet: wants pay for hostile hulls — lawful blood claims nothing', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:bountyPosted'); on('tallyho:bountyClaimed');
    const t = ensureTallyhoState(state);
    sim.step();
    t.nextBountyAt = state.simTime;
    sim.step();
    const want = t.bounties.find((b) => b.state === 'open');
    assert.ok(want, 'a want posted');

    // A lawful hauler down in the ring rates on the board — but the posted
    // want signs for hostile hulls only.
    const neutral = sim.spawn({
      type: 'ship', team: 2, pos: inRing(), radius: 14, mass: 36,
      hull: 100, hullMax: 100, collides: true, data: { name: 'Hauler' },
    });
    neutral.alive = false;
    bus.emit('entity:killed', {
      id: neutral.id, killerId: player.id, type: 'ship',
      pos: { x: neutral.pos.x, z: neutral.pos.z },
      factionId: null, victimClass: 'ship', targetHostileToPlayer: false,
    });
    assert.equal(want.state, 'open', 'no want signs for lawful blood');

    // A wire that never carried the flag: the body answers — hostile claims.
    const q = hostile(sim, inRing(), { name: 'Freebooter' });
    q.alive = false;
    bus.emit('entity:killed', {
      id: q.id, killerId: player.id, type: 'ship',
      pos: { x: q.pos.x, z: q.pos.z }, factionId: null, victimClass: 'ship',
    });
    assert.equal(want.state, 'claimed', 'a hostile hull still claims on the body check');
    assert.equal(granted(events, `tallyho_bounty:${want.id}`).length, 1, 'paid once');
  } finally {
    sim.dispose();
  }
});

test('a corrupt quarry position goes cold — never a phantom verdict', () => {
  const { sim, state } = boot();
  try {
    const { quarry, hunt } = callOn(sim, state);
    quarry.pos.x = NaN; // the wire cannot prove where the hull stands
    sim.step();
    assert.equal(hunt.state, 'cold', 'an unverifiable position cannot hold a call');
  } finally {
    sim.dispose();
  }
});

test('hostile ledgers heal: duplicate rows collapse and cooked clocks re-arm', () => {
  const { sim, state } = boot();
  try {
    state.tallyho = {
      sightings: [], rivals: [], log: [], paid: {}, seq: 9, marks: 0,
      hunts: [
        { id: 'hunt:1', quarryId: 1, state: 'open', postedAt: 0, expiresAt: 0, mark: 'A' },
        { id: 'hunt:1', quarryId: 2, state: 'open', postedAt: 0, expiresAt: 0, mark: 'B' },
        { id: 'hunt:2', quarryId: 3, state: 'open', postedAt: 0, expiresAt: 1e6, fleeAt: 1e6,
          bet: 1e9, mark: 'C' },
      ],
      bounties: [
        { id: 'bty:1', state: 'open', bountyCr: 10, postedAt: 0, expiresAt: 0 },
        { id: 'bty:1', state: 'open', bountyCr: 20, postedAt: 0, expiresAt: 0 },
      ],
      nextBountyAt: state.simTime + 1e9, // a cooked horizon would starve the sheet
    };
    const t = ensureTallyhoState(state);
    assert.equal(t.hunts.length, 2, 'duplicate hunt ids collapse, honest rows stay');
    assert.equal(t.bounties.length, 1, 'duplicate want ids collapse');
    const cooked = t.hunts.find((h) => h.id === 'hunt:2');
    assert.equal(cooked.expiresAt, TALLYHO_HUNT.huntWindowS, 'the window clamps to authored');
    assert.equal(cooked.fleeAt, TALLYHO_HUNT.fleeAfterS, 'the bolt clock clamps to authored');
    assert.equal(cooked.bet, TALLYHO_BET.stakeCr, 'a cooked marker clamps to the authored stake');
    sim.step();
    assert.ok(t.nextBountyAt - state.simTime
      <= TALLYHO_BOUNTY.bountyPeriodS + TALLYHO_BOUNTY.bountyJitterS + 1,
      'the cooked sheet horizon re-arms on the authored clock');
  } finally {
    sim.dispose();
  }
});

// ── Second-pass hardening: the verdict, the drive, and the litter ────────────

test('a recycled killer id cannot poach — the verdict binds the occupant, not the number', () => {
  const { sim, state, bus, events, on } = boot();
  try {
    on('tallyho:huntPoached'); on('tallyho:huntCold');
    const { quarry, hunt } = callOn(sim, state);
    hunt.postedAt = state.simTime - TALLYHO_RIVAL.rivalDelayS;
    sim.step();
    const t = ensureTallyhoState(state);
    const row = t.rivals.find((r) => r.huntId === hunt.id);
    const gun = state.entities.get(row.entityId);
    // Control: the live gun's own kill wire collects for the rail.
    quarry.alive = false;
    killBy(bus, quarry, gun.id);
    assert.equal(hunt.state, 'poached');
    assert.equal(row.state, 'done');
    assert.equal(events.heard['tallyho:huntPoached'].length, 1);

    // Round two: a fresh call fields a second gun; its number is then silently
    // swept and re-issued — the row is still open until the next census — and
    // the NEW occupant of that id lands the kill. That is not the licensed gun.
    const { quarry: q2, hunt: h2 } = callOn(sim, state, inRing(), { name: 'Secondmark' });
    h2.postedAt = state.simTime - TALLYHO_RIVAL.rivalDelayS;
    sim.step();
    const row2 = t.rivals.find((r) => r.huntId === h2.id && r.state === 'open');
    const gun2 = state.entities.get(row2.entityId);
    gun2.occupantGeneration += 1000; // the id reports a different occupant now
    q2.alive = false;
    killBy(bus, q2, gun2.id);
    assert.equal(h2.state, 'cold', 'a recycled id does not collect for the rail');
    assert.equal(events.heard['tallyho:huntPoached'].length, 1,
      'no phantom poach on a number the gun no longer occupies');
    assert.ok(events.heard['tallyho:huntCold'].some((e) => e.huntId === h2.id));
  } finally {
    sim.dispose();
  }
});

test('two beats inside one sim tick queue one velocity correction, not two', () => {
  const { sim, state, sys } = boot();
  try {
    const { hunt } = callOn(sim, state);
    hunt.postedAt = state.simTime - TALLYHO_RIVAL.rivalDelayS;
    sim.step();
    const t = ensureTallyhoState(state);
    const row = t.rivals.find((r) => r.huntId === hunt.id);
    const gun = state.entities.get(row.entityId);
    consumePhysicsCommand(gun); // drain the fielding burst
    // A fresh sim tick with no physics drain between the two beats: the spawn
    // wire pumps the same hunt clock the calendar tick then re-drives — the
    // second correction would read the same pre-solve velocity and apply twice.
    state.tick += 1;
    state.simTime += TALLYHO_HUNT.pumpMinS + 0.05;
    sys._pump();                 // the event beat drives the chase
    sys.update(0.5, state);      // the calendar beat lands inside the same sim tick
    const cmd = consumePhysicsCommand(gun);
    assert.ok(cmd && cmd.impulses.length <= 1,
      `a second beat in one physics step must not re-apply the correction — got ${cmd && cmd.impulses.length}`);
  } finally {
    sim.dispose();
  }
});

test('a replayed kill wire cannot double-rate: score, rail cadence, and the sheet all once', () => {
  const { sim, state, bus, player, events, on } = boot();
  try {
    on('tallyho:bountyPosted'); on('tallyho:bountyClaimed');
    const t = ensureTallyhoState(state);
    // Two open wants on the sheet — the second is the trap a replayed wire springs.
    sim.step();
    for (let i = 0; i < 8 && t.bounties.filter((b) => b.state === 'open').length < 2; i++) {
      t.nextBountyAt = state.simTime;
      sim.step();
    }
    const open = t.bounties.filter((b) => b.state === 'open');
    assert.ok(open.length >= 2, 'two wants stand on the sheet');

    const q = hostile(sim, inRing(), { name: 'Wirewolff' });
    const score0 = Number(state.story.flags[TALLYHO.scoreFlag]) || 0;
    const rated0 = Number(state.story.flags[TALLYHO.ratedFlag]) || 0;
    q.alive = false;
    killBy(bus, q, player.id);
    killBy(bus, q, player.id); // the replay: one body, one verdict
    killBy(bus, q, player.id);
    assert.equal((Number(state.story.flags[TALLYHO.ratedFlag]) || 0) - rated0, 1,
      'the rating files once');
    assert.equal((Number(state.story.flags[TALLYHO.scoreFlag]) || 0) - score0, 1,
      'a single in-ring kill scores once — the replay must not re-score');
    assert.equal(open.filter((b) => b.state === 'claimed').length, 1,
      'a replayed wire cannot collect a second standing want');
    assert.equal(events.heard['tallyho:bountyClaimed'].length, 1);
    const sight = t.sightings.find((s) => s.mark === 'Wirewolff');
    assert.equal(sight.killed, 1, 'the memory stays single-counted');
    // The cadence that seats the rail moved one notch, not three — three replays
    // would have parked a spectator nobody earned.
    assert.equal(
      state.entityList.filter((e) => e.data?.tallyhoSpectator === true).length, 0);
    // And a different body still rates — the guard binds the occupant, not the wire.
    const q2 = hostile(sim, inRing(), { name: 'Secondmark' });
    q2.alive = false;
    killBy(bus, q2, player.id);
    assert.equal((Number(state.story.flags[TALLYHO.ratedFlag]) || 0) - rated0, 2,
      'the next body still rates');
  } finally {
    sim.dispose();
  }
});

test('a rival hull whose row is gone is rail litter — it deships, not parks', () => {
  const { sim, state } = boot();
  try {
    const t = ensureTallyhoState(state);
    // A closed row keeps the sweep armed; the orphan's tag names no live row.
    t.rivals.push({ id: 'rival:0', huntId: null, entityId: -1, gen: null,
      postedAt: 0, state: 'gone' });
    const orphan = sim.spawn({
      type: 'ship', team: 2, pos: inRing(), radius: 13, mass: 30,
      hull: TALLYHO_RIVAL.rivalHull, hullMax: TALLYHO_RIVAL.rivalHull,
      data: {
        tallyhoRival: true, tallyhoRivalId: 'rival:ghost',
        ai: { passive: true }, callsign: 'RAIL GUN 9',
      },
    });
    sim.step();
    assert.equal(orphan.alive, false, 'a rowless gun deships instead of parking forever');
  } finally {
    sim.dispose();
  }
});

// ── Pure steering ────────────────────────────────────────────────────────────

test('pure steering: toward and away give unit-scaled velocities', () => {
  const v = tallyhoSteer({ x: 0, z: 0 }, { x: 30, z: 40 }, 50);
  assert.ok(Math.abs(Math.hypot(v.x, v.z) - 50) < 1e-6);
  assert.ok(v.x > 0 && v.z > 0);
  const a = tallyhoSteerAway({ x: 30, z: 40 }, { x: 0, z: 0 }, 60);
  assert.ok(Math.abs(Math.hypot(a.x, a.z) - 60) < 1e-6);
  assert.ok(a.x > 0 && a.z > 0, 'away from the post points out');
  const flat = tallyhoSteer({ x: 1, z: 1 }, { x: 1, z: 1 }, 20);
  assert.equal(Math.hypot(flat.x, flat.z), 0, 'a zero-range steer is zero, not NaN');
});
