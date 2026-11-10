// SF-124 — survey-control that turns information into a route.
//
// The packet's promise: a Survey Suite plus a Cargo Scanner makes information the build's
// practical advantage — the resolve band is a fitted capability, the hold is a readable
// manifest instead of a hint, and what the scan learns ages honestly: it is accurate at
// observation time, it carries a date, and it supports a different decision without
// becoming omniscience or free money.
//
// Asserted against the live owners:
//   data/scanReveal.js   the quality bands, the sensor max-fold, the hold read,
//                        the confirmed-memory block (the read that survives a downgrade)
//   data/scanClues.js    the bounded clue book — stale fixes and contradictions route
//                        differently by construction
//   data/synergies.js    the authored survey_control tell
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShipScanReveal,
  scanQualityForDistance,
  sensorRadiusMultForScan,
  cargoReaderFittedForScan,
  sameScanReveal,
  SCAN_REVEAL_FULL_RADIUS,
  SCAN_REVEAL_CLASS_RADIUS,
  SCAN_REVEAL_CONFIRMED_STALE_S,
} from '../src/data/scanReveal.js';
import { applyClueObservation } from '../src/data/scanClues.js';
import { synergiesForFittings } from '../src/data/synergies.js';
import { MODULES } from '../src/data/modules.js';

const SURVEY_FIT = ['mod_survey_suite', 'mod_cargo_scanner_s'];
const SCANNER_ONLY_FIT = ['mod_cargo_scanner_s'];
const SUITE_ONLY_FIT = ['mod_survey_suite'];
const BARE_FIT = [];

// The state slice the fitted-module helpers read: the player entity's resolved fittings.
function stateWithFit(fittings, simTime = 0) {
  const player = { id: 'player', type: 'ship', data: { fittings } };
  return {
    playerId: 'player',
    entities: new Map([[player.id, player]]),
    simTime,
  };
}

function hauler(id = 11, manifestLines = [{ commodityId: 'cmdty_food', qty: 60 }]) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { x: 800, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 10, mass: 48, hull: 80, hullMax: 80, factionId: 'faction_free',
    data: {
      defId: 'ship_drifter', role: 'freighter', trafficRole: 'trader',
      cargoManifest: manifestLines ? { lines: manifestLines, totalQty: manifestLines.reduce((s, l) => s + l.qty, 0) } : null,
      weapons: [],
    },
  };
}

test('the survey suite physically extends the resolve band — a fitted capability, not a flag', () => {
  const suite = MODULES.find((m) => m.id === 'mod_survey_suite');
  assert.ok(suite.mods.scannerRadiusMult > 1, 'the suite authors the reach');
  const fitted = stateWithFit(SURVEY_FIT);
  const bare = stateWithFit(BARE_FIT);
  assert.equal(sensorRadiusMultForScan(fitted), suite.mods.scannerRadiusMult);
  assert.equal(sensorRadiusMultForScan(bare), 1);
  // At 1.7 km a bare hull sees a silhouette; the survey fit resolves the ship.
  const bandEdge = SCAN_REVEAL_FULL_RADIUS * 1.4;
  assert.equal(scanQualityForDistance(bandEdge, sensorRadiusMultForScan(bare)), 'class');
  assert.equal(scanQualityForDistance(bandEdge, sensorRadiusMultForScan(fitted)), 'full');
  // And the reach is not infinite — outside the scaled class band there is still nothing.
  const beyond = SCAN_REVEAL_CLASS_RADIUS * suite.mods.scannerRadiusMult + 50;
  assert.equal(scanQualityForDistance(beyond, sensorRadiusMultForScan(fitted)), null);
});

