// CRU-018 — the run ends with an explanation, and the same seed can be run again.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  deathSentence,
  outcomeSentence,
  survivalResults,
} from '../src/systems/survivalResults.js';
import {
  CRUCIBLE_ARENA_ID,
  clearCrucibleSetup,
  crucibleLaunchConfig,
  crucibleSetupFor,
  lastCrucibleSetup,
  normalizeSeed,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import {
  BEARING_WORDS,
  bearingWord,
  breachPhrase,
  buildLead,
  buildSteps,
  crucibleResultsScreen,
  damageBreakdown,
  killChainRows,
  lastSecondsLead,
  resultRows,
  resultSectionOrder,
  resultStamp,
  resultTitle,
  sectionTitle,
  vitalsFigures,
  weaponDisplayName,
} from '../src/ui/screens/crucible.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

const SEED = 7;

function boot(seed = SEED) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  return { state, bus, emitted, ctx, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function beginActive(harness) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: CRUCIBLE_ARENA_ID });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
}

function cohortKill(harness) {
  const id = harness.state.nextEntityId++;
  const entity = { id, alive: true, type: 'ship', team: 1, pos: { x: 5, z: 5 }, data: { level: 1, runCohort: 'survival' } };
  harness.state.entities.set(id, entity);
  entity.alive = false;
  harness.bus.emit('entity:killed', { id, killerId: 1, type: 'ship', pos: { x: 5, z: 5 } });
}

const DEFEAT_RECEIPT = Object.freeze({
  attacker: 'Reaver Corsair',
  faction: 'Crimson Reach',
  weapon: 'Heavy Autocannon M',
  direction: 'behind',
  dominantLayer: 'hull',
  cause: 'Destroyed by Reaver Corsair',
  fatalSummary: 'Autocannon burst through the hull',
  vitalsPct: { shield: 0, armor: 0, hull: 0 },
});

test('the death sentence names who, from where, with what, and through which layer', () => {
  const line = deathSentence(DEFEAT_RECEIPT, { wave: 6 });
  assert.match(line, /Reaver Corsair/);
  assert.match(line, /wave 6/);
  assert.match(line, /behind/);
  assert.match(line, /Heavy Autocannon M/);
  assert.match(line, /through the hull/);
  assert.equal(deathSentence(null), 'The run ended.');
});

test('a run that was not a death still explains itself', () => {
  assert.match(outcomeSentence('victory', { wave: 10 }), /All 10 waves cleared/);
  assert.match(outcomeSentence('aborted', { wave: 4 }), /left the arena/);
  assert.match(outcomeSentence('defeat', { wave: 3 }), /ended on wave 3/);
});

test('the player dying ends the run and publishes a causal summary', () => {
  const harness = boot();
  beginActive(harness);
  harness.state.run.wave = 4;
  cohortKill(harness);
  cohortKill(harness);
  harness.bus.emit('run:awardRequested', { credits: 40, xp: 260, score: 900 });
  harness.bus.emit('combat:damage', { targetId: 1, attackerId: 9, applied: 22, type: 'kinetic', weaponId: 'wpn_autocannon_m' });
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT, recoverable: true });

  assert.equal(harness.state.run.phase, 'ended');
  assert.equal(harness.state.run.result.outcome, 'defeat');

  const ready = named(harness.emitted, 'run:resultsReady');
  assert.equal(ready.length, 1);
  const result = ready[0].payload;
  assert.equal(result.outcome, 'defeat');
  assert.equal(result.kills, 2);
  assert.equal(result.wave, 4);
  assert.equal(result.credits, 40);
  assert.equal(result.score, 900);
  assert.equal(result.seed, SEED);
  assert.equal(result.defeat.attacker, 'Reaver Corsair');
  assert.equal(result.damageTrail.length, 1);
  assert.equal(result.damageTrail[0].weaponId, 'wpn_autocannon_m');
  assert.match(result.headline, /Reaver Corsair killed you on wave 4/);
});

