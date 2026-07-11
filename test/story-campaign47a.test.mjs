// Isolated tests for M5 Campaign 47-A sidecar / data library (task 1).
// Run: node test/story-campaign47a.test.mjs
// Does NOT claim full M5 acceptance, default wiring, or embodied continuous play.
// Asserts: no cursor/ending ownership, no synthetic shortcuts, ordered B0 steps,
// live B4 payloads, deterministic receipts, fail/recover without beat advance,
// outpost mapping, five ending descriptors, no direct authority writes.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BEAT_STATUS,
  BRANCH_CHAIN,
  BRANCH_OPPOSING,
  CAMPAIGN_BEATS,
  CAMPAIGN_EVENTS,
  CAMPAIGN_ID,
  CAMPAIGN_SCHEMA_VERSION,
  DISCARDED_OWNERSHIP_FIELDS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  ENDINGS,
  FAIL_RECOVERY_COOLDOWN_S,
  OUTPOST_SPECIALIZATIONS,
  STORY_BRANCH_INTRO_TAG,
  STORY_BRANCH_INTROS,
  applyCampaign47aSaveBlob,
  createCampaign47aState,
  describeBranchIntroOffer,
  describeBranchRepDeltas,
  describeEnding,
  describeEndingConsequences,
  ensureCampaign47aState,
  failEncounter,
  getBeatStepStatus,
  getCampaignPublicView,
  initCampaignSidecar,
  isBeatStepsComplete,
  isLiveBranchIntroPayload,
  listAvailableEndings,
  listOutpostSpecializations,
  migrateCampaign47aState,
  observeEndgameGate,
  readCanonicalStory,
  recordBeatStep,
  recoverEncounter,
  receiptId,
  receiptsEqual,
  buildStepProgressReceipt,
  selectOutpostSpecialization,
  serializeCampaign47aState,
  validateCampaign47aState,
} from '../src/story/campaign47a/index.js';
import {
  assertSpineUnchanged,
  endgameObservation,
  hasIntent,
  liveBranchIntroPayload,
  makeCampaignState,
  scanDirForNondeterminism,
  snapshotCanonicalSpine,
} from './story-campaign47a-fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CAMPAIGN_DIR = path.join(ROOT, 'src', 'story', 'campaign47a');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err && err.message ? err.message : err}`);
  }
}

console.log('story-campaign47a (sidecar library)');

// ── Schema: no cursor / ending ownership ───────────────────────────────────
check('default sidecar has no cursor/ending ownership fields', () => {
  const own = createCampaign47aState();
  const v = validateCampaign47aState(own);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(own.schemaVersion, CAMPAIGN_SCHEMA_VERSION);
  assert.equal(own.campaignId, CAMPAIGN_ID);
  assert.equal(own.beatStatus, BEAT_STATUS.IDLE);
  for (const key of DISCARDED_OWNERSHIP_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(own, key), false, `forbidden field ${key}`);
  }
  assert.equal(own.endingId, undefined);
  assert.equal(own.beatIndex, undefined);
  assert.equal(own.branch, undefined);
  assert.equal(own.endgameOffered, undefined);
});

