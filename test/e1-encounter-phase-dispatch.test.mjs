// W01 — encounter phase dispatch / resume contract.
//
// SUBJECT: the ownership seam between src/systems/encounterDirector.js (the OWNER of `live.phase`
// and of every dispatch entry point) and src/systems/e1EncounterRuntime.js (the phase HANDLERS).
//
// The contract under test is "ONE OWNER dispatches each phase action EXACTLY ONCE":
//   * the director alone creates `live`, sets `phase`, and deletes `live` on resolve/abort;
//   * every entry point (_onChoose / _tickLive / _scriptEvent / requestAuthoredEncounter) must
//     guard on BOTH `live.phase === 'done'` AND the existence of `dir.live[id]`;
//   * a terminal encounter absorbs every later stimulus inertly (no second resolve, no second
//     consequence intent, no second receipt);
//   * repeated initialization with a stable encounter id is idempotent, not a re-fire;
//   * a save/resume boundary may not replay a completed encounter into durable history.
//
// COLLISION NOTE: e1EncounterRuntime imports the generated flavor index, and several
// src/data/flavor/*.js files are being edited concurrently. This file therefore asserts ONLY on
// dispatch mechanics and NEVER on catalog content (no encounter counts, no prose, no graffiti
// corpora). The choice branches exercised below (h2 hail/scan/fire, h6 wait, h1 listen) are
// deliberately the ones that never reach `authoredGraffiti`.
//
// Determinism: sim time only (`sim.step`), seeded state, no wall clock, no Math.random.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

// Event names this file observes. Kept explicit (not a wildcard) so the recorded order is a
// stable, reviewable contract rather than an incidental snapshot of every bus name in the build.
const OBSERVED = Object.freeze([
  'encounter:telegraph',
  'encounter:spawned',
  'encounter:choiceOffered',
  'encounter:voice',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:fingerprint',
  'encounter:waitStarted',
  'story:playerChoiceRecorded',
  'faction:repDelta',
  'faction:aggro',
  'faction:tradePosture',
]);

const SECTOR_FOR = Object.freeze({
  depth_h1_distress_from_inside: 'sector_helios_prime',
  depth_h2_drifting_bloom: 'sector_veil_nebula',
  depth_h6_patrol_ambush: 'sector_io_reach',
});

function boot(seed = 47901) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_prime';
  sim.state.story.beatIndex = 7;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

/** Record the ORDER of dispatch-visible bus traffic. Names only by default: payload identity is
 *  asserted separately so the order contract stays readable and content-stable. */
function record(t, names = OBSERVED) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

const namesOf = (rows) => rows.map((row) => row.name);
const countOf = (rows, name) => rows.filter((row) => row.name === name).length;

