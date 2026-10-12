// Story spine memory. Each beat transition goes through the campaign owners
// (recordBeatStep, failEncounter, recoverEncounter, buildMissionBoardContract).
// The sidecar never advances story.beatIndex. Seed 4242.
//
// Run: node --test --test-timeout=120000 test/story-spine-memory.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { freshMorrowMemory } from '../src/data/morrow.js';
import {
  BEAT_STATUS,
  BRANCH_CHAIN,
  CAMPAIGN_BEATS,
  FAIL_RECOVERY_COOLDOWN_S,
  applyCampaign47aSaveBlob,
  buildMissionBoardContract,
  ensureCampaign47aState,
  failEncounter,
  initCampaignSidecar,
  isBeatStepsComplete,
  migrateCampaign47aState,
  readSpine,
  recordBeatStep,
  recoverEncounter,
  recoveryCommsForBeat,
  serializeCampaign47aState,
  spineGreeting,
  spineRoadFrom,
} from '../src/story/campaign47a/index.js';
import { DEPTH_PROGRAM_CONTACTS, depthContactsForStation } from '../src/story/campaign47a/embodiedDialogue.js';
import { assessEndingHistory } from '../src/story/endings/eligibility.js';
import { compileFinaleContent } from '../src/story/endings/finaleContent.js';
import { createWrittenFinale, normalizeWrittenFinale } from '../src/story/endings/finaleRuntime.js';
import { readLifeLedger } from '../src/story/endings/lifeLedger.js';
import { leftoverLedgerLine } from '../src/story/storyLedger.js';
import {
  assertSpineUnchanged,
  liveBranchIntroPayload,
  makeCampaignState,
  snapshotCanonicalSpine,
} from './story-campaign47a-fixtures.mjs';

const SEED = 4242;

function words(line) {
  return String(line || '').trim().split(/\s+/).filter(Boolean).length;
}

function fresh(beat, patch) {
  const state = makeCampaignState();
  state.rng = { seed: SEED };
  state.simTime = 0;
  state.story.beatIndex = beat;
  if (patch) {
    if (patch.branch) state.story.branch = patch.branch;
    if (patch.chainProgress != null) state.story.chainProgress = patch.chainProgress;
  }
  initCampaignSidecar(state, 0);
  return state;
}

function contact(state, stationId, id) {
  return depthContactsForStation(stationId, state).find((row) => row.id === id) || null;
}

function offerOf(beat, options) {
  return buildMissionBoardContract(beat, { seed: SEED, epoch: 1, ...options });
}