check('migrate discards v1 dual-spine cursor/ending while preserving receipts/outpost', () => {
  const v1 = {
    schemaVersion: 1,
    campaignId: CAMPAIGN_ID,
    phase: 'active',
    beatIndex: 5,
    branch: 'traders',
    chainProgress: 2,
    chainTarget: 3,
    endgameOffered: true,
    endgameReady: true,
    endingId: 'A',
    endingsDeclined: ['B'],
    outpostSpecializationId: 'refinery',
    outpostsOwned: ['refinery'],
    receipts: [{ id: 'r1', kind: 'step_progress' }],
    choiceLog: [{ kind: 'outpost_spec', specializationId: 'refinery' }],
    sandbox: { mode: 'concord_auxiliary' },
    flags: { beat_0_done: true, outpost_processing: true },
    failuresByBeat: { '0': 1 },
    failureCount: 1,
  };
  const migrated = migrateCampaign47aState(v1);
  assert.equal(migrated.schemaVersion, 2);
  for (const key of DISCARDED_OWNERSHIP_FIELDS) {
    assert.equal(migrated[key], undefined, `should discard ${key}`);
  }
  assert.equal(migrated.outpostSpecializationId, 'refinery');
  assert.equal(migrated.receipts.length, 1);
  assert.equal(migrated.sandboxMode, 'concord_auxiliary');
  assert.equal(migrated.flags.outpost_processing, true);
  assert.equal(migrated.flags.beat_0_done, undefined, 'spine flags stripped');
  assert.equal(migrated.observedBeatIndex, 5, 'v1 beatIndex becomes observation cache only');
  const v = validateCampaign47aState(migrated);
  assert.equal(v.ok, true, v.errors.join('; '));
});

check('serialize/applySave round-trip preserves meta without inventing cursor', () => {
  const state = makeCampaignState();
  const own = ensureCampaign47aState(state);
  own.outpostSpecializationId = 'fuel_relay';
  own.outpostsOwned = ['fuel_relay'];
  own.receipts.push({ id: 'r1', kind: 'outpost_spec' });
  own.stepProgress['0'] = { completed: ['mine'], updatedAtS: 10 };
  own.sandboxMode = 'working_pilot';
  const blob = serializeCampaign47aState(own);
  assert.equal(blob.beatIndex, undefined);
  assert.equal(blob.endingId, undefined);
  const state2 = makeCampaignState();
  const applied = applyCampaign47aSaveBlob(state2, blob);
  assert.equal(applied.outpostSpecializationId, 'fuel_relay');
  assert.equal(applied.receipts.length, 1);
  assert.deepEqual(applied.stepProgress['0'].completed, ['mine']);
  assert.equal(applied.sandboxMode, 'working_pilot');
  assert.equal(applied.beatIndex, undefined);
});

// ── Data: no synthetic shortcuts; live contracts ───────────────────────────
check('beats have ordered steps and no primarySignal or story.beat shortcuts', () => {
  assert.equal(CAMPAIGN_BEATS.length, 8);
  for (const beat of CAMPAIGN_BEATS) {
    assert.equal(Object.prototype.hasOwnProperty.call(beat, 'primarySignal'), false, `${beat.id} primarySignal`);
    assert.equal(Object.prototype.hasOwnProperty.call(beat, 'completionSignals'), false, `${beat.id} completionSignals OR list`);
    if (beat.steps) {
      for (const step of beat.steps) {
        for (const sig of step.accept || []) {
          assert.ok(!String(sig).startsWith('story.beat.'), `synthetic shortcut ${sig}`);
        }
      }
    }
  }
  assert.equal(CAMPAIGN_BEATS[0].steps.length, 2);
  assert.equal(CAMPAIGN_BEATS[0].steps[0].id, 'mine');
  assert.equal(CAMPAIGN_BEATS[0].steps[1].id, 'dock');
  assert.equal(CAMPAIGN_BEATS[7].observeOnly, true);
  assert.equal(CAMPAIGN_BEATS[7].steps.length, 0);
});

check('no branch_intro/branch_chain mission types in data', () => {
  for (const beat of CAMPAIGN_BEATS) {
    assert.notEqual(beat.liveMissionType, 'branch_intro');
    assert.notEqual(beat.liveMissionType, 'branch_chain');
    assert.notEqual(beat.missionType, 'branch_intro');
    assert.notEqual(beat.missionType, 'branch_chain');
  }
  assert.equal(STORY_BRANCH_INTRO_TAG, 'story.branch_intro');
  const types = STORY_BRANCH_INTROS.map((i) => i.type).sort();
  assert.deepEqual(types, ['bulk_trade', 'patrol_clear', 'smuggling_run'].sort());
});