test('victory publishes results even though it emits no run:ended', () => {
  const harness = boot();
  beginActive(harness);
  harness.state.run.wave = 10;
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 1 });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'victory', reason: 'act_complete', tick: 2 });
  assert.equal(harness.state.run.phase, 'victory');
  const ready = named(harness.emitted, 'run:resultsReady');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].payload.outcome, 'victory');
  assert.match(ready[0].payload.headline, /waves cleared/);
});

test('a wave the arena cannot build ends the run instead of stranding the player in it', () => {
  // survivalRun emits run:wavePlanFailed and then stops: it does not retry and it does not end the
  // run. With nobody listening, the player sat in an empty arena in wave_intro forever.
  const harness = boot();
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: CRUCIBLE_ARENA_ID });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 't', tick: 0 });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'arena_intro', nextPhase: 'wave_intro', reason: 't', tick: 0 });
  assert.equal(harness.state.run.phase, 'wave_intro');

  harness.bus.emit('run:wavePlanFailed', { wave: 4, error: 'invalid_input', issues: [] });

  assert.equal(harness.state.run.phase, 'ended', 'the run ends rather than hanging');
  assert.equal(harness.state.run.result.reason, 'wave_plan_failed');
  const ready = named(harness.emitted, 'run:resultsReady');
  assert.equal(ready.length, 1);
  assert.match(ready[0].payload.headline, /could not build wave 4/);
});

test('the damage trail is bounded and only records hits on the player', () => {
  const harness = boot();
  beginActive(harness);
  for (let i = 0; i < 25; i++) {
    harness.bus.emit('combat:damage', { targetId: 1, attackerId: 9, applied: i, type: 'kinetic' });
  }
  harness.bus.emit('combat:damage', { targetId: 55, attackerId: 1, applied: 999, type: 'kinetic' });
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  const result = named(harness.emitted, 'run:resultsReady')[0].payload;
  assert.equal(result.damageTrail.length, 8);
  assert.ok(result.damageTrail.every((entry) => entry.amount !== 999), 'the player\'s own hits are not in the trail');
});

test('survivalResults is inert outside a live survival run, and New Game forgets the last one', () => {
  const harness = boot();
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  harness.bus.emit('combat:damage', { targetId: 1, attackerId: 9, applied: 5, type: 'kinetic' });
  assert.equal(named(harness.emitted, 'run:endRequested').length, 0, 'no run to end');
  assert.equal(named(harness.emitted, 'run:resultsReady').length, 0, 'no results to publish');

  // A finished result survives for the results surface to read, and is cleared by a fresh game.
  beginActive(harness);
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  assert.ok(survivalResults.lastResult(), 'the ended run has a readable result');
  survivalResults.newGame();
  assert.equal(survivalResults.lastResult(), null);
});

test('the results grid states outcome, depth, kills, score, salvage, level and seed', () => {
  const rows = resultRows({
    outcome: 'defeat', deepestWave: 6, wave: 6, kills: 31, score: 1240,
    credits: 88, level: 4, xp: 640, seed: 4242,
  });
  const map = new Map(rows);
  assert.equal(map.get('Outcome'), 'Lost');
  assert.equal(map.get('Reached'), 'Wave 6 of 10');
  assert.equal(map.get('Kills'), '31');
  assert.equal(map.get('Salvage'), '88 cr');
  assert.equal(map.get('Seed'), '4242');
  assert.equal(new Map(resultRows({ outcome: 'victory', deepestWave: 10 })).get('Outcome'), 'Survived');
  assert.deepEqual(resultRows(null), []);
});

test('the Crucible launch config is an ordinary New Game config carrying a validated setup', () => {
  clearCrucibleSetup();
  const setup = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4242 });
  assert.equal(setup.ok, true);
  assert.equal(setup.value.arenaId, CRUCIBLE_ARENA_ID);
  assert.equal(setup.value.seed, 4242);

  const config = crucibleLaunchConfig(setup.value);
  assert.equal(config.survivalSetup.seed, 4242);
  assert.equal(config.shipId, setup.value.hullId);
  assert.equal(config.seed, 4242);
  assert.equal(config.sectorId, 'sector_helios_prime');
  // Survival never carries an enemy package into the launch — the wave owner decides what spawns.
  assert.equal(config.combatLabSetup, undefined);
  assert.equal(config.spawnEnemies, undefined);
});

