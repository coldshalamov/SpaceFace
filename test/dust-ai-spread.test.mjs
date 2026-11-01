// DUST P6 (BS-7) — AI brain spread. Three proofs on the live owners, no reimplementations:
//   (a) the authored Enemy Mind archetypes (src/data/enemies.js ENEMY_MIND_ARCHETYPES, resolved
//       by src/ai/enemyMind/runtime.js) produce measurably DISTINCT verb distributions in
//       simulated fights — a minimum pairwise divergence is asserted, not eyeballed;
//   (b) the six formerly-identical heavyweights select distinct doctrine/mind profiles at the
//       DATA level (their enemies.js rows), with the one documented out-of-packet residual tie;
//   (c) the two miniboss act variants (src/ai/combatDoctrine.js CAPITAL_BROADSIDE_ACT_VARIANTS,
//       keyed by the enemies.js phaseAtTurretsLost authoring) differ from base capital_broadside
//       and from each other in concrete cadence/range/cue parameters AND in driven play;
//   (d) determinism: same seed ⇒ identical decision sequences (mind) and phase sequences (boss).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEnemyMindState, EnemyMindRuntime } from '../src/ai/enemyMind/runtime.js';
import { SPECIALIST_DOCTRINES } from '../src/ai/enemyMind/adapter.js';
import { MIND_VERBS } from '../src/ai/enemyMind/decision.js';
import {
  CAPITAL_BROADSIDE_ACT_VARIANTS,
  CombatDoctrineId,
  CombatDoctrineRuntime,
} from '../src/ai/combatDoctrine.js';
import { CAPITAL_BOSS_CHOREOGRAPHY } from '../src/data/combatDefs.js';
import { ENEMY_MIND_ARCHETYPES, ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { ContactKind } from '../src/ai/contracts.js';

// ── shared deterministic RNG (same shape as the existing enemy-mind harness) ──────────────
function rng(seed = 4242) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ═══ (a) cluster verb distributions ═══════════════════════════════════════════════════════

// One shared 8-second pressure cycle: healthy hold → hurt under fire → recovering under a
// volley inbound while the quarry turns to chase p2 (a visible pursuit the wing can read and
// punish). Every cluster flies the SAME scenario with the SAME seed, so the only difference is
// the authored archetype (traits + verb weights).
const CYCLE = 480; // ticks (8 s at 60 Hz)
function pilotFrame(tick, { id, index, hull, incoming, targeted, chasing, targetPos }) {
  const chaseTargetPos = { x: 0, z: 70 }; // p2's slot
  const chaseVel = { x: 0, z: 0 };
  if (chasing) {
    const dx = chaseTargetPos.x - targetPos.x, dz = chaseTargetPos.z - targetPos.z;
    const len = Math.hypot(dx, dz) || 1;
    chaseVel.x = (dx / len) * 42; chaseVel.z = (dz / len) * 42;
  }
  const contacts = [
    { // the quarry: visible, confident; shoots at p1 early, chases p2 late in the cycle
      id: 't1', kind: ContactKind.SHIP, hostile: true, alive: true, valid: true, visible: true,
      ageTicks: 0, confidence: 1, team: 'concord',
      pos: { ...targetPos }, vel: chasing ? chaseVel : { x: 12, z: -6 },
      targetId: chasing ? 'p2' : (targeted ? id : null),
    },
  ];
  for (const other of ['p1', 'p2', 'p3']) {
    if (other === id) continue;
    const i = other === 'p1' ? 0 : other === 'p2' ? 1 : 2;
    contacts.push({ // wingmates on the same team: live support for bait/flank/cover
      id: other, kind: ContactKind.SHIP, hostile: false, alive: true, valid: true, visible: true,
      ageTicks: 0, confidence: 1, team: 'reach',
      pos: { x: i * 90 - 90, z: 70 }, vel: { x: -4, z: 2 }, targetId: null,
    });
  }
  if (incoming) {
    contacts.push({ // a live volley closing on this hull: feeds `incoming` pressure
      id: `shot-${id}`, kind: 'projectile', hostile: true, alive: true, valid: true, visible: true,
      ageTicks: 0, confidence: 1,
      pos: { x: (index - 1) * 90 - 90 + 30, z: 160 }, vel: { x: 0, z: -160 }, targetId: null,
    });
  }
  return {
    tick,
    self: { id, team: 'reach', pos: { x: (index - 1) * 90 - 90, z: 60 }, vel: { x: -3, z: 1 },
      rot: Math.PI, radius: 14, hullFraction: hull, energyFraction: 0.6, heatFraction: 0.25,
      disabled: false, tumbling: false, tethered: false },
    contacts,
    events: [],
  };
}

const DIRECTIVE = Object.freeze({
  objective: Object.freeze({ kind: 'engage', targetId: 't1', targetObserved: true }),
  formation: Object.freeze({ slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }), bound: 140 }),
});

