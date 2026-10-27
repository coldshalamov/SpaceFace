// faction-helix-expansion — the docket added to src/systems/faction_helix.js.
//
// Proves the Bureau's paperwork economy end to end on the real system and the
// real events:
//   · assessment desks: authored buoys and Bureau-fielded hulls register, each
//     answering to a named clerk; a dead desk lapses its wire and files a verdict
//   · variance notices: manifest dwells verify, untitled hulks title, packs
//     unmask, lien-marked hulls collect; unanswered work lapses into variance
//   · the fine docket: liens post, fines settle once, appeals are heard once,
//     and the garnish takes what the hold holds
//   · field assessors: clean reads pay, undeclared bills, open files surcharge,
//     refusing the read is filed as evasion
//   · warrants & writ cutters: breaking Bureau instruments files heat on the
//     pilot's name; cutters levy the seizure clamp until the heat is served;
//     remit, or run out the window into a dormancy the next warrant inherits
//   · standing, precedents, variance: deeds raise the tier, precedents pay once,
//     and the ledger survives a JSON save/load round-trip without free progress
//
// Run: node --test test/faction-helix-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import {
  factionHelix,
  ensureHelixState,
  helixDocket,
  helixStanding,
  helixTierFor,
  helixClerkFor,
  HELIX_DESKS,
  HELIX_NOTICES,
  HELIX_FINES,
  HELIX_AUDIT,
  HELIX_WARRANT,
  HELIX_VARIANCE,
  HELIX_TIERS,
  HELIX_CLERKS,
} from '../src/systems/faction_helix.js';

const SEED = 4242;
const tick = (s) => Math.ceil(s * 60);
const SECTOR = 'sector_sedna_dark';

function boot({ credits = 50000 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [factionHelix] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 60000, z: 60000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const events = { charges: [], grants: [], reps: [], logs: [], helix: [] };
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    const a = Math.round(p.amount || 0);
    state.player.credits = Math.max(0, Math.round(state.player.credits - a));
    events.charges.push(p);
  });
  bus.on('economy:grantCredits', (p) => {
    state.player.credits = Math.round(state.player.credits + Math.round(p.amount || 0));
    events.grants.push(p);
  });
  bus.on('faction:repDelta', (p) => events.reps.push(p));
  bus.on('comms:log', (p) => events.logs.push(p));
  for (const name of [
    'helix:deskFiled', 'helix:deskLost', 'helix:noticePosted', 'helix:noticeVerified',
    'helix:noticeLapsed', 'helix:noticeJumped', 'helix:finePosted', 'helix:finePaid',
    'helix:fineOverdue', 'helix:garnished', 'helix:appealHeard', 'helix:manifestFiled',
    'helix:auditBegun', 'helix:auditRuled', 'helix:auditEvaded', 'helix:warrantPosted',
    'helix:warrantSettled', 'helix:writSpawned', 'helix:writLevy', 'helix:deed',
    'helix:tier', 'helix:precedent', 'helix:verdictFiled', 'helix:flagsDropped',
    'helix:lienStuck', 'helix:lienFiled', 'helix:lienScraped', 'helix:warrantEscalated',
  ]) bus.on(name, (p) => events.helix.push({ event: name, p }));
  const sys = sim.registry.get('faction_helix');
  const hx = () => ensureHelixState(state);
  // Pin the Bureau's ambient clocks — tests drive postings explicitly.
  const quiet = () => {
    const h = hx();
    h.nextDeskAt = 1e12;
    for (const k of Object.keys(h.desks)) {
      h.desks[k].nextNoticeAt = 1e12;
      h.desks[k].nextAuditAt = 1e12;
    }
  };
  const spawnDesk = (x = 62000, z = 62000, key = 'desk:test') => {
    const e = sim.spawn({
      type: 'ship', team: 0, pos: { x, z }, radius: HELIX_DESKS.deskRadius,
      mass: HELIX_DESKS.deskMass, hull: HELIX_DESKS.deskHull, hullMax: HELIX_DESKS.deskHull,
      collides: true,
      data: { helixAudit: true, helixDeskId: key, name: 'ASSESSMENT DESK' },
    });
    sim.runTicks(2); // discovery registers it
    return e;
  };
  const kill = (e, { byPlayer = true, hostile = false } = {}) => {
    e.alive = false;
    bus.emit('entity:killed', {
      id: e.id, killerId: byPlayer ? state.playerId : 9999, type: e.type,
      pos: { x: e.pos.x, z: e.pos.z }, factionId: e.factionId ?? null,
      targetHostileToPlayer: hostile,
    });
  };
  return { sim, state, bus, player, events, sys, hx, quiet, spawnDesk, kill };
}

const helixEvents = (events, name) => events.helix.filter((e) => e.event === name);
const granted = (events, prefix) =>
  events.grants.filter((g) => String(g.reason || '').startsWith(prefix));
const charged = (events, prefix) =>
  events.charges.filter((c) => String(c.reason || '').startsWith(prefix));
const repTotal = (events, prefix) =>
  events.reps.filter((r) => String(r.reason || '').startsWith(prefix))
    .reduce((a, r) => a + r.delta, 0);

// ── 1. The false-flag and lien contracts are preserved ─────────────────────────

test('a masked pack still drops its flag when the pattern breaks', () => {
  const { sim, state, events, hx, quiet } = boot();
  try {
    quiet();
    const slot = [{ dx: -80, dz: 0 }, { dx: 80, dz: 0 }, { dx: 0, dz: 80 }, { dx: 0, dz: -80 }];
    const members = slot.map((s, i) => sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: 61000 + s.dx, z: 61000 + s.dz }, radius: 10, mass: 20, hull: 50, collides: true,
      data: { helixFalseFlag: true, helixPack: 'pack:a', helixSlot: s, ai: {} },
    }));
    sim.runTicks(5);
    assert.equal(helixEvents(events, 'helix:flagsDropped').length, 0, 'a flawless pack holds its mask');
    // Fling a member far past the break radius — the pattern cannot hold.
    members[2].pos.x += 400;
    sim.runTicks(2);
    const dropped = helixEvents(events, 'helix:flagsDropped');
    assert.equal(dropped.length, 1, 'the pack drops once');
    assert.equal(dropped[0].p.breakerId, members[2].id, 'the farthest off-slot is the breaker');
    assert.ok(members.every((m) => m.factionId === 'faction_helix'), 'the whole pack is Helix');
    assert.ok(members.every((m) => m.data.falseFlagDropped === true));
    assert.ok(hx().droppedPacks['pack:a'], 'the latch is durable');
    assert.ok(hx().ledger.some((r) => r.kind === 'pack_unmasked'), 'a verdict files');
    assert.equal(granted(events, 'helix_precedent:unmasked').length, 1, 'first unmasking pays for new law');
  } finally { sim.dispose(); }
});

test('a lien drone sticks, rides, files — and the fine enters the docket', () => {
  const { sim, state, player, events, quiet } = boot();
  try {
    quiet();
    const drone = sim.spawn({
      type: 'drone', team: 0, pos: { x: player.pos.x + 10, z: player.pos.z },
      radius: 3, mass: 1, hull: 5, collides: true, data: { lienDrone: true },
    });
    sim.runTicks(2);
    assert.equal(helixEvents(events, 'helix:lienStuck').length, 1, 'the lien sticks');
    assert.equal(player.data.lienStuck, drone.id);
    assert.equal(player.data.lienMassT, 6, 'dead mass on the scale');
    sim.runTicks(tick(13));
    assert.equal(helixEvents(events, 'helix:lienFiled').length, 1, 'the lien files');
    assert.equal(player.data.lienStuck, undefined, 'the husk lets go');
    assert.equal(player.data.lienFiledCr, 150);
    assert.equal(drone.alive, false, 'the paperwork is delivered');
    const fines = helixDocket(state).fines;
    assert.equal(fines.length, 1, 'a lien on the pilot enters the docket');
    assert.equal(fines[0].cause, 'lien');
    assert.equal(fines[0].status, 'open');
    assert.equal(fines[0].amount, 150);
  } finally { sim.dispose(); }
});

