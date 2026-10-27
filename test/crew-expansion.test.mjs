// EXP-25 — crew is a company: sign-on fees, day wages on the world calendar, morale that moves
// on deaths/paydays/homecomings/shore leave, strikes and walkouts when the pay stops, hazard-pay
// demands at morale zero, veteran ranks that grow the perk, and role salvage favors on kills.
//
// These tests pin: the economy-intent money paths (charge emit, never a direct write), the
// latch-before-emit ordering on strikes/settlements/walkouts, perk magnitude bookkeeping that
// cannot drift across a rank-up, dockside decision offers, loyalty's strike/walk exemption,
// seeded salvage determinism, and hostile-save healing for every new field.

import test from 'node:test';
import assert from 'node:assert/strict';

import { crew } from '../src/systems/crew.js';
import { CREW_CANDIDATES, CREW_CAP, CREW_LAW, CREW_ROLES } from '../src/data/crew.js';
import { LONG_BERTH_STATION_ID } from '../src/data/longBerth.js';
import { hash32 } from '../src/core/rng.js';

function makeBus() {
  const emitted = [];
  const handlers = new Map();
  return {
    emitted,
    emit(evt, p) { emitted.push({ evt, p }); (handlers.get(evt) || []).forEach((fn) => fn(p)); },
    on(evt, fn) { const l = handlers.get(evt) || []; l.push(fn); handlers.set(evt, l); return () => {}; },
  };
}

function makeState({ berthStage = 3, credits = 50000 } = {}) {
  const entities = new Map();
  const entityList = [];
  const player = { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 };
  entities.set(player.id, player); entityList.push(player);
  const stations = [];
  for (const [i, c] of CREW_CANDIDATES.entries()) {
    const st = {
      id: 100 + i, type: 'station', alive: true,
      pos: { x: 50 + i * 2000, z: 5000 }, radius: 40,
      data: { stationId: c.homeStationId },
    };
    entities.set(st.id, st); entityList.push(st); stations.push(st);
  }
  return {
    simTime: 1000, tick: 60000, days: 1,
    playerId: 'player',
    entities, entityList,
    entityIndex: { stations, collidables: entityList },
    player: {
      credits,
      efficiencyMods: { shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, jumpCooldownMult: 1 },
    },
    ui: { docked: false },
    longBerth: { claimed: true, stage: berthStage, trophies: [], towedIds: [] },
    world: { currentSectorId: 'sector_ceres_belt' },
  };
}

function wire(state) {
  const bus = makeBus();
  const sys = Object.create(crew);
  const ships = { recomputed: 0, recomputeActiveShip() { this.recomputed += 1; } };
  sys.init({ state, bus, registry: { get: (id) => (id === 'ships' ? ships : null) } });
  return { bus, sys, ships };
}

function member(state, id) {
  return state.crew.members.find((m) => m.id === id) || null;
}
function charges(bus) {
  return bus.emitted.filter((e) => e.evt === 'economy:chargeCredits').map((e) => e.p);
}
function grants(bus) {
  return bus.emitted.filter((e) => e.evt === 'economy:grantCredits').map((e) => e.p);
}
function decisions(bus) {
  return bus.emitted.filter((e) => e.evt === 'crew:decisionOffer').map((e) => e.p);
}
function cand(id) {
  return CREW_CANDIDATES.find((c) => c.id === id);
}
/** A kill id whose seeded salvage roll lands under `chance` for `memberId` — deterministic. */
function killIdThatPays(memberId, chance, from = 1) {
  for (let i = from; i < from + 100000; i++) {
    if ((hash32('crewSalvage', String(i), memberId) % 1000) / 1000 < chance) return i;
  }
  throw new Error('no paying kill id found');
}

// ---- sign-on fee ----------------------------------------------------------------------------