/** Drive one 3-pilot wing under the shared scenario; returns the mind's decision-event stream. */
function flyWing({ doctrine, seed = 4242, seconds = 90 }) {
  const runtime = new EnemyMindRuntime({ profile: 'crew' });
  const memory = createEnemyMindState();
  const rand = rng(seed);
  const pilots = ['p1', 'p2', 'p3'];
  let t = 0;
  for (let step = 1; step <= seconds * 60; step++) {
    t += 1 / 60;
    const cycle = step % CYCLE;
    const hull = cycle < 160 ? 1 : cycle < 320 ? 0.55 : 0.78;
    const incoming = cycle >= 320;
    const perceptions = new Map();
    const directives = new Map();
    pilots.forEach((id, index) => {
      perceptions.set(id, pilotFrame(step, {
        id, index, hull, incoming,
        targeted: index === 0 && cycle < 320,
        chasing: cycle >= 320,
        targetPos: { x: Math.sin(step / 110) * 140, z: -240 + Math.cos(step / 90) * 90 },
      }));
      directives.set(id, DIRECTIVE);
    });
    runtime.step({
      memory, rng: rand, simTime: t, tick: step,
      roster: [{ id: 'wing', members: pilots.map((id) => ({ id, alive: true, combatDoctrineId: doctrine })) }],
      perceptionsByEntity: perceptions, directivesByEntity: directives,
    });
  }
  return memory;
}

function verbHistogram(memory) {
  const counts = Object.fromEntries(MIND_VERBS.map((verb) => [verb, 0]));
  let total = 0;
  for (const event of memory.events) {
    if (event.kind !== 'decision') continue;
    counts[event.verb] = (counts[event.verb] || 0) + 1;
    total++;
  }
  // The mind retains its last maxEvents=256 facts; the histogram therefore reads the tail of the
  // run — identically for every cluster (same scenario, same seed), so comparisons stay honest.
  assert.ok(total > 80, 'each simulated fight must produce a usable decision sample');
  return { counts, total };
}

/** Total-variation distance between two decision streams' verb distributions (0..1). */
function verbDivergence(left, right) {
  let tv = 0;
  for (const verb of MIND_VERBS) tv += Math.abs(left.counts[verb] / left.total - right.counts[verb] / right.total);
  return tv / 2;
}

const CLUSTER_DOCTRINES = Object.freeze(['swarm_pack', 'pack_pursuit', 'ranged_stalker', 'brawler_commit']);
const MIN_PAIR_DIVERGENCE = 0.15;

test('DUST P6 (a): each authored mind archetype flies a measurably distinct verb distribution', () => {
  const histograms = new Map(CLUSTER_DOCTRINES.map((doctrine) => [doctrine, verbHistogram(flyWing({ doctrine }))]));
  for (let i = 0; i < CLUSTER_DOCTRINES.length; i++) {
    for (let j = i + 1; j < CLUSTER_DOCTRINES.length; j++) {
      const left = CLUSTER_DOCTRINES[i];
      const right = CLUSTER_DOCTRINES[j];
      const divergence = verbDivergence(histograms.get(left), histograms.get(right));
      assert.ok(divergence >= MIN_PAIR_DIVERGENCE,
        `${left} vs ${right} verb distributions are too similar (TV=${divergence.toFixed(3)} < ${MIN_PAIR_DIVERGENCE})`);
    }
  }
});

test('DUST P6 (a): each archetype expresses its fiction (feints, holds, leaves, breaks)', () => {
  const brood = verbHistogram(flyWing({ doctrine: 'swarm_pack' }));
  const grinder = verbHistogram(flyWing({ doctrine: 'pack_pursuit' }));
  const specter = verbHistogram(flyWing({ doctrine: 'ranged_stalker' }));
  const bulwark = verbHistogram(flyWing({ doctrine: 'brawler_commit' }));
  const share = (h, verbs) => verbs.reduce((sum, verb) => sum + h.counts[verb] / h.total, 0);
  // The brood feints (cunning opens the bait verb); the grinder never does — a grinder does not
  // pretend to run.
  assert.ok(brood.counts.bait >= 5, 'the brood mind offers chases');
  assert.equal(grinder.counts.bait, 0, 'the grinder mind never baits');
  // The bulwark holds attention; the specter never does — that is the whole skirmisher identity.
  assert.ok(share(bulwark, ['press']) > 0.25, 'the bulwark lives on press');
  assert.ok(share(specter, ['press']) < 0.10, 'the specter never holds the lane');
  // The ghost's largest verb is leaving.
  assert.ok(share(specter, ['withdraw']) > 0.25, 'the specter spends the shot and goes');
  // The undisciplined brood breaks where the disciplined grinder holds: panic is a brood verb.
  assert.ok(brood.counts.panic > 0 && brood.counts.panic >= grinder.counts.panic + 5,
    'fear cracks the brood, never the grind');
});