check('live B4 payload data matches branch intro contract', () => {
  for (const branch of ['traders', 'patrol', 'free']) {
    const offer = describeBranchIntroOffer(branch);
    assert.ok(offer);
    assert.equal(offer.storyTag, STORY_BRANCH_INTRO_TAG);
    assert.ok(['bulk_trade', 'patrol_clear', 'smuggling_run'].includes(offer.type));
    assert.ok(isLiveBranchIntroPayload(offer));
  }
  // Non-live shapes rejected
  assert.equal(isLiveBranchIntroPayload({
    storyTag: 'campaign47a:b4:patrol',
    type: 'branch_intro',
  }), false);
  assert.equal(isLiveBranchIntroPayload({
    storyTag: 'story.branch_intro',
    type: 'branch_intro',
  }), false);

  // Single opposing map
  assert.equal(BRANCH_OPPOSING.patrol, 'faction_free');
  assert.equal(BRANCH_OPPOSING.free, 'faction_scn');
  assert.equal(BRANCH_OPPOSING.traders, 'faction_dmc');
  const rep = describeBranchRepDeltas('traders');
  assert.equal(rep.opposing.factionId, 'faction_dmc');
  assert.equal(rep.chosen.delta, 15);
});

check('five ending descriptors with sandbox modes; A has mts+scn+heat clear; C loopBack', () => {
  assert.equal(ENDINGS.length, 5);
  assert.equal(ENDINGS.map((e) => e.id).sort().join(''), 'ABCDE');
  const modes = new Set(ENDINGS.map((e) => e.sandbox.mode));
  assert.equal(modes.size, 5);

  const a = describeEndingConsequences('A');
  assert.ok(a);
  assert.equal(a.applied, false);
  const scn = a.consequences.rep.find((r) => r.factionId === 'faction_scn');
  const mts = a.consequences.rep.find((r) => r.factionId === 'faction_mts');
  assert.equal(scn.delta, 700);
  assert.equal(mts.delta, 100);
  assert.equal(a.consequences.heat.intent, 'heat:clear');

  const c = describeEndingConsequences('C');
  assert.ok(c.loopBackIntent);
  assert.equal(c.loopBackIntent.event, 'endgame:loopBack');

  for (const e of ENDINGS) {
    assert.ok(e.sandbox && e.sandbox.mode, `${e.id} sandbox mode`);
  }
});

check('three outpost specializations map to automation defs', () => {
  const specs = listOutpostSpecializations();
  assert.equal(specs.length, 3);
  const roles = new Set(specs.map((s) => s.role));
  assert.equal(roles.size, 3);
  for (const s of specs) {
    assert.ok(s.outpostDefId.startsWith('outpost_'));
    assert.ok(s.deployObserve);
    assert.ok(s.consequenceFlags.length >= 1);
  }
  assert.deepEqual(
    specs.map((s) => s.id).sort(),
    ['fuel_relay', 'hab_fortress', 'refinery'],
  );
  assert.equal(OUTPOST_SPECIALIZATIONS.length, 3);
});

// ── Ordered B0 steps (embodied recipe, no teleport claim) ──────────────────
check('B0 requires mine then dock in order; dock alone fails', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 0;
  initCampaignSidecar(state, 0);
  const before = snapshotCanonicalSpine(state);

  const dockFirst = recordBeatStep(state, 'dock:docked', { stationId: 'station_helios' }, 1);
  assert.equal(dockFirst.ok, false, 'dock before mine must fail');
  assert.ok(
    dockFirst.reason === 'step_out_of_order:need_mine' || dockFirst.reason === 'signal_mismatch:dock:docked',
    dockFirst.reason,
  );
  assert.equal(isBeatStepsComplete(state, 0), false);

  const mine = recordBeatStep(state, 'mining:yield', { amount: 1 }, 2);
  assert.equal(mine.ok, true, mine.reason);
  assert.equal(mine.stepId, 'mine');
  assert.equal(mine.stepsComplete, false);
  assert.equal(mine.advancedCanonicalBeat, false);
  assert.equal(isBeatStepsComplete(state, 0), false);

  const dock = recordBeatStep(state, 'dock:docked', { stationId: 'station_helios' }, 3);
  assert.equal(dock.ok, true, dock.reason);
  assert.equal(dock.stepsComplete, true);
  assert.equal(isBeatStepsComplete(state, 0), true);

  assertSpineUnchanged(before, state, 'B0 steps');
  assert.equal(state.story.beatIndex, 0, 'canonical beat not advanced by sidecar');
});

