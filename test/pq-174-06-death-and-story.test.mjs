// PQ-174.06 — Death, retry, and the story.
//
// Three measurable bars on fixed seeds:
//   1. Cause naming 100%: 20+ seeded deaths across 3+ seeds, every death names its cause AND
//      the telegraph missed with lead time in ms. Zero generic "you died".
//   2. Retry under 5 s on the SAME seed with an identical wave sequence. Prints the number.
//   3. The results screen is a story from live telemetry: best chain, 2+ moments with numbers,
//      the converged build, a shareable build code. Each field moves between two fixed-seed runs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  counterplayFor,
  deathCauseText,
  isGenericYouDied,
  resolveDeathTelegraph,
  storyMomentsFor,
  survivalResults,
  telegraphWord,
} from '../src/systems/survivalResults.js';
import { retryLatencyMs, survivalRun } from '../src/systems/survivalRun.js';
import { deathLineFor } from '../src/ui/survivalHud.js';
import {
  clearCrucibleSetup,
  crucibleSetupFor,
  lastCrucibleRuleset,
  lastCrucibleSetup,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import {
  crucibleResultsScreen,
  deathDialSpec,
  killChainRows,
  resultRows,
  storySentences,
} from '../src/ui/screens/crucible.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEEDS = [4242, 8008, 13502];

function boot(seed) {
  const state = createGameState(seed);
  state.tick = 0;
  state.simTime = 0;
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
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  survivalRun.init(ctx);
  return { state, bus, emitted, ctx, player };
}

function at(harness, simTime) {
  harness.state.simTime = simTime;
  harness.state.tick = Math.round(simTime * 60);
}

function beginManual(harness, seed) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  harness.state.run.wave = 1;
}

function tick(harness, n = 1) {
  for (let i = 0; i < n; i += 1) {
    harness.state.tick += 1;
    harness.state.simTime += DT;
    survivalRun.update(DT);
  }
}

/** Drive a fresh run to player control (phase `active`) through the real phase machine. */
function driveToControl(harness, seed) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed, arenaId: ARENA });
  for (let i = 0; i < 600 && harness.state.run.phase !== 'active'; i += 1) {
    const phase = harness.state.run.phase;
    if (phase === 'loadout') harness.bus.emit('run:loadoutReady', {});
    else if (phase === 'arena_intro') harness.bus.emit('run:arenaIntroComplete', {});
    else if (phase === 'wave_intro') harness.bus.emit('run:waveIntroComplete', {});
    tick(harness, 1);
  }
  assert.equal(harness.state.run.phase, 'active', 'the retry reaches player control');
}

function cohortKill(harness) {
  const id = harness.state.nextEntityId++;
  const entity = {
    id, alive: true, type: 'ship', team: 1, pos: { x: 5, z: 5 },
    data: { level: 1, runCohort: 'survival' },
  };
  harness.state.entities.set(id, entity);
  entity.alive = false;
  harness.bus.emit('entity:killed', { id, killerId: harness.player.id, type: 'ship', pos: { x: 5, z: 5 } });
}

function resultsOf(harness) {
  const ready = harness.emitted.filter((entry) => entry.event === 'run:resultsReady');
  assert.equal(ready.length, 1, 'exactly one results receipt per death');
  return ready[0].payload;
}

const KILLERS = [
  { killerId: 9, attacker: 'Reaver Corsair', weapon: 'Heavy Autocannon M', weaponId: 'wpn_autocannon_m', direction: 'AFT', dominantLayer: 'hull', telegraph: 'weapon_charge' },
  { killerId: 11, attacker: 'Maw Brawler', weapon: 'Railgun M', weaponId: 'wpn_railgun_m', direction: 'FRONT', dominantLayer: 'armor', telegraph: 'broadside_charge' },
  { killerId: 13, attacker: 'Tether Raider', weapon: 'Concussion Cannon M', weaponId: 'wpn_concussion_cannon_m', direction: 'PORT', dominantLayer: 'shield', telegraph: 'attach_spool' },
  { killerId: 17, attacker: 'Anchor Hulk', weapon: 'Flak Turret S', weaponId: 'wpn_flak_turret_s', direction: 'STARBOARD', dominantLayer: 'hull', telegraph: 'field_spool' },
  { killerId: 19, attacker: 'Mine Jackal', weapon: 'Pulse Laser M', weaponId: 'wpn_pulse_laser_m', direction: 'CONTACT', dominantLayer: 'hull', telegraph: 'wake_mines' },
  { killerId: 23, attacker: 'Drift Sniper', weapon: 'Railgun M', weaponId: 'wpn_railgun_m', direction: 'UNKNOWN', dominantLayer: 'hull', telegraph: 'weapon_charge' },
  { killerId: 29, attacker: 'Cinder Wasp', weapon: 'Scrap Thrower L', weaponId: 'wpn_scrap_thrower_l', direction: 'AFT', dominantLayer: 'armor', telegraph: 'unfamiliar_spool_pattern' },
];