test('restart replays the seed the run BEGAN with, through the real New Game request', () => {
  clearCrucibleSetup();
  assert.equal(lastCrucibleSetup(), null);
  const emitted = [];
  const bus = { emit(event, payload) { emitted.push({ event, payload }); }, on() {}, off() {}, once() {} };
  const setup = crucibleSetupFor({ starterId: 'energy_baseline', seed: 99 });
  requestCrucibleRun(bus, setup.value);

  // The launch went through the ordinary New Game request, not a Crucible-only bootstrap.
  assert.equal(emitted.filter((e) => e.event === 'game:new').length, 1);

  const remembered = lastCrucibleSetup();
  assert.equal(remembered.seed, 99);
  assert.equal(remembered.hullId, setup.value.hullId);
  // Mutating the returned copy must not corrupt what a later restart replays.
  remembered.seed = 1;
  assert.equal(lastCrucibleSetup().seed, 99);

  requestCrucibleRun(bus, lastCrucibleSetup());
  assert.equal(emitted.filter((e) => e.event === 'game:new').length, 2);
  assert.equal(lastCrucibleSetup().seed, 99, 'the same seed is replayed');
});

test('seeds are clamped into the range the wave planner accepts', () => {
  assert.equal(normalizeSeed(0), 1);
  assert.equal(normalizeSeed(-5), 1);
  assert.equal(normalizeSeed('4242'), 4242);
  assert.equal(normalizeSeed(NaN), 1);
  assert.equal(normalizeSeed(0xffffffff + 100), 0xffffffff);
});

test('survivalResults is event-driven and never joins the per-frame update order', () => {
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('survivalResults'), false);
  assert.equal(typeof survivalResults.update, 'undefined');
});

/* ================================================================================================
 * The flight record. PQ-133 review question 7: a player must be able to explain every link of a
 * kill from what is on screen. These pin the wording, and then prove the plate renders without
 * throwing on every shape survivalResults can publish — including the empty ones, where a screen
 * that throws leaves a dead player staring at nothing.
 * ============================================================================================= */

test('the bearing is a phrase a person says, and an unrecognised one is never guessed at', () => {
  assert.equal(bearingWord('AFT'), 'Astern');
  assert.equal(bearingWord('FRONT'), 'Off the bow');
  assert.equal(bearingWord('PORT'), 'To port');
  assert.equal(bearingWord('STARBOARD'), 'To starboard');
  assert.equal(bearingWord('CONTACT'), 'Point blank');
  // impactDirection publishes uppercase; casing must not decide whether the player gets a word.
  assert.equal(bearingWord('aft'), 'Astern');
  // 'UNKNOWN' is a live receipt value, and the grammar forbids inventing an explanatory phrase.
  assert.equal(bearingWord('UNKNOWN'), 'Bearing unknown');
  assert.equal(bearingWord(null), 'Bearing unknown');
  assert.equal(bearingWord('behind'), 'Bearing unknown');
  // Every bearing the receipt can carry has a word: no live value falls through to the fallback.
  for (const key of Object.keys(BEARING_WORDS)) assert.notEqual(bearingWord(key), 'Bearing unknown');
});

test('the breach names the layer the killing damage went through', () => {
  assert.equal(breachPhrase('hull'), 'Through the hull');
  assert.equal(breachPhrase('armor'), 'Through the armour');
  assert.equal(breachPhrase('shield'), 'Through the shields');
  assert.equal(breachPhrase(null), 'Breach point unknown');
});