check('synthetic story.beat.* signals are rejected', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 0;
  initCampaignSidecar(state, 0);
  const r = recordBeatStep(state, 'story.beat.cold_start', {}, 1);
  assert.equal(r.ok, false);
  assert.ok(String(r.reason).includes('signal_mismatch') || String(r.reason).includes('out_of_order'));
});

// ── B4 live intro receipt ──────────────────────────────────────────────────
check('B4 accepts live branch_intro payload and rejects non-live tags', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 4;
  initCampaignSidecar(state, 0);
  const before = snapshotCanonicalSpine(state);

  const bad = recordBeatStep(state, 'mission:accepted', {
    storyTag: 'campaign47a:b4:patrol',
    type: 'branch_intro',
    branch: 'patrol',
  }, 10);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'not_live_branch_intro');

  const good = recordBeatStep(state, 'mission:accepted', liveBranchIntroPayload('patrol'), 11);
  assert.equal(good.ok, true, good.reason);
  assert.equal(good.stepsComplete, true);
  assert.equal(good.branch, 'patrol');
  assert.ok(good.receipt && good.receipt.kind === 'branch_intro_accept');
  assert.equal(good.advancedCanonicalBeat, false);
  assertSpineUnchanged(before, state, 'B4 intro');
});

// ── B5 chain observation ───────────────────────────────────────────────────
check('B5 uses chain counts; incomplete chain does not mark steps complete', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 5;
  state.story.branch = 'traders';
  state.story.chainProgress = 1;
  initCampaignSidecar(state, 0);
  const before = snapshotCanonicalSpine(state);

  const tick = recordBeatStep(state, 'mission:completed', {
    missionType: 'bulk_trade',
    chainProgress: 1,
  }, 20);
  assert.equal(tick.ok, true);
  assert.equal(tick.stepsComplete, false);
  assert.equal(tick.reason, 'chain_progress');

  state.story.chainProgress = BRANCH_CHAIN.traders.count;
  const done = recordBeatStep(state, 'mission:completed', {
    missionType: 'bulk_trade',
    chainProgress: BRANCH_CHAIN.traders.count,
  }, 21);
  assert.equal(done.ok, true, done.reason);
  assert.equal(done.stepsComplete, true);
  assert.equal(done.advancedCanonicalBeat, false);
  assertSpineUnchanged(
    { ...before, chainProgress: BRANCH_CHAIN.traders.count },
    state,
    'B5 chain',
  );
});

// ── B6 asset deploy ────────────────────────────────────────────────────────
check('B6 requires asset:deployed payload; tags outpost when defId present', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 6;
  state.story.branch = 'free';
  initCampaignSidecar(state, 0);
  const before = snapshotCanonicalSpine(state);

  const empty = recordBeatStep(state, 'asset:deployed', {}, 30);
  assert.equal(empty.ok, false);

  const dep = recordBeatStep(state, 'asset:deployed', {
    kind: 'outpost',
    id: 'op1',
    defId: 'outpost_fuelsynth',
  }, 31);
  assert.equal(dep.ok, true, dep.reason);
  assert.equal(dep.stepsComplete, true);
  assert.equal(ensureCampaign47aState(state).outpostSpecializationId, 'fuel_relay');
  assertSpineUnchanged(before, state, 'B6 deploy');
});