// --- bar 1: every death names its cause and its telegraph ------------------------------------

test('PQ-174.06: deaths name the cause and distinguish recorded warnings from unknowns', () => {
  let deaths = 0;
  const sources = new Set();
  for (const seed of SEEDS) {
    for (let i = 0; i < KILLERS.length; i += 1) {
      const killer = KILLERS[i];
      const harness = boot(seed);
      beginManual(harness, seed);
      const wave = 1 + (i % 3);
      harness.state.run.wave = wave;
      const deathAt = 100 + i * 7.5;
      // A third of deaths carry a witnessed tell, a third lean on the incoming fire, a third
      // on the wave inbound — every resolution path is exercised, none is generic.
      const mode = i % 3;
      if (mode === 0) {
        at(harness, deathAt - 0.8);
        harness.bus.emit('ai:telegraph', {
          entityId: killer.killerId, targetId: harness.player.id, kind: killer.telegraph,
        });
      }
      if (mode !== 2) {
        at(harness, deathAt - 2.0);
        harness.bus.emit('combat:damage', {
          targetId: harness.player.id, attackerId: killer.killerId,
          applied: 12 + i, amount: 12 + i, type: 'kinetic', weaponId: killer.weaponId,
        });
        at(harness, deathAt - 0.5);
        harness.bus.emit('combat:damage', {
          targetId: harness.player.id, attackerId: killer.killerId,
          applied: 18 + i, amount: 18 + i, type: 'kinetic', weaponId: killer.weaponId,
        });
      }
      if (mode === 2) {
        at(harness, deathAt - 30);
        harness.bus.emit('run:waveStarted', { wave, tick: harness.state.tick });
      }
      at(harness, deathAt);
      harness.bus.emit('player:death', {
        killerId: killer.killerId,
        attacker: killer.attacker,
        weapon: killer.weapon,
        direction: killer.direction,
        dominantLayer: killer.dominantLayer,
        cause: `Destroyed by ${killer.attacker}`,
        fatalSummary: `${killer.weapon} through the ${killer.dominantLayer}`,
        vitalsPct: { shield: 0, armor: 0, hull: 0 },
      });
      const result = resultsOf(harness);
      assert.equal(result.outcome, 'defeat');
      assert.equal(result.seed, seed);
      const death = result.death;
      assert.ok(death, `seed ${seed} death ${i}: a death story is published`);
      assert.match(death.causeText, new RegExp(killer.attacker), 'the cause names who');
      assert.match(death.causeText, new RegExp(killer.weapon), 'the cause names with what');
      assert.equal(isGenericYouDied(death.causeText), false, 'never the generic fallback');
      assert.equal(isGenericYouDied(result.headline), false, 'the headline never falls back either');
      if (mode === 2) {
        assert.equal(death.telegraphName, null, 'the wave announcement is not an attack tell');
        assert.equal(death.telegraphLeadMs, null, 'unknown warning time is not invented');
      } else {
        assert.ok(typeof death.telegraphName === 'string' && death.telegraphName.length > 0);
        assert.ok(Number.isFinite(death.telegraphLeadMs) && death.telegraphLeadMs >= 0);
      }
      assert.ok(typeof death.counterplay === 'string' && death.counterplay.length > 0,
        'what could have been done is named');
      if (mode === 0) {
        assert.equal(death.telegraphSource, 'witnessed');
        assert.ok(death.telegraphLeadMs >= 700 && death.telegraphLeadMs <= 900,
          `witnessed lead is the 0.8 s tell (${death.telegraphLeadMs}ms)`);
      }
      sources.add(death.telegraphSource);
      deaths += 1;
    }
  }
  assert.equal(deaths, 21, 'twenty-one deaths across three seeds');
  assert.deepEqual([...sources].sort(), ['incoming-fire', 'unrecorded', 'witnessed'],
    'all three telegraph sources resolve');
});