test('a weapon id becomes the name in the catalog, and an unknown one still reads as words', () => {
  assert.equal(weaponDisplayName('wpn_autocannon_m'), 'Heavy Autocannon M');
  assert.equal(weaponDisplayName('wpn_railgun_m'), 'Railgun M');
  // Not in the catalog: humanised, never printed raw as wpn_snake_case.
  assert.equal(weaponDisplayName('wpn_scrap_thrower_l'), 'Scrap Thrower L');
  // The trail records weaponId: null constantly — collision, environment, anything unattributed.
  assert.equal(weaponDisplayName(null), 'Unidentified fire');
  assert.equal(weaponDisplayName(''), 'Unidentified fire');
});

test('the damage trail aggregates by weapon, heaviest first, and rounds once at display', () => {
  const { hits, total, rows } = damageBreakdown([
    { weaponId: 'wpn_autocannon_m', amount: 18.4 },
    { weaponId: 'wpn_pulse_laser_m', amount: 12.2 },
    { weaponId: 'wpn_autocannon_m', amount: 18.4 },
    { weaponId: null, amount: 7.1 },
    { weaponId: 'wpn_autocannon_m', amount: 17.9 },
  ]);
  assert.equal(hits, 5);
  assert.equal(total, 74); // 54.7 + 12.2 + 7.1 = 74.0
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.weapon), ['Heavy Autocannon M', 'Pulse Laser M', 'Unidentified fire']);
  assert.equal(rows[0].hits, 3);
  assert.equal(rows[0].amount, 55); // 54.7 rounds once, at the end, not per hit
  assert.ok(rows[0].share > rows[1].share, 'the share drives the bar and follows the damage');
  // Eight rows of raw hits become three lines a player can read.
  assert.ok(rows.length < hits);
});

test('the damage aggregate survives an empty, junk, or unattributed trail', () => {
  assert.deepEqual(damageBreakdown([]), { hits: 0, total: 0, rows: [] });
  assert.deepEqual(damageBreakdown(null), { hits: 0, total: 0, rows: [] });
  assert.deepEqual(damageBreakdown(undefined), { hits: 0, total: 0, rows: [] });
  const junk = damageBreakdown([null, { amount: NaN }, { weaponId: 'wpn_railgun_m', amount: -5 }]);
  assert.equal(junk.hits, 2, 'a malformed entry is skipped, a real one with no figure is not');
  assert.equal(junk.total, 0);
  assert.ok(junk.rows.every((row) => Number.isFinite(row.amount)), 'never NaN damage on the plate');
});

test('the last-seconds sentence keeps a word beside every figure', () => {
  assert.equal(lastSecondsLead([]), 'Nothing landed on you in the last seconds of the run.');
  assert.equal(
    lastSecondsLead([{ weaponId: 'wpn_autocannon_m', amount: 22 }]),
    'The last hit took 22 damage off you.',
  );
  assert.equal(
    lastSecondsLead([{ amount: 10.5 }, { amount: 11.5 }, { amount: 12 }]),
    'The last 3 hits took 34 damage off you.',
  );
});

test('the build is the sequence of verbs, wave-stamped, in the order they were drafted', () => {
  const picks = [
    { verb: 'Volume', defId: 'wpn_autocannon_m', wave: 2 },
    { verb: 'Pierce', defId: 'wpn_railgun_m', wave: 4 },
    { verb: 'Screen', defId: 'wpn_flak_turret_s', wave: 7 },
  ];
  assert.deepEqual(buildSteps(picks).map((s) => s.text), ['Wave 2 Volume', 'Wave 4 Pierce', 'Wave 7 Screen']);
  assert.equal(buildLead(picks), '3 drafts changed what your guns do:');
  assert.equal(buildLead([picks[0]]), '1 draft changed what your guns do:');
});

test('a draft pick with no verb still names itself, and an empty draft says so plainly', () => {
  // survivalResults maps run.modifiers with `(entry && entry.verb) || null`, so a null verb ships.
  const steps = buildSteps([
    { verb: null, defId: 'wpn_railgun_m', wave: 3 },
    { verb: null, defId: null, wave: 5 },
    null,
  ]);
  assert.deepEqual(steps.map((s) => s.text), ['Wave 3 Railgun M'], 'nameless picks are dropped, not blank');
  assert.equal(steps[0].wave, 3);
  // A pick with no wave still renders as the verb alone rather than "Wave null".
  assert.deepEqual(buildSteps([{ verb: 'Burn' }]).map((s) => s.text), ['Burn']);

  assert.deepEqual(buildSteps([]), []);
  assert.deepEqual(buildSteps(null), []);
  assert.equal(buildLead([]), 'No draft taken — you flew the loadout you launched with.');
  assert.equal(buildLead(null), 'No draft taken — you flew the loadout you launched with.');
});

