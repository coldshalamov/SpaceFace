// PQ-150.01 — leftover mechanic reads leftover hull at the leftover berth. Headless.
// Plants leftover living-hull scars the leftover route already writes.
// Asserts leftover berth HTML names Mechanic and leftover carried scar classes.
// Empty leftover hull does not invent leftover scars. Blind playtest % is not invented.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  defaultLivingHull,
  livingHullWithPatchedScars,
  livingHullWithScar,
} from '../src/core/livingHull.js';
import {
  leftoverMechanicCard,
  leftoverMechanicLine,
  leftoverMechanicScarClasses,
} from '../src/story/mechanicVoice.js';
import { leftoverLedgerCard } from '../src/story/storyLedger.js';
import { berthModel, buildDockArrival, writeBerthArrival } from '../src/ui/dockArrival.js';
import { stationFrameHtml } from '../src/ui/views/stationFrames.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATION = 'station_helios';
const STATION_NAME = 'Helios Station';
const SCAR_CLASSES = ['graze', 'hard', 'heavy', 'crushing'];

function leftoverScar(band, facing, tick) {
  return {
    cause: 'weapon',
    surface: 'weapon',
    band,
    facing,
    atT: tick,
    tick,
    id: `weapon:${tick}:${facing}`,
  };
}

function leftoverOwnedHull(livingHull) {
  return {
    player: {
      credits: 5000,
      heat: 0,
      activeShipIndex: 0,
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: [],
        livingHull,
      }],
    },
    ui: { marketNews: { log: [], lastCard: null } },
  };
}

function leftoverEmptyHull() {
  return leftoverOwnedHull(defaultLivingHull(0));
}

function leftoverHardBow() {
  return leftoverOwnedHull(livingHullWithScar(
    defaultLivingHull(0),
    leftoverScar('hard', 'bow', 12),
    12,
  ));
}

function leftoverPatchedHardBow() {
  return leftoverOwnedHull(livingHullWithPatchedScars(
    leftoverHardBow().player.ownedShips[0].livingHull,
    40,
  ));
}

function leftoverLedgerState() {
  return {
    story: {
      beatIndex: 4,
      flags: { beat_0_done: true, beat_1_done: true, beat_2_done: true, beat_3_done: true },
      receipts: [
        { kind: 'story:beatAdvanced', fromIndex: 0, toIndex: 1, at_s: 10 },
        { kind: 'story:beatAdvanced', fromIndex: 1, toIndex: 2, at_s: 20 },
        { kind: 'story:beatAdvanced', fromIndex: 2, toIndex: 3, at_s: 30 },
        { kind: 'story:beatAdvanced', fromIndex: 3, toIndex: 4, at_s: 40 },
      ],
    },
    missions: {
      receipts: [{
        id: 'mo_47a:sling_in:completed',
        missionId: 'mo_47a_sling_in',
        title: 'tow_recovery',
        type: 'tow_recovery',
        outcome: 'completed',
        at_s: 41,
        completionMethod: 'sling_in',
        storyTag: 'campaign47a:b3:bigger_boat',
      }],
    },
    scenario: {
      evidence: {
        schemaVersion: 1,
        events: [
          {
            type: 'tether:attached',
            tick: 12,
            simTime: 0.2,
            actorId: 'player_kestrel',
            ownerActorId: 'player_kestrel',
            targetActorId: 'evidence_spindle_47a',
            attachmentId: 'att-47a-hitch',
          },
          {
            type: 'tether:broken',
            tick: 80,
            simTime: 1.4,
            actorId: 'player_kestrel',
            ownerActorId: 'player_kestrel',
            targetActorId: 'civilian_pod',
            attachmentId: 'att-47a-cut',
            reason: 'cut',
          },
        ],
      },
    },
  };
}

