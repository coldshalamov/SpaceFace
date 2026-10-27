// faction-choir-expansion — the rites grown on the W-CHOIR bones
// (build_map §34.5 row 528): sanctuary standing and the tithe book, bell
// offerings and their blessings, the bounded pilgrim procession and its escort
// purse, and the open heresy marks. Proves the ledgers pay once, survive a
// save round-trip, and normalize absent/malformed state.
//
// Run: node --test test/faction-choir-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { occupantGenerationOf } from '../src/core/entity.js';
import {
  choirResonance,
  ensureChoirState,
  choirStanding,
  choirBlessingActive,
} from '../src/systems/faction_choir.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [choirResonance] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_vesta_forge';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -9000, z: -9000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const shrine = (sim, x, z, name) => sim.spawn({
  type: 'station', team: 1, factionId: 'faction_choir', pos: { x, z },
  radius: 60, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
  data: { choirShrine: true, name },
});

const chorister = (sim, x, z) => sim.spawn({
  type: 'ship', team: 1, factionId: 'faction_choir', pos: { x, z },
  radius: 12, mass: 30, hull: 100, hullMax: 100, collides: true,
  data: { name: 'A CHORISTER' },
});

const offeringPod = (sim, x, z, units, ownerId, commodityId = 'cmdty_crystal_lumin') => sim.spawn({
  type: 'payload', team: 0, pos: { x, z }, radius: 3, mass: 1,
  hull: 10, hullMax: 10, collides: true,
  data: { jettisonedCargo: true, commodityId, amount: units, ownerId },
});

const events = (bus, type) => {
  const out = [];
  bus.on(type, (p) => out.push(p));
  return out;
};

/** Move the test ship — pos is a vector; set both axes or the ship stays home. */
const flyTo = (player, x, z) => { player.pos.x = x; player.pos.z = z; };

// ── the tithe book ────────────────────────────────────────────────────────────

test('a laden hold crossing sanctuary owes the tithe — once per crossing, not per tick', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    state.player.cargo.items = { cmdty_ore_iron: 10 };
    state.player.credits = 1000;
    const charges = events(bus, 'economy:chargeCredits');
    const tithes = events(bus, 'choir:tithePaid');
    // Park inside the radius: the levy is a crossing edge, not a standing tax.
    player.pos.x = 400; player.pos.z = 0;
    sim.step();
    assert.equal(charges.length, 1, 'one levy for one crossing');
    assert.equal(charges[0].amount, 65, '25 base + 4/unit × 10 units');
    assert.equal(tithes.length, 1);
    assert.equal(tithes[0].kind, 'paid');
    assert.equal(tithes[0].due, 65);
    sim.runTicks(300);
    assert.equal(charges.length, 1, 'five seconds inside never re-levies');
    assert.equal(ensureChoirState(state).tithe.receipts.length, 1);
    // Leave and re-enter: a new crossing is a new receipt.
    player.pos.x = 5000;
    sim.step();
    player.pos.x = 400;
    sim.step();
    assert.equal(charges.length, 2, 'a second crossing is a second tithe');
    assert.equal(ensureChoirState(state).tithe.receipts.length, 2);
  } finally {
    sim.dispose();
  }
});

test('the broke are stinted, the marked are waived, the banished pay penance', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    state.player.cargo.items = { cmdty_ore_iron: 10 };
    const charges = events(bus, 'economy:chargeCredits');
    const tithes = events(bus, 'choir:tithePaid');
    const c = ensureChoirState(state);

    // Stinted: the hold owes 65 but the purse holds 30 — receipt reads stinted.
    state.player.credits = 30;
    flyTo(player, 400, 0);
    sim.step();
    assert.equal(charges.at(-1).amount, 30);
    assert.equal(tithes.at(-1).kind, 'stinted');
    assert.equal(tithes.at(-1).amount, 30);

    // Marked: the mark is on you — the next crossing owes nothing.
    flyTo(player, 5000, 0); sim.step();
    c.sanctuary.standing = 'marked';
    c.sanctuary.until = state.simTime + 9999;
    flyTo(player, 400, 0);
    sim.step();
    assert.equal(tithes.at(-1).kind, 'waived');
    assert.equal(charges.length, 1, 'the marked pass toll-free');

    // Banished: sacrilege doubles the levy and the book says penance.
    flyTo(player, 5000, 0); sim.step();
    c.sanctuary.standing = 'banished';
    c.sanctuary.until = state.simTime + 9999;
    state.player.credits = 1000;
    flyTo(player, 400, 0);
    sim.step();
    assert.equal(tithes.at(-1).kind, 'penance');
    assert.equal(tithes.at(-1).due, 130, 'penance is a tithe doubled');
    assert.equal(charges.at(-1).amount, 130);
  } finally {
    sim.dispose();
  }
});

// ── the pilgrim ledger: stamps, legs, circuits ────────────────────────────────