test('B0 through B7 record the physical step and leave the beat cursor alone', () => {
  const state = fresh(0);
  const before = snapshotCanonicalSpine(state);

  const dockFirst = recordBeatStep(state, 'dock:docked', { stationId: 'station_helios' }, 1);
  assert.equal(dockFirst.ok, false);
  assert.equal(isBeatStepsComplete(state, 0), false);

  const freight = recordBeatStep(state, 'economy:tradeCompleted', {
    side: 'sell', stationId: 'station_helios', commodityId: 'cmdty_food', qty: 4,
  }, 2);
  assert.equal(freight.ok, false);
  const kill = recordBeatStep(state, 'entity:killed', { id: 9, killerId: 1 }, 3);
  assert.equal(kill.ok, false);
  assert.equal(state.story.beatIndex, 0);

  const mine = recordBeatStep(state, 'mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 }, 4);
  assert.equal(mine.ok, true);
  assert.equal(mine.stepId, 'mine');
  assert.equal(mine.stepsComplete, false);
  assert.equal(mine.advancedCanonicalBeat, false);

  const dock = recordBeatStep(state, 'dock:docked', { stationId: 'station_helios' }, 5);
  assert.equal(dock.ok, true);
  assert.equal(dock.stepsComplete, true);
  assert.equal(readSpine(state).solved['0'].stepId, 'dock');
  assert.equal(readSpine(state).solved['0'].verb, null);

  state.story.beatIndex = 1;
  const knock = recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b1:honest_work',
    physicalVerb: 'knock_down',
  }, 6);
  assert.equal(knock.ok, true);
  assert.equal(knock.stepsComplete, true);
  assert.equal(knock.advancedCanonicalBeat, false);
  assert.equal(readSpine(state).solved['1'].verb, 'knock_down');
  assert.equal(readSpine(state).solved['1'].method, null);

  state.story.beatIndex = 2;
  const pull = recordBeatStep(state, 'mission:completed', {
    physicalVerb: 'pull', completionMethod: 'corridor_pull',
  }, 7);
  assert.equal(pull.stepsComplete, true);
  assert.equal(readSpine(state).solved['2'].method, 'corridor_pull');
  assert.equal(readSpine(state).solved['2'].verb, 'pull');

  state.story.beatIndex = 3;
  const tow = recordBeatStep(state, 'mission:completed', { physicalVerb: 'tow' }, 8);
  assert.equal(tow.stepsComplete, true);
  assert.equal(readSpine(state).solved['3'].verb, 'tow');
  assert.equal(readSpine(state).solved['3'].method, null);

  state.story.beatIndex = 4;
  const fakeIntro = recordBeatStep(state, 'mission:accepted', {
    storyTag: 'campaign47a:b4:patrol', type: 'branch_intro', branch: 'patrol',
  }, 9);
  assert.equal(fakeIntro.ok, false);
  assert.equal(fakeIntro.reason, 'not_live_branch_intro');
  const intro = recordBeatStep(state, 'mission:accepted', liveBranchIntroPayload('traders'), 10);
  assert.equal(intro.ok, true);
  assert.equal(intro.stepsComplete, true);
  assert.equal(intro.branch, 'traders');
  assert.equal(readSpine(state).door, 'traders');
  assert.deepEqual(readSpine(state).refused.slice().sort(), ['free', 'patrol']);

  state.story.beatIndex = 5;
  state.story.branch = 'traders';
  state.story.chainProgress = 1;
  const partial = recordBeatStep(state, 'mission:completed', {
    missionType: 'bulk_trade', chainProgress: 1, physicalVerb: 'deliver',
  }, 11);
  assert.equal(partial.ok, true);
  assert.equal(partial.stepsComplete, false);
  assert.equal(readSpine(state).solved['5'].stepId, 'chain_progress');
  state.story.chainProgress = BRANCH_CHAIN.traders.count;
  const chain = recordBeatStep(state, 'mission:completed', {
    missionType: 'bulk_trade',
    chainProgress: BRANCH_CHAIN.traders.count,
    physicalVerb: 'deliver',
  }, 12);
  assert.equal(chain.stepsComplete, true);
  assert.equal(readSpine(state).solved['5'].stepId, 'chain_complete');

  state.story.beatIndex = 6;
  const deploy = recordBeatStep(state, 'asset:deployed', {
    kind: 'drone', id: 'seed-live', defId: 'drone_mk1',
  }, 13);
  assert.equal(deploy.stepsComplete, true);
  assert.equal(readSpine(state).solved['6'].stepId, 'asset_deploy');

  state.story.beatIndex = 7;
  state.story.branch = 'traders';
  const climax = recordBeatStep(state, 'mission:completed', {
    physicalVerb: 'knock_down', completionMethod: 'wrecking_ball',
  }, 14);
  assert.equal(climax.ok, true);
  assert.equal(climax.reason, 'observe_only');
  assert.equal(climax.stepsComplete, false);
  assert.equal(isBeatStepsComplete(state, 7), false);
  assert.equal(readSpine(state).solved['7'].verb, 'knock_down');
  assert.equal(readSpine(state).solved['7'].method, 'wrecking_ball');
  assert.equal(readSpine(state).solved['7'].stepId, 'deep_reach');

  assert.equal(state.story.beatIndex, 7);
  assert.equal(before.beatIndex, 0);
  assert.equal(state.player.credits, before.credits);
  assert.equal(state.player.heat, before.heat);
  assert.equal(state.factions.faction_scn.rep, before.scnRep);
});