function force(t, shapeId, suffix, options = {}) {
  const sectorId = options.sectorId || SECTOR_FOR[shapeId];
  t.state.world.currentSectorId = sectorId;
  const encounterId = `w01:${shapeId}:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId, encounterId, sectorId,
    anchor: options.anchor || { x: 0, z: 0 },
    force: options.force !== false,
  });
  assert.equal(result.ok, true, `${shapeId}/${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

const choose = (t, encounterId, choiceId) => t.bus.emit('encounter:choose', { encounterId, choiceId });
const liveOf = (t, id) => t.state.encounterDirector.live[id];
const historyOf = (t) => t.state.story.depthProgramEncounters?.history || [];
const completionOf = (t, shapeId) => t.state.story.depthProgramEncounters?.completed?.[shapeId] || null;

// ─── START ───────────────────────────────────────────────────────────────────────────────────────

test('W01 start: firing installs exactly one live encounter in the offer phase', () => {
  const t = boot();
  const rows = record(t);
  const id = force(t, 'depth_h2_drifting_bloom', 'start');

  const live = liveOf(t, id);
  assert.ok(live, 'the director must own the live encounter under its requested id');
  // The director seeds `telegraph`; the handler's begin() advances it to `offer`. One owner,
  // one transition — the handler never creates the record it mutates.
  assert.equal(live.phase, 'offer');
  assert.equal(countOf(rows, 'encounter:telegraph'), 1);
  assert.equal(countOf(rows, 'encounter:choiceOffered'), 1);
  assert.equal(countOf(rows, 'encounter:resolved'), 0);
  assert.equal(t.state.encounterDirector.stats.fired, 1);
});

// ─── REPEATED START (repeated initialization) ────────────────────────────────────────────────────

test('W01 repeated start: a stable encounter id re-initializes nothing', () => {
  const t = boot();
  const rows = record(t);
  const id = force(t, 'depth_h2_drifting_bloom', 'repeat');

  const live = liveOf(t, id);
  const idsBefore = live.ids.slice();
  const startedAt = live.startedAt;
  const firedBefore = t.state.encounterDirector.stats.fired;
  const rowsBefore = namesOf(rows);

  for (let attempt = 0; attempt < 3; attempt++) {
    const again = t.director.requestAuthoredEncounter({
      shapeId: 'depth_h2_drifting_bloom',
      encounterId: id,
      sectorId: SECTOR_FOR.depth_h2_drifting_bloom,
      anchor: { x: 0, z: 0 },
      force: true,
    });
    assert.deepEqual(again, { ok: true, encounterId: id, reused: true },
      'repeated init must report reuse, never a fresh fire');
  }

  assert.equal(liveOf(t, id), live, 'the live record must be the same object, not a replacement');
  assert.deepEqual(liveOf(t, id).ids, idsBefore, 'repeated init must not re-spawn the squad');
  assert.equal(liveOf(t, id).startedAt, startedAt);
  assert.equal(t.state.encounterDirector.stats.fired, firedBefore);
  assert.deepEqual(namesOf(rows), rowsBefore, 'repeated init must emit nothing at all');
});

// ─── LEGAL NEXT PHASE ────────────────────────────────────────────────────────────────────────────

test('W01 legal next phase: one choice drives one resolution and one receipt', () => {
  const t = boot();
  const rows = record(t);
  const id = force(t, 'depth_h2_drifting_bloom', 'legal');
  choose(t, id, 'hail');

  assert.equal(countOf(rows, 'encounter:resolved'), 1);
  assert.equal(countOf(rows, 'encounter:receipt'), 1);
  assert.equal(countOf(rows, 'encounter:fingerprint'), 1);
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom')?.outcome, 'hailed');
  assert.equal(liveOf(t, id), undefined, 'resolve must retire the live record from the director');
  assert.equal(historyOf(t).length, 1);
});

// ─── ILLEGAL / STALE PHASE ───────────────────────────────────────────────────────────────────────

test('W01 illegal choice: an unknown id leaves the offer live and dispatches no consequence', () => {
  const t = boot();
  const id = force(t, 'depth_h2_drifting_bloom', 'illegal');
  const rows = record(t);

  for (const bogus of ['not-a-choice', '', 'HAIL']) choose(t, id, bogus);

  assert.equal(rows.length, 0, 'an unrecognized choice must be wholly inert');
  assert.equal(liveOf(t, id)?.phase, 'offer', 'the offer must remain open, not silently terminate');
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom'), null);

  // The legal choice still works afterwards: rejecting garbage must not poison the seam.
  choose(t, id, 'hail');
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom')?.outcome, 'hailed');
});

test('W01 malformed dispatch: non-finite and structurally broken payloads fail closed', () => {
  const t = boot();
  const id = force(t, 'depth_h2_drifting_bloom', 'malformed');
  const rows = record(t);

  const garbage = [
    undefined, null, {}, { encounterId: null }, { encounterId: id },
    { encounterId: id, choiceId: null }, { encounterId: id, choiceId: NaN },
    { encounterId: id, choiceId: Infinity }, { encounterId: id, choiceId: -Infinity },
    { encounterId: NaN, choiceId: 'hail' }, { encounterId: Infinity, choiceId: 'hail' },
    { encounterId: 'w01:no-such-encounter', choiceId: 'hail' },
  ];
  // Fail-closed: none of these may throw, resolve, or mutate durable story state.
  for (const payload of garbage) t.bus.emit('encounter:choose', payload);

  assert.equal(rows.length, 0);
  assert.equal(liveOf(t, id)?.phase, 'offer');
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom'), null);
  assert.equal(historyOf(t).length, 0);
});

// ─── TERMINAL PHASE — the exactly-once heart of the contract ─────────────────────────────────────

test('W01 terminal phase: a resolved encounter absorbs every later stimulus inertly', () => {
  const t = boot();
  const id = force(t, 'depth_h2_drifting_bloom', 'terminal');
  const squadId = liveOf(t, id).ids[0];
  const rows = record(t);

  choose(t, id, 'hail');
  assert.equal(countOf(rows, 'encounter:resolved'), 1);
  const afterResolve = namesOf(rows);

  // Every remaining dispatch entry point, fired at a terminal encounter.
  choose(t, id, 'fire');                                                   // _onChoose
  choose(t, id, 'scan');
  t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId: squadId, amount: 9 }); // _onCombatDamage
  t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });                       // _routeToSelfRegistered
  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: squadId });
  t.bus.emit('entity:killed', { id: squadId, killerId: t.state.playerId, pos: { x: 0, z: 0 } });
  for (let s = 0; s < 5; s++) t.sim.step(1);                               // _tickLive

  assert.deepEqual(namesOf(rows), afterResolve,
    'no dispatch entry point may reanimate a terminal encounter');
  assert.equal(countOf(rows, 'encounter:resolved'), 1);
  assert.equal(countOf(rows, 'encounter:receipt'), 1);
  assert.equal(historyOf(t).length, 1, 'durable history must record the encounter exactly once');
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom')?.outcome, 'hailed');
});