// ═══ (b) the six formerly-identical heavyweights: data-level profile selection ═══════════

const SIX = Object.freeze(['mirrorjaw_foreman', 'forge_regent', 'brood_tendril', 'casket_worm', 'kilnback', 'pallet_jack']);
// Mirror of PRODUCTION_ENEMY_MIND_CONFIG.profilesByDoctrine (src/systems/tacticalAI.js) for the
// doctrines that have no authored archetype — used only to compute the effective profile label.
const PRODUCTION_MIND_MAP = Object.freeze({
  interceptor_flyby: 'raider', brawler_commit: 'rookie', ranged_disengager: 'veteran',
  swarm_pack: 'raider', pack_pursuit: 'crew',
});

function effectiveMindProfile(row) {
  const doctrine = row.combatDoctrineId;
  if (SPECIALIST_DOCTRINES.has(doctrine)) return 'mind:reserved';
  const archetype = ENEMY_MIND_ARCHETYPES[doctrine];
  return archetype ? `archetype:${archetype.label}` : `profile:${PRODUCTION_MIND_MAP[doctrine] || 'crew'}`;
}

test('DUST P6 (b): the six samey heavyweights now select distinct doctrine/mind profiles', () => {
  const byId = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
  const profiles = SIX.map((id) => {
    const row = byId.get(id);
    assert.ok(row, `${id} is a live roster row`);
    return { id, doctrine: row.combatDoctrineId, mind: effectiveMindProfile(row) };
  });
  const keys = profiles.map((p) => `${p.doctrine}|${p.mind}`);
  // The residual kilnback/pallet_jack tie is BY DESIGN, established empirically (2026-11-01):
  // kilnback→ranged_stalker rewired its opening (approach before preheat; 9 fixture failures
  // against its committed-heat-lane identity) and pallet_jack→escort_screen reserves the mind
  // (SPECIALIST_DOCTRINES) and the fork thief stops pursuing freight (pallet-jack-route cap).
  // Both are authored ceremony specialists — their differentiation IS their special systems
  // (finite thermal lanes vs physical fork capture), not the generic mind. The tie is asserted
  // so it stays a visible decision instead of silently reading as unfinished.
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  assert.deepEqual(duplicates, ['brawler_commit|archetype:bulwark'],
    'the only residual tie must be the by-design kilnback/pallet_jack pair');
  const uniqueCount = new Set(keys).size;
  assert.equal(uniqueCount, 5, `expected 5 distinct profiles across the six (4 differentiated + the by-design pair), got ${uniqueCount}`);
  const four = profiles.filter((p) => p.id !== 'kilnback' && p.id !== 'pallet_jack');
  assert.equal(new Set(four.map((p) => `${p.doctrine}|${p.mind}`)).size, 4,
    'mirrorjaw_foreman, forge_regent, brood_tendril, casket_worm must each be unique');
  assert.equal(new Set(four.map((p) => p.doctrine)).size, 4, 'their doctrine selections are unique');
  // The tier-1 spread claim in data: exactly these clusters carry authored archetypes.
  assert.deepEqual(Object.keys(ENEMY_MIND_ARCHETYPES).sort(), ['brawler_commit', 'pack_pursuit', 'ranged_stalker', 'swarm_pack']);
  assert.ok(!ENEMY_MIND_ARCHETYPES.interceptor_flyby,
    'the raider tier keeps its production profile mapping (no silent behavior change there)');
});

