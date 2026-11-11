// inf-desk-compose (WF-14) — the arrival desk is one voice with three bands, never a stack.
//
// The desk's lines each cap themselves (one newest title, war-over-peace inside the conflict
// read) but nothing composed them: the greeting concatenated keeper + recognition + title + war
// + peace clauses however many were live. Now the greeting carries at most ONE news band on top
// of the desk's own two bands, with priority and fairness: the once-only title outranks the
// per-visit house posture, because a posture that won would keep winning every visit of a long
// war while the title starved; a title that wins is stamped delivered on this very bark and
// never competes again, so the posture loses at most one visit. The same read pins the honest
// nouns: a house the kits never carried named itself by its stripped id remnant ('vael_rc'),
// and an unmapped ground was minted into a fake place name.
//
// Focused owner: src/ui/station/stationArrival.js — pure reads, no new state.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStationArrivalGreeting,
  stationWarPostureLineFor,
} from '../src/ui/station/stationArrival.js';
import { FACTION_KITS } from '../src/data/factions/index.js';

const STATION = 'station_helios'; // barkeep faction: faction_scn
const HOST = 'faction_scn';
const RIVAL = 'faction_reach';
const NOW = 60000;

function baseState(extra = {}) {
  return {
    simTime: NOW,
    player: { name: 'Rin Voss', stationContacts: {} },
    story: { titles: { schemaVersion: 2, byId: {} }, titlesSeen: [] },
    ...extra,
  };
}

function warState(pairs) {
  const conflicts = {};
  for (const [key, rec] of Object.entries(pairs)) conflicts[key] = rec;
  return baseState({ conflicts });
}

test('the desk carries at most one news band: a once-only title outranks the per-visit war', () => {
  const state = baseState({
    conflicts: { [`${HOST}:${RIVAL}`]: { state: 'war', tension: 80 } },
    story: {
      titles: { schemaVersion: 2, byId: {} },
      titlesSeen: [
        { id: 'title_lifeline:0:player', title: 'Lifeline', seenAt: 800, holderKey: 'player' },
      ],
    },
  });
  const greeting = buildStationArrivalGreeting(state, STATION);
  assert.ok(greeting, 'the desk greets');
  assert.equal(greeting.newsBand, 'title', 'the once-only band takes the one news slot');
  assert.match(greeting.text, /Lifeline/, `the title speaks: ${greeting.text}`);
  assert.ok(!greeting.text.includes('at war'), `the posture yields this visit: ${greeting.text}`);
  assert.equal(greeting.warLine, undefined, 'no second news clause rides the greeting');
  assert.equal(greeting.titleSeenId, 'title_lifeline:0:player',
    'the delivered band carries its acknowledgment');
});

test('the yielded band loses exactly one visit: once the title is delivered the war speaks', () => {
  const conflicts = { [`${HOST}:${RIVAL}`]: { state: 'war', tension: 80 } };
  const withTitle = baseState({
    conflicts,
    story: {
      titles: { schemaVersion: 2, byId: {} },
      titlesSeen: [
        { id: 'title_lifeline:0:player', title: 'Lifeline', seenAt: 800, holderKey: 'player', greetedAt: 800 },
      ],
    },
  });
  const greeting = buildStationArrivalGreeting(withTitle, STATION);
  assert.equal(greeting.newsBand, 'conflict', 'the delivered title stops competing');
  assert.match(greeting.text, /at war/, `the posture repeats per visit again: ${greeting.text}`);
  assert.equal(greeting.titleSeenId, undefined, 'no title acknowledgment rides a war visit');
});

test('no two lines of the title band can fire together — the newest sighting only', () => {
  const state = baseState({
    story: {
      titles: { schemaVersion: 2, byId: {} },
      titlesSeen: [
        { id: 'title_razor_release:pilot:3', title: 'Razorhand', seenAt: 100, holderKey: 'pilot:3', trickId: 'razor_release' },
        { id: 'title_tow_kill:pilot:9', title: 'Tow Terror', seenAt: 900, holderKey: 'pilot:9', trickId: 'tow_kill' },
      ],
    },
  });
  const greeting = buildStationArrivalGreeting(state, STATION);
  assert.match(greeting.text, /Tow Terror/, 'the newest sighting speaks');
  assert.ok(!greeting.text.includes('Razorhand'), `the older sighting never stacks: ${greeting.text}`);
  assert.equal(greeting.titleSeenId, 'title_tow_kill:pilot:9');
  const titleClauses = greeting.text.match(/Tow Terror|Razorhand/g) || [];
  assert.equal(titleClauses.length, 1, 'exactly one title clause in the whole greeting');
});