test('a miss replaces the ask, a second miss does not restore it, and the cursor stays', () => {
  const state = fresh(1);
  const before = snapshotCanonicalSpine(state);
  const plain = offerOf(1, {});
  assert.equal(plain.params.completionMethods.length, 2);
  assert.equal(plain.title, 'Knock the variance tower');

  const first = failEncounter(state, 'tower_stood', 20, { failedMethod: 'wrecking_ball' });
  assert.equal(first.ok, true);
  assert.equal(first.advancedCanonicalBeat, false);
  assert.equal(state.story.beatIndex, 1);
  const sit = readSpine(state).situation;
  assert.equal(sit.attempt, 1);
  assert.equal(sit.closedMethod, 'wrecking_ball');
  assert.equal(sit.openMethod, 'cut_down');
  assert.equal(sit.askId, 'b1_a1_wrecking_ball');
  assert.equal(sit.instruction, 'The throw missed. Cut the spar down.');
  assert.equal(isBeatStepsComplete(state, 1), false);

  const untouched = offerOf(1, {});
  assert.deepEqual(untouched, plain);
  const scarred = offerOf(1, { state });
  assert.equal(scarred.type, plain.type);
  assert.equal(scarred.storyTag, plain.storyTag);
  assert.equal(scarred.title, plain.title);
  assert.equal(scarred.params.authoredSetPieceId, 'wrecking_ball');
  assert.deepEqual(scarred.params.completionMethods, ['cut_down']);
  assert.equal(scarred.brief, sit.instruction);
  assert.equal(scarred.params.targetStrength, 1.55);
  assert.equal(scarred.params.taskTime, 62);
  assert.equal(scarred.params.fValue, 1.35);
  assert.equal(scarred.params.situationAsk, sit.askId);

  const second = failEncounter(state, 'tower_stood', 40, {});
  const again = readSpine(state).situation;
  assert.equal(again.attempt, 2);
  assert.equal(again.closedMethod, 'wrecking_ball');
  assert.equal(again.openMethod, 'cut_down');
  assert.equal(again.askId, 'b1_a2_wrecking_ball');
  assert.notEqual(again.instruction, sit.instruction);
  assert.equal(again.instruction, 'The throw missed twice. The spar is split. Cut what is left.');
  assert.notEqual(again.instruction, plain.brief);
  const harder = offerOf(1, { state });
  assert.deepEqual(harder.params.completionMethods, ['cut_down']);
  assert.equal(harder.params.targetStrength, 1.9);
  assert.equal(harder.brief, again.instruction);
  assert.equal(harder.title, plain.title);
  assert.ok(readSpine(state).closed.some((row) => row.askId === sit.askId));

  const nameless = fresh(1);
  failEncounter(nameless, 'tower_stood', 20, {});
  const open = offerOf(1, { state: nameless });
  assert.deepEqual(open.params.completionMethods, ['wrecking_ball', 'cut_down']);
  assert.equal(open.brief, 'The tower cracked. Swing mass through what still stands, or cut what is left.');
  assert.doesNotMatch(open.brief, /throw/);
  assert.equal(open.params.targetStrength, 1.55);
  assert.notEqual(open.brief, plain.brief);

  assertSpineUnchanged(before, state, 'B1 miss');
});

test('B5 and B7 scars change the physical ask and leave the authored identity', () => {
  const traders = fresh(5, { branch: 'traders' });
  const base = offerOf(5, { branch: 'traders', chainStep: 0 });
  failEncounter(traders, 'short_ledger', 10, {});
  const hauled = offerOf(5, { state: traders, branch: 'traders', chainStep: 0 });
  assert.equal(hauled.params.qty, base.params.qty + 1);
  assert.notEqual(hauled.brief, base.brief);
  assert.equal(hauled.type, base.type);
  assert.equal(hauled.title, base.title);
  assert.equal(offerOf(5, { branch: 'traders', chainStep: 0 }).params.qty, base.params.qty);

  const patrol = fresh(5, { branch: 'patrol' });
  failEncounter(patrol, 'captain_lived', 10, {});
  const captain = offerOf(5, { state: patrol, branch: 'patrol', chainStep: 0 });
  const captainBase = offerOf(5, { branch: 'patrol', chainStep: 0 });
  assert.equal(captain.storyTarget.id, 'cap_sable_iask');
  assert.equal(captainBase.storyTarget.id, 'cap_sable_iask');
  assert.ok(captain.params.targetStrength > captainBase.params.targetStrength);

  const climax = fresh(7, { branch: 'patrol' });
  const climaxBase = offerOf(7, { branch: 'patrol', assetId: 'seed-live' });
  failEncounter(climax, 'approach_lost', 10, { failedMethod: 'park_the_hulk' });
  const posted = offerOf(7, { branch: 'patrol', assetId: 'seed-live' });
  const changed = offerOf(7, { state: climax, branch: 'patrol', assetId: 'seed-live' });
  assert.deepEqual(posted.params.completionMethods, ['park_the_hulk', 'swing_the_wedge']);
  assert.deepEqual(changed.params.completionMethods, ['swing_the_wedge']);
  assert.equal(changed.type, 'authored_set_piece');
  assert.equal(changed.title, climaxBase.title);
  assert.equal(changed.params.authoredSetPieceId, climaxBase.params.authoredSetPieceId);
  assert.equal(changed.brief, 'The parked hulk did not hold. Swing it through the wedge.');
  assert.equal(posted.title, climaxBase.title);
});

