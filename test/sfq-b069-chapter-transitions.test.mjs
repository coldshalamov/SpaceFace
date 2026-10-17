// SFQ-B069 — Finish chapter transitions as gameplay (family P07).
//
// Verifies on seed 4242:
//   1. Advancing into Chapter 3 (Beat 6) emits `late_registry_unknown` with the pilot's real hull
//      name and registration (`TESSERA / VHL-4471-T`) and no raw `[PLAYER SHIP ID]` placeholder.
//   2. Entering `sector_ashfall_reach` at `beatIndex >= 6` after an earlier pre-Beat-6 visit still
//      fires `ashfall_arrival` once with plain sector sender `'ASHFALL REACH'` (not `'SECTOR ASHFALL REACH'`).
//   3. Recording Verge evidence (`kellPaperTrail`, `archiveFile`, `kurtzLedger`) logs plain-English
//      journal facts instead of raw camelCase keys.
//   4. Negative/quiet case: re-entering `sector_ashfall_reach` a second time at Beat 6+ does not
//      re-fire `ashfall_arrival`.
//
// Run: node --test test/sfq-b069-chapter-transitions.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SHIP } from '../src/data/narrative.js';
import { story as storyProto } from '../src/systems/story.js';

const SEED = 4242;

function makeHarness(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 120;
  state.playerId = 1;
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) {
    state.settings.gameplay.tutorialHints = false;
  }

  const bus = createBus();
  const popups = [];
  const voiceLines = [];
  bus.on('comms:popup', (p) => popups.push(p));

  const story = Object.assign({}, storyProto);
  story.init({
    state,
    bus,
    helpers: {
      voice: {
        say(line) {
          voiceLines.push(line);
          return true;
        },
      },
    },
    registry: { get: () => null },
  });
  story._ensureState(true);
  return { state, bus, story, popups, voiceLines };
}

test('SFQ-B069: Beat 6 registry transmission names the pilot ship and registration', () => {
  const h = makeHarness(SEED);

  // Advance into Chapter 3 (Beat 6): late_registry_unknown replaces [PLAYER SHIP ID] with real hull & registry.
  h.state.story.beatIndex = 6;
  h.bus.emit('story:beatAdvanced', { fromIndex: 5, toIndex: 6, branch: 'traders' });
  const regPopup = h.popups.find((p) => p && p.id === 'late_registry_unknown');
  assert.ok(regPopup, 'Beat 6 emits late_registry_unknown');
  assert.equal(
    regPopup.text.includes('[PLAYER SHIP ID]'),
    false,
    `late_registry_unknown must not leak [PLAYER SHIP ID], got: ${regPopup.text}`,
  );
  const expectedShipId = `${SHIP.name.toUpperCase()} / ${SHIP.registration}`;
  assert.equal(
    regPopup.text.includes(expectedShipId),
    true,
    `late_registry_unknown must include "${expectedShipId}", got: ${regPopup.text}`,
  );
});

test('SFQ-B069: Chapter 3 arrival still fires after an earlier Ashfall visit', () => {
  const h = makeHarness(SEED);
  h.state.story.beatIndex = 3;
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', firstVisit: true });
  assert.equal(
    h.popups.some((p) => p && p.id === 'ashfall_arrival'),
    false,
    'pre-Beat-6 visit to Ashfall does not fire the Chapter 3 arrival transmission',
  );
  h.state.story.beatIndex = 6;

  // Entering sector_ashfall_reach at Beat 6 after the earlier visit still fires ashfall_arrival once with 'ASHFALL REACH'.
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', firstVisit: false });
  const arrivals = h.popups.filter((p) => p && p.id === 'ashfall_arrival');
  assert.equal(arrivals.length, 1, 'ashfall_arrival fires on first Beat 6+ entry even after a pre-Beat-6 visit');
  assert.equal(arrivals[0].sender, 'ASHFALL REACH', 'sender uses plain-English sector name from SECTORS');
  assert.equal(arrivals[0].sender.includes('SECTOR_'), false);
  assert.equal(h.state.story.seenComms.ashfall_arrival, true);
});

test('SFQ-B069: Verge evidence events record plain-English journal facts', () => {
  const h = makeHarness(SEED);
  h.state.story.beatIndex = 6;

  // Verge evidence records plain-English facts in the journal instead of raw camelCase keys.
  h.bus.emit('story:vergeEvidenceRecorded', { key: 'kellPaperTrail', source: 'contact_wraith_kell' });
  h.bus.emit('story:vergeEvidenceRecorded', { key: 'archiveFile', source: 'archive:station_drift' });
  h.bus.emit('story:vergeEvidenceRecorded', { key: 'kurtzLedger', source: 'kurtz:takeLedger' });

  const vergeFacts = h.state.story.facts.filter((f) => f && f.kind === 'verge_evidence');
  assert.deepEqual(
    vergeFacts.map((f) => f.text),
    [
      'Kell paper trail filed',
      'Tessera archive file recovered',
      'Kurtz ledger cross-checked',
    ],
  );
  for (const fact of vergeFacts) {
    assert.equal(
      /kellPaperTrail|archiveFile|kurtzLedger/.test(fact.text),
      false,
      `Verge fact text must not contain raw camelCase key: ${fact.text}`,
    );
  }
});

test('SFQ-B069 negative/quiet case: re-entering Ashfall Reach a second time at Beat 6+ does not re-fire ashfall_arrival', () => {
  const h = makeHarness(SEED);
  h.state.story.beatIndex = 6;

  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', firstVisit: true });
  assert.equal(
    h.popups.filter((p) => p && p.id === 'ashfall_arrival').length,
    1,
    'first Beat 6+ arrival fires ashfall_arrival once',
  );

  // Re-entering at Beat 6 and Beat 7 stays quiet (guarded by seenComms.ashfall_arrival, not firstVisit).
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', firstVisit: false });
  h.state.story.beatIndex = 7;
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', firstVisit: true });

  assert.equal(
    h.popups.filter((p) => p && p.id === 'ashfall_arrival').length,
    1,
    'subsequent Beat 6+ entries do not re-fire ashfall_arrival',
  );
});