test('hiring charges the authored sign-on fee through the economy intent, after the roster latches', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  const bram = cand('crew_bram');
  let sawMemberBeforeCharge = false;
  bus.on('economy:chargeCredits', (p) => {
    if (p.reason === 'crew:signon:crew_bram' && member(state, 'crew_bram')) sawMemberBeforeCharge = true;
  });
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  assert.equal(member(state, 'crew_bram') != null, true);
  const fee = charges(bus).find((p) => p.reason === 'crew:signon:crew_bram');
  assert.equal(fee.amount, bram.signOnCr);
  assert.equal(sawMemberBeforeCharge, true, 'the hire is on the roster before money moves');
});

test('a short purse cannot sign — hire denies with a reason and no roster or sheet change', () => {
  const state = makeState({ credits: 100 });
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' }); // 550 to sign
  assert.equal(state.crew.members.length, 0);
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1);
  const denied = bus.emitted.find((e) => e.evt === 'crew:hireDenied');
  assert.equal(denied.p.reason, 'credits');
  assert.equal(charges(bus).length, 0);
});

// ---- payday ---------------------------------------------------------------------------------

test('payday charges the live payroll once per day:tick and lifts morale', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  const beforeMorale = member(state, 'crew_bram').morale;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  const wage = charges(bus).find((p) => p.reason === 'crew:wages:2');
  assert.equal(wage.amount, cand('crew_bram').wageCr + cand('crew_marko').wageCr);
  assert.equal(member(state, 'crew_bram').morale, beforeMorale + 1);
  assert.equal(state.crew.unpaidDays, 0);
  assert.equal(state.crew.backPay, 0);
  // A multi-day catch-up charges per elapsed day.
  bus.emit('day:tick', { days: 5, elapsed: 3 });
  const multi = charges(bus).find((p) => p.reason === 'crew:wages:5');
  assert.equal(multi.amount, 3 * (cand('crew_bram').wageCr + cand('crew_marko').wageCr));
});

test('a missed payday accrues back pay, drops non-loyal morale, and grumbles — never charges', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 10; // purse too short to meet payroll
  const grumbles = () => bus.emitted.filter(
    (e) => e.evt === 'comms:popup' && e.p.sender === 'Bram Okafor' && /packet|weld/i.test(e.p.text),
  );
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  assert.equal(state.crew.unpaidDays, 1);
  assert.equal(state.crew.backPay, cand('crew_bram').wageCr);
  assert.equal(member(state, 'crew_bram').morale, CREW_LAW.MORALE_START - 3);
  assert.equal(grumbles().length >= 1, true, 'the missed packet is spoken');
  assert.equal(charges(bus).filter((p) => /wages/.test(p.reason)).length, 0, 'no silent charge');
});

test('payday settles accrued back pay when the purse recovers', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  assert.equal(state.crew.backPay, 160);
  state.player.credits = 5000;
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  const settle = charges(bus).find((p) => p.reason === 'crew:wages:3');
  assert.equal(settle.amount, 160 + 160, 'current day plus the day on the tab');
  assert.equal(state.crew.backPay, 0);
  assert.equal(state.crew.unpaidDays, 0);
});

// ---- strike ---------------------------------------------------------------------------------

test('two missed days start a strike — non-loyal perks come off before crew:strike speaks', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' }); // engineer, shieldRegenMult
  bus.emit('crew:hire', { candidateId: 'crew_marko' }); // gunner, energyRegenMult
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1.08);
  let sheetAtStrikeEmit = null;
  bus.on('crew:strike', () => { sheetAtStrikeEmit = state.player.efficiencyMods.shieldRegenMult; });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  assert.equal(state.crew.strikeSince, null, 'one missed day grumbles but does not strike');
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  assert.equal(state.crew.strikeSince !== null, true, 'the second missed day downs tools');
  assert.equal(sheetAtStrikeEmit, 1, 'perks were off the sheet before crew:strike was heard');
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1);
  assert.equal(state.player.efficiencyMods.energyRegenMult, 1);
  assert.equal(state.crew.backPay, 2 * (160 + 180));
});