test('PQ-174.06: the telegraph resolver reports a recent matched tell, fire, or no record', () => {
  const witnessed = resolveDeathTelegraph({
    receipt: { killerId: 9 }, telegraphTrail: [{ attackerId: 9, kind: 'weapon_charge', simTime: 10 }],
    deathSimTime: 10.8,
  });
  assert.equal(witnessed.name, 'Weapon charge');
  assert.equal(witnessed.leadTimeMs, 800);
  assert.equal(witnessed.source, 'witnessed');

  const fire = resolveDeathTelegraph({
    receipt: { killerId: 9 }, damageTrail: [{ attackerId: 9, weaponId: 'wpn_railgun_m', simTime: 5 }],
    deathSimTime: 9,
  });
  assert.match(fire.name, /Railgun M/);
  assert.equal(fire.leadTimeMs, 4000);
  assert.equal(fire.source, 'incoming-fire');

  const wave = resolveDeathTelegraph({
    receipt: { killerId: 9 }, wave: 4, waveStartSimTime: 20, deathSimTime: 65,
  });
  assert.equal(wave.name, null);
  assert.equal(wave.leadTimeMs, null);
  assert.equal(wave.source, 'unrecorded');

  assert.equal(telegraphWord('some_new_tell'), 'Some New Tell', 'unknown kinds stay specific');
  assert.equal(deathCauseText(null, []), 'Unidentified fire took you apart — no single hull to name.');
  assert.ok(counterplayFor({ direction: 'AFT' }).length > 0);
});

// --- bar 2: retry on the same seed in under 5 s ------------------------------------------------

test('PQ-174.06 bar 2: death to control on the same seed, same wave sequence, under 5 s', () => {
  clearCrucibleSetup();
  const seed = 4242;
  const harness = boot(seed);
  driveToControl(harness, seed);
  const plansA = harness.emitted
    .filter((entry) => entry.event === 'run:wavePlanned')
    .map((entry) => entry.payload && entry.payload.plan && entry.payload.plan.id);
  assert.ok(plansA.length > 0, 'the first run plans its wave');

  at(harness, 100);
  harness.bus.emit('player:death', {
    killerId: 9, attacker: 'Reaver Corsair', weapon: 'Heavy Autocannon M',
    direction: 'AFT', dominantLayer: 'hull',
  });
  const resultA = resultsOf(harness);
  const deathSimTime = resultA.endedAt.simTime;
  assert.equal(deathSimTime, 100, 'the death moment is stamped on the result');

  // Retry is one word, no confirmation: the remembered setup replays through New Game.
  const setup = crucibleSetupFor({ starterId: 'physics_toolkit', seed });
  assert.equal(setup.ok, true);
  const before = harness.emitted.length;
  assert.equal(requestCrucibleRun(harness.bus, setup.value, 'swarm'), true);
  const window = harness.emitted.slice(before).map((entry) => entry.event);
  assert.ok(window.includes('game:new'), 'retry goes through the real New Game request');
  assert.equal(window.some((event) => /confirm|dialog|modal/i.test(event)), false,
    'no confirmation dialog between death and control');
  assert.equal(lastCrucibleSetup().seed, seed, 'retry reuses the SAME seed');
  assert.equal(lastCrucibleRuleset(), 'swarm', 'retry replays the same ruleset');

  // Production answers game:new with the New Game reset (runSession.newGame clears the ended
  // envelope to inactive) before the begin below is accepted exactly as the first time.
  runSession.newGame();
  survivalRun.newGame();
  survivalResults.newGame();
  driveToControl(harness, lastCrucibleSetup().seed);
  const control = survivalRun.lastControl();
  assert.ok(control, 'control is stamped when the retry reaches active');
  assert.equal(control.seed, seed, 'control is in the same-seed run');
  const plansB = harness.emitted
    .filter((entry) => entry.event === 'run:wavePlanned')
    .map((entry) => entry.payload && entry.payload.plan && entry.payload.plan.id);
  assert.equal(plansB[0], plansA[0], 'the wave sequence is identical, not re-rolled');

  const latency = retryLatencyMs({ simTime: deathSimTime }, control.simTime);
  console.log(`[pq-174-06] retry latency seed ${seed}: ${latency}ms (death ${deathSimTime}s -> control ${control.simTime}s)`);
  assert.ok(latency < 5000, `retry lands in ${latency}ms, under the 5 s bar`);
});