function berthCardHost() {
  const texts = {
    '.sxb-event__badge': '',
    '.sxb-event__title': '',
    '.sxb-event__body': '',
  };
  const attrs = {};
  return {
    hidden: true,
    parentElement: null,
    querySelector(sel) {
      if (!(sel in texts)) return null;
      return {
        get textContent() { return texts[sel]; },
        set textContent(value) { texts[sel] = String(value == null ? '' : value); },
      };
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
  };
}

function paintMechanic(state) {
  const view = buildDockArrival(state, { id: STATION, name: STATION_NAME, services: [] });
  const mechanicEl = berthCardHost();
  const ledgerEl = berthCardHost();
  const painted = writeBerthArrival(
    { newsEl: { textContent: '' }, cardEl: berthCardHost(), ledgerEl, mechanicEl },
    view,
  );
  return { view, mechanicEl, ledgerEl, painted };
}

test('leftover hard bow scar names leftover Mechanic and leftover hard class', () => {
  const state = leftoverHardBow();
  const hull = state.player.ownedShips[0].livingHull;
  assert.deepEqual(leftoverMechanicScarClasses(hull), ['hard']);
  const line = leftoverMechanicLine(state);
  assert.match(line, /Hard/);
  assert.match(line, /bow/);
  assert.doesNotMatch(line, /\b(?:graze|heavy|crushing)\b/i);

  const card = leftoverMechanicCard(state);
  assert.equal(card.title, 'Mechanic');
  assert.equal(card.badge, 'HULL');
  assert.equal(card.kind, 'mechanic-hull');
  assert.match(card.body, /hard/i);

  const { view, mechanicEl, painted } = paintMechanic(state);
  assert.ok(view.mechanic, 'leftover arrival carries leftover mechanic card');
  assert.ok(view.lines.includes(view.mechanicLine), 'leftover mechanic is one leftover arrival line');
  assert.equal(painted.mechanic.title, 'Mechanic');
  assert.equal(mechanicEl.hidden, false, 'leftover mechanic article is shown');
  assert.equal(mechanicEl.querySelector('.sxb-event__title').textContent, 'Mechanic');
  assert.match(mechanicEl.querySelector('.sxb-event__body').textContent, /hard/i);
  assert.match(mechanicEl.querySelector('.sxb-event__body').textContent, /bow/);

  console.log(`PQ-150.01 leftover hard bow: ${mechanicEl.querySelector('.sxb-event__body').textContent}`);
});

test('leftover patched scar adds leftover repair line', () => {
  const state = leftoverPatchedHardBow();
  const { mechanicEl, painted } = paintMechanic(state);
  assert.equal(painted.mechanic.title, 'Mechanic');
  const body = mechanicEl.querySelector('.sxb-event__body').textContent;
  assert.match(body, /hard/i);
  assert.match(body, /Yard patched/);
  assert.match(body, /weld/);
});

test('leftover empty hull does not invent leftover scars', () => {
  const state = leftoverEmptyHull();
  assert.deepEqual(leftoverMechanicScarClasses(state.player.ownedShips[0].livingHull), []);
  const line = leftoverMechanicLine(state);
  assert.ok(line, 'leftover clean plate comes from leftover live empty hull');
  for (const band of SCAR_CLASSES) {
    assert.doesNotMatch(line, new RegExp(`\\b${band}\\b`, 'i'), `empty hull invents no leftover ${band}`);
  }

  const { mechanicEl, painted } = paintMechanic(state);
  assert.equal(painted.mechanic.title, 'Mechanic');
  const body = mechanicEl.querySelector('.sxb-event__body').textContent;
  assert.match(body, /Clean plate/);
  for (const band of SCAR_CLASSES) {
    assert.doesNotMatch(body, new RegExp(`\\b${band}\\b`, 'i'));
  }

  const quiet = paintMechanic({ ui: { marketNews: { log: [], lastCard: null } } });
  assert.equal(quiet.painted.mechanic, null, 'no leftover hull invents no leftover mechanic scars');
  assert.equal(quiet.mechanicEl.hidden, true);
});

test('leftover heat or leftover ship ledger adds leftover rap line', () => {
  const hot = leftoverEmptyHull();
  hot.player.heat = 0.2;
  const hotLine = leftoverMechanicLine(hot);
  assert.match(hotLine, /Heat/);
  assert.match(hotLine, /rap/);
  for (const band of SCAR_CLASSES) {
    assert.doesNotMatch(hotLine, new RegExp(`\\b${band}\\b`, 'i'));
  }

  const traded = leftoverEmptyHull();
  traded.player.tradeLedger = [{ side: 'buy', commodityId: 'iron_ore', qty: 4, seenAt: 12 }];
  const tradedLine = leftoverMechanicLine(traded);
  assert.match(tradedLine, /Clean plate/);
  assert.doesNotMatch(tradedLine, /ship ledger already has a fact/i);
  for (const band of SCAR_CLASSES) {
    assert.doesNotMatch(tradedLine, new RegExp(`\\b${band}\\b`, 'i'));
  }

  const filed = leftoverHardBow();
  filed.lossLedger = {
    entries: [{
      lossId: 'loss:ship_wasp:1',
      source: 'combat',
      assetId: 'ship_wasp',
      shipDefId: 'ship_wasp',
      sectorId: 'sector_helios_prime',
      cargoHint: 'ore',
      t: 8,
      killedByPlayer: true,
    }],
  };
  const filedLine = leftoverMechanicLine(filed);
  assert.match(filedLine, /Hard scar/);
  assert.match(filedLine, /ship ledger already has a fact/i);
});

test('one Mechanic header carries hull and ledger instead of naming the speaker twice', () => {
  const frame = stationFrameHtml();
  assert.match(frame, /sxb-berth__ledger/, 'Orbital berth still hosts leftover campaign ledger');
  assert.match(frame, /sxb-berth__mechanic/, 'Orbital berth hosts leftover mechanic hull article');
  assert.match(frame, /sxb-event__badge/);
  assert.match(frame, /sxb-event__body/);

  const appSrc = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');
  assert.match(
    appSrc,
    /writeBerthArrival\(\s*\{ newsEl, cardEl: eventEl \}\s*,\s*arrival\s*,/,
    'renderStatus still hands leftover arrival to leftover writeBerthArrival',
  );
  assert.match(
    appSrc,
    /sxb-berth__ledger/,
    'leftover stationApp still names leftover campaign ledger host',
  );

  const state = {
    ...leftoverLedgerState(),
    ...leftoverHardBow(),
  };
  const ledger = leftoverLedgerCard(state);
  assert.ok(ledger, 'leftover campaign ledger still reads leftover receipts');
  assert.equal(ledger.title, 'Mechanic');
  const { view, mechanicEl, ledgerEl, painted } = paintMechanic(state);
  assert.ok(view.mechanic, 'leftover arrival carries the merged mechanic card');
  assert.equal(view.ledger, null, 'PQ-207.01: a second Mechanic plate is not emitted');
  assert.equal(painted.ledger, null, 'PQ-207.01: ledger article stays hidden when merged');
  assert.equal(painted.mechanic.title, 'Mechanic');
  assert.equal(mechanicEl.hidden, false, 'the one Mechanic article is shown');
  assert.equal(ledgerEl.hidden, true, 'no second Mechanic name plate beside it');
  const mergedBody = mechanicEl.querySelector('.sxb-event__body').textContent;
  assert.match(mergedBody, /hard/i, 'hull verdict still leads');
  assert.match(mergedBody, /I was /, 'ledger recap rides the same header');
  assert.equal(
    mechanicEl.querySelector('.sxb-event__badge').textContent,
    'HULL · LEDGER',
    'merged badge names both channels honestly',
  );

  const ledgerOnly = paintMechanic(leftoverLedgerState());
  assert.equal(ledgerOnly.painted.mechanic, null, 'no hull voice without an owned hull line');
  assert.equal(ledgerOnly.ledgerEl.hidden, false, 'ledger article paints when it is the only voice');
  assert.equal(ledgerOnly.ledgerEl.querySelector('.sxb-event__title').textContent, 'Mechanic');
  assert.match(ledgerOnly.ledgerEl.querySelector('.sxb-event__body').textContent, /I was /);
});

test('four scar bands each produce a distinct line, and the berth seats that hull', () => {
  const station = { id: STATION, name: STATION_NAME, services: [] };
  const seen = new Set();
  for (const band of SCAR_CLASSES) {
    const state = leftoverOwnedHull(livingHullWithScar(
      defaultLivingHull(0),
      leftoverScar(band, 'bow', 7),
      7,
    ));
    const model = berthModel(state, station);
    assert.ok(model.hull, `${band} berth names the hull`);
    assert.equal(model.hull.defId, 'ship_kestrel');
    assert.equal(model.hull.name, 'Tessera');
    assert.equal(model.seatDefId, model.hull.defId, 'the ship on the berth is the hull the line is about');
    assert.ok(model.mechanicLine, `${band} berth has a mechanic line`);
    assert.match(model.mechanicLine, /Tessera/, 'the line names this hull');
    assert.match(model.mechanicLine, new RegExp(`\\b${band}\\b`, 'i'));
    assert.match(model.mechanicLine, /bow/, 'the line reads the scar on this hull');
    for (const other of SCAR_CLASSES) {
      if (other === band) continue;
      assert.doesNotMatch(
        model.mechanicLine,
        new RegExp(`\\b${other}\\b`, 'i'),
        `${band} hull invents no ${other}`,
      );
    }
    seen.add(model.mechanicLine);
  }
  assert.equal(seen.size, SCAR_CLASSES.length, 'each scar class has its own line');

  const wasp = leftoverOwnedHull(livingHullWithScar(
    defaultLivingHull(0),
    leftoverScar('hard', 'stern', 8),
    8,
  ));
  wasp.player.ownedShips[0].defId = 'ship_wasp';
  wasp.player.ownedShips[0].starterHull = false;
  const waspModel = berthModel(wasp, station);
  assert.equal(waspModel.hull.defId, 'ship_wasp');
  assert.equal(waspModel.seatDefId, 'ship_wasp');
  assert.notEqual(waspModel.hull.name, 'Tessera');
  assert.match(waspModel.mechanicLine, /Hard/);
  assert.match(waspModel.mechanicLine, /stern/);
  assert.doesNotMatch(waspModel.mechanicLine, /\b(?:graze|heavy|crushing)\b/i);

  const cleanState = leftoverEmptyHull();
  const clean = berthModel(cleanState, station);
  assert.deepEqual(leftoverMechanicScarClasses(cleanState.player.ownedShips[0].livingHull), []);
  assert.ok(clean.hull && clean.hull.defId, 'a clean hull is still the ship on the berth');
  assert.equal(clean.seatDefId, clean.hull.defId);
  assert.ok(clean.mechanicLine);
  for (const band of SCAR_CLASSES) {
    assert.doesNotMatch(clean.mechanicLine, new RegExp(`\\b${band}\\b`, 'i'), `clean hull invents no ${band}`);
  }

  const { mechanicEl, painted } = paintMechanic(cleanState);
  assert.equal(painted.mechanic.title, 'Mechanic');
  assert.equal(mechanicEl.getAttribute('data-hull'), clean.hull.defId);
  assert.equal(mechanicEl.getAttribute('data-hull-name'), clean.hull.name);

  const appSrc = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');
  assert.match(appSrc, /berthSeatDefId\(state, hull\)/, 'the bay seats the berth model hull');
  assert.match(appSrc, /berth\.show\(s, arrival && arrival\.hull\)/, 'renderStatus seats the hull the mechanic just read');
});

test('leftover mechanic names only leftover scar classes the hull carries', () => {
  let hull = defaultLivingHull(0);
  hull = livingHullWithScar(hull, leftoverScar('graze', 'stern', 4), 4);
  hull = livingHullWithScar(hull, leftoverScar('crushing', 'port beam', 9), 9);
  const state = leftoverOwnedHull(hull);
  assert.deepEqual(leftoverMechanicScarClasses(hull), ['graze', 'crushing']);
  const line = leftoverMechanicLine(state);
  assert.match(line, /Graze/);
  assert.match(line, /Crushing/);
  assert.doesNotMatch(line, /\bhard\b/i);
  assert.doesNotMatch(line, /\bheavy\b/i);
});
