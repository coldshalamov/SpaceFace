// M3 Hunter origin chain — RED-to-GREEN isolated tests.
// Run: node test/hunter-origin.test.mjs
// Does not require package.json wiring; lead integrates check script later.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { isPlayerWanted, THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';
import { CombatDoctrineId } from '../src/ai/combatDoctrine.js';

import {
  HUNTER_ORIGIN_ID,
  HUNTER_ORIGIN_REWARD,
  HUNTER_ORIGIN_STEPS,
  HUNTER_ORIGIN_EVENTS,
  HUNTER_OFFER_STATUS,
  HUNTER_PHASE,
  classifyHunterContact,
  onHunterFirstDock,
  offerHunterOrigin,
  declineHunterOrigin,
  acceptHunterOrigin,
  abandonHunterOrigin,
  confirmHunterMark,
  tickHunterPursuit,
  failHunterPursuitLost,
  resolveHunterCounterplay,
  resolveHunterCleanKill,
  noteHunterIllegalFire,
  noteHunterHeatSpiked,
  recoverHunterStep,
  pickHunterDoctrine,
  hunterOriginPresentation,
  hunterOrigin,
  ensureHunterOriginState,
  getHunterOriginState,
  serializeHunterOrigin,
  deserializeHunterOrigin,
  migrateHunterOrigin,
  createHunterOriginState,
  hunterOriginSaveSchema,
} from '../src/careers/origins/hunterOrigin.js';

import {
  makeState,
  makeBus,
  makeHostilePirate,
  makeLawfulPatrol,
  makeCivilianTrader,
  installPlayer,
  collectEvents,
} from './hunter-origin-fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let sections = 0;
function ok(label) {
  sections += 1;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in hunter origin path'); };
  Date.now = () => { throw new Error('Date.now forbidden in hunter origin path'); };
  try {
    return fn();
  } finally {
    Math.random = random;
    Date.now = now;
  }
}

// ── File isolation ───────────────────────────────────────────────────────────

function testFilesExistAndIsolated() {
  const required = [
    'src/careers/origins/hunterOrigin.js',
    'src/careers/origins/hunterOriginData.js',
    'src/careers/origins/hunterOriginSave.js',
    'test/hunter-origin.test.mjs',
    'test/hunter-origin-fixtures.mjs',
  ];
  for (const rel of required) {
    assert.ok(existsSync(join(ROOT, rel)), `missing ${rel}`);
  }
  // Must not have edited package.json as part of this candidate (script may be absent).
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['check:hunter-origin'],
    undefined,
    'candidate must not wire package.json; lead owns integration',
  );
  ok('isolated hunter* / hunter-origin* files exist; package.json unwired');
}

// ── Schema / save ────────────────────────────────────────────────────────────

function testSaveSchemaDeterministic() {
  const a = createHunterOriginState(42);
  const b = createHunterOriginState(42);
  assert.deepEqual(a, b, 'same seed → identical fresh state');
  assert.equal(a.schemaVersion, 1);
  assert.equal(a.careerId, HUNTER_ORIGIN_ID);
  assert.equal(a.exclusive, false);
  assert.equal(a.reward.credits, HUNTER_ORIGIN_REWARD.credits);
  assert.ok(a.reward.credits <= 900, 'reward must stay modest for balance lab');
  assert.ok(a.reward.credits < 1000, 'reward must not dominate starter economy');

  const legacy = { schemaVersion: 0, offer: { status: 'offered', declineCount: 2 } };
  const migrated = migrateHunterOrigin(legacy, 7);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.offer.status, HUNTER_OFFER_STATUS.OFFERED);
  assert.equal(migrated.offer.declineCount, 2);
  assert.equal(migrated.careerId, HUNTER_ORIGIN_ID);
  assert.equal(migrated.exclusive, false);

  const state = makeState(99);
  const own = ensureHunterOriginState(state);
  own.offer.status = HUNTER_OFFER_STATUS.ACCEPTED;
  own.stepIndex = 1;
  own.stepId = 'pursuit';
  own.phase = HUNTER_PHASE.ACTIVE;
  own.target.entityId = 50;
  own.target.doctrineId = CombatDoctrineId.RANGED_DISENGAGER;
  own.progress.pursuitContactTicks = 40;
  const blob = serializeHunterOrigin(state);
  assert.equal(blob.stepId, 'pursuit');
  assert.equal(blob.progress.pursuitContactTicks, 40);

  const state2 = makeState(99);
  deserializeHunterOrigin(blob, state2);
  const restored = getHunterOriginState(state2);
  assert.equal(restored.stepId, 'pursuit');
  assert.equal(restored.target.doctrineId, CombatDoctrineId.RANGED_DISENGAGER);
  assert.equal(restored.progress.pursuitContactTicks, 40);
  assert.deepEqual(serializeHunterOrigin(state2), blob, 'round-trip stable');

  const schema = hunterOriginSaveSchema();
  assert.equal(schema.id, 'spaceface.hunterOrigin.v1');
  assert.ok(schema.required.includes('rngSeed'));
  ok('save schema migrate/serialize/deserialize deterministic and non-exclusive');
}

