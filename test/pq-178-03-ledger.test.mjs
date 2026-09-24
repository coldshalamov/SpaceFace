// PQ-178.03 — the story ledger at the berth.
// Plants the receipts the campaign writer actually stores (recordBeatStep)
// and the session hitch/cut evidence. A blind reader sees only the prose.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { STORY_BRANCH_INTRO_TAG } from '../src/story/campaign47a/campaignData.js';
import { failEncounter, recordBeatStep, recoverEncounter } from '../src/story/campaign47a/campaignTransitions.js';
import { leftoverLedgerCard, leftoverLedgerLine, retellLedger } from '../src/story/storyLedger.js';
import { buildDockArrival, writeBerthArrival } from '../src/ui/dockArrival.js';
import { stationFrameHtml } from '../src/ui/views/stationFrames.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATION = 'station_helios';
const STATION_NAME = 'Helios Station';

const CAMPAIGN_RETELL = [
  'sampling the variance',
  'docking the sample',
  'knocking the variance tower',
  'pulling the pods under fire',
  'towing the slag core',
  "taking the traders' intro",
  "finished the traders' proving runs",
];

function freshStory() {
  return {
    story: { beatIndex: 0, branch: null, flags: {} },
    ui: { marketNews: { log: [], lastCard: null } },
  };
}

/** Fixed sim times. The sidecar writer is the same one missions calls. */
function playedCampaign() {
  const state = freshStory();
  assert.equal(recordBeatStep(state, 'mining:yield', {}, 12).ok, true);
  assert.equal(recordBeatStep(state, 'dock:docked', {}, 40).ok, true);
  state.story.beatIndex = 1;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b1:honest_work',
  }, 80).ok, true);
  state.story.beatIndex = 2;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b2:elroy',
  }, 120).ok, true);
  state.story.beatIndex = 3;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b3:bigger_boat',
  }, 160).ok, true);
  state.story.beatIndex = 4;
  state.story.branch = 'traders';
  assert.equal(recordBeatStep(state, 'mission:accepted', {
    storyTag: STORY_BRANCH_INTRO_TAG,
    type: 'bulk_trade',
    factionId: 'faction_mts',
    branch: 'traders',
  }, 200).ok, true);
  state.story.beatIndex = 5;
  state.story.chainProgress = 3;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    missionType: 'bulk_trade',
    branch: 'traders',
    chainProgress: 3,
  }, 240).ok, true);
  state.story.flags = {
    beat_0_done: true,
    beat_1_done: true,
    beat_2_done: true,
    beat_3_done: true,
    beat_4_done: true,
    beat_5_done: true,
  };
  return state;
}