// ─── DUPLICATE EVENT PROTECTION ──────────────────────────────────────────────────────────────────

test('W01 duplicate events: a repeated stimulus settles the encounter exactly once', () => {
  const t = boot();
  const id = force(t, 'depth_h2_drifting_bloom', 'dupe-damage');
  const squadId = liveOf(t, id).ids[0];
  const rows = record(t);

  const hit = { attackerId: t.state.playerId, targetId: squadId, amount: 4 };
  for (let i = 0; i < 6; i++) t.bus.emit('combat:damage', hit);

  assert.equal(countOf(rows, 'encounter:resolved'), 1, 'six hits must produce one resolution');
  assert.equal(countOf(rows, 'faction:aggro'), 1, 'the aggro consequence must not be dispatched twice');
  assert.equal(countOf(rows, 'faction:repDelta'), 1, 'the rep consequence must not be dispatched twice');
  assert.equal(countOf(rows, 'encounter:receipt'), 1);
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom')?.outcome, 'fired');
  assert.equal(historyOf(t).length, 1);
});

test('W01 competing stimuli: the first settlement wins and the second is inert', () => {
  const t = boot();
  const id = force(t, 'depth_h2_drifting_bloom', 'race');
  const squadId = liveOf(t, id).ids[0];
  const rows = record(t);

  t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
  t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId: squadId, amount: 4 });

  assert.equal(countOf(rows, 'encounter:resolved'), 1);
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom')?.outcome, 'scanned',
    'the scan arrived first, so the later shot may not rewrite the outcome');
  assert.equal(countOf(rows, 'faction:aggro'), 0, 'the losing stimulus must dispatch no consequence');
  assert.equal(historyOf(t).length, 1);
});

// ─── DETERMINISTIC EVENT ORDER ───────────────────────────────────────────────────────────────────