// ── First dock / non-binding ─────────────────────────────────────────────────

function testFirstDockOfferDeclineReoffer() {
  const state = makeState(11);
  const bus = makeBus();
  const events = collectEvents(bus, [
    HUNTER_ORIGIN_EVENTS.OFFERED,
    HUNTER_ORIGIN_EVENTS.DECLINED,
    HUNTER_ORIGIN_EVENTS.ACCEPTED,
  ]);

  state.simTime = 12.5;
  const first = onHunterFirstDock(state, { stationId: 'station_helios', simTime: 12.5 }, bus);
  assert.equal(first.ok, true);
  assert.equal(getHunterOriginState(state).offer.status, HUNTER_OFFER_STATUS.OFFERED);
  assert.equal(getHunterOriginState(state).offer.firstDockStationId, 'station_helios');
  assert.equal(getHunterOriginState(state).offer.firstDockSeen, true);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.OFFERED].length, 1);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.OFFERED][0].exclusive, false);

  // Second dock while offered does not spam.
  const again = onHunterFirstDock(state, { stationId: 'station_helios', simTime: 20 }, bus);
  assert.equal(again.reoffered, false);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.OFFERED].length, 1);

  const dec = declineHunterOrigin(state, { simTime: 21 }, bus);
  assert.equal(dec.ok, true);
  assert.equal(dec.reofferAllowed, true);
  assert.equal(getHunterOriginState(state).offer.status, HUNTER_OFFER_STATUS.DECLINED);
  assert.equal(getHunterOriginState(state).offer.declineCount, 1);

  // Re-offer on next dock after decline.
  const re = onHunterFirstDock(state, { stationId: 'station_helios', simTime: 40 }, bus);
  assert.equal(re.ok, true);
  assert.equal(re.reoffered, true);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.OFFERED].length, 2);

  const acc = acceptHunterOrigin(state, { simTime: 41 }, bus);
  assert.equal(acc.ok, true);
  assert.equal(acc.stepId, 'identify');
  assert.equal(getHunterOriginState(state).offer.status, HUNTER_OFFER_STATUS.ACCEPTED);
  assert.equal(getHunterOriginState(state).exclusive, false);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.ACCEPTED][0].mutualNonExclusion, true);
  ok('first dock offers, decline re-offers, accept is non-binding/non-exclusive');
}

// ── Target identification (live hostility/heat/doctrine) ─────────────────────

function testClassificationUsesLiveAuthorities() {
  const state = makeState(22);
  installPlayer(state);
  state.player.heat = 0;

  const pirate = makeHostilePirate({ doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER });
  const patrol = makeLawfulPatrol();
  const trader = makeCivilianTrader();

  const pCls = classifyHunterContact(state, pirate);
  assert.equal(pCls.contactWord, 'HOSTILE', 'pirate must read HOSTILE');
  assert.equal(pCls.hostile, true);
  assert.equal(pCls.lawful, false);
  assert.equal(pCls.legalBounty, true);
  assert.equal(pCls.doctrineId, CombatDoctrineId.TETHER_CONTROL_RAIDER);

  const lawCls = classifyHunterContact(state, patrol);
  assert.equal(lawCls.contactWord, 'PATROL');
  assert.equal(lawCls.hostile, false, 'clean heat → patrol not hostile');
  assert.equal(lawCls.lawful, true);
  assert.equal(lawCls.legalBounty, false);

  // Heat authority flips lawful hostility.
  state.player.heat = WANTED_THRESHOLD;
  assert.equal(isPlayerWanted(state), true);
  const wantedCls = classifyHunterContact(state, patrol);
  assert.equal(wantedCls.hostile, true, 'WANTED → patrol hostile via heat authority');
  assert.equal(wantedCls.legalBounty, false, 'patrol never a legal bounty mark');

  state.player.heat = 0;
  const tCls = classifyHunterContact(state, trader);
  assert.ok(tCls.contactWord === 'TRADER' || tCls.civilian === true);
  assert.equal(tCls.legalBounty, false);
  assert.equal(tCls.hostile, false);
  ok('classification uses scanner contact words, isHostileToPlayer, heat, combat doctrines');
}

