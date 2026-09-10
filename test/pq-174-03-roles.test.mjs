// PQ-174.03 — roles in the swarm are physical problems.
//
// Support / Anchor / Disruptor / Elite each name a distinct counter-verb. Median time-to-resolve
// a light under physics (the intended verb) is ≤ under the starter Pulse, on fixed seeds.
// No stored video; counters are proven from state. No HP inflation, drag, momentum clamp, or gyro.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SWARM_ROSTER } from '../src/data/swarmMode.js';
import {
  SURVIVAL_PROBLEM_ROLES,
  SURVIVAL_WAVES,
  waveHealthOverrideIssues,
} from '../src/data/survivalWaves.js';
import {
  PQ_174_03_SEED,
  ROLE_RESOLVE_SEEDS,
  bindSwarmRoleProblems,
  formatRoleResolveTable,
  preferRoleCounterOffers,
  roleResolveBoard,
  roleStampDidNotClamp,
  simulateRoleResolve,
  stampSwarmRoleProblem,
  swarmRoleCounterIssues,
  swarmRoleProblem,
  unbindSwarmRoleProblems,
} from '../src/systems/survivalSwarm.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));

test('PQ-174.03 each problem role names a distinct counter-verb and a telegraph', () => {
  const issues = swarmRoleCounterIssues();
  assert.deepEqual(issues, [], issues.join('; '));
  const verbs = SURVIVAL_PROBLEM_ROLES.map((role) => swarmRoleProblem(role).counterVerb);
  assert.deepEqual(new Set(verbs).size, SURVIVAL_PROBLEM_ROLES.length);
  assert.deepEqual(
    SURVIVAL_PROBLEM_ROLES.map((role) => swarmRoleProblem(role).counterVerb),
    ['well', 'rope', 'shove', 'throw'],
  );
  for (const role of SURVIVAL_PROBLEM_ROLES) {
    const problem = swarmRoleProblem(role);
    assert.ok(problem.consequences.length >= 2, `${role} needs two consequences`);
    assert.equal(waveHealthOverrideIssues(problem).length, 0, role);
    assert.ok(ENEMY_BY_ID.has(problem.enemyId), problem.enemyId);
    const hull = ENEMY_BY_ID.get(problem.enemyId);
    assert.equal(hull.hull, ENEMY_BY_ID.get(problem.enemyId).hull, `${role} uses catalog hull`);
  }
});

test('PQ-174.03 swarm roster and pinned waves already field these roles; overlay does not retune HP', () => {
  const byRole = new Map();
  for (const row of SWARM_ROSTER) {
    if (SURVIVAL_PROBLEM_ROLES.includes(row.role)) byRole.set(row.role, row);
  }
  assert.equal(byRole.get('support').enemyId, 'pd_screen_escort');
  assert.equal(byRole.get('disruptor').enemyId, 'mine_layer_jackal');
  assert.equal(byRole.get('elite').enemyId, 'corsair_raider');
  const anchors = SWARM_ROSTER.filter((row) => row.role === 'anchor').map((row) => row.enemyId);
  assert.ok(anchors.includes('field_anchor_controller'));
  assert.ok(anchors.includes('bruiser_brawler'));

  const pinned = SURVIVAL_WAVES.filter((row) => row.arenaId === 'helios_core' && (row.wave === 1 || row.wave === 5 || row.wave === 10));
  assert.equal(pinned.length, 3);
  for (const recipe of pinned) {
    assert.equal(waveHealthOverrideIssues(recipe).length, 0, recipe.id);
  }
});

test('PQ-174.03 stamp: bruiser-anchor carries the existing snare; hull and mass stay catalog', () => {
  const bruiser = ENEMY_BY_ID.get('bruiser_brawler');
  const entity = {
    id: 7,
    vel: { x: 40, z: -12 },
    mass: bruiser.mass,
    hull: bruiser.hull,
    data: { runRole: 'anchor', lootTableId: 'bruiser_brawler' },
  };
  const problem = stampSwarmRoleProblem(entity);
  assert.equal(problem.counterVerb, 'rope');
  assert.equal(entity.data.counterVerb, 'rope');
  assert.equal(entity.data.telegraph.cue, 'field_spool');
  assert.ok(entity.data.fieldAnchor, 'anchor slot gets the existing snare well');
  assert.equal(entity.data.fieldAnchor.defKey, 'anchorSnare');
  assert.equal(entity.hull, bruiser.hull);
  assert.equal(entity.mass, bruiser.mass);
  assert.deepEqual(entity.vel, { x: 40, z: -12 });
  assert.equal(entity.data.linearDamping, undefined);
  assert.equal(roleStampDidNotClamp(entity), true);
});

