// NXB-017 — the three-round act (waves 25–27, 'mooring_line').
//
// The packet's three acceptance asks, pinned against the real plan output:
//   1. Each round has a different describable physical decision, not a different enemy count.
//   2. Starter-compatible and contrasting builds finish the segment — nothing in the act makes
//      a draft result mandatory (the quota, concurrency and draft law stay the wave's own).
//   3. Phases terminate correctly if key bodies resolve early — staged act bodies ride the
//      cohort contract (owed via `staged`, inside the kill target, pending blocks the clear).
//
// Plus the children's pinned seams: NXI-065 (a useful opening lane survives the recipe),
// NXI-066 (an over-budget or illegal authored act is rejected), NXI-067 (the round names its
// question without prescribing the answer), NXI-068 (the specialist's staged introduction
// never reprises on later waves).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { SPAWN_BUDGET_DEFAULT_MAX } from '../src/data/survivalActs.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  SWARM_RULESET,
  SWARM_ACT_ID,
  SWARM_ACT_ROUNDS,
  SWARM_FODDER_ROLES,
  swarmActFor,
  swarmActIssues,
  swarmOpeningCount,
} from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';
const MASS_BY_ID = Object.fromEntries(ENEMY_TYPES.map((entry) => [entry.id, entry.mass]));

function swarmPlan(wave, opts = {}) {
  return planWave({ seed: SEED, arenaId: ARENA, wave, mode: SWARM_RULESET, ...opts });
}

function stagedEntries(plan) {
  return plan.schedule.filter((entry) => entry.staged === true);
}

test('the three adjacent swarm slots carry the authored act; neighbours do not', () => {
  const questions = [];
  for (const [wave, round, phase] of [[25, 1, 'loose_plate'], [26, 2, 'furnace_active'], [27, 3, 'shutter_slow']]) {
    const plan = swarmPlan(wave);
    assert.ok(!plan.error, `wave ${wave} plans clean`);
    assert.equal(plan.swarm.act.id, SWARM_ACT_ID);
    assert.equal(plan.swarm.act.round, round);
    assert.equal(plan.swarm.act.rounds, SWARM_ACT_ROUNDS);
    // The act table owns the room — the authored phase is what the plan carries.
    assert.equal(plan.arenaPhase, phase);
    // NXI-067 — each round names a different question: a describable physical decision,
    // never a restated enemy count.
    assert.equal(typeof plan.swarm.act.question, 'string');
    assert.ok(plan.swarm.act.question.length > 20, `wave ${wave} names its question`);
    questions.push(plan.swarm.act.question);
  }
  assert.equal(new Set(questions).size, 3, 'each round asks a different question');
  for (const wave of [23, 24, 28, 29]) {
    const plan = swarmPlan(wave);
    assert.ok(!plan.error);
    assert.equal(plan.swarm.act, undefined, `wave ${wave} stays a generated wave`);
  }
});

test('round 1 (wave 25): loose mass against an exposed hull', () => {
  const plan = swarmPlan(25);
  const opening = plan.packages.filter((pkg) => pkg.staged !== true);
  // The opening is ammunition: every unstaged group fields a light-pursuer role.
  for (const pkg of opening) {
    assert.ok(SWARM_FODDER_ROLES.includes(pkg.role), `${pkg.enemyId} opens as loose-mass fodder`);
  }
  // The exposed target arrives alone, a readable beat later, on a bearing the burst does not use.
  const staged = plan.packages.filter((pkg) => pkg.staged === true);
  assert.equal(staged.length, 1);
  assert.equal(staged[0].enemyId, 'bruiser_brawler');
  assert.equal(staged[0].count, 1, 'the exposed hull is alone — no escort, no screen');
  assert.ok(staged[0].atTick > Math.max(...opening.map((pkg) => pkg.atTick)),
    'the exposed hull lands after the ammunition is already on the board');
  assert.ok(!opening.some((pkg) => pkg.gateGroup === staged[0].gateGroup),
    'the exposed hull takes a bearing the opening burst does not crowd');
  assert.ok(MASS_BY_ID.bruiser_brawler >= 70, 'the exposed hull is too heavy to shove — mass is the lever');
});

test('round 2 (wave 26): one specialist contests the use, staged like a debut', () => {
  const plan = swarmPlan(26);
  const staged = plan.packages.filter((pkg) => pkg.staged === true);
  assert.equal(staged.length, 1);
  assert.equal(staged[0].enemyId, 'tether_control_raider');
  assert.equal(staged[0].count, 1, 'the contest is one readable silhouette, not a pack');
  const opening = plan.packages.filter((pkg) => pkg.staged !== true);
  assert.ok(!opening.some((pkg) => pkg.gateGroup === staged[0].gateGroup),
    'the specialist gets its own bearing — the staged tell reads like a debut');
  // Loose mass is still on the board — the specialist contests a use the player actually has.
  assert.ok(opening.some((pkg) => SWARM_FODDER_ROLES.includes(pkg.role)));
});

test('round 3 (wave 27): heavy anchor plus the specialist on one bearing', () => {
  const plan = swarmPlan(27);
  const staged = plan.packages.filter((pkg) => pkg.staged === true);
  const anchor = staged.find((pkg) => pkg.enemyId === 'field_anchor_controller');
  const specialist = staged.find((pkg) => pkg.enemyId === 'tether_control_raider');
  assert.ok(anchor, 'the heavy anchor returns');
  assert.ok(specialist, 'the round-2 specialist returns under combined pressure');
  assert.equal(anchor.gateGroup, specialist.gateGroup, 'the pair arrives as one event');
  assert.equal(anchor.atTick, specialist.atTick);
  assert.ok(MASS_BY_ID.field_anchor_controller >= 150, 'the anchor is real heavy terrain');
});