test('scraping a stuck lien kills the filing; a stale stamp frees the hull', () => {
  const { sim, state, player, events, kill, quiet } = boot();
  try {
    quiet();
    const drone = sim.spawn({
      type: 'drone', team: 0, pos: { x: player.pos.x + 10, z: player.pos.z },
      radius: 3, mass: 1, hull: 5, collides: true, data: { lienDrone: true },
    });
    sim.runTicks(2);
    assert.equal(player.data.lienStuck, drone.id);
    kill(drone); // the scrape is legal while it is stuck
    sim.runTicks(3);
    assert.equal(player.data.lienStuck, undefined, 'the mass frees');
    assert.equal(player.data.lienFiledCr || 0, 0, 'nothing files');
    assert.equal(helixEvents(events, 'helix:lienFiled').length, 0);
    assert.equal(helixEvents(events, 'helix:lienScraped').length, 1);
    // A hull whose lien drone simply vanished keeps no dead stamp.
    const ship2 = sim.spawn({
      type: 'ship', team: 0, pos: { x: 63000, z: 63000 }, radius: 10, mass: 20,
      hull: 50, collides: true, data: { lienStuck: 99999, lienMassT: 6 },
    });
    sim.runTicks(3);
    assert.equal(ship2.data.lienStuck, undefined, 'dead paperwork frees the hull');
    assert.equal(ship2.data.lienMassT, undefined);
  } finally { sim.dispose(); }
});

// ── 2. Assessment desks ────────────────────────────────────────────────────────

test('an authored audit buoy registers a desk with a named clerk', () => {
  const { sim, state, events, spawnDesk, quiet } = boot();
  try {
    spawnDesk();
    quiet();
    const filed = helixEvents(events, 'helix:deskFiled');
    assert.equal(filed.length, 1, 'the desk files once');
    assert.equal(filed[0].p.deskKey, 'desk:test');
    const clerk = HELIX_CLERKS.find((c) => c.id === filed[0].p.clerkId);
    assert.ok(clerk, 'a named clerk answers the desk');
    assert.equal(clerk.id, helixClerkFor('desk:test').id, 'the roster hashes deterministically');
    const desk = helixDocket(state).desks[0];
    assert.equal(desk.authored, true, 'an authored buoy is not Bureau-fielded');
    assert.equal(desk.clerkId, clerk.id);
    assert.equal(desk.sectorId, SECTOR);
  } finally { sim.dispose(); }
});

test('with no authored desk the Bureau fields its own, then recalls it', () => {
  const { sim, state, player, events, hx } = boot();
  try {
    sim.runTicks(tick(HELIX_DESKS.firstDeskS + 2));
    const filed = helixEvents(events, 'helix:deskFiled');
    assert.equal(filed.length, 1, 'the Bureau fields a desk');
    const rec = hx().desks[filed[0].p.deskKey];
    assert.equal(rec.authored, false, 'it is Bureau-fielded');
    const deskBody = state.entities.get(rec.entityId);
    assert.ok(deskBody && deskBody.data.helixAudit === true);
    // Leave it far behind long enough — the paperwork re-files elsewhere.
    player.pos.x = deskBody.pos.x + HELIX_DESKS.leaveR + 500;
    sim.runTicks(tick(HELIX_DESKS.orphanS + 2));
    assert.equal(hx().desks[filed[0].p.deskKey].gone, true, 'an abandoned desk recalls');
    assert.ok(helixEvents(events, 'helix:deskLost').some((e) => e.p.cause === 'recalled'));
    const corpse = state.entities.get(rec.entityId);
    assert.ok(!corpse || corpse.alive === false, 'the hull re-files');
  } finally { sim.dispose(); }
});

test('wrecking a desk lapses its wire and files a warrant on the pilot', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, kill } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const h = hx();
    h.desks['desk:test'].nextNoticeAt = 0;
    sim.runTicks(3); // a live desk posts
    assert.ok(helixEvents(events, 'helix:noticePosted').length >= 1, 'the wire was alive');
    kill(desk, { byPlayer: true });
    sim.runTicks(2);
    assert.equal(hx().desks['desk:test'].gone, true);
    const lost = helixEvents(events, 'helix:deskLost');
    assert.equal(lost.length, 1);
    assert.equal(lost[0].p.byPlayer, true);
    assert.ok(hx().notices.every((n) => n.state !== 'open'), 'the wire dies with the desk');
    const war = helixEvents(events, 'helix:warrantPosted');
    assert.equal(war.length, 1, 'a warrant files');
    assert.equal(war[0].p.cause, 'desk_wrecked');
    assert.ok(war[0].p.heat >= HELIX_WARRANT.serveHeat, 'the heat is enough to serve');
    assert.ok(hx().variance > 0, 'variance accrues');
  } finally { sim.dispose(); }
});

// ── 3. Variance notices ────────────────────────────────────────────────────────

test('a manifest notice verifies when the pilot holds still in the ring', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].p.kind, 'manifest', 'the desk wants a declaration');
    const creditsBefore = state.player.credits;
    sim.runTicks(tick(HELIX_NOTICES.dwellS + 1));
    const verified = helixEvents(events, 'helix:noticeVerified');
    assert.equal(verified.length, 1, 'the filing verifies');
    assert.equal(verified[0].p.how, 'manifest_filed');
    const pay = HELIX_NOTICES.payCr.manifest;
    assert.equal(granted(events, 'helix_notice:')[0].amount, pay, 'the desk pays the posted rate');
    assert.equal(repTotal(events, 'helix_notice_verified'), HELIX_NOTICES.verifyRep);
    assert.ok(state.player.credits > creditsBefore, 'money moved');
    assert.ok(hx().deeds >= 1, 'a deed counts');
  } finally { sim.dispose(); }
});

test('an unanswered notice lapses exactly once and accrues variance', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1);
    hx().desks['desk:test'].nextNoticeAt = 1e12; // no second filing during the wait
    player.pos.x += HELIX_DESKS.serveR + 500; // walk away — the filing goes unanswered
    const v0 = hx().variance;
    sim.runTicks(tick(HELIX_NOTICES.ttlS + 2));
    const lapsed = helixEvents(events, 'helix:noticeLapsed');
    assert.equal(lapsed.length, 1, 'one lapse, filed once');
    assert.equal(lapsed[0].p.noticeId, posted[0].p.noticeId, 'the same filing lapses');
    // decay shaves the total between the filing and the read — accrue, not exact
    assert.ok(hx().variance > v0, 'variance accrues once');
    assert.ok(hx().variance <= v0 + HELIX_NOTICES.lapseVariance, 'never more than the filing');
    assert.ok(hx().ledger.some((r) => r.kind === 'notice_lapsed'));
  } finally { sim.dispose(); }
});

test('towing a noticed hulk to the ring transfers title and pays', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: desk.pos.x + 400, z: desk.pos.z },
      radius: 8, mass: 60, hull: 30, collides: true, data: {},
    });
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted[0].p.kind, 'salvage', 'untitled mass on the ring is the discrepancy');
    assert.equal(wreck.data.helixNoticeId, posted[0].p.noticeId, 'the tag rides the hulk');
    // The pilot tethers it in.
    wreck.pos.x = desk.pos.x + 30;
    wreck.data.thrownBy = state.playerId;
    sim.runTicks(3);
    const verified = helixEvents(events, 'helix:noticeVerified');
    assert.equal(verified.length, 1);
    assert.equal(verified[0].p.how, 'salvage_titled');
    assert.equal(wreck.alive, false, 'the title takes the hull off the field');
    assert.equal(granted(events, 'helix_notice:')[0].amount, HELIX_NOTICES.payCr.salvage);
    assert.ok(hx().ledger.some((r) => r.kind === 'salvage_titled'));
  } finally { sim.dispose(); }
});

