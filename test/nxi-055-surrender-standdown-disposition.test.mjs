// NXI-055 — describe stand-down using the accepted disposition.
//
// The lawful response message (`law:response`) is the canonical row instruments, barks, and
// HUD read to follow the law loop. When the player surrender is accepted the stand-down must
// announce its real disposition: custody with an open bill is a SUSPENDED stop, not a settled
// one, and it is never complete legal exoneration — the heat owner still holds the sheet.
//
//   * `law:response` `surrender_accepted` carries `disposition: 'suspended'` while the posted
//     bill is open, and `globalExoneration: false` in every case.
//   * `law:surrenderAccepted` names the same disposition next to the obligation row.
//   * The stand-down itself is unchanged: lawful engagers hold fire, a pirate raider does not,
//     and no reputation reward rides custody.
//   * A cause the record already settled announces 'settled', not a fresh open bill.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lawSecurity } from '../src/systems/lawSecurity.js';
import { quoteImpoundBill } from '../src/systems/custodyConsequences.js';

const SEED = 4242;
const CAUSE_ID = `player-surrender:${SEED}`;

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function events(bus, name) {
  return bus.emitLog.filter((row) => row.evt === name);
}

function lawResponses(bus, action) {
  return events(bus, 'law:response').filter((row) => row.payload.action === action);
}

function makeLaw(player = {}) {
  const entities = new Map();
  const state = {
    meta: { seed: SEED },
    simTime: 40,
    tick: 80,
    mode: 'flight',
    playerId: 'player',
    player: { heat: 0, credits: 5000, cargo: { items: {} }, ...player },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [],
  };
  const bus = makeBus();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, law, entities };
}

function add(run, entity) {
  run.entities.set(entity.id, entity);
  run.state.entityList.push(entity);
  return entity;
}

// Same scripted geometry as fb-player-surrender: a lawful patrol holds the player inside its
// scan cone (CUSTOMS_SCAN_RANGE 90, half-angle 0.55 off heading rot=0 → +x), engines cut.
function custodyScene({ heat = 0.65, credits = 5000 } = {}) {
  const run = makeLaw({ heat, credits });
  const player = add(run, {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 40, z: 5000 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  });
  const patrol = add(run, {
    id: 'patrol', type: 'ship', alive: true, rot: 0, factionId: 'faction_scn',
    pos: { x: 0, z: 5000 },
    data: { ai: { lawful: true }, intent: { fire: true }, combat: { targetId: 'player' } },
  });
  const raider = add(run, {
    id: 'raider', type: 'ship', alive: true, rot: 0, factionId: 'faction_reach',
    pos: { x: 0, z: 5600 },
    data: { ai: { lawful: false }, intent: { fire: true }, combat: { targetId: 'player' } },
  });
  // A second lawful engager outside the cone: the accept sweep (not the responder patch) owns
  // its stand-down, so it is the hull that carries the settlement identity `stoodDownCause`.
  const offcone = add(run, {
    id: 'patrol-far', type: 'ship', alive: true, rot: 0, factionId: 'faction_scn',
    pos: { x: 0, z: 5400 },
    data: { ai: { lawful: true }, intent: { fire: true }, combat: { targetId: 'player' } },
  });
  return { run, player, patrol, raider, offcone };
}

function acceptSurrender(run) {
  for (let i = 0; i < 400; i++) {
    run.law.update(1 / 60, run.state);
    const hold = run.state.lawSecurity.playerSurrender;
    if (hold && (hold.phase === 'accepted' || hold.phase === 'cancelled')) return hold;
  }
  return run.state.lawSecurity.playerSurrender;
}