test('shrine to shrine inside the window completes a leg and rings the circuit', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 4000, 0, 'Vesta Shrine');
    const legs = events(bus, 'choir:pilgrimLeg');
    const grants = events(bus, 'economy:grantCredits');
    const reps = events(bus, 'faction:repDelta');
    const circuits = events(bus, 'choir:circuitComplete');
    const sanctuaries = events(bus, 'choir:sanctuary');

    player.pos.x = 400; player.pos.z = 0;
    sim.step();
    assert.equal(legs.length, 0, 'one shrine is a vigil, not a leg');

    player.pos.x = 4400;
    sim.step();
    assert.equal(legs.length, 1, 'Ceres to Vesta is a true leg');
    assert.equal(legs[0].from, 'Ceres Shrine');
    assert.equal(legs[0].to, 'Vesta Shrine');
    assert.ok(grants.some((g) => g.amount === 90 && g.reason === 'choir_pilgrim_leg'));
    assert.ok(reps.some((r) => r.factionId === 'faction_choir' && r.delta === 2));
    assert.equal(circuits.length, 1, 'every standing shrine stamped — the circuit rings');
    assert.ok(grants.some((g) => g.amount === 220 && g.reason === 'choir_circuit'));
    assert.ok(sanctuaries.some((s) => s.standing === 'marked'), 'the circuit rings the mark on you');
    assert.equal(choirStanding(state).standing, 'marked');
    assert.equal(choirStanding(state).visitedShrines, 1,
      'the circuit book resets — only the shrine you stand in keeps a stamp');
    assert.equal(choirStanding(state).circuits, 1);

    // The same ordered route never pays twice — the ledger is the receipt.
    grants.length = 0;
    player.pos.x = 5000; sim.step();
    player.pos.x = 400; sim.step();
    player.pos.x = 5000; sim.step();
    player.pos.x = 4400; sim.step();
    assert.equal(legs.length >= 2, true, 'walking it again still reads as legs');
    assert.equal(grants.filter((g) => g.reason === 'choir_pilgrim_leg').length, 1,
      'only the new ordered route pays');
    assert.equal(grants.filter((g) => g.reason === 'choir_pilgrim_leg')[0].amount, 90);
    // The lap was walked again in full — one new circuit rings, not one per hop.
    assert.equal(circuits.length, 2,
      'a spent stamp cannot ring the next circuit — the loop must be re-walked');
  } finally {
    sim.dispose();
  }
});

// ── sanctuary and the relic ───────────────────────────────────────────────────

test('a marked pilgrim carries a sealed relic through the shrine unreported', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    const relic = sim.spawn({
      type: 'payload', team: 0, pos: { x: 400, z: 0 },
      radius: 5, mass: 4, hull: 10, hullMax: 10, collides: true,
      data: { carriedRelic: true },
    });
    const pings = events(bus, 'choir:relicPing');
    const alarms = events(bus, 'choir:relicAlarm');
    const sacrilege = events(bus, 'choir:sacrilege');
    const c = ensureChoirState(state);
    c.sanctuary.standing = 'marked';
    c.sanctuary.until = state.simTime + 9999;
    flyTo(player, 9000, 9000); // parked far off — the relic itself walks in
    sim.runTicks(240);
    assert.equal(pings.length, 0, 'the mark stills the report');
    assert.equal(alarms.length, 0);
    assert.equal(sacrilege.length, 0);
    assert.equal(c.alarms, 0);

    // The mark burns off: the same sealed relic in the shrine's heart reports
    // home — the alarm and the sacrilege land together, and the carrier is
    // banished for it.
    c.sanctuary.until = state.simTime + 0.1;
    sim.runTicks(30);
    assert.ok(pings.length + alarms.length > 0, 'standing gone, the relic reports home');
    assert.equal(alarms.length, 1);
    assert.equal(c.alarms, 1);
    assert.equal(sacrilege.length, 1);
    assert.equal(sacrilege[0].kind, 'sealed_relic');
    assert.equal(choirStanding(state).standing, 'banished',
      'a sealed relic at the shrine\'s heart is sacrilege — the ledger banishes');
    void relic;
  } finally {
    sim.dispose();
  }
});

test('killing the faithful is sacrilege; killing a shrine is the deep ledger', () => {
  const { sim, state, bus, player } = boot();
  try {
    const victim = chorister(sim, 500, 500);
    const reps = events(bus, 'faction:repDelta');
    const sacrilege = events(bus, 'choir:sacrilege');
    const sanctuaries = events(bus, 'choir:sanctuary');
    victim.alive = false; // every real emitter flips alive before the wire
    bus.emit('entity:killed', {
      id: victim.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: victim.pos.x, z: victim.pos.z },
    });
    const c = ensureChoirState(state);
    assert.equal(sacrilege.length, 1);
    assert.equal(sacrilege[0].kind, 'chorister');
    assert.ok(reps.some((r) => r.factionId === 'faction_choir' && r.delta === -8
      && r.reason === 'choir_sacrilege:chorister'));
    assert.equal(c.sanctuary.standing, 'banished');
    assert.ok(sanctuaries.some((s) => s.standing === 'banished'));
    assert.equal(c.sanctuary.violations, 1);

    // Someone else's violence is not written against the player.
    const other = chorister(sim, 600, 600);
    other.alive = false;
    bus.emit('entity:killed', {
      id: other.id, killerId: 99999, factionId: 'faction_choir',
      type: 'ship', pos: { x: 0, z: 0 },
    });
    assert.equal(c.sacrilege.length, 1, 'npc-on-npc kills are not the player\'s sin');
  } finally {
    sim.dispose();
  }
});

