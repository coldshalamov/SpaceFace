// Counterplay doctrines: pure policy contracts plus held-out arena receipts.
// The arena boots the authoritative runtime. It does not start tacticalAI.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { CombatDoctrineId } from '../../../src/ai/combatDoctrine.js';
import {
  COUNTERPLAY_DOCTRINES,
  COUNTERPLAY_DOCTRINE_IDS,
  createCounterplayMemory,
  decideCounterplay,
  gateCounterplayFire,
  limitKnowledge,
  forgetStaleIdentity,
  restoreCounterplayMemory,
  segmentBlocked,
  serializeCounterplayMemory,
} from '../../../src/ai/counterplay/index.js';
import { runCounterplayScenario, ARENA_SYSTEM_NAMES } from '../run.mjs';
import { demonstrationScene, HELD_OUT_SEEDS } from '../scenes.mjs';
import { runDemonstrations, runTournament, summarizeReceipts } from '../tournament.mjs';

const SHIP_DOCTRINE_IDS = new Set(Object.values(CombatDoctrineId));
const STRONG = [
  'cp_heavy_anchor_grappler',
  'cp_feint_break_courier',
  'cp_rescue_tow',
  'cp_prize_runner',
  'cp_release_orbit_hunter',
  'cp_tether_bait_decoy',
];

test('ten doctrines are distinct from shipped combat doctrines', () => {
  assert.equal(COUNTERPLAY_DOCTRINES.length, 10);
  const telegraphs = new Set();
  const verbs = new Set();
  const pairs = new Set();
  let conditional = 0;
  for (const row of COUNTERPLAY_DOCTRINES) {
    assert.equal(SHIP_DOCTRINE_IDS.has(row.id), false);
    assert.ok(row.counter.length > 20);
    assert.ok(row.telegraphKind);
    assert.ok(row.verbKind);
    assert.ok(row.silhouette.startsWith('ship_'));
    telegraphs.add(row.telegraphKind);
    verbs.add(row.verbKind);
    pairs.add(`${row.silhouette}|${row.telegraphKind}`);
    if (row.goalKind === 'conditional') conditional += 1;
    if (row.fires) {
      assert.equal(row.legalFireDoctrineId, CombatDoctrineId.RANGED_DISENGAGER);
      assert.equal(row.legalFirePhase, 'fire_window');
    } else {
      assert.equal(row.roe, 'hold_fire');
    }
  }
  assert.equal(telegraphs.size, 10);
  assert.equal(verbs.size, 10);
  assert.equal(pairs.size, 10);
  assert.ok(conditional >= 3);
});

test('knowledge limits drop range, rocks, delay, and recycled ids', () => {
  const doctrine = COUNTERPLAY_DOCTRINES.find((row) => row.id === 'cp_collateral_hold');
  const memory = createCounterplayMemory(doctrine.id);
  const self = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, team: 1, alive: true, hull: 10, shield: 0 };
  const far = { id: 2, role: 'player', team: 0, pos: { x: doctrine.sensorRange + 50, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, alive: true };
  const hidden = { id: 3, role: 'player', team: 0, pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, alive: true };
  const rock = { id: 9, role: 'cover', pos: { x: 40, z: 0 }, radius: 20, alive: true };
  assert.equal(segmentBlocked(self.pos, hidden.pos, [rock], 0), true);
  const sensed = limitKnowledge({
    self,
    contacts: [far, hidden],
    obstacles: [rock],
    tethers: [],
  }, doctrine, memory, 0);
  assert.equal(sensed.contacts.length, 0);
  let later = sensed;
  for (let tick = 1; tick <= doctrine.reactionDelayTicks + 1; tick += 1) {
    later = limitKnowledge({
      self,
      contacts: [{ id: 4, role: 'player', team: 0, pos: { x: 30, z: 10 }, vel: { x: 0, z: 0 }, radius: 8, alive: true, generation: 1 }],
      obstacles: [],
      tethers: [],
    }, doctrine, memory, tick);
  }
  assert.equal(later.contacts.length, 1);
  assert.equal(later.contacts[0].id, 4);
  memory.commit = { id: 'x', targetId: 4, targetGeneration: 1, untilTick: 99, snapshot: {} };
  const cleared = forgetStaleIdentity(memory, {
    tick: 20,
    contacts: [{ id: 4, generation: 2, role: 'player', pos: { x: 1, z: 1 }, alive: true }],
  });
  assert.equal(cleared, true);
  assert.equal(memory.commit, null);
  assert.equal(memory.phase, 'fallback');
});

