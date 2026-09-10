// PQ-174.06 — death, retry, and the story.
//
// Done when: every seeded death names its cause AND the telegraph that preceded it
// (with lead time in ms); retry on the same seed returns control in ≤ 5 s; the
// results screen tells the run from live telemetry (best chain, two numbered
// moments, the build, a shareable code) rather than constants.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';

import { weaponLabel } from '../src/combat/playerDefeat.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import {
  buildCodeFor,
  buildNameFor,
  deathCauseText,
  hullClosingSpeed,
  isGenericYouDied,
  storyMomentsFor,
  survivalResults,
} from '../src/systems/survivalResults.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  CRUCIBLE_ARENA_ID,
  clearCrucibleSetup,
  crucibleSetupFor,
  lastCrucibleSetup,
  lastCrucibleRuleset,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import {
  crucibleResultsScreen,
  resultSectionOrder,
  storySentences,
} from '../src/ui/screens/crucible.js';

const DT = 1 / 60;
const SEEDS = [4242, 8008, 13502];
const RETRY_BUDGET_MS = 5000;

const ATTACKERS = [
  'Wasp Swarmer #3', 'Reaver Corsair', 'Iron Maw', 'Corsair Wing lead',
  'Anvil fragment', 'Wasp Swarmer #7', 'Drifter on your six', 'Hitch Bruiser',
  'Wasp Swarmer #11', 'Reaver Corsair #2', 'Iron Maw escort', 'Sling Tug',
  'Wasp Swarmer #1', 'Foundry drone 4', 'Storm Lattice sniper', 'Cryo Drift ram',
  'Cinder Sluice gunner', 'Lagrange pylon gun', 'Wasp Swarmer #19', 'Reaver Corsair #5',
];
const WEAPONS = ['wpn_autocannon_m', 'wpn_pulse_laser_m', 'wpn_railgun_m', 'wpn_flak_turret_s', null];
const DIRS = ['AFT', 'PORT', 'FRONT', 'STARBOARD', 'CONTACT'];
const TELLS = ['weapon_charge', 'broadside_charge', 'attach_spool', 'field_spool', 'wake_mines', 'ai_dive'];

function boot(seed) {
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
  const player = {
    id: 1, alive: true, type: 'ship', radius: 2,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  return { state, bus, emitted, ctx, player };
}

function beginActive(h, seed) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: CRUCIBLE_ARENA_ID,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    h.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  h.bus.emit('run:waveStarted', { wave: 1 });
}

function assertNamedDeath(result, label) {
  assert.ok(result && result.death, `${label}: death story missing`);
  const { causeText, telegraphName, telegraphLeadMs } = result.death;
  assert.equal(isGenericYouDied(causeText), false, `${label}: generic you-died: ${causeText}`);
  assert.ok(typeof causeText === 'string' && causeText.length > 0, `${label}: empty cause`);
  assert.ok(typeof telegraphName === 'string' && telegraphName.length > 0, `${label}: nameless telegraph`);
  assert.equal(Number.isFinite(telegraphLeadMs), true, `${label}: lead time missing`);
  assert.ok(telegraphLeadMs >= 0, `${label}: negative lead`);
}

function runScriptedDeath(seed, index) {
  const h = boot(seed);
  beginActive(h, seed);
  const attacker = ATTACKERS[index];
  const weaponId = WEAPONS[index % WEAPONS.length];
  const direction = DIRS[index % DIRS.length];
  const kind = TELLS[index % TELLS.length];
  const hulls = 0.8 + (index % 9) * 0.7;
  const id = h.state.nextEntityId++;
  const dist = 24;
  const closingWu = hulls * 4;
  const killer = {
    id, alive: true, type: 'ship', radius: 2,
    pos: { x: dist, z: 0 }, vel: { x: -closingWu, z: 0 },
    data: { callsign: attacker, lootTableId: 'wasp_swarmer', runCohort: 'survival' },
  };
  h.state.entities.set(id, killer);
  h.state.entityList.push(killer);

  const flavor = index % 5;
  h.state.simTime = 12;
  if (flavor !== 3) {
    h.bus.emit('ai:telegraph', {
      entityId: id, targetId: h.state.playerId, kind,
    });
  }
  h.state.simTime = 12.35;
  if (flavor !== 4) {
    h.bus.emit('combat:damage', {
      targetId: h.state.playerId, attackerId: id, applied: 18 + index, weaponId,
    });
  }
  h.state.simTime = 12.5;
  h.player.vel = { x: 0, z: 0 };
  if (flavor === 4) {
    h.bus.emit('player:death', null);
  } else {
    h.bus.emit('player:death', {
      attacker,
      weapon: weaponId ? weaponLabel(weaponId) : 'unidentified weapon',
      direction,
      dominantLayer: 'hull',
      killerId: id,
      source: { entityId: id, label: attacker },
      closingHullsPerS: hulls,
    });
  }
  const result = survivalResults.lastResult();
  survivalResults.destroy();
  runSession.destroy();
  return { result, attacker, hulls, kind, flavor, seed, index };
}

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
  return { root, emitted, lines: textLines(root), buttons: findButtons(root) };
}