test('the cargo scanner turns a resolving read into a manifest read, and only then', () => {
  const target = hauler();
  const origin = { x: 0, z: 0 };
  const withScanner = buildShipScanReveal(target, stateWithFit(SCANNER_ONLY_FIT), { origin, now: 10 });
  assert.ok(withScanner.holdRead, 'a fitted scanner reads the hold');
  assert.deepEqual(withScanner.holdRead.declared, [{ commodityId: 'cmdty_food', qty: 60 }]);
  assert.equal(withScanner.holdRead.declaredQty, 60);
  assert.equal(withScanner.holdRead.empty, false);
  assert.equal(withScanner.holdRead.mismatch, false, 'an honest trader reads clean');
  assert.equal(withScanner.holdRead.at, 10, 'the read carries its observation date');
  const without = buildShipScanReveal(hauler(), stateWithFit(BARE_FIT), { origin, now: 10 });
  assert.equal(without.holdRead, null, 'no module, no ledger — the hint is all you get');
  const suiteOnly = buildShipScanReveal(hauler(), stateWithFit(SUITE_ONLY_FIT), { origin, now: 10 });
  assert.equal(suiteOnly.holdRead, null, 'reach alone never reads a hold');
});

test('the read is accurate at observation time and ages honestly when the hold changes', () => {
  const state = stateWithFit(SCANNER_ONLY_FIT);
  const target = hauler(11, [{ commodityId: 'cmdty_food', qty: 60 }]);
  const origin = { x: 0, z: 0 };
  const first = buildShipScanReveal(target, state, { origin, now: 10 });
  assert.deepEqual(first.holdRead.declared, [{ commodityId: 'cmdty_food', qty: 60 }]);
  // Custody swaps the manifest — the next read says what is aboard NOW.
  target.data.cargoManifest = { lines: [{ commodityId: 'cmdty_machinery', qty: 25 }], totalQty: 25 };
  const second = buildShipScanReveal(target, state, { origin, now: 40, previous: first });
  assert.deepEqual(second.holdRead.declared, [{ commodityId: 'cmdty_machinery', qty: 25 }]);
  assert.equal(second.holdRead.at, 40);
  assert.ok(!sameScanReveal(first, second), 'a changed hold is a changed claim');
  // The remembered record carries the same fresh read — and the previous claim is gone.
  assert.deepEqual(second.confirmed.holdRead.declared, [{ commodityId: 'cmdty_machinery', qty: 25 }]);
  assert.equal(second.confirmed.at, 40);
});

test('a false manifest is detected as a lie without the secret leaving the hold', () => {
  const secret = 'cmdty_contraband_drugs';
  const smuggler = hauler(12, [{ commodityId: 'cmdty_food', qty: 40 }]);
  smuggler.data.trafficRole = 'smuggler';
  smuggler.data.hiddenCargo = { id: secret, qty: 12 };
  const reveal = buildShipScanReveal(smuggler, stateWithFit(SCANNER_ONLY_FIT), { origin: { x: 0, z: 0 }, now: 5 });
  assert.equal(reveal.manifestTrust, 'false');
  assert.ok(reveal.holdRead.mismatch, 'the scanner reads that the hold disagrees');
  assert.deepEqual(reveal.holdRead.declared, [{ commodityId: 'cmdty_food', qty: 40 }],
    'it reports the DECLARED line, not the hold');
  assert.equal(reveal.holdRead.hiddenCargo, undefined);
  assert.doesNotMatch(JSON.stringify(reveal), new RegExp(secret),
    'the contraband itself never leaves the ship — same honesty rule as the clue book');
});