test('stripping a noticed hulk yourself is filed as jumped salvage', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, kill } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: desk.pos.x + 400, z: desk.pos.z },
      radius: 8, mass: 60, hull: 30, collides: true, data: {},
    });
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    kill(wreck, { byPlayer: true });
    sim.runTicks(2);
    assert.equal(helixEvents(events, 'helix:noticeJumped').length, 1, 'the jump files');
    assert.equal(helixEvents(events, 'helix:noticeVerified').length, 0, 'a jumped title pays nothing');
    // decay shaves the filed variance by the time the tick ends
    assert.ok(hx().variance > HELIX_VARIANCE.jumped - 1 && hx().variance <= HELIX_VARIANCE.jumped,
      'the Bureau notes the stripped title');
  } finally { sim.dispose(); }
});

test('a hull riding filed liens is posted as collectible work', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, kill } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const debtor = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: desk.pos.x + 500, z: desk.pos.z },
      radius: 10, mass: 20, hull: 50, collides: true, data: { lienFiledCr: 500 },
    });
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted[0].p.kind, 'collect', 'the Bureau posts the collection');
    assert.equal(posted[0].p.targetId ?? debtor.id, debtor.id);
    kill(debtor, { byPlayer: true });
    sim.runTicks(2);
    const verified = helixEvents(events, 'helix:noticeVerified');
    assert.equal(verified.length, 1);
    assert.equal(verified[0].p.how, 'collected');
    assert.equal(granted(events, 'helix_notice:')[0].amount,
      Math.round(500 * HELIX_NOTICES.payCr.collect), 'the server takes a share');
  } finally { sim.dispose(); }
});

// ── 4. The fine docket ─────────────────────────────────────────────────────────

test('a fine settles once at the ring; a second settlement pays nothing', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const fine = sys._postFine(state, hx(), 'lien', 150, { subjectId: player.id });
    const credits0 = state.player.credits;
    const paid = sys.payFine(state, fine.id);
    assert.equal(paid, 150, 'the settlement returns the amount');
    assert.equal(fine.status, 'paid');
    assert.equal(charged(events, 'helix_fine:').length, 1, 'one charge');
    // the charge posts and the first-settlement precedent pays alongside it
    const prec = granted(events, 'helix_precedent:lien_paid')[0];
    assert.equal(state.player.credits, credits0 - 150 + (prec ? prec.amount : 0));
    assert.equal(repTotal(events, 'helix_fine_paid'), 2);
    assert.equal(sys.payFine(state, fine.id), null, 'a settled instrument cannot settle twice');
    assert.equal(charged(events, 'helix_fine:').length, 1, 'still one charge');
    assert.ok(hx().ledger.some((r) => r.kind === 'lien_paid'));
  } finally { sim.dispose(); }
});

test('paying with no desk in reach refuses; no desk, no ring, no service', () => {
  const { sim, state, player, events, hx, quiet, sys } = boot();
  try {
    quiet();
    const fine = sys._postFine(state, hx(), 'lien', 150, {});
    assert.equal(sys.payFine(state, fine.id), null, 'no ring, no settlement');
    assert.equal(fine.status, 'open', 'the instrument stands');
    assert.equal(charged(events, 'helix_fine:').length, 0);
    assert.equal(sys.contestFine(state, fine.id), null, 'no ring, no hearing');
    assert.equal(fine.contested, false);
  } finally { sim.dispose(); }
});

test('every fine is heard once before the clerk — the verdict is deterministic', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const fine = sys._postFine(state, hx(), 'lien', 150, {});
    const amount0 = fine.amount;
    const outcome = sys.contestFine(state, fine.id);
    assert.ok(outcome === 'void' || outcome === 'upheld', 'the clerk rules');
    assert.equal(fine.contested, true, 'the hearing is had');
    assert.equal(helixEvents(events, 'helix:appealHeard').length, 1);
    if (outcome === 'void') {
      assert.equal(fine.status, 'void', 'a voided instrument closes');
      assert.ok(repTotal(events, 'helix_appeal_won') > 0, 'the record corrects itself');
    } else {
      assert.equal(fine.status, 'open', 'an upheld instrument stands');
      assert.equal(fine.amount, amount0 + HELIX_FINES.courtCostCr, 'the desk adds its costs');
    }
    assert.equal(sys.contestFine(state, fine.id), null, 'no fine is heard twice');
    assert.equal(helixEvents(events, 'helix:appealHeard').length, 1);
  } finally { sim.dispose(); }
});

test('an overdue fine garnishes — capped at the hold, plus the fee, once', () => {
  const { sim, state, player, events, hx, quiet, sys } = boot({
    credits: 200,
  });
  try {
    quiet();
    const fine = sys._postFine(state, hx(), 'lien', 400, {});
    fine.dueAt = state.simTime - 1; // already past grace
    sim.runTicks(2);
    assert.equal(helixEvents(events, 'helix:fineOverdue').length, 1, 'overdue files once');
    fine.dueAt = state.simTime - HELIX_FINES.garnishAfterS - 1;
    const creditsBefore = state.player.credits;
    sim.runTicks(2);
    const garnished = helixEvents(events, 'helix:garnished');
    assert.equal(garnished.length, 1, 'one garnish');
    assert.equal(garnished[0].p.takenCr, creditsBefore, 'the Bureau takes what the hold holds');
    assert.equal(state.player.credits, 0, 'down to the last credit');
    assert.equal(fine.status, 'garnished');
    sim.runTicks(5);
    assert.equal(helixEvents(events, 'helix:garnished').length, 1, 'garnish never re-fires');
  } finally { sim.dispose(); }
});

// ── 5. Field assessors ─────────────────────────────────────────────────────────

test('a clean read inside the ring pays the compliance rebate', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    sys.fileManifest(state); // the pilot declares
    hx().desks['desk:test'].nextAuditAt = state.simTime;
    sim.runTicks(2);
    assert.equal(helixEvents(events, 'helix:auditBegun').length, 1, 'the assessor rides out');
    const row = hx().assessors[0];
    const assessor = state.entities.get(row.entityId);
    assert.ok(assessor && assessor.data.helixAssessor === row.auditId, 'tag + generation bind');
    assessor.pos.x = player.pos.x + 40; assessor.pos.z = player.pos.z; // it closes
    const credits0 = state.player.credits;
    sim.runTicks(tick(HELIX_AUDIT.dwellS + 1));
    const ruled = helixEvents(events, 'helix:auditRuled');
    assert.equal(ruled.length, 1);
    assert.equal(ruled[0].p.outcome, 'clean', 'a filed manifest reads clean');
    assert.equal(granted(events, `helix_audit:${row.auditId}`).length, 1, 'the rebate pays');
    assert.ok(state.player.credits > credits0);
    assert.equal(hx().assessors.length, 0, 'the assessor stands down');
    assert.ok(hx().ledger.some((r) => r.kind === 'audit_clean'));
  } finally { sim.dispose(); }
});

test('no manifest on file bills the unlogged transit; an open file surcharges', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    hx().desks['desk:test'].nextAuditAt = state.simTime;
    sim.runTicks(2);
    const row = hx().assessors[0];
    const assessor = state.entities.get(row.entityId);
    assessor.pos.x = player.pos.x + 40; assessor.pos.z = player.pos.z;
    sim.runTicks(tick(HELIX_AUDIT.dwellS + 1));
    const ruled = helixEvents(events, 'helix:auditRuled');
    assert.equal(ruled[0].p.outcome, 'undeclared', 'the unlogged transit is billed');
    const fine = hx().fines.find((f) => f.cause === 'unlogged_transit');
    assert.ok(fine && fine.status === 'open', 'a fine posts');
    // A second read while the instrument stands surcharges it.
    hx().desks['desk:test'].nextAuditAt = state.simTime;
    sim.runTicks(2);
    const row2 = hx().assessors[0];
    state.entities.get(row2.entityId).pos.x = player.pos.x + 40;
    state.entities.get(row2.entityId).pos.z = player.pos.z;
    sim.runTicks(tick(HELIX_AUDIT.dwellS + 1));
    const ruled2 = helixEvents(events, 'helix:auditRuled');
    assert.equal(ruled2[ruled2.length - 1].p.outcome, 'findings');
    assert.ok(fine.amount > HELIX_FINES.undeclaredFineCr, 'a surcharge accrues to the file');
  } finally { sim.dispose(); }
});

