// NXB-017 — the three-round act (waves 26–28, 'mooring_line').
//
// C01-04 supersedes this act's authored slots: the course cast now owns every round inside
// the thirty, so waves 26–28 field The Umbrella Again / Tailgate / Black Friday — the named
// casts — instead of the act's lesson recipes. The act machinery is unchanged and still
// fields the second act ('breaker_yard', waves 32–34; see lwf-breaker-yard-act.test.mjs for
// its full contract). The mooring_line table rows stay in the data for the record and must
// still pass the honesty validator.
//
// What this file now pins:
//   1. The supersession itself — no act rides waves 26–28, the dealt phase token returns,
//      and the opening banner names the course round instead of the act's question.
//   2. The cast the course names on those exact waves (the umbrella pair, the tailgating
//      heavy, one of every sheet id) — pinned at the plan seam.
//   3. The act validator's negative controls, which still guard the rows kept on record.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { SPAWN_BUDGET_DEFAULT_MAX } from '../src/data/survivalActs.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SWARM_CHARACTER_SHEET } from '../src/data/swarmCharacter.js';
import {
  SWARM_RULESET,
  SWARM_ACT_ID,
  SWARM_ACT_BREAKER_YARD_ID,
  swarmActFor,
  swarmActIssues,
  swarmArenaPhase,
  swarmOpeningCount,
} from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';
const SHEET_IDS = new Set(SWARM_CHARACTER_SHEET.map((entry) => entry.enemyId));
const MASS_BY_ID = Object.fromEntries(ENEMY_TYPES.map((entry) => [entry.id, entry.mass]));

function swarmPlan(wave, opts = {}) {
  return planWave({ seed: SEED, arenaId: ARENA, wave, mode: SWARM_RULESET, ...opts });
}

test('the course cast owns waves 26-28 — the mooring_line act fields nowhere', () => {
  for (const wave of [26, 27, 28]) {
    const plan = swarmPlan(wave);
    assert.ok(!plan.error, `wave ${wave} plans clean`);
    assert.equal(swarmActFor(wave), null, `wave ${wave}: the act yields to the cast`);
    assert.equal(plan.swarm.act, undefined, `wave ${wave} carries no act on the plan`);
    // The act's authored rooms ('loose_plate', and the offset furnace/shutter deals) no
    // longer ride either — the ordinary phase cycle deals these waves' rooms.
    assert.equal(plan.arenaPhase, swarmArenaPhase(wave), `wave ${wave} wears the dealt token`);
    // The wave's own contracts are untouched: finite cohort, authored quota, draft stop.
    assert.equal(plan.completionRules.kind, 'cohort');
    assert.equal(plan.swarm.killTarget, 48);
    assert.equal(plan.swarm.concurrent, 30);
    assert.equal(plan.draftExpectation.kind, 'draft');
    assert.ok(swarmOpeningCount(plan.packages) <= SPAWN_BUDGET_DEFAULT_MAX,
      `wave ${wave} burst inside the shared spawn budget`);
  }
  // The second act survives untouched past the course's win.
  for (const wave of [32, 33, 34]) {
    const act = swarmActFor(wave);
    assert.equal(act && act.id, SWARM_ACT_BREAKER_YARD_ID, `wave ${wave} keeps breaker_yard`);
    assert.ok(swarmPlan(wave).swarm.act, `wave ${wave} still carries its act on the plan`);
  }
});

test('round 26 (The Umbrella, Again): two Wardens covering each other', () => {
  const plan = swarmPlan(26);
  const wardens = plan.packages.filter((pkg) => pkg.enemyId === 'warden_escort');
  assert.equal(wardens.length, 1, 'the pair is one package, one event — not two arrivals');
  assert.equal(wardens[0].count, 2, 'two Wardens, shoulder to shoulder by count');
  assert.equal(wardens[0].atTick, 0, 'the umbrella opens with the round');
  // Each dome is the other's ward: the pair shares a single bearing.
  const gunners = plan.packages.filter((pkg) => pkg.enemyId === 'lancer_sniper');
  assert.ok(gunners.length >= 2, 'the wardens cover a real gunner line');
  assert.ok(gunners.some((pkg) => pkg.gateGroup === wardens[0].gateGroup),
    'the pair rides in over its own gunners — the cover reads from the gate');
});