test('the kill chain names who, with what, from where, and through which layer', () => {
  const rows = new Map(killChainRows({
    attacker: 'Reaver Corsair', faction: 'Crimson Reach', weapon: 'Heavy Autocannon M',
    direction: 'AFT', dominantLayer: 'hull',
  }));
  assert.equal(rows.get('Killed by'), 'Reaver Corsair — Crimson Reach');
  assert.equal(rows.get('Its weapon'), 'Heavy Autocannon M');
  assert.equal(rows.get('It came from'), 'Astern');
  assert.equal(rows.get('It got in'), 'Through the hull');

  // A receipt missing every optional field still produces four complete rows, never a blank value.
  const bare = new Map(killChainRows({}));
  assert.equal(bare.get('Killed by'), 'Unidentified attacker');
  assert.equal(bare.get('Its weapon'), 'Unidentified weapon');
  assert.equal(bare.size, 4);
  assert.equal(new Map(killChainRows({ attacker: 'Wreck' })).get('Killed by'), 'Wreck');

  // A victory, an abandoned run, and a defeat with no receipt all publish defeat: null.
  assert.deepEqual(killChainRows(null), []);
  assert.deepEqual(killChainRows(undefined), []);
});

test('the vitals say what was left of the ship, and never print a NaN percentage', () => {
  assert.deepEqual(vitalsFigures({ vitalsPct: { shield: 0, armor: 12, hull: 3 } }), [
    { word: 'Shields', text: '0%' },
    { word: 'Armour', text: '12%' },
    { word: 'Hull', text: '3%' },
  ]);
  // A vital the receipt did not measure is dropped rather than rendered as "Hull NaN%".
  assert.deepEqual(vitalsFigures({ vitalsPct: { shield: 41 } }), [{ word: 'Shields', text: '41%' }]);
  assert.deepEqual(vitalsFigures({ vitalsPct: { shield: NaN, armor: null, hull: undefined } }), []);
  assert.deepEqual(vitalsFigures({ vitalsPct: null }), []);
  assert.deepEqual(vitalsFigures(null), []);
});

test('a clear and a death are not the same plate with a different word', () => {
  const victory = { outcome: 'victory' };
  const defeat = { outcome: 'defeat', defeat: { attacker: 'Reaver Corsair' } };
  const aborted = { outcome: 'aborted' };

  assert.equal(resultTitle(victory), 'Arena Cleared');
  assert.equal(resultTitle(defeat), 'Run Over');
  assert.equal(resultTitle(null), 'Run Over');
  assert.equal(resultStamp(victory), 'CRUCIBLE / ARENA CLEARED');
  assert.equal(resultStamp(defeat), 'CRUCIBLE / FLIGHT RECORD');

  // 'aborted' is published BOTH when the player leaves and when the arena fails to build a wave,
  // and nothing published tells them apart. So the title stays neutral: "Run Abandoned" over the
  // headline "The arena could not build wave 4" would be the biggest text on the screen calling
  // the player a quitter for someone else's data regression.
  assert.equal(resultTitle(aborted), 'Run Ended');
  assert.equal(resultStamp(aborted), 'CRUCIBLE / FLIGHT RECORD');
  assert.equal(resultTitle(aborted).includes('Abandon'), false);

  // A clear leads with the build that got you there and carries no kill chain at all; a death
  // leads with what killed you and ends on the build that failed to stop it.
  assert.deepEqual(resultSectionOrder(victory), ['build', 'last_seconds', 'ledger']);
  assert.deepEqual(resultSectionOrder(defeat), ['kill_chain', 'last_seconds', 'ledger', 'build']);
  assert.equal(resultSectionOrder(victory).includes('kill_chain'), false);
  assert.notEqual(resultSectionOrder(victory)[0], resultSectionOrder(defeat)[0]);

  // `run:ended` defaults its outcome to 'defeat' whether or not a receipt exists, so the branch is
  // on the outcome — a defeat with no receipt must not fall through to the victory plate.
  assert.deepEqual(resultSectionOrder({ outcome: 'defeat', defeat: null }), ['last_seconds', 'ledger', 'build']);
  assert.equal(resultTitle({ outcome: 'defeat', defeat: null }), 'Run Over');
  assert.deepEqual(resultSectionOrder(aborted), ['ledger', 'build', 'last_seconds']);
  assert.deepEqual(resultSectionOrder(null), []);

  // The damage band means something different after a clear than after a death.
  assert.equal(sectionTitle('last_seconds', 'defeat'), 'The last seconds');
  assert.equal(sectionTitle('last_seconds', 'victory'), 'What you weathered');
  assert.equal(sectionTitle('kill_chain', 'defeat'), 'How it ended');
  assert.equal(sectionTitle('ledger', 'victory'), 'Run ledger');
  assert.equal(sectionTitle('build', 'victory'), 'What you built');
  assert.equal(sectionTitle('nope', 'victory'), '');
});

