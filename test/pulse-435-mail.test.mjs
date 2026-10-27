// PULSE-MAIL (build_map row 435) — done-when:
//   An inbox gets cast letters, job offers, spam in the house voice, fan and hate mail after
//   feats, bills, and letters for Maera Vols's lost crew. ≥120 letters, each triggered by a
//   real event or a time window; nothing arrives untriggered.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAIL_EVENT_NAMES,
  MAIL_KINDS,
  MAIL_LETTERS,
} from '../src/data/mail.js';
import {
  mail,
  mailLetterDue,
  mailTriggerSatisfied,
} from '../src/systems/mail.js';
import { recordDeed } from '../src/systems/deedRecord.js';
import { DEED_KINDS } from '../src/systems/deedRecord.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { FACTION_KITS } from '../src/data/factions/index.js';
import { SHIPS } from '../src/data/ships.js';
import { SECTORS } from '../src/data/sectors.js';
import { FIGURES } from '../src/data/narrative.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { configureRacingCorridorSession, isRacingCorridorSession } from '../src/world/racingCorridor.js';
import { MAIL_DAY_S } from '../src/data/mail.js';


const CMDTY = new Set(COMMODITIES.map((c) => c.id));
const FACTION = new Set(Object.values(FACTION_KITS).map((k) => k.id));
const SHIP_IDS = new Set(SHIPS.map((s) => s.id));
const STATION_IDS = new Set(SECTORS.flatMap((s) => (s.stations || []).map((st) => st.id)));
const STATS = new Set([
  'lifetimeProfit', 'tradesCount', 'biggestSingleProfit', 'smuggledValue',
  'kills', 'missionsDone', 'totalPassiveEarnedLifetime', 'creditsEarned',
]);
const EVENT_NAME_SET = new Set(MAIL_EVENT_NAMES);
// A letter must carry at least one "real event" (bus witness or deed record) or a time
// window/day conjunct — the done-when's "nothing arrives untriggered".
const OCCURRENCE_TYPES = new Set(['event', 'day', 'window', 'deed']);

function baseState(over = {}) {
  return {
    meta: { seed: 11 },
    simTime: 0,
    tick: 0,
    ui: { docked: false, dockedStationId: null },
    player: {
      credits: 0, heat: 0, stats: {},
      cargo: { items: {} },
      ownedShips: [], activeShipIndex: 0,
    },
    factions: {},
    story: { beatIndex: 0, flags: {}, record: null },
    world: { currentSectorId: 'sector_helios_prime' },
    ...over,
  };
}