test('a loyal member never strikes — their perk stays and they cannot walk', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  member(state, 'crew_marko').loyalty = 1; // loyalty job done
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  assert.equal(state.crew.strikeSince !== null, true);
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1, 'Bram struck');
  assert.equal(state.player.efficiencyMods.energyRegenMult, 1.08, 'Marko keeps the feed warm');
  // Refusing at the dock walks only the non-loyal.
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'refuse' });
  assert.equal(member(state, 'crew_bram'), null);
  assert.equal(member(state, 'crew_marko') != null, true, 'loyal crew does not walk');
  assert.ok(state.crew.lostIds.includes('crew_bram'));
  assert.equal(state.player.efficiencyMods.energyRegenMult, 1.08, 'loyal perk untouched by the walkout');
});

test('a strike cannot begin on an all-loyal roster — back pay just accrues', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  member(state, 'crew_bram').loyalty = 1;
  state.player.credits = 0;
  for (let d = 2; d <= 5; d++) bus.emit('day:tick', { days: d, elapsed: 1 });
  assert.equal(state.crew.strikeSince, null);
  assert.equal(state.crew.backPay, 4 * 160);
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1.08, 'loyal crew keeps working');
});

test('the docked strike card offers pay/refuse/defer and settles through crew:decide', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  assert.equal(state.crew.strikeSince !== null, true);
  // In flight the card stays down.
  for (let i = 0; i < 3; i++) sys.update(2.0, state);
  assert.equal(decisions(bus).at(-1).visible, false);
  // Docked, the confrontation posts.
  state.ui.docked = true;
  sys.update(2.0, state);
  const offer = decisions(bus).at(-1);
  assert.equal(offer.visible, true);
  assert.equal(offer.offerId, 'wages');
  assert.equal(offer.owed, 2 * 160);
  assert.deepEqual(offer.choices.map((ch) => ch.id), ['pay', 'refuse', 'defer']);
  // A stale quote re-quotes instead of settling worse terms.
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'pay', owed: 1 });
  assert.equal(state.crew.strikeSince !== null, true, 'stale card cannot settle');
  // Pay at the posted number: perks return before the receipt events speak.
  state.player.credits = 5000;
  let sheetAtSettle = null;
  bus.on('crew:strikeSettled', () => { sheetAtSettle = state.player.efficiencyMods.shieldRegenMult; });
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'pay', owed: 2 * 160 });
  const settle = charges(bus).find((p) => p.reason === 'crew:wages:settle');
  assert.equal(settle.amount, 320);
  assert.equal(state.crew.strikeSince, null);
  assert.equal(sheetAtSettle, 1.08, 'the perk was folded back before the settled event');
  assert.equal(member(state, 'crew_bram').morale, CREW_LAW.MORALE_SETTLED);
});

test('a short purse cannot settle — the crew waits and the offer re-posts', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  state.player.credits = 100; // short of 320 owed
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'pay', owed: 320 });
  assert.equal(state.crew.strikeSince !== null, true, 'still out');
  assert.equal(charges(bus).filter((p) => /wages/.test(p.reason)).length, 0);
  state.ui.docked = true;
  sys.update(2.0, state);
  assert.equal(decisions(bus).at(-1).visible, true, 'the picket card re-posts while docked');
});

test('refusing the picket walks every non-loyal member — once, with no perk double-count', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  const sheetBefore = state.player.efficiencyMods.shieldRegenMult; // 1 — perks already off
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'refuse' });
  assert.equal(state.crew.members.length, 0);
  assert.equal(state.player.efficiencyMods.shieldRegenMult, sheetBefore,
    'the walkers took no second bite off the sheet');
  const quits = bus.emitted.filter((e) => e.evt === 'crew:quit');
  assert.equal(quits.length, 2);
  // A stale decide cannot walk them twice.
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'refuse' });
  assert.equal(bus.emitted.filter((e) => e.evt === 'crew:quit').length, 2);
});