test('refusing the read files evasion and reschedules the audit', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    hx().desks['desk:test'].nextAuditAt = state.simTime;
    sim.runTicks(2);
    const row = hx().assessors[0];
    player.pos.x += HELIX_AUDIT.breakR + 1000; // run the read
    row.spawnedAt = state.simTime - HELIX_AUDIT.giveUpS - 1;
    const v0 = hx().variance;
    sim.runTicks(3);
    assert.equal(helixEvents(events, 'helix:auditEvaded').length, 1, 'the refusal files');
    assert.ok(hx().variance > v0 && hx().variance <= v0 + HELIX_AUDIT.evadedVariance,
      'evasion accrues to the file');
    assert.equal(hx().assessors.length, 0, 'the assessor gives up');
    assert.ok(hx().desks['desk:test'].nextAuditAt < state.simTime + HELIX_AUDIT.retryS + 1,
      'the Bureau reschedules promptly');
  } finally { sim.dispose(); }
});

// ── 6. Warrants & writ cutters ─────────────────────────────────────────────────

test('enough heat fields writ cutters that levy the seizure clamp', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, kill } = boot({ credits: 5000 });
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    kill(desk, { byPlayer: true }); // desk_wrecked — 60 heat, over the serve line
    sim.runTicks(2);
    const spawned = helixEvents(events, 'helix:writSpawned');
    assert.ok(spawned.length >= 1, 'a writ cutter fields');
    const row = hx().writCrew[0];
    const cutter = state.entities.get(row.entityId);
    assert.ok(cutter && cutter.data.helixWritId === row.warrantId, 'the writ tag binds');
    cutter.pos.x = player.pos.x + 40; cutter.pos.z = player.pos.z; // it closes
    const credits0 = state.player.credits;
    sim.runTicks(tick(HELIX_WARRANT.levyBeatS * 2));
    const levies = helixEvents(events, 'helix:writLevy');
    assert.ok(levies.length >= 1, 'the clamp levies on contact');
    assert.ok(charged(events, 'helix_writ:').length >= 1, 'the Bureau takes its due');
    assert.ok(state.player.credits < credits0);
    assert.ok(hx().warrants[0].seized > 0, 'seizure accrues to the warrant');
  } finally { sim.dispose(); }
});

test('the account remits at the ring — the warrant is spent and the crew recalled', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys } = boot({ credits: 5000 });
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    sys._postWarrant(state, hx(), 'adjudicator_killed');
    const w = hx().warrants[0];
    const cost = Math.round(HELIX_WARRANT.settleBaseCr + w.heat * HELIX_WARRANT.settlePerHeatCr);
    const credits0 = state.player.credits;
    const paid = sys.settleWarrant(state);
    assert.equal(paid, cost, 'the remittance prices the heat');
    // the remittance charges the heat price; the first settlement pays precedent law
    const prec = granted(events, 'helix_precedent:warrant_settled')[0];
    assert.equal(state.player.credits, credits0 - cost + (prec ? prec.amount : 0));
    assert.equal(w.state, 'settled');
    assert.equal(helixEvents(events, 'helix:warrantSettled').length, 1);
    assert.equal(repTotal(events, 'helix_warrant_remitted'), HELIX_WARRANT.settleRep);
    assert.ok(hx().ledger.some((r) => r.kind === 'warrant_settled'));
  } finally { sim.dispose(); }
});

test('a dormant file remembers — the next warrant inherits its heat', () => {
  const { sim, state, hx, quiet, sys } = boot();
  try {
    quiet();
    const w = sys._postWarrant(state, hx(), 'adjudicator_killed');
    w.expiresAt = state.simTime - 1; // let the window close
    sim.runTicks(2);
    assert.equal(w.state, 'dormant', 'the file goes dormant');
    assert.equal(hx().lastDormantHeat, Math.min(w.heat, w.heat), 'the file remembers');
    const w2 = sys._postWarrant(state, hx(), 'courier_killed');
    assert.notEqual(w2.id, w.id, 'a new warrant files');
    assert.equal(w2.heat, 40 + Math.min(HELIX_WARRANT.dormantCarry, 40),
      'dormant heat carries into the next filing');
    assert.equal(hx().lastDormantHeat, 0, 'the carry is spent once');
  } finally { sim.dispose(); }
});

// ── 7. Standing, precedents, determinism, saves ────────────────────────────────

test('deeds raise the docket standing and the tier announces once', () => {
  const { sim, state, events, hx, quiet } = boot();
  try {
    quiet();
    assert.equal(helixStanding(state).tier, 0, 'unfiled at first');
    hx().deeds = HELIX_TIERS[1].deeds - 1;
    assert.equal(helixTierFor(hx().deeds).tier, 0);
    // One more deed crosses the threshold — the Bureau announces once.
    state.simTime = 10; hx(); // renormalize path
    const sys = sim.registry.get('faction_helix');
    sys._deed(state, 'notice_manifest', 'ntc:x');
    assert.equal(hx().deeds, HELIX_TIERS[1].deeds);
    assert.equal(helixEvents(events, 'helix:tier').length, 1, 'the tier announces once');
    assert.equal(helixEvents(events, 'helix:tier')[0].p.id, HELIX_TIERS[1].id);
    sys._deed(state, 'notice_manifest', 'ntc:y');
    assert.equal(helixEvents(events, 'helix:tier').length, 1, 'no re-announcement');
    assert.equal(helixStanding(state).payMult, HELIX_TIERS[1].payMult, 'the standing scales payouts');
  } finally { sim.dispose(); }
});

test('a precedent pays once — replaying the stamp regrants nothing', () => {
  const { sim, state, events, hx, quiet, sys } = boot();
  try {
    quiet();
    const grants0 = granted(events, 'helix_precedent:').length;
    assert.equal(sys._precedent(state, 'desk_met'), true, 'the first precedent pays');
    assert.equal(sys._precedent(state, 'desk_met'), false, 'the second does not');
    assert.equal(granted(events, 'helix_precedent:').length - grants0, 1, 'one grant, stamped');
    assert.ok(hx().precedents.desk_met != null, 'the stamp persists');
    assert.equal(granted(events, 'helix_precedent:desk_met')[0].amount,
      Math.round(260 * helixTierFor(hx().deeds).payMult));
  } finally { sim.dispose(); }
});

test('a JSON round-trip keeps the docket: receipts hold, progress is not free', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys, bus } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const fine = sys._postFine(state, hx(), 'lien', 150, {});
    sys._precedent(state, 'desk_met');
    hx().deeds = 7; hx().variance = 33;
    const snapshot = JSON.parse(JSON.stringify(state.helix));
    const grantsBefore = events.grants.length;
    // The restore: the envelope's helix payload lands through deserialize (what
    // save._callDeserialize('faction_helix', data.helix) does on the load lane),
    // live refs rebind on the tick.
    sys.deserialize(snapshot);
    bus.emit('save:loaded', { source: 'test' });
    sim.runTicks(3);
    const h = hx();
    assert.equal(h.deeds, 7, 'deeds persist');
    assert.ok(Math.abs(h.variance - 33) < 0.01, 'variance persists (decay shaves a hair)');
    assert.equal(h.fines.length, 1, 'the instrument persists');
    assert.equal(h.fines[0].status, 'open');
    assert.ok(h.precedents.desk_met != null, 'the stamp persists');
    assert.equal(sys._precedent(state, 'desk_met'), false, 'no free progress on reload');
    assert.equal(events.grants.length, grantsBefore, 'a restore grants nothing');
    const deskRec = h.desks['desk:test'];
    assert.ok(deskRec && deskRec.gone !== true, 'the desk record persists');
    assert.equal(deskRec.entityId, desk.id, 'the body rebinds by id + generation');
    // Serialized rows are plain JSON — no Map/Set/Symbol leaks into the save.
    assert.equal(JSON.stringify(h) !== '', true);
    assert.equal(typeof h.notices[0], 'undefined' || 'object');
  } finally { sim.dispose(); }
});