test('DUST P6 (b): the retargeted rows still pass the fail-closed fire-phase table', () => {
  // Every ARMED retargeted enemy must land on a doctrine that can actually fire, or the row
  // ships a silent hull (engagementAuthority DOCTRINE_FIRE_PHASES is fail-closed per doctrine).
  const byId = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
  const firePhases = new Map([
    ['interceptor_flyby', ['strike', 'commit']], ['shield_breaker', ['lance']],
    ['swarm_pack', ['strike']], ['pack_pursuit', ['press']], ['brawler_commit', ['commit']],
  ]);
  for (const id of ['mirrorjaw_foreman', 'forge_regent', 'brood_tendril', 'casket_worm']) {
    const row = byId.get(id);
    assert.ok(row.weapons.length === 0 || firePhases.has(row.combatDoctrineId),
      `${id} doctrine ${row.combatDoctrineId} must be a fireable doctrine`);
  }
  // The factory stamps each retargeted doctrine, and the heavy interceptor keeps its committed
  // flight: at mass 420 interceptor_flyby resolves flightProfile 'brawler_commit', so the
  // Foreman's passes and gun windows are unchanged (the retarget differentiates identity/mind).
  const foreman = makeEnemySpawnSpec('mirrorjaw_foreman', 4, { x: 0, z: 0 });
  assert.equal(foreman.data.ai.combatDoctrineId, 'interceptor_flyby');
  const spec = makeEnemySpawnSpec('forge_regent', 4, { x: 0, z: 0 });
  assert.equal(spec.data.ai.combatDoctrineId, 'shield_breaker', 'the spawn factory stamps the retargeted doctrine');
  const tendril = makeEnemySpawnSpec('brood_tendril', 4, { x: 0, z: 0 });
  assert.equal(tendril.data.ai.combatDoctrineId, 'swarm_pack');
  const worm = makeEnemySpawnSpec('casket_worm', 5, { x: 0, z: 0 });
  assert.equal(worm.data.ai.combatDoctrineId, 'pack_pursuit');
});

// ═══ (c) miniboss act variants vs base capital_broadside ══════════════════════════════════

const BASE_STAGES = CAPITAL_BOSS_CHOREOGRAPHY.capital_broadside.stages;
const STAGE_PARAMS = Object.freeze(['fireTicks', 'shiftTicks', 'preferredRange', 'cue']);

function differingStageParams(variant) {
  const diffs = [];
  variant.stages.forEach((stage, index) => {
    const base = BASE_STAGES[Math.min(index, BASE_STAGES.length - 1)];
    for (const param of STAGE_PARAMS) {
      if (stage[param] !== base[param]) diffs.push(`stage${index}.${param}`);
    }
  });
  return diffs;
}

test('DUST P6 (c): both miniboss variants differ from base capital_broadside in >= 8 concrete cadence parameters', () => {
  assert.equal(Object.keys(CAPITAL_BROADSIDE_ACT_VARIANTS).length, 2);
  for (const [boss, variant] of Object.entries(CAPITAL_BROADSIDE_ACT_VARIANTS)) {
    const diffs = differingStageParams(variant);
    assert.ok(diffs.length >= 8, `${boss} must differ from base in >= 8 of 12 stage parameters (got ${diffs.length}: ${diffs.join(', ')})`);
    const cues = variant.stages.map((stage) => stage.cue);
    assert.ok(cues.filter((cue, index) => cues.indexOf(cue) === index && !BASE_STAGES.some((s) => s.cue === cue)).length >= 2,
      `${boss} acts must announce in their own cue vocabulary`);
  }
  // And from EACH OTHER: the two variants' full cadence vectors are not equal in any stage.
  const nest = CAPITAL_BROADSIDE_ACT_VARIANTS.nest_carrier.stages;
  const maw = CAPITAL_BROADSIDE_ACT_VARIANTS.furnace_maw.stages;
  for (let index = 0; index < 3; index++) {
    const different = STAGE_PARAMS.filter((param) => nest[index][param] !== maw[index][param]);
    assert.ok(different.length >= 2, `act ${index}: nest_carrier and furnace_maw must read differently (got ${different.join(',')})`);
  }
});

test('DUST P6 (c): the enemies.js edge authoring is the live act key and reaches the spawned boss', () => {
  for (const [boss, variant] of Object.entries(CAPITAL_BROADSIDE_ACT_VARIANTS)) {
    const spec = makeEnemySpawnSpec(boss, 10, { x: 0, z: 0 });
    assert.deepEqual(spec.data.subsystems.phaseAtTurretsLost, variant.matchTurretPhaseEdges,
      `${boss} row must author exactly the variant's edge key (the data seam that reaches the doctrine runtime)`);
  }
});