test('recovery keeps the same ask, and finishing the beat archives it', () => {
  const state = fresh(1);
  failEncounter(state, 'tower_stood', 50, { failedMethod: 'cut_down' });
  const ask = readSpine(state).situation;
  const early = recoverEncounter(state, 50 + FAIL_RECOVERY_COOLDOWN_S - 1);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'recovery_cooldown');
  assert.equal(readSpine(state).situation.rearmed, false);

  const rec = recoverEncounter(state, 50 + FAIL_RECOVERY_COOLDOWN_S);
  assert.equal(rec.ok, true, rec.reason);
  assert.equal(ensureCampaign47aState(state).beatStatus, BEAT_STATUS.TRACKING);
  const kept = readSpine(state).situation;
  assert.equal(kept.askId, ask.askId);
  assert.equal(kept.instruction, ask.instruction);
  assert.equal(kept.rearmed, true);
  assert.equal(state.story.beatIndex, 1);
  assert.equal(CAMPAIGN_BEATS[1].recovery.line, 'The tower still stands. Knock it down.');
  assert.equal(recoveryCommsForBeat(1).text, 'Tower still stands. Knock it down.');

  const done = recordBeatStep(state, 'mission:completed', { physicalVerb: 'knock_down' }, 80);
  assert.equal(done.stepsComplete, true);
  assert.equal(readSpine(state).situation, null);
  assert.equal(readSpine(state).closed.at(-1).askId, ask.askId);
  assert.equal(readSpine(state).solved['1'].verb, 'knock_down');
});

test('every beat\'s second miss is a different ask and does not move the cursor', () => {
  for (let beat = 0; beat <= 7; beat += 1) {
    const branch = beat === 7 ? 'patrol' : beat >= 4 ? 'traders' : null;
    const state = fresh(beat, branch ? { branch } : undefined);
    const before = snapshotCanonicalSpine(state);
    failEncounter(state, 'miss', 10, {});
    const first = readSpine(state).situation;
    failEncounter(state, 'miss', 30, {});
    const second = readSpine(state).situation;
    assert.equal(first.beat, beat);
    assert.notEqual(second.instruction, first.instruction, `B${beat} second miss reloaded the first ask`);
    assert.notEqual(second.askId, first.askId);
    assert.equal(second.attempt, 2);
    assert.equal(state.story.beatIndex, beat);
    assertSpineUnchanged(before, state, `B${beat} miss`);
  }
});

test('an earlier miss stays filed when a later beat fails', () => {
  const state = fresh(1);
  failEncounter(state, 'tower_stood', 3, {});
  const firstAsk = readSpine(state).situation.askId;
  state.story.beatIndex = 2;
  const before = snapshotCanonicalSpine(state);
  failEncounter(state, 'pod_cold', 5, { failedMethod: 'stage_tow' });
  const spine = readSpine(state);
  assert.equal(spine.situation.beat, 2);
  assert.equal(spine.situation.closedMethod, 'stage_tow');
  assert.equal(spine.situation.openMethod, 'corridor_pull');
  assert.ok(spine.closed.some((row) => row.beat === 1 && row.askId === firstAsk));
  assert.equal(state.story.beatIndex, 2);
  assert.match(spineRoadFrom(state).cite, /2 scarred misses/);
  assertSpineUnchanged(before, state, 'cross-beat miss');
});