function fakeBus() {
  const handlers = new Map();
  return {
    emitted: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {
        const list = handlers.get(name) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    emit(name, payload) {
      this.emitted.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    off() {},
  };
}

// ── corpus shape ──────────────────────────────────────────────────────────────────────

test('the mailbox holds at least 120 authored letters across every required kind', () => {
  assert.ok(MAIL_LETTERS.length >= 120, `expected ≥120 letters, got ${MAIL_LETTERS.length}`);
  const ids = new Set(MAIL_LETTERS.map((l) => l.id));
  assert.equal(ids.size, MAIL_LETTERS.length, 'letter ids must be unique');
  for (const letter of MAIL_LETTERS) {
    assert.ok(letter.id.startsWith('mail_'), `id prefix: ${letter.id}`);
    assert.ok(MAIL_KINDS.includes(letter.kind), `kind registered: ${letter.id}`);
    assert.ok(letter.from && letter.from.length > 0, `sender: ${letter.id}`);
    assert.ok(letter.subject && letter.subject.length > 2, `subject: ${letter.id}`);
    assert.ok(letter.body && letter.body.length > 30, `body: ${letter.id}`);
  }
  const byKind = (k) => MAIL_LETTERS.filter((l) => l.kind === k).length;
  assert.ok(byKind('cast') >= 20, 'cast letters from the named figures');
  assert.ok(byKind('job') >= 15, 'job offers');
  assert.ok(byKind('spam') >= 15, 'house-voice spam');
  assert.ok(byKind('fan') >= 10, 'fan mail after feats');
  assert.ok(byKind('hate') >= 10, 'hate mail after feats');
  assert.ok(byKind('bill') >= 10, 'bills');
  assert.ok(byKind('crew') >= 10, "letters for Maera Vols's lost crew");
});

test('every letter is triggered by a real event or a time window — nothing untriggered', () => {
  const triggerTypes = new Set();
  for (const letter of MAIL_LETTERS) {
    assert.ok(Array.isArray(letter.triggers) && letter.triggers.length > 0,
      `${letter.id} must carry at least one trigger`);
    let hasOccurrence = false;
    for (const trigger of letter.triggers) {
      triggerTypes.add(trigger.type);
      if (OCCURRENCE_TYPES.has(trigger.type)) hasOccurrence = true;
      switch (trigger.type) {
        case 'event':
          assert.ok(EVENT_NAME_SET.has(trigger.name),
            `${letter.id} names an event the system listens for: ${trigger.name}`);
          break;
        case 'day': assert.ok(Number.isFinite(trigger.at)); break;
        case 'window':
          assert.ok(Number.isFinite(trigger.fromDay) && Number.isFinite(trigger.toDay));
          assert.ok(trigger.fromDay <= trigger.toDay);
          break;
        case 'beat': assert.ok(Number.isFinite(trigger.at)); break;
        case 'stat': assert.ok(STATS.has(trigger.stat), `${letter.id}: stat ${trigger.stat}`); break;
        case 'deed': assert.ok(DEED_KINDS[trigger.kind], `${letter.id}: deed ${trigger.kind}`); break;
        case 'rep': assert.ok(FACTION.has(trigger.faction), `${letter.id}: faction ${trigger.faction}`); break;
        case 'heat': assert.ok(Number.isFinite(trigger.gte)); break;
        case 'flag': assert.ok(typeof trigger.flag === 'string' && trigger.flag.length > 2); break;
        case 'cargo': assert.ok(CMDTY.has(trigger.commodity), `${letter.id}: commodity ${trigger.commodity}`); break;
        case 'docked': assert.ok(STATION_IDS.has(trigger.station), `${letter.id}: station ${trigger.station}`); break;
        case 'ship': assert.ok(SHIP_IDS.has(trigger.ship), `${letter.id}: ship ${trigger.ship}`); break;
        case 'credits': assert.ok(Number.isFinite(trigger.gte)); break;
        default: assert.fail(`${letter.id}: unknown trigger type ${trigger.type}`);
      }
    }
    assert.ok(hasOccurrence,
      `${letter.id} has no event/deed/time-window conjunct — it would arrive untriggered`);
  }
});

// ── trigger evaluator honesty ─────────────────────────────────────────────────────────

test('trigger evaluator reads real state only', () => {
  const state = baseState({ simTime: 5 * 600 });
  assert.equal(mailTriggerSatisfied({ type: 'day', at: 5 }, state, []), true);
  assert.equal(mailTriggerSatisfied({ type: 'day', at: 6 }, state, []), false);
  assert.equal(mailTriggerSatisfied({ type: 'window', fromDay: 4, toDay: 6 }, state, []), true);
  assert.equal(mailTriggerSatisfied({ type: 'window', fromDay: 6, toDay: 9 }, state, []), false);
  state.story.beatIndex = 3;
  assert.equal(mailTriggerSatisfied({ type: 'beat', at: 3 }, state, []), true);
  state.player.stats = { tradesCount: 7 };
  assert.equal(mailTriggerSatisfied({ type: 'stat', stat: 'tradesCount', gte: 6 }, state, []), true);
  recordDeed(state, { kind: 'kill_outlaw', sectorId: 'sector_sker_haven' });
  assert.equal(mailTriggerSatisfied({ type: 'deed', kind: 'kill_outlaw' }, state, []), true);
  assert.equal(mailTriggerSatisfied({ type: 'deed', kind: 'base_destroyed' }, state, []), false);
  state.factions = { faction_scn: { rep: 12 } };
  assert.equal(mailTriggerSatisfied({ type: 'rep', faction: 'faction_scn', gte: 10 }, state, []), true);
  state.player.heat = 0.5;
  assert.equal(mailTriggerSatisfied({ type: 'heat', gte: 0.4 }, state, []), true);
  state.story.flags = { volsBlackBoxRecovered: true };
  assert.equal(mailTriggerSatisfied({ type: 'flag', flag: 'volsBlackBoxRecovered' }, state, []), true);
  state.player.cargo.items = { cmdty_narcotics: 2 };
  assert.equal(mailTriggerSatisfied({ type: 'cargo', commodity: 'cmdty_narcotics' }, state, []), true);
  state.ui = { docked: true, dockedStationId: 'station_helios' };
  assert.equal(mailTriggerSatisfied({ type: 'docked', station: 'station_helios' }, state, []), true);
  state.player.ownedShips = [{ shipId: 'ship_kestrel' }];
  assert.equal(mailTriggerSatisfied({ type: 'ship', ship: 'ship_kestrel' }, state, []), true);
  state.player.credits = 900;
  assert.equal(mailTriggerSatisfied({ type: 'credits', gte: 500 }, state, []), true);
  // event triggers read only the witnessed log
  assert.equal(mailTriggerSatisfied({ type: 'event', name: 'dock:docked' }, state, []), false);
  const events = [
    { n: 'dock:docked', t: 1, f: { stationId: 'station_helios' } },
    { n: 'economy:tradeCompleted', t: 2, f: { side: 'sell', qty: 9 } },
  ];
  assert.equal(mailTriggerSatisfied({ type: 'event', name: 'dock:docked' }, state, events), true);
  assert.equal(mailTriggerSatisfied(
    { type: 'event', name: 'dock:docked', match: { stationId: 'station_helios' } }, state, events), true);
  assert.equal(mailTriggerSatisfied(
    { type: 'event', name: 'dock:docked', match: { stationId: 'station_ceres' } }, state, events), false);
  assert.equal(mailTriggerSatisfied(
    { type: 'event', name: 'economy:tradeCompleted', match: { side: 'sell' } }, state, events), true);
});

// ── delivery: the inbox ───────────────────────────────────────────────────────────────

test('a triggered letter lands in the comms inbox as a persistent popup, once', () => {
  const bus = fakeBus();
  const state = baseState({ simTime: 0 });
  mail.init({ state, bus, helpers: {} });
  assert.equal(mail.name, 'mail', 'registered-system name');
  // Nothing due at day 0 — the day-2 cast letter stays pending.
  mail.update(1.5, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup').length, 0,
    'nothing arrives untriggered');
  state.simTime = 2.5 * 600;
  mail.update(1.5, state);
  const popups = bus.emitted.filter((e) => e.name === 'comms:popup');
  assert.ok(popups.length >= 1, 'the day-2 letter must arrive');
  const kael = popups.find((e) => e.payload.id === 'mail:mail_kael_01');
  assert.ok(kael, 'mail_kael_01 delivered at day ≥2');
  assert.equal(kael.payload.sender, 'Kael');
  assert.equal(kael.payload.persist, true, 'letters persist into the comms backlog — the inbox');
  assert.equal(kael.payload.note, 'You still owe me a drink');
  // delivered record persists; a second tick does not re-send
  const before = popups.length;
  mail.update(1.5, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup').length, before,
    'letters never re-deliver');
  assert.ok(mail.serialize().delivered.includes('mail_kael_01'));
});

test('event-triggered letters deliver only after the real bus event fires', () => {
  const bus = fakeBus();
  const state = baseState({ simTime: 10 * 600 });
  mail.init({ state, bus, helpers: {} });
  mail.update(1.5, state);
  // mail_bill_03 needs law:fineAssessed — not yet witnessed.
  assert.equal(bus.emitted.filter((e) => e.payload && e.payload.id === 'mail:mail_bill_03').length, 0);
  bus.emit('law:fineAssessed', { amount: 400, reason: 'dock_slam' });
  mail.update(1.5, state);
  const bill = bus.emitted.find((e) => e.payload && e.payload.id === 'mail:mail_bill_03');
  assert.ok(bill, 'the fine letter arrives after a real fine');
  assert.equal(bill.payload.category, 'personal');
  const deliveredEvt = bus.emitted.find((e) => e.name === 'mail:delivered' && e.payload.id === 'mail_bill_03');
  assert.ok(deliveredEvt, 'mail:delivered fires for downstream surfaces');
});

test('serialize/deserialize preserves delivered letters and witnessed events', () => {
  const bus = fakeBus();
  const state = baseState({ simTime: 3 * 600 });
  mail.init({ state, bus, helpers: {} });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  mail.update(1.5, state);
  const snapshot = mail.serialize();
  const fresh = baseState({ simTime: 3 * 600 });
  mail.init({ state: fresh, bus: fakeBus(), helpers: {} });
  mail.deserialize(snapshot);
  assert.deepEqual(mail.serialize().delivered, snapshot.delivered);
  assert.equal(mail.serialize().events.length, snapshot.events.length);
  assert.ok(mail.serialize().events.some((e) => e.n === 'dock:docked' && e.f.stationId === 'station_helios'));
});

test('cast letters address real named figures', () => {
  const figureNames = new Set(Object.values(FIGURES).map((f) => String(f.name || '').toLowerCase()));
  const cast = MAIL_LETTERS.filter((l) => l.kind === 'cast');
  const realSenders = cast.filter((l) =>
    figureNames.has(String(l.from).toLowerCase())
    || String(l.from).includes('Vale') || String(l.from).includes('Vols')
    || String(l.from).includes('Kurtz') || String(l.from).includes('Ashfall'));
  assert.ok(realSenders.length >= 15,
    `most cast letters should come from named figures (${realSenders.length})`);
});


// The real run owner and borrowed-course registration, not legacy mode booleans.
function campaignMailbox(t) {
  const state = createGameState(435);
  state.mode = 'flight';
  state.simTime = 10 * MAIL_DAY_S;
  const bus = fakeBus();
  const owner = Object.create(mail);
  const runs = Object.create(runSession);
  runs.init({ state, bus });
  owner.init({ state, bus });
  owner.deserialize({ schemaVersion: 1, delivered: ['mail_kael_01'], events: [
    { n: 'dock:docked', t: 1, f: { stationId: 'station_helios' } },
  ] });
  t.after(() => { owner.destroy(); runs.destroy(); });
  return { state, bus, owner, runs };
}

function assertMailboxDeferred(f, before) {
  f.bus.emit('law:fineAssessed', { amount: 400, reason: 'arena_contact' });
  f.owner.update(2, f.state);
  // The event/evaluation seam must also defer when invoked by its actual owner.
  f.owner._evaluate(f.state);
  assert.deepEqual(f.owner.serialize(), before, 'temporary play consumes neither campaign letters nor event witnesses');
  assert.deepEqual(f.bus.emitted.filter(e => e.name === 'mail:delivered' || e.name === 'comms:popup'), [],
    'campaign inbox and downstream mail callouts stay silent');
}

for (const [kind, ruleset] of [['survival', 'swarm'], ['survival', 'scored'], ['lab', null]]) {
  test(`campaign mailbox defers throughout ${kind}/${ruleset || 'lab'} and recovers on Adventure restore`, t => {
    const f = campaignMailbox(t);
    f.bus.emit('run:beginRequested', { kind, ruleset, seed: 435 });
    assert.equal(f.state.run.kind, kind);
    assert.equal(f.state.run.phase, 'loadout');
    const before = f.owner.serialize();
    const phases = ['loadout', 'arena_intro', 'wave_intro', 'active', 'cleanup', 'draft', 'refit'];
    for (const phase of phases) {
      if (phase !== 'loadout') f.bus.emit('run:transitionRequested', { expectedPhase: f.state.run.phase, nextPhase: phase });
      assert.equal(f.state.run.phase, phase);
      assertMailboxDeferred(f, before);
    }
    f.bus.emit('run:endRequested', { outcome: 'aborted', reason: 'mail_fixture' });
    assert.equal(f.state.run.phase, 'ended');
    assertMailboxDeferred(f, before);
    // This is the canonical Continue boundary, not a hand-written run envelope.
    f.bus.emit('save:restoring', {});
    assert.equal(f.state.run.kind, 'adventure');
    assert.equal(f.state.run.phase, 'inactive');
    f.owner.update(1, f.state);
    assert.ok(f.bus.emitted.some(e => e.name === 'mail:delivered'), 'normal due letters remain available');
    assert.equal(f.state.mail.delivered.includes('mail_bill_03'), false, 'temporary fine was never retained as a campaign witness');
    f.bus.emit('law:fineAssessed', { amount: 400, reason: 'dock_slam' });
    f.owner.update(1, f.state);
    assert.ok(f.state.mail.delivered.includes('mail_bill_03'), 'a real campaign fine still delivers its letter');
  });
}

test('borrowed Racing before a race exists defers mail without consuming campaign opportunity', t => {
  const f = campaignMailbox(t);
  f.state.world.sectors = { sector_helios_prime: { id: 'sector_helios_prime' } };
  configureRacingCorridorSession(f.state, true);
  assert.equal(isRacingCorridorSession(f.state), true);
  assert.equal(f.state.run.kind, 'adventure', 'borrowed flight uses Adventure run defaults');
  assert.equal(f.state.racing?.active, undefined);
  assert.equal(f.state.race?.active, undefined);
  const before = f.owner.serialize();
  assertMailboxDeferred(f, before);
  configureRacingCorridorSession(f.state, false);
  f.owner.update(1, f.state);
  assert.ok(f.bus.emitted.some(e => e.name === 'mail:delivered'), 'due mail was deferred, not marked sent');
  assert.equal(f.state.mail.delivered.includes('mail_bill_03'), false);
});

test('temporary physics venue defers mail while an ordinary Adventure race keeps its inbox', t => {
  const f = campaignMailbox(t);
  f.state.physicsVenueSession = true;
  const before = f.owner.serialize();
  assertMailboxDeferred(f, before);
  f.state.physicsVenueSession = false;
  f.state.missions.active = [{ type: 'race', status: 'active', params: { racingContractId: 'adventure-race', raceLease: true } }];
  f.bus.emit('law:fineAssessed', { amount: 400, reason: 'dock_slam' });
  f.owner.update(1, f.state);
  assert.ok(f.state.mail.delivered.includes('mail_bill_03'), 'in-world Adventure races keep campaign event delivery');
  const snapshot = f.owner.serialize();
  f.owner.update(1, f.state);
  assert.deepEqual(f.owner.serialize(), snapshot, 'ordinary letters still arrive only once');
});