// ── offerings and blessings ───────────────────────────────────────────────────

test('a crystal pod beside the shrine is taken up — size buys the blessing', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    const offerings = events(bus, 'choir:offering');
    const reps = events(bus, 'faction:repDelta');
    const blessings = events(bus, 'choir:blessing');

    const pod = offeringPod(sim, 200, 0, 1, player.id);
    sim.step();
    assert.equal(pod.alive === false, true, 'the choir takes the offering up');
    assert.equal(offerings.length, 1);
    assert.equal(offerings[0].blessing, 'vigil');
    assert.ok(choirBlessingActive(state, 'vigil'));
    assert.ok(reps.some((r) => r.delta === 1 && r.reason === 'choir_offering:vigil'));

    offeringPod(sim, 200, 0, 3, player.id);
    sim.step();
    assert.equal(offerings.at(-1).blessing, 'chorister');
    const c = ensureChoirState(state);
    assert.ok(c.blessings.chorister && c.blessings.chorister.yieldLeft > 0,
      'the chorister tithe carries a devotional pool');

    offeringPod(sim, 200, 0, 6, player.id);
    sim.step();
    assert.equal(offerings.at(-1).blessing, 'sanctum');
    assert.equal(c.sanctuary.standing, 'marked', 'the great offering buys the mark');
    assert.ok(blessings.length >= 3);
    assert.equal(c.offerings.length, 3);
    assert.equal(c.offeringUnits, 10);

    // Not every pod is an offering: foreign owners and wrong cargo rest untouched.
    const foreign = offeringPod(sim, 200, 0, 6, 7777);
    const wrong = offeringPod(sim, 200, 0, 6, player.id, 'cmdty_ore_iron');
    const far = offeringPod(sim, 9000, 9000, 6, player.id);
    sim.runTicks(5);
    assert.equal(offerings.length, 3, 'only the pilot\'s crystal at an altar counts');
    assert.equal(foreign.alive !== false, true);
    assert.equal(wrong.alive !== false, true);
    assert.equal(far.alive !== false, true);
  } finally {
    sim.dispose();
  }
});

test('the chorister tithe pays a devotional per shatter from a bounded pool', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    player.pos.x = 200; player.pos.z = 0;
    offeringPod(sim, 200, 0, 3, player.id);
    sim.step();
    const c = ensureChoirState(state);
    const pool0 = c.blessings.chorister.yieldLeft;
    const grants = events(bus, 'economy:grantCredits');
    const yields = events(bus, 'choir:devotionalYield');
    // A crystal already at the end of its hum lets go next tick, beside the player.
    sim.spawn({
      type: 'asteroid', team: 0, pos: { x: 300, z: 0 }, radius: 14, mass: 200,
      hull: 100, hullMax: 100, collides: true,
      data: { material: 'crystal', typeId: 'ast_crystalline', choirHumAt: -100, choirHumDur: 1 },
    });
    sim.step();
    assert.equal(yields.length, 1);
    assert.equal(grants.at(-1).reason, 'choir_chorister_devotional');
    assert.ok(grants.at(-1).amount > 0);
    assert.equal(c.blessings.chorister.yieldLeft, pool0 - grants.at(-1).amount,
      'the pool pays down, never below zero');

    // The blessing expires on its own clock and speaks the end.
    const ended = events(bus, 'choir:blessingEnded');
    c.blessings.chorister.until = state.simTime + 0.05;
    sim.runTicks(10);
    assert.ok(ended.some((e) => e.kind === 'chorister'));
    assert.equal(choirBlessingActive(state, 'chorister'), false);
  } finally {
    sim.dispose();
  }
});

// ── the procession ────────────────────────────────────────────────────────────