test('a Deep Reach method is cited as the climax, not as the tower', () => {
  const state = fresh(1);
  recordBeatStep(state, 'mission:completed', {
    physicalVerb: 'knock_down', completionMethod: 'cut_down',
  }, 2);
  state.story.beatIndex = 7;
  state.story.branch = 'traders';
  recordBeatStep(state, 'mission:completed', {
    physicalVerb: 'knock_down', completionMethod: 'wrecking_ball',
  }, 9);
  const cite = spineRoadFrom(state).cite;
  assert.match(cite, /the tower cut/);
  assert.match(cite, /the climax thrown/);
  assert.doesNotMatch(cite, /the tower thrown/);
  assert.doesNotMatch(cite, /the tower knocked/);
  assert.equal(state.story.beatIndex, 7);
  assert.equal(isBeatStepsComplete(state, 7), false);
});

test('the door, the refusal, and the solved verb survive migrate and Continue', () => {
  const state = fresh(1);
  recordBeatStep(state, 'mission:completed', { physicalVerb: 'knock_down' }, 4);
  const refused = recordBeatStep(state, 'dock:docked', { refusedBranch: 'free' }, 5);
  assert.equal(refused.reason, 'already_complete');
  assert.equal(state.story.beatIndex, 1);
  assert.ok(readSpine(state).refused.includes('free'));
  assert.deepEqual(ensureCampaign47aState(state).stepProgress['1'].completed, ['knock']);

  state.story.beatIndex = 4;
  recordBeatStep(state, 'mission:accepted', liveBranchIntroPayload('patrol'), 6);
  const spine = readSpine(state);
  assert.equal(spine.door, 'patrol');
  assert.deepEqual(spine.refused.slice().sort(), ['free', 'traders']);
  assert.equal(spine.solved['1'].verb, 'knock_down');
  assert.deepEqual(ensureCampaign47aState(state).stepProgress['1'].completed, ['knock']);
  const own = ensureCampaign47aState(state);
  assert.ok(own.choiceLog.some((row) => row.kind === 'spine_refused' && row.branch === 'free'));
  assert.ok(own.choiceLog.some((row) => row.kind === 'spine_door' && row.branch === 'patrol'));

  const migrated = migrateCampaign47aState(JSON.parse(JSON.stringify(own)));
  assert.equal(migrated.flags.spine.door, 'patrol');
  assert.deepEqual(migrated.stepProgress['1'].completed, ['knock']);
  assert.equal(migrated.flags.spine.solved['1'].verb, 'knock_down');
  assert.ok(migrated.choiceLog.some((row) => row.kind === 'spine_door' && row.branch === 'patrol'));

  const blank = fresh(0);
  applyCampaign47aSaveBlob(blank, serializeCampaign47aState(own));
  blank.story.beatIndex = 4;
  blank.story.branch = 'patrol';
  assert.equal(readSpine(blank).door, 'patrol');
  assert.equal(readSpine(blank).solved['1'].verb, 'knock_down');
  assert.deepEqual(readSpine(blank).refused.slice().sort(), ['free', 'traders']);
  const round = JSON.parse(JSON.stringify(serializeCampaign47aState(ensureCampaign47aState(blank))));
  assert.equal(round.flags.spine.door, 'patrol');
  assert.equal(round.flags.spine.solved['1'].verb, 'knock_down');
});