test('nobody signs onto a picket line — hire denies while the strike is on', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  state.player.credits = 50000;
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  assert.equal(member(state, 'crew_marko'), null);
  const denied = bus.emitted.filter((e) => e.evt === 'crew:hireDenied').at(-1);
  assert.equal(denied.p.reason, 'strike');
});

// ---- hazard demands -------------------------------------------------------------------------

test('a morale-zero member demands hazard pay at the dock — paid settles, refused walks', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  const marko = member(state, 'crew_marko');
  sys._morale(marko, -6); // deaths can drive morale to zero independent of wages
  assert.equal(marko.demandPending, true);
  state.ui.docked = true;
  sys.update(2.0, state);
  const offer = decisions(bus).at(-1);
  assert.equal(offer.offerId, 'demand:crew_marko');
  assert.equal(offer.owed, Math.ceil((cand('crew_marko').wageCr * 2) / 10) * 10);
  // Refuse — Marko takes the ramp.
  bus.emit('crew:decide', { offerId: 'demand:crew_marko', choiceId: 'refuse' });
  assert.equal(member(state, 'crew_marko'), null);
  assert.ok(state.crew.lostIds.includes('crew_marko'));
  const quit = bus.emitted.filter((e) => e.evt === 'crew:quit').at(-1);
  assert.equal(quit.p.reason, 'demand');
});

test('paying the demand banks morale and a thanks — and never pays twice', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  const marko = member(state, 'crew_marko');
  sys._morale(marko, -6);
  const amt = Math.ceil((cand('crew_marko').wageCr * 2) / 10) * 10;
  bus.emit('crew:decide', { offerId: 'demand:crew_marko', choiceId: 'pay' });
  const hazard = charges(bus).find((p) => p.reason === 'crew:hazard:crew_marko');
  assert.equal(hazard.amount, amt);
  assert.equal(marko.morale, CREW_LAW.MORALE_PAID);
  assert.equal(marko.demandPending, false);
  bus.emit('crew:decide', { offerId: 'demand:crew_marko', choiceId: 'pay' });
  assert.equal(charges(bus).filter((p) => /hazard/.test(p.reason)).length, 1, 'the latch holds');
});

// ---- morale drivers -------------------------------------------------------------------------

test('a hull-down shakes everyone — loyal hands take it better', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  member(state, 'crew_marko').loyalty = 1;
  bus.emit('player:death', {});
  assert.equal(member(state, 'crew_bram').morale, CREW_LAW.MORALE_START - 2);
  assert.equal(member(state, 'crew_marko').morale, CREW_LAW.MORALE_START - 1);
});

test('docking a member\'s home station is shore leave — morale up, once per day', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' }); // home: station_ceres
  const bram = member(state, 'crew_bram');
  bram.morale = 4;
  bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(bram.morale, 6);
  assert.equal(bram.shoreDay, 1);
  const shoreLines = bus.emitted.filter(
    (e) => e.evt === 'comms:popup' && /Ceres dust/.test(e.p.text),
  );
  assert.equal(shoreLines.length, 1);
  bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(bram.morale, 6, 'one visit per day');
  assert.equal(shoreLines.length, 1);
  state.days = 2;
  bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(bram.morale, 8, 'a fresh day brings a fresh visit');
  // A foreign dock does nothing.
  bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(bram.morale, 8);
});

// ---- veteran ranks --------------------------------------------------------------------------

