// LW-05 — Iron Kraken maturity: the swarm wave opener names the scheduled character before
// contact, the score fields a bounded frontal `mantle_trawl` beat whose packet carries a real
// momentum-sink hold, and the later acts actually cast it.
//
// Harnesses mirror crucible-announce.test.mjs (live-run announce boot) and
// iron-kraken-combat.test.mjs (planWave options + the direct score driver).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalAnnounce, waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { STATUS_DEFS } from '../src/data/combatDefs.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS } from '../src/data/encounters/capital-boss/iron-kraken.js';
import { THROW_WINDOW } from '../src/data/encounters/capital-boss/shared.js';
import { validateCapitalBossEncounter } from '../src/data/encounters/capital-boss/validate.js';
import { createCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { wrapAngle } from '../src/combat/capitalBossGeometry.js';

const DT = 1 / 60;
const clone = (value) => JSON.parse(JSON.stringify(value));
const planFor = (wave, extra = {}) => planWave({ seed: 4242, arenaId: 'helios_core', wave,
  ruleset: SWARM_RULESET, ...extra });

// The same vocabulary the production contract test supplies — a status id that is not real
// content fails the score here rather than shipping as dead metadata.
const VOCABULARY = Object.freeze({ statusIds: new Set(STATUS_DEFS.map((d) => d.id)) });

function bootAnnounce() {
  const state = createGameState(7);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const run = createRunState({ kind: 'survival', seed: 7 });
  run.arenaId = 'helios_core';
  run.phase = 'active';
  run.wave = 7;
  state.run = run;
  survivalAnnounce.init({ state, bus, helpers: {} });
  return { state, bus, emitted };
}

test('the swarm wave opener names the scheduled Kraken before its staged seat lands', () => {
  const heavyPlan = planFor(7);
  assert.equal(heavyPlan.swarm.boss, false, 'a character wave is not a champion wave');
  assert.equal(heavyPlan.swarm.character.name, 'Iron Kraken');
  const line = waveOpeningLine(7, heavyPlan);
  assert.ok(line.includes('Iron Kraken'), line);
  assert.ok(line.length < 160, `the opener stays inside the banner budget: ${line.length}`);
  const colossusPlan = planFor(31);
  assert.equal(colossusPlan.swarm.character.name, 'Iron Kraken Colossus');
  assert.ok(waveOpeningLine(31, colossusPlan).includes('Iron Kraken Colossus'));
  // Ordinary waves have no character seat and stay unnamed.
  assert.equal(planFor(8).swarm.character, undefined);
  assert.ok(!waveOpeningLine(8, planFor(8)).includes('Kraken'), 'no borrowed name on a plain wave');

  const h = bootAnnounce();
  try {
    h.bus.emit('run:wavePlanned', { wave: 7, plan: heavyPlan });
    const spoken = h.emitted.filter((e) => e.event === 'voice:say' || e.event === 'alert');
    const opener = spoken.filter((e) => e.payload.id === 'survival:w7:open');
    assert.equal(opener.length, 1, 'the character joins the one opener line — the wave budget is intact');
    assert.ok(opener[0].payload.text.includes('Iron Kraken'));
    assert.ok(spoken.length <= 5, `per-wave line budget holds, got ${spoken.length}`);
  } finally { survivalAnnounce.destroy(); }
});

test('the edited score still satisfies the authored contract against the real status vocabulary', () => {
  for (const encounter of [IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS]) {
    assert.deepEqual(validateCapitalBossEncounter(encounter, VOCABULARY).errors, []);
  }
  assert.ok(VOCABULARY.statusIds.has('status_momentum_sink'), 'the sink is shipped content, not a dead id');
});

test('mantle_trawl is a bounded authored beat that acts II and III actually field', () => {
  for (const encounter of [IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS]) {
    const s = encounter.score;
    const beat = s.beats.find((b) => b.id === 'mantle_trawl');
    assert.ok(beat, `${encounter.id} fields the trawl`);
    assert.ok(Number.isSafeInteger(beat.trackTicks) && beat.trackTicks >= 0);
    assert.ok(Number.isSafeInteger(beat.tellTicks) && beat.tellTicks - beat.trackTicks >= 90,
      'the locked window still meets the telegraph floor');
    assert.ok(Number.isSafeInteger(beat.activeTicks) && beat.activeTicks >= 1 && beat.activeTicks <= 60);
    assert.ok(Number.isSafeInteger(beat.recoverTicks) && beat.recoverTicks >= 90);
    assert.deepEqual(beat.expose, THROW_WINDOW, 'recovery exposes the ordinary throw window');
    assert.equal(beat.shapes.length, 1);
    assert.equal(beat.shapes[0].kind, 'sector');
    assert.equal(beat.shapes[0].aim, 'target');
    assert.deepEqual(beat.packet.statuses.map((st) => [st.id, st.durationTicks]),
      [['status_momentum_sink', 120]]);
    assert.ok(beat.packet.channels.kinetic > 0);
    const acts = Object.fromEntries(s.acts.map((a) => [a.id, a]));
    assert.deepEqual(acts.disassembly.opening, ['mantle_trawl'], 'act II opens on the trawl');
    assert.ok(acts.disassembly.pattern.includes('mantle_trawl'), 'act II keeps it in rotation');
    assert.ok(acts.complaint.pattern.includes('mantle_trawl'), 'the finale fields the trawl');
    assert.ok(acts.complaint.pattern.includes('siphon_jet'), 'the finale stays heavy');
    assert.equal(acts.claim.opening.concat(acts.claim.pattern).includes('mantle_trawl'), false,
      'act I stays the gentle opening lesson');
  }
});

// The direct score driver from iron-kraken-combat.test.mjs, plus an optional second body
// standing outside the paint.
function scoreHarness({ bystander = false } = {}) {
  const p = IRON_KRAKEN_PROFILES.heavy;
  const boss = { id: 2, alive: true, pos: { x: 0, z: 0 }, rot: 0,
    radius: p.coreRadius, hull: p.hull, hullMax: p.hull, disabled: [] };
  const target = { id: 1, alive: true, pos: { x: 75, z: 0 }, radius: 7, hull: 200, hullMax: 200 };
  const extra = { id: 9, alive: true, pos: { x: -80, z: 0 }, radius: 7, hull: 200, hullMax: 200 };
  const fight = createCapitalBossFight({
    encounterId: p.scoreId, fightId: 'test:trawl', bossId: 2, targetId: 1 });
  let tick = 0;
  const targets = bystander ? [target, extra] : [target];
  const observe = () => ({ tick, simTime: tick * DT, active: true, boss, target, targets });
  return { boss, target, extra, fight, observe,
    step() { const commands = stepCapitalBossFight(fight, observe()); tick++; return commands; } };
}

/** Drive the score into act II, whose opening cast is the trawl, and stop once it locks. */
function driveToTrawlLock(h) {
  h.boss.hull = h.boss.hullMax * 0.5;
  const telegraphs = [];
  for (let guard = 0; guard < 4000; guard++) {
    telegraphs.push(...h.step().filter((c) => c.type === 'telegraph'));
    if (h.fight.cast && h.fight.cast.beatId === 'mantle_trawl' && h.fight.cast.locked) {
      return telegraphs.filter((c) => c.beatId === 'mantle_trawl');
    }
  }
  assert.fail('the disassembly act never opened with the trawl');
}

test('the trawl paints a front sector while tracking, then sinks only what it catches', () => {
  const h = scoreHarness({ bystander: true });
  const telegraphs = driveToTrawlLock(h);
  assert.equal(h.fight.actIndex, 1, 'hull threshold entered the disassembly act');
  assert.ok(telegraphs.some((c) => c.locked === false), 'the cast telegraphs while still tracking');
  assert.ok(telegraphs.some((c) => c.locked === true), 'the lock is announced');
  assert.ok(telegraphs.every((c) => c.shapes.length === 1 && c.shapes[0].kind === 'sector'),
    'the telegraph carries the same sector the damage reads');
  const locked = h.fight.cast.shapes[0];
  const aim = Math.atan2(h.target.pos.z - h.boss.pos.z, h.target.pos.x - h.boss.pos.x);
  assert.ok(Math.abs(wrapAngle(locked.heading - aim)) < 1e-6,
    'the sector locks onto the aimed bearing — the front of this cast is the target');
  assert.equal(h.extra ? h.extra.pos.x : 0, -80, 'the bystander waits behind the hull, outside the paint');

  const hits = [];
  while (h.fight.phase !== 'recovery') hits.push(...h.step());
  const damage = hits.filter((c) => c.type === 'damage' && c.origin && c.origin.kind === 'capital_score');
  const caught = damage.filter((c) => c.targetId === h.target.id);
  assert.equal(caught.length, 1, 'one cast, one receipt on the caught hull');
  assert.equal(caught[0].packet.channels.kinetic, 8);
  assert.deepEqual(caught[0].packet.statuses.map((st) => [st.id, st.durationTicks]),
    [['status_momentum_sink', 120]], 'the catch hauls the hull to the Kraken frame for two seconds');
  assert.equal(damage.some((c) => c.targetId === h.extra.id), false,
    'a body outside the painted sector takes nothing');
  const exposure = hits.find((c) => c.type === 'damage' && c.origin && c.origin.kind === 'capital_exposure');
  assert.ok(exposure, 'recovery emits the expose packet');
  assert.equal(exposure.targetId, h.boss.id);
  assert.deepEqual(exposure.packet.statuses.map((st) => st.id), ['status_unmoored']);
});

test('a hull that slips the locked paint before the trawl fires takes nothing', () => {
  const h = scoreHarness();
  driveToTrawlLock(h);
  const locked = clone(h.fight.cast.shapes);
  h.target.pos = { x: -160, z: 0 };
  const hits = [];
  while (h.fight.phase !== 'active') hits.push(...h.step());
  assert.deepEqual(h.fight.cast.shapes, locked, 'after lock, dodging does not drag the warning');
  while (h.fight.phase !== 'recovery') hits.push(...h.step());
  assert.equal(hits.filter((c) => c.type === 'damage' && c.origin && c.origin.kind === 'capital_score')
    .length, 0, 'outside the locked sector the trawl catches nothing');
});