test('bad init, destruction, and civilians do not produce an attack', () => {
  const missing = decideCounterplay({
    doctrineId: 'cp_collateral_hold',
    tick: 0,
    memory: createCounterplayMemory('cp_collateral_hold'),
    self: null,
  });
  assert.equal(missing.attack, null);
  assert.equal(missing.fallback, 'no_self');
  const dead = decideCounterplay({
    doctrineId: 'cp_collateral_hold',
    tick: 1,
    memory: createCounterplayMemory('cp_collateral_hold'),
    self: { id: 1, pos: { x: 0, z: 0 }, alive: false, team: 1 },
  });
  assert.equal(dead.attack, null);
  assert.equal(dead.phase, 'done');
  const civilianOnly = decideCounterplay({
    doctrineId: 'cp_collateral_hold',
    tick: 40,
    memory: createCounterplayMemory('cp_collateral_hold'),
    self: { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, team: 1, alive: true, hull: 40, shield: 10 },
    contacts: [{ id: 8, role: 'civilian', team: 2, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, alive: true, generation: 1 }],
    objective: { player: { x: 80, z: 0 } },
  });
  assert.equal(civilianOnly.attack, null);
  const nonFiring = decideCounterplay({
    doctrineId: 'cp_prize_runner',
    tick: 80,
    memory: createCounterplayMemory('cp_prize_runner'),
    self: { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, team: 1, alive: true, hull: 20, shield: 0 },
    contacts: [{ id: 2, role: 'player', team: 0, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, alive: true, generation: 1 }],
  });
  assert.equal(nonFiring.attack, null);
});

test('a stalled doctrine disengages instead of looping', () => {
  const memory = createCounterplayMemory('cp_heavy_anchor_grappler');
  let phase = '';
  for (let tick = 0; tick < 340; tick += 1) {
    const decision = decideCounterplay({
      doctrineId: 'cp_heavy_anchor_grappler',
      tick,
      memory,
      self: { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, team: 1, alive: true, hull: 10, shield: 0 },
      objective: {},
    });
    phase = decision.phase;
  }
  assert.ok(phase === 'disengage' || phase === 'done', phase);
});

test('memory reload is byte-stable and keeps the next decision', () => {
  const memory = createCounterplayMemory('cp_rescue_tow');
  const self = { id: 3, pos: { x: 10, z: 4 }, vel: { x: 1, z: 0 }, rot: 0.2, team: 1, alive: true, hull: 30, shield: 5 };
  const objective = { patient: { x: 40, z: 4 }, gate: { x: 180, z: 4 } };
  decideCounterplay({ doctrineId: 'cp_rescue_tow', tick: 12, memory, self, objective });
  const restored = restoreCounterplayMemory(serializeCounterplayMemory(memory), 'cp_rescue_tow');
  const a = decideCounterplay({ doctrineId: 'cp_rescue_tow', tick: 13, memory, self, objective });
  const b = decideCounterplay({ doctrineId: 'cp_rescue_tow', tick: 13, memory: restored, self, objective });
  assert.equal(a.phase, b.phase);
  assert.equal(a.explain, b.explain);
  assert.equal(JSON.stringify(a.maneuver), JSON.stringify(b.maneuver));
});

test('non-firing doctrines are refused before engagement authority', () => {
  const gate = gateCounterplayFire({
    state: {},
    self: { id: 1 },
    target: { id: 2 },
    decision: {
      doctrineId: 'cp_rescue_tow',
      attack: { wantFire: true, targetId: 2, targetRole: 'player' },
    },
    tick: 10,
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'doctrine_does_not_fire');
});

test('worker lane matches the main-thread decision', async () => {
  const input = {
    doctrineId: 'cp_feint_break_courier',
    tick: 4,
    memory: createCounterplayMemory('cp_feint_break_courier'),
    self: { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, team: 1, alive: true, hull: 20, shield: 0 },
    contacts: [],
    obstacles: [],
    tethers: [],
    objective: { feint: { x: 80, z: 40 }, gate: { x: 0, z: 160 } },
  };
  const local = decideCounterplay(structuredClone(input));
  const worker = new Worker(new URL('../worker-parity.mjs', import.meta.url));
  const remote = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage(input);
  });
  await worker.terminate();
  assert.equal(remote.decision.phase, local.phase);
  assert.equal(remote.decision.explain, local.explain);
  assert.equal(JSON.stringify(remote.decision.maneuver), JSON.stringify(local.maneuver));
});

test('a decision stays inside a fraction of a millisecond', () => {
  const memory = createCounterplayMemory('cp_release_orbit_hunter');
  const self = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, team: 1, alive: true, hull: 20, shield: 0 };
  const objective = { anchor: { x: 40, z: 0 }, standoff: { x: 10, z: 30 } };
  for (let tick = 0; tick < 30; tick += 1) {
    decideCounterplay({ doctrineId: 'cp_release_orbit_hunter', tick, memory, self, objective });
  }
  const started = performance.now();
  const n = 800;
  for (let i = 0; i < n; i += 1) {
    decideCounterplay({
      doctrineId: 'cp_release_orbit_hunter',
      tick: 30 + i,
      memory,
      self,
      objective,
      contacts: [{ id: 5, role: 'orbit_body', pos: { x: 40, z: 20 }, vel: { x: 0, z: 10 }, radius: 8, alive: true, generation: 1 }],
    });
  }
  const per = (performance.now() - started) / n;
  assert.ok(per < 0.5, `decide averaged ${per.toFixed(3)} ms`);
});