test('W01 deterministic order: identical dispatch produces byte-identical event sequences', () => {
  const run = () => {
    const t = boot(47905);
    const rows = record(t);
    const id = force(t, 'depth_h2_drifting_bloom', 'order');
    choose(t, id, 'nope');            // rejected
    choose(t, id, 'hail');            // accepted
    choose(t, id, 'fire');            // terminal, inert
    for (let s = 0; s < 3; s++) t.sim.step(1);
    return rows.map((row) => ({
      name: row.name,
      encounterId: row.payload?.encounterId ?? null,
      outcome: row.payload?.outcome ?? null,
      factionId: row.payload?.factionId ?? null,
      delta: row.payload?.delta ?? null,
    }));
  };

  const a = run();
  const b = run();
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'dispatch order must be a pure function of seed + inputs');
  assert.ok(a.length > 0);
  // Ordering law: the encounter opens before it can be chosen, and resolves before its receipt.
  const order = a.map((row) => row.name);
  assert.ok(order.indexOf('encounter:telegraph') < order.indexOf('encounter:choiceOffered'));
  assert.ok(order.indexOf('encounter:choiceOffered') < order.indexOf('encounter:resolved'));
  assert.ok(order.indexOf('encounter:resolved') < order.indexOf('encounter:receipt'));
});

// ─── SAVE / RESUME ───────────────────────────────────────────────────────────────────────────────

test('W01 resume: a completed encounter survives a JSON save boundary without replaying', () => {
  const before = boot(47906);
  const id = force(before, 'depth_h2_drifting_bloom', 'save');
  choose(before, id, 'scan');
  assert.equal(historyOf(before).length, 1);
  const savedStory = JSON.parse(JSON.stringify(before.state.story));

  const after = boot(47906);
  after.state.story = savedStory;
  const rows = record(after);
  after.bus.emit('save:loaded');

  // Nothing from the previous session may still be dispatchable.
  assert.deepEqual(after.state.encounterDirector.live, {});
  choose(after, id, 'hail');
  choose(after, id, 'fire');
  for (let s = 0; s < 3; s++) after.sim.step(1);

  assert.equal(rows.length, 0, 'a resumed session must not replay a retired encounter');
  assert.equal(historyOf(after).length, 1, 'resume must not duplicate the durable history entry');
  assert.equal(completionOf(after, 'depth_h2_drifting_bloom')?.outcome, 'scanned');
});

test('W01 resume: save:loaded drops in-flight encounters without resolving them', () => {
  const t = boot(47907);
  const id = force(t, 'depth_h2_drifting_bloom', 'inflight');
  assert.ok(liveOf(t, id), 'precondition: the encounter is live when the save loads');
  const rows = record(t);

  t.bus.emit('save:loaded');

  // CHARACTERIZATION (see receipt finding W01-2): _onSaveLoaded replaces the whole director state,
  // so a live encounter is DROPPED rather than aborted — no encounter:resolved is emitted and the
  // already-spawned entities keep no despawnAt. That is silent, but it is at least exactly-once:
  // the dropped encounter can never resolve later, so no consumer double-books it.
  assert.equal(liveOf(t, id), undefined);
  assert.equal(countOf(rows, 'encounter:resolved'), 0);
  assert.equal(historyOf(t).length, 0);

  choose(t, id, 'hail');
  for (let s = 0; s < 3; s++) t.sim.step(1);
  assert.equal(rows.length, 0, 'a dropped encounter must stay undispatchable, not half-live');
});

// ─── NON-TERMINAL PHASE / SINGLE-SHOT OFFER (normative — was W01 SEAM characterization) ──────────
//
// Formerly characterization of an unresolved defect (second wait re-emitted waitStarted / count 2).
// Converted to the normative single-shot offer contract: one accepted choose per offer lifetime.