test('Helios remembers the hull, and two contacts do not give the same account', () => {
  const quiet = fresh(0);
  assert.equal(spineGreeting('contact_maera_vols', quiet), null);
  assert.equal(spineGreeting('contact_halev_doss', quiet), null);
  const maeraAuthored = DEPTH_PROGRAM_CONTACTS.find((row) => row.id === 'contact_maera_vols').blurb;
  assert.equal(contact(quiet, 'station_helios', 'contact_maera_vols').blurb, maeraAuthored);

  const morrow = freshMorrowMemory();
  morrow.met = true;
  morrow.visits = 1;
  const morrowJson = JSON.stringify(morrow);
  quiet.morrow = morrow;
  assert.equal(spineGreeting('contact_maera_vols', quiet), 'R-07 has your hull. The engines stayed warm.');
  recordBeatStep(quiet, 'mining:yield', {}, 2);
  recordBeatStep(quiet, 'dock:docked', { stationId: 'station_helios' }, 3);
  assert.equal(JSON.stringify(quiet.morrow), morrowJson);
  assert.equal(spineGreeting('contact_maera_vols', quiet), 'You docked the variance sample here.');
  quiet.story.beatIndex = 1;
  assert.equal(spineGreeting('contact_halev_doss', quiet), 'Filed in the margin: you met R-07.');
  assert.notEqual(
    spineGreeting('contact_maera_vols', quiet),
    spineGreeting('contact_halev_doss', quiet),
  );

  const missed = fresh(1);
  missed.morrow = JSON.parse(morrowJson);
  failEncounter(missed, 'tower_stood', 10, {});
  recordBeatStep(missed, 'dock:docked', { stationId: 'station_helios' }, 10 + FAIL_RECOVERY_COOLDOWN_S);
  recordBeatStep(missed, 'mission:completed', { physicalVerb: 'knock_down' }, 30);
  assert.equal(JSON.stringify(missed.morrow), morrowJson);
  assert.equal(spineGreeting('contact_maera_vols', missed), 'You knocked the tower. The yard still rings.');
  assert.equal(spineGreeting('contact_halev_doss', missed), 'Filed: a miss, then the knock.');
  assert.ok(words(spineGreeting('contact_maera_vols', missed)) <= 12);
  assert.ok(words(spineGreeting('contact_halev_doss', missed)) <= 12);

  missed.story.beatIndex = 4;
  recordBeatStep(missed, 'mission:accepted', liveBranchIntroPayload('traders'), 40);
  const maera = contact(missed, 'station_helios', 'contact_maera_vols');
  const halev = contact(missed, 'station_helios', 'contact_halev_doss');
  assert.equal(maera.blurb, 'You knocked the tower. The yard still rings.');
  assert.equal(halev.blurb, 'Filed: a miss, then the knock.');
  assert.notEqual(maera.blurb, maeraAuthored);
  assert.notEqual(halev.blurb, DEPTH_PROGRAM_CONTACTS.find((row) => row.id === 'contact_halev_doss').blurb);

  const coldburn = contact(missed, 'station_reach', 'contact_coldburn_rey');
  const orrin = contact(missed, 'station_coalition', 'contact_orrin');
  const sker = contact(missed, 'station_sker', 'contact_sker_vane');
  assert.equal(coldburn.blurb, 'You took the grain lane. I kept mine.');
  assert.equal(orrin.blurb, 'You refused the patrol. The audit kept it.');
  assert.equal(sker.blurb, 'You walked my toll and did not pay.');
  for (const line of [coldburn.blurb, orrin.blurb, sker.blurb, maera.blurb, halev.blurb]) {
    assert.ok(words(line) <= 12, line);
  }

  const pods = fresh(1);
  recordBeatStep(pods, 'mission:completed', { physicalVerb: 'knock_down' }, 1);
  pods.story.beatIndex = 2;
  failEncounter(pods, 'pod_cold', 2, { failedMethod: 'stage_tow' });
  assert.equal(spineGreeting('contact_maera_vols', pods), 'The yard dock is hot. Reel the pods.');
  assert.notEqual(spineGreeting('contact_maera_vols', pods), spineGreeting('contact_halev_doss', pods));

  missed.story.endgameChoice = 'E';
  assert.equal(spineGreeting('contact_maera_vols', missed), 'You knocked the tower. I watched you file and leave.');
  assert.equal(spineGreeting('contact_halev_doss', missed), 'Filed: a miss, the knock, then the disposition.');

  const namedOnly = fresh(1);
  recordBeatStep(namedOnly, 'mission:completed', { physicalVerb: 'knock_down' }, 4);
  assert.match(spineGreeting('contact_latch_child', namedOnly), /knock/);
  assert.doesNotMatch(spineGreeting('contact_latch_child', namedOnly), /throw/);
  assert.doesNotMatch(spineGreeting('contact_tinker_zell', namedOnly), /crush/);
  assert.match(spineGreeting('contact_dustwife_senna', namedOnly), /knock/);
  assert.doesNotMatch(spineGreeting('contact_dustwife_senna', namedOnly), /throw/);
  const thrown = fresh(1);
  recordBeatStep(thrown, 'mission:completed', {
    physicalVerb: 'knock_down', completionMethod: 'wrecking_ball',
  }, 4);
  assert.match(spineGreeting('contact_latch_child', thrown), /throw/);
  assert.match(spineGreeting('contact_tinker_zell', thrown), /crush/);
  assert.ok(words(spineGreeting('contact_maera_vols', missed)) <= 12);
  assert.ok(words(spineGreeting('contact_halev_doss', missed)) <= 12);
});