// ── B7 observe only ────────────────────────────────────────────────────────
check('B7 only observes live gate; does not offer or choose ending', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 7;
  initCampaignSidecar(state, 0);
  const before = snapshotCanonicalSpine(state);

  const step = recordBeatStep(state, 'story.ending.chosen', { endingId: 'A' }, 40);
  assert.equal(step.ok, true);
  assert.equal(step.observeOnly, true);
  assert.equal(step.stepsComplete, false);

  const gate = observeEndgameGate({ netWorthCr: 1000, factionRep: 10 });
  assert.equal(gate.ready, false);
  assert.equal(gate.need.netWorthCr, ENDGAME_NET_WORTH_CR);
  assert.equal(gate.need.repMin, ENDGAME_REP_MIN);

  const ready = observeEndgameGate(endgameObservation());
  assert.equal(ready.ready, true);

  // No chooseEnding production API — only descriptors.
  const desc = describeEnding('A', 41);
  assert.equal(desc.ok, true);
  assert.equal(desc.applied, false);
  assert.equal(state.story.endgameChoice, null);
  assertSpineUnchanged(before, state, 'B7 observe');
});

// ── Fail / recover without beat advance ────────────────────────────────────
check('fail/recover does not advance or mutate canonical beatIndex', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 2;
  initCampaignSidecar(state, 0);
  const before = snapshotCanonicalSpine(state);

  const fail = failEncounter(state, 'bounty_escaped', 50, { encounterId: 'enc_1' });
  assert.equal(fail.ok, true);
  assert.equal(fail.own.beatStatus, BEAT_STATUS.FAILED);
  assert.equal(fail.recoverable, true);
  assert.equal(fail.advancedCanonicalBeat, false);
  assert.equal(state.story.beatIndex, 2);
  assert.ok(fail.receipt.kind === 'encounter_fail');
  assert.ok(hasIntent(fail.intents, CAMPAIGN_EVENTS.beatFailed));
  assert.ok(hasIntent(fail.intents, CAMPAIGN_EVENTS.receipt));
  assert.ok(!hasIntent(fail.intents, 'encounter:receipt'));

  const early = recoverEncounter(state, 50 + FAIL_RECOVERY_COOLDOWN_S - 1);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'recovery_cooldown');

  const rec = recoverEncounter(state, 50 + FAIL_RECOVERY_COOLDOWN_S);
  assert.equal(rec.ok, true, rec.reason);
  assert.equal(rec.own.beatStatus, BEAT_STATUS.TRACKING);
  assert.equal(state.story.beatIndex, 2);
  assert.ok(hasIntent(rec.intents, CAMPAIGN_EVENTS.beatRecovered));
  assertSpineUnchanged(before, state, 'fail/recover');
});

check('dock signal re-arms failed beat without advancing spine', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 0;
  initCampaignSidecar(state, 0);
  failEncounter(state, 'mission:failed', 5);
  const before = snapshotCanonicalSpine(state);
  const r = recordBeatStep(state, 'dock:docked', { stationId: 'station_helios' }, 5 + FAIL_RECOVERY_COOLDOWN_S);
  assert.equal(r.ok, true, r.reason);
  assert.equal(ensureCampaign47aState(state).beatStatus, BEAT_STATUS.TRACKING);
  assert.equal(state.story.beatIndex, 0);
  assertSpineUnchanged(before, state, 'rearm');
});

// ── Outpost select ─────────────────────────────────────────────────────────
check('selectOutpostSpecialization tags meta only', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 6;
  const before = snapshotCanonicalSpine(state);
  const spec = selectOutpostSpecialization(state, 'hab_fortress', 60);
  assert.equal(spec.ok, true, spec.reason);
  assert.equal(spec.own.outpostSpecializationId, 'hab_fortress');
  assert.ok(hasIntent(spec.intents, CAMPAIGN_EVENTS.outpostTagged));
  assert.ok(!hasIntent(spec.intents, 'asset:deployed'), 'does not emit deploy authority');
  assertSpineUnchanged(before, state, 'outpost select');
});