function testIdentifyStepSuccessAndLawfulFailure() {
  const state = makeState(33);
  const bus = makeBus();
  installPlayer(state);
  onHunterFirstDock(state, { stationId: 'station_helios', simTime: 1 }, bus);
  acceptHunterOrigin(state, { simTime: 2 }, bus);

  // Lawful mark fails with recovery.
  const patrol = makeLawfulPatrol();
  const fail = confirmHunterMark(state, patrol, { simTime: 3 }, bus);
  assert.equal(fail.failed, true);
  assert.equal(fail.failure.code, 'marked_lawful');
  assert.equal(getHunterOriginState(state).phase, HUNTER_PHASE.RECOVERING);
  assert.ok(fail.failure.recoveryHint.length > 0);

  const rec = recoverHunterStep(state, { simTime: 4 }, bus);
  assert.equal(rec.ok, true);
  assert.equal(rec.stepId, 'identify');
  assert.equal(getHunterOriginState(state).phase, HUNTER_PHASE.ACTIVE);

  // Civilian fails similarly.
  const trader = makeCivilianTrader();
  const civFail = confirmHunterMark(state, trader, { simTime: 5 }, bus);
  assert.equal(civFail.failed, true);
  assert.ok(
    civFail.failure.code === 'marked_civilian' || civFail.failure.code === 'marked_lawful',
  );
  recoverHunterStep(state, { simTime: 6 }, bus);

  // Legal hostile succeeds → advances to pursuit.
  const pirate = makeHostilePirate({ doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY });
  const okMark = confirmHunterMark(state, pirate, { simTime: 7 }, bus);
  assert.equal(okMark.ok, true);
  assert.equal(okMark.stepId, 'pursuit');
  const own = getHunterOriginState(state);
  assert.equal(own.target.entityId, pirate.id);
  assert.equal(own.target.legalBounty, true);
  assert.equal(own.progress.identifyConfirmed, true);
  assert.equal(own.target.doctrineId, CombatDoctrineId.INTERCEPTOR_FLYBY);
  ok('identify step: lawful/civilian fail+recover; HOSTILE advances to pursuit');
}

// ── Pursuit under doctrine ───────────────────────────────────────────────────

function testPursuitAndCounterplayHappyPath() {
  const state = makeState(44);
  const bus = makeBus();
  const events = collectEvents(bus, [
    HUNTER_ORIGIN_EVENTS.STEP_COMPLETE,
    HUNTER_ORIGIN_EVENTS.COMPLETED,
    HUNTER_ORIGIN_EVENTS.REWARD,
    HUNTER_ORIGIN_EVENTS.GRANT_CREDITS,
  ]);
  installPlayer(state);
  onHunterFirstDock(state, { stationId: 'station_helios', simTime: 1 }, bus);
  acceptHunterOrigin(state, { simTime: 2 }, bus);
  const pirate = makeHostilePirate({ doctrineId: CombatDoctrineId.RANGED_DISENGAGER });
  confirmHunterMark(state, pirate, { simTime: 3 }, bus);

  const need = HUNTER_ORIGIN_STEPS[1].pursuitContactTicks;
  // Partial contact — not done yet.
  tickHunterPursuit(state, { inContact: true, dtTicks: Math.floor(need / 2), simTime: 10 }, bus);
  assert.equal(getHunterOriginState(state).stepId, 'pursuit');
  assert.ok(getHunterOriginState(state).progress.pursuitContactTicks < need);

  // Mark lost → recover → continue.
  failHunterPursuitLost(state, { simTime: 11 }, bus);
  assert.equal(getHunterOriginState(state).phase, HUNTER_PHASE.RECOVERING);
  recoverHunterStep(state, { simTime: 12 }, bus);
  assert.equal(getHunterOriginState(state).progress.pursuitContactTicks, 0);

  // Finish pursuit in one contact burst.
  const held = tickHunterPursuit(state, { inContact: true, dtTicks: need, simTime: 20 }, bus);
  assert.equal(held.ok, true);
  assert.equal(held.stepId, 'counterplay');

  // Counterplay via telegraph answer.
  const done = resolveHunterCounterplay(state, { simTime: 30, success: true }, bus);
  assert.equal(done.completed, true);
  const own = getHunterOriginState(state);
  assert.equal(own.phase, HUNTER_PHASE.COMPLETE);
  assert.equal(own.offer.status, HUNTER_OFFER_STATUS.COMPLETED);
  assert.equal(own.reward.granted, true);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.GRANT_CREDITS].length, 1);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.GRANT_CREDITS][0].amount, HUNTER_ORIGIN_REWARD.credits);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.GRANT_CREDITS][0].reason, HUNTER_ORIGIN_REWARD.reason);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.REWARD][0].dominatesOtherCareers, false);
  assert.equal(events[HUNTER_ORIGIN_EVENTS.COMPLETED].length, 1);
  assert.ok(events[HUNTER_ORIGIN_EVENTS.STEP_COMPLETE].length >= 3);
  ok('three-step happy path with pursuit recovery; reward via economy:grantCredits');
}