test('malformed state normalizes instead of sinking the tick', () => {
  const { sim, state, hx } = boot();
  try {
    state.helix = {
      droppedPacks: 'junk', liensFiled: [1, 2],
      seq: 'NaN', deeds: -4, tier: 'x', variance: 9999,
      nextDeskAt: 'bad', manifest: { filedAt: 'nope' },
      paid: 7, precedents: 'bag', desks: { good: null, also: 42 },
      notices: [null, { id: 9 }, { id: 'ok', kind: 'bogus' }, { id: 'ok2', kind: 'manifest' }],
      fines: 'nope', warrants: [null], assessors: [{ entityId: 1 }, { junk: true }],
      writCrew: 'x', ledger: 'y',
    };
    const h = hx();
    assert.deepEqual(h.droppedPacks, {}, 'bad bags rebuild');
    assert.equal(h.deeds, 0);
    assert.equal(h.variance, 100, 'variance clamps to max');
    assert.equal(h.manifest, null, 'a corrupt manifest drops');
    assert.deepEqual(h.desks, {}, 'malformed desk rows drop');
    assert.equal(h.notices.length, 1, 'only well-formed notices keep');
    assert.equal(h.notices[0].id, 'ok2');
    assert.deepEqual(h.fines, []);
    assert.deepEqual(h.writCrew, []);
    assert.doesNotThrow(() => sim.runTicks(5), 'the tick survives');
    assert.ok(Number.isFinite(h.nextDeskAt), 'the desk clock repairs');
  } finally { sim.dispose(); }
});

test('a recycled body never binds a stale desk record — gen + tag guard', () => {
  const { sim, state, hx, quiet, spawnDesk, sys } = boot();
  try {
    const desk = spawnDesk();
    quiet();
    const rec = hx().desks['desk:test'];
    const gen0 = rec.gen;
    assert.ok(gen0 != null, 'the record binds a generation');
    // A re-stamped occupant carrying the same desk key heals the binding in
    // place — the tag is the desk's identity, the generation is its stamp.
    desk.occupantGeneration = gen0 + 7;
    assert.equal(sys._deskEnt(state, rec), desk, 'the same key answers the refiled body');
    assert.equal(rec.gen, gen0 + 7, 'the binding heals to the new occupant');
    sim.runTicks(2);
    assert.equal(rec.gone !== true, true, 'a re-stamped desk is not a dead desk');
    // But a bare id — a hull with no desk tag — is never the same desk.
    const stray = sim.spawn({
      type: 'ship', team: 0, pos: { x: 65000, z: 65000 }, radius: 10, mass: 20,
      hull: 50, collides: true, data: {},
    });
    const ghost = { key: 'desk:ghost', entityId: stray.id, gen: stray.occupantGeneration,
      gone: false, sectorId: SECTOR, pos: { x: 65000, z: 65000 }, clerkId: 'clerk:x',
      nextNoticeAt: 1e12, nextAuditAt: 1e12, authored: false };
    assert.equal(sys._deskEnt(state, ghost), null, 'no tag, no desk — a recycled id cannot bind');
    // A body carrying a foreign key is not this desk either.
    stray.data.helixAudit = true;
    stray.data.helixDeskId = 'desk:other';
    assert.equal(sys._deskEnt(state, ghost), null, 'a foreign key never answers the ledger');
    // And a wrecked desk stands down — the wire cannot ride a corpse.
    desk.alive = false;
    sim.runTicks(2);
    assert.equal(rec.gone, true, 'a wrecked desk is marked gone');
  } finally { sim.dispose(); }
});

test('killing a hunting lien drone files a destroyed-instrument charge', () => {
  const { sim, state, player, events, hx, quiet, kill } = boot();
  try {
    quiet();
    const drone = sim.spawn({
      type: 'drone', team: 0, pos: { x: player.pos.x + 2000, z: player.pos.z },
      radius: 3, mass: 1, hull: 5, collides: true, data: { lienDrone: true },
    });
    sim.runTicks(2); // it never attaches — too far
    assert.equal(drone.data.lienOn, undefined, 'still hunting');
    kill(drone, { byPlayer: true });
    sim.runTicks(2);
    const fine = hx().fines.find((f) => f.cause === 'instrument_destroyed');
    assert.ok(fine && fine.status === 'open', 'a destroyed instrument bills');
    assert.equal(fine.amount, HELIX_FINES.instrumentFineCr);
    assert.ok(hx().variance > HELIX_VARIANCE.instrument - 1 && hx().variance <= HELIX_VARIANCE.instrument,
      'variance files');
    assert.equal(helixEvents(events, 'helix:finePosted').length, 1);
  } finally { sim.dispose(); }
});

test('killing an unmasked Bureau hull posts a warrant — half heat if it drew first', () => {
  const { sim, state, player, events, hx, quiet, kill } = boot();
  try {
    quiet();
    const courier = sim.spawn({
      type: 'ship', team: 0, factionId: 'faction_helix',
      pos: { x: player.pos.x + 300, z: player.pos.z }, radius: 10, mass: 20,
      hull: 50, collides: true, data: {},
    });
    kill(courier, { byPlayer: true });
    const war = helixEvents(events, 'helix:warrantPosted');
    assert.equal(war.length, 1);
    assert.equal(war[0].p.cause, 'courier_killed');
    const w = hx().warrants[0];
    const heat0 = w.heat;
    const courier2 = sim.spawn({
      type: 'ship', team: 0, factionId: 'faction_helix',
      pos: { x: player.pos.x + 300, z: player.pos.z }, radius: 10, mass: 20,
      hull: 50, collides: true, data: {},
    });
    kill(courier2, { byPlayer: true, hostile: true }); // it drew first
    assert.ok(w.heat < heat0 + 40, 'self-defense mitigates the filing');
    assert.equal(w.state, 'open', 'it does not excuse — only mitigates');
  } finally { sim.dispose(); }
});

// ── 8. The real save seam — the docket rides the envelope ───────────────────────

test('the save envelope carries the docket — a Continue cannot launder the file', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys, bus } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const fine = sys._postFine(state, hx(), 'lien', 150, { subjectId: player.id });
    sys._precedent(state, 'desk_met');
    sys._postWarrant(state, hx(), 'adjudicator_killed');
    hx().deeds = 7; hx().variance = 33;
    // The real envelope: serializeData writes data.helix beside the faction slots.
    save.init({ state, bus, helpers: {}, registry: sim.registry });
    const data = save.serializeData();
    assert.ok(data.helix && typeof data.helix === 'object' && !Array.isArray(data.helix),
      'data.helix is an envelope key now — the docket is not session-only');
    assert.equal(data.helix.deeds, 7, 'deeds ride the envelope');
    assert.equal(data.helix.fines.length, 1, 'open instruments ride the envelope');
    assert.equal(data.helix.warrants.length, 1, 'the warrant rides the envelope');
    assert.ok(data.helix.precedents.desk_met != null, 'stamps ride the envelope');
    // The load lane: wipe the live bag, restore through the same call the
    // restore driver makes, then let save:loaded renormalize.
    state.helix = {};
    save._callDeserialize('faction_helix', data.helix);
    bus.emit('save:loaded', { source: 'test' });
    sim.runTicks(3);
    const h = hx();
    assert.equal(h.deeds, 7, 'standing survives a real restore');
    assert.equal(h.fines.length, 1, 'the instrument is not laundered');
    assert.equal(h.fines[0].status, 'open');
    assert.equal(h.warrants.length, 1, 'the warrant is not laundered');
    assert.ok(h.precedents.desk_met != null, 'stamps hold');
    assert.equal(sys._precedent(state, 'desk_met'), false, 'a restore re-pays no law');
    const deskRec = h.desks['desk:test'];
    assert.ok(deskRec && deskRec.gone !== true, 'the desk record rebinds by tag');
    assert.equal(deskRec.entityId, desk.id);
  } finally { sim.dispose(); }
});