test('witnessed events grow xp — rank-up re-folds the perk at the new magnitude', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' }); // engineer, base +0.08
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1.08);
  for (let i = 0; i < CREW_LAW.VET_XP[0]; i++) {
    bus.emit('entity:killed', { id: 9000 + i, killerId: 'player' });
  }
  const bram = member(state, 'crew_bram');
  assert.equal(bram.vet, 1);
  assert.ok(Math.abs(state.player.efficiencyMods.shieldRegenMult - 1.10) < 1e-9,
    'rank 1 grew the weld: +0.08 → +0.10');
  const promo = bus.emitted.filter((e) => e.evt === 'crew:promoted');
  assert.equal(promo.length, 1);
  assert.equal(promo[0].p.rank, 'rated');
  // And a later casualty removes exactly the grown delta — no sheet drift.
  bus.emit('player:death', {});
  assert.ok(Math.abs(state.player.efficiencyMods.shieldRegenMult - 1.0) < 1e-9,
    'the injured vet takes the whole +0.10 off, not the old +0.08');
});

test('veteran salvage rides kills — seeded, rate-limited, and silent while green or out', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_yella' }); // quartermaster
  const yella = member(state, 'crew_yella');
  const spec = CREW_ROLES.quartermaster.salvage;
  // Green hands do not skim.
  const id1 = killIdThatPays('crew_yella', spec.chance + 0.04);
  bus.emit('entity:killed', { id: id1, killerId: 'player' });
  assert.equal(grants(bus).length, 0, 'vet 0 never skims');
  yella.vet = 1;
  bus.emit('entity:killed', { id: id1, killerId: 'player' });
  assert.equal(grants(bus).length, 1);
  const g = grants(bus)[0];
  const h = hash32('crewSalvage', String(id1), 'crew_yella');
  assert.equal(g.amount, spec.base + ((h >>> 10) % spec.jitter) + 3,
    'the grant is the authored formula — seeded over the kill id');
  assert.equal(g.reason, 'crew:salvage:quartermaster');
  // The gap clock bounds the drip.
  const id2 = killIdThatPays('crew_yella', spec.chance + 0.04, id1 + 1);
  bus.emit('entity:killed', { id: id2, killerId: 'player' });
  assert.equal(grants(bus).length, 1, 'inside the salvage gap, no second grant');
  state.simTime += CREW_LAW.SALVAGE_GAP_S + 1;
  bus.emit('entity:killed', { id: id2, killerId: 'player' });
  assert.equal(grants(bus).length, 2, 'past the gap the crew works again');
});

test('a veteran engineer shortens a shipmate\'s field recovery but cannot treat himself', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_marko' }); // roster order: takes the first hit
  bus.emit('crew:hire', { candidateId: 'crew_bram' });  // engineer, vet 2 → 30% faster mend
  member(state, 'crew_bram').vet = 2;
  bus.emit('player:death', {});
  const hurt = member(state, 'crew_marko');
  assert.equal(hurt.status, 'injured');
  const mendS = 600 * (1 - 0.15 * 2); // 420 s with a vet-2 engineer aboard
  hurt.injuredAt = state.simTime - (mendS - 10);
  sys.update(0.1, state);
  assert.equal(hurt.status, 'injured', 'not yet mended inside the short window');
  hurt.injuredAt = state.simTime - (mendS + 1);
  sys.update(0.1, state);
  assert.equal(hurt.status, 'active', 'the engineer cut the mend short');
});

test('an engineer\'s own rank does not count toward his own recovery', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });  // first member — takes the hit
  bus.emit('crew:hire', { candidateId: 'crew_marko' }); // not an engineer
  const bram = member(state, 'crew_bram');
  bram.vet = 3; // 45% — if it counted, his recovery would be ~330 s
  bus.emit('player:death', {});
  assert.equal(bram.status, 'injured');
  bram.injuredAt = state.simTime - (600 * (1 - 0.15 * 3) + 10);
  sys.update(0.1, state);
  assert.equal(bram.status, 'injured', 'past his own vet-scaled time, still on the table');
  bram.injuredAt = state.simTime - 601;
  sys.update(0.1, state);
  assert.equal(bram.status, 'active', 'the unaided 600 s recovery still lands');
});

// ---- banter + strike interplay ----------------------------------------------------------------