// --- bar 3: the results screen is a story from live telemetry -----------------------------------

function scriptedRun(seed, script) {
  const harness = boot(seed);
  beginManual(harness, seed);
  harness.state.run.wave = 1;
  at(harness, 0);
  harness.bus.emit('run:waveStarted', { wave: 1, tick: 0 });
  let t = 6;
  for (let i = 0; i < script.killsWave1; i += 1) {
    at(harness, t);
    cohortKill(harness);
    t += 1.5;
  }
  at(harness, t);
  harness.bus.emit('swarm:chain', { chain: script.chain1, best: script.chain1, cause: 'direct', wave: 1 });
  harness.bus.emit('run:waveCleared', { wave: 1 });
  harness.state.run.wave = 2;
  at(harness, t + 4);
  harness.bus.emit('run:waveStarted', { wave: 2, tick: harness.state.tick });
  for (let i = 0; i < script.killsWave2; i += 1) {
    t += 2;
    at(harness, t);
    cohortKill(harness);
  }
  at(harness, t + 1);
  harness.bus.emit('swarm:chain', { chain: script.chain2, best: script.chain2, cause: 'chained', wave: 2 });
  harness.bus.emit('run:waveCleared', { wave: 2 });
  harness.state.run.wave = 3;
  at(harness, t + 3);
  harness.bus.emit('run:waveStarted', { wave: 3, tick: harness.state.tick });
  at(harness, t + 4);
  harness.bus.emit('combat:damage', {
    targetId: harness.player.id, attackerId: 11, applied: script.heaviest, amount: script.heaviest,
    type: 'kinetic', weaponId: 'wpn_railgun_m',
  });
  harness.state.run.modifiers = script.picks.map((pick) => ({ ...pick }));
  harness.state.run.style = { multiplier: script.stylePeak, recentCauses: ['direct', 'chained'] };
  at(harness, t + 5);
  harness.bus.emit('player:death', {
    killerId: 11, attacker: 'Maw Brawler', weapon: 'Railgun M',
    direction: 'FRONT', dominantLayer: 'armor',
  });
  return resultsOf(harness);
}

test('PQ-174.06 bar 3: best chain, moments, build and build code all come from live data', () => {
  const picksA = [
    { verb: 'Volume', defId: 'wpn_autocannon_m', wave: 2 },
    { verb: 'Pierce', defId: 'wpn_railgun_m', wave: 3 },
  ];
  const resultA = scriptedRun(4242, {
    killsWave1: 8, killsWave2: 12, chain1: 6, chain2: 11, heaviest: 41, stylePeak: 2.5, picks: picksA,
  });
  assert.equal(resultA.bestChain, 11, 'best chain is the live peak, not a constant');
  assert.ok(Array.isArray(resultA.moments) && resultA.moments.length >= 2, 'at least two moments');
  for (const moment of resultA.moments) {
    assert.match(moment.text, /\d/, `moment "${moment.text}" carries its number`);
  }
  assert.match(resultA.moments.map((m) => m.text).join('\n'), /Best kill chain 11/);
  assert.match(resultA.buildName, /Pierce/, 'the build is the converged draft');
  assert.ok(resultA.buildCode.includes('W2:Volume') && resultA.buildCode.includes('W3:Pierce'),
    `shareable code reads the draft order (${resultA.buildCode})`);

  // A different fixed-seed run moves every field: nothing is a constant wearing numbers.
  const resultB = scriptedRun(8008, {
    killsWave1: 3, killsWave2: 5, chain1: 2, chain2: 4, heaviest: 17, stylePeak: 1.4,
    picks: [{ verb: 'Screen', defId: 'wpn_flak_turret_s', wave: 3 }],
  });
  assert.equal(resultB.bestChain, 4);
  assert.notEqual(resultB.buildCode, resultA.buildCode, 'two runs, two build codes');
  assert.notEqual(resultB.moments.map((m) => m.text).join('|'), resultA.moments.map((m) => m.text).join('|'),
    'two runs, two stories');

  // The plate tells it as sentences: cause, tell, moments, build, code.
  const lines = storySentences(resultA);
  assert.match(resultA.headline, /Maw Brawler/, 'the cause remains in the headline');
  assert.ok(lines.some((line) => /Earlier damage:.*ms before the fatal hit/.test(line)), 'earlier hits retain their timing');
  assert.ok(lines.some((line) => /Best kill chain 11/.test(line)), 'the best kill chain is told');
  assert.ok(lines.some((line) => /Build code W2:Volume \/ W3:Pierce/.test(line)), 'the code is told');
});