test('closing speed is hull lengths per second toward the player', () => {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 2 };
  const killer = { pos: { x: 20, z: 0 }, vel: { x: -8, z: 0 } };
  const closing = hullClosingSpeed(player, killer);
  assert.ok(closing);
  assert.ok(Math.abs(closing.wuPerS - 8) < 1e-9);
  assert.ok(Math.abs(closing.hullsPerS - 2) < 1e-9);
  assert.match(deathCauseText({
    attacker: 'Iron Maw', weapon: 'Heavy Autocannon M', direction: 'FRONT',
    dominantLayer: 'hull', closingHullsPerS: 2,
  }), /Iron Maw.*closing 2\.0 hulls\/s/);
  assert.equal(isGenericYouDied('You died'), true);
  assert.equal(isGenericYouDied('Iron Maw · Pulse · AFT · hull breach'), false);
});

test('20 seeded deaths across 3 seeds: named cause, named telegraph, lead time in ms', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const seed = SEEDS[i % SEEDS.length];
    const row = runScriptedDeath(seed, i);
    assertNamedDeath(row.result, `seed ${seed} death ${i}`);
    const death = row.result.death;
    if (row.flavor !== 4) {
      assert.match(death.causeText, new RegExp(row.attacker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    if (row.flavor !== 3 && row.flavor !== 4) {
      assert.equal(death.telegraphSource, 'witnessed');
      assert.ok(death.telegraphLeadMs >= 100, `seed ${seed} death ${i} lead ${death.telegraphLeadMs}`);
    }
    assert.equal(row.result.seed, seed);
    rows.push({
      seed, i, cause: death.causeText, tell: death.telegraphName,
      leadMs: death.telegraphLeadMs, source: death.telegraphSource,
    });
  }
  const usedSeeds = new Set(rows.map((r) => r.seed));
  assert.equal(usedSeeds.size >= 3, true);
  console.log(`[pq-174.06] namedDeaths=${rows.length} seeds=${[...usedSeeds].join(',')}`);
  for (const row of rows) {
    console.log(
      `[pq-174.06] seed=${row.seed} i=${row.i} source=${row.source} leadMs=${row.leadMs} `
      + `tell=${row.tell} cause=${row.cause}`,
    );
  }
  assert.equal(rows.length, 20);
});

test('a tell aimed at someone else is not the telegraph that killed the player', () => {
  const h = boot(4242);
  beginActive(h, 4242);
  h.state.simTime = 5;
  h.bus.emit('ai:telegraph', { entityId: 99, targetId: 77, kind: 'broadside_charge' });
  h.state.simTime = 5.4;
  h.bus.emit('ai:telegraph', {
    entityId: 8, targetId: h.state.playerId, kind: 'weapon_charge',
  });
  h.state.simTime = 5.7;
  h.bus.emit('player:death', {
    attacker: 'Wasp Swarmer #3', weapon: 'Heavy Autocannon M', direction: 'AFT',
    dominantLayer: 'hull', killerId: 8, source: { entityId: 8, label: 'Wasp Swarmer #3' },
  });
  const death = survivalResults.lastResult().death;
  assert.equal(death.telegraphName, 'Weapon charge');
  assert.equal(death.telegraphSource, 'witnessed');
  assert.equal(death.telegraphLeadMs, 300);
});

test('two different runs produce different stories from live telemetry, not constants', () => {
  const runs = [
    {
      seed: 4242, chain: 3, wave: 2, kills: 12, first: 4.2, style: 1.5,
      picks: [{ verb: 'Volume', defId: 'wpn_autocannon_m', wave: 2 }],
      hit: 22,
    },
    {
      seed: 8008, chain: 11, wave: 1, kills: 4, first: 1.1, style: 2.8,
      picks: [{ verb: 'Throw', defId: 'wpn_concussion_cannon_m', wave: 5 }],
      hit: 41,
    },
  ];
  const published = [];
  for (const spec of runs) {
    const h = boot(spec.seed);
    beginActive(h, spec.seed);
    h.state.run.modifiers = spec.picks;
    h.state.run.style = { multiplier: spec.style, recentCauses: ['collision'] };
    h.state.simTime = 0;
    h.bus.emit('run:waveStarted', { wave: 1 });
    const victim = {
      id: h.state.nextEntityId++, alive: true, type: 'ship',
      data: { runCohort: 'survival', level: 1 },
    };
    h.state.entities.set(victim.id, victim);
    h.state.simTime = spec.first;
    victim.alive = false;
    h.bus.emit('entity:killed', { id: victim.id, killerId: h.state.playerId, type: 'ship' });
    h.bus.emit('swarm:chain', { best: spec.chain, wave: spec.wave });
    h.bus.emit('run:waveCleared', { wave: spec.wave });
    h.state.run.wave = spec.wave;
    h.bus.emit('combat:damage', {
      targetId: h.state.playerId, attackerId: 9, applied: spec.hit, weaponId: 'wpn_autocannon_m',
    });
    h.bus.emit('player:death', {
      attacker: spec.seed === 4242 ? 'Reaver Corsair' : 'Iron Maw',
      weapon: 'Heavy Autocannon M', direction: 'AFT', dominantLayer: 'hull', killerId: 9,
    });
    published.push(survivalResults.lastResult());
    survivalResults.destroy();
    runSession.destroy();
  }
  const [a, b] = published;
  assert.equal(a.bestChain, 3);
  assert.equal(b.bestChain, 11);
  assert.notEqual(a.buildCode, b.buildCode);
  assert.notEqual(a.buildName, b.buildName);
  const aMoments = a.moments.map((m) => m.text);
  const bMoments = b.moments.map((m) => m.text);
  assert.ok(aMoments.length >= 2, `run A moments ${JSON.stringify(aMoments)}`);
  assert.ok(bMoments.length >= 2, `run B moments ${JSON.stringify(bMoments)}`);
  assert.notDeepEqual(aMoments, bMoments);
  assert.equal(aMoments.includes('Best chain 5'), false);
  assert.equal(bMoments.includes('Best chain 5'), false);
  assert.ok(aMoments.some((t) => t.includes('3')));
  assert.ok(bMoments.some((t) => t.includes('11')));
  assert.equal(a.buildCode, buildCodeFor(runs[0].picks));
  assert.equal(b.buildCode, buildCodeFor(runs[1].picks));
  assert.equal(a.buildName, buildNameFor(runs[0].picks));
  assert.equal(b.buildName, buildNameFor(runs[1].picks));

  const plateA = mountResults(a);
  const plateB = mountResults(b);
  const textA = plateA.lines.join('\n');
  const textB = plateB.lines.join('\n');
  assert.ok(textA.includes(a.death.causeText));
  assert.ok(textA.includes(`${a.death.telegraphLeadMs} ms`));
  assert.ok(textA.includes(a.buildCode));
  assert.ok(textA.includes(a.buildName));
  assert.ok(textB.includes(b.buildCode));
  assert.notEqual(textA, textB);
  assert.deepEqual(resultSectionOrder(a)[0], 'story');
  assert.ok(storySentences(a).length >= 4);
  console.log(`[pq-174.06] storyA=${JSON.stringify(aMoments)} build=${a.buildCode}`);
  console.log(`[pq-174.06] storyB=${JSON.stringify(bMoments)} build=${b.buildCode}`);
});

test('same-seed retry restores control in ≤ 5 s and replays the same wave sequence', () => {
  const seed = 4242;
  const planA = [1, 2, 3].map((wave) => planWave({
    seed, arenaId: CRUCIBLE_ARENA_ID, wave, ruleset: SWARM_RULESET,
  }));
  const h = boot(seed);
  survivalRun.init(h.ctx);

  function tick(n = 1) {
    for (let i = 0; i < n; i++) {
      h.state.simTime += DT;
      h.state.tick = (h.state.tick || 0) + 1;
      survivalRun.update(DT);
    }
  }
  function toControl() {
    h.bus.emit('run:beginRequested', {
      kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: CRUCIBLE_ARENA_ID,
    });
    h.bus.emit('run:loadoutReady', { source: 'crucible:launch' });
    tick(1);
    tick(SURVIVAL_ARENA_INTRO_TICKS);
    tick(SURVIVAL_WAVE_INTRO_TICKS);
  }

  toControl();
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.seed, seed);
  const firstPlanId = h.state.run.wavePlanId;
  h.bus.emit('player:death', {
    attacker: 'Wasp Swarmer #3', weapon: 'Heavy Autocannon M', direction: 'AFT',
    dominantLayer: 'hull', killerId: 9,
  });
  assert.equal(h.state.run.phase, 'ended');
  const deathResult = survivalResults.lastResult();
  assertNamedDeath(deathResult, 'retry prelude');
  assert.equal(deathResult.seed, seed);

  runSession.newGame();
  survivalRun.newGame();
  const t0 = performance.now();
  toControl();
  const retryMs = performance.now() - t0;
  assert.equal(h.state.run.phase, 'active', 'retry must return control');
  assert.equal(h.state.run.seed, seed, 'retry that re-rolls is a new run');
  const control = survivalRun.lastControl();
  assert.ok(control);
  assert.equal(control.seed, seed);
  console.log(`[pq-174.06] retryToControlMs=${retryMs.toFixed(2)} seed=${seed} budgetMs=${RETRY_BUDGET_MS}`);
  assert.ok(retryMs <= RETRY_BUDGET_MS, `retry ${retryMs} ms exceeded ${RETRY_BUDGET_MS} ms`);
  assert.equal(h.state.run.wave, 1);
  assert.equal(h.state.run.wavePlanId, firstPlanId);

  const planB = [1, 2, 3].map((wave) => planWave({
    seed, arenaId: CRUCIBLE_ARENA_ID, wave, ruleset: SWARM_RULESET,
  }));
  for (let i = 0; i < 3; i++) {
    assert.notEqual(planA[i].ok, false);
    assert.equal(planA[i].id, planB[i].id, `wave ${i + 1} sequence drifted`);
  }
  const other = planWave({ seed: 8008, arenaId: CRUCIBLE_ARENA_ID, wave: 1, ruleset: SWARM_RULESET });
  assert.notEqual(planA[0].id, other.id, 'a different seed must not clone wave 1');

  clearCrucibleSetup();
  const setup = crucibleSetupFor({ starterId: 'physics_toolkit', seed });
  assert.equal(setup.ok, true);
  const launchBus = { emit() {}, on() {}, off() {}, once() {} };
  requestCrucibleRun(launchBus, setup.value, SWARM_RULESET);
  assert.equal(lastCrucibleSetup().seed, seed);
  const plate = mountResults(deathResult);
  const again = plate.buttons.find((b) => /same seed/i.test(b.textContent));
  assert.ok(again, 'retry word missing from the plate');
  for (const fn of again.listeners.click || []) fn();
  const launched = plate.emitted.filter((e) => e.event === 'game:new');
  assert.equal(launched.length, 1);
  assert.equal(launched[0].payload.seed, seed);
  assert.equal(lastCrucibleSetup().seed, seed);
  assert.equal(lastCrucibleRuleset(), SWARM_RULESET);
});

test('storyMomentsFor is live data: a hardcoded Best chain 5 that does not move must fail', () => {
  const quiet = storyMomentsFor({ bestChain: 0, waveStats: [], firstKillInS: null, stylePeak: 1 });
  const loud = storyMomentsFor({
    bestChain: 5, chainWave: 4,
    waveStats: [{ wave: 2, kills: 9 }],
    heaviestHit: { amount: 30, weapon: 'Heavy Autocannon M' },
    firstKillInS: 2.4,
    stylePeak: 2,
  });
  const other = storyMomentsFor({
    bestChain: 12, chainWave: 7,
    waveStats: [{ wave: 1, kills: 3 }],
    heaviestHit: { amount: 11, weapon: 'Pulse Laser S' },
    firstKillInS: 0.8,
    stylePeak: 3.1,
  });
  assert.deepEqual(quiet, []);
  assert.ok(loud.length >= 2);
  assert.notDeepEqual(loud.map((m) => m.text), other.map((m) => m.text));
  assert.equal(loud[0].text, 'Best chain 5 on wave 4');
  assert.equal(other[0].text, 'Best chain 12 on wave 7');
});
