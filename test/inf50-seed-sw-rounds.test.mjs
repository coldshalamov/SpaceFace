// Circuit rounds that are not another quota: nodes, hold, collect, commander, reach,
// and an elite or challenge room that only raises the stake's pressure and purse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { circuitPanelLines } from '../src/ui/screens/crucibleDraft.js';
import { OBJECTIVE_WORDS } from '../src/ui/survivalHud.js';
import { SWARM_STAKES } from '../src/data/swarmStakes.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import {
  CIRCUIT_COMMANDER_NAME, CIRCUIT_VIEW_AHEAD, circuitChoicesFor, circuitFor, circuitRoundFor,
} from '../src/systems/survivalCircuit.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';

const SEED = 4242;
const ARENA = 'helios_core';

function runAt(wave, fight = null) {
  const route = [{ stage: 1, arenaId: ARENA, nodeId: ARENA }];
  if (wave > 4) route.push({ stage: 2, arenaId: 'lagrange_crucible', nodeId: 'lagrange_crucible', ...(fight ? { fight } : {}) });
  if (wave > 8) route.push({ stage: 3, arenaId: 'cryo_drift', nodeId: 'cryo_drift' });
  if (wave > 12) route.push({ stage: 4, arenaId: 'asteroid_mill', nodeId: 'asteroid_mill' });
  return {
    ruleset: 'swarm', phase: 'active', wave, arenaId: ARENA,
    telemetry: {
      circuit: {
        version: 1, startArenaId: ARENA, route,
        clearedStages: route.length - 1, revision: 2, status: 'running', wonAtWave: null,
      },
    },
  };
}

test('seed 4242: later cohort slots name a different contract, and stage one does not', () => {
  const expectKind = { 1: 'cohort', 2: 'survive', 3: 'cohort', 4: 'boss', 5: 'nodes', 6: 'survive', 7: 'hold', 8: 'boss', 9: 'collect', 10: 'survive', 11: 'commander', 12: 'boss', 13: 'reach', 14: 'survive', 15: 'cohort', 16: 'boss' };
  for (const [wave, kind] of Object.entries(expectKind)) {
    const round = circuitRoundFor(runAt(Number(wave)), Number(wave));
    assert.equal(round.kind, kind, `wave ${wave}`);
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: Number(wave), mode: 'swarm', circuitRound: round });
    assert.equal(plan.swarm.circuit.kind, kind);
    if (kind !== 'boss' && kind !== 'survive' && kind !== 'cohort') {
      assert.equal(plan.swarm.killTarget, 0, `${kind} does not end on a kill quota`);
      assert.equal(plan.swarm.boss, false, `${kind} is not a second champion`);
      const line = waveOpeningLine(Number(wave), plan);
      assert.match(line, /Destroy the hive nodes|Hold the zone|Collect the cores|Assassinate|Reach the gate/);
    }
    if (kind === 'hold' || kind === 'reach') {
      const spot = kind === 'hold' ? round.zone : round.gate;
      const arena = COMBAT_LAB_ARENAS.find((row) => row.id === ARENA);
      const dist = Math.hypot(spot.x - arena.spawnPos.x, spot.z - arena.spawnPos.z);
      assert.ok(dist > spot.radius, `${kind} does not start under the ship`);
      assert.ok(dist + spot.radius <= CIRCUIT_VIEW_AHEAD, `${kind} stays inside the swarm picture`);
    }
  }
  const commander = circuitRoundFor(runAt(11), 11);
  assert.equal(commander.commanderName, CIRCUIT_COMMANDER_NAME);
  const panel = circuitPanelLines(runAt(10));
  assert.match(panel.next, new RegExp(`assassinate ${CIRCUIT_COMMANDER_NAME}`));
  assert.equal(OBJECTIVE_WORDS.collect, 'CORES');
  assert.equal(OBJECTIVE_WORDS.nodes, 'NODES');
});

test('seed 4242: elite and challenge raise pressure and purse, and the ordinary room remains', () => {
  const before = SWARM_STAKES.map((row) => ({ ...row }));
  const routeRun = {
    ruleset: 'swarm', phase: 'draft', wave: 4, arenaId: ARENA,
    telemetry: {
      circuit: {
        version: 1, startArenaId: ARENA,
        route: [{ stage: 1, arenaId: ARENA, nodeId: ARENA }],
        clearedStages: 1, revision: 4, status: 'route', wonAtWave: null,
      },
    },
  };
  const choices = circuitChoicesFor(routeRun);
  const plain = choices.filter((choice) => !choice.fight);
  assert.equal(plain.length, 2);
  assert.equal(choices.filter((choice) => choice.fight === 'elite').length, 2);
  assert.equal(choices.filter((choice) => choice.fight === 'challenge').length, 2);
  const base = planWave({ seed: SEED, arenaId: 'lagrange_crucible', wave: 5, mode: 'swarm', circuitRound: circuitRoundFor(runAt(5), 5) });
  const eliteRun = runAt(5, 'elite');
  assert.equal(circuitFor(eliteRun).route[1].fight, 'elite');
  const elite = planWave({ seed: SEED, arenaId: 'lagrange_crucible', wave: 5, mode: 'swarm', circuitRound: circuitRoundFor(eliteRun, 5) });
  assert.ok(elite.swarm.concurrent > base.swarm.concurrent);
  assert.ok(elite.rewards.credits > base.rewards.credits);
  assert.deepEqual(elite.swarm.threats, base.swarm.threats);
  const ordinaryPay = survivalRewards._creditScale(runAt(5));
  const elitePay = survivalRewards._creditScale(eliteRun);
  const challengePay = survivalRewards._creditScale(runAt(5, 'challenge'));
  assert.equal(elitePay, ordinaryPay * 1.35, 'an elite stage pays the bigger purse on the chips');
  assert.equal(challengePay, ordinaryPay * 1.6, 'a challenge stage pays the bigger purse on the chips');
  assert.equal(survivalRewards._creditScale(runAt(1)), ordinaryPay, 'an ordinary round does not raise the purse');
  assert.deepEqual(SWARM_STAKES.map((row) => ({ ...row })), before);
});