test('witness contacts and empty late saves keep the authored line', () => {
  const authored = DEPTH_PROGRAM_CONTACTS.map((row) => row.blurb);
  const lateFriendly = {
    story: { beatIndex: 7 },
    factions: { faction_quiet: { rep: 30 } },
    player: { flags: { uniqueWrecksVisited: ['a', 'b', 'c'] } },
  };
  for (const card of DEPTH_PROGRAM_CONTACTS) {
    const shown = depthContactsForStation(card.stationHints[0], lateFriendly).find((row) => row.id === card.id);
    assert.ok(shown, card.id);
    assert.equal(shown.blurb, card.blurb, `${card.id} changed its authored blurb`);
  }

  const state = fresh(5, { branch: 'patrol' });
  state.story.beatIndex = 4;
  recordBeatStep(state, 'mission:accepted', liveBranchIntroPayload('patrol'), 3);
  state.story.beatIndex = 5;
  state.player.stationContactCounters = { 'kell.cover': 0, 'dorin.trust': 1 };
  assert.equal(spineGreeting('contact_filecleaver_dorin', state), null);
  assert.equal(spineGreeting('contact_wraith_kell', state), null);
  const customs = depthContactsForStation('station_customs', state);
  assert.equal(
    customs.find((row) => row.id === 'contact_wraith_kell').blurb,
    'I file manifests by day, copy them by night. Burn?',
  );
  assert.equal(
    customs.find((row) => row.id === 'contact_filecleaver_dorin').blurb,
    'The log has a record now. Your name is on it.',
  );
  state.player.stationContactCounters = { 'kell.cover': 3, 'dorin.trust': 0 };
  assert.equal(
    depthContactsForStation('station_customs', state).find((row) => row.id === 'contact_wraith_kell').blurb,
    'My day-files and night-files disagree. Walk past.',
  );
  assert.deepEqual(DEPTH_PROGRAM_CONTACTS.map((row) => row.blurb), authored);
});

test('the ledger names a method only when the receipt carries one', () => {
  const verbOnly = fresh(1);
  recordBeatStep(verbOnly, 'mission:completed', { physicalVerb: 'knock_down' }, 4);
  const verbLine = leftoverLedgerLine(verbOnly);
  assert.match(verbLine, /knocked the variance tower/);
  assert.doesNotMatch(verbLine, /thrown mass/);
  assert.doesNotMatch(verbLine, /cut the tower/);

  const thrown = fresh(1);
  recordBeatStep(thrown, 'mission:completed', {
    physicalVerb: 'knock_down', completionMethod: 'wrecking_ball',
  }, 4);
  const thrownLine = leftoverLedgerLine(thrown);
  assert.match(thrownLine, /thrown mass/);
  assert.doesNotMatch(thrownLine, /knocked the variance tower/);

  const generic = fresh(1);
  failEncounter(generic, 'tower_stood', 8, {});
  const genericLine = leftoverLedgerLine(generic);
  assert.match(genericLine, /missing the variance tower/);
  assert.match(genericLine, /the attempt failed/);
  assert.doesNotMatch(genericLine, /with the throw/);

  const named = fresh(1);
  failEncounter(named, 'tower_stood', 8, { failedMethod: 'wrecking_ball' });
  const namedLine = leftoverLedgerLine(named);
  assert.match(namedLine, /missing the tower with the throw/);
  assert.match(namedLine, /the attempt failed/);
  assert.equal(
    ensureCampaign47aState(named).receipts.find((row) => row.kind === 'encounter_fail').failedMethod,
    'wrecking_ball',
  );
});

test('a finished Deep Reach is remembered even though the beat never advances', () => {
  const state = fresh(7, { branch: 'traders' });
  failEncounter(state, 'siege_failed', 4, {});
  assert.match(spineGreeting('contact_maera_vols', state), /changed the job/);
  state.story.flags.deep_reach_operation_complete = true;
  state.story.flags.deep_reach_variant = 'ashfall_siege';
  const line = spineGreeting('contact_maera_vols', state);
  assert.equal(line, 'You finished the siege. I watched it leave.');
  assert.notEqual(line, spineGreeting('contact_halev_doss', state));
  const cite = spineRoadFrom(state).cite;
  assert.match(cite, /one scarred miss/);
  assert.match(cite, /the siege finished/);
  assert.equal(readSpine(state).situation.beat, 7);
  assert.equal(state.story.beatIndex, 7);

  state.story.endgameChoice = 'E';
  assert.equal(spineGreeting('contact_maera_vols', state), 'You took the grain door. I watched you file and leave.');
});