test('held-out arena separates counters and stays on the real physics', async () => {
  const demos = await runDemonstrations({ seeds: HELD_OUT_SEEDS });
  const matrix = await runTournament({
    seeds: [HELD_OUT_SEEDS[0]],
    pilots: ['close_booster', 'evasive'],
    masses: ['light', 'heavy'],
    ranges: ['close', 'far'],
    terrains: ['open', 'cover'],
    ticks: 80,
  });
  mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/held-out.json', import.meta.url), JSON.stringify({
    seeds: HELD_OUT_SEEDS,
    demonstrations: demos,
    tournamentSummary: summarizeReceipts(matrix),
    tournamentRuns: matrix.length,
  }, null, 2));

  const grouped = new Map();
  for (const receipt of demos) {
    const slot = grouped.get(receipt.doctrineId) || { resists: [], counter: [] };
    slot[receipt.tape === 'counter' ? 'counter' : 'resists'].push(receipt);
    grouped.set(receipt.doctrineId, slot);
  }
  assert.equal(grouped.size, 10);
  for (const id of COUNTERPLAY_DOCTRINE_IDS) {
    const slot = grouped.get(id);
    assert.equal(slot.resists.length, HELD_OUT_SEEDS.length);
    assert.equal(slot.counter.length, HELD_OUT_SEEDS.length);
    for (const receipt of slot.resists.concat(slot.counter)) {
      assert.equal(receipt.sg02Ready, true, id);
      assert.equal(receipt.physicsBackend, 'rapier-dynamic');
      assert.equal(receipt.unexpectedFire, 0, id);
      assert.equal(receipt.tacticalAI, false);
      assert.deepEqual(receipt.systems, [...ARENA_SYSTEM_NAMES]);
    }
  }
  for (const id of STRONG) {
    const slot = grouped.get(id);
    for (let i = 0; i < HELD_OUT_SEEDS.length; i += 1) {
      assert.ok(
        slot.resists[i].goalProgress > slot.counter[i].goalProgress + 0.25,
        `${id} seed ${HELD_OUT_SEEDS[i]} resists ${slot.resists[i].goalProgress} counter ${slot.counter[i].goalProgress}`,
      );
      assert.ok(slot.resists[i].telegraphTicks >= 30, id);
    }
  }
  const mechanic = grouped.get('cp_field_mechanic');
  const mechanicWins = mechanic.resists.filter((row, i) => row.goalProgress > mechanic.counter[i].goalProgress + 0.25).length;
  assert.ok(mechanicWins >= 2, `mechanic counter held on ${mechanicWins} seeds`);
  assert.ok(mechanic.resists.every((row) => row.telegraphTicks >= 30));
  const cover = grouped.get('cp_cover_peel');
  for (let i = 0; i < HELD_OUT_SEEDS.length; i += 1) {
    assert.ok(cover.resists[i].fireAuthorized > cover.counter[i].fireAuthorized);
    assert.ok(cover.resists[i].telegraphTicks >= 30);
    assert.equal(cover.counter[i].fireAuthorized, 0);
  }
  const corridor = grouped.get('cp_corridor_pack_leader');
  assert.ok(corridor.resists.every((row) => row.telegraphTicks >= 30 && row.goalProgress > 0.5));
  assert.ok(corridor.counter.every((row, i) => row.detail.exitDist > corridor.resists[i].detail.exitDist + 40));
  const collateralDamage = grouped.get('cp_collateral_hold');
  for (let i = 0; i < HELD_OUT_SEEDS.length; i += 1) {
    assert.ok(collateralDamage.resists[i].playerDamage > collateralDamage.counter[i].playerDamage);
  }
  const grappler = grouped.get('cp_heavy_anchor_grappler');
  for (const row of grappler.resists) {
    assert.ok(row.detail.anchorTicks > 40, JSON.stringify(row.detail));
    assert.ok(row.detail.minFlank <= row.detail.flankRadius, JSON.stringify(row.detail));
  }
  for (const id of ['cp_feint_break_courier', 'cp_corridor_pack_leader', 'cp_collateral_hold', 'cp_cover_peel', 'cp_heavy_anchor_grappler']) {
    const poses = HELD_OUT_SEEDS.map((seed) => grouped.get(id).resists.find((row) => row.seed === seed).end.opponent);
    assert.notDeepEqual(poses[0], poses[1], id);
    assert.notDeepEqual(poses[1], poses[2], id);
  }
  const collateral = grouped.get('cp_collateral_hold');
  assert.ok(collateral.resists.every((row) => row.telegraphTicks >= 30));
  assert.ok(collateral.resists.concat(collateral.counter).every((row) => row.opponentWeapons >= 1));
  assert.ok(matrix.length >= 80);
  assert.ok(matrix.every((row) => row.sg02Ready === true && row.unexpectedFire === 0));
  for (const seed of HELD_OUT_SEEDS) {
    const traces = demos
      .filter((row) => row.tape === 'resists' && row.seed === seed)
      .map((row) => row.phaseTrace);
    assert.equal(new Set(traces).size, 10, `phase traces collided on seed ${seed}: ${traces.join(' | ')}`);
  }
});