/* --- the plate itself, mounted against a document stub --------------------------------------- */

function fakeDom() {
  const make = (tagName) => {
    const node = {
      tagName,
      id: '',
      className: '',
      textContent: '',
      innerHTML: '',
      children: [],
      parentNode: null,
      style: {},
      dataset: {},
      attributes: {},
      listeners: {},
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
      focus() {},
    };
    node.classList = {
      add(...names) { node.className = [...node.className.split(/\s+/), ...names].filter(Boolean).join(' '); },
      contains(name) { return node.className.split(/\s+/).includes(name); },
    };
    return node;
  };
  const head = make('head');
  head.id = 'head';
  const roots = [head];
  return {
    head,
    createElement: make,
    getElementById(id) {
      const visit = (node) => {
        if (node.id === id) return node;
        for (const child of node.children) { const found = visit(child); if (found) return found; }
        return null;
      };
      for (const root of roots) { const found = visit(root); if (found) return found; }
      return null;
    },
    _make: make,
  };
}

/** Every string the plate puts on screen, in reading order. */
function textLines(node, out = []) {
  if (node.children.length) {
    for (const child of node.children) textLines(child, out);
  } else if (node.textContent) {
    out.push(node.textContent);
  }
  return out;
}

function findButtons(node, out = []) {
  if (node.tagName === 'button') out.push(node);
  for (const child of node.children) findButtons(child, out);
  return out;
}

/** Mount the results plate against the stub and hand back what a player would read. */
function mountResults(result) {
  const previousDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const emitted = [];
  const bus = { emit(event, payload) { emitted.push({ event, payload }); }, on() {}, off() {}, once() {} };
  const registry = { get: (name) => (name === 'survivalResults' ? { lastResult: () => result } : null) };
  const root = doc._make('div');
  try {
    crucibleResultsScreen.mount(root, { bus, registry });
  } finally {
    globalThis.document = previousDocument;
  }
  return { root, emitted, lines: textLines(root), buttons: findButtons(root), stamp: root.dataset.stamp };
}