test('the act stays inside the wave contracts — budgets, quota, draft interval', () => {
  for (const wave of [25, 26, 27]) {
    const plan = swarmPlan(wave);
    assert.ok(swarmOpeningCount(plan.packages) <= SPAWN_BUDGET_DEFAULT_MAX,
      `wave ${wave} burst inside the shared spawn budget`);
    // The act rewrote the recipe, not the rules: same finite cohort, same concurrency, same
    // authored quota the wave number always carried.
    assert.equal(plan.completionRules.kind, 'cohort');
    assert.equal(plan.swarm.killTarget, 48);
    assert.equal(plan.swarm.concurrent, 30);
    // One genuine recovery interval between rounds — the armory interval is preserved.
    assert.equal(plan.draftExpectation.kind, 'draft');
  }
});

test('staged act bodies ride the owed-body law — early kills cannot strand the wave', () => {
  // Acceptance 3: the counterexample is termination honesty. A staged body that the spawn
  // budget refused must be re-queued, not dropped — so the flag reaches the schedule entry
  // survivalWave.js owes, and the wave still cannot clear on pending work.
  for (const wave of [25, 26, 27]) {
    const plan = swarmPlan(wave);
    const staged = stagedEntries(plan);
    assert.ok(staged.length >= 1, `wave ${wave} stages at least one owed body`);
    for (const entry of staged) {
      assert.ok(entry.atTick > 0, 'staged bodies arrive after the burst, not inside it');
    }
    assert.equal(plan.completionRules.requiredPackagesMaterialized, true,
      'the wave owes every scheduled body — a key kill early is a kill, not a skip');
  }
});

test('NXI-065 — every act round keeps a useful opening lane', () => {
  for (const wave of [25, 26, 27]) {
    const plan = swarmPlan(wave);
    const used = new Set(plan.packages.map((pkg) => pkg.gateGroup));
    assert.ok(used.size >= 2, `wave ${wave} does not stack its whole opening on one bearing`);
    assert.ok(used.size < 8, `wave ${wave} leaves at least one gate free — the lane survives`);
  }
});

test('NXI-066 — a dishonest act spec is rejected before it plans', () => {
  const overBudget = {
    id: SWARM_ACT_ID, round: 1,
    packages: [{ enemyId: 'wasp_swarmer', count: SPAWN_BUDGET_DEFAULT_MAX + 1, gateIndex: 0, atTick: 0 }],
  };
  assert.ok(swarmActIssues(25, overBudget).some((issue) => /exceeds budget/.test(issue.message)));

  const earlyDebut = {
    id: SWARM_ACT_ID, round: 1,
    packages: [{ enemyId: 'field_anchor_controller', count: 1, gateIndex: 0, atTick: 0 }],
  };
  assert.ok(swarmActIssues(16, earlyDebut).some((issue) => /before its wave/.test(issue.message)),
    'a body the wave has not unlocked cannot be authored in');

  // `gate: 'free'` sweeps every bearing — eight of them block the whole ring on any wave
  // (a wave-26 ring walk alone only reaches four).
  const everyGate = {
    id: SWARM_ACT_ID, round: 1,
    packages: Array.from({ length: 8 }, () => (
      { enemyId: 'wasp_swarmer', count: 1, gate: 'free', atTick: 0 }
    )),
  };
  assert.ok(swarmActIssues(26, everyGate).some((issue) => /every gate/.test(issue.message)),
    'blocking all eight gates leaves no opening lane');

  // The shipped table is honest — the planner's own gate agrees.
  for (const wave of [25, 26, 27]) assert.deepEqual(swarmActIssues(wave), []);
});

test('NXI-068 — the specialist introduction never reprises on a later wave', () => {
  // After the act, the tether raider is ordinary roster stock: later waves field it through
  // the stream with no staged tell, no banner, no second introduction.
  for (const wave of [28, 29, 30, 40]) {
    const plan = swarmPlan(wave);
    assert.ok(!plan.error);
    const reprise = plan.packages.filter((pkg) => pkg.enemyId === 'tether_control_raider' && pkg.staged === true);
    assert.equal(reprise.length, 0, `wave ${wave} never re-stages the specialist's tell`);
    assert.equal(plan.swarm.act, undefined);
  }
});

test('the mutator owns the room — heavies_only suppresses the act outright', () => {
  const plan = swarmPlan(26, { mutators: ['heavies_only'] });
  assert.ok(!plan.error);
  assert.equal(plan.swarm.act, undefined, 'an authored composition cannot survive a room the mutator owns');
  assert.ok(plan.packages.every((pkg) => pkg.enemyId !== 'wasp_swarmer'));
});

test('build pressure still outranks the act stream bend', () => {
  const plan = swarmPlan(26, { buildSummary: { dominant: 'collision' } });
  assert.ok(!plan.error);
  assert.equal(plan.swarm.buildPressure, 'collision');
  assert.equal(plan.swarm.pressureLine, 'The pack brought anchors for the rope.');
  // The act still lands its authored opening and question — only the stream's bias yields.
  assert.equal(plan.swarm.act.round, 2);
  assert.ok(plan.packages.some((pkg) => pkg.enemyId === 'tether_control_raider'));
});

test('the opening line names the round question inside the wave banner', () => {
  const plan = swarmPlan(25);
  const line = waveOpeningLine(25, plan);
  assert.ok(line.includes(plan.swarm.act.question), `banner carries the round's question: ${line}`);
  assert.ok(line.includes('Wave 25.'));
  const plain = swarmPlan(28);
  assert.ok(!waveOpeningLine(28, plain).includes('mooring'), 'ordinary waves carry no act line');
});