test('a deployed trader is not remembered as a drone', () => {
  const state = fresh(6);
  const step = recordBeatStep(state, 'asset:deployed', {
    kind: 'trader', id: 'hull-1', defId: 'ship_hauler',
  }, 3);
  assert.equal(step.stepsComplete, true);
  assert.equal(readSpine(state).solved['6'].asset, 'trader');
  assert.match(spineRoadFrom(state).cite, /the trader deployed/);
  assert.doesNotMatch(spineRoadFrom(state).cite, /drone/);
  const receipt = ensureCampaign47aState(state).receipts.find((row) => row.stepId === 'asset_deploy');
  assert.equal(receipt.assetKind, 'trader');
  const line = leftoverLedgerLine(state);
  assert.match(line, /deployed the trader/);
  assert.doesNotMatch(line, /drone/);
});

test('a headline verb is not spoken as one of the two solutions', () => {
  const knock = fresh(1);
  recordBeatStep(knock, 'mission:completed', { physicalVerb: 'knock_down' }, 2);
  assert.equal(spineGreeting('contact_halev_doss', knock), 'Filed: the tower fell. I did not see the hand.');
  assert.equal(spineGreeting('contact_lira_vonn', knock), 'I printed the knock. The yard kept it.');
  assert.doesNotMatch(spineGreeting('contact_halev_doss', knock), /throw|cut/);

  const core = fresh(3);
  recordBeatStep(core, 'mission:completed', { physicalVerb: 'tow' }, 2);
  assert.equal(spineGreeting('contact_coldburn_rey', core), 'You brought the core in. I saw the hull.');
  assert.doesNotMatch(spineGreeting('contact_coldburn_rey', core), /line/);
});

test('the finale cites the retained road and does not change which ending is offered', () => {
  const bare = fresh(7);
  assert.equal(spineRoadFrom(bare), null);
  const bareFacts = readLifeLedger(bare);
  const bareArchive = compileFinaleContent('E', bareFacts).beats.find((row) => row.evidenceSlot === 'archive');
  assert.doesNotMatch(bareArchive.text, /The road retained/);

  const state = fresh(1);
  recordBeatStep(state, 'mission:completed', { physicalVerb: 'knock_down' }, 4);
  state.story.beatIndex = 4;
  recordBeatStep(state, 'mission:accepted', liveBranchIntroPayload('traders'), 6);
  state.story.beatIndex = 7;
  state.story.branch = 'traders';
  state.morrow = freshMorrowMemory();
  state.morrow.met = true;
  state.morrow.visits = 1;
  const morrowJson = JSON.stringify(state.morrow);

  const road = spineRoadFrom(state);
  assert.equal(
    road.cite,
    'The road retained: the grain door taken; 2 doors refused; the tower knocked; R-07 met.',
  );
  assert.ok(road.solved.some((row) => row.beat === 1 && row.verb === 'knock_down'));
  assert.equal(JSON.stringify(state.morrow), morrowJson);

  const facts = readLifeLedger(state);
  assert.equal(facts.spineRoad.cite, road.cite);
  const finale = createWrittenFinale('E', facts, 'spine-road');
  const archive = finale.beats.find((row) => row.evidenceSlot === 'archive');
  assert.match(archive.text, /47-A is an administrative claim/);
  assert.match(archive.text, /The road retained: the grain door taken/);
  assert.equal(finale.basis.spineRoad.cite, road.cite);
  const normalized = normalizeWrittenFinale(JSON.parse(JSON.stringify(finale)));
  assert.match(normalized.beats.find((row) => row.evidenceSlot === 'archive').text, /the tower knocked/);

  const withRoad = assessEndingHistory(state);
  const savedSpine = state.story.campaign47a.flags.spine;
  state.story.campaign47a.flags.spine = null;
  const withoutSpine = assessEndingHistory(state);
  state.story.campaign47a.flags.spine = savedSpine;
  assert.equal(withRoad.recommended, withoutSpine.recommended);
  assert.deepEqual(withRoad.available, withoutSpine.available);
  assert.equal(withRoad.spine.cite, road.cite);
  assert.equal(assessEndingHistory(bare).spine, null);
});