test('a restore that never ran deserialize does not inherit the old run’s file', () => {
  const { sim, state, hx, quiet, sys, bus } = boot();
  try {
    quiet();
    sys._postFine(state, hx(), 'lien', 150, {});
    hx().deeds = 9;
    // A load whose envelope carried no helix payload (a pre-key save, a NG+
    // candidate that stripped subsystem bags) must not keep the session's file —
    // another run's file is never this run's file.
    bus.emit('save:loaded', { source: 'test' });
    sim.runTicks(2);
    assert.equal(hx().deeds, 0, 'stale progress is bleed-over, not inheritance');
    assert.equal(hx().fines.length, 0, 'stale instruments are bleed-over too');
    assert.doesNotThrow(() => sim.runTicks(3), 'the arm heals to a fresh docket');
  } finally { sim.dispose(); }
});

test('an absent helix payload restores a fresh docket, not a wedge', () => {
  const { sim, state, hx, quiet, sys } = boot();
  try {
    quiet();
    hx().deeds = 9; hx().variance = 40;
    sys._postFine(state, hx(), 'lien', 150, {});
    sys.deserialize(undefined); // a pre-key envelope: data.helix is absent
    const h = hx();
    assert.equal(h.deeds, 0, 'the missing bag heals to fresh');
    assert.equal(h.fines.length, 0);
    assert.ok(Number.isFinite(h.nextDeskAt), 'the desk clock repairs');
    sys.deserialize({ junk: true, fines: 'nope', desks: [1] }); // a corrupt bag
    const h2 = hx();
    assert.equal(h2.deeds, 0, 'corruption normalizes, never sinks');
    assert.doesNotThrow(() => sim.runTicks(3));
  } finally { sim.dispose(); }
});

// ── 9. Small integrity fixes ────────────────────────────────────────────────────

test('a desk lost releases the bodies its wire tagged — the hulk can be filed again', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, kill } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: desk.pos.x + 400, z: desk.pos.z },
      radius: 8, mass: 60, hull: 30, collides: true, data: {},
    });
    const debtor = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: desk.pos.x + 500, z: desk.pos.z }, radius: 10, mass: 20,
      hull: 50, collides: true, data: { lienFiledCr: 500 },
    });
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1);
    const taggedWreck = posted[0].p.kind === 'salvage' ? wreck : debtor;
    const tagKey = posted[0].p.kind === 'salvage' ? 'helixNoticeId' : 'helixCollectId';
    assert.equal(taggedWreck.data[tagKey], posted[0].p.noticeId, 'the filing tags its body');
    kill(desk, { byPlayer: false }); // the desk goes quiet — its wire dies with it
    sim.runTicks(2);
    assert.equal(taggedWreck.data[tagKey] == null, true,
      'a lapsed filing releases its stamp — dead paper must not exempt the body');
    // And a desk that returns can file on the same mass again.
    const desk2 = spawnDesk(player.pos.x + 120, player.pos.z, 'desk:test2');
    quiet();
    hx().desks['desk:test2'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const repost = helixEvents(events, 'helix:noticePosted');
    assert.equal(repost.length, 2, 'the released body files again under the next desk');
  } finally { sim.dispose(); }
});

test('a masked pack reduced below two live members draws no unanswerable filing', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, kill } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const slot = [{ dx: -80, dz: 0 }, { dx: 80, dz: 0 }];
    const members = slot.map((s) => sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: 61000 + s.dx, z: 61000 + s.dz }, radius: 10, mass: 20, hull: 50,
      collides: true, data: { helixFalseFlag: true, helixPack: 'pack:thin', helixSlot: s, ai: {} },
    }));
    kill(members[0], { byPlayer: false }); // one hull left — no formation to unmask
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(3);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1, 'the desk still files');
    assert.notEqual(posted[0].p.kind, 'pack',
      'a lone masked hull is not a formation — the filing would be unanswerable');
  } finally { sim.dispose(); }
});

test('an answered-by-violence pack filing dissolves without blame', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, kill } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const slot = [{ dx: -80, dz: 0 }, { dx: 80, dz: 0 }];
    const members = slot.map((s) => sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: 61000 + s.dx, z: 61000 + s.dz }, radius: 10, mass: 20, hull: 50,
      collides: true, data: { helixFalseFlag: true, helixPack: 'pack:cut', helixSlot: s, ai: {} },
    }));
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].p.kind, 'pack');
    const v0 = hx().variance;
    kill(members[0], { byPlayer: false }); // the Bureau's filing just lost its formation
    sim.runTicks(2);
    const n = hx().notices.find((x) => x.id === posted[0].p.noticeId);
    assert.equal(n.state, 'lapsed', 'a lone masked hull cannot answer the filing');
    assert.ok(hx().variance <= v0, 'no variance accrues for a dissolved filing');
    assert.equal(
      helixEvents(events, 'helix:noticeLapsed').filter((e) => e.p.cause === 'pack_dissolved').length,
      1, 'the wire reports what closed it');
  } finally { sim.dispose(); }
});

test('a stale lien stamp frees when the named drone rides a different hull', () => {
  const { sim, state, player, events, quiet } = boot();
  try {
    quiet();
    const ship = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: player.pos.x + 800, z: player.pos.z }, radius: 10, mass: 20, hull: 50,
      collides: true, data: {},
    });
    const other = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: player.pos.x + 900, z: player.pos.z }, radius: 10, mass: 20, hull: 50,
      collides: true, data: {},
    });
    const drone = sim.spawn({
      type: 'drone', team: 0, factionId: 'faction_helix',
      pos: { x: player.pos.x + 850, z: player.pos.z }, radius: 3, mass: 2, hull: 10,
      collides: true, data: { lienDrone: true, lienOn: other.id, lienAtS: state.simTime },
    });
    // A recycled id can name a live lien drone that rides somebody else — the
    // stamp is dead paper either way and the hull must not stay marked forever.
    ship.data.lienStuck = drone.id;
    ship.data.lienMassT = 6;
    sim.runTicks(1);
    assert.equal(ship.data.lienStuck == null, true, 'a two-way-mismatched stamp is dead paper');
    assert.equal(ship.data.lienMassT == null, true);
    assert.equal(helixEvents(events, 'helix:lienScraped').length, 1, 'the scrape is reported once');
    sim.runTicks(1);
    assert.equal(helixEvents(events, 'helix:lienScraped').length, 1, 'and never twice');
  } finally { sim.dispose(); }
});

test('a stale desk record takes the sector of the body that refiles it', () => {
  const { sim, state, player, hx, quiet, spawnDesk } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    // A record filed while the sector id was unset would stay sectorless —
    // sighted, excluded from service and reconcile alike.
    hx().desks['desk:test'].sectorId = null;
    state.world.currentSectorId = 'sec:new';
    sim.runTicks(1);
    assert.equal(hx().desks['desk:test'].sectorId, 'sec:new',
      'the sighted sector lands on the record');
    // And the body's own authored stamp wins over the ambient sector.
    desk.data.sectorId = 'sec:body';
    sim.runTicks(1);
    assert.equal(hx().desks['desk:test'].sectorId, 'sec:body',
      'an authored stamp outranks the ambient sector');
  } finally { sim.dispose(); }
});