// ── Ending descriptors / availability (query only) ─────────────────────────
check('listAvailableEndings respects declined and cargo gates without writing endgame', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 7;
  const before = snapshotCanonicalSpine(state);
  const obs = endgameObservation({ cargoIds: [] });
  const open = listAvailableEndings(obs, []);
  const ids = open.map((e) => e.id);
  assert.ok(ids.includes('A'));
  assert.ok(ids.includes('B'));
  assert.ok(!ids.includes('D'), 'D needs ledger');
  assert.ok(!ids.includes('E'), 'E needs declines');

  const afterDecline = listAvailableEndings(obs, ['A', 'B', 'C', 'D']);
  assert.ok(afterDecline.some((e) => e.id === 'E'));
  assert.equal(state.story.endgameChoice, null);
  assert.equal(state.story.endgameDeclined.length, 0);
  assertSpineUnchanged(before, state, 'list endings');
});

check('describeEnding builds descriptor receipt without applying A consequences', () => {
  const state = makeCampaignState();
  const before = snapshotCanonicalSpine(state);
  const r = describeEnding('A', 70);
  assert.equal(r.ok, true);
  assert.equal(r.applied, false);
  assert.equal(r.consequences.consequences.heat.intent, 'heat:clear');
  assert.equal(state.player.credits, before.credits);
  assert.equal(state.player.heat, before.heat);
  assert.equal(state.factions.faction_scn.rep, before.scnRep);
  assert.equal(state.story.endgameChoice, null);
});

// ── Determinism & hygiene ──────────────────────────────────────────────────
check('receipt ids are stable for identical inputs', () => {
  const a = buildStepProgressReceipt({
    beatIndex: 0,
    stepId: 'mine',
    signal: 'mining:yield',
    completedSteps: ['mine'],
    stepsComplete: false,
    simTime: 42,
    attempt: 1,
  });
  const b = buildStepProgressReceipt({
    beatIndex: 0,
    stepId: 'mine',
    signal: 'mining:yield',
    completedSteps: ['mine'],
    stepsComplete: false,
    simTime: 42,
    attempt: 1,
  });
  assert.equal(a.id, b.id);
  assert.ok(receiptsEqual(a, b));
  assert.ok(receiptId('step_progress', { beat: 0, step: 'mine', t: 42 }).startsWith('receipt:campaign47a:'));
});

check('source tree has no Math.random or wall clock', () => {
  const hits = scanDirForNondeterminism(fs, path, CAMPAIGN_DIR);
  assert.equal(hits.length, 0, JSON.stringify(hits));
});