test('NXI-055: an accepted custody announces a suspended stop, never exoneration', () => {
  const { run, patrol, raider, offcone } = custodyScene();
  const { bus, state } = run;
  const hold = acceptSurrender(run);
  assert.equal(hold.phase, 'accepted', 'custody accepts inside the hold window');

  const rows = lawResponses(bus, 'surrender_accepted');
  assert.equal(rows.length, 1, 'the lawful response message carries exactly one accept leg');
  const row = rows[0].payload;
  assert.equal(row.disposition, 'suspended',
    'an open surrender bill is a suspended stop, not a settled one');
  assert.equal(row.globalExoneration, false,
    'the provisional stop is never announced as complete legal exoneration');
  assert.equal(row.causeId, CAUSE_ID);
  assert.equal(row.priceCr, quoteImpoundBill(state.player));

  const accepted = events(bus, 'law:surrenderAccepted');
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].payload.disposition, 'suspended');
  assert.equal(accepted[0].payload.obligation.status, 'open');
  assert.equal(accepted[0].payload.obligation.advertisePay, true);

  // The stand-down itself is unchanged: lawful fire stops, the pirate does not, the sheet
  // stays with the heat owner, and no reputation reward rides custody. The cone responder is
  // disarmed by the direct patch; the off-cone engager is stood down by the accept sweep and
  // carries the settlement identity on its record.
  assert.equal(patrol.data.intent.fire, false);
  assert.equal(patrol.data.ai.passive, true);
  assert.equal(offcone.data.intent.fire, false);
  assert.equal(offcone.data.ai.stoodDownCause, CAUSE_ID,
    'the swept engager records which settled cause stood it down');
  assert.equal(raider.data.intent.fire, true);
  assert.equal(state.player.heat, 0.65);
  assert.equal(events(bus, 'heat:clear').length, 0);
  assert.equal(events(bus, 'faction:repDelta').length, 0,
    'custody posts a bill, never a reputation reward');
  assert.equal(events(bus, 'economy:chargeCredits').length, 0);

  // No law response row may phrase the provisional stop as exoneration.
  for (const leg of events(bus, 'law:response')) {
    assert.notEqual(leg.payload.disposition, 'exonerated');
    assert.equal(leg.payload.globalExoneration ?? false, false,
      `${leg.payload.action} does not claim global exoneration`);
  }
});

test('NXI-055: a cause already settled on the record announces settled, not a fresh bill', () => {
  const { run } = custodyScene();
  const { law, bus } = run;
  // The same surrender cause was already billed and paid earlier — the record is settled.
  law.noteComposedObligation({
    kind: 'warrant', causeId: CAUSE_ID, amountCr: 1200, label: 'surrender',
  });
  law.payComposedObligation({ kind: 'warrant', causeId: CAUSE_ID });
  assert.equal(
    law.composedDisposition().find((row) => row.causeId === CAUSE_ID).status, 'paid');

  const hold = acceptSurrender(run);
  assert.equal(hold.phase, 'accepted');

  const rows = lawResponses(bus, 'surrender_accepted');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.disposition, 'settled',
    'a cause the record already settled is not re-announced as an open bill');
  assert.equal(rows[0].payload.globalExoneration, false,
    'even a settled lot is local to its cause, never global exoneration');

  const accepted = events(bus, 'law:surrenderAccepted');
  assert.equal(accepted[0].payload.disposition, 'settled');
  assert.equal(accepted[0].payload.obligation.status, 'paid');
  const toast = events(bus, 'toast').pop();
  assert.match(toast.payload.text, /already settled/i,
    'the announcement names the settled record instead of inventing a fresh bill');
  // Paying the pre-seeded bill charged once — custody itself charged nothing.
  assert.equal(events(bus, 'economy:chargeCredits').length, 1);
});

test('NXI-055: neighboring custody still works — the suspended row is one leg of a live stop', () => {
  const { run, patrol } = custodyScene();
  const { bus, state } = run;
  run.law.update(1 / 60, state);
  const hold = state.lawSecurity.playerSurrender;
  assert.equal(hold.phase, 'holding');
  const holdRows = lawResponses(bus, 'surrender_hold');
  assert.equal(holdRows.length, 1);
  assert.equal(holdRows[0].payload.causeId, CAUSE_ID);
  assert.equal(holdRows[0].payload.globalExoneration ?? false, false,
    'the provisional hold leg never claims exoneration either');
  assert.equal(patrol.data.ai.lawful, true);
});