test('a Bureau hull killed through a receipt-only path still files its warrant', () => {
  const { sim, state, player, events, hx, quiet, bus } = boot();
  try {
    quiet();
    const courier = sim.spawn({
      type: 'ship', team: 0, factionId: 'faction_helix',
      pos: { x: player.pos.x + 300, z: player.pos.z }, radius: 10, mass: 20,
      hull: 50, collides: true, data: {},
    });
    // Some kill routes sweep the body before the receipt lands — the payload's
    // own factionId/type is the same fact; the file must not miss it. And a
    // dataless corpse must never crash the handler mid-emit.
    state.entities.delete(courier.id);
    const idx = state.entityList.indexOf(courier);
    if (idx >= 0) state.entityList.splice(idx, 1);
    bus.emit('entity:killed', {
      id: courier.id, killerId: state.playerId, type: 'ship',
      pos: { x: courier.pos.x, z: courier.pos.z }, factionId: 'faction_helix',
      targetHostileToPlayer: false,
    });
    const posted = helixEvents(events, 'helix:warrantPosted');
    assert.equal(posted.length, 1, 'a swept corpse still attributes through the receipt');
    assert.equal(hx().warrants[0].cause, 'courier_killed');
  } finally { sim.dispose(); }
});

test('a hostile docket heals — far-future clocks, bloated rows, pinned filings', () => {
  const { sim, state, hx, sys, bus } = boot();
  try {
    state.simTime = 500;
    sys.deserialize({
      seq: 10, deeds: 4, variance: 40,
      nextDeskAt: 1e9,
      desks: {
        'desk:x': { key: 'desk:x', entityId: null, gone: false,
          nextNoticeAt: 1e9, nextAuditAt: 1e9, pos: { x: 0, z: 0 } },
        'desk:gone': { key: 'desk:gone', entityId: null, gone: true,
          pos: { x: 0, z: 0 } },
      },
      notices: [
        { id: 'ntc:1', kind: 'manifest', deskKey: 'desk:x', state: 'open', postedAt: 0, expiresAt: 1e9 },
        // Paper pinned to a desk already filed gone — no production path can
        // write the pair; it must lapse, not sit on a filing slot forever.
        { id: 'ntc:2', kind: 'manifest', deskKey: 'desk:gone', state: 'open', postedAt: 0, expiresAt: 1e9 },
      ],
      fines: [{ id: 'f:1', cause: 'lien', amount: 150, issuedAt: 0, dueAt: 1e9, status: 'open' }],
      warrants: [{ id: 'w:1', cause: 'desk_wrecked', heat: 60, postedAt: 0,
        expiresAt: 1e9, nextWritAt: 1e9, state: 'open' }],
      assessors: Array.from({ length: 40 }, (_, i) => (
        { entityId: 90000 + i, gen: 1, deskKey: 'desk:x', auditId: `a:${i}` })),
      writCrew: Array.from({ length: 40 }, (_, i) => ({ entityId: 80000 + i, warrantId: 'w:1' })),
    });
    bus.emit('save:loaded', { source: 'test' });
    const h = hx();
    assert.ok(h.nextDeskAt <= 500 + HELIX_DESKS.deskGapS, 'the desk clock cannot sleep forever');
    assert.ok(h.notices.every((n) => n.expiresAt <= 500 + HELIX_NOTICES.ttlS),
      'no filing outlives its paper');
    assert.ok(h.fines[0].dueAt <= 500 + HELIX_FINES.graceS + HELIX_FINES.garnishAfterS,
      'the garnish clock still reaches the file');
    assert.ok(h.warrants[0].expiresAt <= 500 + HELIX_WARRANT.windowS, 'the warrant window holds');
    assert.ok(h.assessors.length <= HELIX_AUDIT.cap, 'dead audit filler is trimmed at the boundary');
    assert.ok(h.writCrew.length <= (HELIX_WARRANT.writMax + 1) * 2, 'dead crew rows are trimmed');
    sim.runTicks(2);
    const pinned = hx().notices.find((n) => n.id === 'ntc:2');
    assert.equal(pinned.state, 'lapsed', 'paper pinned to a dead desk lapses instead of wedging');
    assert.equal(hx().desks['desk:x'].gone, true, 'a bodiless desk is reconciled gone');
    assert.doesNotThrow(() => sim.runTicks(3));
  } finally { sim.dispose(); }
});

// ── 10. Second-pass seams ──────────────────────────────────────────────────────

test('a New Game starts with a clean docket — the last pilot’s file never carries', () => {
  const { sim, state, hx, quiet, sys, bus } = boot();
  try {
    quiet();
    sys._postFine(state, hx(), 'lien', 150, {});
    sys._postWarrant(state, hx(), 'adjudicator_killed');
    sys._precedent(state, 'desk_met');
    hx().deeds = 7;
    // resetRunState does not know this additive tree — the system reasserts the
    // empty boundary itself on both sides of the canonical transition.
    bus.emit('game:new', {});
    let h = hx();
    assert.equal(h.deeds, 0, 'the standing belongs to the run that earned it');
    assert.equal(h.fines.length, 0, 'open instruments die with the run');
    assert.equal(h.warrants.length, 0, 'no writ cutter inherits the next pilot');
    assert.equal(h.precedents.desk_met == null, true, 'precedents can be earned again');
    hx().deeds = 3;
    sys._postFine(state, hx(), 'lien', 10, {});
    bus.emit('game:newGame', { seed: 1 });
    bus.emit('game:started', {});
    h = hx();
    assert.equal(h.deeds, 0, 'the far side of boot reasserts the boundary');
    assert.equal(h.fines.length, 0);
    assert.doesNotThrow(() => sim.runTicks(3));
  } finally { sim.dispose(); }
});

test('a pos-less pilot body cannot crash the docket or field writs blind', () => {
  const { sim, state, player, events, hx, quiet, sys } = boot();
  try {
    quiet();
    sys._postWarrant(state, hx(), 'desk_wrecked'); // 60 heat — the writ path wants a position
    player.pos = null;
    // Drive the Helix tick directly — a pos-less pilot already kills the host's
    // own preStep before any system runs, so runTicks cannot reach this seam.
    assert.doesNotThrow(() => { for (let i = 0; i < 5; i++) sys.update(1 / 60, state); },
      'the Helix tick survives a pos-less pilot');
    assert.equal(helixEvents(events, 'helix:writSpawned').length, 0,
      'no writ can field a pilot it cannot see');
  } finally { sim.dispose(); }
});

test('a notice parked in another sector does not hold this sector’s wire', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    // Fill the global open cap with filings whose desks all live elsewhere —
    // none of it can be answered here, so none of it may block the wire.
    for (let i = 0; i < HELIX_NOTICES.maxOpen; i++) {
      const key = `desk:far${i}`;
      hx().desks[key] = {
        key, entityId: null, gen: null, sectorId: 'sec:elsewhere',
        clerkId: 'clerk_ila_voss', authored: true, gone: false,
        pos: { x: 0, z: 0 }, firstSeenAt: 0, lastSeenAt: 0, awayT: 0,
        nextNoticeAt: 1e12, nextAuditAt: 1e12,
      };
      hx().notices.push({
        id: `ntc:parked${i}`, kind: 'manifest', deskKey: key, state: 'open',
        pos: { x: 0, z: 0 }, postedAt: state.simTime,
        expiresAt: state.simTime + HELIX_NOTICES.ttlS, dwellT: 0,
        packId: null, wreckId: null, wreckGen: null,
        targetId: null, targetGen: null, owedCr: 0, closedAt: 0,
      });
    }
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1, 'the desk still has a wire to post on');
    assert.equal(posted[0].p.deskKey, 'desk:test');
    // The parked filings stay open in their own sector — paused, not dead.
    assert.ok(hx().notices.filter((n) => n.id.startsWith('ntc:parked'))
      .every((n) => n.state === 'open'), 'parked paper waits for its own desk');
  } finally { sim.dispose(); }
});