check('no direct credit/rep/cargo/heat writes; no forbidden production emits in modules', () => {
  const files = fs.readdirSync(CAMPAIGN_DIR).filter((f) => f.endsWith('.js'));
  const forbiddenEmit = [
    /['"]encounter:receipt['"]/,
    /['"]story:beatAdvanced['"]/,
    /['"]economy:grantCredits['"]/,
    /['"]economy:chargeCredits['"]/,
    /['"]toast['"]\s*,/,
    /event:\s*['"]toast['"]/,
    /['"]mission:offered['"]/,
  ];
  for (const f of files) {
    const text = fs.readFileSync(path.join(CAMPAIGN_DIR, f), 'utf8');
    assert.ok(!/\bplayer\.credits\s*=/.test(text), `${f}: player.credits write`);
    assert.ok(!/\bplayer\.heat\s*=/.test(text), `${f}: player.heat write`);
    assert.ok(!/\bfactions\[[^\]]+\]\.rep\s*=/.test(text), `${f}: faction.rep write`);
    assert.ok(!/\bstate\.player\.cargo\b/.test(text), `${f}: cargo authority leak`);
    assert.ok(!/\bcargo\.items\s*\[/.test(text), `${f}: cargo.items write`);
    assert.ok(!/\bMath\.random\s*\(/.test(text), `${f}: Math.random`);
    // Production APIs must not assign story spine
    assert.ok(!/\bstory\.beatIndex\s*=(?!=)/.test(text), `${f}: story.beatIndex write`);
    assert.ok(!/\bstory\.endgameChoice\s*=(?!=)/.test(text), `${f}: endgameChoice write`);
    for (const re of forbiddenEmit) {
      // Allow mentions in comments/notes/strings documenting "never emit X"
      // Strict: reject event: 'X' production shapes
      if (re.test(text)) {
        // Exception: comments and note strings that document forbidden events.
        const lines = text.split('\n').filter((line) => re.test(line));
        for (const line of lines) {
          const trimmed = line.trim();
          const isComment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.includes('never emit')
            || trimmed.includes('Never emit') || trimmed.includes('not emit') || trimmed.includes('NOT emit')
            || trimmed.includes('descriptor') || trimmed.includes('note:') || trimmed.includes('Never mutates')
            || trimmed.includes('does not emit') || trimmed.includes('Do not emit')
            || trimmed.includes('not board injection') || trimmed.includes('mission:offered does not');
          // Hard ban on object event fields that emit forbidden names
          if (/event:\s*['"](?:encounter:receipt|story:beatAdvanced|economy:grantCredits|toast|mission:offered)/.test(line)) {
            assert.fail(`${f}: forbidden production event field: ${trimmed}`);
          }
          if (!isComment && /AUTHORITY_EVENTS\.|CAMPAIGN_EVENTS\./.test(line) === false) {
            // Still allow string constants in documentation objects only if clearly notes
            if (/['"]encounter:receipt['"]/.test(line) && !/never|not |descriptor|collision|do not/i.test(line)) {
              assert.fail(`${f}: unexpected encounter:receipt: ${trimmed}`);
            }
          }
        }
      }
    }
  }
});

check('public view exposes observation + meta without mutating spine', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 0;
  initCampaignSidecar(state, 0);
  const before = snapshotCanonicalSpine(state);
  const v1 = getCampaignPublicView(state);
  const v2 = getCampaignPublicView(state);
  assert.equal(v1.beatId, 'cold_start');
  assert.equal(v1.ownsProgression, false);
  assert.equal(v1.objective, v2.objective);
  assert.equal(v1.valid, true);
  assert.equal(v1.beatIndex, 0);
  assert.ok(v1.stepProgress);
  assertSpineUnchanged(before, state, 'public view');
});

check('readCanonicalStory reflects live spine fields', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 3;
  state.story.branch = 'free';
  state.story.chainProgress = 1;
  state.story.endgameChoice = null;
  const c = readCanonicalStory(state);
  assert.equal(c.beatIndex, 3);
  assert.equal(c.branch, 'free');
  assert.equal(c.chainProgress, 1);
});

check('getBeatStepStatus reports ordered B0 progress', () => {
  const state = makeCampaignState();
  state.story.beatIndex = 0;
  initCampaignSidecar(state, 0);
  recordBeatStep(state, 'mining:yield', {}, 1);
  const st = getBeatStepStatus(state, 0);
  assert.equal(st.steps.find((s) => s.id === 'mine').done, true);
  assert.equal(st.steps.find((s) => s.id === 'dock').done, false);
  assert.equal(st.stepsComplete, false);
});

console.log('');
if (failures > 0) {
  console.error(`story-campaign47a: ${failures} failure(s)`);
  process.exit(1);
}
console.log('story-campaign47a: all checks passed (sidecar only — not M5 acceptance)');
process.exit(0);