function testCleanKillPathAndIllegalKillFailure() {
  const state = makeState(55);
  const bus = makeBus();
  installPlayer(state);
  onHunterFirstDock(state, { stationId: 'station_helios', simTime: 1 }, bus);
  acceptHunterOrigin(state, { simTime: 2 }, bus);
  const pirate = makeHostilePirate({ id: 88, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY });
  confirmHunterMark(state, pirate, { simTime: 3 }, bus);
  const need = HUNTER_ORIGIN_STEPS[1].pursuitContactTicks;
  tickHunterPursuit(state, { inContact: true, dtTicks: need, simTime: 4 }, bus);
  assert.equal(getHunterOriginState(state).stepId, 'counterplay');

  // Wrong victim lawful → fail.
  const bad = resolveHunterCleanKill(state, {
    id: 999,
    killerId: state.playerId,
    factionLawful: true,
  }, { simTime: 5 }, bus);
  assert.equal(bad.failed, true);
  assert.equal(bad.failure.code, 'illegal_kill');
  recoverHunterStep(state, { simTime: 6 }, bus);

  // Clean mark kill with no heat → complete.
  state.player.heat = 0;
  const good = resolveHunterCleanKill(state, {
    id: 88,
    killerId: state.playerId,
    factionLawful: false,
    illegalToKill: false,
  }, { simTime: 7 }, bus);
  assert.equal(good.completed, true);
  assert.equal(getHunterOriginState(state).reward.granted, true);
  ok('counterplay clean-kill path; illegal kill fails with recovery');
}

function testHeatSpikeFailureRecovery() {
  const state = makeState(66);
  const bus = makeBus();
  installPlayer(state);
  onHunterFirstDock(state, { stationId: 'station_helios', simTime: 1 }, bus);
  acceptHunterOrigin(state, { simTime: 2 }, bus);
  const pirate = makeHostilePirate();
  confirmHunterMark(state, pirate, { simTime: 3 }, bus);

  state.player.heat = WANTED_THRESHOLD + 0.05;
  const spike = noteHunterHeatSpiked(state, { simTime: 4 }, bus);
  assert.equal(spike.failed, true);
  assert.equal(spike.failure.code, 'heat_spiked');

  // Recovery blocked while wanted.
  const blocked = recoverHunterStep(state, { simTime: 5 }, bus);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'heat_still_wanted');

  // Clear heat (simulating heat system decay / zone escape owned by heat.js).
  state.player.heat = 0;
  const cleared = recoverHunterStep(state, { simTime: 6 }, bus);
  assert.equal(cleared.ok, true);
  assert.equal(getHunterOriginState(state).phase, HUNTER_PHASE.ACTIVE);
  ok('heat spike fails lawfully; recovery requires isPlayerWanted false');
}

function testIllegalFireOnPursuit() {
  const state = makeState(77);
  const bus = makeBus();
  installPlayer(state);
  onHunterFirstDock(state, { stationId: 'station_helios', simTime: 1 }, bus);
  acceptHunterOrigin(state, { simTime: 2 }, bus);
  confirmHunterMark(state, makeHostilePirate(), { simTime: 3 }, bus);
  const fire = noteHunterIllegalFire(state, { simTime: 4 }, bus);
  assert.equal(fire.failed, true);
  assert.equal(fire.failure.code, 'illegal_fire');
  state.player.heat = 0;
  recoverHunterStep(state, { simTime: 5 }, bus);
  assert.equal(getHunterOriginState(state).stepId, 'pursuit');
  ok('illegal fire on pursuit fails with recovery');
}

