// PQ-178.03 — leftover story ledger at the Orbital berth. Headless.
// Builds leftover story receipts in the leftover shapes production writes:
//   story:beatAdvanced, leftover 032 mission:completed completionMethod,
//   leftover 47-A scenario evidence tether:attached / tether:broken.
// Asserts the leftover berth writer paints leftover 'I was doing X, then Y, so I Z'.
// No soak. No headed capture. Blind playtest % is not invented.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { leftoverLedgerCard, leftoverLedgerLine } from '../src/story/storyLedger.js';
import { buildDockArrival, writeBerthArrival } from '../src/ui/dockArrival.js';
import { stationFrameHtml } from '../src/ui/views/stationFrames.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATION = 'station_helios';
const STATION_NAME = 'Helios Station';

const LEFTOVER_SENTENCE =
  'I was hitching the false-mass spindle, then cutting for the pod, so I slung the slag core at the dest dock.';

function leftover47aHitch() {
  return {
    type: 'tether:attached',
    tick: 12,
    simTime: 0.2,
    actorId: 'player_kestrel',
    ownerActorId: 'player_kestrel',
    targetActorId: 'evidence_spindle_47a',
    attachmentId: 'att-47a-hitch',
  };
}

function leftover47aCut() {
  return {
    type: 'tether:broken',
    tick: 80,
    simTime: 1.4,
    actorId: 'player_kestrel',
    ownerActorId: 'player_kestrel',
    targetActorId: 'civilian_pod',
    attachmentId: 'att-47a-cut',
    reason: 'cut',
  };
}

function leftover032Receipt(method, type, storyTag, at_s) {
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

function leftoverBeat(fromIndex, toIndex, at_s) {
  return {
    kind: 'story:beatAdvanced',
    fromIndex,
    toIndex,
    at_s,
  };
}

function leftoverState() {
  return {
    story: {
      beatIndex: 4,
      flags: {
        beat_0_done: true,
        beat_1_done: true,
        beat_2_done: true,
        beat_3_done: true,
      },
      receipts: [
        leftoverBeat(0, 1, 10),
        leftoverBeat(1, 2, 20),
        leftoverBeat(2, 3, 30),
        leftoverBeat(3, 4, 40),
      ],
    },
    missions: {
      receipts: [
        leftover032Receipt('wrecking_ball', 'demolition', 'campaign47a:b1:honest_work', 21),
        leftover032Receipt('stage_tow', 'rescue_under_fire', 'campaign47a:b2:elroy', 31),
        leftover032Receipt('sling_in', 'tow_recovery', 'campaign47a:b3:bigger_boat', 41),
      ],
    },
    scenario: {
      evidence: {
        schemaVersion: 1,
        events: [leftover47aHitch(), leftover47aCut()],
      },
    },
    ui: { marketNews: { log: [], lastCard: null } },
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

test('leftover receipts compose leftover I was doing X, then Y, so I Z', () => {
  const state = leftoverState();
  const line = leftoverLedgerLine(state);
  assert.equal(line, LEFTOVER_SENTENCE);
  const card = leftoverLedgerCard(state);
  assert.equal(card.badge, 'LEDGER');
  assert.equal(card.title, 'Mechanic');
  assert.equal(card.body, LEFTOVER_SENTENCE);
  assert.equal(card.kind, 'story-ledger');
  assert.match(line, /^I was .+, then .+, so I .+\.$/);
  assert.match(line, /hitching the false-mass spindle/);
  assert.match(line, /cutting for the pod/);
  assert.match(line, /slung the slag core at the dest dock/);
});

test('the leftover berth writer paints the leftover ledger the player can read', () => {
  const state = leftoverState();
  const view = buildDockArrival(state, { id: STATION, name: STATION_NAME, services: [] });
  assert.equal(view.ledgerLine, LEFTOVER_SENTENCE, 'leftover arrival carries leftover ledger line');
  assert.ok(view.ledger, 'leftover arrival carries leftover ledger card');
  assert.equal(view.ledger.body, LEFTOVER_SENTENCE);
  assert.ok(view.lines.includes(LEFTOVER_SENTENCE), 'leftover ledger is one leftover arrival line');

  const frame = stationFrameHtml();
  assert.match(frame, /sxb-berth__ledger/, 'Orbital berth hosts leftover ledger');
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
    /function renderStatus\(\)[\s\S]*?writeBerthArrival\(/,
    'leftover paint stays inside leftover renderStatus',
  );
  assert.match(
    appSrc,
    /sxb-berth__ledger/,
    'leftover stationApp names leftover ledger host',
  );

  const ledgerEl = berthCardHost();
  const newsEl = { textContent: '' };
  const painted = writeBerthArrival(
    { newsEl, cardEl: berthCardHost(), ledgerEl },
    view,
  );
  assert.equal(painted.ledger.body, LEFTOVER_SENTENCE);
  assert.equal(ledgerEl.hidden, false, 'leftover ledger article is shown');
  assert.equal(ledgerEl.querySelector('.sxb-event__badge').textContent, 'LEDGER');
  assert.equal(ledgerEl.querySelector('.sxb-event__title').textContent, 'Mechanic');
  assert.equal(ledgerEl.querySelector('.sxb-event__body').textContent, LEFTOVER_SENTENCE);
  assert.match(ledgerEl.getAttribute('aria-label'), /I was hitching the false-mass spindle/);

  const quiet = writeBerthArrival(
    { newsEl: { textContent: '' }, cardEl: berthCardHost(), ledgerEl: berthCardHost() },
    buildDockArrival({ ui: { marketNews: { log: [], lastCard: null } } }, {
      id: STATION, name: STATION_NAME, services: [],
    }),
  );
  assert.equal(quiet.ledger, null, 'a quiet berth invents no leftover ledger');

  console.log(`PQ-178.03 leftover berth sentence: ${painted.ledger.body}`);
});