const WAVE_6_DEATH = Object.freeze({
  outcome: 'defeat', seed: 4242, arenaId: CRUCIBLE_ARENA_ID, wave: 6, deepestWave: 6,
  wavesCleared: 5, kills: 31, score: 1240, credits: 88, xp: 640, level: 4,
  picks: [
    { verb: 'Volume', defId: 'wpn_autocannon_m', wave: 2 },
    { verb: 'Pierce', defId: 'wpn_railgun_m', wave: 4 },
    { verb: 'Screen', defId: 'wpn_flak_turret_s', wave: 6 },
  ],
  headline: 'Reaver Corsair killed you on wave 6 from AFT with its Heavy Autocannon M, through the hull.',
  defeat: {
    attacker: 'Reaver Corsair', faction: 'Crimson Reach', weapon: 'Heavy Autocannon M',
    direction: 'AFT', dominantLayer: 'hull', cause: 'Reaver Corsair · Crimson Reach · hull breach',
    fatalSummary: 'Final hit from Reaver Corsair · aft hull breach.',
    vitalsPct: { shield: 0, armor: 0, hull: 0 },
  },
  damageTrail: [
    { attackerId: 9, weaponId: 'wpn_autocannon_m', amount: 18.4, type: 'kinetic' },
    { attackerId: 11, weaponId: 'wpn_pulse_laser_m', amount: 12.2, type: 'energy' },
    { attackerId: 9, weaponId: 'wpn_autocannon_m', amount: 18.4, type: 'kinetic' },
    { attackerId: null, weaponId: null, amount: 7.1, type: 'collision' },
    { attackerId: 9, weaponId: 'wpn_autocannon_m', amount: 17.9, type: 'kinetic' },
  ],
});

test('a wave-6 death plate explains every link of the kill', () => {
  const { lines, stamp } = mountResults(WAVE_6_DEATH);
  const text = lines.join('\n');

  assert.equal(stamp, 'CRUCIBLE / FLIGHT RECORD');
  assert.equal(lines[0], 'Run Over');
  assert.equal(lines[1], WAVE_6_DEATH.headline, 'the owner\'s sentence is reproduced verbatim');

  // The chain leads, and every link of it is on the plate as its own labelled fact.
  assert.equal(lines[2], 'How it ended');
  for (const phrase of [
    'Killed by', 'Reaver Corsair — Crimson Reach',
    'Its weapon', 'Heavy Autocannon M',
    'It came from', 'Astern',
    'It got in', 'Through the hull',
    'What was left of you when it landed:', 'Shields', '0%', 'Armour', 'Hull',
  ]) assert.ok(lines.includes(phrase), `the plate states "${phrase}"`);

  // The eight-row trail is three readable lines, heaviest first, with a word beside every figure.
  assert.ok(text.includes('The last seconds'));
  assert.ok(text.includes('The last 5 hits took 74 damage off you.'));
  assert.ok(text.includes('Heavy Autocannon M'));
  assert.ok(text.includes('3 hits'));
  assert.ok(text.includes('55 damage'));
  assert.ok(text.includes('Unidentified fire'));
  assert.ok(text.includes('1 hit\n'), 'a single hit is not pluralised');

  // The ledger and the build both survive.
  assert.ok(text.includes('Run ledger'));
  assert.ok(text.includes('Wave 6 of 10'));
  assert.ok(text.includes('What you built'));
  assert.ok(text.includes('3 drafts changed what your guns do:'));
  assert.ok(text.includes('Volume') && text.includes('Pierce') && text.includes('Screen'));

  // No raw id and no snake_case ever reaches the glass.
  assert.equal(/wpn_|_m\b|undefined|NaN|null/.test(text), false, text);
});

test('a victory plate leads with the build and carries no kill chain', () => {
  const { lines, stamp } = mountResults({
    outcome: 'victory', seed: 7, wave: 10, deepestWave: 10, wavesCleared: 10,
    kills: 74, score: 4100, credits: 260, xp: 1800, level: 7,
    picks: [{ verb: 'Throw', defId: 'wpn_concussion_cannon_m', wave: 3 }],
    headline: 'All 10 waves cleared. The arena is empty.',
    defeat: null,
    damageTrail: [{ attackerId: 4, weaponId: 'wpn_railgun_m', amount: 41, type: 'kinetic' }],
  });
  const text = lines.join('\n');

  assert.equal(stamp, 'CRUCIBLE / ARENA CLEARED');
  assert.equal(lines[0], 'Arena Cleared');
  assert.equal(lines[1], 'All 10 waves cleared. The arena is empty.');
  assert.equal(lines[2], 'What you built', 'the clear leads with the build that got you there');

  assert.equal(text.includes('How it ended'), false, 'a victory has no kill chain');
  assert.equal(text.includes('Killed by'), false);
  assert.equal(text.includes('The last seconds'), false);
  assert.ok(text.includes('What you weathered'), 'the damage band is reframed after a clear');
  assert.ok(text.includes('The last hit took 41 damage off you.'));
  assert.ok(text.includes('Railgun M'));
  assert.ok(text.includes('1 draft changed what your guns do:'));
  assert.ok(text.includes('Wave 10 of 10'));
  assert.equal(/undefined|NaN/.test(text), false, text);
});