// ── Determinism ──────────────────────────────────────────────────────────────

function testDoctrinePickDeterministic() {
  const a = createHunterOriginState(12345);
  const b = createHunterOriginState(12345);
  const picksA = [pickHunterDoctrine(a), pickHunterDoctrine(a), pickHunterDoctrine(a)];
  const picksB = [pickHunterDoctrine(b), pickHunterDoctrine(b), pickHunterDoctrine(b)];
  assert.deepEqual(picksA, picksB);
  for (const d of picksA) {
    assert.ok(Object.values(CombatDoctrineId).includes(d), `doctrine ${d} is live M1.5 id`);
  }
  ok('doctrine picks are rngSeed-deterministic and from live CombatDoctrineId pool');
}

// ── System shape + abandon ───────────────────────────────────────────────────

function testSystemShapeAndAbandon() {
  assert.equal(hunterOrigin.name, 'hunterOrigin');
  assert.equal(typeof hunterOrigin.init, 'function');
  assert.equal(typeof hunterOrigin.update, 'function');
  assert.equal(typeof hunterOrigin.serialize, 'function');

  const state = makeState(88);
  const bus = makeBus();
  // Fork like sim host.
  const sys = Object.create(hunterOrigin);
  sys.init({ state, bus, helpers: {}, registry: null });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(getHunterOriginState(state).offer.status, HUNTER_OFFER_STATUS.OFFERED);

  acceptHunterOrigin(state, { simTime: state.simTime || 0 }, bus);
  const ab = abandonHunterOrigin(state, { simTime: 1 }, bus);
  assert.equal(ab.ok, true);
  assert.equal(ab.reofferAllowed, true);
  assert.equal(getHunterOriginState(state).offer.status, HUNTER_OFFER_STATUS.DECLINED);

  const pres = hunterOriginPresentation(state);
  assert.equal(pres.careerId, HUNTER_ORIGIN_ID);
  assert.equal(pres.exclusive, false);
  sys.destroy();
  ok('system shape init/dock/abandon/presentation; no registry registration required');
}

function testThreeStepsDefined() {
  assert.equal(HUNTER_ORIGIN_STEPS.length, 3);
  assert.deepEqual(
    HUNTER_ORIGIN_STEPS.map((s) => s.id),
    ['identify', 'pursuit', 'counterplay'],
  );
  assert.deepEqual(
    HUNTER_ORIGIN_STEPS.map((s) => s.teach),
    ['target_identification', 'pursuit_under_doctrine', 'counterplay_and_clean_finish'],
  );
  ok('three meaningful steps with teach tags');
}

// ── Source hygiene ───────────────────────────────────────────────────────────

function testNoMathRandomInSource() {
  // Strip line comments so descriptive prose does not false-positive.
  const stripComments = (src) => src.replace(/\/\/.*$/gm, '');
  for (const rel of [
    'src/careers/origins/hunterOrigin.js',
    'src/careers/origins/hunterOriginData.js',
    'src/careers/origins/hunterOriginSave.js',
  ]) {
    const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
    assert.equal(src.includes('Math.random'), false, `${rel} must not call Math.random`);
    assert.equal(src.includes('Date.now'), false, `${rel} must not call Date.now`);
    assert.equal(src.includes('performance.now'), false, `${rel} must not call performance.now`);
  }
  ok('source forbids unseeded PRNG / wall clock calls');
}

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('[hunter-origin] running isolated M3 candidate checks…');
guarded(() => {
  testFilesExistAndIsolated();
  testThreeStepsDefined();
  testSaveSchemaDeterministic();
  testFirstDockOfferDeclineReoffer();
  testClassificationUsesLiveAuthorities();
  testIdentifyStepSuccessAndLawfulFailure();
  testPursuitAndCounterplayHappyPath();
  testCleanKillPathAndIllegalKillFailure();
  testHeatSpikeFailureRecovery();
  testIllegalFireOnPursuit();
  testDoctrinePickDeterministic();
  testSystemShapeAndAbandon();
  testNoMathRandomInSource();
});
console.log(`[hunter-origin] PASS — ${sections} sections green`);