test('pilgrims walk the circuit between shrines; company to the end pays the purse', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 2200, 0, 'Vesta Shrine');
    const spawns = events(bus, 'choir:pilgrimSpawn');
    const hails = events(bus, 'choir:escortRequest');
    const arrivals = events(bus, 'choir:pilgrimArrived');
    const escorts = events(bus, 'choir:escortComplete');
    const grants = events(bus, 'economy:grantCredits');
    const reps = events(bus, 'faction:repDelta');

    sim.step();
    assert.equal(spawns.length, 1, 'the first procession walks at once');
    const pilgrim = state.entityList.find((e) => e.data?.choirPilgrim === true);
    assert.ok(pilgrim, 'a pilgrim body walks');
    assert.equal(pilgrim.data.pilgrimDestKey, spawns[0].to,
      'the body is bound for the shrine the spawn event names');
    assert.notEqual(spawns[0].from, spawns[0].to, 'a procession never walks to its own shrine');

    // Ride the leg beside them — inside escort range for the whole walk.
    let ticks = 0;
    while (pilgrim.alive !== false && ticks < 60 * 120) {
      player.pos.x = pilgrim.pos.x; player.pos.z = pilgrim.pos.z;
      sim.step();
      ticks += 1;
    }
    assert.equal(pilgrim.alive === false, true, 'the procession arrives and despawns');
    assert.equal(hails.length, 1, 'the pilgrim asked for company');
    assert.equal(arrivals.length, 1);
    assert.equal(escorts.length, 1);
    const purse = grants.find((g) => g.reason === 'choir_escort_purse');
    assert.ok(purse && purse.amount >= 40, 'the congregation pays the escort purse');
    assert.ok(reps.some((r) => r.delta === 3 && r.reason === 'choir_escort'));
    assert.equal(ensureChoirState(state).pilgrims.escorts, 1);
    assert.equal(grants.filter((g) => g.reason === 'choir_escort_purse').length, 1,
      'the same arrival can never settle twice');
  } finally {
    sim.dispose();
  }
});

test('a post-circuit re-entry is a new crossing — the tithe book cannot skip it', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 4000, 0, 'Vesta Shrine');
    const tithes = events(bus, 'choir:tithePaid');
    const c = ensureChoirState(state);
    state.player.cargo.items = { cmdty_ore_iron: 10 };
    state.player.credits = 5000;

    flyTo(player, 400, 0); sim.step();   // Ceres crossing #1 — paid
    flyTo(player, 4400, 0); sim.step();  // Vesta crossing — the circuit rings
    assert.equal(c.pilgrimage.circuits, 1);
    assert.equal(c.sanctuary.standing, 'marked');
    const receiptsAfterCircuit = c.tithe.receipts.length;

    // The circuit reset cleared every other shrine's stamp. Re-entering Ceres is
    // a genuinely new crossing: the book must write a receipt for it — a stale
    // `key#n` token from before the reset must never swallow the assessment.
    flyTo(player, 9000, 0); sim.step();
    flyTo(player, 400, 0); sim.step();
    assert.equal(c.tithe.receipts.length, receiptsAfterCircuit + 1,
      'the post-circuit crossing is assessed, not deduped by a dead token');
    assert.equal(tithes.at(-1).shrineKey, 'Ceres Shrine');
    assert.equal(tithes.at(-1).kind, 'waived', 'the held mark still waives the due');
  } finally {
    sim.dispose();
  }
});

test('a slain pilgrim is sung — and a player-slayer is written', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 2200, 0, 'Vesta Shrine');
    sim.step();
    const pilgrim = state.entityList.find((e) => e.data?.choirPilgrim === true);
    const reps = events(bus, 'faction:repDelta');
    const lost = events(bus, 'choir:pilgrimLost');
    const sacrilege = events(bus, 'choir:sacrilege');
    pilgrim.alive = false; // every real emitter flips alive before the wire
    bus.emit('entity:killed', {
      id: pilgrim.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: pilgrim.pos.x, z: pilgrim.pos.z },
    });
    const c = ensureChoirState(state);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].byPlayer, true);
    assert.ok(reps.some((r) => r.delta === -8 && r.reason === 'choir_sacrilege:pilgrim'));
    assert.equal(sacrilege.length, 1);
    assert.equal(sacrilege[0].kind, 'pilgrim');
    assert.equal(c.pilgrims.log.at(-1).kind, 'slain');
    // The live record is closed — no escort purse can settle on a dead walk.
    assert.equal(Object.keys(c.pilgrims.live).length, 0);
  } finally {
    sim.dispose();
  }
});