test('W01 single-shot: second wait after non-terminal advance emits no waitStarted and keeps deadline', () => {
  const t = boot(47908);
  const id = force(t, 'depth_h6_patrol_ambush', 'seam');
  const rows = record(t);

  choose(t, id, 'wait');
  assert.equal(liveOf(t, id)?.phase, 'waiting_battle', 'wait advances to a non-terminal internal phase');
  const firstDeadline = liveOf(t, id).vars.h6Battle.waitDeadlineAt;
  assert.equal(countOf(rows, 'encounter:waitStarted'), 1);

  // Single-shot: offer is consumed on first accepted choose. A second encounter:choose with the
  // same choiceId must not re-enter h6.choose, re-emit waitStarted, or defer the deadline.
  t.sim.step(1);
  choose(t, id, 'wait');
  assert.equal(countOf(rows, 'encounter:waitStarted'), 1,
    'second wait must not re-emit encounter:waitStarted');
  assert.equal(liveOf(t, id).vars.h6Battle.waitDeadlineAt, firstDeadline,
    'second wait must not change live.vars.h6Battle.waitDeadlineAt');
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), 1,
    'player line is recorded once per accepted decision, not once per re-dispatch');

  // A different choice after consumption is also ignored (offer already spent).
  choose(t, id, 'concord');
  assert.equal(liveOf(t, id)?.phase, 'waiting_battle', 'post-consumption choose must not re-route');
  assert.equal(completionOf(t, 'depth_h6_patrol_ambush'), null);
  assert.ok(liveOf(t, id), 'live record remains until the wait path settles on its own');

  // Terminal boundary remains exactly-once once the wait path settles.
  for (const entityId of liveOf(t, id).ids.filter((entityId) => liveOf(t, id).roles[entityId] === 'escort')) {
    const entity = t.state.entities.get(entityId);
    if (entity) entity.alive = false;
  }
  for (let s = 0; s < 8; s++) t.sim.step(1);
  assert.equal(countOf(rows, 'encounter:resolved'), 1);
  assert.equal(historyOf(t).length, 1);
});

test('W01 single-shot: playerChoiceLines and story:playerChoiceRecorded fire exactly once', () => {
  const t = boot(47911);
  const id = force(t, 'depth_h6_patrol_ambush', 'choice-line');
  const rows = record(t);
  const linesBefore = (t.state.story.playerChoiceLines || []).length;

  choose(t, id, 'wait');
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), 1);
  assert.equal((t.state.story.playerChoiceLines || []).length, linesBefore + 1);

  choose(t, id, 'wait');
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), 1,
    'second identical choose must not re-record the player line');
  assert.equal((t.state.story.playerChoiceLines || []).length, linesBefore + 1,
    'playerChoiceLines gains exactly one entry for one accepted decision');
});

test('W01 single-shot: unknown choiceId does not consume the offer', () => {
  const t = boot(47912);
  const id = force(t, 'depth_h6_patrol_ambush', 'garbage');
  const rows = record(t);

  choose(t, id, 'garbage');
  assert.equal(liveOf(t, id)?.phase, 'offer', 'garbage choice must leave the offer open');
  assert.equal(countOf(rows, 'encounter:waitStarted'), 0);
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), 0);
  assert.equal(liveOf(t, id)?.offerConsumed, undefined);

  // A subsequent valid choose still dispatches exactly once.
  choose(t, id, 'wait');
  assert.equal(liveOf(t, id)?.phase, 'waiting_battle');
  assert.equal(liveOf(t, id)?.offerConsumed, true);
  assert.equal(countOf(rows, 'encounter:waitStarted'), 1);
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), 1);

  choose(t, id, 'wait');
  assert.equal(countOf(rows, 'encounter:waitStarted'), 1, 'offer remains single-shot after valid choose');
});

test('W01 single-shot: choose after resolve is a no-op', () => {
  const t = boot(47913);
  const id = force(t, 'depth_h2_drifting_bloom', 'post-resolve');
  const rows = record(t);

  choose(t, id, 'hail');
  assert.equal(liveOf(t, id), undefined);
  assert.equal(countOf(rows, 'encounter:resolved'), 1);
  const historyLen = historyOf(t).length;
  const recorded = countOf(rows, 'story:playerChoiceRecorded');
  const linesLen = (t.state.story.playerChoiceLines || []).length;

  choose(t, id, 'hail');
  choose(t, id, 'scan');
  for (let s = 0; s < 3; s++) t.sim.step(1);

  assert.equal(countOf(rows, 'encounter:resolved'), 1, 'post-resolve choose must not re-resolve');
  assert.equal(historyOf(t).length, historyLen);
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), recorded);
  assert.equal((t.state.story.playerChoiceLines || []).length, linesLen);
});