function methodReceipt(method, type, storyTag, at_s) {
  return {
    id: `mo_47a:${method}:completed`,
    missionId: `mo_47a_${method}`,
    title: type,
    type,
    outcome: 'completed',
    reason: null,
    at_s,
    completionMethod: method,
    storyTag,
    factionId: 'faction_mts',
    stationId: STATION,
    destStationId: STATION,
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

test('sidecar receipts retell the campaign in order, seed 17803', () => {
  const state = playedCampaign();
  const line = leftoverLedgerLine(state);
  const told = retellLedger(line);
  assert.deepEqual(told, CAMPAIGN_RETELL);
  assert.equal(told.length, 7);
  assert.match(line, /^I was .+ so I .+\.$/);
  assert.equal(retellLedger(line).join(' > '), CAMPAIGN_RETELL.join(' > '));
  const card = leftoverLedgerCard(state);
  assert.equal(card.title, 'Mechanic');
  assert.equal(card.badge, 'LEDGER');
  assert.equal(card.kind, 'story-ledger');
  assert.equal(card.body, line);
  console.log(`PQ-178.03 campaign clauses: ${told.length}`);
  console.log(`PQ-178.03 blind retell: ${told.join(' > ')}`);
});

test('a completion method replaces the generic beat, and a hitch stays a second sentence', () => {
  const state = playedCampaign();
  state.missions = {
    receipts: [
      methodReceipt('wrecking_ball', 'demolition', 'campaign47a:b1:honest_work', 81),
      methodReceipt('stage_tow', 'rescue_under_fire', 'campaign47a:b2:elroy', 121),
      methodReceipt('sling_in', 'tow_recovery', 'campaign47a:b3:bigger_boat', 161),
    ],
  };
  state.scenario = {
    evidence: {
      schemaVersion: 1,
      events: [
        {
          type: 'tether:attached', tick: 12, simTime: 0.2,
          targetActorId: 'evidence_spindle_47a',
        },
        {
          type: 'tether:broken', tick: 80, simTime: 1.4,
          targetActorId: 'civilian_pod', reason: 'cut',
        },
      ],
    },
  };
  const told = retellLedger(leftoverLedgerLine(state));
  assert.deepEqual(told, [
    'sampling the variance',
    'docking the sample',
    'knocking the variance tower with thrown mass',
    'pulling the pods into the yard dock',
    'slinging the slag core',
    "taking the traders' intro",
    "finished the traders' proving runs",
    'hitching the false-mass spindle',
    'cutting for the pod',
    'cut for the pod',
  ]);
});

test('beat flags retell a save whose receipt ring is empty', () => {
  const told = retellLedger(leftoverLedgerLine({
    story: {
      beatIndex: 3,
      branch: null,
      flags: { beat_0_done: true, beat_1_done: true, beat_2_done: true },
    },
  }));
  assert.deepEqual(told, [
    'sampling the variance',
    'docking the sample',
    'knocking the variance tower',
    'pulled the pods under fire',
  ]);
});

test('one sample still speaks, and an empty berth invents nothing', () => {
  const state = freshStory();
  assert.equal(recordBeatStep(state, 'mining:yield', {}, 12).ok, true);
  const told = retellLedger(leftoverLedgerLine(state));
  assert.deepEqual(told, ['sampling the variance', 'the sample came in', 'sampled the variance']);
  assert.equal(leftoverLedgerLine({ story: { beatIndex: 0, flags: {} } }), null);
  assert.deepEqual(retellLedger(''), []);
});

test('an ending receipt names the choice the player filed', () => {
  const told = retellLedger(leftoverLedgerLine({
    story: {
      beatIndex: 7,
      endgameChoice: 'A',
      campaign47a: {
        receipts: [{ kind: 'ending_resolution', endingId: 'A', atSimTime: 900 }],
      },
    },
  }));
  assert.deepEqual(told, [
    'weighing The Clean Uniform',
    'the choice was filed',
    'chose The Clean Uniform',
  ]);
});

test('a miss stays in the retelling ahead of the later knock', () => {
  const state = freshStory();
  state.story.beatIndex = 1;
  failEncounter(state, 'encounter_failed', 50);
  assert.equal(recoverEncounter(state, 70).ok, true);
  assert.equal(recordBeatStep(state, 'mission:completed', {}, 80).ok, true);
  assert.deepEqual(retellLedger(leftoverLedgerLine(state)), [
    'missing the variance tower',
    'knocking the variance tower',
    'knocked the variance tower',
  ]);
});

test('the berth mechanic reads the campaign back', () => {
  const state = playedCampaign();
  state.player = { ownedShips: [{ defId: 'ship_kestrel' }], activeShipIndex: 0, heat: 0 };
  const view = buildDockArrival(state, { id: STATION, name: STATION_NAME, services: [] });
  assert.equal(view.ledger, null, 'the hull mechanic keeps the single name plate');
  assert.equal(view.mechanic.title, 'Mechanic');
  assert.match(view.mechanic.body, /Clean plate/);
  assert.match(view.mechanic.body, /sampling the variance/);
  assert.deepEqual(retellLedger(view.mechanic.body.slice(view.mechanic.body.indexOf('I was'))), CAMPAIGN_RETELL);

  const quiet = playedCampaign();
  const arrival = buildDockArrival(quiet, { id: STATION, name: STATION_NAME, services: [] });
  assert.equal(arrival.ledgerLine, leftoverLedgerLine(quiet));
  assert.ok(arrival.lines.includes(arrival.ledgerLine));

  const frame = stationFrameHtml();
  assert.match(frame, /sxb-berth__ledger/);
  const appSrc = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');
  assert.match(appSrc, /writeBerthArrival\(\s*\{ newsEl, cardEl: eventEl \}\s*,\s*arrival\s*,/);
  assert.match(appSrc, /sxb-berth__ledger/);

  const ledgerEl = berthCardHost();
  const painted = writeBerthArrival(
    { newsEl: { textContent: '' }, cardEl: berthCardHost(), ledgerEl },
    arrival,
  );
  assert.equal(painted.ledger.body, arrival.ledgerLine);
  assert.equal(ledgerEl.hidden, false);
  assert.equal(ledgerEl.querySelector('.sxb-event__title').textContent, 'Mechanic');
  assert.match(ledgerEl.getAttribute('aria-label'), /sampling the variance/);

  const silent = writeBerthArrival(
    { newsEl: { textContent: '' }, cardEl: berthCardHost(), ledgerEl: berthCardHost() },
    buildDockArrival({ ui: { marketNews: { log: [], lastCard: null } } }, {
      id: STATION, name: STATION_NAME, services: [],
    }),
  );
  assert.equal(silent.ledger, null);
});