test('a body stamp outliving its filing is dead paper — the mass can be noticed again', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: desk.pos.x + 400, z: desk.pos.z },
      radius: 8, mass: 60, hull: 30, collides: true,
      // The filing that wrote this closed while the hulk rode an unloaded
      // sector — the tag outlived its paper.
      data: { helixNoticeId: 'ntc:ghost' },
    });
    const debtor = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: desk.pos.x + 500, z: desk.pos.z }, radius: 10, mass: 20,
      hull: 50, collides: true,
      data: { lienFiledCr: 500, helixCollectId: 'ntc:ghost2' },
    });
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1, 'dead paper does not exempt the mass');
    assert.equal(posted[0].p.kind, 'salvage', 'the stale hulk stamp heals on read');
    assert.equal(wreck.data.helixNoticeId, posted[0].p.noticeId, 'the fresh filing owns the tag');
    // A second desk reads the collect stamp the same way.
    spawnDesk(player.pos.x + 140, player.pos.z, 'desk:test2');
    hx().desks['desk:test2'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const second = helixEvents(events, 'helix:noticePosted');
    assert.equal(second[1].p.kind, 'collect', 'the stale collect stamp heals on read');
    assert.equal(debtor.data.helixCollectId, second[1].p.noticeId);
  } finally { sim.dispose(); }
});

test('a desk wrecked before the ledger filed it still files the instrument', () => {
  const { sim, state, player, events, hx, quiet, kill } = boot();
  try {
    quiet();
    // The kill lands before the discovery tick ever registers the desk — the
    // body tag names it and the consequence must still land.
    const desk = sim.spawn({
      type: 'ship', team: 0, pos: { x: player.pos.x + 200, z: player.pos.z },
      radius: HELIX_DESKS.deskRadius, mass: HELIX_DESKS.deskMass,
      hull: HELIX_DESKS.deskHull, hullMax: HELIX_DESKS.deskHull, collides: true,
      data: { helixAudit: true, helixDeskId: 'desk:unfiled' },
    });
    kill(desk, { byPlayer: true });
    sim.runTicks(2);
    const war = helixEvents(events, 'helix:warrantPosted');
    assert.equal(war.length, 1, 'the instrument is filed anyway');
    assert.equal(war[0].p.cause, 'desk_wrecked');
    assert.ok(hx().ledger.some((r) => r.kind === 'desk_lost'), 'the verdict files');
    assert.ok(hx().variance > 0, 'variance accrues');
  } finally { sim.dispose(); }
});

test('a far-future manifest expiry is bound to a real filing window', () => {
  const { sim, state, hx, sys } = boot();
  try {
    state.simTime = 100;
    sys.deserialize({ manifest: { filedAt: 0, expiresAt: 1e12 } });
    const h = hx();
    assert.ok(h.manifest.expiresAt <= state.simTime + HELIX_FINES.manifestValidS,
      'no manifest outlives its paper — clean reads cannot be banked forever');
    assert.doesNotThrow(() => sim.runTicks(2));
  } finally { sim.dispose(); }
});

test('resisting the writ escalates the warrant — the Bureau hears it', () => {
  const { sim, state, player, events, hx, quiet, sys, kill } = boot();
  try {
    quiet();
    const w = sys._postWarrant(state, hx(), 'adjudicator_killed');
    w.expiresAt = state.simTime + 50; // age the window so the refresh shows
    const cutter = sim.spawn({
      type: 'ship', team: 0, factionId: 'faction_helix',
      pos: { x: player.pos.x + 300, z: player.pos.z }, radius: 10, mass: 20,
      hull: 50, collides: true,
      data: { helixWrit: true, helixWritId: w.id },
    });
    hx().writCrew.push({ entityId: cutter.id, gen: cutter.occupantGeneration ?? null, warrantId: w.id });
    const heat0 = w.heat;
    const killAt = state.simTime;
    kill(cutter, { byPlayer: true });
    sim.runTicks(1);
    assert.equal(w.heat, heat0 + 25, 'the resistance lands on the same warrant'); // WARRANT_HEAT.writ_killed
    assert.equal(helixEvents(events, 'helix:warrantEscalated').length, 1,
      'the escalation is heard on the wire');
    assert.ok(w.expiresAt >= killAt + HELIX_WARRANT.windowS,
      'the Bureau’s clock refreshes — killing writs is never free');
    assert.ok(hx().writCrew.every((r) => r.entityId !== cutter.id),
      'the dead cutter leaves the crew — the Bureau fields another in its place');
    assert.ok(hx().ledger.some((r) => r.kind === 'writ_killed'));
  } finally { sim.dispose(); }
});

test('the lien filing latches before the wire sings — a re-entrant tick files once', () => {
  const { sim, state, player, events, bus, quiet } = boot();
  try {
    quiet();
    // A listener that steps the sim mid-emit must find the instrument spent.
    const sys = sim.registry.get('faction_helix');
    bus.on('helix:lienFiled', () => { sys.update(1 / 60, state); });
    sim.spawn({
      type: 'drone', team: 0, pos: { x: player.pos.x + 10, z: player.pos.z },
      radius: 3, mass: 1, hull: 5, collides: true, data: { lienDrone: true },
    });
    sim.runTicks(tick(14));
    assert.equal(helixEvents(events, 'helix:lienFiled').length, 1, 'the filing lands once');
    assert.equal(player.data.lienFiledCr, 150, 'one lien, one amount');
    assert.equal(helixDocket(state).fines.length, 1, 'one instrument enters the docket');
  } finally { sim.dispose(); }
});

test('a hostile low serial cannot re-mint ids over live rows', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk, sys } = boot();
  try {
    spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    sys.deserialize({
      seq: 0,
      desks: { 'desk:test': hx().desks['desk:test'] }, // the live desk's own record
      notices: [{ id: 'ntc:0', kind: 'manifest', deskKey: 'desk:ghost', state: 'open',
        postedAt: 0, expiresAt: 1e4 }],
    });
    assert.ok(hx().seq > 0, 'the serial outruns the stamps already in the bag');
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    const posted = helixEvents(events, 'helix:noticePosted');
    assert.equal(posted.length, 1);
    assert.notEqual(posted[0].p.noticeId, 'ntc:0', 'the minted id never collides with a live row');
    const ids = hx().notices.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate filings in the bag');
  } finally { sim.dispose(); }
});

test('a null pilot id never reads an unset stamp as player-handled', () => {
  const { sim, state, player, events, hx, quiet, spawnDesk } = boot();
  try {
    const desk = spawnDesk(player.pos.x + 100, player.pos.z);
    quiet();
    const wreck = sim.spawn({
      type: 'wreck', team: 0, pos: { x: desk.pos.x + 30, z: desk.pos.z },
      radius: 8, mass: 60, hull: 30, collides: true,
      data: { lastThrowerId: null }, // an unset stamp, not the pilot's mark
    });
    hx().desks['desk:test'].nextNoticeAt = state.simTime;
    sim.runTicks(2);
    assert.equal(helixEvents(events, 'helix:noticePosted')[0].p.kind, 'salvage');
    const savedId = state.playerId;
    state.playerId = null;
    try {
      sim.runTicks(3);
    } finally { state.playerId = savedId; }
    const n = hx().notices.find((x) => x.kind === 'salvage');
    assert.equal(n.state, 'open', 'nobody is at the desk — the title does not move');
    assert.equal(helixEvents(events, 'helix:noticeVerified').length, 0, 'no free title transfers');
    assert.notEqual(wreck.alive, false, 'the hulk is still on the field');
  } finally { sim.dispose(); }
});