test('a replayed kill books once — one loss, one charge, one row', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 2200, 0, 'Vesta Shrine');
    sim.step();
    const pilgrim = state.entityList.find((e) => e.data?.choirPilgrim === true);
    const reps = events(bus, 'faction:repDelta');
    const lost = events(bus, 'choir:pilgrimLost');
    const sacrilege = events(bus, 'choir:sacrilege');
    const payload = {
      id: pilgrim.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: pilgrim.pos.x, z: pilgrim.pos.z },
    };
    pilgrim.alive = false; // every real emitter flips alive before the wire
    bus.emit('entity:killed', payload);
    bus.emit('entity:killed', payload); // the replay — a doubled wire, not a second death
    bus.emit('entity:killed', payload);
    const c = ensureChoirState(state);
    assert.equal(lost.length, 1, 'one pilgrimLost for one death');
    assert.equal(sacrilege.length, 1);
    assert.equal(c.sacrilege.length, 1);
    assert.equal(reps.filter((r) => r.reason === 'choir_sacrilege:pilgrim').length, 1,
      'one rep charge for one death');
    assert.equal(c.pilgrims.log.filter((r) => r.kind === 'slain').length, 1);
    assert.equal(c.sanctuary.violations, 1);

    // The same law on the faithful: a replayed chorister kill is one sacrilege.
    const victim = chorister(sim, 500, 500);
    const hit = {
      id: victim.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: 500, z: 500 },
    };
    victim.alive = false;
    bus.emit('entity:killed', hit);
    bus.emit('entity:killed', hit);
    assert.equal(c.sacrilege.length, 2, 'the second body books once, no more');
    assert.equal(reps.filter((r) => r.reason === 'choir_sacrilege:chorister').length, 1);

    // A kill receipt naming a still-living body is stale — the id was recycled
    // after the death it describes. Nothing may be written on the living.
    const bystander = chorister(sim, 800, 800);
    bus.emit('entity:killed', {
      id: bystander.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: 800, z: 800 },
    });
    assert.equal(c.sacrilege.length, 2, 'a kill claim on a live body writes nothing');
    assert.equal(reps.filter((r) => r.reason === 'choir_sacrilege:chorister').length, 1);

    // The pilgrim's id, recycled onto a new dead chorister: the pilgrim's
    // sacrilege row must not read as replay — a genuinely second kill books.
    const pilgrimGen = occupantGenerationOf(pilgrim);
    assert.ok(pilgrimGen != null, 'sim spawns stamp the occupant generation');
    const usurper = chorister(sim, 900, 900);
    usurper.occupantGeneration = pilgrimGen + 7;
    state.entities.set(pilgrim.id, usurper);
    usurper.alive = false; // every real emitter flips alive before the wire
    bus.emit('entity:killed', {
      id: pilgrim.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: 900, z: 900 },
    });
    assert.equal(c.sacrilege.length, 3,
      'a recycled id books a new row — the dead pilgrim\'s row is not a replay shield');
    assert.equal(c.sacrilege.at(-1).kind, 'chorister');
  } finally {
    sim.dispose();
  }
});

// ── the heresy ledger ─────────────────────────────────────────────────────────

test('a shrine names its dissenters; silencing one pays the bounty once', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    const marked = events(bus, 'choir:heresyMarked');
    const resolved = events(bus, 'choir:heresyResolved');
    const grants = events(bus, 'economy:grantCredits');
    const reps = events(bus, 'faction:repDelta');

    sim.runTicks(60 * 46);
    assert.equal(marked.length, 1, 'the shrine named the off-note on its clock');
    const heretic = state.entityList.find((e) => e.data?.choirHeretic === true);
    assert.ok(heretic, 'a dissenter body walks');
    assert.ok(heretic.data.hereticName);
    // The shrine itself is a faithful hull: it carries the mark's target.
    const hunters = state.entityList.filter((e) => e.data?.heresyHunt);
    assert.ok(hunters.length > 0 && hunters.every((e) => e.data.heresyHunt.targetId === heretic.id),
      'the faithful carry the mark\'s target');

    heretic.alive = false; // every real emitter flips alive before the wire
    bus.emit('entity:killed', {
      id: heretic.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: heretic.pos.x, z: heretic.pos.z },
    });
    const c = ensureChoirState(state);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].byPlayer, true);
    assert.ok(grants.some((g) => g.amount === 140 && g.reason === 'choir_heresy_bounty'));
    assert.ok(reps.some((r) => r.delta === 5 && r.reason === 'choir_heresy_silenced'));
    assert.equal(c.heresy.resolved, 1);
    assert.equal(c.heresy.marks[0].status, 'silenced');

    // A second kill receipt for the same mark pays nothing more — and mints
    // no fresh row to silence all over again.
    bus.emit('entity:killed', {
      id: heretic.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: 0, z: 0 },
    });
    assert.equal(grants.filter((g) => g.reason === 'choir_heresy_bounty').length, 1,
      'the bounty is once per mark');
    assert.equal(c.heresy.resolved, 1);
    assert.equal(c.heresy.marks.length, 1, 'a replay mints no second mark row');
    assert.equal(resolved.length, 1);
  } finally {
    sim.dispose();
  }
});