/** Drive the live doctrine runtime against a planted hostile at 500 WU; returns the phase log. */
function driveCapital({ edges, turretsLost = 0, ticks = 340, loseAt = null }) {
  const runtime = new CombatDoctrineRuntime({ seed: 99 });
  const log = [];
  for (let tick = 0; tick <= ticks; tick++) {
    const lost = loseAt != null && tick >= loseAt ? turretsLost : 0;
    const snap = runtime.update({
      tick, entityId: 'boss', doctrineId: CombatDoctrineId.CAPITAL_BROADSIDE,
      perception: {
        self: { id: 'boss', team: 1, pos: { x: 0, z: 0 }, vel: { x: 2, z: 0 }, rot: 0,
          activity: { kind: 'attack_run' }, roe: 'weapons_free',
          hullFraction: 1, turretPhaseEdges: edges, turretsLost: lost },
        contacts: [{ id: 'player', kind: ContactKind.SHIP, hostile: true, alive: true, valid: true,
          visible: true, confidence: 1, threat: 6, pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 },
          mobilityBand: 'high', operationalMassBand: 'light', cargoBand: 'empty', tetherabilityBand: 'good' }],
      },
    });
    log.push(snap ? { phase: snap.phase, range: snap.preferredRange, stage: snap.bossStage, cue: snap.telegraph?.kind ?? null } : null);
  }
  return log;
}

test('DUST P6 (c): in driven play the variants hold different fire cadences, ranges and act cues', () => {
  const base = driveCapital({ edges: [] });                 // no authored edges: base table, stage 0 forever
  const nest = driveCapital({ edges: [1, 2] });
  const maw = driveCapital({ edges: [1, 3] });
  // Length of the FIRST broadside_fire act — the stage's authored fireTicks, exactly.
  const firstFireWindow = (log) => {
    const start = log.findIndex((row) => row.phase === 'broadside_fire');
    assert.ok(start >= 0, 'the boss must reach a fire act');
    let end = start;
    while (end + 1 < log.length && log[end + 1].phase === 'broadside_fire') end++;
    return end - start + 1;
  };
  assert.equal(firstFireWindow(base), BASE_STAGES[0].fireTicks, 'un-edged capital keeps the base cadence (60)');
  assert.equal(firstFireWindow(nest), CAPITAL_BROADSIDE_ACT_VARIANTS.nest_carrier.stages[0].fireTicks,
    'nest_carrier act I fires on its own shorter cadence');
  assert.equal(firstFireWindow(maw), CAPITAL_BROADSIDE_ACT_VARIANTS.furnace_maw.stages[0].fireTicks,
    'furnace_maw act I gnaws on its own longer cadence');
  assert.notEqual(firstFireWindow(nest), firstFireWindow(maw), 'the two bosses must not share a fire cadence');
  assert.equal(nest[0].range, 300, 'nest_carrier holds the wide latched standoff (base is 260)');
  assert.equal(maw[0].range, 280, 'furnace_maw opens at its own standoff');
  // Act advance on physical mount loss: both mounts quiet ⇒ act III cues the nest emptying.
  const advanced = driveCapital({ edges: [1, 2], turretsLost: 2, loseAt: 200 });
  const last = advanced[advanced.length - 1];
  assert.ok(last.stage >= 2, `losing both gunwale mounts advances the fight to the last act (bossStage=${last.stage})`);
  assert.equal(advanced.filter((row) => row.cue === 'belly_launch').length > 0, true,
    "the last act announces in the nest's own cue vocabulary");
});

test('DUST P6 (c): the Iron Maw authored [4, 10] edges still resolve the BASE acts', () => {
  const log = driveCapital({ edges: [4, 10] });
  assert.equal(log[0].range, BASE_STAGES[0].preferredRange,
    'the mission-gated dreadnought keeps its base choreography untouched');
});

// ═══ (d) determinism ══════════════════════════════════════════════════════════════════════

test('DUST P6 (d): same seed ⇒ identical mind decision sequences for a sampled wing', () => {
  const first = flyWing({ doctrine: 'swarm_pack', seed: 777, seconds: 45 });
  const second = flyWing({ doctrine: 'swarm_pack', seed: 777, seconds: 45 });
  const strip = (memory) => memory.events.map((e) => `${e.simTime.toFixed(4)}|${e.entityId}|${e.serial}|${e.verb}|${e.phase}|${e.reason}`);
  assert.deepEqual(strip(second), strip(first));
  assert.ok(strip(first).length > 100, 'the sampled sequence is long enough to be a real determinism proof');
});

test('DUST P6 (d): same inputs ⇒ identical boss phase sequences', () => {
  const strip = (log) => log.map((row) => `${row.phase}@${row.range}/s${row.stage}`).join(';');
  const a = driveCapital({ edges: [1, 3], turretsLost: 3, loseAt: 150 });
  const b = driveCapital({ edges: [1, 3], turretsLost: 3, loseAt: 150 });
  assert.deepEqual(strip(b), strip(a));
});