test('the plate renders rather than throwing on every empty shape the owner can publish', () => {
  // 1. No result at all — nothing ever finished, or the owner was re-inited.
  const none = mountResults(null);
  assert.equal(none.lines[0], 'Run Over');
  assert.ok(none.lines.includes('The run ended.'));
  assert.ok(none.lines.includes('No flight record was kept for that run.'));
  assert.equal(none.buttons.length, 3, 'every way out is still offered');

  // 2. A defeat with no receipt: run:ended defaults its outcome to 'defeat' regardless.
  const noReceipt = mountResults({
    outcome: 'defeat', wave: 3, deepestWave: 3, headline: 'The run ended on wave 3.',
    defeat: null, picks: [], damageTrail: [],
  });
  const noReceiptText = noReceipt.lines.join('\n');
  assert.equal(noReceipt.lines[0], 'Run Over', 'it is still a loss, not a clear');
  assert.equal(noReceiptText.includes('How it ended'), false);
  assert.ok(noReceiptText.includes('The last seconds'));

  // 3. Empty picks.
  assert.ok(noReceiptText.includes('No draft taken — you flew the loadout you launched with.'));

  // 4. Empty damage trail.
  assert.ok(noReceiptText.includes('Nothing landed on you in the last seconds of the run.'));

  // 5. An aborted run, and a result stripped of every optional field. The wave-plan failure is the
  // reason survivalResults exists, so the plate must not contradict the sentence it prints.
  const aborted = mountResults({
    outcome: 'aborted',
    headline: 'The arena could not build wave 4. The run was stopped.',
  });
  assert.equal(aborted.lines[0], 'Run Ended');
  assert.ok(aborted.lines.includes('The arena could not build wave 4. The run was stopped.'));
  const bare = mountResults({ outcome: 'defeat' });
  assert.equal(bare.lines[0], 'Run Over');
  assert.ok(bare.lines.includes('The run ended.'), 'a missing headline still says something');
  for (const plate of [none, noReceipt, aborted, bare]) {
    assert.equal(/undefined|NaN|\[object/.test(plate.lines.join('\n')), false, plate.lines.join('\n'));
  }
});

test('the results plate is presentation only and the three actions are untouched', () => {
  const { emitted, buttons } = mountResults(WAVE_6_DEATH);
  assert.equal(emitted.length, 0, 'mounting the plate emits nothing at all');
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    ['Run it again — same seed', 'New run', 'Main menu'],
  );

  clearCrucibleSetup();
  const fire = (button) => button.listeners.click.forEach((fn) => fn());

  const again = mountResults(WAVE_6_DEATH);
  fire(again.buttons[0]);
  assert.deepEqual(again.emitted, [{ event: 'ui:replaceScreen', payload: { id: 'crucible' } }]);

  const fresh = mountResults(WAVE_6_DEATH);
  fire(fresh.buttons[1]);
  assert.deepEqual(fresh.emitted, [{ event: 'ui:replaceScreen', payload: { id: 'crucible' } }]);

  const menu = mountResults(WAVE_6_DEATH);
  fire(menu.buttons[2]);
  assert.deepEqual(menu.emitted.map((e) => e.event), [
    'game:over:dismissed', 'game:exitToMenu', 'ui:closeAll', 'ui:pushScreen',
  ]);
  assert.deepEqual(menu.emitted[3].payload, { id: 'mainMenu' });
});