test('a recycled id cannot inherit the name — the mark never resolves on the wrong body', () => {
  const { sim, state, bus, player } = boot();
  try {
    const sys = sim.registry.get('choirResonance');
    const target = chorister(sim, 300, 300);
    const mark = sys.markHeretic(target, 'CANTOR VEL, OFF-NOTE');
    assert.ok(mark, 'the mark lands');
    assert.ok(mark.gen != null, 'the mark carries the occupant generation');
    const marks = () => ensureChoirState(state).heresy.marks;
    assert.equal(marks().length, 1);

    // Idempotent: naming the same body twice is the same naming.
    const again = sys.markHeretic(target, 'A DIFFERENT NAME');
    assert.equal(again, mark, 'the open mark is returned, not duplicated');
    assert.equal(marks().length, 1);

    // Forge the recycle at the ledger level: the marked id now resolves to a
    // different body with a different occupant generation — the way a freed id
    // answers on a fresh spawn.
    const usurper = chorister(sim, 900, 900);
    usurper.occupantGeneration = mark.gen + 7;
    state.entities.set(target.id, usurper);
    usurper.alive = false; // the kill receipt names the body the id now answers
    const grants = events(bus, 'economy:grantCredits');
    bus.emit('entity:killed', {
      id: target.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: usurper.pos.x, z: usurper.pos.z },
    });
    const c = ensureChoirState(state);
    assert.equal(mark.status, 'open', 'a kill on a recycled id does not silence the mark');
    assert.equal(grants.filter((g) => g.reason === 'choir_heresy_bounty').length, 0,
      'no bounty on the wrong body');
    assert.equal(c.heresy.resolved, 0);
    assert.equal(marks().length, 1, 'no second mark was minted');

    // The honest ending: with the true body gone the mark slips the liturgy —
    // it lapses; it is never silenced.
    sim.runTicks(5);
    assert.equal(mark.status, 'lapsed');
    assert.equal(marks().length, 1);
  } finally {
    sim.dispose();
  }
});

// ── the ledger survives the save ─────────────────────────────────────────────

test('the book survives a save round-trip — paid routes stay paid, standing keeps its clock', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 4000, 0, 'Vesta Shrine');
    const grants = events(bus, 'economy:grantCredits');
    const charges = events(bus, 'economy:chargeCredits');
    state.player.cargo.items = { cmdty_ore_iron: 10 };
    state.player.credits = 5000;

    flyTo(player, 400, 0); sim.step();
    flyTo(player, 4400, 0); sim.step();
    assert.equal(grants.filter((g) => g.reason === 'choir_pilgrim_leg').length, 1);
    assert.equal(choirStanding(state).standing, 'marked');
    const insideChargeCount = charges.length;

    // The round-trip: serialize the whole record, hand back a foreign copy.
    state.choir = JSON.parse(JSON.stringify(state.choir));
    sim.runTicks(5);
    const c = ensureChoirState(state);
    assert.equal(c.sanctuary.standing, 'marked', 'the mark survives the save');
    assert.ok(Number.isFinite(c.sanctuary.until) && c.sanctuary.until > state.simTime);
    // Parked inside after the restore: the persisted `inside` flag means no
    // phantom crossing — the tithe does not re-levy on restore.
    sim.runTicks(120);
    assert.equal(charges.length, insideChargeCount,
      'a restore inside the shrine cannot re-charge the crossing');

    // Re-walk Vesta→Ceres: the reverse route is a new payable leg; Ceres→Vesta
    // stays spent.
    grants.length = 0;
    flyTo(player, 9000, 0); sim.step();
    flyTo(player, 400, 0); sim.step();
    assert.equal(grants.filter((g) => g.reason === 'choir_pilgrim_leg').length, 1,
      'Vesta to Ceres is the only unpaid route left');
  } finally {
    sim.dispose();
  }
});

test('absent and malformed records normalize to the additive default', () => {
  const { sim, state } = boot();
  try {
    state.choir = 'garbage';
    let c = ensureChoirState(state);
    assert.equal(c.shatters, 0);
    assert.deepEqual(c.tribute, []);
    assert.equal(c.sanctuary.standing, 'none');
    assert.equal(c.pilgrimage.circuits, 0);

    state.choir = {
      sanctuary: { standing: 'wrong', until: 'x' },
      pilgrimage: { visits: 'bad', paidLegs: { leg: 'no' }, legs: 'no' },
      tithe: { receipts: 'no' },
      pilgrims: { live: 'no', log: 'no', sent: -4 },
      heresy: { marks: [{ entityId: 7, status: 'banana', extra: 'junk' }], nextAt: 'no' },
      blessings: { vigil: { until: -5 }, chorister: { until: 100, junk: 1 } },
      offerings: [{ at: 'no', commodityId: 4, junk: true }],
      sacrilege: [{ at: 'no', pos: { x: 'nan' } }],
    };
    c = ensureChoirState(state);
    assert.equal(c.sanctuary.standing, 'none');
    assert.deepEqual(c.pilgrimage.visits, {});
    assert.equal(c.pilgrimage.paidLegs.leg, -1);
    assert.deepEqual(c.tithe.receipts, []);
    assert.deepEqual(c.pilgrims.live, {});
    assert.equal(c.pilgrims.sent, 0, 'a negative count floors to zero');
    assert.equal(c.heresy.marks[0].status, 'open');
    assert.equal(c.heresy.marks[0].extra, undefined, 'junk keys strip off');
    assert.equal(c.blessings.vigil, undefined, 'dead blessings drop');
    assert.equal(c.blessings.chorister.until, 100);
    assert.equal(c.blessings.chorister.junk, undefined);
    assert.equal(c.offerings[0].at, 0);
    assert.equal(c.offerings[0].commodityId, '');
    assert.equal(c.sacrilege[0].pos, null);
    // And the tick runs clean over the repaired record.
    sim.runTicks(10);
  } finally {
    sim.dispose();
  }
});