test('W01 single-shot: re-entrant nested choose from waitStarted does not double-dispatch', () => {
  // Latch must be written BEFORE script.choose: a handler that synchronously emits
  // encounter:choose again (nested) must see offerConsumed and stay inert.
  const t = boot(47914);
  const id = force(t, 'depth_h6_patrol_ambush', 'reenter');
  const rows = record(t);
  let nestedFires = 0;
  t.bus.on('encounter:waitStarted', () => {
    nestedFires += 1;
    // Nested same-tick choose (concord would otherwise leave waiting_battle).
    choose(t, id, 'concord');
  });

  choose(t, id, 'wait');
  assert.equal(nestedFires, 1, 'precondition: waitStarted fired and nested choose ran');
  assert.equal(liveOf(t, id)?.phase, 'waiting_battle',
    'nested concord must not re-route after wait consumed the offer');
  assert.equal(liveOf(t, id)?.offerConsumed, true);
  assert.equal(countOf(rows, 'encounter:waitStarted'), 1);
  assert.equal(countOf(rows, 'encounter:resolved'), 0,
    'nested choose must not resolve the encounter on the same tick');
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), 1,
    'exactly one player choice line for the outer accepted wait');
  assert.equal(completionOf(t, 'depth_h6_patrol_ambush'), null);
});

test('W01 single-shot: consumed offer stays consumed in every non-terminal phase (not only waiting_battle)', () => {
  // Phase-independent latch: offerConsumed blocks regardless of phase name.
  // First legitimate choose is forced while phase is a non-offer non-terminal value so a
  // `live.phase !== 'offer'` guard mutant cannot masquerade as the consumption latch.
  const t = boot(47915);
  const id = force(t, 'depth_h2_drifting_bloom', 'phase-gate');
  const live = liveOf(t, id);
  assert.equal(live.phase, 'offer');
  // Advance the live record into a non-offer non-terminal phase without consuming.
  live.phase = 'waiting_battle';
  assert.equal(live.offerConsumed, undefined);

  const rows = record(t);
  choose(t, id, 'hail');
  assert.equal(countOf(rows, 'encounter:resolved'), 1,
    'first accepted choose must dispatch even when phase is not the string "offer"');
  assert.equal(completionOf(t, 'depth_h2_drifting_bloom')?.outcome, 'hailed');
  assert.equal(liveOf(t, id), undefined);

  // Second concurrent encounter: consume in offer, then force another non-terminal phase name
  // and prove a later choose is still blocked by offerConsumed (not by phase string).
  const id2 = force(t, 'depth_h6_patrol_ambush', 'phase-gate-2');
  choose(t, id2, 'wait');
  assert.equal(liveOf(t, id2)?.offerConsumed, true);
  assert.equal(liveOf(t, id2)?.phase, 'waiting_battle');
  // Rename the phase to something other than waiting_battle / offer while still live.
  liveOf(t, id2).phase = 'telegraph';
  const rows2 = record(t);
  const waitStartedBefore = countOf(rows, 'encounter:waitStarted');
  choose(t, id2, 'concord');
  choose(t, id2, 'wait');
  assert.equal(liveOf(t, id2)?.phase, 'telegraph',
    'post-consumption choose must remain inert in any non-terminal phase name');
  assert.equal(liveOf(t, id2)?.offerConsumed, true);
  assert.equal(countOf(rows2, 'encounter:resolved'), 0);
  assert.equal(completionOf(t, 'depth_h6_patrol_ambush'), null);
  // waitStarted was recorded on the first wait only (rows, not rows2).
  assert.equal(countOf(rows, 'encounter:waitStarted'), waitStartedBefore);
});