test('PQ-174.06: the mounted plate carries the story band from live telemetry', () => {
  const resultA = scriptedRun(4242, {
    killsWave1: 8, killsWave2: 12, chain1: 6, chain2: 11, heaviest: 41, stylePeak: 2.5,
    picks: [
      { verb: 'Volume', defId: 'wpn_autocannon_m', wave: 2 },
      { verb: 'Pierce', defId: 'wpn_railgun_m', wave: 3 },
    ],
  });
  const { lines } = mountResults(resultA);
  const text = lines.join('\n');
  assert.ok(lines.includes('The run'), 'the story band leads the plate');
  assert.ok(text.includes('Best kill chain 11 on wave 2'), 'the best kill chain with its wave');
  assert.ok(text.includes('12 kills'), 'a moment with its number');
  assert.ok(text.includes('You converged on'), 'the converged build');
  assert.ok(text.includes('Build code W2:Volume / W3:Pierce'), 'the shareable code');
  assert.match(text, /Earlier damage:.*ms before the fatal hit/, 'earlier damage is not a missed tell');
});

test('PQ-174.06: the HUD death line names cause and missed tell without a DOM', () => {
  const receipt = { killerId: 9, attacker: 'Reaver Corsair', weapon: 'Heavy Autocannon M', direction: 'AFT', dominantLayer: 'hull' };
  const line = deathLineFor(receipt, { attackerId: 9, kind: 'weapon_charge', simTime: 10 }, 10.8);
  assert.match(line, /Reaver Corsair/);
  assert.match(line, /Weapon charge/);
  assert.match(line, /800ms warning/);
  assert.equal(deathLineFor(receipt), deathCauseText(receipt), 'no tell seen, cause alone');
});

test('PQ-174.06: the kill chain gains the tell rows only when the run recorded one', () => {
  const bare = new Map(killChainRows({ attacker: 'Wreck' }));
  assert.equal(bare.size, 4, 'legacy receipts render exactly as before');
  const told = new Map(killChainRows({
    attacker: 'Reaver Corsair', faction: 'Crimson Reach', weapon: 'Heavy Autocannon M',
    direction: 'AFT', dominantLayer: 'hull', telegraphName: 'Weapon charge', telegraphLeadMs: 800,
    telegraphSource: 'witnessed',
  }));
  assert.equal(told.get('Recorded tell'), 'Weapon charge — 800 ms before the fatal hit');
  assert.deepEqual(storyMomentsFor(null), [], 'null-safe moments');
  assert.deepEqual(storyMomentsFor({}), []);
});