test('low-morale banter grumbles, and strikers do not banter at all', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  const marko = member(state, 'crew_marko');
  marko.morale = 2;
  bus.emit('entity:killed', { id: 42, killerId: 'player' });
  const line = bus.emitted.find(
    (e) => e.evt === 'comms:popup' && e.p.sender === 'Marko Vane' && e.p.category === 'ambient',
  );
  assert.match(line.p.text, /patience|Hull broke/i, 'the grumble variant speaks at low morale');
  // Put the roster out on strike — Marko stops talking entirely.
  state.crew.strikeSince = state.simTime;
  state.simTime += 60;
  const before = bus.emitted.filter((e) => e.evt === 'comms:popup' && e.p.sender === 'Marko Vane').length;
  bus.emit('entity:killed', { id: 43, killerId: 'player' });
  assert.equal(
    bus.emitted.filter((e) => e.evt === 'comms:popup' && e.p.sender === 'Marko Vane').length,
    before,
    'the picket line is not chatty',
  );
});

// ---- injuries inside a strike -----------------------------------------------------------------

test('an injury during a strike keeps the sheet honest — heal waits for the picket to end', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  assert.equal(state.crew.strikeSince !== null, true);
  bus.emit('player:death', {});
  const bram = member(state, 'crew_bram');
  assert.equal(bram.status, 'injured');
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1, 'already off — no double count');
  // Field recovery lands mid-strike but the perk stays off until the settle.
  bram.injuredAt = state.simTime - 601;
  sys.update(0.1, state);
  assert.equal(bram.status, 'active');
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1, 'healed into the picket, not onto the sheet');
  state.player.credits = 1000;
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'pay', owed: Math.round(state.crew.backPay) });
  assert.equal(state.player.efficiencyMods.shieldRegenMult, 1.08, 'the settle folds him back');
});

// ---- save envelope ----------------------------------------------------------------------------

test('the wage ledger, strike and ranks survive the save envelope', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  bus.emit('crew:hire', { candidateId: 'crew_marko' });
  member(state, 'crew_bram').vet = 2;
  member(state, 'crew_bram').xp = 15;
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  member(state, 'crew_bram').morale = 3; // a mid-range value after the strike drivers ran
  const snapshot = JSON.parse(JSON.stringify(sys.serialize()));
  const cold = makeState();
  const sys2 = Object.create(crew);
  sys2.init({ state: cold, bus: makeBus(), registry: { get: () => null } });
  sys2.deserialize(snapshot);
  assert.equal(cold.crew.strikeSince, state.crew.strikeSince);
  assert.equal(cold.crew.backPay, 2 * (160 + 180));
  assert.equal(cold.crew.unpaidDays, 2);
  const bram = cold.crew.members.find((m) => m.id === 'crew_bram');
  assert.equal(bram.vet, 2);
  assert.equal(bram.xp, 15);
  assert.equal(bram.morale, 3);
  // A striking Bram's expected sheet contribution is zero — perkDelta heals, not drifts.
  assert.equal(bram.perkDelta, 0);
  const marko = cold.crew.members.find((m) => m.id === 'crew_marko');
  assert.equal(marko.perkDelta, 0, 'struck too');
});

test('hostile slices heal every new field to a bounded value', () => {
  const cold = makeState();
  const sys2 = Object.create(crew);
  sys2.init({ state: cold, bus: makeBus(), registry: { get: () => null } });
  sys2.deserialize({
    strikeSince: 'picket',
    unpaidDays: -4,
    backPay: 1e12,
    lastSalvageAt: 'recently',
    members: [
      { id: 'crew_bram', vet: 99, xp: -7, morale: -5, demandPending: true, loyalty: 1, status: 'lost' },
      { id: 'crew_marko', vet: 2, morale: 4, perkDelta: 99 },
    ],
    lostIds: [],
  });
  assert.equal(cold.crew.strikeSince, null, 'a non-finite strike heals to none');
  assert.equal(cold.crew.unpaidDays, 0);
  assert.equal(cold.crew.backPay, CREW_LAW.BACK_PAY_CAP, 'owed wages cap');
  assert.equal(cold.crew.lastSalvageAt, -1e9);
  // The 'lost' member left the roster and joined the lost list.
  assert.equal(cold.crew.members.length, 1);
  assert.ok(cold.crew.lostIds.includes('crew_bram'));
  const marko = cold.crew.members[0];
  assert.equal(marko.vet, 2);
  // Marko is non-loyal and active — his expected sheet contribution is the authored delta.
  const expected = CREW_ROLES.gunner.perk.delta * (1 + CREW_LAW.VET_PERK_STEP * 2);
  assert.ok(Math.abs(marko.perkDelta - expected) < 1e-9, 'forged perkDelta recomputed');
});