test('W01 single-shot: empty/missing choices array consumes on first dispatch and ignores the second', () => {
  // Shapes with no choices: first dispatch consumes; second is inert.
  // Force a live record then strip choices so the suite owns the branch without catalog coupling.
  const t = boot(47916);
  const id = force(t, 'depth_h2_drifting_bloom', 'no-choice');
  const live = liveOf(t, id);
  // Minimal synthetic shape surface: empty choices array on the live record.
  live.shape = { ...live.shape, choices: [] };
  const rows = record(t);

  choose(t, id, 'any-id');
  assert.equal(liveOf(t, id)?.offerConsumed, true,
    'first dispatch against a no-choice shape must consume the offer');
  // script.choose still runs; h2 may not resolve on unknown ids — consumption is the contract.
  const phaseAfterFirst = liveOf(t, id)?.phase;
  const resolvedAfterFirst = countOf(rows, 'encounter:resolved');
  const linesAfterFirst = countOf(rows, 'story:playerChoiceRecorded');

  choose(t, id, 'hail');
  choose(t, id, 'any-id');
  assert.equal(liveOf(t, id)?.offerConsumed, true);
  assert.equal(liveOf(t, id)?.phase, phaseAfterFirst,
    'second dispatch must not re-enter the handler after no-choice consumption');
  assert.equal(countOf(rows, 'encounter:resolved'), resolvedAfterFirst);
  assert.equal(countOf(rows, 'story:playerChoiceRecorded'), linesAfterFirst);

  // Missing choices (not an array) is treated the same as empty: consume on first dispatch.
  const id2 = force(t, 'depth_h6_patrol_ambush', 'no-choice-missing');
  const live2 = liveOf(t, id2);
  live2.shape = { ...live2.shape, choices: undefined };
  choose(t, id2, 'wait');
  assert.equal(liveOf(t, id2)?.offerConsumed, true);
  const phase2 = liveOf(t, id2)?.phase;
  choose(t, id2, 'wait');
  choose(t, id2, 'concord');
  assert.equal(liveOf(t, id2)?.phase, phase2);
  assert.equal(liveOf(t, id2)?.offerConsumed, true);
});

test('W01 single-shot bound: the non-terminal phase still terminates exactly once under its own tick', () => {
  const t = boot(47909);
  const id = force(t, 'depth_h6_patrol_ambush', 'seam-tick');
  const live = liveOf(t, id);
  const rows = record(t);

  choose(t, id, 'wait');
  for (const entityId of live.ids.filter((entityId) => live.roles[entityId] === 'escort')) {
    const entity = t.state.entities.get(entityId);
    if (entity) entity.alive = false;
  }
  // Many ticks after the settling condition is already true: the tick loop must settle once.
  for (let s = 0; s < 8; s++) t.sim.step(1);

  assert.equal(countOf(rows, 'encounter:resolved'), 1);
  assert.equal(countOf(rows, 'encounter:receipt'), 1);
  assert.equal(historyOf(t).length, 1);
  assert.equal(completionOf(t, 'depth_h6_patrol_ambush')?.outcome, 'vultured');
  assert.equal(liveOf(t, id), undefined);
});

// ─── CROSS-ENCOUNTER ISOLATION ───────────────────────────────────────────────────────────────────

test('W01 isolation: concurrent encounters resolve independently and exactly once each', () => {
  const t = boot(47910);
  const rows = record(t);
  const bloom = force(t, 'depth_h2_drifting_bloom', 'iso');
  const ambush = force(t, 'depth_h6_patrol_ambush', 'iso');
  assert.ok(liveOf(t, bloom) && liveOf(t, ambush), 'both encounters are live at once');

  choose(t, bloom, 'hail');
  assert.equal(liveOf(t, bloom), undefined);
  assert.ok(liveOf(t, ambush), 'resolving one encounter must not retire the other');

  choose(t, ambush, 'concord');
  assert.equal(countOf(rows, 'encounter:resolved'), 2);
  assert.equal(historyOf(t).length, 2);
  const shapes = historyOf(t).map((row) => row.shapeId).sort();
  assert.deepEqual(shapes, ['depth_h2_drifting_bloom', 'depth_h6_patrol_ambush']);
  // Each history row belongs to exactly one encounter instance.
  assert.equal(new Set(historyOf(t).map((row) => row.encounterId)).size, 2);
});