test('the kill ear is subscribed once — a repeated init cannot double-charge', () => {
  const { sim, bus, player } = boot();
  try {
    const sys = sim.registry.get('choirResonance');
    sys.init(sim.registry.ctx); // a second init must be a no-op for the ear
    const pilgrim = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_choir', pos: { x: 100, z: 100 },
      radius: 12, mass: 30, hull: 100, hullMax: 100, collides: true,
      data: { choirPilgrim: true, pilgrimName: 'PILGRIM · LAUDS' },
    });
    const reps = events(bus, 'faction:repDelta');
    const sacrilege = events(bus, 'choir:sacrilege');
    pilgrim.alive = false; // every real emitter flips alive before the wire
    bus.emit('entity:killed', {
      id: pilgrim.id, killerId: player.id, factionId: 'faction_choir',
      type: 'ship', pos: { x: 100, z: 100 },
    });
    assert.equal(reps.filter((r) => r.reason === 'choir_sacrilege:pilgrim').length, 1,
      'one loss, one charge');
    assert.equal(sacrilege.length, 1);
  } finally {
    sim.dispose();
  }
});

// ── the mode gate: sector rites only move while the player is flying ──────────

test('non-flight modes freeze the rites but the bells still ring', () => {
  const { sim, state, bus, player } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_choir',
      pos: { x: 0, z: 0 }, radius: 22, mass: 90, hull: 500, hullMax: 500,
      collides: true, data: { choirBell: true },
    });
    const pulses = events(bus, 'choir:bellPulse');
    const visits = events(bus, 'choir:pilgrimVisit');
    const marked = events(bus, 'choir:heresyMarked');
    state.player.cargo.items = { cmdty_ore_iron: 10 };
    flyTo(player, 400, 0);

    state.mode = 'loading'; // sim still steps; the pilot has no agency
    sim.runTicks(60 * 50);
    assert.ok(pulses.length > 0, 'the bell speaks through the veil');
    assert.equal(visits.length, 0, 'a crossing with no pilot agency stamps nothing');
    assert.equal(marked.length, 0, 'no heretic is named while the world is between modes');
    assert.equal(ensureChoirState(state).tithe.receipts.length, 0, 'no levy without a rite');

    state.mode = 'flight';
    sim.step();
    assert.equal(visits.length, 1, 'the first real crossing lands once flying resumes');
  } finally {
    sim.dispose();
  }
});

// ── re-entrancy: the latch must hold while the event is still flying ───────────

test('a listener stepping the choir mid-emit cannot re-levy the crossing', () => {
  const { sim, state, bus, player } = boot();
  try {
    const sys = sim.registry.get('choirResonance');
    shrine(sim, 0, 0, 'Ceres Shrine');
    state.player.cargo.items = { cmdty_ore_iron: 10 };
    state.player.credits = 5000;
    const charges = events(bus, 'economy:chargeCredits');
    const tithes = events(bus, 'choir:tithePaid');
    const visits = events(bus, 'choir:pilgrimVisit');
    // The hostile listener: while the assessed event is still on the wire it
    // steps the whole system again — the crossing must already be settled,
    // not halfway spoken.
    let reentered = 0;
    bus.on('choir:titheAssessed', () => {
      reentered += 1;
      if (reentered === 1) sys.update(1 / 60, state); // once: a wire tap, not a fork bomb
    });
    flyTo(player, 400, 0);
    sim.step();
    assert.equal(reentered, 1, 'the tap really did re-enter the system mid-emit');
    assert.equal(visits.length, 1, 'the crossing edge itself fires once');
    assert.equal(charges.length, 1, 'the levy books once, even stepped mid-emit');
    assert.equal(tithes.length, 1);
    const c = ensureChoirState(state);
    assert.equal(c.tithe.receipts.length, 1);
    assert.equal(c.pilgrimage.stampSeq, 1, 'one stamp for one crossing');
  } finally {
    sim.dispose();
  }
});

test('a listener stepping the choir mid-shatter cannot break one crystal twice', () => {
  const { sim, state, bus } = boot();
  try {
    const sys = sim.registry.get('choirResonance');
    sim.spawn({
      type: 'asteroid', team: 0, pos: { x: 300, z: 0 }, radius: 14, mass: 200,
      hull: 100, hullMax: 100, collides: true,
      data: { material: 'crystal', typeId: 'ast_crystalline', choirHumAt: -100, choirHumDur: 1 },
    });
    const shatters = events(bus, 'choir:crystalShattered');
    let reentered = 0;
    bus.on('choir:crystalShattered', () => {
      reentered += 1;
      if (reentered === 1) sys.update(1 / 60, state);
    });
    sim.step();
    assert.equal(reentered, 1);
    assert.equal(shatters.length, 1, 'one shatter event for one crystal');
    assert.equal(ensureChoirState(state).shatters, 1);
  } finally {
    sim.dispose();
  }
});