test('refit the scanner away and the reach and the ledger both honestly go', () => {
  const target = hauler();
  const at1400 = { x: 0, z: 0 };
  // Move the target to the band edge so only the suite's reach resolves it.
  target.pos = { x: SCAN_REVEAL_FULL_RADIUS * 1.4, z: 0 };
  const fitted = stateWithFit(SURVEY_FIT);
  const resolved = buildShipScanReveal(target, fitted, { origin: at1400, now: 1 });
  assert.equal(resolved.quality, 'full');
  assert.ok(resolved.holdRead);
  // The rack comes off: same ship, same distance, weaker read — honest, not hidden.
  const unfitted = stateWithFit(BARE_FIT);
  const weak = buildShipScanReveal(target, unfitted, { origin: at1400, now: 2, previous: resolved });
  assert.equal(weak.quality, 'class');
  assert.equal(weak.holdRead, null);
  // The verified knowledge does not vanish instantly — it rides as dated memory…
  assert.ok(weak.confirmed, 'the confirmed read survives the downgrade within its window');
  assert.equal(weak.confirmed.at, 1, 'the memory keeps the date it was earned, not now');
  // …and it expires on schedule instead of pretending forever.
  const stale = buildShipScanReveal(target, unfitted, {
    origin: at1400, now: 1 + SCAN_REVEAL_CONFIRMED_STALE_S + 1, previous: weak,
  });
  assert.equal(stale.confirmed, null, 'past the stale window the old read clears itself');
});

test('the clue book turns moved and contradicted reads into different routes', () => {
  const book = { subjects: {} };
  // Same shipment, same claim, new position: the fix went stale — intercept the last sighting.
  applyClueObservation(book, {
    subjectId: 'shipment:convoy-1', kind: 'shipment',
    claim: 'hauling food to Dock B', pos: { x: 100, z: 0 }, at: 1,
  });
  applyClueObservation(book, {
    subjectId: 'shipment:convoy-1', kind: 'shipment',
    claim: 'hauling food to Dock B', pos: { x: 300, z: 0 }, at: 5,
  });
  const subject = book.subjects['shipment:convoy-1'];
  assert.equal(subject.history[0].status, 'stale', 'the older fix is marked moved, not merged');
  assert.equal(subject.route.action, 'intercept');
  assert.match(subject.route.reason, /stale/i);
  // A changed claim about the same subject: a contradiction — go look, do not retarget.
  applyClueObservation(book, {
    subjectId: 'manifest:ship-7', kind: 'manifest',
    claim: 'declared food', pos: { x: 10, z: 0 }, at: 6,
  });
  applyClueObservation(book, {
    subjectId: 'manifest:ship-7', kind: 'manifest',
    claim: 'manifest mismatch', pos: { x: 10, z: 0 }, at: 8,
  });
  const contradicted = book.subjects['manifest:ship-7'];
  assert.equal(contradicted.history[0].status, 'contradicted');
  assert.equal(contradicted.route.action, 'inspect');
  // A repeat of the standing claim mints no new row — duplicates stay duplicates.
  const replay = applyClueObservation(book, {
    subjectId: 'manifest:ship-7', kind: 'manifest',
    claim: 'manifest mismatch', pos: { x: 10, z: 0 }, at: 9,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(book.subjects['manifest:ship-7'].history.length, 1);
  // The book never persists what it should not know: an observation carrying the real
  // hold (hiddenCargo) whose secret text leaks into the claim is refused outright.
  const rejected = applyClueObservation(book, {
    subjectId: 'manifest:ship-9', kind: 'manifest',
    claim: 'actually hauling drugs', pos: { x: 0, z: 0 }, at: 10,
    hiddenCargo: 'drugs',
  });
  assert.equal(rejected.rejected, true, 'a secret-flavored claim is refused, not filed');
  assert.equal(rejected.reason, 'secret');
  assert.doesNotMatch(JSON.stringify(book), /hiddenCargo/);
});

test('the authored tell names the pair the mechanics deliver', () => {
  const rows = synergiesForFittings(SURVEY_FIT);
  assert.ok(rows.some((row) => row.id === 'survey_control'));
  assert.ok(!synergiesForFittings(SUITE_ONLY_FIT).some((row) => row.id === 'survey_control'));
  assert.ok(!synergiesForFittings(SCANNER_ONLY_FIT).some((row) => row.id === 'survey_control'));
});