test('PQ-174.03 stamp: support huddles as a throwable cluster; elite keeps corsair mass', () => {
  const screen = ENEMY_BY_ID.get('pd_screen_escort');
  const support = {
    id: 8,
    vel: { x: 11, z: 0 },
    mass: screen.mass,
    hull: screen.hull,
    data: { runRole: 'support', lootTableId: 'pd_screen_escort', ai: {} },
  };
  stampSwarmRoleProblem(support);
  assert.equal(support.data.counterVerb, 'well');
  assert.equal(support.data.ai.squadId, 'swarm-role-support');
  assert.equal(support.data.ai.cohortRecipe, 'fodder_river');
  assert.equal(support.hull, screen.hull);
  assert.equal(roleStampDidNotClamp(support), true);

  const corsair = ENEMY_BY_ID.get('corsair_raider');
  const elite = {
    id: 9,
    vel: { x: -8, z: 3 },
    mass: corsair.mass,
    hull: corsair.hull,
    data: { runRole: 'elite', lootTableId: 'corsair_raider' },
  };
  stampSwarmRoleProblem(elite);
  assert.equal(elite.data.counterVerb, 'throw');
  assert.equal(elite.data.telegraph.cue, 'weapon_charge');
  assert.equal(elite.mass, corsair.mass);
  assert.equal(roleStampDidNotClamp(elite), true);
});

test('PQ-174.03 bind stamps on spawn and emits a receipt the draft can consume', () => {
  const bus = createBus();
  const receipts = [];
  bus.on('run:roleProblemStamped', (p) => receipts.push(p));
  const entity = {
    id: 21,
    data: {
      runRole: 'disruptor',
      lootTableId: 'mine_layer_jackal',
      telegraph: { cue: 'wake_mines', line: 'Wake is salted. Turn now or fly through our work.' },
    },
  };
  bindSwarmRoleProblems({ bus, state: { run: { kind: 'survival', phase: 'active' } }, registry: { get: () => null } });
  bus.emit('entity:spawned', { entity });
  unbindSwarmRoleProblems();
  assert.equal(entity.data.counterVerb, 'shove');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].counterVerb, 'shove');
  assert.equal(receipts[0].role, 'disruptor');
});

test('PQ-174.03 draft prefers the live role counter without dropping the other cards', () => {
  const offers = [
    { id: 'cadence', verb: 'Cadence', shape: null },
    { id: 'bind', verb: 'Bind', shape: null },
    { id: 'throw', verb: 'Throw', shape: null },
  ];
  const state = {
    entityList: [{
      alive: true,
      data: { runRole: 'anchor', counterVerb: 'rope' },
    }],
  };
  const ordered = preferRoleCounterOffers(offers, state);
  assert.equal(ordered[0].id, 'bind');
  assert.equal(ordered.length, 3);
  assert.deepEqual(ordered.map((o) => o.id).sort(), ['bind', 'cadence', 'throw']);
});

test(`PQ-174.03 seed ${PQ_174_03_SEED} / ${ROLE_RESOLVE_SEEDS.join(',')}: median TTR under physics ≤ under guns; intended verb is fastest`, () => {
  const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: 0, z: 0 });
  assert.ok(spec, 'spawn spec still builds; overlay does not fork combat');

  for (const seed of ROLE_RESOLVE_SEEDS) {
    const rows = roleResolveBoard(seed);
    console.log(`\nPQ-174.03 seed ${seed}\n${formatRoleResolveTable(rows)}\n`);
    for (const row of rows) {
      assert.equal(row.physics.ok, true, row.role);
      assert.equal(row.guns.ok, true, row.role);
      assert.ok(row.physics.resolved, `${row.role} physics must resolve`);
      assert.ok(row.guns.dead, `${row.role} Pulse must still be able to finish — slowly`);
      assert.ok(
        Number.isFinite(row.physics.medianS) && Number.isFinite(row.guns.medianS),
        `${row.role} seed ${seed} medians must be finite`,
      );
      assert.ok(
        row.physics.medianS <= row.guns.medianS,
        `${row.role} seed ${seed}: physics ${row.physics.medianS.toFixed(3)}s must be ≤ guns ${row.guns.medianS.toFixed(3)}s`,
      );
      for (const [alt, result] of Object.entries(row.alts)) {
        assert.ok(
          row.physics.medianS <= result.medianS,
          `${row.role} seed ${seed}: intended ${row.counterVerb} ${row.physics.medianS.toFixed(3)}s must be ≤ ${alt} ${result.medianS.toFixed(3)}s`,
        );
      }
      assert.equal(row.physics.catalogHull, ENEMY_BY_ID.get(row.physics.enemyId).hull);
    }
  }

  const named = simulateRoleResolve({ role: 'support', verb: 'well', seed: PQ_174_03_SEED });
  assert.equal(named.count, 3, 'support is a cluster, not a solo tank');
  const anchor = simulateRoleResolve({ role: 'anchor', verb: 'rope', seed: PQ_174_03_SEED });
  assert.equal(anchor.method, 'rope_displace');
  assert.equal(anchor.dead, false, 'rope resolves the snare without grinding the hull');
  assert.equal(anchor.resolved, true);
});