test('PQ-174.06: debrief reader preserves incoming damage instead of inventing a tell', () => {
  const h = boot(73311);
  try {
    beginManual(h, 73311);
    at(h, 10 - 86 / 60);
    h.bus.emit('combat:damage', { targetId: h.player.id, attackerId: 9,
      weaponId: 'wpn_pulse_laser_s', applied: 7, amount: 7 });
    at(h, 10);
    h.bus.emit('player:death', { killerId: 9, attacker: 'Wasp Swarmer', weapon: 'Pulse Laser S',
      direction: 'STARBOARD', dominantLayer: 'hull' });
    const result = resultsOf(h);
    assert.equal(result.death.telegraphSource, 'incoming-fire');
    assert.equal(result.death.telegraphLeadMs, 1433);
    // A richer old receipt must not override the result's explicit provenance or history.
    Object.assign(result.defeat, { telegraphSource: 'witnessed', telegraphName: 'Weapon charge', telegraphLeadMs: 800 });
    const before = structuredClone(result);
    const expected = 'Earlier damage: Taking Pulse Laser S fire — 1433 ms before the fatal hit';
    assert.ok(storySentences(result).includes(`${expected}.`));
    assert.equal(deathDialSpec(result).caption.warn, expected);
    assert.equal(new Map(killChainRows(result.defeat, result.death)).get('Earlier damage'),
      'Taking Pulse Laser S fire — 1433 ms before the fatal hit');
    const text = mountResults(result).lines.join('\n');
    assert.ok(text.includes(expected));
    assert.doesNotMatch(text, /It warned you|ms of warning|Wasp Swarmer's tell|Weapon charge/);
    assert.deepEqual(result, before, 'readers preserve the original death and totals');
  } finally {
    survivalRun.destroy(); survivalResults.destroy(); runSession.destroy();
  }
});

test('PQ-174.06: debrief reader keeps witnessed tells and legacy events distinct', () => {
  const defeat = { attacker: 'Wasp Swarmer', weapon: 'Pulse Laser S', direction: 'STARBOARD', dominantLayer: 'hull' };
  for (const [source, label] of [['witnessed', 'Recorded tell'], ['incoming-fire', 'Earlier damage'],
    [undefined, 'Recorded event'], ['unknown', 'Recorded event']]) {
    const death = { telegraphName: 'Weapon charge', telegraphLeadMs: 800,
      ...(source === undefined ? {} : { telegraphSource: source }) };
    const result = { defeat: { ...defeat, telegraphSource: 'witnessed', telegraphName: 'Old tell' }, death };
    const expected = `${label}: Weapon charge — 800 ms before the fatal hit`;
    assert.equal(deathDialSpec(result).caption.warn, expected);
    assert.deepEqual(storySentences(result), [`${expected}.`]);
    assert.equal(new Map(killChainRows(death)).has('Recorded tell'), source === 'witnessed');
  }
  const legacy = { ...defeat, telegraphName: 'Weapon charge', telegraphLeadMs: null };
  assert.equal(deathDialSpec({ defeat: legacy }).caption.warn, 'Recorded event: Weapon charge');
  assert.equal(deathDialSpec({ defeat: legacy, death: { telegraphSource: 'unrecorded', telegraphName: null } }).caption.warn, '');
  assert.equal(deathDialSpec({ defeat: { ...legacy, source: { kind: 'environment' } } }).caption.warn, '');
});

test('PQ-174.06: run purse and defeat banking disclose starting funds without changing totals', () => {
  const result = { ruleset: 'swarm', outcome: 'defeat', seed: 73311, wave: 1,
    kills: 9, bestChain: 9, score: 0, level: 1, xp: 24, credits: 799,
    bankedBounty: 399, hangarBounty: 399, defeat: { attacker: 'Wasp Swarmer' } };
  const before = structuredClone(result);
  const rows = new Map(resultRows(result));
  assert.equal(rows.get('Run purse'), '799 cr');
  assert.equal(rows.has('Salvage'), false);
  assert.equal(rows.get('Score'), '0');
  const text = mountResults(result).lines.join('\n');
  assert.match(text, /Run purse/);
  assert.match(text, /399 cr banked into the hangar/);
  assert.match(text, /Defeat banks 50% of the remaining run purse, including its starting funds/);
  assert.doesNotMatch(text, /Stunt score|799.*earned/);
  assert.deepEqual(result, before);
  for (const outcome of ['extracted', 'victory', 'aborted']) {
    assert.doesNotMatch(mountResults({ ...result, outcome }).lines.join('\n'), /Defeat banks/);
  }
});

/* --- plate mounting against a document stub (as in crucible-results.test.mjs) --- */

function fakeDom() {
  const make = (tagName) => {
    const node = {
      tagName, id: '', className: '', textContent: '', innerHTML: '', children: [],
      parentNode: null, style: {}, dataset: {}, attributes: {}, listeners: {},
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
  return { createElement: make, _make: make };
}

function textLines(node, out = []) {
  if (node.children.length) {
    for (const child of node.children) textLines(child, out);
  } else if (node.textContent) {
    out.push(node.textContent);
  }
  return out;
}

function mountResults(result) {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const bus = { emit() {}, on() {}, off() {}, once() {} };
  const registry = { get: (name) => (name === 'survivalResults' ? { lastResult: () => result } : null) };
  const root = globalThis.document._make('div');
  try {
    crucibleResultsScreen.mount(root, { bus, registry, state: {} });
  } finally {
    globalThis.document = previousDocument;
  }
  return { root, lines: textLines(root) };
}