test('no two lines of the conflict band can fire together — live war outranks fresh peace', () => {
  // A live war on one front and a just-resolved front at the same house: one conflict clause,
  // and it is the war.
  const state = warState({
    [`${HOST}:${RIVAL}`]: { state: 'war', tension: 80 },
    [`${HOST}:faction_dmc`]: {
      state: 'tense', tension: 50,
      lastFlip: {
        pairKey: `${HOST}:faction_dmc`, sectorId: 'sector_helios_prime',
        previousOwner: HOST, newOwner: 'faction_dmc', t: NOW - 200,
      },
    },
  });
  const line = stationWarPostureLineFor(state, HOST);
  assert.ok(line, 'the conflict band speaks');
  assert.match(line, /at war/, `the live front wins the band: ${line}`);
  assert.ok(!line.includes('war is over'), `the peace clause never stacks under it: ${line}`);

  // The same through the whole greeting: exactly one conflict clause reaches the bark.
  const greeting = buildStationArrivalGreeting(state, STATION);
  assert.equal(greeting.newsBand, 'conflict');
  const warClauses = (greeting.text.match(/at war/g) || []).length;
  const peaceClauses = (greeting.text.match(/The war is over/g) || []).length;
  assert.equal(warClauses + peaceClauses, 1, `one conflict clause total: ${greeting.text}`);
});

test('a house the kits never carried is named honestly, never by its stripped id', () => {
  const state = warState({ 'faction_vael_rc:faction_scn': { state: 'war', tension: 80 } });
  const line = stationWarPostureLineFor(state, HOST);
  assert.ok(line, 'the pair still speaks');
  assert.ok(line.includes('an unlisted house'), `the honest noun: ${line}`);
  assert.ok(!/vael_rc/.test(line), `no stripped id remnant: ${line}`);
});

test('an unmapped ground reads as the contested lane, never an invented place name', () => {
  const state = warState({
    [`${HOST}:${RIVAL}`]: {
      state: 'tense', tension: 50,
      lastFlip: {
        pairKey: `${HOST}:${RIVAL}`, sectorId: 'sector_nowhere_lane',
        previousOwner: RIVAL, newOwner: HOST, t: NOW - 200,
      },
    },
  });
  const line = stationWarPostureLineFor(state, HOST);
  assert.ok(line && line.includes('The war is over'), 'the peace speaks');
  assert.ok(line.includes('the contested lane'), `the honest ground: ${line}`);
  assert.ok(!line.includes('nowhere lane'), `no minted place name: ${line}`);
  assert.ok(!line.includes('sector_'), `no raw sector id: ${line}`);

  // The authored ground still names itself.
  const mapped = warState({
    [`${HOST}:${RIVAL}`]: {
      state: 'tense', tension: 50,
      lastFlip: {
        pairKey: `${HOST}:${RIVAL}`, sectorId: 'sector_helios_prime',
        previousOwner: RIVAL, newOwner: HOST, t: NOW - 200,
      },
    },
  });
  assert.ok(stationWarPostureLineFor(mapped, HOST).includes('Helios Prime'),
    'the authored sector keeps its name');
});

test('a quiet desk stays exactly as quiet as before — two bands, no news clause', () => {
  const greeting = buildStationArrivalGreeting(baseState(), STATION);
  assert.ok(greeting, 'the desk greets');
  assert.equal(greeting.newsBand, undefined, 'no news band is invented');
  assert.equal(greeting.warLine, undefined);
  assert.equal(greeting.titleSeenId, undefined);
  const clauses = greeting.text.split(/\.\s*/).filter(Boolean);
  assert.ok(clauses.length <= 3, `keeper + recognition only: ${greeting.text}`);
});

test('every named house in a greeting text resolves to a kit name or the honest noun', () => {
  // The never-a-raw-id law on this desk: a sub-house id the kits never carried rides the same
  // honest noun, whichever side of the pair the dock sits on.
  const state = warState({ 'faction_ghost_eighth:faction_scn': { state: 'war', tension: 80 } });
  const atHost = stationWarPostureLineFor(state, HOST);
  assert.ok(atHost.includes('an unlisted house'), `the rival house: ${atHost}`);
  assert.ok(!atHost.includes('ghost_eighth'), `no stripped remnant: ${atHost}`);
  const atGhost = stationWarPostureLineFor(state, 'faction_ghost_eighth');
  const hostKit = FACTION_KITS.find((kit) => kit.id === HOST);
  assert.ok(atGhost && atGhost.includes(hostKit.short || hostKit.name),
    `the unlisted house speaks its own desk and names its rival: ${atGhost}`);
  assert.ok(!FACTION_KITS.some((kit) => atHost.includes(kit.id)),
    'no raw kit id reaches the clause');
});