test('round 27 (Tailgate): one staged heavy rides its own bearing', () => {
  const plan = swarmPlan(27);
  const staged = plan.packages.filter((pkg) => pkg.staged === true);
  assert.equal(staged.length, 1);
  assert.equal(staged[0].enemyId, 'bruiser_brawler', 'the tailgating heavy is the Brawler');
  assert.equal(staged[0].count, 1, 'one readable silhouette, not a pack');
  const opening = plan.packages.filter((pkg) => pkg !== staged[0]);
  assert.ok(!opening.some((pkg) => pkg.gateGroup === staged[0].gateGroup),
    'the heavy takes a bearing the freight does not crowd');
  assert.ok(MASS_BY_ID.bruiser_brawler >= 70, 'the rider is too heavy to shove — mass is the point');
});

test('round 28 (Black Friday): every enemy type in the sheet fields at once', () => {
  const plan = swarmPlan(28);
  const fielded = new Set(plan.packages.map((pkg) => pkg.enemyId));
  for (const id of SHEET_IDS) assert.ok(fielded.has(id), `${id} is in the crowd`);
  // The whole crowd arrives as one event — two ticks, no staged lecture.
  assert.deepEqual([...new Set(plan.packages.map((pkg) => pkg.atTick))].sort((a, b) => a - b), [0, 12]);
  assert.ok(plan.packages.every((pkg) => pkg.staged !== true),
    'nobody gets a staged tell — every drop lands together');
  // The act's r3 specialist is just another shopper now: tether_control_raider fields
  // once, unstaged, with the rest.
  const raider = plan.packages.find((pkg) => pkg.enemyId === 'tether_control_raider');
  assert.equal(raider.staged, undefined, 'the act specialist never reprises its staged tell');
});

test('the act table rows stay honest on record, and the validator still bites', () => {
  // The superseded rows remain in SWARM_ACT for the record — they must still satisfy the
  // same honesty rules a live act would.
  for (const wave of [26, 27, 28]) {
    const issues = swarmActIssues(wave);
    assert.deepEqual(issues, [], `recorded act wave ${wave} stays validator-clean`);
  }
  // NXI-066 negative controls still fire — a dishonest spec is rejected wherever it names.
  const overBudget = {
    id: SWARM_ACT_ID, round: 1,
    packages: [{ enemyId: 'wasp_swarmer', count: SPAWN_BUDGET_DEFAULT_MAX + 1, gateIndex: 0, atTick: 0 }],
  };
  assert.ok(swarmActIssues(26, overBudget).some((issue) => /exceeds budget/.test(issue.message)));
  const earlyDebut = {
    id: SWARM_ACT_ID, round: 1,
    packages: [{ enemyId: 'field_anchor_controller', count: 1, gateIndex: 0, atTick: 0 }],
  };
  assert.ok(swarmActIssues(16, earlyDebut).some((issue) => /before its wave/.test(issue.message)),
    'a body the wave has not unlocked cannot be authored in');
});

test('the opening banner names the course round, not a question', () => {
  const plan = swarmPlan(26);
  const line = waveOpeningLine(26, plan);
  assert.ok(line.includes('ROUND 26 — The Umbrella, Again.'), `banner names the course: ${line}`);
  assert.ok(!line.includes('mooring') && !line.includes('loose rock'),
    `no act question survives on the cast round: ${line}`);
  // An act that still fields still names its question — the seam is intact where it lives.
  const actLine = waveOpeningLine(32, swarmPlan(32));
  assert.ok(actLine.includes(swarmActFor(32).question), `act banner intact: ${actLine}`);
});

test('the mutator owns the room — heavies_only suppresses the cast outright', () => {
  const plan = swarmPlan(27, { mutators: ['heavies_only'] });
  assert.ok(!plan.error);
  assert.equal(plan.swarm.act, undefined);
  assert.ok(plan.packages.every((pkg) => pkg.enemyId !== 'wasp_swarmer'));
});