test('a hostile strike flag with an all-loyal roster heals away', () => {
  const cold = makeState();
  const sys2 = Object.create(crew);
  sys2.init({ state: cold, bus: makeBus(), registry: { get: () => null } });
  sys2.deserialize({
    strikeSince: 1234,
    members: [{ id: 'crew_bram', loyalty: 1, status: 'active', role: 'engineer' }],
  });
  assert.equal(cold.crew.strikeSince, null, 'nobody is on the line');
  const bram = cold.crew.members[0];
  assert.ok(Math.abs(bram.perkDelta - CREW_ROLES.engineer.perk.delta) < 1e-9,
    'a working loyal member\'s contribution recomputes as on-sheet');
});

// ---- re-entrancy ------------------------------------------------------------------------------

test('a re-entrant decide inside the settle charge cannot settle twice', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  state.player.credits = 5000;
  bus.on('economy:chargeCredits', (p) => {
    if (p.reason === 'crew:wages:settle') {
      // The listener re-fires the same verb mid-emit — the latch already holds.
      bus.emit('crew:decide', { offerId: 'wages', choiceId: 'pay', owed: 320 });
    }
  });
  bus.emit('crew:decide', { offerId: 'wages', choiceId: 'pay', owed: 320 });
  assert.equal(charges(bus).filter((p) => p.reason === 'crew:wages:settle').length, 1);
  assert.equal(bus.emitted.filter((e) => e.evt === 'crew:strikeSettled').length, 1);
});

test('a re-entrant hire inside the sign-on charge cannot double-sign', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.on('economy:chargeCredits', (p) => {
    if (p.reason === 'crew:signon:crew_bram') bus.emit('crew:hire', { candidateId: 'crew_bram' });
  });
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  assert.equal(state.crew.members.length, 1);
});

// ---- new game / empty roster ------------------------------------------------------------------

test('a day:tick on an empty roster resets the wage ledger quietly', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  state.crew.unpaidDays = 3;
  state.crew.backPay = 700;
  state.crew.strikeSince = 50;
  bus.emit('day:tick', { days: 4, elapsed: 1 });
  assert.equal(state.crew.unpaidDays, 0);
  assert.equal(state.crew.backPay, 0);
  assert.equal(state.crew.strikeSince, null);
  assert.equal(charges(bus).length, 0);
});

test('New Game mints a clean company — no inherited strike, ledger, or demands', () => {
  const state = makeState();
  const { bus, sys } = wire(state);
  bus.emit('crew:hire', { candidateId: 'crew_bram' });
  state.player.credits = 0;
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  bus.emit('day:tick', { days: 3, elapsed: 1 });
  assert.equal(state.crew.strikeSince !== null, true);
  state.crew = undefined; // newGameBoot swaps the slice
  sys.update(0.1, state);
  assert.deepEqual(state.crew.members, []);
  assert.equal(state.crew.strikeSince, null);
  assert.equal(state.crew.backPay, 0);
  // The reset roster does not grumble a debt it never had.
  bus.emit('day:tick', { days: 4, elapsed: 1 });
  assert.equal(state.crew.unpaidDays, 0);
});