test('a doctrine change moves the tape and an edit to tacticalAI.js does not', async () => {
  const feint = await runCounterplayScenario({
    doctrineId: 'cp_feint_break_courier', seed: 17, tape: 'resists', ticks: 80,
  });
  const corridor = await runCounterplayScenario({
    doctrineId: 'cp_corridor_pack_leader', seed: 17, tape: 'resists', ticks: 80,
  });
  assert.equal(feint.tacticalAI, false);
  assert.equal(feint.systems.includes('tacticalAI'), false);
  assert.notDeepEqual(feint.end, corridor.end);
  assert.notEqual(feint.goalProgress, corridor.goalProgress);

  const dir = mkdtempSync(path.join(tmpdir(), 'sf-arena-tape-'));
  const stubPath = path.join(dir, 'tacticalAI-stub.mjs');
  const markerPath = path.join(dir, 'constructed.txt');
  const registerPath = path.join(dir, 'register.mjs');
  const hookPath = path.join(dir, 'hook.mjs');
  const runnerPath = path.join(dir, 'runner.mjs');
  writeFileSync(stubPath, `
import { appendFileSync } from 'node:fs';
const marker = process.env.SF_TACTICAL_MARKER;
export const PRODUCTION_ENEMY_MIND_CONFIG = { stub: true };
export function createTacticalAISystem() {
  appendFileSync(marker, 'constructed\\n');
  return {
    name: 'tacticalAI',
    init() { appendFileSync(marker, 'init\\n'); },
    update() { appendFileSync(marker, 'update\\n'); },
  };
}
`);
  writeFileSync(hookPath, `
import { pathToFileURL } from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  if (typeof specifier === 'string' && specifier.includes('/systems/tacticalAI.js')) {
    return { url: pathToFileURL(process.env.SF_TACTICAL_STUB).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`);
  writeFileSync(registerPath, `
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register(pathToFileURL(process.env.SF_TACTICAL_HOOK).href, import.meta.url);
`);
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const runnerUrl = pathToFileURL(path.join(repoRoot, 'tools/doctrine-arena/run.mjs')).href;
  writeFileSync(runnerPath, `
import { runCounterplayScenario } from ${JSON.stringify(runnerUrl)};
const receipt = await runCounterplayScenario({
  doctrineId: 'cp_feint_break_courier', seed: 17, tape: 'resists', ticks: 80,
});
process.stdout.write(JSON.stringify({
  end: receipt.end,
  goalProgress: receipt.goalProgress,
  tacticalAI: receipt.tacticalAI,
}));
`);
  const child = spawnSync(process.execPath, ['--import', registerPath, runnerPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      SF_TACTICAL_STUB: stubPath,
      SF_TACTICAL_MARKER: markerPath,
      SF_TACTICAL_HOOK: hookPath,
    },
  });
  assert.equal(child.status, 0, child.stderr);
  const edited = JSON.parse(child.stdout);
  assert.equal(edited.tacticalAI, false);
  assert.deepEqual(edited.end, feint.end);
  assert.equal(edited.goalProgress, feint.goalProgress);
  let marker = '';
  try { marker = readFileSync(markerPath, 'utf8'); } catch { marker = ''; }
  assert.equal(marker.includes('constructed'), false);
  assert.equal(marker.includes('update'), false);
});

test('the same seed repeats and a memory reload does not move the receipt', async () => {
  const first = await runCounterplayScenario({
    scene: demonstrationScene('cp_prize_runner', HELD_OUT_SEEDS[1], 'resists'),
  });
  const second = await runCounterplayScenario({
    scene: demonstrationScene('cp_prize_runner', HELD_OUT_SEEDS[1], 'resists'),
  });
  assert.equal(first.hash, second.hash);
  const reloaded = await runCounterplayScenario({
    scene: demonstrationScene('cp_prize_runner', HELD_OUT_SEEDS[1], 'resists'),
    reloadAtTick: 80,
  });
  assert.equal(reloaded.hash, first.hash);
});