test('a listener stepping the choir mid-spawn cannot mint a second pilgrim or heretic', () => {
  const { sim, state, bus } = boot();
  try {
    const sys = sim.registry.get('choirResonance');
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 2200, 0, 'Vesta Shrine');
    // The hostile listener: while `entity:spawned` is still on the wire — inside
    // helpers.spawnEntity, before either spawn clock has moved — it steps the
    // whole system again. Both spawn gates must already read shut.
    let reentered = 0;
    bus.on('entity:spawned', () => {
      reentered += 1;
      if (reentered === 1) sys.update(1 / 60, state);
    });
    const pilgrimSpawns = events(bus, 'choir:pilgrimSpawn');
    sim.step();
    assert.equal(reentered, 1, 'the tap really did re-enter mid-spawn');
    assert.equal(pilgrimSpawns.length, 1, 'one due spawn is one pilgrim, not two');
    assert.equal(state.entityList.filter((e) => e.data?.choirPilgrim === true).length, 1);
    assert.equal(ensureChoirState(state).pilgrims.sent, 1);

    // The heresy clock is the same law: the mark gate latches before the body
    // speaks, so re-entry inside its own `entity:spawned` mints no horde.
    reentered = 0;
    const marked = events(bus, 'choir:heresyMarked');
    sim.runTicks(60 * 46);
    assert.equal(marked.length, 1, 'one off-note on the clock, even stepped mid-emit');
    assert.equal(state.entityList.filter((e) => e.data?.choirHeretic === true).length, 1);
    assert.equal(ensureChoirState(state).heresy.marks.filter((m) => m.status === 'open').length, 1);
  } finally {
    sim.dispose();
  }
});

test('a listener stepping the choir mid-arrival cannot speak the arrival twice', () => {
  const { sim, state, bus } = boot();
  try {
    const sys = sim.registry.get('choirResonance');
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 900, 0, 'Vesta Shrine');
    const arrivals = events(bus, 'choir:pilgrimArrived');
    let reentered = 0;
    bus.on('choir:pilgrimArrived', () => {
      reentered += 1;
      if (reentered === 1) sys.update(1 / 60, state);
    });
    sim.runTicks(60 * 40); // the walk settles itself; no escort needed
    assert.equal(reentered, 1, 'the tap really did re-enter mid-arrival');
    assert.equal(arrivals.length, 1, 'the arrival is spoken once');
    const c = ensureChoirState(state);
    assert.equal(c.pilgrims.log.filter((r) => r.kind === 'arrived').length, 1,
      'the book writes one arrival row');
  } finally {
    sim.dispose();
  }
});

test('a broken rng cannot crash the spawn picks or mint a NaN body', () => {
  const { sim, state } = boot();
  try {
    shrine(sim, 0, 0, 'Ceres Shrine');
    shrine(sim, 2200, 0, 'Vesta Shrine');
    for (const bad of [() => 1, () => Number.NaN, () => 7.5]) {
      state.rng = bad;
      state.choir = undefined; // fresh book per rng flavour
      sim.step();
      const pilgrim = state.entityList.find((e) => e.data?.choirPilgrim === true);
      assert.ok(pilgrim, 'the procession still walks on a dead rng');
      assert.ok(Number.isFinite(pilgrim.pos.x) && Number.isFinite(pilgrim.pos.z),
        'a broken draw never reaches the body');
    }
    // The heretic pick obeys the same law.
    state.rng = () => 1;
    const c = ensureChoirState(state);
    c.heresy.nextAt = 0; // already due — a past clock, not the -1 reset signal
    sim.step();
    const heretic = state.entityList.find((e) => e.data?.choirHeretic === true);
    assert.ok(heretic, 'a due mark still names a body on a dead rng');
    assert.ok(Number.isFinite(heretic.pos.x) && Number.isFinite(heretic.pos.z));
    assert.ok(Number.isFinite(heretic.data.hereticFlee.x)
      && Number.isFinite(heretic.data.hereticFlee.z));
  } finally {
    sim.dispose();
  }
});

test('a dissenter parked exactly on its flee point keeps drifting', () => {
  const { sim, state } = boot();
  try {
    const sys = sim.registry.get('choirResonance');
    const heretic = chorister(sim, 500, 500);
    heretic.data.hereticFlee = { x: 500, z: 500 }; // landed dead on the point
    sys._marchHeretic(state, heretic, 1 / 60);
    const d = heretic.data.hereticFlee;
    assert.ok(d.x !== 500 || d.z !== 500,
      'the drift re-extends on a real bearing, never the same point');
    const reach = Math.hypot(d.x - 500, d.z - 500);
    assert.ok(Math.abs(reach - 2400) < 1, 'the extension is one full drift out');
  } finally {
    sim.dispose();
  }
});
